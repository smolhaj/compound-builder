/**
 * Climate curves for the slow disasters, runaway heat and the ice age (docs/design/climate_disasters.md sections 1.2, 2.2 and 4). Pure.
 *
 *   heat anomaly   0..1, a smoothstep over 4 game years from the hit, then a plateau
 *   cold anomaly   0..1, a smoothstep over 3 game years from the hit, then a plateau
 *   region tables  the summer high / winter low by year and the ground snow load
 *   wet-bulb       Stull (2011) from temperature and humidity; gates outdoor work and sleep
 *   grow factor    the share of an outdoor crop that survives the season's peak heat
 *
 * "Years" is game years since the hit; negative is before it (anomaly 0). Nothing here reads state.
 */
import type { RegionId } from './regions';
import { REGION_IDS } from './regions';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const fin = (v: number, d = 0) => (Number.isFinite(v) ? v : d);
/** Smoothstep of x clamped to 0..1. */
export const smooth01 = (x: number): number => { const t = clamp(fin(x), 0, 1); return t * t * (3 - 2 * t); };

/** Years the heat anomaly takes to reach its plateau (design doc 1.1). */
export const HEAT_RAMP_YEARS = 4;
/** Years the cold anomaly takes to reach its plateau (design doc 2.1). */
export const COLD_RAMP_YEARS = 3;

/** Heat anomaly 0..1 at `years` since the hit (0 before it, 1 from year 4). */
export const heatAnomaly = (years: number): number => smooth01(years / HEAT_RAMP_YEARS);
/** Cold anomaly 0..1 at `years` since the hit (0 before it, 1 from year 3). */
export const coldAnomaly = (years: number): number => smooth01(years / COLD_RAMP_YEARS);

/*
 * ---- Runaway heat: peak summer afternoon high by region, [year 0, year 2, year 4 and later], degrees F (doc 1.2). ----
 * Year 0 is the region's `julyHighF` (NOAA normal). Entries marked REASONED are not in the doc: the doc lists nine regions; upper_midwest and
 * rust_belt are placed between New England and the Great Plains, scaled by their July normal (80 and 82) and how continental they are.
 */
export const HEAT_PEAK_F: Record<RegionId, readonly [number, number, number]> = {
  mountain_west: [86, 104, 120],
  plains: [92, 114, 130],
  desert: [92, 110, 126],
  hill_country: [94, 112, 128],
  ozarks: [90, 108, 122],
  appalachia: [85, 102, 116],
  pnw: [80, 94, 106],
  new_england: [80, 96, 108],
  north_woods: [77, 92, 104],
  upper_midwest: [80, 98, 112], // REASONED
  rust_belt: [82, 98, 112], // REASONED
};

/** Mean January low at year 4 and later, F: the middle of the doc's range (doc 1.2 "Winter low (Jan) yr 4"). Year 0 is the region's `janLowF`. */
export const HEAT_WINTER_LOW_F: Record<RegionId, number> = {
  mountain_west: 21, plains: 26, desert: 30, hill_country: 43, ozarks: 34, appalachia: 33, pnw: 40, new_england: 15, north_woods: 3,
  upper_midwest: 12, // REASONED
  rust_belt: 22, // REASONED
};
/** Year 0 January low (matches `REGIONS[id].janLowF`; a test keeps the two equal). */
export const JAN_LOW_Y0_F: Record<RegionId, number> = {
  mountain_west: 12, appalachia: 25, desert: 20, north_woods: -6, plains: 16, pnw: 34, upper_midwest: 5, new_england: 6, ozarks: 24, hill_country: 35, rust_belt: 18,
};

/** Peak summer afternoon high (F) `years` after the hit: straight lines through the doc's year 0, 2 and 4 values, flat after year 4. */
export function heatPeakF(region: RegionId, years: number): number {
  const [a, b, c] = HEAT_PEAK_F[region], y = clamp(fin(years), 0, HEAT_RAMP_YEARS);
  return y <= 2 ? a + (b - a) * (y / 2) : b + (c - b) * ((y - 2) / 2);
}
/** Mean January low (F) `years` after the hit in a heat disaster (winters lift 15 to 20 F): follows the heat anomaly. */
export function heatWinterLowF(region: RegionId, years: number): number {
  return JAN_LOW_Y0_F[region] + (HEAT_WINTER_LOW_F[region] - JAN_LOW_Y0_F[region]) * heatAnomaly(years);
}

/*
 * ---- Ice age: July high and January low at year 3 and later, and the plateau ground snow load (doc 2.2). ----
 * REASONED rows (not in the doc, which lists eight regions): appalachia, ozarks and rust_belt, set between Hill Country and the northern tier by
 * their year-0 normals (cold drop about 23 F in July, 40 to 50 F in January for the Rust Belt, less in the south).
 */
