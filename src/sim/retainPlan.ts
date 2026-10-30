/**
 * Dry-stack retaining walls on graded pads (docs/DECISIONS.md, "Retaining walls and terraces"). A building cut into a slope is built on a flat pad;
 * where the pad meets the hill a wall holds the cut (ground above the pad: the face looks into the pad) or the fill (ground below it: the face looks
 * out). This module is the pure plan of that wall, from the pad's rectangle and the natural ground: where it runs, how high it stands at every point,
 * where a stair is set through it, and the flat apron that is left round a graded building so a stair has room. The same plan is drawn by
 * game/terrain/RetainWalls.ts, walked round by the people (game/HomesteadWorld `hard`) and read by the sim (sim/retaining.ts: mud, slumps, raiders).
 * No state: the wall is a function of the pad and the land, so no save change. Lengths in world units (1 u = 6 m).
 */

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export type Natural = (x: number, z: number) => number;

export const RW = {
  /** Skirt of a pad that has a wall (u): the wall is this thick at the top and the terrain eases only this far. */
  SKIRT: 0.14,
  /** A step in the pad of this much (u, 45 cm) or more gets a wall; smaller is a graded edge. */
  MIN_H: 0.075,
  /** A wall this high (u, 60 cm) stops a walk: below it a person steps over. */
  BARRIER_H: 0.1,
  /** A wall this high (m) or more is a tall wall: it wants drainage behind it or it can slump (sim/retaining.ts). */
  TALL_M: 2.4,
  /** The flat apron left round a graded building on the sides that carry a wall (u, 3.6 m), room for a stair. */
  APRON: 0.6,
  STAIR_W: 0.2,
  CHEEK: 0.035,
  /** Rise and run of a step: 27 cm and 27 cm (the same riser as game/paths stairGeometry). */
  RISE: 0.045, RUN: 0.045,
  /** A stair is cut through walls up to this high (u, 3 m); a taller wall is left for the taper at its end. */
  STAIR_MAX_H: 0.5,
  /** A wall shorter than this (u, 2.7 m) is not built: a stub of wall looks like a pile of stones. */
  MIN_LEN: 0.45,
  /** Sample spacing along a side (u). */
  STEP: 0.15,
  /** Pad margin round the footprint (the old pad). */
  EDGE: 0.05,
  MAX_STAIRS: 2,
  /** A wall must run this far (u, 5.4 m) to take a stair: a stub of wall with steps in it looks like a toy. */
  STAIR_MIN_LEN: 0.9,
  /** Metres per unit. */
  M: 6,
} as const;

/** The four sides of a pad: the outward normal. 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x). */
const NORMALS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
type Side = 0 | 1 | 2 | 3;
const SIDES: readonly Side[] = [0, 1, 2, 3];

/** One side of the pad: samples along it, their signed retained height (+ cut: ground above the pad; - fill: ground below it). */
export interface WallRun {
  side: Side;
  /** Points on the pad edge, in order of travel along the side. */
  pts: Array<[number, number]>;
  /** Signed retained height at each point (u). */
  h: number[];
}

/** A flight of steps through a wall: `x, z` is the top of it (the back of a cut wall's slab, the pad edge on a fill), `dx, dz` the unit way down it. */
export interface WallStair {
  x: number; z: number; dx: number; dz: number;
  /** Cut wall (the stair comes down into the pad) or fill (it goes down outside). */
  cut: boolean;
  topY: number; footY: number;
  steps: number;
  /** Horizontal length (u), through the slab and out onto the ground. */
  len: number;
  side: Side;
}

export interface PadPlan {
  /** The pad rectangle to grade: the footprint, its edge and the apron on the walled sides. */
  rect: Rect;
  y: number;
  /** Terrain skirt (u): RW.SKIRT where a wall stands, the old 0.9 where the pad is gentle. */
  skirt: number;
  runs: WallRun[];
  stairs: WallStair[];
  /** The tallest wall (u), its length (u), its face (m^2), and whether it is a tall wall. */
  maxH: number; lenU: number; faceM2: number; tall: boolean;
  /** Walls stop a walk only when a way over exists (a stair or a place where the wall dies out). */
  barrier: boolean;
  bbox: Rect;
}

const NO_WALL_SKIRT = 0.9;

