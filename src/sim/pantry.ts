/**
 * The pantry: what the stores are made of (user: "Granular food: itemized
 * stores … with nutrition / shelf life, pantry menu, and food graphics on
 * shelves wherever food is stored"). Pure.
 *
 * The aggregate food stocks (`s.stock.staples`, `canned`, `frozen`, in
 * needs.ts KCAL units) stay the simulation's currency: dozens of systems
 * read and change them directly (raiders take canned, barter, the
 * prisoners' rations, the smoker). The pantry is a breakdown *inside* each
 * of them: item → real units (50 lb bags, sealed buckets, #10 cans, cases)
 * with an age. `syncPantry` reconciles it with the aggregates: a drop it
 * didn't make (a raid, a trade, the freezer thawing) is drawn from the
 * items in proportion; a rise it didn't make (a gift, the playtest bot's
 * generic order) comes in as that category's default mix. Eating, buying,
 * canning, the field harvest and the smoker go through the pantry
 * directly, so it knows exactly what they are.
 *
 * Salt and coffee carry no calories: they sit in the staples breakdown but
 * outside the kcal sums, and are used up by the day (a few grams of salt a
 * head, two cups of coffee an adult).
 */
import type { GameState } from './state';

export type FoodCat = 'staples' | 'canned' | 'frozen';
export const FOOD_CATS: readonly FoodCat[] = ['staples', 'canned', 'frozen'];
/** kcal in one aggregate unit (same as needs.ts KCAL; repeated here so the pantry has no import cycle). */
export const CAT_KCAL: Record<FoodCat, number> = { staples: 80000, canned: 6000, frozen: 10000 };

export type FoodGroup = 'grain' | 'legume' | 'fat' | 'sweet' | 'protein' | 'dairy' | 'fruitveg' | 'meal' | 'snack' | 'salt' | 'coffee';
/** How it keeps: anywhere dry, cool (a cellar or a buried storeroom; it goes off sooner in a warm house), or frozen. */
export type Storage = 'dry' | 'cool' | 'frozen';
/** What it looks like on a shelf (game/props/foodShelves.ts). */
export type PropKind = 'bucket' | 'can10' | 'mylar' | 'sack' | 'bag' | 'jug' | 'jar' | 'honey' | 'case' | 'can' | 'pack';

export type FoodItemId =
  | 'rice_bucket' | 'rice_bag' | 'beans_bucket' | 'black_beans' | 'wheat_bucket' | 'flour' | 'oats' | 'cornmeal' | 'pasta'
  | 'sugar' | 'honey' | 'salt' | 'oil' | 'milk_powder' | 'peanut_butter' | 'freeze_dried' | 'coffee' | 'home_dry' | 'smoked_meat'
  | 'canned_veg' | 'canned_fruit' | 'canned_meat' | 'canned_soup' | 'home_canned' | 'snacks'
  | 'freezer_meat' | 'game_meat'
  // put up on the place (sim/preserving.ts, dairy.ts, maple.ts; save v44)
  | 'home_canned_meat' | 'dried_produce' | 'cured_pork' | 'cellar_roots' | 'cheese' | 'butter' | 'lard' | 'maple_syrup';

export interface FoodItem {
  id: FoodItemId;
  name: string;
  /** One real unit, as sold or put up. */
  unit: string;
  cat: FoodCat;
  /** kcal in one unit (0: salt, coffee). */
  kcal: number;
  /** Protein, g per 1,000 kcal. */
  protein: number;
  /** Share of the calories from fat. */
  fat: number;
  group: FoodGroup;
  /** "Best by" in years, as stored (Infinity: keeps forever). Past it the food is still edible, slowly worse (see DECAY). */
  life: number;
  /** How it goes past its date. */
  decay: Decay;
  store: Storage;
  /** 2025 USD a unit (null: home-made, not for sale). */
  price: number | null;
  prop: PropKind;
  /** Props drawn per unit (a case of 24 cans is shown as a row of six). */
  props: number;
  /** Lid / label / contents color. */
  color: number;
  /** Most of a day's calories it can sensibly be (nobody eats a pound of sugar). */
  dietMax: number;
  /** Mice get into it (paper and woven sacks; not buckets, cans, jars or jugs). */
  mice?: boolean;
  /** 0-kcal goods: units used a person-day (salt) or an adult-day (coffee). */
  use?: number;
}

// (DECAY_OF below: how each item goes past its date)
const F = (id: FoodItemId, name: string, unit: string, cat: FoodCat, kcal: number, protein: number, fat: number, group: FoodGroup, life: number, store: Storage, price: number | null, prop: PropKind, props: number, color: number, extra: Partial<FoodItem> = {}): FoodItem =>
  ({ id, name, unit, cat, kcal, protein, fat, group, life, decay: DECAY_OF[id], store, price, prop, props, color, dietMax: 0.6, ...extra });

/**
 * Past its date (user: "expired food can still be eaten most of the time,
 * just less effective cal wise and risk getting food sick"). How each kind
 * goes: the share of calories and nutrition it loses over the years after
 * (`maxLoss`, approached with time constant `tau` days), the chance a day
 * of eating nothing else makes someone sick (`sick` per year past date,
 * capped), botulism (home-canned only), how fast it has to be thrown out
 * (`toss(over)`: share a day: bulging cans, failed seals, mold and pests,
 * oil rancid past using) and how long past date the family throws it out
 * and replaces it while the stores still sell (`long`, days).
 *  never   honey, sugar, salt: nothing happens.
 *  sealed  rice, beans, wheat, freeze-dried and milk powder in Mylar / #10 cans: a slow fade, all but never sick.
 *  bag     grain and beans in sacks, pasta: stale, the odd moldy or buggy sack.
 *  can     commercial cans: softer, duller; low to moderate risk long past date; bulging cans go.
 *  homecan home-canned jars: like cans, plus a rare, serious botulism risk; failed seals go.
 *  rancid  flour, cornmeal, oats, oil, peanut butter, smoked meat: mostly lose quality, stomach upsets; out once badly rancid.
 *  frozen  freezer burn; out after a year past. (Thawed food is a real risk: needs.ts passes `thawed`.)
 *  snack   stale; out after a year past.
 */
