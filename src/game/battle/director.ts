/**
 * The cutscene's camera operator (the user: "ground-level/follow shots of the
 * party reacting … cutting between wall, house and raiders"). Pure: it sees where
 * everyone is and what just happened and picks a shot. The frame loop eases to it.
 *
 * Scale: 1 unit = 6 m, a person is 0.28 tall, so a shoulder-height shot is ~0.24
 * and the tower is 0.9. Cuts are hard; inside a shot the camera drifts slowly.
 */
import type { BattleEvent } from '../../sim/battleTypes';
import { mulberry32 } from '../../sim/rng';

export interface Actor { id: string; side: 'home' | 'raider'; post?: string; x: number; y: number; z: number; dead: boolean; gone: boolean }
export interface V3 { x: number; y: number; z: number }
export type ShotKind = 'establish' | 'wide' | 'wall' | 'house' | 'raiders' | 'close';
export interface Shot { kind: ShotKind; subject?: string; eye: V3; look: V3; fov: number; since: number; hold: number; drift: V3 }

const MIN_HOLD = 3.2;
const ORDER: ShotKind[] = ['wall', 'raiders', 'house', 'wide', 'wall', 'raiders'];
const EYE_MIN = 0.1;

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len2 = (a: { x: number; z: number }) => Math.hypot(a.x, a.z) || 1;
const centroid = (xs: Actor[]): V3 => xs.length ? { x: xs.reduce((a, u) => a + u.x, 0) / xs.length, y: xs.reduce((a, u) => a + u.y, 0) / xs.length, z: xs.reduce((a, u) => a + u.z, 0) / xs.length } : { x: 0, y: 0, z: 0 };

export class Director {
  shot: Shot | null = null;
  private readonly _r: () => number;
  private _cycle = 0;
  private _last = new Map<string, number>();

  constructor(seed: number) { this._r = mulberry32(seed * 3119 + 11); }

  /** The establishing shot for the lead-in, the gaps and the tails: low, from the yard, toward the road. */
  establish(time: number, house: V3, roadDir: { x: number; z: number }, ground: (x: number, z: number) => number): Shot {
    const px = -roadDir.z, pz = roadDir.x;
    const ex = house.x + roadDir.x * 4.2 + px * 1.6, ez = house.z + roadDir.z * 4.2 + pz * 1.6;
    const s: Shot = {
      kind: 'establish', since: time, hold: 99, fov: 54,
      eye: { x: ex, y: ground(ex, ez) + 0.34, z: ez },
      look: { x: house.x + roadDir.x * 16, y: ground(house.x + roadDir.x * 16, house.z + roadDir.z * 16) + 0.22, z: house.z + roadDir.z * 16 },
      drift: { x: -px * 0.025, y: 0, z: -pz * 0.025 },
    };
    this.shot = s;
    return s;
  }

  /** Pick the shot for `time`. `fresh` are the events applied since the last call. */
  update(time: number, actors: Actor[], fresh: BattleEvent[], house: V3, ground: (x: number, z: number) => number): Shot {
    const live = actors.filter(a => !a.dead && !a.gone);
    const home = live.filter(a => a.side === 'home'), raiders = live.filter(a => a.side === 'raider');
    const hc = home.length ? centroid(home) : house, rc = raiders.length ? centroid(raiders) : { x: house.x, y: 0, z: house.z + 20 };
    const road = (() => { const d = sub(rc, house); const l = len2(d); return { x: d.x / l, z: d.z / l }; })();
    const byId = new Map(actors.map(a => [a.id, a]));
    // something happened that the camera should see
    let want: { kind: ShotKind; subject?: string; hold: number } | null = null;
    for (const e of fresh) {
      if ((e.kind === 'wound' && !e.stopped) || e.kind === 'death' || e.kind === 'aid') { const u = byId.get(e.unit); if (u && (u.side === 'home' || this._r() < 0.5)) want = { kind: 'close', subject: e.unit, hold: 3.6 }; }
      else if (e.kind === 'breach' || e.kind === 'explosion' || e.kind === 'mine') want = { kind: 'wide', hold: 4.2 };
      else if (e.kind === 'alarm' && !this.shot) want = { kind: 'house', hold: 5 };
      else if (e.kind === 'say' && e.who && !want) {
        const u = byId.get(e.who); const lastSaid = this._last.get(e.who) ?? -99;
        if (u && !u.dead && !u.gone && time - lastSaid > 9 && (this.shot?.subject !== e.who)) { want = { kind: 'close', subject: e.who, hold: 3.4 }; this._last.set(e.who, time); }
      }
    }
    const cur = this.shot;
    const held = cur ? time - cur.since : 99;
    const due = !cur || held >= cur.hold || (cur.kind === 'close' && cur.subject !== undefined && (byId.get(cur.subject)?.gone || false));
    if (want && (!cur || held >= MIN_HOLD || want.kind === 'wide')) return this._cut(time, want.kind, want.subject, want.hold, home, raiders, hc, rc, road, house, ground);
    if (due) {
      // next in the rotation that has something to show
      for (let k = 0; k < ORDER.length; k++) {
        const kind = ORDER[(this._cycle + k) % ORDER.length];
        if (kind === cur?.kind) continue;
        if ((kind === 'wall' && !home.length) || (kind === 'raiders' && !raiders.length)) continue;
        this._cycle = (this._cycle + k + 1) % ORDER.length;
        return this._cut(time, kind, undefined, 5 + this._r() * 4, home, raiders, hc, rc, road, house, ground);
      }
    }
    return cur ?? this._cut(time, 'wide', undefined, 6, home, raiders, hc, rc, road, house, ground);
  }

