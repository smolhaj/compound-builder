/**
 * Preserving the harvest (user-approved: "the garden and field glut becomes
 * winter food": canning, drying, smoking, salt-curing, root-cellaring).
 * Pure; run once a day from the eating step (needs.ts) and from the
 * butchering (livestock.ts, wildfood.ts, pond.ts).
 *
 *  Root cellar   potatoes from the field, apples and pears from the orchard,
 *                squash, cabbages and roots from the garden's last weeks go
 *                into the cellar's bins (pantry `cellar_roots`): 4–6 months
 *                at 40 °F, about 120 bushels (2.5 million kcal) a cellar.
 *                Without one they sit in the kitchen with the rest of the
 *                fresh food and rot within weeks.
 *  Canning       fresh food beyond five days' eating goes into quart jars.
 *                Water-bath canning (any big pot) is safe only for the
 *                high-acid part of the glut (tomatoes, fruit, pickles, about
 *                35 %); vegetables, meat and fish need a pressure canner
 *                (NCHFP / USDA). A canner does about 4 loads of 7 quarts a
 *                day. Each case of 12 quarts takes 12 jars and 12 lids,
 *                2.5–3 person-hours, and heat: ≈ 2 kWh a load on an
 *                electric range, or ≈ 0.015 rick of firewood on the
 *                cookstove. The jars come back when the food is eaten
 *                (3 % break); single-use lids don't. Reusable Tattler-style
 *                lids come back too, but seal a little less often (6 % of
 *                jars against 2 %). After the collapse nobody sells lids.
 *  Drying        an electric dehydrator (needs the house's power, ≈ 6 kWh a
 *                batch) or sun screens (a dry, sunny summer: the desert and
 *                the Mountain West, rarely the wet East): a basket a day
 *                each into jars of dried fruit and vegetables (90 % of the
 *                calories kept, a year on the shelf).
 *  Meat          (`putUpMeat`) the freezer while the cellar has power; else
 *                the smoker (≈ 100 lb a day, 80 % kept: jerky and smoked
 *                meat), salt-curing for pork (≈ 0.08 lb of salt per lb of
 *                meat: hams, bacon, salt pork, 90 % kept, a year in the
 *                cool), the pressure canner (quarts of meat, two years);
 *                what's left is eaten fresh.
 *
 * The family can turn any method off (the Farm tab). Every method books
 * its person-hours in farmWork.ts; the kitchen work only gets the hours
 * left after the animals. Today's work is kept (`today`) so the kitchen
 * can show a canning day.
 */
import type { GameState } from './state';
import { isHome } from './blueprints';
import { isFinished } from './construction';
import { REGIONS, type RegionId } from './regions';
import { calendarOf } from './state';
import { mulberry32 } from './rng';
import { addFoodKcal, foodUnits, FOOD, takeFood } from './pantry';
import { book, hoursLeft, LABOR } from './farmWork';

export type Method = 'cellar' | 'waterbath' | 'pressure' | 'dehydrate' | 'sundry' | 'smoke' | 'cure' | 'can_meat' | 'freeze' | 'cheese' | 'butter';
export const METHODS: readonly Method[] = ['cellar', 'waterbath', 'pressure', 'dehydrate', 'sundry', 'smoke', 'cure', 'can_meat', 'freeze', 'cheese', 'butter'];
export const METHOD_NAME: Record<Method, string> = {
  cellar: 'Root cellar', waterbath: 'Water-bath canning', pressure: 'Pressure canning', dehydrate: 'Dehydrator', sundry: 'Sun drying',
  smoke: 'Smoking', cure: 'Salt-curing', can_meat: 'Canning meat', freeze: 'Freezer', cheese: 'Cheese', butter: 'Butter',
};

export interface Preserve {
  /** Jar cases full of food last seen (the empties come back as it's eaten), and how many of those carry reusable lids. */
  full: number;
  tattlerFull: number;
  /** Methods the family doesn't use. */
  off: Method[];
  /** Today's work, kcal put up by method (the kitchen view), and the day it's for. */
  day: number;
  today: Partial<Record<Method, number>>;
  /** This year's totals, kcal by method. */
  year: number;
  yearKcal: Partial<Record<Method, number>>;
  /** Electricity the kitchen used today (kWh; not yet charged to the power balance). */
  kwh: number;
}
export const newPreserve = (): Preserve => ({ full: 0, tattlerFull: 0, off: [], day: -1, today: {}, year: 0, yearKcal: {}, kwh: 0 });

