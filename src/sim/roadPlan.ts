/**
 * The way in follows the land (docs/DECISIONS.md, "Roads follow the land").
 * From the lot's ground, its region and a seed this derives the whole road:
 * where it leaves the county road, how it winds, where it switchbacks, what
 * it crosses the creek on and whether a spur has to be bored through. Nothing
 * is saved: the same ground and seed give the same road, so the quote, the
 * winter closure, the raid lanes and the world's mesh all read one plan.
 *
 * How it is found:
 *  1. A* over a 1-unit (6 m) grid of the owned land whose *state* is the cell
 *     and the heading, so a turn is bounded (about 13-20 m radius at the
 *     tightest: a pickup and trailer cannot do better). A move costs its
 *     length times: the *ground's* slope along it against the style's design
 *     and maximum grade (the road is cut into the slope and the profile held
 *     to the grade afterwards, so a switchback's turn may cross the steepest
 *     line of the slope, at a price), the cross-slope (cut and fill), rock,
 *     timber, a seeded meander where the ground does not care (a winding
 *     country winds), and the creek, which is only crossed square, at the
 *     price of the structure the region builds there. The gate is the habitual
 *     entrance first, then anywhere on the frontage.
 *  2. A short straight bore under a spur only if nothing else reaches the yard
 *     and the country holds one (portals cut into the hillside, rock over the
 *     arch between): a bore is the dearest thing in the table, so it is the
 *     answer to a spur, never a shortcut.
 *  3. Then the engineer's road (steeper ground, steeper cross-slope), then
 *     anything, and if nothing reaches the yard a zigzag blasted across the
 *     face, priced as what it is.
 *  4. The grid path is smoothed (Chaikin), resampled every 0.5 unit and given
 *     a vertical profile (the grade held, a landing on each hairpin, a level
 *     deck over a bridge, the slab level at a ford, the bank level over a
 *     culvert) and superelevation; then read for structures (culverts, fords,
 *     low-water slabs, bridges, bores, a cattle guard, a pass), retaining
 *     walls, guardrails, hairpins, earthwork and the price, all from the one
 *     table in sim/roadStyle.ts.
 * Pure (tested): no three.js.
 */
import type { RegionId } from './regions';
import type { Rect } from './land';
import { mulberry32 } from './rng';
import { M_TO_FT, ROAD_DAYS, ROAD_PRICE, ROAD_STYLE, UNIT_M, type RoadStyle } from './roadStyle';
import { BED, RoadBed } from './roadBed';

export type Pt = [number, number];

export interface RoadGround {
  /** Natural ground height at (x, z). */
  h(x: number, z: number): number;
  /** Height and timber (0-1) in one call, when the ground can give both at once (the search reads both at every cell). */
  sample?: (x: number, z: number) => { h: number; forest: number };
  creek?: { zAt(x: number): number; waterY(x: number): number; halfWidth: number } | null;
  /** Still water level (a lake): never driven through. */
  lakeY?: number | null;
  /** Bare rock 0-1 (blasting) and timber 0-1 (clearing); optional. */
  rock?: (x: number, z: number) => number;
  cover?: (x: number, z: number) => number;
}

export interface RoadInput {
  region: RegionId;
  seed: number;
  ground: RoadGround;
  /** The land the road must stay on. */
  rect: Rect;
  /** The gate is on the property line x = `x`, anywhere in [zMin, zMax]; `band` is where the entrance is by habit (a field gate, the easement), tried first. */
  frontage: { x: number; zMin: number; zMax: number; band?: [number, number] };
  /** County road centre x at z, and half its width. */
  county: (z: number) => number;
  roadHalf: number;
  /** Where the road ends (the stockpile yard beside the camp). */
  yard: Pt;
}

export type StructureKind = 'culvert' | 'arch_culvert' | 'ford' | 'low_water' | 'bridge1' | 'bridge' | 'tunnel' | 'cattle_guard' | 'pass';

export interface RoadStructure {
  kind: StructureKind;
  /** Distance along the road, units, from the county road. */
  s0: number; s1: number;
  /** Centre of it. */
  x: number; z: number;
  /** Heading of the road there (radians, 0 = +z as in game/region/access.ts pointAt). */
  rot: number;
  /** Channel / span / bore length, m. */
  lengthM: number;
  usd: number;
  days: number;
  /** One vehicle at a time through it: a choke. */
  choke: boolean;
  /** A bridge can be dropped (sim/fortress-style): droppable once the perimeter work lands. */
  droppable: boolean;
}

export interface RoadWall { side: 'L' | 'R'; kind: 'cut' | 'fill'; s0: number; s1: number; heightU: number }
export interface RoadSpan { side: 'L' | 'R'; s0: number; s1: number }
/** A station: the road's height `y`, and `bank` the superelevation (rise per unit across, left of the heading positive: the outside of a curve is higher). */
export interface RoadPt { x: number; z: number; y: number; s: number; bank: number }
/** A hairpin: where it turns, and which side is the outside of the bend (`out`: the road turns away from it). */
export interface Hairpin { s: number; x: number; z: number; turnDeg: number; out: 'L' | 'R' }

export interface RoadPlan {
  region: RegionId;
  style: RoadStyle['noun'];
  /** The centre line from the county road's edge to the yard, a station every 0.5 unit. */
  pts: RoadPt[];
  /** Index in `pts` of the gate on the property line. */
  gateAt: number;
  gate: { x: number; z: number; rot: number };
  yard: Pt;
  structures: RoadStructure[];
  walls: RoadWall[];
  rails: RoadSpan[];
  hairpins: Hairpin[];
  /** Total length from the county road, units / m / ft; the straight distance for comparison, m. */
  lengthU: number; lengthM: number; lengthFt: number; straightM: number;
  /** Steepest 60 m stretch, the average and the climb (m). */
  maxGradePct: number; avgGradePct: number; riseM: number;
  /** Cubic metres of cut and fill moved. */
  earthM3: number;
  /** Which phase found it: 1 strict, 2 with a bore, 3 the engineer's road, 4 flagged straight. */
  phase: 1 | 2 | 3 | 4;
  engineer: boolean;
  /** Minutes to drive it in a pickup (curves, grades, one-lane structures slow it), and the same on a straight level 35 km/h road. */
  driveMin: number; straightMin: number;
  usd: number;
  /** Where the cost comes from, for the card. */
  lines: Array<{ label: string; usd: number }>;
  days: number;
  signature: string;
}

