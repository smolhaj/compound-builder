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
import type { Box } from './cameraObstacles';

export type { Box } from './cameraObstacles';
export interface Actor { id: string; side: 'home' | 'raider'; post?: string; x: number; y: number; z: number; dead: boolean; gone: boolean }
export interface V3 { x: number; y: number; z: number }
export type ShotKind = 'establish' | 'wide' | 'wall' | 'house' | 'raiders' | 'close';
export interface Shot { kind: ShotKind; subject?: string; eye: V3; look: V3; fov: number; since: number; hold: number; drift: V3; /** Who the shot is about (ids), and how many of them must be in frame. */ subjects?: string[]; need?: number; /** The unit the operator pans after (the look eases to it as it moves). */ track?: string }

const MIN_HOLD = 3.2;
const ORDER: ShotKind[] = ['wall', 'raiders', 'house', 'wide', 'wall', 'raiders'];
const LEAD_ORDER: ShotKind[] = ['raiders'];
const EYE_MIN = 0.12;
const POSE_SPAN = 12;

/** The least distance (world units, 1 = 6 m) from the camera to what a shot is about, by shot type. */
export const STANDOFF: Record<ShotKind, number> = { establish: 3, wide: 3, wall: 0.9, house: 2, raiders: 1.6, close: 0.8 };
/** The farthest a subject may be before it is a speck. */
export const REACH = 30;
/** The camera stays this far from every wall and roof (the near plane is 0.02, so nothing clips). */
export const CLEAR = 0.3;
/** How far along the view axis nothing solid may sit (a frame filled with shingles). */
export const VIEW_CLEAR = 1.0;
const CHEST = 0.17;
/** The picture area left by the letterbox, as a fraction of the frame's half-extent (vertical, horizontal tangent scale). */
const FRAME = { aspect: 1.78, v: 0.66, h: 0.8 };

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len2 = (a: { x: number; z: number }) => Math.hypot(a.x, a.z) || 1;
const centroid = (xs: Actor[]): V3 => xs.length ? { x: xs.reduce((a, u) => a + u.x, 0) / xs.length, y: xs.reduce((a, u) => a + u.y, 0) / xs.length, z: xs.reduce((a, u) => a + u.z, 0) / xs.length } : { x: 0, y: 0, z: 0 };
type Ground = (x: number, z: number) => number;

/** Distance from a point to a box on the ground plane (0 inside). */
const flatDist = (x: number, z: number, b: Box): number => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));

/** The point where an actor's chest is. */
export const chestOf = (a: Actor, ground: Ground): V3 => ({ x: a.x, y: ground(a.x, a.z) + a.y + CHEST, z: a.z });

/** Is a point (world y) within `m` of a box (the box stands `h` tall from the ground under the point)? */
export function nearBox(p: V3, b: Box, ground: Ground, m: number): boolean {
  if (flatDist(p.x, p.z, b) >= m) return false;
  return p.y - ground(p.x, p.z) < b.h + m;
}

/** Is a view point (x, z at height y) inside a box, with `m` of margin on the plan? */
const insideBox = (p: V3, b: Box, ground: Ground, m = 0): boolean => flatDist(p.x, p.z, b) <= m && p.y - ground(p.x, p.z) < b.h;

/** Is `p` inside the picture of a camera at `eye` looking at `look`? Returns the depth too. */
export function inFrame(eye: V3, look: V3, fov: number, p: V3): boolean {
  const f = norm3(sub(look, eye));
  const r = norm3({ x: f.z, y: 0, z: -f.x });          // right = f x up, flattened
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  const v = sub(p, eye);
  const z = v.x * f.x + v.y * f.y + v.z * f.z;
  if (z < 0.25) return false;
  const th = Math.tan(fov * Math.PI / 360);
  const x = (v.x * r.x + v.y * r.y + v.z * r.z), y = (v.x * u.x + v.y * u.y + v.z * u.z);
  return Math.abs(x) / z <= th * FRAME.aspect * FRAME.h && Math.abs(y) / z <= th * FRAME.v;
}
function norm3(a: V3): V3 { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; }

