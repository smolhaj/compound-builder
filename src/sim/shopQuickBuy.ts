/**
 * Shop quick-buy (docs/DECISIONS.md, "Shop quick-buy"). Pure: what a family can sensibly own of each good, what it is missing, and which
 * lines "Add everything I'm missing" / a preset / "Fill to recommended" would put in the order. Advice and arithmetic only: it never
 * changes a price, a delivery time or a gate, and the order still goes through `orderProblem` and the spend guard when it is placed.
 *
 * Every good is one of four kinds:
 *   single    one-time installations, buildings and upgrades: at most 1 owned (counting what is on order and any finished structure it became)
 *   person    one per head (or per fighter, or per N heads): sleeping bags, first-aid kits, plate carriers; capped at the need
 *   stack     consumables and building inputs: any quantity; some have a recommended stock sized to the family (per 30 days)
 *   capped    a fixed maximum (e.g. 2)
 * A good with no entry in RULES is a stack with no recommendation (building inputs, livestock, seed): quick-buy never adds it.
 */
import type { MaterialId } from './materials';
import { MATERIALS } from './materials';
import { SHELVES, type ShelfTab } from './shelves';
import type { GameState, OrderLine } from './state';
import { foodLine, onOrder, orderCost, payWith, prices } from './economy';
import { daysOfFood, needOf } from './needs';
import { committedCrewWages, spendCheckCommitted } from './spendGuard';
import { FOOD, KITS, kitUnits, type FoodItemId } from './pantry';
import { housingFixes, TENT_SEATS } from './housing';

export type GoodKind = 'single' | 'person' | 'stack' | 'capped';
export type Priority = 1 | 2 | 3;

export interface Rule {
  kind: GoodKind;
  /** person: who counts (default everyone alive). */
  of?: 'people' | 'fighters';
  /** person: heads per unit (radios come in pairs: 2). Default 1. */
  per?: number;
  /** capped: the maximum. */
  max?: number;
  /** stack: recommended stock for 30 days = person * heads + flat (rounded up). `fixed` = the same at any horizon, not scaled to 90 days. */
  rec?: { person?: number; flat?: number; fixed?: boolean };
  /** 1 essentials, 2 useful, 3 nice to have: the order quick-buy fills in when the budget is short. */
  prio: Priority;
  /** Never added by "everything" (the player picks it on purpose): the reason shown. */
  alt?: string;
  /** Only worth it when the household has this (kids). */
  when?: 'kids';
  /** Structure kinds that mean the good is already installed (it is consumed into the structure when built). */
  installed?: readonly string[];
}

const single = (prio: Priority, o: Partial<Rule> = {}): Rule => ({ kind: 'single', prio, ...o });
const person = (prio: Priority, o: Partial<Rule> = {}): Rule => ({ kind: 'person', prio, ...o });
const stack = (prio: Priority, rec: Rule['rec'], o: Partial<Rule> = {}): Rule => ({ kind: 'stack', prio, rec, ...o });
const ALT_UPGRADE = 'an upgrade you choose on purpose';
const ALT_SITE = 'depends on your site; choose it on purpose';

