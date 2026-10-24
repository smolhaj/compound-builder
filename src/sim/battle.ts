/**
 * A fight at the compound, simulated second by second into a timeline the
 * world plays back (battleTypes.ts is the contract). Pure and seeded.
 *
 *  Detection  dogs, sensors, tripwires, cameras or the watch: how early the alarm goes.
 *  Lights     motion floodlights at night (with power) take away the dark.
 *  Posts      fighters (adults, teens 15+) take posts by value: tower > sandbags >
 *             wall > window > open; the rest go to the bunker / safe room / house.
 *  Defenders  shoot the most dangerous raider they can see (close, carrying an
 *             explosive, caught in the open); fall back when a post is under heavy
 *             fire or is wrecked; a medic drags the wounded inside.
 *  Raiders    advance in bounds from cover to cover (half suppress, half move),
 *             drift to the weaker flank, throw grenades inside ~30 m, fire rockets
 *             at the best post; mines go off as they cross the mined band; they
 *             break off at ~40% losses or when the leader goes down.
 *  Breach     at the line with the defense down or outnumbered (or a wall blown):
 *             they pour in, and anyone not in a shelter can be hurt or killed.
 *
 * Distances are world units (1 ≈ 6 m).
 */
import type { Battle, BattleEvent, BattleUnit } from './battleTypes';
import { GUN, skillOf, type Caliber } from './armory';
import { gearPosture, softenWound } from './gear';
import { isHome } from './blueprints';
import { isFinished } from './construction';
import { PERIMETER, runFinished } from './perimeter';
import { mulberry32 } from './rng';
import { hourOf, type GameState } from './state';

type Post = NonNullable<BattleUnit['post']>;
interface PostSpot { kind: Post; x: number; z: number; y: number; cover: number; value: number; cap: number; wrecked: boolean; fire: number }
interface Arm { range: number; rate: number; acc: number; auto: boolean; cal: Caliber | null }

/** Range (units), shots a second, accuracy factor, full auto. Types a branch may not have still work. */
const ARMS: Record<string, Omit<Arm, 'cal'>> = {
  rimfire: { range: 15, rate: 0.5, acc: 0.6, auto: false },
  bolt: { range: 60, rate: 0.25, acc: 1.3, auto: false },
  lever: { range: 30, rate: 0.35, acc: 1, auto: false },
  semi_rifle: { range: 50, rate: 0.5, acc: 1.1, auto: false },
  auto_rifle: { range: 45, rate: 0.45, acc: 1, auto: true },
  smg: { range: 15, rate: 0.5, acc: 0.8, auto: true },
  pump: { range: 7, rate: 0.3, acc: 1.4, auto: false },
  pistol: { range: 5, rate: 0.4, acc: 0.8, auto: false },
  revolver: { range: 5, rate: 0.3, acc: 0.8, auto: false },
};
const FISTS: Arm = { range: 0.6, rate: 0.5, acc: 0.8, auto: false, cal: null };
const MOVE = 0.6;          // ≈ 3.6 m/s running
const GRENADE_RANGE = 5;   // ≈ 30 m
const ROCKET_RANGE = 50;

export interface BattleOptions {
  /** Raiders armed with guns (false: clubs, the dead). Default true. */
  armed?: boolean;
  /** Override the explosives they carry (otherwise from how long since the collapse). */
  grenades?: number;
  rockets?: number;
}
/** A planned battle plus what applyBattle needs (still a Battle for the playback). */
export interface PlannedBattle extends Battle {
  spent: Partial<Record<Caliber, number>>;
  minesUsed: number;
  /** Explosives left on raiders who went down (recoverable after a repelled raid). */
  dropped: { grenades: number; rpg_rounds: number };
  result: 'repelled' | 'fled' | 'breached' | 'overrun';
}