export type Decay = 'never' | 'sealed' | 'bag' | 'can' | 'homecan' | 'rancid' | 'frozen' | 'snack' | 'cellar';
const DECAY_OF: Record<FoodItemId, Decay> = {
  rice_bucket: 'sealed', beans_bucket: 'sealed', wheat_bucket: 'sealed', freeze_dried: 'sealed', milk_powder: 'sealed',
  rice_bag: 'bag', black_beans: 'bag', home_dry: 'bag', pasta: 'bag',
  flour: 'rancid', cornmeal: 'rancid', oats: 'rancid', oil: 'rancid', peanut_butter: 'rancid', smoked_meat: 'rancid',
  sugar: 'never', honey: 'never', salt: 'never',
  canned_veg: 'can', canned_fruit: 'can', canned_meat: 'can', canned_soup: 'can', home_canned: 'homecan',
  snacks: 'snack', coffee: 'snack', freezer_meat: 'frozen', game_meat: 'frozen',
  home_canned_meat: 'homecan', dried_produce: 'bag', cured_pork: 'rancid', cellar_roots: 'cellar', cheese: 'rancid', butter: 'rancid', lard: 'rancid', maple_syrup: 'never',
};
export const DECAY: Record<Decay, { maxLoss: number; tau: number; sick: number; sickCap: number; bot: number; toss: (over: number) => number; long: number }> = {
  never: { maxLoss: 0, tau: 1, sick: 0, sickCap: 0, bot: 0, toss: () => 0, long: Infinity },
  sealed: { maxLoss: 0.12, tau: 1500, sick: 0.0003, sickCap: 0.002, bot: 0, toss: () => 0, long: Infinity },
  bag: { maxLoss: 0.2, tau: 700, sick: 0.001, sickCap: 0.006, bot: 0, toss: () => 0.0004, long: 365 },
  can: { maxLoss: 0.25, tau: 730, sick: 0.004, sickCap: 0.03, bot: 0, toss: o => 0.00015 * o / 365, long: 365 },
  homecan: { maxLoss: 0.3, tau: 730, sick: 0.005, sickCap: 0.03, bot: 0.0002, toss: o => 0.0003 * (1 + o / 365), long: 180 },
  rancid: { maxLoss: 0.3, tau: 365, sick: 0.006, sickCap: 0.02, bot: 0, toss: o => (o > 730 ? 0.004 : 0), long: 180 },
  frozen: { maxLoss: 0.3, tau: 365, sick: 0.002, sickCap: 0.01, bot: 0, toss: o => (o > 365 ? 0.002 : 0), long: 180 },
  snack: { maxLoss: 0.3, tau: 365, sick: 0.001, sickCap: 0.004, bot: 0, toss: o => (o > 365 ? 0.001 : 0), long: 180 },
  // potatoes, squash and apples in the cellar: past their months they sprout, go soft and rot (picked over and thrown out)
  cellar: { maxLoss: 0.35, tau: 60, sick: 0.001, sickCap: 0.004, bot: 0, toss: o => 0.01 + 0.0004 * o, long: 30 },
};
/** Food poisoning a day from eating thawed freezer food (no power, nothing but that), and home-canned botulism in date and at most. */
export const THAWED_SICK = 0.02, BOT_BASE = 0.00002, BOT_CAP = 0.001;

/** What's left of the calories and nutrition `over` days past date (1 in date). */
export function quality(id: FoodItemId, over: number): number {
  if (over <= 0) return 1;
  const d = DECAY[FOOD[id].decay];
  return 1 - d.maxLoss * (1 - Math.exp(-over / d.tau));
}
/** Chance a day of eating nothing but this makes someone sick, and of botulism. */
export function sickness(id: FoodItemId, over: number): { sick: number; bot: number } {
  const d = DECAY[FOOD[id].decay], yrs = Math.max(0, over) / 365;
  return { sick: over > 0 ? Math.min(d.sickCap, d.sick * yrs) : 0, bot: d.bot > 0 ? Math.min(BOT_CAP, BOT_BASE + d.bot * yrs) : 0 };
}

/**
 * The catalog. Calories from USDA FoodData Central (white rice ≈ 1,650
 * kcal/lb dry, pinto beans ≈ 1,575, wheat ≈ 1,500, oil ≈ 4,000);
 * shelf lives from the USU / BYU long-term storage studies (rice, beans and
 * wheat in Mylar with oxygen absorbers 25–30 years; flour about a year;
 * oil one to two; commercial cans two to five; home-canned best within one
 * to two; honey, sugar and salt indefinitely); prices 2025 big-box /
 * restaurant-supply / LDS home-storage-center retail.
 */
