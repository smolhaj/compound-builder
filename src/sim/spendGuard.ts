/**
 * Spending guidance (docs/DECISIONS.md, spend nudges). Pure: how much a
 * one-click purchase leaves, whether that dips under the living reserve
 * (the starter planner's 25 %, floor $15k), and when to nudge the player to
 * stock food. Advice only; nothing here blocks or changes a price.
 */
import { RESERVE_MIN, RESERVE_SHARE } from './starterCompound';
import { daysOfFood, KCAL, needOf } from './needs';
import { orderCost, prices } from './economy';
import { CREW_RATE, hoursLeft } from './crews';
import type { GameState } from './state';

/** The cash a household keeps for living costs while it builds. */
export const livingReserve = (money: number): number => Math.max(RESERVE_MIN, Math.round(Math.max(0, money) * RESERVE_SHARE));

export interface SpendCheck { after: number; reserve: number; below: boolean; /** Crew wages already hired and still to be paid (spendCheckCommitted). */ committed?: number }

/** What `cost` leaves, and whether that is under the reserve held against the cash on hand now. */
export function spendCheck(money: number, cost: number): SpendCheck {
  const reserve = livingReserve(money), after = money - cost;
  return { after, reserve, below: cost > 0 && after < reserve };
}

/**
 * What crews already hired will still bill: the person-hours left on each one's building at the crew rate. A crew
 * bills by the hour as it works and goes home when the money runs out, so a second hire has to be judged against
 * the cash the first has already claimed, not against the whole balance.
 */
export function committedCrewWages(s: Pick<GameState, 'crews' | 'structures'>): number {
  let usd = 0;
  for (const c of s.crews ?? []) {
    const st = s.structures.find(x => x.id === c.target);
    if (st) usd += hoursLeft(st) * CREW_RATE;
  }
  return Math.round(usd);
}

/** `spendCheck` that also counts `committed` (crew wages still to come) as already spent. Advice only. */
export function spendCheckCommitted(money: number, cost: number, committed: number): SpendCheck {
  const owed = Math.max(0, committed), reserve = livingReserve(money), after = money - owed - cost;
  return { after, reserve, below: cost > 0 && after < reserve, committed: owed };
}

/** "$141k" for the short button labels; "$950" under ten thousand. */
export const usdShort = (n: number): string => { const v = Math.round(n); return Math.abs(v) >= 10_000 ? `$${Math.round(v / 1000).toLocaleString('en-US')}k` : '$' + v.toLocaleString('en-US'); };

/** Days of food put by under which a family is nudged to stock up. */
export const FOOD_NUDGE_DAYS = 14;
/** A month of staples is the nudge's suggested first step. */
export const FOOD_NUDGE_TARGET_DAYS = 30;

export interface FoodNudge { days: number; cost: number }

/** Low on put-by food with the cash to fix it (a month of staples leaves the living reserve intact); null otherwise. */
export function foodNudge(s: GameState): FoodNudge | null {
  if (!s.people.length) return null;
  const days = daysOfFood(s);
  if (days >= FOOD_NUDGE_DAYS) return null;
  const perDay = s.people.reduce((a, p, i) => a + (s.personState[i]?.needs?.died == null ? needOf(p) : 0), 0);
  if (perDay <= 0) return null;
  const qty = Math.max(1, Math.ceil((FOOD_NUDGE_TARGET_DAYS - Math.max(0, days)) * perDay / KCAL.staples));
  const cost = orderCost([{ material: 'staples', qty }], prices(s));
  return spendCheck(s.money, cost).below ? null : { days, cost };
}
