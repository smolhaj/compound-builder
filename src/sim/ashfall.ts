/**
 * Ash fall and the roof-load clock (docs/scenarios/supervolcano.md). Pure. The old single day-4 roof roll is replaced by a daily load
 * model: `load = inches x density` (5 lb per sq ft per inch wet, 2.5 dry) against each roof's capacity; a strained roof creaks, an
 * over-loaded one rolls to collapse, and shoveling resets the inches. Figures are the doc's design estimates (re-check before they are
 * player-facing claims).
 */
import type { RegionId } from './regions';
import { mulberry32 } from './rng';

/** Median ash at the compound for a Lava Creek-scale eruption (inches), by region (doc section 6). */
export const ASH_MEDIAN: Record<RegionId, number> = {
  mountain_west: 24, plains: 9, north_woods: 3, upper_midwest: 3, ozarks: 1, hill_country: 1, rust_belt: 0.5, appalachia: 0.4, new_england: 0.3, desert: 3, pnw: 0.4,
};
/** Share of days with rain or snow on the ash (it is heavier wet). */
export const WET_SHARE: Record<RegionId, number> = { pnw: 0.4, plains: 0.2, desert: 0.1, mountain_west: 0.25, appalachia: 0.3, new_england: 0.3, rust_belt: 0.3, upper_midwest: 0.25, north_woods: 0.3, ozarks: 0.3, hill_country: 0.2 };

const normal = (r: () => number): number => Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());

/** Total ash at the compound (inches): the regional median times a lognormal (sigma 0.5) and the eruption's scale. */
export function ashTarget(seed: number, region: RegionId, scale = 1): number {
  const r = mulberry32(seed * 977 + 41);
  return Math.max(0.05, ASH_MEDIAN[region] * Math.exp(0.5 * normal(r)) * scale);
}

/** The fall lasts this many days; most of it comes in the first week or two (front-loaded `exp(-d/9)`). */
export const FALL_DAYS = 42;
export const depthAt = (target: number, days: number): number => target * (1 - Math.exp(-Math.min(Math.max(0, days), FALL_DAYS) / 9)) / (1 - Math.exp(-FALL_DAYS / 9));
export const fallToday = (target: number, days: number): number => depthAt(target, days + 1) - depthAt(target, days);

export type AshClass = 'near' | 'heavy' | 'moderate' | 'light';
export const ashClass = (inches: number): AshClass => inches > 12 ? 'near' : inches > 4 ? 'heavy' : inches > 1 ? 'moderate' : 'light';
/** How much of the services' fall the compound's class feels (1 = the curves as written). */
export const CLASS_SEVERITY: Record<AshClass, number> = { near: 1, heavy: 0.85, moderate: 0.6, light: 0.35 };

/** Roof design capacity (lb per sq ft, live plus snow) by kind: the doc's table (mid estimates). Underground and open work have none. */
export const ROOF_CAP: Record<string, number> = {
  timber_cabin: 50, log_house: 50, lodge: 60, lodge_plinth: 60, lodge_solar: 60, stone_house: 50, timber_frame: 60, container_house: 60, adobe_house: 40, cottage: 45, guest_house: 45, moms_house: 45,
  farmhouse: 45, trailer: 25, modular_home: 40, barn: 25, sheep_barn: 25, workshop: 25, metal_garage: 30, garage_solar: 30, chicken_coop: 15, greenhouse: 10, greenhouse_heated: 10, polytunnel: 5, high_tunnel: 5,
  forge: 20, wood_oven: 30, outhouse: 15, filtration_shed: 25, battery_shed: 30, generator_shed: 30, apiary: 10, sugar_shack: 20, stilted_house: 45, cabin_village: 45, gate_garage: 35, equipment_yard: 15,
};
/** Rough roof area (sq ft) for the shoveling hours. */
export const ROOF_SQFT: Record<string, number> = { lodge: 3000, lodge_plinth: 3000, lodge_solar: 3000, barn: 3200, sheep_barn: 2400, workshop: 1600, metal_garage: 900, chicken_coop: 200, greenhouse: 600, greenhouse_heated: 600, polytunnel: 1400, high_tunnel: 1400 };
export const roofSqft = (kind: string): number => ROOF_SQFT[kind] ?? 1300;
export const hasRoofLoad = (kind: string): boolean => kind in ROOF_CAP;

/** Pounds per sq ft per inch. */
export const density = (wet: boolean): number => (wet ? 5 : 2.5);
/** Load over capacity; a braced roof carries a third more. */
export const roofRatio = (inches: number, cap: number, wet: boolean, braced: boolean): number => (inches * density(wet)) / (cap * (braced ? 1.35 : 1));

export type RoofVerdict = 'ok' | 'strain' | 'risk' | 'collapse';
/** The daily verdict: strained from 0.7, a 25% daily roll to collapse from 1.0, at once from 1.5. */
export function roofVerdict(ratio: number, u: number): RoofVerdict {
  if (ratio >= 1.5) return 'collapse';
  if (ratio >= 1) return u < 0.25 ? 'collapse' : 'risk';
  return ratio >= 0.7 ? 'strain' : 'ok';
}

/** Shoveling: 3 person-hours per inch per 1,000 sq ft; a fall roll of 4% per roof-hour wet, 1% dry. */
export const shovelHours = (kind: string, inches: number): number => Math.round(3 * inches * roofSqft(kind) / 1000 * 10) / 10;
export const fallChance = (hours: number, wet: boolean): number => Math.min(0.9, hours * (wet ? 0.04 : 0.01));

/** The USGS forecast of the compound's total, `daysBefore` the fall: the truth with an error that shrinks from 40% (a week out) to 10% (a day). */
export function forecast(target: number, daysBefore: number, seed: number): number {
  const err = daysBefore >= 7 ? 0.4 : daysBefore <= 1 ? 0.1 : 0.1 + 0.3 * (daysBefore - 1) / 6;
  const r = mulberry32(seed * 311 + Math.floor(daysBefore) * 7);
  return Math.max(0.1, target * (1 + err * (2 * r() - 1)));
}

/** The garden's share under the ash: over 4 in the season is lost, under 1 in it hardly matters; weathering lifts it over two years. */
export function ashGrow(inches: number, daysSince: number): number {
  const base = inches > 4 ? 0.05 : inches > 1 ? 0.5 : Math.max(0.85, 1 - 0.1 * inches);
  const weather = Math.min(1, Math.max(0, (daysSince - 300) / 430));
  return Math.min(1, base + (1 - base) * 0.6 * weather);
}
