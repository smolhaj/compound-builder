/**
 * Aquaponics (docs/DECISIONS.md, "Tunnels and aquaponics"): a glazed 6 x 12 m bay with four 1,000 L tanks of tilapia whose
 * water runs through 20 m2 of media beds of greens and herbs and back. It ties into the pond's goods, the power and the weather:
 *
 *  Fish      100-fingerling bags (`tilapia_fry`, $85) go in warm (the water must be 24 C or over); they grow about 2.6 g a day at
 *            26 C, slower cooler, nothing under 18 C; table size is 450 g; the tanks hold 60 kg (crowding slows them and
 *            invites disease). Whole fish are worth 0.45 kcal a gram (a third is fillet). Harvest by hand, 30 fish a day.
 *  Feed      2 % of the biomass a day in pellets: the pond's `fish_feed` bag (22.7 kg), about 0.5 kg a day at 25 kg of fish. Unfed
 *            fish hold their weight, and the plants, which live on their waste, go hungry (their share follows the feeding).
 *  Power     the pump and the air pump run all day (a wired bay draws 4 kWh), plus the water heater in the cold (up to 14 kWh
 *            more in a hard January); it is on the load list's first rung with the cellar and the well. No power for a day and the
 *            air stops: in warm water that is a fish kill (a third of them), and the water cools toward the air a few degrees a
 *            day; under 14 C they all go (three days of a January blackout).
 *  Plants    the media beds make about 420 kcal a day of greens and herbs when the fish are fed and the loop runs, less in the
 *            dark months (0.6 in December), less under cracked glass; the pond chore (feeding, screens, a water test) decides
 *            how well the loop is kept (`careYield`).
 *  Gardens   a bed within 8 units (48 m) of a running bay gets the fish water: +3 % (`fertigationK`).
 *  Water     the sump tops up what the beds transpire and the air takes: 80 L a day from the tanks and the roof (sim/utilities.ts).
 * Pure (tested). The state (`farm.aqua`) is made lazily, like the pond's.
 */
import { calendarOf, type GameState, type Structure } from './state';
import { log } from './economy';
import { mulberry32 } from './rng';
import { MEAT_WHERE, putUpMeat } from './kitchen';
import { aquaOf, finishedOf, type AquaState } from './farm';
import { careYield } from './daily';
import { glassSound } from './improvements';
import { heatNeed } from './greenhouse';
import { waterTempC } from './pond';
import { logGate } from './nag';

export const AQUA = {
  FRY: 100, FRY_G: 5, TABLE_G: 450, TANK_KG: 60,
  GROW_G_DAY: 2.6, FEED_RATE: 0.02, FEED_BAG_G: 22_680,
  KCAL_G: 0.45, PLANTS_KCAL: 420, HARVEST_N: 30,
  /** Water temperatures (C): the heater's target, the least they will stock at, they stop eating, they die. */
  TARGET_C: 26, STOCK_MIN_C: 24, STOP_C: 18, LETHAL_C: 14,
  /** Power: base kWh a day and the heater's at full demand; water use a day (L). */
  BASE_KWH: 4, HEAT_KWH: 14, WATER_L: 80,
  /** Fertigation gain for a bed in range (units). */
  FERT_K: 0.03, FERT_R: 8,
} as const;

export const aquas = (s: GameState): Structure[] => finishedOf(s, 'aquaponics');
const powered = (s: GameState, st: Structure): boolean => s.utilities.lit.includes(st.id);
const idHash = (id: string): number => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return Math.abs(h); };

/** The bay's power draw today (kWh): pumps, and the heater against the cold outside. */
export function aquaKwh(s: GameState, _st?: Structure): number {
  return AQUA.BASE_KWH + AQUA.HEAT_KWH * Math.min(1, heatNeed(s));
}

/** Water temperature the fish see: the heater's target while it runs, else easing toward the air in a glass house a few degrees warmer than outside. */
export function nextTemp(s: GameState, a: AquaState, on: boolean): number {
  if (on) return AQUA.TARGET_C;
  const ambient = waterTempC(s) + 5;
  return a.tempC + (ambient - a.tempC) * 0.3;
}

/** Fish kg in the tanks. */
export const biomassKg = (a: AquaState): number => a.fish * a.fishG / 1000;

