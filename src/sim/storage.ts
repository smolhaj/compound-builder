/**
 * Cold storage and room (docs/DECISIONS.md "Farm & kitchen"). Pure.
 *
 *  Root cellar   an earth-bermed cellar holds ≈ 120 bushels of potatoes, apples, squash, cabbage and roots
 *                in bins (2.5 million kcal; a bunker storeroom a million). The harvest goes into the bins
 *                (`cellar_roots` in the pantry) while there is room; the rest sits in the kitchen with the
 *                fresh food and rots. The bins shrink every day by the cellar's temperature: the ground
 *                keeps the cellar a few degrees warmer than the winter air and well cooler than August, so
 *                roots hold ~6 months from October (0.04 % a day at 3 °C, 0.25 % at 15 °C: a vented cellar, tended) and are gone by
 *                early summer. A cellar with power (a fan and a small chiller) runs 3 °C cooler. Fresh food
 *                kept in the cellar spoils slower than in the kitchen (0.9 %–2.2 % a day against 8 %).
 *  Pantry room   each building holds so much dry and canned food on its shelves. Past that the family
 *                stacks buckets in the spare room, the loft and the garage: warm and damp, the cool-kept
 *                goods (flour, oil, nuts, meal) lose up to a quarter of their life.
 */
import { calendarOf, type GameState } from './state';
import { isFinished } from './construction';
import { isHome } from './blueprints';

import { addFoodKcal, foodUnits, FOOD, pantryKcal, syncPantry } from './pantry';
import { logGate } from './nag';
import { regionFor } from './climate';
import { cellarHouses, cellarKcalOf } from './housingStyles';

export const CELLAR_KCAL = 2_500_000, BUNKER_ROOTS_KCAL = 1_000_000;
/** Fresh food in the kitchen. */
export const KITCHEN_SPOIL = 0.08;

const fin = (s: GameState, kind: string) => s.structures.filter(st => st.kind === kind && isFinished(st));

/** Bin room for roots and apples (kcal). */
export const cellarCapacity = (s: GameState): number => fin(s, 'root_cellar').length * CELLAR_KCAL + fin(s, 'bunker_stores').length * BUNKER_ROOTS_KCAL + cellarHouses(s).reduce((a, st) => a + cellarKcalOf(st.kind), 0);
/** What the bins hold (kcal). */
export const cellarKcal = (s: GameState): number => foodUnits(s, 'cellar_roots') * FOOD.cellar_roots.kcal;
export const cellarFree = (s: GameState): number => Math.max(0, cellarCapacity(s) - cellarKcal(s));
export const hasCellar = (s: GameState): boolean => cellarCapacity(s) > 0;

/** A cellar with power runs cooler. */
const cellarPowered = (s: GameState): boolean => [...fin(s, 'root_cellar'), ...cellarHouses(s)].some(st => s.utilities.lit.includes(st.id));

/** The cellar's temperature (°C) on a day of the year: the ground's yearly mean, a third of the air's swing, 5 weeks behind. */
export function cellarTempC(s: GameState, doy = calendarOf(s.clock).doy): number {
  const r = regionFor(s.site), mean = ((r.julyHighF + r.janLowF) / 2 - 32) / 1.8 - 1, amp = (r.julyHighF - r.janLowF) / 2 / 1.8;
  const t = mean + 0.3 * amp * Math.cos(2 * Math.PI * (doy - 197 - 35) / 365);
  return Math.max(1, t - (cellarPowered(s) ? 3 : 0));
}
/** Share of the bins that shrinks and rots a day at a cellar temperature. */
export const binShrink = (tC: number): number => 0.0004 + 0.00018 * Math.max(0, tC - 3);
/** Share of the fresh food kept in the cellar that spoils a day. */
export const cellarFreshSpoil = (tC: number): number => 0.008 + 0.0011 * Math.max(0, tC - 3);
/** The share of the fresh pile that spoils today: kitchen or cellar. */
export function freshSpoilRate(s: GameState): number {
  return hasCellar(s) ? cellarFreshSpoil(cellarTempC(s)) : KITCHEN_SPOIL;
}

/** Put roots and apples in the bins: returns the kcal that did not fit (it goes in the fresh pile). */
export function shelveRoots(s: GameState, kcal: number): number {
  if (!(kcal > 0)) return 0;
  const put = Math.min(kcal, cellarFree(s));
  if (put > 0) addFoodKcal(s, 'cellar_roots', put);
  return kcal - put;
}

/** Once a day: the bins shrink; a line when they run low or sprout. Returns log lines. */
export function cellarDay(s: GameState): string[] {
  const out: string[] = [];
  const e = s.pantry?.items.cellar_roots;
  if (!e || e.q <= 0) return out;
  syncPantry(s);
  const e2 = s.pantry.items.cellar_roots;
  if (!e2) return out;
  const t = cellarTempC(s), rate = binShrink(t), lost = e2.q * rate;
  e2.q -= lost;
  s.stock.canned = Math.max(0, s.stock.canned - lost * FOOD.cellar_roots.kcal / 6000);
  if (e2.q < 1e-6) delete s.pantry.items.cellar_roots;
  const { doy } = calendarOf(s.clock);
  if (t > 11 && doy > 100 && doy < 240 && e2.q * FOOD.cellar_roots.kcal > 40_000 && logGate(s, 'cellar-warm', 40)) out.push(`The cellar is warming up (${Math.round(t)} °C): the potatoes are sprouting and going soft. Eat or put up what is left.`);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Pantry room
// ─────────────────────────────────────────────────────────────────────────

/** Dry-goods shelf room (kcal) by building kind; a home the list lacks gets a cabin's. */
export const PANTRY_ROOM: Record<string, number> = {
  timber_cabin: 1_400_000, lodge: 5_000_000, lodge_plinth: 3_500_000, lodge_solar: 5_000_000, stone_house: 3_000_000, timber_frame: 3_000_000, container_house: 1_400_000, adobe_house: 2_000_000, log_house: 3_000_000, farmhouse: 3_000_000, trailer: 600_000, cottage: 1_000_000, guest_house: 500_000, moms_house: 1_000_000,
  barn: 1_000_000, workshop: 600_000, root_cellar: 4_000_000, bunker_stores: 15_000_000, bunker_dorm: 400_000,
};
export function pantryRoom(s: GameState): number {
  let r = 0;
  for (const st of s.structures) if (isFinished(st)) r += PANTRY_ROOM[st.kind] ?? (isHome(st.kind) ? 1_400_000 : 0);
  return r;
}
/** Dry and canned food on hand (kcal), less the roots in the bins (they have their own room). */
export function pantryLoad(s: GameState): number {
  const p = s.pantry;
  if (!p) return 0;
  return pantryKcal(p, 'staples') + pantryKcal(p, 'canned') - cellarKcal(s);
}
/** Share of the stores that does not fit on the shelves. */
export function overflow(s: GameState): number {
  const load = pantryLoad(s), room = pantryRoom(s);
  return load > room && load > 0 ? (load - room) / load : 0;
}

/** Once a day: set the crowding on the pantry (it shortens the life of cool-kept goods by up to a quarter). Returns log lines. */
export function crowdDay(s: GameState): string[] {
  if (!s.pantry) return [];
  const o = overflow(s);
  s.pantry.crowd = 0.25 * o;
  if (o > 0.25 && logGate(s, 'pantry-crowded', 120)) return [`The stores are stacked in every spare corner (${Math.round(o * 100)} % past the shelves): flour, oil and meal keep worse in a warm loft. A root cellar or a storeroom would give them room.`];
  return [];
}

