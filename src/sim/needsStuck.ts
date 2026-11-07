/**
 * Needs that escalate like a stuck project (QA run 6: a family went hungry, twelve people shared four beds and Wren was out
 * of medicine for months, with $632k in the bank and only quiet cards). Food, beds and medicine become "stuck" the same way a
 * waiting project does: the day it was first seen is kept in `GameState.stalls` (the same table; no new saved field), after
 * three days the card says "for N days", and from then on it is red and at the top. Pure.
 */
import type { GameState } from './state';
import { daysOfFood } from './needs';
import { housingShortfall } from './housing';
import { rxStatus } from './body';

export type NeedKey = 'need:food' | 'need:beds' | 'need:meds';
export const NEED_KEYS: readonly NeedKey[] = ['need:food', 'need:beds', 'need:meds'];

/** Food gone, someone without a bed (after the hit), someone out of their pills. */
export function activeNeeds(s: GameState): NeedKey[] {
  const out: NeedKey[] = [];
  const collapse = !!s.disaster.kind && s.clock.t >= s.disaster.hitAt;
  if (collapse && s.people.length && daysOfFood(s) < 3) out.push('need:food');
  if (collapse && housingShortfall(s).outside > 0) out.push('need:beds');
  if (rxStatus(s).some(x => x.days <= 0)) out.push('need:meds');
  return out;
}

/** Whole days a need has been going on (0 when it is not, or was only just noticed). */
export function needDays(s: GameState, key: NeedKey): number {
  const m = s.stalls?.[key];
  return m ? Math.max(0, Math.floor(s.clock.t - m.since)) : 0;
}
