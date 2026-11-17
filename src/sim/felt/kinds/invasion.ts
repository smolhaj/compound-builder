import type { FeltSpec } from '../types';
import { kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for invasion: the household's decisions (checkpoints, draft and requisition are the order package's gate cards): the go-bag, hiding the young men, the occupier's notice. */
export const felt: FeltSpec = {
  cards: kindCards('invasion', [
    { id: 'notice', phase: 'hit', title: 'The notice nailed to the post', fallback: 'comply',
      text: 'It is in two languages. Registration of all households, all weapons and all men between eighteen and forty-five, by Friday.',
      options: [
        { id: 'comply', label: 'Register the household, truthfully', hint: 'Safest on paper. You are known, and they will come back.', cost: () => ({ hours: 2 }), now: [{ k: 'raidDelay', days: 8 }, { k: 'morale', n: -3 }], risk: { p: 0.2, good: 'A clerk stamped it and sent you home.', bad: 'The clerk asked for the older boy.', lose: [{ k: 'morale', n: -4 }] }, line: 'You registered the household.' },
        { id: 'half', label: 'Register, but leave the young men off the list', hint: 'A lie on paper. Hostile crews kill people who lie.', cost: () => ({ hours: 3, humanity: 1 }), now: [{ k: 'raidDelay', days: 3 }], risk: { p: 0.4, good: 'Nobody counted twice.', bad: 'A neighbor named them.', lose: [{ k: 'raidDelay', days: -5 }, { k: 'standing', n: -3 }] }, line: 'You left the young men off the list.' },
        { id: 'skip', label: 'Do not register and stay off the road', hint: 'Invisible, until somebody looks.', now: [{ k: 'raidDelay', days: 1 }, { k: 'morale', n: -3 }], risk: { p: 0.5, good: 'No one came to check.', bad: 'Soldiers came for you on Saturday.', lose: [{ k: 'raidDelay', days: -6 }, { k: 'morale', n: -5 }] }, line: 'You ignored the notice.' },
      ] },
    { id: 'go_bag', phase: 'hit', from: 1, to: 6, title: 'A go-bag, and a place to run', fallback: 'pack',
      text: 'Everyone in the district is packing a bag. A truck of soldiers on this road is a matter of minutes.',
      options: [
        { id: 'buy', label: 'Buy real packs, water filters and a good map', hint: 'The best kit money can buy this week.', cost: s => ({ money: r25(140 * N(s) + 120) }), now: [{ k: 'stock', id: 'bugout_bag', n: 2 }, { k: 'stock', id: 'water_filter', n: 1 }], risk: { p: 0.08, good: 'Everyone has a pack that fits.', bad: 'One bag is already torn.', lose: [{ k: 'morale', n: -1 }] }, line: 'You bought packs and filters.' },
        { id: 'pack', label: 'Pack from the house and rehearse', hint: 'Cheap, and it holds if you stay calm.', cost: () => ({ hours: 5 }), now: [{ k: 'raidDelay', days: 1 }], risk: { p: 0.32, good: 'Everyone knows where to be.', bad: 'The rehearsal ended in tears.', lose: [{ k: 'morale', n: -3 }] }, line: 'You packed and rehearsed.' },
        { id: 'cache', label: 'Bury a cache in the woods and tell one neighbor', hint: 'Not on you if the house burns.', cost: () => ({ hours: 7, stock: { canned: 3 } }), off: noNeighbors, now: [{ k: 'standing', n: 4 }], risk: { p: 0.2, good: 'Hidden and dry.', bad: 'A fox dug it up.', lose: [{ k: 'stock', id: 'canned', n: -3 }] }, line: 'You buried a cache.' },
      ] },
    { id: 'hide_men', phase: 'month', title: 'Hiding the young men', fallback: 'loft',
      text: 'The patrols are rounding up boys and men for labor, and not all of them come back. The older boy is eighteen.',
      options: [
        { id: 'route', label: 'Pay a guide to take him over the ridge to a free county', hint: 'A real route out, dear and dangerous.', cost: s => ({ money: r25(900 + N(s) * 60) }), now: [{ k: 'morale', n: -5 }], risk: { p: 0.3, good: 'A call from the other side: he is across.', bad: 'The guide never came back.', lose: [{ k: 'morale', n: -6 }] }, line: 'You paid a guide to take him out.' },
        { id: 'loft', label: 'Hide him in the hay loft behind a false wall', hint: 'A few hours of work. Hostile men who find the wall will kill the house.', cost: () => ({ hours: 6 }), now: [{ k: 'raidDelay', days: 2 }], risk: { p: 0.35, good: 'The patrol checked the barn and left.', bad: 'A dog found him.', lose: [{ k: 'raidDelay', days: -5 }, { k: 'morale', n: -5 }] }, line: 'You hid him behind a false wall.' },
        { id: 'camp', label: 'Send them all to a hunting camp, with the neighbors', hint: 'A camp of boys and a watch. Friends and risk.', cost: () => ({ hours: 8 }), off: noNeighbors, now: [{ k: 'standing', n: 8 }, { k: 'humanity', n: 3 }], risk: { p: 0.22, good: 'A quiet camp, a quiet month.', bad: 'Somebody talked.', lose: [{ k: 'standing', n: -6 }, { k: 'raidDelay', days: -4 }] }, line: 'You sent them to a hunting camp.' },
      ] },
    { id: 'occupier', phase: 'season', title: 'Living with the occupier', fallback: 'wait',
      text: 'A new administration is running the county. They pay for labor and punish for sabotage. The neighbors are splitting over whether to work for them.',
      options: [
        { id: 'work', label: 'Take a labor contract for cash and a pass', hint: 'A pass on the road, and a name on a list.', cost: () => ({ hours: 10, humanity: 2 }), now: [{ k: 'money', n: 500 }, { k: 'raidDelay', days: 10 }], risk: { p: 0.2, good: 'Paid on time.', bad: 'The neighbors will not meet your eye.', lose: [{ k: 'standing', n: -8 }] }, line: 'You took a labor contract.' },
        { id: 'wait', label: 'Keep your head down and your gate shut', hint: 'Nothing gained, nothing lost.', now: [{ k: 'morale', n: -2 }], risk: { p: 0.3, good: 'Nobody noticed.', bad: 'They noticed the lack of a pass.', lose: [{ k: 'raidDelay', days: -4 }] }, line: 'You kept your head down.' },
        { id: 'help', label: 'Pass food and warnings to the district resistance', hint: 'Dangerous. People remember who was brave.', cost: () => ({ stock: { canned: 3 } }), now: [{ k: 'standing', n: 9 }, { k: 'humanity', n: 3 }], risk: { p: 0.38, good: 'Nobody knew.', bad: 'An informer named you.', lose: [{ k: 'raidDelay', days: -8 }, { k: 'morale', n: -6 }] }, line: 'You passed food to the resistance.' },
      ] },
  ]),
};
