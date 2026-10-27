/**
 * Seasons, deeper (decided with the user: "all of these"). Pure helpers on
 * top of engine/world/season (which already eases snow, ice, fall color and
 * dormant grass): mud season, morning frost, how deep snow drifts against a
 * wall, and when the stock tank skins over.
 */
import { sstep } from './aging';

/**
 * Mud season: from about three weeks before the last spring frost to two
 * weeks after it the frost comes out of the ground and the yard and the
 * drive go to mud (the same window the county posts its road weight limits
 * in, sim/upkeep.ts). Scaled by how cold the winter is (frost depth), and a
 * little by the snow still lying (meltwater). 0–1.
 */
export function mudSeason(doy: number, lastFrost: number, cold: number, snow = 0): number {
  const a = lastFrost - 24, b = lastFrost - 14, c = lastFrost + 8, d = lastFrost + 18;
  const k = doy < a || doy > d ? 0 : doy < b ? sstep(a, b, doy) : doy <= c ? 1 : 1 - sstep(c, d, doy);
  // deep-frozen winters make deep mud; under deep snow the ground is still frozen
  return k * Math.min(1, 0.35 + 0.65 * cold) * (1 - 0.7 * sstep(0.5, 0.9, snow));
}

/**
 * Morning frost: white rime on grass and roofs on cold, clear nights in the
 * shoulder seasons, gone by mid-morning. `cold` = the season's cold (0 summer
 * … 1 deep winter), `snow` lying snow (frost doesn't show under it), `cloud`
 * 0–1 (clouds keep the night warm), `hour` 0–24.
 */
export function frostAt(hour: number, cold: number, snow: number, cloud = 0): number {
  const k = sstep(0.12, 0.5, cold) * (1 - sstep(0.15, 0.5, snow)) * (1 - 0.8 * cloud);
  // forms after midnight, heaviest at dawn, burns off by ≈ 10
  const t = hour < 2 ? 0.4 + hour * 0.2 : hour < 7.5 ? 1 : hour < 10 ? 1 - sstep(7.5, 10, hour) : hour > 22 ? 0.3 * sstep(22, 24, hour) : 0;
  return Math.max(0, Math.min(1, k * t));
}

/** A wall side facing the wind (westerlies) or sheltered from it. */
export type DriftSide = 'windward' | 'lee' | 'flank';

/**
 * Drift depth against a wall (world units, 1 ≈ 6 m) for lying snow `snow`
 * 0–1: a lee drift builds to ≈ 0.6 m and tails out three times its height,
 * the windward side is scoured to a low ridge, the flanks between.
 */
export function driftDepth(snow: number, side: DriftSide): { h: number; reach: number } {
  const s = sstep(0.15, 0.85, snow);
  const h = (side === 'lee' ? 0.1 : side === 'flank' ? 0.055 : 0.035) * s;
  return { h, reach: h * (side === 'lee' ? 3.2 : 2.2) + 0.02 * s };
}

/** Which side a wall faces with respect to a wind blowing toward (wx, wz): its outward normal (nx, nz). */
export function sideFor(nx: number, nz: number, wx: number, wz: number): DriftSide {
  const l = Math.hypot(wx, wz) || 1, d = (nx * wx + nz * wz) / l;
  return d > 0.5 ? 'lee' : d < -0.5 ? 'windward' : 'flank';
}

/** The stock tank skins over: the ponds' winter ice, or a hard morning frost. 0–1 (≥ 0.5 reads as ice). */
export function troughIce(ice: number, frost: number): number {
  return Math.max(0, Math.min(1, Math.max(ice * 1.2, sstep(0.35, 0.8, frost))));
}
