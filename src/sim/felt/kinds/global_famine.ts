import type { FeltSpec } from '../types';
import { hurtOne, kindCards } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for global_famine: the ration plan, the grain levy. */
export const felt: FeltSpec = {
  cards: kindCards('global_famine', [
    { id: 'ration_plan', phase: 'hit', title: 'The ration plan', fallback: 'steady',
      text: 'The truck did not come. The shelves are bare in town. Whatever you decide about meals, decide it before anyone asks twice.',
      options: [
        { id: 'buy', label: 'Buy sacks of grain at the scalper\'s price', hint: 'Dear, but it arrives. The risk is who you buy from.', cost: s => ({ money: r25(N(s) * 420) }), now: s => [{ k: 'stock', id: 'staples', n: N(s) * 8 }], risk: { p: 0.15, good: 'Clean grain, a good deal.', bad: 'The sacks were cut with sand.', lose: [{ k: 'stock', id: 'staples', n: -4 }] }, line: 'You bought sacks of grain.' },
        { id: 'steady', label: 'Two meals a day, same for everyone, written on the door', hint: 'A plan that holds. It costs weight and tempers.', now: [{ k: 'morale', n: -3 }, { k: 'stock', id: 'canned', n: 2 }], risk: { p: 0.3, good: 'Everyone held.', bad: 'The youngest are thin.', lose: [{ k: 'health', n: -6, who: 'one' }] }, line: 'You set a ration plan.' },
        { id: 'forage', label: 'Forage, trap and fish, every day', hint: 'No cash. Time and shoe leather.', cost: () => ({ hours: 12 }), risk: { p: 0.38, good: 'A little every day.', bad: 'Slim pickings and a bad fall.', win: s => [{ k: 'stock', id: 'canned', n: N(s) * 3 }], lose: [hurtOne('a bad fall', 15)] }, line: 'You foraged for food.' },
      ] },
    { id: 'levy', phase: 'month', title: 'The grain levy', fallback: 'pay',
      text: 'A man from the township with a clipboard and two deputies says every farm owes a share of its grain for the town kitchen. It is the third notice.',
      options: [
        { id: 'pay', label: 'Pay the levy in grain', hint: 'You keep your standing and your name on the list. You also lose food.', cost: s => ({ stock: { staples: N(s) * 2 } }), now: [{ k: 'standing', n: 4 }, { k: 'respect', n: 0.05 }, { k: 'raidDelay', days: 3 }], risk: { p: 0.2, good: 'The deputies left.', bad: 'They took more than the list said.', lose: [{ k: 'stock', id: 'staples', n: -3 }] }, line: 'You paid the grain levy.' },
        { id: 'cash', label: 'Pay the levy in cash instead', hint: 'Keeps your grain. Costs real money.', cost: s => ({ money: r25(N(s) * 350) }), now: [{ k: 'standing', n: 2 }, { k: 'raidDelay', days: 4 }], risk: { p: 0.1, good: 'They took it and went.', bad: 'The man wanted more next time.', lose: [{ k: 'raidDelay', days: -1 }] }, line: 'You paid in cash.' },
        { id: 'hide', label: 'Hide a share of the grain and say it was lost', hint: 'Keeps your stores. If they find it, you lose all of it.', cost: () => ({ hours: 5, humanity: 2 }), now: [{ k: 'standing', n: -2 }], risk: { p: 0.4, good: 'They never looked.', bad: 'They found the false floor.', lose: [{ k: 'stock', id: 'staples', n: -8 }, { k: 'standing', n: -6 }] }, line: 'You hid some of the grain.' },
      ] },
    { id: 'soup_line', phase: 'season', title: 'The line at the gate', fallback: 'ladle',
      text: 'People have started walking up the drive at dusk. They are not armed. They are hungry, and they are polite.',
      options: [
        { id: 'kitchen', label: 'Set up a soup line twice a week', hint: 'Many fed, a smaller pantry, a district that remembers.', cost: s => ({ stock: { staples: N(s) * 2, canned: N(s) } }), now: [{ k: 'humanity', n: 6 }, { k: 'standing', n: 8 }, { k: 'morale', n: 3 }], risk: { p: 0.25, good: 'A quiet line, and nobody turned away.', bad: 'A scuffle and a lost pot.', lose: [hurtOne('a bruised arm', 10)] }, line: 'You started a soup line.' },
        { id: 'ladle', label: 'Give the children a cup and send the rest on', hint: 'You keep most of it.', cost: s => ({ stock: { canned: N(s) } }), now: [{ k: 'humanity', n: 2 }, { k: 'raidDelay', days: 2 }], risk: { p: 0.15, good: 'The word spread: kids only.', bad: 'Crowds waited at the road.', lose: [{ k: 'morale', n: -2 }] }, line: 'You fed the children.' },
        { id: 'refuse', label: 'Shut the gate and say nothing', hint: 'Every can stays yours. People remember.', cost: () => ({ humanity: 6, standing: 6 }), now: [{ k: 'respect', n: 0.05 }, { k: 'raidDelay', days: 3 }], line: 'You shut the gate.' },
      ] },
  ]),
};