export const FOOD: Record<FoodItemId, FoodItem> = {
  rice_bucket: F('rice_bucket', 'White rice, sealed bucket', '5-gal bucket, Mylar + O₂ absorbers (≈ 33 lb)', 'staples', 54000, 19, 0.02, 'grain', 30, 'dry', 55, 'bucket', 1, 0xb83a2a),
  rice_bag: F('rice_bag', 'White rice, 50 lb bag', '50 lb bag (≈ 82,000 kcal)', 'staples', 82500, 19, 0.02, 'grain', 4, 'dry', 38, 'sack', 1, 0xece6d4, { mice: true }),
  beans_bucket: F('beans_bucket', 'Pinto beans, sealed bucket', '5-gal bucket, Mylar + O₂ absorbers (≈ 32 lb)', 'staples', 50400, 60, 0.03, 'legume', 30, 'dry', 70, 'bucket', 1, 0x2a5ab0),
  black_beans: F('black_beans', 'Black beans, 25 lb bag', '25 lb bag', 'staples', 38500, 63, 0.04, 'legume', 3, 'dry', 42, 'sack', 1, 0xa08860, { mice: true }),
  wheat_bucket: F('wheat_bucket', 'Hard red wheat, sealed bucket', '5-gal bucket of wheat berries (≈ 37 lb; grind or boil)', 'staples', 55500, 37, 0.05, 'grain', 30, 'dry', 60, 'bucket', 1, 0xd8a020),
  flour: F('flour', 'All-purpose flour, 25 lb', '25 lb paper sack (about a year: it goes rancid)', 'staples', 41250, 28, 0.03, 'grain', 1, 'cool', 17, 'bag', 1, 0xf0ece0, { mice: true }),
  oats: F('oats', 'Rolled oats, 25 lb', '25 lb sack', 'staples', 43000, 34, 0.15, 'grain', 2, 'cool', 30, 'sack', 1, 0xd8c8a0, { mice: true }),
  cornmeal: F('cornmeal', 'Cornmeal, 25 lb', '25 lb sack (about a year)', 'staples', 41250, 22, 0.09, 'grain', 1, 'cool', 22, 'bag', 1, 0xe8c860, { mice: true }),
  pasta: F('pasta', 'Pasta, case of 20 lb', 'case of 20 × 1 lb boxes', 'staples', 32000, 35, 0.05, 'grain', 3, 'dry', 30, 'case', 1, 0x3a6ab0, { mice: true }),
  sugar: F('sugar', 'White sugar, 25 lb', '25 lb bag (keeps forever if dry)', 'staples', 43750, 0, 0, 'sweet', Infinity, 'dry', 22, 'bag', 1, 0xf8f8f8, { dietMax: 0.08 }),
  honey: F('honey', 'Honey, 1 gallon', '1 gal jug (12 lb; keeps forever)', 'staples', 16560, 1, 0, 'sweet', Infinity, 'dry', 60, 'honey', 1, 0xd08a20, { dietMax: 0.06 }),
  salt: F('salt', 'Salt, 25 lb', '25 lb bag (cooking, curing; keeps forever)', 'staples', 0, 0, 0, 'salt', Infinity, 'dry', 10, 'bag', 1, 0xf4f4f4, { dietMax: 0, use: 6 / 11340 }),
  oil: F('oil', 'Vegetable oil, 1 gallon', '1 gal jug (one to two years)', 'staples', 30000, 0, 1, 'fat', 1.5, 'cool', 12, 'jug', 1, 0xe8c040, { dietMax: 0.15 }),
  milk_powder: F('milk_powder', 'Powdered milk, #10 can', '#10 can of nonfat dry milk (≈ 3.4 lb)', 'staples', 5500, 100, 0.02, 'dairy', 20, 'dry', 38, 'can10', 1, 0x4a7ac8, { dietMax: 0.15 }),
  peanut_butter: F('peanut_butter', 'Peanut butter, case of 6', 'case of 6 × 40 oz jars (about two years)', 'staples', 39700, 40, 0.72, 'protein', 2, 'cool', 42, 'jar', 6, 0xa86a30, { dietMax: 0.2 }),
  freeze_dried: F('freeze_dried', 'Freeze-dried meals, #10 can', '#10 can, about ten servings (25–30 years)', 'staples', 2800, 45, 0.3, 'meal', 30, 'dry', 48, 'can10', 1, 0xd06a2a),
  coffee: F('coffee', 'Ground coffee, 3 lb can', '3 lb can, about 140 cups', 'staples', 0, 0, 0, 'coffee', 2, 'dry', 26, 'can10', 1, 0x5a2418, { dietMax: 0, use: 2 / 140 }),
  home_dry: F('home_dry', 'Home-grown beans & wheat', 'woven sack, about 50 lb, threshed off the field', 'staples', 77500, 45, 0.04, 'legume', 3, 'dry', null, 'sack', 1, 0xb8a070, { mice: true }),
  smoked_meat: F('smoked_meat', 'Smoked meat & jerky', '10 lb, smoked and dried', 'staples', 15000, 80, 0.4, 'protein', 1, 'cool', null, 'mylar', 1, 0x7a3a28, { dietMax: 0.35 }),
  canned_veg: F('canned_veg', 'Canned vegetables, case of 24', 'case of 24 × 15 oz (corn, green beans, peas, tomatoes)', 'canned', 3600, 45, 0.06, 'fruitveg', 4, 'dry', 26, 'can', 6, 0x3a8a3a),
  canned_fruit: F('canned_fruit', 'Canned fruit, case of 12', 'case of 12 × 15 oz (peaches, pears, pineapple)', 'canned', 3400, 5, 0.01, 'fruitveg', 2, 'dry', 30, 'can', 6, 0xe8a030, { dietMax: 0.3 }),
  canned_meat: F('canned_meat', 'Canned meat & tuna, case of 12', 'case of 12 (chicken, tuna, Spam, corned beef)', 'canned', 7200, 120, 0.5, 'protein', 4, 'dry', 48, 'can', 6, 0xb03028),
  canned_soup: F('canned_soup', 'Canned soup & chili, case of 12', 'case of 12 × 19 oz', 'canned', 5400, 45, 0.35, 'meal', 3, 'dry', 30, 'can', 6, 0xc8b040),
  home_canned: F('home_canned', 'Home-canned jars', 'case of 12 quarts put up in the kitchen (best within two years)', 'canned', 6000, 25, 0.05, 'fruitveg', 2, 'cool', null, 'jar', 12, 0xb84a30),
  snacks: F('snacks', 'Snacks, case', 'case of granola bars, crackers, trail mix', 'canned', 9000, 20, 0.35, 'snack', 1, 'dry', 38, 'case', 1, 0xc83a6a, { dietMax: 0.12 }),
  freezer_meat: F('freezer_meat', 'Freezer meat, 5 kg', 'box of beef, chicken and pork (a year frozen)', 'frozen', 10000, 150, 0.55, 'protein', 1, 'frozen', 70, 'pack', 3, 0xb04040),
  game_meat: F('game_meat', 'Game & home-raised meat', 'about 5 kg, wrapped and frozen', 'frozen', 10000, 160, 0.4, 'protein', 1, 'frozen', null, 'pack', 3, 0x8a3030),
  // put up on the place: USDA calories (pork ≈ 1,100 kcal/lb with its fat, cheddar ≈ 1,800, butter ≈ 3,250, lard ≈ 4,100, maple syrup ≈ 13,000 a gallon);
  // keeping from the USDA / NCHFP guides (home-canned meat best within a year or two, dried produce 6–12 months, a dry-cured ham about a year,
  // potatoes 4–6 months in a cellar at 40 °F, waxed hard cheese about a year, salted butter 2–3 months cool, rendered lard months, syrup sealed forever)
  home_canned_meat: F('home_canned_meat', 'Home-canned meat', 'case of 12 quarts pressure-canned (pork, beef, venison, chicken, fish)', 'canned', 16800, 150, 0.45, 'protein', 2, 'cool', null, 'jar', 12, 0x9a4a3a),
  dried_produce: F('dried_produce', 'Dried fruit & vegetables', 'gallon jar, about 1.5 lb dried (apples, tomatoes, beans, corn)', 'staples', 2500, 15, 0.03, 'fruitveg', 1, 'cool', null, 'jar', 1, 0xc07830, { dietMax: 0.3 }),
  cured_pork: F('cured_pork', 'Salt-cured ham & bacon', 'a dry-cured ham or side of bacon, about 15 lb', 'staples', 20000, 60, 0.65, 'protein', 1, 'cool', null, 'sack', 1, 0xa05040, { dietMax: 0.3 }),
  cellar_roots: F('cellar_roots', 'Potatoes, squash & apples', 'a bushel in the cellar bins (≈ 21,000 kcal of potatoes)', 'staples', 21000, 25, 0.02, 'fruitveg', 0.4, 'cool', null, 'case', 1, 0xa88850, { dietMax: 0.5 }),
  cheese: F('cheese', 'Hard cheese', 'a 2 lb wheel, waxed and aged in the cool', 'staples', 3600, 62, 0.72, 'dairy', 1, 'cool', null, 'can10', 1, 0xe8b040, { dietMax: 0.2 }),
  butter: F('butter', 'Butter', '1 lb, salted, in a crock', 'staples', 3250, 1, 0.99, 'fat', 0.25, 'cool', null, 'jar', 1, 0xf0e090, { dietMax: 0.12 }),
  lard: F('lard', 'Lard', 'a gallon crock of rendered lard (≈ 7 lb)', 'staples', 28600, 0, 1, 'fat', 0.75, 'cool', null, 'jug', 1, 0xf4f0e0, { dietMax: 0.15 }),
  maple_syrup: F('maple_syrup', 'Maple syrup', '1 gallon, boiled down from about 40 gallons of sap', 'staples', 13000, 0, 0, 'sweet', Infinity, 'dry', null, 'honey', 1, 0x9a4a10, { dietMax: 0.06 }),
};
export const FOOD_IDS = Object.keys(FOOD) as FoodItemId[];
/** What the shop sells, by shelf. */
export const SHOP_FOOD: Record<'long' | 'bulk' | 'cans' | 'freezer', FoodItemId[]> = {
  long: ['rice_bucket', 'beans_bucket', 'wheat_bucket', 'freeze_dried', 'milk_powder', 'honey', 'salt', 'sugar'],
  bulk: ['rice_bag', 'black_beans', 'flour', 'oats', 'cornmeal', 'pasta', 'oil', 'peanut_butter', 'coffee'],
  cans: ['canned_veg', 'canned_fruit', 'canned_meat', 'canned_soup', 'snacks'],
  freezer: ['freezer_meat'],
};

