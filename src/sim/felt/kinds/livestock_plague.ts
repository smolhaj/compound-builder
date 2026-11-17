import type { FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for livestock_plague: the barn, not the clinic. The cull card is the one the plague module raises (sim/livestockPlague.ts), here as a household choice. */
export const felt: FeltSpec = {
  cards: kindCards('livestock_plague', [
    { id: 'keep_it_out', phase: 'hit', title: 'Keep it out of the barn', fallback: 'gate',
      text: 'The state vet says the disease is two farms away. Every boot, truck and bucket can carry it.',
      options: [
        { id: 'vet', label: 'Pay a vet for testing, a footbath and a disinfection round', hint: 'A real biosecurity plan, signed. She may find it already.', cost: s => ({ money: r25(600 + N(s) * 40) }), now: [{ k: 'stock', id: 'vet_kit', n: 1 }, { k: 'morale', n: 2 }], risk: { p: 0.12, good: 'The barn is clean for now.', bad: 'She found a sick bird.', lose: [{ k: 'morale', n: -4 }] }, line: 'A vet tested and disinfected.' },
        { id: 'gate', label: 'Lock the gate, footbath at the barn door, no visitors', hint: 'Cheap, tiring. Neighbors will not like it.', cost: () => ({ hours: 8 }), now: [{ k: 'raidDelay', days: 3 }, { k: 'standing', n: -2 }], risk: { p: 0.3, good: 'Nothing came in.', bad: 'A delivery driver ignored the sign.', lose: [{ k: 'morale', n: -3 }] }, line: 'You closed the barn to visitors.' },
        { id: 'sell', label: 'Sell the animals now while they are healthy', hint: 'Cash now and an empty barn. A lot of hard feelings in the stall.', now: [{ k: 'money', n: 700 }, { k: 'morale', n: -4 }], risk: { p: 0.25, good: 'A fair price.', bad: 'The buyer cut the price at the door.', lose: [{ k: 'money', n: -250 }] }, line: 'You sold the herd.' },
      ] },
    { id: 'cull', phase: 'hit', from: 2, to: 7, title: 'The cull', fallback: 'comply',
      text: 'The disease is on the place or next door. The state wants a cull, with compensation for animals killed in time and none for those hidden.',
      options: [
        { id: 'comply', label: 'Comply: let the state crew do the cull', hint: 'Clean and fast. A smaller herd, a clinical process, and an indemnity check.', cost: () => ({ hours: 3 }), now: [{ k: 'money', n: 600 }, { k: 'morale', n: -5 }, { k: 'standing', n: 2 }], risk: { p: 0.1, good: 'The crew was kind about it.', bad: 'The paperwork took months.', lose: [{ k: 'money', n: -300 }] }, line: 'You let the state crew cull the herd.' },
        { id: 'selective', label: 'Cull only the sick animals, quarantine the rest', hint: 'Saves some. Costs hours and a risk of the disease spreading.', cost: () => ({ hours: 12, stock: { antibiotics: 1 } }), now: [{ k: 'morale', n: -2 }], risk: { p: 0.45, good: 'The quarantined animals stayed well.', bad: 'The disease got into the quarantine.', lose: [{ k: 'morale', n: -5 }, { k: 'standing', n: -4 }] }, line: 'You culled the sick and quarantined the rest.' },
        { id: 'eat', label: 'Butcher and eat what is healthy right now', hint: 'Food on the table. A risk of catching the human tail.', cost: () => ({ hours: 8 }), now: [{ k: 'stock', id: 'canned', n: 8 }, { k: 'morale', n: 2 }], risk: { p: 0.3, good: 'The meat was clean.', bad: 'Someone got sick from the meat.', lose: [{ k: 'fever' }] }, line: 'You butchered the healthy stock.' },
      ] },
    { id: 'fallow', phase: 'month', title: 'The fallow period', fallback: 'wait',
      text: 'The barn is empty by order for 60 days. The feed will spoil. The neighbors who are still stocked are unhappy about being next door.',
      options: [
        { id: 'sell_feed', label: 'Sell the feed to a neighbor who still has animals', hint: 'You turn spoilage into cash and goodwill.', cost: () => ({ hours: 3 }), off: noNeighbors, now: [{ k: 'money', n: 300 }, { k: 'standing', n: 5 }], risk: { p: 0.2, good: 'A fair deal.', bad: 'He paid late.', lose: [{ k: 'standing', n: -3 }] }, line: 'You sold feed to a neighbor.' },
        { id: 'wait', label: 'Cover the feed and wait it out', hint: 'No cash, no hours, some spoilage.', now: [{ k: 'morale', n: -1 }], risk: { p: 0.35, good: 'It kept.', bad: 'Half of it molded.', lose: [{ k: 'stock', id: 'feed', n: -2 }] }, line: 'You covered the feed and waited.' },
        { id: 'clean', label: 'Scrub and whitewash the barn, restock from a clean source later', hint: 'The right way. A week of hard work.', cost: () => ({ hours: 14 }), now: [{ k: 'stock', id: 'hygiene', n: 1 }], risk: { p: 0.25, good: 'The barn is clean.', bad: 'A cracked beam went unnoticed.', lose: [hurtOne('a scraped hand', 8)] }, line: 'You scrubbed the barn.' },
      ] },
    { id: 'restock', phase: 'season', title: 'Restock from a clean source', fallback: 'quarantine',
      text: 'The fallow is up. The auction has animals again. Some of them are already sick.',
      options: [
        { id: 'buy', label: 'Buy certified clean stock with papers', hint: 'More expensive, and the papers are real.', cost: s => ({ money: r25(900 + N(s) * 60) }), now: [{ k: 'stock', id: 'rabbit', n: 4 }, { k: 'morale', n: 3 }], risk: { p: 0.1, good: 'Clean stock, clean barn.', bad: 'One had a cough.', lose: [{ k: 'morale', n: -2 }] }, line: 'You bought certified stock.' },
        { id: 'quarantine', label: 'Buy cheap stock and quarantine every one for 30 days', hint: 'Slow, but safe if you hold the line.', cost: () => ({ hours: 12 }), now: [{ k: 'stock', id: 'rabbit', n: 3 }], risk: { p: 0.3, good: 'The quarantine held.', bad: 'One was sick; you lost three.', lose: [{ k: 'stock', id: 'rabbit', n: -3 }] }, line: 'You quarantined every new animal.' },
        { id: 'skip', label: 'Skip the barn this year and plant more', hint: 'No risk, no meat.', now: [{ k: 'stock', id: 'seed', n: 1 }, { k: 'morale', n: -2 }], risk: { p: 0.15, good: 'A good crop.', bad: 'A small crop.', lose: [{ k: 'morale', n: -2 }] }, line: 'You skipped restocking.' },
      ] },
  ]),
};
