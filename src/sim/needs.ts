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
import { hasBasement } from './housingStyles';
import { layFactor } from './wildlife';
import { calendarOf, type GameState } from './state';
import { darkMood, mishapChance } from './blackout';
import { wildDay } from './wildfood';
import { livestockDay } from './livestock';
import { isHome } from './blueprints';
import { log } from './economy';
import { isFinished } from './construction';
import { climate } from './effects';
import { tractorBoost } from './vehicles';
import { SOIL_YIELD } from './site';
import { seasons } from './regions';
import { gardenSeason, greenhousePeak, greenhouseGreens } from './greenhouse';
import { orchardPicking } from './orchard';
import { careYield, cookRatio, lifeMorale, spoilFactor } from './daily';
import { beltMorale, isAbsent } from './weekender';
import { socialMorale } from './gatherings';
import { addFoodKcal, dietDay, dietEffects, eatFrom, inDateKcal, syncPantry } from './pantry';
import { mulberry32 } from './rng';
import { dogEffects } from './pets';
import { sleepEffects } from './housing';
import { CROPS, fieldFactor, fieldsOf, GROSS, gardenFactor, keepSeed, successionDays } from './crops';
import { kitchenDay, putByDay } from './kitchen';
import { pollination } from './bees';
import { freshSpoilRate, shelveRoots } from './storage';
import { newcomerMorale } from './newcomers';
import { mindMorale } from './mind';
import { bestLevel } from './skills';
import { regionFor } from './climate';

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
  hurt: Array<{ what: string; sev: number; trauma?: boolean; /** A case in a treatment chain (sim/medical.ts runs its course). */ med?: import('./medical').MedCase }>;
  /** Dead (day), or null. Also set when someone was taken by raiders (`taken`): gone from the place either way. */
  died: number | null;
  taken?: boolean;
  /** Moved away (a guest gone home, someone sent on or walked out): `died` is the day they left, but they did not die (sim/newcomers.ts moveOut). */
  left?: boolean;
  /** Hours of sleep owed after a night under siege (sim/siege.ts siegeStrain): slows work, wears off 3 a day. */
  tired?: number;
  /** Work rate from the state of mind (0.2–1; absent = 1): set each night by sim/mind.ts, read by `workFactor`. */
  coping?: number;
  /** Work rate from lasting injuries (a bad leg, a stiff arm): set each night by sim/medical.ts. */
  lasting?: number;
}

export const freshNeeds = (): Needs => ({ health: 100, morale: 70, hunger: 0, dose: 0, hurt: [], died: null });

/**
 * A quarter-acre field: potatoes, dry beans and wheat, ≈ 700,000 kcal a
 * year by hand (a quarter acre of potatoes alone yields 2,000–4,000 lb).
 * Dug and threshed from mid-August to mid-October; the beans and wheat
 * keep dry (staples), the potatoes go to the cellar (fresh).
 */
export const FIELD_KCAL = 700_000, FIELD_DRY = 0.4;
/** (The share of the orchard's fruit that keeps in the cellar bins is the fruit's own: apples and pears keep, cherries and plums do not: sim/orchard.ts `FRUIT.keeps`.) */

/** The best gardener among the living who are still on the place (the dead and the taken don't tend the beds). */
export function bestGardener(s: GameState): number {
  let best = 0;
  s.people.forEach((p, i) => { const n = s.personState[i]?.needs; if (n && n.died == null && !n.taken) best = Math.max(best, p.skills.gardener); });
  return best;
}

/** This year's hail (weatherThreats.ts): the crop it shredded comes back short from a late replanting. */
function hailThisYear(s: GameState): number | null {
  const h = s.weather?.hail;
  return h && h.year === calendarOf(s.clock).year ? h.doy : null;
}

/**
 * The day's field harvest (kcal), by what it is: the potatoes (they go to the cellar) and the dry crops (beans,
 * wheat). Each field's crop, soil, rotation, seed and sowing date set its share (sim/crops.ts); the gardener's
 * skill, the soil, the weather, the tractor, hail and the harvest chore are the same for all. A field earns
 * the old flat 700,000 kcal a year on average, plus the seed unit the harvest sets aside (`keepSeed`).
 */
