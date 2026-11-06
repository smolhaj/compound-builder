/**
 * The self-reliance runway: how many days the compound could last with no resupply, for each thing it runs on.
 * "No resupply" means only what is already on the place: nothing grown, bought, delivered or cut from now on.
 * Rows: food, water, power, heat (firewood), medicine, defense (ammunition) and fuel.
 *
 * A selector over the state, nothing more: no new simulation, nothing saved. Every figure reuses the helper the rest
 * of the game already uses, so this panel cannot disagree with the board, the defense report or the Next steps:
 *
 *   food      `daysOfFood` (sim/needs.ts), the same figure as the board's Food line
 *   water     `waterDaysStored` (sim/water.ts), the same as the board's Water line and the defense report
 *   power     battery charge plus generator fuel over yesterday's draw (utilities report, powerSummary)
 *   heat      `firewoodDays` (sim/heating.ts), the curve `firewoodOutlook` uses for the Firewood prompt
 *   medicine  medical kits: a kit is about ten wound-days (sim/needs.ts), over the cases being treated (at least one)
 *   defense   `fightsOfAmmo` (sim/armory.ts) at the quiet between waves (sim/waves.ts), so it reads in days
 *   fuel      jerry cans and vehicle tanks at the generator's burn (sim/utilities.ts), or one day's drive without a generator
 *
 * Pure. The tones use one table (`RUNWAY`) that the board's Food line shares.
 */
import type { GameState } from './state';
import { daysOfFood } from './needs';
import { WATER_L_PER_DAY, waterDaysStored } from './water';
import { firewoodDays, firewoodOutlook } from './heating';
import { powerSummary } from './powerReport';
import { powerOnPlace } from './hookups';
import { FUEL_L_PER_KWH, FUEL_UNIT_L, genTune } from './utilities';
import { fightsOfAmmo } from './armory';
import { WAVE } from './waves';
import { diffOf } from './difficulty';
import { VEHICLES, startingVehicles } from './vehicles';
import { isFinished } from './construction';
import { dayIndex } from './state';
import { regionFor } from './climate';
import type { SuggestionAct } from './guidance';
import { pluralize } from './words';

export type RunwayId = 'food' | 'water' | 'power' | 'heat' | 'medicine' | 'defense' | 'fuel';
export type RunwayAct = Extract<SuggestionAct, { type: 'open' | 'shop' }>;
export type RunwayTone = 'good' | 'warn' | 'bad';

/** Days under `bad` are red, under `warn` amber, the rest green. Food matches the board's Food line. */
export const RUNWAY = {
  food: { bad: 7, warn: 30 },
  water: { bad: 3, warn: 14 },
  power: { bad: 1, warn: 3 },
  heat: { bad: 14, warn: 60 },
  medicine: { bad: 10, warn: 30 },
  /** Fights of ammunition, not days. */
  fights: { bad: 2, warn: 5 },
  fuel: { bad: 3, warn: 14 },
  /** One medical kit lasts about this many wound-days (sim/needs.ts). */
  kitDays: 10,
} as const;

export interface RunwayRow {
  id: RunwayId;
  label: string;
  /** Whole days, or null when it does not apply (no guns, nothing that burns fuel) or never runs out. */
  days: number | null;
  /** What the row shows: "12 days", "a year or more", "none built". */
  value: string;
  /** One plain line on what the number counts. */
  detail: string;
  tone: RunwayTone;
  /** The one-click fix: where to go to lengthen it. */
  fix: { label: string; act: RunwayAct };
}

const shop = (tab: string): RunwayAct => ({ type: 'shop', tab });
const toneOf = (days: number, t: { bad: number; warn: number }): RunwayTone => days < t.bad ? 'bad' : days < t.warn ? 'warn' : 'good';
const daysText = (d: number): string => d >= 365 ? 'a year or more' : `${Math.floor(d)} ${Math.floor(d) === 1 ? 'day' : 'days'}`;
const fin = (s: GameState) => s.structures.filter(isFinished);