/** Grams a fish gains a day at a water temperature. */
export function growthG(tempC: number): number {
  if (tempC < AQUA.STOP_C) return 0;
  if (tempC >= 30) return AQUA.GROW_G_DAY * 0.85;
  return AQUA.GROW_G_DAY * Math.min(1, 0.15 + 0.85 * (tempC - AQUA.STOP_C) / (AQUA.TARGET_C - AQUA.STOP_C));
}

/** Why a bag cannot go in now (null = it can). */
export function stockProblem(s: GameState, id: string): string | null {
  const st = aquas(s).find(x => x.id === id);
  if (!st) return 'the bay is not finished';
  const a = aquaOf(s, id);
  if (s.stock.tilapia_fry < 1) return 'no fingerlings: buy a bag in the Shop (Food & farm)';
  if (!powered(s, st)) return 'the pump and the heater have no power: wire the bay first';
  if (a.tempC < AQUA.STOCK_MIN_C) return `the water is ${Math.round(a.tempC)} C: tilapia go in at ${AQUA.STOCK_MIN_C} C or over (let the heater bring it up)`;
  if (biomassKg(a) + AQUA.FRY * AQUA.FRY_G / 1000 > AQUA.TANK_KG) return `the tanks hold ${AQUA.TANK_KG} kg of fish`;
  return null;
}
export function stockAqua(s: GameState, id: string): string | null {
  const why = stockProblem(s, id);
  if (why) return why;
  const a = aquaOf(s, id);
  s.stock.tilapia_fry--;
  a.fishG = (a.fishG * a.fish + AQUA.FRY_G * AQUA.FRY) / (a.fish + AQUA.FRY);
  a.fish += AQUA.FRY;
  log(s, `Stocked ${AQUA.FRY} tilapia fingerlings. They reach ${AQUA.TABLE_G} g in about six months in 26 C water with feed.`);
  return null;
}

export function harvestProblem(s: GameState, id: string): string | null {
  if (!aquas(s).some(x => x.id === id)) return 'the bay is not finished';
  const a = aquaOf(s, id);
  if (a.fish < 1) return 'no fish in the tanks';
  if (a.fishG < AQUA.TABLE_G) return `not table size yet: they average ${Math.round(a.fishG)} g and need ${AQUA.TABLE_G} g`;
  return null;
}
export function harvestAqua(s: GameState, id: string): string | null {
  const why = harvestProblem(s, id);
  if (why) return why;
  const a = aquaOf(s, id);
  const n = Math.min(AQUA.HARVEST_N, a.fish), kcal = n * a.fishG * AQUA.KCAL_G;
  a.fish -= n; a.harvestAt = Math.floor(s.clock.t);
  if (a.fish === 0) a.fishG = 0;
  const put = putUpMeat(s, kcal);
  log(s, `Took ${n} tilapia from the tanks: ${Math.round(kcal).toLocaleString('en-US')} kcal ${put.where === 'fresh' ? 'on the table (it will not keep without a freezer, a smoker or salt)' : MEAT_WHERE[put.where]}.`);
  return null;
}

