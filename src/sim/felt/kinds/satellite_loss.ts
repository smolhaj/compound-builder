import type { FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for satellite_loss: no phone, no GPS, no weather, no card reader. */
export const felt: FeltSpec = {
  cards: kindCards('satellite_loss', [
    { id: 'no_signal', phase: 'hit', title: 'No signal, no map, no forecast', fallback: 'paper',
      text: 'The phones show no bars, the truck\'s map is blank, and the weather app says nothing. The seed company\'s planting dates came from a satellite.',
      options: [
        { id: 'buy', label: 'Buy a paper atlas, a compass and a shortwave', hint: 'A hardware store\'s last pallet. Dear and real.', cost: s => ({ money: r25(250 + N(s) * 30) }), now: [{ k: 'stock', id: 'sw_radio', n: 1 }, { k: 'morale', n: 2 }], risk: { p: 0.1, good: 'A clear map and a clear radio.', bad: 'The compass was off by ten degrees.', lose: [{ k: 'morale', n: -1 }] }, line: 'You bought an atlas and a shortwave.' },
        { id: 'paper', label: 'Draw a map from memory and the old county survey', hint: 'An evening with a ruler and a lot of arguing.', cost: () => ({ hours: 5 }), now: [{ k: 'morale', n: 1 }], risk: { p: 0.3, good: 'A usable map.', bad: 'A wrong turn cost a day.', lose: [{ k: 'morale', n: -2 }] }, line: 'You drew a map.' },
        { id: 'ask', label: 'Ask the old-timers the planting dates and the weather signs', hint: 'Free, a visit, a lot of stories.', cost: () => ({ hours: 3 }), off: noNeighbors, now: [{ k: 'standing', n: 5 }, { k: 'humanity', n: 1 }], risk: { p: 0.25, good: 'Good lore, in two voices.', bad: 'They disagreed with each other.', lose: [{ k: 'morale', n: -1 }] }, line: 'You asked the old-timers.' },
      ] },
    { id: 'tractor', phase: 'hit', from: 1, to: 7, title: 'The tractor that steers itself', fallback: 'manual',
      text: 'The autosteer is dead and the planter will not run without a signal. The seed is in the shed.',
      options: [
        { id: 'hire', label: 'Pay a neighbor with an old tractor to do your planting', hint: 'No electronics, no worry.', cost: s => ({ money: r25(450 + N(s) * 50) }), now: [{ k: 'stock', id: 'seed', n: 1 }], risk: { p: 0.12, good: 'Straight rows, planted.', bad: 'He did it a week late.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'A neighbor planted for you.' },
        { id: 'manual', label: 'Plant by hand with a string line', hint: 'Slow, sure and tiring.', cost: () => ({ hours: 14 }), risk: { p: 0.3, good: 'It all went in.', bad: 'A bad back and crooked rows.', win: [{ k: 'stock', id: 'seed', n: 1 }], lose: [hurtOne('a wrenched back', 15)] }, line: 'You planted by hand.' },
        { id: 'swap', label: 'Swap labor with the neighbors, field by field', hint: 'A planting bee.', cost: () => ({ hours: 7 }), off: noNeighbors, now: [{ k: 'standing', n: 6 }], risk: { p: 0.2, good: 'Four fields in one weekend.', bad: 'Somebody got stuck in the mud.', lose: [{ k: 'standing', n: -3 }] }, line: 'You swapped labor.' },
      ] },
    { id: 'cash', phase: 'month', title: 'The card reader is dead', fallback: 'cash',
      text: 'The feed store takes cash and nothing else today. The bank is closed. Your cash is what it was.',
      options: [
        { id: 'prepay', label: 'Pay for a month of feed and fuel ahead', hint: 'Locks in a price. You are at the mercy of the dealer.', cost: s => ({ money: r25(500 + N(s) * 80) }), now: [{ k: 'stock', id: 'feed', n: 2 }, { k: 'stock', id: 'fuel', n: 2 }], risk: { p: 0.15, good: 'The dealer kept his word.', bad: 'He ran short.', lose: [{ k: 'stock', id: 'feed', n: -1 }] }, line: 'You prepaid a month.' },
        { id: 'cash', label: 'Buy only what you need, in small cash', hint: 'Thin and flexible.', cost: () => ({ hours: 2 }), now: [{ k: 'morale', n: 1 }], risk: { p: 0.25, good: 'Small purchases worked.', bad: 'The store ran out.', lose: [{ k: 'morale', n: -2 }] }, line: 'You bought small, in cash.' },
        { id: 'trade', label: 'Trade with the neighbors until the card machines come back', hint: 'Cash-free, and it builds a web.', cost: () => ({ hours: 5 }), off: noNeighbors, now: [{ k: 'standing', n: 5 }, { k: 'stock', id: 'staples', n: 2 }], risk: { p: 0.22, good: 'A decent trade.', bad: 'They shorted you.', lose: [{ k: 'standing', n: -3 }] }, line: 'You traded with the neighbors.' },
      ] },
    { id: 'forecast', phase: 'season', title: 'Planting without a forecast', fallback: 'signs',
      text: 'You planted on the first warm day. A hard frost might still come.',
      options: [
        { id: 'cover', label: 'Buy row cover and frost cloth for the early beds', hint: 'A good hedge against a late frost.', cost: s => ({ money: r25(350 + N(s) * 40) }), now: [{ k: 'stock', id: 'poly_film', n: 1 }, { k: 'stock', id: 'seed_cover', n: 1 }], risk: { p: 0.1, good: 'Covered and ready.', bad: 'The wind took it off.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You bought frost cover.' },
        { id: 'signs', label: 'Read the signs: the oak leaves, the birds, the old almanac', hint: 'Free, and old-timers swear by it.', cost: () => ({ hours: 2 }), now: [{ k: 'morale', n: 1 }], risk: { p: 0.35, good: 'The signs were right.', bad: 'The signs were wrong.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You read the signs.' },
        { id: 'stagger', label: 'Plant in three waves, two weeks apart', hint: 'Spreads the risk, costs the hours.', cost: () => ({ hours: 12 }), now: [{ k: 'stock', id: 'seed', n: 1 }], risk: { p: 0.2, good: 'One of three waves made it.', bad: 'A frost took two of three.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You staggered the planting.' },
      ] },
  ]),
};
