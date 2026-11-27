/**
 * The layout-A top bar's chip model (docs/UX_AUDIT.md 11.1): one selector over the state that turns the compound
 * board, the runway, the collapse clock and the wave clock into nine chips (plus the owe chip). It works nothing out
 * itself: every number and tone comes from `compoundBoard`, `runway`, `collapseChip`, `waveStatus` and `powerSummary`,
 * so a chip can never disagree with the Board. Pure.
 */
import type { GameState } from './state';
import type { BoardAct, BoardItem, BoardLine, BoardTone, CompoundBoard } from './compoundBoard';
import type { RunwayRow } from './runway';
import { collapseChip } from './collapseChip';
import { waveStatus } from './waveStatus';
import { powerSummary, fmtKw } from './powerReport';
import { powerOnPlace } from './hookups';
import { netWorth } from './finance';
import { runOver } from './wipe';
import type { ChipId } from './topBarPlan';

export type ChipTone = BoardTone;
export type ChipAct = BoardAct | { type: 'board' };
export type ChipIcon = ChipId;
export interface ChipFix { label: string; act: ChipAct }
export interface ChipModel {
  id: ChipId;
  /** Name for the hover card title and the accessible label. */
  label: string;
  /** Text beside the icon in full and compact mode (compact may be empty: icon plus tone glyph only). */
  full: string;
  compact: string;
  tone: ChipTone;
  /** True for a calm chip with nothing to say (drawn quieter). */
  quiet?: boolean;
  /** 0 to 1: a small progress bar (the threat clock). */
  bar?: number;
  /** Hover card: lines of detail, and the one-click fix when there is one. */
  lines: string[];
  items?: BoardItem[];
  fix?: ChipFix;
  /** What a click does. */
  open: ChipAct;
}

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const worst = (a: ChipTone, b: ChipTone): ChipTone => (a === 'bad' || b === 'bad' ? 'bad' : a === 'warn' || b === 'warn' ? 'warn' : 'good');
const fixOf = (v?: BoardLine, r?: RunwayRow): ChipFix | undefined => v?.fix ?? (v && v.tone !== 'good' && r ? r.fix : undefined);
const dayText = (n: number | null | undefined): string => n == null ? '' : n >= 999 ? '999+' : String(n);
/** "1 day", "12 days". */
const daysWord = (n: number | null | undefined): string => `${dayText(n)} ${n === 1 ? 'day' : 'days'}`;

function threatChip(s: GameState, b: CompoundBoard): ChipModel {
  const base = { id: 'threat' as const, label: 'Threat', open: { type: 'board' } as ChipAct };
  if (runOver(s)) return { ...base, full: 'Over', compact: 'Over', tone: 'bad', lines: ['This run has ended.'] };
  const wave = waveStatus(s), c = collapseChip(s);
  if (wave && wave.phase !== 'over') {
    const compact = wave.phase === 'arriving' ? `W${wave.next} now` : `W${wave.next} ${wave.daysTo}d`;
    return { ...base, full: wave.chip, compact, tone: wave.tone, bar: wave.threat, lines: [wave.explain, wave.expect, ...(c ? [c.title] : [])], fix: { label: 'Open the board', act: { type: 'board' } } };
  }
  if (c) {
    const n = /\d+/.exec(c.chip)?.[0] ?? '1';
    const tone: ChipTone = c.tone === 'dim' ? 'good' : c.tone;
    return { ...base, full: c.chip, compact: c.chip.startsWith('Day') ? c.chip : `${n} d`, tone, bar: c.tone === 'dim' ? undefined : c.w, quiet: c.tone === 'dim', lines: [c.title], fix: { label: 'Open the board', act: { type: 'board' } } };
  }
  if (b.threats.length) {
    const tone = b.threats.reduce<ChipTone>((a, t) => worst(a, t.tone), 'good'), n = b.threats.length;
    return { ...base, full: n === 1 ? '1 warning' : `${n} warnings`, compact: String(n), tone, lines: b.threats.map(t => t.text), items: b.threats, fix: { label: 'Open the board', act: { type: 'board' } } };
  }
  return { ...base, full: 'All quiet', compact: 'Quiet', tone: 'good', quiet: true, lines: ['No warning signs, no raid clock, nobody hurt.'] };
}

