/**
 * Trade goods: the small things that become money after the collapse (GDS
 * §10.10: salt, coffee, tobacco, alcohol, batteries). They aren't in the
 * stockpile proper; they ride in a bag of their own (`s.market.bag`), filled
 * by scavenging and the market. Pure.
 */
import type { GameState } from './state';
import type { Good } from './barter';

export const BAG_GOODS = ['salt', 'coffee', 'batteries', 'tobacco', 'liquor'] as const;
export type BagGood = typeof BAG_GOODS[number];

/** 2025 shelf price and unit. */
export const BAG_BASE: Record<BagGood, { name: string; unit: string; price: number }> = {
  salt: { name: 'Salt', unit: 'kg of salt', price: 2 },
  coffee: { name: 'Coffee', unit: 'lb of coffee', price: 9 },
  batteries: { name: 'Batteries', unit: 'four-packs of AA', price: 6 },
  tobacco: { name: 'Tobacco', unit: 'packs of cigarettes', price: 9 },
  liquor: { name: 'Liquor', unit: 'bottles of whiskey', price: 18 },
};

/** The trade-goods bag (lazily made). */
export function bagOf(s: GameState): Record<BagGood, number> {
  const m = (s.market ??= newMarketState());
  m.bag ??= { salt: 0, coffee: 0, batteries: 0, tobacco: 0, liquor: 0 };
  return m.bag;
}

/** The market's persistent state (sim/market.ts reads and writes it). */
export interface MarketState {
  /** The trade-goods bag. */
  bag: Record<BagGood, number>;
  /** −100 … 100: how the crossroads talks about the family. */
  rep: number;
  /** Day the market first met (−1: not yet). */
  opened: number;
  /** Today's stalls (made on the market day morning). */
  day: number;
  stalls: Stall[];
  /** Who went today (they're away until evening); `carried`: dollars-equivalent of what they bought, for the road home. */
  trip: { day: number; pid: string; carried: number; armed: boolean; /** Drove (the vehicle's id) rather than rode: faster home, louder. */ vehicle?: string; bought?: Array<{ good: string; qty: number }> } | null;
  /** Vendors who won't deal with the family any more. */
  banned: string[];
  /** Cheating found out later (day it comes out, vendor). */
  exposed: Array<{ day: number; vendor: string }>;
  /** 0–20: people who followed someone home (feeds OPSEC exposure, fades). */
  heat: number;
  /** Tallies. */
  deals: number;
  cheats: number;
  history: Array<{ day: number; text: string }>;
}

/** A market good: a barter good (sim/barter.ts) or a trade good from the bag. */
export type MarketGood = Good | `bag:${BagGood}`;
export interface Stall {
  id: string;
  vendor: string;
  /** What they have (good, how many), what they'll take. */
  offers: Array<{ good: MarketGood; qty: number }>;
  wants: MarketGood[];
  /** 0.9 … 1.3: how hard they drive a bargain. */
  greed: number;
}

export const newMarketState = (): MarketState => ({ bag: { salt: 0, coffee: 0, batteries: 0, tobacco: 0, liquor: 0 }, rep: 0, opened: -1, day: -1, stalls: [], trip: null, banned: [], exposed: [], heat: 0, deals: 0, cheats: 0, history: [] });
