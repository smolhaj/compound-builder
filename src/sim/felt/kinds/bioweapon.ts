import type { FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for bioweapon: a made sickness, so the cards are about its tests, its source, and what the county does. */
export const felt: FeltSpec = {
  cards: kindCards('bioweapon', [
    { id: 'sealed_house', phase: 'hit', title: 'Seal the house, or keep the road open', fallback: 'seal',
      text: 'The county says it is not natural. Hospital staff are not coming back to work. Nobody can say how far it has spread.',
      options: [
        { id: 'suits', label: 'Buy sealed suits, filters and a decon tent', hint: 'Money buys a sealed way out and a safe way in.', cost: s => ({ money: r25(900 + N(s) * 150) }), now: [{ k: 'stock', id: 'nbc_filter', n: 3 }, { k: 'stock', id: 'hygiene', n: 3 }, { k: 'morale', n: 2 }], risk: { p: 0.08, good: 'A tight setup, tested.', bad: 'A seal was bad.', lose: [{ k: 'fever' }] }, line: 'You bought sealing gear.' },
        { id: 'seal', label: 'Tape and plastic every opening and keep everyone inside', hint: 'Cheap and miserable. It buys days, not weeks.', cost: () => ({ hours: 8, stock: { poly_film: 1 } }), now: [{ k: 'morale', n: -5 }, { k: 'raidDelay', days: 5 }], risk: { p: 0.25, good: 'Nobody came in and nobody coughed.', bad: 'A seam failed.', lose: [{ k: 'fever' }] }, line: 'You sealed the house.' },
        { id: 'leave', label: 'Take the household to the hunting camp, upwind', hint: 'Away from the road. A cold, thin camp.', cost: () => ({ hours: 6, stock: { fuel: 1 } }), now: [{ k: 'morale', n: -3 }], risk: { p: 0.4, good: 'A quiet camp, a quiet month.', bad: 'Cold damp and a hard cough.', lose: [hurtOne('a chest cold', 12)] }, line: 'You moved to the hunting camp.' },
      ] },
    { id: 'testing', phase: 'hit', from: 1, to: 6, title: 'The man selling tests', fallback: 'ignore',
      text: 'A man at the gate has a case of rapid tests. He says they work. He is not wearing a mask, and he is very polite.',
      options: [
        { id: 'buy', label: 'Buy a box of tests', hint: 'If they work, you know who is sick.', cost: s => ({ money: r25(300 + N(s) * 60) }), now: [{ k: 'stock', id: 'meds', n: 1 }], risk: { p: 0.3, good: 'The tests worked.', bad: 'They were water and a strip of paper.', lose: [{ k: 'morale', n: -2 }] }, line: 'You bought tests.' },
        { id: 'ignore', label: 'Send him on without opening the gate', hint: 'Free, and he might be right.', now: [{ k: 'raidDelay', days: 1 }], risk: { p: 0.2, good: 'He moved on.', bad: 'He told the county you were hiding something.', lose: [{ k: 'standing', n: -3 }] }, line: 'You sent him on.' },
        { id: 'trade', label: 'Trade a couple of cans for one test, to see', hint: 'A cheap look.', cost: () => ({ stock: { canned: 2 } }), now: [{ k: 'humanity', n: 1 }], risk: { p: 0.4, good: 'It worked, and you could tell.', bad: 'It did not, and you could not.', lose: [{ k: 'morale', n: -1 }] }, line: 'You traded for one test.' },
      ] },
    { id: 'source', phase: 'month', title: 'Where it came from', fallback: 'watch',
      text: 'A rumor says it came from a plant on the county line. A neighbor is walking the fence with a rifle and a map.',
      options: [
        { id: 'report', label: 'Radio what you know to the county and the state', hint: 'Public, honest and slow. It may help.', cost: () => ({ hours: 3 }), now: [{ k: 'humanity', n: 3 }, { k: 'standing', n: 3 }], risk: { p: 0.4, good: 'Someone heard it.', bad: 'The line was jammed.', lose: [{ k: 'morale', n: -1 }] }, line: 'You radioed what you knew.' },
        { id: 'watch', label: 'Watch the road and keep your head down', hint: 'Quiet. You learn nothing.', now: [{ k: 'raidDelay', days: 3 }], risk: { p: 0.3, good: 'A quiet month.', bad: 'The neighbor with the rifle came to your gate.', lose: [{ k: 'raidDelay', days: -4 }] }, line: 'You kept your head down.' },
        { id: 'rally', label: 'Join the neighbors to seal the road at the county line', hint: 'A shared roadblock. Hard work and hard feelings.', cost: () => ({ hours: 8 }), off: noNeighbors, now: [{ k: 'standing', n: 7 }, { k: 'respect', n: 0.1 }], risk: { p: 0.3, good: 'The road is sealed.', bad: 'A shouting match that nearly turned.', lose: [{ k: 'standing', n: -5 }] }, line: 'You joined the roadblock.' },
      ] },
    { id: 'survivors', phase: 'season', title: 'The ones who walked away', fallback: 'feed',
      text: 'People from the sealed towns are on the road. Some are well. Some are not. You cannot tell the difference at fifty feet.',
      options: [
        { id: 'tent', label: 'Pay to run a quarantine tent at the gate', hint: 'Fourteen days, a bed, a bowl. A kindness with a rule.', cost: s => ({ money: r25(800 + N(s) * 80) }), now: [{ k: 'humanity', n: 6 }, { k: 'standing', n: 5 }, { k: 'stock', id: 'tent', n: -1 }], risk: { p: 0.2, good: 'Fourteen days, no one sick.', bad: 'Someone was sick on day twelve.', lose: [{ k: 'fever' }] }, line: 'You ran a quarantine tent.' },
        { id: 'feed', label: 'Leave food and water at the end of the drive', hint: 'No contact. They thank you from the road.', cost: () => ({ stock: { canned: 3 } }), now: [{ k: 'humanity', n: 3 }], risk: { p: 0.1, good: 'It was gone by morning.', bad: 'Someone left a note: they are not going.', lose: [{ k: 'raidDelay', days: -2 }] }, line: 'You left food at the end of the drive.' },
        { id: 'turn', label: 'Turn them all away', hint: 'Safe. Cold. Remembered.', cost: () => ({ humanity: 6, standing: 4 }), now: [{ k: 'respect', n: 0.05 }, { k: 'raidDelay', days: 3 }], line: 'You turned them away.' },
      ] },
  ]),
};