/** Default mixes (share of the calories) for food that comes in without a name: a generic order, a gift, a trade, an old save. */
export const DEFAULT_MIX: Record<FoodCat, Partial<Record<FoodItemId, number>>> = {
  // the shop's old "bulk staples: rice, beans, flour, oil"
  staples: { rice_bag: 0.4, black_beans: 0.25, flour: 0.14, oil: 0.12, sugar: 0.05, oats: 0.04 },
  canned: { canned_veg: 0.3, canned_fruit: 0.15, canned_meat: 0.3, canned_soup: 0.25 },
  frozen: { game_meat: 1 },
};
/** Old saves: their staples were bucketed (the old shelf.ts said ~10 years in buckets). */
export const MIGRATION_MIX: Record<FoodCat, Partial<Record<FoodItemId, number>>> = {
  staples: { rice_bucket: 0.34, beans_bucket: 0.24, wheat_bucket: 0.1, oats: 0.06, flour: 0.06, oil: 0.1, sugar: 0.05, honey: 0.02, peanut_butter: 0.03 },
  canned: DEFAULT_MIX.canned,
  frozen: { freezer_meat: 1 },
};
/** Salt that comes along with a generic order of staples (bags per 80,000 kcal). */
const SALT_WITH_STAPLES = 0.05;

/** An item on hand: units, average age (days), and the fraction of a unit thrown out toward the next log line. */
export interface PantryEntry { q: number; age: number; tossed?: number }
export interface Pantry {
  items: Partial<Record<FoodItemId, PantryEntry>>;
  /** Where the calories came from, a month's running average (shares by item, plus 'fresh' and 'grocery'). */
  mix: Record<string, number>;
  /** Protein (g per 1,000 kcal) and fat (share of kcal), three weeks' running averages. */
  protein: number;
  fat: number;
  /** Days without salt / since the coffee ran out (0 = there is some). */
  noSalt: number;
  noCoffee: number;
  /** Share of the plate past its date: yesterday's, and a month's running average (stale food wears on morale a little). */
  oldToday?: number;
  old?: number;
  /** Game day coffee was last on hand (bought or in the pantry); a habit lasts 90 days past it. Unset: never stocked any. */
  coffeeDay?: number;
  /** Yesterday's eating: [item or 'fresh' / 'grocery', kcal]. */
  ate: Array<[string, number]>;
}
export const newPantry = (): Pantry => ({ items: {}, mix: { grocery: 1 }, protein: 40, fat: 0.33, noSalt: 0, noCoffee: 0, ate: [] });

const pantry = (s: GameState): Pantry => (s.pantry ??= newPantry());
// item lists, made once (the daily path allocates nothing it doesn't have to)
const CAT_ITEMS: Record<FoodCat, readonly FoodItemId[]> = { staples: FOOD_IDS.filter(id => FOOD[id].cat === 'staples'), canned: FOOD_IDS.filter(id => FOOD[id].cat === 'canned'), frozen: FOOD_IDS.filter(id => FOOD[id].cat === 'frozen') };
const CAT_KCAL_ITEMS: Record<FoodCat, readonly FoodItemId[]> = { staples: CAT_ITEMS.staples.filter(id => FOOD[id].kcal > 0), canned: CAT_ITEMS.canned.filter(id => FOOD[id].kcal > 0), frozen: CAT_ITEMS.frozen.filter(id => FOOD[id].kcal > 0) };
const SWEET_IDS = FOOD_IDS.filter(id => FOOD[id].group === 'sweet' || FOOD[id].group === 'snack');
const itemsIn = (cat: FoodCat) => CAT_ITEMS[cat];
/** kcal of a category the pantry holds. */
export function pantryKcal(p: Pantry, cat: FoodCat): number {
  let k = 0;
  for (const id of CAT_KCAL_ITEMS[cat]) { const e = p.items[id]; if (e) k += e.q * FOOD[id].kcal; }
  return k;
}

/** Put `units` of an item in the pantry (ages blend: new stock comes in fresh). Does not touch the aggregate. */
function put(p: Pantry, id: FoodItemId, units: number, age = 0): void {
  if (!(units > 0)) return;
  const e = p.items[id] ??= { q: 0, age: 0 };
  e.age = (e.age * e.q + age * units) / (e.q + units);
  e.q += units;
}

/** New food in, by name: into the pantry and its aggregate. */
export function addFood(s: GameState, id: FoodItemId, units: number, age = 0): void {
  if (!(units > 0)) return;
  syncPantry(s);
  const it = FOOD[id];
  put(pantry(s), id, units, age);
  if (id === 'coffee') pantry(s).coffeeDay = Math.floor(s.clock.t);
  s.stock[it.cat] += units * it.kcal / CAT_KCAL[it.cat];
}
/** The same, by kcal. */
export const addFoodKcal = (s: GameState, id: FoodItemId, kcal: number) => addFood(s, id, kcal / FOOD[id].kcal);

