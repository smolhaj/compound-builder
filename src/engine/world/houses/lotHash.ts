/** Stable hash of a lot position (UE townGrowthPlan.posHash): 0..1. */
export function posHash(x: number, z: number, k = 0): number {
  let h = Math.imul(Math.round(x * 4) | 0, 73856093) ^ Math.imul(Math.round(z * 4) | 0, 19349663) ^ Math.imul(k + 1, 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
