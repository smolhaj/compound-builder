/**
 * "Fortify my ring" (docs/DECISIONS.md, "Fortress ring"): one plan for the
 * signature compound look. Like Wall my property (sim/propertyWall.ts) it
 * plans first (cost, hours, what it does) and lays out only on confirm:
 *
 *  - the whole property line in container wall, with a gap at the road gate
 *    for a gatehouse garage (sim/garage.ts), and creek bars where the creek
 *    crosses (propertyWall does the tracing);
 *  - a patrol walkway on top of every container wall run (sim/walkway.ts);
 *  - the gatehouse garage itself, across the gate gap;
 *  - up to five towers on the corners and mid-spans (sim/towers.ts; they
 *    upgrade in place like any tower);
 *  - an underground passage from the garage to the nearest house, when there
 *    is one (sim/compounds.ts).
 *
 * Whatever the line already has is kept: a stretch already held is skipped,
 * a wall that can take a deck gets one. Pure (tested).
 */
import { layRings, planRings, type RingGates, type RingPlan } from './rings';
import { MATERIALS, type MaterialId, type Stock } from './materials';
import { BLUEPRINTS, isHome, totalBill, totalHours } from './blueprints';
import { log, orderCost } from './economy';
import { isFinished, planStructure } from './construction';
import { applyForPermit, countyWorks, needsPermit, permitFee } from './paperwork';
import { PERIMETER, planRun, runBill, runHours, wallLength, type ContainerLook, type PerimeterKind, type PerimeterRun, type Pt } from './perimeter';
import { GATE_GARAGE, GARAGE_CELLS_Z, GARAGE_W, garageRotFor } from './garage';
import { canHostWalkway, layWalkway, walkOn, walkwayBill } from './walkway';
import { TOWERS, stampHighGround, type TowerKind } from './towers';
import { ownedRects } from './enclosure';
import { planPropertyWall, regionFromRects, type GateSpot, type PropertyGeometry, type WallPlan } from './propertyWall';
import { cornersOf, regionFromPolygon, ringPolygon, type Region, type RingShape } from './ringShape';
import { CELL } from '../game/buildkit/kit';
import type { Rect } from './land';
import type { GameState } from './state';

/** How many towers a ring carries: up to five (the user's description: "five observation towers"). */
export const MAX_TOWERS = 5;
/** The first tiers a ring can start with (the rest are upgrades in place from the Defense tab). */
export const RING_TOWER_KINDS: readonly TowerKind[] = ['rise_lookout', 'watchtower_wood', 'watchtower_concrete'];

/** The core compound's side: ≈ 144 m, about five acres (a 12 × 12 block of 12 m tiles). */
export const CORE_SIDE = 24;

/** Where the ring goes: a core compound round the family's buildings (the default), or the whole property line. */
export type FortressScope = 'core' | 'full';

export interface FortressOptions {
  scope: FortressScope;
  towers: number;
  towerKind: TowerKind;
  /** Plan an underground passage from the garage to the nearest house. */
  passage: boolean;
  /** The outline of the core ring (sim/ringShape.ts); the whole-property line follows the land, so a shape applies to the core only. */
  shape: RingShape;
  /** What the wall is made of (any solid wall that takes a patrol deck) and, for containers, how they are painted. */
  wall: PerimeterKind;
  look: ContainerLook;
  /** Rings in all, the outer ring included (sim/rings.ts): 1 is the plain ring; 2-4 add inner rings, each with its own wall, gate and towers. */
  rings: number;
  ringWall: PerimeterKind;
  ringGates: RingGates;
}
/** The walls a ring can be built in (each takes a patrol walkway). */
export const RING_WALLS: readonly PerimeterKind[] = ['container_wall', 'container_stack', 'stone_wall', 'concrete_wall'];
export const DEFAULT_FORTRESS: FortressOptions = { scope: 'core', towers: MAX_TOWERS, towerKind: 'watchtower_wood', passage: true, shape: 'square', wall: 'container_wall', look: 'black', rings: 1, ringWall: 'stone_wall', ringGates: 'alternate' };

export interface PlannedStructure { kind: string; x: number; z: number; rot: number }

