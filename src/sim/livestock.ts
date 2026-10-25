/**
 * The barnyard (user-approved "livestock depth": feed through the winter,
 * breeding and young, butchering day, milk into cheese and butter, eggs by
 * season, predators, sickness and vet supplies). Pure. The adult animals
 * are goods in the stockpile (`s.stock.goat` is the does, `cow`, `sow`,
 * the bucks and boars, the feeder `pig`s and the `steer`); their young,
 * breeding, health and the hens are in `s.livestock`.
 *
 *  Feed      hay (50 lb small squares) and bagged feed (50 lb). Grazers eat
 *            mostly pasture in the frost-free season, as far as the place's
 *            pasture carries them (animal units by acres, open ground and
 *            rain: the dry West carries about one cow to ten acres, the wet
 *            East one to two); past it, and all winter, hay — more in a
 *            hard-winter region. Pigs, hens and rabbits eat bagged feed all
 *            year (hens and pigs on pasture eat a little less); short of
 *            bags, with the pantry well stocked, the family feeds them
 *            their own grain and potatoes. Hay keeps in a barn's loft; out
 *            under a tarp it loses about 3 % a month.
 *  Haying    with grazers and the winter's hay not yet in, the family cuts
 *            its own meadow twice (early summer and late summer): by hand
 *            (a scythe, a rake, a fork: ≈ a quarter hour a bale) or with a
 *            tractor and baler; a share of the pasture is meadow, yielding
 *            25–60 bales an acre a cutting by rain.
 *  Breeding  goats breed in the fall (gestation 150 days: kids in spring,
 *            1–3 a doe, ≈ 1.8); a cow any time 80 days after calving (283
 *            days: one calf); a sow a week after weaning (114 days: ≈ 10
 *            born, 8 weaned, two litters a year); rabbits every 60 days.
 *            Each needs a sire: a buck / boar on the place, or (peacetime)
 *            AI or a stud for a fee ($60–75), or a friendly neighbor's
 *            (an old farmer or a rancher down the road). None: no young,
 *            and no fresh milk next year.
 *  Milk      a doe gives ≈ 2 qt a day at full lactation (≈ 1,300 kcal), a
 *            Jersey ≈ 3 gal (≈ 7,500 kcal); lactation peaks in the first
 *            two months, runs ten months, and dries off two months before
 *            the next birth (unbred, it tails off over another six months).
 *            Kids and a calf drink half the milk until weaned. The family
 *            drinks about a quart a head; the rest goes to butter (the
 *            cow's cream) and cheese (dairy.ts), or the pigs.
 *  Young     kids weaned at 60 days, bucklings and surplus doelings to the
 *            butcher in October–November (≈ 30 lb of meat); piglets weaned
 *            at 56 days, butchered at six months like a feeder; calves
 *            weaned at 90 days, steers to the butcher at 18 months.
 *            Doelings, heifers and gilts join the herd up to what the
 *            family keeps (`keep`).
 *  Butcher   November: the feeder pigs (≈ 125,000 kcal of pork and ≈ 20 lb
 *            of lard each) and the steer once it has had a summer here
 *            (≈ 450 lb of beef). Rabbits every 60 days (fryers past the
 *            colony's 12 breeders). The family can butcher any animal
 *            (`butcher`). Meat goes to the freezer, else smoked, cured,
 *            canned (preserving.ts), else eaten fresh; each head books
 *            its hours.
 *  Health    predators and sickness: livestockHealth.ts. Hens: poultry.ts.
 *
 * Prices (2025 US): a dairy doe $350, a buck $300, a Jersey cow $2,200, a
 * bred gilt $450, a boar $400, a feeder pig $150, a steer calf $1,800, a
 * meat rabbit $35, ten chicks $45; hay $12 a bale, feed $20 a bag.
 */
import { log } from './economy';
import { calendarOf, type GameState } from './state';
import { REGIONS } from './regions';
import { isFinished } from './construction';
import { mulberry32 } from './rng';
import { addFood, takeFood } from './pantry';
import { putUpMeat, meatWords, type MeatKind } from './preserving';
import { book, LABOR } from './farmWork';
import { dairyDay, newDairy, type DairyState } from './dairy';
import { henFeedLb, newHens, poultryDay, type Hens } from './poultry';
import { healthDay, sickFactor, type Sick } from './livestockHealth';