/** Does something solid stand between the eye and the point? Boxes the point stands in or on (a tower, a wall walk) are skipped. */
export function blockedBetween(eye: V3, p: V3, boxes: readonly Box[], ground: Ground): boolean {
  // (a subject standing on top of a box, on a tower or a wall walk, is not hidden by it; one in its footprint or beside a wall is)
  const up = p.y - ground(p.x, p.z);
  const own = boxes.filter(b => flatDist(p.x, p.z, b) <= 0.02 && up >= b.h - 0.4);
  const len = Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) || 1;
  const N = 28;
  for (let i = 1; i < N; i++) {
    const t = i / N;
    // the last stretch beside the subject is not tested: a figure at a wall is seen against it, not through it
    if ((1 - t) * len < 0.35) break;
    const q = { x: eye.x + (p.x - eye.x) * t, y: eye.y + (p.y - eye.y) * t, z: eye.z + (p.z - eye.z) * t };
    // a hand's breadth and a half of margin: eaves, foundation courses, posts and rails stand proud of the box
    for (const b of boxes) if (!own.includes(b) && insideBox(q, b, ground, 0.2)) return true;
  }
  return false;
}

export interface ShotCtx { boxes: readonly Box[]; ground: Ground; /** Everyone alive, by id. */ actors: ReadonlyMap<string, Actor> }

/** The pose of a shot `t` seconds in. */
const poseOf = (s: Shot, t: number): { eye: V3; look: V3 } => {
  const k = Math.min(t, POSE_SPAN);
  return { eye: { x: s.eye.x + s.drift.x * k, y: s.eye.y, z: s.eye.z + s.drift.z * k }, look: { x: s.look.x + s.drift.x * k * 0.5, y: s.look.y, z: s.look.z + s.drift.z * k * 0.5 } };
};

/**
 * Everything wrong with a shot, or an empty list: the camera inside or hugging a building or wall (at the cut, mid-hold and
 * at the end of the drift), a solid within a metre dead ahead, the subjects too close or too far, out of the picture,
 * or behind a roof. Pure; the director only cuts to a shot that passes, and the tests run it over thousands.
 */
export function shotProblems(s: Shot, ctx: ShotCtx): string[] {
  const out: string[] = [];
  const hold = Math.min(s.hold, POSE_SPAN);
  for (const t of [0, hold / 2, hold]) {
    const { eye, look } = poseOf(s, t);
    if (![eye.x, eye.y, eye.z, look.x, look.y, look.z].every(Number.isFinite)) { out.push('not finite'); break; }
    if (eye.y - ctx.ground(eye.x, eye.z) < EYE_MIN - 1e-6) out.push(`eye on the ground at t=${t.toFixed(1)}`);
    for (const b of ctx.boxes) if (nearBox(eye, b, ctx.ground, CLEAR)) { out.push(`eye ${insideBox(eye, b, ctx.ground) ? 'inside' : 'against'} a ${b.kind} at t=${t.toFixed(1)}`); break; }
    // dead ahead: nothing solid within VIEW_CLEAR (or before the look target, whichever is nearer)
    const f = norm3(sub(look, eye)), dist = Math.hypot(look.x - eye.x, look.y - eye.y, look.z - eye.z);
    for (const d of [0.1, 0.25, 0.5, 0.75, 1]) {
      const dd = d * Math.min(VIEW_CLEAR, dist * 0.9);
      const q = { x: eye.x + f.x * dd, y: eye.y + f.y * dd, z: eye.z + f.z * dd };
      if (ctx.boxes.some(b => insideBox(q, b, ctx.ground, 0.08))) { out.push(`a solid fills the view at t=${t.toFixed(1)}`); break; }
    }
  }
  const subs = (s.subjects ?? []).map(id => ctx.actors.get(id)).filter((a): a is Actor => !!a && !a.dead && !a.gone);
  if ((s.subjects?.length ?? 0) > 0 && !subs.length) out.push('no subject left alive in the shot');
  if (subs.length) {
    const { eye, look } = poseOf(s, 0);
    let seen = 0;
    for (const a of subs) {
      const c = chestOf(a, ctx.ground), d = Math.hypot(a.x - eye.x, a.z - eye.z);
      if (d < STANDOFF[s.kind] - 1e-6) out.push(`${s.kind} too close to ${a.id} (${d.toFixed(2)})`);
      if (d > REACH) continue;
      if (inFrame(eye, look, s.fov, c) && !blockedBetween(eye, c, ctx.boxes, ctx.ground)) seen++;
    }
    const need = Math.max(1, Math.ceil((s.need ?? 1) * subs.length - 0.5));
    if (seen < need) out.push(`only ${seen} of ${subs.length} subjects in frame (need ${need})`);
  }
  return out;
}

