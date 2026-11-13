/**
 * The first hour as a short run of goals (docs/DECISIONS.md, "Guided first-hour goals"). One selector over the game state, nothing
 * saved with the game and no new mechanic: the five "Get operational" lines (sim/operational.ts) plus the driveway, each given a
 * plain reason to do it, a reward line, one primary button, an honest time (the family's pace, a crew, a permit wait) and, when the
 * cash is short, what to do about it. The HUD shows ONE current goal at a time with "2 of 6"; the rest wait in a one-line strip.
 *
 * Goals reflect the real lot: a goal the land already meets (a well that came with it, a house, a drive that is in) is not listed
 * and not counted. What was ever on the list lives in `GoalMemory` (UI state in localStorage, `cb.feel.goals.*`): a goal that was
 * open once and is met now counts as done, one that was met from the start never appears.
 *
 * Pure (tested). The reasons and numbers come from the sim's own functions, so the card cannot disagree with the Projects tab,
 * the Defense tab or the top-bar clock.
 */
import type { Pt } from './perimeter';
import { PERIMETER, UTILITY_LINES, runFinished } from './perimeter';
import { BLUEPRINTS, HOME_BEDS, homeBeds, isHome, totalHours } from './blueprints';
import { isFinished } from './construction';
import { onOrder, orderCost, orderProblem, prices } from './economy';
import { homeAdvice, kitUsd } from './homeAdvice';
import { buildOff, costPer100m, perimeterOff, plansNeedLines, type SuggestionAct } from './guidance';
import { operational, type OpId, type OpItem } from './operational';
import { RESERVE_MIN, RESERVE_SHARE, starterWanted } from './starterCompound';
import { crewNudge } from './crewNudge';
import { crewProblem, crewQuote } from './crews';
import { eta, paceOf, weeksFor, weeksUntil } from './pace';
import { permitHold } from './paperwork';
import { FOOD_NUDGE_DAYS, foodNudge, spendCheck } from './spendGuard';
import { daysOfFood } from './needs';
import { driveQuote, hookupProblem } from './improvements';
import { TENT_PRICE, TENT_SEATS, housingShortfall } from './housing';
import { POWER_BUILDINGS } from './hookups';
import { runway } from './runway';
import { diffOf } from './difficulty';
import { WAVE } from './waves';
import { dayIndex, type GameState, type Structure } from './state';
import { pluralize } from './words';

export type GoalId = 'roof' | 'water' | 'food' | 'power' | 'drive' | 'fence';
export const GOAL_IDS: readonly GoalId[] = ['roof', 'water', 'food', 'power', 'drive', 'fence'];

/** 'todo': there is something to do now. 'underway': placed, and only time (or nothing you can speed up) is left. 'done'. */
export type GoalStatus = 'todo' | 'underway' | 'done';

/** The one primary button: a normal suggestion action, or the starter-compound proposal (the HUD opens it). */
export type GoalAct = { type: 'starter' } | SuggestionAct;

export interface FirstHourGoal {
  id: GoalId;
  /** "A roof for the family". */
  title: string;
  status: GoalStatus;
  /** One short line of where it stands ("No roof yet"). */
  line: string;
  /** The single primary button, when there is something to click. `off` is why it cannot be pressed now. */
  act?: { label: string; act: GoalAct; off?: string };
  /** "Why this matters": what happens if you skip it, tied to the real clocks. */
  why: string;
  /** The reward line on the goal card when it is done. */
  reward: { title: string; line: string };
  /** How long it takes, from the sim: the family's pace, a crew, a permit wait. Null when nothing is placed to time. */
  pace: string | null;
  /** What to do when the cash is short (null when it is not). */
  money: string | null;
}

export interface GoalMemory {
  /** Goals that were open (not met) at some point. */
  seen: readonly GoalId[];
  /** Goals that have been done. Done stays done. */
  done: readonly GoalId[];
}
export const EMPTY_MEMORY: GoalMemory = { seen: [], done: [] };

