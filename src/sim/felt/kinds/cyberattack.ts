import type { DecisionCard, FeltSpec, GoalChain } from '../types';
import { cards, goals } from '../../disasters/cyberattack';
import { toFeltCards, toFeltGoals } from '../../techFelt';
import { kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

import type { KindCardDef } from '../cardLibrary';
const DEFS: KindCardDef[] = [
  { id: 'paper', phase: 'month', title: 'Paper, until the screens come back', fallback: 'ledger',
    text: 'The county ran on screens. The tax office, the co-op and the bank are on paper now, and all the paper is behind.',
    options: [
      { id: 'clerk', label: 'Pay a clerk to run your records and paperwork', hint: 'A tidy ledger and a piece of paper that says you exist.', cost: s => ({ money: r25(400 + N(s) * 30) }), now: [{ k: 'morale', n: 3 }], risk: { p: 0.1, good: 'The records are in order.', bad: 'The clerk misfiled the deed.', lose: [{ k: 'morale', n: -2 }] }, line: 'A clerk ran the paperwork.' },
      { id: 'ledger', label: 'Keep your own ledger, receipts and a notebook of debts', hint: 'Free, tedious and legal in the courthouse.', cost: () => ({ hours: 6 }), now: [{ k: 'morale', n: 1 }], risk: { p: 0.3, good: 'It will stand up.', bad: 'A missing receipt held up a sale.', lose: [{ k: 'money', n: -120 }] }, line: 'You kept your own ledger.' },
      { id: 'together', label: 'Set up a district record-keeping bee with the neighbors', hint: 'A shared book of who owes what.', cost: () => ({ hours: 4 }), off: noNeighbors, now: [{ k: 'standing', n: 6 }, { k: 'humanity', n: 1 }], risk: { p: 0.22, good: 'Everyone is in one book.', bad: 'Two neighbors disputed the totals.', lose: [{ k: 'standing', n: -4 }] }, line: 'The district kept one ledger.' },
    ] },
  { id: 'trust', phase: 'season', title: 'Who do you believe now', fallback: 'two',
    text: 'The mail, the radio and the bank may all be spoofed. A rumor says a "federal" notice is coming. You have no way of checking.',
    options: [
      { id: 'courier', label: 'Pay a courier to carry a letter to the county seat', hint: 'A real answer, slowly.', cost: s => ({ money: r25(250 + N(s) * 25) }), now: [{ k: 'morale', n: 2 }], risk: { p: 0.15, good: 'You got a signed reply.', bad: 'The courier never came back.', lose: [{ k: 'morale', n: -2 }] }, line: 'A courier carried a letter.' },
      { id: 'two', label: 'Believe nothing until two sources agree', hint: 'A slow rule that works.', cost: () => ({ hours: 3 }), now: [{ k: 'humanity', n: 0 }], risk: { p: 0.3, good: 'You dodged a scam.', bad: 'You acted a day late.', lose: [{ k: 'money', n: -100 }] }, line: 'You waited for two sources.' },
      { id: 'meet', label: 'Call a meeting and decide as a district', hint: 'A shared answer, if it holds.', cost: () => ({ hours: 5 }), off: noNeighbors, now: [{ k: 'standing', n: 6 }], risk: { p: 0.25, good: 'One answer for all.', bad: 'The meeting split.', lose: [{ k: 'standing', n: -5 }] }, line: 'The district met.' },
    ] },
];

let c: DecisionCard[] | null = null, g: GoalChain | null = null;
/**
 * Felt layer for cyberattack: the teeth package's decision cards (plus the generic library, so every phase keeps its cards) and its first-week goal
 * chain. Lazy: the teeth module imports the sim, which imports the felt registry (hit moment, marks and radio lines are still to come).
 */
export const felt: FeltSpec = {
  get cards() { return (c ??= [...toFeltCards(cards), ...kindCards('cyberattack', DEFS)]); },
  get goals() { return (g ??= toFeltGoals('cyberattack_first_week', 'The cyberattack: the first week', 'warning', goals)); },
};
