/**
 * "What to do now" (docs/UX_AUDIT.md 11.4, layout A): the single most important next action and at most two follow-ups, picked from
 * selectors that already exist. Nothing is worked out again and nothing is saved:
 *   alarms         the compound board's red vitals (food, water, power), people hurt, a project stuck with the money waiting
 *   the goal       a disaster's signature chain (sim/felt/goalLib.ts) while it is up, else the first-hour goal (sim/firstHour.ts)
 *   next steps     held projects and loose wiring from the board's "waiting on you", then the Next-steps suggestions (sim/guidance.ts)
 * Each row has one click (`act`, the same actions the Build tab's buttons run). A row never repeats another's action. Pure (tested).
 */
import type { Pt } from './perimeter';
import { compoundBoard, type BoardItem, type CompoundBoard } from './compoundBoard';
import { firstHour, type FirstHour, type GoalAct, type GoalMemory } from './firstHour';
import { feltChain } from './felt/goalLib';
import { suggestions, type Suggestion } from './guidance';
import { OP_COVERED } from './operational';
import { orderProblem, orderShortfall } from './economy';
import { usdShort } from './spendGuard';
import { KIT } from '../game/buildkit/kit';
import { dayIndex, type GameState } from './state';
import { pluralize } from './words';

export type TodoTone = 'bad' | 'warn' | 'info';
export type TodoKind = 'alarm' | 'goal' | 'next';
export interface TodoRow {
  id: string;
  kind: TodoKind;
  tone: TodoTone;
  /** "Out of food in 3 days". */
  title: string;
  /** One short line: why, or where it stands. */
  sub?: string;
  /** The one click. `off` is why it cannot be pressed now. */
  act?: { label: string; act: GoalAct; off?: string; note?: string };
}
export interface WhatToDo {
  /** The top row first, then at most two follow-ups. */
  rows: TodoRow[];
  /** Other things that wait (not shown). */
  more: number;
  /** "Goal 2 of 6" while a goal row is on the card. */
  progress?: { heading: string; done: number; total: number };
}

export interface TodoCtx {
  drive?: readonly Pt[];
  goalMem?: GoalMemory;
  /** The first-hour card was folded away or finished by the player. */
  goalsClosed?: 'set' | 'dismissed' | null;
  /** The disaster kind whose chain the player folded back to the first-hour goals. */
  feltOff?: string | null;
  /** A board already worked out for this state (the HUD caches one). */
  board?: CompoundBoard;
}

/** Rows on the card: the top one and two follow-ups. */
export const TODO_ROWS = 3;
/** While a goal is up, a Next-steps row shows only at or above this urgency (the Build tab's rule). */
const GUIDED_URGENT = 90;

/** A stable key for a click, so two rows never offer the same one. */
export function actKey(a: GoalAct | undefined): string {
  if (!a) return '';
  switch (a.type) {
    case 'stake': return `stake:${a.kind}`;
    case 'select': return `select:${a.id}`;
    case 'shop': return `shop:${a.tab}`;
    case 'open': return `open:${a.right}:${a.supplies ?? ''}`;
    case 'order': return `order:${a.lines.map(l => `${l.material}x${l.qty}`).join(',')}`;
    case 'crew': return `crew:${a.id}`;
    case 'hookup': return `hookup:${a.what}`;
    case 'tool': return `tool:${a.tool}`;
    case 'fx': return `fx:${a.choice}`;
    default: return a.type;
  }
}

const fix = (a: GoalAct | undefined, s: GameState, label: string): TodoRow['act'] =>
  a ? { label, act: a, ...(a.type === 'order' && orderProblem(s, a.lines) ? { off: orderProblem(s, a.lines) === 'cannot_afford' ? `Need ${usdShort(orderShortfall(s, a.lines))} more` : 'Cannot order that now (nobody is delivering)' } : {}) } : undefined;

