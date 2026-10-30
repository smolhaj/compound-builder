/**
 * The barnyard beyond feeding (docs/DECISIONS.md "Farm & kitchen, part 2"): sickness, breeding, pasture, the dairy and
 * butchering by hand. Pure; livestock.ts calls these from its daily step.
 *
 *  Sickness   each head has a yearly chance of falling ill (goats 12 %, a cow 15 %, pigs 6 %, a steer 5 %, sheep 10 %,
 *             rabbits 15 %), doubled in poor condition or when the animals chore is badly behind. A sick animal gives half
 *             its milk and loses condition. With a vet kit (a dose is a tenth) 30 % recover a day; in peacetime the vet
 *             comes out for $250 and sets right 92 %; otherwise it is luck (6 % a day) and 1.5 % a day die.
 *  Breeding   does kid in spring (1.5 kids a doe, half kept as does up to 14 goats, the rest raised for meat), a cow
 *             calves in March (a heifer is kept up to 3 cows, a bull calf is raised as a steer, up to 6), the rabbit
 *             and sheep breeding stays in livestock.ts.
 *  Pasture    the open land carries so many animal units (a cow 1, a steer 0.7, a goat or sheep 0.15) by its rain; past that
 *             the grass wears (pasture condition), the animals get more hay and less grazing, and the pasture comes
 *             back when the herd is down to what it carries.
 *  Dairy      the family drinks what it can (500 kcal a head a day); the cow's cream is churned to butter; with a cheese kit
 *             the rest is pressed (≈ 62 % of the calories, a year in the cool); what is left goes to the table and sours.
 *             Goats alone with no kit: all of it on the table, as before.
 *  Butchering the November butchering is automatic (livestock.ts); `butcher` kills any surplus on a cold day by hand: a kitchen
 *             job (2.5 person-hours a head) that the meat methods then put up (sim/kitchen.ts), lard from pigs.
 */
import { hasBasement } from './housingStyles';
import { calendarOf, type GameState } from './state';

import { mulberry32 } from './rng';
import { log } from './economy';
import { logGate } from './nag';
import { addFoodKcal } from './pantry';
import { farmOf } from './farm';
import { isFinished } from './construction';
import { kitchenOf, putUpMeat, renderLard, MEAT_WHERE } from './kitchen';
import type { Animal, Livestock } from './livestock';
import { regionFor } from './climate';

export interface Herd {
  /** Sick animals by kind. */
  sick: Partial<Record<Animal, number>>;
  /** Pasture condition 0–1 (the grass). */
  pasture: number;
  /** Year the goats kidded / the cow calved; the kids being raised for meat; this year's births. */
  kidded: number;
  calved: number;
  meatKids: number;
  born: number;
  /** Day of the last vet visit. */
  vetAt: number;
  /** This year: milk (kcal), butter and cheese (lb), meat butchered by hand (head). */
  year: number;
  milk: number;
  butterLb: number;
  cheeseLb: number;
  butchered: number;
  deaths: number;
}
export const newHerd = (): Herd => ({ sick: {}, pasture: 1, kidded: -1, calved: -1, meatKids: 0, born: 0, vetAt: -99, year: 0, milk: 0, butterLb: 0, cheeseLb: 0, butchered: 0, deaths: 0 });
export const herdOf = (s: GameState): Herd => (farmOf(s).herd ??= newHerd());
const stock = (s: GameState, k: string): number => (s.stock as unknown as Record<string, number>)[k] ?? 0;
const head = (s: GameState, a: Animal): number => Math.floor(stock(s, a));

/** Yearly chance a head falls ill. */
export const ILL_PER_YEAR: Record<Animal, number> = { goat: 0.12, cow: 0.15, pig: 0.06, steer: 0.05, sheep: 0.1, rabbit: 0.15 };
export const VET_USD = 250;
export const GOAT_CAP = 14, COW_CAP = 3, STEER_CAP = 6;
/** Kcal of meat a head gives (rabbit: a fryer; the pig is the carcass, its fat is rendered to lard separately). */
export const MEAT_KCAL: Record<Animal, number> = { goat: 30_000, cow: 140_000, pig: 150 * 1100, steer: 450 * 1000, sheep: 50_000, rabbit: 2000 };
export const KID_KCAL = 25_000;
export const BUTCHER_HOURS = 2.5, LARD = 0.15;
/** Animal units: what a head eats of the grass. */
export const AU: Record<Animal, number> = { goat: 0.15, cow: 1, pig: 0, steer: 0.7, sheep: 0.15, rabbit: 0 };

