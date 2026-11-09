/**
 * Breeding swine (docs/DECISIONS.md "Farm & kitchen, part 3"; ported from the old claude/farm-kitchen WIP).
 * Pure. Without a sow the pig is bought as a feeder each year (sim/livestock.ts); with one the place raises its own.
 *
 *  Stock    a bred gilt (`sow`, $450) and a boar ($400) are goods in the stockpile. A sow eats 7 lb of feed a day
 *           (11 with a litter at her side), a boar 5; they come out of the same bags as the feeders.
 *  Litters  two a year, farrowing in late March and in late September (gestation 114 days). A litter is about
 *           10 born and, fed and healthy, 8 weaned at 56 days. Hungry sows (condition under 0.6) lose piglets.
 *  Sire     a boar on the place, or in peacetime (stores and banks open) artificial insemination from a
 *           breeder for $60 a sow. Neither: no litter, and the Farm tab says so.
 *  Weaned   piglets join the feeders (`pig`) and go to the butcher with them in November. The pen holds
 *           `PIG_CAP` feeders; past it the extra piglets are sold ($75 each, peacetime) or killed young
 *           as roasting pigs (about 30,000 Calories of pork) and put up by the kitchen.
 */
import { calendarOf, type GameState } from './state';
import { mulberry32 } from './rng';
import { logGate } from './nag';
import { farmOf } from './farm';
import { putUpMeat } from './kitchen';

export const SOW_FEED_LB = 7, SOW_NURSING_LB = 11, BOAR_FEED_LB = 5;
export const BORN = 10, WEANED = 8, WEAN_DAYS = 56, PIG_CAP = 12;
export const STUD_FEE = 60, PIGLET_USD = 75, ROASTER_KCAL = 30_000;
/** Farrowing windows (day of year): late March and late September. */
export const FARROW_DOY: readonly number[] = [85, 270];

export interface Swine {
  /** 0..1 how well the breeding stock is fed. */
  cond: number;
  /** Litters on the ground: head and the day they are weaned. */
  litters: Array<{ n: number; ready: number }>;
  /** `year-window` keys of the farrowings already done. */
  done: string[];
  /** This year: the year, litters, piglets weaned, piglets sold or eaten young. */
  year: number;
  litterCount: number;
  weaned: number;
  surplus: number;
  /** Whether the Farm tab should say the sows are waiting for a sire. */
  noSire: boolean;
}
export const newSwine = (): Swine => ({ cond: 1, litters: [], done: [], year: 0, litterCount: 0, weaned: 0, surplus: 0, noSire: false });
export const swineOf = (s: GameState): Swine => (farmOf(s).swine ??= newSwine());
const st = (s: GameState, k: string): number => Math.floor((s.stock as unknown as Record<string, number>)[k] ?? 0);
export const sows = (s: GameState): number => st(s, 'sow');
export const boars = (s: GameState): number => st(s, 'boar');
export const hasSwine = (s: GameState): boolean => sows(s) + boars(s) > 0;
const peacetime = (s: GameState): boolean => s.disaster.tracks.stores > 0.5 && s.disaster.tracks.banks > 0.5;
const day = (s: GameState): number => Math.floor(s.clock.t + 0.25);

/** Piglets nursing right now (head). */
export const nursing = (s: GameState): number => (farmOf(s).swine?.litters ?? []).reduce((a, l) => a + l.n, 0);
/** Pounds of feed the breeding stock eat a day. */
export function swineFeedLb(s: GameState): number {
  const n = sows(s), nursingSows = Math.min(n, farmOf(s).swine?.litters.length ?? 0);
  return (n - nursingSows) * SOW_FEED_LB + nursingSows * SOW_NURSING_LB + boars(s) * BOAR_FEED_LB;
}
/** How the sows will be bred: 'boar', 'ai' (peacetime, for a fee), or null (no sire). */
export function sireFor(s: GameState): 'boar' | 'ai' | null {
  if (boars(s) > 0) return 'boar';
  return peacetime(s) && s.money >= STUD_FEE * Math.max(1, sows(s)) ? 'ai' : null;
}

