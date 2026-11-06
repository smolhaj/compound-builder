import { pluralize } from './words';
/**
 * Starvation on Cozy: warn, then kill slowly. (Standard / Hardcore: unchanged,
 * hunger takes health down and nothing holds it at the floor.)
 *
 * Cozy used to hold health at 5 for good, so a family that never ate at all
 * stayed alive for years. Now a person who has gone hungry-and-unfed for
 * STARVE_WARN days gets a warning, and after STARVE_GRACE consecutive such days
 * the floor comes off for them, the weakest first (kids, the old, the sick), then
 * the rest spread over a few weeks by a per-person offset. Eating (at least half
 * the day's need) resets the count. Pure: no state beyond `Needs.starved`.
 */

/** Hunger (kcal short, accumulated) at which health starts to fall hard (needs.ts). */
export const STARVE_LEVEL = 15000;
/** Consecutive starving days before the Family panel and log warn. */
export const STARVE_WARN = 30;
/** Consecutive starving days before anyone can die (Cozy). */
export const STARVE_GRACE = 120;
/** Extra days a healthy adult holds out past STARVE_GRACE (vulnerable people: 0), plus up to JITTER by id. */
export const STARVE_ROBUST_EXTRA = 30, STARVE_JITTER = 40;
/** Past their time the floor sinks this much a day (from 5 to 0), so health drains over STARVE_FLOOR/STARVE_DRAIN = 50 days before death. */
export const STARVE_FLOOR = 5, STARVE_DRAIN = 0.1;
/** needs.hunger is clamped here: far past the 15,000 where health falls (a month of full starvation is ~70,000). */
export const HUNGER_MAX = 400_000;

/** A day counts when the person ate under half their need and hunger is at starvation level. */
export const isStarvingDay = (hunger: number, shortShare: number): boolean => hunger > STARVE_LEVEL && shortShare > 0.5;

/** Next value of the consecutive-starving-days counter. */
export const nextStarved = (days: number, hunger: number, shortShare: number): number =>
  isStarvingDay(hunger, shortShare) ? days + 1 : 0;

export interface Frailty { kid: boolean; age: number; sick: boolean; id: string }
/** Starving days before this person's floor lifts: the weakest first, the rest staggered. */
export function starveThreshold(f: Frailty): number {
  const weak = f.kid || f.age >= 65 || f.sick;
  let h = 7; for (let k = 0; k < f.id.length; k++) h = Math.imul(h ^ f.id.charCodeAt(k), 16777619) >>> 0;
  const jitter = h % (STARVE_JITTER + 1);
  return STARVE_GRACE + (weak ? 0 : STARVE_ROBUST_EXTRA) + jitter;
}

/** The lowest health Cozy lets someone fall to: 5 until their time, then sinking to 0 over ~50 days (so it can kill). Others: 0. */
export function healthFloor(cozy: boolean, starved: number, f: Frailty): number {
  if (!cozy) return 0;
  return Math.max(0, Math.min(STARVE_FLOOR, STARVE_FLOOR - (starved - starveThreshold(f)) * STARVE_DRAIN));
}

/** Warning text once someone has been starving a while (Cozy), else null. */
export function starveWarning(name: string, starved: number): string | null {
  return starved >= STARVE_WARN ? `${name} has been starving for ${pluralize(starved, 'day')}; they will begin to die if this goes on` : null;
}