export interface FirstHour {
  /** The goals that apply to this lot, in order. */
  goals: FirstHourGoal[];
  /** The one to show: the first with something to do, else the first still under way. Null when all are done. */
  current: FirstHourGoal | null;
  /** While the roof is the current goal: the water, food and power goals that can be started now, so one stuck goal never blocks the rest. */
  alsoOpen: FirstHourGoal[];
  done: number;
  total: number;
  /** Every goal on the list is done (and there is at least one). */
  complete: boolean;
  /** The memory after this look (the HUD saves it when it changed). */
  memory: GoalMemory;
}

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const KINDS: Record<GoalId, (k: string) => boolean> = {
  roof: isHome,
  water: k => ['well_hand', 'well_drilled', 'cistern', 'water_tower'].includes(k),
  food: k => ['garden', 'field', 'greenhouse', 'greenhouse_heated', 'polytunnel', 'high_tunnel', 'orchard', 'orchard_grove', 'orchard_terraced', 'aquaponics'].includes(k),
  power: k => POWER_BUILDINGS.includes(k),
  drive: () => false,
  fence: () => false,
};
const OP_OF: Partial<Record<GoalId, OpId>> = { roof: 'shelter', water: 'water', food: 'food', power: 'power', fence: 'defense' };

const placedOf = (s: GameState, id: GoalId): Structure[] => s.structures.filter(st => !st.unplaced && KINDS[id](st.kind));
const openRuns = (s: GameState) => s.perimeter.filter(r => !runFinished(r) && !UTILITY_LINES.includes(r.kind));
/** Something of the player's own making is placed on the land (the starter proposal is for an empty lot). */
// (the pipe and cable laid in for a house that came with the land are not the player's own work: a house-start lot still gets its starter plan)
const anyOwnPlaced = (s: GameState) => s.structures.some(st => !st.pre && !st.unplaced) || s.perimeter.some(r => !UTILITY_LINES.includes(r.kind));

/** The price of a kit piece in today's market (the buyable part of its bill). */
export function kitCost(s: GameState, kind: string): number {
  return kitUsd(s, kind);
}

/** Days from the collapse to the first raiders at this difficulty (the wave clock's own table). */
export const firstRaidDays = (s: GameState): number => Math.round(WAVE.FIRST * diffOf(s.disaster).lull);

/**
 * The real collapse clock, in words. In a Surprise game the date stays hidden until the warning signs start (the top-bar chip
 * shows it then), so before that this says only what is always true: nothing is delivered and nobody is hired once it breaks, and
 * the first raiders come about two weeks later.
 */
export function clockNote(s: GameState): string {
  const d = s.disaster, t = s.clock.t, raid = firstRaidDays(s);
  if (!d.kind) return '';
  if (t >= d.hitAt) {
    const since = dayIndex(t) - dayIndex(d.hitAt);
    const w = s.gate.waves;
    return (w?.n ?? 0) === 0 ? `It has been ${pluralize(Math.max(0, since), 'day')} since the collapse and the first raiders are due about day ${raid}.` : '';
  }
  if (t >= d.warnAt) return `The warning signs are out: impact in ${pluralize(Math.max(1, Math.ceil(d.hitAt - t)), 'day')}, and the first raiders come about ${pluralize(raid, 'day')} after it.`;
  return `When the county breaks, trucks and crews stop coming, and the first raiders show up about ${pluralize(raid, 'day')} later.`;
}

/** Cash the starter plan can spend: what is on hand less the living reserve it keeps back (the proposal's own rule). */
export const starterBudget = (s: GameState): number => Math.max(0, s.money) - Math.max(RESERVE_MIN, Math.round(Math.max(0, s.money) * RESERVE_SHARE));
/** The proposal has something to say only when its cheapest piece (the outhouse) fits the budget; below that every row reads "later". */
export const starterFits = (s: GameState): boolean => starterWanted(s) && starterBudget(s) >= kitCost(s, 'outhouse');

