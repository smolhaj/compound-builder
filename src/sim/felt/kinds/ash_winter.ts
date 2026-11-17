import type { FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for ash_winter: the roof, the filter, the seed and the short season. */
export const felt: FeltSpec = {
  cards: kindCards('ash_winter', [
    { id: 'ash_roof', phase: 'hit', title: 'Ash on the roof and in the air', fallback: 'shovel',
      text: 'It is noon and the lamps are on. Gray ash falls like fine snow, drifting against the north wall. The roof is carrying it.',
      options: [
        { id: 'crew', label: 'Pay a crew to clear the roof and seal the eaves', hint: 'Respirators and a long ladder. The only people who will climb.', cost: s => ({ money: r25(800 + N(s) * 110) }), now: [{ k: 'morale', n: 3 }, { k: 'stock', id: 'roofing', n: 1 }], risk: { p: 0.1, good: 'The roof is clear and tight.', bad: 'A ladder slipped.', lose: [hurtOne('a sprained ankle', 15)] }, line: 'A crew cleared the roof.' },
        { id: 'shovel', label: 'Shovel the roof and wet the ash down', hint: 'Dusty, heavy, twelve hours of it, free in cash.', cost: () => ({ hours: 12 }), risk: { p: 0.36, good: 'The roof is holding.', bad: 'A fall from the ladder.', lose: [hurtOne('a bad fall', 25)] }, line: 'You shoveled the roof.' },
        { id: 'wait', label: 'Leave it and brace the rafters from below', hint: 'No climbing. Dry ash is light, wet ash is not.', cost: () => ({ stock: { lumber: 2 } }), now: [{ k: 'morale', n: -2 }], risk: { p: 0.48, good: 'It stayed dry.', bad: 'Rain turned the roof into cement.', lose: [{ k: 'stock', id: 'roofing', n: -1 }] }, line: 'You braced the rafters.' },
      ] },
    { id: 'breathe', phase: 'hit', from: 1, to: 6, title: 'Something to breathe through', fallback: 'cloth',
      text: 'Everyone is coughing a gray cough. The little ones are the worst.',
      options: [
        { id: 'masks', label: 'Buy respirators and spare filters', hint: 'Real masks, real filters, for everyone.', cost: s => ({ money: r25(170 * N(s) + 100) }), now: [{ k: 'stock', id: 'nbc_filter', n: 2 }, { k: 'health', n: 4, who: 'all' }], risk: { p: 0.08, good: 'Everyone has a mask that fits.', bad: 'Two did not seal on the kids.', lose: [{ k: 'health', n: -4, who: 'one' }] }, line: 'You bought respirators.' },
        { id: 'cloth', label: 'Wet cloth over every face, and over the vents', hint: 'It helps with the grit and not with the fine stuff.', cost: () => ({ hours: 4 }), risk: { p: 0.4, good: 'The coughing eased.', bad: 'The fine ash got in.', lose: [{ k: 'fever' }] }, line: 'You wrapped cloth over faces and vents.' },
        { id: 'stay', label: 'Stay in, doors taped, no fires', hint: 'Nobody breathes ash. Everyone is cold and bored.', now: [{ k: 'morale', n: -4 }], risk: { p: 0.28, good: 'A long dull day.', bad: 'A chilly night and the damper leaked.', lose: [hurtOne('a chest cold', 10)] }, line: 'You sealed in and sat tight.' },
      ] },
    { id: 'seed', phase: 'month', title: 'Which seed goes in the ground first', fallback: 'hardy',
      text: 'The sun is weak and the nights are cold. You have seed for one real planting and not two.',
      options: [
        { id: 'buy', label: 'Buy early cold-hardy seed at the going rate', hint: 'Money buys better odds.', cost: s => ({ money: r25(300 + N(s) * 90) }), now: s => [{ k: 'stock', id: 'seed', n: N(s) * 2 }], risk: { p: 0.15, good: 'It came true to type.', bad: 'Half the packets were old.', lose: s => [{ k: 'stock', id: 'seed', n: -N(s) }] }, line: 'You bought cold-hardy seed.' },
        { id: 'hardy', label: 'Plant the hardy half now: kale, potatoes, oats', hint: 'Fast, cold-tolerant, low calories. Hold the rest back.', cost: () => ({ hours: 10 }), now: [{ k: 'stock', id: 'seed', n: 1 }], risk: { p: 0.3, good: 'The kale came up under frost.', bad: 'A hard freeze took a row.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You planted the hardy crops first.' },
        { id: 'ration', label: 'Ration the seed: plant a third, eat none', hint: 'No seed is eaten. A thin first harvest.', now: [{ k: 'morale', n: -2 }], risk: { p: 0.45, good: 'The third made it.', bad: 'The reserve is all there is.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You planted a third and held the rest.' },
      ] },
    { id: 'short_season', phase: 'season', title: 'A season with no summer', fallback: 'cover',
      text: 'The frost came in June. The tomatoes are black. The few things that grow need a roof and a stove.',
      options: [
        { id: 'tunnel', label: 'Buy poly film and hoops for tunnels', hint: 'A tunnel is a month of summer.', cost: s => ({ money: r25(550 + N(s) * 50) }), now: [{ k: 'stock', id: 'poly_film', n: 2 }, { k: 'morale', n: 3 }], risk: { p: 0.1, good: 'Beans and greens under plastic.', bad: 'A storm tore the film.', lose: [{ k: 'stock', id: 'poly_film', n: -1 }] }, line: 'You built poly tunnels.' },
        { id: 'cover', label: 'Cover the rows with sheets, straw and old doors every night', hint: 'Nightly work, free in cash.', cost: () => ({ hours: 16 }), now: [{ k: 'stock', id: 'seedlings', n: 1 }], risk: { p: 0.38, good: 'The plants made it through.', bad: 'One missed night killed the lot.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You covered the rows at night.' },
        { id: 'forage', label: 'Trade labor for stored grain with the neighbors', hint: 'Feeds you, owes them.', cost: () => ({ hours: 8 }), off: noNeighbors, now: s => [{ k: 'stock', id: 'staples', n: N(s) * 3 }, { k: 'standing', n: 3 }], risk: { p: 0.25, good: 'A fair deal.', bad: 'They shorted you.', lose: [{ k: 'standing', n: -4 }] }, line: 'You worked for grain.' },
      ] },
  ]),
};
