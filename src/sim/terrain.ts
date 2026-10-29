/**
 * Terrain analysis (docs/DECISIONS.md, "Terrain has mechanics"): the lot's
 * relief read as numbers the sim can use, not just a picture. One pure pass
 * over a height grid gives, per cell (1 cell = 1 world unit ≈ 6 m):
 *
 *  - slope, and which way it faces (sun, wind);
 *  - high ground: how far the cell stands above the land round it, and how
 *    far a watcher on it can see;
 *  - approach cost: what it costs a crew on foot to cross it (steep ground,
 *    cliffs that need ladders, the creek that must be forded) and from that
 *    the lanes a crew would come by and the chokes along them;
 *  - water: where it runs (flow accumulation), the floodplain, mud flats,
 *    frost pockets where cold air pools, and the head a reservoir would have.
 *
 * `siteCandidates` turns those into suggestions with a score and a plain-
 * language reason (a ridge that suits a terraced keep, a gorge that is a
 * natural choke for a tunnel-bridge, a bench for a gravity-fed reservoir, a
 * drop in the creek for micro-hydro). Nothing here is saved state: the grid
 * is rebuilt from the world's ground function (`GroundSource`). Pure (tested).
 */
import type { Pt } from './perimeter';
import type { Rect } from './land';

/** What the analysis reads of the world: ground height, and the creek if there is one. */
export interface GroundSource {
  h: (x: number, z: number) => number;
  creek?: { zAt: (x: number) => number; waterY: (x: number) => number; halfWidth: number } | null;
}

export interface TerrainGrid { x0: number; z0: number; nx: number; nz: number; step: number }

/** Cost and threshold constants (all in world units; 1 unit ≈ 6 m). */
export const T = {
  /** Slope (rise over run) a person climbs without trouble, a hard scramble, and a cliff that needs a ladder or rope. */
  EASY: 0.22, HARD: 0.45, CLIFF: 0.85,
  /** Cost of crossing one cell: level ground 1, scrambling up to 8, a cliff 30 (ladders), the creek 7 (a ford: slow, loud, and wet). */
  COST_HARD: 8, COST_CLIFF: 30, COST_WATER: 7,
  /** Radius (cells) of the ring the high-ground test averages, and the rise (units) that counts as a full advantage (≈ 4 m). */
  RING: 4, HIGH_FULL: 0.7,
  /** Longest sight line the visibility pass marches (cells). */
  SIGHT: 16,
  /** A cell is on a floodplain when it stands less than this above the creek's water line (≈ 3 m). */
  FLOOD_RISE: 0.5,
  /** Cells upstream that make a draw (a channel that runs in heavy rain). */
  DRAW: 70,
  /** A cold-air pocket: this far below the ground round it (≈ 1.8 m) on near-level ground. */
  FROST_DROP: 0.3,
} as const;