/** Cheapest way to give the family beds, for the roof goal's cash advice: [kind, cost, beds]. */
function cheapestHome(s: GameState): { kind: string; usd: number; beds: number } | null {
  const all = ['cottage', 'timber_cabin'].filter(k => BLUEPRINTS[k]);   // (priced from the blueprint: a tight purse also trips the site check, and the advice still has to name a price)
  const opts = all.map(k => ({ kind: k, usd: kitCost(s, k), beds: HOME_BEDS[k] ?? 0 }));
  return opts.sort((a, b) => a.usd - b.usd)[0] ?? null;
}

/** The home to stake when none is placed: the smallest that sleeps everyone, else the biggest that can be staked. */
function homeToStake(s: GameState): string | null {
  const need = Math.max(1, s.people.length);
  const ok = ['cottage', 'timber_cabin'].filter(k => BLUEPRINTS[k] && !buildOff(s, k));
  return ok.find(k => (HOME_BEDS[k] ?? 0) >= need) ?? ok[ok.length - 1] ?? null;
}

const SHORT = 'Choose a cheaper piece from the Build list, let the family do the work themselves, or wait for more cash.';

/** The honest time for a goal that has something placed (or, if nothing is placed yet, a rough one from the blueprint). */
function paceLine(s: GameState, id: GoalId, kind?: string): string | null {
  const pace = paceOf(s);
  const asked = id === 'drive' ? null : placedOf(s, id).find(st => !isFinished(st)) ?? null;
  if (id === 'drive') {
    const due = s.siteJobs?.drive;
    if (due != null) return `The contractor is on it: about ${pluralize(Math.max(1, Math.ceil(due - s.clock.t)), 'day')} more.`;
    const q = driveQuote(s.site.improvements, s.site, s.seed);
    return `A contractor needs about ${pluralize(q.days, 'day')} for it.`;
  }
  if (id === 'fence') {
    const runs = openRuns(s);
    if (!runs.length) return null;
    const first = runs[0];
    const w = weeksUntil(s, first.id, pace);
    return `At the family's pace the fence takes ${eta(w)}.`;
  }
  if (asked) {
    const bits: string[] = [];
    const hold = permitHold(s, asked);
    if (hold) bits.push(`${hold}.`);
    const crewed = (s.crews ?? []).some(c => c.target === asked.id);
    const weeks = weeksUntil(s, asked.id, pace);
    const mates = pace.employed.length && weeks !== null && weeks > 6 ? ` (${pace.employed.join(' and ')} ${pace.employed.length > 1 ? 'work' : 'works'} in town, so building waits for weekends)` : '';
    if (crewed) { const q = crewQuote(asked); bits.push(`The crew is on it: about ${pluralize(q.weeks, 'week')} left.`); }
    else {
      bits.push(`At the family's pace: ${eta(weeks)}${mates}.`);
      if (!crewProblem(s, asked)) { const q = crewQuote(asked); bits.push(`A crew of four: about ${pluralize(q.weeks, 'week')}, ~${usd(q.usd)}.`); }
    }
    const due = s.orders.filter(o => o.status === 'ordered').map(o => o.dueAt - s.clock.t);
    if (due.length) bits.push(`Materials arrive in about ${pluralize(Math.max(1, Math.ceil(Math.max(...due))), 'day')}.`);
    return bits.join(' ');
  }
  if (kind && BLUEPRINTS[kind]) {
    const hrs = totalHours(BLUEPRINTS[kind]), w = weeksFor(hrs, pace);
    const adv = id === 'roof' ? homeAdvice(s) : null, crew = adv && adv.kind === kind && adv.crewUsd !== null ? ` A crew of four would do it in about ${pluralize(adv.crewWeeks!, 'week')} for ~${usd(adv.crewUsd)} more.` : '';
    return `About ${pluralize(Math.round(hrs), 'hour')} of work: ${eta(w)} at the family's pace, after the materials and any permit come in.${crew}`;
  }
  return null;
}

