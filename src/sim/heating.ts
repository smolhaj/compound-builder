/**
 * The wood stove (GDS §2.4 heat): the tent's (later the cabin's) stove burns
 * firewood on cold days. Mountain West heating season ≈ October–April; a
 * small cabin burns ~4–5 cords a winter (≈ 0.12 rick a day in January).
 * Running out is logged (comfort / health effects come with needs). Pure.
 */
import { log } from './economy';
import { burnRick } from './upkeep';
import { calendarOf, dayIndex, type GameState } from './state';
import { climate } from './effects';

import { roofLoss } from './improvements';
import { isHome } from './blueprints';
import { isFinished } from './construction';
import { regionFor } from './climate';
import { heatFactor } from './housingStyles';

/** Heating demand 0–1 by day of year (peaks mid-January, nil June–August). */
export function heatDemand(doy: number): number {
  const c = 0.5 + 0.5 * Math.cos(2 * Math.PI * (doy - 15) / 365);
  return Math.max(0, (c - 0.3) / 0.7);
}

/** Days between reminders while the woodpile stays empty. */
export const OUT_REMINDER_DAYS = 14;

/** Ricks burned per day at full demand. */
export const BURN_PER_DAY = 0.12;

/** Today's heating demand (0 = none, ~1.6 = a bitter cold snap), with a leaky roof. */
export function demandNow(s: GameState): number {
  return Math.min(2, (heatDemand(calendarOf(s.clock).doy) * regionFor(s.site).cold + climate(s).cold) * roofLoss(s) * heatFactor(s));
}

/** Burn `days` worth of firewood (called each sub-step). */
export function burnFirewood(s: GameState, days: number): void {
  const d = demandNow(s);
  if (d <= 0) return;
  s.heat.burned += d * BURN_PER_DAY * days;
  while (s.heat.burned >= 1) {
    if (!burnRick(s)) {
      s.heat.burned = 1;
      const day = dayIndex(s.clock.t);
      // (in the house once there is one: the line used to say "at camp" for years after the cabin went up)
      const home = s.structures.find(x => isHome(x.kind) && isFinished(x));
      // once, then a reminder every two weeks (the daily line used to fill the log for whole winters); a change of place says it again
      const place = home ? `in the ${home.kind.replace(/_/g, ' ')}` : 'at camp';
      const prev = [...s.log].reverse().find(e => e.text.startsWith('Out of firewood'));
      if (s.heat.warned !== day && (s.heat.warned < 0 || day - s.heat.warned >= OUT_REMINDER_DAYS || !prev || !prev.text.includes(place))) {
        const again = s.heat.warned >= 0 && !!prev && prev.text.includes(place);
        s.heat.warned = day;
        log(s, `${again ? 'Out of firewood still' : 'Out of firewood'}: a cold night ${place}. Order a few ricks in the Shop (Heat), or mark trees to fell: green wood needs about nine months to season.`);
      }
      return;
    }
    s.heat.burned -= 1;
  }
}

/**
 * Where the woodpile stands against the next two months of cold: ricks in
 * hand (seasoned only: green wood is not ready for months), ricks the stove
 * will burn, and what is short. Pure; drives the "Most pressing" firewood prompt.
 */
export function firewoodOutlook(s: GameState, horizon = 60): { have: number; need: number; short: number; coldNow: boolean } {
  const doy = calendarOf(s.clock).doy, cold = regionFor(s.site).cold;
  let need = 0;
  for (let k = 0; k < horizon; k++) need += heatDemand(((doy - 1 + k) % 365) + 1) * cold * BURN_PER_DAY;
  const have = s.stock.firewood;
  return { have, need, short: Math.max(0, need - have), coldNow: demandNow(s) > 0 };
}
