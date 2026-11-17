import type { FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for dam_flood: the stores uphill, the muck, the neighbors who need a dry roof. */
export const felt: FeltSpec = {
  cards: kindCards('dam_flood', [
    { id: 'uphill', phase: 'hit', title: 'Move the stores uphill', fallback: 'carry',
      text: 'The water is still rising in the low field. The cellar, the barn and the pump house are all under the line the radio gave.',
      options: [
        { id: 'haulers', label: 'Pay two men with a flatbed to move it all', hint: 'An hour of hauling and the cellar is empty. They charge double.', cost: s => ({ money: r25(700 + N(s) * 100) }), now: [{ k: 'morale', n: 3 }], risk: { p: 0.08, good: 'Everything was above the line by dark.', bad: 'One load slid off the truck.', lose: [{ k: 'stock', id: 'canned', n: -2 }] }, line: 'Hired haulers moved the stores.' },
        { id: 'carry', label: 'Carry what you can by hand, food and seed first', hint: 'Slow. You pick what lives and what drowns.', cost: () => ({ hours: 10 }), risk: { p: 0.35, good: 'The food and seed made it.', bad: 'The water came faster than you did.', win: [{ k: 'stock', id: 'seed', n: 1 }], lose: [{ k: 'stock', id: 'canned', n: -3 }, hurtOne('a strained back', 15)] }, line: 'You carried stores uphill by hand.' },
        { id: 'sandbag', label: 'Sandbag the cellar door and hope', hint: 'Cheap and tiring, and the water decides.', cost: () => ({ stock: { sandbags: 2 }, hours: 6 }), now: [{ k: 'morale', n: -1 }], risk: { p: 0.5, good: 'The door held.', bad: 'Water came over the top.', lose: [{ k: 'stock', id: 'staples', n: -4 }] }, line: 'You sandbagged the cellar.' },
      ] },
    { id: 'shelter', phase: 'hit', from: 1, to: 6, title: 'The neighbors with water in the kitchen', fallback: 'barn',
      text: 'A family from the bottom land is standing at the gate, wet to the knees, with two kids and a dog. They want a dry floor.',
      options: [
        { id: 'house', label: 'Put them up in the house', hint: 'Crowded and warm. They remember who opened the door.', cost: s => ({ stock: { canned: N(s) * 2 } }), now: [{ k: 'standing', n: 9 }, { k: 'humanity', n: 4 }], risk: { p: 0.18, good: 'They help, and nobody gets sick.', bad: 'A cough went round the house.', lose: [{ k: 'fever' }] }, line: 'You took them in.' },
        { id: 'barn', label: 'Offer the barn and a stove', hint: 'Dry and out of the way. Less warm, less risk.', cost: () => ({ hours: 3, stock: { firewood: 2 } }), now: [{ k: 'standing', n: 4 }, { k: 'humanity', n: 2 }], risk: { p: 0.1, good: 'A quiet night.', bad: 'The stove smoked and they left at dawn.', lose: [{ k: 'standing', n: -2 }] }, line: 'You gave them the barn.' },
        { id: 'road', label: 'Point them to the shelter on the ridge', hint: 'Nothing spent. They remember that too.', cost: () => ({ humanity: 3 }), now: [{ k: 'raidDelay', days: 1 }], risk: { p: 0.3, good: 'They found the shelter.', bad: 'They had to turn back in the dark.', lose: [{ k: 'standing', n: -5 }] }, line: 'You sent them up the ridge.' },
      ] },
    { id: 'muck', phase: 'month', title: 'The mud line in every room', fallback: 'dry',
      text: 'The water went down and left a brown line at knee height and a smell. Mold will be in the walls in a week.',
      options: [
        { id: 'crew', label: 'Hire a cleanup crew with pumps and bleach', hint: 'A real dry-out. Quick, and worth it.', cost: s => ({ money: r25(900 + N(s) * 120) }), now: [{ k: 'morale', n: 4 }], risk: { p: 0.1, good: 'The walls are dry and clean.', bad: 'They missed the floor joists.', lose: [{ k: 'morale', n: -2 }] }, line: 'A crew dried the house out.' },
        { id: 'dry', label: 'Muck it out, strip the drywall, run fans and fires', hint: 'Dirty, heavy work. Costs firewood and a lot of hours.', cost: () => ({ hours: 18, stock: { firewood: 2 } }), now: [{ k: 'stock', id: 'lumber', n: 1 }], risk: { p: 0.33, good: 'The frame is sound and drying.', bad: 'Mold took hold in one wall.', lose: [{ k: 'fever' }] }, line: 'You mucked out the house.' },
        { id: 'neighbors', label: 'Work a muck-out day with the neighbors, house by house', hint: 'Many hands, one weekend, and you owe the same back.', cost: () => ({ hours: 9 }), off: noNeighbors, now: [{ k: 'standing', n: 7 }, { k: 'morale', n: 3 }], risk: { p: 0.2, good: 'Four houses in a day.', bad: 'Somebody hurt a wrist on the first one.', lose: [hurtOne('a sprained wrist', 10)] }, line: 'The district mucked out together.' },
      ] },
    { id: 'low_field', phase: 'season', title: 'The silted bottom field', fallback: 'wait',
      text: 'Silt sits two inches deep across the best soil. It can be a gift or a crust, depending on what you do.',
      options: [
        { id: 'till', label: 'Rent a tractor and till it in', hint: 'A day and a half and a full tank.', cost: s => ({ money: r25(450 + N(s) * 60) }), now: [{ k: 'stock', id: 'seed', n: 1 }], risk: { p: 0.12, good: 'It broke up and drank in.', bad: 'The silt crusted over.', lose: [{ k: 'morale', n: -2 }] }, line: 'You tilled the silt in.' },
        { id: 'hand', label: 'Fork and rake it in by hand', hint: 'Free and slow, and half the field is done by planting.', cost: () => ({ hours: 16 }), risk: { p: 0.35, good: 'It came up rich.', bad: 'Only the near half is workable.', win: [{ k: 'stock', id: 'seed', n: 1 }], lose: [hurtOne('a wrenched back', 15)] }, line: 'You forked the field by hand.' },
        { id: 'wait', label: 'Let it dry a season and plant the high ground', hint: 'Safe. You lose a year on the best acre.', now: [{ k: 'morale', n: -2 }], risk: { p: 0.2, good: 'The high ground is enough.', bad: 'A thin harvest.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You planted the high ground only.' },
      ] },
  ]),
};