/** What the list says about a goal when it is finished (the reward on the card). */
function reward(s: GameState, id: GoalId): { title: string; line: string } {
  const n = s.people.length;
  switch (id) {
    case 'roof': return { title: 'A roof over our heads', line: `${pluralize(Math.max(1, n), 'bed')} for ${n === 1 ? 'one' : 'all ' + n}. Nobody sleeps in the weather now.` };
    case 'water': return { title: 'Water on the place', line: 'A working well. The family no longer depends on a truck for the first thing it needs.' };
    case 'food': return { title: 'Food for the weeks ahead', line: 'The shelf is stocked and something is growing. The pantry lasts longer once the first harvest comes in.' };
    case 'power': return { title: 'The lights come on', line: 'Power for the pump, the lights and the freezer.' };
    case 'drive': return { title: 'Trucks reach the yard', line: 'Deliveries come to the door now, not to the road. Nothing to carry in by hand.' };
    case 'fence': return { title: 'A fence around the yard', line: 'It will not stop a large crew, but an open yard is the easiest mark. The Defense tab shows what comes next.' };
  }
}

const TITLE: Record<GoalId, string> = {
  roof: 'A roof for the family', water: 'Water you can count on', food: 'Food on the shelf and in the ground', power: 'Power for the pump and lights', drive: 'A drive for the trucks', fence: 'A fence around the yard',
};

function whyText(s: GameState, id: GoalId): string {
  const clock = clockNote(s), after = clock ? ` ${clock}` : '';
  switch (id) {
    case 'roof': return `Without a roof the family sleeps in tents, and cold, rain and crowding wear on health and mood. A house takes weeks to months to build, and it is the one job a crew will not take once the county breaks.${after}`;
    case 'water': return `A well takes days to weeks to dig and the pump needs power. Skip it and water comes from a truck or a creek until the trucks stop.${after}`;
    case 'food': return `Plants need a full season before the first harvest. If the shelves run low before then, the family goes hungry, and bought food gets scarce and costly once deliveries stop.${after}`;
    case 'power': return `The pump, the lights and the freezer all run on it. Solar is slow to build and nobody will sell you a panel after the grid fails.${after}`;
    case 'drive': return `With no drive in, the truck leaves every order at the road and the family carries it in by hand, which slows every other job on this list.${after}`;
    case 'fence': return `Unfenced land is the easy mark for looters. A fence does not stop a big crew, but it turns back the opportunists and slows the rest.${after}`;
  }
}

