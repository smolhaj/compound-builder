/**
 * The last act of an invasion: the crew that came through the wall fights its way into the house, room by room (cinematic; sim/breach.ts has
 * the legend of what is real). Pure and seeded.
 *
 * REAL: the sim decides who is hurt or killed and when (its `wound` / `death` events stay exactly where they were), that the crew got through
 * the line, and how the fight ends (`end.result`, kept). CINEMATIC: where everybody stands once the defenders are back in the house, the door
 * the crew comes through, the exchange of fire room to room (shots drawn as misses, never counted as rounds spent: the report reads the sim's
 * own battle), the callouts, who drags a wounded defender to the back room, and the crew pulling out with what it took when the family still
 * holds. The sim's battle is short after the break (about twenty seconds), so the scene is stretched by `ASSAULT_EXTRA` seconds at staging.
 *
 * The rooms come from the walk-mode colliders the house is really built with (`blocked`), so nobody walks through a wall: a grid over the
 * footprint, a flood from the yard to find the door, and breadth-first paths from the door to the rooms.
 */
import type { Battle, BattleEvent, BattleUnit } from './battleTypes';
import { mulberry32 } from './rng';
import { LineDirector } from './raidDialogue';

/** Seconds added to a scene that breaks the line (the staging adds them to the plan; this planner fills them). */
export const ASSAULT_EXTRA = 40;
export interface Box2 { x0: number; z0: number; x1: number; z1: number }
export interface AssaultCtx {
  box: Box2;
  /** Can a body (radius ~0.04) not stand at (x, z)? The walk-mode collision of the world. */
  blocked: (x: number, z: number) => boolean;
  seed: number;
}

const CELL = 0.06, RUN = 1.1, PAD = 0.7;
const r2 = (n: number) => Math.round(n * 100) / 100;

const RAID_IN = ['Door! Stack on the door!', 'Kick it in — go, go!', 'Breach it — I\'ve got the left!'];
const RAID_ROOM = ['Clear the kitchen!', 'Left side — left side!', 'Hands! Show me your hands!', 'Where\'s the food? WHERE IS IT?', 'Move up — I\'ve got the hall!', 'Flush them out of there!', 'Check the bedroom — go!'];
const HOME_ROOM = ['Hold the doorway — shoot anything that comes through!', 'Stay down behind the couch!', 'Keep them out of the hall!', 'Cover the stairs — I\'ve got the door!', 'I\'m reloading — cover me!', 'Back room — get the kids in the back room!'];
const HOME_FALL = ['Fall back to the house — everybody inside, now!', 'Inside! Get inside, lock it!'];
const HOME_AID = ['Stay with me — look at me — you\'re okay!', 'I\'ve got you — pressure, keep pressure on it!', 'Hang on — hang on, I\'m right here!'];
const HOME_DRAG = ['I\'ve got you — come on, up — we\'re moving!', 'Easy — easy — back room, we\'re going to the back room!'];
const RAID_OUT = ['Grab what you can carry — we\'re leaving!', 'That\'s enough — out, out, back to the trucks!', 'We\'re done here — move!'];
const HOME_YIELD = ['Okay — okay! Take it, just don\'t hurt the kids!', 'I\'m down — I\'m down, please, don\'t shoot!'];

function pickOne(r: () => number, list: readonly string[], used: Set<string>): string {
  const pool = list.filter(l => !used.has(l));
  const pickFrom = pool.length ? pool : list;
  const t = pickFrom[Math.floor(r() * pickFrom.length)];
  used.add(t);
  return t;
}