const meanHeight = (r: Rect, h: Natural): number => {
  let s = 0, n = 0;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { s += h(r.x0 + (r.x1 - r.x0) * i / 4, r.z0 + (r.z1 - r.z0) * j / 4); n++; }
  return s / n;
};

const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

/** Edge point `t` (0..1) along side `side` of the rect, going round clockwise seen from above. */
function edgePoint(r: Rect, side: Side, t: number): [number, number] {
  switch (side) {
    case 0: return [r.x0 + (r.x1 - r.x0) * t, r.z0];
    case 1: return [r.x1, r.z0 + (r.z1 - r.z0) * t];
    case 2: return [r.x1 - (r.x1 - r.x0) * t, r.z1];
    default: return [r.x0, r.z1 - (r.z1 - r.z0) * t];
  }
}

/** Signed retained heights along every side of `r` at pad level `y`. */
function sample(r: Rect, y: number, h: Natural): WallRun[] {
  return SIDES.map(side => {
    const len = side % 2 === 0 ? r.x1 - r.x0 : r.z1 - r.z0, n = Math.max(2, Math.ceil(len / RW.STEP)), [nx, nz] = NORMALS[side];
    const pts: Array<[number, number]> = [], hs: number[] = [];
    for (let i = 0; i <= n; i++) {
      const p = edgePoint(r, side, i / n);
      pts.push(p);
      hs.push(h(p[0] + nx * RW.SKIRT, p[1] + nz * RW.SKIRT) - y);
    }
    return { side, pts, h: hs };
  });
}

/** The typical wall height along a side (the median sample): a wing that dies out at a corner does not make a side a walled one. */
const sideMid = (run: WallRun): number => { const a = run.h.map(Math.abs).sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };

/** How far side `side` of `r` may be pushed out before a neighbouring footprint (with room for its own wall) is in the way. */
function clearance(r: Rect, side: Side, want: number, others: readonly Rect[]): number {
  let e = want;
  for (const o of others) {
    if (side % 2 === 0 ? (o.x1 <= r.x0 || o.x0 >= r.x1) : (o.z1 <= r.z0 || o.z0 >= r.z1)) continue;
    const gap = side === 0 ? r.z0 - o.z1 : side === 2 ? o.z0 - r.z1 : side === 1 ? o.x0 - r.x1 : r.x0 - o.x1;
    if (gap < -1e-6) continue;     // already overlapping on this axis: not in the way of growing outward
    e = Math.min(e, gap - RW.SKIRT - 0.08);
  }
  return Math.max(0, e);
}

/** The rectangle (u) a stair covers: from its top through its length, as wide as the flight and its cheeks, grown by `pad`. */
export function stairRect(s: WallStair, pad = 0): Rect {
  const w = RW.STAIR_W / 2 + RW.CHEEK + pad, ex = s.x + s.dx * (s.len + pad), ez = s.z + s.dz * (s.len + pad);
  const sx = s.x - s.dx * pad, sz = s.z - s.dz * pad;
  const hx = Math.abs(s.dz) * w, hz = Math.abs(s.dx) * w;
  return { x0: Math.min(sx, ex) - hx, x1: Math.max(sx, ex) + hx, z0: Math.min(sz, ez) - hz, z1: Math.max(sz, ez) + hz };
}

/** Does the point lie in the corridor of one of these stairs (the cut in the wall and the flight)? */
export function inStair(stairs: readonly WallStair[], x: number, z: number, pad = 0.03): boolean {
  for (const s of stairs) {
    const r = stairRect(s, pad);
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true;
  }
  return false;
}

/** A wall hardly there (under half of MIN_H) is zeroed so a slab starts and ends cleanly. */
const trimRun = (r: WallRun): WallRun => ({ ...r, h: r.h.map(v => (Math.abs(v) < RW.MIN_H * 0.5 ? 0 : v)) });

/**
 * Plan the pad under a building footprint `fp` on natural ground `h`. `others` are the footprints already standing near (the apron stops short of
 * them and a stair keeps off them). With no step of `RW.MIN_H` round the pad the plan has no runs and the old gentle skirt: the building simply sits
 * on graded ground. Pure (tested).
 */
/** Kinds that stand on vehicle or lookout ground and take no retaining wall: a drive, a court or a ring wall must run through them (they keep the old gentle pad). */
export const WALLLESS = /^(terrace_|motor_court|gate_garage|equipment_yard|watchtower|rise_lookout|bunker|tunnel|escape|wall|gate|fence|hedge)/;

