import type { FeltSpec } from '../types';
import { kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for lawless: the household's own answers (the gate encounters belong to the order package): the watch, the young men, the go-bag. */
export const felt: FeltSpec = {
  cards: kindCards('lawless', [
    { id: 'watch', phase: 'hit', title: 'The neighbor watch', fallback: 'join',
      text: 'There is nobody to call. The neighbors are talking about a watch, with a phone tree, a whistle and a schedule. Somebody has to start it.',
      options: [
        { id: 'lead', label: 'Organize it yourself and buy the radios and whistles', hint: 'You set the schedule and the rules. People follow the one who pays.', cost: s => ({ money: r25(650 + N(s) * 40) }), off: noNeighbors, now: [{ k: 'standing', n: 12 }, { k: 'respect', n: 0.15 }, { k: 'raidDelay', days: 12 }], risk: { p: 0.1, good: 'The watch runs and the road knows it.', bad: 'Someone took a radio and walked.', lose: [{ k: 'stock', id: 'radios', n: -1 }] }, line: 'You organized the watch.' },
        { id: 'join', label: 'Join the watch and take your shifts', hint: 'Your hours, their trust.', cost: () => ({ hours: 10 }), off: noNeighbors, now: [{ k: 'standing', n: 6 }, { k: 'respect', n: 0.08 }, { k: 'raidDelay', days: 6 }], risk: { p: 0.25, good: 'It works.', bad: 'Hard feelings over the schedule.', lose: [{ k: 'standing', n: -4 }] }, line: 'You joined the watch.' },
        { id: 'alone', label: 'Stay out of it and watch your own gate', hint: 'No promises to keep, nobody to cover for you.', cost: () => ({ hours: 5 }), now: [{ k: 'raidDelay', days: 2 }], risk: { p: 0.4, good: 'Nothing came by.', bad: 'Nobody warned you when they came.', lose: [{ k: 'raidDelay', days: -4 }] }, line: 'You kept your own watch.' },
      ] },
    { id: 'young_men', phase: 'hit', from: 2, to: 7, title: 'The young men', fallback: 'hide',
      text: 'The crews are taking young men to work or to fight. The older boy is eighteen and looks it. The neighbors\' sons are hiding in barns.',
      options: [
        { id: 'hide', label: 'Hide him in the loft and say he went to a cousin\'s', hint: 'Costs a bunk and a lie. Hostile men who find a hidden boy kill the house.', cost: () => ({ hours: 3, humanity: 1 }), now: [{ k: 'raidDelay', days: 3 }], risk: { p: 0.3, good: 'Nobody looked up.', bad: 'The dog barked and they climbed the ladder.', lose: [{ k: 'raidDelay', days: -4 }, { k: 'morale', n: -5 }] }, line: 'You hid the boy in the loft.' },
        { id: 'send', label: 'Send him away with a bag, a map and some cash', hint: 'He is gone before the crews arrive. He may not come back.', cost: s => ({ money: r25(250 + N(s) * 25) }), now: [{ k: 'stock', id: 'bugout_bag', n: 0 }, { k: 'morale', n: -4 }], risk: { p: 0.35, good: 'A call came from the next county: he is alive.', bad: 'No word. The road took him.', lose: [{ k: 'morale', n: -6 }] }, line: 'You sent him away.' },
        { id: 'together', label: 'Hide them all together, with the neighbors', hint: 'A barn full of boys and an agreement. Safer in numbers.', cost: () => ({ hours: 6 }), off: noNeighbors, now: [{ k: 'standing', n: 8 }, { k: 'humanity', n: 3 }], risk: { p: 0.22, good: 'Nobody found the loft.', bad: 'A neighbor let it slip.', lose: [{ k: 'standing', n: -6 }, { k: 'raidDelay', days: -3 }] }, line: 'You hid the boys together.' },
      ] },
    { id: 'go_bag', phase: 'month', title: 'The go-bag by the door', fallback: 'pack',
      text: 'If the road closes or a crew comes, the household has minutes. Bags by the door, a place to meet, a word for danger.',
      options: [
        { id: 'buy', label: 'Buy packs, water filters and a trail map', hint: 'Real gear, one for everybody.', cost: s => ({ money: r25(120 * N(s) + 150) }), now: [{ k: 'stock', id: 'bugout_bag', n: 2 }, { k: 'stock', id: 'water_filter', n: 1 }, { k: 'morale', n: 2 }], risk: { p: 0.08, good: 'Everyone has a pack that fits.', bad: 'One strap tore on the first load.', lose: [{ k: 'morale', n: -1 }] }, line: 'You bought real go-bags.' },
        { id: 'pack', label: 'Pack from what you have and drill it twice', hint: 'Cheap and tiring, and it works if you stay calm.', cost: () => ({ hours: 5 }), now: [{ k: 'raidDelay', days: 1 }], risk: { p: 0.3, good: 'Everyone knows where to be.', bad: 'The drill went wrong and a child cried.', lose: [{ k: 'morale', n: -3 }] }, line: 'You packed and drilled.' },
        { id: 'cache', label: 'Bury a cache in the woods and tell one neighbor', hint: 'Not on you if the house burns. A friend knows.', cost: () => ({ hours: 7, stock: { canned: 3 } }), off: noNeighbors, now: [{ k: 'standing', n: 4 }], risk: { p: 0.22, good: 'Hidden and dry.', bad: 'A fox dug it up.', lose: [{ k: 'stock', id: 'canned', n: -3 }] }, line: 'You buried a cache.' },
      ] },
    { id: 'crew_talk', phase: 'season', title: 'The crew down the road', fallback: 'tribute',
      text: 'A crew has taken over the crossroads store. They say they keep order. The word is they kill anyone who fights, take a few captives, and spare the children of the ones who cooperate.',
      options: [
        { id: 'tribute', label: 'Send a monthly tribute of food', hint: 'Keeps them off your gate and fattens them.', cost: s => ({ stock: { staples: N(s) * 2 } }), now: [{ k: 'raidDelay', days: 14 }, { k: 'humanity', n: -2 }], risk: { p: 0.25, good: 'They took it and left.', bad: 'They asked for more next time.', lose: [{ k: 'raidDelay', days: -4 }] }, line: 'You paid the crew in food.' },
        { id: 'parley', label: 'Parley with the leader, with the neighbors behind you', hint: 'A deal on paper, enforced by numbers. Dangerous if they feel challenged.', cost: () => ({ hours: 6 }), off: noNeighbors, now: [{ k: 'standing', n: 6 }, { k: 'respect', n: 0.1 }], risk: { p: 0.35, good: 'A truce, for now.', bad: 'They took two people to the store as a lesson.', lose: [{ k: 'standing', n: -6 }, { k: 'humanity', n: -2 }] }, line: 'You parleyed with the crew.' },
        { id: 'pay', label: 'Pay for protection with money and tools', hint: 'Cash for peace. It does not last.', cost: s => ({ money: r25(1800 + N(s) * 120) }), now: [{ k: 'raidDelay', days: 20 }, { k: 'respect', n: 0.05 }], risk: { p: 0.15, good: 'The crew kept its word.', bad: 'They took the money and came anyway.', lose: [{ k: 'raidDelay', days: -6 }] }, line: 'You paid for protection.' },
      ] },
  ]),
};