interface Grid { x0: number; z0: number; nx: number; nz: number; free: Uint8Array; inside: Uint8Array; reach: Uint8Array }
const cx = (g: Grid, i: number) => g.x0 + (i + 0.5) * CELL, cz = (g: Grid, j: number) => g.z0 + (j + 0.5) * CELL;
const N4: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function buildGrid(ctx: AssaultCtx): Grid | null {
  const { box } = ctx;
  const x0 = box.x0 - PAD, z0 = box.z0 - PAD, nx = Math.ceil((box.x1 - box.x0 + 2 * PAD) / CELL), nz = Math.ceil((box.z1 - box.z0 + 2 * PAD) / CELL);
  if (nx * nz > 90000) return null;
  const g: Grid = { x0, z0, nx, nz, free: new Uint8Array(nx * nz), inside: new Uint8Array(nx * nz), reach: new Uint8Array(nx * nz) };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = cx(g, i), z = cz(g, j);
    g.free[j * nx + i] = ctx.blocked(x, z) ? 0 : 1;
    g.inside[j * nx + i] = x > box.x0 + 0.03 && x < box.x1 - 0.03 && z > box.z0 + 0.03 && z < box.z1 - 0.03 ? 1 : 0;
  }
  // flood from a free border cell
  let start = -1;
  for (let i = 0; i < nx && start < 0; i++) if (g.free[i]) start = i;
  if (start < 0) return null;
  const q = [start]; g.reach[start] = 1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], ci = c % nx, cj = (c - ci) / nx;
    for (const [dx, dz] of N4) {
      const ni = ci + dx, nj = cj + dz;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
      const n = nj * nx + ni;
      if (g.free[n] && !g.reach[n]) { g.reach[n] = 1; q.push(n); }
    }
  }
  return g;
}

interface Layout { door: { x: number; z: number }; out: { x: number; z: number }; inside: { x: number; z: number }; path: (to: number) => Array<{ x: number; z: number }>; cells: Array<{ idx: number; d: number }>; hall: number; rooms: number[]; back: number; at: (idx: number) => { x: number; z: number } }

function layoutOf(g: Grid, toward: { x: number; z: number }): Layout | null {
  const { nx, nz } = g;
  const interior: number[] = [];
  for (let k = 0; k < nx * nz; k++) if (g.inside[k] && g.reach[k]) interior.push(k);
  if (interior.length < 25) return null;
  // door cells: interior cells with a free reachable non-interior neighbour; take the one nearest the side the crew comes from
  let door = -1, best = Infinity, outCell = -1;
  for (const k of interior) {
    const i = k % nx, j = (k - i) / nx;
    for (const [dx, dz] of N4) {
      const ni = i + dx, nj = j + dz;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
      const n = nj * nx + ni;
      if (!g.inside[n] && g.free[n] && g.reach[n]) {
        const d = Math.hypot(cx(g, i) - toward.x, cz(g, j) - toward.z);
        if (d < best) { best = d; door = k; outCell = n; }
      }
    }
  }
  if (door < 0) return null;
  // breadth-first from the door through the interior
  const dist = new Int32Array(nx * nz).fill(-1), par = new Int32Array(nx * nz).fill(-1);
  const q = [door]; dist[door] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], ci = c % nx, cj = (c - ci) / nx;
    for (const [dx, dz] of N4) {
      const ni = ci + dx, nj = cj + dz;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
      const n = nj * nx + ni;
      if (g.inside[n] && g.reach[n] && dist[n] < 0) { dist[n] = dist[c] + 1; par[n] = c; q.push(n); }
    }
  }
  const cells = q.map(idx => ({ idx, d: dist[idx] }));
  const far = cells[cells.length - 1].d || 1;
  const at = (idx: number) => ({ x: cx(g, idx % nx), z: cz(g, Math.floor(idx / nx)) });
  const spread = (target: number, taken: number[]) => {
    let pick = -1, bestE = Infinity;
    for (const c of cells) {
      const p = at(c.idx);
      if (taken.some(t => Math.hypot(at(t).x - p.x, at(t).z - p.z) < 0.34)) continue;
      const e = Math.abs(c.d - target * far);
      if (e < bestE) { bestE = e; pick = c.idx; }
    }
    return pick >= 0 ? pick : cells[Math.min(cells.length - 1, Math.floor(target * cells.length))].idx;
  };
  const taken: number[] = [];
  const back = spread(1, taken); taken.push(back);
  const roomA = spread(0.6, taken); taken.push(roomA);
  const roomB = spread(0.38, taken); taken.push(roomB);
  const hall = spread(0.18, taken);
  const path = (to: number) => {
    const raw: number[] = [];
    for (let c = to; c >= 0; c = par[c]) raw.push(c);
    raw.reverse();
    const pts: Array<{ x: number; z: number }> = [];
    let last = at(raw[0]);
    for (let k = 1; k < raw.length; k++) { const p = at(raw[k]); if (Math.hypot(p.x - last.x, p.z - last.z) >= 0.26 || k === raw.length - 1) { pts.push(p); last = p; } }
    return pts;
  };
  const oi = outCell % nx, oj = (outCell - oi) / nx;
  return { door: at(door), out: { x: cx(g, oi), z: cz(g, oj) }, inside: at(hall), path, cells, hall, rooms: [roomA, roomB], back, at };
}