  private _cut(time: number, kind: ShotKind, subject: string | undefined, hold: number, home: Actor[], raiders: Actor[], hc: V3, rc: V3, road: { x: number; z: number }, house: V3, ground: (x: number, z: number) => number): Shot {
    const px = -road.z, pz = road.x, r = this._r;
    const at = (x: number, z: number, h: number): V3 => ({ x, y: ground(x, z) + h, z });
    let eye: V3, look: V3, fov = 52;
    if (kind === 'close' && subject) {
      const u = [...home, ...raiders].find(a => a.id === subject);
      if (u) {
        const side = u.side === 'home' ? 1 : -1;
        eye = at(u.x - road.x * 0.4 * side + px * 0.42, u.z - road.z * 0.4 * side + pz * 0.42, u.y + 0.2);
        look = { x: u.x, y: u.y + ground(u.x, u.z) + 0.17, z: u.z };
        fov = 38;
        return this._set({ kind, subject, eye, look, fov, since: time, hold, drift: { x: road.x * 0.02, y: 0, z: road.z * 0.02 } });
      }
      kind = 'wall';
    }
    if (kind === 'wall' && home.length) {
      const posted = home.filter(h => h.post && h.post !== 'open');
      const pool = posted.length ? posted : home;
      const u = pool[Math.floor(r() * pool.length)];
      const near = raiders.length ? raiders.reduce((a, b) => (Math.hypot(b.x - u.x, b.z - u.z) < Math.hypot(a.x - u.x, a.z - u.z) ? b : a)) : null;
      const dx = near ? near.x - u.x : road.x, dz = near ? near.z - u.z : road.z, l = len2({ x: dx, z: dz });
      const hh = u.post === 'tower' ? 0.2 : 0.17;
      eye = at(u.x - dx / l * 0.6 + px * 0.2, u.z - dz / l * 0.6 + pz * 0.2, u.y + 0.27 + (u.post === 'tower' ? 0.1 : 0));
      look = { x: (near ? near.x : u.x + road.x * 14), y: (near ? near.y : 0) + ground(near ? near.x : u.x + road.x * 14, near ? near.z : u.z + road.z * 14) + hh, z: near ? near.z : u.z + road.z * 14 };
      return this._set({ kind: 'wall', subject: u.id, eye, look, fov: 50, since: time, hold, drift: { x: px * 0.03, y: 0, z: pz * 0.03 } });
    }
    if (kind === 'raiders' && raiders.length) {
      // from the side of the approach, low: the crew coming on with the compound beyond
      const front = raiders.reduce((a, b) => (Math.hypot(b.x - house.x, b.z - house.z) < Math.hypot(a.x - house.x, a.z - house.z) ? b : a));
      eye = at(front.x + road.x * 1.6 + px * 1.5, front.z + road.z * 1.6 + pz * 1.5, 0.5);
      look = at(front.x - road.x * 1.2, front.z - road.z * 1.2, 0.12);
      return this._set({ kind, subject: front.id, eye, look, fov: 56, since: time, hold, drift: { x: -px * 0.03, y: 0, z: -pz * 0.03 } });
    }
    if (kind === 'house') {
      // the yard in front of the door: who falls back, who runs the kids inside
      eye = at(house.x + road.x * 2.1 + px * 0.9, house.z + road.z * 2.1 + pz * 0.9, 0.3);
      look = at(house.x, house.z, 0.28);
      return this._set({ kind, eye, look, fov: 58, since: time, hold, drift: { x: -road.x * 0.025, y: 0, z: -road.z * 0.025 } });
    }
    // wide: up behind the house, the whole fight in frame
    const mid = { x: (hc.x + rc.x) / 2, z: (hc.z + rc.z) / 2 };
    const span = Math.hypot(rc.x - hc.x, rc.z - hc.z);
    const back = 2.4 + Math.min(10, span * 0.25);
    eye = at(hc.x - road.x * back + px * 1.5, hc.z - road.z * back + pz * 1.5, 1.5 + Math.min(4, span * 0.1));
    look = at(mid.x, mid.z, 0.1);
    return this._set({ kind: 'wide', eye, look, fov: 52, since: time, hold, drift: { x: px * 0.04, y: 0, z: pz * 0.04 } });
  }

  private _set(s: Shot): Shot {
    s.eye.y = Math.max(s.eye.y, EYE_MIN);
    this.shot = s;
    return s;
  }
}

/** The eye and look of a shot `t` seconds in (it drifts slowly). */
export function poseAt(s: Shot, time: number): { eye: V3; look: V3; fov: number } {
  const t = Math.min(time - s.since, 12);
  return {
    eye: { x: s.eye.x + s.drift.x * t, y: s.eye.y, z: s.eye.z + s.drift.z * t },
    look: { x: s.look.x + s.drift.x * t * 0.5, y: s.look.y, z: s.look.z + s.drift.z * t * 0.5 },
    fov: s.fov,
  };
}
