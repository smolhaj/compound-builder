/**
 * The farm pond (user-approved: "dig it; stock it with fish (bluegill,
 * bass, catfish), and it yields a steady catch with sustainable-harvest
 * limits"). Pure.
 *
 *  The pond   a quarter acre dug with a hired excavator (the `pond`
 *             structure). It holds water from a creek or spring, a high
 *             water table (≤ 4 m) or a wet climate (600 mm+ of rain);
 *             a dry bench won't fill (site.ts says so before it's dug).
 *  Stocking   the extension recipe, scaled: 125 bluegill, 25 largemouth
 *             bass and 25 channel catfish fingerlings (`fingerlings`).
 *             Bluegill and catfish are fit to take after a year, bass
 *             after a year and a half.
 *  The fish   a pound count per species growing toward what a quarter
 *             acre carries (unfed: bluegill ≈ 50 lb, bass ≈ 15, catfish
 *             ≈ 20; fed catfish pellets ≈ 120 lb), logistic. Bluegill and
 *             bass breed in the pond; catfish don't (the bass eat the
 *             fry), so they're restocked.
 *  The limit  each year's take is held to what the pond can make again:
 *             70 % of the maximum sustainable yield (r·K/4) for bluegill
 *             and bass, a third of the catfish. That's only ≈ 22 lb of
 *             bluegill, 4 lb of bass and 7 lb of catfish a year unfed
 *             (≈ 5,000 kcal of fillets): a pond is a treat and a protein
 *             reserve, not a pantry. Feeding the catfish (≈ 1.6 lb of
 *             pellets a lb of gain) makes ≈ 60 lb of them a year. "Fish it hard" ignores the limit
 *             and the pond crashes.
 *  Fishing    needs gear and a couple of hours (farmWork.ts); open water
 *             from the thaw to the freeze, ice fishing at a third of it.
 *             Fillets ≈ 35–45 % of the fish, ≈ 430 kcal a lb.
 *  Blows      a drought's summer kills half the fish in a pond without a
 *             creek or spring; fallout makes the fish hot like the wild's.
 */
import type { GameState } from './state';
import { calendarOf } from './state';
import { REGIONS } from './regions';
import { isFinished } from './construction';
import { mulberry32 } from './rng';
import { book, hoursLeft, LABOR } from './farmWork';
import { putUpMeat } from './preserving';

export type Fish = 'bluegill' | 'bass' | 'catfish';
export const FISHES: readonly Fish[] = ['bluegill', 'bass', 'catfish'];
export const POND_ACRES = 0.25;
/** Pounds a quarter-acre pond carries (unfed), growth a year, fillet share, kcal a lb of fillet, days stocked before they're fit to take. */
export const FISH: Record<Fish, { k: number; r: number; fillet: number; kcalLb: number; ready: number; stock: number }> = {
  bluegill: { k: 50, r: 2.5, fillet: 0.35, kcalLb: 400, ready: 365, stock: 125 * 0.02 },
  bass: { k: 15, r: 1.5, fillet: 0.4, kcalLb: 440, ready: 540, stock: 25 * 0.05 },
  catfish: { k: 20, r: 2.5, fillet: 0.45, kcalLb: 470, ready: 365, stock: 25 * 0.05 },
};
/** Fed catfish: what the pond carries, pellets a lb of gain. */
export const FED_CATFISH_K = 120, FEED_PER_LB = 1.6;
/** The yearly take: share of the maximum sustainable yield (bluegill, bass), share of the catfish. */
export const MSY_SHARE = 0.7, CATFISH_TAKE = 1 / 3;
/** A catfish fingerling's most (lb) once grown: the stocked count caps their pounds (they don't breed). */
const CATFISH_MAX_LB = 2.5;

export interface Pond {
  /** Pounds of each fish in it. */
  lb: Record<Fish, number>;
  /** Catfish in it (they don't breed here). */
  catfish: number;
  /** Day stocked (null: never). */
  stocked: number | null;
  /** This year's take (lb), and the year. */
  year: number;
  taken: Record<Fish, number>;
  /** Feed the catfish pellets; fish it hard (no limit). */
  feed: boolean;
  hard: boolean;
  /** One-time blows applied. */
  done: string[];
}
export const newPond = (): Pond => ({ lb: { bluegill: 0, bass: 0, catfish: 0 }, catfish: 0, stocked: null, year: 0, taken: { bluegill: 0, bass: 0, catfish: 0 }, feed: false, hard: false, done: [] });

export const hasPond = (s: GameState) => s.structures.some(st => st.kind === 'pond' && isFinished(st));
export { pondHolds } from './site';

