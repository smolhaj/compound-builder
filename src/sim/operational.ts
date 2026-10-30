/**
 * "Is the compound operational?": a five-line checklist (shelter, water,
 * power, food, defense), each unmet item one line and at most one action.
 * Derived from the state only: no new mechanic, nothing is locked behind it.
 * The HUD draws it on top of the Build tab (sim/guidance.ts has the rest).
 */
import type { Pt } from './perimeter';
import { homeBeds, isHome } from './blueprints';
import { daysOfFood } from './needs';
import { isFinished } from './construction';
import { defenseReport } from './defenseReport';
import { buildOff, type SuggestionAct } from './guidance';
import type { GameState } from './state';

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
const POWER = ['solar_array', 'garage_solar', 'lodge_solar', 'generator_shed', 'battery_shed'];
const FOOD = ['garden', 'field', 'greenhouse', 'greenhouse_heated', 'polytunnel', 'high_tunnel', 'orchard', 'orchard_grove', 'orchard_terraced', 'aquaponics'];

export function operational(s: GameState, drive?: readonly Pt[]): OpItem[] {
  const fin = (kinds: string[]) => s.structures.some(st => kinds.includes(st.kind) && isFinished(st));
  const staked = (kinds: string[]) => s.structures.some(st => kinds.includes(st.kind));
  const stake = (kind: string, label: string): OpItem['act'] => (buildOff(s, kind) ? undefined : { label, act: { type: 'stake', kind } });
  const out: OpItem[] = [];

  // shelter: a finished home with a bed for everyone
  const people = s.people.length, beds = homeBeds(s), homes = s.structures.filter(st => isHome(st.kind));
  const shelterDone = homes.some(isFinished) && beds >= people;
  out.push({ id: 'shelter', label: 'Shelter', done: shelterDone,
    line: shelterDone ? `${beds} beds for ${people}` : homes.length === 0 ? 'No roof yet' : !homes.some(isFinished) ? 'Home going up' : `${people - beds} without a bed`,
    ...(shelterDone ? {} : homes.length === 0 ? { act: stake('timber_cabin', 'Stake a cabin') } : homes.some(isFinished) ? { act: stake('cottage', 'Add a cottage') } : { act: { label: 'Projects', act: { type: 'select' as const, id: homes[0].id } } }) });

  // water
  const waterDone = fin(WATER);
  out.push({ id: 'water', label: 'Water', done: waterDone, line: waterDone ? 'A working source' : staked(WATER) ? 'Well going in' : 'No water on the place',
    ...(waterDone || staked(WATER) ? {} : { act: stake(s.site.gwDepth > 9 ? 'well_drilled' : 'well_hand', s.site.gwDepth > 9 ? 'Drill a well' : 'Dig a well') }) });

  // power
  const powerDone = fin(POWER) || !!s.site.improvements?.power;
  out.push({ id: 'power', label: 'Power', done: powerDone, line: powerDone ? 'Power on the place' : staked(POWER) ? 'Power going in' : 'No power',
    ...(powerDone || staked(POWER) ? {} : { act: stake('solar_array', 'Stake solar') }) });

  // food: something growing, or ninety days put by
  const days = Math.round(Math.min(daysOfFood(s), 999)), put = `${days} ${days === 1 ? 'day' : 'days'} put by`;
  const foodDone = fin(FOOD) || days >= 90;
  out.push({ id: 'food', label: 'Food', done: foodDone, line: foodDone ? (fin(FOOD) ? 'Growing' : put) : staked(FOOD) ? `Planting; ${put}` : `Nothing growing; ${put}`,
    ...(foodDone || staked(FOOD) ? {} : { act: stake('garden', 'Stake a garden') }) });

  // defense: guarded or better
  const d = defenseReport(s, drive);
  const defDone = d.score >= DEFENSE_OK;
  out.push({ id: 'defense', label: 'Defense', done: defDone, line: `${d.label}, ${d.score} of 100`,
    ...(defDone ? {} : { act: { label: 'Defense', act: { type: 'open' as const, right: 'defense' as const } } }) });

  return out;
}

/** Items still to do, and how many are done. */
export const operationalCount = (items: OpItem[]) => ({ done: items.filter(i => i.done).length, total: items.length });
