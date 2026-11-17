/**
 * The generic radio line set, built per kind (FL3). The registry fills each kind's `FeltSpec.radio` from `radioFor(kind)` unless the kind's
 * own content package wrote lines. Voices: official notices (composed, kind named), ham and trade chatter (operators, plain), and the
 * civilians' fragments (rumors.ts). Each line carries a claim, so true lines are eligible only while the claim holds and false lines only
 * while it does not (feltRadio.ts); texts carry real numbers (days, counts, a price level, a service).
 */
import { prices } from '../economy';
import { canOrder } from '../disaster';
import { awayCount, recoveredTrack, worstTrack, type Claim } from './claims';
import { AFTER_WEEK, THEME, dayN, days, genLine, trackWord, type GenLine } from './lineKit';
import { kindLines } from './radioKinds';
import { rumorLines } from './rumors';
import type { FeltKind, RadioLine } from './types';

/** A price level rounded down to a tenth, so "2.3 times normal" is true whenever the claim `price_ge 2.3` is checked. */
const level10 = (x: number): number => Math.floor(x * 10 + 1e-9) / 10;

export function radioFor(kind: FeltKind): RadioLine[] {
  const T = THEME[kind];
  const out = (s: Parameters<typeof worstTrack>[0]) => worstTrack(s) ?? 'grid';
  const up = (s: Parameters<typeof worstTrack>[0]) => recoveredTrack(s) ?? 'grid';
  const priceClaim = (s: Parameters<typeof prices>[0]): Claim => ({ id: 'price_ge', n: level10(prices(s)) });
  const lines: GenLine[] = [
    // official notices
    genLine(kind, { id: 'notice_out', channel: 'official', truth: 'true', tone: 1, when: s => worstTrack(s) !== null, claim: s => ({ id: 'svc_out', a: out(s) }),
      text: s => `Emergency management on ${T.noun}: still out across the county, day ${dayN(s)}: ${trackWord(out(s))}. Conserve what you have.` }),
    genLine(kind, { id: 'notice_back', channel: 'official', truth: 'true', tone: 0, phases: AFTER_WEEK, when: s => recoveredTrack(s) !== null, claim: s => ({ id: 'svc_up', a: up(s) }),
      text: s => `Emergency management: restored in most of the county, day ${dayN(s)} of ${T.noun}: ${trackWord(up(s))}.` }),
    genLine(kind, { id: 'notice_alone', channel: 'official', truth: 'true', tone: 2, phases: AFTER_WEEK, claim: () => ({ id: 'relief_none' }),
      text: s => `The state has no relief plan for this county, ${days(dayN(s))} after ${T.noun}. Plan on your own supplies.` }),
    genLine(kind, { id: 'notice_cities', channel: 'official', truth: 'true', tone: 1, phases: AFTER_WEEK, claim: () => ({ id: 'relief_partial' }),
      text: s => `The state is rebuilding cities and main roads first after ${T.noun}. Rural counties wait. Day ${dayN(s)}.` }),
    genLine(kind, { id: 'notice_trucks', channel: 'official', truth: 'false', tone: 0, claim: () => ({ id: 'relief_here' }),
      text: () => `County: relief trucks arrive at the high school Tuesday for ${T.noun}. Bring ID and a container.` }),
    // ham chatter
    genLine(kind, { id: 'ham_households', channel: 'ham', truth: 'true', tone: 1, when: s => awayCount(s) >= 1, claim: s => ({ id: 'neighbors_away', n: awayCount(s) }),
      text: s => `Ham net: ${awayCount(s)} ${awayCount(s) === 1 ? 'household' : 'households'} near you ${awayCount(s) === 1 ? 'has' : 'have'} left or gone dark since ${T.noun}.` }),
    genLine(kind, { id: 'ham_law', channel: 'ham', truth: 'true', tone: 2, when: s => s.disaster.tracks.law < 0.4, claim: () => ({ id: 'law_low' }),
      text: s => `Ham net: nobody is answering the sheriff's line, day ${dayN(s)} of ${T.noun}. Keep a watch at night.` }),
    genLine(kind, { id: 'ham_back_soon', channel: 'ham', truth: 'false', tone: 0, when: s => worstTrack(s) !== null, claim: s => ({ id: 'svc_up', a: out(s) }),
      text: s => `A ham in the next state says it's back in the city after ${T.noun}: ${trackWord(out(s))}. Reaches you by Friday.` }),
    // traders
    genLine(kind, { id: 'trade_price', channel: 'trade', truth: 'true', tone: 1, when: s => prices(s) >= 1.3, claim: priceClaim,
      text: s => `Feed store on the net: prices are ${level10(prices(s)).toFixed(1)} times normal today, ${T.noun} and all.` }),
    genLine(kind, { id: 'trade_closed', channel: 'trade', truth: 'true', tone: 2, when: s => !canOrder(s.disaster, s.clock.t), claim: () => ({ id: 'ordering', a: 'closed' }),
      text: s => `Trader: with ${T.noun}, nothing can be ordered from outside, day ${dayN(s)}. It's barter or what you've got.` }),
    genLine(kind, { id: 'trade_banks', channel: 'trade', truth: 'false', tone: 0, when: s => s.disaster.tracks.banks < 0.25, claim: () => ({ id: 'svc_up', a: 'banks' }),
      text: () => `A trader swears the banks reopen Monday, ${T.noun} or not. Cards honored, he says. Cash first, just in case.` }),
  ];
  return [...lines, ...kindLines(kind), ...rumorLines(kind)];
}