/** What the pond carries of a fish now. */
export function capacity(p: Pond, f: Fish): number {
  if (f !== 'catfish') return FISH[f].k;
  return Math.min(p.feed ? FED_CATFISH_K : FISH.catfish.k, p.catfish * CATFISH_MAX_LB);
}
/** The year's sustainable take (lb, whole fish). */
export function yearLimit(p: Pond, f: Fish): number {
  if (f === 'catfish') return capacity(p, f) * CATFISH_TAKE * (p.feed ? 1.5 : 1);
  return FISH[f].r * FISH[f].k / 4 * MSY_SHARE;
}

/** Stock the pond (uses one stocking of fingerlings). Returns a line for the log, or why not. */
export function stockPond(s: GameState): string {
  if (!hasPond(s)) return 'There is no pond yet.';
  if ((s.stock.fingerlings ?? 0) < 1) return 'No fingerlings: order a stocking from the shop.';
  const p = (s.farm.pond ??= newPond());
  s.stock.fingerlings -= 1;
  for (const f of FISHES) p.lb[f] += FISH[f].stock;
  p.catfish += 25;
  p.stocked ??= Math.floor(s.clock.t);
  return 'Stocked the pond: 125 bluegill, 25 bass and 25 catfish fingerlings. Give them a year.';
}

/** Once a day (farm.ts): growth, the blows, the day's fishing. Returns kcal of fish brought in. */
export function pondDay(s: GameState, freezer: boolean): number {
  if (!hasPond(s)) return 0;
  const p = (s.farm.pond ??= newPond());
  // fingerlings that arrived with the pond finished stock it themselves
  if (p.stocked == null && (s.stock.fingerlings ?? 0) >= 1) stockPond(s);
  if (p.stocked == null) return 0;
  const day = Math.floor(s.clock.t + 0.25), { doy, year } = calendarOf(s.clock);
  if (p.year !== year) { p.year = year; p.taken = { bluegill: 0, bass: 0, catfish: 0 }; }
  const d = s.disaster, after = !!d.kind && s.clock.t >= d.hitAt;
  if (after && d.kind === 'drought' && !s.site.creek && !s.site.spring && !p.done.includes('drought')) { p.done.push('drought'); for (const f of FISHES) p.lb[f] *= 0.5; p.catfish = Math.floor(p.catfish * 0.5); }
  // growth: logistic toward what the pond carries, mostly in the warm months
  const [f0, f1] = REGIONS[s.site.region].frost, warm = doy >= f0 && doy <= f1;
  const season = warm ? 1.6 : 0.2;          // ≈ the year's growth packed into the frost-free months
  for (const f of FISHES) {
    let K = capacity(p, f);
    // fed catfish grow on the pellets (≈ 1.6 lb a lb of gain); out of pellets they grow as the pond feeds them
    if (f === 'catfish' && p.feed && warm) {
      const g = FISH.catfish.r * season / 365 * p.lb[f] * (1 - p.lb[f] / K), bags = Math.max(0, g) * FEED_PER_LB / 50;
      if ((s.stock.feed ?? 0) >= bags) s.stock.feed -= bags; else K = Math.min(K, FISH.catfish.k);
    }
    if (K <= 0) { p.lb[f] *= 0.999; continue; }
    p.lb[f] = Math.max(0, p.lb[f] + FISH[f].r * season / 365 * p.lb[f] * (1 - p.lb[f] / K));
  }
  // fishing: gear, a couple of hours, the fish old enough, under the year's limit (or fished hard)
  if ((s.stock.fishing_gear ?? 0) < 1 || hoursLeft(s) < LABOR.fishDay * 0.5) return 0;
  const age = day - p.stocked, ice = !warm && (doy < f0 - 30 || doy > f1 + 30);
  const r = mulberry32(s.seed * 6007 + day * 13 + 1);
  if (r() > (ice ? 0.15 : 0.45)) return 0;            // most days nobody goes down to the pond
  let kcal = 0, lbTaken = 0;
  for (const f of FISHES) {
    if (age < FISH[f].ready) continue;
    const left = p.hard ? Infinity : yearLimit(p, f) - p.taken[f];
    const catchLb = Math.min(left, p.lb[f] * (p.hard ? 0.02 : 0.01) * (ice ? 0.35 : 1) * (0.5 + r()));
    if (!(catchLb > 0.05)) continue;
    p.lb[f] -= catchLb; p.taken[f] += catchLb; lbTaken += catchLb;
    if (f === 'catfish') p.catfish = Math.max(0, p.catfish - catchLb / CATFISH_MAX_LB * 0.8);
    kcal += catchLb * FISH[f].fillet * FISH[f].kcalLb;
  }
  if (lbTaken <= 0) return 0;
  book(s, 'fishing', LABOR.fishDay);
  if (day <= s.wild.hotUntil) for (const ps of s.personState) if (ps.needs.died == null) ps.needs.dose += 0.0005 * kcal / 1000;
  putUpMeat(s, kcal, 'fish', freezer);
  return kcal;
}