/** kcal in a basket of fresh food and a case of home-canned (needs.ts KCAL). */
const BASKET = 2000, CASE = 6000;
/** Canner loads a day (7 quarts each), the high-acid share of the glut, the yield (trim) and the share of jars that fail to seal. */
export const LOADS_PER_DAY = 4, QUARTS_PER_LOAD = 7, HIGH_ACID = 0.35, TRIM = 0.87, SEAL_FAIL = { metal: 0.02, tattler: 0.06 };
/** Cases of home-canned put up per 6,000 kcal of fresh food with single-use lids (≈ needs.ts CANNED_YIELD: the trim, and the odd jar that doesn't seal). */
export const CANNED_YIELD_METAL = TRIM * (1 - SEAL_FAIL.metal);
/** Heat a canner load: electric (kWh) or the cookstove (ricks of firewood). */
export const LOAD_KWH = 2, LOAD_RICK = 0.015;
/** Jars broken or lost each time round. */
export const JAR_LOSS = 0.03;
/** Root cellar capacity (kcal: ≈ 120 bushels of potatoes) and the shrink a day in its bins. */
export const CELLAR_KCAL = 2_500_000, CELLAR_SHRINK = 0.0005;
/** Drying: a basket a day per dehydrator or set of screens; kcal kept; kWh a batch. */
export const DRY_KEEP = 0.9, DEHYDRATOR_KWH = 6;
/** Sun-drying weather: share of summer days dry and sunny enough, by region. */
export const SUN_DAYS: Record<RegionId, number> = { desert: 0.95, mountain_west: 0.85, plains: 0.65, pnw: 0.6, upper_midwest: 0.45, north_woods: 0.4, appalachia: 0.3 };
/** Meat: what each method keeps, salt per lb of pork, the smokehouse's day, kcal a lb of meat. */
export const SMOKE_KEEP = 0.8, CURE_KEEP = 0.9, CAN_MEAT_KEEP = 0.9, SALT_PER_LB = 0.08, SMOKE_DAY_KCAL = 100_000, MEAT_LB_KCAL = 1100;
const SALT_BAG_LB = 25;

const prs = (s: GameState): Preserve => s.farm.preserve;
export const isOff = (s: GameState, m: Method) => prs(s).off.includes(m);

/** Today's ledger (reset at the turn of the day, and the year's totals at the turn of the year). */
function today(s: GameState): Preserve {
  const p = prs(s), day = Math.floor(s.clock.t + 0.25), { year } = calendarOf(s.clock);
  if (p.day !== day) { p.day = day; p.today = {}; p.kwh = 0; }
  if (p.year !== year) { p.year = year; p.yearKcal = {}; }
  return p;
}
function tally(s: GameState, m: Method, kcal: number): void {
  if (!(kcal > 0)) return;
  const p = today(s);
  p.today[m] = (p.today[m] ?? 0) + kcal;
  p.yearKcal[m] = (p.yearKcal[m] ?? 0) + kcal;
}

const home = (s: GameState) => s.structures.find(st => isHome(st.kind) && isFinished(st));
/** The house has power (an electric range, the dehydrator). */
export const kitchenPower = (s: GameState) => { const h = home(s); return !!h && s.utilities.lit.includes(h.id); };
export const cellars = (s: GameState) => s.structures.filter(st => st.kind === 'root_cellar' && isFinished(st)).length;
/** kcal in the cellar's bins now. */
export const cellarKcal = (s: GameState) => foodUnits(s, 'cellar_roots') * FOOD.cellar_roots.kcal;

/**
 * Into the root cellar (as much as fits). Returns the kcal that didn't go
 * in (no cellar, the bins full, or the family keeps them out of it).
 */
export function toCellar(s: GameState, kcal: number): number {
  if (!(kcal > 0)) return 0;
  const n = cellars(s);
  if (!n || isOff(s, 'cellar')) return kcal;
  const room = Math.max(0, n * CELLAR_KCAL - cellarKcal(s)), put = Math.min(room, kcal);
  if (put > 0) { addFoodKcal(s, 'cellar_roots', put); tally(s, 'cellar', put); }
  return kcal - put;
}