/** Take up to `units` of one item out (curing salt, feed for the stock, a cellar's shrink): the item and its aggregate. Returns the units taken. */
export function takeFood(s: GameState, id: FoodItemId, units: number): number {
  syncPantry(s);
  const e = pantry(s).items[id];
  if (!e || !(units > 0)) return 0;
  const got = Math.min(e.q, units), it = FOOD[id];
  e.q -= got;
  if (e.q < 1e-9) delete pantry(s).items[id];
  if (it.kcal > 0) s.stock[it.cat] = Math.max(0, s.stock[it.cat] - got * it.kcal / CAT_KCAL[it.cat]);
  return got;
}
/** Units of an item on hand. */
export const foodUnits = (s: GameState, id: FoodItemId) => s.pantry?.items[id]?.q ?? 0;

/** Pour `kcal` of a category in as a mix. */
function putMix(p: Pantry, cat: FoodCat, kcal: number, mix: Partial<Record<FoodItemId, number>>, age = 0): void {
  for (const [id, share] of Object.entries(mix) as Array<[FoodItemId, number]>) put(p, id, kcal * share / FOOD[id].kcal, age);
  if (cat === 'staples' && mix === DEFAULT_MIX.staples) put(p, 'salt', kcal / CAT_KCAL.staples * SALT_WITH_STAPLES, age);
}

/** Days of shelf life left (Infinity for honey, salt, sugar). */
export function lifeLeft(s: GameState, id: FoodItemId): number {
  return lifeDays(s, id) - (pantry(s).items[id]?.age ?? 0);
}

/** A cool store: a finished root cellar or bunker storeroom (oil, flour and nuts keep their full life there; about 70 % in a warm house). */
export const hasCoolStore = (s: GameState) => s.structures.some(st => (st.kind === 'root_cellar' || st.kind === 'bunker_stores') && st.finishedAt !== null);
export function lifeDays(s: GameState, id: FoodItemId): number {
  return lifeWith(id, hasCoolStore(s));
}
const lifeWith = (id: FoodItemId, cool: boolean) => {
  const it = FOOD[id];
  return it.life * 365 * (it.store === 'cool' && !cool ? 0.7 : 1);
}

/**
 * Take `kcal` (as stored) out of a category's items. Eating ('eat') goes
 * for what expires soonest and keeps to sensible shares (sugar, oil and
 * honey go with meals, not instead of them); `inDate` keeps it to food
 * still in date. A loss ('loss': a raid, a trade, a thaw) takes
 * everything in proportion. Returns [item, kcal taken, days past date].
 */
function draw(s: GameState, cat: FoodCat, kcal: number, how: 'eat' | 'loss', inDate = false): Array<[FoodItemId, number, number]> {
  const p = pantry(s);
  const ids: FoodItemId[] = [], avail: number[] = [], weight: number[] = [], taken: number[] = [], over: number[] = [];
  const cool = hasCoolStore(s);
  for (const id of CAT_KCAL_ITEMS[cat]) {
    const e = p.items[id];
    if (!e || e.q <= 0) continue;
    const r = lifeWith(id, cool) - e.age;
    if (inDate && r < 0) continue;
    const a = e.q * FOOD[id].kcal;
    ids.push(id); avail.push(a); taken.push(0); over.push(Math.max(0, -r));
    // soonest to expire first: the weight climbs over the last six months of shelf life (past it: the oldest first)
    weight.push(how === 'loss' ? a : Math.sqrt(a) * (!isFinite(r) ? 1 : r <= 0 ? 8 : 1 + 6 * Math.exp(-r / 120)));
  }
  let left = kcal;
  for (let pass = 0; pass < 6 && left > 1e-6; pass++) {
    const capped = how === 'eat' && pass < 4;
    const open = (i: number) => avail[i] - taken[i] > 1e-9 && (!capped || taken[i] < FOOD[ids[i]].dietMax * kcal - 1e-9);
    let W = 0;
    for (let i = 0; i < ids.length; i++) if (open(i)) W += weight[i];
    if (W <= 0) continue;
    let got = 0;
    for (let i = 0; i < ids.length; i++) {
      if (!open(i)) continue;
      const cap = capped ? FOOD[ids[i]].dietMax * kcal - taken[i] : Infinity;
      const t = Math.min(avail[i] - taken[i], cap, left * weight[i] / W);
      taken[i] += t; got += t;
    }
    left -= got;
  }
  const out: Array<[FoodItemId, number, number]> = [];
  for (let i = 0; i < ids.length; i++) {
    if (taken[i] <= 0) continue;
    const e = p.items[ids[i]]!;
    e.q = Math.max(0, e.q - taken[i] / FOOD[ids[i]].kcal);
    if (e.q < 1e-9) delete p.items[ids[i]];
    if (taken[i] > 1e-6) out.push([ids[i], taken[i], over[i]]);
  }
  return out;
}

/**
 * Make the breakdown add up to the aggregates again (see the header). A
 * big unexplained drop (a raid, 10 %+ in one go) takes the same share of
 * the salt and coffee.
 */
export function syncPantry(s: GameState): void {
  const p = pantry(s);
  for (const cat of FOOD_CATS) {
    const target = Math.max(0, s.stock[cat] ?? 0) * CAT_KCAL[cat], have = pantryKcal(p, cat);
    const eps = 1e-7 * Math.max(1, have);
    if (target < have - eps) {
      if (target <= eps) { for (const id of itemsIn(cat)) if (FOOD[id].kcal > 0) delete p.items[id]; }
      else draw(s, cat, have - target, 'loss');
      if (cat === 'staples' && have > 0 && target < have * 0.9) for (const id of ['salt', 'coffee'] as const) { const e = p.items[id]; if (e) e.q *= target / have; }
    } else if (target > have + eps) putMix(p, cat, target - have, DEFAULT_MIX[cat]);
  }
}

/** A day's eating from one category: what went on the plate (kcal as eaten, after any loss of quality), the kcal that does, and the sickness risk it carries. */
export interface Eaten {
  plate: Array<[FoodItemId, number]>;
  /** kcal the family actually got (expired food gives less). */
  eff: number;
  /** kcal-weighted sickness chances (divide by the day's need for the chance a person falls ill). */
  sick: number;
  bot: number;
  /** kcal of it past its date. */
  old: number;
}
export const noEaten = (): Eaten => ({ plate: [], eff: 0, sick: 0, bot: 0, old: 0 });

