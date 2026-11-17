import type { FeltSpec } from '../types';
import { kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for reactor_meltdown: the plume on the radio, the shelter-in-place order, the milk and the creek. Distinct from nuclear's (a bomb) fallout cards. */
export const felt: FeltSpec = {
  cards: kindCards('reactor_meltdown', [
    { id: 'plume', phase: 'hit', title: 'The shelter-in-place order', fallback: 'inside',
      text: 'The radio says to stay inside, shut the windows, bring the animals in and wait for word. Nobody can say how long.',
      options: [
        { id: 'pills', label: 'Buy potassium iodide and a dosimeter', hint: 'A real protection for the thyroid, and a way to know.', cost: s => ({ money: r25(200 + N(s) * 70) }), now: s => [{ k: 'stock', id: 'potassium_iodide', n: N(s) }, { k: 'stock', id: 'geiger_counter', n: 1 }], risk: { p: 0.08, good: 'Everyone has a pill and a reading.', bad: 'The pills were old.', lose: [{ k: 'dose', n: 0.05 }] }, line: 'You bought pills and a dosimeter.' },
        { id: 'inside', label: 'Seal the house, bring the animals in and wait', hint: 'No cost in cash. The pantry takes a hit.', cost: s => ({ stock: { canned: N(s) } }), now: [{ k: 'morale', n: -4 }, { k: 'raidDelay', days: 4 }], risk: { p: 0.2, good: 'The plume passed over.', bad: 'The wind shifted at midnight.', lose: [{ k: 'dose', n: 0.1 }] }, line: 'You sealed the house.' },
        { id: 'leave', label: 'Evacuate upwind, to relatives', hint: 'Away from the plume, on a crowded road.', cost: () => ({ hours: 6, stock: { fuel: 1 } }), now: [{ k: 'morale', n: -2 }], risk: { p: 0.35, good: 'Out before the traffic.', bad: 'The road was jammed for five hours.', lose: [{ k: 'dose', n: 0.12 }] }, line: 'You evacuated upwind.' },
      ] },
    { id: 'milk', phase: 'hit', from: 1, to: 7, title: 'The milk and the creek', fallback: 'dump',
      text: 'The state says to throw out milk and leafy greens until further notice. The creek is a matter of rumor.',
      options: [
        { id: 'test', label: 'Pay a lab to test the milk, well and creek', hint: 'A real answer, in a week.', cost: s => ({ money: r25(300 + N(s) * 30) }), now: [{ k: 'morale', n: 2 }], risk: { p: 0.15, good: 'The well is clean.', bad: 'The milk is hot.', lose: [{ k: 'morale', n: -3 }] }, line: 'A lab tested your water.' },
        { id: 'dump', label: 'Dump the milk, pull the greens and eat from the pantry', hint: 'Safe and wasteful.', cost: () => ({ hours: 4 }), now: [{ k: 'morale', n: -2 }], risk: { p: 0.1, good: 'No one drank it.', bad: 'A child sneaked a glass.', lose: [{ k: 'dose', n: 0.05 }] }, line: 'You dumped the milk.' },
        { id: 'share', label: 'Warn the neighbors and tell them what you learned', hint: 'A good turn. Maybe you are wrong.', cost: () => ({ hours: 2 }), off: noNeighbors, now: [{ k: 'standing', n: 7 }, { k: 'humanity', n: 2 }], risk: { p: 0.25, good: 'They listened.', bad: 'They called you a scaremonger.', lose: [{ k: 'standing', n: -4 }] }, line: 'You warned the neighbors.' },
      ] },
    { id: 'zone', phase: 'month', title: 'The exclusion zone line', fallback: 'stay',
      text: 'The state has drawn a line around the plant. Your place is just outside it, and the mapmakers say next month it may be inside.',
      options: [
        { id: 'move', label: 'Pay to move the household to a rental up the valley', hint: 'A fresh place and a bill.', cost: s => ({ money: r25(1800 + N(s) * 100) }), now: [{ k: 'morale', n: -1 }, { k: 'dose', n: -0.02 }], risk: { p: 0.2, good: 'A clean new start.', bad: 'The landlord doubled the rent.', lose: [{ k: 'money', n: -300 }] }, line: 'You moved up the valley.' },
        { id: 'stay', label: 'Stay, monitor the dose and wash everything', hint: 'Your land, your work. Risk is on you.', cost: () => ({ hours: 8 }), now: [{ k: 'morale', n: -2 }], risk: { p: 0.3, good: 'The readings stayed low.', bad: 'A hot spot in the garden.', lose: [{ k: 'dose', n: 0.1 }] }, line: 'You stayed and monitored.' },
        { id: 'vote', label: 'Join the district petition to be moved or paid out', hint: 'A shared voice, a long process.', cost: () => ({ hours: 5 }), off: noNeighbors, now: [{ k: 'standing', n: 5 }, { k: 'respect', n: 0.05 }], risk: { p: 0.35, good: 'The state listened.', bad: 'It went to committee.', lose: [{ k: 'morale', n: -2 }] }, line: 'You signed the petition.' },
      ] },
    { id: 'harvest', phase: 'season', title: 'What to do with the harvest', fallback: 'eat',
      text: 'The crop is up. Some of it may be fine. Some of it may be hot. The state is slow with numbers.',
      options: [
        { id: 'sample', label: 'Pay to have each field sampled before harvest', hint: 'You will know which field to burn and which to eat.', cost: s => ({ money: r25(450 + N(s) * 40) }), now: [{ k: 'stock', id: 'seed', n: 1 }], risk: { p: 0.1, good: 'The east field is clean.', bad: 'The west field is hot.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You had the fields sampled.' },
        { id: 'eat', label: 'Eat what the dosimeter clears and burn the rest', hint: 'A lot of reading, a little waste.', cost: () => ({ hours: 8 }), now: s => [{ k: 'stock', id: 'canned', n: N(s) * 2 }], risk: { p: 0.25, good: 'It kept you fed.', bad: 'The meter lied.', lose: [{ k: 'dose', n: 0.08 }] }, line: 'You ate what the meter cleared.' },
        { id: 'trade', label: 'Trade clean produce to the quarantined families', hint: 'Humane and risky.', cost: s => ({ stock: { canned: N(s) } }), off: noNeighbors, now: [{ k: 'humanity', n: 4 }, { k: 'standing', n: 6 }], risk: { p: 0.2, good: 'They wept.', bad: 'Someone said it was not enough.', lose: [{ k: 'standing', n: -2 }] }, line: 'You traded clean produce.' },
      ] },
  ]),
};