export interface IceRow { july3: number; jan3: number; snowPsf: number }
export const ICE_AGE: Record<RegionId, IceRow> = {
  north_woods: { july3: 48, jan3: -45, snowPsf: 180 },
  new_england: { july3: 56, jan3: -35, snowPsf: 140 },
  upper_midwest: { july3: 54, jan3: -35, snowPsf: 120 },
  mountain_west: { july3: 62, jan3: -22, snowPsf: 90 },
  plains: { july3: 66, jan3: -24, snowPsf: 40 }, // dry, wind-scoured
  pnw: { july3: 60, jan3: 10, snowPsf: 80 },
  hill_country: { july3: 78, jan3: 8, snowPsf: 15 },
  desert: { july3: 72, jan3: 0, snowPsf: 10 },
  appalachia: { july3: 63, jan3: -15, snowPsf: 60 }, // REASONED
  ozarks: { july3: 70, jan3: -5, snowPsf: 30 }, // REASONED
  rust_belt: { july3: 58, jan3: -28, snowPsf: 100 }, // REASONED
};
/** Year 0 July highs (the region's `julyHighF`). */
export const JULY_HIGH_Y0_F: Record<RegionId, number> = {
  mountain_west: 86, appalachia: 85, desert: 92, north_woods: 77, plains: 92, pnw: 80, upper_midwest: 80, new_england: 80, ozarks: 90, hill_country: 94, rust_belt: 82,
};

/** July high (F) `years` after the hit in an ice age, scaled by `scale` (1 = the doc's year-3 numbers). */
export function iceJulyHighF(region: RegionId, years: number, scale = 1): number {
  const y0 = JULY_HIGH_Y0_F[region];
  return y0 + (ICE_AGE[region].july3 - y0) * coldAnomaly(years) * clamp(fin(scale, 1), 0, 2);
}
/** January low (F) `years` after the hit in an ice age. */
export function iceJanLowF(region: RegionId, years: number, scale = 1): number {
  const y0 = JAN_LOW_Y0_F[region];
  return y0 + (ICE_AGE[region].jan3 - y0) * coldAnomaly(years) * clamp(fin(scale, 1), 0, 2);
}
/** Ground snow load (pounds per square foot): the region's plateau times the cold curve times `coldScale` (1 = normal; up to 1.5). */
export function snowLoadPsf(region: RegionId, years: number, coldScale = 1): number {
  return ICE_AGE[region].snowPsf * coldAnomaly(years) * clamp(fin(coldScale, 1), 0, 1.5);
}

/*
 * ---- Wet-bulb (Stull 2011, "Wet-bulb temperature from relative humidity and air temperature", J. Appl. Meteor. Climatol.) ----
 * Fitted for RH 5 to 99 percent and air temperature -20 to 50 C (-4 to 122 F); accurate to about 1 C. Above that the fit drifts, so the
 * temperature is NOT clamped (the doc's 130 F check lands within about 1.5 F) but humidity is held to 5..99.
 */
export const fToC = (f: number): number => (f - 32) * 5 / 9;
export const cToF = (c: number): number => c * 9 / 5 + 32;
/** Wet-bulb temperature (F) from air temperature (F) and relative humidity (percent). */
export function wetBulbF(tempF: number, rhPct: number): number {
  const T = fToC(fin(tempF, 70)), RH = clamp(fin(rhPct, 50), 5, 99);
  const tw = T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) + Math.atan(T + RH) - Math.atan(RH - 1.676331)
    + 0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) - 4.686035;
  return cToF(tw);
}

/**
 * Afternoon relative humidity (percent) of a region, from its annual rain (`REGIONS[id].rainMm`, or `regionFor(site).rainMm`), by the same
 * dryness the dome code uses: dry = clamp(1.15 - rainMm / 900, 0.1, 0.95) (`dryAir` in dome/live.ts). Dry 0.95 gives 18 percent (desert),
 * 0.1 gives 76 percent (the humid east). A linear map; no new region data.
 */
export function afternoonRh(rainMm: number): number {
  const dry = clamp(1.15 - fin(rainMm) / 900, 0.1, 0.95);
  return 18 + (0.95 - dry) / 0.85 * 58;
}

/** Wet-bulb (F) below which outdoor work is unlimited, and above which it is impossible (doc 1.2). */
export const WORK_FULL_BELOW_WB_F = 80;
export const WORK_NONE_ABOVE_WB_F = 90;
/** Above this wet-bulb (F) nobody can sleep outdoors. */
export const NO_OUTDOOR_SLEEP_WB_F = 85;
/** Share of a normal outdoor work day available at this wet-bulb (F): 1 under 80, 0 above 90, linear between. */
export function outdoorWorkShare(wetBulb: number): number {
  return clamp((WORK_NONE_ABOVE_WB_F - fin(wetBulb, 100)) / (WORK_NONE_ABOVE_WB_F - WORK_FULL_BELOW_WB_F), 0, 1);
}
/** True when sleeping outdoors is safe (wet-bulb 85 F or less). */
export const canSleepOutdoors = (wetBulb: number): boolean => fin(wetBulb, 100) <= NO_OUTDOOR_SLEEP_WB_F;

/** Outdoor crops start to suffer above this season peak (F); each degree above costs `GROW_LOSS_PER_F` of the harvest (98 F gives 0.75, 128 F gives 0). */
export const GROW_PEAK_OK_F = 88;
export const GROW_LOSS_PER_F = 0.025;
/** Outdoor grow factor 0..1 from the season's peak high (F). */
export const outdoorGrowFactor = (peakF: number): number => Math.max(0, 1 - GROW_LOSS_PER_F * Math.max(0, fin(peakF, 200) - GROW_PEAK_OK_F));

/** Every region id (for table-coverage tests and loops). */
export const CLIMATE_REGIONS: readonly RegionId[] = REGION_IDS;
