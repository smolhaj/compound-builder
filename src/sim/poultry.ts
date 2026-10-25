/**
 * The hens (user-approved: "eggs by season"; part of livestock depth).
 * Pure.
 *
 *  The flock   a finished coop comes with a dozen point-of-lay pullets (as
 *              before); a coop holds 15. Hens are counted, with the flock's
 *              average age.
 *  Laying      by day length: hens need about 14 hours of light to lay
 *              well. At ≈ 44° N that's ≈ 0.8 eggs a hen a day from April to
 *              August, ≈ 0.3 in midwinter, and the fall molt (October–
 *              November) stops most of them for a month or two. Each year
 *              of age takes ≈ 15 % off. Short of feed (≈ ¼ lb a hen a day,
 *              less on summer forage) they lay a third as much. ≈ 70 kcal
 *              an egg.
 *  New birds   chicks bought (`chicks`, ten straight-run: half pullets
 *              laying at five months, half cockerels to the pot at 16
 *              weeks; one kept as the rooster if there's none), or a broody
 *              hen in spring with a rooster on the place (≈ 6 chicks a
 *              hatch). A brooder needs heat: without power in the house
 *              a quarter of the chicks die.
 *  Culls       old hens (past about three years, laying poorly) go to the
 *              stewpot in October when there are pullets to take their
 *              place, or the coop is over full.
 *  Predators and sickness: livestockHealth.ts.
 */
import type { GameState } from './state';
import { calendarOf } from './state';
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { log } from './economy';
import { putUpMeat } from './preserving';
import { book, LABOR } from './farmWork';
import type { Livestock } from './livestock';

export interface Hens {
  /** Laying hens, their average age (days), roosters. */
  n: number;
  age: number;
  roosters: number;
  /** Growing birds: pullets to lay, cockerels to the pot, by the day they're ready. */
  pullets: Array<{ n: number; ready: number }>;
  cockerels: Array<{ n: number; ready: number }>;
  /** Coops already stocked with their dozen (structure ids). */
  stocked: string[];
  /** 0..1 how well fed. */
  cond: number;
  /** Year of the last broody hatch. */
  hatched?: number;
}
export const newHens = (): Hens => ({ n: 0, age: 0, roosters: 0, pullets: [], cockerels: [], stocked: [], cond: 1 });

export const COOP_HENS = 12, COOP_CAP = 15, EGG_KCAL = 70, HEN_FEED_LB = 0.25;
const PULLET_DAYS = 150, COCKEREL_DAYS = 112, COCKEREL_KCAL = 2750, HEN_KCAL = 1800;
const OLD_HEN = 1100;

const coops = (s: GameState) => s.structures.filter(st => st.kind === 'chicken_coop' && isFinished(st));
const birds = (h: Hens) => h.n + h.roosters + h.pullets.reduce((a, p) => a + p.n, 0) + h.cockerels.reduce((a, p) => a + p.n, 0);

/** Day length (hours) at ≈ 44° N. */
export const dayLength = (doy: number) => 12 + 3.3 * Math.sin(2 * Math.PI * (doy - 80) / 365);
/** Eggs a hen lays a day on `doy` (fed, a year old): light, then the fall molt. */
export function layRate(doy: number): number {
  const light = Math.min(1, Math.max(0, (dayLength(doy) - 9.5) / 4.5));
  const molt = doy >= 280 && doy <= 335 ? 0.35 : 1;
  return (0.3 + 0.5 * light) * molt;
}

/** What the flock forages and gets from the kitchen scraps a day (lb of feed it stands in for): most of it on summer range, a little in winter, a hen's ration a person in scraps. */
function forageLb(s: GameState, h: Hens): number {
  const doy = calendarOf(s.clock).doy, summer = doy >= 120 && doy <= 290;
  const people = s.personState.filter(ps => ps.needs.died == null && !ps.needs.taken).length;
  return birds(h) * HEN_FEED_LB * (summer ? 0.6 : 0.15) + people * HEN_FEED_LB;
}
/** Bagged feed the flock needs a day (lb), past what it forages and the scraps. */
export function henFeedLb(s: GameState): number {
  const h = s.livestock?.hens;
  if (!h) return 0;
  return Math.max(0, birds(h) * HEN_FEED_LB - forageLb(s, h));
}

/** The hens' eggs today (kcal, fresh), read by needs.ts produce. Before the flock is counted, a finished coop's dozen. */
export function eggsToday(s: GameState): number {
  const doy = calendarOf(s.clock).doy;
  const h = s.livestock?.hens;
  const n = h ? h.n : coops(s).length * COOP_HENS;
  if (n <= 0) return 0;
  const ageF = h ? Math.max(0.3, 1 - 0.15 * Math.max(0, h.age - 365) / 365) : 1;
  const fed = h ? 0.33 + 0.67 * h.cond : 1;
  return n * layRate(doy) * ageF * fed * EGG_KCAL;
}

