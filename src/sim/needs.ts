/**
 * Food and the family's needs (GDS §4, decided with the user: calories +
 * variety + spoilage; injuries heal with care, death possible on Standard,
 * never on Cozy, permanent on Hardcore). Pure, run once a day.
 *
 * While the grocery stores work, the family eats from them (it's in the
 * household costs). Once they're gone, every calorie comes from what was
 * put by and what the place grows: fresh food first (it spoils), then the
 * freezer (only while the root cellar has power), then canned, then the
 * bulk staples. A diet of one thing wears on morale; going hungry wears on
 * health, and with it how much work people can do.
 */
import { calendarOf, type GameState } from './state';
import { wildDay } from './wildfood';
import { livestockDay } from './livestock';
import { isHome } from './blueprints';
import { log } from './economy';
import { isFinished } from './construction';
import { climate } from './effects';
import { tractorBoost } from './vehicles';
import { SOIL_YIELD } from './site';
import { REGIONS, seasons } from './regions';
import { gardenSeason, GREENHOUSE_PEAK, greenhouseGreens, hasGreenhouse, orchardHarvest } from './greenhouse';

export type FoodId = 'fresh' | 'frozen' | 'canned' | 'staples';
/** Food is kept in the stockpile in these units; kcal in one unit. */
export const KCAL: Record<FoodId, number> = { fresh: 2000, frozen: 10000, canned: 6000, staples: 80000 };
export const FOODS: FoodId[] = ['fresh', 'frozen', 'canned', 'staples'];
/** Daily need (kcal): adults working the land, kids. */
export const NEED_ADULT = 2400, NEED_KID = 1700, NEED_BABY = 1000;
/** What food stamps and the food bank cover a day when the money's gone (about a family of six). */
export const FOOD_BANK_KCAL = 6 * 2200;
/** One person's daily need (babies and toddlers eat less). */
export const needOf = (p: { kid: boolean; age: number }) => (p.kid ? (p.age < 3 ? NEED_BABY : NEED_KID) : NEED_ADULT);

export interface Needs {
  /** 0–100. */
  health: number;
  morale: number;
  /** Calories short, accumulated (kcal; recovers when fed). */
  hunger: number;
  /** Radiation dose (sieverts). */
  dose: number;
  /** Wounds / illness being treated: severity 0–100, what it is. */
  /** `trauma`: a wound from a fight (gunshot, shrapnel) that needs treating: meds, a medic or a medical bay. Untreated it barely heals and can go septic. */
  hurt: Array<{ what: string; sev: number; trauma?: boolean }>;
  /** Dead (day), or null. */
  died: number | null;
}

export const freshNeeds = (): Needs => ({ health: 100, morale: 70, hunger: 0, dose: 0, hurt: [], died: null });

/**
 * A quarter-acre field: potatoes, dry beans and wheat, ≈ 700,000 kcal a
 * year by hand (a quarter acre of potatoes alone yields 2,000–4,000 lb).
 * Dug and threshed from mid-August to mid-October; the beans and wheat
 * keep dry (staples), the potatoes go to the cellar (fresh).
 */
export const FIELD_KCAL = 700_000, FIELD_DRY = 0.4;

/** This year's hail (weatherThreats.ts): the crop it shredded comes back short from a late replanting. */
function hailThisYear(s: GameState): number | null {
  const h = s.weather?.hail;
  return h && h.year === calendarOf(s.clock).year ? h.doy : null;
}

/** The day's field harvest (kcal), before it is split into dry and fresh. */
export function fieldHarvest(s: GameState): number {
  const doy = calendarOf(s.clock).doy, HARVEST = seasons(REGIONS[s.site.region]).harvest;
  if (doy < HARVEST[0] || doy >= HARVEST[1]) return 0;
  const fields = s.structures.filter(st => st.kind === 'field' && isFinished(st)).length;
  const skill = Math.max(...s.people.map(p => p.skills.gardener), 0);
  // hail on the standing crop: replanted early in the summer it still makes 70 %; in late summer a quick catch crop, 30 %
  const hd = hailThisYear(s), hail = hd == null || hd >= HARVEST[1] ? 1 : hd < HARVEST[0] - 60 ? 0.7 : 0.3;
  return fields * FIELD_KCAL / (HARVEST[1] - HARVEST[0]) * (0.6 + 0.08 * skill) * SOIL_YIELD[s.site.soil] * climate(s).grow * tractorBoost(s) * hail;
}

