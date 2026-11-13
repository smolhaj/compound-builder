/**
 * The ONE home recommendation (UX playtest: one screen gave three different houses, "Stake a cabin", Cottage and "build a log
 * house"). Whoever needs to say "build this home" asks here: the first-hour goal card, the Build list's highlight and the
 * Housing panel's "Fix:" line. The pick is the cheapest home that closes the bed gap (people minus the beds in every home on
 * the place, finished or going up), else the biggest one available, with the crew's price where a crew is the easy way.
 * Pure (tested); no new mechanic.
 */
import { BLUEPRINTS, HOME_BEDS, isHome, totalBill, totalHours } from './blueprints';
import { MATERIALS, type MaterialId } from './materials';
import { orderCost, prices } from './economy';
import { CREW_RATE, CREW_SIZE } from './crews';
import { CREW_NUDGE_SHARE, CREW_NUDGE_SLACK } from './crewNudge';
import { planProblem } from './construction';
import type { GameState } from './state';
import { pluralize } from './words';

/** Homes the advice may pick, in the order they are listed (a guest house and Mom's house only once the family has a home). */
const FIRST_HOMES = ['cottage', 'timber_cabin', 'log_house'] as const;
const MORE_HOMES = ['guest_house', 'cottage', 'moms_house', 'timber_cabin', 'log_house'] as const;
const NAME: Record<string, string> = { guest_house: 'guest house', cottage: 'cottage', moms_house: 'Mom’s house', timber_cabin: 'timber cabin', log_house: 'log house' };

export interface HomeAdvice {
  kind: string;
  /** "cottage", "timber cabin", "log house". */
  name: string;
  /** The kit's buyable materials at today's prices. */
  usd: number;
  /** Beds the home adds. */
  beds: number;
  /** People with no bed under a roof (counting homes already going up). */
  gap: number;
  /** Beds still short after this home (0: it closes the gap). */
  stillShort: number;
  /** A crew of four finishing it (null: no crew can be had, or the cash does not cover one). */
  crewUsd: number | null;
  crewWeeks: number | null;
  /** Why the home cannot be staked on this land (the site), or null. The permit fee is the stake button's own check. */
  off: string | null;
}

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

/** A kit piece's buyable bill at today's prices (the figure every home price on screen uses). */
export function kitUsd(s: GameState, kind: string, factor = prices(s)): number {
  const bp = BLUEPRINTS[kind];
  if (!bp) return 0;
  const lines = (Object.entries(totalBill(bp)) as Array<[MaterialId, number]>).filter(([m]) => MATERIALS[m].price !== null).map(([material, qty]) => ({ material, qty }));
  return orderCost(lines, factor);
}

/** Beds under every home on the place that is not a pending improvement: finished or still going up. */
export function plannedBeds(s: GameState): number {
  return s.structures.reduce((a, st) => a + (!st.unplaced && isHome(st.kind) ? HOME_BEDS[st.kind] ?? 0 : 0), 0);
}

/**
 * The home to build next, or null when the beds on the place (counting homes going up) already cover everyone.
 * `cost` prices a kit piece; the default is today's market, the Housing panel passes its own so its tests stay in dollars it chose.
 */
export function homeAdvice(s: GameState, cost: (kind: string) => number = k => kitUsd(s, k)): HomeAdvice | null {
  const people = Math.max(1, s.people.length), gap = people - plannedBeds(s);
  if (gap <= 0) return null;
  const hasHome = s.structures.some(st => !st.unplaced && isHome(st.kind));
  const pool = (hasHome ? MORE_HOMES : FIRST_HOMES).filter(k => BLUEPRINTS[k]);
  const open = pool.filter(k => !planProblem(s, k)), list = open.length ? open : pool;
  const rows = list.map(k => ({ k, beds: HOME_BEDS[k] ?? 0, usd: cost(k) }));
  const enough = rows.filter(r => r.beds >= gap).sort((a, b) => a.usd - b.usd)[0];
  const pick = enough ?? [...rows].sort((a, b) => b.beds - a.beds || a.usd - b.usd)[0];
  if (!pick) return null;
  // the crew's bill for the whole kit (the same arithmetic as crews.crewQuote on a fresh stake)
  const hours = totalHours(BLUEPRINTS[pick.k]), crewUsd = Math.round(hours * CREW_RATE / 100) * 100, crewWeeks = Math.max(1, Math.ceil(hours / (CREW_SIZE * 9 * 5)));
  const t = s.disaster.tracks;
  const easy = s.weekend?.mode !== 'split' && t.banks >= 0.5 && t.law >= 0.5 && t.fuel >= 0.3 && s.money >= pick.usd + crewUsd * CREW_NUDGE_SHARE + CREW_NUDGE_SLACK;
  return { kind: pick.k, name: NAME[pick.k] ?? pick.k.replace(/_/g, ' '), usd: pick.usd, beds: pick.beds, gap, stillShort: Math.max(0, gap - pick.beds), crewUsd: easy ? crewUsd : null, crewWeeks: easy ? crewWeeks : null, off: planProblem(s, pick.k) };
}

const article = (name: string) => (name.startsWith('Mom') ? '' : /^[aeiou]/i.test(name) ? 'an ' : 'a ');

/** "a timber cabin (~$47,075, 4 beds; a crew of four builds it in about 8 weeks for ~$84,000 more)": the one phrase every screen uses. */
export function homeAdviceText(a: HomeAdvice): string {
  const crew = a.crewUsd !== null ? `; a crew of four builds it in about ${pluralize(a.crewWeeks!, 'week')} for ~${usd(a.crewUsd)} more` : '';
  return `${article(a.name)}${a.name} (~${usd(a.usd)}, ${pluralize(a.beds, 'bed')}${crew})`;
}

/** The short reason line: "1 of 5 has no bed". */
export const gapLine = (a: HomeAdvice, people: number): string => `${a.gap} of ${people} ${a.gap === 1 ? 'has' : 'have'} no bed`;
