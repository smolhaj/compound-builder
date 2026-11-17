import type { DecisionCard, FeltSpec, GoalChain } from '../types';
import { cards, goals } from '../../disasters/solar_flare';
import { toFeltCards, toFeltGoals } from '../../techFelt';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

import type { KindCardDef } from '../cardLibrary';
const DEFS: KindCardDef[] = [
  { id: 'inverter', phase: 'hit', title: 'The spare inverter, and the one in use', fallback: 'box',
    text: 'The storm is three hours out. Whatever is connected to a long run of wire is the first thing to cook. The spare is on a shelf.',
    options: [
      { id: 'buy', label: 'Buy a second spare inverter and a surge arrestor', hint: 'Money buys a second chance. About $900.', cost: s => ({ money: r25(700 + N(s) * 50) }), now: [{ k: 'stock', id: 'inverter', n: 1 }, { k: 'morale', n: 2 }], risk: { p: 0.1, good: 'Two spares, boxed.', bad: 'The arrestor was a dud.', lose: [{ k: 'stock', id: 'batteries', n: -1 }] }, line: 'You bought a second inverter.' },
      { id: 'box', label: 'Box the spare in a metal can and unplug the long runs', hint: 'A day of work. It saves the spare, not the one in use.', cost: () => ({ hours: 6 }), now: [{ k: 'stock', id: 'batteries', n: 1 }], risk: { p: 0.3, good: 'The spare is in a can in the cellar.', bad: 'The can was not tight.', lose: [{ k: 'stock', id: 'batteries', n: -2 }] }, line: 'You boxed the spare.' },
      { id: 'sit', label: 'Do nothing and hope the sky is only pretty', hint: 'No cost. Every connected piece rolls its full chance.', now: [{ k: 'morale', n: 3 }], risk: { p: 0.55, good: 'It was only pretty.', bad: 'Something in the house popped.', lose: [{ k: 'stock', id: 'batteries', n: -3 }] }, line: 'You watched the sky.' },
    ] },
  { id: 'aurora_night', phase: 'month', title: 'The long aurora night', fallback: 'sleep',
    text: 'The sky is green and red every night. Compasses wander. Nobody can sleep through the glow, and the radio is full of static.',
    options: [
      { id: 'tent', label: 'Pay a neighbor to set up a ham antenna with a tuner', hint: 'A signal through the storm, for a price.', cost: s => ({ money: r25(400 + N(s) * 40) }), now: [{ k: 'stock', id: 'sw_radio', n: 0 }, { k: 'morale', n: 3 }], risk: { p: 0.15, good: 'A clear voice in the static.', bad: 'The tuner burned out.', lose: [{ k: 'morale', n: -2 }] }, line: 'You set up a ham antenna.' },
      { id: 'sleep', label: 'Keep a normal bedtime and put cloth over the windows', hint: 'No cost. A little rest.', cost: () => ({ hours: 1 }), now: [{ k: 'morale', n: 1 }], risk: { p: 0.25, good: 'You slept.', bad: 'Nobody did.', lose: [{ k: 'morale', n: -3 }] }, line: 'You covered the windows.' },
      { id: 'watch', label: 'Gather the neighbors in the yard to watch it', hint: 'A rare night of company.', cost: () => ({ stock: { firewood: 2 } }), off: noNeighbors, now: [{ k: 'standing', n: 6 }, { k: 'morale', n: 5 }], risk: { p: 0.12, good: 'A story for the grandchildren.', bad: 'The dog bit a guest.', lose: [{ k: 'standing', n: -2 }] }, line: 'The district watched the sky.' },
    ] },
  { id: 'transformer', phase: 'season', title: 'The transformer in the pasture', fallback: 'wait',
    text: 'The co-op says the big transformers will take a year. A neighbor suggests running the line off a salvaged one in the pasture.',
    options: [
      { id: 'hire', label: 'Pay a crew to set a salvaged transformer', hint: 'A real fix, pricey and quick.', cost: s => ({ money: r25(3800 + N(s) * 150) }), now: [{ k: 'morale', n: 5 }], risk: { p: 0.15, good: 'The lights came on.', bad: 'The salvaged unit hummed and quit.', lose: [{ k: 'morale', n: -4 }] }, line: 'A crew set a transformer.' },
      { id: 'wait', label: 'Wait on the co-op\'s list', hint: 'Free. A long dark year.', now: [{ k: 'morale', n: -2 }], risk: { p: 0.4, good: 'The list moved up.', bad: 'The date slipped again.', lose: [{ k: 'morale', n: -3 }] }, line: 'You waited on the co-op.' },
      { id: 'bypass', label: 'Rig a bypass with the neighbors and a lot of rope', hint: 'Hours and goodwill, and a risk of shock.', cost: () => ({ hours: 12 }), off: noNeighbors, now: [{ k: 'standing', n: 6 }, { k: 'stock', id: 'cable', n: 1 }], risk: { p: 0.33, good: 'A flicker, then a steady light.', bad: 'A flash and a sore arm.', lose: [hurtOne('a burned forearm', 20)] }, line: 'You rigged a bypass.' },
    ] },
];

let c: DecisionCard[] | null = null, g: GoalChain | null = null;
/**
 * Felt layer for solar_flare: the teeth package's decision cards (plus the generic library, so every phase keeps its cards) and its first-week goal
 * chain. Lazy: the teeth module imports the sim, which imports the felt registry (hit moment, marks and radio lines are still to come).
 */
export const felt: FeltSpec = {
  get cards() { return (c ??= [...toFeltCards(cards), ...kindCards('solar_flare', DEFS)]); },
  get goals() { return (g ??= toFeltGoals('solar_flare_first_week', 'A solar storm: the first week', 'warning', goals)); },
};
