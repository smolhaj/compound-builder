import type { FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for drought: hauling water, the herd, the well and the rig. */
export const felt: FeltSpec = {
  cards: kindCards('drought', [
    { id: 'haul', phase: 'hit', title: 'The creek is a trickle', fallback: 'haul',
      text: 'The creek is down to a thread and the stock tank is half empty. Everyone drinks, washes and waters the garden from the same shrinking supply.',
      options: [
        { id: 'tanker', label: 'Pay for a tanker delivery of 1,000 gallons', hint: 'Clean water, delivered. It does not go far with livestock.', cost: s => ({ money: r25(350 + N(s) * 60) }), now: [{ k: 'stock', id: 'water_jugs', n: 6 }, { k: 'morale', n: 3 }], risk: { p: 0.1, good: 'The tank is full again.', bad: 'The driver short-filled the tank.', lose: [{ k: 'stock', id: 'water_jugs', n: -2 }] }, line: 'A tanker filled the tank.' },
        { id: 'haul', label: 'Haul water from the pond, with buckets and the truck', hint: 'Every trip is a mile. Eight hours of sweating.', cost: () => ({ hours: 8 }), now: [{ k: 'stock', id: 'water_jugs', n: 4 }], risk: { p: 0.3, good: 'A full tank and sore arms.', bad: 'The pond water was foul.', lose: [{ k: 'fever' }] }, line: 'You hauled water from the pond.' },
        { id: 'cut', label: 'Cut back: no garden, short washes, boil nothing twice', hint: 'Saves water and food in the ground, costs morale and the garden.', now: [{ k: 'stock', id: 'water_jugs', n: 2 }, { k: 'morale', n: -4 }], risk: { p: 0.25, good: 'The tank lasts.', bad: 'The garden shriveled.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You cut water use to the bone.' },
      ] },
    { id: 'herd', phase: 'hit', from: 2, to: 7, title: 'The herd and the dry pasture', fallback: 'sell',
      text: 'Grass is brown stubble. There is hay for two weeks, and every neighbor with animals is counting the same.',
      options: [
        { id: 'feed', label: 'Buy hay at the inflated price', hint: 'Keeps every animal alive for a month.', cost: s => ({ money: r25(500 + N(s) * 80) }), now: [{ k: 'stock', id: 'hay', n: 4 }], risk: { p: 0.1, good: 'The animals hold weight.', bad: 'The hay was moldy.', lose: [{ k: 'stock', id: 'hay', n: -2 }] }, line: 'You bought hay.' },
        { id: 'sell', label: 'Cull the herd to what the pasture can feed', hint: 'Meat on the table now, a smaller herd for years.', cost: () => ({ hours: 6 }), now: [{ k: 'stock', id: 'canned', n: 6 }, { k: 'morale', n: -2 }], risk: { p: 0.2, good: 'A hard day, and a stocked pantry.', bad: 'Half the meat spoiled in the heat.', lose: [{ k: 'stock', id: 'canned', n: -3 }] }, line: 'You culled the herd.' },
        { id: 'trade', label: 'Send the herd to a neighbor with a pond, for a share', hint: 'The animals live. You trust a neighbor.', cost: () => ({ stock: { canned: 2 } }), off: noNeighbors, now: [{ k: 'standing', n: 6 }, { k: 'humanity', n: 2 }], risk: { p: 0.32, good: 'They are fat and well.', bad: 'He sold half and lied about it.', lose: [{ k: 'standing', n: -6 }] }, line: 'You sent the herd to a neighbor.' },
      ] },
    { id: 'well', phase: 'month', title: 'Deepen the well, or pay a rig', fallback: 'dig',
      text: 'The well is pulling air. If it goes dry, you are hauling every drop. A rig can reach water; digging by hand will not.',
      options: [
        { id: 'rig', label: 'Pay a drilling rig to go 100 feet deeper', hint: 'A real fix, and a long bill. They can start Tuesday.', cost: s => ({ money: r25(4200 + N(s) * 150) }), now: [{ k: 'stock', id: 'water_jugs', n: 4 }, { k: 'morale', n: 6 }], risk: { p: 0.12, good: 'Water at 220 feet and cold.', bad: 'They hit rock and quit early.', lose: [{ k: 'morale', n: -3 }] }, line: 'A rig deepened the well.' },
        { id: 'dig', label: 'Lower the pump, clean the screen and drop the intake by hand', hint: 'Cheap, a week of work, and it might only buy a month.', cost: () => ({ hours: 14 }), now: [{ k: 'stock', id: 'water_jugs', n: 2 }], risk: { p: 0.4, good: 'The pump drew clean water again.', bad: 'The screen was too far gone.', lose: [hurtOne('a pinched hand', 12)] }, line: 'You lowered the pump and cleaned the screen.' },
        { id: 'share', label: 'Share a rig with two neighbors and split the cost', hint: 'A third of the bill, and a third of the water rights.', cost: s => ({ money: r25(1500 + N(s) * 50) }), off: noNeighbors, now: [{ k: 'standing', n: 6 }, { k: 'stock', id: 'water_jugs', n: 3 }], risk: { p: 0.25, good: 'Three families, one good well.', bad: 'A fight over the schedule.', lose: [{ k: 'standing', n: -6 }] }, line: 'You shared a rig with the neighbors.' },
      ] },
    { id: 'rain_dance', phase: 'season', title: 'Planting into dust', fallback: 'dryland',
      text: 'It is planting time and the soil is powder. A wasted seed is a hungry month next fall.',
      options: [
        { id: 'drip', label: 'Buy a drip line and tank for a small plot', hint: 'Water goes straight to the roots. A little goes a long way.', cost: s => ({ money: r25(500 + N(s) * 70) }), now: s => [{ k: 'stock', id: 'seed', n: N(s) }], risk: { p: 0.1, good: 'Every plant gets a cup.', bad: 'The line clogged halfway.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You laid drip line.' },
        { id: 'dryland', label: 'Dry-farm the hardy crops: millet, beans, sunflowers', hint: 'Needs patience and luck. Less yield, no extra water.', cost: () => ({ hours: 12 }), now: [{ k: 'stock', id: 'seed', n: 1 }], risk: { p: 0.35, good: 'The beans came up.', bad: 'The wind took the topsoil.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You dry-farmed the hardy crops.' },
        { id: 'skip', label: 'Skip planting and live off the pantry this year', hint: 'No seed lost. A harder fall.', now: [{ k: 'morale', n: -4 }], risk: { p: 0.5, good: 'The pantry stretched.', bad: 'The pantry did not stretch.', lose: [{ k: 'stock', id: 'canned', n: -4 }] }, line: 'You skipped planting.' },
      ] },
  ]),
};