export interface PoseAudit {
  /** The kind of solid the eye is inside (never expected), or null. */
  inside: string | null;
  /** Plan distance from the eye to the nearest wall or roof it is low enough to meet. */
  nearest: number;
  /** Eye height above the ground. */
  aboveGround: number;
  /** How far ahead along the view axis the first solid stands (99 = clear to 8 units). */
  ahead: number;
  /** Live actors, those inside the picture, and those inside it with nothing solid in the way. */
  live: number; inPicture: number; visible: number;
}

/** A measurement of a camera pose against the world, independent of how the shot was chosen (the tests and the screenshot harness use it). */
export function auditPose(eye: V3, look: V3, fov: number, boxes: readonly Box[], actors: readonly Actor[], ground: Ground): PoseAudit {
  let inside: string | null = null, nearest = 99;
  for (const b of boxes) {
    if (eye.y - ground(eye.x, eye.z) < b.h) nearest = Math.min(nearest, flatDist(eye.x, eye.z, b));
    if (insideBox(eye, b, ground)) inside = b.kind;
  }
  const f = norm3(sub(look, eye));
  let ahead = 99;
  for (let d = 0.05; d <= 8; d += 0.05) {
    const q = { x: eye.x + f.x * d, y: eye.y + f.y * d, z: eye.z + f.z * d };
    if (q.y - ground(q.x, q.z) < 0 || boxes.some(b => insideBox(q, b, ground))) { ahead = d; break; }
  }
  const live = actors.filter(a => !a.dead && !a.gone);
  let inPicture = 0, visible = 0;
  for (const a of live) {
    const c = chestOf(a, ground);
    if (!inFrame(eye, look, fov, c)) continue;
    inPicture++;
    if (!blockedBetween(eye, c, boxes, ground)) visible++;
  }
  return { inside, nearest: Math.round(nearest * 100) / 100, aboveGround: Math.round((eye.y - ground(eye.x, eye.z)) * 100) / 100, ahead: Math.round(ahead * 100) / 100, live: live.length, inPicture, visible };
}

export class Director {
  shot: Shot | null = null;
  private readonly _r: () => number;
  private _cycle = 0;
  private _last = new Map<string, number>();
  private _boxes: readonly Box[] = [];
  private _lastCheck = -99;
  private _t = 0;
  private _g: Ground = () => 0;
  /** The lead-in (the approach, time-lapsed): the camera shows the raiders coming, whatever the caption says is out there. */
  leadIn = false;
  /** Shots that could not be made clean (should stay 0; the tests and the harness read it). */
  fallbacks = 0;
  /** What the last few fallbacks looked like (QA). */
  fallbackLog: string[] = [];

  constructor(seed: number) { this._r = mulberry32(seed * 3119 + 11); }

  /** The buildings and walls the camera must keep out of. */
  setObstacles(boxes: readonly Box[]): void { this._boxes = boxes; }

  /**
   * The establishing shot for the lead-in, the gaps and the tails: from the yard, toward the road (or at `focus`), high enough
   * to read the ground, never against the house.
   */
  establish(time: number, house: V3, roadDir: { x: number; z: number }, ground: Ground, focus?: V3): Shot {
    const px = -roadDir.z, pz = roadDir.x;
    const target = focus ?? { x: house.x + roadDir.x * 12, y: 0, z: house.z + roadDir.z * 12 };
    const ctx: ShotCtx = { boxes: this._boxes, ground, actors: new Map() };
    const mk = (rot: number, k: number, hb: number): Shot => {
      const o = rotate({ x: roadDir.x * 4.2 + px * 1.6, z: roadDir.z * 4.2 + pz * 1.6 }, rot, k);
      const ex = house.x + o.x, ez = house.z + o.z;
      return { kind: 'establish', since: time, hold: 99, fov: 54, eye: { x: ex, y: ground(ex, ez) + 0.9 + hb, z: ez }, look: { x: target.x, y: ground(target.x, target.z) + 0.15, z: target.z }, drift: { x: -px * 0.025, y: 0, z: -pz * 0.025 } };
    };
    const s = this._search(mk, ctx) ?? mk(0, 1, 2);
    this.shot = s;
    return s;
  }

  /** Standing inside a building's walls (not on top of it, not on its porch). */
  private _indoors(a: Actor, _ground: Ground): boolean {
    return this._boxes.some(b => flatDist(a.x, a.z, b) <= 0.02 && a.y < b.h - 0.4 - 0.17 && b.h > 0.5);
  }