function foodRow(s: GameState): RunwayRow {
  const d = daysOfFood(s), n = Number.isFinite(d) ? d : 999;
  return { id: 'food', label: 'Food', days: Math.floor(Math.min(n, 999)), value: daysText(n), tone: toneOf(n, RUNWAY.food), detail: 'Food on the shelves and in the freezer at the family\'s appetite, with nothing grown or bought.', fix: { label: 'Food shelf', act: shop('food') } };
}

function waterRow(s: GameState): RunwayRow {
  const d = waterDaysStored(s), well = fin(s).some(st => st.kind.startsWith('well'));
  const tone: RunwayTone = well ? (d >= RUNWAY.water.bad ? 'good' : 'warn') : toneOf(d, RUNWAY.water);
  return { id: 'water', label: 'Water', days: Math.floor(d), value: daysText(d) + (well ? ', plus the well' : ''), tone, detail: `Water in the tanks and jugs at ${WATER_L_PER_DAY} liters a person a day${well ? '; the well keeps filling the tanks while its pump has power' : ''}.`, fix: tone === 'good' ? { label: 'Utilities', act: { type: 'open', right: 'utilities' } } : { label: 'Water shelf', act: shop('water') } };
}

function powerRow(s: GameState): RunwayRow {
  if (!powerOnPlace(s)) return { id: 'power', label: 'Power', days: null, value: 'none built', tone: 'warn', detail: 'Nothing on the place makes or stores electricity yet.', fix: { label: 'Power shelf', act: shop('power') } };
  const u = s.utilities, r = u.report, ps = powerSummary(s);
  if (r.drawKwh < 0.05) return { id: 'power', label: 'Power', days: null, value: 'nothing running', tone: 'good', detail: 'Nothing is drawing power yet.', fix: { label: 'Utilities', act: { type: 'open', right: 'utilities' } } };
  const fuelL = Math.max(0, s.stock.fuel * FUEL_UNIT_L - u.fuelL);
  const genKwh = ps.genKw > 0 ? fuelL / (FUEL_L_PER_KWH * genTune(s)) : 0;
  const d = (u.batteryKwh + genKwh) / r.drawKwh;
  const sunCovers = r.solarKwh >= r.drawKwh;
  const tone: RunwayTone = sunCovers && d >= RUNWAY.power.bad ? 'good' : toneOf(d, RUNWAY.power);
  const detail = `Battery charge${ps.genKw > 0 ? ' and generator fuel' : ''} at yesterday's use, with no sun and no grid.${sunCovers ? ' The sun covers it on a clear day.' : ''}`;
  return { id: 'power', label: 'Power', days: Math.floor(d), value: daysText(d), tone, detail, fix: tone === 'good' ? { label: 'Utilities', act: { type: 'open', right: 'utilities' } } : { label: ps.genKw > 0 ? 'Fuel shelf' : 'Power shelf', act: shop(ps.genKw > 0 ? 'fuel' : 'power') } };
}

function heatRow(s: GameState): RunwayRow {
  const o = firewoodOutlook(s), w = firewoodDays(s);
  if (regionFor(s.site).cold <= 0) return { id: 'heat', label: 'Heat', days: null, value: 'not needed', tone: 'good', detail: 'The climate here does not call for a fire.', fix: { label: 'Fuel shelf', act: shop('fuel') } };
  const d = w.days;
  const tone: RunwayTone = o.short >= 1 && toneOf(d, RUNWAY.heat) === 'good' ? 'warn' : toneOf(d, RUNWAY.heat);
  return { id: 'heat', label: 'Heat', days: Math.floor(d), value: w.endless ? 'a year or more' : daysText(d), tone, detail: 'Seasoned firewood at the pace the stove burns it through the seasons. Green wood is not counted.', fix: { label: 'Firewood', act: shop('fuel') } };
}

function medicineRow(s: GameState): RunwayRow {
  const cases = s.personState.reduce((a, ps) => a + (ps.needs.died == null ? ps.needs.hurt.length : 0), 0);
  const d = (Math.max(0, s.stock.meds) * RUNWAY.kitDays) / Math.max(1, cases);
  return { id: 'medicine', label: 'Medicine', days: Math.floor(d), value: daysText(d), tone: toneOf(d, RUNWAY.medicine), detail: `Medical kits: one lasts about ${pluralize(RUNWAY.kitDays, 'day')} for one person who is hurt or ill${cases > 1 ? `; ${cases} are being treated now` : ''}. Antibiotics and first-aid kits are extra.`, fix: { label: 'Medical shelf', act: shop('household') } };
}