export interface FortressPlan {
  options: FortressOptions;
  /** The land the ring encloses (the core square, or the owned rectangles). */
  rects: Rect[];
  /** The area the wall encloses, in whatever shape. */
  region: Region;
  /** The core compound is the whole home block already (a small lot): the two scopes are the same ring. */
  coreIsFull: boolean;
  wall: WallPlan;
  garage: PlannedStructure | null;
  towers: PlannedStructure[];
  /** The inner rings (sim/rings.ts), or null with one ring. */
  ringPlan: RingPlan | null;
  /** Underground passage points (garage to house), or null. */
  passage: Pt[] | null;
  /** Walkway length planned (world units) and how many wall runs get one. */
  walkwayLen: number;
  walkwayRuns: number;
  /** Why something was left out (no gate, no house yet, a site taken). */
  notes: string[];
  bill: Partial<Stock>;
  cost: number;
  own: Array<{ material: MaterialId; qty: number }>;
  permits: number;
  hours: number;
}

const GARAGE_D = GARAGE_CELLS_Z * CELL;

/** The area a ring of this shape encloses in the core compound (or in `rect`): the outline is cut flat at the gate. */
export function compoundRegion(s: GameState, geo: PropertyGeometry, shape: RingShape, gateW: number, rect: Rect = coreRect(s, geo)): Region {
  if (shape === 'square') return regionFromRects([rect]);
  return regionFromPolygon(ringPolygon(shape, rect, { drive: geo.drive, roadGate: geo.roadGate, gateW, seed: s.seed, ground: geo.ground }));
}

/**
 * The core compound: a square of `CORE_SIDE` centered on the family's buildings (the camp, else the middle of the staked buildings, else the middle of the
 * home block), slid to stay inside the home block. A small lot is all core.
 */
export function coreRect(s: GameState, geo: PropertyGeometry = {}): Rect {
  const h = s.site.home;
  const live = s.structures.filter(st => !st.unplaced && !st.kind.startsWith('bunker_') && st.x >= h.x0 && st.x <= h.x1 && st.z >= h.z0 && st.z <= h.z1);
  const c: Pt = geo.center ?? (live.length ? [live.reduce((a, st) => a + st.x, 0) / live.length, live.reduce((a, st) => a + st.z, 0) / live.length] : [(h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2]);
  const w = Math.min(CORE_SIDE, h.x1 - h.x0), d = Math.min(CORE_SIDE, h.z1 - h.z0);
  const x0 = Math.min(h.x1 - w, Math.max(h.x0, c[0] - w / 2)), z0 = Math.min(h.z1 - d, Math.max(h.z0, c[1] - d / 2));
  return { x0, z0, x1: x0 + w, z1: z0 + d };
}

/** The tier-1 and up tower's half footprint, plus half a container wall and a gap: how far inside the wall its center stands. */
const towerInset = (kind: TowerKind) => TOWERS[kind].cells * CELL / 2 + 0.2 + 0.06;

/** Is a tower or garage footprint at (x, z) clear of what is already standing or staked (surface structures)? */
function clearOf(s: GameState, x: number, z: number, half: number): boolean {
  return s.structures.every(o => o.unplaced || o.kind.startsWith('bunker_') || Math.abs(o.x - x) > half + 0.8 || Math.abs(o.z - z) > half + 0.8);
}

/** Is the whole footprint of a tower at (x, z) inside the region (its four corners), with a little room? */
const footprintInside = (region: Pick<Region, 'contains'>, x: number, z: number, half: number, pad = 0.12): boolean =>
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([sx, sz]) => region.contains(x + sx * (half + pad), z + sz * (half + pad)));

/** Candidate tower sites on a ring of any shape: the real corners, and a point every few units of wall, each pushed in until the footprint is inside. */
function polygonCandidates(loop: readonly Pt[], region: Region, kind: TowerKind): Array<{ line: Pt; site: Pt }> {
  const half = TOWERS[kind].cells * CELL / 2, inset = towerInset(kind), cand: Array<{ line: Pt; site: Pt }> = [];
  const push = (line: Pt, inward: Pt, scale: number) => {
    for (let k = 0; k < 8; k++) {
      const d = inset * scale + k * 0.25, x = line[0] + inward[0] * d, z = line[1] + inward[1] * d;
      if (footprintInside(region, x, z, half)) { cand.push({ line, site: [x, z] }); return; }
    }
  };
  for (const c of cornersOf(loop, region)) push(c.at, c.inward, 1.2);
  // along the wall: every ~6 units of its length, the inward normal of the stretch there
  const n = loop.length;
  let carry = 3;
  for (let i = 0; i < n; i++) {
    const a = loop[i], b = loop[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-6) continue;
    const dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
    for (let d = carry; d < l; d += 6) {
      const q: Pt = [a[0] + dx * d, a[1] + dz * d];
      const nrm: Pt = region.contains(q[0] - dz * 0.1, q[1] + dx * 0.1) ? [-dz, dx] : [dz, -dx];
      push(q, nrm, 1);
      carry = d + 6 - l;
    }
    if (l <= carry) carry -= l;
  }
  return cand;
}

