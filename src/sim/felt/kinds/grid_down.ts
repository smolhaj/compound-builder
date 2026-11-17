import type { DecisionCard, FeltSpec, GoalChain } from '../types';
import { cards, goals } from '../../disasters/grid_down';
import { toFeltCards, toFeltGoals } from '../../techFelt';
import { genericCards, kindCards, noNeighbors } from '../cardLibrary';
import type { KindCardDef } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

const DEFS: KindCardDef[] = [
  { id: 'generator', phase: 'month', title: 'The generator and its gas', fallback: 'sparingly',
    text: 'The generator is running every night. The gas can is half empty. The pump, the freezer and the radio all want power.',
    options: [
      { id: 'buy', label: 'Buy a bigger tank and a month of fuel', hint: 'Power without counting.', cost: s => ({ money: r25(500 + N(s) * 60) }), now: [{ k: 'stock', id: 'fuel', n: 4 }, { k: 'morale', n: 3 }], risk: { p: 0.12, good: 'Fuel, delivered and tested.', bad: 'Half was water.', lose: [{ k: 'stock', id: 'fuel', n: -2 }] }, line: 'You bought fuel.' },
      { id: 'sparingly', label: 'Run it two hours a day for the pump and freezer only', hint: 'Cheap and a little dark.', cost: () => ({ hours: 2 }), now: [{ k: 'stock', id: 'fuel', n: 1 }, { k: 'morale', n: -2 }], risk: { p: 0.25, good: 'The fuel lasted.', bad: 'The freezer thawed.', lose: [{ k: 'stock', id: 'canned', n: -2 }] }, line: 'You ran the generator sparingly.' },
      { id: 'solar', label: 'Rig a salvaged panel and a battery for lights and radio', hint: 'A weekend of work, no fuel at all.', cost: () => ({ hours: 10 }), now: [{ k: 'stock', id: 'batteries', n: 2 }, { k: 'stock', id: 'solar_panel', n: 0 }], risk: { p: 0.35, good: 'Lights and a radio from the sun.', bad: 'A wiring mistake fried a battery.', lose: [{ k: 'stock', id: 'batteries', n: -2 }] }, line: 'You rigged a small panel.' },
    ] },
  { id: 'hub', phase: 'season', title: 'The district charging hub', fallback: 'visit',
    text: 'Somebody is running a charging station off a wood-gas truck. It needs a place, a roof and a person to run it.',
    options: [
      { id: 'host', label: 'Host the hub at your place, with a sign-up sheet', hint: 'A crowd at the gate and a lot of goodwill.', cost: () => ({ hours: 8, stock: { firewood: 3 } }), off: noNeighbors, now: [{ k: 'standing', n: 10 }, { k: 'humanity', n: 3 }], risk: { p: 0.25, good: 'A busy, happy hub.', bad: 'Somebody took a battery.', lose: [{ k: 'stock', id: 'batteries', n: -1 }] }, line: 'You hosted the hub.' },
      { id: 'visit', label: 'Visit the hub with a spare battery once a week', hint: 'A walk, a chat, a charge.', cost: () => ({ hours: 3 }), now: [{ k: 'stock', id: 'batteries', n: 1 }, { k: 'standing', n: 2 }], risk: { p: 0.15, good: 'A charge and some news.', bad: 'The hub was closed.', lose: [{ k: 'morale', n: -1 }] }, line: 'You visited the hub.' },
      { id: 'pay', label: 'Pay for a share of the hub\'s output', hint: 'A subscription to the sun and the engine.', cost: s => ({ money: r25(300 + N(s) * 20) }), now: [{ k: 'stock', id: 'batteries', n: 3 }], line: 'You bought a share.' },
    ] },
];

let c: DecisionCard[] | null = null, g: GoalChain | null = null;
/**
 * Felt layer for grid_down: the teeth package's decision cards (plus the generic library, so every phase keeps its cards) and its first-week goal
 * chain. Lazy: the teeth module imports the sim, which imports the felt registry (hit moment, marks and radio lines are still to come).
 */
export const felt: FeltSpec = {
  get cards() { return (c ??= [...toFeltCards(cards), genericCards('grid_down')[0], ...kindCards('grid_down', DEFS)]); },
  get goals() { return (g ??= toFeltGoals('grid_down_first_week', 'The long blackout: the first week', 'hit', goals)); },
};