export function fieldHarvestSplit(s: GameState): { total: number; potato: number; dry: number } {
  const doy = calendarOf(s.clock).doy, HARVEST = seasons(regionFor(s.site)).harvest;
  if (doy < HARVEST[0] || doy >= HARVEST[1]) return { total: 0, potato: 0, dry: 0 };
  const fields = fieldsOf(s);
  if (!fields.length) return { total: 0, potato: 0, dry: 0 };
  const skill = bestGardener(s);
  // hail on the standing crop: replanted early in the summer it still makes 70 %; in late summer a quick catch crop, 30 %
  const hd = hailThisYear(s), hail = hd == null || hd >= HARVEST[1] ? 1 : hd < HARVEST[0] - 60 ? 0.7 : 0.3;
  const per = FIELD_KCAL * GROSS / (HARVEST[1] - HARVEST[0]) * (0.6 + 0.08 * skill) * SOIL_YIELD[s.site.soil] * climate(s).grow * tractorBoost(s) * hail * careYield(s, 'harvest');
  let potato = 0, dry = 0;
  for (const f of fields) {
    const ff = fieldFactor(s, f), kcal = per * ff.total;
    if (CROPS[ff.crop].dry) dry += kcal; else potato += kcal;
  }
  return { total: potato + dry, potato, dry };
}
export const fieldHarvest = (s: GameState): number => fieldHarvestSplit(s).total;

/**
 * The hens' year beyond the day length: the fall molt (October to mid-November) stops about half of them, and a coop with power
 * for a light on a timer keeps a quarter more laying through the short days.
 */
export function henSeason(s: GameState, doy: number): number {
  const molt = doy >= 280 && doy < 325 ? 0.55 : 1;
  const short = doy > 280 || doy < 70;
  const lit = short && s.structures.some(st => st.kind === 'chicken_coop' && isFinished(st) && s.utilities.lit.includes(st.id));
  return molt * (lit ? 1.25 : 1) * 1.04;
}

/** What the place grows a day (kcal), by source, after the weather and the tending chores. */
export interface ProduceParts { eggs: number; veg: number; greens: number; orchard: number; /** The part of the orchard's fruit that keeps (goes to the cellar bins). */ orchardKeep: number; field: { total: number; potato: number; dry: number } }
export function produceParts(s: GameState): ProduceParts {
  const doy = calendarOf(s.clock).doy;
  const fin = s.structures.filter(isFinished);
  const coops = fin.filter(st => st.kind === 'chicken_coop').length;
  const gardens = fin.filter(st => st.kind === 'garden').length;
  // a dozen hens: ~8 eggs a day in summer, ~3 in midwinter (≈ 70 kcal each)
  const eggs = coops * 70 * (5.5 + 2.5 * Math.cos(2 * Math.PI * (doy - 172) / 365)) * careYield(s, 'animals') * layFactor(s);
  // a kitchen garden: nothing until three weeks past the last frost, full by mid-summer, done a month past the first frost
  // a finished greenhouse starts the garden six weeks earlier, runs it six weeks later and raises the peak (greenhouse.ts);
  // later sowings (successions, sim/crops.ts) run the end of the season on a little and raise the crop
  const [g0, g1a] = gardenSeason(s), g1 = g1a + successionDays(s);
  const season = doy < g0 || doy > g1 ? 0 : doy < g0 + 45 ? (doy - g0) / 45 : doy < g1 - 35 ? 1 : (g1 - doy) / 35;
  const skill = bestGardener(s);
  // a month to come back after hail (replanted from saved seed), then a shorter season
  const hd = hailThisYear(s), hail = hd == null || doy < hd ? 1 : doy - hd < 30 ? 0 : 0.7;
  const veg = gardens * 2500 * season * (0.6 + 0.08 * skill) * SOIL_YIELD[s.site.soil] * greenhousePeak(s) * hail * careYield(s, 'weeds') * gardenFactor(s);
  const grow = climate(s).grow, pol = pollination(s);
  const pick = orchardPicking(s, pol.orchard), orchardK = careYield(s, 'orchard') * grow;
  return {
    eggs: Math.max(0, eggs) * Math.max(0.5, grow) * henSeason(s, doy),
    veg: Math.max(0, veg) * grow * pol.garden,
    greens: greenhouseGreens(s) * careYield(s, 'greenhouse') * grow,
    orchard: pick.kcal * orchardK,
    orchardKeep: pick.keep * orchardK,
    field: fieldHarvestSplit(s),
  };
}