interface Fighter {
  id: string; side: 'home' | 'raider'; pid?: string; x: number; z: number; y: number;
  hp: number; out: boolean; dead: boolean; arm: Arm; skill: number; readyAt: number;
  post: PostSpot | null; cover: number; moving: boolean; nextMove: number; shelter: boolean;
  grenades: number; rockets: number; leader?: boolean; medic?: boolean; fled?: boolean; rescued?: boolean;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Mines can be rigged only once the law is gone (they're never sold). */
export const canRigMines = (s: GameState) => s.disaster.tracks.law < 0.5;
/** Rig four mines from a hardware kit and a can of fuel. */
export function rigMines(s: GameState): string | null {
  if (!canRigMines(s)) return 'not while the law still works';
  if ((s.stock.hardware ?? 0) < 1 || (s.stock.fuel ?? 0) < 1) return 'needs a hardware kit and a can of fuel';
  s.stock.hardware -= 1; s.stock.fuel -= 1;
  s.stock.mines = (s.stock.mines ?? 0) + 4;
  return null;
}

export function planBattle(s: GameState, raiders: number, seed: number, opts: BattleOptions = {}): PlannedBattle {
  const r = mulberry32(seed * 2654435 + 977);
  const hr = hourOf(s.clock.t), night = hr < 6 || hr >= 20;
  const fin = s.structures.filter(isFinished);
  const home = fin.find(st => isHome(st.kind)) ?? fin[0] ?? { x: 0, z: 0 };
  const C = { x: home.x, z: home.z };
  // the road side: raiders come up from +z, give or take
  const ang = Math.PI / 2 + (r() - 0.5) * 0.8;
  const ax = Math.cos(ang), az = Math.sin(ang);       // unit vector from the house toward the raiders
  const lx = -az, lz = ax;                            // lateral
  const at = (d: number, lat: number) => ({ x: C.x + ax * d + lx * lat, z: C.z + az * d + lz * lat });
  const alive = s.people.map((p, i) => ({ p, i })).filter(({ i }) => s.personState[i]?.needs.died == null && s.personState[i]?.task !== 'gone');
  const fightersP = alive.filter(({ p }) => !p.kid || p.age >= 15);
  const g = gearPosture(s, fightersP.length);
  const n = (k: string) => Math.floor((s.stock as Record<string, number>)[k] ?? 0);
  const powered = s.utilities.lit.length > 0 || (s.utilities.grid && s.disaster.tracks.grid > 0.5);
  const lightsOn = night && powered && n('floodlights') > 0;
  const seeMul = night && !lightsOn ? 0.5 : 1;

  // ── posts ──
  const posts: PostSpot[] = [];
  for (const st of fin) if (st.kind.includes('tower')) posts.push({ kind: 'tower', x: st.x, z: st.z, y: 0.9, cover: 0.35, value: 4, cap: 1, wrecked: false, fire: 0 });
  for (let i = 0; i < Math.min(3, n('sandbags')); i++) { const p = at(3, (i - 1) * 2.5); posts.push({ kind: 'sandbags', ...p, y: 0, cover: 0.4, value: 3, cap: 1, wrecked: false, fire: 0 }); }
  let wallR = 0;
  for (const run of s.perimeter) {
    if (!runFinished(run) || PERIMETER[run.kind].blocks.people <= 0 || !run.pts.length) continue;
    const pts = run.pts.map(([x, z]) => ({ x, z })).sort((a, b) => ((b.x - C.x) * ax + (b.z - C.z) * az) - ((a.x - C.x) * ax + (a.z - C.z) * az));
    wallR = Math.max(wallR, Math.max(4, Math.min(30, dist(pts[0], C))));
  }
  if (wallR) for (let i = 0; i < 3; i++) { const p = at(wallR, (i - 1) * 4); posts.push({ kind: 'wall', ...p, y: 0, cover: 0.55, value: 2, cap: 1, wrecked: false, fire: 0 }); }
  const bars = n('window_bars') > 0 ? 0.5 : 0.6;
  for (const st of fin) if (!st.kind.startsWith('bunker_') && !st.kind.includes('tower') && dist(st, C) < 25) posts.push({ kind: 'building', x: st.x + ax * 0.5, z: st.z + az * 0.5, y: 0.3, cover: bars, value: 1, cap: isHome(st.kind) ? 2 : 1, wrecked: false, fire: 0 });
  posts.push({ kind: 'open', x: C.x + ax * 1.5, z: C.z + az * 1.5, y: 0, cover: 1, value: 0, cap: 99, wrecked: false, fire: 0 });
  posts.sort((a, b) => b.value - a.value);
  const lineR = wallR || 2;

  const shelterAt = fin.find(st => st.kind === 'bunker_hatch' || st.kind === 'bunker_stairs') ?? home;
  const hardShelter = shelterAt !== home || g.safeRoom;

  // ── units ──
  const units: BattleUnit[] = [];
  const ev: BattleEvent[] = [];
  const F: Fighter[] = [];
  const ammo: Partial<Record<Caliber, number>> = { ...s.armory.ammo };
  const spent: Partial<Record<Caliber, number>> = {};
  const free = s.armory.guns.filter(x => (ammo[GUN[x.model].cal] ?? 0) >= 1).sort((a, b) => (ARMS[GUN[b.model].type].acc * ARMS[GUN[b.model].type].range) - (ARMS[GUN[a.model].type].acc * ARMS[GUN[a.model].type].range));
  const medicId = fightersP.filter(({ p }) => p.skills.medic >= 3).sort((a, b) => b.p.skills.medic - a.p.skills.medic)[0]?.p.id;
  for (const { p } of alive) {
    const x = C.x + (r() - 0.5) * 2, z = C.z + (r() - 0.5) * 2;
    const fights = !p.kid || p.age >= 15;
    let arm = FISTS;
    if (fights) {
      const gun = free.find(x => x.carrier === p.id) ?? free.find(x => !x.carrier);
      if (gun) { free.splice(free.indexOf(gun), 1); const m = GUN[gun.model]; arm = { ...(ARMS[m.type] ?? ARMS.pistol), cal: m.cal }; if (gun.condition < 0.5) arm.acc *= 0.7; }
    }
    const f: Fighter = { id: `h_${p.id}`, side: 'home', pid: p.id, x, z, y: 0, hp: 100, out: false, dead: false, arm, skill: skillOf(s, p.id), readyAt: Infinity, post: null, cover: 0.8, moving: false, nextMove: 0, shelter: !fights, grenades: n('grenades') && fights ? 1 : 0, rockets: 0, medic: p.id === medicId };
    F.push(f); units.push({ id: f.id, side: 'home', personId: p.id, x: r2(x), z: r2(z), post: 'open' });
  }
  const daysAfter = s.disaster.kind ? Math.max(0, s.clock.t - s.disaster.hitAt) : 0;
  const late = Math.min(1, daysAfter / 365);
  const armedR = opts.armed !== false;
  let gLeft = opts.grenades ?? (armedR ? Math.round(raiders * late * 0.6 * r()) : 0);
  let rLeft = opts.rockets ?? (armedR && daysAfter > 120 && r() < late * 0.5 ? 1 : 0);
  for (let i = 0; i < raiders; i++) {
    const p = at(30 + r() * 4, (r() - 0.5) * 8);
    const autoR = armedR && late > 0.5 && r() < 0.3;
    const arm: Arm = !armedR ? FISTS : { ...(autoR ? ARMS.auto_rifle : r() < 0.7 ? ARMS.semi_rifle : ARMS.pump), cal: null };
    const gr = gLeft > 0 ? 1 : 0; gLeft -= gr;
    const rk = rLeft > 0 && i > 0 ? 1 : 0; rLeft -= rk;
    const f: Fighter = { id: `r${i}`, side: 'raider', ...p, y: 0, hp: 100, out: false, dead: false, arm, skill: 3 + Math.floor(r() * 4), readyAt: 0, post: null, cover: 1, moving: true, nextMove: 0, shelter: false, grenades: gr, rockets: rk, leader: i === 0 };
    F.push(f); units.push({ id: f.id, side: 'raider', x: r2(p.x), z: r2(p.z), post: 'open' });
  }
  const H = F.filter(f => f.side === 'home'), R = F.filter(f => f.side === 'raider');

  // ── detection, alarm, lights ──
  const detection = Math.min(100, 25 + g.detection + Math.max(0, ...fightersP.map(({ p }) => p.skills.hunter)) * 4);
  const detectAt = Math.max(lineR + 2, (6 + detection * 0.24) * (night && !lightsOn && !n('nvg') && !n('thermal') && !n('thermal_cam') ? 0.7 : 1));
  const what: 'dog' | 'sensor' | 'tripwire' | 'camera' | 'watch' = n('dog') ? 'dog' : n('driveway_alarm') ? 'sensor' : n('tripwire') ? 'tripwire' : powered && (n('cameras') || n('thermal_cam')) ? 'camera' : 'watch';
  let alarmed = false;
  const mines = Math.min(n('mines'), 12);
  let minesLeft = mines;
  const mineR = lineR + 4;

  const assignPost = (f: Fighter, t: number, exclude?: PostSpot) => {
    const used = (p: PostSpot) => H.filter(h => h.post === p && !h.out).length;
    const p = posts.find(p => p !== exclude && !p.wrecked && used(p) < p.cap) ?? posts[posts.length - 1];
    f.post = p;
    const tr = Math.max(1, dist(f, p) / MOVE);
    f.x = p.x; f.z = p.z; f.y = p.y; f.cover = p.cover; f.readyAt = t + tr;
    ev.push({ t: r2(t + 0.2), kind: 'move', unit: f.id, x: r2(p.x), z: r2(p.z), ...(p.y ? { y: p.y } : {}) });
  };
  const toShelter = (f: Fighter, t: number) => {
    f.shelter = true; f.x = shelterAt.x; f.z = shelterAt.z; f.y = 0; f.post = null;
    ev.push({ t: r2(t + 0.3), kind: 'move', unit: f.id, x: r2(shelterAt.x), z: r2(shelterAt.z) });
  };

  const hurt = (f: Fighter, sev: number, t: number) => {
    if (f.dead) return;
    f.hp -= sev;
    if (f.hp <= 0) { f.dead = true; f.out = true; ev.push({ t: r2(t + 0.05), kind: 'death', unit: f.id }); return; }
    ev.push({ t: r2(t + 0.05), kind: 'wound', unit: f.id, sev: Math.round(sev) });
    if (f.hp < (f.side === 'raider' ? 55 : 45)) f.out = true;
  };
  const explode = (x: number, z: number, t: number, radius: number, wreck?: PostSpot) => {
    const hits: string[] = [];
    for (const u of F) {
      if (u.dead || (u.side === 'home' && u.shelter && hardShelter)) continue;
      const d = Math.hypot(u.x - x, u.z - z);
      if (d > radius) continue;
      hits.push(u.id);
      hurt(u, (60 + r() * 50) * (1 - d / radius * 0.6) * (u.post === wreck ? 1 : Math.max(0.4, u.cover)), t);
    }
    let wrecks: 'post' | 'wall' | undefined;
    if (wreck && wreck.kind !== 'open') { wreck.wrecked = true; wrecks = wreck.kind === 'wall' ? 'wall' : 'post'; if (wreck.kind === 'wall') wallDown = true; }
    ev.push({ t: r2(t), kind: 'explosion', x: r2(x), z: r2(z), radius, hits, ...(wrecks ? { wrecks } : {}) });
  };
  let wallDown = false, breached = false, fled = false, end: PlannedBattle['result'] | null = null, endT = 0;
  let breachT = 0, lineSince = -1;

  const shoot = (a: Fighter, b: Fighter, t: number) => {
    const cal = a.arm.cal;
    const cost = a.arm.auto ? 3 : 1;
    if (cal) { if ((ammo[cal] ?? 0) < cost) return; ammo[cal]! -= cost; spent[cal] = (spent[cal] ?? 0) + cost; }
    const d = dist(a, b);
    const rangeF = Math.max(0.15, 1 - d / (a.arm.range * 1.2));
    const tgtCover = b.side === 'raider' ? (b.moving ? 1.3 : b.cover) : b.cover;
    let p = (0.06 + 0.025 * a.skill) * a.arm.acc * rangeF * tgtCover * seeMul * (a.side === 'home' && a.post?.kind === 'tower' ? 1.15 : 1);
    if (a.side === 'home' && a.moving) p *= 0.5;
    if (a.arm.auto) p *= 1.6;
    const hit = r() < Math.min(0.9, p);
    ev.push({ t: r2(t), kind: 'shot', from: a.id, to: b.id, hit, ...(a.arm.auto ? { auto: true } : {}) });
    if (b.post) b.post.fire++;
    if (hit) hurt(b, 25 + r() * 45, t);
  };

  for (let t = 0; t < 300 && !end; t++) {
    const hUp = H.filter(f => !f.out && !f.shelter), rUp = R.filter(f => !f.out && !f.fled);
    // alarm
    const nearest = Math.min(...rUp.map(f => dist(f, C)));
    if (!alarmed && (nearest <= detectAt || t > 0 && rUp.length === 0)) {
      alarmed = true;
      ev.push({ t, kind: 'alarm', what });
      if (lightsOn) ev.push({ t: t + 1, kind: 'lights' });
      ev.push({ t, kind: 'say', text: what === 'dog' ? 'The dog goes off — everyone up!' : 'Movement on the drive — to your posts!' });
      for (const f of H) if (f.shelter) toShelter(f, t); else assignPost(f, t);
    }
    for (const p of posts) p.fire *= 0.7;

    // home side: fire, fall back, medic
    if (alarmed) for (const f of hUp) {
      if (t < f.readyAt) continue;
      if (f.post && (f.post.wrecked || f.post.fire > 5) && f.post.kind !== 'open') { const old = f.post; old.fire = 0; assignPost(f, t, old); continue; }
      if (f.grenades > 0) {
        const tg = rUp.find(x => dist(x, f) <= GRENADE_RANGE);
        if (tg) { f.grenades--; ev.push({ t, kind: 'throw', from: f.id, x: r2(tg.x), z: r2(tg.z), what: 'grenade' }); explode(tg.x + (r() - 0.5), tg.z + (r() - 0.5), t + 2, 1.5); continue; }
      }
      if (r() > f.arm.rate) continue;
      // threat: close, carrying explosives, caught in the open; only those in front of the post and in range
      const seen = rUp.filter(x => dist(x, f) <= f.arm.range && (f.post?.kind !== 'building' || (x.x - f.x) * ax + (x.z - f.z) * az > -1));
      if (!seen.length) continue;
      const tg = seen.map(x => ({ x, s: -dist(x, f) + (x.grenades || x.rockets ? 15 : 0) + (x.moving ? 8 : 0) })).sort((a, b) => b.s - a.s)[0].x;
      shoot(f, tg, t + r() * 0.9);
    }
    // the medic drags the wounded in
    const med = H.find(f => f.medic && !f.out);
    const down = H.find(f => f.out && !f.dead && !f.shelter && !f.rescued);
    if (alarmed && med && down && !breached) {
      down.rescued = true;
      ev.push({ t: r2(t + 0.4), kind: 'move', unit: med.id, x: r2(down.x), z: r2(down.z) });
      ev.push({ t: r2(t + 2), kind: 'say', text: 'Man down — dragging them inside!' });
      toShelter(down, t + 3);
      med.readyAt = t + 6;
      ev.push({ t: r2(t + 3.3), kind: 'move', unit: med.id, x: r2(med.post?.x ?? med.x), z: r2(med.post?.z ?? med.z) });
    }

    // raiders
    const losses = R.filter(f => f.out).length;
    if (!fled && !breached && rUp.length && (losses >= raiders * 0.4 || R[0].out)) {
      fled = true;
      ev.push({ t, kind: 'say', text: R[0].out ? 'Their leader is down — they\'re pulling back!' : 'They\'re breaking off!' });
      for (const f of rUp) { f.fled = true; const p = at(36, (r() - 0.5) * 10); ev.push({ t: r2(t + r()), kind: 'flee', unit: f.id }); ev.push({ t: r2(t + 1), kind: 'move', unit: f.id, x: r2(p.x), z: r2(p.z) }); }
      end = 'fled'; endT = t + 8; break;
    }
    if (!rUp.length) { end = 'repelled'; endT = t + 3; break; }
    // they can't get over the wall and give up
    if (!breached && wallR && !wallDown && lineSince >= 0 && t - lineSince > 40) { ev.push({ t, kind: 'say', text: 'They can\'t get over the wall — they\'re giving up.' }); for (const f of rUp) { f.fled = true; ev.push({ t: r2(t + r()), kind: 'flee', unit: f.id }); } end = 'fled'; endT = t + 6; break; }
    // the weak side: which flank has fewer defenders
    const leftDef = hUp.filter(h => (h.x - C.x) * lx + (h.z - C.z) * lz > 0).length;
    const flank = leftDef > hUp.length / 2 ? -1 : 1;
    for (const [k, f] of rUp.entries()) {
      const d = dist(f, C);
      if (breached) {
        // inside: go for the house, shoot anyone not in a hard shelter
        if (d > 1.2) { const s2 = Math.min(MOVE, d - 1); f.x += (C.x - f.x) / d * s2; f.z += (C.z - f.z) / d * s2; if (t % 3 === 0) ev.push({ t, kind: 'move', unit: f.id, x: r2(f.x), z: r2(f.z) }); }
        const tg = H.filter(h => !h.dead && !(h.shelter && hardShelter) && dist(h, f) <= f.arm.range + 3).sort((a, b) => dist(a, f) - dist(b, f))[0];
        if (tg && r() < f.arm.rate) { if (tg.shelter) tg.cover = 0.5; shoot(f, tg, t + r() * 0.9); }
        continue;
      }
      // rockets at the best post in range
      if (f.rockets > 0 && alarmed) {
        const pt = posts.find(p => !p.wrecked && p.kind !== 'open' && H.some(h => h.post === p && !h.out) && dist(p, f) <= ROCKET_RANGE);
        if (pt) {
          f.rockets--; ev.push({ t, kind: 'rocket', from: f.id, x: r2(pt.x), z: r2(pt.z), ...(pt.y ? { y: pt.y } : {}) });
          const onTarget = r() < 0.6;
          explode(pt.x + (onTarget ? 0 : (r() - 0.5) * 3), pt.z + (onTarget ? 0 : (r() - 0.5) * 3), t + 1, 1.2, onTarget ? pt : undefined);
          continue;
        }
      }
      // grenades within ~30 m
      if (f.grenades > 0) {
        const tg = hUp.find(h => dist(h, f) <= GRENADE_RANGE);
        if (tg) { f.grenades--; ev.push({ t, kind: 'throw', from: f.id, x: r2(tg.x), z: r2(tg.z), what: 'grenade' }); explode(tg.x + (r() - 0.5), tg.z + (r() - 0.5), t + 2, 1.5, tg.post && r() < 0.4 ? tg.post : undefined); continue; }
      }
      // bounding: half move while half suppress; swap each bound
      const movers = Math.floor(t / 4) % 2 === k % 2;
      if (movers && d > lineR + 0.5 && t >= f.nextMove) {
        f.moving = true; f.cover = 1.3;
        const step = Math.min(4, d - lineR);
        const lat = (r() - 0.5) * 2 + flank * 0.8;
        f.x += (C.x - f.x) / d * step + lx * lat; f.z += (C.z - f.z) / d * step + lz * lat;
        f.nextMove = t + 4;
        ev.push({ t, kind: 'move', unit: f.id, x: r2(f.x), z: r2(f.z) });
        const nd = dist(f, C);
        // the mined band
        if (minesLeft > 0 && d > mineR && nd <= mineR && r() < Math.min(0.85, 0.2 + minesLeft * 0.1)) {
          minesLeft--;
          const hits = rUp.filter(o => dist(o, f) <= 1.5).map(o => o.id);
          ev.push({ t: r2(t + 2), kind: 'mine', x: r2(f.x), z: r2(f.z), hits });
          for (const o of rUp) if (hits.includes(o.id)) hurt(o, (70 + r() * 50) * (o === f ? 1 : 0.6), t + 2);
        }
      } else if (f.moving && t >= f.nextMove - 1) {
        f.moving = false; f.cover = 0.3;
        ev.push({ t, kind: 'cover', unit: f.id, x: r2(f.x), z: r2(f.z) });
      } else if (alarmed || t > 2) {
        const tg = hUp.filter(h => dist(h, f) <= f.arm.range && h.readyAt <= t + 2).sort((a, b) => a.cover - b.cover || dist(a, f) - dist(b, f))[0];
        if (tg && r() < f.arm.rate) shoot(f, tg, t + r() * 0.9);
      }
    }
    // the line: a breach when they're at it and the defense is down, outnumbered, or the wall is blown
    const atLine = rUp.filter(f => !f.out && dist(f, C) <= lineR + 0.8);
    if (atLine.length && lineSince < 0) lineSince = t;
    const hNow = H.filter(f => !f.out && !f.shelter && f.arm !== FISTS).length;
    if (!breached && atLine.length && (wallDown || hNow === 0 || rUp.length > hNow * 2) && (!wallR || wallDown || r() < 0.01 * atLine.length)) {
      breached = true; breachT = t;
      const p = at(lineR, 0);
      ev.push({ t, kind: 'breach', x: r2(p.x), z: r2(p.z) });
      ev.push({ t, kind: 'say', text: 'They\'re through the line!' });
    }
    if (breached && t - breachT >= 20) {
      end = H.some(f => !f.out && !f.shelter) ? 'breached' : 'overrun'; endT = t + 2;
      if (H.filter(f => !f.dead && !f.shelter).length === 0 && H.every(f => f.out || f.shelter)) end = 'overrun';
    }
    if (breached && !H.some(f => !f.out && !f.shelter) && t - breachT >= 8) { end = 'overrun'; endT = t + 2; }
  }
  if (!end) { end = breached ? 'breached' : 'repelled'; endT = 300; }
  if (!alarmed) ev.push({ t: 0, kind: 'alarm', what });
  const duration = Math.max(endT, ...ev.map(e => e.t)) + 1;
  ev.push({ t: duration, kind: 'end', result: end });
  ev.sort((a, b) => a.t - b.t);
  const dropped = { grenades: R.filter(f => f.out).reduce((a, f) => a + f.grenades, 0), rpg_rounds: R.filter(f => f.out).reduce((a, f) => a + f.rockets, 0) };
  return { night, units, events: ev, duration, spent, minesUsed: mines - minesLeft, dropped, result: end };
}

/** Write a fought battle into the game: wounds, deaths, ammo, mines, loot, the tallies. */
export function applyBattle(s: GameState, b: Battle): string[] {
  const out: string[] = [];
  const pb = b as Partial<PlannedBattle>;
  const endEv = b.events.find(e => e.kind === 'end');
  const result = endEv && endEv.kind === 'end' ? endEv.result : 'repelled';
  const day = Math.floor(s.clock.t);
  const byUnit = new Map(b.units.filter(u => u.personId).map(u => [u.id, u.personId!]));
  const idx = (unit: string) => s.people.findIndex(p => p.id === byUnit.get(unit));
  for (const e of b.events) {
    if (e.kind === 'wound' && byUnit.has(e.unit)) {
      const i = idx(e.unit); if (i < 0) continue;
      const sev = softenWound(s, e.sev, true), nd = s.personState[i].needs;
      if (nd.died != null) continue;
      nd.hurt.push({ what: 'wounded in the fight', sev });
      nd.health = Math.max(s.disaster.difficulty === 'cozy' ? 5 : 1, nd.health - sev * 0.5);
      out.push(`${s.people[i].first} was wounded.`);
    } else if (e.kind === 'death' && byUnit.has(e.unit)) {
      const i = idx(e.unit); if (i < 0) continue;
      const nd = s.personState[i].needs;
      if (s.disaster.difficulty === 'cozy') { nd.hurt.push({ what: 'badly wounded in the fight', sev: 80 }); nd.health = 5; out.push(`${s.people[i].first} was badly wounded.`); continue; }
      nd.health = 0; nd.died = day;
      out.push(`${s.people[i].first} was killed.`);
    }
  }
  let rounds = 0;
  for (const [cal, nn] of Object.entries(pb.spent ?? {}) as Array<[Caliber, number]>) { s.armory.ammo[cal] = Math.max(0, (s.armory.ammo[cal] ?? 0) - nn); rounds += nn; }
  if (rounds) {
    out.push(`${rounds} rounds fired.`);
    for (const gun of s.armory.guns) { gun.fired += Math.round(rounds / Math.max(1, s.armory.guns.length)); gun.condition = Math.max(0, gun.condition - 0.01); }
  }
  if (pb.minesUsed) { s.stock.mines = Math.max(0, (s.stock.mines ?? 0) - pb.minesUsed); out.push(`${pb.minesUsed} mine${pb.minesUsed > 1 ? 's' : ''} went off.`); }
  const thrown = b.events.filter(e => e.kind === 'throw' && e.from.startsWith('h_')).length;
  if (thrown) s.stock.grenades = Math.max(0, (s.stock.grenades ?? 0) - thrown);
  if (result === 'breached' || result === 'overrun') {
    s.gate.raidsLost++;
    const share = result === 'overrun' ? 0.6 : 0.3;
    const lost: string[] = [];
    for (const k of ['canned', 'staples', 'frozen', 'fuel', 'meds'] as const) { const t = Math.floor((s.stock[k] ?? 0) * share); if (t > 0) { s.stock[k] -= t; lost.push(`${t} ${k}`); } }
    if (lost.length) out.push(`Lost: ${lost.join(', ')}`);
  } else {
    s.gate.raidsHeld++;
    const d = pb.dropped;
    if (d && (d.grenades || d.rpg_rounds)) {
      s.stock.grenades = (s.stock.grenades ?? 0) + d.grenades;
      s.stock.rpg_rounds = (s.stock.rpg_rounds ?? 0) + d.rpg_rounds;
      out.push(`Recovered from the fallen: ${[d.grenades ? `${d.grenades} grenade${d.grenades > 1 ? 's' : ''}` : '', d.rpg_rounds ? `${d.rpg_rounds} rocket${d.rpg_rounds > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ')}.`);
    }
  }
  return out;
}