function defenseRow(s: GameState): RunwayRow {
  const fights = fightsOfAmmo(s);
  if (fights === null) return { id: 'defense', label: 'Defense', days: null, value: 'no guns', tone: 'warn', detail: 'No firearms on the place, so there is no ammunition to run out of.', fix: { label: 'Guns & ammo', act: shop('guns') } };
  // fights -> days at the quiet between waves (sim/waves.ts): the gap a place that fights each one has to make the ammunition last
  const gap = Math.max(WAVE.LULL_MIN, Math.round(WAVE.LULL * diffOf(s.disaster).lull));
  const d = fights * gap;
  return { id: 'defense', label: 'Defense', days: Math.floor(d), value: `${daysText(d)} (${fights >= 100 ? '100+' : Math.floor(fights)} ${Math.floor(fights) === 1 ? 'fight' : 'fights'})`, tone: toneOf(fights, RUNWAY.fights), detail: `Ammunition for an average fight at the gate, one every ${pluralize(gap, 'day')}.`, fix: { label: 'Guns & ammo', act: shop('guns') } };
}

function fuelRow(s: GameState): RunwayRow {
  const u = s.utilities, ps = powerSummary(s), fleet = s.vehicles ?? startingVehicles();   // (not fleetOf: a read must not change the state)
  const tanks = fleet.reduce((a, v) => a + v.fuel, 0);
  const liters = Math.max(0, s.stock.fuel * FUEL_UNIT_L - u.fuelL) + tanks;
  const burnGen = ps.genKw > 0 ? Math.max(u.report.drawKwh, 0) * FUEL_L_PER_KWH * genTune(s) : 0;
  const car = fleet.find(v => v.condition > 0.1 && !v.fried);
  const burnCar = car ? VEHICLES[car.kind].dailyMiles / VEHICLES[car.kind].mpg * 3.785 : 0;
  const burn = ps.genKw > 0 ? burnGen : burnCar;
  if (burn <= 0.01) return { id: 'fuel', label: 'Fuel', days: null, value: liters > 0 ? `${Math.round(liters)} L on hand` : 'none needed', tone: 'good', detail: 'No generator and no vehicle to burn it yet.', fix: { label: 'Fuel shelf', act: shop('fuel') } };
  const d = liters / burn;
  return { id: 'fuel', label: 'Fuel', days: Math.floor(d), value: daysText(d), tone: toneOf(d, RUNWAY.fuel), detail: `${Math.round(liters)} liters in cans and tanks at ${ps.genKw > 0 ? "the generator's burn" : "a day's driving"} (${Math.round(burn)} L a day).`, fix: { label: 'Fuel shelf', act: shop('fuel') } };
}

/** The first days of a new game: nothing has been asked of the place yet, so an empty shelf is not an alarm. */
export const FIRST_DAYS = 2;

/** On the first days a red water or medicine row reads as an amber "none yet" with the same fix (a start with nothing stocked is not a failure). */
function softenFirstDay(s: GameState, r: RunwayRow): RunwayRow {
  if (dayIndex(s.clock.t) >= FIRST_DAYS || r.tone !== 'bad' || (r.id !== 'water' && r.id !== 'medicine')) return r;
  return { ...r, tone: 'warn', value: 'none yet' };
}

/** The runway for this state: seven rows, always in this order. */
export function runway(s: GameState): RunwayRow[] {
  return [foodRow(s), waterRow(s), powerRow(s), heatRow(s), medicineRow(s), defenseRow(s), fuelRow(s)].map(r => softenFirstDay(s, r));
}

/** The row that runs out first, among those that apply (null if none do). */
export function shortestRunway(rows: readonly RunwayRow[]): RunwayRow | null {
  const live = rows.filter(r => r.days !== null);
  if (!live.length) return null;
  const rank = { bad: 0, warn: 1, good: 2 } as const;
  return [...live].sort((a, b) => rank[a.tone] - rank[b.tone] || (a.days ?? 0) - (b.days ?? 0))[0];
}