  /** Pick the shot for `time`. `fresh` are the events applied since the last call. */
  update(time: number, actors: Actor[], fresh: BattleEvent[], house: V3, ground: Ground): Shot {
    // someone inside a building cannot be shown: the camera picks from those out of doors
    const live = actors.filter(a => !a.dead && !a.gone && !this._indoors(a, ground));
    const home = live.filter(a => a.side === 'home'), raiders = live.filter(a => a.side === 'raider');
    const hc = home.length ? centroid(home) : house, rc = raiders.length ? centroid(raiders) : { x: house.x, y: 0, z: house.z + 20 };
    const road = (() => { const d = sub(rc, house); const l = len2(d); return { x: d.x / l, z: d.z / l }; })();
    const byId = new Map(actors.map(a => [a.id, a]));
    // something happened that the camera should see
    let want: { kind: ShotKind; subject?: string; hold: number } | null = null;
    for (const e of fresh) {
      if ((e.kind === 'wound' && !e.stopped) || e.kind === 'death' || e.kind === 'aid') { const u = byId.get(e.unit); if (u && (u.side === 'home' || this._r() < 0.5)) want = { kind: 'close', subject: e.unit, hold: 3.6 }; }
      else if (e.kind === 'breach' || e.kind === 'fallback' || e.kind === 'explosion' || e.kind === 'mine') want = { kind: 'wide', hold: 4.2 };
      else if (e.kind === 'alarm' && !this.shot) want = { kind: 'house', hold: 5 };
      else if (e.kind === 'say' && e.who && !want) {
        const u = byId.get(e.who); const lastSaid = this._last.get(e.who) ?? -99;
        if (u && !u.dead && !u.gone && time - lastSaid > 9 && (this.shot?.subject !== e.who)) { want = { kind: 'close', subject: e.who, hold: 3.4 }; this._last.set(e.who, time); }
      }
    }
    const cur = this.shot;
    // the operator pans after the unit the shot is about (the eye stays where it was cut)
    if (cur?.track) {
      const a = byId.get(cur.track);
      if (a && !a.dead && !a.gone) {
        const c = chestOf(a, ground), k = Math.min(1, Math.max(0, time - this._t) * 3);
        cur.look = { x: cur.look.x + (c.x - cur.look.x) * k, y: cur.look.y + (c.y - cur.look.y) * k, z: cur.look.z + (c.z - cur.look.z) * k };
      }
    }
    this._t = time;
    const held = cur ? time - cur.since : 99;
    let due = !cur || held >= cur.hold || (cur.kind === 'close' && cur.subject !== undefined && (byId.get(cur.subject)?.gone || false));
    // the subject walked behind a wall or out of the picture: cut early
    if (!due && cur && held >= 1.2 && time - this._lastCheck >= 0.5) {
      this._lastCheck = time;
      const ctx: ShotCtx = { boxes: this._boxes, ground, actors: new Map(live.map(a => [a.id, a])) };
      const now: Shot = { ...cur, since: 0, hold: 0, drift: { x: 0, y: 0, z: 0 }, ...poseAt(cur, time) };
      if (cur.subjects?.length && shotProblems(now, ctx).length) due = true;   // (a subject that fell or left counts: nobody left to show)
    }
    if (want && (!cur || held >= MIN_HOLD || want.kind === 'wide')) return this._cut(time, want.kind, want.subject, want.hold, home, raiders, hc, rc, road, house, ground);
    if (due) {
      // next in the rotation that has something to show
      const order = this.leadIn && raiders.length ? LEAD_ORDER : ORDER;
      for (let k = 0; k < order.length; k++) {
        const kind = order[(this._cycle + k) % order.length];
        if (kind === cur?.kind) continue;
        if ((kind === 'wall' && !home.length) || (kind === 'raiders' && !raiders.length) || (kind === 'house' && !home.length)) continue;
        this._cycle = (this._cycle + k + 1) % order.length;
        return this._cut(time, kind, undefined, 5 + this._r() * 4, home, raiders, hc, rc, road, house, ground);
      }
    }
    return cur ?? this._cut(time, 'wide', undefined, 6, home, raiders, hc, rc, road, house, ground);
  }