export interface Terrain {
  grid: TerrainGrid;
  h: Float32Array;
  slope: Float32Array;
  /** Unit vector pointing downhill (x, z) per cell. */
  fall: Float32Array;
  /** Rise above the mean of a ring of ground round it, units (≥ 0). */
  high: Float32Array;
  /** How far a watcher standing here sees, 0–1 of `T.SIGHT` (average over 16 directions, eye 1.8 m above ground). */
  sight: Float32Array;
  /** Cost to cross a cell on foot. */
  cost: Float32Array;
  /** Cells that drain through this one. */
  flow: Float32Array;
  /** 0 none, 1 draw / wet flat (mud), 2 floodplain. */
  wet: Uint8Array;
  /** Cold-air pocket: 0 / 1. */
  frost: Uint8Array;
  /** Wind exposure 0–1 (ridges high, hollows low). */
  wind: Float32Array;
  /** Sun on the ground relative to level, ~0.75 (north face) … 1.25 (south face). */
  sun: Float32Array;
  /** The creek, if any (copied from the source). */
  creek: GroundSource['creek'];
  /** Cell lookup (nearest), clamped to the grid. */
  idx: (x: number, z: number) => number;
  /** Interpolated height. */
  hAt: (x: number, z: number) => number;
  /** Is the point in the creek channel? */
  inCreek: (x: number, z: number) => boolean;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function analyzeTerrain(src: GroundSource, rect: Rect, opts: { step?: number; pad?: number } = {}): Terrain {
  const step = opts.step ?? 1, pad = opts.pad ?? 10;
  const x0 = rect.x0 - pad, z0 = rect.z0 - pad;
  const nx = Math.ceil((rect.x1 - rect.x0 + 2 * pad) / step) + 1, nz = Math.ceil((rect.z1 - rect.z0 + 2 * pad) / step) + 1;
  const grid: TerrainGrid = { x0, z0, nx, nz, step };
  const N = nx * nz, h = new Float32Array(N);
  const idx = (x: number, z: number) => clamp(Math.round((z - z0) / step), 0, nz - 1) * nx + clamp(Math.round((x - x0) / step), 0, nx - 1);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = src.h(x0 + i * step, z0 + j * step);
  const H = (i: number, j: number) => h[clamp(j, 0, nz - 1) * nx + clamp(i, 0, nx - 1)];
  const hAt = (x: number, z: number) => {
    const fx = clamp((x - x0) / step, 0, nx - 1.001), fz = clamp((z - z0) / step, 0, nz - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    return H(i, j) * (1 - u) * (1 - v) + H(i + 1, j) * u * (1 - v) + H(i, j + 1) * (1 - u) * v + H(i + 1, j + 1) * u * v;
  };
  const creek = src.creek ?? null;
  const inCreek = (x: number, z: number) => !!creek && Math.abs(z - creek.zAt(x)) < creek.halfWidth && hAt(x, z) < creek.waterY(x) + 0.05;

  const slope = new Float32Array(N), fall = new Float32Array(N * 2), high = new Float32Array(N), sight = new Float32Array(N), cost = new Float32Array(N);
  const wind = new Float32Array(N), sun = new Float32Array(N);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    const gx = (H(i + 1, j) - H(i - 1, j)) / (2 * step), gz = (H(i, j + 1) - H(i, j - 1)) / (2 * step), m = Math.hypot(gx, gz);
    slope[k] = m;
    if (m > 1e-6) { fall[k * 2] = -gx / m; fall[k * 2 + 1] = -gz / m; }
    // high ground: this cell against the mean of an 8-point ring (the same test the towers use, sim/towers.highGroundAt)
    let ring = 0;
    for (let q = 0; q < 8; q++) ring += hAt(x0 + i * step + Math.cos(q * Math.PI / 4) * T.RING * step, z0 + j * step + Math.sin(q * Math.PI / 4) * T.RING * step);
    high[k] = Math.max(0, h[k] - ring / 8);
    wind[k] = clamp(0.5 + (h[k] - ring / 8) / (2 * T.HIGH_FULL * 2), 0, 1);
    // sun: the world is x east, z south; a slope facing south (downhill toward +z) catches the winter sun (northern hemisphere)
    sun[k] = clamp(1 + 0.8 * Math.min(0.4, m) * fall[k * 2 + 1] * 1.0, 0.75, 1.25);
  }
  // visibility: march 16 rays out; a ray ends where the ground rises above the line from the eye (1.8 m = 0.3 u above the cell)
  const RAYS = 16;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, eye = h[k] + 0.3;
    let total = 0;
    for (let q = 0; q < RAYS; q++) {
      const c = Math.cos(q * 2 * Math.PI / RAYS), s = Math.sin(q * 2 * Math.PI / RAYS);
      let seen: number = T.SIGHT, maxTan = -Infinity, dPeak = 1;
      for (let d = 1; d <= T.SIGHT; d++) {
        const x = x0 + i * step + c * d * step, z = z0 + j * step + s * d * step;
        if (x < x0 || z < z0 || x > x0 + (nx - 1) * step || z > z0 + (nz - 1) * step) { seen = d; break; }
        const tan = (hAt(x, z) - eye) / (d * step);
        if (tan > maxTan) { maxTan = tan; dPeak = d; }
        // a crest hides what is behind it: once the ground drops clearly below the line over the highest point so far, the view ends at that crest
        if (maxTan > 0.02 && tan < maxTan - 0.04) { seen = dPeak; break; }
      }
      total += seen;
    }
    sight[k] = total / (RAYS * T.SIGHT);
  }
  // approach cost on foot
  for (let k = 0; k < N; k++) {
    const m = slope[k];
    const c = m <= T.EASY ? 1 + 2 * m : m <= T.HARD ? 1.4 + (m - T.EASY) / (T.HARD - T.EASY) * (T.COST_HARD - 1.4) : m <= T.CLIFF ? T.COST_HARD + (m - T.HARD) / (T.CLIFF - T.HARD) * (T.COST_CLIFF - T.COST_HARD) : T.COST_CLIFF;
    cost[k] = c;
  }
  if (creek) for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (inCreek(x0 + i * step, z0 + j * step)) cost[j * nx + i] = Math.max(cost[j * nx + i], T.COST_WATER);

