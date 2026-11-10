/**
 * The compound board: one read-only page (a clipboard in the safe room, opened from the HUD) that says in a
 * few lines how the place stands: power, water, food days, defense, morale, what threatens it, what waits on
 * the player, each with a one-click jump to the exact tab. A selector over the state, nothing more: no new
 * simulation, nothing saved, nothing locked behind it. It reuses the checklist (operational.ts), the defense
 * report, the power summary, the mood summary and the Next-steps list instead of working anything out again.
 * Pure. `boardCache` keeps the answer until the day (or a card, a build, a person) changes, so a HUD that
 * redraws every frame still computes it about once a day.
 */
import { roadPostLine } from './roadPost';
import type { Pt } from './perimeter';
import { isFinished, holdReason } from './construction';
import { defenseReport, type Check } from './defenseReport';
import { daysOfFood } from './needs';
import { waterDaysStored } from './water';
import { RUNWAY, runway, type RunwayRow } from './runway';
import { moodSummary } from './mind';
import { OP_COVERED, operational, operationalCount, type OpItem } from './operational';
import { powerSummary, fmtKw } from './powerReport';
import { suggestions, type SuggestionAct } from './guidance';
import { needsHookup, powerOnPlace } from './hookups';
import { THREAT_NAME, threatOn } from './threatState';
import { DISASTERS } from './disaster';
import { stuckAction, stuckProject } from './stalls';
import { KIT } from '../game/buildkit/kit';
import { dayIndex, type GameState } from './state';
import { pluralize } from './words';

export type BoardTone = 'good' | 'warn' | 'bad';
/** What a board button does (the HUD handles these four): open a right-hand tab, select a building, arm a kit piece, open the Shop. */
export type BoardAct = Extract<SuggestionAct, { type: 'open' | 'select' | 'stake' | 'shop' | 'order' }>;
export interface BoardLine {
  id: 'power' | 'water' | 'food' | 'defense' | 'morale';
  label: string;
  value: string;
  tone: BoardTone;
  /** Where the row itself jumps to. */
  open: BoardAct;
  /** The one-click fix when the checklist has one (never a requirement). */
  fix?: { label: string; act: BoardAct };
}
export interface BoardItem { id: string; text: string; tone: BoardTone; act?: { label: string; act: BoardAct } }
export interface CompoundBoard {
  day: number;
  /** Checklist progress ("Operational 4 of 5"). */
  operational: { done: number; total: number };
  vitals: BoardLine[];
  /** Defense checks that are failing, worst first. */
  gaps: BoardItem[];
  /** Days the place could last with no resupply, per thing it runs on (sim/runway.ts). */
  runway: RunwayRow[];
  threats: BoardItem[];
  decisions: BoardItem[];
  /** Nothing in threats, no gap, nothing waiting. */
  allClear: boolean;
}

/** How many of each list the page shows (the rest is one tap away in its own tab). */
export const BOARD = { gaps: 3, threats: 4, decisions: 4, waterDaysOk: 7, foodWarn: RUNWAY.food.warn, foodBad: RUNWAY.food.bad, moraleWarn: 55, moraleBad: 40 } as const;

const open = (right: Extract<BoardAct, { type: 'open' }>['right'], supplies?: 'stores' | 'farm'): BoardAct => ({ type: 'open', right, ...(supplies ? { supplies } : {}) });
const asAct = (a: SuggestionAct): BoardAct | undefined => (a.type === 'open' || a.type === 'select' || a.type === 'stake' || a.type === 'shop' ? a : undefined);
const fixOf = (o: OpItem | undefined): BoardLine['fix'] => { const a = o?.act && asAct(o.act.act); return a && o?.act ? { label: o.act.label, act: a } : undefined; };
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

function living(s: GameState) {
  const out: Array<{ i: number; morale: number }> = [];
  s.personState.forEach((ps, i) => { const n = ps.needs; if (n.died == null && !n.left && !n.taken) out.push({ i, morale: n.morale }); });
  return out;
}