export type Animal = 'goat' | 'goat_buck' | 'cow' | 'steer' | 'sow' | 'boar' | 'pig' | 'rabbit';
export const ANIMALS: Animal[] = ['goat', 'goat_buck', 'cow', 'steer', 'sow', 'boar', 'pig', 'rabbit'];
export const ANIMAL_NAME: Record<Animal, [string, string]> = {
  goat: ['dairy doe', 'dairy does'], goat_buck: ['buck', 'bucks'], cow: ['milk cow', 'milk cows'], steer: ['steer', 'steers'],
  sow: ['sow', 'sows'], boar: ['boar', 'boars'], pig: ['feeder pig', 'feeder pigs'], rabbit: ['rabbit', 'rabbits'],
};
export type YoungKind = 'kid' | 'piglet' | 'calf';
export interface Young { kind: YoungKind; n: number; /** females among them */ f: number; born: number }
export type Dam = 'goat' | 'cow' | 'sow';

/** Pounds a head eats a day: hay (out of the grazing season) and bagged feed. */
export const EAT: Record<Animal | YoungKind, { hay: number; feed: number }> = {
  goat: { hay: 5, feed: 1 }, goat_buck: { hay: 5, feed: 0.5 },
  cow: { hay: 30, feed: 6 }, steer: { hay: 24, feed: 2 },
  sow: { hay: 0, feed: 7 }, boar: { hay: 0, feed: 6 }, pig: { hay: 0, feed: 6 },
  rabbit: { hay: 0, feed: 0.35 },
  // weaned young, averaged over their growing (nursing young eat nothing)
  kid: { hay: 2, feed: 0.3 }, piglet: { hay: 0, feed: 4.5 }, calf: { hay: 12, feed: 1 },
};
/** Animal units on pasture (a 1,000 lb cow = 1). */
export const AU: Partial<Record<Animal | YoungKind, number>> = { goat: 0.15, goat_buck: 0.15, cow: 1, steer: 0.7, kid: 0.07, calf: 0.4 };
export const BALE_LB = 50, BAG_LB = 50;
/** On pasture in the frost-free season: the share of hay still fed. */
const GRAZE = 0.15;
/** kcal a head of meat. */
export const MEAT_KCAL: Record<Animal | YoungKind | 'hen', number> = {
  pig: 125_000, sow: 160_000, boar: 150_000, piglet: 125_000, steer: 450_000, cow: 300_000, calf: 350_000,
  goat: 22_000, goat_buck: 27_000, kid: 16_500, rabbit: 2000, hen: 1800,
};
/** Lard from a hog (gallon crocks, ≈ 7 lb). */
export const LARD_CROCKS: Partial<Record<Animal | YoungKind, number>> = { pig: 3, piglet: 3, sow: 4, boar: 3 };
const MILK_KCAL = { goat: 1300, cow: 7500 };
const GESTATION: Record<Dam, number> = { goat: 150, cow: 283, sow: 114 };
const WEAN: Record<YoungKind, number> = { kid: 60, piglet: 56, calf: 90 };
const LITTER = 6, RABBIT_CYCLE = 60, RABBIT_CAP = 12;
/** Fees for AI / a stud in peacetime, by dam. */
const STUD_FEE: Record<Dam, number> = { goat: 50, cow: 60, sow: 75 };
const SIRE: Record<Dam, Animal | null> = { goat: 'goat_buck', cow: null, sow: 'boar' };
const DAM_YOUNG: Record<Dam, YoungKind> = { goat: 'kid', cow: 'calf', sow: 'piglet' };

