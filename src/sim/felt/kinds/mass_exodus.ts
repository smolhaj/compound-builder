import type { FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for mass_exodus: host families, billeting, curfew. */
export const felt: FeltSpec = {
  cards: kindCards('mass_exodus', [
    { id: 'column', phase: 'hit', title: 'The column on the road', fallback: 'water',
      text: 'Hundreds of people are walking past, with carts, strollers and bundles. Some stop at the fence and ask for water. Most do not ask.',
      options: [
        { id: 'camp', label: 'Pay to run a water and food point at the gate for a week', hint: 'A real service, a long week. A kindness a lot of people will remember.', cost: s => ({ money: r25(700 + N(s) * 80) }), now: [{ k: 'humanity', n: 6 }, { k: 'standing', n: 6 }, { k: 'stock', id: 'water_jugs', n: -2 }], risk: { p: 0.18, good: 'Nobody drank from the ditch.', bad: 'A scuffle at the tap.', lose: [hurtOne('a bruised ribcage', 15)] }, line: 'You ran a water point.' },
        { id: 'water', label: 'Leave a drum of water and a cup at the gate', hint: 'Cheap, quick and not a promise.', cost: () => ({ hours: 2 }), now: [{ k: 'stock', id: 'water_jugs', n: -2 }, { k: 'humanity', n: 3 }], risk: { p: 0.1, good: 'It is gone by noon.', bad: 'The crowd tipped the drum.', lose: [{ k: 'morale', n: -1 }] }, line: 'You left a drum of water.' },
        { id: 'close', label: 'Shut the gate and stand on the porch', hint: 'You keep what you have. They walk on.', cost: () => ({ humanity: 4 }), now: [{ k: 'raidDelay', days: 2 }, { k: 'respect', n: 0.04 }], risk: { p: 0.25, good: 'They passed.', bad: 'Some of them did not go on.', lose: [{ k: 'raidDelay', days: -3 }] }, line: 'You shut the gate.' },
      ] },
    { id: 'host', phase: 'hit', from: 1, to: 7, title: 'A family asks for a roof', fallback: 'barn',
      text: 'A mother with three children and her father stand at the door. "We only. It is only for the night. The baby has a fever."',
      options: [
        { id: 'house', label: 'Host the whole family in the house', hint: 'A full house, a warm one. The baby may be sick.', cost: s => ({ stock: { canned: N(s) * 2 } }), now: [{ k: 'humanity', n: 7 }, { k: 'standing', n: 5 }], risk: { p: 0.22, good: 'The baby\'s fever broke by morning.', bad: 'The fever went through the house.', lose: [{ k: 'fever' }] }, line: 'You hosted the family.' },
        { id: 'barn', label: 'Put them in the barn with a stove and blankets', hint: 'Dry and warm and apart.', cost: () => ({ hours: 3 }), now: [{ k: 'stock', id: 'firewood', n: -2 }, { k: 'humanity', n: 3 }, { k: 'standing', n: 3 }], risk: { p: 0.12, good: 'A quiet night.', bad: 'The stove smoked.', lose: [{ k: 'morale', n: -2 }] }, line: 'You put them in the barn.' },
        { id: 'camp', label: 'Direct them to the church where the county is billeting', hint: 'Not your problem, not your fault.', cost: () => ({ humanity: 3 }), now: [{ k: 'raidDelay', days: 1 }], risk: { p: 0.3, good: 'They found a spot.', bad: 'The church was full.', lose: [{ k: 'standing', n: -3 }] }, line: 'You sent them to the church.' },
      ] },
    { id: 'billet', phase: 'month', title: 'Billeting for the winter', fallback: 'house',
      text: 'The county wants every farm to take in refugees through the winter. Four families are waiting in the church.',
      options: [
        { id: 'house', label: 'Take a family and a stove in the house', hint: 'One family. One winter. They work for their keep.', cost: () => ({ hours: 4 }), now: s => [{ k: 'stock', id: 'canned', n: -N(s) * 3 }, { k: 'stock', id: 'firewood', n: -3 }, { k: 'humanity', n: 6 }, { k: 'standing', n: 6 }, { k: 'morale', n: 2 }], risk: { p: 0.25, good: 'They work as hard as anyone.', bad: 'A crowded winter wears on all of you.', lose: [{ k: 'morale', n: -5 }] }, line: 'You billeted a family.' },
        { id: 'share', label: 'Pay the county a levy in place of a bed', hint: 'The county houses them. Your conscience is your own.', cost: s => ({ money: r25(600 + N(s) * 60) }), now: [{ k: 'standing', n: 2 }], risk: { p: 0.1, good: 'The county kept its word.', bad: 'The levy went up the next month.', lose: [{ k: 'money', n: -150 }] }, line: 'You paid the county levy.' },
        { id: 'refuse', label: 'Refuse and say the house is full', hint: 'Warm and quiet. The county remembers.', cost: () => ({ humanity: 5, standing: 6 }), now: [{ k: 'raidDelay', days: 2 }], line: 'You said the house was full.' },
      ] },
    { id: 'curfew', phase: 'season', title: 'The curfew', fallback: 'support',
      text: 'The district wants a curfew and a checkpoint at the crossroads. The newcomers say it targets them. The old residents say it protects everyone.',
      options: [
        { id: 'support', label: 'Support the curfew, with a day-pass for the newcomers', hint: 'A compromise nobody loves.', cost: () => ({ hours: 5 }), off: noNeighbors, now: [{ k: 'standing', n: 4 }, { k: 'respect', n: 0.08 }, { k: 'raidDelay', days: 6 }], risk: { p: 0.3, good: 'The pass system held.', bad: 'A bad night at the crossroads.', lose: [{ k: 'standing', n: -5 }] }, line: 'You backed the curfew.' },
        { id: 'oppose', label: 'Speak against the curfew and offer a mixed watch', hint: 'Newcomers and old hands together. It can work.', cost: () => ({ hours: 8 }), now: [{ k: 'humanity', n: 4 }, { k: 'standing', n: -2 }], risk: { p: 0.35, good: 'The mixed watch won them over.', bad: 'You were shouted down.', lose: [{ k: 'standing', n: -5 }] }, line: 'You spoke against the curfew.' },
        { id: 'stay_out', label: 'Stay out of it', hint: 'Not your fight. Both sides notice.', cost: () => ({ standing: 3 }), risk: { p: 0.2, good: 'Nothing came of it.', bad: 'Nobody listened to you later.', lose: [{ k: 'raidDelay', days: -2 }] }, line: 'You stayed out of the curfew fight.' },
      ] },
  ]),
};