/** The board for this state. `drive` as for the defense report (the road gate). Cheap, but see `boardCache` for the HUD. */
export function compoundBoard(s: GameState, drive?: readonly Pt[]): CompoundBoard {
  const day = dayIndex(s.clock.t);
  const dr = defenseReport(s, drive);
  const ops = operational(s, drive, dr);
  const op = (id: OpItem['id']) => ops.find(o => o.id === id);
  const alive = living(s);
  const vitals: BoardLine[] = [];

  // power
  { const r = s.utilities.report, ps = powerSummary(s), o = op('power');
    const on = powerOnPlace(s);
    const value = !on ? o?.line ?? 'No power' : `${ps.batteryKwh > 0 ? `battery ${ps.batteryPct}%, ` : ''}made ${fmtKw(ps.madeKwh)}, used ${fmtKw(ps.usedKwh)} kWh`;
    const tone: BoardTone = r.shortKwh > 0.5 ? 'bad' : !on || ps.problems.length ? 'warn' : 'good';
    vitals.push({ id: 'power', label: 'Power', value, tone, open: open('utilities'), fix: fixOf(o) }); }

  // water
  { const r = s.utilities.report, o = op('water');
    const stored = Math.floor(waterDaysStored(s));
    const value = r.shortL > 0 ? 'ran short yesterday' : o?.done ? (stored >= 1 ? `a source, ${days(stored)} stored` : 'a working source') : o?.line ?? 'No water';
    const tone: BoardTone = r.shortL > 0 ? 'bad' : !o?.done || s.utilities.hauling ? 'warn' : 'good';
    vitals.push({ id: 'water', label: 'Water', value, tone, open: open('utilities'), fix: fixOf(o) }); }

  // food
  { const d = daysOfFood(s), o = op('food'), hungry = !s.food.fromStores && s.food.ateKcal < s.food.needKcal * 0.95;
    const n = Math.round(Math.min(d, 999));
    const growing = o?.done && o.line === 'Growing';
    const value = `${growing ? 'growing, ' : ''}${days(n)} of food on hand`;
    const tone: BoardTone = hungry || n < BOARD.foodBad ? (growing && !hungry ? 'warn' : 'bad') : n < BOARD.foodWarn && !growing ? 'warn' : 'good';
    vitals.push({ id: 'food', label: 'Food', value, tone, open: open('supplies', 'stores'), fix: fixOf(o) }); }

  // defense (the score, and the weakest failing checks come under "Gaps")
  vitals.push({ id: 'defense', label: 'Defense', value: `${dr.label}, ${dr.score} of 100`, tone: dr.tone, open: open('defense'), fix: undefined });

  // morale: the average of those at home, and how many are struggling
  { const avg = alive.length ? alive.reduce((a, x) => a + x.morale, 0) / alive.length : 0;
    const m = moodSummary(s);
    const tone: BoardTone = avg < BOARD.moraleBad || m.breaking > 0 ? 'bad' : avg < BOARD.moraleWarn || m.struggling.length > 0 ? 'warn' : 'good';
    const value = `${Math.round(avg)} of 100${m.struggling.length ? `, ${m.struggling.length} struggling` : ''}`;
    vitals.push({ id: 'morale', label: 'Morale', value, tone, open: open('family'), fix: undefined }); }

  // defense gaps: failing checks, red before amber
  const gaps: BoardItem[] = [...dr.walls, ...dr.watch, ...dr.fight, ...dr.shelter]
    .filter((c: Check) => !c.ok)
    .sort((a, b) => (a.tone === 'bad' ? 0 : 1) - (b.tone === 'bad' ? 0 : 1))
    .slice(0, BOARD.gaps)
    .map(c => ({ id: `gap:${c.id}`, text: `${c.label}: ${c.detail}`, tone: c.tone === 'good' ? 'warn' as const : c.tone, act: { label: 'Defense', act: open('defense') } }));

  // threats
  const threats: BoardItem[] = [];
  { const th = s.lineage?.threat;
    if (th && threatOn(s, th.kind) > 0) threats.push({ id: 'threat', text: `${THREAT_NAME[th.kind]}, ${days(Math.max(1, th.to - day + 1))} to go`, tone: 'warn', act: { label: 'Years', act: open('chronicle') } }); }
  { const d = s.disaster;
    if (d.kind && s.clock.t < d.hitAt && s.clock.t >= d.warnAt) threats.push({ id: 'disaster', text: `${DISASTERS[d.kind]?.name ?? 'Trouble'} expected in ${days(Math.max(1, Math.ceil(d.hitAt - s.clock.t)))}`, tone: 'bad', act: { label: 'Outside', act: open('outside') } }); }
  { const w = s.weather?.active;
    if (w && day <= w.until) threats.push({ id: 'weather', text: `${w.kind.replace(/_/g, ' ')} ${day < w.at ? `due in ${days(w.at - day)}` : 'on now'}`, tone: day < w.at ? 'warn' : 'bad', act: { label: 'Outside', act: open('outside') } }); }
  { const hurt = alive.filter(x => { const n = s.personState[x.i].needs; return n.health < 40 || n.hurt.length > 0; }).length;
    if (hurt) threats.push({ id: 'hurt', text: `${hurt} hurt or ill`, tone: 'bad', act: { label: 'Family', act: open('family') } }); }

  // the road post (sim/roadPost.ts): who is tied up at the drive
  { const post = roadPostLine(s);
    if (post) threats.push({ id: 'roadpost', text: post, tone: 'warn', act: { label: 'Family', act: open('family') } }); }

  // decisions: the unmet checklist items without a row above, a pending card, held work, loose wiring, the Next steps
  const decisions: BoardItem[] = [];
  const shelter = op('shelter');
  if (shelter && !shelter.done) decisions.push({ id: 'op:shelter', text: `Shelter: ${shelter.line}`, tone: 'warn', act: shelter.act && asAct(shelter.act.act) ? { label: shelter.act.label, act: asAct(shelter.act.act)! } : undefined });
  if (s.gate.pending) decisions.push({ id: 'gate', text: `Someone is at the gate: ${s.gate.pending.title}`, tone: 'warn' });
  if (s.gate.aftermath) decisions.push({ id: 'aftermath', text: 'Raiders lie wounded on the drive: say what happens to them', tone: 'warn' });
  { const stuck = stuckProject(s);   // days of waiting with the cash in hand: first on the list, one click to fix
    if (stuck) decisions.unshift({ id: 'stalled', text: `${stuck.escalated ? 'STUCK: ' : ''}${stuckAction(stuck)}: the ${stuck.label} has been stuck ${pluralize(stuck.days, 'day')}${stuck.others > 0 ? ` (+${stuck.others} more stuck)` : ''}`, tone: 'bad', act: { label: 'Order', act: { type: 'order', lines: stuck.lines } } }); }
  { const held = s.structures.filter(st => !isFinished(st) && holdReason(s, st));
    if (held.length && !decisions.some(d => d.id === 'stalled')) decisions.push({ id: 'held', text: `${held.length} ${held.length === 1 ? 'project is' : 'projects are'} stuck: ${holdReason(s, held[0])}`, tone: 'warn', act: { label: 'Projects', act: { type: 'select', id: held[0].id } } }); }
  { const hook = needsHookup(s);
    if (hook.length) decisions.push({ id: 'hookups', text: `${cap(hook[0].name.replace(/_/g, ' '))}: ${hook[0].todo}${hook.length > 1 ? ` (+${hook.length - 1} more)` : ''}`, tone: 'warn', act: { label: 'Utilities', act: open('utilities') } }); }
  for (const x of suggestions(s, 2, OP_COVERED)) {
    if (x.id === 'stalled') continue;   // (it is the first line above)
    const a = x.acts?.map(y => ({ label: y.label, act: asAct(y.act) })).find(y => y.act) as { label: string; act: BoardAct } | undefined;
    decisions.push({ id: `sug:${x.id}`, text: `${x.title ?? KIT[x.kind]?.name ?? x.kind}: ${x.why}`, tone: 'good', act: a ?? (x.kind ? { label: 'Stake it', act: { type: 'stake', kind: x.kind } } : undefined) });
  }

  const count = operationalCount(ops);
  const out: CompoundBoard = { day, operational: count, vitals, gaps, runway: runway(s), threats: threats.slice(0, BOARD.threats), decisions: decisions.slice(0, BOARD.decisions), allClear: false };
  out.allClear = !out.threats.length && !out.gaps.length && !out.decisions.length && out.vitals.every(v => v.tone === 'good');
  return out;
}

/**
 * A memo for the HUD: the board is worked out again only when the day changes or something the page names does
 * (a card at the gate, a build started or finished, someone joining or leaving). Holds one entry.
 */
export function boardCache(): (s: GameState, drive?: readonly Pt[]) => CompoundBoard {
  let key = '', last: CompoundBoard | null = null;
  return (s, drive) => {
    const fin = s.structures.reduce((a, st) => a + (isFinished(st) ? 1 : 0), 0);
    const k = `${dayIndex(s.clock.t)}|${s.structures.length}|${fin}|${s.people.length}|${s.gate.pending ? 1 : 0}${s.gate.aftermath ? 1 : 0}|${s.perimeter.length}|${s.disaster.phase}`;
    if (!last || k !== key) { last = compoundBoard(s, drive); key = k; }
    return last;
  };
}
