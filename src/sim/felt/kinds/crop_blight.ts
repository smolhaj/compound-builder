import type { FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for crop_blight: which seed goes in first, share or refuse. */
export const felt: FeltSpec = {
  cards: kindCards('crop_blight', [
    { id: 'which_seed', phase: 'hit', title: 'Which seed goes in first', fallback: 'heirloom',
      text: 'The leaves are blackening in the field. The county agent says the blight rides on seed and soil. Whatever goes in next had better be resistant.',
      options: [
        { id: 'buy', label: 'Buy certified resistant seed', hint: 'Dear, tested and bagged. Your best bet this year.', cost: s => ({ money: r25(350 + N(s) * 110) }), now: s => [{ k: 'stock', id: 'seed', n: N(s) * 2 }], risk: { p: 0.08, good: 'It is true to type.', bad: 'A blighted lot slipped through.', lose: s => [{ k: 'stock', id: 'seed', n: -N(s) }] }, line: 'You bought resistant seed.' },
        { id: 'heirloom', label: 'Plant your saved heirloom seed in a clean corner', hint: 'No cash, a week of work, and old varieties can be tougher than they look.', cost: () => ({ hours: 10 }), now: [{ k: 'stock', id: 'seed', n: 1 }], risk: { p: 0.35, good: 'Some of it shrugged the blight off.', bad: 'The old seed was no better.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You planted heirloom seed in a clean corner.' },
        { id: 'rotate', label: 'Burn the field and plant a different family entirely', hint: 'Costs the crop and the trouble. Rotation breaks the cycle.', cost: () => ({ hours: 8, stock: { fuel: 1 } }), now: [{ k: 'morale', n: -2 }, { k: 'stock', id: 'seed', n: 1 }], risk: { p: 0.25, good: 'A clean start.', bad: 'The wind spread the fire.', lose: [hurtOne('burned hands', 15)] }, line: 'You burned the field and rotated crops.' },
      ] },
    { id: 'share_seed', phase: 'hit', from: 2, to: 7, title: 'Share seed, or refuse', fallback: 'trade',
      text: 'A neighbor with a ruined field is asking. You are not sure the seed is clean, or that you have enough.',
      options: [
        { id: 'share', label: 'Give them a share, no strings', hint: 'They will not forget it. Neither will your own beds.', cost: () => ({ stock: { seed: 1 } }), off: noNeighbors, now: [{ k: 'standing', n: 9 }, { k: 'humanity', n: 3 }], risk: { p: 0.2, good: 'Both farms plant and live.', bad: 'The seed carried blight to your field too.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You shared seed.' },
        { id: 'trade', label: 'Trade seed for labor or cans', hint: 'Fair. They owe you and you owe them.', cost: () => ({ hours: 2 }), off: noNeighbors, now: [{ k: 'standing', n: 3 }, { k: 'stock', id: 'canned', n: 3 }], risk: { p: 0.35, good: 'A fair trade.', bad: 'They shorted you.', lose: [{ k: 'standing', n: -4 }] }, line: 'You traded seed.' },
        { id: 'refuse', label: 'Refuse. Your seed is for your family', hint: 'Keeps every kernel. A hard look from across the fence.', cost: () => ({ humanity: 3, standing: 6 }), now: [{ k: 'respect', n: 0.05 }, { k: 'raidDelay', days: 2 }], line: 'You refused to share.' },
      ] },
    { id: 'burn_or_till', phase: 'month', title: 'What to do with the dead rows', fallback: 'till',
      text: 'The dead plants are still standing in the field. If they stay, they will seed the next crop with the same disease.',
      options: [
        { id: 'burn', label: 'Burn them in place on a windless day', hint: 'Kills the disease and smokes up the district.', cost: () => ({ hours: 6, stock: { fuel: 1 } }), now: [{ k: 'morale', n: -1 }], risk: { p: 0.22, good: 'The field is clean.', bad: 'A spot fire jumped the ditch.', lose: [hurtOne('burned hands', 15)] }, line: 'You burned the dead rows.' },
        { id: 'till', label: 'Till them under deep and let the cold do the rest', hint: 'Slower, uses less fuel, partly effective.', cost: () => ({ hours: 9 }), risk: { p: 0.42, good: 'The ground froze hard.', bad: 'The blight overwintered anyway.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You tilled the dead crop under.' },
        { id: 'pay', label: 'Pay a contractor with a flame cultivator', hint: 'Fast and sure.', cost: s => ({ money: r25(500 + N(s) * 50) }), now: [{ k: 'morale', n: 2 }], risk: { p: 0.1, good: 'Clean ground by dusk.', bad: 'He skipped a strip.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'A contractor burned the rows.' },
      ] },
    { id: 'seed_bank', phase: 'season', title: 'A seed bank for the district', fallback: 'keep',
      text: 'Everyone lost something. The gardeners who kept the old varieties are the ones eating.',
      options: [
        { id: 'host', label: 'Host a district seed swap and keep the master list', hint: 'A real exchange. You are the librarian.', cost: () => ({ hours: 8, stock: { seed: 1 } }), off: noNeighbors, now: s => [{ k: 'standing', n: 9 }, { k: 'humanity', n: 3 }, { k: 'stock', id: 'seed', n: N(s) * 2 }], risk: { p: 0.15, good: 'Forty packets in the jar.', bad: 'Someone brought blighted stock.', lose: [{ k: 'stock', id: 'seed', n: -1 }] }, line: 'You hosted a seed swap.' },
        { id: 'buy', label: 'Buy certified seed for next year', hint: 'The sure thing, and a bill.', cost: s => ({ money: r25(300 + N(s) * 100) }), now: s => [{ k: 'stock', id: 'seed', n: N(s) * 2 }], line: 'You bought certified seed.' },
        { id: 'keep', label: 'Save only what grew best, quietly', hint: 'Careful selection, no cash, no sharing.', cost: () => ({ hours: 6 }), now: [{ k: 'stock', id: 'seed_saved', n: 1 }], risk: { p: 0.3, good: 'The saved seed is strong.', bad: 'It was too little to start with.', lose: [{ k: 'morale', n: -2 }] }, line: 'You saved your best seed.' },
      ] },
  ]),
};