/** Zero the wall where its slab would stand in another pad (that pad grades the ground there, so a wall drawn from the natural height would float or bury). */
function maskRuns(runs: WallRun[], others: readonly Rect[]): WallRun[] {
  if (!others.length) return runs;
  return runs.map(r => {
    const [nx, nz] = NORMALS[r.side];
    return { ...r, h: r.h.map((v, i) => {
      const x = r.pts[i][0] + nx * RW.SKIRT * 0.5, z = r.pts[i][1] + nz * RW.SKIRT * 0.5, m = RW.SKIRT + 0.05;
      return others.some(o => x > o.x0 - m && x < o.x1 + m && z > o.z0 - m && z < o.z1 + m) ? 0 : v;
    }) };
  });
}

export function planPad(fp: Rect, h: Natural, others: readonly Rect[] = [], seen: Natural = h): PadPlan {
  // (`h` is the natural ground the pad level is taken from; `seen` is the ground as it stands round the pad now, with the road bed and other pads in it)
  const y = meanHeight(fp, h);
  const base: Rect = { x0: fp.x0 - RW.EDGE, z0: fp.z0 - RW.EDGE, x1: fp.x1 + RW.EDGE, z1: fp.z1 + RW.EDGE };
  const bare: PadPlan = { rect: base, y, skirt: NO_WALL_SKIRT, runs: [], stairs: [], maxH: 0, lenU: 0, faceM2: 0, tall: false, barrier: false, bbox: base };
  const need = sample(base, y, seen).map(r => sideMid(r) >= RW.MIN_H);
  if (!need.some(Boolean)) return bare;
  // the flat apron on the sides that carry a wall (stopping short of what stands beside it)
  const rect: Rect = { ...base };
  const near = others.filter(o => !overlaps(o, fp));
  if (need[0]) rect.z0 -= clearance(base, 0, RW.APRON, near);
  if (need[1]) rect.x1 += clearance(base, 1, RW.APRON, near);
  if (need[2]) rect.z1 += clearance(base, 2, RW.APRON, near);
  if (need[3]) rect.x0 -= clearance(base, 3, RW.APRON, near);
  const runs = maskRuns(sample(rect, y, seen).map(trimRun), near);
  let maxH = 0, lenU = 0, face = 0;
  for (const r of runs) for (const [i0, i1] of wallStretches(r)) for (let i = i0 + 1; i <= i1; i++) {
    const a = Math.abs(r.h[i - 1]), b = Math.abs(r.h[i]), seg = Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
    maxH = Math.max(maxH, a, b);
    lenU += seg; face += seg * (a + b) / 2 * RW.M * RW.M;
  }
  if (maxH < RW.MIN_H) return bare;
  const stairs = planStairs(runs, y, [fp, ...near]);
  const barrier = runs.some(r => r.h.some(v => Math.abs(v) >= RW.BARRIER_H)) && (stairs.length > 0 || runs.some(r => r.h.some(v => Math.abs(v) < RW.BARRIER_H)));
  const g = RW.SKIRT + 0.1 + RW.STAIR_MAX_H * 2;
  const bbox: Rect = { x0: rect.x0 - g, z0: rect.z0 - g, x1: rect.x1 + g, z1: rect.z1 + g };
  return { rect, y, skirt: RW.SKIRT, runs, stairs, maxH, lenU, faceM2: face, tall: maxH * RW.M >= RW.TALL_M, barrier, bbox };
}

/** Stretches of wall in a run, as [first, last] sample indices (at least `RW.MIN_LEN` long): a stair is set into the middle of one, the renderer lays stone along it. */
export function wallStretches(run: WallRun): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const seg = run.pts.length > 1 ? Math.hypot(run.pts[1][0] - run.pts[0][0], run.pts[1][1] - run.pts[0][1]) : 1;
  let a = -1;
  for (let i = 0; i <= run.h.length; i++) {
    const on = i < run.h.length && Math.abs(run.h[i]) >= RW.MIN_H;
    if (on && a < 0) a = i;
    if (!on && a >= 0) { if ((i - 1 - a) * seg >= RW.MIN_LEN) out.push([a, i - 1]); a = -1; }
  }
  return out;
}

