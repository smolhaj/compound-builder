/**
 * The shared harvest (GDS §10.5: "a mutual-aid pact with neighbors: a shared
 * watch and a shared harvest"). In the harvest window every pact household
 * that is home sends its hands (up to three) to the fields for two hours a
 * day each, which comes off the harvest backlog (a standing crop that waits
 * loses yield; sim/daily.ts `careYield`). In return each household takes a
 * share of the crop: 8 % apiece, at most 16 %, so it pays on a big place
 * that falls behind and costs a small one that keeps up. They go home on
 * good terms (disposition climbs a little). Stateless: it reads the pact,
 * the neighbors and the calendar. Pure.
 */
import type { Neighbor } from './encounters';
import { CLEAR_HOURS, dailyOf } from './daily';
import { inPact } from './pact';
import { regionFor } from './climate';
import { seasons } from './regions';
import { calendarOf, type GameState } from './state';

/** Hands a household sends at most, hours each works a day, and the share of the crop a household takes. */
export const MAX_HANDS = 3, HOURS_EACH = 2, SHARE_EACH = 0.08, MAX_SHARE = 0.16;

/** In the harvest window? */
export function inWindow(s: GameState): boolean {
  const doy = calendarOf(s.clock).doy, H = seasons(regionFor(s.site)).harvest;
  return doy >= H[0] && doy < H[1];
}

/** The pact households that come to the harvest today. */
export function harvestHelpers(s: GameState): Neighbor[] {
  if (!inWindow(s)) return [];
  return s.neighbors.filter(n => inPact(s, n.id) && n.status === 'home' && n.members > 0 && n.disposition >= 0);
}

/** Hands in the field from the pact today. */
export const helpHands = (s: GameState): number => harvestHelpers(s).reduce((a, n) => a + Math.min(MAX_HANDS, n.members), 0);

/** Share of the field crop the helpers take home today (0 with none). */
export const harvestShare = (s: GameState): number => Math.min(MAX_SHARE, SHARE_EACH * harvestHelpers(s).length);

/** Once a day: the backlog drops by their hours; they go home friendlier. Returns log lines. */
export function sharedHarvestDay(s: GameState): string[] {
  const help = harvestHelpers(s);
  if (!help.length) return [];
  const lv = dailyOf(s).chores.levels, before = lv.harvest;
  const hours = helpHands(s) * HOURS_EACH;
  lv.harvest = Math.max(0, before - hours * 100 / CLEAR_HOURS.harvest);
  for (const n of help) n.disposition = Math.min(100, n.disposition + 0.2);
  const H = seasons(regionFor(s.site)).harvest, day = calendarOf(s.clock).doy - H[0];
  if (day % 14 !== 0) return [];
  return [`${help.map(n => `The ${n.name}s`).join(' and ')} came to help bring the harvest in: ${helpHands(s)} pairs of hands. They take ${Math.round(harvestShare(s) * 100)} % of the crop home.`];
}
