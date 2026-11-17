import type { DecisionCard, FeltSpec, GoalChain } from '../types';
import { cards, goals } from '../../disasters/financial';
import { toFeltCards, toFeltGoals } from '../../techFelt';
import { kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

import type { KindCardDef } from '../cardLibrary';
const DEFS: KindCardDef[] = [
  { id: 'scrip', phase: 'month', title: 'What counts as money', fallback: 'barter',
    text: 'The dollar buys less every week. The store takes cash, silver, ammunition or promises, depending on who is at the counter.',
    options: [
      { id: 'silver', label: 'Spend cash on silver coins and small tools', hint: 'A store of value that keeps in a jar.', cost: s => ({ money: r25(600 + N(s) * 60) }), now: [{ k: 'stock', id: 'hardware', n: 2 }, { k: 'morale', n: 2 }], risk: { p: 0.15, good: 'It kept its worth.', bad: 'The dealer shorted the weight.', lose: [{ k: 'morale', n: -2 }] }, line: 'You turned cash into silver and tools.' },
      { id: 'barter', label: 'Barter labor and eggs for what you need', hint: 'A lot of hours and a lot of walking.', cost: () => ({ hours: 9 }), now: s => [{ k: 'stock', id: 'staples', n: N(s) * 2 }], risk: { p: 0.28, good: 'A fair trade.', bad: 'They shorted you.', lose: [{ k: 'standing', n: -3 }] }, line: 'You bartered labor and eggs.' },
      { id: 'scrip', label: 'Start a district scrip with the neighbors', hint: 'A paper that only the district honors. It works while it works.', cost: () => ({ hours: 4 }), off: noNeighbors, now: [{ k: 'standing', n: 7 }, { k: 'humanity', n: 1 }], risk: { p: 0.3, good: 'A neat little economy.', bad: 'Someone printed too much.', lose: [{ k: 'standing', n: -6 }] }, line: 'The district started scrip.' },
    ] },
  { id: 'debt', phase: 'season', title: 'The bank wants its note', fallback: 'talk',
    text: 'The bank is asking about the loan. The man at the desk looks tired. It is not a threat, but it is on paper.',
    options: [
      { id: 'pay', label: 'Pay down the note in cash', hint: 'Frees the farm and spends your cash.', cost: s => ({ money: r25(1500 + N(s) * 100) }), now: [{ k: 'morale', n: 5 }, { k: 'raidDelay', days: 4 }], line: 'You paid down the note.' },
      { id: 'talk', label: 'Go in person and ask for terms', hint: 'A day, a handshake and a risk of a cold answer.', cost: () => ({ hours: 6 }), now: [{ k: 'morale', n: -1 }], risk: { p: 0.35, good: 'A new schedule, written down.', bad: 'He said no.', lose: [{ k: 'morale', n: -4 }, { k: 'money', n: -200 }] }, line: 'You asked for terms.' },
      { id: 'default', label: 'Let it ride and stop answering the phone', hint: 'No cost today. The farm is collateral.', now: [{ k: 'morale', n: -3 }], risk: { p: 0.5, good: 'Nobody came.', bad: 'A notice was nailed to the gate.', lose: [{ k: 'morale', n: -5 }, { k: 'standing', n: -5 }] }, line: 'You let the note ride.' },
    ] },
];

let c: DecisionCard[] | null = null, g: GoalChain | null = null;
/**
 * Felt layer for financial: the teeth package's decision cards (plus the generic library, so every phase keeps its cards) and its first-week goal
 * chain. Lazy: the teeth module imports the sim, which imports the felt registry (hit moment, marks and radio lines are still to come).
 */
export const felt: FeltSpec = {
  get cards() { return (c ??= [...toFeltCards(cards), ...kindCards('financial', DEFS)]); },
  get goals() { return (g ??= toFeltGoals('financial_first_week', 'The money collapse: the first week', 'warning', goals)); },
};