/**
 * Once a day from the herd's feeding: `fed` is the share of the day's feed that was there (0..1).
 * Returns the calories brought in (young roasters put up) and log lines.
 */
export function swineDay(s: GameState, fed: number, freezer: boolean): { kcal: number; lines: string[] } {
  const w = swineOf(s), lines: string[] = [];
  let kcal = 0;
  if (!hasSwine(s) && w.litters.length === 0) { w.cond = 1; w.noSire = false; return { kcal, lines }; }
  const { doy, year } = calendarOf(s.clock), d = day(s);
  if (w.year !== year) { w.year = year; w.litterCount = 0; w.weaned = 0; w.surplus = 0; w.done = w.done.filter(k => k.startsWith(`${year}-`)); }
  // condition follows the feed
  w.cond = Math.min(1, Math.max(0, w.cond + (fed >= 0.95 ? 0.02 : -0.06 * (1 - fed))));
  if (w.cond <= 0 && hasSwine(s)) {
    const k = sows(s) > 0 ? 'sow' : 'boar';
    (s.stock as unknown as Record<string, number>)[k] = st(s, k) - 1; w.cond = 0.4;
    lines.push(`A ${k} died: starved for lack of feed.`);
  }
  const n = sows(s);
  w.noSire = n > 0 && sireFor(s) === null;
  // farrowing
  FARROW_DOY.forEach((start, i) => {
    const key = `${year}-${i}`;
    if (n < 1 || doy < start || doy >= start + 20 || w.done.includes(key)) return;
    const sire = sireFor(s);
    if (!sire) { if (logGate(s, 'swine-sire', 40)) lines.push('The sows are ready to breed and there is no boar. Buy one, or call the breeder out while the banks are open.'); return; }
    w.done.push(key);
    if (sire === 'ai') { s.money -= STUD_FEE * n; lines.push(`The breeder came out for the sows: $${(STUD_FEE * n).toLocaleString('en-US')}.`); }
    const rng = mulberry32(s.seed * 7919 + d * 31 + i);
    let weaned = 0;
    for (let k = 0; k < n; k++) {
      const born = BORN - 1 + Math.round(rng() * 2);
      weaned += Math.max(0, Math.round(born * (WEANED / BORN) * (w.cond >= 0.6 ? 0.8 + 0.2 * w.cond : w.cond)));
    }
    if (weaned > 0) { w.litters.push({ n: weaned, ready: d + WEAN_DAYS }); w.litterCount += n; lines.push(`${n === 1 ? 'The sow' : `${n} sows`} farrowed: ${weaned} piglets.`); }
    else lines.push('The sows farrowed and lost the whole litter: they are thin.');
  });
  // weaning: the piglets join the feeders, up to what the pen holds
  const still: Swine['litters'] = [];
  for (const l of w.litters) {
    if (d < l.ready) { still.push(l); continue; }
    const room = Math.max(0, PIG_CAP - st(s, 'pig'));
    const keep = Math.min(l.n, room), extra = l.n - keep;
    (s.stock as unknown as Record<string, number>).pig = st(s, 'pig') + keep;
    w.weaned += l.n;
    if (extra > 0) {
      w.surplus += extra;
      if (peacetime(s)) { s.money += extra * PIGLET_USD; lines.push(`${l.n} piglets weaned: ${keep} to the pen, ${extra} sold for $${(extra * PIGLET_USD).toLocaleString('en-US')}.`); }
      else {
        const put = putUpMeat(s, extra * ROASTER_KCAL, { freezer, pork: true });
        kcal += put.kept;
        lines.push(`${l.n} piglets weaned: ${keep} to the pen, ${extra} killed young for the table (the pen is full).`);
      }
    } else lines.push(`${l.n} piglets weaned and in the pen with the feeders.`);
  }
  w.litters = still;
  return { kcal, lines };
}
