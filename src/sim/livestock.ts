/**
 * Livestock beyond the chicken coop (goats, pigs, a steer, meat rabbits).
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
 * Prices (2025 US): a dairy doe $350, a feeder pig $150, a weaned steer calf
 * $1,800, a meat rabbit $35; hay $12 a small square bale, feed $20 a bag.
 */
import { log } from './economy';
import { calendarOf, type GameState } from './state';
import { REGIONS } from './regions';

export type Animal = 'goat' | 'pig' | 'steer' | 'rabbit';
export const ANIMALS: Animal[] = ['goat', 'pig', 'steer', 'rabbit'];

/** Pounds a head eats a day: hay (out of the grazing season) and bagged feed. */
const EAT: Record<Animal, { hay: number; feed: number }> = {
  goat: { hay: 5, feed: 1 },
  pig: { hay: 0, feed: 6 },
  steer: { hay: 24, feed: 2 },
  rabbit: { hay: 0, feed: 0.35 },
};
const BALE_LB = 50, BAG_LB = 50;
/** On pasture in the frost-free season: the share of hay still fed. */
const GRAZE = 0.15;
const MILK_KCAL = 1300, PORK_KCAL = 150 * 1100, BEEF_KCAL = 450 * 1000, FRYER_KCAL = 2000;
const LITTER = 6, RABBIT_CYCLE = 60, RABBIT_CAP = 12;

export interface Livestock {
  /** 0..1 by animal: how well fed the herd is. */
  condition: Record<Animal, number>;
  /** Year the pigs (and steer) last went to the butcher. */
  butchered: number;
  /** Day the first steer came onto the place (null: none). */
  steerSince: number | null;
  /** Day of the last litters. */
  litterAt: number;
}
export const newLivestock = (): Livestock => ({ condition: { goat: 1, pig: 1, steer: 1, rabbit: 1 }, butchered: -1, steerSince: null, litterAt: -1 });

const head = (s: GameState, a: Animal) => Math.floor(s.stock[a] ?? 0);
const grazing = (s: GameState) => { const doy = calendarOf(s.clock).doy, [f0, f1] = REGIONS[s.site.region].frost; return doy >= f0 && doy <= f1; };
/** Hay share fed off-season: more in a hard-winter region. */
const winterHayScale = (s: GameState) => 1 + 0.2 * Math.max(0, REGIONS[s.site.region].cold - 1);

/** Bales of hay and bags of feed the animals on the place eat a day now. */
export function feedDemand(s: GameState): { hay: number; feed: number } {
  const hayShare = grazing(s) ? GRAZE : winterHayScale(s);
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
    const hayW = EAT[a].hay * (grazing(s) ? GRAZE : 1), w = hayW + EAT[a].feed;
    const fed = w > 0 ? (hayW * hayFed + EAT[a].feed * feedFed) / w : 1;
    const before = l.condition[a];
    l.condition[a] = Math.min(1, Math.max(0, before + (fed >= 0.95 ? 0.02 : -0.06 * (1 - fed))));
    if (before >= 0.5 && l.condition[a] < 0.5) log(s, `The ${a === 'steer' ? 'steer is' : a + 's are'} short of feed and losing condition.`);
    if (l.condition[a] <= 0) { s.stock[a] = head(s, a) - 1; l.condition[a] = 0.4; log(s, `A ${a} died: starved for want of ${EAT[a].hay > 0 ? 'hay' : 'feed'}.`); }
  }
  let kcal = 0;
  const meat = (k: number, what: string) => {
    kcal += k;
    if (freezer) s.stock.frozen += k / 10000;
    else if ((s.stock.smoker ?? 0) >= 1 && k > 8000) { s.stock.staples += k * 0.8 / 80000; kcal -= k * 0.2; }
    else s.stock.fresh += k / 2000;
    if (k >= 20000) log(s, `${what}: ${Math.round(k / 1000).toLocaleString('en-US')},000 kcal of meat${freezer ? ' in the freezer' : (s.stock.smoker ?? 0) >= 1 ? ' smoked and cured' : ' to eat before it turns'}.`);
  };
  // milk: dry from Dec to mid-February
  const goats = head(s, 'goat');
  if (goats > 0 && !(doy > 335 || doy < 45)) { const m = goats * MILK_KCAL * l.condition.goat; s.stock.fresh += m / 2000; kcal += m; }
  // November: pigs to the butcher, and the steer once it has had a summer here
  if (doy >= 305 && doy <= 334 && l.butchered !== year) {
    l.butchered = year;
    const pigs = head(s, 'pig');
    if (pigs > 0) { s.stock.pig = 0; meat(pigs * PORK_KCAL * (0.5 + 0.5 * l.condition.pig), pigs === 1 ? 'The pig went to the butcher' : `${pigs} pigs went to the butcher`); }
    const steers = head(s, 'steer');
    if (steers > 0 && l.steerSince != null && day - l.steerSince >= 150) { s.stock.steer = 0; l.steerSince = null; meat(steers * BEEF_KCAL * (0.5 + 0.5 * l.condition.steer), 'The steer went to the butcher'); }
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