/** The rules. Anything not listed is a plain stack with no recommendation. */
export const RULES: Partial<Record<MaterialId, Rule>> = {
  // the house, water and power
  drilling: single(2, { installed: ['well_drilled', 'well_hand'] }),
  septic_tank: single(3, { installed: ['septic'] }),
  water_filter: single(1), ro_system: single(3), softener: single(3, { alt: 'only for hard water' }), greywater: single(3), water_trailer: single(3),
  water_jugs: stack(1, { person: 3, fixed: true }),
  generator: single(2, { installed: ['generator_shed'] }), inverter: single(3),
  hydro_set: single(3, { alt: ALT_SITE, installed: ['micro_hydro'] }), penstock: single(3, { alt: ALT_SITE }),
  wind_turbine: single(3, { alt: ALT_SITE, installed: ['wind_turbine'] }), tilt_tower: single(3, { alt: ALT_SITE }),
  greenhouse_kit: single(3, { installed: ['greenhouse'] }), greenhouse_pro_kit: single(3, { alt: ALT_UPGRADE, installed: ['greenhouse_heated'] }),
  aqua_kit: single(3, { installed: ['aquaponics'] }), modular_unit: single(3, { alt: 'a whole house; choose it on purpose' }),
  tunnel_kit_small: single(3, { alt: ALT_SITE, installed: ['polytunnel'] }), tunnel_kit_high: single(3, { alt: ALT_SITE, installed: ['high_tunnel'] }),
  // the kitchen and the farm
  canner: single(3), dehydrator: single(3), grain_mill: single(3), smoker: single(3), crocks: single(3), fishing_gear: single(3), snares: single(3),
  jon_boat: single(3, { alt: ALT_SITE }), skiff: single(3, { alt: ALT_SITE }),
  // health
  meds: stack(1, { person: 0.5 }), antibiotics: stack(2, { person: 0.5 }), ors: stack(2, { person: 0.25 }), splints: stack(2, { flat: 1, fixed: true }),
  hygiene: stack(1, { person: 1 }), traps: stack(3, { flat: 1, fixed: true }),
  medical_books: single(2), clinic_suite: single(3),
  // sleeping
  sleeping_bag: person(1), tent: person(1, { per: TENT_SEATS }),
  // fuel and the workshop
  fuel: stack(2, { flat: 4, fixed: true }), stabilizer: stack(3, { flat: 1, fixed: true }),
  plow: single(3, { alt: 'only where it snows; choose it on purpose' }), gun_safe: single(2), gun_cleaning: single(3),
  // kit and security
  plate_carrier: person(2, { of: 'fighters' }), ifak: person(1),
  soft_armor: person(3, { of: 'fighters', alt: 'a lighter alternative to the plate carrier' }), helmet: person(3, { of: 'fighters', alt: ALT_UPGRADE }),
  nvg: person(3, { of: 'fighters', alt: ALT_UPGRADE }), thermal: person(3, { of: 'fighters', alt: ALT_UPGRADE }),
  radios: person(1, { of: 'fighters', per: 2 }), sw_radio: single(2), ham_rig: single(3), radio_mast: single(3),
  cameras: { kind: 'capped', max: 2, prio: 3 }, thermal_cam: single(3), driveway_alarm: single(2), floodlights: single(2), ai_sensor_module: single(3, { alt: ALT_UPGRADE }),
  blackout_curtains: single(3), wall_insulation: single(3), gen_baffles: single(3), gen_vault: single(3, { alt: ALT_UPGRADE }), tripwire: stack(3, { flat: 2, fixed: true }), ground_sensor: single(3),
  dog: single(3, { alt: 'a family member; adopt on purpose' }), puppy: single(3, { alt: 'a family member; adopt on purpose' }),
  steel_door: single(2), security_door: single(3, { alt: ALT_UPGRADE }), window_bars: single(2), window_shutters: single(3, { alt: ALT_UPGRADE }), ballistic_panels: single(3, { alt: ALT_UPGRADE }),
  safe_room: single(3), safe_room_hardened: single(3, { alt: ALT_UPGRADE }), gun_mount: single(3, { alt: 'a weapon system; choose it on purpose' }), turret_head: single(3, { alt: 'a weapon system; choose it on purpose' }),
  gate_house: single(3), bugout_bag: person(3), bugout_cache: single(3),
  // evenings and learning
  games: single(3), instrument: single(3), music_player: single(3), novels: single(3), manuals: single(3),
  toys: single(3, { when: 'kids' }), picture_books: single(3, { when: 'kids' }),
  course_firstaid: single(3), course_ham: single(3), course_engines: single(3), course_welding: single(3), course_carpentry: single(3),
  course_wiring: single(3), course_gardening: single(3), course_husbandry: single(3), course_canning: single(3), course_hunter: single(3),
};