/** The chips for this state, in priority order. `board` is the cached board (the HUD keeps one). */
export function topChips(s: GameState, b: CompoundBoard): ChipModel[] {
  const vital = (id: BoardLine['id']) => b.vitals.find(v => v.id === id);
  const row = (id: RunwayRow['id']) => b.runway.find(r => r.id === id);
  const out: ChipModel[] = [threatChip(s, b)];

  // cash (and the owe chip)
  { const owed = s.fin.debt?.owed ?? 0, nw = netWorth(s);
    const tone: ChipTone = s.money < 0 ? 'bad' : s.money < 250 ? 'warn' : 'good';
    out.push({ id: 'cash', label: 'Checking balance', full: usd(s.money), compact: usd(s.money), tone, lines: [`Net worth ${usd(nw)}`, owed >= 25 ? `Owed on the card: ${usd(owed)}` : 'No debt.'], fix: { label: 'Shop & money', act: { type: 'shop', tab: 'money' } }, open: { type: 'shop', tab: 'money' } });
    if (owed >= 25) {
      const card = s.fin.debt!.stage === 'card', gone = s.disaster.tracks.banks < 0.5;
      out.push({ id: 'debt', label: 'Owed', full: `owe ${usd(owed)}`, compact: usd(owed), tone: card ? 'warn' : 'bad',
        lines: [gone ? 'The banks are gone: nobody is collecting.' : `Owed on the card at 24 %${s.fin.debt!.lien ? ', with a judgment lien on the land' : ''}.`], fix: { label: 'Accounts', act: { type: 'shop', tab: 'money' } }, open: { type: 'shop', tab: 'money' } });
    } }

  // food, water, power (board vitals; the runway row supplies days and a fallback fix)
  { const v = vital('food'), r = row('food');
    out.push({ id: 'food', label: 'Food', full: daysWord(v?.n ?? r?.days), compact: `${dayText(v?.n ?? r?.days)} d`, tone: v?.tone ?? 'good', lines: [v?.value ?? '', r ? `${r.value} with nothing grown or bought. ${r.detail}` : ''].filter(Boolean), fix: fixOf(v, r), open: v?.open ?? { type: 'open', right: 'supplies', supplies: 'stores' } }); }
  { const v = vital('water'), r = row('water'), d = r?.days ?? 0;
    // a working well with empty tanks is fine (the pump fills them as the family draws): "0 days" next to a good tone read as an emergency
    const live = d < 1 && v?.tone === 'good' && !!v.value.startsWith('a working source');
    out.push({ id: 'water', label: 'Water', full: live ? 'Source OK' : daysWord(d), compact: live ? 'OK' : `${dayText(d)} d`, tone: v?.tone ?? 'good', lines: [v?.value ?? '', r ? `${r.value} stored. ${r.detail}` : ''].filter(Boolean), fix: fixOf(v, r), open: v?.open ?? { type: 'open', right: 'utilities' } }); }
  { const v = vital('power'), r = row('power'), on = powerOnPlace(s), ps = powerSummary(s), kw = fmtKw(ps.solarKw + ps.genKw);
    out.push({ id: 'power', label: 'Power', full: on ? `${kw} kW` : 'None', compact: on ? kw : '0', tone: v?.tone ?? 'good', lines: [v?.value ?? '', r ? `${r.value} with no sun and no grid. ${r.detail}` : ''].filter(Boolean), fix: fixOf(v, r), open: v?.open ?? { type: 'open', right: 'utilities' } }); }

  // Needs: what waits on the player (what-to-do-now arrives in S3; the Board lists the same items)
  { const items = [...b.decisions, ...b.gaps], n = items.length;
    const tone = items.reduce<ChipTone>((a, t) => (t.tone === 'good' ? a : worst(a, t.tone)), 'good');
    out.push({ id: 'needs', label: 'Needs you', full: String(n), compact: String(n), tone, quiet: n === 0, lines: n ? [] : ['Nothing needs you today.'], items, open: { type: 'board' }, fix: n ? { label: 'Open the board', act: { type: 'board' } } : undefined }); }

  { const v = vital('defense'), r = row('defense');
    out.push({ id: 'defense', label: 'Defense', full: v ? `${v.value.split(',')[0]} ${v.n}` : '', compact: String(v?.n ?? ''), tone: v?.tone ?? 'good', lines: [v?.value ?? '', r ? `Ammunition: ${r.value}. ${r.detail}` : ''].filter(Boolean), items: b.gaps, fix: v?.fix, open: v?.open ?? { type: 'open', right: 'defense' } }); }
  { const v = vital('morale');
    out.push({ id: 'morale', label: 'Morale', full: `Mood ${v?.n ?? 0}`, compact: '', tone: v?.tone ?? 'good', lines: [v?.value ?? ''], fix: v?.fix, open: v?.open ?? { type: 'open', right: 'family' } }); }
  { const r = row('fuel');
    out.push({ id: 'fuel', label: 'Fuel', full: r?.days != null ? daysWord(r.days) : 'None', compact: r?.days != null ? `${dayText(r.days)} d` : '—', tone: r?.tone ?? 'good', quiet: r?.days == null, lines: r ? [`${r.value}. ${r.detail}`] : [], fix: r && r.tone !== 'good' ? r.fix : undefined, open: r?.fix.act ?? { type: 'shop', tab: 'fuel' } }); }
  return out;
}

/** Plain words for a tone, for screen readers (the glyph is the visual signal). */
export const TONE_WORD: Record<ChipTone, string> = { good: 'fine', warn: 'needs attention', bad: 'critical' };
export const chipAria = (c: ChipModel): string => `${c.label}: ${c.full}${c.tone === 'good' ? '' : `, ${TONE_WORD[c.tone]}`}`;