type Pos = Map<string, { x: number; z: number }>;
function positionsAt(b: Battle, t: number): Pos {
  const pos: Pos = new Map(b.units.map(u => [u.id, { x: u.x, z: u.z }]));
  for (const e of b.events) if (e.t <= t && (e.kind === 'move' || e.kind === 'cover')) pos.set(e.unit, { x: e.x, z: e.z });
  return pos;
}

/** Plan the house fight onto a battle that has a break (b.invasion). Returns the battle unchanged when there is no break or no breach. */
export function planHouseAssault(b: Battle, ctx: AssaultCtx): Battle {
  const br = b.events.find(e => e.kind === 'breach') as Extract<BattleEvent, { kind: 'breach' }> | undefined;
  const end = b.events.find(e => e.kind === 'end') as Extract<BattleEvent, { kind: 'end' }> | undefined;
  if (!br || !end || !b.invasion || b.invasion.interior) return b;
  const r = mulberry32(ctx.seed * 6007 + 19), used = new Set<string>();
  const tb = br.t, tI = tb + 9;
  const D = Math.max(32, ASSAULT_EXTRA - 6 + (end.t - (tb + 9)));
  const newEnd = tI + D + 6;
  const grid = buildGrid(ctx);
  const gapEv = b.events.find(e => e.kind === 'gap') as Extract<BattleEvent, { kind: 'gap' }> | undefined;
  const toward = gapEv ? { x: gapEv.x, z: gapEv.z } : { x: br.x, z: br.z };
  const lay = grid ? layoutOf(grid, toward) : null;
  const pos = positionsAt(b, tI);
  const dead = new Set<string>(), hurtT = new Map<string, number>();
  for (const e of b.events) { if (e.kind === 'death' && e.t <= tI) dead.add(e.unit); if (e.kind === 'wound' && !e.stopped && e.t <= tI + 40 && !hurtT.has(e.unit)) hurtT.set(e.unit, e.t); }
  const homeAll = b.units.filter(u => u.side === 'home' && !u.machine && !dead.has(u.id));
  const raiders = b.units.filter(u => u.side === 'raider' && !u.machine && !dead.has(u.id) && !b.events.some(e => e.kind === 'flee' && e.unit === u.id && e.t <= tI));
  const adults = homeAll.filter(u => !u.civilian), kids = homeAll.filter(u => u.civilian);
  if (!raiders.length) return b;
  const ev: BattleEvent[] = [];
  const say = (t: number, text: string, who?: BattleUnit) => ev.push({ t: r2(t), kind: 'say', text, ...(who ? { who: who.id } : {}) });
  const move = (t: number, u: BattleUnit, p: { x: number; z: number }) => ev.push({ t: r2(t), kind: 'move', unit: u.id, x: r2(p.x), z: r2(p.z) });
  const walk = (t0: number, u: BattleUnit, pts: Array<{ x: number; z: number }>, from: { x: number; z: number }): number => {
    let t = t0, cur = from;
    for (const p of pts) { move(t, u, p); t += Math.hypot(p.x - cur.x, p.z - cur.z) / RUN; cur = p; }
    return t;
  };
  const near = (p: { x: number; z: number }, list: readonly BattleUnit[]) => [...list].sort((a, c) => Math.hypot(pos.get(a.id)!.x - p.x, pos.get(a.id)!.z - p.z) - Math.hypot(pos.get(c.id)!.x - p.x, pos.get(c.id)!.z - p.z));
  const strip = new Set<string>();   // units whose sim moves after tI are replaced
  let meta = { ...b.invasion };
  const dir = new LineDirector(ctx.seed);

  /**
   * How the invasion ends (the same reading as sim/raidEnding.ts: the crew won the line): the raiders the sim wounded lie where they fell, the defenders still
   * on their feet are held with their hands up while the crew takes what it can carry, and then the crew goes out through the gap, the way it came.
   * Nobody is left standing in a cluster.
   */
  function routOut(t0: number, l: Layout | null, crew: readonly BattleUnit[]): void {
    const live = raiders.filter(u => !dead.has(u.id));
    const hurtUnits = live.filter(u => hurtT.has(u.id)), rest = live.filter(u => !hurtUnits.includes(u));
    const gap = gapEv ?? { x: br!.x, z: br!.z };
    const mid = { x: (ctx.box.x0 + ctx.box.x1) / 2, z: (ctx.box.z0 + ctx.box.z1) / 2 };
    const outward = { x: gap.x + (gap.x - mid.x) * 2.2, z: gap.z + (gap.z - mid.z) * 2.2 };
    const talker = rest[0], held = adults.find(u => !hurtT.has(u.id));
    hurtUnits.forEach((u, i) => { ev.push({ t: r2(t0 - 1 + i * 0.7), kind: 'lay', unit: u.id }); strip.add(u.id); });
    adults.filter(u => !hurtT.has(u.id)).forEach((u, i) => { ev.push({ t: r2(t0 - 2 + i * 0.5), kind: 'surrender', unit: u.id }); strip.add(u.id); });
    if (talker) say(t0 - 1.5, dir.pick('raider', 'looting', { speaker: talker.id }) ?? pickOne(r, RAID_OUT, used), talker);
    if (held) say(t0 + 0.6, dir.pick('defender', 'held', { speaker: held.id }) ?? pickOne(r, HOME_YIELD, used), held);
    if (crew[0]) say(t0 + 3, pickOne(r, RAID_OUT, used), crew[0]);
    rest.forEach((u, i) => {
      strip.add(u.id);
      const inside = l && crew.includes(u);
      walk(t0 + 3.4 + i * 0.35, u, inside ? [l!.door, l!.out, gap, outward] : [gap, outward], inside ? l!.at(l!.rooms[0]) : (pos.get(u.id) ?? u));
    });
  }
  if (lay && adults.length) {
    meta = { ...meta, house: { ...ctx.box, door: lay.out, inside: lay.inside }, interior: { from: r2(tI + 1.5), to: r2(tI + D - 1) } };
    const breachers = near(lay.out, raiders).slice(0, Math.min(4, raiders.length));
    for (const u of [...homeAll, ...breachers]) strip.add(u.id);
    // 1. the family falls back inside (the sim's own "fall back to the house")
    const lead = adults[0];
    say(tI - 3.2, pickOne(r, HOME_FALL, used), lead);
    const slots = [lay.rooms[0], lay.hall, lay.rooms[1], lay.back];
    adults.forEach((u, i) => {
      const slot = slots[i % 3];
      const t = walk(tI - 3 + i * 0.5, u, [lay.out, lay.door, ...lay.path(slot)], pos.get(u.id)!);
      void t;
    });
    kids.forEach((u, i) => { walk(tI - 3.4 + i * 0.4, u, [lay.out, lay.door, ...lay.path(lay.back)], pos.get(u.id)!); });
    // 2. the crew stacks on the door and goes in
    breachers.forEach((u, i) => { const side = i % 2 ? 1 : -1; move(tI - 0.5 + i * 0.3, u, { x: lay.out.x + side * 0.12 + (lay.out.x - lay.door.x) * 0.9, z: lay.out.z + (lay.out.z - lay.door.z) * 0.9 }); });
    say(tI + 0.8, pickOne(r, RAID_IN, used), breachers[0]);
    breachers.forEach((u, i) => {
      const room = lay.rooms[i % 2];
      walk(tI + 2.6 + i * 0.7, u, [lay.door, ...lay.path(i < 2 ? lay.hall : room).slice(0, 4)], pos.get(u.id)!);
    });
    // 3. the exchange of fire, room to room (drawn as misses; the report reads the sim's own battle)
    const nHome = adults.length;
    for (let t = tI + 4.2, k = 0; t < tI + D - 8; t += 0.7 + r() * 0.9, k++) {
      const a = breachers[k % breachers.length], h = adults[Math.floor(r() * nHome)];
      if (!a || !h) continue;
      ev.push({ t: r2(t), kind: 'shot', from: a.id, to: h.id, hit: false, ...(r() < 0.18 ? { auto: true } : {}) });
      if (r() < 0.5) ev.push({ t: r2(t + 0.35 + r() * 0.4), kind: 'shot', from: h.id, to: a.id, hit: false });
    }
    // 4. the callouts
    for (let k = 0; k < 4; k++) say(tI + 6 + k * 4.8, pickOne(r, k % 2 ? HOME_ROOM : RAID_ROOM, used), k % 2 ? adults[k % nHome] : breachers[k % breachers.length]);
    // 5. a wounded defender (the sim's wound, kept at its time) is dragged to the back room
    const casualty = adults.find(u => hurtT.has(u.id) && !b.events.some(e => e.kind === 'death' && e.unit === u.id));
    const carrier = casualty ? adults.find(u => u !== casualty) : undefined;
    if (casualty && carrier) {
      const tc = tI + D * 0.5;
      const cp = lay.at(lay.rooms[0]);
      move(tc, carrier, cp);
      ev.push({ t: r2(tc + 0.5), kind: 'aid', unit: casualty.id, by: carrier.id, what: 'pressure' });
      say(tc + 0.8, pickOne(r, HOME_AID, used), carrier);
      const route = lay.path(lay.back);
      let t = tc + 4.2;
      say(t - 0.2, pickOne(r, HOME_DRAG, used), carrier);
      for (const p of route.slice(-3)) { move(t, carrier, { x: p.x - 0.07, z: p.z }); move(t + 0.1, casualty, p); t += 1.1; }
    } else {
      // a defender the sim kills in the house is attended by the next nearest
      const dv = b.events.find(e => e.kind === 'death' && e.t >= tI && e.t <= newEnd && adults.some(u => u.id === e.unit)) as Extract<BattleEvent, { kind: 'death' }> | undefined;
      if (dv) { const bodyOf = adults.find(u => u.id === dv.unit)!; const helper = adults.find(u => u !== bodyOf); if (helper) { move(dv.t + 1.2, helper, pos.get(bodyOf.id)!); ev.push({ t: r2(dv.t + 2), kind: 'aid', unit: bodyOf.id, by: helper.id, what: 'pressure' }); say(dv.t + 2.3, pickOne(r, HOME_AID, used), helper); } }
    }
    // 6. the end: the crew has the house; the family is held, the crew takes what it can carry and goes
    routOut(tI + D - 11, lay, breachers);
  } else {
    // no way into the house (it is not built, or its door is not found): the fight goes on at the windows for the extra seconds
    const defenders = homeAll.filter(u => !u.civilian);
    for (let t = tI + 1, k = 0; t < tI + D - 4 && defenders.length; t += 0.8 + r() * 1.0, k++) {
      const a = raiders[k % raiders.length], h = defenders[Math.floor(r() * defenders.length)];
      ev.push({ t: r2(t), kind: 'shot', from: a.id, to: h.id, hit: false });
      if (r() < 0.55) ev.push({ t: r2(t + 0.3 + r() * 0.4), kind: 'shot', from: h.id, to: a.id, hit: false });
    }
    routOut(tI + D - 11, null, raiders);
  }
  // the sim's own moves for the choreographed units stop at tI - 3.4
  // the staging's own ending (sim/raidEnding.ts) plays in the sim's last seconds, which are now mid-fight: this act replaces it (hands up, looting, leaving)
  const mine = (e: BattleEvent) => e.t > tI - 3.6 && (e.kind === 'surrender' || e.kind === 'lay' || (e.kind === 'say' && !!e.ctx && /aftermath|looting|held|prisoner/.test(e.ctx)) || (e.kind === 'move' && e.walk === true) || (e.kind === 'move' && Math.hypot(e.x - (ctx.box.x0 + ctx.box.x1) / 2, e.z - (ctx.box.z0 + ctx.box.z1) / 2) > 25));
  const kept = b.events.filter(e => !mine(e) && e.kind !== 'end' && !(strip.size && (e.kind === 'move' || e.kind === 'cover') && strip.has(e.unit) && e.t > tI - 3.6) && !(e.kind === 'flee' && strip.has(e.unit) && e.t > tI - 3.6));
  const oldTail = Math.max(0, b.duration - end.t);
  const events = [...kept, ...ev, { t: r2(newEnd), kind: 'end', result: end.result } as BattleEvent].sort((a, c) => a.t - c.t);
  return { ...b, events, duration: r2(newEnd + oldTail), invasion: meta };
}