/** In-date kcal of a category on hand. */
export function inDateKcal(s: GameState, cat: FoodCat): number {
  const p = pantry(s), cool = hasCoolStore(s);
  let k = 0;
  for (const id of CAT_KCAL_ITEMS[cat]) { const e = p.items[id]; if (e && e.age <= lifeWith(id, cool)) k += e.q * FOOD[id].kcal; }
  return k;
}

/**
 * Eat `kcal` (what the body gets) from a category: the aggregate and the
 * items both go down. Expired food gives less, so more of it is eaten for
 * the same; `inDate` eats only food still in date; `thawed` (freezer food
 * with no power) is a real poisoning risk.
 */
export function eatFrom(s: GameState, cat: FoodCat, kcal: number, opts: { inDate?: boolean; thawed?: boolean } = {}): Eaten {
  syncPantry(s);
  const out = noEaten();
  let q = 1;     // the last round's kcal got per kcal eaten
  for (let round = 0; round < 3 && out.eff < kcal - 1e-6; round++) {
    const want = (kcal - out.eff) / q;
    const units = Math.min(s.stock[cat], want / CAT_KCAL[cat]);
    if (!(units > 1e-12)) break;
    const got = draw(s, cat, units * CAT_KCAL[cat], 'eat', opts.inDate);
    if (!got.length) break;
    let nominal = 0, effRound = 0;
    for (const [id, k, over] of got) {
      const q = quality(id, over), eff = k * q;
      nominal += k; effRound += eff;
      out.plate.push([id, eff]);
      out.eff += eff;
      const r = sickness(id, over);
      out.sick += eff * (r.sick + (opts.thawed && FOOD[id].store === 'frozen' ? THAWED_SICK : 0));
      out.bot += eff * r.bot;
      if (over > 0) out.old += eff;
    }
    q = Math.max(0.5, effRound / Math.max(1e-9, nominal));
    s.stock[cat] = Math.max(0, s.stock[cat] - nominal / CAT_KCAL[cat]);
    if (s.stock[cat] < 1e-12) s.stock[cat] = 0;
  }
  return out;
}

/**
 * Once a day (from shelf.ts): age every item, rotate while town is open,
 * and what happens past the date: the slow loss of quality is in
 * `quality` (eating gets less from it); here is what has to be thrown out
 * (bulging cans, failed seals, mold, pests, oil rancid past using), and,
 * while the stores still sell (`townOpen`), long-expired food thrown out
 * and bought fresh. Mice in the sacks. Keeps the aggregates in step and
 * returns log lines.
 */
export function pantryDay(s: GameState, opts: { rotate: boolean; mice: boolean; townOpen?: boolean }): string[] {
  syncPantry(s);
  const p = pantry(s), out: string[] = [];
  let lostS = 0, lostC = 0, lostF = 0;
  const lose = (it: FoodItem, dq: number) => { const k = dq * it.kcal; if (it.cat === 'staples') lostS += k; else if (it.cat === 'canned') lostC += k; else lostF += k; };
  const cool = hasCoolStore(s);
  for (const key in p.items) {
    const id = key as FoodItemId, e = p.items[id], it = FOOD[id];
    if (!e || e.q <= 0) continue;
    e.age += 1;
    if (opts.rotate && it.store !== 'frozen') e.age *= 1 - 1 / 90;
    const life = lifeWith(id, cool), over = e.age - life, d = DECAY[it.decay];
    if (over > 0 && over <= 1) out.push(`The ${name(id)} is past its best-by date: still good to eat, slowly losing flavor and food value.`);
    // the stores still sell: long-expired food goes out and fresh comes in (in the grocery money; home-canned just goes)
    if (opts.townOpen && over > d.long) {
      const cost = (it.price ?? 0) * e.q;
      if (it.price !== null && s.money >= cost) { s.money -= cost; e.age = 0; out.push(`Threw out the old ${name(id)} (${unitsText(e.q)}, ${Math.round(over / 30)} months past date) and bought fresh: $${Math.round(cost).toLocaleString('en-US')}.`); }
      else { lose(it, e.q); out.push(`Threw out the old ${name(id)} (${unitsText(e.q)}, ${Math.round(over / 30)} months past date).`); delete p.items[id]; }
      continue;
    }
    let rate = over > 0 ? d.toss(over) : 0;
    if (opts.mice && it.mice) rate += MICE_A_DAY;
    if (rate > 0) {
      const dq = e.q * Math.min(1, rate);
      e.q -= dq; lose(it, dq);
      // a whole unit gone: say what went
      if (over > 0 && d.toss(over) > 0) {
        const before = e.tossed ?? 0;
        e.tossed = before + dq;
        if (Math.floor(e.tossed) > Math.floor(before)) out.push(`Threw out ${TOSS_WHY[it.decay]} (${name(id)}).`);
      }
      if (e.q < 1e-9) delete p.items[id];
    }
  }
  if (lostS > 0) s.stock.staples = Math.max(0, s.stock.staples - lostS / CAT_KCAL.staples);
  if (lostC > 0) s.stock.canned = Math.max(0, s.stock.canned - lostC / CAT_KCAL.canned);
  if (lostF > 0) s.stock.frozen = Math.max(0, s.stock.frozen - lostF / CAT_KCAL.frozen);
  return out;
}
const name = (id: FoodItemId) => FOOD[id].name.split(',')[0].toLowerCase();
const unitsText = (q: number) => q >= 2 ? `${Math.round(q)} units` : 'what was left';
const TOSS_WHY: Record<Decay, string> = {
  never: '', sealed: '', bag: 'a moldy, buggy sack', can: 'bulging cans', homecan: 'jars whose seals had failed',
  rancid: 'stuff gone badly rancid', frozen: 'freezer-burned meat', snack: 'stale snacks', cellar: 'sprouted and rotten roots',
};
/** Mice in paper and woven sacks without traps: a share a day (buckets, cans, jars and jugs keep them out). */
export const MICE_A_DAY = 0.0006;

/** Average age (days) and shelf life of a category, by kcal (the Keeping rows). */
export function catKeeping(s: GameState, cat: FoodCat): { age: number; life: number } {
  const p = pantry(s);
  let w = 0, age = 0, life = 0;
  const cool = hasCoolStore(s);
  for (const id of CAT_KCAL_ITEMS[cat]) {
    const e = p.items[id];
    if (!e || FOOD[id].kcal === 0) continue;
    const k = e.q * FOOD[id].kcal, L = lifeWith(id, cool);
    if (!isFinite(L)) continue;
    w += k; age += k * e.age; life += k * L;
  }
  return w > 0 ? { age: age / w, life: life / w } : { age: 0, life: Infinity };
}