/** A day's harvest, split by where it goes (needs.ts produceParts). */
export interface HarvestIn {
  /** Everything that goes to the kitchen fresh as it is (eggs, greens, the garden in season, milk). */
  fresh: number;
  /** The field: kcal dug and threshed today, the dry share of it (beans, wheat) and the rest (potatoes). */
  field: number;
  fieldDry: number;
  /** Orchard fruit (apples and pears keep in the cellar; peaches don't), and the garden's late keepers (squash, roots, cabbage). */
  orchard: number;
  gardenKeep: number;
}
/** Share of the orchard's fruit that keeps in a cellar (apples and pears). */
export const ORCHARD_KEEP = 0.6;

/**
 * The day's harvest in: the field's dry beans and wheat to the sacks, its
 * potatoes and the late keepers to the cellar, everything else to the
 * kitchen fresh. `seedKept` (kcal) has already come off the field for
 * next spring (seeds.ts). Returns the kcal that went fresh.
 */
export function storeHarvest(s: GameState, h: HarvestIn, seedKept = 0): number {
  const field = Math.max(0, h.field - seedKept);
  const dry = field * h.fieldDry;
  if (dry > 0) addFoodKcal(s, 'home_dry', dry);
  let fresh = h.fresh;
  fresh += toCellar(s, field - dry);
  fresh += toCellar(s, h.orchard * ORCHARD_KEEP) + h.orchard * (1 - ORCHARD_KEEP);
  fresh += toCellar(s, h.gardenKeep);
  s.stock.fresh += fresh / BASKET;
  return fresh;
}

/** Heat for `loads` canner loads: power in the house, or firewood for the cookstove. Returns the loads it can heat. */
function heat(s: GameState, loads: number): number {
  if (loads <= 0) return 0;
  if (kitchenPower(s)) { today(s).kwh += loads * LOAD_KWH; return loads; }
  const n = Math.min(loads, Math.floor((s.stock.firewood ?? 0) / LOAD_RICK));
  s.stock.firewood -= n * LOAD_RICK;
  return n;
}

/** Lids for `cases` (a sleeve of 12 a case): reusable ones first. Returns [tattler cases, metal cases]. */
function lidsFor(s: GameState, cases: number): [number, number] {
  const t = Math.min(cases, Math.floor(s.stock.tattler_lids ?? 0));
  const m = Math.min(cases - t, Math.floor(s.stock.lids ?? 0));
  return [t, m];
}

/** Fill `cases` of jars (water bath or pressure) with `kcalPerCase` of food. Returns the cases actually put up (after seal failures), or 0 without jars, lids or heat. */
function fillJars(s: GameState, cases: number, method: Method, kcalPerCase: number, item: 'home_canned' | 'home_canned_meat'): number {
  cases = Math.min(cases, Math.floor(s.stock.jars ?? 0));
  if (cases <= 0) return 0;
  const [t0, m0] = lidsFor(s, cases);
  const want = t0 + m0;
  if (want <= 0) return 0;
  const loads = heat(s, Math.ceil(want * 12 / QUARTS_PER_LOAD));
  const can = Math.min(want, Math.floor(loads * QUARTS_PER_LOAD / 12));
  if (can <= 0) return 0;
  const t = Math.min(t0, can), m = can - t;
  const okT = t * (1 - SEAL_FAIL.tattler), okM = m * (1 - SEAL_FAIL.metal);
  s.stock.jars -= okT + okM;               // the failed seals' jars are washed and used again
  s.stock.lids -= m;                       // single-use lids are gone either way
  s.stock.tattler_lids -= okT;
  const p = prs(s);
  p.full += okT + okM; p.tattlerFull += okT;
  const kcal = (okT + okM) * kcalPerCase;
  addFoodKcal(s, item, kcal);
  tally(s, method, kcal);
  return okT + okM;
}

/** The empties back from the jars eaten, raided or traded since yesterday. */
function jarsBack(s: GameState): void {
  const p = prs(s), now = foodUnits(s, 'home_canned') + foodUnits(s, 'home_canned_meat');
  if (now < p.full - 1e-9) {
    const back = p.full - now, share = p.full > 0 ? Math.min(1, p.tattlerFull / p.full) : 0;
    s.stock.jars = (s.stock.jars ?? 0) + back * (1 - JAR_LOSS);
    s.stock.tattler_lids = (s.stock.tattler_lids ?? 0) + back * share * (1 - JAR_LOSS);
    p.tattlerFull = Math.max(0, p.tattlerFull - back * share);
  }
  p.full = now;
  p.tattlerFull = Math.min(p.tattlerFull, p.full);
}