export interface Livestock {
  /** 0..1 by animal: how well fed the herd is. */
  condition: Record<Animal, number>;
  /** Year the feeder pigs (and steer) last went to the butcher. */
  butchered: number;
  /** Day the first steer came onto the place (null: none). */
  steerSince: number | null;
  /** Day of the last rabbit litters. */
  litterAt: number;
  // ── save v44 ──
  young: Young[];
  /** A dam herd bred: due day, dams bred. */
  preg: Partial<Record<Dam, { due: number; n: number }>>;
  /** Day the does / the cow last freshened (gave birth, or were bought in milk). */
  fresh: Partial<Record<'goat' | 'cow', number>>;
  /** Heads on the place yesterday (a rise is a purchase). */
  seen: Partial<Record<Animal, number>>;
  /** Animals sick now (livestockHealth.ts). */
  sick: Sick[];
  /** Coops and hutches predator-proofed (structure ids; 'hutch' for the rabbit hutch). */
  proofed: string[];
  /** A predator was shot or run off: quieter until this day. */
  quietUntil: number;
  hens: Hens;
  dairy: DairyState;
  /** Breeding stock to keep: doelings, heifers and gilts join the herd up to these. */
  keep: Record<Dam, number>;
  /** Hay made off the meadow this year (bales), the year. */
  hayYear: number;
  hayMade: number;
  /** This year's tallies. */
  year: number;
  born: number;
  lost: { predators: number; sickness: number; hunger: number };
  /** Year a "no sire" warning went out, by dam herd. */
  warned: Partial<Record<Dam, number>>;
  /** Pounds of feed the dairy's skim and whey stand in for today (fed to the pigs). */
  slop: number;
}

export const newLivestock = (): Livestock => ({
  condition: { goat: 1, goat_buck: 1, cow: 1, steer: 1, sow: 1, boar: 1, pig: 1, rabbit: 1 }, butchered: -1, steerSince: null, litterAt: -1,
  young: [], preg: {}, fresh: {}, seen: {}, sick: [], proofed: [], quietUntil: -1, hens: newHens(), dairy: newDairy(),
  keep: { goat: 4, cow: 1, sow: 1 }, hayYear: 0, hayMade: 0, year: 0, born: 0, lost: { predators: 0, sickness: 0, hunger: 0 }, warned: {}, slop: 0,
});
/** Fill in what an older record lacks (saves before v44, the tests). */
export function ensureLivestock(s: GameState): Livestock {
  const l = (s.livestock ??= newLivestock()), d = newLivestock();
  for (const k of Object.keys(d) as Array<keyof Livestock>) if (l[k] === undefined) (l as unknown as Record<string, unknown>)[k] = d[k];
  for (const a of ANIMALS) l.condition[a] ??= 1;
  return l;
}

export const head = (s: GameState, a: Animal) => Math.floor(s.stock[a] ?? 0);
const dayOf = (s: GameState) => Math.floor(s.clock.t + 0.25);
export const grazingSeason = (s: GameState) => { const doy = calendarOf(s.clock).doy, [f0, f1] = REGIONS[s.site.region].frost; return doy >= f0 && doy <= f1; };
/** Hay share fed off-season: more in a hard-winter region. */
const winterHayScale = (s: GameState) => 1 + 0.2 * Math.max(0, REGIONS[s.site.region].cold - 1);
export const hasBarn = (s: GameState) => s.structures.some(st => st.kind === 'barn' && isFinished(st));
const ageOf = (s: GameState, y: Young) => dayOf(s) - y.born;
const weaned = (s: GameState, y: Young) => ageOf(s, y) >= WEAN[y.kind];
/** Any stock at all (animals, young, hens). */
export const anyStock = (s: GameState) => ANIMALS.some(a => head(s, a) > 0) || (s.livestock?.young.length ?? 0) > 0 || (s.livestock?.hens?.n ?? 0) > 0 || s.structures.some(st => st.kind === 'chicken_coop' && isFinished(st));

/**
 * The place's pasture: animal units it carries in the grazing season (open
 * ground less the fields and buildings, by rain), and what's on it.
 */
export function pasture(s: GameState): { carries: number; grazers: number; meadowAcres: number } {
  const open = s.site.acres * Math.max(0.15, 1 - Math.min(0.8, s.site.timber * 0.4)) * 0.6;
  const rain = REGIONS[s.site.region].rainMm, perAcre = (rain < 500 ? 0.1 : rain < 800 ? 0.3 : 0.5) * (s.site.creek ? 1.4 : 1);
  const d = s.disaster, drought = d.kind === 'drought' && s.clock.t >= d.hitAt ? 0.4 : 1;
  let grazers = 0;
  for (const a of ANIMALS) grazers += head(s, a) * (AU[a] ?? 0);
  for (const y of s.livestock?.young ?? []) if (weaned(s, y)) grazers += y.n * (AU[y.kind] ?? 0);
  return { carries: open * perAcre * drought, grazers, meadowAcres: open * 0.3 };
}
/** Share of the hay ration still fed in the grazing season (more when the pasture is overstocked). */
function grazeHayShare(s: GameState): number {
  const p = pasture(s);
  if (p.grazers <= 0) return GRAZE;
  return 1 - (1 - GRAZE) * Math.min(1, p.carries / p.grazers);
}

