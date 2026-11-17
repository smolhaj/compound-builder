import type { FeltSpec } from '../types';
import { kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for pandemic: the generic "Keep the sickness out" hit card (shared with bioweapon's own variant), then the quarantine month and the immune season. */
import { genericCards } from '../cardLibrary';
export const felt: FeltSpec = {
  cards: [
    genericCards('pandemic')[0],
    ...kindCards('pandemic', [
      { id: 'quarantine_room', phase: 'hit', from: 1, to: 6, title: 'A room for the sick', fallback: 'room',
        text: 'Somebody has a cough that will not clear. Do you wall off a room, or hope it is only a cold?',
        options: [
          { id: 'kit', label: 'Buy masks, gloves and a thermometer for the sick room', hint: 'A proper isolation kit. Small cost, good protection.', cost: s => ({ money: r25(120 + N(s) * 40) }), now: [{ k: 'stock', id: 'hygiene', n: 2 }, { k: 'stock', id: 'ors', n: 2 }], risk: { p: 0.12, good: 'The sick room is tight.', bad: 'A mask slipped on the night nurse.', lose: [{ k: 'fever' }] }, line: 'You kitted out a sick room.' },
          { id: 'room', label: 'Close off a room, one nurse only, boil everything', hint: 'Free in cash. A week of hard nights.', cost: () => ({ hours: 10 }), now: [{ k: 'morale', n: -2 }], risk: { p: 0.35, good: 'It stayed in the one room.', bad: 'The cough went round anyway.', lose: [{ k: 'fever' }] }, line: 'You closed off a sick room.' },
          { id: 'watch', label: 'Do not isolate; watch and wash', hint: 'Life stays normal. If it spreads, it spreads.', now: [{ k: 'morale', n: 3 }], risk: { p: 0.5, good: 'It was only a cold.', bad: 'It was not a cold.', lose: [{ k: 'fever' }, { k: 'fever' }] }, line: 'You watched and washed.' },
        ] },
      { id: 'clinic', phase: 'month', title: 'The clinic is overrun', fallback: 'home',
        text: 'The clinic waiting room is a hallway of coughing people. The nurse is working 20 hours a day.',
        options: [
          { id: 'pay', label: 'Pay for a nurse to come to the house', hint: 'Real care, delivered. She is exhausted and honest.', cost: s => ({ money: r25(700 + N(s) * 70) }), now: [{ k: 'health', n: 20, who: 'all' }, { k: 'stock', id: 'meds', n: 2 }], risk: { p: 0.1, good: 'Everyone is on the mend.', bad: 'She could not stay.', lose: [{ k: 'health', n: -4, who: 'one' }] }, line: 'A nurse came to the house.' },
          { id: 'home', label: 'Nurse them at home with fluids, rest and your own meds', hint: 'A lot of sitting up at night. It mostly works.', cost: () => ({ hours: 12 }), now: [{ k: 'stock', id: 'meds', n: -1 }, { k: 'health', n: 10, who: 'all' }], risk: { p: 0.3, good: 'Everyone turned the corner.', bad: 'One of you got worse.', lose: [{ k: 'health', n: -10, who: 'one' }] }, line: 'You nursed the sick at home.' },
          { id: 'share', label: 'Share what you have with the sick neighbors', hint: 'A lot of trips, a lot of risk, and you will be remembered.', cost: () => ({ stock: { meds: 1, ors: 1 } }), off: noNeighbors, now: [{ k: 'standing', n: 8 }, { k: 'humanity', n: 4 }], risk: { p: 0.3, good: 'They recovered and said so.', bad: 'You brought it back home.', lose: [{ k: 'fever' }] }, line: 'You carried help to the neighbors.' },
        ] },
      { id: 'immune', phase: 'season', title: 'The survivors, and the second wave', fallback: 'cautious',
        text: 'Those who had it and lived are going about as if they cannot catch it. The second wave is in the next county.',
        options: [
          { id: 'nurse', label: 'Hire a recovered nurse to run a house-call round', hint: 'Immune, careful and busy.', cost: s => ({ money: r25(900 + N(s) * 80) }), now: [{ k: 'stock', id: 'meds', n: 3 }, { k: 'health', n: 5, who: 'all' }], line: 'You hired a recovered nurse.' },
          { id: 'cautious', label: 'Keep the gate half-shut and make the survivors the visitors', hint: 'Safer than before, less social.', cost: () => ({ hours: 5 }), now: [{ k: 'raidDelay', days: 3 }, { k: 'morale', n: -1 }], risk: { p: 0.25, good: 'Nothing came in.', bad: 'A second strain slipped by.', lose: [{ k: 'fever' }] }, line: 'You made the survivors your visitors.' },
          { id: 'open', label: 'Open the gate and trade again', hint: 'The district recovers. So might the cough.', now: [{ k: 'standing', n: 6 }, { k: 'morale', n: 5 }], risk: { p: 0.4, good: 'A busy market, a healthy week.', bad: 'The second wave arrived by wagon.', lose: [{ k: 'fever' }] }, line: 'You opened the gate.' },
        ] },
    ], false),
    ...genericCards('pandemic').slice(1),
  ],
};