/** What the place grows a day (kcal, fresh), by day of year: eggs from the coop, the garden in season, the field harvest. */
export function produce(s: GameState): number {
  const p = produceParts(s);
  return Math.max(0, p.eggs + p.veg + p.greens + p.orchard + p.field.total);
}

/** Share of the frozen stock that thaws a day with the freezer off (the fresh pile's spoilage is sim/storage.ts `freshSpoilRate`). */
const THAW = 0.3;
/** Canning: cases a day (two pressure-canner loads), and the kcal kept (trimming, the odd jar that doesn't seal). */
export const CANNER_CASES = 2, CANNED_YIELD = 0.85;

export interface FoodReport { needKcal: number; ateKcal: number; producedKcal: number; spoiledKcal: number; fromStores: boolean; kinds: FoodId[]; daysLeft: number }

/** Days the family can eat from what's put by (not counting what grows). */
export function daysOfFood(s: GameState): number {
  // (the family in town eats there: the weekender's weekdays, or the days on the road home)
  const need = s.people.reduce((a, p, i) => a + (alive(s, i) && !isAbsent(s, p.id) ? needOf(p) : 0), 0);
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
  const freezer = fin.some(st => (st.kind === 'root_cellar' || hasBasement(st.kind)) && s.utilities.lit.includes(st.id));
  // groceries need open stores with trucks restocking them
  const fromStores = s.disaster.tracks.stores > 0.5 && s.disaster.tracks.deliveries > 0.25;
  // spoilage (fractional units carry as a remainder on the stock count)
  let spoiled = 0;
  const spoil = (f: FoodId, rate: number) => { const lost = s.stock[f] * rate; s.stock[f] -= lost; spoiled += lost * KCAL[f]; };
  spoil('fresh', freshSpoilRate(s) * spoilFactor(s));
  if (!freezer) spoil('frozen', fromStores ? 0 : THAW);
  // what grows
  const parts = produceParts(s);
  const grown = Math.max(0, parts.eggs + parts.veg + parts.greens + parts.orchard + parts.field.total);
  syncPantry(s);
  // harvest days set next spring's seed aside first (dry crops, then potatoes: sim/crops.ts)
  const seedKept = keepSeed(s, parts.field.total);
  const dry = Math.max(0, parts.field.dry - seedKept), potato = Math.max(0, parts.field.potato - Math.max(0, seedKept - parts.field.dry));
  if (dry > 0) addFoodKcal(s, 'home_dry', dry);
  // potatoes and the orchard's apples go to the cellar bins while there is room; the rest is fresh food
  const binned = potato + parts.orchardKeep, left = shelveRoots(s, binned);
  s.stock.fresh += (parts.eggs + parts.veg + parts.greens + (parts.orchard - parts.orchardKeep) + left) / KCAL.fresh;
  // hunting, fishing and snares (wildfood.ts: the region's game, seasons and tags, the game thinning out)
  const meat = wildDay(s, freezer);
  // goats, pigs, the steer, rabbits (livestock.ts: feed, hunger, milk, November butchering, litters)
  const stock = livestockDay(s, freezer);
  // eating
  const need = s.people.reduce((a, p, i) => a + (alive(s, i) ? needOf(p) : 0), 0);
  let ate = 0;
  const kinds: FoodId[] = [];
  /** What went on the plate, item by item (sim/pantry.ts: the diet's variety, protein, fat). */
  const plate: Array<[string, number]> = [];
  /** Sickness risk carried by what was eaten (kcal-weighted; sim/pantry.ts), and the kcal of it past its date. */
  let risk = 0, botRisk = 0, old = 0;
  // broke in peacetime: food stamps and the food bank cover a household's worth; anyone past that eats from the pantry
  if (fromStores) { ate = s.money > 0 ? need : Math.min(need, FOOD_BANK_KCAL); plate.push(['grocery', ate]); }
  if (ate < need) {
    // fresh first (it spoils), then the freezer; then canned and staples side by side, in proportion to what's on hand;
    // food still in date before anything past it (sim/pantry.ts: expired food gives less and can make people sick)
    const eat = (f: FoodId, kcal: number, inDate = false) => {
      if (kcal <= 1e-6 || s.stock[f] <= 1e-9) return;
      let got = 0;
      if (f === 'fresh') {
        const take = Math.min(s.stock.fresh, kcal / KCAL.fresh);
        s.stock.fresh -= take; got = take * KCAL.fresh; plate.push(['fresh', got]);
      } else {
        const e = eatFrom(s, f, kcal, { inDate, thawed: f === 'frozen' && !freezer });
        plate.push(...e.plate); got = e.eff; risk += e.sick; botRisk += e.bot; old += e.old;
      }
      if (got <= 1e-6) return;
      ate += got;
      if (!kinds.includes(f)) kinds.push(f);
    };
    eat('fresh', need - ate);
    eat('frozen', need - ate, true);
    eat('frozen', need - ate);
    for (const inDate of [true, false]) {
      if (ate >= need) break;
      const c = inDate ? inDateKcal(s, 'canned') : s.stock.canned * KCAL.canned, st = inDate ? inDateKcal(s, 'staples') : s.stock.staples * KCAL.staples;
      const left = need - ate;
      if (c + st > 0) { eat('canned', left * c / (c + st), inDate); eat('staples', left * st / (c + st), inDate); }
      // one ran short of its share: the other makes it up
      eat('canned', need - ate, inDate); eat('staples', need - ate, inDate);
    }
  }
  const short = Math.max(0, need - ate);
  // putting up the harvest: fresh beyond five days' eating is canned, dried or fermented in the home kitchen (sim/kitchen.ts)
  const cookR = cookRatio(s);
  putByDay(s, need, cookR);
  const table = kitchenDay(s, cookR);
  // (playtest 3: the daily line filled the log through every lean winter; the first day, then every third)
  if (short > need * 0.25 && !fromStores && (Math.floor(s.clock.t) % 3 === 0 || !s.log.some(l => l.text.startsWith('Short of food') && s.clock.t - l.t < 3))) log(s, `Short of food: ${Math.round(short)} kcal less than the family needs today.`);
  // needs, person by person
  const cozy = s.disaster.difficulty === 'cozy';
  // the diet: a month's mix of foods (monotony), protein, fat, salt, sweets, coffee (sim/pantry.ts)
  dietDay(s, plate, s.people.filter((_, i) => alive(s, i)).length, s.people.filter((p, i) => !p.kid && alive(s, i)).length, fromStores, ate > 0 ? old / ate : 0);
  // food sickness from old or thawed food: each person's chance is the day's kcal-weighted risk (sim/pantry.ts sickness)
  // the best cook in the house knows which jar to throw out (sim/skills.ts): 4 % less risk a level over three
  { const safe = Math.max(0.7, Math.min(1.15, 1 - 0.04 * (bestLevel(s, 'cooking') - 3))); risk *= safe; botRisk *= safe; }
  if (risk > 0 || botRisk > 0) {
    const r = mulberry32(s.seed * 7919 + Math.floor(s.clock.t + 0.25) * 31 + 5);
    s.people.forEach((p, i) => {
      const n = s.personState[i]?.needs;
      if (!n || n.died != null || n.taken) return;
      const u = r(), v = r();
      if (v < botRisk / Math.max(1, need) && !n.hurt.some(h => h.what === 'botulism')) {
        n.hurt.push({ what: 'botulism', sev: 80, trauma: true });
        log(s, `${p.first} has botulism from a bad jar: blurred vision, trouble swallowing. Without care it kills.`);
      } else if (u < risk / Math.max(1, need) && !n.hurt.some(h => h.what === 'food poisoning')) {
        n.hurt.push({ what: 'food poisoning', sev: 20 });
        log(s, `${p.first} has food poisoning from old food: a few days of being sick.`);
      }
    });
  }
  const diet = dietEffects(s, fromStores);
  const variety = fromStores ? 3 : diet.variety + (grown > 500 ? 0.5 : 0);
  const home = fin.some(st => isHome(st.kind));
  const dark = s.utilities.fittings.some(f => f.kind === 'wire' && f.finishedAt !== null) && !s.utilities.lit.some(id => isHome(s.structures.find(x => x.id === id)?.kind ?? ''));
  const medic = Math.max(...s.people.filter((p, i) => !p.kid && alive(s, i)).map(p => p.skills.medic), 0);
  const bay = fin.some(st => st.kind === 'bunker_medical');
  // where everybody slept and how well (sim/housing.ts): bed, couch, floor, tent, nowhere
  const slept = sleepEffects(s);
  // gatherings' afterglow and grief (sim/gatherings.ts: a funeral eases it)
  const social = socialMorale(s);
  s.people.forEach((p, i) => {
    const n = s.personState[i]?.needs;
    if (!n || n.died != null) return;
    const sl = slept.get(i);
    const mine = needOf(p) / Math.max(1, need);
    n.hunger = Math.max(0, n.hunger + short * mine - (short === 0 ? 600 : 0));
    // health: hunger, wounds and radiation take it; rest and food bring it back
    let dh = n.hunger > 15000 ? -1.5 : n.hunger > 5000 ? -0.5 : 0.6;
    n.hurt.forEach((h, k) => {
      // (a broken bone or a baby's recovery does not wear the body down like an infection does)
      dh -= h.sev / 60 * (h.med && (h.med.kind === 'fracture' || h.med.kind === 'postpartum' || h.med.kind === 'frostbite' || h.med.kind === 'abscess') ? 0.25 : 1);
      if (h.med) return;   // its course is run by sim/medical.ts
      const meds = s.stock.meds >= 0.1;
      if (meds) s.stock.meds -= 0.1;            // a kit lasts about ten wound-days
      // food poisoning: a few days, longer without enough to drink; meds (rehydration salts, antiemetics) help
      if (h.what === 'food poisoning') { h.sev = Math.max(0, h.sev - ((s.utilities.report.shortL > s.utilities.report.useL * 0.5 ? 1.5 : 4) + (meds ? 2 : 0))); return; }
      // botulism without care (medicine, someone who knows how, the bay): paralysis creeps on, and it kills
      if (h.what === 'botulism' && !meds && medic < 3 && !bay) { dh -= 2.5; h.sev = Math.max(0, h.sev - 0.3); return; }
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
    // a diet short of fat or protein (or salt, working hard) keeps health from coming all the way back
    if (n.health + dh > diet.healthCap) dh = Math.min(dh, n.health > diet.healthCap ? -0.2 : diet.healthCap - n.health);
    if (sl) dh -= sl.harm;
    n.health = Math.max(cozy ? 5 : 0, Math.min(100, n.health + dh));
    // morale: drifts to a baseline that variety, a home, light and safety raise; hunger and loss lower
    const target = 45 + 6 * Math.min(variety, 4) + diet.morale + (home ? 8 : -6) + (dark ? -8 : 0) + darkMood(s, !!p.kid, (s.personState[i]?.task as string) === 'watch') + (s.utilities.hauling ? (s.utilities.haulFar ? -10 : -4) : 0) - Math.min(25, n.hunger / 1000) + social + lifeMorale(s, i) + newcomerMorale(s, p.id) + (fromStores ? 0 : table) + (sl?.morale ?? 0) + dogEffects(s, p.id).morale + mindMorale(s, p.id) - beltMorale(s, p.id);
    n.morale += (Math.max(0, Math.min(100, target)) - n.morale) * 0.08;
    // stumbling about in dark rooms under lights-out without curtains (sim/blackout.ts)
    const stumble = ((rnd * 7919 + i * 211 + 5) % 1 + 1) % 1;
    // only people up at night (on watch) are out in it; sleepers are not
    if ((s.personState[i]?.task as string) === 'watch' && stumble < mishapChance(s) && n.hurt.length < 3) { n.hurt.push({ what: 'a sprain from a fall in the dark', sev: 10 }); log(s, `${p.first} took a fall in the dark house: lights out without curtains is costing the family.`); }
    if (n.tired) n.tired = Math.max(0, n.tired - 3);
    if (sl?.tired) n.tired = Math.min(Math.max(n.tired ?? 0, 5), (n.tired ?? 0) + sl.tired);
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
  return { needKcal: need, ateKcal: ate, producedKcal: grown - seedKept + meat + stock, spoiledKcal: spoiled, fromStores, kinds, daysLeft: daysOfFood(s) };
}

/** Work rate multiplier from health and morale (the hungry, hurt or hopeless get less done). */
export function workFactor(n: Needs | undefined): number {
  if (!n || n.died != null) return 0;
  // a bad fight wound puts you on your back until it's treated and mending
  if (n.hurt.some(h => h.trauma && h.sev >= 50)) return 0.1;
  const h = n.health >= 60 ? 1 : 0.35 + 0.65 * n.health / 60;
  const m = n.morale >= 35 ? 1 : 0.6 + 0.4 * n.morale / 35;
  return h * m * (1 - Math.min(0.35, (n.tired ?? 0) * 0.05)) * (n.coping ?? 1) * (n.lasting ?? 1);
}
