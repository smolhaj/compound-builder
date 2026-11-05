/**
 * How big the place has become, and who the family chose to be (GDS §5.3
 * "homestead -> compound -> hamlet -> walled village -> small town" and §5.6
 * play styles Hermit / Clan / Ark / Haven). Both are labels derived from
 * state the sim already keeps, so nothing is saved. The thresholds are a
 * design choice the GDS leaves open (docs/GDS_AUDIT.md). Pure (tested).
 */
import { isHome } from './blueprints';
import { isFinished } from './construction';
import { exposure } from './opsec';
import { ringCount } from './rings';
import type { GameState } from './state';

export type Stage = 'homestead' | 'compound' | 'hamlet' | 'walled_village' | 'small_town';
export const STAGE_NAME: Record<Stage, string> = { homestead: 'Homestead', compound: 'Compound', hamlet: 'Hamlet', walled_village: 'Walled village', small_town: 'Small town' };
export const STAGE_BLURB: Record<Stage, string> = {
  homestead: 'One family on its own land.',
  compound: 'A household with room for a few more; still easy to miss.',
  hamlet: 'Enough people that decisions are not only yours, and the smoke can be seen.',
  walled_village: 'A community behind a wall: strong, and a target.',
  small_town: 'Districts and a street of houses: a power, and the first thing a warlord looks for.',
};

export interface SizeFacts { heads: number; homes: number; rings: number }

/** The stage for a head count: size sets it, and a village needs a closed wall round it. */
export function stageOf(f: SizeFacts): Stage {
  if (f.heads >= 80 && f.homes >= 12) return 'small_town';
  if (f.heads >= 30 && f.rings >= 1) return 'walled_village';
  if (f.heads >= 15) return 'hamlet';
  if (f.heads >= 8) return 'compound';
  return 'homestead';
}

export function sizeFacts(s: GameState): SizeFacts {
  const heads = s.personState.filter(ps => ps.needs.died == null && !ps.needs.left).length;
  const homes = s.structures.filter(st => isHome(st.kind) && isFinished(st)).length;
  return { heads, homes, rings: ringCount(s) };
}
export const stageNow = (s: GameState): Stage => stageOf(sizeFacts(s));

export type PlayStyle = 'hermit' | 'clan' | 'ark' | 'haven';
export const STYLE_NAME: Record<PlayStyle, string> = { hermit: 'Hermit', clan: 'Clan', ark: 'Ark', haven: 'Haven' };
export const STYLE_BLURB: Record<PlayStyle, string> = {
  hermit: 'One family, hidden, self-sufficient.',
  clan: 'Relatives and neighbors only: tight trust, limited skills.',
  ark: 'The most useful specialists taken in, the rest turned away.',
  haven: 'Everyone taken in; the place grew into a town.',
};

export interface StyleFacts { tookIn: number; turnedAway: number; strangers: number; heads: number; exposure: number }

/** Which of the four the choices add up to, or null when they do not (a mixed household). */
export function styleOf(f: StyleFacts): PlayStyle | null {
  if (f.tookIn >= 8 && f.turnedAway <= f.tookIn) return 'haven';
  if (f.turnedAway >= 3 && f.turnedAway > f.tookIn && f.tookIn >= 1) return 'ark';
  if (f.tookIn <= 1 && f.heads <= 8 && f.exposure <= 45) return 'hermit';
  if (f.tookIn >= 2 && f.strangers === 0) return 'clan';
  return null;
}

export function styleFacts(s: GameState): StyleFacts {
  const joined = s.people.filter((p, i) => p.origin && s.personState[i]?.needs.died == null);
  return {
    tookIn: s.gate.tookIn, turnedAway: s.gate.turnedAway,
    strangers: joined.filter(p => p.origin?.kind === 'stranger').length,
    heads: s.personState.filter(ps => ps.needs.died == null && !ps.needs.left).length,
    exposure: exposure(s),
  };
}
export const styleNow = (s: GameState): PlayStyle | null => styleOf(styleFacts(s));

/** The report card line: what kind of place this turned out to be. */
export function placeLine(s: GameState, wiped = false): string {
  const st = stageNow(s), pl = styleNow(s);
  // after a wipe nobody is left to have "grown into a town": only how the place was run
  if (wiped) return pl ? `They had run the place as a ${STYLE_NAME[pl]}.` : 'The place never grew beyond one household.';
  return `${STAGE_NAME[st]}${pl ? `, run as a ${STYLE_NAME[pl]}: ${STYLE_BLURB[pl].toLowerCase()}` : '.'}`;
}
