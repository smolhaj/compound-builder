/**
 * Milk into cheese and butter (user-approved, part of livestock depth).
 * Pure.
 *
 * The family drinks about a quart a head a day (≈ 600 kcal). Past that:
 *  Butter   from the cow's cream (goat milk barely separates without a
 *           cream separator): ≈ 21 lb of Jersey milk skims and churns to a
 *           pound of butter (≈ 3,250 kcal), ≈ 0.4 person-hours; the skim
 *           (≈ 1,900 kcal of it) goes to the pigs, or is drunk.
 *  Cheese   with a cheese kit (press, molds, cultures, rennet): ≈ 10 lb of
 *           milk to a pound of hard cheese (≈ 1,800 kcal, 62 % of the
 *           milk's calories), ≈ 1.5 person-hours a pound; the whey to the
 *           pigs. Waxed and kept cool it lasts a year.
 *  The rest goes in the fresh food (and sours within days), or to the pigs.
 * Skim and whey stand in for bagged pig feed (about a pound of feed a
 * gallon of skim).
 */
import type { GameState } from './state';
import { addFood } from './pantry';
import { book, hoursLeft, LABOR } from './farmWork';
import { isOff } from './preserving';
import type { Livestock } from './livestock';

export interface DairyState {
  /** Today's milk (kcal), drunk, and made into butter / cheese (lb). */
  day: number;
  milk: number;
  drank: number;
  butterLb: number;
  cheeseLb: number;
  /** This year's butter and cheese (lb), the year. */
  year: number;
  butterYear: number;
  cheeseYear: number;
}
export const newDairy = (): DairyState => ({ day: -1, milk: 0, drank: 0, butterLb: 0, cheeseLb: 0, year: 0, butterYear: 0, cheeseYear: 0 });

export const DRINK_KCAL = 600;
/** Whole Jersey milk a lb of butter takes (kcal), and the skim left (kcal); milk a lb of cheese takes (kcal) and its kcal. */
export const BUTTER_MILK_KCAL = 21 * 290, BUTTER_KCAL = 3250, SKIM_KCAL = 1900;
export const CHEESE_MILK_KCAL = 10 * 290, CHEESE_KCAL = 1800;
const SKIM_FEED_LB = 2, WHEY_FEED_LB = 0.5;

/** The day's milk (livestock.ts): drunk, churned, pressed, or to the pigs (`pigs`). Sets `l.slop` (lb of feed the skim and whey stand in for). */
export function dairyDay(s: GameState, l: Livestock, goat: number, cow: number, people: number, pigs: boolean): void {
  const d = l.dairy, day = Math.floor(s.clock.t + 0.25), year = Math.floor((s.clock.startDoy - 1 + day) / 365) + s.clock.startYear;
  if (d.year !== year) { d.year = year; d.butterYear = 0; d.cheeseYear = 0; }
  d.day = day; d.milk = goat + cow; d.butterLb = 0; d.cheeseLb = 0;
  l.slop = 0;
  if (d.milk <= 0) { d.drank = 0; return; }
  let fresh = Math.min(d.milk, people * DRINK_KCAL);
  d.drank = fresh;
  // what's past the drinking, the cow's share first to the churn
  let cowLeft = Math.max(0, cow - fresh * (cow / d.milk)), goatLeft = Math.max(0, goat - fresh * (goat / d.milk));
  // with a cheese kit, half the cow's surplus to the press and half to the churn
  const cheesing = (s.stock.cheese_kit ?? 0) >= 1 && !isOff(s, 'cheese');
  if (cowLeft >= BUTTER_MILK_KCAL / 4 && !isOff(s, 'butter')) {
    const lb = Math.min(cowLeft * (cheesing ? 0.5 : 1) / BUTTER_MILK_KCAL, hoursLeft(s) / LABOR.butterLb);
    if (lb > 0.05) {
      book(s, 'dairy', lb * LABOR.butterLb);
      addFood(s, 'butter', lb);
      cowLeft -= lb * BUTTER_MILK_KCAL;
      if (pigs) l.slop += lb * SKIM_FEED_LB; else fresh += lb * SKIM_KCAL;
      d.butterLb = lb; d.butterYear += lb;
    }
  }
  const left = cowLeft + goatLeft;
  if (left >= CHEESE_MILK_KCAL / 2 && cheesing) {
    const lb = Math.min(left / CHEESE_MILK_KCAL, hoursLeft(s) / LABOR.cheeseLb);
    if (lb > 0.05) {
      book(s, 'dairy', lb * LABOR.cheeseLb);
      addFood(s, 'cheese', lb * CHEESE_KCAL / 3600);
      const used = lb * CHEESE_MILK_KCAL, k = used / left;
      cowLeft -= cowLeft * k; goatLeft -= goatLeft * k;
      if (pigs) l.slop += lb * WHEY_FEED_LB;
      d.cheeseLb = lb; d.cheeseYear += lb;
    }
  }
  // what's still left: the fresh food (it sours in days), or the pigs when the kitchen already has five days of fresh food
  const rest = cowLeft + goatLeft, glut = s.stock.fresh * 2000 > people * 2400 * 5;
  if (pigs && glut) l.slop += rest / 2480 * 1.5; else fresh += rest;
  s.stock.fresh += fresh / 2000;
}
