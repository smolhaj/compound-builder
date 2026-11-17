import type { FeltSpec } from '../types';
import { genericCards, hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for oil_shock: the empty pump, the fuel ration, the horse and the ditch. The generic money card stays after it. */
export const felt: FeltSpec = {
  cards: [
    ...kindCards('oil_shock', [
      { id: 'pumps', phase: 'hit', title: 'The pumps are empty', fallback: 'ration',
        text: 'The station has a line around the block and a hand-lettered sign: no gas. The tank in the truck is a quarter full.',
        options: [
          { id: 'buy', label: 'Pay a gray-market seller for fuel in jerricans', hint: 'Five times the price, and it burns.', cost: s => ({ money: r25(500 + N(s) * 60) }), now: [{ k: 'stock', id: 'fuel', n: 4 }], risk: { p: 0.15, good: 'Clean fuel in tight cans.', bad: 'Half of it was water.', lose: [{ k: 'stock', id: 'fuel', n: -2 }] }, line: 'You bought fuel on the gray market.' },
          { id: 'ration', label: 'Ration the fuel: one trip a week, combine every errand', hint: 'No cash. Smaller life.', cost: () => ({ hours: 2 }), now: [{ k: 'stock', id: 'fuel', n: 1 }, { k: 'morale', n: -2 }], risk: { p: 0.25, good: 'The truck lasted.', bad: 'A missed trip cost a day.', lose: [{ k: 'morale', n: -2 }] }, line: 'You rationed fuel.' },
          { id: 'carpool', label: 'Share rides and a trip schedule with the neighbors', hint: 'A shared tank and a shared calendar.', cost: () => ({ hours: 3 }), off: noNeighbors, now: [{ k: 'standing', n: 6 }, { k: 'stock', id: 'fuel', n: 1 }], risk: { p: 0.2, good: 'A carpool that runs.', bad: 'A neighbor missed his turn.', lose: [{ k: 'standing', n: -4 }] }, line: 'You set up a carpool.' },
        ] },
      { id: 'haul', phase: 'month', title: 'The load that will not move', fallback: 'horse',
        text: 'Trucks are idle at the elevator. The grain is ready and no diesel is coming.',
        options: [
          { id: 'rail', label: 'Pay for a spot on a rail car', hint: 'A real way to market, if the rail runs.', cost: s => ({ money: r25(900 + N(s) * 70) }), now: [{ k: 'money', n: 500 }], risk: { p: 0.2, good: 'It got to market.', bad: 'The car sat on a siding.', lose: [{ k: 'morale', n: -3 }] }, line: 'You shipped grain by rail.' },
          { id: 'horse', label: 'Haul by horse and wagon', hint: 'Slow, quiet and no fuel.', cost: () => ({ hours: 14 }), now: [{ k: 'money', n: 300 }], risk: { p: 0.3, good: 'It all got there.', bad: 'A broken axle.', lose: [hurtOne('a bruised shoulder', 12)] }, line: 'You hauled by wagon.' },
          { id: 'co-op', label: 'Share a load with three neighbors and one truck', hint: 'A fraction of the diesel each.', cost: () => ({ hours: 4, stock: { fuel: 1 } }), off: noNeighbors, now: [{ k: 'standing', n: 5 }, { k: 'money', n: 250 }], risk: { p: 0.22, good: 'It worked.', bad: 'One of them backed out.', lose: [{ k: 'standing', n: -4 }] }, line: 'You shared a load.' },
        ] },
      { id: 'energy', phase: 'season', title: 'What runs without gas', fallback: 'wood',
        text: 'The pump, the heat and the truck all burned gas. The woodlot is full of trees.',
        options: [
          { id: 'solar', label: 'Buy a small solar array for the pump', hint: 'A clean, quiet fix and a hole in your pocket.', cost: s => ({ money: r25(2000 + N(s) * 100) }), now: [{ k: 'stock', id: 'solar_panel', n: 2 }, { k: 'morale', n: 4 }], risk: { p: 0.1, good: 'The pump runs from the sun.', bad: 'One panel was cracked.', lose: [{ k: 'stock', id: 'solar_panel', n: -1 }] }, line: 'You bought solar for the pump.' },
          { id: 'wood', label: 'Cut and split wood, and rebuild the old wood stove', hint: 'A season of work, warm winters.', cost: () => ({ hours: 18 }), now: [{ k: 'stock', id: 'firewood', n: 8 }], risk: { p: 0.3, good: 'Warm and dry.', bad: 'The axe slipped.', lose: [hurtOne('a gashed leg', 20)] }, line: 'You cut wood and rebuilt the stove.' },
          { id: 'swap', label: 'Trade labor for wood and diesel with the neighbors', hint: 'You owe, they owe.', cost: () => ({ hours: 6 }), off: noNeighbors, now: [{ k: 'standing', n: 4 }, { k: 'stock', id: 'fuel', n: 1 }], risk: { p: 0.25, good: 'A fair trade.', bad: 'They shorted you.', lose: [{ k: 'standing', n: -3 }] }, line: 'You traded labor for fuel.' },
        ] },
    ], false),
    ...genericCards('oil_shock'),
  ],
};
