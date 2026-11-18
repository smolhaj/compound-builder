import type { FeltSpec } from '../types';
import { genericCards, kindCards, noNeighbors } from '../cardLibrary';
import { domeFalloutCards } from '../domeFelt';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for nuclear: keeps the generic fallout "How long to stay sealed" card (its own wording), then a bomb-specific second hit, the month and the season. Reactor_meltdown has its own cards. */
export const felt: FeltSpec = {
  cards: [
    ...domeFalloutCards('nuclear'),
    genericCards('nuclear')[0],
    ...kindCards('nuclear', [
      { id: 'water', phase: 'hit', from: 1, to: 7, title: 'The creek, the well, and the rain', fallback: 'boil',
        text: 'The first black rain has fallen. The radio says do not drink from the creek or the stock tank. The well is deep, and nobody knows.',
        options: [
          { id: 'filter', label: 'Buy a water filter and a barrel of rainwater', hint: 'A real filter, a real barrel.', cost: s => ({ money: r25(350 + N(s) * 50) }), now: [{ k: 'stock', id: 'water_filter', n: 1 }, { k: 'stock', id: 'water_jugs', n: 4 }], risk: { p: 0.1, good: 'Clean water, tested.', bad: 'The first batch was bad.', lose: [{ k: 'dose', n: 0.04 }] }, line: 'You bought a filter.' },
          { id: 'boil', label: 'Boil what you drink and keep the stock tank covered', hint: 'Boiling does not remove fallout. It does kill germs.', cost: () => ({ hours: 6 }), now: [{ k: 'stock', id: 'firewood', n: -2 }, { k: 'stock', id: 'water_jugs', n: 2 }], risk: { p: 0.35, good: 'It was the well that mattered.', bad: 'The well was hot.', lose: [{ k: 'dose', n: 0.1 }] }, line: 'You boiled the water.' },
          { id: 'share', label: 'Share a clean source with the neighbors', hint: 'A deep well and a lot of trips.', cost: () => ({ hours: 4 }), off: noNeighbors, now: [{ k: 'standing', n: 7 }, { k: 'humanity', n: 3 }], risk: { p: 0.2, good: 'A line, a bucket, a thank you.', bad: 'The well ran low.', lose: [{ k: 'stock', id: 'water_jugs', n: -2 }] }, line: 'You shared the well.' },
        ] },
      { id: 'decon', phase: 'month', title: 'Decontaminating the place', fallback: 'scrub',
        text: 'The roof, the yard and the truck are still hot. Rain washes it into the garden. A broom and a bucket can do some, but not all.',
        options: [
          { id: 'crew', label: 'Pay a decon crew to wash the roof and scrape the topsoil', hint: 'A real fix, on a state contract.', cost: s => ({ money: r25(1600 + N(s) * 120) }), now: [{ k: 'morale', n: 4 }, { k: 'dose', n: -0.03 }], risk: { p: 0.12, good: 'The roof reads clean.', bad: 'The crew missed the gutters.', lose: [{ k: 'morale', n: -2 }] }, line: 'A crew decontaminated the place.' },
          { id: 'scrub', label: 'Scrub the roof and bury the topsoil in a trench', hint: 'A week, dirty hands, and a mask.', cost: () => ({ hours: 14 }), now: [{ k: 'dose', n: -0.01 }], risk: { p: 0.38, good: 'The meter is better.', bad: 'You tracked it in the house.', lose: [{ k: 'dose', n: 0.08 }] }, line: 'You scrubbed and buried.' },
          { id: 'rain', label: 'Let the rain wash it, and keep the garden covered', hint: 'No work. It goes somewhere.', now: [{ k: 'morale', n: -1 }], risk: { p: 0.45, good: 'It washed off.', bad: 'It washed into the well.', lose: [{ k: 'dose', n: 0.1 }] }, line: 'You waited for the rain.' },
        ] },
      { id: 'rebuild', phase: 'season', title: 'Planting where it fell', fallback: 'raised',
        text: 'The soil is quiet now. The instruments say the worst is over. Nobody is sure it is.',
        options: [
          { id: 'new', label: 'Buy clean topsoil and make raised beds', hint: 'A lot of dirt. A sure thing.', cost: s => ({ money: r25(700 + N(s) * 60) }), now: [{ k: 'stock', id: 'compost', n: 3 }, { k: 'stock', id: 'seed', n: 1 }], risk: { p: 0.1, good: 'Clean soil, clean food.', bad: 'The soil was not clean either.', lose: [{ k: 'dose', n: 0.05 }] }, line: 'You built raised beds.' },
          { id: 'raised', label: 'Plant in raised beds on clean imported compost', hint: 'Hours of hauling.', cost: () => ({ hours: 12 }), now: [{ k: 'stock', id: 'seed', n: 1 }], risk: { p: 0.3, good: 'A good bed.', bad: 'The compost was hot.', lose: [{ k: 'dose', n: 0.06 }] }, line: 'You planted in raised beds.' },
          { id: 'rest', label: 'Rest the garden and eat from the pantry', hint: 'Safe, hungry.', now: [{ k: 'morale', n: -3 }], risk: { p: 0.2, good: 'The pantry held.', bad: 'It did not.', lose: [{ k: 'stock', id: 'canned', n: -3 }] }, line: 'You rested the garden.' },
        ] },
    ], false),
    ...genericCards('nuclear').slice(1),
  ],
};
