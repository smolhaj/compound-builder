/**
 * The end of the rule of law (WP3, docs/scenarios/lawless.md). Pure numbers for `sim/disasters/lawless.ts` and `sim/orderEncounters.ts`.
 *
 *   quiet     the first days are quiet (7 on Standard, 14 on Cozy, 3 on Hardcore): hostile weights ramp up from zero
 *   mix       looters x2 early, gangs x2.5 from week 3, a posse from month 2, the toll crew from week 3, traders thin out
 *   price     ammo, fuel and antibiotics climb; cash buys less as the banks go
 *   tithe     the posse asks 10% of stores each 30 days; accept, refuse or fight
 *   pact      the neighbor watch committee: a pact of households that may strike its own deal with the posse
 *   salvage   abandoned houses: owners dead is free, owners hiding is a moral cost found later
 */
import type { Difficulty } from './difficulty';
import type { RegionId } from './regions';

export type LawlessVariant = 'walkout' | 'blackout_of_order' | 'drift';
/** The pre-WP3 id `collapse` is the walkout. */
export const variantOf = (id: string): LawlessVariant => (id === 'blackout_of_order' || id === 'drift' ? id : 'walkout');

export const QUIET_DAYS: Record<Difficulty, number> = { cozy: 14, standard: 7, hardcore: 3 };
/** 0 in the quiet days, ramping to 1 over the same span again. */
export const rampUp = (day: number, d: Difficulty): number => Math.max(0, Math.min(1, (day - QUIET_DAYS[d]) / Math.max(1, QUIET_DAYS[d])));

/** Raid cadence by region: rust belt x1.4, hill country (border) x1.2, the thin north woods x0.5, mountain west x0.7. */
export const REGION_RAID: Partial<Record<RegionId, number>> = { rust_belt: 1.4, hill_country: 1.2, north_woods: 0.5, mountain_west: 0.7, ozarks: 0.85, new_england: 0.85, desert: 1.1, pnw: 1.1 };

export interface LawlessMix { looters: number; gang: number; militia: number; trader: number; refugees: number; tollkeeper: number; posse: number; watch_pact: number; salvage: number }
export function lawlessMix(day: number, d: Difficulty, region: RegionId, variant: LawlessVariant): LawlessMix {
  const ramp = rampUp(day, d), reg = REGION_RAID[region] ?? 1;
  // Katrina: short and hot, most of it in the first two weeks; the drift is slow
  const heat = variant === 'blackout_of_order' ? (day < 30 ? 1.3 : 0.6) : variant === 'drift' ? Math.min(1, 0.4 + day / 365) : 1;
  return {
    looters: (day >= 3 && day <= 30 ? 2 : 1) * ramp * reg * heat,
    gang: (day >= 21 ? 2.5 : 1) * ramp * reg * heat,
    militia: day >= 60 ? 1.6 : 0.6,
    trader: 0.4,
    refugees: 1.2,
    tollkeeper: day >= 21 ? 14 * reg : 0,
    posse: day >= 60 ? 12 : 0,
    watch_pact: day >= 8 && day < 120 ? 6 : 0,
    salvage: day >= 5 ? 5 : 0,
  };
}

/** Price level on top of scarcity: ammo, fuel and antibiotics 3x by day 7, 8x by month 3 in dollars, tamed here to a general level; cash buys less as the banks go. */
export function lawlessPrice(day: number, banks: number): number {
  const d = Math.max(0, day);
  const goods = 1 + 0.6 * Math.min(1, d / 7) + 0.6 * Math.min(1, d / 90);
  return goods * (1 + 0.4 * (1 - Math.max(0, Math.min(1, banks))));
}

export const TITHE = { SHARE: 0.1, EVERY: 30, RAID_CUT: 0.5, REFUSE_RAID: 1.5, HUMANITY: -2, GOODS: ['staples', 'canned', 'fuel'] as const };
export const titheDue = (day: number, last: number): boolean => (last < 0 ? day >= 60 : day - last >= TITHE.EVERY);
/** What a tithe takes: a tenth of stores, in the goods a posse wants. */
export function titheOf(stock: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of TITHE.GOODS) { const n = Math.floor((stock[g] ?? 0) * TITHE.SHARE); if (n > 0) out[g] = n; }
  return out;
}
/** Can the family break the posse? Only with a watch pact formed (members) and a hard wall; a lone family loses more often. */
export const breakPosseOdds = (pactMembers: number, fighters: number, fortress: number): number => Math.max(0.05, Math.min(0.8, 0.1 + 0.12 * pactMembers + 0.05 * Math.min(6, fighters) + fortress / 400));

export const TOLL = { DAYS: 30, GOODS: { fuel: 2 }, ENVELOPE_USD: 500, BACK_ROAD_EXTRA_DAYS: 1 } as const;

/** The watch committee: how likely each neighbor household joins (disposition counts), and the chance it betrays the pact to the posse once a deal exists. */
export const pactBetray = (daysSinceDeal: number, joined: boolean): number => (joined ? Math.min(0.1, 0.01 + daysSinceDeal / 2000) : 0);

/** Salvage: owners dead costs nothing; owners in hiding costs humanity when they are found. */
export const SALVAGE = { HIDING_P: 0.35, HUMANITY: -6, FOUND_DAYS: [10, 40] as [number, number], LOOT: { canned: 3, fuel: 1, meds: 1 } };
export const salvageOwnersHiding = (u: number): boolean => u < SALVAGE.HIDING_P;