// ─────────────────────────────────────────────────────────────────────────
// Diet: variety, protein, fat, salt, sweets, coffee
// ─────────────────────────────────────────────────────────────────────────

/** How many different foods each source counts as (the grocery store is a lot of them; the garden a few). */
const SOURCE_FOODS: Record<string, number> = { grocery: 8, fresh: 3 };
/** Running-average rates a day: the mix over about a month, protein and fat over three weeks. */
const MIX_RATE = 1 / 30, NUT_RATE = 1 / 21;
const FRESH_NUT = { protein: 30, fat: 0.12 }, GROCERY_NUT = { protein: 40, fat: 0.33 };

/** Effective number of foods in the diet (inverse Simpson index of the running mix). */
export function dietDiversity(p: Pantry): number {
  let sum = 0, tot = 0;
  for (const [k, v] of Object.entries(p.mix)) { const n = SOURCE_FOODS[k] ?? 1; sum += v * v / n; tot += v; }
  return tot > 0 && sum > 0 ? tot * tot / sum : 1;
}

/**
 * After the day's eating (needs.ts): fold what was eaten into the running
 * averages, use the salt and coffee. `people` / `adults` alive.
 */
export function dietDay(s: GameState, ate: Array<[string, number]>, people: number, adults: number, fromStores: boolean, oldShare = 0): void {
  const p = pantry(s);
  p.oldToday = oldShare;
  p.old = (p.old ?? 0) + (oldShare - (p.old ?? 0)) * MIX_RATE;
  const total = ate.reduce((a, [, k]) => a + k, 0);
  p.ate = ate.filter(([, k]) => k > 1);
  if (total > 0) {
    const day: Record<string, number> = {};
    let prot = 0, fat = 0;
    for (const [k, kcal] of ate) {
      day[k] = (day[k] ?? 0) + kcal / total;
      const n = k === 'fresh' ? FRESH_NUT : k === 'grocery' ? GROCERY_NUT : FOOD[k as FoodItemId];
      prot += n.protein * kcal / total; fat += n.fat * kcal / total;
    }
    for (const k of Object.keys(p.mix)) p.mix[k] *= 1 - MIX_RATE;
    for (const [k, v] of Object.entries(day)) p.mix[k] = (p.mix[k] ?? 0) + v * MIX_RATE;
    for (const k of Object.keys(p.mix)) if (p.mix[k] < 1e-4) delete p.mix[k];
    p.protein += (prot - p.protein) * NUT_RATE;
    p.fat += (fat - p.fat) * NUT_RATE;
  }
  if (fromStores) { p.noSalt = 0; p.noCoffee = 0; return; }
  // salt: a few grams a head for cooking; coffee: two cups an adult
  const salt = p.items.salt;
  const needSalt = people * FOOD.salt.use!;
  if (salt && salt.q >= needSalt) { salt.q -= needSalt; p.noSalt = 0; } else { if (salt) delete p.items.salt; p.noSalt++; }
  const coffee = p.items.coffee, needCoffee = adults * FOOD.coffee.use!;
  if (coffee && coffee.q > 0) p.coffeeDay = Math.floor(s.clock.t);
  if (adults === 0) return;
  if (coffee && coffee.q >= needCoffee) { coffee.q -= needCoffee; p.noCoffee = 0; } else { if (coffee) delete p.items.coffee; p.noCoffee++; }
}

/** Did the family have a coffee habit: coffee bought or in the pantry within the last 90 days? */
export function coffeeHabit(s: GameState): boolean {
  const d = pantry(s).coffeeDay;
  return d !== undefined && Math.floor(s.clock.t) - d <= 90;
}

export interface DietEffect {
  /** 0–4, the variety term in the morale target (needs.ts: 6 points each). */
  variety: number;
  /** Added to the morale target. */
  morale: number;
  /** Health drifts down to this cap and no higher while the diet lacks something. */
  healthCap: number;
  /** What the family would say about it (Supplies tab). */
  notes: Array<{ text: string; tone: 'good' | 'warn' | 'bad' }>;
}

/**
 * What the diet does to people (realistic, not punishing): monotony wears
 * on morale over weeks; a fat-poor or protein-poor diet keeps health from
 * coming all the way back; no salt makes it bland and, after six weeks of
 * hard work, cramps; honey, sugar and the odd treat help; so does coffee,
 * and running out of it is a week or so of headaches.
 */
export function dietEffects(s: GameState, fromStores: boolean): DietEffect {
  const p = pantry(s);
  const notes: DietEffect['notes'] = [];
  if (fromStores) return { variety: 3, morale: 0, healthCap: 100, notes };
  const D = dietDiversity(p);
  const variety = Math.max(0, Math.min(4, 1.25 * Math.log2(D)));
  let morale = 0, healthCap = 100;
  if (D < 2.5) notes.push({ text: `The same few things every day (about ${Math.max(1, Math.round(D))} foods): it's wearing on everyone.`, tone: 'warn' });
  else if (D >= 6) notes.push({ text: `A varied table (about ${Math.round(D)} different foods this month).`, tone: 'good' });
  let sweet = (p.mix.canned_fruit ?? 0) * 0.5;
  for (const id of SWEET_IDS) sweet += p.mix[id] ?? 0;
  if ((p.old ?? 0) > 0.15) { morale -= 2; notes.push({ text: 'Eating a lot of old food from the back of the shelves: flat, stale, nobody looks forward to it.', tone: 'warn' }); }
  if (sweet >= 0.02) { morale += 2; notes.push({ text: 'Honey, sugar and the odd treat: something sweet now and then.', tone: 'good' }); }
  if (p.fat < 0.12) { morale -= 2; healthCap = Math.min(healthCap, 85); notes.push({ text: 'Hardly any fat in the diet: always hungry, losing weight. Oil, peanut butter, meat.', tone: 'warn' }); }
  if (p.protein < 25) { healthCap = Math.min(healthCap, 80); notes.push({ text: 'Too little protein: slow to heal, weak. Beans, meat, powdered milk.', tone: 'warn' }); }
  if (p.noSalt > 7) { morale -= 3; notes.push({ text: 'No salt: everything tastes of nothing.', tone: 'warn' }); }
  if (p.noSalt > 45) { healthCap = Math.min(healthCap, 90); notes.push({ text: 'Six weeks without salt and working hard: cramps and dizzy spells.', tone: 'bad' }); }
  if (p.noCoffee === 0 && (p.items.coffee?.q ?? 0) > 0) { morale += 2; notes.push({ text: 'Coffee in the morning.', tone: 'good' }); }
  else if (p.noCoffee > 0 && coffeeHabit(s)) {
    // they had a habit (bought it or had it in the pantry in the last 90 days): a week or so of withdrawal, then missing it
    if (p.noCoffee <= 10) { morale -= 6 * (1 - (p.noCoffee - 1) / 10); notes.push({ text: 'Out of coffee: headaches and short tempers for a week or so.', tone: 'warn' }); }
    else morale -= 1;
  } else if (p.noCoffee > 0 && p.noCoffee <= 7 && p.coffeeDay === undefined) morale -= 2;     // never stocked it: they miss the grocery-store cup for a few days
  return { variety, morale, healthCap, notes };
}

