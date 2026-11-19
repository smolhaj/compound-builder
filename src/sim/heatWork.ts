/**
 * Outdoor work in a runaway-heat disaster (docs/design/climate_disasters.md 1.2 and decision Q4): the share of a work hour a person can give
 * outdoors falls with the wet-bulb temperature, 1 under 80 F and 0 above 90 F (climateCurve.outdoorWorkShare), so by year three the middle of
 * the day is closed and only dawn and the night windows are left. Read by the engine's hourly work rate; 1 for every other situation.
 * Wet-bulb comes from the shared air temperature (dome/live.outside) and the region's humidity (slowClimate.heatRh). Pure.
 */
import type { GameState } from './state';
import { calendarOf } from './state';
import type { Duty } from './daily';
import { outside } from './dome/live';
import { dayPeakF, heatWorkShare, slowActive } from './slowClimate';

/** The duties worked outdoors (the gate applies to these only; cooking, cleaning, teaching and the radio are indoors). */
export const OUTDOOR_DUTIES: ReadonlySet<Duty> = new Set<Duty>(['build', 'garden', 'fields', 'livestock', 'wood', 'water', 'hunt', 'repairs']);

/** The air now (F) and the share of an outdoor work hour it allows (0..1). */
export function outdoorWorkNow(s: GameState): { airF: number; wetBulbShare: number } {
  if (!slowActive(s, 'runaway_heat')) return { airF: outside(s).f, wetBulbShare: 1 };
  const airF = outside(s).f, peak = Math.max(airF, dayPeakF(s, calendarOf(s.clock).doy));
  return { airF, wetBulbShare: heatWorkShare(s, airF, peak) };
}

/** Multiplier on a person's work rate this hour for this duty (1 outside a heat disaster, or for an indoor duty). */
export function heatWorkRate(s: GameState, duty: Duty): number {
  if (!slowActive(s, 'runaway_heat') || !OUTDOOR_DUTIES.has(duty)) return 1;
  return outdoorWorkNow(s).wetBulbShare;
}