// ── helpers ──

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sst = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Seeded value noise 0-1, smooth, periodic every 64 lattice cells. */
function valueNoise(seed: number): (x: number, z: number) => number {
  const r = mulberry32(seed * 2246822519 + 3266489917), N = 64, tab = new Float32Array(N * N);
  for (let i = 0; i < tab.length; i++) tab[i] = r();
  return (x, z) => {
    const fx = ((x % N) + N) % N, fz = ((z % N) + N) % N, i = Math.floor(fx), j = Math.floor(fz), u = sst(0, 1, fx - i), v = sst(0, 1, fz - j);
    const a = tab[j * N + i], b = tab[j * N + (i + 1) % N], c = tab[((j + 1) % N) * N + i], d = tab[((j + 1) % N) * N + (i + 1) % N];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
}

/** 16 headings (dx, dz) in order of angle: the 8 compass moves and the 8 knight moves between them. */
const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [2, 1], [1, 1], [1, 2], [0, 1], [-1, 2], [-1, 1], [-2, 1], [-1, 0], [-2, -1], [-1, -1], [-1, -2], [0, -1], [1, -2], [1, -1], [2, -1]];
const ANG = DIRS.map(d => Math.atan2(d[1], d[0]));
const angDiff = (a: number, b: number) => { const d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
const DIRLEN = DIRS.map(d => Math.hypot(d[0], d[1]));
/** Compass-only indexes (bore edges run only along these). */
const COMPASS = [0, 2, 4, 6, 8, 10, 12, 14];

// ── crossing choice (one place: the price and the picture read it) ──

export function crossingFor(style: RoadStyle, widthM: number): StructureKind {
  if (widthM <= style.culvertMaxM) return widthM > 3.2 ? 'arch_culvert' : 'culvert';
  if (style.crossing === 'low_water' && widthM <= style.lowWaterMaxM) return widthM < 5 ? 'ford' : 'low_water';
  return widthM <= 12 ? 'bridge1' : 'bridge';
}

export function structurePrice(kind: StructureKind, lengthM: number): { usd: number; days: number } {
  const ft = lengthM * M_TO_FT, P = ROAD_PRICE;
  switch (kind) {
    case 'culvert': return { usd: P.culvert, days: ROAD_DAYS.culvert };
    case 'arch_culvert': return { usd: P.archCulvert, days: ROAD_DAYS.archCulvert };
    case 'ford': return { usd: P.ford, days: ROAD_DAYS.ford };
    case 'low_water': return { usd: P.lowWaterBase + P.lowWaterPerFt * ft, days: ROAD_DAYS.low_water };
    case 'bridge1': return { usd: P.bridgeBase + P.bridgePerFt * ft, days: ROAD_DAYS.bridge1 };
    case 'bridge': return { usd: P.bridgeBigBase + P.bridgeBigPerFt * ft, days: ROAD_DAYS.bridge };
    case 'tunnel': return { usd: P.tunnelPortal + P.tunnelPerFt * ft, days: ROAD_DAYS.tunnel };
    case 'cattle_guard': return { usd: P.cattleGuard, days: ROAD_DAYS.cattle_guard };
    case 'pass': return { usd: 0, days: 0 };
  }
}
/** What a length unit of plain road costs, so structure prices can be traded against detours inside the search. */
const USD_PER_UNIT = ROAD_PRICE.perFt * M_TO_FT * UNIT_M;

// ── the search ──

interface Search {
  ok: boolean;
  /** Cells of the path from the gate to the yard. */
  path: Array<{ x: number; z: number }>;
}

interface Phase { limitGrade: number; limitSide: number; bore: boolean; band?: boolean }

function search(style: RoadStyle, ph: Phase, grid: GridData): Search {
  // which cells of the property line are open for this try (the habitual entrance, or the whole frontage)
  const active = ph.band ? grid.gateBand : grid.gateOk;
  for (let j = 0; j < grid.nz; j++) { const k = j * grid.nx + grid.nx - 1; grid.valid[k] = !grid.wet[k] && active[j] ? 1 : 0; }
  const { nx, nz, gx0, gz0, valid, target } = grid;
  const N = nx * nz, NS = N * 17;
  const gscore = new Float64Array(NS).fill(Infinity), parent = new Int32Array(NS).fill(-1);
  const heap: Array<[number, number]> = [];
  const push = (f: number, s: number) => { heap.push([f, s]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = (): [number, number] => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const W_A = 1.8, gx1 = grid.gateX, maxTurn = style.grid ? Math.PI / 2 + 0.05 : style.hairpinM <= 12 ? 0.7 : 0.5;   // 40 degrees a move in the hill country (a hairpin of about 10-15 m radius), 29 elsewhere (about 20 m)
  const dirList = style.grid ? [0, 4, 8, 12] : DIRS.map((_, i) => i);
  const turnK = style.grid ? 4 : 5 - 4 * style.curviness;
  const start = target.z * nx + target.x;
  // the gate cells' extent: the straight distance to them is a lower bound on what is left to pay
  let gLo = nz, gHi = -1;
  for (let j = 0; j < nz; j++) if (active[j]) { gLo = Math.min(gLo, j); gHi = Math.max(gHi, j); }
  const gh = (cx: number, cz: number) => Math.hypot(Math.max(0, gx1 - (cx + gx0)), Math.max(0, gLo - cz, cz - gHi));
  gscore[start * 17 + 16] = 0;
  push(W_A * gh(target.x, target.z), start * 17 + 16);
  const edgeMemo = new Float32Array(N * 16).fill(-1);
  const boreMemo = new Map<number, Array<{ dx: number; dz: number; cost: number }>>();
  const edge = (cx: number, cz: number, d: number): number => {
    const k = (cz * nx + cx) * 16 + d, m = edgeMemo[k];
    if (m !== -1) return m;
    const v = moveCost(grid, style, ph, cx, cz, d);
    edgeMemo[k] = v;
    return v;
  };
  while (heap.length) {
    const [, st] = pop();
    const node = (st / 17) | 0, din = st - node * 17, cx = node % nx, cz = (node - cx) / nx;
    const g = gscore[st];
    // the goal: the gate column inside the frontage, heading east (toward the county road)
    if (cx + gx0 === gx1 && active[cz] && (din === 16 || angDiff(ANG[din], 0) <= maxTurn + 1e-6)) {
      // the search ran yard -> gate, so the parent chain from the gate is already gate -> yard
      const out: Search['path'] = [];
      let q = st;
      while (q >= 0) { const nd = (q / 17) | 0, x = nd % nx; out.push({ x: x + gx0, z: (nd - x) / nx + gz0 }); q = parent[q]; }
      return { ok: true, path: out };
    }
    if (g > gscore[st] + 1e-9) continue;

    const relax = (tx: number, tz: number, dirOut: number, c: number) => {
      if (!isFinite(c) || tx < 0 || tz < 0 || tx >= nx || tz >= nz || !valid[tz * nx + tx]) return;
      const turn = din === 16 ? 0 : angDiff(ANG[din], ANG[dirOut]);
      if (turn > maxTurn + 1e-6) return;
      const pen = din === 16 ? 0 : turnK * (turn / maxTurn) ** 2;
      const ns = (tz * nx + tx) * 17 + dirOut, ng = g + c + pen;
      if (ng < gscore[ns]) { gscore[ns] = ng; parent[ns] = st; push(ng + W_A * gh(tx, tz), ns); }
    };
    for (const d of dirList) {
      if (din !== 16 && angDiff(ANG[din], ANG[d]) > maxTurn + 1e-6) continue;   // (the turn limit first: only the moves that can be taken are priced)
      relax(cx + DIRS[d][0], cz + DIRS[d][1], d, edge(cx, cz, d));
    }
    // the creek: square across it (north / south), at the price of whatever the region builds there
    if (grid.creek) {
      for (const sg of [1, -1]) {
        const d = sg > 0 ? 4 : 12, h = hopFrom(grid, style, ph, cx, cz, sg);
        if (h) relax(cx, cz + sg * h.k, d, h.cost);
      }
    }
    if (ph.bore) {
      let list = boreMemo.get(node);
      if (!list) { list = boreEdges(grid, style, cx, cz); boreMemo.set(node, list); }
      for (const b of list) {
        const d = COMPASS.find(i => DIRS[i][0] === Math.sign(b.dx) && DIRS[i][1] === Math.sign(b.dz))!;
        relax(cx + b.dx, cz + b.dz, d, b.cost);
      }
    }
  }
  return { ok: false, path: [] };
}

interface GridData {
  nx: number; nz: number; gx0: number; gz0: number;
  H: Float32Array; valid: Uint8Array; wet: Uint8Array; rockC: Float32Array; coverC: Float32Array; wander: Float32Array;
  target: { x: number; z: number };
  gateX: number; gateOk: Uint8Array; gateBand: Uint8Array;
  creek: RoadGround['creek'] | null;
  hAt: (x: number, z: number) => number;
  /** Cost (length units) of the structure at the creek here and its width, m. */
  crossUnits: number; crossKind: StructureKind;
  crossWidthM: number;
  bounds: { x0: number; z0: number; x1: number; z1: number };
  /** A seeded meander across the line from the entrance to the yard: where the ground does not care, a road in a winding country still bends. */
  guide: { ax: number; az: number; bx: number; bz: number; len: number; amp: number; k: number; ph: number } | null;
}

function buildGrid(inp: RoadInput, style: RoadStyle): GridData {
  const { rect, frontage, ground, yard } = inp;
  const gx1 = Math.floor(frontage.x + 1e-6);
  const gx0 = Math.ceil(rect.x0) + 1, gz0 = Math.ceil(rect.z0) + 1;
  const gzMax = Math.floor(rect.z1) - 1;
  const nx = gx1 - gx0 + 1, nz = gzMax - gz0 + 1;
  const N = nx * nz, H = new Float32Array(N), valid = new Uint8Array(N), wet = new Uint8Array(N), rockC = new Float32Array(N), coverC = new Float32Array(N), wander = new Float32Array(N);
  const creek = ground.creek ?? null, noise = valueNoise(inp.seed);
  const gateOk = new Uint8Array(nz), gateBand = new Uint8Array(nz);
  const band = frontage.band ?? [frontage.zMin, frontage.zMax];
  for (let j = 0; j < nz; j++) {
    const z = gz0 + j;
    gateOk[j] = z >= Math.ceil(frontage.zMin) && z <= Math.floor(frontage.zMax) ? 1 : 0;
    gateBand[j] = gateOk[j] && z >= Math.ceil(band[0]) && z <= Math.floor(band[1]) ? 1 : 0;
  }
  if (!gateBand.some(v => v)) gateBand.set(gateOk);
  const hw = creek ? creek.halfWidth + 0.35 : 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = gx0 + i, z = gz0 + j, k = j * nx + i;
    const smp = ground.sample ? ground.sample(x, z) : null;
    H[k] = smp ? smp.h : ground.h(x, z);
    const lake = ground.lakeY != null && H[k] < ground.lakeY + 0.02;
    const isWet = (creek && Math.abs(z - creek.zAt(x)) < hw) || lake ? 1 : 0;
    wet[k] = isWet;
    // the gate column is only open at the gate; the others keep one unit inside the line
    valid[k] = isWet || (i === nx - 1 && !gateOk[j]) ? 0 : 1;
    rockC[k] = ground.rock ? ground.rock(x, z) : 0;
    coverC[k] = smp ? smp.forest : ground.cover ? ground.cover(x, z) : 0;
    wander[k] = noise(x * 0.07, z * 0.07) + 0.5 * noise(x * 0.19 + 17, z * 0.19 - 5);
  }
  const hAt = (x: number, z: number) => {
    const fx = clamp(x - gx0, 0, nx - 1.0001), fz = clamp(z - gz0, 0, nz - 1.0001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return H[j * nx + i] * (1 - u) * (1 - v) + H[j * nx + i + 1] * u * (1 - v) + H[(j + 1) * nx + i] * (1 - u) * v + H[(j + 1) * nx + i + 1] * u * v;
  };
  // the yard: the nearest valid dry cell
  let best = Infinity, tx = 0, tz = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx - 1; i++) {
    if (!valid[j * nx + i]) continue;
    const d = Math.hypot(gx0 + i - yard[0], gz0 + j - yard[1]);
    if (d < best) { best = d; tx = i; tz = j; }
  }
  // what the creek here is crossed on
  const widthM = creek ? creek.halfWidth * 2 * UNIT_M : 0;
  const crossKind = crossingFor(style, widthM);
  const crossUnits = creek ? structurePrice(crossKind, widthM).usd / USD_PER_UNIT : 0;
  const gm = (Math.max(...[...gateBand].map((v, j) => (v ? j : -1))) + Math.min(...[...gateBand].map((v, j) => (v ? j : 1e9)))) / 2 + gz0;
  const r2 = mulberry32(inp.seed * 7177 + 5);
  const len = Math.hypot(yard[0] - gx1, yard[1] - gm);
  const guide = style.curviness > 0 && !style.grid && len > 8
    ? { ax: gx1, az: gm, bx: yard[0], bz: yard[1], len, amp: 1.0 + 2.5 * style.curviness, k: Math.max(0.75, Math.round(len / (20 + 10 * (1 - style.curviness)) * 2) / 2) + (r2() < 0.5 ? 0 : 0.25), ph: r2() * 0.8 }
    : null;
  return { nx, nz, gx0, gz0, H, valid, wet, rockC, coverC, wander, target: { x: tx, z: tz }, gateX: gx1, gateOk, gateBand, creek, hAt, crossUnits, crossKind, crossWidthM: widthM, bounds: { x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: rect.z1 }, guide };
}

/** Penalty (in extra lengths) for a grade. */
function gradePen(style: RoadStyle, ph: Phase, g: number): number {
  if (g <= style.gradeDesign) return 0;
  if (g > ph.limitGrade + 1e-9) return Infinity;
  if (g <= style.gradeMax) { const x = (g - style.gradeDesign) / (style.gradeMax - style.gradeDesign); return 1.5 * x + 3 * x * x; }
  return 4.5 + 10 * (g - style.gradeMax) / Math.max(1e-6, style.gradeHard - style.gradeMax);
}

function moveCost(grid: GridData, style: RoadStyle, ph: Phase, cx: number, cz: number, d: number): number {
  const { nx, nz, gx0, gz0, H, valid, wet } = grid;
  const dx = DIRS[d][0], dz = DIRS[d][1], tx = cx + dx, tz = cz + dz;
  if (tx < 0 || tz < 0 || tx >= nx || tz >= nz || !valid[tz * nx + tx] || !valid[cz * nx + cx]) return Infinity;
  const len = DIRLEN[d], a = H[cz * nx + cx], b = H[tz * nx + tx];
  const g = Math.abs(b - a) / len, gp = gradePen(style, ph, g);
  if (!isFinite(gp)) return Infinity;
  // the creek and the lake: nothing is driven through
  const mx = gx0 + cx + dx / 2, mz = gz0 + cz + dz / 2;
  for (const t of [0.25, 0.5, 0.75]) {
    const k0 = clamp(Math.round(gz0 + cz + dz * t - gz0), 0, nz - 1) * nx + clamp(Math.round(cx + dx * t), 0, nx - 1);
    if (wet[k0]) return Infinity;
  }
  // cross-slope at the middle of the move
  const nxv = -dz / len, nzv = dx / len, hs = 0.6;
  const s = Math.abs(grid.hAt(mx + nxv * hs, mz + nzv * hs) - grid.hAt(mx - nxv * hs, mz - nzv * hs)) / (2 * hs);
  if (s > ph.limitSide) return Infinity;
  const sp = s < 0.12 ? 0 : 6 * (s - 0.12) + (s > 0.6 ? 2 * (s - 0.6) : 0);
  const k = clamp(Math.round(mz - gz0), 0, nz - 1) * nx + clamp(Math.round(mx - gx0), 0, nx - 1);
  let wander = style.curviness * 0.4 * grid.wander[k];
  if (grid.guide) {
    const g = grid.guide, ux = (g.bx - g.ax) / g.len, uz = (g.bz - g.az) / g.len;
    const t = clamp(((mx - g.ax) * ux + (mz - g.az) * uz) / g.len, 0, 1), e = -(mx - g.ax) * uz + (mz - g.az) * ux;
    // the meander is the guide's lateral offset: a sine over the run, faded to nothing at both ends
    const want = g.amp * Math.sin(Math.PI * t) * Math.sin(2 * Math.PI * g.k * t + g.ph * Math.PI);
    wander += style.curviness * (1.5 - 0.5 * style.follows) * Math.min(1.2, Math.abs(e - want) / 1.6);
  }
  // a hollow road keeps to the creek's side of the valley
  if (grid.creek && style.follows > 0 && grid.guide) {
    // ... on a bench that weaves a little nearer and further (a low-water crossing now and then)
    const dz = Math.abs(mz - grid.creek.zAt(mx)), off = 3.8 + 1.5 * Math.sin(mx * 0.33 + 1.7 * grid.guide!.ph);
    wander += style.follows * 0.9 * Math.min(1.5, Math.abs(dz - off) / 2.2);
  }
  return len * (1 + gp + sp + 0.6 * grid.coverC[k] + 2 * grid.rockC[k] + wander);
}

/** A hop across the creek from (cx, cz) going north (-1) or south (+1): the cells between are all wet, the far side dry. */
function hopFrom(grid: GridData, style: RoadStyle, ph: Phase, cx: number, cz: number, sg: number): { k: number; cost: number } | null {
  const { nx, nz, valid, wet, H } = grid;
  if (!valid[cz * nx + cx]) return null;
  let k = 1;
  while (k <= 7) {
    const tz = cz + sg * k;
    if (tz < 0 || tz >= nz) return null;
    const idx = tz * nx + cx;
    if (!wet[idx]) break;
    k++;
  }
  if (k < 2 || k > 7) return null;
  const tz = cz + sg * k, ti = tz * nx + cx;
  if (!valid[ti]) return null;
  // the far bank and this one must be at similar heights to carry a level deck / a culvert fill
  const g = Math.abs(H[ti] - H[cz * nx + cx]) / k, gp = gradePen(style, ph, g);
  if (!isFinite(gp)) return null;
  return { k, cost: k * (1 + gp) + grid.crossUnits * 1.1 };
}

/** Bore edges from a cell: 6-10 cells along a compass heading, portals on the hillside at both ends, solid rock between. */
function boreEdges(grid: GridData, style: RoadStyle, cx: number, cz: number): Array<{ dx: number; dz: number; cost: number }> {
  const { nx, nz, gx0, gz0, H, valid } = grid;
  const out: Array<{ dx: number; dz: number; cost: number }> = [];
  if (!valid[cz * nx + cx]) return out;
  for (const ci of COMPASS) {
    const ux = DIRS[ci][0], uz = DIRS[ci][1], unit = DIRLEN[ci];
    for (let L = 5; L <= 10; L++) {
      const tx = cx + ux * L, tz = cz + uz * L;
      if (tx < 0 || tz < 0 || tx >= nx || tz >= nz || !valid[tz * nx + tx]) break;
      const a = H[cz * nx + cx], b = H[tz * nx + tx], len = L * unit;
      if (Math.abs(b - a) / len > style.gradeMax) continue;
      // cover along the bore: ground over the road line
      let ok = true, inner = 0, innerOk = 0, maxCover = 0;
      for (let q = 0; q <= len * 2; q++) {
        const t = q / (len * 2), x = gx0 + cx + ux * L * t, z = gz0 + cz + uz * L * t;
        const cover = grid.hAt(x, z) - (a + (b - a) * t);
        maxCover = Math.max(maxCover, cover);
        if (t > 0.2 && t < 0.8) { inner++; if (cover >= 1.3) innerOk++; }   // (the arch stands 0.8 above the road: it needs real rock over it, about 8 m)
        // portals are cut into the hillside: some ground over the arch at each end (the face stands in a slope, not on the level), not a mountain
        if (((t > 0.07 && t < 0.13) || (t > 0.87 && t < 0.93)) && (cover < 0.25 || cover > 1.8)) ok = false;
      }
      if (!ok || innerOk / Math.max(1, inner) < 0.9 || maxCover > 4) continue;
      const lengthM = len * UNIT_M;
      out.push({ dx: ux * L, dz: uz * L, cost: structurePrice('tunnel', lengthM).usd / USD_PER_UNIT + len });
    }
  }
  return out;
}

// ── smoothing and resampling ──

function chaikin(pts: Pt[], rounds: number): Pt[] {
  let p = pts;
  for (let r = 0; r < rounds; r++) {
    if (p.length < 3) return p;
    const q: Pt[] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      if (i > 0) q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      if (i < p.length - 2) q.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

function resample(pts: readonly Pt[], step: number): Pt[] {
  const out: Pt[] = [[pts[0][0], pts[0][1]]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az);
    if (l === 0) continue;
    let d = step - carry;
    while (d <= l + 1e-9) { out.push([ax + (bx - ax) * d / l, az + (bz - az) * d / l]); d += step; }
    carry = l - (d - step);
  }
  const last = pts[pts.length - 1], tail = out[out.length - 1];
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > 1e-6) out.push([last[0], last[1]]);
  return out;
}

/**
 * No line within any grade reaches the yard (a butte with no ramp): the engineer's road, a zigzag cut across the
 * face with the legs long enough to hold the hard grade, whatever the rock. Priced as what it is.
 */
function zigzag(inp: RoadInput, style: RoadStyle, grid: GridData): Array<{ x: number; z: number }> {
  const band = grid.gateBand, zs: number[] = [];
  band.forEach((v, j) => { if (v) zs.push(grid.gz0 + j); });
  const gz = zs.length ? zs[Math.floor(zs.length / 2)] : Math.round(inp.yard[1]);
  const A: Pt = [grid.gateX, gz], B: Pt = [inp.yard[0], inp.yard[1]];
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L, vx = -uz, vz = ux;
  const rise = Math.abs(inp.ground.h(B[0], B[1]) - inp.ground.h(A[0], A[1]));
  const need = rise / style.gradeHard;
  // lateral reach: as wide as the owned land allows (at most 7 units each side)
  const lim = (p: Pt, d: number) => { let w = 7; for (let q = 1; q <= 7; q++) { const x = p[0] + vx * q * d, z = p[1] + vz * q * d; if (x < grid.bounds.x0 + 1 || x > grid.bounds.x1 - 1 || z < grid.bounds.z0 + 1 || z > grid.bounds.z1 - 1) { w = q - 1; break; } } return w; };
  const W = Math.max(1, Math.min(lim(A, 1), lim(A, -1), lim(B, 1), lim(B, -1)));
  let m = 1;
  while (m < 40 && m * Math.hypot(2 * W, L / m) < need) m++;
  const out: Array<{ x: number; z: number }> = [{ x: A[0], z: A[1] }];
  if (m > 1) for (let i = 1; i < m; i++) { const t = i / m, side = i % 2 ? 1 : -1; out.push({ x: A[0] + (B[0] - A[0]) * t + vx * W * side, z: A[1] + (B[1] - A[1]) * t + vz * W * side }); }
  out.push({ x: B[0], z: B[1] });
  return out;
}

/** Offsets across the road at which the cut and fill are sampled, with the width each stands for (they sum to the bed's reach on each side). */
const OFFSETS: ReadonlyArray<readonly [number, number]> = [[0.2, 0.4], [0.55, 0.3], [0.9, 0.4], [1.4, 0.6], [2.0, 0.6], [2.8, 0.9]];

// ── the plan ──

export function planRoad(inp: RoadInput): RoadPlan {
  const style = ROAD_STYLE[inp.region];
  const grid = buildGrid(inp, style);
  // The limit is on the *ground's* slope along a move, not on the road's grade: the road is cut into the slope (the profile is held to the
  // style's grade below, and the earthwork is priced), so a switchback's turn may cross the steepest line of the slope at a price that
  // climbs with it (gradePen). Phase 3 also accepts steep cross-slopes, phase 4 anything.
  const phases: Phase[] = [
    { limitGrade: 0.3, limitSide: 0.85, bore: false, band: true },
    { limitGrade: 0.3, limitSide: 0.85, bore: false },
    ...(style.tunnels ? [{ limitGrade: 0.3, limitSide: 0.85, bore: true }] : []),
    { limitGrade: 0.45, limitSide: 1.3, bore: style.tunnels },
    { limitGrade: 0.8, limitSide: 6, bore: style.tunnels },
  ];
  let found: Search | null = null, phaseNo: 1 | 2 | 3 | 4 = 4;
  for (let i = 0; i < phases.length && !found; i++) {
    const r = search(style, phases[i], grid);
    if (r.ok) {
      found = r;
      phaseNo = (phases[i].limitGrade === 0.8 ? 4 : phases[i].limitGrade === 0.45 ? 3 : phases[i].bore ? 2 : 1) as 1 | 2 | 3 | 4;
      // a bore phase whose path has no bore in it is simply the strict road
      if (phaseNo === 2 && !r.path.some((c, k) => k > 0 && Math.max(Math.abs(c.x - r.path[k - 1].x), Math.abs(c.z - r.path[k - 1].z)) >= 5)) phaseNo = 1;
    }
  }
  return finish(inp, style, grid, found, phaseNo);
}

function finish(inp: RoadInput, style: RoadStyle, grid: GridData, found: Search | null, phaseNo: 1 | 2 | 3 | 4): RoadPlan {
  const { ground } = inp;
  // 1. the polyline from the gate to the yard, with the straight edges (hops across the creek, bores) kept apart from the pieces that are smoothed
  let seq: Array<{ x: number; z: number }>;
  if (found) seq = found.path;
  else seq = zigzag(inp, style, grid);
  const pieces: Pt[][] = [];
  const straights: Array<{ from: Pt; to: Pt; kind: 'hop' | 'bore' }> = [];
  let cur: Pt[] = [[seq[0].x, seq[0].z]];
  for (let i = 0; i < seq.length - 1; i++) {
    const a: Pt = [seq[i].x, seq[i].z], b: Pt = [seq[i + 1].x, seq[i + 1].z];
    const dx = Math.abs(b[0] - a[0]), dz = Math.abs(b[1] - a[1]);
    const kind: 'move' | 'hop' | 'bore' = !found ? 'move' : Math.max(dx, dz) >= 5 ? 'bore' : dx === 0 && dz >= 2 ? 'hop' : 'move';
    if (kind === 'move') cur.push(b);
    else { pieces.push(cur); straights.push({ from: a, to: b, kind }); cur = [b]; }
  }
  pieces.push(cur);
  // 2. smooth each piece; keep the straights as they are; join; the yard end goes to the exact yard
  const parts: Pt[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const sm = pieces[i].length > 2 ? chaikin(pieces[i], style.curviness > 0.3 ? 3 : 2) : pieces[i];
    for (const p of sm) parts.push(p);   // (a straight edge joins the end of one piece to the start of the next)
  }
  const line: Pt[] = parts;
  // the exact yard point at the end
  const lastCell = line[line.length - 1];
  if (Math.hypot(lastCell[0] - inp.yard[0], lastCell[1] - inp.yard[1]) < 1.0) line[line.length - 1] = [inp.yard[0], inp.yard[1]];   // (the grid cell is beside the yard: end on it, never double back)
  else line.push([inp.yard[0], inp.yard[1]]);
  // the apron from the county road's edge to the gate (square to the road)
  const gate0 = line[0], zg = gate0[1];
  const edgeX = inp.county(zg) - inp.roadHalf;
  const withApron: Pt[] = [[edgeX, zg], [(edgeX + gate0[0]) / 2, zg], ...line];
  // 3. stations every 0.5 unit
  const st = resample(withApron, 0.5);
  const n = st.length;
  const s: number[] = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]));
  const gateAt = (() => { let b = 0, bd = Infinity; for (let i = 0; i < n; i++) { const d = Math.abs(st[i][0] - inp.frontage.x) + Math.abs(st[i][1] - gate0[1]) * 0.2; if (d < bd) { bd = d; b = i; } } return b; })();

  // 4. what the stations cross: wet runs and the bores
  const creek = ground.creek ?? null;
  const wetPt = (x: number, z: number) => (creek && Math.abs(z - creek.zAt(x)) < creek.halfWidth + 0.1) || (ground.lakeY != null && ground.h(x, z) < ground.lakeY + 0.02);
  const kindAt: Array<StructureKind | null> = new Array(n).fill(null);
  const structures: RoadStructure[] = [];
  const rotAt = (i: number) => { const a = st[Math.max(0, i - 1)], b = st[Math.min(n - 1, i + 1)]; return Math.atan2(b[0] - a[0], b[1] - a[1]); };
  const at = new Map<RoadStructure, [number, number]>();
  const mk = (kind: StructureKind, i0: number, i1: number, lengthM: number): RoadStructure => {
    const im = Math.round((i0 + i1) / 2), pr = structurePrice(kind, lengthM);
    const choke = kind === 'bridge1' || kind === 'tunnel' || kind === 'low_water' || kind === 'ford';
    const sx: RoadStructure = { kind, s0: s[i0], s1: s[i1], x: st[im][0], z: st[im][1], rot: rotAt(im), lengthM: Math.round(lengthM), usd: Math.round(pr.usd / 50) * 50, days: pr.days, choke, droppable: kind === 'bridge1' || kind === 'bridge' || kind === 'tunnel' };
    at.set(sx, [i0, i1]);
    return sx;
  };
  // bores from the explicit straights
  for (const sg of straights) {
    if (sg.kind !== 'bore') continue;
    let i0 = -1, i1 = -1;
    for (let i = 0; i < n; i++) {
      if (Math.hypot(st[i][0] - sg.from[0], st[i][1] - sg.from[1]) < 0.3 && i0 < 0) i0 = i;
      if (Math.hypot(st[i][0] - sg.to[0], st[i][1] - sg.to[1]) < 0.3) i1 = i;
    }
    if (i0 >= 0 && i1 > i0) { for (let i = i0; i <= i1; i++) kindAt[i] = 'tunnel'; structures.push(mk('tunnel', i0, i1, (s[i1] - s[i0]) * UNIT_M)); }
  }
  // creek crossings: runs of wet stations
  if (creek || ground.lakeY != null) {
    let i = 0;
    while (i < n) {
      if (kindAt[i] || !wetPt(st[i][0], st[i][1])) { i++; continue; }
      let j = i;
      while (j + 1 < n && !kindAt[j + 1] && wetPt(st[j + 1][0], st[j + 1][1])) j++;
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, j + 1), channelM = creek ? creek.halfWidth * 2 * UNIT_M : 0, widthM = Math.max(channelM, Math.min((s[j] - s[i] + 0.5) * UNIT_M, channelM * 1.25));   // (a diagonal crossing is a little wider than the channel)
      const kind = crossingFor(style, widthM);
      for (let q = i0; q <= i1; q++) kindAt[q] = kind;
      structures.push(mk(kind, i0, i1, kind === 'culvert' || kind === 'arch_culvert' ? Math.min(widthM, 6) : widthM + 2));
      i = j + 1;
    }
  }

  // 5. the vertical profile
  const gz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let y = ground.h(st[i][0], st[i][1]);
    if (creek && kindAt[i] && kindAt[i] !== 'tunnel') y = Math.max(y, creek.waterY(st[i][0]) + 0.32);   // the bank, not the channel floor
    gz[i] = y;
  }
  const y0 = new Float64Array(n);
  for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let k = -3; k <= 3; k++) { const q = clamp(i + k, 0, n - 1); a += gz[q]; c++; } y0[i] = a / c; }
  const anchor = new Uint8Array(n);
  // anchors: ends of the line on the ground; bridge decks level between the banks; bores straight between portals; fords on the slab
  const setLin = (i0: number, i1: number, ya: number, yb: number) => { for (let i = i0; i <= i1; i++) { y0[i] = ya + (yb - ya) * (i - i0) / Math.max(1, i1 - i0); anchor[i] = 1; } };
  for (const sx of structures) {
    const [i0, i1] = at.get(sx)!;
    if (sx.kind === 'bridge' || sx.kind === 'bridge1') { const ya = y0[Math.max(0, i0 - 1)], yb = y0[Math.min(n - 1, i1 + 1)]; const deck = Math.max(ya, yb); setLin(i0, i1, deck, deck); }
    else if (sx.kind === 'tunnel') setLin(i0, i1, ground.h(st[i0][0], st[i0][1]), ground.h(st[i1][0], st[i1][1]));
    else if (sx.kind === 'ford' || sx.kind === 'low_water') { let low = Infinity; for (let i = i0; i <= i1; i++) low = Math.min(low, creek ? creek.waterY(st[i][0]) : y0[i]); setLin(i0, i1, low + 0.07, low + 0.07); }
    else if (sx.kind === 'culvert' || sx.kind === 'arch_culvert') { for (let i = i0; i <= i1; i++) y0[i] = Math.max(y0[i], (creek ? creek.waterY(st[i][0]) : y0[i]) + 0.55); }
  }
  anchor[0] = 0;
  // hairpins from the heading change
  const head = new Float64Array(n);
  for (let i = 0; i < n; i++) head[i] = rotAt(i);
  const turnOver = (i0: number, i1: number) => { let t = 0; for (let i = i0 + 1; i <= i1; i++) { let d = head[i] - head[i - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; t += d; } return t; };
  const hairpins: Hairpin[] = [];
  {
    const W = 12;   // twelve stations (6 units, 36 m) of road each way
    let i = style.grid ? n : W;   // (the survey grid has right-angle jogs, no hairpins)
    while (i < n - W) {
      const t = turnOver(i - W, i + W);
      if (Math.abs(t) >= (120 * Math.PI) / 180) {
        let j = i; while (j + 1 < n - W && Math.abs(turnOver(j + 1 - W, j + 1 + W)) >= (120 * Math.PI) / 180) j++;
        const mid = Math.round((i + j) / 2);
        const turn = turnOver(Math.max(0, i - W), Math.min(n - 1, j + W));
        // (the centre of the bend is on the left when the heading increases: the outside is the right)
        hairpins.push({ s: s[mid], x: st[mid][0], z: st[mid][1], turnDeg: Math.round(Math.abs(turn) * 180 / Math.PI), out: turn > 0 ? 'R' : 'L' });
        i = j + W;
      } else i++;
    }
  }
  // grade limit (the landing on a hairpin is eased)
  const lim = new Float64Array(n).fill(phaseNo >= 3 ? style.gradeHard : style.gradeMax);
  for (const h of hairpins) for (let i = 0; i < n; i++) if (Math.abs(s[i] - h.s) < 1.4) lim[i] = Math.min(lim[i], 0.05);
  const y = Float64Array.from(y0);
  for (let it = 0; it < 6; it++) {
    for (let i = 1; i < n; i++) if (!anchor[i]) { const ds = s[i] - s[i - 1], g = lim[i] * ds; y[i] = clamp(y[i], y[i - 1] - g, y[i - 1] + g); }
    for (let i = n - 2; i >= 0; i--) if (!anchor[i]) { const ds = s[i + 1] - s[i], g = lim[i] * ds; y[i] = clamp(y[i], y[i + 1] - g, y[i + 1] + g); }
  }
  // superelevation: the outside of a curve stands higher, up to 5 % (the heading change per unit, smoothed over ±1 unit)
  const bank = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    let a = 0, c = 0;
    for (let k = -2; k <= 2; k++) { const q = clamp(i + k, 1, n - 1); let d = head[q] - head[q - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; a += d / Math.max(1e-6, s[q] - s[q - 1]); c++; }
    const kappa = a / c;   // rad per unit; the inside (centre of curvature) is on the left when it is positive
    bank[i] = -Math.sign(kappa) * Math.min(0.05, Math.abs(kappa) * 0.2);
  }
  const pts: RoadPt[] = st.map((p, i) => ({ x: p[0], z: p[1], y: y[i], s: s[i], bank: kindAt[i] === 'tunnel' || kindAt[i] === 'bridge' || kindAt[i] === 'bridge1' ? 0 : bank[i] }));

  // 6. cross-drains (a culvert at each sag the road fills across, and at least every ~150 m on a grade), the cattle guard, the pass
  {
    let lastS = s[gateAt], added = 0;
    for (let i = gateAt + 6; i < n - 6 && added < 10; i++) {
      if (kindAt.slice(Math.max(0, i - 3), i + 4).some(Boolean)) { lastS = Math.max(lastS, s[i]); continue; }
      const fillDepth = y[i] - gz[i];
      const sag = gz[i] <= gz[i - 3] && gz[i] <= gz[i + 3] && gz[i] < gz[i - 2] + 1e-9;
      const grade = Math.abs(y[i + 2] - y[i - 2]) / Math.max(1e-6, s[i + 2] - s[i - 2]);
      if ((sag && fillDepth >= 0.12 && s[i] - lastS > 8) || (grade >= 0.06 && s[i] - lastS > 150 / UNIT_M)) {
        kindAt[i] = 'culvert'; structures.push(mk('culvert', i - 1, i + 1, 4)); lastS = s[i]; added++;
      }
    }
  }
  if (style.cattleGuard) { const i = clamp(gateAt + 2, 0, n - 1); structures.push(mk('cattle_guard', i - 1, i + 1, 4)); }
  // the pass: the highest station when the ground falls away on both sides across the road
  {
    let hi = 0; for (let i = 0; i < n; i++) if (y[i] > y[hi]) hi = i;
    if (hi > 8 && hi < n - 8 && !kindAt[hi]) {
      const rot = rotAt(hi), nxv = Math.cos(rot), nzv = -Math.sin(rot);
      const h0 = ground.h(st[hi][0], st[hi][1]), sideHi = (sg: number) => ground.h(st[hi][0] + nxv * 4 * sg, st[hi][1] + nzv * 4 * sg) - h0;
      if (sideHi(1) > 0.35 && sideHi(-1) > 0.35 && y[hi] - y[0] > 0.9) structures.push(mk('pass', hi - 1, hi + 1, 6));
    }
  }
  structures.sort((a, b) => a.s0 - b.s0);

  // 7. cut and fill, walls and guardrails
  const walls: RoadWall[] = [], rails: RoadSpan[] = [];
  const skipBed = (i: number) => kindAt[i] === 'tunnel' || kindAt[i] === 'bridge' || kindAt[i] === 'bridge1' || kindAt[i] === 'ford' || kindAt[i] === 'low_water';
  let earthU2 = 0;
  const flagWall = { L: [] as number[], R: [] as number[] }, flagRail = { L: [] as number[], R: [] as number[] };
  const wallH: Record<'L' | 'R', number[]> = { L: new Array(n).fill(0), R: new Array(n).fill(0) };
  for (let i = 0; i < n; i++) {
    if (skipBed(i)) continue;
    const rot = rotAt(i), nxv = Math.cos(rot), nzv = -Math.sin(rot);   // left normal of heading (sin, cos)
    const ds = i === 0 ? 0 : s[i] - s[i - 1];
    let area = 0;
    for (const [o, wdt] of OFFSETS) for (const sg of [1, -1]) {
      const px = st[i][0] + nxv * o * sg, pz = st[i][1] + nzv * o * sg, nat = ground.h(px, pz);
      let bh: number; if (o <= BED.halfW) bh = y[i]; else if (nat > y[i]) bh = Math.min(nat, y[i] + (o - BED.halfW) / BED.cutRatio); else bh = Math.max(nat, y[i] - (o - BED.halfW) / BED.fillRatio);
      area += Math.min(0.6, Math.abs(bh - nat)) * wdt;
    }
    earthU2 += area * ds;
    for (const sg of [1, -1] as const) {
      const side = sg > 0 ? 'L' : 'R';
      const ex = st[i][0] + nxv * BED.halfW * sg, ez = st[i][1] + nzv * BED.halfW * sg, nat = ground.h(ex + nxv * 0.15 * sg, ez + nzv * 0.15 * sg), d = nat - y[i];
      if (Math.abs(d) > BED.wallAt) { flagWall[side].push(i); wallH[side][i] = d; }
      const out = ground.h(ex + nxv * 0.6 * sg, ez + nzv * 0.6 * sg);
      if (style.guardrail !== 'none' && y[i] - out > BED.railAt) flagRail[side].push(i);
    }
  }
  // a guardrail round the outside of each hairpin, drop or no drop, where the region builds one
  if (style.guardrail !== 'none') for (const h of hairpins) for (let i = 0; i < n; i++) if (Math.abs(s[i] - h.s) < 3.5 && !flagRail[h.out].includes(i)) flagRail[h.out].push(i);
  for (const side of ['L', 'R'] as const) flagRail[side].sort((a, b) => a - b);
  const spans = (idx: number[], minLen: number): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    let a = -1, b = -1;
    for (const i of idx) { if (a < 0) { a = i; b = i; } else if (i - b <= 3) b = i; else { if (s[b] - s[a] >= minLen) out.push([a, b]); a = i; b = i; } }
    if (a >= 0 && s[b] - s[a] >= minLen) out.push([a, b]);
    return out;
  };
  for (const side of ['L', 'R'] as const) {
    for (const [a, b] of spans(flagWall[side], 1.5)) {
      let mx = 0; for (let i = a; i <= b; i++) if (Math.abs(wallH[side][i]) > Math.abs(mx)) mx = wallH[side][i];
      walls.push({ side, kind: mx > 0 ? 'cut' : 'fill', s0: s[a], s1: s[b], heightU: Math.min(0.5, Math.abs(mx)) });
    }
    for (const [a, b] of spans(flagRail[side], 1.5)) rails.push({ side, s0: s[a], s1: s[b] });
  }

  // 8. numbers
  const lengthU = s[n - 1], lengthM = lengthU * UNIT_M, lengthFt = lengthM * M_TO_FT;
  const straightM = Math.hypot(inp.yard[0] - edgeX, inp.yard[1] - zg) * UNIT_M;
  let maxG = 0;
  for (let i = 0; i < n; i++) { for (let j = i + 1; j < n; j++) { if (s[j] - s[i] >= 10) { maxG = Math.max(maxG, Math.abs(y[j] - y[i]) / (s[j] - s[i])); break; } } }
  if (!maxG && n > 1) maxG = Math.abs(y[n - 1] - y[0]) / Math.max(1e-6, lengthU);
  const riseU = Math.abs(y[n - 1] - y[0]);
  // price
  const P = ROAD_PRICE, lines: Array<{ label: string; usd: number }> = [];
  let base = 0, surcharge = 0;
  for (let i = 1; i < n; i++) {
    const ds = s[i] - s[i - 1], dft = ds * UNIT_M * M_TO_FT;
    if (kindAt[i] === 'tunnel' || kindAt[i] === 'bridge' || kindAt[i] === 'bridge1') continue;   // priced as the structure
    base += dft * P.perFt;
    const g = Math.abs(y[i] - y[i - 1]) / Math.max(1e-6, ds);
    if (g > style.gradeDesign) surcharge += dft * (g - style.gradeDesign) * 100 * P.gradeSurchargePerFtPct;
  }
  const earthM3 = earthU2 * UNIT_M ** 3;
  lines.push({ label: `${Math.round(lengthM).toLocaleString('en-US')} m of ${style.noun}`, usd: base });
  if (surcharge > 0) lines.push({ label: 'heavier base on the grade', usd: surcharge });
  lines.push({ label: 'cut and fill', usd: earthM3 * P.earthM3 });
  const kindWord: Record<StructureKind, string> = { culvert: 'culvert', arch_culvert: 'arch culvert', ford: 'ford', low_water: 'low-water crossing', bridge1: 'one-lane bridge', bridge: 'bridge', tunnel: 'rock bore', cattle_guard: 'cattle guard', pass: 'pass' };
  for (const sx of structures) if (sx.usd > 0) lines.push({ label: kindWord[sx.kind], usd: sx.usd });
  let wallUsd = 0; for (const w of walls) wallUsd += (w.s1 - w.s0) * UNIT_M * M_TO_FT * (w.heightU * UNIT_M) * P.wallPerFtM;
  if (wallUsd > 0) lines.push({ label: 'retaining walls', usd: wallUsd });
  let railUsd = 0; for (const r of rails) railUsd += (r.s1 - r.s0) * UNIT_M * M_TO_FT * P.guardrailPerFt * (style.guardrail === 'timber' ? 0.6 : 1);
  if (railUsd > 0) lines.push({ label: 'guardrail', usd: railUsd });
  const engineer = phaseNo === 4 || maxG > style.gradeMax + 0.005;   // (the ground past the hard grade, or a profile past the maximum)
  if (engineer) lines.push({ label: 'engineer and survey', usd: P.engineer });
  if (!found) lines.push({ label: 'a zigzag blasted across the face', usd: lengthFt * P.perFt * 6 + earthM3 * P.earthM3 });
  const total = lines.reduce((a, l) => a + l.usd, 0) * (engineer ? 1.25 : 1);
  const days = 5 + Math.round(lengthFt / 300) + Math.round(structures.reduce((a, x) => a + x.days, 0)) + Math.round(walls.reduce((a, w) => a + (w.s1 - w.s0) * UNIT_M * M_TO_FT / 100 * ROAD_DAYS.wall100ft, 0));
  // drive time (km/h): 35 on easy gravel; hairpins 12; grades over 10 % 18; one-lane structures 15; fords 8; the curve radius slows it
  let sec = 0, secStraight = 0;
  for (let i = 1; i < n; i++) {
    const ds = (s[i] - s[i - 1]) * UNIT_M, g = Math.abs(y[i] - y[i - 1]) / Math.max(1e-6, s[i] - s[i - 1]);
    let v = 35;
    const hp = hairpins.some(h => Math.abs(h.s - s[i]) < 1.4);
    let dh = head[i] - head[Math.max(0, i - 1)]; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    const curv = Math.abs(dh) / Math.max(1e-6, s[i] - s[i - 1]);   // rad per unit
    if (hp) v = Math.min(v, 12);
    else if (curv > 0.25) v = Math.min(v, 22);
    if (g > 0.1) v = Math.min(v, 18);
    const k = kindAt[i];
    if (k === 'bridge1' || k === 'tunnel') v = Math.min(v, 15);
    if (k === 'ford' || k === 'low_water') v = Math.min(v, 8);
    sec += ds / (v / 3.6); secStraight += ds / (35 / 3.6);
  }
  void secStraight;
  const straightSec = straightM / (35 / 3.6);
  const sig = `${inp.region}:${Math.round(lengthM)}:${hairpins.length}:${structures.map(x => x.kind).join(',')}:${phaseNo}`;
  const rotG = rotAt(gateAt);
  return {
    region: inp.region, style: style.noun, pts, gateAt, gate: { x: st[gateAt][0], z: st[gateAt][1], rot: rotG }, yard: [inp.yard[0], inp.yard[1]],
    structures, walls, rails, hairpins, lengthU, lengthM: Math.round(lengthM), lengthFt: Math.round(lengthFt), straightM: Math.round(straightM),
    maxGradePct: Math.round(maxG * 1000) / 10, avgGradePct: Math.round(1000 * riseU / Math.max(1e-6, lengthU)) / 10, riseM: Math.round(riseU * UNIT_M),
    earthM3: Math.round(earthM3), phase: phaseNo, engineer, driveMin: Math.round(sec / 6) / 10, straightMin: Math.round(straightSec / 6) / 10,
    usd: Math.round(total / 100) * 100, lines: lines.map(l => ({ label: l.label, usd: Math.round(l.usd / 50) * 50 })), days, signature: sig,
  };
}