/** Raw state of one goal, before the memory decides what "met" means: met, placed-and-unfinished, and the buttons. */
function look(s: GameState, id: GoalId, ops: Map<OpId, OpItem>, nudge: ReturnType<typeof crewNudge>): { /** Cannot be done at all now (nobody takes the job): not a goal. */ skip?: boolean; met: boolean; evidence: boolean; line: string; placed: boolean; act?: FirstHourGoal['act'] } {
  const needLines = plansNeedLines(s);
  const needCost = needLines.length ? orderCost(needLines, prices(s)) : 0;
  const order = (): FirstHourGoal['act'] | undefined => {
    if (!needLines.length) return undefined;
    const off = orderProblem(s, needLines);
    return { label: `Order what the plans need (~${usd(needCost)})`, act: { type: 'order', lines: needLines }, ...(off ? { off: 'Cannot order that now' } : {}) };
  };
  if (id === 'drive') {
    const inNow = !!s.site.improvements.drive;
    const q = driveQuote(s.site.improvements, s.site, s.seed), ordered = s.siteJobs?.drive != null;
    const why = hookupProblem(s, 'drive');
    if (!inNow && !ordered && why && why !== 'not enough money') return { skip: true, met: false, evidence: false, line: '', placed: false };   // nobody is taking jobs: there is no goal to give
    return { met: inNow, evidence: false, line: inNow ? 'The drive is in' : ordered ? 'The contractor is working' : 'No drive in', placed: ordered,
      ...(!inNow && !ordered ? { act: { label: `Hire the drive contractor (${usd(q.usd)})`, act: { type: 'hookup' as const, what: 'drive' as const }, ...(why ? { off: `Needs ${usd(q.usd)} in cash` } : {}) } } : {}) };
  }
  const op = ops.get(OP_OF[id]!)!;
  const placed = id === 'fence' ? openRuns(s).length > 0 : placedOf(s, id).some(st => !isFinished(st));
  const ownDone = id === 'fence' ? false : placedOf(s, id).some(st => !st.pre && isFinished(st));
  // food: something growing (or 90 days put by) AND a pantry that lasts two weeks. A start with one day of food on the shelf is the first thing to fix.
  const left = daysOfFood(s), pantryLow = id === 'food' && Number.isFinite(left) && left < FOOD_NUDGE_DAYS;
  // fence: a finished fence or wall run around the place is the goal (a Guarded rating takes a wall around the whole line: that is the Defense tab's long game)
  const fenced = id === 'fence' && s.perimeter.some(r => runFinished(r) && !UTILITY_LINES.includes(r.kind));
  const base = { met: (op.done && !pantryLow) || fenced, evidence: id === 'fence' ? fenced : ownDone, line: id === 'fence' ? (fenced ? 'A fence stands' : placed ? 'Fence going up' : 'No fence yet') : pantryLow ? `${Math.max(0, Math.floor(left))} ${Math.floor(left) === 1 ? 'day' : 'days'} of food on hand${op.done ? '' : ', nothing growing'}` : op.line, placed };
  if (id === 'food' && pantryLow) {
    const f = foodNudge(s);
    if (f) return { ...base, act: { label: `Stock food: a month of staples is about ${usd(f.cost)}`, act: { type: 'shop', tab: 'food' } } };
  }
  if (base.met) return base;
  if (op.done) return base;
  // nothing of your own on the land yet and the starter proposal still has something to say: that one click does the right thing for the whole first hour
  if (!anyOwnPlaced(s) && starterFits(s) && id !== 'fence') return { ...base, act: { label: 'Lay out a starter compound', act: { type: 'starter' } } };
  if (placed) {
    const o = order();
    if (o) return { ...base, act: o };
    if (id === 'roof' && nudge && placedOf(s, 'roof').some(h => h.id === nudge.id)) return { ...base, act: { label: nudge.lines.length ? `Order and hire a crew (~${usd(nudge.totalUsd)})` : `Hire a crew (~${usd(nudge.usd)})`, act: { type: 'crew', id: nudge.id, ...(nudge.lines.length ? { lines: nudge.lines } : {}) } } };
    return base;
  }
  if (id === 'roof') {
    const adv = homeAdvice(s), kind = adv?.kind ?? homeToStake(s) ?? 'cottage';
    // the cash cannot cover a home and its reserve: tents now (so nobody sleeps outside), a home when the money is there
    if (starterBudget(s) < kitCost(s, kind)) {
      const out = housingShortfall(s).outside, tents = out > 0 && (s.stock.tent ?? 0) < 1 && !(onOrder(s).tent ?? 0) ? Math.ceil(out / TENT_SEATS) : 0;
      return { ...base, ...(tents > 0 && s.money >= tents * TENT_PRICE ? { act: { label: `Buy ${pluralize(tents, 'tent')} (${usd(tents * TENT_PRICE)}) so nobody sleeps outside`, act: { type: 'order' as const, lines: [{ material: 'tent' as const, qty: tents }] } } } : {}) };
    }
    // a finished home with too few beds, or no home at all
    return { ...base, ...(kind ? { act: { label: `Stake a ${adv?.name ?? (kind === 'cottage' ? 'cottage' : 'cabin')} (~${usd(kitCost(s, kind))}${adv ? `, ${pluralize(adv.beds, 'bed')}` : ''})`, act: { type: 'stake' as const, kind }, ...(buildOff(s, kind) ? { off: buildOff(s, kind)! } : {}) } } : op.act ? { act: { label: op.act.label, act: op.act.act } } : {}) };
  }
  if (id === 'fence') {
    if (!anyOwnPlaced(s) && starterFits(s)) return { ...base, act: { label: 'Lay out a starter compound', act: { type: 'starter' } } };
    const kind = (['woven_wire', 'barbed_wire', 'split_rail'] as const).find(k => !perimeterOff(s, k));
    if (kind) return { ...base, act: { label: `Draw a ${PERIMETER[kind].name.replace(/ \(.*\)/, '').toLowerCase()} around the house (about ${usd(costPer100m(kind) * 30.48 / 100)} per 100 ft)`, act: { type: 'tool', tool: `fence:${kind}` } } };
    return { ...base, act: { label: 'Open Defense: walls and gates', act: { type: 'open', right: 'defense' } } };
  }
  // finished but not working (a pump with no power, a home with no running water): the repair is waiting on materials, so the one click is the order
  if (op.act?.act.type === 'select') { const o = order(); if (o) return { ...base, act: o }; }
  if (op.act) {
    const a = op.act.act;
    const cost = a.type === 'stake' ? kitCost(s, a.kind) : 0;
    const label = a.type === 'stake' && cost > 0 ? `${op.act.label} (~${usd(cost)})` : op.act.label;
    return { ...base, act: { label, act: a, ...(a.type === 'stake' && buildOff(s, a.kind) ? { off: buildOff(s, a.kind)! } : {}) } };
  }
  return base;
}

