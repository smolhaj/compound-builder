/**
 * The dome's water (owner decision 2 of 2026-11-18): the shell is a roof, so it catches the rain and the snowmelt for the cisterns (after a
 * first-flush diverter and a sand filter if the loop is fitted); a graywater loop reuses sink and shower water on the beds and the toilets; a
 * full recycle loop treats the wastewater too and drinks it again; and the beds under glass give back their breath as condensate on the cold
 * coils. The evaporative cooling pads drink water on a hot day (dome/climate.ts). Pure (tested). Liters inside (utilities.ts), gallons in text.
 */
import type { DomeTier } from './tiers';
import { shellFt } from './tiers';
import { domeGeometry } from './geometry';

export type WaterLoop = 'none' | 'grey' | 'recycle';
export const WATER_LOOPS: readonly WaterLoop[] = ['none', 'grey', 'recycle'];
export const LOOP_NAME: Record<WaterLoop, string> = { none: 'No loop', grey: 'Graywater loop', recycle: 'Full recycle loop' };

/** Share of the household water of the people living under the shell that goes round again. */
export const REUSE: Record<WaterLoop, number> = { none: 0, grey: 0.35, recycle: 0.8 };
/** Share of the rain on the footprint that reaches the cistern: glazing sheds it cleanly; a sod roof keeps most. Unfiltered loses a third to the first flush and debris. */
export const CATCH_EFF: Record<DomeTier, number> = { earthen: 0.25, geodesic: 0.8, glass: 0.85, arcology: 0.85 };
export const UNFILTERED_K = 0.66;
/** Liters of condensate a day one bed under glass gives back to the sump (transpiration caught on the cooling coils). */
export const CONDENSATE_L_PER_BED = 18;
export const SQFT_TO_M2 = 0.0929;

export const loopUsd = (tier: DomeTier, cells: number, level: WaterLoop): number => {
  const fp = domeGeometry(tier, shellFt(tier, cells)).footprintSf;
  if (level === 'none') return 0;
  return Math.round((level === 'grey' ? 9_000 + 3.5 * fp : 40_000 + 14 * fp) / 1000) * 1000;
};
/** Pumps, UV and the membrane skid, kW. */
export const loopKw = (tier: DomeTier, cells: number, level: WaterLoop): number => {
  const fp = domeGeometry(tier, shellFt(tier, cells)).footprintSf;
  return level === 'none' ? 0 : level === 'grey' ? 0.12 + fp / 40_000 : 0.45 + fp / 9_000;
};

/** Liters a day the shell sends to the cistern for a day's rain (mm a day, region-scaled by the caller). */
export function rainCatchL(tier: DomeTier, cells: number, rainMmDay: number, loop: WaterLoop): number {
  const g = domeGeometry(tier, shellFt(tier, cells));
  return g.footprintSf * SQFT_TO_M2 * Math.max(0, rainMmDay) * CATCH_EFF[tier] * (loop === 'none' ? UNFILTERED_K : 1);
}
/** Liters a day the loop gives back, for the people under the shell at the household's per-person use. */
export const reuseL = (people: number, perPersonL: number, loop: WaterLoop): number => Math.max(0, people) * Math.max(0, perPersonL) * REUSE[loop];
/** Condensate recovered a day (only while the coils run). */
export const condensateL = (beds: number, powered: boolean): number => powered ? Math.max(0, beds) * CONDENSATE_L_PER_BED : 0;
export const GAL_PER_L = 0.264172;