/** Once a day (livestock.ts): the coops stocked, the birds growing, a broody's hatch, the culls. Returns kcal of birds to the pot. */
export function poultryDay(s: GameState, l: Livestock, freezer: boolean, r: () => number, feedFed = 1): number {
  const h = l.hens, day = Math.floor(s.clock.t + 0.25), { doy, year } = calendarOf(s.clock);
  for (const c of coops(s)) if (!h.stocked.includes(c.id)) {
    h.stocked.push(c.id);
    h.age = (h.age * h.n + 150 * COOP_HENS) / (h.n + COOP_HENS); h.n += COOP_HENS;
  }
  const cap = coops(s).length * COOP_CAP;
  // chicks in from the shop
  if ((s.stock.chicks ?? 0) >= 1) {
    const boxes = Math.floor(s.stock.chicks); s.stock.chicks -= boxes;
    const heat = s.structures.some(st => isHome(st.kind) && s.utilities.lit.includes(st.id));
    const live = Math.round(boxes * 10 * (heat ? 0.9 : 0.75));
    const pul = Math.round(live / 2);
    h.pullets.push({ n: pul, ready: day + PULLET_DAYS });
    h.cockerels.push({ n: live - pul, ready: day + COCKEREL_DAYS });
    log(s, `${live} chicks in the brooder${heat ? ' under the heat lamp' : ', huddled round a jug of hot water: some won\'t make it'}.`);
  }
  if (!h.n && !birds(h)) return 0;
  h.age += 1;
  // feeding (the bags are drawn with the rest of the stock in livestock.ts; `feedFed` is the share of them there was)
  const need = birds(h) * HEN_FEED_LB, bags = Math.max(0, need - forageLb(s, h));
  const fed = need > 0 ? Math.min(1, (need - bags + bags * feedFed) / need) : 1;
  h.cond = Math.min(1, Math.max(0, h.cond + (fed >= 0.95 ? 0.02 : -0.03 * (1 - fed))));
  if (h.cond <= 0.05 && h.n > 0) { h.n--; l.lost.hunger++; h.cond = 0.3; }
  book(s, 'animals', birds(h) * LABOR.careHen, true);
  let kcal = 0;
  // the growing birds come of age
  for (const p of h.pullets) if (day >= p.ready) { h.age = (h.age * h.n + PULLET_DAYS * p.n) / Math.max(1, h.n + p.n); h.n += p.n; p.n = 0; }
  h.pullets = h.pullets.filter(p => p.n > 0);
  for (const c of h.cockerels) if (day >= c.ready) {
    let n = c.n;
    if (h.roosters === 0 && n > 0) { h.roosters = 1; n--; }
    if (n > 0) { kcal += n * COCKEREL_KCAL; putUpMeat(s, n * COCKEREL_KCAL, 'fowl', freezer); book(s, 'butchering', n * LABOR.butcher.hen, true); log(s, `${n} young roosters to the pot.`); }
    c.n = 0;
  }
  h.cockerels = h.cockerels.filter(c => c.n > 0);
  // a broody hen in the spring, with a rooster, if the coop has room
  if (h.roosters > 0 && h.n >= 4 && doy >= 100 && doy <= 190 && h.hatched !== year && birds(h) < cap && r() < 0.03) {
    h.hatched = year;
    const chicks = Math.min(cap - birds(h), 4 + Math.floor(r() * 4));
    const pul = Math.round(chicks / 2);
    h.pullets.push({ n: pul, ready: day + PULLET_DAYS });
    if (chicks - pul > 0) h.cockerels.push({ n: chicks - pul, ready: day + COCKEREL_DAYS });
    log(s, `A broody hen hatched ${chicks} chicks under the nest boxes.`);
  }
  // October: the old hens to the stewpot, when pullets are coming or the coop is over full
  if (doy === 290 && h.n > 0) {
    const over = Math.max(0, birds(h) - cap);
    const old = h.age > OLD_HEN ? Math.round(h.n * 0.35) : 0;
    const cull = Math.min(h.n, Math.max(over, h.pullets.length ? old : 0));
    if (cull > 0) {
      h.n -= cull; h.age = Math.max(150, h.age - 200);
      kcal += cull * HEN_KCAL;
      putUpMeat(s, cull * HEN_KCAL, 'fowl', freezer);
      book(s, 'butchering', cull * LABOR.butcher.hen, true);
      log(s, `${cull} old hens to the stewpot.`);
    }
  }
  return kcal;
}