/** What the place grows a day (kcal, fresh), by day of year: eggs from the coop, the garden in season, the field harvest. */
export function produce(s: GameState): number {
  const doy = calendarOf(s.clock).doy;
  const fin = s.structures.filter(isFinished);
  const coops = fin.filter(st => st.kind === 'chicken_coop').length;
  const gardens = fin.filter(st => st.kind === 'garden').length;
  // a dozen hens: ~8 eggs a day in summer, ~3 in midwinter (≈ 70 kcal each)
  const eggs = coops * 70 * (5.5 + 2.5 * Math.cos(2 * Math.PI * (doy - 172) / 365));
  // a kitchen garden: nothing until mid-June, a peak of ≈ 2,500 kcal a day in August–September, done by late October
  // nothing until three weeks past the last frost, full by mid-summer, done a month past the first frost
  // a finished greenhouse starts the garden six weeks earlier, runs it six weeks later and raises the peak (greenhouse.ts)
  const [g0, g1] = gardenSeason(s);
  const season = doy < g0 || doy > g1 ? 0 : doy < g0 + 45 ? (doy - g0) / 45 : doy < g1 - 35 ? 1 : (g1 - doy) / 35;
  const skill = Math.max(...s.people.map(p => p.skills.gardener), 0);
  // a month to come back after hail (replanted from saved seed), then a shorter season
  const hd = hailThisYear(s), hail = hd == null || doy < hd ? 1 : doy - hd < 30 ? 0 : 0.7;
  const veg = gardens * 2500 * season * (0.6 + 0.08 * skill) * SOIL_YIELD[s.site.soil] * (hasGreenhouse(s) ? GREENHOUSE_PEAK : 1) * hail;
  // winter greens on the greenhouse benches; the orchard's fruit, August to October
  const grow = climate(s).grow;
  return Math.max(0, eggs) * Math.max(0.5, grow) + (veg + greenhouseGreens(s) + orchardHarvest(s)) * grow + fieldHarvest(s);
}

/** Fraction of fresh food that spoils a day: in the open vs a root cellar. */
const SPOIL_FRESH = 0.08, SPOIL_CELLAR = 0.015, THAW = 0.3;
/** Canning: cases a day (two pressure-canner loads), and the kcal kept (trimming, the odd jar that doesn't seal). */
export const CANNER_CASES = 2, CANNED_YIELD = 0.85;

export interface FoodReport { needKcal: number; ateKcal: number; producedKcal: number; spoiledKcal: number; fromStores: boolean; kinds: FoodId[]; daysLeft: number }

/** Days the family can eat from what's put by (not counting what grows). */
export function daysOfFood(s: GameState): number {
  const need = s.people.reduce((a, p, i) => a + (alive(s, i) ? needOf(p) : 0), 0);
  const have = FOODS.reduce((a, f) => a + s.stock[f] * KCAL[f], 0);
  return need > 0 ? have / need : Infinity;
}

const alive = (s: GameState, i: number) => s.personState[i]?.needs?.died == null;

/**
 * One day of eating, spoiling, growing, healing and feeling. `rnd` is the
 * day's random (hunting luck). Returns the report (HUD).
 */
