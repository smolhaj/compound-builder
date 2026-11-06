/**
 * "Is the compound operational?": a five-line checklist (shelter, water,
 * power, food, defense), each unmet item one line and at most one action.
 * Derived from the state only: no new mechanic, nothing is locked behind it.
 * The HUD draws it on top of the Build tab (sim/guidance.ts has the rest).
 */
import type { Pt } from './perimeter';
import { homeBeds, isHome } from './blueprints';
import { daysOfFood } from './needs';
import { foodNudge } from './spendGuard';
import { isFinished } from './construction';
import { defenseReport, type DefenseReport } from './defenseReport';
import { buildOff, type SuggestionAct } from './guidance';
import { POWER_BUILDINGS as POWER, needsHookup, powerOnPlace } from './hookups';
import type { GameState } from './state';
import { stuckAction, stuckProject } from './stalls';
import { pluralize } from './words';
import { crewNudge } from './crewNudge';

export type OpId = 'shelter' | 'water' | 'power' | 'food' | 'defense';
export interface OpItem {
  id: OpId;
  /** One word: Shelter, Water, Power, Food, Defense. */
  label: string;
  done: boolean;
  /** One short line: what is in place, or what is missing. */
  line: string;
  /** The one-click next step when it is not done (never a requirement). */
  act?: { label: string; act: SuggestionAct };
}

/** A defense score at or above this counts as guarded (the Defense tab's "Guarded"). */
export const DEFENSE_OK = 45;

const WATER = ['well_hand', 'well_drilled', 'cistern', 'water_tower'];
const FOOD = ['garden', 'field', 'greenhouse', 'greenhouse_heated', 'polytunnel', 'high_tunnel', 'orchard', 'orchard_grove', 'orchard_terraced', 'aquaponics'];

/** The Next-steps ids the checklist already covers (the Build tab and the compound board skip them). */
export const OP_COVERED: ReadonlySet<string> = new Set(['roof', 'beds', 'water', 'food', 'power']);

/** `report`: a defense report already worked out for this state (the board shares one instead of computing two). */
export function operational(s: GameState, drive?: readonly Pt[], report?: DefenseReport): OpItem[] {
  const fin = (kinds: string[]) => s.structures.some(st => kinds.includes(st.kind) && isFinished(st));
  const staked = (kinds: string[]) => s.structures.some(st => kinds.includes(st.kind));
  const stake = (kind: string, label: string): OpItem['act'] => (buildOff(s, kind) ? undefined : { label, act: { type: 'stake', kind } });
  const out: OpItem[] = [];

  // shelter: a finished home with a bed for everyone
  const people = s.people.length, beds = homeBeds(s), homes = s.structures.filter(st => isHome(st.kind));
  const stuck = stuckProject(s), nudge = crewNudge(s);
  const shelterDone = homes.some(isFinished) && beds >= people;
  out.push({ id: 'shelter', label: 'Shelter', done: shelterDone,
    line: shelterDone ? `${pluralize(beds, 'bed')} for ${people}` : homes.length === 0 ? 'No roof yet' : !homes.some(isFinished) ? 'Home going up' : `${people - beds} without a bed`,
    ...(shelterDone ? {} : homes.length === 0 ? { act: stake('timber_cabin', 'Stake a cabin') } : homes.some(isFinished) ? { act: stake('cottage', 'Add a cottage') } : stuck?.at && homes.some(h => h.id === stuck.at) ? { act: { label: stuckAction(stuck), act: { type: 'order' as const, lines: stuck.lines } } } : nudge && homes.some(h => h.id === nudge.id) ? { act: { label: `Hire a crew (~$${nudge.usd.toLocaleString('en-US')})`, act: { type: 'crew' as const, id: nudge.id } } } : { act: { label: 'Projects', act: { type: 'select' as const, id: homes[0].id } } }) });

  // water
  // a source standing is not water in the house when it was meant to reach it: a pump with no power, or a home with no running water, keeps the tick off (QA run 4: the tick lied)
  const wet = fin(WATER) ? needsHookup(s).find(h => ((h.kind === 'plumb' && h.tool !== null) || h.kind === 'pump_power') &&   // (a hand well or a cistern is water without a pipe: only a drilled well or tower promises running water)
     s.structures.find(x => x.id === h.id && (h.kind === 'pump_power' || isHome(x.kind)))) : undefined;
  const waterDone = fin(WATER) && !wet;
  out.push({ id: 'water', label: 'Water', done: waterDone, line: waterDone ? 'A working source' : wet ? `${wet.kind === 'plumb' ? 'The home has no running water' : 'Pump has no power'}` : staked(WATER) ? 'Well going in' : 'No water on the place',
    ...(waterDone ? {} : wet ? { act: { label: 'Show me', act: { type: 'select' as const, id: wet.id } } } : staked(WATER) ? {} : { act: stake(s.site.gwDepth > 9 ? 'well_drilled' : 'well_hand', s.site.gwDepth > 9 ? 'Drill a well' : 'Dig a well') }) });

  // power
  const powerDone = powerOnPlace(s);
  out.push({ id: 'power', label: 'Power', done: powerDone, line: powerDone ? 'Power on the place' : staked(POWER) ? 'Power going in' : 'No power',
    ...(powerDone || staked(POWER) ? {} : { act: stake('solar_array', 'Stake solar') }) });

  // food: something growing, or ninety days put by
  const left = daysOfFood(s), days = Math.round(Math.min(left, 999)), put = Number.isFinite(left) ? `${days} ${days === 1 ? 'day' : 'days'} of food on hand` : 'nobody left to feed';
  const foodDone = fin(FOOD) || days >= 90;
  out.push({ id: 'food', label: 'Food', done: foodDone, line: foodDone ? (fin(FOOD) ? 'Growing' : put) : staked(FOOD) ? `Planting; ${put}` : `Nothing growing; ${put}`,
    ...(foodDone ? {} : days < 1 && foodNudge(s) ? { act: { label: 'Stock some food', act: { type: 'shop' as const, tab: 'food' as const } } } : staked(FOOD) ? {} : { act: stake('garden', 'Stake a garden') }) });

  // defense: guarded or better
  const d = report ?? defenseReport(s, drive);
  const defDone = d.score >= DEFENSE_OK;
  out.push({ id: 'defense', label: 'Defense', done: defDone, line: `${d.label}, ${d.score} of 100`,
    ...(defDone ? {} : { act: { label: 'Defense', act: { type: 'open' as const, right: 'defense' as const } } }) });

  return out;
}

/** Items still to do, and how many are done. */
export const operationalCount = (items: OpItem[]) => ({ done: items.filter(i => i.done).length, total: items.length });