/** Canner capacity a day (cases of 12 quarts) for a method. */
export const cannerCases = (s: GameState, pressure: boolean) => (pressure ? Math.floor(s.stock.pressure_canner ?? 0) : 1) * LOADS_PER_DAY * QUARTS_PER_LOAD / 12;

/**
 * The kitchen's day (after the eating, needs.ts): the jars back, the cellar
 * shrink, then the glut — fresh food beyond five days' eating — canned and
 * dried as far as the gear, the jars and lids, the heat and the hours go.
 * `needKcal` is the household's day. Returns log lines.
 */
export function preserveDay(s: GameState, needKcal: number): string[] {
  const out: string[] = [];
  today(s);
  jarsBack(s);
  if (foodUnits(s, 'cellar_roots') > 0) takeFood(s, 'cellar_roots', foodUnits(s, 'cellar_roots') * CELLAR_SHRINK);
  if (!home(s)) return out;
  let surplus = s.stock.fresh * BASKET - 5 * needKcal;
  const lidsBefore = (s.stock.lids ?? 0) + (s.stock.tattler_lids ?? 0);
  const take = (kcal: number) => { s.stock.fresh = Math.max(0, s.stock.fresh - kcal / BASKET); surplus -= kcal; };
  // water bath: the high-acid part (tomatoes, fruit, pickles)
  if (surplus > CASE && !isOff(s, 'waterbath')) {
    const want = Math.min(Math.floor(surplus * HIGH_ACID * TRIM / CASE), Math.floor(cannerCases(s, false)), Math.floor(hoursLeft(s) / LABOR.caseWaterBath));
    const got = fillJars(s, want, 'waterbath', CASE, 'home_canned');
    if (got > 0) { book(s, 'canning', got * LABOR.caseWaterBath); take(got * CASE / TRIM); }
  }
  // pressure canner: the vegetables (and whatever high-acid is left)
  if (surplus > CASE && (s.stock.pressure_canner ?? 0) >= 1 && !isOff(s, 'pressure')) {
    const want = Math.min(Math.floor(surplus * TRIM / CASE), Math.floor(cannerCases(s, true)), Math.floor(hoursLeft(s) / LABOR.casePressure));
    const got = fillJars(s, want, 'pressure', CASE, 'home_canned');
    if (got > 0) { book(s, 'canning', got * LABOR.casePressure); take(got * CASE / TRIM); }
  }
  // drying: the dehydrator on the house's power; sun screens on a dry summer day
  const doy = calendarOf(s.clock).doy, [f0, f1] = REGIONS[s.site.region].frost;
  const dry = (n: number, m: Method) => {
    const baskets = Math.min(n, Math.floor(surplus / BASKET), Math.floor(hoursLeft(s) / LABOR.dryBasket));
    if (baskets <= 0) return 0;
    book(s, 'drying', baskets * LABOR.dryBasket);
    take(baskets * BASKET);
    addFoodKcal(s, 'dried_produce', baskets * BASKET * DRY_KEEP);
    tally(s, m, baskets * BASKET * DRY_KEEP);
    return baskets;
  };
  if ((s.stock.dehydrator ?? 0) >= 1 && !isOff(s, 'dehydrate') && kitchenPower(s)) {
    const n = dry(Math.floor(s.stock.dehydrator), 'dehydrate');
    today(s).kwh += n * DEHYDRATOR_KWH;
  }
  const sunny = mulberry32(s.seed * 4111 + Math.floor(s.clock.t + 0.25) * 7 + 3)() < SUN_DAYS[s.site.region];
  if ((s.stock.drying_screens ?? 0) >= 1 && !isOff(s, 'sundry') && doy >= f0 && doy <= f1 && sunny) dry(Math.floor(s.stock.drying_screens), 'sundry');
  // the last lids: worth saying once
  const lidsNow = (s.stock.lids ?? 0) + (s.stock.tattler_lids ?? 0);
  if (lidsBefore >= 1 && lidsNow < 1 && s.disaster.tracks.deliveries < 0.25) out.push('The last canning lids are used up, and nobody sells them now. Reusable lids, drying, the cellar and the smoker are what is left.');
  return out;
}

/** What `putUpMeat` did with the meat (kcal by where it went). */
export interface MeatPut { freezer: number; smoked: number; cured: number; canned: number; fresh: number }
export type MeatKind = 'pork' | 'red' | 'fish' | 'fowl';

