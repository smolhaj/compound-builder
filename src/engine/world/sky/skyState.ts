/**
 * skyState.ts — pure helpers for the night sky and the sky's light effects
 * (no three.js, no game state). Used by CampusScene / ProceduralSky.
 *
 *  • Moon phase from the visual day (29.53-day synodic month) and where the
 *    moon stands: at full moon it rises at sunset opposite the sun, a waxing
 *    crescent sets soon after the sun, a new moon is lost in the sun's glare —
 *    so about half the nights of a month are moonless.
 *  • Sky darkness (Bortle class, in spirit) from the region and how built-up
 *    the surroundings are: a Mountain West or rural New England campus sees the
 *    Milky Way on a moonless night; a city campus sees a handful of stars in an
 *    orange-grey glow.
 *  • God-ray strength: low sun, sun on screen, broken (not solid) cloud.
 */

/** Synodic month in days. */
export const SYNODIC_MONTH = 29.530589;

/** Moon phase 0–1 for a day index: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
export function moonPhase(day: number, offset = 0.37): number {
  const p = (day / SYNODIC_MONTH + offset) % 1;
  return p < 0 ? p + 1 : p;
}

/** Illuminated fraction of the disc (0 new … 1 full). */
export function moonIllumination(phase: number): number {
  return (1 - Math.cos(2 * Math.PI * phase)) / 2;
}

/**
 * Moon hour angle relative to the sun's (radians). The sky shader / scene put
 * the sun at angle a = 2π·hour/24 − π/2 on its daily circle; the moon lags the
 * sun by 2π·phase (≈ 50 min a day), so a full moon (0.5) is opposite the sun.
 */
export function moonAngle(sunAngle: number, phase: number): number {
  return sunAngle + 2 * Math.PI * phase;
}

/** Name of a phase (QA / tooltips). */
export function moonPhaseName(phase: number): string {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.03 || p > 0.97) return 'new moon';
  if (p < 0.22) return 'waxing crescent';
  if (p < 0.28) return 'first quarter';
  if (p < 0.47) return 'waxing gibbous';
  if (p < 0.53) return 'full moon';
  if (p < 0.72) return 'waning gibbous';
  if (p < 0.78) return 'last quarter';
  return 'waning crescent';
}

/** How dark the night sky is per region (0 = city glow, 1 = remote dark site). */
export const REGION_DARK_SKY: Record<string, number> = {
  mountain_west: 0.95,
  new_england: 0.78,
  midwest_plains: 0.82,
  deep_south: 0.62,
  pacific_northwest: 0.66,
  southern_california: 0.4,
};

/**
 * Night-sky darkness 0–1 for a campus: the region's base, dimmed by an urban
 * site and by the town's growth stage (0 village … 4 university city).
 */
export function skyDarkness(region: string, urban: boolean, townStage = 0): number {
  const base = REGION_DARK_SKY[region] ?? 0.7;
  if (urban) return 0.12;
  const stage = Math.max(0, Math.min(4, townStage));
  return Math.max(0.1, Math.min(1, base - stage * 0.08));
}

/** Milky Way visibility 0–1: needs a dark site, no moon and a clear sky. */
export function milkyWayVisibility(dark: number, moonIllum: number, moonUp: boolean, cloud: number): number {
  const site = Math.max(0, Math.min(1, (dark - 0.55) / 0.35));
  const moon = moonUp ? 1 - 0.85 * moonIllum : 1;
  return site * moon * Math.max(0, 1 - cloud * 1.4);
}

/** Star visibility 0–1 (light pollution + moonlight wash out the faint stars). */
export function starVisibility(dark: number, moonIllum: number, moonUp: boolean): number {
  return Math.max(0.15, Math.min(1, 0.25 + dark * 0.75 - (moonUp ? 0.25 * moonIllum : 0)));
}

/**
 * God rays (crepuscular shafts) strength 0–1: a low sun (golden weight), the
 * sun on or near the screen, and broken cloud — a solid overcast deck has no
 * gaps, a perfectly clear sky has nothing to cast the shafts.
 */
export function godRayStrength(golden: number, onScreen: number, cumulus: number, overcast: number): number {
  const gaps = 0.35 + 0.65 * Math.min(1, cumulus * 1.6);
  return Math.max(0, Math.min(1, golden * onScreen * gaps * (1 - Math.min(1, overcast * 1.25))));
}