/** Bales of hay and bags of feed the animals on the place eat a day now. */
export function feedDemand(s: GameState): { hay: number; feed: number } {
  const hayShare = grazingSeason(s) ? grazeHayShare(s) : winterHayScale(s);
  let hay = 0, feed = 0;
  const l = s.livestock;
  for (const a of ANIMALS) {
    const n = head(s, a) * (a === 'rabbit' ? 2 : 1);
    // a sow nursing a litter eats about twice her ration
    const lact = a === 'sow' && l?.young.some(y => y.kind === 'piglet' && !weaned(s, y)) ? 6 : 0;
    hay += n * EAT[a].hay * hayShare / BALE_LB; feed += n * (EAT[a].feed + lact) / BAG_LB;
  }
  for (const y of l?.young ?? []) if (weaned(s, y)) { hay += y.n * EAT[y.kind].hay * hayShare / BALE_LB; feed += y.n * EAT[y.kind].feed / BAG_LB; }
  feed += henFeedLb(s) / BAG_LB;
  return { hay, feed };
}

/** Bales to put up for the winter (the frost-to-frost gap) at the current herd. */
export function winterHay(s: GameState): number {
  const [f0, f1] = REGIONS[s.site.region].frost;
  const days = 365 - (f1 - f0);
  let lb = ANIMALS.reduce((t, a) => t + head(s, a) * EAT[a].hay, 0);
  for (const y of s.livestock?.young ?? []) lb += y.n * EAT[y.kind].hay;
  return Math.ceil(lb * winterHayScale(s) * days / BALE_LB);
}

/** Days the hay and feed in store last at today's rate (Infinity: none eaten). */
export function feedDays(s: GameState): { hay: number; feed: number } {
  const d = feedDemand(s);
  return { hay: d.hay > 0 ? (s.stock.hay ?? 0) / d.hay : Infinity, feed: d.feed > 0 ? (s.stock.feed ?? 0) / d.feed : Infinity };
}

/** Milk factor of a herd `dim` days in milk with the next birth `dueIn` days off (Infinity: not bred). */
export function lactation(dim: number, dueIn: number): number {
  if (dim < 0 || dueIn <= 60) return 0;
  if (dim <= 60) return 0.85 + 0.15 * dim / 60;
  if (dim <= 200) return 1;
  if (dim <= 305) return 1 - 0.4 * (dim - 200) / 105;
  return Math.max(0, 0.6 * (1 - (dim - 305) / 195));
}

/** A neighbor with a buck, a bull or a boar who'd lend it: an old farmer or a rancher at home and on good terms. */
const neighborSire = (s: GameState) => s.neighbors.some(n => (n.kind === 'old_farmer' || n.kind === 'ranch') && n.status === 'home' && n.disposition >= 25);
/** The sire for a dam herd: on the place, AI / a stud in peacetime (a fee), a neighbor's; null if none. */
function sireFor(s: GameState, dam: Dam): 'own' | 'stud' | 'neighbor' | null {
  const sire = SIRE[dam];
  if (sire && head(s, sire) > 0) return 'own';
  if (s.disaster.tracks.deliveries > 0.25 && s.money >= STUD_FEE[dam] * head(s, dam)) return 'stud';
  return neighborSire(s) ? 'neighbor' : null;
}

/** Meat in from a butchering: preserved (preserving.ts), its hours booked, a line in the log. Returns kcal. */
function slaughter(s: GameState, a: Animal | YoungKind | 'hen', n: number, cond: number, freezer: boolean, what: string): number {
  if (n <= 0) return 0;
  const kcal = n * MEAT_KCAL[a] * (0.5 + 0.5 * cond);
  const kind: MeatKind = a === 'pig' || a === 'sow' || a === 'boar' || a === 'piglet' ? 'pork' : a === 'hen' || a === 'rabbit' ? 'fowl' : 'red';
  const r = putUpMeat(s, kcal, kind, freezer);
  const lard = (LARD_CROCKS[a as Animal] ?? 0) * n * (0.5 + 0.5 * cond);
  if (lard > 0) { addFood(s, 'lard', lard); book(s, 'butchering', LABOR.renderLard * n, true); }
  book(s, 'butchering', (LABOR.butcher[a] ?? 4) * n, true);
  if (kcal >= 20000) log(s, `${what}: ${Math.round(kcal / 1000).toLocaleString('en-US')},000 kcal of meat ${meatWords(r)}${lard >= 1 ? `, and ${Math.round(lard)} crocks of lard rendered` : ''}.`);
  return kcal + lard * 28_600;
}

