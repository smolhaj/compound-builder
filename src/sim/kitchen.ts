/**
 * The kitchen (docs/DECISIONS.md "Farm & kitchen"): how the harvest is put by, and how good the table is. Pure.
 *
 * What is left over from eating, beyond five days' worth of fresh food, is put up the day it comes in,
 * by whatever the kitchen has the gear for. The cook's day gates all of it (sim/daily.ts `cookRatio`: with
 * nobody cooking yesterday nothing is put up); each method also books person-hours (`k.hours`) that the
 * roster's Cooking duty plans for.
 *
 *  Canning      jars and lids from the Shop (the jars come back, the lids don't). A pressure canner takes
 *               anything, two cases (12 quarts) a day. With only a big pot, a water bath is safe for the
 *               high-acid part of the glut (tomatoes, fruit, pickles: about 35 %), one case a day:
 *               vegetables and meat in a water bath are how people get botulism, so the game doesn't offer it.
 *               ≈ 85 % of the calories end up in the jars.
 *  Drying       a dehydrator (the house's power) takes three baskets a day; without one the sun screens on
 *               a dry summer day, two baskets, in a dry climate more often. 90 % of the calories kept, a year
 *               and a half on the shelf in jars.
 *  Fermenting   crocks and salt: two baskets a day of cabbage, cucumbers and roots into sauerkraut, pickles
 *               and kimchi (85 % kept, a few months in a cool place). No lids, no canner, no power.
 *  Meat         `putUpMeat`: the powered freezer if there is one, else the smoker (80 % kept), else
 *               salt-curing in the cold months or a cool cellar (85 %; pork 90 %: hams, bacon, salt pork),
 *               else the pressure canner (90 %), else it is eaten before it turns. Rendering the fat of a
 *               pig gives lard (a kitchen job, not new calories: the carcass counts the rest).
 *  Table        what the pantry can make (`DISHES`), the best three on the table, bread when there is an
 *               oven and flour or a mill. Cooking skill is the gardener's. `moraleTerm` is added to the
 *               morale target in needs.ts: about 0 for rice and beans, up to +2.4 for a well-stocked kitchen.
 */
import { cellarHouses } from './housingStyles';
import { calendarOf, type GameState } from './state';
import { isHome } from './blueprints';
import { isFinished } from './construction';

import { mulberry32 } from './rng';
import { addFood, addFoodKcal, foodUnits, FOOD, takeSalt, type FoodItemId } from './pantry';
import { farmOf } from './farm';
import { burnRick, greenRicks } from './upkeep';
import { regionFor } from './climate';

export type Method = 'canning' | 'waterbath' | 'drying' | 'fermenting' | 'curing' | 'smoking' | 'freezing';
export const METHODS: readonly Method[] = ['canning', 'waterbath', 'drying', 'fermenting', 'curing', 'smoking', 'freezing'];
export const METHOD_NAME: Record<Method, string> = {
  canning: 'Pressure canning', waterbath: 'Water-bath canning', drying: 'Drying', fermenting: 'Fermenting', curing: 'Salt-curing', smoking: 'Smoking', freezing: 'Freezer',
};

export interface Kitchen {
  /** Methods the family does not use. */
  off: Method[];
  /** Day index the tallies are for; kcal put by today and this year by method; the year. */
  day: number;
  today: Partial<Record<Method, number>>;
  year: number;
  yearKcal: Partial<Record<Method, number>>;
  /** Person-hours of putting-by work today and yesterday (the roster's Cooking duty plans for it). */
  hours: number;
  hoursYesterday: number;
  /** Cookstove fuel burned toward the next rick; the oven's. */
  heat: number;
  /** The table: quality 0–1 and the dishes on it, from the last day. */
  quality: number;
  dishes: string[];
  /** Fresh food that rotted yesterday and the day before (kcal), for the Food plan. */
  rotted: number;
}
export const newKitchen = (): Kitchen => ({ off: [], day: -1, today: {}, year: 0, yearKcal: {}, hours: 0, hoursYesterday: 0, heat: 0, quality: 0.4, dishes: [], rotted: 0 });
export const kitchenOf = (s: GameState): Kitchen => (farmOf(s).kitchen ??= newKitchen());