/** What a button spends (0 when it spends nothing, or the starter plan prices its own pieces). */
function actCost(s: GameState, a: GoalAct): number {
  if (a.type === 'stake') return kitCost(s, a.kind);
  if (a.type === 'order') return orderCost(a.lines, prices(s));
  if (a.type === 'crew') { const st = s.structures.find(x => x.id === a.id); return st ? crewQuote(st).usd + (a.lines ? orderCost(a.lines, prices(s)) : 0) : 0; }
  if (a.type === 'hookup') return driveQuote(s.site.improvements, s.site, s.seed).usd;
  return 0;
}

/** The money line, when the first thing the goal needs cannot be paid for out of cash and still leave the living reserve. */
function moneyLine(s: GameState, id: GoalId, act: FirstHourGoal['act'], placed: boolean): string | null {
  if (id === 'roof' && !placed && s.structures.every(st => !isHome(st.kind) || st.unplaced)) {
    const c = cheapestHome(s);
    if (c && starterBudget(s) < c.usd) {
      const jobs = s.people.some((p, i) => !p.kid && p.job && s.personState[i]?.employed);
      return `A ${c.kind === 'cottage' ? 'cottage' : 'cabin'} is about ${usd(c.usd)} and you have ${usd(s.money)}${s.money < c.usd ? '' : ', which would leave too little to live on'}. Tents (${usd(TENT_PRICE)} each) cover the beds for now.${jobs ? ' Pay from jobs in town adds to your cash each day, so water and food can come first.' : ''}`;
    }
  }
  if (!act) return null;
  if (act.off && act.act.type !== 'hookup') return null;
  const cost = actCost(s, act.act);
  if (cost <= 0) return null;
  const chk = spendCheck(s.money, cost);
  if (!chk.below && s.money >= cost) return null;
  const head = s.money < cost ? `That is ${usd(cost)} and you have ${usd(s.money)}.` : `That would leave ${usd(Math.max(0, chk.after))}, under the ${usd(chk.reserve)} the family keeps back for living costs.`;
  if (id === 'roof' && !placed) {
    const c = cheapestHome(s), tents = Math.max(0, s.people.length);
    const small = c && c.usd < cost ? ` A ${c.kind === 'cottage' ? 'cottage' : 'cabin'} is about ${usd(c.usd)}.` : '';
    return `${head}${small} Tents (${usd(TENT_PRICE)} each) cover ${pluralize(tents, 'person', 'people')} in the meantime. ${SHORT}`;
  }
  return `${head} ${SHORT}`;
}

/**
 * The first-hour goals for this state. `memory` is what the HUD kept from earlier looks; the result carries the next memory.
 * `drive` is the site's drive polyline (the defense score reads it for the road gate).
 */