/** Butcher `n` of an adult animal now (the Farm tab). Returns kcal, or 0 if there are none. */
export function butcher(s: GameState, a: Animal, n = 1): number {
  const l = ensureLivestock(s);
  n = Math.min(n, head(s, a));
  if (n <= 0) return 0;
  s.stock[a] -= n;
  if (a === 'steer' && head(s, 'steer') === 0) l.steerSince = null;
  const freezer = s.structures.some(st => st.kind === 'root_cellar' && s.utilities.lit.includes(st.id));
  return slaughter(s, a, n, l.condition[a], freezer, n === 1 ? `Butchered a ${ANIMAL_NAME[a][0]}` : `Butchered ${n} ${ANIMAL_NAME[a][1]}`);
}

/** New heads bought since yesterday: does and a cow come in milk and bred, a gilt bred. */
function newcomers(s: GameState, l: Livestock): void {
  const day = dayOf(s), doy = calendarOf(s.clock).doy;
  for (const a of ANIMALS) {
    const n = head(s, a), was = l.seen[a] ?? 0;
    if (n > was) {
      if (a === 'goat') {
        // "a bred doe in milk": she kidded last spring (mid-March), bred in the fall for next spring
        l.fresh.goat ??= day - ((doy - 75 + 365) % 365);
        if (!l.preg.goat && (doy >= 244 || doy < 60)) l.preg.goat = { due: day + ((75 - doy + 365) % 365 || 365), n };
      }
      if (a === 'cow') { l.fresh.cow ??= day - 60; l.preg.cow ??= { due: day + 200, n }; }
      if (a === 'sow' && !l.preg.sow) l.preg.sow = { due: day + 60, n };
    }
    if (l.preg.goat && a === 'goat') l.preg.goat.n = Math.min(l.preg.goat.n, n);
    l.seen[a] = n;
  }
  for (const d of ['goat', 'cow', 'sow'] as Dam[]) if (head(s, d) === 0) { delete l.preg[d]; if (d !== 'sow') delete l.fresh[d]; }
}

/** Breeding and births for a dam herd. */
function breedAndBirth(s: GameState, l: Livestock, dam: Dam, r: () => number): void {
  const day = dayOf(s), { doy, year } = calendarOf(s.clock), dams = head(s, dam);
  const p = l.preg[dam];
  if (p && day >= p.due) {
    delete l.preg[dam];
    const n = Math.min(p.n, dams);
    if (n <= 0) return;
    const cold = doy < 90 || doy > 330, barn = hasBarn(s);
    let born = 0;
    for (let i = 0; i < n; i++) born += dam === 'goat' ? 1 + (r() < 0.6 ? 1 : 0) + (r() < 0.15 ? 1 : 0) : dam === 'cow' ? 1 : 8 + Math.floor(r() * 5);
    // losses at birth and before weaning: more in a cold month without a barn; a sow lies on some of her piglets
    const loss = dam === 'sow' ? (cold && !barn ? 0.3 : 0.2) : cold && !barn ? 0.15 : 0.05;
    const live = Math.max(0, Math.round(born * (1 - loss) * (0.6 + 0.4 * l.condition[dam])));
    if (live > 0) {
      let f = 0; for (let i = 0; i < live; i++) if (r() < 0.5) f++;
      l.young.push({ kind: DAM_YOUNG[dam], n: live, f, born: day });
      l.born += live;
    }
    if (dam !== 'sow') l.fresh[dam] = day;
    const word = dam === 'goat' ? (live === 1 ? 'kid' : 'kids') : dam === 'cow' ? 'calf' : 'piglets';
    log(s, dam === 'cow' ? (live ? 'The cow calved: a calf in the barn, and fresh milk.' : 'The cow calved, but the calf was born dead.') : `${dam === 'goat' ? 'Kidding' : 'Farrowing'}: ${live} ${word} born alive${born > live ? ` (${born - live} lost)` : ''}.`);
    return;
  }
  if (p || dams <= 0) return;
  // when the herd can be bred: goats in the fall; a cow 80 days after calving; a sow once her litter is weaned
  const ok = dam === 'goat' ? doy >= 244 && doy <= 349 && (l.fresh.goat == null || day - l.fresh.goat > 120)
    : dam === 'cow' ? l.fresh.cow == null || day - l.fresh.cow >= 80
      : !l.young.some(y => y.kind === 'piglet' && !weaned(s, y));
  if (!ok || l.condition[dam] < 0.5) return;
  const sire = sireFor(s, dam);
  if (!sire) {
    if (l.warned[dam] !== year && (dam !== 'goat' || doy > 300)) {
      l.warned[dam] = year;
      log(s, dam === 'goat' ? 'No buck to breed the does this fall: no kids in the spring, and the milk will dry up.' : dam === 'cow' ? 'No bull or AI tech for the cow: she won\'t calve again, and her milk tails off.' : 'No boar for the sows: no more litters.');
    }
    return;
  }
  // a heat comes round every three weeks; most take
  if (r() > 1 / 21 * (dam === 'sow' ? 0.85 : 0.6) * (dam === 'goat' ? 2 : 1)) return;
  if (sire === 'stud') { s.money -= STUD_FEE[dam] * dams; }
  l.preg[dam] = { due: day + GESTATION[dam], n: dams };
}

