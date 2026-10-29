/**
 * The weekender's town house, as money (docs/DECISIONS.md, "Weekender cash pacing"). Pure and
 * seeded, with no game state, so the setup screen, the start money (sim/startFunds.ts) and the
 * weekender (sim/weekender.ts) all read the same house.
 *
 *  Own it     keep the house and its mortgage: the family's town costs are the payment, the upkeep and the
 *             property tax; the equity sits in the walls and falls with the market.
 *  Rent       sell it before the first day and rent a place in town: the equity goes into the start money
 *             (less the agent and closing), the rent replaces the mortgage, the upkeep and the tax, and there
 *             is nothing to sell later, nothing to keep as a fallback.
 */
import { mulberry32 } from './rng';
import type { Person } from './family';

/** How the family holds its town home: own it (with the mortgage) or sell it at setup and rent. */
export type TownPlan = 'own' | 'rent';

const k1000 = (n: number) => Math.round(n / 1000) * 1000;

/** The town house the family keeps: its value and mortgage, from their jobs, ages and a little luck. Seeded, so the setup screen and the game agree. */
export function townHouseFor(people: readonly Person[], seed: number): { value: number; mortgage: number } {
  const adults = people.filter(p => !p.kid && !p.elder && !p.rel);
  const pay = adults.reduce((a, p) => a + (p.job?.wage ?? 200) * 260, 0);
  const age = adults.length ? adults.reduce((a, p) => a + p.age, 0) / adults.length : 40;
  const seasoned = Math.min(1.35, Math.max(0.55, (age - 22) / 20));
  const r = mulberry32(seed * 3109 + 17);
  const luck = r(), ltvU = r();
  const equity = (90_000 + 2.2 * pay * Math.min(1.2, 0.7 + seasoned * 0.4)) * (0.8 + 0.5 * luck);
  // (round 5) a household that can run two homes has paid its mortgage down further than the first draft assumed
  const ltv = Math.min(0.62, Math.max(0.12, LTV_BASE - (age - 30) * 0.01 + (ltvU - 0.5) * 0.2));
  const value = Math.round(equity / (1 - ltv) / 5000) * 5000;
  return { value, mortgage: k1000(value * ltv) };
}
/** The loan-to-value of a 30-year-old weekender; each year of age takes a point off. */
export const LTV_BASE = 0.54;

/** The monthly mortgage payment (30 years at about 6 %). */
export const mortgagePayment = (t: { mortgage: number }): number => Math.round(t.mortgage * 0.0062);
/** The town house's upkeep a month while it stands empty or lived in: utilities, insurance, a yard. */
export const townUpkeep = (t: { value: number }): number => Math.round(150 + t.value * 0.0022);
/** Half a year's property tax on the town house. */
export const townTaxHalf = (t: { value: number }): number => Math.round(t.value * 0.0105 / 2);

/** The agent and closing on a sale. */
export const SALE_FEES = 0.06;
/** Rent for a house like theirs, a month (about 0.45 % of its value, a rented house costs more than an owned one without equity). */
export const rentFor = (value: number): number => Math.round((600 + value * 0.0038) / 50) * 50;
/** A rented place asks a deposit and the first month up front; the deposit (one month) comes back when they give notice. */
export const RENT_DEPOSIT_MONTHS = 2;
/** What selling the house before day one clears: the price less the agent and closing, less the mortgage. */
export const equityNet = (t: { value: number; mortgage: number }): number => Math.round((t.value * (1 - SALE_FEES) - t.mortgage) / 1000) * 1000;
