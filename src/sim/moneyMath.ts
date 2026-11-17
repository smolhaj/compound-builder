/**
 * The financial collapse's money (WP5, docs/scenarios/financial.md). Pure and import-light (finance.ts and barter.ts read it).
 *
 *  cashPower  what a dollar buys against the day before the hit (1 = normal). Owner default: cash is very dear but not worthless, so it
 *             never falls under 0.15 and the price shown is base / cashPower, capped at x6.
 *  barter     gold, silver, food, tools and ammo are worth up to 5x their cash price once cash is dear (labor and meds are not).
 *  run        the bank-run meter through the warning signs; withdrawal limits tighten with it (the last 10 days, then the cap after the hit).
 */
import type { GameState } from './state';
import { dayIndex } from './state';

export const CASH_FLOOR = 0.15;
const interp = (pts: Array<[number, number]>, d: number): number => {
  if (d <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (d <= pts[i][0]) { const [a, x] = pts[i - 1], [b, y] = pts[i]; return x + (y - x) * (d - a) / (b - a); }
  return pts[pts.length - 1][1];
};

/** Days after the hit -> purchasing power of a dollar, by variant (floor 0.15 in both). */
export function cashPowerAt(variant: string, day: number): number {
  const v = variant === 'hyperinflation'
    ? interp([[0, 1], [7, 0.8], [30, 0.3], [90, 0.12], [180, 0.02]], day)
    : variant === 'sovereign_default'
      ? interp([[0, 1], [30, 0.75], [180, 0.45], [730, 0.3]], day)
      : interp([[0, 1], [60, 0.6], [365, 0.35], [1000, 0.3]], day);
  return Math.max(CASH_FLOOR, v);
}

/** Today's purchasing power of cash (1 before the hit and in any other disaster). */
export function cashPower(s: GameState): number {
  const d = s.disaster;
  if (d.kind !== 'financial' || s.clock.t < d.hitAt) return 1;
  return cashPowerAt(d.variant, s.clock.t - d.hitAt);
}

/** The multiplier on every cash price: base / cashPower, capped at x6. */
export const cashPriceMult = (cp: number): number => Math.min(6, 1 / Math.max(CASH_FLOOR, cp));

/** Goods that hold (and gain) value against dear cash. */
const HARD = new Set(['fresh', 'frozen', 'canned', 'staples', 'seed']);
export function barterMult(s: GameState, good: string): number {
  const cp = cashPower(s);
  if (cp >= 1) return 1;
  const hard = HARD.has(good) || good.startsWith('metal:') || good.startsWith('ammo:') || good.startsWith('tool:');
  return hard ? Math.min(5, 1 / cp) : 1;
}

/** The bank-run meter, 0..1: the warning signs fill it (public and slow), and it is full from the hit. */
export function runMeter(s: GameState): number {
  const d = s.disaster;
  if (d.kind !== 'financial') return 0;
  if (s.clock.t >= d.hitAt) return 1;
  if (s.clock.t < d.warnAt) return 0;
  return Math.min(1, Math.pow((s.clock.t - d.warnAt) / Math.max(1, d.hitAt - d.warnAt), 1.5));
}

/** Dollars a family may pull out of checking and savings today: unlimited, then $500 a day in the last 10 days, then $250 a week. */
export function withdrawalLimit(s: GameState): number {
  const d = s.disaster;
  if (d.kind !== 'financial' || s.clock.t < d.warnAt) return Infinity;
  if (s.clock.t >= d.hitAt) return 250 / 7;
  return d.hitAt - s.clock.t <= 10 ? 500 : Infinity;
}

export interface Drawn { day: number; usd: number }
const drawn = (s: GameState): Drawn => {
  const bag = (s.disaster.fx ??= {});
  const d = (bag.money ??= { day: -1, usd: 0 }) as Drawn;
  const day = dayIndex(s.clock.t);
  if (d.day !== day) { d.day = day; d.usd = 0; }
  return d;
};
/** What is left of today's withdrawal room. */
export function withdrawalRoom(s: GameState): number {
  const lim = withdrawalLimit(s);
  return isFinite(lim) ? Math.max(0, lim - drawn(s).usd) : Infinity;
}
export function noteWithdrawal(s: GameState, usd: number): void {
  if (isFinite(withdrawalLimit(s))) drawn(s).usd += usd;
}