/** The young: weaning, joining the herd, the butcher. Returns kcal. */
function youngDay(s: GameState, l: Livestock, freezer: boolean): number {
  const doy = calendarOf(s.clock).doy;
  let kcal = 0;
  const keep: Array<Young> = [];
  for (const y of l.young) {
    const age = ageOf(s, y);
    if (y.n <= 0) continue;
    if (y.kind === 'kid' && age >= 180 && doy >= 274 && doy <= 334) {
      const join = Math.min(y.f, Math.max(0, l.keep.goat - head(s, 'goat')));
      if (join > 0) { s.stock.goat = head(s, 'goat') + join; l.seen.goat = head(s, 'goat'); }
      kcal += slaughter(s, 'kid', y.n - join, l.condition.goat, freezer, `${y.n - join} of this year's kids went to the butcher`);
      if (join > 0) log(s, `${join === 1 ? 'A doeling joins' : `${join} doelings join`} the milking herd.`);
      continue;
    }
    if (y.kind === 'piglet' && age >= 180) {
      const join = Math.min(y.f, Math.max(0, l.keep.sow - head(s, 'sow')));
      if (join > 0) { s.stock.sow = head(s, 'sow') + join; l.seen.sow = head(s, 'sow'); }
      kcal += slaughter(s, 'piglet', y.n - join, l.condition.pig, freezer, `${y.n - join} hogs from the spring litter went to the butcher`);
      continue;
    }
    if (y.kind === 'calf' && age >= 450 && y.f > 0) {
      const join = Math.min(y.f, Math.max(0, l.keep.cow - head(s, 'cow')));
      if (join > 0) { s.stock.cow = head(s, 'cow') + join; l.seen.cow = head(s, 'cow'); log(s, 'The heifer joins the milking herd.'); y.n -= join; y.f -= join; }
      if (y.n <= 0) continue;
    }
    if (y.kind === 'calf' && age >= 540) { kcal += slaughter(s, 'calf', y.n, l.condition.steer, freezer, y.n === 1 ? 'The steer raised here went to the butcher' : `${y.n} home-raised steers went to the butcher`); continue; }
    keep.push(y);
  }
  l.young = keep;
  return kcal;
}

