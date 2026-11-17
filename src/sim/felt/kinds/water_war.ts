import type { FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for water_war: the ditch rider, the tanker, the creek. */
export const felt: FeltSpec = {
  cards: kindCards('water_war', [
    { id: 'headgate', phase: 'hit', title: 'The ditch rider at the headgate', fallback: 'open',
      text: 'The ditch rider says upstream has closed the gate. If you open yours, your neighbor below goes dry. If you do not, your own garden dies.',
      options: [
        { id: 'open', label: 'Open the headgate to the ditch rider\'s schedule', hint: 'Your ditch gets its turn and the neighbors below get theirs.', cost: () => ({ hours: 3 }), now: [{ k: 'standing', n: 5 }, { k: 'humanity', n: 2 }], risk: { p: 0.2, good: 'Everyone got a share.', bad: 'The upstream man took it back at midnight.', lose: [{ k: 'standing', n: -3 }] }, line: 'You opened the headgate.' },
        { id: 'tanker', label: 'Pay for a tanker and keep your own gate shut', hint: 'You take no side and fill your own tank.', cost: s => ({ money: r25(500 + N(s) * 70) }), now: [{ k: 'stock', id: 'water_jugs', n: 5 }, { k: 'morale', n: 3 }], risk: { p: 0.12, good: 'A full tank.', bad: 'The driver said it was the last load.', lose: [{ k: 'morale', n: -2 }] }, line: 'You paid for a tanker.' },
        { id: 'divert', label: 'Dam the ditch and keep it all', hint: 'Cheap, quick, and it makes enemies.', cost: () => ({ hours: 6, humanity: 3, standing: 8 }), now: [{ k: 'stock', id: 'water_jugs', n: 6 }, { k: 'respect', n: 0.08 }], risk: { p: 0.45, good: 'Nobody came.', bad: 'The neighbors cut your dam in the night.', lose: [{ k: 'standing', n: -8 }] }, line: 'You dammed the ditch.' },
      ] },
    { id: 'creek_guard', phase: 'hit', from: 2, to: 7, title: 'Who guards the creek', fallback: 'watch',
      text: 'Strangers have been dipping buckets at the creek upstream. Somebody had better watch your intake.',
      options: [
        { id: 'hire', label: 'Pay two men to stand watch at the intake', hint: 'Visible and steady. Their loyalty is for rent.', cost: s => ({ money: r25(700 + N(s) * 90) }), now: [{ k: 'raidDelay', days: 8 }, { k: 'respect', n: 0.1 }], risk: { p: 0.12, good: 'They held the creek.', bad: 'They walked off after a week.', lose: [{ k: 'raidDelay', days: -3 }] }, line: 'You hired men for the intake.' },
        { id: 'watch', label: 'Take shifts yourselves', hint: 'Long cold nights, no cash.', cost: () => ({ hours: 14 }), now: [{ k: 'raidDelay', days: 4 }], risk: { p: 0.3, good: 'Nobody got through.', bad: 'A guard nodded off.', lose: [hurtOne('a fall on the watch', 15)] }, line: 'You took the watch in shifts.' },
        { id: 'share', label: 'Offer the downstream neighbors a time at the creek', hint: 'Water belongs to the district, you say. It works only if they agree.', cost: () => ({ hours: 5 }), off: noNeighbors, now: [{ k: 'standing', n: 8 }, { k: 'humanity', n: 3 }], risk: { p: 0.3, good: 'A schedule everyone signed.', bad: 'Two of them argued it down.', lose: [{ k: 'standing', n: -5 }] }, line: 'You set up a creek schedule.' },
      ] },
    { id: 'tank_price', phase: 'month', title: 'The price of a tank', fallback: 'ration',
      text: 'The tanker truck charges four times what it did. Everyone is buying and nobody is happy.',
      options: [
        { id: 'buy', label: 'Pay for a tanker every week', hint: 'Water in the tank, a hole in your pocket.', cost: s => ({ money: r25(900 + N(s) * 90) }), now: [{ k: 'stock', id: 'water_jugs', n: 8 }, { k: 'morale', n: 3 }], risk: { p: 0.1, good: 'A reliable driver.', bad: 'The price went up again.', lose: [{ k: 'money', n: -300 }] }, line: 'You paid for weekly tankers.' },
        { id: 'ration', label: 'Ration water: wash once a week, reuse everything', hint: 'No cash. A rank household.', cost: () => ({ hours: 4 }), now: [{ k: 'stock', id: 'water_jugs', n: 3 }, { k: 'morale', n: -4 }], risk: { p: 0.3, good: 'The tank lasts the month.', bad: 'Somebody got sick on greywater.', lose: [{ k: 'fever' }] }, line: 'You rationed water.' },
        { id: 'co-op', label: 'Form a water co-op and split a tanker among five farms', hint: 'A fifth of the cost, a fifth of the headaches.', cost: s => ({ money: r25(300 + N(s) * 30) }), off: noNeighbors, now: [{ k: 'standing', n: 7 }, { k: 'stock', id: 'water_jugs', n: 5 }], risk: { p: 0.22, good: 'The co-op runs.', bad: 'Somebody wouldn\'t pay.', lose: [{ k: 'standing', n: -4 }] }, line: 'You formed a water co-op.' },
      ] },
    { id: 'defend', phase: 'season', title: 'Defend the creek, or negotiate', fallback: 'talk',
      text: 'Upstream is rumored to have armed men at the headwaters. Whatever the water costs, someone has to speak for the creek.',
      options: [
        { id: 'arm', label: 'Back the district\'s armed watch with your own hours and ammo', hint: 'Force for the creek. People get hurt.', cost: () => ({ hours: 14, stock: { fuel: 1 } }), off: noNeighbors, now: [{ k: 'respect', n: 0.15 }, { k: 'standing', n: 5 }], risk: { p: 0.35, good: 'They backed down.', bad: 'A shot went wrong.', lose: [hurtOne('a gunshot graze', 30), { k: 'humanity', n: -3 }] }, line: 'You backed the armed watch.' },
        { id: 'talk', label: 'Send someone to the headwaters to negotiate', hint: 'A trade of labor for water. It may not work.', cost: () => ({ hours: 6 }), now: [{ k: 'humanity', n: 2 }], risk: { p: 0.4, good: 'A written agreement, for now.', bad: 'He did not come back.', lose: [{ k: 'morale', n: -4 }] }, line: 'You sent someone to negotiate.' },
        { id: 'pay', label: 'Pay the upstream man for a share, in cash', hint: 'Water for money. He may break it.', cost: s => ({ money: r25(1200 + N(s) * 100) }), now: [{ k: 'raidDelay', days: 6 }, { k: 'stock', id: 'water_jugs', n: 4 }], risk: { p: 0.18, good: 'He kept his word.', bad: 'He took the money and shut the gate.', lose: [{ k: 'morale', n: -3 }] }, line: 'You paid for a share.' },
      ] },
  ]),
};
