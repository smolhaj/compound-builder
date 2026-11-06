/**
 * A moat is a dug channel with a bank on BOTH sides (docs/DECISIONS.md, "Gate realism 4"). A ditch cut a fixed depth below the ground it crosses leaves no bank on
 * the downhill side of a hillside: the water ribbon is clipped to a thin ragged strip and reads as a zigzag. Instead the channel is graded the way a crew would
 * dig it (about 13 m wide at the water, 3 m deep, 1 : 2.4 earth banks: several cells of the terrain mesh across, so the channel is drawn rather than aliased to a sawtooth): the bed of each pool is flat and level across, the uphill side is cut back (steeper above the water), the downhill side is built up with the spoil to a
 * level crest a hand's width above the water, and the crest falls away to the hillside. Pools are separated by a short drop. Pure (tested): the terrain asks
 * `moatHeight`, the water builder asks `waterBed` / `breakAt`.
 */
import { moatPools } from './moatLevel';

export type Pt = readonly [number, number];

/** Dimensions in world units (1 u about 6 m). The water is `WATER_DEPTH` over the bed at full. */
export const MOAT = {
  /** Cut below the natural ground at the pool's lowest point. */
  depth: 0.5,
  /** Half width of the flat bed. */
  bedHalf: 0.2,
  /** Run per unit of rise on the wet batter, and above the crest on the cut face. */
  wetRun: 2.4, faceRun: 0.9,
  /** Crest height over the bed; the water is at most `waterMax` over it, so the freeboard is the difference. */
  crest: 0.46, waterMax: 0.36,
  /** Width of the level crest, and the fall of the outer slope of a built-up bank (run per unit of drop). */
  crestWidth: 0.3, fallRun: 3,
  /** Reach of the whole earthwork from the center line. */
  reach: 3.9, fade: 0.9,
  /** Distance either side of a pool break over which the bed steps. */
  stepHalf: 0.22,
  /** The water surface falls a pool's step over this far either side of the break (inside `stepHalf`: the bed is already falling there). */
  dropHalf: 0.14,
  /** A pool may span this much of natural fall (the high end is cut deeper). */
  tol: 0.16,
  /** Sample spacing along the line. */
  spacing: 0.3,
} as const;

export interface MoatChannel {
  /** The center line. */
  pts: Pt[];
  length: number;
  /** Bed height of each pool, and the arc positions where one pool ends and the next begins (`breaks.length + 1 === bed.length`). */
  bed: number[];
  breaks: number[];
}

/** Distance to a polyline and the distance along it of the closest point. */
export function closestOnPolyline(pts: ReadonlyArray<Pt>, x: number, z: number): { d: number; s: number } {
  let best = Infinity, bestS = 0, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, l = Math.sqrt(l2);
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) { best = d; bestS = acc + t * l; }
    acc += l;
  }
  return { d: best, s: bestS };
}

const polyLen = (pts: ReadonlyArray<Pt>): number => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; };
function pointAt(pts: ReadonlyArray<Pt>, s: number): Pt {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (s <= acc + l || i === pts.length - 1) { const t = l > 0 ? Math.max(0, Math.min(1, (s - acc) / l)) : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; }
    acc += l;
  }
  return pts[0];
}

/** Plan the channel along a center line over natural ground `natural(x, z)`. */
export function planMoatChannel(pts: ReadonlyArray<Pt>, natural: (x: number, z: number) => number): MoatChannel {
  const length = polyLen(pts), n = Math.max(1, Math.ceil(length / MOAT.spacing));
  const ss = Array.from({ length: n + 1 }, (_, i) => length * i / n);
  const bedH = ss.map(s => { const p = pointAt(pts, s); return natural(p[0], p[1]) - MOAT.depth; });
  const pl = moatPools(bedH, 0, MOAT.tol);
  const bed: number[] = [], breaks: number[] = [];
  for (let i = 0; i < bedH.length; i++) if (i === 0 || pl.pool[i] !== pl.pool[i - 1]) bed.push(pl.level[i]);
  for (const b of pl.breaks) breaks.push((ss[b - 1] + ss[b]) / 2);
  return { pts: pts.map(p => [p[0], p[1]] as Pt), length, bed, breaks };
}

/** The pool a position along the line falls in. */
export function poolAt(ch: MoatChannel, s: number): number { let i = 0; while (i < ch.breaks.length && s >= ch.breaks[i]) i++; return i; }
/** The bed of the pool at `s` with the drop to the next pool rounded over `stepHalf` either side (the terrain). */
export function waterBed(ch: MoatChannel, s: number): number {
  const i = poolAt(ch, s);
  if (i > 0 && s - ch.breaks[i - 1] < MOAT.stepHalf) { const t = (s - ch.breaks[i - 1] + MOAT.stepHalf) / (2 * MOAT.stepHalf); return lerpS(ch.bed[i - 1], ch.bed[i], t); }
  if (i < ch.breaks.length && ch.breaks[i] - s < MOAT.stepHalf) { const t = (s - ch.breaks[i] + MOAT.stepHalf) / (2 * MOAT.stepHalf); return lerpS(ch.bed[i], ch.bed[i + 1], t); }
  return ch.bed[i];
}
const lerpS = (a: number, b: number, t: number) => { const u = Math.max(0, Math.min(1, t)); return a + (b - a) * (u * u * (3 - 2 * u)); };
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Half width of the water at `lift` over the bed (the wet batter). */
export const waterHalf = (lift: number): number => MOAT.bedHalf + MOAT.wetRun * lift;

/** Ground height at (x, z) with the channel dug, from the height `h0` the ground has without it. `k` (0-1) is how much of the dig is done. */
export function moatHeight(ch: MoatChannel, x: number, z: number, h0: number, k = 1, gates: ReadonlyArray<{ at: number; w: number }> = []): number {
  const { d, s } = closestOnPolyline(ch.pts, x, z);
  if (d >= MOAT.reach) return h0;
  for (const g of gates) if (Math.abs(s - g.at) < g.w / 2) return h0;
  const yb = waterBed(ch, s), yc = yb + MOAT.crest, wb = MOAT.bedHalf;
  const dc = wb + MOAT.crest * MOAT.wetRun;                                    // where the wet batter reaches the crest
  const B = d <= wb ? yb : d <= dc ? yb + (d - wb) / MOAT.wetRun : yc + (d - dc) / MOAT.faceRun;
  const F = d <= dc + MOAT.crestWidth ? yc : yc - (d - dc - MOAT.crestWidth) / MOAT.fallRun;
  const target = Math.max(Math.min(h0, B), Math.min(B, F));
  const w = (1 - sstep(MOAT.reach - MOAT.fade, MOAT.reach, d)) * k;
  return h0 + (target - h0) * w;
}