const BASKET = 2000, CASE = 6000;
/** Canner loads (cases) a day; the high-acid share of a glut; calories kept by method. */
export const PRESSURE_CASES = 2, WATERBATH_CASES = 1, HIGH_ACID = 0.35;
export const KEEP = { canned: 0.85, dried: 0.9, fermented: 0.85, smoked: 0.8, cured: 0.85, curedPork: 0.9, canMeat: 0.9 } as const;
/** Baskets a day: the dehydrator, the sun screens, the crocks. */
export const DEHYDRATE_BASKETS = 3, SUN_BASKETS = 2, FERMENT_BASKETS = 2;
/** Person-hours: a case of jars, a basket dried, a basket fermented, 10,000 kcal of meat cured or smoked, a pig's lard. */
export const HOURS = { case: 1.2, dry: 0.5, ferment: 0.6, meat: 0.8, lard: 3 } as const;
/** Salt a basket of ferments takes (bags), and a kcal of cured meat (bags: 0.08 lb of salt a lb of meat at 1,100 kcal a lb, 25 lb bags). */
export const SALT_BASKET = 0.03, SALT_PER_MEAT_KCAL = 0.08 / 1100 / 25;
/** Cookstove fuel a case of jars takes when the house has no power (ricks), and a bake. */
export const STOVE_RICK = 0.012, BAKE_RICK = 0.025;

// ─────────────────────────────────────────────────────────────────────────
// The gear
// ─────────────────────────────────────────────────────────────────────────

const stock = (s: GameState, k: string): number => (s.stock as unknown as Record<string, number>)[k] ?? 0;
const fin = (s: GameState, ...kinds: string[]) => s.structures.filter(st => kinds.includes(st.kind) && isFinished(st));
export const homeOf = (s: GameState) => s.structures.find(st => isHome(st.kind) && isFinished(st));
export const hasKitchen = (s: GameState): boolean => !!homeOf(s);
/** The main house has power (electric range, dehydrator). */
export const kitchenPowered = (s: GameState): boolean => { const h = homeOf(s); return !!h && s.utilities.lit.includes(h.id); };
export const hasCanner = (s: GameState): boolean => stock(s, 'canner') >= 1;
export const hasOven = (s: GameState): boolean => fin(s, 'wood_oven').length > 0;
export const hasMill = (s: GameState): boolean => stock(s, 'grain_mill') >= 1;
export const freezerOn = (s: GameState): boolean => [...fin(s, 'root_cellar'), ...cellarHouses(s)].some(st => s.utilities.lit.includes(st.id));
export const isOff = (s: GameState, m: Method): boolean => kitchenOf(s).off.includes(m);
export function toggleMethod(s: GameState, m: Method): void {
  const k = kitchenOf(s);
  k.off = k.off.includes(m) ? k.off.filter(x => x !== m) : [...k.off, m];
}
/** Share of summer days dry and sunny enough to dry on screens (wetter climates fewer). */
export const sunShare = (s: GameState): number => Math.max(0.25, Math.min(0.92, 1 - regionFor(s.site).rainMm / 1800));
/** Is there fuel for the cookstove (or power)? */
export const canHeat = (s: GameState): boolean => kitchenPowered(s) || stock(s, 'firewood') >= 1 || greenRicks(s) >= 1.5;

function heatFor(s: GameState, rick: number): void {
  if (kitchenPowered(s)) return;
  const k = kitchenOf(s);
  k.heat += rick;
  while (k.heat >= 1) { if (!burnRick(s)) { k.heat = 0; break; } k.heat -= 1; }
}

/** Roll the day's tallies over. */
function roll(s: GameState): Kitchen {
  const k = kitchenOf(s), day = Math.floor(s.clock.t + 0.25), { year } = calendarOf(s.clock);
  if (k.day !== day) { k.hoursYesterday = k.hours; k.hours = 0; k.day = day; k.today = {}; }
  if (k.year !== year) { k.year = year; k.yearKcal = {}; }
  return k;
}
function tally(k: Kitchen, m: Method, kcal: number, hours = 0): void {
  if (!(kcal > 0)) return;
  k.today[m] = (k.today[m] ?? 0) + kcal;
  k.yearKcal[m] = (k.yearKcal[m] ?? 0) + kcal;
  k.hours += hours;
}

// ─────────────────────────────────────────────────────────────────────────
// Putting the glut by
// ─────────────────────────────────────────────────────────────────────────