export function firstHour(s: GameState, drive?: readonly Pt[], memory: GoalMemory = EMPTY_MEMORY): FirstHour {
  const ops = new Map<OpId, OpItem>(operational(s, drive).map(o => [o.id, o]));
  const nudge = crewNudge(s);
  const seen = new Set<GoalId>(memory.seen), doneMem = new Set<GoalId>(memory.done);
  const goals: FirstHourGoal[] = [];
  for (const id of GOAL_IDS) {
    // the power goal is not listed once a source stands (or the grid is in) that the player did not build; same rule everywhere via `evidence`
    const l = look(s, id, ops, nudge);
    if (l.skip) continue;
    const met = l.met;
    if (!met) seen.add(id);
    const isDone = doneMem.has(id) || (met && (seen.has(id) || l.evidence));
    if (met && !isDone) continue;   // met from the start: not a goal for this lot
    if (isDone) doneMem.add(id);
    const status: GoalStatus = isDone ? 'done' : l.act && !l.act.off ? 'todo' : l.act ? 'todo' : 'underway';
    const kind = l.act?.act.type === 'stake' ? l.act.act.kind : undefined;
    const pace = isDone ? null : paceLine(s, id, kind);
    // a goal with nothing placed and nothing to press is still "to do" (it is the player's move), unless it is placed
    const st: GoalStatus = isDone ? 'done' : status === 'underway' && !l.placed ? 'todo' : status;
    // a home that sleeps too few is a different, solvable goal: "a bed for everyone" (the same recommendation the Build list and the Housing panel give)
    const undersized = id === 'roof' && !isDone && s.structures.some(x => !x.unplaced && isHome(x.kind));
    goals.push({ id, title: undersized ? 'A bed for everyone' : TITLE[id], status: st, line: isDone ? 'Done' : undersized && !l.placed ? `${Math.max(1, s.people.length - homeBeds(s))} without a bed` : l.line, ...(isDone || !l.act ? {} : { act: l.act }), why: whyText(s, id), reward: reward(s, id), pace,
      money: isDone ? null : moneyLine(s, id, l.act, l.placed) });
  }
  const done = goals.filter(g => g.status === 'done').length;
  // the first goal with a button; else the first one the family is working on; else a goal waiting on cash
  const payable = (g: FirstHourGoal) => !!g.act && !g.act.off && actCost(s, g.act.act) <= s.money;   // (a button the cash cannot press is not the one to lead with)
  const current = goals.find(g => g.status === 'todo' && payable(g)) ?? goals.find(g => g.status === 'underway') ?? goals.find(g => g.status === 'todo' && g.act && !g.act.off) ?? goals.find(g => g.status === 'todo') ?? null;
  const alsoOpen = current?.id === 'roof' && current.status === 'todo'
    ? goals.filter(g => (g.id === 'water' || g.id === 'food' || g.id === 'power') && g.status === 'todo' && g.act && !g.act.off && g.act.act.type !== 'starter') : [];
  return { goals, current, alsoOpen, done, total: goals.length, complete: goals.length > 0 && done === goals.length,
    memory: { seen: GOAL_IDS.filter(i => seen.has(i)), done: GOAL_IDS.filter(i => doneMem.has(i)) } };
}

export interface WatchItem { id: string; text: string; tone: 'good' | 'warn' | 'bad' }

/**
 * "You're set for now. Here is what to watch": three lines from the real numbers, none of them a new list of chores. The runway
 * rows are the Board's own; the last line is the real collapse clock.
 */
export function watchItems(s: GameState): WatchItem[] {
  const rows = runway(s), by = new Map(rows.map(r => [r.id, r]));
  const out: WatchItem[] = [];
  const food = by.get('food');
  if (food) out.push({ id: 'food', tone: food.tone, text: `Food: ${food.value} on hand with nothing grown or bought. Restock when it nears a month.` });
  const worst = rows.filter(r => r.id !== 'food' && r.days !== null).sort((a, b) => (a.days ?? 0) - (b.days ?? 0))[0];
  if (worst) out.push({ id: worst.id, tone: worst.tone, text: `${worst.label}: ${worst.id === 'water' ? worst.value.replace(/^(\d+ days?|a year or more)/, '$1 stored') : worst.value}.` });
  const clock = clockNote(s);
  out.push({ id: 'clock', tone: 'warn', text: clock || `Cash: ${usd(s.money)} in checking. Bills and wages come out of it.` });
  return out.slice(0, 3);
}