  // flow accumulation (D8, from the highest cell down)
  const flow = new Float32Array(N).fill(1);
  const order = Array.from({ length: N }, (_, k) => k).sort((a, b) => h[b] - h[a]);
  for (const k of order) {
    const i = k % nx, j = (k - i) / nx;
    let best = -1, bd = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const drop = (h[k] - h[jj * nx + ii]) / Math.hypot(di, dj);
      if (drop > bd) { bd = drop; best = jj * nx + ii; }
    }
    if (best >= 0) flow[best] += flow[k];
  }
  const wet = new Uint8Array(N), frost = new Uint8Array(N);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * step, z = z0 + j * step;
    if (creek && Math.abs(z - creek.zAt(x)) < 14 && h[k] < creek.waterY(x) + T.FLOOD_RISE) wet[k] = 2;
    else if ((flow[k] >= T.DRAW && slope[k] < 0.25) || (flow[k] >= 18 && slope[k] < 0.06)) wet[k] = 1;
    // a cold-air pocket: below the ground round it on near-level ground (cold air drains downhill and pools)
    if (slope[k] < 0.12 && high[k] === 0) {
      let ring = 0;
      for (let q = 0; q < 8; q++) ring += hAt(x + Math.cos(q * Math.PI / 4) * 8 * step, z + Math.sin(q * Math.PI / 4) * 8 * step);
      if (ring / 8 - h[k] >= T.FROST_DROP && wet[k] === 0) frost[k] = 1;
    }
  }
  return { grid, h, slope, fall, high, sight, cost, flow, wet, frost, wind, sun, creek, idx, hAt, inCreek };
}

// ── readouts ──

export const slopeAt = (t: Terrain, x: number, z: number): number => t.slope[t.idx(x, z)];
export const highAt = (t: Terrain, x: number, z: number): number => t.high[t.idx(x, z)];
export const sightAt = (t: Terrain, x: number, z: number): number => t.sight[t.idx(x, z)];
export const sunAt = (t: Terrain, x: number, z: number): number => t.sun[t.idx(x, z)];
export const wetAt = (t: Terrain, x: number, z: number): 0 | 1 | 2 => t.wet[t.idx(x, z)] as 0 | 1 | 2;
export const frostAt = (t: Terrain, x: number, z: number): boolean => t.frost[t.idx(x, z)] === 1;
export const windAt = (t: Terrain, x: number, z: number): number => t.wind[t.idx(x, z)];

/** Elevation advantage of a watcher at A over a point B (units; positive = A looks down on B). */
export const advantage = (t: Terrain, a: Pt, b: Pt): number => t.hAt(a[0], a[1]) - t.hAt(b[0], b[1]);

// ── approach lanes ──