/** Once a day: temperature, feed, growth, die-offs and disease. Returns log lines. */
export function aquaDay(s: GameState): string[] {
  const out: string[] = [];
  const day = Math.floor(s.clock.t);
  for (const st of aquas(s)) {
    const a = aquaOf(s, st.id), on = powered(s, st);
    a.tempC = nextTemp(s, a, on);
    a.offDays = on ? 0 : a.offDays + 1;
    if (a.fish <= 0) { a.fed = 1; continue; }
    const r = mulberry32(s.seed * 7121 + day * 29 + idHash(st.id));
    // the air stops: warm water holds little oxygen
    if (!on && a.tempC > 20 && a.offDays >= 1) {
      const lose = Math.ceil(a.fish * 0.33);
      a.fish -= lose; a.lost += lose; a.dieOffAt = day;
      out.push(`The aerator stopped with the power: ${lose} tilapia gone belly-up in the warm water. Get the bay back on power (a generator will do).`);
    } else if (a.tempC < AQUA.LETHAL_C) {
      a.lost += a.fish; out.push(`The tanks fell to ${Math.round(a.tempC)} C with the heater off: the tilapia are dead.`); a.fish = 0; a.fishG = 0; a.dieOffAt = day; continue;
    } else if (!on && a.offDays === 2 && logGate(s, `aqua-cold:${st.id}`, 10)) out.push('The bay has been without power two days and the water is cooling: the tilapia will not last in cold water.');
    if (a.fish <= 0) { a.fish = 0; a.fishG = 0; continue; }
    // feed
    const want = biomassKg(a) * 1000 * AQUA.FEED_RATE / AQUA.FEED_BAG_G;
    const eats = a.tempC >= AQUA.STOP_C;
    if (eats && want > 1e-6) {
      const give = Math.min(want, Math.max(0, s.stock.fish_feed ?? 0));
      s.stock.fish_feed = Math.max(0, (s.stock.fish_feed ?? 0) - give);
      a.fed = give / want;
      if (a.fed < 0.5 && logGate(s, `aqua-feed:${st.id}`, 15)) out.push('The tilapia are hungry: the pellets have run out, and the plants live on their waste.');
    } else a.fed = 1;
    // growth, slowed by crowding
    const crowd = Math.min(1.4, biomassKg(a) / AQUA.TANK_KG);
    const care = careYield(s, 'pond');
    a.fishG += growthG(a.tempC) * (0.3 + 0.7 * a.fed) * care * (crowd > 0.9 ? Math.max(0.3, 1 - (crowd - 0.9) * 2) : 1);
    // disease in crowded or cold, unkept water
    const stress = (crowd > 0.9 ? 0.5 : 0) + (a.tempC < AQUA.STOP_C ? 0.5 : 0) + (care < 0.8 ? 0.4 : 0);
    if (stress > 0 && r() < 0.01 * stress) {
      const lose = Math.max(1, Math.ceil(a.fish * (0.1 + 0.15 * r())));
      a.fish -= lose; a.lost += lose; a.dieOffAt = day;
      out.push(`Disease in the tanks (${crowd > 0.9 ? 'crowded water' : a.tempC < AQUA.STOP_C ? 'cold stress' : 'a dirty loop'}): ${lose} tilapia lost. A full-feed, tended bay with fewer fish stays healthy.`);
    }
    if (a.fish <= 0) { a.fish = 0; a.fishG = 0; }
  }
  return out;
}

/** The season's light for the beds: 1 in summer, 0.6 in December. */
export const lightK = (doy: number): number => 0.8 + 0.2 * Math.cos(2 * Math.PI * (doy - 172) / 365) - 0.0;

/** The media beds' greens today (kcal): fed fish, a running loop, whole glass. */
export function aquaPlants(s: GameState): number {
  const doy = calendarOf(s.clock).doy;
  let sum = 0;
  for (const st of aquas(s)) {
    const a = aquaOf(s, st.id);
    if (!powered(s, st) || a.fish <= 0 || a.tempC < AQUA.STOP_C) continue;
    const load = Math.min(1, biomassKg(a) / 25);   // the beds need about 25 kg of fish to run full
    sum += AQUA.PLANTS_KCAL * load * (0.35 + 0.65 * a.fed) * Math.max(0.6, lightK(doy)) * glassSound(st) * careYield(s, 'pond');
  }
  return sum;
}

/** Fish-water fertigation: a bed in range of a running bay yields 3 % more. */
export function fertigationK(s: GameState, at: Pick<Structure, 'x' | 'z'>): number {
  for (const st of aquas(s)) {
    const a = aquaOf(s, st.id);
    if (a.fish > 0 && powered(s, st) && Math.hypot(st.x - at.x, st.z - at.z) <= AQUA.FERT_R) return 1 + AQUA.FERT_K;
  }
  return 1;
}

export interface AquaReport { fish: number; fishG: number; table: boolean; kg: number; tempC: number; fed: number; powered: boolean; feedDays: number; plantsKcal: number; notes: string[] }
export function aquaReport(s: GameState, st: Structure): AquaReport {
  const a = aquaOf(s, st.id), on = powered(s, st), daily = biomassKg(a) * 1000 * AQUA.FEED_RATE / AQUA.FEED_BAG_G;
  const notes: string[] = [];
  if (!on) notes.push('No power: the pump, the air pump and the heater are off. Fish in warm water die within a day.');
  if (a.fish > 0 && a.fishG < AQUA.TABLE_G) notes.push(`Tilapia average ${Math.round(a.fishG)} g; table size is ${AQUA.TABLE_G} g.`);
  if (daily > 0 && (s.stock.fish_feed ?? 0) < daily * 5) notes.push('Feed is nearly out.');
  return { fish: a.fish, fishG: a.fishG, table: a.fishG >= AQUA.TABLE_G, kg: biomassKg(a), tempC: a.tempC, fed: a.fed, powered: on, feedDays: daily > 0 ? (s.stock.fish_feed ?? 0) / daily : Infinity, plantsKcal: aquaPlants(s), notes };
}
