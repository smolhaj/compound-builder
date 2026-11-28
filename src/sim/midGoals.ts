/**
 * The second tier of goals: "Settle in". Once "Get operational" (sim/operational.ts, sim/firstHour.ts) is all ticked, the What-to-do card
 * used to go quiet for years (playtest: Cozy, day 93 to 794, three decision cards, $350k rising to $580k). These six goals come from systems
 * that already exist (food stores, water sources, the property line, contract guards, the root cellar, a lookout); each has one button and a
 * plain reason. Nothing is invented and nothing is required. Pure (tested); the same `FirstHour` shape the goal card already draws.
 */
import type { FirstHour, FirstHourGoal, GoalStatus } from './firstHour';
import { isFinished } from './construction';
import { buildOff } from './guidance';
import { enclosure } from './enclosure';
import { guardCount } from './guards';
import { daysOfFood } from './needs';
import { dayIndex, type GameState } from './state';
import { pluralize } from './words';

export const MID_HEADING = 'Settle in';
export const YEAR_OF_FOOD_DAYS = 365;
const WATER_KINDS = ['well_hand', 'well_drilled', 'cistern', 'water_tower'];
const TOWERS = (k: string) => k === 'rise_lookout' || k.startsWith('watchtower');

const fin = (s: GameState, f: (k: string) => boolean) => s.structures.filter(st => f(st.kind) && isFinished(st)).length;
const staked = (s: GameState, f: (k: string) => boolean) => s.structures.some(st => f(st.kind) && !isFinished(st) && !st.unplaced);

interface Spec { id: string; short: string; title: string; done: boolean; underway?: boolean; line: string; why: string; reward: { title: string; line: string }; act?: FirstHourGoal['act'] }

const stake = (s: GameState, kind: string, label: string): FirstHourGoal['act'] => {
  const off = buildOff(s, kind);
  return { label, act: { type: 'stake', kind }, ...(off ? { off } : {}) };
};

function specs(s: GameState): Spec[] {
  const food = Math.round(Math.min(daysOfFood(s), 9999));
  const sources = fin(s, k => WATER_KINDS.includes(k)), waterStaked = staked(s, k => WATER_KINDS.includes(k));
  const line = enclosure(s, s.clock.t);
  const closed = line.openShare === 0 && line.creekOpen === 0;
  const guards = guardCount(s);
  const cellar = fin(s, k => k === 'root_cellar'), towers = fin(s, TOWERS);
  return [
    { id: 'mid_year_food', short: 'Year of food', title: 'A year of food put by', done: food >= YEAR_OF_FOOD_DAYS,
      line: `${pluralize(food, 'day')} of food on hand, ${YEAR_OF_FOOD_DAYS} to go for a year`,
      why: 'A bare shelf is the first thing that kills a household when the trucks stop. A year in the pantry rides out a bad harvest, a siege and a sick season.',
      reward: { title: 'A year of food', line: 'The family can sit out a hard year.' },
      act: { label: 'Open the pantry', act: { type: 'open', right: 'supplies', supplies: 'stores' } } },
    { id: 'mid_second_water', short: 'Second water', title: 'A second water source', done: sources >= 2, underway: waterStaked,
      line: sources >= 2 ? `${sources} sources` : waterStaked ? 'Going in' : sources === 1 ? 'One source: if it fails, nothing is left' : 'No source yet',
      why: 'One well is one pump, one pipe and one power line. A cistern or a second well keeps the house drinking when the first fails.',
      reward: { title: 'Water twice over', line: 'One failure no longer shuts off the tap.' },
      act: sources >= 2 || waterStaked ? undefined : stake(s, 'cistern', 'Stake a rain cistern') },
    { id: 'mid_ring', short: 'Close the ring', title: 'Close the property line', done: closed,
      line: closed ? 'The line is closed all the way around' : line.openShare >= 1 ? 'No wall on the line yet' : `${Math.round(line.openShare * 100)}% of the line is open`,
      why: 'Walkers go through the gaps, and a closed line is what the gate and the towers hang on. The Defense tab draws and prices the ring.',
      reward: { title: 'A closed line', line: 'Anyone coming has to come to the gate.' },
      act: { label: 'Open Defense', act: { type: 'open', right: 'defense' } } },
    { id: 'mid_guard', short: 'A guard', title: 'Hire a guard for the gate', done: guards > 0,
      line: guards > 0 ? `${pluralize(guards, 'guard')} on the roster` : 'Nobody watches while the family sleeps',
      why: 'A paid shift on the gate sees trouble coming at night and takes the first fight. Contract guards are hired in the Defense tab by the month.',
      reward: { title: 'The gate is watched', line: 'Someone is up when the family is not.' },
      act: { label: 'Hire a guard (Defense tab)', act: { type: 'open', right: 'defense' } } },
    { id: 'mid_cellar', short: 'Root cellar', title: 'A root cellar', done: cellar > 0, underway: staked(s, k => k === 'root_cellar'),
      line: cellar > 0 ? 'Built' : staked(s, k => k === 'root_cellar') ? 'Going in' : 'Nowhere cool to keep the harvest',
      why: 'Roots, apples and jars keep for months in the cool, and a cellar keeps the freezer stock from thawing when the power fails.',
      reward: { title: 'Food keeps', line: 'The harvest lasts into spring.' },
      act: cellar > 0 || staked(s, k => k === 'root_cellar') ? undefined : stake(s, 'root_cellar', 'Stake a root cellar') },
    { id: 'mid_lookout', short: 'A lookout', title: 'A lookout over the road', done: towers > 0, underway: staked(s, TOWERS),
      line: towers > 0 ? 'Standing' : staked(s, TOWERS) ? 'Going up' : 'Nobody can see the road from the yard',
      why: 'A rise and a pair of eyes show who is coming a minute sooner, which is the time it takes to get everyone inside.',
      reward: { title: 'Eyes on the road', line: 'The family sees them coming.' },
      act: towers > 0 || staked(s, TOWERS) ? undefined : stake(s, 'rise_lookout', 'Stake a lookout') },
  ];
}

/** The Settle-in goals for this state, in the card's shape. `complete` when every one is done. */
export function midGoals(s: GameState): FirstHour {
  const goals: FirstHourGoal[] = specs(s).map(x => {
    const status: GoalStatus = x.done ? 'done' : x.underway ? 'underway' : 'todo';
    return { id: x.id, short: x.short, title: x.title, status, line: x.done ? 'Done' : x.line, ...(!x.done && x.act ? { act: x.act } : {}), why: x.why, reward: x.reward, pace: null, money: null };
  });
  const done = goals.filter(g => g.status === 'done').length;
  const current = goals.find(g => g.status === 'todo' && g.act && !g.act.off) ?? goals.find(g => g.status === 'underway') ?? goals.find(g => g.status === 'todo') ?? null;
  const last = [...goals].reverse().find(g => g.status === 'done');
  return { heading: MID_HEADING, goals, current, alsoOpen: [], done, total: goals.length, complete: goals.length > 0 && done === goals.length, memory: { seen: [], done: [] },
    ...(last ? { rewardLine: `${last.reward.title}. ${last.reward.line}` } : {}) };
}

/** Day the tier opens at the earliest (the first-hour goals must be done too: the caller checks). */
export const midOpen = (s: GameState): boolean => dayIndex(s.clock.t) >= 1;