/** What can be done with the day's glut: for the Farm tab ("canning: 2 cases a day"). */
export interface Capacity { method: Method; per: number; unit: string; why: string | null }
export function capacities(s: GameState, ratio: number): Capacity[] {
  const lids = Math.floor(stock(s, 'lids'));
  const cook = (n: number) => Math.floor(n * ratio + 1e-9);
  const heat = canHeat(s);
  return [
    { method: 'canning', per: cook(PRESSURE_CASES), unit: 'cases', why: !hasKitchen(s) ? 'no house with a kitchen' : !hasCanner(s) ? 'no pressure canner' : lids < 1 ? 'no lids' : !heat ? 'no fuel for the stove' : ratio <= 0 ? 'nobody cooked yesterday' : null },
    { method: 'waterbath', per: cook(WATERBATH_CASES), unit: 'cases', why: !hasKitchen(s) ? 'no house with a kitchen' : lids < 1 ? 'no lids' : !heat ? 'no fuel for the stove' : ratio <= 0 ? 'nobody cooked yesterday' : hasCanner(s) ? 'the pressure canner does it all' : null },
    { method: 'drying', per: cook(kitchenPowered(s) && stock(s, 'dehydrator') >= 1 ? DEHYDRATE_BASKETS : SUN_BASKETS), unit: 'baskets', why: !hasKitchen(s) ? 'no house with a kitchen' : ratio <= 0 ? 'nobody cooked yesterday' : null },
    { method: 'fermenting', per: cook(FERMENT_BASKETS), unit: 'baskets', why: stock(s, 'crocks') < 1 ? 'no crocks' : foodUnits(s, 'salt') < SALT_BASKET ? 'no salt' : ratio <= 0 ? 'nobody cooked yesterday' : null },
  ];
}

/**
 * Once a day from the eating step: put the glut by. `need` is the family's daily need (kcal), `ratio` the
 * cook's day (sim/daily.ts cookRatio). Fresh food beyond five days' eating goes first to jars, then to
 * the dehydrator or the screens, then to the crocks.
 */
