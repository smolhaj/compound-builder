/**
 * Spending guidance (docs/DECISIONS.md, spend nudges). Pure: how much a
 * one-click purchase leaves, whether that dips under the living reserve
 * (the starter planner's 25 %, floor $15k), and when to nudge the player to
 * stock food. Advice only; nothing here blocks or changes a price.
 */
import { RESERVE_MIN, RESERVE_SHARE } from './starterCompound';
import { daysOfFood, KCAL, needOf } from './needs';
import { orderCost, prices } from './economy';
import { CREW_RATE, crewHoursLeft, crewMarket } from './crews';
import type { GameState } from './state';
import { isGod } from './godMode';
import { countyWorks, needsPermit, permitFee } from './paperwork';

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
export function committedCrewWages(s: GameState): number {
  // the hours left on each job, once (crews side by side on a run share it), at today's wage
  const rate = CREW_RATE * crewMarket(s).rateMult;
  let usd = 0;
  for (const id of new Set((s.crews ?? []).map(c => c.target))) usd += crewHoursLeft(s, id) * rate;
  return Math.round(usd);
}

/** `spendCheck` that also counts `committed` (crew wages still to come) as already spent. Advice only. */
export function spendCheckCommitted(money: number, cost: number, committed: number): SpendCheck {
  const owed = Math.max(0, committed), reserve = livingReserve(money), after = money - owed - cost;
  return { after, reserve, below: cost > 0 && after < reserve, committed: owed };
}

/** The county permit fee that planning `kind` books now (0 = none: no permit needed, permits skipped, or nobody at the counter). */
export const permitSpend = (s: GameState, kind: string): number => (needsPermit(kind) && s.paper.permits && countyWorks(s) ? permitFee(s, kind) : 0);

/**
 * Can the cash on hand pay the permit fee that staking `kind` books? Staking never takes cash below zero (God Mode
 * tops the account up, so it is exempt). `short` is how much is missing (0 = affordable).
 */
export function permitAffordable(s: GameState, kind: string): { ok: boolean; cost: number; short: number; why: string | null } {
  const cost = permitSpend(s, kind);
  const short = isGod(s) ? 0 : Math.max(0, cost - Math.max(0, s.money));
  return { ok: short <= 0, cost, short, why: short > 0 ? `The county permit fee is $${cost.toLocaleString('en-US')} and you have $${Math.max(0, Math.round(s.money)).toLocaleString('en-US')}. Staking waits until the cash is there.` : null };
}

/** The question to ask before staking `kind` (null = just do it): the permit fee would leave less than the reserve. Advice only, except when the fee is more than the cash on hand: then `cannot` is set and the stake is refused (cash never goes negative). */
export function stakeSpendAsk(s: GameState, kind: string): { cost: number; check: SpendCheck; cannot?: string } | null {
  const cost = permitSpend(s, kind);
  if (cost <= 0) return null;
  const check = spendCheck(s.money, cost);
  const aff = permitAffordable(s, kind);
  if (!aff.ok) return { cost, check, cannot: aff.why! };
  return check.below ? { cost, check } : null;
}

/** "$141k" for the short button labels; "$950" under ten thousand. */
export const usdShort = (n: number): string => { const v = Math.round(n); return Math.abs(v) >= 10_000 ? `$${Math.round(v / 1000).toLocaleString('en-US')}k` : '$' + v.toLocaleString('en-US'); };

/** Days of food put by under which a family is nudged to stock up. */
export const FOOD_NUDGE_DAYS = 14;
/** A month of staples is the nudge's suggested first step. */
export const FOOD_NUDGE_TARGET_DAYS = 30;

/** Base urgency of the nudge card; the retaining-wall (58) and plow (56) cards outrank it unless the hit is near (see foodUrgency). */
export const FOOD_URGENCY = 52;

/**
 * How loudly to nudge: 52 normally, 54 with the shelves bare (still under the plow 56 and retaining wall 58 cards),
 * and 60 to 63 once a disaster's warning signs are up and under a week of food is put by (above those cards, below
 * a stripped roof or the seed card). One card either way, never a stream of them.
 */
export function foodUrgency(s: GameState, days: number): number {
  const warned = !!s.disaster.kind && s.clock.t >= s.disaster.warnAt && s.clock.t < s.disaster.hitAt;
  if (warned && days < 7) return days < 1 ? 63 : 60;
  return days < 1 ? 54 : FOOD_URGENCY;
}

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
