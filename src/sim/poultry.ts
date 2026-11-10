/**
 * The hens' life cycle, light version (docs/DECISIONS.md "Farm & kitchen, part 3"; from the old claude/farm-kitchen WIP). Pure.
 * The egg rate stays main's day-length curve (sim/needs.ts); this adds the flock's age on top and the meat.
 *
 *  Age      each year over one takes 15 % off the laying, down to 55 % at four years.
 *  Hatch    in spring (day 100-120) a coop with a rooster raises six chicks per coop under a broody hen: three
 *           pullets, three cockerels. No rooster, no chicks. A raid on the coop (sim/wildlife.ts) can kill him.
 *  Cockerels go in the pot at 16 weeks (about 2,750 Calories each, put up by the kitchen).
 *  Pullets   lay from five months and replace the old hens culled in October (day 290-300): one old hen per pullet
 *           grown, up to three a coop (1,800 Calories of stewing hen each). That brings the flock's age down.
 */
import { calendarOf, type GameState } from './state';
import { mulberry32 } from './rng';
import { farmOf } from './farm';
import { isFinished } from './construction';
import { putUpMeat } from './kitchen';

export const HEN_PER_COOP = 12, CHICKS_EACH = 3, COCKEREL_DAYS = 112, PULLET_DAYS = 150, MAX_CULL = 3;
export const COCKEREL_KCAL = 2750, HEN_KCAL = 1800, AGE_LOSS = 0.15, AGE_FLOOR = 0.55;

export interface Poultry {
  /** The flock's average age, years. */
  age: number;
  rooster: boolean;
  /** Chicks growing: head and the day they are ready. */
  cockerels: Array<{ n: number; ready: number }>;
  pullets: Array<{ n: number; ready: number }>;
  /** Pullets grown and waiting for the October cull of old hens. */
  grown: number;
  /** Year of the last hatch and the last cull; the wildlife hen-loss time already counted. */
  hatched: number;
  culled: number;
  lossSeen: number;
  /** This year: hatched, to the pot, old hens culled. */
  year: number;
  hatchedN: number;
  potted: number;
  cullN: number;
}
export const newPoultry = (): Poultry => ({ age: 1, rooster: true, cockerels: [], pullets: [], grown: 0, hatched: -1, culled: -1, lossSeen: -1, year: 0, hatchedN: 0, potted: 0, cullN: 0 });
export const poultryOf = (s: GameState): Poultry => (farmOf(s).poultry ??= newPoultry());
export const coopCount = (s: GameState): number => s.structures.filter(st => st.kind === 'chicken_coop' && isFinished(st)).length;
/** The laying multiplier for the flock's age (1 for a young flock). */
export const flockFactor = (s: GameState): number => coopCount(s) === 0 ? 1 : Math.max(AGE_FLOOR, 1 - AGE_LOSS * Math.max(0, poultryOf(s).age - 1));

export function poultryDay(s: GameState): string[] {
  const coops = coopCount(s), out: string[] = [];
  if (coops === 0) return out;
  const p = poultryOf(s), { doy, year } = calendarOf(s.clock), d = Math.floor(s.clock.t + 0.25);
  if (p.year !== year) { p.year = year; p.hatchedN = 0; p.potted = 0; p.cullN = 0; }
  p.age = Math.min(6, p.age + 1 / 365);
  const loss = s.wildlife?.henLossUntil ?? -1;
  if (loss > 0 && loss !== p.lossSeen) { p.lossSeen = loss; if (p.rooster && mulberry32(s.seed * 631 + d)() < 0.5) { p.rooster = false; out.push('The rooster did not survive the raid on the coop. No rooster, no chicks next spring.'); } }
  if (doy >= 100 && doy < 120 && p.hatched !== year) {
    p.hatched = year;
    if (p.rooster) {
      const n = CHICKS_EACH * coops;
      p.cockerels.push({ n, ready: d + COCKEREL_DAYS }); p.pullets.push({ n, ready: d + PULLET_DAYS }); p.hatchedN = 2 * n;
      out.push(`A broody hen hatched ${2 * n} chicks: ${n} pullets and ${n} cockerels.`);
    } else out.push('A broody hen sat the nest but there is no rooster: nothing hatched.');
  }
  const cock = p.cockerels.filter(c => d >= c.ready), pul = p.pullets.filter(c => d >= c.ready);
  if (cock.length) {
    const n = cock.reduce((a, c) => a + c.n, 0); p.cockerels = p.cockerels.filter(c => d < c.ready); p.potted += n;
    putUpMeat(s, n * COCKEREL_KCAL); out.push(`${n} cockerels went in the pot.`);
  }
  if (pul.length) { p.grown += pul.reduce((a, c) => a + c.n, 0); p.pullets = p.pullets.filter(c => d < c.ready); }
  if (doy >= 290 && doy < 300 && p.culled !== year) {
    p.culled = year;
    const cull = Math.min(Math.floor(p.grown), MAX_CULL * coops);
    if (cull > 0) {
      const share = cull / (HEN_PER_COOP * coops);
      p.age = Math.max(0.5, p.age - share * (p.age - 0.5));
      p.grown -= cull; p.cullN = cull;
      putUpMeat(s, cull * HEN_KCAL, { pork: false });
      out.push(`October: ${cull} old hens culled for the stewpot, replaced by this year's pullets.`);
    }
    p.grown = 0; // pullets past the cull limit simply join the flock
  }
  return out;
}
