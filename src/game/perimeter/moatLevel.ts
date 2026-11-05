/**
 * A moat's water is LEVEL (docs/DECISIONS.md, "Level moat water"). The ditch is dug a constant depth below the ground it crosses, so on a hillside its bed
 * climbs with the slope; a ribbon laid a fixed height over the bed climbs with it and reads as water running uphill. Water lies flat, so a moat on a slope
 * is a stepped chain of level pools, each held by a small stone weir where the bed has risen, and each as deep over its whole length as the ribbon's lift
 * minus the rise it tolerates. Pure (tested).
 */

export interface MoatPools {
  /** Water surface at each sample (constant inside a pool). */
  level: number[];
  /** Pool index of each sample. */
  pool: number[];
  /** Sample indices where a new pool starts (a weir stands between sample i - 1 and i). */
  breaks: number[];
}

/**
 * Pools for a run of bed heights: greedy, a pool grows while the bed within it stays within `tol` of its lowest point, so the water is at least `lift - tol`
 * deep everywhere and never more than `lift` over the lowest bed. `lift` is the depth of the surface over a pool's lowest point.
 */
export function moatPools(bed: readonly number[], lift: number, tol: number): MoatPools {
  const level: number[] = [], pool: number[] = [], breaks: number[] = [];
  let start = 0, lo = Infinity, hi = -Infinity, id = 0;
  const close = (end: number) => { for (let i = start; i < end; i++) { level[i] = lo + lift; pool[i] = id; } };
  for (let i = 0; i < bed.length; i++) {
    const nlo = Math.min(lo, bed[i]), nhi = Math.max(hi, bed[i]);
    if (i > start && nhi - nlo > tol) { close(i); id++; breaks.push(i); start = i; lo = bed[i]; hi = bed[i]; }
    else { lo = nlo; hi = nhi; }
  }
  close(bed.length);
  return { level, pool, breaks };
}

/** Height of the weir between two pools at a break: up to the higher surface, from the lower bed. */
export const weirTop = (a: number, b: number): number => Math.max(a, b) + 0.015;
