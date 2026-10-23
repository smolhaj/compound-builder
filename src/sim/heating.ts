/**
 * The wood stove (GDS §2.4 heat): the tent's (later the cabin's) stove burns
 * firewood on cold days. Mountain West heating season ≈ October–April; a
 * small cabin burns ~4–5 cords a winter (≈ 0.12 rick a day in January).
 * Running out is logged (comfort / health effects come with needs). Pure.
 */
import { log } from './economy';
import { calendarOf, dayIndex, type GameState } from './state';

/** Heating demand 0–1 by day of year (peaks mid-January, nil June–August). */
export function heatDemand(doy: number): number {
  const c = 0.5 + 0.5 * Math.cos(2 * Math.PI * (doy - 15) / 365);
  return Math.max(0, (c - 0.3) / 0.7);
}

/** Ricks burned per day at full demand. */
export const BURN_PER_DAY = 0.12;

/** Burn `days` worth of firewood (called each sub-step). */
export function burnFirewood(s: GameState, days: number): void {
  const d = heatDemand(calendarOf(s.clock).doy);
  if (d <= 0) return;
  s.heat.burned += d * BURN_PER_DAY * days;
  while (s.heat.burned >= 1) {
    if (s.stock.firewood <= 0) {
      s.heat.burned = 1;
      const day = dayIndex(s.clock.t);
      if (s.heat.warned !== day) { s.heat.warned = day; log(s, 'Out of firewood: a cold night at camp. Mark some trees to fell.'); }
      return;
    }
    s.stock.firewood--;
    s.heat.burned -= 1;
  }
}
