import type { FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for civil_war: the household's decisions (the checkpoints and requisitions belong to the order package): the radio watch, the cellar, the neighbors across the line. */
export const felt: FeltSpec = {
  cards: kindCards('civil_war', [
    { id: 'which_side', phase: 'hit', title: 'Which flag on the porch', fallback: 'none',
      text: 'Both sides drive the county road. A flag on the porch is a promise, and a target to the other side. The neighbors are choosing.',
      options: [
        { id: 'flag', label: 'Hang the flag the road commander wants', hint: 'Safe for now with one side, a mark for the other.', cost: () => ({ hours: 1, humanity: 1 }), now: [{ k: 'raidDelay', days: 8 }, { k: 'respect', n: 0.05 }], risk: { p: 0.35, good: 'They saluted and drove on.', bad: 'The other column burned the porch.', lose: [{ k: 'stock', id: 'lumber', n: -2 }, { k: 'morale', n: -4 }] }, line: 'You hung the flag.' },
        { id: 'none', label: 'Hang nothing and keep the curtains drawn', hint: 'Neutral and quiet. Both sides may take that as an answer.', now: [{ k: 'raidDelay', days: 3 }, { k: 'morale', n: -2 }], risk: { p: 0.3, good: 'They passed by.', bad: 'A column stopped to ask why.', lose: [{ k: 'morale', n: -4 }] }, line: 'You hung nothing.' },
        { id: 'neighbors', label: 'Agree with the neighbors that no one hangs anything', hint: 'A district with one answer. It holds only if no one breaks it.', cost: () => ({ hours: 3 }), off: noNeighbors, now: [{ k: 'standing', n: 6 }, { k: 'humanity', n: 2 }], risk: { p: 0.25, good: 'The district held as one.', bad: 'A neighbor hung a flag in the night.', lose: [{ k: 'standing', n: -5 }] }, line: 'The district agreed to hang nothing.' },
      ] },
    { id: 'cellar', phase: 'hit', from: 1, to: 6, title: 'Where the family sleeps', fallback: 'cellar',
      text: 'Artillery is a rumor and a thump from the east. The cellar is damp, the loft is dry, and the windows face the road.',
      options: [
        { id: 'shelter', label: 'Pay to reinforce the cellar with sandbags and a stovepipe', hint: 'Dry, warm and under the floor.', cost: s => ({ money: r25(700 + N(s) * 80) }), now: [{ k: 'stock', id: 'sandbags', n: 4 }, { k: 'morale', n: 3 }], risk: { p: 0.1, good: 'A dry cellar with a door.', bad: 'The contractor never came back.', lose: [{ k: 'morale', n: -2 }] }, line: 'You reinforced the cellar.' },
        { id: 'cellar', label: 'Clear it yourselves and sleep below', hint: 'Damp and dark, free in cash.', cost: () => ({ hours: 9 }), now: [{ k: 'morale', n: -2 }], risk: { p: 0.3, good: 'It is crowded and safe.', bad: 'Damp and a chest cold.', lose: [hurtOne('a chest cold', 10)] }, line: 'You cleared the cellar.' },
        { id: 'loft', label: 'Sleep in the loft, boots on, ready to run', hint: 'Dry, and fast to leave. Windows face the road.', now: [{ k: 'raidDelay', days: -1 }], risk: { p: 0.4, good: 'A tense night.', bad: 'A stray round hit the roof.', lose: [hurtOne('a splinter wound', 15)] }, line: 'You slept in the loft.' },
      ] },
    { id: 'across_line', phase: 'month', title: 'The family across the line', fallback: 'feed',
      text: 'A woman from a house on the other side of the front is at the back door with a baby. She says her husband is dead, and she does not want to be anyone\'s enemy.',
      options: [
        { id: 'take', label: 'Take her in, quietly', hint: 'A bed and a hidden guest. Both columns will want to know.', cost: s => ({ stock: { canned: N(s) } }), now: [{ k: 'humanity', n: 7 }, { k: 'morale', n: 2 }], risk: { p: 0.3, good: 'Nobody asked.', bad: 'A neighbor said who you had in the house.', lose: [{ k: 'raidDelay', days: -6 }, { k: 'standing', n: -5 }] }, line: 'You took her in.' },
        { id: 'feed', label: 'Feed her at the door and send her on', hint: 'A meal, no promises.', cost: () => ({ stock: { canned: 2 } }), now: [{ k: 'humanity', n: 3 }], risk: { p: 0.15, good: 'She thanked you and left.', bad: 'She came back with others.', lose: [{ k: 'morale', n: -2 }] }, line: 'You fed her and sent her on.' },
        { id: 'turn', label: 'Turn her away', hint: 'Safe, cold, ashamed.', cost: () => ({ humanity: 6 }), now: [{ k: 'raidDelay', days: 2 }], line: 'You turned her away.' },
      ] },
    { id: 'ceasefire', phase: 'season', title: 'A ceasefire, and what to do with it', fallback: 'plant',
      text: 'The guns have stopped for two weeks. Nobody trusts it. The fields are overdue.',
      options: [
        { id: 'plant', label: 'Plant and fence the near field now', hint: 'A real harvest if it holds.', cost: () => ({ hours: 14 }), now: [{ k: 'stock', id: 'seed', n: 1 }], risk: { p: 0.35, good: 'A good stand.', bad: 'A column rolled through the field.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You planted in the lull.' },
        { id: 'market', label: 'Pay for a seat at a market day', hint: 'Cash and a crowd, everyone nervous.', cost: s => ({ money: r25(250 + N(s) * 50) }), now: s => [{ k: 'stock', id: 'staples', n: N(s) * 3 }], risk: { p: 0.15, good: 'A fair trade.', bad: 'The market closed early at the sound of shots.', lose: [{ k: 'stock', id: 'canned', n: -1 }] }, line: 'You traded at the market.' },
        { id: 'prepare', label: 'Use the lull to prepare for the next round', hint: 'Dig the cellar, hide the stores, drill the family.', cost: () => ({ hours: 10, stock: { lumber: 1 } }), now: [{ k: 'raidDelay', days: 5 }, { k: 'morale', n: -1 }], risk: { p: 0.25, good: 'You are ready.', bad: 'It all broke and you had no time to mend it.', lose: [hurtOne('a mashed thumb', 10)] }, line: 'You prepared for the next round.' },
      ] },
  ]),
};