/** The drive as [x, z] points from the county road's edge to the yard (what the world and the wall tools read). */
export const driveLine = (p: RoadPlan): Pt[] => p.pts.map(q => [q.x, q.z] as Pt);

/** Plain words for the card and the log. */
export function planWords(p: RoadPlan): string[] {
  const out: string[] = [];
  const km = p.lengthM >= 1000 ? `${(p.lengthM / 1000).toFixed(1)} km` : `${p.lengthM} m`;
  const winding = p.lengthM > p.straightM * 1.35;
  out.push(`${km} of ${p.style}${winding ? `, ${Math.round((p.lengthM / Math.max(1, p.straightM) - 1) * 100)} % longer than a straight line` : ''}, steepest ${Math.round(p.maxGradePct)} %`);
  if (p.hairpins.length) out.push(`${p.hairpins.length} hairpin${p.hairpins.length === 1 ? '' : 's'}`);
  const label: Record<StructureKind, string> = { culvert: 'culvert', arch_culvert: 'arch culvert', ford: 'ford', low_water: 'low-water crossing', bridge1: 'one-lane bridge', bridge: 'bridge', tunnel: 'rock bore', cattle_guard: 'cattle guard', pass: 'a pass' };
  const counts = new Map<StructureKind, number>();
  for (const sx of p.structures) counts.set(sx.kind, (counts.get(sx.kind) ?? 0) + 1);
  for (const k of ['bridge', 'bridge1', 'tunnel', 'low_water', 'ford', 'arch_culvert', 'culvert', 'cattle_guard', 'pass'] as StructureKind[]) {
    const c = counts.get(k); if (!c) continue;
    if (k === 'tunnel') out.push(`a ${p.structures.find(x => x.kind === 'tunnel')!.lengthM} m rock bore through the spur`);
    else if (k === 'pass') out.push('crosses the pass');
    else out.push(c === 1 ? `a ${label[k]}` : `${c} ${label[k]}s`);
  }
  if (p.engineer) out.push('an engineer is needed: past the hard grade');
  return out;
}

/** Where the plan's road has no bed: bridge decks, bores, the slab of a ford (the ground is left as it is). */
export const NO_BED: ReadonlySet<StructureKind> = new Set<StructureKind>(['bridge', 'bridge1', 'tunnel', 'ford', 'low_water']);

/** Station indices covered by a structure span (inclusive), found by distance along the road. */
export function spanIndices(p: RoadPlan, sx: RoadStructure): [number, number] {
  let a = 0, b = p.pts.length - 1;
  for (let i = 0; i < p.pts.length; i++) if (p.pts[i].s >= sx.s0 - 1e-6) { a = i; break; }
  for (let i = p.pts.length - 1; i >= 0; i--) if (p.pts[i].s <= sx.s1 + 1e-6) { b = i; break; }
  return [a, b];
}

/** The road bed the world cuts into the ground for a built drive (the same bench the price counts). */
export function roadBedOf(p: RoadPlan): RoadBed {
  const skip = new Array<boolean>(p.pts.length).fill(false);
  for (const sx of p.structures) if (NO_BED.has(sx.kind)) { const [a, b] = spanIndices(p, sx); for (let i = a; i <= b; i++) skip[i] = true; }
  return new RoadBed(p.pts, skip);
}
