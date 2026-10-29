/**
 * How a person gets from where they stand to where the work is on ground that is not flat and not empty (docs/DECISIONS.md, "Terrain has
 * mechanics"): straight, when nothing is in the way; along the worn trails, when the way round is not absurd; else a local search round whatever
 * a straight walk cannot cross (a building, a wall, the creek, a cliff band). Pure (tested with a synthetic world); the world gives it the tests.
 */
import { findRoute, type Pt } from '../../sim/pathRoute';

/** Ground steeper than this (rise over run) is a cliff: nobody walks up it (the sim's terrain pass calls 0.85 "needs a ladder"). */
export const WALK_CLIFF = 1.0;

export interface WalkWorld {
  /** Padded: something is in the way (the search keeps off it). */
  blocked: (x: number, z: number) => boolean;
  /** What a straight walk cannot cross: buildings, built wall, water, cliff ground (trees do not count: people thread them). */
  hard: (x: number, z: number) => boolean;
  /** Extra cost of walking here (slopes); 1 = easy. */
  cost?: (x: number, z: number) => number;
}

/** Does the straight line a -> b cross something hard? The two ends' own clearance (a doorway, the garden you are going into) is ignored. */
export function crossesHard(hard: (x: number, z: number) => boolean, a: Pt, b: Pt, ends = 1.3, every = 0.2): boolean {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / every));
  for (let k = 0; k <= n; k++) {
    const d = L * k / n;
    if (d < ends || L - d < ends) continue;
    if (hard(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)) return true;
  }
  return false;
}

/** The nearest free point to p on the line toward `toward` (a goal inside a garden's footprint, a start in a doorway). */
function backOff(p: Pt, toward: Pt, blocked: (x: number, z: number) => boolean): Pt {
  if (!blocked(p[0], p[1])) return p;
  const L = Math.hypot(toward[0] - p[0], toward[1] - p[1]) || 1, ux = (toward[0] - p[0]) / L, uz = (toward[1] - p[1]) / L;
  for (let d = 0.1; d <= Math.min(L, 3); d += 0.1) { const x = p[0] + ux * d, z = p[1] + uz * d; if (!blocked(x, z)) return [x, z]; }
  return p;
}

/**
 * The points to pass through from `from` to `to` ([] = walk straight). `viaPaths(detour)` is the trail network's answer (game/paths routeVia) for a
 * detour factor: the first ask is the usual one; when the straight line is bad, up to about three times as long is better than through a wall.
 */
export function walkRoute(from: Pt, to: Pt, w: WalkWorld, viaPaths: (detour: number) => Pt[]): Pt[] {
  const trail = viaPaths(1.3);
  if (trail.length) return trail;
  if (!crossesHard(w.hard, from, to)) return [];
  const wide = viaPaths(3.2);
  if (wide.length) return wide;
  const a = backOff(from, to, w.blocked), b = backOff(to, from, w.blocked);
  const r = findRoute(a, b, { blocked: w.blocked, cost: w.cost, margin: 12, step: 0.5, meander: 0 });
  if (!r || r.length < 2) return [];
  const out = r.filter(p => Math.hypot(p[0] - from[0], p[1] - from[1]) > 0.12);
  out.push(to);
  return out;
}

/** Pace on a grade (rise over run, uphill positive): slower climbing steep ground, a little slower picking down it. 1 on the flat. */
export function slopePace(grade: number): number {
  const up = Math.max(0, grade - 0.08), down = Math.max(0, -grade - 0.18);
  return Math.max(0.35, 1 / (1 + 1.6 * up + 0.7 * down));
}

/** A stretch of a trail that climbs steeply enough to want steps (a riser between terraces): indices into the trail's points. */
export interface StairRun { a: number; b: number; lenU: number; riseU: number }

/**
 * Where a trail needs a dry-stack stair: stretches whose grade is over `minGrade` (default 0.32, about 18 degrees) for at least `minLen` units
 * (0.6 u = 3.6 m), with a gap of one gentle segment allowed inside a run. Crossing a riser stays a cost (the router's slope cost and `slopePace`);
 * the stair is what makes it a walkable one.
 */
export function stairRuns(line: readonly Pt[], height: (x: number, z: number) => number, minGrade = 0.32, minLen = 0.6): StairRun[] {
  const out: StairRun[] = [];
  let a = -1, last = -1;
  const close = () => {
    if (a >= 0 && last > a) {
      let len = 0;
      for (let k = a + 1; k <= last; k++) len += Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]);
      const rise = Math.abs(height(line[last][0], line[last][1]) - height(line[a][0], line[a][1]));
      if (len >= minLen && rise / Math.max(len, 1e-6) >= minGrade * 0.8) out.push({ a, b: last, lenU: len, riseU: rise });
    }
    a = -1; last = -1;
  };
  for (let k = 1; k < line.length; k++) {
    const d = Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]) || 1e-6;
    const steep = Math.abs(height(line[k][0], line[k][1]) - height(line[k - 1][0], line[k - 1][1])) / d >= minGrade;
    if (steep) { if (a < 0) a = k - 1; last = k; }
    else if (a >= 0 && k - last > 1) close();
  }
  close();
  return out;
}