export function liveDay(s: GameState, rnd: number): FoodReport {
  const fin = s.structures.filter(isFinished);
  const cellar = fin.some(st => st.kind === 'root_cellar');
  const freezer = fin.some(st => st.kind === 'root_cellar' && s.utilities.lit.includes(st.id));
  // groceries need open stores with trucks restocking them
  const fromStores = s.disaster.tracks.stores > 0.5 && s.disaster.tracks.deliveries > 0.25;
  // spoilage (fractional units carry as a remainder on the stock count)
  let spoiled = 0;
  const spoil = (f: FoodId, rate: number) => { const lost = s.stock[f] * rate; s.stock[f] -= lost; spoiled += lost * KCAL[f]; };
  spoil('fresh', cellar ? SPOIL_CELLAR : SPOIL_FRESH);
  if (!freezer) spoil('frozen', fromStores ? 0 : THAW);
  // what grows
  const grown = produce(s), dry = fieldHarvest(s) * FIELD_DRY;
  s.stock.staples += dry / KCAL.staples;
  s.stock.fresh += (grown - dry) / KCAL.fresh;
  // hunting, fishing and snares (wildfood.ts: the region's game, seasons and tags, the game thinning out)
  const meat = wildDay(s, freezer);
  // goats, pigs, the steer, rabbits (livestock.ts: feed, hunger, milk, November butchering, litters)
  const stock = livestockDay(s, freezer);
  // eating
  const need = s.people.reduce((a, p, i) => a + (alive(s, i) ? needOf(p) : 0), 0);
  let ate = 0;
  const kinds: FoodId[] = [];
  // broke in peacetime: food stamps and the food bank cover a household's worth; anyone past that eats from the pantry
  if (fromStores) ate = s.money > 0 ? need : Math.min(need, FOOD_BANK_KCAL);
  if (ate < need) {
    for (const f of FOODS) {
      if (ate >= need) break;
      const take = Math.min(s.stock[f], (need - ate) / KCAL[f]);
      if (take > 1e-6) { s.stock[f] -= take; ate += take * KCAL[f]; kinds.push(f); }
    }
  }
  const short = Math.max(0, need - ate);
  // putting up the harvest: fresh beyond five days' eating is canned in the home kitchen, two canner loads a day
  const kitchen = fin.some(st => isHome(st.kind));
  const surplus = s.stock.fresh * KCAL.fresh - 5 * need;
  if (kitchen && surplus > KCAL.canned && s.stock.lids >= 1) {
    const cases = Math.min(Math.floor(surplus / KCAL.canned), CANNER_CASES, Math.floor(s.stock.lids));
    s.stock.lids -= cases;
    s.stock.fresh -= cases * KCAL.canned / KCAL.fresh;
    s.stock.canned += cases * CANNED_YIELD;
  }
  if (short > need * 0.25 && !fromStores) log(s, `Short of food: ${Math.round(short)} kcal less than the family needs today.`);
  // needs, person by person
  const cozy = s.disaster.difficulty === 'cozy';
  const variety = fromStores ? 3 : kinds.length + (grown > 500 ? 1 : 0);
  const home = fin.some(st => isHome(st.kind));
  const dark = s.utilities.fittings.some(f => f.kind === 'wire' && f.finishedAt !== null) && !s.utilities.lit.some(id => isHome(s.structures.find(x => x.id === id)?.kind ?? ''));
  const medic = Math.max(...s.people.filter((p, i) => !p.kid && alive(s, i)).map(p => p.skills.medic), 0);
  const bay = fin.some(st => st.kind === 'bunker_medical');
  s.people.forEach((p, i) => {
    const n = s.personState[i]?.needs;
    if (!n || n.died != null) return;
    const mine = needOf(p) / Math.max(1, need);
    n.hunger = Math.max(0, n.hunger + short * mine - (short === 0 ? 600 : 0));
    // health: hunger, wounds and radiation take it; rest and food bring it back
    let dh = n.hunger > 15000 ? -1.5 : n.hunger > 5000 ? -0.5 : 0.6;
    n.hurt.forEach((h, k) => {
      dh -= h.sev / 60;
      const meds = s.stock.meds >= 0.1;
      if (meds) s.stock.meds -= 0.1;            // a kit lasts about ten wound-days
      // a fight wound needs treating: dressings and antibiotics, someone who knows how, or the bay
      if (h.trauma && !meds && medic < 3 && !bay) {
        h.sev = Math.max(0, h.sev - 0.3);
        const u = ((rnd * 9973 + i * 131 + k * 17) % 1 + 1) % 1;
        if (u < 0.04 && !h.what.includes('infected')) { h.sev = Math.min(100, h.sev + 15); h.what += ' (infected)'; log(s, `${p.first}'s wound has gone bad: it needs dressings and antibiotics.`); }
        return;
      }
      h.sev = Math.max(0, h.sev - (1 + 0.5 * medic + (bay ? 2.5 : 0) + (meds ? 1.5 : 0)));
    });
    n.hurt = n.hurt.filter(h => h.sev > 0);
    if (n.dose > 1) dh -= (n.dose - 1) * 2;           // radiation sickness above ~1 Sv
    if (s.utilities.report.shortL > s.utilities.report.useL * 0.5) dh -= 2;   // not enough to drink
    n.health = Math.max(cozy ? 5 : 0, Math.min(100, n.health + dh));
    // morale: drifts to a baseline that variety, a home, light and safety raise; hunger and loss lower
    const target = 45 + 6 * Math.min(variety, 4) + (home ? 8 : -6) + (dark ? -8 : 0) + (s.utilities.hauling ? (s.utilities.haulFar ? -10 : -4) : 0) - Math.min(25, n.hunger / 1000) - (s.personState.some(x => x.needs?.died != null) ? 15 : 0);
    n.morale += (Math.max(0, Math.min(100, target)) - n.morale) * 0.08;
    if (n.health <= 0) {
      n.died = Math.floor(s.clock.t);
      log(s, `${p.first} ${p.last} has died.`);
    }
  });
  // people taken in who are going hungry may move on rather than starve at your table
  if (short > need * 0.3 && !fromStores) {
    const family = s.people[0]?.last;
    for (let i = s.people.length - 1; i >= 0; i--) {
      const ps = s.personState[i];
      if (!ps || ps.needs.died != null || s.people[i].last === family || s.people[i].kin || ps.needs.hunger < 8000 || rnd > 0.08) continue;
      log(s, `${s.people[i].first} ${s.people[i].last} left to try their luck elsewhere.`);
      s.people.splice(i, 1); s.personState.splice(i, 1);
    }
  }
  return { needKcal: need, ateKcal: ate, producedKcal: grown + meat + stock, spoiledKcal: spoiled, fromStores, kinds, daysLeft: daysOfFood(s) };
}

/** Work rate multiplier from health and morale (the hungry, hurt or hopeless get less done). */
export function workFactor(n: Needs | undefined): number {
  if (!n || n.died != null) return 0;
  // a bad fight wound puts you on your back until it's treated and mending
  if (n.hurt.some(h => h.trauma && h.sev >= 50)) return 0.1;
  const h = n.health >= 60 ? 1 : 0.35 + 0.65 * n.health / 60;
  const m = n.morale >= 35 ? 1 : 0.6 + 0.4 * n.morale / 35;
  return h * m;
}