export const ruleOf = (id: MaterialId): Rule => RULES[id] ?? { kind: 'stack', prio: 3 };

export interface Household { people: number; fighters: number; kids: number; tentsShort: number }

/** Who is in the house now (living), who can fight (the same cut the gear uses: not a child under 15), and how many tents the sleeping plan lacks. */
export function householdOf(s: GameState): Household {
  const alive = s.people.filter((_, i) => s.personState[i]?.needs?.died == null);
  const fix = housingFixes(s, () => 0).find(f => f.action === 'buy' && f.item === 'tent');
  return { people: alive.length, fighters: alive.filter(p => !p.kid || p.age >= 15).length, kids: alive.filter(p => p.kid).length, tentsShort: fix ? fix.qty : 0 };
}

/** What the family owns of `id`: in the stockpile, on order, or built into a finished or started structure. */
export function ownedOf(s: GameState, id: MaterialId): number {
  const r = ruleOf(id);
  const built = r.installed ? s.structures.filter(x => r.installed!.includes(x.kind)).length : 0;
  return Math.floor((s.stock[id] ?? 0) + 1e-6) + Math.floor(onOrder(s)[id] ?? 0) + built;
}

/** The most that is sensible to own in total (Infinity for a stack). */
export function maxOwned(id: MaterialId, hh: Household): number {
  const r = ruleOf(id);
  switch (r.kind) {
    case 'single': return 1;
    case 'capped': return r.max ?? 1;
    case 'person': return Math.max(0, Math.ceil((r.of === 'fighters' ? hh.fighters : hh.people) / (r.per ?? 1)));
    default: return Infinity;
  }
}

/** How many more the stepper may add (Infinity for a stack). */
export function headroom(s: GameState, id: MaterialId, inCart = 0, hh = householdOf(s)): number {
  const m = maxOwned(id, hh);
  return m === Infinity ? Infinity : Math.max(0, m - ownedOf(s, id) - inCart);
}

/** Recommended total stock for a good over `horizonDays` (0 = none recommended). Singles and persons: their cap. Tents: only what the sleeping plan lacks. */
export function recommendedTotal(s: GameState, id: MaterialId, horizonDays = 30, hh = householdOf(s)): number {
  const r = ruleOf(id);
  if (r.when === 'kids' && hh.kids === 0) return 0;
  if (id === 'tent') return Math.min(maxOwned(id, hh), ownedOf(s, id) + hh.tentsShort);
  if (r.kind === 'single' || r.kind === 'capped' || r.kind === 'person') return maxOwned(id, hh);
  if (!r.rec) return 0;
  const months = r.rec.fixed ? 1 : Math.max(1, horizonDays / 30);
  return Math.ceil((((r.rec.person ?? 0) * hh.people + (r.rec.flat ?? 0)) * months) - 1e-9);
}

/** The shortfall to recommended (what "Fill to recommended" adds), counting `inCart`. */
export function shortfall(s: GameState, id: MaterialId, inCart = 0, horizonDays = 30, hh = householdOf(s)): number {
  return Math.max(0, recommendedTotal(s, id, horizonDays, hh) - ownedOf(s, id) - inCart);
}

/** Display: "Owned" for a single already had; the target for a person good. */
export function ownedLabel(s: GameState, id: MaterialId, hh = householdOf(s)): { owned: boolean; text: string } | null {
  const r = ruleOf(id), have = ownedOf(s, id);
  if (r.kind === 'single') return have >= 1 ? { owned: true, text: 'Owned' } : null;
  if (r.kind === 'capped' || r.kind === 'person') { const m = maxOwned(id, hh); return { owned: have >= m && m > 0, text: m > 0 ? `${Math.min(have, m)} of ${m}` : 'none needed' }; }
  return null;
}

