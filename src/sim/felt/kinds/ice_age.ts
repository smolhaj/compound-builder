import type { FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for ice_age: the woodpile, the roofs, the fuel that gels, the seed that has no season. */
export const felt: FeltSpec = {
  cards: kindCards('ice_age', [
    { id: 'woodpile', phase: 'hit', title: 'The woodpile is everything', fallback: 'cut',
      text: 'The first hard frost came in August and the snow is not melting. A cabin burns twice the wood it used to, and the neighbors are already buying every cord there is.',
      options: [
        { id: 'buy', label: 'Buy seasoned cordwood at the going price', hint: 'Dear, and it goes up every week. The sure answer.', cost: s => ({ money: r25(900 + N(s) * 160) }), now: [{ k: 'stock', id: 'firewood', n: 6 }, { k: 'morale', n: 2 }], risk: { p: 0.12, good: 'It is dry and split.', bad: 'Half of it was green.', lose: [{ k: 'stock', id: 'firewood', n: -2 }] }, line: 'You bought cordwood.' },
        { id: 'cut', label: 'Cut and split your own, every day the weather allows', hint: 'Free in cash, and it takes a lot of hours and a sharp saw.', cost: () => ({ hours: 14 }), now: [{ k: 'stock', id: 'firewood', n: 3 }], risk: { p: 0.35, good: 'The stack grew steadily.', bad: 'A slip with the axe.', lose: [hurtOne('a deep cut', 20)] }, line: 'You cut and split wood.' },
        { id: 'pool', label: 'Pool wood and work with the neighbors', hint: 'A shared crew cuts faster. You owe them a share.', cost: () => ({ hours: 8 }), off: noNeighbors, now: [{ k: 'stock', id: 'firewood', n: 4 }, { k: 'standing', n: 5 }], risk: { p: 0.2, good: 'The crew worked well together.', bad: 'A neighbor left early with his share.', lose: [{ k: 'standing', n: -3 }] }, line: 'You pooled wood with the neighbors.' },
      ] },
    { id: 'seed', phase: 'month', title: 'A growing season with no summer', fallback: 'frame',
      text: 'The frost came back in July. Anything outdoors is a gamble, and the seed you have will not keep forever.',
      options: [
        { id: 'frame', label: 'Build cold frames and plant hardy greens and roots', hint: 'Low and glazed, banked with straw. Cheap and slow.', cost: s => ({ stock: { lumber: 2 }, hours: 8 + N(s) }), now: [{ k: 'morale', n: 1 }], risk: { p: 0.25, good: 'The frames kept the frost off.', bad: 'A hard freeze got in anyway.', lose: [{ k: 'morale', n: -2 }] }, line: 'You built cold frames.' },
        { id: 'hold', label: 'Hold the seed and live on the stores', hint: 'Safest for the seed, hardest on the pantry.', now: [{ k: 'morale', n: -2 }], risk: { p: 0.3, good: 'The pantry held a while longer.', bad: 'The stores are lower than you thought.', lose: [{ k: 'morale', n: -2 }] }, line: 'You held the seed back.' },
        { id: 'trade', label: 'Trade seed and food with the neighbors', hint: 'Spreads the risk across the farms on the road.', cost: () => ({ stock: { seed: 1 } }), off: noNeighbors, now: [{ k: 'standing', n: 5 }, { k: 'humanity', n: 2 }], risk: { p: 0.2, good: 'Everyone came out a little ahead.', bad: 'A neighbor kept the best for himself.', lose: [{ k: 'standing', n: -4 }] }, line: 'You traded seed with the neighbors.' },
      ] },
  ]),
};
