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
import { LineDirector, type Ctx } from './raidDialogue';
import { analyzeHouse } from './houseRooms';
import { planInterior, type InteriorOut } from './interiorTactics';
import { styleMercy } from './mercy';

/** Seconds added to a scene that breaks the line (the staging adds them to the plan; this planner fills them). */
export const ASSAULT_EXTRA = 80;
export interface Box2 { x0: number; z0: number; x1: number; z1: number }
export interface AssaultCtx {
  box: Box2;
  /** Can a body (radius ~0.04) not stand at (x, z)? The walk-mode collision of the world. */
  blocked: (x: number, z: number) => boolean;
  seed: number;
  /** The scene's line picker (one for the whole cutscene, so no line is said twice): the invasion's own if absent. */
  dir?: LineDirector;
  /** A person's first name for a unit id (names in the callouts); absent = nameless lines. */
  nameOf?: (unitId: string) => string | undefined;
}

export const CELL = 0.06, RUN = 1.1, PAD = 0.7;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface Grid { x0: number; z0: number; nx: number; nz: number; free: Uint8Array; inside: Uint8Array; reach: Uint8Array }
const cx = (g: Grid, i: number) => g.x0 + (i + 0.5) * CELL, cz = (g: Grid, j: number) => g.z0 + (j + 0.5) * CELL;
const N4: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * The lines the quiet stretches of a house fight are filled with (nobody speaks for 4 s): only ones that are true whatever is happening. A call that
 * reports a state of the fight is never filler: "the room is clear" is said only by interiorTactics when the room really is empty of the family,
 * and "covering fire" only by a defender whose shots are in the plan (src/sim/interiorTactics.ts).
 */
export const FILL_RAIDER: Ctx[] = ['clear_room', 'search', 'pie_corner', 'rally'];
export const FILL_DEFENDER: Ctx[] = ['hold_room', 'rally', 'pie_corner'];