// ─────────────────────────────────────────────────────────────────────────
// Pasture
// ─────────────────────────────────────────────────────────────────────────

/** Acres of open grass the animals can use. */
export function pastureAcres(s: GameState): number {
  const woods = s.site.acres * Math.max(0.05, Math.min(0.8, 0.4 * s.site.timber));
  const built = s.structures.filter(isFinished).reduce((a, st) => a + (st.kind === 'field' ? 0.25 : st.kind === 'garden' ? 0.1 : st.kind === 'orchard' ? 0.3 : st.kind === 'orchard_grove' || st.kind === 'orchard_terraced' ? 1.2 : 0.05), 0);
  return Math.max(0, 0.6 * (s.site.acres - woods) - built);
}
/** Animal units the pasture carries at full grass. */
export const carrying = (s: GameState): number => pastureAcres(s) * Math.min(1.6, regionFor(s.site).rainMm / 700) / 3;
export const unitsOn = (s: GameState): number => (Object.keys(AU) as Animal[]).reduce((a, k) => a + head(s, k) * AU[k], 0);
/** Stocking against what the pasture carries (1 = just right; over 1 the grass wears). */
export function stocking(s: GameState): number {
  const u = unitsOn(s), c = carrying(s) * herdOf(s).pasture;
  return u <= 0 ? 0 : c <= 0.01 ? 9 : u / c;
}
/** The share of the hay ration the animals still need in the grazing season, by stocking (livestock.ts GRAZE is the floor). */
export const grazeShare = (s: GameState, floor: number): number => Math.min(1, floor + (1 - floor) * Math.max(0, Math.min(1, (stocking(s) - 1) / 1.5)));

// ─────────────────────────────────────────────────────────────────────────
// Shelter
// ─────────────────────────────────────────────────────────────────────────

/** Animal units a roof holds: the family barn 3, a barnyard 6, a sheep barn 4.5 (30 sheep). */
export const SHELTER_AU: Record<string, number> = { barn: 3, barnyard: 6, sheep_barn: 4.5 };
export const shelterRoom = (s: GameState): number => s.structures.reduce((a, st) => a + (isFinished(st) ? SHELTER_AU[st.kind] ?? 0 : 0), 0);
/** Share of the herd (in animal units, pigs and rabbits aside) under a roof for the winter. */
export function sheltered(s: GameState): number {
  const u = unitsOn(s);
  return u <= 0.01 ? 1 : Math.min(1, shelterRoom(s) / u);
}

// ─────────────────────────────────────────────────────────────────────────
// Sickness
// ─────────────────────────────────────────────────────────────────────────

export const sickShare = (s: GameState, a: Animal): number => { const n = head(s, a); return n > 0 ? Math.min(1, (herdOf(s).sick[a] ?? 0) / n) : 0; };