  /**
   * Try the shot as designed, then the same shot swung round its subject, then pulled back, then raised, and take the first that
   * passes. When nothing does, the least bad is used and `fallbacks` counts it.
   */
  private _search(mk: (rot: number, k: number, hb: number) => Shot, ctx: ShotCtx, strict = false): Shot | null {
    let best: Shot | null = null, bestN = Infinity;
    // first the whole group in frame, then (when the crowd cannot all be framed) at least the one the shot is about
    for (const relax of [false, true]) {
      for (const hb of [0, 0.3, 0.8, 1.6, 2.6]) for (const k of [1, 1.4, 2, 2.8]) for (const rot of SWING) {
        const s = mk(rot, k, hb);
        if (relax) { if ((s.subjects?.length ?? 0) < 2) continue; s.need = 0; }
        const n = shotProblems(s, ctx).length;
        if (n === 0) return s;
        if (n < bestN) { best = s; bestN = n; }
      }
    }
    if (strict) return null;
    this.fallbacks++;
    if (best) this.fallbackLog.push(`${best.kind}@${best.since.toFixed(1)}: ${shotProblems(best, ctx).join('; ')}`.slice(0, 300));
    return best;
  }

  private _cut(time: number, kind: ShotKind, subject: string | undefined, hold: number, home: Actor[], raiders: Actor[], hc: V3, rc: V3, road: { x: number; z: number }, house: V3, ground: Ground): Shot {
    const px = -road.z, pz = road.x, r = this._r;
    this._g = ground;
    const everyone = [...home, ...raiders];
    const ctx: ShotCtx = { boxes: this._boxes, ground, actors: new Map(everyone.map(a => [a.id, a])) };
    const at = (x: number, z: number, h: number): V3 => ({ x, y: ground(x, z) + h, z });
    const chest = (a: Actor): V3 => chestOf(a, ground);
    const base = { since: time, hold };
    if (kind === 'close' && subject) {
      const u = everyone.find(a => a.id === subject);
      if (u) {
        const side = u.side === 'home' ? 1 : -1;
        const dir = norm3({ x: -road.x * 0.4 * side + px * 0.42, y: 0, z: -road.z * 0.4 * side + pz * 0.42 });
        const c = chest(u);
        return this._set(this._search((rot, k, hb) => {
          const o = rotate({ x: dir.x * 0.95, z: dir.z * 0.95 }, rot, k);
          return { ...base, kind: 'close', subject, subjects: [subject], track: subject, need: 1, eye: at(u.x + o.x, u.z + o.z, u.y + 0.2 + hb), look: c, fov: 38, drift: { x: road.x * 0.02, y: 0, z: road.z * 0.02 } };
        }, ctx));
      }
      kind = 'wall';
    }
    if (kind === 'wall' && home.length) {
      const posted = home.filter(h => h.post && h.post !== 'open');
      const pool = posted.length ? posted : home;
      const first = Math.floor(r() * pool.length);
      // the defender the shot is about: the one drawn, or (when no angle shows that one) the next, and so on
      let shot: Shot | null = null;
      for (let i = 0; i < Math.min(pool.length, 5) && !shot; i++) {
        const u = pool[(first + i) % pool.length];
        shot = this._search(this._wallShot(u, raiders, road, base, at), ctx, true);
      }
      return this._set(shot ?? this._search(this._wallShot(pool[first], raiders, road, base, at), ctx));
    }
    if (kind === 'raiders' && raiders.length) {
      // from the side of the approach, low: the crew coming on with the compound beyond
      const front = raiders.reduce((a, b) => (Math.hypot(b.x - house.x, b.z - house.z) < Math.hypot(a.x - house.x, a.z - house.z) ? b : a));
      const crew = raiders.filter(a => Math.hypot(a.x - front.x, a.z - front.z) < 5).slice(0, 6);
      const look = at(front.x - road.x * 0.8, front.z - road.z * 0.8, front.y + CHEST);
      return this._set(this._search((rot, k, hb) => {
        const o = rotate({ x: road.x * 1.6 + px * 1.5, z: road.z * 1.6 + pz * 1.5 }, rot, k);
        return { ...base, kind: 'raiders', subject: front.id, track: front.id, subjects: crew.map(a => a.id), need: 0.6, eye: at(front.x + o.x, front.z + o.z, 0.5 + hb), look, fov: 56, drift: { x: -px * 0.03, y: 0, z: -pz * 0.03 } };
      }, ctx));
    }
    if (kind === 'house' && home.length) {
      // the yard in front of the door: who falls back, who runs the kids inside
      const lead = home.reduce((a, b) => (Math.hypot(b.x - house.x, b.z - house.z) < Math.hypot(a.x - house.x, a.z - house.z) ? b : a));
      const who = home.filter(a => Math.hypot(a.x - lead.x, a.z - lead.z) < 3).slice(0, 6);
      const c = centroid(who);
      const look = at(c.x, c.z, 0.2);
      return this._set(this._search((rot, k, hb) => {
        const o = rotate({ x: road.x * 2.6 + px * 0.9, z: road.z * 2.6 + pz * 0.9 }, rot, k);
        return { ...base, kind: 'house', subjects: who.map(a => a.id), need: 0.7, eye: at(c.x + o.x, c.z + o.z, 0.35 + hb), look, fov: 58, drift: { x: -road.x * 0.025, y: 0, z: -road.z * 0.025 } };
      }, ctx));
    }
    // wide: up behind the house, the whole fight in frame
    const mid = { x: (hc.x + rc.x) / 2, z: (hc.z + rc.z) / 2 };
    const span = Math.hypot(rc.x - hc.x, rc.z - hc.z);
    const back = 2.4 + Math.min(10, span * 0.25);
    const look = at(mid.x, mid.z, 0.1);
    const subjects = everyone.filter(a => Math.hypot(a.x - mid.x, a.z - mid.z) < span / 2 + 6).map(a => a.id);
    return this._set(this._search((rot, k, hb) => {
      const o = rotate({ x: -road.x * back + px * 1.5, z: -road.z * back + pz * 1.5 }, rot, k);
      return { ...base, kind: 'wide', subjects, need: 0.5, eye: at(hc.x + o.x, hc.z + o.z, 1.5 + Math.min(4, span * 0.1) + hb), look, fov: 52, drift: { x: px * 0.04, y: 0, z: pz * 0.04 } };
    }, ctx));
  }

