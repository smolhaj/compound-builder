/**
 * Earthquake math (docs/scenarios/mega_quake.md). Pure: the variant and the shaking band by region, the Omori aftershock schedule, the demand
 * surge, and the inspectors' tag count.
 */
import type { RegionId } from './regions';

export type QuakeVariant = 'cascadia' | 'wasatch' | 'new_madrid' | 'rift' | 'east' | 'induced';
export type Band = 'A' | 'B' | 'C';

export const VARIANT_OF: Record<RegionId, QuakeVariant> = {
  pnw: 'cascadia', mountain_west: 'wasatch', ozarks: 'new_madrid', desert: 'rift', appalachia: 'east', new_england: 'east', rust_belt: 'east', plains: 'induced', hill_country: 'induced', upper_midwest: 'induced', north_woods: 'induced',
};
export const MAIN_MAG: Record<QuakeVariant, number> = { cascadia: 9.0, wasatch: 7.3, new_madrid: 7.8, rift: 6.9, east: 5.9, induced: 5.6 };
/** Share of the county affected (sets the crews' lead time). */
export const BAND_SHARE: Record<Band, number> = { A: 0.6, B: 0.25, C: 0.04 };
/** How much of the service curves' fall this band feels (1 = as written). */
export const BAND_SEV: Record<Band, number> = { A: 1, B: 0.65, C: 0.3 };
/** Aftershock scale by band (doc: A 1.0, B 0.5, C 0.15). */
export const BAND_AFTER: Record<Band, number> = { A: 1, B: 0.5, C: 0.15 };

/** The epicentral band at this place: the home region is in the rupture zone, a neighbor of it, or only feels the supply shock. */
export function bandFor(region: RegionId, u: number): Band {
  const v = VARIANT_OF[region];
  if (v === 'cascadia' || v === 'new_madrid') return u < 0.8 ? 'A' : 'B';
  if (v === 'wasatch') return u < 0.6 ? 'A' : 'B';
  if (v === 'rift') return u < 0.3 ? 'A' : 'B';
  if (v === 'east') return u < 0.15 ? 'B' : 'C';
  return u < 0.05 ? 'B' : 'C';
}
/** Shaking at the compound (MMI) from the band. */
export const bandMmi = (b: Band, u: number): number => b === 'A' ? 7.8 + 1.3 * u : b === 'B' ? 6.2 + 1 * u : 4.6 + 0.8 * u;
/** Seconds of shaking. */
export const shakeSeconds = (b: Band, u: number): number => Math.round(b === 'A' ? 180 + 120 * u : b === 'B' ? 60 + 60 * u : 10 + 30 * u);

/** Omori: the chance of a strong aftershock on day `t` after the shock: clamp(0.9 / (1 + t/4), 0.02, 0.9) x band scale. */
export const omoriP = (t: number, b: Band): number => Math.min(0.9, Math.max(0.02, 0.9 / (1 + t / 4))) * BAND_AFTER[b];
/** Bath's law: the largest aftershock is about 1.2 below the main shock; later ones are smaller. */
export const aftershockMag = (main: number, t: number, u: number): number => Math.round(Math.max(4.2, main - 1.2 - 0.5 * Math.log2(1 + t / 3) - 0.8 * u) * 10) / 10;
/** A day's expected aftershock chance after a long time (365-day tail). */
export const TAIL_DAYS = 365;

/** The shop price level: materials x1.4 week 1, x2.0 weeks 2-8, down to x1.2 by month 6; blended with the rest of the shelf, scaled by the band. */
export function surge(days: number, b: Band): number {
  if (days < 0) return 1;
  const mat = days < 7 ? 1.4 : days < 56 ? 2.0 : days < 180 ? 2.0 - 0.8 * (days - 56) / 124 : Math.max(1, 1.2 - 0.2 * (days - 180) / 185);
  return 1 + (mat - 1) * 0.55 * (b === 'A' ? 1 : b === 'B' ? 0.6 : 0.3);
}
/** Houses tagged red by the county inspectors (a count for the radio): grows over the first month. */
export const redTags = (share: number, days: number): number => Math.round(1000 * share * Math.min(1, days / 30) * 0.35);