function sicknessDay(s: GameState, l: Livestock, r: () => number): string[] {
  const out: string[] = [], h = herdOf(s), day = Math.floor(s.clock.t + 0.25);
  const neglect = (s.daily?.chores.levels.animals ?? 0) > 60 ? 2 : 1;
  const peacetime = s.disaster.tracks.stores > 0.5 && s.disaster.tracks.law > 0.5;
  for (const a of Object.keys(ILL_PER_YEAR) as Animal[]) {
    const n = head(s, a);
    if (n <= 0) { h.sick[a] = 0; continue; }
    let sick = Math.min(n, h.sick[a] ?? 0);
    // new cases
    const p = ILL_PER_YEAR[a] / 365 * ((l.condition[a] ?? 1) < 0.6 ? 2 : 1) * neglect * (1 - 0.3 * sheltered(s));
    for (let k = 0; k < n - sick; k++) if (r() < p) { sick++; if (logGate(s, `ill:${a}`, 8)) out.push(`A ${a === 'steer' ? 'steer' : a} is off its feed and hanging its head: sick.`); }
    if (sick > 0) {
      l.condition[a] = Math.max(0, (l.condition[a] ?? 1) - 0.01 * sick / n);
      // treatment: the kit, the vet, or luck
      let cure = 0.06;
      const dose = 0.1 * sick;
      if (stock(s, 'vet_kit') >= dose) { (s.stock as unknown as Record<string, number>).vet_kit -= dose; cure = 0.3; }
      else if (peacetime && s.money >= VET_USD && day - h.vetAt >= 10) { s.money -= VET_USD; h.vetAt = day; cure = 0.92; out.push(`The vet came out for the sick ${a}: $${VET_USD}.`); }
      let well = 0, died = 0;
      for (let k = 0; k < sick; k++) {
        if (r() < cure) well++;
        else if (cure < 0.3 && r() < 0.015 * (a === 'cow' ? 1.3 : 1)) died++;
      }
      sick -= well + died;
      if (died > 0) { (s.stock as unknown as Record<string, number>)[a] = n - died; h.deaths += died; out.push(`A ${a} died of its sickness. A vet kit on the shelf would have saved it.`); }
    }
    h.sick[a] = Math.max(0, sick);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Breeding
// ─────────────────────────────────────────────────────────────────────────

function breedingDay(s: GameState, l: Livestock): string[] {
  const out: string[] = [], h = herdOf(s), { doy, year } = calendarOf(s.clock);
  const st = s.stock as unknown as Record<string, number>;
  const goats = head(s, 'goat');
  if (goats >= 2 && doy >= 75 && doy <= 100 && h.kidded !== year && (l.condition.goat ?? 1) >= 0.6) {
    h.kidded = year;
    const kids = Math.floor(goats * 1.5 * (l.condition.goat ?? 1) * (1 - sickShare(s, 'goat')));
    const does = Math.min(Math.max(0, GOAT_CAP - goats), Math.floor(kids / 2));
    st.goat = goats + does; h.meatKids += kids - does; h.born += kids;
    if (kids > 0) out.push(`${kids} kid${kids === 1 ? '' : 's'} born in the barn: ${does} doe${does === 1 ? '' : 's'} kept, ${kids - does} to raise for meat.`);
  }
  const cows = head(s, 'cow');
  if (cows >= 1 && doy >= 65 && doy <= 90 && h.calved !== year && (l.condition.cow ?? 1) >= 0.6) {
    h.calved = year;
    let heifers = 0, bulls = 0;
    for (let k = 0; k < cows; k++) { if ((s.seed * 31 + year * 7 + k) % 2 === 0 && head(s, 'cow') + heifers < COW_CAP) heifers++; else bulls++; }
    st.cow = cows + heifers; st.steer = Math.min(STEER_CAP, head(s, 'steer') + bulls); h.born += heifers + bulls;
    out.push(`${cows === 1 ? 'The cow has' : 'The cows have'} calved: ${heifers ? `${heifers} heifer calf kept` : ''}${heifers && bulls ? ', ' : ''}${bulls ? `${bulls} bull calf to raise for beef` : ''}. Milk is coming.`);
  }
  return out;
}

/** A cow gives milk through the year but dry for the two months before calving (about Jan 20 to Mar 10). */
export const cowInMilk = (doy: number): boolean => !(doy >= 20 && doy < 70);

// ─────────────────────────────────────────────────────────────────────────
// Dairy
// ─────────────────────────────────────────────────────────────────────────

export const DRINK_KCAL = 500, COW_MILK_KCAL = 6000, GOAT_MILK_KCAL = 1300;
export const CHEESE_KEEP = 0.62, BUTTER_KEEP = 0.75, BUTTER_SHARE = 0.25, CHEESE_SHARE = 0.6;

/**
 * The day's milk (kcal, after condition, sickness and the tending chore): the family drinks, the cream is churned,
 * the rest pressed, the remainder is on the table. Returns the calories that reach the stores and the table (fresh).
 */
export function dairyDay(s: GameState, milk: number, cows: boolean, ratio: number): number {
  if (milk <= 0) return 0;
  const h = herdOf(s), k = kitchenOf(s);
  h.milk += milk;
  const people = s.personState.filter(ps => ps.needs.died == null).length;
  const drink = Math.min(milk, people * DRINK_KCAL);
  let rest = milk - drink, fresh = drink;
  if (rest > 1000 && ratio >= 0.3) {
    if (cows) {
      const cream = rest * BUTTER_SHARE;
      addFoodKcal(s, 'butter', cream * BUTTER_KEEP); h.butterLb += cream * BUTTER_KEEP / 3250; k.hours += 0.4 * cream * BUTTER_KEEP / 3250; rest -= cream;
    }
    if (stock(s, 'cheese_kit') >= 1) {
      const curd = rest * CHEESE_SHARE;
      addFoodKcal(s, 'cheese', curd * CHEESE_KEEP); h.cheeseLb += curd * CHEESE_KEEP / 1800; k.hours += 1.5 * curd * CHEESE_KEEP / 1800; rest -= curd;
    }
  }
  fresh += rest;
  s.stock.fresh += fresh / 2000;
  return milk;
}

// ─────────────────────────────────────────────────────────────────────────
// Butchering by hand
// ─────────────────────────────────────────────────────────────────────────

/** Why `n` head of `a` cannot be butchered now (null = they can). */
export function butcherProblem(s: GameState, a: Animal, n: number): string | null {
  if (head(s, a) < n || n < 1) return `not ${n} ${a} on the place`;
  if (a === 'cow') return 'a milk cow is not for the butcher';
  const cold = regionFor(s.site).cold, { doy } = calendarOf(s.clock);
  const warm = (doy > 120 && doy < 280) && cold < 1.3;
  if (warm && !(stock(s, 'smoker') >= 1) && !s.structures.some(st => (st.kind === 'root_cellar' || hasBasement(st.kind)) && isFinished(st)) && a !== 'rabbit') return 'too warm to hang the meat without a cellar or a smoker';
  return null;
}
/** Kill and dress `n` head: the meat goes to the freezer, smoker, salt barrel or canner (sim/kitchen.ts), the pig's fat to lard. */
export function butcher(s: GameState, a: Animal, n: number): string | null {
  const why = butcherProblem(s, a, n);
  if (why) return why;
  const h = herdOf(s);
  (s.stock as unknown as Record<string, number>)[a] = head(s, a) - n;
  h.sick[a] = Math.min(h.sick[a] ?? 0, head(s, a));
  const total = n * MEAT_KCAL[a] * (0.5 + 0.5 * (s.livestock?.condition[a] ?? 1));
  const put = putUpMeat(s, a === 'pig' ? total * (1 - LARD) : total, { pork: a === 'pig' });
  if (a === 'pig') renderLard(s, total * LARD);
  kitchenOf(s).hours += BUTCHER_HOURS * n;
  h.butchered += n;
  log(s, `Butchering day: ${n} ${a}${n === 1 ? '' : 's'}, ${Math.round(total / 1000).toLocaleString('en-US')}k kcal of meat ${MEAT_WHERE[put.where]}${a === 'pig' ? ' and a pail of lard' : ''}.`);
  return null;
}
/** Raise-for-meat kids go in the November butchering (kcal). */
export function butcherKids(s: GameState): number {
  const h = herdOf(s), n = h.meatKids;
  if (n <= 0) return 0;
  h.meatKids = 0;
  return n * KID_KCAL;
}

// ─────────────────────────────────────────────────────────────────────────
// The daily step
// ─────────────────────────────────────────────────────────────────────────

/** Once a day (from livestock.ts, after the feeding): sickness, breeding, the pasture. Returns log lines. */
export function herdDay(s: GameState, l: Livestock): string[] {
  const out: string[] = [];
  const h = herdOf(s), { year } = calendarOf(s.clock), day = Math.floor(s.clock.t + 0.25);
  if (h.year !== year) { h.year = year; h.milk = 0; h.butterLb = 0; h.cheeseLb = 0; h.butchered = 0; h.deaths = 0; h.born = 0; }
  const r = mulberry32(s.seed * 4591 + day * 53 + 7);
  out.push(...sicknessDay(s, l, r));
  out.push(...breedingDay(s, l));
  // the grass wears under too many animals in the growing season and comes back when it is eased
  const { doy } = calendarOf(s.clock), [f0, f1] = regionFor(s.site).frost;
  if (doy >= f0 && doy <= f1) {
    const over = stocking(s);
    h.pasture = over > 1 ? Math.max(0.3, h.pasture - 0.003 * (over - 1)) : Math.min(1, h.pasture + 0.002);
    if (over > 1.3 && logGate(s, 'overgrazed', 60)) out.push('The pasture is eaten down to the dirt: too many animals for the grass. Sell some, or feed more hay.');
  } else h.pasture = Math.min(1, h.pasture + 0.0004);
  return out;
}

/** What the Farm tab shows about the herd's feed and ground. */
export interface FeedBudget { pastureAcres: number; carries: number; units: number; stocking: number; pasture: number; hayBales: number; hayNeed: number; hayDays: number; feedBags: number; feedDays: number }
export function feedBudget(s: GameState, demand: { hay: number; feed: number }, winterHay: number): FeedBudget {
  return {
    pastureAcres: pastureAcres(s), carries: carrying(s), units: unitsOn(s), stocking: stocking(s), pasture: herdOf(s).pasture,
    hayBales: Math.floor(stock(s, 'hay')), hayNeed: winterHay, hayDays: demand.hay > 0 ? stock(s, 'hay') / demand.hay : Infinity,
    feedBags: Math.floor(stock(s, 'feed')), feedDays: demand.feed > 0 ? stock(s, 'feed') / demand.feed : Infinity,
  };
}