function boardAlarms(s: GameState, b: CompoundBoard): TodoRow[] {
  const out: TodoRow[] = [];
  const v = (id: string) => b.vitals.find(x => x.id === id);
  const food = v('food');
  if (food?.tone === 'bad' || food?.first) {
    const n = food.n ?? 0, hungry = !s.food.fromStores && s.food.ateKcal < s.food.needKcal * 0.95;
    if (food.first) out.push({ id: 'alarm:food', kind: 'alarm', tone: 'warn', title: n < 1 ? 'The shelf is bare: stock it first' : `Food for ${pluralize(n, 'day')} on the shelf`,
      sub: `${s.people.length} to feed. Stock the shelf first: the trucks are running and nobody is hungry yet.`, act: { label: 'Open food shelf', act: { type: 'shop', tab: 'food' } } });
    else out.push({ id: 'alarm:food', kind: 'alarm', tone: 'bad', title: hungry && n < 1 ? 'Out of food: the family is going hungry' : n < 1 ? 'Out of food today' : `Out of food in ${pluralize(n, 'day')}`,
      sub: `${s.people.length} to feed. Stock the shelf now, while the trucks run.`, act: { label: 'Open food shelf', act: { type: 'shop', tab: 'food' } } });
  }
  const water = v('water');
  if (water?.tone === 'bad') out.push({ id: 'alarm:water', kind: 'alarm', tone: 'bad', title: 'Water ran short yesterday', sub: 'Check the well, the pump and what is stored.', act: { label: 'Open Utilities', act: { type: 'open', right: 'utilities' } } });
  const power = v('power');
  if (power?.tone === 'bad') out.push({ id: 'alarm:power', kind: 'alarm', tone: 'bad', title: 'Power is short', sub: 'More is used than made. Cut the load or add supply.', act: { label: 'Open Utilities', act: { type: 'open', right: 'utilities' } } });
  const hurt = b.threats.find(t => t.id === 'hurt');
  if (hurt) out.push({ id: 'alarm:hurt', kind: 'alarm', tone: 'bad', title: `${hurt.text[0].toUpperCase()}${hurt.text.slice(1)}`, sub: 'Dressings, rest and medicine help most.', act: { label: 'Open People', act: { type: 'open', right: 'family' } } });
  const air = b.threats.find(t => t.id === 'dome_air');
  if (air) out.push({ id: 'alarm:dome', kind: 'alarm', tone: air.tone === 'bad' ? 'bad' : 'warn', title: air.text, sub: 'Open the vents, restore power, or buy filtering.', act: { label: 'Open the Dome page', act: { type: 'open', right: 'utilities' } } });
  const stuck = b.decisions.find(d => d.id === 'stalled');
  if (stuck?.act) out.push({ id: 'alarm:stalled', kind: 'alarm', tone: 'bad', title: stuck.text.replace(/^STUCK: /, ''), act: fix(stuck.act.act, s, stuck.act.label) });
  return out;
}

const waiting = (x: BoardItem, s: GameState): TodoRow | null => {
  if (!x.act) return null;
  // one line each: "1 project is stuck: waiting for plumbing", "Well drilled: needs a pump line" (the card clamps it to two lines)
  const text = x.text.replace(/^(\d+) projects are stuck/, '$1 projects are stuck');
  return { id: `next:${x.id}`, kind: 'next', tone: 'warn', title: text[0].toUpperCase() + text.slice(1), act: fix(x.act.act, s, x.act.label) };
};

function suggestionRow(x: Suggestion, s: GameState): TodoRow | null {
  const a = x.acts?.[0];
  const title = x.title ?? (x.kind && KIT[x.kind] ? `Stake a ${KIT[x.kind].name.toLowerCase()}` : x.kind);
  if (!a && !x.kind) return { id: `next:${x.id}`, kind: 'next', tone: x.tone === 'alarm' ? 'bad' : 'info', title, sub: x.why };
  const act = a ? fix(a.act, s, a.label) : { label: 'Stake it', act: { type: 'stake' as const, kind: x.kind } };
  return { id: `next:${x.id}`, kind: 'next', tone: x.tone === 'alarm' ? 'bad' : 'info', title, sub: x.why, act };
}

/** Day 0 and no collapse running: the first hour of a new game. A disaster that has hit (impact, survival) is never "opening". */
export function openingHour(s: GameState): boolean {
  return dayIndex(s.clock.t) < 1 && s.disaster.phase !== 'impact' && s.disaster.phase !== 'survival';
}

