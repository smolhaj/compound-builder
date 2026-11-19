import type { FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for runaway_heat: the day turned around the heat, the cool room, the well and the neighbors who leave. */
export const felt: FeltSpec = {
  cards: kindCards('runaway_heat', [
    { id: 'turn_the_day', phase: 'hit', title: 'Turn the day around', fallback: 'dawn',
      text: 'By noon the thermometer on the porch is past a hundred and the garden wilts as you watch. The old hands say to work at dawn and after dark and to lie low in the middle of the day.',
      options: [
        { id: 'shade', label: 'Buy shade cloth and rig it over the garden and the animals', hint: 'It cuts the worst of the sun. Not cheap, and it takes a hard day to hang.', cost: s => ({ money: r25(300 + N(s) * 50), hours: 8 }), now: [{ k: 'morale', n: 2 }], risk: { p: 0.15, good: 'The beds under it held.', bad: 'A hot wind tore a corner loose.', lose: [{ k: 'morale', n: -2 }] }, line: 'You hung shade cloth.' },
        { id: 'dawn', label: 'Move the work to dawn and after dark', hint: 'Free, and tiring. Everyone sleeps in two pieces.', cost: () => ({ hours: 4 }), now: [{ k: 'morale', n: -1 }], risk: { p: 0.25, good: 'The hot hours are quiet and cool enough.', bad: 'Someone worked too long in the sun.', lose: [hurtOne('heat exhaustion', 18)] }, line: 'You moved the work to the cool hours.' },
        { id: 'push', label: 'Push through the heat and finish the day\'s work', hint: 'Gets the work done. Risky for the old and the small.', now: [{ k: 'raidDelay', days: 1 }], risk: { p: 0.45, good: 'Everyone drank enough.', bad: 'Someone went down with the heat.', lose: [hurtOne('heat stroke', 30)] }, line: 'You worked through the heat.' },
      ] },
    { id: 'well', phase: 'month', title: 'The well is dropping', fallback: 'conserve',
      text: 'The water in the well is lower each week and the pump sucks air by evening. The neighbors say theirs has gone to mud.',
      options: [
        { id: 'deepen', label: 'Pay a driller to go down another fifty feet', hint: 'The sure answer if the aquifer is there. Expensive, and a week of noise.', cost: s => ({ money: r25(2400 + N(s) * 100) }), now: [{ k: 'morale', n: 2 }], risk: { p: 0.2, good: 'The new depth gives steady water.', bad: 'The driller hit rock and went home.', lose: [{ k: 'morale', n: -3 }] }, line: 'You paid to deepen the well.' },
        { id: 'conserve', label: 'Cut water use to the bone and haul the rest', hint: 'Short showers, no lawn, buckets from the creek while it runs.', cost: () => ({ hours: 6 }), now: [{ k: 'morale', n: -2 }], risk: { p: 0.3, good: 'It was enough.', bad: 'The creek stopped running.', lose: [{ k: 'morale', n: -2 }] }, line: 'You cut water use.' },
        { id: 'share', label: 'Share a deep well with the neighbors, and share the work', hint: 'Spreads the cost and the risk across the road.', cost: () => ({ hours: 5 }), off: noNeighbors, now: [{ k: 'standing', n: 5 }, { k: 'humanity', n: 2 }], risk: { p: 0.2, good: 'Two families, one pump, and a deal.', bad: 'The neighbors argued over turns.', lose: [{ k: 'standing', n: -4 }] }, line: 'You went in on a well.' },
      ] },
  ]),
};
