import type { FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for supervolcano: the roof under ash, filter or bandana, the seed to ration. */
export const felt: FeltSpec = {
  cards: kindCards('supervolcano', [
    { id: 'shovel_roof', phase: 'hit', title: 'The roof under the ash', fallback: 'shovel',
      text: 'Gray ash is piling on the roof. Wet, it weighs twice what snow does. The beams are creaking.',
      options: [
        { id: 'crew', label: 'Pay a roofing crew to clear it and lay a tarp', hint: 'They work with respirators and a ladder gang. Quick, and not cheap.', cost: s => ({ money: r25(900 + N(s) * 120) }), now: [{ k: 'stock', id: 'roofing', n: 1 }, { k: 'morale', n: 3 }], risk: { p: 0.1, good: 'The roof is clear and tight.', bad: 'A ladder slipped.', lose: [hurtOne('a sprained ankle', 15)] }, line: 'A crew cleared the roof.' },
        { id: 'shovel', label: 'Shovel it off yourselves, twice a day', hint: 'Twelve hours of coughing work. Free in cash.', cost: () => ({ hours: 12 }), now: [{ k: 'raidDelay', days: 1 }], risk: { p: 0.38, good: 'The roof is holding.', bad: 'A fall from the ladder.', lose: [hurtOne('a bad fall', 25)] }, line: 'You shoveled the roof by hand.' },
        { id: 'brace', label: 'Brace the beams from below and wait for rain', hint: 'No climbing. A bad gamble if the ash gets wet.', cost: () => ({ stock: { lumber: 2 } }), now: [{ k: 'morale', n: -2 }], risk: { p: 0.45, good: 'The posts held, and the rain was light.', bad: 'The rain came and the roof sagged.', lose: [{ k: 'stock', id: 'roofing', n: -1 }, { k: 'morale', n: -3 }] }, line: 'You braced the beams from below.' },
      ] },
    { id: 'breathe', phase: 'hit', from: 1, to: 6, title: 'Filter or bandana', fallback: 'bandana',
      text: 'Ash on the wind scours the throat. The kids are coughing. A real filter would help, if there is one.',
      options: [
        { id: 'filters', label: 'Buy respirators and spare filters for everyone', hint: 'P100 masks and cartridges. You will not run out for a month.', cost: s => ({ money: r25(180 * N(s) + 120) }), now: [{ k: 'stock', id: 'nbc_filter', n: 2 }, { k: 'health', n: 5, who: 'all' }], risk: { p: 0.08, good: 'Everyone has a good mask.', bad: 'Half of them were counterfeit.', lose: [{ k: 'health', n: -4, who: 'all' }] }, line: 'You bought real respirators.' },
        { id: 'bandana', label: 'Wet bandanas and a damp cloth over the windows', hint: 'Cheap and tiring. Cuts the dust, does not stop the fine stuff.', cost: () => ({ hours: 5 }), now: [{ k: 'morale', n: -1 }], risk: { p: 0.4, good: 'The cloth worked for the coarse ash.', bad: 'The fine ash got in anyway.', lose: [{ k: 'fever' }] }, line: 'You hung wet cloth and wore bandanas.' },
        { id: 'in', label: 'Stay in with the windows shut and fires off', hint: 'No cost. Stale air and short tempers.', now: [{ k: 'morale', n: -4 }, { k: 'raidDelay', days: 2 }], risk: { p: 0.3, good: 'A long dull day.', bad: 'The damper leaked ash and smoke.', lose: [{ k: 'health', n: -5, who: 'one' }] }, line: 'You sealed up and stayed in.' },
      ] },
    { id: 'seed', phase: 'month', title: 'Ration the seed', fallback: 'hold',
      text: 'The growing season looks short and cold. You will not get a second try with seed this good.',
      options: [
        { id: 'buy', label: 'Buy cold-hardy seed at the market price', hint: 'Money buys a better bet, if it is real seed.', cost: s => ({ money: r25(250 + N(s) * 90) }), now: s => [{ k: 'stock', id: 'seed', n: N(s) * 2 }], risk: { p: 0.15, good: 'It is true to type.', bad: 'Half of it is old stock.', lose: s => [{ k: 'stock', id: 'seed', n: -N(s) }] }, line: 'You bought cold-hardy seed.' },
        { id: 'hold', label: 'Plant a third and hold two-thirds in reserve', hint: 'Safer for a bad year, a thin harvest if the year is good.', cost: () => ({ hours: 5 }), now: [{ k: 'morale', n: -1 }], risk: { p: 0.3, good: 'Enough came up to feed you.', bad: 'The reserve is all there is.', lose: [{ k: 'morale', n: -2 }] }, line: 'You planted a third and held the rest.' },
        { id: 'trade', label: 'Trade seed with the neighbors, half and half', hint: 'Spreads the risk across five farms.', cost: () => ({ stock: { seed: 1 } }), off: noNeighbors, now: [{ k: 'standing', n: 6 }, { k: 'humanity', n: 2 }], risk: { p: 0.2, good: 'Five farms, five chances.', bad: 'A neighbor kept the best for himself.', lose: [{ k: 'standing', n: -4 }] }, line: 'You split your seed with the neighbors.' },
      ] },
    { id: 'greenhouse', phase: 'season', title: 'Light, and a way to use it', fallback: 'cloche',
      text: 'The sky is pale and the sun is a smudge. Plants want light and heat. Under the poly the garden might survive.',
      options: [
        { id: 'kit', label: 'Buy a greenhouse kit and set it up', hint: 'A real frame, real film. The money is gone, the tomatoes are not.', cost: s => ({ money: r25(900 + N(s) * 60) }), now: [{ k: 'stock', id: 'poly_film', n: 2 }, { k: 'morale', n: 4 }], risk: { p: 0.1, good: 'It is a warm green room.', bad: 'Ash scratched the film and cut the light.', lose: [{ k: 'morale', n: -2 }] }, line: 'You built a greenhouse.' },
        { id: 'cloche', label: 'Build low cold frames from old windows', hint: 'A weekend of work. Small, and it works.', cost: () => ({ hours: 12 }), now: [{ k: 'stock', id: 'seedlings', n: 2 }], risk: { p: 0.3, good: 'Seedlings are up under glass.', bad: 'A hard frost killed the first set.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You built cold frames.' },
        { id: 'share', label: 'Run one frame for the whole road', hint: 'Shared work, shared food.', cost: () => ({ hours: 6, stock: { firewood: 2 } }), off: noNeighbors, now: [{ k: 'standing', n: 8 }, { k: 'humanity', n: 3 }], risk: { p: 0.22, good: 'Six families eating greens.', bad: 'Somebody took more than their share.', lose: [{ k: 'standing', n: -4 }] }, line: 'You ran one frame for the road.' },
      ] },
  ]),
};