export interface Skip { id: string; name: string; reason: string }
export interface QuickPlan {
  /** Materials to add to the cart (on top of what is there). */
  add: Partial<Record<MaterialId, number>>;
  /** Named foods to add. */
  food: Partial<Record<FoodItemId, number>>;
  skipped: Skip[];
  /** Cost of the whole order (cart + additions) and of the additions alone. */
  orderTotal: number;
  addedCost: number;
  /** Cash left after the whole order (what the player pays from). */
  left: number;
}

export interface QuickOpts {
  /** Goods to consider (a tab's shelf, or a preset's list). */
  ids: readonly MaterialId[];
  horizonDays?: number;
  /** Skip what the spend guard would question (default true). Off: only what the money covers. */
  stayInBudget?: boolean;
  /** Add the "pick it on purpose" goods too (a preset that names them). */
  includeAlt?: boolean;
  /** Top up the pantry to this many days (0 = leave food alone). */
  foodDays?: number;
}

export const fundsOf = (s: GameState): number => payWith(s) === 'cash' ? s.fin.cash : s.money;

/** The household's daily food need, kcal (the living; the same sum the food nudge uses). */
export const dailyNeed = (s: GameState): number => s.people.reduce((a, p, i) => a + (s.personState[i]?.needs?.died == null ? needOf(p) : 0), 0);

/** Days of food already put by, on order and in the cart. */
export function foodDaysCovered(s: GameState, foodCart: Partial<Record<FoodItemId, number>>): number {
  const need = dailyNeed(s);
  if (need <= 0) return Infinity;
  let kcal = 0;
  for (const o of s.orders) if (o.status === 'ordered') for (const l of o.lines) if (l.food) kcal += FOOD[l.food].kcal * (l.n ?? 0);
  for (const [id, n] of Object.entries(foodCart) as Array<[FoodItemId, number]>) kcal += FOOD[id].kcal * (n ?? 0);
  return Math.max(0, daysOfFood(s)) + kcal / need;
}

/** Units of named food that bring the house to `targetDays`, from the three-month pantry's mix (cans, pasta, rice), given the days already covered. */
export function pantryTopUp(needKcal: number, coveredDays: number, targetDays: number): Array<[FoodItemId, number]> {
  const short = targetDays - coveredDays;
  // (rounding to whole cases leaves a day or two short of the target: close enough that pressing again adds nothing)
  if (needKcal <= 0 || short < Math.max(1, 0.05 * targetDays)) return [];
  const kit = KITS.find(k => k.id === 'quarter')!;
  // salt and coffee are the kit's flat extras: only on a first stock, never in a top-up
  return kitUnits({ ...kit, days: short, extra: {} }, needKcal);
}

/**
 * Build the additions for `opts` against the current cart. Idempotent: it counts the cart, the stockpile, what is on order and installed
 * structures, so running it again right after adds nothing. Walks priority 1 to 3 (cheapest first) so a short budget buys the essentials.
 */