export interface Lane {
  /** Compass direction the crew comes FROM, radians (0 = east, π/2 = south (+z), as the world's angle). */
  ang: number;
  /** Total approach cost to the target (a level, open walk of the same length costs ≈ its length). */
  cost: number;
  /** Straight-line distance to the target, units. */
  dist: number;
  /** Cost per unit of distance: 1 = easy, higher = harder going. */
  hardness: number;
  /** The path, outside in, ending at the target. */
  path: Pt[];
  /** Where on the path it is narrow and hard to bypass (the choke), if anywhere. */
  choke: Choke | null;
  /** Does it have to cross the creek? */
  fords: boolean;
  /** Does it have to go up a cliff (a stretch at cliff slope)? */
  cliff: boolean;
  /** It goes over a tunnel-bridge or slope tunnel (the corridor's id): the crew comes to its outer door. */
  via?: string;
}

export interface Choke { at: Pt; /** Width of cheap going across the lane there, units. */ width: number; /** Cost per unit along the path there. */ hardness: number }

/** A way across hard ground that a crew can use as easy going: a finished tunnel-bridge or slope tunnel (`outer` is the end away from the camp). */
export interface Corridor { id: string; pts: Pt[]; outer: Pt }

/** The cost array with each corridor made easy (cost 1 within one cell of its line). */
function withCorridors(t: Terrain, corridors: readonly Corridor[]): Float32Array {
  if (!corridors.length) return t.cost;
  const cost = Float32Array.from(t.cost);
  for (const c of corridors) for (let i = 1; i < c.pts.length; i++) {
    const [ax, az] = c.pts[i - 1], [bx, bz] = c.pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
    for (let k = 0; k <= n; k++) for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = t.idx(ax + (bx - ax) * k / n + ox, az + (bz - az) * k / n + oz);
      cost[q] = Math.min(cost[q], 1);
    }
  }
  return cost;
}

/** Cost-to-target for every cell (Dijkstra from `target`, 8-connected). `corridors`: ways a crew can use as easy going over hard ground. */
export function costToTarget(t: Terrain, target: Pt, corridors: readonly Corridor[] = []): Float64Array {
  const cost = withCorridors(t, corridors);
  const { nx, nz } = t.grid, N = nx * nz, dist = new Float64Array(N).fill(Infinity);
  const start = t.idx(target[0], target[1]);
  dist[start] = 0;
  // a binary heap of [dist, cell]
  const heap: Array<[number, number]> = [[0, start]];
  const push = (e: [number, number]) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, k] = pop();
    if (d > dist[k]) continue;
    const i = k % nx, j = (k - i) / nx;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const q = jj * nx + ii, nd = d + (cost[k] + cost[q]) / 2 * Math.hypot(di, dj) * t.grid.step;
      if (nd < dist[q]) { dist[q] = nd; push([nd, q]); }
    }
  }
  return dist;
}

/**
 * The lanes a crew could come by: for each of 8 compass directions, the
 * cheapest walk from the edge of the analysed area to `target`, with how hard
 * it is and where it narrows. `edgeR`: how far out (units) from the target
 * the crew starts (default: the grid edge).
 */
