/**
 * Maple sugaring (docs/DECISIONS.md "Farm & kitchen, part 2"). Pure; the daily step is `mapleDay`.
 *
 *  Where     sugar maples grow in New England, the Upper Midwest, the North Woods and, thinner, Appalachia and
 *            the Rust Belt (`MAPLE_SHARE`). The sugar bush on the place: about 40 taps an acre of maple woods
 *            (acres × the timber × the region's maple share). Nowhere else: no maples, no sugar bush.
 *  When      the sap runs on freeze-thaw days for about five weeks before bud break: from 80 to 30 days ahead
 *            of the last frost (late February to mid-April in Vermont); 55 % of those days run. A run gives
 *            ≈ 0.5 gallon a tap; ten gallons a tap a season.
 *  Gear      a tapping set (`maple_taps`, 25 taps with buckets) per 25 taps. The evaporator in the sugar shack
 *            boils 12 gallons of sap an hour on a rick of firewood per 200 gallons and handles a hundred and fifty
 *            taps; without a shack a steam pan on blocks does 3 an hour on twice the wood, forty taps.
 *  Boiling   sap is about 2 % sugar and boils down 40 : 1. It sours if it waits: a tenth of the tank a day past
 *            two days. The `sugaring` chore (Wood duty) is the collecting and the boiling; behind, less is gathered.
 *  Syrup     ≈ 13,000 kcal a gallon into the pantry (`maple_syrup`), a sweet that keeps for years.
 */
import { calendarOf, type GameState } from './state';
import { isFinished } from './construction';
import { REGIONS, type RegionId } from './regions';
import { mulberry32 } from './rng';
import { logGate } from './nag';
import { addFood } from './pantry';
import { farmOf } from './farm';
import { burnRick, greenRicks } from './upkeep';

/** Share of the woods in sugar maple, by region (absent: none). */
export const MAPLE_SHARE: Partial<Record<RegionId, number>> = { new_england: 0.45, upper_midwest: 0.3, north_woods: 0.2, rust_belt: 0.2, appalachia: 0.15 };
export const TAPS_PER_ACRE = 40, TAPS_PER_SET = 25;
export const RUN_ODDS = 0.55, SAP_PER_TAP = 0.5, SAP_TO_SYRUP = 40;
export const BOIL = { evaporator: { gph: 12, perRick: 200, taps: 150 }, pan: { gph: 3, perRick: 100, taps: 40 } } as const;
export const BOIL_HOURS = 10;

export interface Maple {
  /** Taps the family puts out this season (null: as many as the sets and the woods allow). */
  taps: number | null;
  /** Sap in the tank (gallons) and its age (days). */
  sap: number;
  sapAge: number;
  /** This season: sap gathered, syrup made (gallons), run days; the year; the wood burned toward the next rick. */
  year: number;
  gathered: number;
  syrup: number;
  runDays: number;
  heat: number;
  told: number;
}
export const newMaple = (): Maple => ({ taps: null, sap: 0, sapAge: 0, year: 0, gathered: 0, syrup: 0, runDays: 0, heat: 0, told: -1 });
export const mapleOf = (s: GameState): Maple => (farmOf(s).maple ??= newMaple());
const stock = (s: GameState, k: string): number => (s.stock as unknown as Record<string, number>)[k] ?? 0;

export const hasMaples = (s: GameState): boolean => (MAPLE_SHARE[s.site.region] ?? 0) > 0;
export const hasShack = (s: GameState): boolean => s.structures.some(st => st.kind === 'sugar_shack' && isFinished(st));

/** Taps the woods can carry. */
export function woodsTaps(s: GameState): number {
  const share = MAPLE_SHARE[s.site.region] ?? 0;
  return Math.floor(s.site.acres * Math.max(0.2, Math.min(1.6, s.site.timber)) * share * TAPS_PER_ACRE);
}
/** Taps the gear and the boiler allow. */
export const gearTaps = (s: GameState): number => Math.floor(stock(s, 'maple_taps')) * TAPS_PER_SET;
export const boilerTaps = (s: GameState): number => (hasShack(s) ? BOIL.evaporator.taps : BOIL.pan.taps);
/** Taps out this season. */
export function tapsOut(s: GameState): number {
  const m = mapleOf(s);
  return Math.max(0, Math.min(m.taps ?? Infinity, woodsTaps(s), gearTaps(s), boilerTaps(s)));
}
export function setTaps(s: GameState, n: number | null): void { mapleOf(s).taps = n === null ? null : Math.max(0, Math.round(n)); }

