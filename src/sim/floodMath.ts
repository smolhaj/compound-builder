/**
 * Flood math (docs/scenarios/dam_flood.md). Pure: the variant by region, the stage and how fast it moves, the depth over a floor, the wave's
 * arrival, the mold clock and the well's shock-chlorination clock.
 */
import type { RegionId } from './regions';

export type FloodVariant = 'dam_breach' | 'levee_flood' | 'watershed_cascade';
/** Likely variants by region with weights (doc section 6). */
export const VARIANTS: Record<RegionId, Array<[FloodVariant, number]>> = {
  appalachia: [['watershed_cascade', 0.6], ['dam_breach', 0.4]], rust_belt: [['dam_breach', 1]], mountain_west: [['dam_breach', 0.6], ['levee_flood', 0.4]], pnw: [['levee_flood', 1]],
  ozarks: [['dam_breach', 1]], hill_country: [['dam_breach', 1]], plains: [['levee_flood', 1]], upper_midwest: [['dam_breach', 1]], north_woods: [['dam_breach', 1]],
  new_england: [['watershed_cascade', 0.7], ['dam_breach', 0.3]], desert: [['levee_flood', 1]],
};
export function variantFor(region: RegionId, u: number): FloodVariant {
  let acc = 0;
  for (const [v, w] of VARIANTS[region]) { acc += w; if (u < acc) return v; }
  return VARIANTS[region][0][0];
}

/** Flood stage over the creek's normal water, in feet, at the compound; `u` and `v` are dice. Breach: 14-40 ft at the first reach, decaying `exp(-miles/9)`. */
export function stageFt(variant: FloodVariant, miles: number, u: number): number {
  if (variant === 'levee_flood') return 6 + 14 * u;
  const first = 14 + 26 * u, k = variant === 'watershed_cascade' ? 1.4 : 1;
  return first * Math.exp(-miles / 9) * k * 1.6;
}
/** Minutes between the siren and the wave: `miles / 12 mph` (a Hill Country flash is 30 to 90 minutes). */
export const arrivalMin = (miles: number, flash: boolean): number => (flash ? 30 + 6 * miles : Math.round(miles / 12 * 60));
/** How the water moves over a structure. */
export function flowOf(variant: FloodVariant, depthFt: number): 'still' | 'moving' | 'torrent' {
  if (variant === 'levee_flood') return 'still';
  return variant === 'dam_breach' && depthFt >= 9 ? 'torrent' : 'moving';
}
/** Days the water stands (levee floods stay 2 to 6 weeks). */
export const holdDays = (variant: FloodVariant, u: number): number => (variant === 'levee_flood' ? Math.round(14 + 28 * u) : variant === 'watershed_cascade' ? 4 : 2);

/** Road out by reach: 10 to 120 days. */
export const roadOutDays = (variant: FloodVariant, u: number): number => Math.round(variant === 'watershed_cascade' ? 60 + 60 * u : variant === 'dam_breach' ? 25 + 55 * u : 10 + 35 * u);

export const FT_PER_UNIT = 19.7;
/** Depth of water above the floor (ft): stage above the creek less the ground's rise above it, less what the foundation raises it. */
export const depthOver = (stage: number, riseUnits: number, raisedFt: number): number => stage - riseUnits * FT_PER_UNIT - raisedFt;

/** The mold clock: dried inside 48 hours there is none; wet past that a damaged room molds, and a major one is lost after ten days. */
export type MoldStage = 'none' | 'mold' | 'lost';
export function moldStage(hoursWet: number, dried: boolean): MoldStage { return dried || hoursWet < 48 ? 'none' : hoursWet < 240 ? 'mold' : 'lost'; }

/** A flooded well is unusable until shock-chlorinated (one day) and tested; clears itself at day 30 if nobody does. */
export function wellClearDay(hitDay: number, chlorinatedDay: number | null): number { return chlorinatedDay === null ? hitDay + 30 : Math.min(hitDay + 30, chlorinatedDay + 1 + 3); }