export function planQuickBuy(s: GameState, cart: Partial<Record<MaterialId, number>>, foodCart: Partial<Record<FoodItemId, number>>, opts: QuickOpts): QuickPlan {
  const hh = householdOf(s), k = prices(s), horizon = opts.horizonDays ?? 30, stay = opts.stayInBudget !== false;
  const skipped: Skip[] = [];
  const add: Partial<Record<MaterialId, number>> = {}, food: Partial<Record<FoodItemId, number>> = {};
  const baseLines = (): OrderLine[] => [
    ...(Object.entries(cart) as Array<[MaterialId, number]>).filter(([, q]) => q > 0).map(([material, qty]) => ({ material, qty })),
    ...(Object.entries(foodCart) as Array<[FoodItemId, number]>).filter(([, n]) => n > 0).map(([id, n]) => foodLine(id, n)),
  ];
  const linesNow = (): OrderLine[] => {
    const m: Partial<Record<MaterialId, number>> = { ...cart };
    for (const [id, q] of Object.entries(add) as Array<[MaterialId, number]>) m[id] = (m[id] ?? 0) + q;
    const f: Partial<Record<FoodItemId, number>> = { ...foodCart };
    for (const [id, n] of Object.entries(food) as Array<[FoodItemId, number]>) f[id] = (f[id] ?? 0) + n;
    return [
      ...(Object.entries(m) as Array<[MaterialId, number]>).filter(([, q]) => q > 0).map(([material, qty]) => ({ material, qty })),
      ...(Object.entries(f) as Array<[FoodItemId, number]>).filter(([, n]) => n > 0).map(([id, n]) => foodLine(id, n)),
    ];
  };
  const costOf = (lines: OrderLine[]) => orderCost(lines, k);
  const funds = fundsOf(s), committed = committedCrewWages(s);
  const fits = (lines: OrderLine[]) => {
    const c = costOf(lines);
    if (c > funds) return 'cannot afford it';
    return stay && spendCheckCommitted(funds, c, committed).below ? 'would leave less than your living reserve' : null;
  };
  const base = baseLines(), baseCost = base.length ? costOf(base) : 0;
  const how = payWith(s);
  const finish = (): QuickPlan => {
    const lines = linesNow(), total = lines.length ? costOf(lines) : 0;
    return { add, food, skipped, orderTotal: total, addedCost: Math.max(0, total - baseCost), left: funds - total };
  };
  if (!how) {
    for (const id of opts.ids) skipped.push({ id, name: MATERIALS[id].name, reason: 'nobody is delivering now' });
    return finish();
  }
  type Cand = { id: MaterialId; want: number; prio: Priority; price: number };
  const cands: Cand[] = [];
  const seen = new Set<MaterialId>();
  for (const id of opts.ids) {
    if (seen.has(id)) continue; seen.add(id);
    const r = ruleOf(id), name = MATERIALS[id].name;
    if (MATERIALS[id].price === null) { skipped.push({ id, name, reason: 'not for sale' }); continue; }
    if (r.alt && !opts.includeAlt) { skipped.push({ id, name, reason: r.alt }); continue; }
    if (r.when === 'kids' && hh.kids === 0) { skipped.push({ id, name, reason: 'no children in the house' }); continue; }
    const want = shortfall(s, id, cart[id] ?? 0, horizon, hh);
    if (want <= 0) continue;
    cands.push({ id, want, prio: r.prio, price: MATERIALS[id].price ?? 0 });
  }
  cands.sort((a, b) => a.prio - b.prio || a.price - b.price);
  for (const c of cands) {
    // as many as fit: the whole shortfall, then half, down to one
    const name = MATERIALS[c.id].name;
    let n = c.want, placed = 0, why: string | null = null;
    while (n > 0) {
      add[c.id] = n;
      why = fits(linesNow());
      if (!why) { placed = n; break; }
      n = n > 4 ? Math.ceil(n / 2) : n - 1;
    }
    if (placed === 0) { delete add[c.id]; skipped.push({ id: c.id, name, reason: why ?? 'over budget' }); }
    else if (placed < c.want) skipped.push({ id: c.id, name, reason: `only ${placed} of ${c.want} fit the budget` });
  }
  if ((opts.foodDays ?? 0) > 0 && dailyNeed(s) > 0) {
    const units = pantryTopUp(dailyNeed(s), foodDaysCovered(s, foodCart), opts.foodDays!);
    if (units.length) {
      const set = (scale: number) => { for (const id of Object.keys(food) as FoodItemId[]) delete food[id]; for (const [id, n] of units) { const q = Math.floor(n * scale + 1e-9); if (q > 0) food[id] = q; } };
      // the biggest share of the pantry that fits, then single units while any still fit: pressing again then adds nothing
      let lo = 0, hi = 1;
      set(1);
      if (fits(linesNow())) {
        for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; set(mid); if (fits(linesNow())) hi = mid; else lo = mid; }
        set(lo);
        const kcalOf = () => units.reduce((a, [id]) => a + (food[id] ?? 0) * FOOD[id].kcal, 0), want = units.reduce((a, [id, n]) => a + n * FOOD[id].kcal, 0);
        for (let again = true; again && kcalOf() < want;) {
          again = false;
          for (const [id] of units) { if (kcalOf() >= want) break; food[id] = (food[id] ?? 0) + 1; if (fits(linesNow())) { food[id]! -= 1; if (!food[id]) delete food[id]; } else again = true; }
        }
        const got = kcalOf();
        if (!Object.keys(food).length) skipped.push({ id: 'food', name: 'Food', reason: fits(linesNow()) ?? 'over budget' });
        else skipped.push({ id: 'food', name: 'Food', reason: `only ${Math.round(100 * got / want)} % of the ${opts.foodDays}-day pantry fits the budget` });
      }
    }
  }
  return finish();
}

