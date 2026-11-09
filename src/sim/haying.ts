/**
 * Haying (docs/DECISIONS.md "Farm & kitchen, part 3"; ported from the old claude/farm-kitchen WIP). Pure.
 *
 * Until now hay could only be bought, so a herd starved the winter the feed store closed. The family can cut its own:
 *
 *  Meadow   40 % of the pasture (sim/herd.ts `pastureAcres`) is mown, not grazed: 25 bales an acre a cutting in a dry
 *           region up to 60 in a wet one (a 50 lb square bale). Drought halves it.
 *  Cuttings two a year, each a 14-day window: early summer (50 days after the last frost) and late summer (110).
 *           The standing hay is put up over the window, as fast as the hours allow (the `haying` chore, Fields duty):
 *           by hand (scythe, rake, fork) about a quarter hour a bale, with a running tractor four times faster.
 *           Hay not in by the window's close stands and spoils; a wet week (a third of cutting days in a wet
 *           region) costs a tenth of what is put up that day.
 *  Storage  bales go straight into `stock.hay`, the bales the herd eats from (sim/livestock.ts).
 *  Shortfall with grazers and no hay on hand the Farm tab says so; the Shop still sells hay while the stores are open.
 */
import { calendarOf, type GameState } from './state';
import { mulberry32 } from './rng';
import { farmOf } from './farm';
import { regionFor } from './climate';
import { pastureAcres } from './herd';
import { tractorBoost } from './vehicles';
import { logGate } from './nag';

export const MEADOW_SHARE = 0.4, WINDOW_DAYS = 14, CUT_AFTER_FROST = [50, 110] as const;
export const HAND_HOURS_PER_BALE = 0.25, TRACTOR_SPEEDUP = 4, RAIN_LOSS = 0.1;

export interface Haying {
  year: number;
  /** Bales standing in each cutting (0 once put up or spoiled); put up this year; spoiled this year. */
  standing: [number, number];
  made: number;
  lost: number;
}
export const newHaying = (): Haying => ({ year: -1, standing: [0, 0], made: 0, lost: 0 });
export const hayingOf = (s: GameState): Haying => (farmOf(s).haying ??= newHaying());

export const meadowAcres = (s: GameState): number => Math.max(0, pastureAcres(s) * MEADOW_SHARE);
/** Bales an acre a cutting by rain (mm a year): 25 at 400 mm and under, 60 at 1,200 and over. */
export const balesPerAcre = (s: GameState): number => 25 + 35 * Math.max(0, Math.min(1, (regionFor(s.site).rainMm - 400) / 800));
export const inDrought = (s: GameState): boolean => s.disaster.kind === 'drought' && s.clock.t >= s.disaster.hitAt;
/** Bales one full cutting of the meadow makes this year. */
export const cuttingBales = (s: GameState): number => Math.floor(meadowAcres(s) * balesPerAcre(s) * (inDrought(s) ? 0.5 : 1));
export const hasHerd = (s: GameState): boolean => ['goat', 'cow', 'steer', 'sheep'].some(k => ((s.stock as unknown as Record<string, number>)[k] ?? 0) >= 1);

/** The windows: first and last day of year of each cutting. */
export function cuttingWindows(s: GameState): Array<[number, number]> {
  const last = regionFor(s.site).frost[0];
  return CUT_AFTER_FROST.map(a => [last + a, last + a + WINDOW_DAYS - 1] as [number, number]);
}
/** Which cutting is open today (null: none). */
export function openCutting(s: GameState): 0 | 1 | null {
  const { doy } = calendarOf(s.clock), w = cuttingWindows(s);
  const i = w.findIndex(([a, b]) => doy >= a && doy <= b);
  return i === 0 || i === 1 ? i : null;
}
/** Bales one person-hour puts up. */
export const balesPerHour = (s: GameState): number => (1 / HAND_HOURS_PER_BALE) * (tractorBoost(s) > 1 ? TRACTOR_SPEEDUP : 1);

/** Chore growth a day in a cutting window: enough hours to put up the hay in time, 100 = a full backlog. */
export function hayingRate(s: GameState): number {
  const h = hayingOf(s), { year } = calendarOf(s.clock), c = openCutting(s);
  if (c === null || !hasHerd(s)) return 0;
  const standing = h.year === year ? h.standing[c] : cuttingBales(s);
  if (standing <= 0) return 0;
  // hours the whole cutting wants, over the days of the window, against the chore's full-backlog hours
  const hours = standing / balesPerHour(s);
  return Math.min(60, 100 * (hours / WINDOW_DAYS) / CLEAR_HAYING_HOURS);
}
export const CLEAR_HAYING_HOURS = 20;
/** Share of the day's possible haying actually done: falls as the chore backlog grows. */
const care = (s: GameState): number => 1 - 0.7 * Math.max(0, Math.min(1, (((s.daily?.chores.levels as Record<string, number> | undefined)?.haying ?? 0) - 20) / 80));

/** Once a day: open a cutting, put the hay up, close the window. Returns log lines. */
export function hayingDay(s: GameState): string[] {
  const out: string[] = [];
  if (!hasHerd(s) || meadowAcres(s) < 0.5) return out;
  const h = hayingOf(s), { doy, year } = calendarOf(s.clock), day = Math.floor(s.clock.t + 0.25);
  if (h.year !== year) { h.year = year; h.standing = [0, 0]; h.made = 0; h.lost = 0; }
  const w = cuttingWindows(s);
  for (const i of [0, 1] as const) {
    const [a, b] = w[i];
    if (doy === a) {
      h.standing[i] = cuttingBales(s);
      if (h.standing[i] > 0 && logGate(s, `hay-open-${i}`, 100)) out.push(`The ${i === 0 ? 'first' : 'second'} cutting: about ${h.standing[i]} bales standing in the meadow${inDrought(s) ? ' (a thin crop in the drought)' : ''}. Hay is made while the weather holds.`);
    }
    if (doy >= a && doy <= b && h.standing[i] > 0) {
      const left = b - doy + 1;
      // the day's pace: even over the window, caught up if behind, limited by the chore backlog
      const want = Math.ceil(h.standing[i] / left);
      const put = Math.min(h.standing[i], Math.ceil(want * care(s)));
      const wet = mulberry32(s.seed * 4513 + day * 13 + i)() < Math.min(0.33, regionFor(s.site).rainMm / 3600);
      const spoiled = wet ? Math.round(put * RAIN_LOSS) : 0;
      h.standing[i] -= put; h.made += put - spoiled; h.lost += spoiled;
      s.stock.hay = (s.stock.hay ?? 0) + put - spoiled;
    }
    if (doy === b + 1 && h.standing[i] > 0) {
      h.lost += h.standing[i];
      out.push(`${h.standing[i]} bales of the ${i === 0 ? 'first' : 'second'} cutting were left standing and went to waste. Hay needs hands in the meadow while the weather holds.`);
      h.standing[i] = 0;
    }
  }
  return out;
}
