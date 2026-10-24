/**
 * The greenhouse and the orchard (food, after the user's reference photo:
 * a glass greenhouse by the raised beds, a block of fruit trees). Pure.
 *
 *  Greenhouse  a 12 × 24 ft hobby greenhouse (aluminum frame, twin-wall
 *              polycarbonate). With one finished, the garden starts six weeks
 *              earlier and runs six weeks later (transplants started under
 *              glass, a cold frame over the late beds), and its peak is 15 %
 *              higher (stronger seedlings). Through the cold months (October
 *              to April) its benches grow winter greens: ≈ 600 kcal a day
 *              where winters are like the Mountain West's, more where they're
 *              mild, less under heavy snow unless it has power for a heater.
 *  Orchard     twelve semi-dwarf apple, peach and pear trees. Nothing for
 *              three years after planting, then a quarter, half, three
 *              quarters and from year six the full crop: ≈ 150 lb a tree,
 *              1,800 lb ≈ 900,000 kcal a year, picked August to October into
 *              fresh (the cellar keeps it). A late spring frost on the
 *              blossom takes the whole year's crop about one year in six
 *              (seeded per year).
 */
import { calendarOf, type GameState, type Structure } from './state';
import { isFinished } from './construction';
import { REGIONS, seasons } from './regions';
import { mulberry32 } from './rng';

/** Days the greenhouse moves the garden's start earlier and its end later. */
export const GREENHOUSE_EXTEND = 42;
/** Garden peak with greenhouse-started seedlings. */
export const GREENHOUSE_PEAK = 1.15;
/** Winter greens a greenhouse grows a day in a Mountain West winter (kcal). */
export const GREENS_KCAL = 600;
/** An orchard at full bearing (kcal a year): 12 trees × 150 lb ≈ 1,800 lb of fruit at ≈ 500 kcal a lb. */
export const ORCHARD_KCAL = 900_000;
/** Picking season (day of year): August 1 to October 31. */
export const ORCHARD_PICK: [number, number] = [213, 305];
/** Chance a year's blossom is lost to a late frost. */
export const ORCHARD_FROST = 1 / 6;

const finished = (s: GameState, kind: string): Structure[] => s.structures.filter(st => st.kind === kind && isFinished(st));

export const hasGreenhouse = (s: GameState) => finished(s, 'greenhouse').length > 0;

/** The garden's season (day of year), stretched by a finished greenhouse. */
export function gardenSeason(s: GameState): [number, number] {
  const [g0, g1] = seasons(REGIONS[s.site.region]).garden;
  return hasGreenhouse(s) ? [g0 - GREENHOUSE_EXTEND, g1 + GREENHOUSE_EXTEND] : [g0, g1];
}

/** The cold months the greenhouse benches are in greens (October through April). */
export const inGreensSeason = (doy: number) => doy >= 274 || doy <= 120;

/** How a region's winter sets the greens: mild winters more, heavy snow less (unless the greenhouse has power for a heater). */
export function greensFactor(cold: number, heated: boolean): number {
  if (cold <= 1) return 1 + 0.6 * (1 - cold);
  return heated ? 1 : Math.max(0.3, 1 - 0.6 * (cold - 1));
}

/** Winter greens from the greenhouses today (kcal, before the climate). */
export function greenhouseGreens(s: GameState): number {
  const doy = calendarOf(s.clock).doy;
  if (!inGreensSeason(doy)) return 0;
  const cold = REGIONS[s.site.region].cold;
  return finished(s, 'greenhouse').reduce((a, st) => a + GREENS_KCAL * greensFactor(cold, s.utilities.lit.includes(st.id)), 0);
}

/** How much of a full crop an orchard planted (finished) `years` ago bears: nothing for three years, full from the sixth. */
export function orchardBearing(years: number): number {
  if (years < 3) return 0;
  return Math.min(1, (Math.floor(years) - 2) / 4);
}

/** Did a late spring frost take this year's fruit? (Seeded per game and year: about one in six.) */
export function orchardFrost(seed: number, year: number): boolean {
  return mulberry32(seed * 7919 + year * 104_729 + 31)() < ORCHARD_FROST;
}

/** The day's fruit from the orchards (kcal, before the climate). */
export function orchardHarvest(s: GameState): number {
  const { doy, year } = calendarOf(s.clock);
  if (doy < ORCHARD_PICK[0] || doy >= ORCHARD_PICK[1] || orchardFrost(s.seed, year)) return 0;
  const perDay = ORCHARD_KCAL / (ORCHARD_PICK[1] - ORCHARD_PICK[0]);
  return finished(s, 'orchard').reduce((a, st) => a + perDay * orchardBearing((s.clock.t - (st.finishedAt ?? s.clock.t)) / 365), 0);
}
