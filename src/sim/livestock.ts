/**
 * Livestock beyond the chicken coop (goats, pigs, a steer, sheep, meat rabbits).
 * Pure. The animals are goods in the stockpile: buy a head and it's on the place.
 *
 *  Feed        hay (50 lb square bales) and bagged feed (50 lb). Goats and the
 *              steer graze in the growing season (frost-free days) and eat
 *              mostly hay the rest of the year, more in a hard-winter region.
 *              Pigs and rabbits eat bagged feed all year. Buy the winter's hay
 *              in the fall (`winterHay` says how many bales).
 *  Hunger      short of feed, an animal loses condition; at zero one dies.
 *              Fed, it comes back. Everything it gives scales with condition.
 *  Food        a milking doe gives about 2 qt a day (≈ 1,300 kcal) except when
 *              dry in midwinter: fresh. Pigs go to the butcher in November
 *              (≈ 150 lb of pork each), the steer too once it has had a summer
 *              on the place (≈ 450 lb of beef). Rabbits breed: every 60 days
 *              each doe of the colony raises a litter of six fryers (≈ 2,000
 *              kcal each), the colony grows to 12 breeders and the rest is meat.
 *  Storage     meat goes to the freezer, else a smoker turns it into jerky
 *              (80 % kept, like staples), else it's eaten fresh (and spoils).
 *
 *  Sheep       a flock of ewes (`sheep`, $300 each): shorn in April (a wool check while the stores
 *              are open), lambed in April (about 1.3 lambs a ewe, the flock up to 40), the surplus
 *              to the butcher in November (≈ 50,000 kcal of mutton a head). Sheep need a roof in
 *              the cold months: a sheep barn holds 30, the family barn 12; without room they lose
 *              condition fast in a hard winter. The Livestock duty feeds them (sim/daily.ts).
 *
 * Prices (2025 US): a dairy doe $350, a feeder pig $150, a weaned steer calf
 * $1,800, a meat rabbit $35; hay $12 a small square bale, feed $20 a bag.
 */
import { careYield } from './daily';
import { log } from './economy';
import { logGate } from './nag';
import { calendarOf, type GameState } from './state';
import { REGIONS } from './regions';
import { MANURE, PILE_MAX } from './crops';
import { butcherKids, COW_MILK_KCAL, cowInMilk, dairyDay, GOAT_MILK_KCAL, grazeShare, herdDay, sheltered, sickShare } from './herd';
import { cookRatio } from './daily';
import { MEAT_WHERE, putUpMeat, renderLard } from './kitchen';

export type Animal = 'goat' | 'pig' | 'steer' | 'rabbit' | 'sheep' | 'cow';
export const ANIMALS: Animal[] = ['goat', 'cow', 'pig', 'steer', 'rabbit', 'sheep'];

/** Pounds a head eats a day: hay (out of the grazing season) and bagged feed. */
const EAT: Record<Animal, { hay: number; feed: number }> = {
  goat: { hay: 5, feed: 1 },
  pig: { hay: 0, feed: 6 },
  steer: { hay: 24, feed: 2 },
  rabbit: { hay: 0, feed: 0.35 },
  sheep: { hay: 4, feed: 0.4 },
  cow: { hay: 26, feed: 3 },
};
const BALE_LB = 50, BAG_LB = 50;
/** On pasture in the frost-free season: the share of hay still fed. */
const GRAZE = 0.15;
const PORK_KCAL = 150 * 1100, BEEF_KCAL = 450 * 1000, FRYER_KCAL = 2000;
const LITTER = 6, RABBIT_CYCLE = 60, RABBIT_CAP = 12;
/** The share of a pig's calories in fat that is rendered into lard. */
const LARD_SHARE = 0.15;
/** Sheep: a lamb crop, the flock's ceiling, mutton a head (kcal), a fleece's price, and the roof the barns give. */
export const LAMBS_PER_EWE = 1.3, FLOCK_CAP = 40, MUTTON_KCAL = 50_000, FLEECE_USD = 22;
export const BARN_SHEEP = 12, SHEEP_BARN_SHEEP = 30;

export interface Livestock {
  /** 0..1 by animal: how well fed the herd is. */
  condition: Record<Animal, number>;
  /** Year the pigs (and steer) last went to the butcher. */
  butchered: number;
  /** Day the first steer came onto the place (null: none). */
  steerSince: number | null;
  /** Day of the last litters. */
  litterAt: number;
  /** Sheep: ewes kept over the year (the rest go to the butcher), the year last shorn and lambed. */
  breeders?: number;
  sheared?: number;
}
export const newLivestock = (): Livestock => ({ condition: { goat: 1, pig: 1, steer: 1, rabbit: 1, sheep: 1, cow: 1 }, butchered: -1, steerSince: null, litterAt: -1 });