// ─────────────────────────────────────────────────────────────────────────
// For the HUD and the scene
// ─────────────────────────────────────────────────────────────────────────

export interface PantryRow {
  id: FoodItemId; units: number; kcal: number;
  /** Days of eating it alone would give (at what it's still worth). */
  days: number;
  age: number;
  /** Days of "best by" left (negative: past it). */
  left: number;
  /** Share of its calories and food value left (1 in date). */
  value: number;
  tone: 'good' | 'warn' | 'bad';
}

/**
 * The pantry as it stands, scaled to today's aggregates (between the daily
 * syncs a raid may have taken some), without changing the state.
 * `needKcal` a day for the days-of-each column.
 */
export function pantryRows(s: GameState, needKcal: number): PantryRow[] {
  const p = s.pantry ?? newPantry();
  const k: Record<FoodCat, number> = { staples: 1, canned: 1, frozen: 1 };
  for (const cat of FOOD_CATS) { const have = pantryKcal(p, cat); k[cat] = have > 0 ? Math.max(0, s.stock[cat]) * CAT_KCAL[cat] / have : 1; }
  const cool = hasCoolStore(s);
  const rows: PantryRow[] = [];
  for (const id of FOOD_IDS) {
    const e = p.items[id];
    if (!e || e.q < 1e-3) continue;
    const it = FOOD[id], units = e.q * (it.kcal > 0 ? k[it.cat] : 1);
    const life = lifeWith(id, cool), left = life - e.age, value = quality(id, -left);
    const days = it.kcal > 0 ? (needKcal > 0 ? units * it.kcal * value / needKcal : Infinity) : it.use && needKcal > 0 ? units / (it.use * Math.max(1, needKcal / 2200)) : Infinity;
    rows.push({ id, units, kcal: units * it.kcal, days, age: e.age, left, value, tone: !isFinite(left) ? 'good' : left <= 0 ? 'bad' : left < 120 ? 'warn' : 'good' });
  }
  return rows.sort((a, b) => b.kcal - a.kcal);
}

/** "What we're eating": yesterday's plate, in words. */
export function eatingLine(s: GameState): string {
  const p = s.pantry;
  if (s.food?.fromStores) return 'Groceries from town, like everyone else.';
  if (!p || !p.ate.length) return 'Nothing yesterday.';
  const tot = p.ate.reduce((a, [, k]) => a + k, 0);
  const label = (k: string) => k === 'fresh' ? 'fresh from the place' : k === 'grocery' ? 'the food bank' : FOOD[k as FoodItemId].name.split(',')[0].toLowerCase();
  const top = [...p.ate].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${label(k)} (${Math.round(v / tot * 100)} %)`);
  const old = p.oldToday ?? 0;
  return top.join(', ') + '.' + (old > 0.05 ? ` About ${Math.round(old * 100)} % of it past its date.` : '');
}

/** Shop bundles: shares of the calories by item, sized to the household's need for `days`. */
export const KITS: Array<{ id: string; name: string; text: string; days: number; mix: Partial<Record<FoodItemId, number>>; extra: Partial<Record<FoodItemId, number>> }> = [
  {
    id: 'year', name: 'One-year food kit', days: 365,
    text: 'The LDS-style basics for the household: rice, beans and wheat in sealed buckets, oats, oil, honey, sugar, powdered milk, salt and some freeze-dried meals.',
    mix: { rice_bucket: 0.3, beans_bucket: 0.2, wheat_bucket: 0.15, oats: 0.07, oil: 0.1, honey: 0.03, sugar: 0.04, milk_powder: 0.04, peanut_butter: 0.03, freeze_dried: 0.04 },
    extra: { salt: 1, coffee: 6 },
  },
  {
    id: 'quarter', name: 'Three-month pantry', days: 90,
    text: 'Eat-what-you-store: cases of canned meat, vegetables, fruit and soup, pasta, rice, peanut butter, oil, coffee.',
    mix: { canned_meat: 0.15, canned_veg: 0.12, canned_fruit: 0.08, canned_soup: 0.1, pasta: 0.15, rice_bag: 0.2, peanut_butter: 0.08, oil: 0.08, snacks: 0.04 },
    extra: { salt: 1, coffee: 3 },
  },
];

/** A kit as whole units of each item for a household needing `needKcal` a day. */
export function kitUnits(kit: (typeof KITS)[number], needKcal: number): Array<[FoodItemId, number]> {
  const kcal = needKcal * kit.days;
  const out: Array<[FoodItemId, number]> = [];
  for (const [id, share] of Object.entries(kit.mix) as Array<[FoodItemId, number]>) out.push([id, Math.max(1, Math.round(kcal * share / FOOD[id].kcal))]);
  for (const [id, n] of Object.entries(kit.extra) as Array<[FoodItemId, number]>) out.push([id, n]);
  return out;
}

/** Split a save's aggregate stocks into a breakdown (the v38 → v39 migration). */
export function pantryFromAggregates(stock: Partial<Record<FoodCat, number>>, ages: Partial<Record<FoodCat, number>> = {}): Pantry {
  const p = newPantry();
  for (const cat of FOOD_CATS) {
    const kcal = Math.max(0, stock[cat] ?? 0) * CAT_KCAL[cat];
    if (kcal > 0) putMix(p, cat, kcal, MIGRATION_MIX[cat], ages[cat] ?? 0);
  }
  // a bag of salt per year of staples on hand, at least one if there are any
  const st = stock.staples ?? 0;
  if (st > 0) put(p, 'salt', Math.max(1, Math.round(st / 10)), ages.staples ?? 0);
  return p;
}