/** Sites for `n` towers just inside the wall: corners first, then the middle of the longest sides, spread out and clear of the gate. */
export function towerSites(s: GameState, kind: TowerKind, n: number, gate: GateSpot | null, taken: ReadonlyArray<{ x: number; z: number }> = [], area: readonly Rect[] | Region = ownedRects(s)): Pt[] {
  const region: Region = 'loops' in area ? area : regionFromRects(area);
  const loops = region.loops.slice().sort((a, b) => b.length - a.length);
  if (!loops.length || n <= 0) return [];
  const loop = loops[0], inset = towerInset(kind);
  const owned = region.contains;
  const rects = region.rects;
  const cand: Array<{ line: Pt; site: Pt }> = [];
  if (!rects) cand.push(...polygonCandidates(loop, region, kind));
  const m = loop.length;
  for (let i = 0; rects && i < m; i++) {
    const a = loop[i], b = loop[(i + 1) % m], pa = loop[(i + m - 1) % m];
    // a corner: step diagonally inside
    const dxs = [Math.sign(b[0] - a[0]), Math.sign(pa[0] - a[0])].find(v => v !== 0) ?? 0, dzs = [Math.sign(b[1] - a[1]), Math.sign(pa[1] - a[1])].find(v => v !== 0) ?? 0;
    for (const [sx, sz] of [[dxs, dzs], [-dxs, dzs], [dxs, -dzs], [-dxs, -dzs]]) {
      const x = a[0] + sx * inset, z = a[1] + sz * inset;
      if (owned(x, z) && owned(a[0] + sx * 0.05, a[1] + sz * 0.05)) { cand.push({ line: a, site: [x, z] }); break; }
    }
    // the middle of a long side: step straight in
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len >= 8) {
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
      const n1: Pt = owned(mx - dz * 0.1, mz + dx * 0.1) ? [-dz, dx] : [dz, -dx];
      cand.push({ line: [mx, mz], site: [mx + n1[0] * inset, mz + n1[1] * inset] });
    }
  }
  const half = TOWERS[kind].cells * CELL / 2;
  const ok = cand.filter(c => clearOf(s, c.site[0], c.site[1], half)
    && (!gate || Math.hypot(c.line[0] - gate.x, c.line[1] - gate.z) > GARAGE_W / 2 + 1.0)
    && taken.every(t => Math.abs(t.x - c.site[0]) > half + 0.8 || Math.abs(t.z - c.site[1]) > half + 0.8));
  // farthest-point picks: start far from the gate (the garage already watches it), then keep spreading
  const out: Pt[] = [];
  const ref: Pt[] = gate ? [[gate.x, gate.z]] : [];
  const pool = [...ok];
  while (out.length < n && pool.length) {
    let best = 0, bd = -1;
    pool.forEach((c, i) => {
      const d = [...ref, ...out].reduce((a, p) => Math.min(a, Math.hypot(p[0] - c.line[0], p[1] - c.line[1])), Infinity);
      const dd = d === Infinity ? 1 : d;
      if (dd > bd) { bd = dd; best = i; }
    });
    const [c] = pool.splice(best, 1);
    out.push(c.site);
    ref.push(c.line);
  }
  return out;
}

const addBill = (into: Partial<Stock>, bill: Partial<Stock>): void => { for (const [k, q] of Object.entries(bill) as Array<[MaterialId, number]>) into[k] = (into[k] ?? 0) + q; };

