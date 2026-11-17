import type { DecisionCard, FeltSpec, GoalChain } from '../types';
import { cards, goals } from '../../disasters/emp';
import { toFeltCards, toFeltGoals } from '../../techFelt';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

import type { KindCardDef } from '../cardLibrary';
const DEFS: KindCardDef[] = [
  { id: 'what_runs', phase: 'hit', title: 'What still runs', fallback: 'count',
    text: 'Nothing with a chip works. The pump, the truck, the radio, the clock are dead. The old tractor in the barn has a magneto and no electronics.',
    options: [
      { id: 'mechanic', label: 'Pay a mechanic to rewire the old truck and the pump', hint: 'He knows tubes and coils. He charges for both.', cost: s => ({ money: r25(900 + N(s) * 60) }), now: [{ k: 'stock', id: 'vehicle_parts', n: 2 }, { k: 'morale', n: 3 }], risk: { p: 0.12, good: 'The truck coughs and starts.', bad: 'He ran out of parts.', lose: [{ k: 'morale', n: -2 }] }, line: 'A mechanic got the old truck running.' },
      { id: 'count', label: 'Count what still works and tag it', hint: 'A day of walking the place. A plan.', cost: () => ({ hours: 5 }), now: [{ k: 'morale', n: 2 }], risk: { p: 0.25, good: 'You found a shortwave and a lantern.', bad: 'Most of it is dead.', lose: [{ k: 'morale', n: -3 }] }, line: 'You counted what runs.' },
      { id: 'barter', label: 'Walk to the grange and trade for parts', hint: 'Five miles, a long day.', cost: () => ({ hours: 9 }), off: noNeighbors, now: [{ k: 'standing', n: 4 }, { k: 'stock', id: 'vehicle_parts', n: 1 }], risk: { p: 0.3, good: 'A part and some news.', bad: 'A cold day on a bad road.', lose: [hurtOne('a twisted ankle', 12)] }, line: 'You walked to the grange.' },
    ] },
  { id: 'clock', phase: 'month', title: 'Which hour is it', fallback: 'bell',
    text: 'Phones, radios and clocks have stopped. Without a standard, the district drifts. People are late, and then angry.',
    options: [
      { id: 'tower', label: 'Pay to rebuild a mechanical clock on the church tower', hint: 'A public clock with a bell. The district uses it.', cost: s => ({ money: r25(500 + N(s) * 30) }), now: [{ k: 'standing', n: 7 }, { k: 'humanity', n: 2 }], risk: { p: 0.12, good: 'The bell rings on the hour.', bad: 'The clock ran fast.', lose: [{ k: 'morale', n: -1 }] }, line: 'You helped rebuild the clock.' },
      { id: 'bell', label: 'Ring a bell at dawn and dusk', hint: 'Simple and a little silly.', cost: () => ({ hours: 1 }), now: [{ k: 'morale', n: 1 }], risk: { p: 0.2, good: 'The neighbors started to match.', bad: 'The neighbor said to quit it.', lose: [{ k: 'standing', n: -2 }] }, line: 'You rang a bell.' },
      { id: 'ignore', label: 'Do nothing', hint: 'Cost nothing. The district drifts.', risk: { p: 0.4, good: 'It all worked out.', bad: 'Meetings failed for confusion.', lose: [{ k: 'standing', n: -3 }] }, line: 'You ignored the clock.' },
    ] },
  { id: 'chips', phase: 'season', title: 'The shelf of dead electronics', fallback: 'strip',
    text: 'The shed is full of dead chargers, radios and gauges. Some parts are still good if you know which.',
    options: [
      { id: 'tech', label: 'Pay a repairman to rebuild a few radios from the dead', hint: 'A couple of working radios, a real gain.', cost: s => ({ money: r25(800 + N(s) * 50) }), now: [{ k: 'stock', id: 'radios', n: 2 }, { k: 'morale', n: 3 }], risk: { p: 0.12, good: 'Two radios and a lamp.', bad: 'Only one worked.', lose: [{ k: 'stock', id: 'radios', n: -1 }] }, line: 'A repairman rebuilt radios.' },
      { id: 'strip', label: 'Strip them for wire, magnets and copper', hint: 'A weekend of work, a pile of useful metal.', cost: () => ({ hours: 10 }), now: [{ k: 'stock', id: 'wire', n: 2 }], risk: { p: 0.28, good: 'A tidy pile of copper.', bad: 'Cut a finger on a board.', lose: [hurtOne('a cut finger', 8)] }, line: 'You stripped the electronics.' },
      { id: 'trade', label: 'Swap the junk for something useful with the neighbors', hint: 'One man\'s dead radio is another\'s magnet.', cost: () => ({ hours: 3 }), off: noNeighbors, now: [{ k: 'standing', n: 4 }, { k: 'stock', id: 'hardware', n: 1 }], risk: { p: 0.2, good: 'A fair swap.', bad: 'They got the better of it.', lose: [{ k: 'standing', n: -2 }] }, line: 'You swapped junk with the neighbors.' },
    ] },
];

let c: DecisionCard[] | null = null, g: GoalChain | null = null;
/**
 * Felt layer for emp: the teeth package's decision cards (plus the generic library, so every phase keeps its cards) and its first-week goal
 * chain. Lazy: the teeth module imports the sim, which imports the felt registry (hit moment, marks and radio lines are still to come).
 */
export const felt: FeltSpec = {
  get cards() { return (c ??= [...toFeltCards(cards), ...kindCards('emp', DEFS)]); },
  get goals() { return (g ??= toFeltGoals('emp_first_week', 'An EMP: the first week', 'warning', goals)); },
};