  /** A wall shot over a defender's shoulder toward the nearest raider, as a candidate maker for `_search`. */
  private _wallShot(u: Actor, raiders: Actor[], road: { x: number; z: number }, base: { since: number; hold: number }, at: (x: number, z: number, h: number) => V3): (rot: number, k: number, hb: number) => Shot {
    const px = -road.z, pz = road.x;
    const near = raiders.length ? raiders.reduce((a, b) => (Math.hypot(b.x - u.x, b.z - u.z) < Math.hypot(a.x - u.x, a.z - u.z) ? b : a)) : null;
    const dx = near ? near.x - u.x : road.x, dz = near ? near.z - u.z : road.z, l = len2({ x: dx, z: dz });
    const tower = u.post === 'tower';
    // the defender in the shoulder of the frame, the threat beyond: a metre behind and a little to the side
    const look = near ? { x: near.x, y: this._g(near.x, near.z) + near.y + (tower ? 0.2 : 0.17), z: near.z } : at(u.x + road.x * 14, u.z + road.z * 14, tower ? 0.2 : 0.17);
    return (rot, k, hb) => {
      const o = rotate({ x: -dx / l * 1.0 + px * 0.25, z: -dz / l * 1.0 + pz * 0.25 }, rot, k);
      return { ...base, kind: 'wall', subject: u.id, subjects: [u.id], need: 1, eye: at(u.x + o.x, u.z + o.z, u.y + 0.27 + (tower ? 0.1 : 0) + hb), look, fov: 50, drift: { x: px * 0.03, y: 0, z: pz * 0.03 } };
    };
  }

  private _set(s: Shot | null): Shot {
    if (!s) throw new Error('no shot');
    this.shot = s;
    return s;
  }
}

/** Swings tried round the subject, nearest the designed angle first (radians). */
const SWING = [0, 0.45, -0.45, 0.95, -0.95, 1.6, -1.6, 2.3, -2.3, Math.PI];
const rotate = (o: { x: number; z: number }, a: number, k: number): { x: number; z: number } => ({ x: (o.x * Math.cos(a) - o.z * Math.sin(a)) * k, z: (o.x * Math.sin(a) + o.z * Math.cos(a)) * k });

/** The eye and look of a shot `t` seconds in (it drifts slowly). */
export function poseAt(s: Shot, time: number): { eye: V3; look: V3; fov: number } {
  const t = Math.min(time - s.since, POSE_SPAN);
  return {
    eye: { x: s.eye.x + s.drift.x * t, y: s.eye.y, z: s.eye.z + s.drift.z * t },
    look: { x: s.look.x + s.drift.x * t * 0.5, y: s.look.y, z: s.look.z + s.drift.z * t * 0.5 },
    fov: s.fov,
  };
}