export interface Preset { id: string; name: string; text: string; ids: readonly MaterialId[]; foodDays: number; horizonDays: number; includeAlt?: boolean }

/** Cross-tab "complete kit" presets. Each names its goods outright, so a preset may include a good that a tab's "everything" would call an alternative. */
export const PRESETS: readonly Preset[] = [
  { id: 'essentials', name: 'Operational essentials', text: 'A bed roll or tent for everyone, drinking water and a filter, a medicine shelf, soap, fuel and a radio. Plus a month of food.', foodDays: 30, horizonDays: 30,
    ids: ['sleeping_bag', 'tent', 'water_jugs', 'water_filter', 'meds', 'hygiene', 'fuel', 'sw_radio', 'radios', 'ifak'] },
  { id: 'pantry30', name: '30-day pantry', text: 'Tops food up to a month for everyone (only what you lack).', foodDays: 30, horizonDays: 30, ids: [] },
  { id: 'pantry90', name: '90-day pantry', text: 'Tops food up to three months for everyone (only what you lack).', foodDays: 90, horizonDays: 90, ids: [] },
  { id: 'medical', name: 'Medical shelf', text: 'Kits, antibiotics, rehydration salts, splints, first-aid kits, soap and a medical reference. Not the clinic suite.', foodDays: 0, horizonDays: 90,
    ids: ['meds', 'antibiotics', 'ors', 'splints', 'ifak', 'hygiene', 'medical_books'] },
  { id: 'defense', name: 'Defensive kit', text: 'A plate carrier and a first-aid kit for each fighter, radios, a driveway alarm, floodlights, tripwires, a steel door and window bars.', foodDays: 0, horizonDays: 30,
    ids: ['plate_carrier', 'ifak', 'radios', 'driveway_alarm', 'floodlights', 'tripwire', 'steel_door', 'window_bars'] },
];

/** The goods of a tab, in a stable order (a good on two shelves counts once). */
export const tabIds = (tab: ShelfTab): MaterialId[] => [...new Set(SHELVES[tab])];

/** The plan for a preset. */
export const planPreset = (s: GameState, p: Preset, cart: Partial<Record<MaterialId, number>>, foodCart: Partial<Record<FoodItemId, number>>, stay: boolean): QuickPlan =>
  planQuickBuy(s, cart, foodCart, { ids: p.ids, horizonDays: p.horizonDays, stayInBudget: stay, includeAlt: p.includeAlt, foodDays: p.foodDays });

/** Recommended units of a named food for `days`, from the three-month pantry's mix (0 = not part of the basic pantry). */
export function foodRecommended(id: FoodItemId, needKcal: number, days = 30): number {
  const share = KITS.find(k => k.id === 'quarter')?.mix[id] ?? 0;
  return share > 0 && needKcal > 0 ? Math.max(1, Math.round(needKcal * days * share / FOOD[id].kcal)) : 0;
}