export function approachLanes(t: Terrain, target: Pt, edgeR?: number, corridors: readonly Corridor[] = []): Lane[] {
  const { nx, nz, x0, z0, step } = t.grid;
  const dist = costToTarget(t, target, corridors);
  const R = edgeR ?? Math.min(nx, nz) * step / 2 - 2;
  const out: Lane[] = [];
  for (let s = 0; s < 8; s++) {
    // the best start cell in a 45° sector at distance ~R
    const lo = (s - 0.5) * Math.PI / 4, hi = (s + 0.5) * Math.PI / 4;
    let best = -1, bd = Infinity;
    for (let a = lo; a <= hi + 1e-6; a += Math.PI / 32) {
      const x = target[0] + Math.cos(a) * R, z = target[1] + Math.sin(a) * R;
      if (x < x0 || z < z0 || x > x0 + (nx - 1) * step || z > z0 + (nz - 1) * step) continue;
      const k = t.idx(x, z);
      if (dist[k] < bd) { bd = dist[k]; best = k; }
    }
    if (best < 0 || !isFinite(bd)) continue;
    // follow the cheapest descent to the target
    const path: Pt[] = [];
    let k = best, guard = 0, fords = false, cliff = false;
    while (guard++ < nx * nz) {
      const i = k % nx, j = (k - i) / nx;
      const x = x0 + i * step, z = z0 + j * step;
      path.push([x, z]);
      if (t.inCreek(x, z)) fords = true;
      if (t.slope[k] > T.CLIFF) cliff = true;
      if (dist[k] === 0) break;
      let nk = -1, nd = dist[k];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const q = jj * nx + ii;
        if (dist[q] < nd) { nd = dist[q]; nk = q; }
      }
      if (nk < 0) break;
      k = nk;
    }
    const a0 = path[0], d = Math.hypot(a0[0] - target[0], a0[1] - target[1]) || 1;
    // a lane that runs over a corridor comes to its outer door: that is the choke (one door wide)
    const via = corridors.find(c => path.some(p => c.pts.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 1.2)));
    out.push({ ang: Math.atan2(a0[1] - target[1], a0[0] - target[0]), cost: bd, dist: d, hardness: bd / d, path, choke: via ? { at: via.outer, width: 1, hardness: 1 } : chokeOf(t, path), fords: via ? false : fords, cliff: via ? false : cliff, ...(via ? { via: via.id } : {}) });
  }
  return out;
}

