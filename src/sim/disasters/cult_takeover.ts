/**
 * Cult takeover (WP10; docs/scenarios/cult_takeover.md). A nonviolent antagonist: a movement captures the council, runs the Common Store
 * and tithes the valley. Neighbors convert one by one, shepherds come with a ledger, and a card asks the family to pay or refuse. The
 * zealot variant raids unbelievers; the prophet's date ends it (or something worse) on a day the Prophet foretold.
 */
import type { FxCard, KindFx } from '../disasterFx';
import type { GameState } from '../state';
import { kindBag } from '../physical';
import { bulletin, homeNeighbors, since, sev, takeShare, warnFrac, clamp01, type Line } from './kit';

export interface CultState { converts: string[]; tithes: number; due: boolean; refusedAt: number; propheticDay: number }
export const cultOf = (s: GameState): CultState => kindBag<CultState>(s, 'cult_takeover', () => ({ converts: [], tithes: 0, due: false, refusedAt: -999, propheticDay: 120 + (Math.abs(Math.floor(s.seed * 2654435761)) % 180) }));
/** How firmly the Order holds the valley (0 to 1): months to build, longer on the gentler variant. */
export const hold = (s: GameState): number => clamp01(since(s) / (s.disaster.variant === 'gathering' ? 240 : 150)) * (s.disaster.variant === 'prophet_date' && since(s) > cultOf(s).propheticDay + 30 ? 0.3 : 1);

const LINES: Line[] = [
  [0, 4, 'the Gathering has voted to take over the food bank; free bread for those who sign the book.', 3],
  [2, 90, 'the Common Store opens at sunrise: a fellowship price for members, three times that for the rest.', 2],
  [10, 200, 'shepherds in gray coats are walking the roads with a ledger: "the Order asks a tenth."', 2],
  [20, 400, 'the Prophet says the day is coming; the faithful are giving away what they own.', 2],
  [40, 500, 'a family fled the valley last night; the Order says they "went to the world".', 1],
];

export const fx: KindFx = {
  onWarning: () => ['A preacher is gathering a crowd at the fairgrounds with free food for those who sign. A new church has opened in the old feed store.'],
  onHit: () => ['The council has voted: the Order runs the valley, with a Common Store and a tithe. The sheriff is a member.'],
  daily(s, ctx) {
    const C = cultOf(s), out: string[] = [], day = ctx.day, h = hold(s);
    // neighbors convert, faster the hungrier the county
    for (const n of homeNeighbors(s)) {
      if (C.converts.includes(n.id)) continue;
      if (ctx.r() < 0.03 * h * (1 + 1.5 * (1 - s.disaster.tracks.stores)) * sev(s)) { C.converts.push(n.id); n.disposition = Math.max(-100, n.disposition - 25); out.push(`${n.name[0].toUpperCase() + n.name.slice(1)} now attends the Gathering and hangs the Covenant flag in the window.`); }
    }
    // the tithe: a tenth from members, a fifth from the rest, every 30 days
    if (day >= 15 && (day - 15) % 30 === 0 && ctx.once(`tithe_${day}`)) C.due = true;
    if (C.due && day - 15 - Math.floor((day - 15) / 30) * 30 >= 5 && ctx.once(`tithe_late_${Math.floor((day - 15) / 30)}`)) { C.due = false; C.refusedAt = day; out.push('You ignored the ledger. The shepherds noted it.'); }
    // the prophet's date: the Order collapses or does something terrible
    if (s.disaster.variant === 'prophet_date' && day === C.propheticDay && ctx.once('prophet_day')) out.push('The Prophet\'s date has come and gone. The Order is in turmoil.');
    return out;
  },
  priceMods: s => (since(s) < 0 ? 1 + 0.05 * warnFrac(s) : 1 + 0.35 * hold(s)),
  encounterWeights(s, { scale, w }) {
    const h = hold(s), zealot = s.disaster.variant === 'zealot';
    scale('looters', 0.8); scale('trader', 0.8); scale('refugees', 1.3);
    w.push(['requisition', 8 * h], ['militia', (zealot ? 12 : 3) * h]);
    if (cultOf(s).refusedAt > since(s) - 20) scale('gang', 2);
  },
  npcMods: s => 1 + 0.4 * hold(s),
  serviceMods: s => ({ banks: 1 - 0.1 * hold(s) }),
  radioBulletins: (_s, ctx) => bulletin(LINES, ctx),
  oasisWeight: s => 0.25 * hold(s),
  cards(s): FxCard[] {
    const C = cultOf(s);
    if (!C.due) return [];
    return [{ id: 'cult_tithe', title: 'The shepherds are at the gate with a ledger', why: '"The Order asks a tenth." Pay and be left alone, or refuse and see who comes.', urgency: 65, tone: 'alarm', acts: [{ label: 'Pay the tithe', choice: 'cult:pay' }, { label: 'Refuse', choice: 'cult:refuse' }] }];
  },
  choose(s, c) {
    const C = cultOf(s);
    if (c === 'cult:pay') { C.due = false; const n = takeShare(s, ['staples', 'canned', 'fresh'], 0.15 * sev(s)); C.tithes += n; return `You paid the tithe: ${n.toFixed(1)} units of food went to the Common Store. The shepherds nod and move on.`; }
    if (c === 'cult:refuse') { C.due = false; C.refusedAt = Math.floor(since(s)); s.gate.humanity = Math.min(100, s.gate.humanity + 2); return 'You refused. The shepherds left without a word; the neighbors noticed.'; }
    return null;
  },
};