export function buildGrid(ctx: AssaultCtx): Grid | null {
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
  const inv0 = b.invasion ?? (b.raid && (end?.result === 'breached' || end?.result === 'overrun') ? { method: 'climb' as const } : undefined);
  if (!br || !end || !inv0 || inv0.interior) return b;
  const r = mulberry32(ctx.seed * 6007 + 19), dir = ctx.dir ?? new LineDirector(ctx.seed);
  dir.noteUnits(b.units);
  dir.noteAll(b);   // (what the scene already said counts as said)
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
  const style = raiders.find(u => u.look)?.look?.style;
  const say = (t: number, role: 'raider' | 'defender', c: Ctx, who?: BattleUnit, vars?: Record<string, string>) => { const text = dir.pick(role, c, { speaker: who?.id, variants: role === 'raider' && style ? [style, ...(c === 'found' || c === 'kill' || c === 'captive' || c === 'arson' ? [b.mercy?.temper ?? styleMercy(style).temper] : []), ...((style === 'crew' || style === 'scouts') ? ['disciplined'] : ['rush'])] : [], vars: { ...(who && ctx.nameOf?.(who.id) ? { c: ctx.nameOf(who.id)! } : {}), ...vars } }); if (text) ev.push({ t: r2(t), kind: 'say', text, ctx: c, ...(who ? { who: who.id } : {}) }); };
  const move = (t: number, u: BattleUnit, p: { x: number; z: number }) => ev.push({ t: r2(t), kind: 'move', unit: u.id, x: r2(p.x), z: r2(p.z) });
  const walk = (t0: number, u: BattleUnit, pts: Array<{ x: number; z: number }>, from: { x: number; z: number }): number => {
    let t = t0, cur = from;
    for (const p of pts) { move(t, u, p); t += Math.hypot(p.x - cur.x, p.z - cur.z) / RUN; cur = p; }
    return t;
  };
  const near = (p: { x: number; z: number }, list: readonly BattleUnit[]) => [...list].sort((a, c) => Math.hypot(pos.get(a.id)!.x - p.x, pos.get(a.id)!.z - p.z) - Math.hypot(pos.get(c.id)!.x - p.x, pos.get(c.id)!.z - p.z));
  const strip = new Set<string>();   // units whose sim moves after tI are replaced
  let meta = { ...inv0 };

  /**
   * How the invasion ends (the same reading as sim/raidEnding.ts: the crew won the line): the raiders the sim wounded lie where they fell, the defenders still
   * on their feet are held with their hands up while the crew takes what it can carry, and then the crew goes out through the gap, the way it came.
   * Nobody is left standing in a cluster.
   */
  const temper = b.mercy?.temper ?? b.raid?.disposition ?? styleMercy(style).temper;
  /** The sim wrote the ending beats itself (loot, fires, hostages, the parley: save v87): the scene only places people for them and never adds its own. */
  const real = !!b.raid;
  const after: typeof b.aftermath = real ? { captives: b.raid!.hostages.map(h => h.unit), ...(b.raid!.ending && (b.raid!.ending.kind === 'tribute' || b.raid!.ending.kind === 'passage') ? { terms: { kind: b.raid!.ending.kind, ...(b.raid!.ending.what ? { item: b.raid!.ending.what } : {}) } } : {}) } : b.aftermath;
  const captiveIds = new Set<string>();
  function routOut(t0: number, l: Layout | null, crew: readonly BattleUnit[]): void {
    const live = raiders.filter(u => !dead.has(u.id));
    const hurtUnits = live.filter(u => hurtT.has(u.id)), rest = live.filter(u => !hurtUnits.includes(u));
    const gap = gapEv ?? { x: br!.x, z: br!.z };
    const mid = { x: (ctx.box.x0 + ctx.box.x1) / 2, z: (ctx.box.z0 + ctx.box.z1) / 2 };
    const outward = { x: gap.x + (gap.x - mid.x) * 2.2, z: gap.z + (gap.z - mid.z) * 2.2 };
    const talker = rest[0], held = adults.find(u => !hurtT.has(u.id) && !captiveIds.has(u.id));
    const terms = after?.terms;
    hurtUnits.forEach((u, i) => {
      // the wounded are not left lying: a buddy drags each one out with the crew (a gang abandons them), or they lie where they fell
      const buddy = rest[(i + 1) % Math.max(1, rest.length)];
      if (temper === 'merciful' && buddy && !captiveIds.has(u.id)) {
        ev.push({ t: r2(t0 + 1 + i * 0.7), kind: 'aid', unit: u.id, by: buddy.id, what: 'pressure' });
        say(t0 + 1.4 + i * 0.7, 'raider', 'wounded_fallback', buddy);
        ev.push({ t: r2(t0 + 2.4 + i * 0.7), kind: 'lift', unit: u.id, by: buddy.id });
      } else ev.push({ t: r2(t0 - 1 + i * 0.7), kind: 'lay', unit: u.id });
      strip.add(u.id);
    });
    if (terms) {
      // a deal instead of a fight to the finish: the family hands the tribute over (or the crew is let through), nobody is laid out or held
      const payer = adults.find(u => !captiveIds.has(u.id)) ?? adults[0], taker = rest[0] ?? crew[0];
      if (payer && taker) {
        const item = terms.item ?? 'food';
        ev.push({ t: r2(t0 - 1), kind: 'move', unit: payer.id, x: r2(l ? l.out.x : gap.x), z: r2(l ? l.out.z : gap.z) });
        if (!real) ev.push({ t: r2(t0 + 1), kind: 'parley', offer: terms.kind, accepted: true, what: item });
        say(t0 + 1.2, 'defender', terms.kind, payer, { item });
        say(t0 + 2.6, 'raider', terms.kind, taker, { item });
        
      }
    } else {
      adults.filter(u => !hurtT.has(u.id) && !captiveIds.has(u.id)).forEach((u, i) => { ev.push({ t: r2(t0 - 2 + i * 0.5), kind: 'surrender', unit: u.id }); strip.add(u.id); });
      if (talker) say(t0 - 1.5, 'raider', 'search', talker);
      if (held) say(t0 + 0.6, 'defender', 'held', held);
      // what the crew carries off (the sim's list, a named thing each), and the fire a hostile crew leaves
      (after?.loot ?? []).slice(0, 6).forEach((item, i) => {
        const who = rest[i % Math.max(1, rest.length)]; if (!who) return;
        if (!real) ev.push({ t: r2(t0 + 1.2 + i * 0.5), kind: 'loot', by: who.id, what: item, n: 1, from: 'house' });
        if (i < 3) { say(t0 + 1.4 + i * 0.5, 'raider', 'loot_item', who, { item }); if (held && i === 0) say(t0 + 2.0, 'defender', 'loot_item', held, { item }); }
      });
      if (after?.arson) {
        const hx = (ctx.box.x0 + ctx.box.x1) / 2, hz = (ctx.box.z0 + ctx.box.z1) / 2;
        const spots: Array<{ x: number; z: number; big: boolean }> = [];
        if (after.arson === 'house' || after.arson === 'both') spots.push({ x: ctx.box.x0 + (ctx.box.x1 - ctx.box.x0) * 0.3, z: ctx.box.z1 + 0.05, big: true });
        if (after.arson === 'barn' || after.arson === 'both') spots.push({ x: hx + (ctx.box.x1 - ctx.box.x0) * 1.4, z: hz, big: true });
        if (!real) spots.forEach((p, i) => ev.push({ t: r2(t0 + 2.6 + i * 0.8), kind: 'fire', structure: i ? 'barn' : 'house', x: r2(p.x), z: r2(p.z) }));
        if (rest[1]) say(t0 + 2.4, 'raider', 'arson', rest[1]);
        if (held) say(t0 + 4.2, 'defender', 'arson', held);
      }
    }
    if (crew[0]) say(t0 + 3, 'raider', 'leaving', crew[0]);
    rest.forEach((u, i) => {
      strip.add(u.id);
      const inside = l && crew.includes(u);
      walk(t0 + 3.4 + i * 0.6, u, inside ? [l!.door, l!.out, gap, outward] : [gap, outward], inside ? l!.at(l!.rooms[0]) : (pos.get(u.id) ?? u));
    });
  }
  let planned: InteriorOut | null = null;
  const simHostage = new Set<string>(b.events.filter(e => e.kind === 'hostage').map(e => (e as { unit: string }).unit));
  const takenIds = new Set<string>([...b.events.filter(e => e.kind === 'taken').map(e => (e as { unit: string }).unit), ...(b.fates ?? []).filter(f => f.fate === 'taken').map(f => f.unit), ...(after?.captives ?? []), ...simHostage]);
  if (lay && grid && (adults.length || kids.length)) {
    const H = analyzeHouse(grid);
    if (H && H.rooms.length >= 2) {
      const deaths = new Map<string, number>();
      for (const e of b.events) if (e.kind === 'death' && e.t >= tI - 3.6) deaths.set(e.unit, e.t);
      const bs = near(lay.out, raiders).slice(0, Math.min(6, raiders.length));
      meta = { ...meta, house: { ...ctx.box, door: lay.out, inside: lay.inside }, interior: { from: r2(tI + 1.5), to: r2(tI + D - 1) } };
      planned = planInterior({ H, out: lay.out, door: lay.door, tI, D, adults, kids, crew: bs, pos, hurtT, wounds: b.events.filter((e): e is Extract<BattleEvent, { kind: 'wound' }> => e.kind === 'wound'), deaths, takenIds, style, mercy: b.mercy ?? (b.raid ? { temper: b.raid.disposition } : styleMercy(style)), explicitMercy: !!b.mercy, realHostage: simHostage, seed: ctx.seed, rng: r, say, nameOf: id => ctx.nameOf?.(id), ev });
      if (planned) { for (const id of planned.strip) strip.add(id); for (const id of planned.captives) captiveIds.add(id); for (const id of simHostage) captiveIds.add(id); for (const u of homeAll) strip.add(u.id); }
    }
  }
  if (planned) {
    routOut(tI + D - 11, lay, planned.insideCrew);
  } else if (lay && adults.length) {
    meta = { ...meta, house: { ...ctx.box, door: lay.out, inside: lay.inside }, interior: { from: r2(tI + 1.5), to: r2(tI + D - 1) } };
    const breachers = near(lay.out, raiders).slice(0, Math.min(4, raiders.length));
    for (const u of [...homeAll, ...breachers]) strip.add(u.id);
    // 1. the family falls back inside (the sim's own "fall back to the house")
    const lead = adults[0];
    say(tI - 3.2, 'defender', 'breach', lead);
    const slots = [lay.rooms[0], lay.hall, lay.rooms[1], lay.back];
    adults.forEach((u, i) => {
      const slot = slots[i % 3];
      const t = walk(tI - 3 + i * 0.5, u, [lay.out, lay.door, ...lay.path(slot)], pos.get(u.id)!);
      void t;
    });
    kids.forEach((u, i) => { walk(tI - 3.4 + i * 0.4, u, [lay.out, lay.door, ...lay.path(lay.back)], pos.get(u.id)!); });
    // 2. the crew stacks on the door and goes in
    breachers.forEach((u, i) => { const side = i % 2 ? 1 : -1; move(tI - 0.5 + i * 0.3, u, { x: lay.out.x + side * 0.12 + (lay.out.x - lay.door.x) * 0.9, z: lay.out.z + (lay.out.z - lay.door.z) * 0.9 }); });
    say(tI + 0.8, 'raider', 'stack_door', breachers[0]);
    say(tI + 3.4, 'raider', 'clear_room', breachers[1] ?? breachers[0]);
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
    // a new line every two or three seconds, never one repeated: the rooms are cleared, the doorways held, the house searched
    for (let t = tI + 6, k = 0; t < tI + D - 13; t += 2.4 + r() * 0.6, k++) {
      const RC: Ctx[] = FILL_RAIDER, DC: Ctx[] = FILL_DEFENDER;
      const alive0 = adults.filter(u => !b.events.some(e => e.kind === 'death' && e.unit === u.id && e.t <= t));
      if (k % 3 === 1 && alive0.length) say(t, 'defender', DC[Math.floor(k / 3) % DC.length], alive0[k % alive0.length]);
      else say(t, 'raider', RC[Math.floor(k / 3 + (k % 3)) % RC.length], breachers[k % breachers.length]);
    }
    // 5. a wounded defender (the sim's wound, kept at its time) is dragged to the back room
    const casualty = adults.find(u => hurtT.has(u.id) && !b.events.some(e => e.kind === 'death' && e.unit === u.id));
    const carrier = casualty ? adults.find(u => u !== casualty) : undefined;
    if (casualty && carrier) {
      const tc = tI + D * 0.5;
      const cp = lay.at(lay.rooms[0]);
      move(tc, carrier, cp);
      ev.push({ t: r2(tc + 0.5), kind: 'aid', unit: casualty.id, by: carrier.id, what: 'pressure' });
      say(tc + 0.8, 'defender', 'tend', carrier);
      const route = lay.path(lay.back);
      let t = tc + 4.2;
      say(t - 0.2, 'defender', 'drag', carrier);
      for (const p of route.slice(-3)) { move(t, carrier, { x: p.x - 0.07, z: p.z }); move(t + 0.1, casualty, p); t += 1.1; }
    } else {
      // a defender the sim kills in the house is attended by the next nearest
      const dv = b.events.find(e => e.kind === 'death' && e.t >= tI && e.t <= newEnd && adults.some(u => u.id === e.unit)) as Extract<BattleEvent, { kind: 'death' }> | undefined;
      if (dv) { const bodyOf = adults.find(u => u.id === dv.unit)!; const helper = adults.find(u => u !== bodyOf); if (helper) { move(dv.t + 1.2, helper, pos.get(bodyOf.id)!); ev.push({ t: r2(dv.t + 2), kind: 'aid', unit: bodyOf.id, by: helper.id, what: 'pressure' }); say(dv.t + 2.3, 'defender', 'tend', helper); } }
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
  const kept = b.events.filter(e => !mine(e) && e.kind !== 'end' && !(e.kind === 'taken' && captiveIds.has(e.unit)) && !(strip.size && (e.kind === 'move' || e.kind === 'cover') && strip.has(e.unit) && e.t > tI - 3.6) && !(e.kind === 'flee' && strip.has(e.unit) && e.t > tI - 3.6));
  // no quiet stretch in the fight: a callout whenever four and a half seconds pass without one (the crew clearing and searching, the family holding)
  if (planned) {
    // (a line by someone already dead is not a line: deadSilent will hand it on or drop it, so it does not count as one that was said, and no filler is given to the dead)
    const diedAt = new Map<string, number>();
    for (const e of [...b.events, ...ev]) if ((e.kind === 'death' || e.kind === 'taken') && !diedAt.has(e.unit)) diedAt.set(e.unit, e.t);
    const liveAt = (id: string | undefined, t: number) => !id || !(diedAt.has(id) && diedAt.get(id)! <= t);
    const said = [...kept, ...ev].filter(e => e.kind === 'say' && e.t >= tI - 3 && liveAt(e.who, e.t)).map(e => e.t).sort((x, y) => x - y);
    const crewNow = planned.insideCrew, from = tI - 3, to = newEnd - 1.5, outroAt = tI + D - 11;
    let prev = from, k = 0;
    for (const t of [...said, to]) {
      while (t - prev > 4.5) {
        prev += 3.2;
        const pick = k++ % 3;
        const RC: Ctx[] = FILL_RAIDER, DC: Ctx[] = FILL_DEFENDER;
        const liveAdults = adults.filter(u => liveAt(u.id, prev));
        if (prev > outroAt + 3) { if (pick === 1 && liveAdults.length) say(prev, 'defender', 'aftermath', liveAdults[k % liveAdults.length]); else say(prev, 'raider', 'leaving', crewNow[k % crewNow.length]); }
        else if (pick === 1 && liveAdults.length) say(prev, 'defender', DC[Math.floor(k / 3) % DC.length], liveAdults[k % liveAdults.length]);
        else say(prev, 'raider', RC[Math.floor(k / 3 + pick) % RC.length], crewNow[(k + pick) % crewNow.length]);
      }
      prev = Math.max(prev, t);
    }
  }
  const oldTail = Math.max(0, b.duration - end.t);
  const events = [...kept, ...ev, { t: r2(newEnd), kind: 'end', result: end.result } as BattleEvent].sort((a, c) => a.t - c.t);
  return { ...b, events, duration: r2(newEnd + oldTail), invasion: meta };
}