/** Plan the ring: nothing is laid out yet. */
export function planFortress(s: GameState, geo: PropertyGeometry = {}, opts: Partial<FortressOptions> = {}): FortressPlan {
  const options: FortressOptions = { ...DEFAULT_FORTRESS, ...opts, towers: Math.max(0, Math.min(MAX_TOWERS, opts.towers ?? DEFAULT_FORTRESS.towers)) };
  const notes: string[] = [];
  const home = s.site.home, core = coreRect(s, geo);
  const coreIsFull = ownedRects(s).length === 1 && (core.x1 - core.x0) * (core.z1 - core.z0) >= 0.9 * (home.x1 - home.x0) * (home.z1 - home.z0);
  const rects: Rect[] = options.scope === 'core' && !coreIsFull ? [core] : ownedRects(s);
  // a shaped ring is cut inside the core rectangle; the whole property line follows the land, so it keeps its own outline
  const shaped = options.shape !== 'square' && (options.scope === 'core' || coreIsFull);
  const region: Region = shaped ? compoundRegion(s, geo, options.shape, GARAGE_W, coreIsFull && options.scope === 'full' ? home : core) : regionFromRects(rects);
  if (options.shape !== 'square' && !shaped) notes.push('The whole-property wall follows the line of the land: a round or octagonal ring is for the core compound.');
  const wall = planPropertyWall(s, RING_WALLS.includes(options.wall) ? options.wall : 'container_wall', geo, { gateW: GARAGE_W, garage: true, region, look: options.look });

  // the garage: in the gate gap, door side facing in; it must have the ground to itself
  let garage: PlannedStructure | null = null;
  const gs = wall.gateSpot;
  if (gs?.noGarage) notes.push('The road comes in at a bend in the wall: an ordinary gate, with no room for a gate garage beside it.');
  if (gs && !gs.noGarage) {
    const x = gs.x + gs.inx * (GARAGE_D / 2 - 0.04), z = gs.z + gs.inz * (GARAGE_D / 2 - 0.04);
    const half = Math.max(GARAGE_W, GARAGE_D) / 2;
    if (clearOf(s, x, z, half - 0.5)) garage = { kind: GATE_GARAGE, x, z, rot: garageRotFor([gs.inx, gs.inz]) };
    else notes.push('Something already stands where the gate garage would go: the gap is left as an ordinary gate.');
  } else if (!gs) notes.push(wall.gateNote ? `No gate garage: ${wall.gateNote}. Add a gate to the wall or stake the garage from the Build menu.` : 'No gate garage planned (no road side on the line).');
  if (!garage && gs) { wall.runs.forEach(r => r.gates.forEach(g => { delete g.garage; })); }

  const towers = towerSites(s, options.towerKind, options.towers, gs, garage ? [garage] : [], region).map((p): PlannedStructure => ({ kind: options.towerKind, x: p[0], z: p[1], rot: 0 }));
  if (towers.length < options.towers) notes.push(`${towers.length} of ${options.towers} tower sites found clear of buildings.`);

  // the underground passage from the garage to the nearest house (staked or built)
  let passage: Pt[] | null = null;
  if (options.passage && garage) {
    const homes = s.structures.filter(st => isHome(st.kind) && !st.unplaced);
    const near = homes.sort((a, b) => Math.hypot(a.x - garage!.x, a.z - garage!.z) - Math.hypot(b.x - garage!.x, b.z - garage!.z))[0];
    if (near) passage = [[garage.x, garage.z], [near.x, near.z]];
    else notes.push('No house yet: the passage from the garage can be added once there is one (Perimeter, Underground passage).');
  }

  // walkways: on every container run planned here, and on a wall already on the place that can take one
  const planned = wall.runs.filter(r => canHostWalkway(r.kind));
  const existing = s.perimeter.filter(r => canHostWalkway(r.kind) && !walkOn(s, r.id) && !r.replaces);
  const walkLen = planned.reduce((a, r) => a + wallLength(r), 0) + existing.reduce((a, r) => a + wallLength(r), 0);

  // the inner rings: stepped in from the outer wall, following the contour on a slope, each with its own gate and towers
  let ringPlan: RingPlan | null = null;
  if (options.rings > 1 && wall.runs.length) {
    const outerRun = wall.runs.filter(r => r.kind !== 'creek_bars').sort((a, b) => b.pts.length - a.pts.length)[0];
    const outerPoly = outerRun ? outerRun.pts.slice(0, -1) : region.loops[0];
    ringPlan = planRings(s, outerPoly.length >= 3 ? outerPoly : region.loops[0], gs ? [gs.x, gs.z] : null, geo, { count: options.rings, wall: options.ringWall, gates: options.ringGates, towers: Math.min(3, options.towers), towerKind: options.towerKind });
    notes.push(...ringPlan.notes);
  }

  const bill: Partial<Stock> = {};
  addBill(bill, wall.bill);
  if (ringPlan) addBill(bill, ringPlan.bill);
  addBill(bill, walkwayBill(walkLen));
  let hours = wall.hours + runHours('wall_walk', walkLen) + (ringPlan?.hours ?? 0);
  let permits = ringPlan?.permits ?? 0;
  const addStructure = (st: PlannedStructure) => {
    addBill(bill, totalBill(BLUEPRINTS[st.kind]));
    hours += totalHours(BLUEPRINTS[st.kind]);
    if (needsPermit(st.kind) && s.paper.permits && countyWorks(s)) permits += permitFee(s, st.kind);
  };
  if (garage) addStructure(garage);
  towers.forEach(addStructure);
  if (passage) {
    const len = Math.hypot(passage[1][0] - passage[0][0], passage[1][1] - passage[0][1]);
    addBill(bill, runBill('underground_passage', len));
    hours += runHours('underground_passage', len);
  }
  const buy = (Object.entries(bill) as Array<[MaterialId, number]>).filter(([m]) => MATERIALS[m].price !== null).map(([material, qty]) => ({ material, qty }));
  const own = (Object.entries(bill) as Array<[MaterialId, number]>).filter(([m]) => MATERIALS[m].price === null).map(([material, qty]) => ({ material, qty }));
  return {
    options, rects, region, coreIsFull, wall, ringPlan, garage, towers, passage, walkwayLen: walkLen, walkwayRuns: planned.length + existing.length, notes,
    bill, cost: orderCost(buy) + permits, own, permits, hours: Math.round(hours),
  };
}