/** Haymaking: two cuttings off the meadow when the grazers' winter hay isn't in. */
function hayDay(s: GameState, l: Livestock, r: () => number): void {
  const { doy, year } = calendarOf(s.clock), [f0, f1] = REGIONS[s.site.region].frost;
  if (l.hayYear !== year) { l.hayYear = year; l.hayMade = 0; }
  const first = doy >= f0 + 45 && doy <= f0 + 75, second = doy >= f1 - 55 && doy <= f1 - 25;
  if (!first && !second) return;
  const need = winterHay(s) - (s.stock.hay ?? 0);
  if (need <= 0 || r() > 0.7) return;      // rain: hay won't cure
  const p = pasture(s), rain = REGIONS[s.site.region].rainMm;
  const perCut = p.meadowAcres * (rain < 500 ? (s.site.creek ? 45 : 25) : rain < 800 ? 45 : 60);
  const cap = perCut * (first ? 1 : 2) - l.hayMade;
  if (cap <= 0) return;
  const tractor = (s.vehicles ?? []).some(v => v.kind === 'tractor' && v.fuel > 0);
  const perBale = tractor ? LABOR.baleTractor : LABOR.baleHand;
  const bales = Math.min(need, cap, book(s, 'haying', Math.min(need, cap, tractor ? 150 : 40) * perBale) / perBale);
  if (bales <= 0) return;
  s.stock.hay = (s.stock.hay ?? 0) + bales;
  l.hayMade += bales;
}

/** Feed from the pantry's own grain and potatoes when the bags run short and the larder can spare it. */
function feedFromStores(s: GameState, lbShort: number): number {
  const need = s.people.reduce((a, p, i) => a + (s.personState[i]?.needs?.died == null ? (p.kid ? 1700 : 2400) : 0), 0);
  const have = s.stock.staples * 80000 + s.stock.canned * 6000 + s.stock.frozen * 10000;
  if (need <= 0 || have / need < 120 || lbShort <= 0) return 0;
  const kcal = lbShort * 1500;
  let got = takeFood(s, 'home_dry', kcal / 77_500) * 77_500;
  if (got < kcal) got += takeFood(s, 'cellar_roots', (kcal - got) / 21_000) * 21_000;
  return got / 1500;
}

