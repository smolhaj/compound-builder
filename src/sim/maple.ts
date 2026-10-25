/**
 * Maple sugaring (user-approved: "in northern regions … tap in late
 * winter, about 40:1 sap to syrup, firewood to boil. Syrup goes into the
 * pantry as a sweetener"). Pure.
 *
 *  Where      sugar maples grow in New England, the Upper Midwest and the
 *             North Woods (`MAPLE_REGIONS`). The sugarbush on the place:
 *             about 40 taps an acre of maple woods, from the acres, the
 *             timber and the region's share of maple in it.
 *  When       the sap runs on freeze–thaw days for about six weeks before
 *             bud break: from ≈ 80 days before the last frost to ≈ 35
 *             before it (late February to early April in Wisconsin, mid
 *             March to late April in Maine). About 55 % of those days run;
 *             a run gives ≈ 0.4 gallon a tap (≈ 10 a tap a season).
 *  Gear       a tapping kit (`maple_taps`) is 25 taps and buckets; the
 *             family taps up to what the kits and the sugarbush allow
 *             (the Farm tab sets how many).
 *  Boiling    sap at ≈ 2 % sugar boils down about 40 : 1. In the sugar
 *             shack's evaporator ≈ 12 gallons of sap an hour and a rick
 *             of firewood per ≈ 200 gallons; without one, a steam pan on
 *             blocks: 3 gallons an hour and twice the wood. Sap sours if
 *             it waits: a tenth of the tank a day past two days.
 *  Labor      ≈ an hour a day per 25 buckets on a run day, and an hour of
 *             tending the arch per hour of boiling (farmWork.ts).
 *  Syrup      ≈ 13,000 kcal a gallon into the pantry (`maple_syrup`), a
 *             sweet like honey; sealed hot it keeps for years.
 */
import type { GameState } from './state';
import { calendarOf } from './state';
import { REGIONS } from './regions';
import { isFinished } from './construction';
import { mulberry32 } from './rng';
import { addFoodKcal, FOOD } from './pantry';
import { book, hoursLeft, LABOR } from './farmWork';

/** Regions with sugar maples (New England comes with the regions work; its id is listed so it works the day it lands). */
export const MAPLE_REGIONS: ReadonlySet<string> = new Set(['new_england', 'upper_midwest', 'north_woods']);
/** Share of the woods in maple, by region. */
const MAPLE_SHARE: Record<string, number> = { new_england: 0.4, upper_midwest: 0.35, north_woods: 0.15 };
export const TAPS_PER_ACRE = 40, TAPS_PER_KIT = 25;
export const RUN_ODDS = 0.55, SAP_PER_RUN = 0.4, SAP_TO_SYRUP = 40;
/** Boiling rates (gallons of sap an hour) and sap a rick of firewood boils off, evaporator / pan. */
export const BOIL = { evaporator: { gph: 12, perRick: 200 }, pan: { gph: 3, perRick: 100 } } as const;
const SOUR = 0.1;

export interface Maple {
  /** Taps the family puts out (0: not sugaring). */
  taps: number;
  /** Sap waiting in the tank (gal) and its age (days). */
  sap: number;
  sapAge: number;
  /** This year's season: sap gathered, syrup made (gal), the year. */
  year: number;
  gathered: number;
  syrup: number;
  /** Year the season's summary was logged. */
  told?: number;
}
export const newMaple = (): Maple => ({ taps: 0, sap: 0, sapAge: 0, year: 0, gathered: 0, syrup: 0 });

export const mapleRegion = (s: GameState) => MAPLE_REGIONS.has(s.site.region);
/** Maples big enough to tap on the place (one tap each). */
export function sugarbush(s: GameState): number {
  if (!mapleRegion(s)) return 0;
  const woods = Math.min(0.8, s.site.timber * 0.4);
  return Math.round(s.site.acres * woods * (MAPLE_SHARE[s.site.region] ?? 0.3) * TAPS_PER_ACRE);
}
/** Taps out this season: the family's choice, within the kits and the sugarbush. */
export const tapsOut = (s: GameState) => Math.min(s.farm.maple.taps, Math.floor(s.stock.maple_taps ?? 0) * TAPS_PER_KIT, sugarbush(s));
/** The sap season (day of year). */
export function sapSeason(s: GameState): [number, number] {
  const [last] = REGIONS[s.site.region].frost;
  return [last - 80, last - 35];
}
export const hasShack = (s: GameState) => s.structures.some(st => st.kind === 'sugar_shack' && isFinished(st));

/** Once a day (farm.ts): the sap run, the boil, sap souring. Returns kcal of syrup made. */
export function mapleDay(s: GameState): number {
  const m = s.farm.maple, { doy, year } = calendarOf(s.clock), day = Math.floor(s.clock.t + 0.25);
  if (m.year !== year) { m.year = year; m.gathered = 0; m.syrup = 0; }
  const [a, b] = sapSeason(s), taps = tapsOut(s);
  if (taps > 0 && doy >= a && doy <= b) {
    const r = mulberry32(s.seed * 7121 + day * 3 + 11);
    if (r() < RUN_ODDS) {
      const want = taps * LABOR.sapPerTap, got = book(s, 'sugaring', want);
      const sap = taps * SAP_PER_RUN * (0.6 + 0.8 * r()) * (want > 0 ? got / want : 0);
      m.sap += sap; m.gathered += sap;
    }
  }
  if (m.sap <= 0.01) { m.sap = 0; m.sapAge = 0; return 0; }
  // boil what the hours, the wood and the rig allow
  const rig = hasShack(s) ? BOIL.evaporator : BOIL.pan;
  const perHour = LABOR.boil10Gal * rig.gph / 10;                          // person-hours an hour of boiling
  const hours = Math.min(m.sap / rig.gph, 14) * (hoursLeft(s) > 0 ? 1 : 0);
  const granted = book(s, 'sugaring', hours * perHour);
  const boiled = Math.min(m.sap, granted / perHour * rig.gph, Math.max(0, s.stock.firewood ?? 0) * rig.perRick);
  s.stock.firewood = Math.max(0, (s.stock.firewood ?? 0) - boiled / rig.perRick);
  m.sap -= boiled;
  m.sapAge = m.sap > 0 ? m.sapAge + 1 : 0;
  if (m.sapAge > 2) m.sap *= 1 - SOUR;
  const syrup = boiled / SAP_TO_SYRUP;
  if (syrup > 0) { m.syrup += syrup; addFoodKcal(s, 'maple_syrup', syrup * FOOD.maple_syrup.kcal); }
  return syrup * FOOD.maple_syrup.kcal;
}

/** The season's summary for the log, once it's over. */
export function mapleSummary(s: GameState): string | null {
  const m = s.farm.maple, { doy, year } = calendarOf(s.clock), [, b] = sapSeason(s);
  if (m.told === year || doy <= b + 3 || m.gathered <= 0) return null;
  m.told = year;
  return `The sugaring season is over: ${Math.round(m.gathered)} gallons of sap boiled down to ${m.syrup.toFixed(1)} gallons of maple syrup.`;
}