/** Lay the plan out: walls, decks, the garage, the towers and the passage all go on the family's list. Returns what was laid. */
export function layFortress(s: GameState, plan: FortressPlan): { runs: number; structures: number } {
  const made: PerimeterRun[] = plan.wall.runs.map(r => { const run = planRun(s, r.kind, r.pts.map(p => [p[0], p[1]] as Pt), r.gates.map(g => ({ ...g })), 0, true); if (r.look) run.look = r.look; return run; });
  // a deck on every container wall (new and old) that does not have one
  for (const r of s.perimeter) if (canHostWalkway(r.kind) && !walkOn(s, r.id) && !r.replaces && !PERIMETER[r.kind].wallTop) layWalkway(s, r, true);
  let structures = 0;
  for (const st of [...(plan.garage ? [plan.garage] : []), ...plan.towers]) {
    const placed = planStructure(s, st.kind, st.x, st.z, st.rot);
    stampHighGround(placed);
    applyForPermit(s, placed);
    structures++;
  }
  let runs = made.length;
  if (plan.ringPlan) { const r = layRings(s, plan.ringPlan); runs += r.runs; structures += r.structures; }
  if (plan.passage) { planRun(s, 'underground_passage', plan.passage.map(p => [p[0], p[1]] as Pt), [], 0, true); runs++; }
  log(s, `Laid out the fortress ring: ${plan.wall.wallM} m of ${PERIMETER[plan.wall.kind].name.toLowerCase()}${plan.walkwayLen > 0 ? ' with a patrol walkway on top' : ''}${plan.garage ? ', a gatehouse garage at the gate' : ''}${plan.towers.length ? `, ${plan.towers.length} tower${plan.towers.length > 1 ? 's' : ''}` : ''}${plan.passage ? ' and an underground passage to the house' : ''}.`);
  return { runs, structures };
}

/** What the ring has now, for the guidance card and the Defense tab. */
export function ringStatus(s: GameState): { towers: number; walkway: boolean; garage: boolean; towerGoal: number } {
  return {
    towers: s.structures.filter(st => st.kind in TOWERS && isFinished(st)).length,
    walkway: s.perimeter.some(r => PERIMETER[r.kind].wallTop && r.finishedAt !== null),
    garage: s.structures.some(st => st.kind === GATE_GARAGE && isFinished(st)),
    towerGoal: MAX_TOWERS,
  };
}
