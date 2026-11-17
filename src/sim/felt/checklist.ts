/**
 * The felt checklist (docs/FELT_LAYER.md section 8), the part that can be decided from a kind's spec alone. FL6 adds the checks that need a
 * played state (marks at day 7 and 30, determinism, difficulty). Each item is true when the kind meets it.
 */
import { FX, columnsOf } from '../disasterFx';
import type { DisasterKind } from '../disaster';
import { FELT } from './registry';
import type { FeltKind } from './types';
import type { PlayedLog } from './played';

export type FeltItem = 'teeth' | 'hit' | 'card' | 'marks' | 'radio' | 'cards' | 'goals';
export const FELT_ITEMS: FeltItem[] = ['teeth', 'hit', 'card', 'marks', 'radio', 'cards', 'goals'];

export function feltChecks(kind: FeltKind): Record<FeltItem, boolean> {
  const f = FELT[kind];
  const radio = f.radio ?? [];
  return {
    teeth: kind in FX && columnsOf(kind as DisasterKind).length >= 4,
    hit: !!f.hit && f.hit.beats.length >= 2 && f.hit.beats.length <= 4 && Math.max(...f.hit.beats.map(b => b.at)) <= 6 && f.hit.title.length > 0,
    card: !!f.card,
    marks: !!f.marks,
    radio: new Set(radio.map(l => l.id)).size >= 5 && radio.some(l => l.truth === 'true') && radio.some(l => l.truth === 'false') && new Set(radio.map(l => l.channel)).size >= 2,
    cards: (f.cards ?? []).length > 0 && (f.cards ?? []).every(c => c.options.length >= 2 && c.options.some(o => o.id === c.fallback)),
    goals: !!f.goals && f.goals.steps.length >= 3 && f.goals.steps.length <= 5,
  };
}

export const feltPassing = (kind: FeltKind): FeltItem[] => FELT_ITEMS.filter(i => feltChecks(kind)[i]);

/**
 * FL6: the played-state items (section 8, items 2, 4, 6, 7, 8 as the player meets them), decided from a real run (`played.ts`, 30 days).
 * `world`: at least one world mark at day 7 and still one at day 30 (that they change is read off the shots). `hitBeat`: a 2 to 4 beat hit sequence of at most 6 s with
 * a title (the table or the kind's own). `card`: a decision card came up in 30 days. `goal`: a signature chain of 3 to 5 steps at day 1.
 * `radio`: 5 or more distinct lines heard in 30 days. `teeth`: 4 or more columns. A kind that cannot be triggered yet fails every item.
 */
export type PlayedItem = 'world' | 'hitBeat' | 'card' | 'goal' | 'radio' | 'teeth';
export const PLAYED_ITEMS: PlayedItem[] = ['world', 'hitBeat', 'card', 'goal', 'radio', 'teeth'];

export function playedChecks(p: PlayedLog, titles: Record<string, number> = {}): Record<PlayedItem, boolean> {
  return {
    world: p.marks7.length >= 1 && p.marks30.length >= 1,
    hitBeat: !!p.hit && p.hit.beats >= 2 && p.hit.beats <= 4 && p.hit.seconds <= 6 && p.hit.title.length > 0 && (titles[p.hit.title] ?? 1) === 1,
    card: p.cards.length >= 1,
    goal: p.goalSteps >= 3 && p.goalSteps <= 5,
    radio: p.radio.length >= 5,
    teeth: p.columns >= 4,
  };
}
export const titleCounts = (logs: PlayedLog[]): Record<string, number> => { const c: Record<string, number> = {}; for (const p of logs) if (p.hit) c[p.hit.title] = (c[p.hit.title] ?? 0) + 1; return c; };
export const playedPassing = (p: PlayedLog, titles: Record<string, number> = {}): PlayedItem[] => (p.triggerable ? PLAYED_ITEMS.filter(i => playedChecks(p, titles)[i]) : []);

/** The matrix (kind x item) as text, for the PR body: `x` passes, `.` fails, `-` cannot be triggered. */
export function matrixText(logs: PlayedLog[]): string {
  const t = titleCounts(logs);
  const head = `| kind | ${PLAYED_ITEMS.join(' | ')} | static (${FELT_ITEMS.join(' ')}) |`;
  const sep = `|---|${PLAYED_ITEMS.map(() => ':-:').join('|')}|---|`;
  const rows = logs.map(p => `| ${p.kind} | ${PLAYED_ITEMS.map(i => (p.triggerable ? (playedChecks(p, t)[i] ? 'x' : '.') : '-')).join(' | ')} | ${FELT_ITEMS.map(i => (feltChecks(p.kind)[i] ? i[0] : '.')).join('')} |`);
  return [head, sep, ...rows].join('\n');
}
