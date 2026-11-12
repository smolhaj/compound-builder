/**
 * What to do while the county reviews a permit (QA early playtest: the cabin and cottage wait 21 days, the well, solar and cellar 7;
 * families sat in tents for a month with morale sliding 70 to 57 and nothing told them how to use the time). Advice only: the permit
 * rules, fees and review days are untouched. Pure (tested); the Next-steps card in sim/guidance.ts reads it.
 */
import { isFinished, canGoOn } from './construction';
import { needsPermit } from './paperwork';
import { housingShortfall, TENT_PRICE, TENT_SEATS } from './housing';
import { KIT } from '../game/buildkit/kit';
import { orderCost, prices } from './economy';
import type { GameState, OrderLine } from './state';

/** Permit-free pieces worth staking first, in the order the card names them (a privy and a garden need no permit at all). */
const FREE_STARTERS: ReadonlyArray<{ kind: string; label: string }> = [{ kind: 'outhouse', label: 'a privy' }, { kind: 'garden', label: 'a garden' }];

export interface PermitWait {
  /** Days left on the longest review. */
  days: number;
  /** What is under review ("cottage", "well"). */
  waiting: string[];
  /** Staked pieces the family can work on today without a permit. */
  working: string[];
  /** Permit-free pieces not staked yet that would use the time. */
  stakeFree: string[];
  /** Materials for the plans not yet bought (so they are on the place when the permit clears). */
  lines: OrderLine[];
  linesUsd: number;
  /** Tents for the people with no bed (0: none). */
  tents: number;
  tentUsd: number;
  /** The structure with the longest review (to select). */
  longestId: string;
}

const nameOf = (kind: string) => KIT[kind]?.name ?? kind.replace(/_/g, ' ');

/** Null when no permit is under review with a couple of days still to go. `need` is the plans' order (guidance.plansNeedLines). */
export function permitWait(s: GameState, need: readonly OrderLine[]): PermitWait | null {
  const under = s.structures.filter(st => !st.unplaced && !st.pre && st.permit === 'review' && (st.permitAt ?? 0) - s.clock.t >= 2);
  if (!under.length) return null;
  const longest = under.reduce((a, b) => ((b.permitAt ?? 0) > (a.permitAt ?? 0) ? b : a));
  const working = s.structures.filter(st => !st.unplaced && !isFinished(st) && st.permit !== 'review' && canGoOn(s, st)).map(st => nameOf(st.kind));
  const stakeFree = FREE_STARTERS.filter(f => !needsPermit(f.kind) && KIT[f.kind] && !s.structures.some(st => st.kind === f.kind && !st.unplaced)).map(f => f.label);
  const outside = housingShortfall(s).outside, tents = outside > 0 ? Math.ceil(outside / TENT_SEATS) : 0;
  const lines = need.map(l => ({ ...l }));
  return {
    days: Math.ceil((longest.permitAt ?? 0) - s.clock.t), waiting: [...new Set(under.map(st => nameOf(st.kind)))], working: [...new Set(working)], stakeFree, lines,
    linesUsd: lines.length ? orderCost(lines, prices(s)) : 0, tents, tentUsd: tents * TENT_PRICE, longestId: longest.id,
  };
}

/** The card's text: what is waiting, then up to three things to do with the time. */
export function permitWaitText(w: PermitWait): { title: string; why: string } {
  const list = (a: string[]) => (a.length <= 2 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  const todo: string[] = [];
  if (w.working.length) todo.push(`the family can work on ${list(w.working)} today, no permit needed`);
  else if (w.stakeFree.length) todo.push(`stake ${list(w.stakeFree)} now: neither needs a permit, so work starts today`);
  if (w.lines.length) todo.push('order the materials now so they are on the place the day the permit clears (a delivery takes a few days)');
  if (w.tents > 0) todo.push(`put up tents so nobody sleeps outside meanwhile (${w.tents} ${w.tents === 1 ? 'tent' : 'tents'}, $${w.tentUsd.toLocaleString('en-US')}); a bed and a warm night hold morale up`);
  return {
    title: `The county is reviewing the ${list(w.waiting)}: about ${w.days} ${w.days === 1 ? 'day' : 'days'} to go`,
    why: `Nothing can be built on ${w.waiting.length === 1 ? 'it' : 'them'} until the permit clears, so use the time: ${todo.length ? todo.join('; ') : 'the rest of the place can be tended meanwhile'}.`,
  };
}
