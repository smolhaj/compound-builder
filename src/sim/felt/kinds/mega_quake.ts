import type { FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for mega_quake: the cabin's safety, shoring vs bolting, the aftershock night, the long camp. */
export const felt: FeltSpec = {
  cards: kindCards('mega_quake', [
    { id: 'red_tag', phase: 'hit', title: 'Is the cabin safe to sleep in', fallback: 'camp',
      text: 'The chimney is cracked and one wall has a diagonal split. The shaking is over, but a bad beam can fall next week.',
      options: [
        { id: 'engineer', label: 'Pay a structural engineer to inspect and tag it', hint: 'Green, yellow or red, in writing, with what to brace. Sure thing.', cost: s => ({ money: r25(450 + N(s) * 40) }), now: [{ k: 'morale', n: 3 }, { k: 'stock', id: 'lumber', n: 1 }], risk: { p: 0.06, good: 'Yellow: sleep in the downstairs room only.', bad: 'Red on the loft. Nobody goes up.', lose: [{ k: 'morale', n: -3 }] }, line: 'An engineer tagged the cabin.' },
        { id: 'diy', label: 'Check it yourselves and shore up the worst wall', hint: 'Ten hours with jacks and 4x4s, and you are guessing.', cost: () => ({ hours: 10 }), now: [{ k: 'stock', id: 'hardware', n: 1 }], risk: { p: 0.35, good: 'It holds when you push on it.', bad: 'A beam shifted while you worked.', win: [{ k: 'stock', id: 'lumber', n: 1 }], lose: [hurtOne('a crushed hand', 25)] }, line: 'You shored the wall by hand.' },
        { id: 'camp', label: 'Red-tag it yourselves and sleep in tents', hint: 'Nobody is under a bad roof. Everyone is cold.', cost: () => ({ hours: 2 }), now: [{ k: 'morale', n: -4 }], risk: { p: 0.22, good: 'A cold, quiet night.', bad: 'A cold night and a cough.', lose: [hurtOne('a chest cold', 10)] }, line: 'You slept in tents.' },
      ] },
    { id: 'shore_bolt', phase: 'hit', from: 1, to: 7, title: 'Shore up now, or bolt the sill down', fallback: 'shore',
      text: 'The cabin slid a few inches off its foundation. A bolted sill would fix it for good, but there is not time to do it right and nobody is sure when the next big one comes.',
      options: [
        { id: 'crew', label: 'Hire a crew to jack it level and bolt the sill', hint: 'The right fix, done right. Their schedule is booked for a month.', cost: s => ({ money: r25(2200 + N(s) * 150) }), now: [{ k: 'stock', id: 'hardware', n: 2 }, { k: 'morale', n: 4 }], risk: { p: 0.1, good: 'Level, bolted and safer than before.', bad: 'The crew was rushed and skipped a corner.', lose: [{ k: 'morale', n: -2 }] }, line: 'A crew bolted the sill.' },
        { id: 'shore', label: 'Cribbing and posts now, bolt it when you can', hint: 'Holds for the next small shake. A big one will undo it.', cost: () => ({ hours: 12 }), now: [{ k: 'stock', id: 'lumber', n: -2 }], risk: { p: 0.4, good: 'Posts are tight and the wall is straight.', bad: 'One post kicked out under load.', lose: [hurtOne('a bruised leg', 15)] }, line: 'You cribbed and shored the cabin.' },
        { id: 'leave', label: 'Leave it, move the household into the barn', hint: 'Nothing spent, nothing fixed. Warm hay and a lot of tension.', cost: () => ({ hours: 4 }), now: [{ k: 'morale', n: -5 }, { k: 'stock', id: 'hay', n: 0 }], risk: { p: 0.5, good: 'No more shaking this week.', bad: 'Another slip and the porch is gone.', lose: [{ k: 'stock', id: 'lumber', n: -1 }] }, line: 'You moved into the barn.' },
      ] },
    { id: 'aftershock_night', phase: 'month', from: 8, to: 20, title: 'The aftershock night', fallback: 'dressed',
      text: 'The radio says a strong aftershock is likely tonight. The kids will not sleep. Somebody has to decide where everyone lies down.',
      options: [
        { id: 'tent', label: 'Pay to set a big tent and heater in the open yard', hint: 'Dry, warm and in the open. Comfortable, for a tent.', cost: s => ({ money: r25(250 + N(s) * 60) }), now: [{ k: 'morale', n: 5 }, { k: 'stock', id: 'tent', n: 1 }], risk: { p: 0.1, good: 'A bad night, and everyone is safe.', bad: 'Wind knocked the tent flat.', lose: [{ k: 'morale', n: -3 }] }, line: 'You slept in the yard in a heated tent.' },
        { id: 'dressed', label: 'Sleep in clothes and boots in the doorway', hint: 'No cost, no sleep. The next shake finds you ready.', cost: () => ({ hours: 8 }), now: [{ k: 'morale', n: -3 }], risk: { p: 0.3, good: 'It was small. You got up and went back to bed.', bad: 'A falling shelf caught someone.', lose: [hurtOne('a cut forehead', 15)] }, line: 'You slept dressed by the door.' },
        { id: 'gather', label: 'Gather with the neighbors in the open field', hint: 'Safety in numbers. Someone sings.', cost: () => ({ stock: { firewood: 2 } }), off: noNeighbors, now: [{ k: 'standing', n: 7 }, { k: 'humanity', n: 2 }, { k: 'morale', n: 2 }], risk: { p: 0.2, good: 'A long night, and a stronger district.', bad: 'Somebody lit a fire too close to the hay.', lose: [{ k: 'stock', id: 'hay', n: -1 }] }, line: 'The district slept in the field.' },
      ] },
    { id: 'rebuild', phase: 'season', title: 'What to do about the chimney and the well', fallback: 'inspect',
      text: 'The cracked chimney is a fire in waiting and the well casing may be bent. Neither can wait for spring.',
      options: [
        { id: 'mason', label: 'Hire a mason and a well driller', hint: 'Two crews, two invoices, both sure.', cost: s => ({ money: r25(2600 + N(s) * 200) }), now: [{ k: 'stock', id: 'hardware', n: 1 }, { k: 'morale', n: 5 }], line: 'Pros fixed the chimney and the well.' },
        { id: 'inspect', label: 'Line the flue with a stainless liner and test the casing yourselves', hint: 'A week of tricky work and a borrowed camera.', cost: () => ({ hours: 14 }), now: [{ k: 'stock', id: 'pipe', n: 0 }], risk: { p: 0.35, good: 'It drafts clean.', bad: 'The liner kinked and smoked the house.', lose: [hurtOne('smoke inhalation', 12)] }, line: 'You relined the flue.' },
        { id: 'skip', label: 'Cap the chimney and haul water from the creek', hint: 'No cost in cash. A winter without a stove.', cost: () => ({ stock: { fuel: 1 } }), now: [{ k: 'stock', id: 'water_jugs', n: 2 }, { k: 'morale', n: -5 }], risk: { p: 0.45, good: 'You got through the winter.', bad: 'A cold, wet winter.', lose: [hurtOne('a chest cold', 12)] }, line: 'You capped the chimney and carried water.' },
      ] },
  ]),
};