/**
 * Meat in (a butchering, a hunt, the pond): the freezer while the cellar has
 * power, else smoked, cured (pork), canned and, last, eaten fresh (see the
 * header). Labor is booked even past the day's budget (a butchering runs
 * late; the meat can't wait). Returns where it went (kcal as stored).
 */
export function putUpMeat(s: GameState, kcal: number, kind: MeatKind, freezer: boolean): MeatPut {
  const r: MeatPut = { freezer: 0, smoked: 0, cured: 0, canned: 0, fresh: 0 };
  if (!(kcal > 0)) return r;
  let left = kcal;
  if (freezer && !isOff(s, 'freeze')) { addFoodKcal(s, 'game_meat', left); tally(s, 'freeze', left); r.freezer = left; return r; }
  // small game, a few fish, a hen: into the pot
  if (left < 8000) { s.stock.fresh += left / BASKET; r.fresh = left; return r; }
  if ((s.stock.smoker ?? 0) >= 1 && !isOff(s, 'smoke')) {
    const k = Math.min(left, SMOKE_DAY_KCAL * Math.floor(s.stock.smoker));
    addFoodKcal(s, 'smoked_meat', k * SMOKE_KEEP); tally(s, 'smoke', k * SMOKE_KEEP);
    book(s, 'smoking', k / 10_000 * LABOR.smoke10k, true);
    r.smoked = k * SMOKE_KEEP; left -= k;
  }
  if (left > 0 && (kind === 'pork' || kind === 'fish') && !isOff(s, 'cure')) {
    const bags = foodUnits(s, 'salt'), lb = left / MEAT_LB_KCAL, need = lb * SALT_PER_LB / SALT_BAG_LB;
    const k = need > 0 ? left * Math.min(1, bags / need) : 0;
    if (k > 1000) {
      takeFood(s, 'salt', k / MEAT_LB_KCAL * SALT_PER_LB / SALT_BAG_LB);
      addFoodKcal(s, 'cured_pork', k * CURE_KEEP); tally(s, 'cure', k * CURE_KEEP);
      book(s, 'curing', k / 10_000 * LABOR.cure10k, true);
      r.cured = k * CURE_KEEP; left -= k;
    }
  }
  if (left > 0 && (s.stock.pressure_canner ?? 0) >= 1 && !isOff(s, 'can_meat')) {
    // a big butchering is canned over three days while it hangs in the cold
    const cap = Math.floor(cannerCases(s, true) * 3), per = FOOD.home_canned_meat.kcal / CAN_MEAT_KEEP;
    const got = fillJars(s, Math.min(cap, Math.floor(left / per)), 'can_meat', FOOD.home_canned_meat.kcal, 'home_canned_meat');
    if (got > 0) { book(s, 'canning', got * LABOR.caseMeat, true); r.canned = got * FOOD.home_canned_meat.kcal; left -= Math.min(left, got * per); }
  }
  if (left > 0) { s.stock.fresh += left / BASKET; r.fresh = left; }
  return r;
}

/** In words, for the log ("in the freezer", "smoked, cured and canned", "to eat before it turns"). */
export function meatWords(r: MeatPut): string {
  if (r.freezer > 0) return 'in the freezer';
  const parts = [r.smoked > 0 && 'smoked', r.cured > 0 && 'salt-cured', r.canned > 0 && 'canned'].filter(Boolean) as string[];
  const tail = r.fresh > 1000 ? (parts.length ? ', the rest eaten before it turns' : 'to eat before it turns') : '';
  return (parts.length ? parts.join(parts.length > 2 ? ', ' : ' and ').replace(/, (?=[^,]*$)/, ' and ') : '') + tail;
}

/** A case of quarts in the kitchen put up today (the canning-day view). */
export const canningToday = (s: GameState) => { const p = s.farm?.preserve; return !!p && p.day === Math.floor(s.clock.t + 0.25) && ((p.today.waterbath ?? 0) + (p.today.pressure ?? 0) + (p.today.can_meat ?? 0)) > 0; };

/** Log a big day's preserving once (a summary line for the kitchen). */
export function preservingLine(s: GameState): string | null {
  const p = s.farm?.preserve;
  if (!p) return null;
  const jars = ((p.today.waterbath ?? 0) + (p.today.pressure ?? 0)) / CASE * 12;
  return jars >= 12 ? `A canning day: ${Math.round(jars)} quarts on the counter, lids pinging as they seal.` : null;
}