/** The sap runs from 80 to 30 days before the last frost. */
export function sapSeason(s: GameState): [number, number] {
  const last = REGIONS[s.site.region].frost[0];
  return [last - 80, last - 30];
}
export const inSeason = (s: GameState): boolean => { const d = calendarOf(s.clock).doy, [a, b] = sapSeason(s); return hasMaples(s) && d >= a && d <= b; };

/** Chore growth a day in the season: gathering and boiling. */
export function sugaringRate(s: GameState): number {
  const t = tapsOut(s), m = mapleOf(s);
  return inSeason(s) && t > 0 ? Math.min(60, 8 + 3 * t / TAPS_PER_SET) : m.sap > 1 ? 10 : 0;
}
const care = (s: GameState): number => 1 - 0.6 * Math.max(0, Math.min(1, (((s.daily?.chores.levels as Record<string, number> | undefined)?.sugaring ?? 0) - 20) / 80));

/** Expected syrup from a normal season at these taps (gallons). */
export const expectedSyrup = (s: GameState, taps = tapsOut(s)): number => taps * SAP_PER_TAP * RUN_ODDS * ((sapSeason(s)[1] - sapSeason(s)[0]) + 1) / SAP_TO_SYRUP;

/** Once a day: sap runs, is gathered and boiled. Returns log lines. */
export function mapleDay(s: GameState): string[] {
  const out: string[] = [];
  if (!hasMaples(s)) return out;
  const m = mapleOf(s), { doy, year } = calendarOf(s.clock), day = Math.floor(s.clock.t + 0.25);
  if (m.year !== year) { m.year = year; m.gathered = 0; m.syrup = 0; m.runDays = 0; }
  const season = inSeason(s), taps = tapsOut(s);
  if (season && taps > 0 && mulberry32(s.seed * 3541 + day * 17 + 5)() < RUN_ODDS) {
    const gal = taps * SAP_PER_TAP * care(s);
    m.sap += gal; m.gathered += gal; m.runDays++;
    if (m.sapAge > 0) m.sapAge = Math.max(0, m.sapAge - 0.5); else m.sapAge = 0.01;
  }
  // boiling: as much as the arch and the hours allow, while there is wood
  if (m.sap > 0.5) {
    const b = hasShack(s) ? BOIL.evaporator : BOIL.pan;
    const hours = BOIL_HOURS * care(s);
    let gal = Math.min(m.sap, b.gph * hours);
    const ricks = gal / b.perRick, wood = stock(s, 'firewood') >= 1 || greenRicks(s) >= 1.5;
    if (m.heat + ricks >= 1 && !wood) { if (logGate(s, 'maple-wood', 5)) out.push('The sugar arch is out of wood: the sap is waiting in the tank and will sour.'); gal = 0; }
    else { m.heat += ricks; while (m.heat >= 1) { if (!burnRick(s)) { m.heat = 0; break; } m.heat -= 1; } }
    if (gal > 0) { m.sap -= gal; addFood(s, 'maple_syrup', gal / SAP_TO_SYRUP); m.syrup += gal / SAP_TO_SYRUP; }
    m.sapAge += 1;
    if (m.sapAge > 2) m.sap *= 0.9;
    if (m.sap < 0.5) { m.sap = 0; m.sapAge = 0; }
  }
  // the season's close
  const [, b1] = sapSeason(s);
  if (doy === b1 + 3 && m.told !== year && m.gathered > 0) {
    m.told = year;
    out.push(`The sap stopped running. The season's boil: ${m.syrup.toFixed(1)} gallons of syrup from ${taps} taps (${Math.round(m.gathered)} gallons of sap, ${m.runDays} run days).`);
  }
  if (season && doy === sapSeason(s)[0] && taps === 0 && logGate(s, 'maple-start', 300)) out.push(`The sap is about to run. ${woodsTaps(s) > 0 ? 'There is maple on the place: tapping sets (Shop) and a sugar shack would make syrup.' : 'The woods here are too thin in maple to tap.'}`);
  return out;
}