const head = (s: GameState, a: Animal) => Math.floor(s.stock[a] ?? 0);
const grazing = (s: GameState) => { const doy = calendarOf(s.clock).doy, [f0, f1] = REGIONS[s.site.region].frost; return doy >= f0 && doy <= f1; };
/** Sheep the barns roof: a sheep barn 30, the family barn 12. */
export const sheepRoom = (s: GameState): number => s.structures.reduce((a, st) => a + (st.finishedAt === null ? 0 : st.kind === 'sheep_barn' ? SHEEP_BARN_SHEEP : st.kind === 'barn' ? BARN_SHEEP : 0), 0);
/** Share of the flock under a roof (1 = all of them). */
export const sheepSheltered = (s: GameState): number => { const n = head(s, 'sheep'); return n <= 0 ? 1 : Math.min(1, sheepRoom(s) / n); };

/** Hay share fed off-season: more in a hard-winter region. */
const winterHayScale = (s: GameState) => 1 + 0.2 * Math.max(0, REGIONS[s.site.region].cold - 1);

/** Bales of hay and bags of feed the animals on the place eat a day now. */
export function feedDemand(s: GameState): { hay: number; feed: number } {
  const hayShare = grazing(s) ? grazeShare(s, GRAZE) : winterHayScale(s);
  let hay = 0, feed = 0;
  for (const a of ANIMALS) { const n = head(s, a) * (a === 'rabbit' ? 2 : 1); hay += n * EAT[a].hay * hayShare / BALE_LB; feed += n * EAT[a].feed / BAG_LB; }
  return { hay, feed };
}

/** Bales to put up in the fall for the winter (the frost-to-frost gap) at the current herd. */
export function winterHay(s: GameState): number {
  const [f0, f1] = REGIONS[s.site.region].frost;
  const days = 365 - (f1 - f0);
  return Math.ceil(ANIMALS.reduce((t, a) => t + head(s, a) * EAT[a].hay, 0) * winterHayScale(s) * days / BALE_LB);
}