function planStairs(runs: readonly WallRun[], y: number, obstacles: readonly Rect[]): WallStair[] {
  const cand: Array<{ s: WallStair; score: number }> = [];
  for (const run of runs) {
    const [nx, nz] = NORMALS[run.side];
    for (const [i0, i1] of wallStretches(run)) {
      if ((i1 - i0) * (run.pts.length > 1 ? Math.hypot(run.pts[1][0] - run.pts[0][0], run.pts[1][1] - run.pts[0][1]) : 0) < RW.STAIR_MIN_LEN) continue;
      const mid = (i0 + i1) / 2;
      for (const off of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
        const i = Math.round(mid + off);
        if (i < i0 + 1 || i > i1 - 1) continue;
        const hh = run.h[i], H = Math.abs(hh);
        if (H < RW.BARRIER_H || H > RW.STAIR_MAX_H) continue;
        const steps = Math.max(2, Math.round(H / RW.RISE)), len = steps * RW.RUN + RW.SKIRT, cut = hh > 0;
        const [px, pz] = run.pts[i];
        const s: WallStair = cut
          ? { x: px + nx * RW.SKIRT, z: pz + nz * RW.SKIRT, dx: -nx, dz: -nz, cut, topY: y + hh, footY: y, steps, len, side: run.side }
          : { x: px, z: pz, dx: nx, dz: nz, cut, topY: y, footY: y + hh, steps, len, side: run.side };
        // a cut stair comes down onto the apron: the building (and its neighbours) must not be in it; a fill stair goes out onto the ground below
        const r = stairRect(s, 0.04);
        if (obstacles.some(o => overlaps(r, o))) continue;
        // the wall under the flight must be steady across its width (no step in the wall there)
        const wl = RW.STAIR_W / 2 + RW.CHEEK + 0.03;
        let steady = true;
        for (let k = 0; k < run.pts.length; k++) if (Math.hypot(run.pts[k][0] - px, run.pts[k][1] - pz) <= wl && Math.abs(Math.abs(run.h[k]) - H) > RW.RISE * 2.2) steady = false;
        if (!steady) continue;
        cand.push({ s, score: (i1 - i0) * 10 - Math.abs(off) });
        break;
      }
    }
  }
  cand.sort((a, b) => b.score - a.score);
  const out: WallStair[] = [];
  for (const c of cand) {
    if (out.length >= RW.MAX_STAIRS) break;
    if (out.some(o => overlaps(stairRect(o, 0.1), stairRect(c.s, 0.1)))) continue;
    out.push(c.s);
  }
  return out;
}

/**
 * Wall height at (x, z) in the slab of a plan (u, 0 outside it): the thing a walk must not cross. The slab is `RW.SKIRT` thick outside the pad edge;
 * `pad` widens it (a person's clearance).
 */
export function wallAt(p: PadPlan, x: number, z: number, pad = 0): number {
  if (x < p.bbox.x0 || x > p.bbox.x1 || z < p.bbox.z0 || z > p.bbox.z1) return 0;
  let best = 0;
  for (const run of p.runs) {
    const [nx, nz] = NORMALS[run.side];
    const a = run.pts[0], b = run.pts[run.pts.length - 1], alongX = run.side % 2 === 0;
    const s0 = alongX ? a[0] : a[1], s1 = alongX ? b[0] : b[1], s = alongX ? x : z;
    const d = alongX ? (z - a[1]) * nz : (x - a[0]) * nx;
    if (d < -pad || d > RW.SKIRT + pad) continue;
    if (s < Math.min(s0, s1) - RW.SKIRT || s > Math.max(s0, s1) + RW.SKIRT) continue;
    const t = Math.max(0, Math.min(1, (s - s0) / (s1 - s0 || 1))), f = t * (run.pts.length - 1), i = Math.min(run.pts.length - 2, Math.floor(f)), u = f - i;
    best = Math.max(best, Math.abs(run.h[i]) * (1 - u) + Math.abs(run.h[i + 1]) * u);
  }
  return best;
}

/** Does this plan's wall stop a walker at (x, z)? (High enough, a barrier at all, and not at one of its stairs.) */
export function blocksWalk(p: PadPlan, x: number, z: number): boolean {
  if (!p.barrier) return false;
  if (wallAt(p, x, z, 0) < RW.BARRIER_H) return false;
  return !inStair(p.stairs, x, z);
}
