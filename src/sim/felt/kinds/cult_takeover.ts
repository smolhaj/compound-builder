import type { FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for cult_takeover: join, feign, hold out, leave; the tithe. */
export const felt: FeltSpec = {
  cards: kindCards('cult_takeover', [
    { id: 'invitation', phase: 'hit', title: 'The Order\'s invitation', fallback: 'feign',
      text: 'Two people in plain gray stand at the gate with a basket of bread. "We are just, we are only here to help." Half the district has already signed their names in the ledger.',
      options: [
        { id: 'join', label: 'Join, and sign the ledger', hint: 'Peace and bread for the household, and the Order\'s hand in your stores.', cost: () => ({ hours: 3, humanity: 1 }), now: [{ k: 'raidDelay', days: 14 }, { k: 'standing', n: 6 }, { k: 'morale', n: 3 }], risk: { p: 0.35, good: 'They gave you a gray armband and a tithe date.', bad: 'The elder asked for the older boy to serve.', lose: [{ k: 'morale', n: -5 }, { k: 'standing', n: -3 }] }, line: 'You joined the Order.' },
        { id: 'feign', label: 'Feign interest, attend a meeting, give nothing', hint: 'Buys time. They are good at telling who is lying.', cost: () => ({ hours: 6 }), now: [{ k: 'raidDelay', days: 6 }], risk: { p: 0.4, good: 'They accepted a promise to return.', bad: 'The elder said the gate would not stay closed.', lose: [{ k: 'raidDelay', days: -5 }, { k: 'morale', n: -4 }] }, line: 'You feigned interest.' },
        { id: 'hold', label: 'Hold out: shut the gate and say nothing', hint: 'Your own household and your own stores, and a name on their other list.', now: [{ k: 'morale', n: -2 }, { k: 'standing', n: -4 }, { k: 'respect', n: 0.05 }], risk: { p: 0.25, good: 'They took it politely and left.', bad: 'They left a gray ribbon on the gatepost.', lose: [{ k: 'raidDelay', days: -3 }] }, line: 'You held out.' },
      ] },
    { id: 'tithe', phase: 'month', title: 'The tithe', fallback: 'pay_in_kind',
      text: 'The Order wants a tenth of the harvest, a tenth of the labor and a tenth of everything on the shelf. They are polite about it. A scared teenager at the gate says, "It\'s just. It\'s only what everybody gives."',
      options: [
        { id: 'pay', label: 'Pay the tithe in cash', hint: 'Cash and a quiet door. They hear about hard feelings.', cost: s => ({ money: r25(500 + N(s) * 80) }), now: [{ k: 'standing', n: 4 }, { k: 'raidDelay', days: 10 }], risk: { p: 0.15, good: 'They counted it and wrote your name down.', bad: 'The elder said the tenth was the minimum.', lose: [{ k: 'money', n: -200 }] }, line: 'You paid the tithe in cash.' },
        { id: 'pay_in_kind', label: 'Pay in food and firewood', hint: 'Keeps your cash, thins the pantry.', cost: s => ({ stock: { canned: N(s) * 2, firewood: 2 } }), now: [{ k: 'standing', n: 3 }, { k: 'raidDelay', days: 8 }], risk: { p: 0.25, good: 'They took it and thanked you.', bad: 'They said it was not enough.', lose: [{ k: 'raidDelay', days: -3 }] }, line: 'You paid the tithe in kind.' },
        { id: 'refuse', label: 'Refuse the tithe and stand on the porch', hint: 'You keep your stores and may lose the district.', cost: () => ({ standing: 8 }), now: [{ k: 'respect', n: 0.1 }, { k: 'humanity', n: 1 }], risk: { p: 0.45, good: 'They left, for now.', bad: 'The elders came back with a lot of quiet men.', lose: [{ k: 'raidDelay', days: -8 }, { k: 'morale', n: -5 }] }, line: 'You refused the tithe.' },
      ] },
    { id: 'leave', phase: 'season', title: 'Stay, or leave the district', fallback: 'stay',
      text: 'A third of the district wears gray. The children sing in the evenings. The elder asks, gently, whether you will be at the gathering.',
      options: [
        { id: 'leave', label: 'Pay a guide to take the household to another county', hint: 'A new start, a hard road, a place left behind.', cost: s => ({ money: r25(1800 + N(s) * 150) }), now: [{ k: 'morale', n: -2 }, { k: 'stock', id: 'bugout_bag', n: 1 }], risk: { p: 0.3, good: 'Over the line by dawn.', bad: 'The Order left a car at the pass.', lose: [{ k: 'stock', id: 'canned', n: -3 }, hurtOne('a hard fall', 15)] }, line: 'You left the district.' },
        { id: 'stay', label: 'Stay, and keep the gate shut at night', hint: 'No cost, no promises. The elder\'s eyes.', cost: () => ({ hours: 5 }), now: [{ k: 'raidDelay', days: 3 }], risk: { p: 0.4, good: 'A year of quiet.', bad: 'Someone smashed the gate lock in the night.', lose: [{ k: 'raidDelay', days: -4 }, { k: 'stock', id: 'hardware', n: -1 }] }, line: 'You stayed and kept watch.' },
        { id: 'inside', label: 'Join the gathering and quietly feed the doubters', hint: 'A foot in each camp. It is a lie either way.', cost: () => ({ stock: { canned: 3 } }), off: noNeighbors, now: [{ k: 'standing', n: 8 }, { k: 'humanity', n: 3 }], risk: { p: 0.3, good: 'A few families slipped away.', bad: 'The elder noticed who was missing.', lose: [{ k: 'standing', n: -6 }, { k: 'morale', n: -4 }] }, line: 'You helped the doubters from inside.' },
      ] },
  ]),
};