/** Where a lane is narrow: across the path, how many cells within 2× the path's own cost are open; fewest wins (≤ 3 cells ≈ 18 m is a choke). */
export function chokeOf(t: Terrain, path: readonly Pt[]): Choke | null {
  let best: Choke | null = null;
  for (let n = 2; n < path.length - 2; n++) {
    const a = path[n - 1], b = path[n + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, px = -dz / l, pz = dx / l;
    const here = t.cost[t.idx(path[n][0], path[n][1])];
    // the walk across the path both ways until the going turns bad (> 2× the path's cell cost, or a cliff / the creek)
    let w = 1;
    for (const sg of [1, -1]) for (let d = 1; d <= 8; d++) {
      const k = t.idx(path[n][0] + px * d * sg, path[n][1] + pz * d * sg);
      if (t.cost[k] > Math.max(3, 2 * here)) break;
      w++;
    }
    if (w <= 3 && (!best || w < best.width)) best = { at: [path[n][0], path[n][1]], width: w, hardness: here };
  }
  return best;
}

/** The lane crews will favor: the cheapest per unit of distance, with the road (if known) made easier. */
export function bestLane(lanes: readonly Lane[], road?: { ang: number; bonus: number }): Lane | null {
  let best: Lane | null = null, bs = Infinity;
  for (const l of lanes) {
    let score = l.cost;
    if (road) { const da = Math.abs(((l.ang - road.ang + Math.PI * 3) % (2 * Math.PI)) - Math.PI); if (da < Math.PI / 4 + 0.01) score *= road.bonus; }
    if (score < bs) { bs = score; best = l; }
  }
  return best;
}

// ── water ──

/** Metres of head (fall) a point has over another: 1 unit = 6 m. */
export const headM = (t: Terrain, from: Pt, to: Pt): number => (t.hAt(from[0], from[1]) - t.hAt(to[0], to[1])) * 6;

/** A gravity feed needs about 7 m (0.7 bar) of head over the taps; every metre above that is more pressure. */
export const GRAVITY_MIN_HEAD_M = 7;

/** Fall of the creek over a reach (metres), for a micro-hydro intake: `len` units upstream of `x`. */
export function creekDropM(t: Terrain, x: number, len = 10): number {
  if (!t.creek) return 0;
  return Math.max(0, (t.creek.waterY(x - len) - t.creek.waterY(x))) * 6;
}

// ── siting ──

export type SiteKind = 'keep_ridge' | 'gorge' | 'choke' | 'reservoir' | 'hydro' | 'tower_hill' | 'frost_pocket' | 'flood_zone';

export interface SiteCandidate {
  kind: SiteKind;
  x: number; z: number;
  /** 0–1: how well the ground suits it. */
  score: number;
  /** Plain-language reason, for the card. */
  reason: string;
  /** For a gorge: the two rims a span would join, and the drop. */
  span?: { a: Pt; b: Pt; lengthM: number; depthM: number };
  /** For a reservoir: the head over the camp (m). */
  headM?: number;
  /** For micro-hydro: the fall (m) over the reach. */
  dropM?: number;
}

export interface SiteContext {
  /** The lot (the area candidates must lie in). */
  lot: Rect;
  /** The family's camp: heads and lanes are measured against it. */
  camp: Pt;
}

const inLot = (lot: Rect, x: number, z: number) => x >= lot.x0 && x <= lot.x1 && z >= lot.z0 && z <= lot.z1;

/** A gorge across the creek: the narrowest cross section along its reach where both rims stand `minDepth` above the bed; flat lots have none. */
export function findGorge(t: Terrain, lot: Rect, minDepthM = 6, maxSpanM = 200): SiteCandidate | null {
  const c = t.creek;
  if (!c) return null;
  let best: SiteCandidate | null = null;
  for (let x = lot.x0 + 2; x <= lot.x1 - 2; x += 1) {
    const zc = c.zAt(x), bed = t.hAt(x, zc);
    // the cross section runs straight across the creek (z): find where each side climbs to a rim (the slope eases off after a bank)
    const rim = (sg: number): { d: number; h: number } | null => {
      let climbed = false, steepest = 0, prev = bed;
      for (let d = 1; d <= 22; d++) {
        const hh = t.hAt(x, zc + sg * d), up = hh - bed;
        steepest = Math.max(steepest, hh - prev);
        prev = hh;
        if (up >= minDepthM / 6) climbed = true;
        // the rim: it has climbed the minimum and the bank has eased off to well under its steepest pitch
        if (climbed) { const ahead = (t.hAt(x, zc + sg * (d + 4)) - hh) / 4; if (ahead < Math.max(0.06, 0.3 * steepest)) return { d, h: hh }; }
      }
      return null;
    };
    const a = rim(-1), b = rim(1);
    if (!a || !b) continue;
    const span = (a.d + b.d) * 6, depth = (Math.min(a.h, b.h) - bed) * 6;
    if (span > maxSpanM || depth < minDepthM) continue;
    const pa: Pt = [x, zc - a.d], pb: Pt = [x, zc + b.d];
    if (!inLot(lot, pa[0], pa[1]) && !inLot(lot, pb[0], pb[1])) continue;
    // a narrower, deeper cut is a better choke; both rims should be level enough to land a portal on
    const score = clamp(0.35 + 0.35 * clamp((depth - minDepthM) / 14, 0, 1) + 0.3 * clamp(1 - (span - 24) / (maxSpanM - 24), 0, 1), 0, 1);
    if (!best || score > best.score) best = { kind: 'gorge', x, z: zc, score, reason: `The creek runs in a gorge ${Math.round(depth)} m deep and ${Math.round(span)} m across at the rims: a natural choke point, and a place a tunnel-bridge could span.`, span: { a: pa, b: pb, lengthM: Math.round(span), depthM: Math.round(depth) } };
  }
  return best;
}

/**
 * Candidate sites on this ground with a score and a reason, best first.
 * Flat ground yields few or none: the Build menu and the Next-step cards
 * only offer what the land suits.
 */
export function siteCandidates(t: Terrain, ctx: SiteContext, lanes?: readonly Lane[]): SiteCandidate[] {
  const out: SiteCandidate[] = [];
  const { lot, camp } = ctx;
  const { nx, nz, x0, z0, step } = t.grid;
  // a flat-topped rise: the highest cell with a level patch and a clear advantage over the land round it
  let keep: SiteCandidate | null = null, tower: SiteCandidate | null = null, frost: SiteCandidate | null = null;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * step, z = z0 + j * step;
    if (!inLot(lot, x, z)) continue;
    if (t.high[k] >= 0.5 && t.slope[k] < 0.15 && t.wet[k] === 0) {
      const sc = clamp(t.high[k] / 1.5, 0, 1) * 0.6 + t.sight[k] * 0.4 - 0.1 * Math.min(1, Math.hypot(x - camp[0], z - camp[1]) / 40);
      if (!keep || sc > keep.score) keep = { kind: 'keep_ridge', x, z, score: clamp(sc, 0, 1), reason: `This rise stands ${Math.round(t.high[k] * 6)} m above the land round it and sees ${Math.round(t.sight[k] * T.SIGHT * 6)} m on average: it suits a terraced keep.` };
    }
    if (t.high[k] >= 0.35) {
      const sc = clamp(t.high[k] / 1.2, 0, 1) * 0.5 + t.sight[k] * 0.5;
      if (!tower || sc > tower.score) tower = { kind: 'tower_hill', x, z, score: clamp(sc, 0, 1), reason: `High ground, ${Math.round(t.high[k] * 6)} m above its surroundings: a tower here sees and shoots farther.` };
    }
    if (t.frost[k] && Math.hypot(x - camp[0], z - camp[1]) < 25) {
      if (!frost) frost = { kind: 'frost_pocket', x, z, score: 0.5, reason: 'Cold air pools in this hollow: late frosts hit gardens and orchards planted here.' };
    }
  }
  if (keep) out.push(keep);
  if (tower) out.push(tower);
  if (frost) out.push(frost);
  const g = findGorge(t, lot);
  if (g) out.push(g);
  // a reservoir: the best level bench well above the camp (gravity feed with no pump), not too far
  let res: SiteCandidate | null = null;
  const campH = t.hAt(camp[0], camp[1]);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + i * step, z = z0 + j * step;
    if (!inLot(lot, x, z) || t.slope[k] > 0.12 || t.wet[k] === 2) continue;
    const head = (t.h[k] - campH) * 6, d = Math.hypot(x - camp[0], z - camp[1]);
    if (head < GRAVITY_MIN_HEAD_M || d > 35) continue;
    const sc = clamp(0.4 + 0.4 * clamp((head - GRAVITY_MIN_HEAD_M) / 12, 0, 1) + 0.2 * (1 - d / 35), 0, 1);
    if (!res || sc > res.score) res = { kind: 'reservoir', x, z, score: sc, headM: Math.round(head), reason: `A level bench ${Math.round(head)} m above the camp: a reservoir here feeds the houses by gravity, no pump or power.` };
  }
  if (res) out.push(res);
  if (t.creek) {
    let hy: SiteCandidate | null = null;
    for (let x = lot.x0 + 12; x <= lot.x1; x += 2) {
      const drop = creekDropM(t, x, 10);
      if (drop >= 1.2 && (!hy || drop > (hy.dropM ?? 0))) hy = { kind: 'hydro', x, z: t.creek.zAt(x), score: clamp(drop / 4, 0.3, 1), dropM: Math.round(drop * 10) / 10, reason: `The creek falls ${(Math.round(drop * 10) / 10)} m over 60 m here: enough for a small micro-hydro intake.` };
    }
    if (hy) out.push(hy);
  }
  if (lanes) {
    const lane = bestLane(lanes);
    if (lane?.choke && lane.choke.width <= 3 && inLot(lot, lane.choke.at[0], lane.choke.at[1])) out.push({ kind: 'choke', x: lane.choke.at[0], z: lane.choke.at[1], score: clamp(0.5 + (3 - lane.choke.width) * 0.15, 0, 1), reason: `The easiest way in narrows to ${Math.round(lane.choke.width * 6)} m here: wall and watch this and a crew has little room to spread.` });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Does the lot have a gorge (a note for the listing text)? */
export const hasGorge = (t: Terrain, lot: Rect): boolean => findGorge(t, lot) !== null;

// ── local readouts (no grid: cheap enough to call every day for one structure) ──

/** Sun on the ground at a point relative to level (0.75 north face … 1.25 south face), from the slope over ±1 unit. */
export function localSun(src: GroundSource, x: number, z: number): number {
  const gx = (src.h(x + 1, z) - src.h(x - 1, z)) / 2, gz = (src.h(x, z + 1) - src.h(x, z - 1)) / 2, m = Math.hypot(gx, gz);
  if (m < 1e-6) return 1;
  return clamp(1 + 0.8 * Math.min(0.4, m) * (-gz / m), 0.75, 1.25);
}

/** How high a point stands above the creek's water line (units), or null when there is no creek or it is far off. */
export function riseAboveCreek(src: GroundSource, x: number, z: number): number | null {
  const c = src.creek;
  if (!c || Math.abs(z - c.zAt(x)) >= 14) return null;
  return src.h(x, z) - c.waterY(x);
}

/** 2 floodplain, 0 not. (The grid's draws and wet flats are `wetAt`; this is the creek's floodplain only.) */
export const floodplainAt = (src: GroundSource, x: number, z: number): boolean => { const r = riseAboveCreek(src, x, z); return r !== null && r < T.FLOOD_RISE; };

// ── spans and slope tunnels: where the ground allows them ──

export const SPAN = {
  /** Shortest and longest tunnel-bridge (units): 18 m to 204 m. */
  MIN_LEN: 3, MAX_LEN: 34,
  /** The ground must fall this far below the deck somewhere under it (units = 3 m). */
  MIN_SAG: 0.5,
  /** A slope tunnel needs a hillside at least this steep on average. */
  MIN_SLOPE: 0.2,
} as const;

/** Why a tunnel-bridge can't be laid from `a` to `b` on this ground (null = it can): a real dip under it, and a length a span can bear. */
export function spanProblem(src: GroundSource, a: Pt, b: Pt): string | null {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < SPAN.MIN_LEN) return 'too short: a tunnel-bridge spans a gap of at least 18 m (use a covered walkway between yards)';
  if (len > SPAN.MAX_LEN) return `too long: ${Math.round(len * 6)} m is more than a span can bear (200 m at the most)`;
  const ha = src.h(a[0], a[1]), hb = src.h(b[0], b[1]);
  let sag = 0;
  for (let i = 1; i < 24; i++) { const f = i / 24; sag = Math.max(sag, (ha + (hb - ha) * f) - src.h(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)); }
  if (sag < SPAN.MIN_SAG) return `nothing to span: the ground between is only ${Math.round(sag * 6)} m below the deck. A tunnel-bridge crosses a gorge, ravine or creek bed at least 3 m deep; on a hillside lay a slope tunnel`;
  return null;
}

/** Why a slope tunnel can't follow this line (null = it can): it needs a hillside. */
export function slopeTunnelProblem(src: GroundSource, pts: readonly Pt[]): string | null {
  let len = 0, rise = 0;
  for (let i = 1; i < pts.length; i++) { len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); rise += Math.abs(src.h(pts[i][0], pts[i][1]) - src.h(pts[i - 1][0], pts[i - 1][1])); }
  if (len < SPAN.MIN_LEN) return 'too short for a tunnel';
  if (rise / len < SPAN.MIN_SLOPE) return `no hillside here: the ground falls only ${Math.round(rise / len * 100)} % along this line (a slope tunnel needs 20 % or more)`;
  return null;
}

/** Does the lot have a hillside steep enough for a slope tunnel (a stretch of ground at 25 % or more)? */
export function hasHillside(t: Terrain, lot: Rect): boolean {
  let n = 0;
  const { nx, nz, x0, z0, step } = t.grid;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * step, z = z0 + j * step;
    if (x >= lot.x0 && x <= lot.x1 && z >= lot.z0 && z <= lot.z1 && t.slope[j * nx + i] >= 0.25) n++;
  }
  return n >= 25;
}