/** Once a day (from the eating step): feeding, hunger, milk, litters, the November butchering. Returns kcal brought in. */
export function livestockDay(s: GameState, freezer: boolean): number {
  if (!ANIMALS.some(a => head(s, a) > 0)) return 0;
  const l = (s.livestock ??= newLivestock());
  l.condition.sheep ??= 1; l.condition.cow ??= 1;
  const day = Math.floor(s.clock.t + 0.25), { doy, year } = calendarOf(s.clock);
  if (head(s, 'steer') > 0) l.steerSince ??= day; else l.steerSince = null;
  // feeding: hay first come, first served; each animal's share of what there is
  const need = feedDemand(s);
  const hayFed = need.hay > 0 ? Math.min(1, (s.stock.hay ?? 0) / need.hay) : 1;
  const feedFed = need.feed > 0 ? Math.min(1, (s.stock.feed ?? 0) / need.feed) : 1;
  s.stock.hay = Math.max(0, (s.stock.hay ?? 0) - need.hay);
  s.stock.feed = Math.max(0, (s.stock.feed ?? 0) - need.feed);
  for (const a of ANIMALS) {
    if (head(s, a) === 0) { l.condition[a] = 1; continue; }
    const hayW = EAT[a].hay * (grazing(s) ? grazeShare(s, GRAZE) : 1), w = hayW + EAT[a].feed;
    const fed = w > 0 ? (hayW * hayFed + EAT[a].feed * feedFed) / w : 1;
    const before = l.condition[a];
    // sheep with no roof in the cold months waste: the wool is not enough in a Mountain West January
    const exposed = a === 'sheep' && !grazing(s) ? 0.03 * (1 - sheepSheltered(s)) * Math.max(0.3, REGIONS[s.site.region].cold) : (a === 'goat' || a === 'cow') && !grazing(s) ? 0.006 * (1 - sheltered(s)) * Math.max(0.3, REGIONS[s.site.region].cold) : 0;
    l.condition[a] = Math.min(1, Math.max(0, before + (fed >= 0.95 ? 0.02 : -0.06 * (1 - fed)) - exposed));
    if (exposed > 0.008 && logGate(s, 'sheep-cold', 20)) log(s, 'The sheep are standing in the snow with no barn: they are losing condition.');
    if (before >= 0.5 && l.condition[a] < 0.5) log(s, `The ${a === 'steer' ? 'steer is' : a + 's are'} short of feed and losing condition.`);
    if (l.condition[a] <= 0) { s.stock[a] = head(s, a) - 1; l.condition[a] = 0.4; log(s, `A ${a} died: starved for want of ${EAT[a].hay > 0 ? 'hay' : 'feed'}.`); }
  }
  // the barn pile: what the animals leave in the stalls (less on pasture) for the fields (sim/crops.ts)
  { const pile = ANIMALS.reduce((a, an) => a + head(s, an) * (MANURE[an] ?? 0), 0) * (grazing(s) ? 0.55 : 1); s.stock.manure = Math.min(PILE_MAX, (s.stock.manure ?? 0) + pile); }
  let kcal = 0;
  const meat = (k: number, what: string, pork = false) => {
    const put = putUpMeat(s, k, { freezer, pork });
    kcal += put.kept;
    if (k >= 20000) log(s, `${what}: ${Math.round(k / 1000).toLocaleString('en-US')},000 kcal of meat ${MEAT_WHERE[put.where]}.`);
  };
  // milk: dry from Dec to mid-February
  const goats = head(s, 'goat'), cows = head(s, 'cow');
  const goatMilk = goats > 0 && !(doy > 335 || doy < 45) ? goats * GOAT_MILK_KCAL * l.condition.goat * careYield(s, 'animals') * (1 - 0.5 * sickShare(s, 'goat')) : 0;
  const cowMilk = cows > 0 && cowInMilk(doy) ? cows * COW_MILK_KCAL * l.condition.cow * careYield(s, 'animals') * (1 - 0.5 * sickShare(s, 'cow')) : 0;
  // the family drinks, the cream is churned, the rest pressed with a kit (sim/herd.ts); goats alone: all on the table
  kcal += dairyDay(s, goatMilk + cowMilk, cows > 0, cookRatio(s));
  // sickness, kidding and calving, the pasture
  for (const line of herdDay(s, l)) log(s, line);
  // November: pigs to the butcher, and the steer once it has had a summer here
  if (doy >= 305 && doy <= 334 && l.butchered !== year) {
    l.butchered = year;
    const pigs = head(s, 'pig');
    if (pigs > 0) {
      s.stock.pig = 0;
      // the carcass is mostly meat to cure, smoke or freeze; the fat is rendered into lard (a kitchen day)
      const total = pigs * PORK_KCAL * (0.5 + 0.5 * l.condition.pig);
      meat(total * (1 - LARD_SHARE), pigs === 1 ? 'The pig went to the butcher' : `${pigs} pigs went to the butcher`, true);
      renderLard(s, total * LARD_SHARE);
      kcal += total * LARD_SHARE * 0.9;
    }
    const steers = head(s, 'steer');
    { const kids = butcherKids(s); if (kids > 0) meat(kids, 'The kids raised for meat went to the butcher'); }
    const flock = head(s, 'sheep'), keep = Math.min(flock, Math.max(2, l.breeders ?? flock));
    if (flock > keep) { s.stock.sheep = keep; meat((flock - keep) * MUTTON_KCAL * (0.5 + 0.5 * l.condition.sheep), `${flock - keep} lambs went to the butcher`); }
    if (steers > 0 && l.steerSince != null && day - l.steerSince >= 150) { s.stock.steer = 0; l.steerSince = null; meat(steers * BEEF_KCAL * (0.5 + 0.5 * l.condition.steer), 'The steer went to the butcher'); }
  }
  // sheep: shorn and lambed in April; the surplus goes to the butcher in the November block above
  const ewes = head(s, 'sheep');
  if (ewes > 0 && doy >= 100 && doy < 130 && l.sheared !== year) {
    l.sheared = year;
    if (s.disaster.tracks.stores > 0.5 && s.disaster.tracks.banks > 0.5) { const usd = Math.round(ewes * FLEECE_USD * (0.5 + 0.5 * l.condition.sheep)); s.money += usd; log(s, `Shearing day: ${ewes} fleece${ewes === 1 ? '' : 's'} sold for $${usd}.`); }
    else log(s, `Shearing day: ${ewes} fleece${ewes === 1 ? '' : 's'}, wool for blankets and socks.`);
    l.breeders = ewes;
    if (ewes >= 2 && l.condition.sheep >= 0.6) {
      const lambs = Math.min(Math.max(0, FLOCK_CAP - ewes), Math.floor(ewes * LAMBS_PER_EWE * l.condition.sheep));
      s.stock.sheep = ewes + lambs;
      if (lambs > 0) log(s, `${lambs} lamb${lambs === 1 ? '' : 's'} born this spring: the flock is ${ewes + lambs}.`);
    }
  }
  // rabbits: a buck and does; litters every 60 days, keep breeders up to the cap, the rest are fryers
  const rabbits = head(s, 'rabbit');
  if (l.litterAt < 0) l.litterAt = day;
  if (rabbits >= 2 && day - l.litterAt >= RABBIT_CYCLE && l.condition.rabbit >= 0.5) {
    l.litterAt = day;
    const kits = Math.floor((rabbits - 1) * LITTER * l.condition.rabbit);
    const keep = Math.min(kits, Math.max(0, RABBIT_CAP - rabbits));
    s.stock.rabbit = rabbits + keep;
    if (kits - keep > 0) meat((kits - keep) * FRYER_KCAL, `${kits - keep} fryers from the rabbit hutch`);
  }
  return kcal;
}