export function putByDay(s: GameState, need: number, ratio: number): void {
  const k = roll(s);
  if (!hasKitchen(s) || ratio <= 0) return;
  const cook = (n: number) => Math.floor(n * ratio + 1e-9);
  let surplus = s.stock.fresh * BASKET - 5 * need;
  const take = (kcal: number) => { s.stock.fresh -= kcal / BASKET; surplus -= kcal; };
  // 1. jars: a pressure canner takes it all; a water bath only the high-acid part
  const pressure = hasCanner(s), wb = !pressure && !isOff(s, 'waterbath');
  if (((pressure && !isOff(s, 'canning')) || wb) && stock(s, 'lids') >= 1 && surplus > CASE && canHeat(s)) {
    const base = pressure ? surplus : surplus * HIGH_ACID;
    const cases = Math.min(Math.floor(base / CASE), cook(pressure ? PRESSURE_CASES : WATERBATH_CASES), Math.floor(stock(s, 'lids')));
    if (cases > 0) {
      (s.stock as unknown as Record<string, number>).lids -= cases;
      take(cases * CASE);
      addFood(s, 'home_canned', cases * KEEP.canned);
      heatFor(s, cases * STOVE_RICK);
      tally(k, pressure ? 'canning' : 'waterbath', cases * CASE, cases * HOURS.case);
    }
  }
  // 2. drying: the dehydrator on the house's power, else the screens on a dry day
  if (!isOff(s, 'drying') && surplus > BASKET) {
    const dehy = kitchenPowered(s) && stock(s, 'dehydrator') >= 1;
    const { doy } = calendarOf(s.clock);
    const sunny = doy >= 140 && doy <= 270 && mulberry32(s.seed * 5119 + Math.floor(s.clock.t + 0.25) * 29 + 3)() < sunShare(s);
    const baskets = Math.min(Math.floor(surplus / BASKET), cook(dehy ? DEHYDRATE_BASKETS : sunny ? SUN_BASKETS : 0));
    if (baskets > 0) {
      take(baskets * BASKET);
      addFood(s, 'dried_produce', baskets * BASKET * KEEP.dried / FOOD.dried_produce.kcal);
      tally(k, 'drying', baskets * BASKET, baskets * HOURS.dry);
    }
  }
  // 3. crocks: cabbage, cucumbers and roots, with salt
  if (!isOff(s, 'fermenting') && stock(s, 'crocks') >= 1 && surplus > BASKET) {
    const salt = foodUnits(s, 'salt');
    const baskets = Math.min(Math.floor(surplus / BASKET), cook(FERMENT_BASKETS), Math.floor(salt / SALT_BASKET));
    if (baskets > 0) {
      takeSalt(s, baskets * SALT_BASKET);
      take(baskets * BASKET);
      addFood(s, 'ferments', baskets * BASKET * KEEP.fermented / FOOD.ferments.kcal);
      tally(k, 'fermenting', baskets * BASKET, baskets * HOURS.ferment);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Meat
// ─────────────────────────────────────────────────────────────────────────

export type MeatWhere = 'freezer' | 'smoked' | 'cured' | 'canned' | 'fresh';

/** It is cold enough (or the cellar cool enough) to cure meat safely. */
export const coolEnoughToCure = (s: GameState): boolean => { const { doy } = calendarOf(s.clock); return doy < 80 || doy > 285 || (fin(s, 'root_cellar', 'bunker_stores').length > 0 || cellarHouses(s).length > 0); };

/**
 * Put up `kcal` of meat (any animal, fish too). Returns the calories kept and where they went. The pantry
 * and the stock are changed (fresh meat goes in the fresh pile, where it rots).
 */
export function putUpMeat(s: GameState, kcal: number, o: { pork?: boolean; freezer?: boolean } = {}): { kept: number; where: MeatWhere } {
  const k = roll(s);
  if (!(kcal > 0)) return { kept: 0, where: 'fresh' };
  if ((o.freezer ?? freezerOn(s)) && !isOff(s, 'freezing')) { addFoodKcal(s, 'game_meat', kcal); tally(k, 'freezing', kcal); return { kept: kcal, where: 'freezer' }; }
  if (stock(s, 'smoker') >= 1 && kcal > 8000 && !isOff(s, 'smoking')) { addFoodKcal(s, 'smoked_meat', kcal * KEEP.smoked); tally(k, 'smoking', kcal, HOURS.meat * kcal / 10000); return { kept: kcal * KEEP.smoked, where: 'smoked' }; }
  if (kcal > 8000 && !isOff(s, 'curing') && coolEnoughToCure(s)) {
    const need = kcal * SALT_PER_MEAT_KCAL;
    if (foodUnits(s, 'salt') >= need) {
      takeSalt(s, need);
      const keep = o.pork ? KEEP.curedPork : KEEP.cured;
      addFoodKcal(s, 'cured_meat', kcal * keep);
      tally(k, 'curing', kcal, HOURS.meat * kcal / 10000);
      return { kept: kcal * keep, where: 'cured' };
    }
  }
  const units = kcal * KEEP.canMeat / CASE;
  if (hasCanner(s) && kcal > 8000 && !isOff(s, 'canning') && stock(s, 'lids') >= units && canHeat(s)) {
    (s.stock as unknown as Record<string, number>).lids -= units;
    addFood(s, 'home_canned', units);
    heatFor(s, units * STOVE_RICK);
    tally(k, 'canning', kcal, units * HOURS.case);
    return { kept: kcal * KEEP.canMeat, where: 'canned' };
  }
  s.stock.fresh += kcal / BASKET;
  return { kept: kcal, where: 'fresh' };
}

export const MEAT_WHERE: Record<MeatWhere, string> = { freezer: 'in the freezer', smoked: 'smoked and cured', cured: 'salt-cured', canned: 'in jars', fresh: 'to eat before it turns' };

/** Render the fat of a butchered animal: `kcal` of fat becomes lard (90 % kept; the rest is cracklings). */
export function renderLard(s: GameState, kcal: number): void {
  if (!(kcal > 0)) return;
  const k = roll(s);
  addFoodKcal(s, 'lard', kcal * 0.9);
  k.hours += HOURS.lard;
}

// ─────────────────────────────────────────────────────────────────────────
// The table
// ─────────────────────────────────────────────────────────────────────────

export interface Dish {
  id: string;
  name: string;
  /** Every group of tokens is needed, one of each group's tokens: pantry item ids, food groups, or 'fresh', 'eggs', 'oven', 'mill', 'herbs', 'salt'. */
  needs: string[][];
  /** How good a table it makes, 0–1. */
  q: number;
  /** What is missing, in words, when it is not possible. */
  hint: string;
}
const MEAT_ITEMS = ['canned_meat', 'game_meat', 'freezer_meat', 'smoked_meat', 'cured_meat'];
const ROOTS = ['cellar_roots', 'canned_veg', 'home_canned', 'dried_produce', 'fresh'];
export const DISHES: readonly Dish[] = [
  { id: 'beans_rice', name: 'Beans and rice', needs: [['legume'], ['grain']], q: 0.34, hint: 'beans and a grain' },
  { id: 'porridge', name: 'Porridge and stewed fruit', needs: [['oats', 'cornmeal', 'wheat_bucket'], ['dried_produce', 'canned_fruit', 'honey', 'sugar']], q: 0.4, hint: 'oats or meal and something sweet' },
  { id: 'cornbread', name: 'Cornbread and beans', needs: [['cornmeal'], ['legume'], ['salt']], q: 0.45, hint: 'cornmeal, beans and salt' },
  { id: 'potato_soup', name: 'Potato soup', needs: [['cellar_roots'], ['salt']], q: 0.45, hint: 'potatoes from the cellar and salt' },
  { id: 'fried_potatoes', name: 'Potatoes fried in lard', needs: [['cellar_roots'], ['lard', 'oil']], q: 0.52, hint: 'potatoes and lard or oil' },
  { id: 'pancakes', name: 'Pancakes with honey', needs: [['flour', 'cornmeal'], ['eggs', 'fresh'], ['honey', 'sugar']], q: 0.5, hint: 'flour, eggs and something sweet' },
  { id: 'chili', name: 'Chili', needs: [['legume'], MEAT_ITEMS, ['canned_veg', 'home_canned', 'cellar_roots']], q: 0.55, hint: 'beans, meat and vegetables' },
  { id: 'stew', name: 'Stew with vegetables', needs: [MEAT_ITEMS, ROOTS, ['salt']], q: 0.6, hint: 'meat, vegetables and salt' },
  { id: 'pickle_plate', name: 'Pickle and cured-meat plate', needs: [['ferments'], ['cured_meat', 'smoked_meat', 'game_meat', 'canned_meat']], q: 0.5, hint: 'ferments and cured meat' },
  { id: 'bread_soup', name: 'Fresh bread and soup', needs: [['bread'], ['canned_soup', 'cellar_roots', 'legume', 'home_canned']], q: 0.62, hint: 'an oven and flour (or wheat and a mill)' },
  { id: 'roast', name: 'Roast and roots from the oven', needs: [['oven'], MEAT_ITEMS, ['cellar_roots']], q: 0.68, hint: 'an oven, meat and roots' },
  { id: 'omelet', name: 'Omelet with herbs', needs: [['eggs'], ['herbs']], q: 0.5, hint: 'a coop and a garden' },
];

/** The tokens the kitchen can draw on today. */
export function ingredients(s: GameState): Set<string> {
  const t = new Set<string>();
  const items = s.pantry?.items ?? {};
  for (const key in items) {
    const id = key as FoodItemId, e = items[id];
    if (!e || e.q < 0.05) continue;
    t.add(id); t.add(FOOD[id].group);
  }
  if (s.stock.fresh >= 0.5) t.add('fresh');
  if (fin(s, 'chicken_coop').length) t.add('eggs');
  if (fin(s, 'garden').length) t.add('herbs');
  if (hasOven(s)) t.add('oven');
  if (hasMill(s)) t.add('mill');
  if (hasOven(s) && (t.has('flour') || (hasMill(s) && (t.has('wheat_bucket') || t.has('home_dry'))))) t.add('bread');
  return t;
}

export interface DishLine { dish: Dish; ok: boolean; missing: string | null }
/** Every dish, whether the pantry can make it today. */
export function dishLines(s: GameState): DishLine[] {
  const t = ingredients(s);
  return DISHES.map(d => {
    const ok = d.needs.every(g => g.some(x => t.has(x)));
    return { dish: d, ok, missing: ok ? null : d.hint };
  });
}

/** The table's quality, 0–1: the best three dishes, salt and herbs, bread. */
export function tableQuality(s: GameState): { q: number; dishes: string[] } {
  const lines = dishLines(s).filter(l => l.ok).sort((a, b) => b.dish.q - a.dish.q);
  const top = lines.slice(0, 3);
  const base = top.length ? top.reduce((a, l) => a + l.dish.q, 0) / top.length : 0.15;
  const t = ingredients(s);
  const q = Math.max(0, Math.min(1, base + (t.has('salt') ? 0.04 : 0) + (t.has('herbs') ? 0.04 : 0) + (t.has('bread') ? 0.04 : 0)));
  return { q, dishes: top.map(l => l.dish.name) };
}

/** What the table adds to the morale target (needs.ts): 0 at plain beans and rice, up to +2.4 for a kitchen that can set a good table. */
export const moraleOf = (q: number): number => Math.max(-1.8, Math.min(2.4, (q - 0.4) * 6));

/** Once a day, from the eating step: the table's quality, the oven's fuel. Returns the morale term. */
export function kitchenDay(s: GameState, ratio: number): number {
  const k = roll(s);
  const { q, dishes } = tableQuality(s);
  k.quality = q; k.dishes = dishes;
  // a bake day: the wood oven burns a little wood when there is bread to make
  if (hasOven(s) && ratio >= 0.5 && ingredients(s).has('bread')) heatFor(s, BAKE_RICK / 2);
  return hasKitchen(s) ? moraleOf(q) : 0;
}

/** The roster: person-hours of putting-by work to plan for tomorrow (yesterday's, up to four). */
export const putByHours = (s: GameState): number => Math.min(4, s.farm?.kitchen?.hoursYesterday ?? 0);
