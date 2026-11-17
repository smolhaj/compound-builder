import type { FeltSpec } from '../types';
import { kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for asteroid: the dim sky, the pantry count, the shelter. */
export const felt: FeltSpec = {
  cards: kindCards('asteroid', [
    { id: 'count', phase: 'hit', title: 'The numbers on the shelf, and the sky', fallback: 'count',
      text: 'The sky is the color of dishwater and the radio says the dust will not clear for a year. Count the cans, the seed and the days.',
      options: [
        { id: 'buy', label: 'Buy dry goods while the stores still have them', hint: 'Cash buys a bigger pantry before the line forms.', cost: s => ({ money: r25(N(s) * 320) }), now: s => [{ k: 'stock', id: 'staples', n: N(s) * 6 }, { k: 'stock', id: 'canned', n: N(s) * 3 }], risk: { p: 0.1, good: 'It all keeps.', bad: 'A case had gone off.', lose: [{ k: 'stock', id: 'canned', n: -2 }] }, line: 'You bought dry goods.' },
        { id: 'count', label: 'Count it all, mark it and plan a year of meals', hint: 'A day of work, and a plan everyone can follow.', cost: () => ({ hours: 5 }), now: [{ k: 'morale', n: 3 }], risk: { p: 0.25, good: 'The plan holds, barely.', bad: 'The count came up short.', lose: [{ k: 'morale', n: -3 }] }, line: 'You counted the pantry and made a meal plan.' },
        { id: 'pool', label: 'Pool counts with the neighbors and find who is short', hint: 'You learn who is desperate, and so do they.', cost: s => ({ stock: { canned: N(s) } }), off: noNeighbors, now: [{ k: 'standing', n: 7 }, { k: 'humanity', n: 2 }, { k: 'morale', n: 3 }], risk: { p: 0.3, good: 'A shared plan.', bad: 'Somebody lied about the count.', lose: [{ k: 'standing', n: -5 }] }, line: 'You pooled counts with the neighbors.' },
      ] },
    { id: 'shelter', phase: 'hit', from: 2, to: 7, title: 'How deep to dig in', fallback: 'cellar',
      text: 'The dust, the cold and the strange hail are coming. The cellar is damp. Everyone wants to know where to sleep.',
      options: [
        { id: 'shelter', label: 'Hire a crew to reinforce a root cellar with timber and tarps', hint: 'Dry, warm enough and quiet.', cost: s => ({ money: r25(1800 + N(s) * 120) }), now: [{ k: 'raidDelay', days: 5 }, { k: 'morale', n: 4 }], risk: { p: 0.1, good: 'A dry place for everyone.', bad: 'Groundwater seeped in the corner.', lose: [{ k: 'stock', id: 'staples', n: -2 }] }, line: 'A crew reinforced the cellar.' },
        { id: 'cellar', label: 'Clear the cellar yourselves and run a stovepipe', hint: 'Hard work, a week of it, and a cramped place.', cost: () => ({ hours: 12, stock: { lumber: 1 } }), now: [{ k: 'morale', n: -1 }], risk: { p: 0.35, good: 'It is damp but livable.', bad: 'The stovepipe filled the cellar with smoke.', lose: [{ k: 'fever' }] }, line: 'You cleared the cellar.' },
        { id: 'house', label: 'Stay in the house, windows covered', hint: 'No work, and the same weather as before.', now: [{ k: 'morale', n: -3 }, { k: 'blackout' }], risk: { p: 0.42, good: 'It was cold and quiet.', bad: 'Hail broke a window.', lose: [{ k: 'stock', id: 'hardware', n: -1 }] }, line: 'You stayed in the house.' },
      ] },
    { id: 'ration', phase: 'month', title: 'The ration plan', fallback: 'steady',
      text: 'A month in and the sky has not cleared. Everyone eats less every week and nobody says it out loud.',
      options: [
        { id: 'buy', label: 'Spend cash on a pallet of rice and beans', hint: 'More meals for the money.', cost: s => ({ money: r25(N(s) * 380) }), now: s => [{ k: 'stock', id: 'staples', n: N(s) * 7 }], risk: { p: 0.12, good: 'It will keep a year.', bad: 'Half was weevily.', lose: [{ k: 'stock', id: 'staples', n: -4 }] }, line: 'You bought rice and beans.' },
        { id: 'steady', label: 'Cut to two meals and a thin soup, same for everyone', hint: 'Saves the pantry, costs a little health and morale.', now: [{ k: 'morale', n: -4 }, { k: 'stock', id: 'canned', n: 3 }], risk: { p: 0.3, good: 'Everyone lost a little and held.', bad: 'The youngest slipped.', lose: [{ k: 'health', n: -8, who: 'one' }] }, line: 'You went to two meals a day.' },
        { id: 'share', label: 'Open a shared pot with the neighbors', hint: 'Same food, more mouths, and a thin kind of safety.', cost: s => ({ stock: { canned: N(s) * 2 } }), off: noNeighbors, now: [{ k: 'standing', n: 7 }, { k: 'humanity', n: 3 }, { k: 'morale', n: 4 }], line: 'You shared a pot.' },
      ] },
    { id: 'seed', phase: 'season', title: 'Planting under a dim sky', fallback: 'tunnel',
      text: 'The light is a third of what it was. Most crops will not make it. Something might.',
      options: [
        { id: 'light', label: 'Buy shade-tolerant seed and cold frames', hint: 'Mushrooms, greens, potatoes. It is a start.', cost: s => ({ money: r25(400 + N(s) * 80) }), now: s => [{ k: 'stock', id: 'seed', n: N(s) * 2 }, { k: 'stock', id: 'poly_film', n: 1 }], risk: { p: 0.15, good: 'Something is green.', bad: 'The first set damped off.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You bought shade crops.' },
        { id: 'tunnel', label: 'Plant what you have under whatever cover you can build', hint: 'Slow and poor.', cost: () => ({ hours: 14 }), now: [{ k: 'stock', id: 'seed', n: 1 }], risk: { p: 0.38, good: 'A little came up.', bad: 'Nothing made it.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You planted under makeshift cover.' },
        { id: 'trade', label: 'Trade labor for the neighbors\' stored root vegetables', hint: 'You eat, and you owe.', cost: () => ({ hours: 7 }), off: noNeighbors, now: s => [{ k: 'stock', id: 'staples', n: N(s) * 2 }, { k: 'standing', n: 3 }], risk: { p: 0.22, good: 'A fair trade.', bad: 'They skimped.', lose: [{ k: 'standing', n: -4 }] }, line: 'You traded labor for roots.' },
      ] },
  ]),
};