/** Once a day (farm.ts, from the eating step): the whole barnyard. Returns kcal brought in (milk, meat, lard). */
export function livestockDay(s: GameState, freezer: boolean): number {
  if (!anyStock(s)) return 0;
  const l = ensureLivestock(s);
  const day = dayOf(s), { doy, year } = calendarOf(s.clock);
  const r = mulberry32(s.seed * 4493 + day * 17 + 3);
  if (l.year !== year) { l.year = year; l.born = 0; l.lost = { predators: 0, sickness: 0, hunger: 0 }; }
  newcomers(s, l);
  if (head(s, 'steer') > 0) l.steerSince ??= day; else l.steerSince = null;
  hayDay(s, l, r);
  // milk (before the feeding: the skim and whey go to the pigs)
  let kcal = 0;
  const milk = { goat: 0, cow: 0 };
  for (const d of ['goat', 'cow'] as const) {
    const n = head(s, d), f = l.fresh[d];
    if (n <= 0 || f == null) continue;
    const due = l.preg[d] ? l.preg[d]!.due - day : Infinity;
    const nursing = l.young.some(y => y.kind === (d === 'goat' ? 'kid' : 'calf') && !weaned(s, y)) ? 0.5 : 1;
    milk[d] = n * MILK_KCAL[d] * lactation(day - f, due) * l.condition[d] * nursing * sickFactor(l, d);
    if (milk[d] > 0) book(s, 'milking', n * (d === 'goat' ? LABOR.milkDoe : LABOR.milkCow), true);
  }
  const people = s.personState.filter(ps => ps.needs.died == null && !ps.needs.taken).length;
  dairyDay(s, l, milk.goat, milk.cow, people, head(s, 'pig') + head(s, 'sow') + head(s, 'boar') + l.young.filter(y => y.kind === 'piglet').reduce((a, y) => a + y.n, 0) > 0);
  kcal += milk.goat + milk.cow;
  // feeding: hay first come, first served; each animal's share of what there is
  const need = feedDemand(s);
  const slopBags = Math.min(need.feed, l.slop / BAG_LB);
  need.feed -= slopBags;
  if ((s.stock.feed ?? 0) < need.feed) s.stock.feed = (s.stock.feed ?? 0) + feedFromStores(s, (need.feed - (s.stock.feed ?? 0)) * BAG_LB) / BAG_LB;
  const hayFed = need.hay > 0 ? Math.min(1, (s.stock.hay ?? 0) / need.hay) : 1;
  const feedFed = need.feed > 0 ? Math.min(1, (s.stock.feed ?? 0) / need.feed) : 1;
  s.stock.hay = Math.max(0, (s.stock.hay ?? 0) - need.hay);
  s.stock.feed = Math.max(0, (s.stock.feed ?? 0) - need.feed);
  // hay stacked outside under a tarp weathers
  if (!hasBarn(s) && (s.stock.hay ?? 0) > 0) s.stock.hay *= 0.999;
  const graze = grazingSeason(s) ? grazeHayShare(s) : 1;
  let care = 0;
  for (const a of ANIMALS) {
    const n = head(s, a);
    if (n === 0) { l.condition[a] = 1; continue; }
    care += n * (a === 'cow' || a === 'steer' ? LABOR.careCow : a === 'rabbit' ? LABOR.careRabbit : a.startsWith('goat') ? LABOR.careGoat : LABOR.carePig);
    const hayW = EAT[a].hay * graze, w = hayW + EAT[a].feed;
    const fed = w > 0 ? (hayW * hayFed + EAT[a].feed * feedFed) / w : 1;
    const before = l.condition[a];
    l.condition[a] = Math.min(1, Math.max(0, before + (fed >= 0.95 ? 0.02 : -0.06 * (1 - fed))));
    if (before >= 0.5 && l.condition[a] < 0.5) log(s, `The ${n === 1 ? ANIMAL_NAME[a][0] + ' is' : ANIMAL_NAME[a][1] + ' are'} short of feed and losing condition.`);
    if (l.condition[a] <= 0) { s.stock[a] = n - 1; l.seen[a] = n - 1; l.condition[a] = 0.4; l.lost.hunger++; log(s, `A ${ANIMAL_NAME[a][0]} died: starved for want of ${EAT[a].hay > 0 ? 'hay' : 'feed'}.`); }
  }
  // the weaned young eat with the herd (and starve with it)
  for (const y of l.young) if (weaned(s, y) && hayFed < 0.3 && feedFed < 0.3 && r() < 0.02) { y.n--; if (y.f > y.n) y.f = y.n; l.lost.hunger++; }
  l.young = l.young.filter(y => y.n > 0);
  book(s, 'animals', care + l.young.reduce((a, y) => a + y.n * 0.05, 0), true);
  // breeding and births
  for (const d of ['goat', 'cow', 'sow'] as Dam[]) breedAndBirth(s, l, d, r);
  kcal += youngDay(s, l, freezer);
  // November: the feeder pigs to the butcher, and the steer once it has had a summer here
  if (doy >= 305 && doy <= 334 && l.butchered !== year) {
    l.butchered = year;
    const pigs = head(s, 'pig');
    if (pigs > 0) { s.stock.pig = 0; l.seen.pig = 0; kcal += slaughter(s, 'pig', pigs, l.condition.pig, freezer, pigs === 1 ? 'The pig went to the butcher' : `${pigs} pigs went to the butcher`); }
    const steers = head(s, 'steer');
    if (steers > 0 && l.steerSince != null && day - l.steerSince >= 150) { s.stock.steer = 0; l.seen.steer = 0; l.steerSince = null; kcal += slaughter(s, 'steer', steers, l.condition.steer, freezer, 'The steer went to the butcher'); }
  }
  // rabbits: a buck and does; litters every 60 days, keep breeders up to the cap, the rest are fryers
  const rabbits = head(s, 'rabbit');
  if (l.litterAt < 0) l.litterAt = day;
  if (rabbits >= 2 && day - l.litterAt >= RABBIT_CYCLE && l.condition.rabbit >= 0.5) {
    l.litterAt = day;
    const kits = Math.floor((rabbits - 1) * LITTER * l.condition.rabbit * sickFactor(l, 'rabbit'));
    const keepN = Math.min(kits, Math.max(0, RABBIT_CAP - rabbits));
    s.stock.rabbit = rabbits + keepN; l.seen.rabbit = s.stock.rabbit;
    if (kits - keepN > 0) {
      kcal += (kits - keepN) * MEAT_KCAL.rabbit;
      putUpMeat(s, (kits - keepN) * MEAT_KCAL.rabbit, 'fowl', freezer);
      book(s, 'butchering', (kits - keepN) * LABOR.butcher.rabbit, true);
      if ((kits - keepN) * MEAT_KCAL.rabbit >= 20000) log(s, `${kits - keepN} fryers from the rabbit hutch.`);
    }
  }
  // the hens (chicks, broodies, culls), then predators and sickness
  kcal += poultryDay(s, l, freezer, r, feedFed);
  healthDay(s, l, r);
  return kcal;
}