/** The card's rows for this state. */
export function whatToDo(s: GameState, ctx: TodoCtx = {}): WhatToDo {
  const board = ctx.board ?? compoundBoard(s, ctx.drive);
  const alarms = boardAlarms(s, board);

  // the goal: the disaster's chain while it is up (and not folded back), else the first-hour goals unless the player closed them
  const chain = feltChain(s), chainUp = !!chain && ctx.feltOff !== s.disaster.kind;
  const fh: FirstHour = chainUp ? chain : firstHour(s, ctx.drive, ctx.goalMem);
  const goalUp = (chainUp ? true : (ctx.goalsClosed ?? null) === null) && !fh.complete && fh.goals.length > 0 && !!fh.current;
  const goal: TodoRow | null = goalUp ? {
    id: `goal:${fh.current!.id}`, kind: 'goal', tone: 'info', title: fh.current!.title, sub: fh.current!.line,
    ...(fh.current!.act ? { act: { label: fh.current!.act.label, act: fh.current!.act.act, ...(fh.current!.act.off ? { off: fh.current!.act.off } : {}), ...(fh.current!.act.note ? { note: fh.current!.act.note } : {}) } } : {}),
  } : null;

  // next steps: what the board says waits on the player, then the suggestions; while a goal is up only the urgent ones
  const nextRows: Array<{ row: TodoRow; urgency: number }> = [];
  for (const x of board.decisions) { if (x.id === 'held' || x.id === 'hookups') { const r = waiting(x, s); if (r) nextRows.push({ row: r, urgency: x.id === 'held' ? 62 : 55 }); } }
  const skip = goalUp ? new Set([...OP_COVERED, 'house_crew', 'road_pile']) : OP_COVERED;
  for (const x of suggestions(s, 6, skip)) {
    if (x.id === 'stalled') continue;   // (an alarm above)
    if (goalUp && x.urgency < GUIDED_URGENT && x.tone !== 'alarm') continue;
    const r = suggestionRow(x, s);
    if (r) nextRows.push({ row: r, urgency: x.urgency });
  }
  nextRows.sort((a, b) => b.urgency - a.urgency);

  // assemble: alarms (at most two, so the goal still shows), the goal, the rest; no two rows share a click or a title
  // day 0, before the clock has first run: the first-hour goal leads and a food alarm follows it, unless food is at 0 or a collapse is already running
  const early = goal !== null && openingHour(s), soft = (a: TodoRow) => early && a.id === 'alarm:food' && (board.vitals.find(v => v.id === 'food')?.n ?? 0) >= 1;
  const lead = alarms.filter(a => !soft(a)), later = alarms.filter(soft);
  const all: TodoRow[] = [...lead.slice(0, 2), ...(goal ? [goal] : []), ...later, ...lead.slice(2), ...nextRows.map(n => n.row)];
  const seenAct = new Set<string>(), seenTitle = new Set<string>(), rows: TodoRow[] = [];
  let dropped = 0;
  for (const r of all) {
    const k = actKey(r.act?.act), t = r.title.toLowerCase();
    if ((k && seenAct.has(k)) || seenTitle.has(t)) { dropped++; continue; }
    if (k) seenAct.add(k); seenTitle.add(t); rows.push(r);
  }
  const shown = rows.slice(0, TODO_ROWS);
  const out: WhatToDo = { rows: shown, more: Math.max(0, rows.length - shown.length) };
  if (shown.some(r => r.kind === 'goal')) out.progress = { heading: fh.heading ?? 'Get operational', done: fh.done, total: fh.total };
  void dropped;
  return out;
}

/** A cheap key: the card is worked out again only when one of these changes (the day, a build, a card, a person, the cash in 50 steps). */
export function todoKey(s: GameState, ctxKey = ''): string {
  const fin = s.structures.reduce((a, st) => a + (st.finishedAt !== null ? 1 : 0), 0);
  return `${dayIndex(s.clock.t)}|${s.structures.length}|${fin}|${s.people.length}|${s.gate.pending ? 1 : 0}|${s.perimeter.length}|${s.disaster.phase}|${Math.floor(s.money / 50)}|${Math.floor(s.clock.t * 4)}|${ctxKey}`;
}
