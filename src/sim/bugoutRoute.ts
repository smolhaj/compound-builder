/**
 * The way out (area D, task #38): what the route to a second site costs the family. Pure; reads the road, the bridge, the snow, the fog,
 * the hour, how far the fuel goes and what the world has left (fuel, law). Nothing here is saved: the plan is recomputed from the game.
 *
 *  - Drive out   the planned road in and out (sim/roadFx.ts, sim/slope.ts): grade, hairpins, single-file bridges; snow shuts it.
 *  - The bridge  a dropped road bridge cuts every vehicle off: the family goes on foot, or not at all.
 *  - Fog         thick fog makes the road a gamble for a vehicle and a cover for people on foot.
 *  - Night       headlights are seen for miles; a lone walker is not.
 *  - Distance    each mile is more chance of a roadblock, a breakdown or someone who wants the truck; far more on foot, where it takes days.
 *  - Fuel        short of the fuel, the family will be walking the last of it.
 */
import { dayIndex, hourOf, type GameState } from './state';
import { roadBridgeOf, bridgeDown } from './roadFx';
import { roadClosedFor, roadDifficulty } from './slope';
import { fogNow } from './fogFx';
import { lanesOf } from './terrainState';
import { mulberry32 } from './rng';

export type BugMode = 'vehicle' | 'foot';
export type BugDest = 'cache' | 'town' | 'open';

export interface RouteLeg { id: string; name: string; risk: number; why: string }
export interface RouteRisk {
  /** Chance something goes wrong on the way, 0-1. */
  risk: number;
  level: 'low' | 'moderate' | 'high';
  legs: RouteLeg[];
  /** Hours on the road. */
  travelHours: number;
  /** A vehicle cannot make it (the road bridge is down or the way is drifted shut): only the foot way is open. */
  vehicleBlocked: string | null;
}

/** On foot: kilometers a day with packs; by road: kilometers an hour on a bad road. */
export const FOOT_KM_DAY = 20, ROAD_KMH = 45, MILE_KM = 1.609;
/** Per-mile chance of trouble. */
const PER_MILE = { vehicle: 0.0022, foot: 0.0065 } as const;

/** Miles to the cache site (the family picked it when they buried it): the same every time for the same game. */
export const cacheMiles = (s: GameState): number => 25 + Math.floor(mulberry32(s.seed * 4271 + 19)() * 70);

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export function routeRisk(s: GameState, mode: BugMode, miles: number, rangeKm: number, hour = hourOf(s.clock.t)): RouteRisk {
  const legs: RouteLeg[] = [];
  const foot = mode === 'foot';
  const day = dayIndex(s.clock.t);
  // the drive out and the road
  const diff = roadDifficulty(s.site, s.seed), closed = roadClosedFor(s, day);
  let vehicleBlocked: string | null = null;
  if (closed > 0) vehicleBlocked = `the road is drifted shut for ${closed} more day${closed === 1 ? '' : 's'}`;
  if (s.site.lot && bridgeDown(s)) vehicleBlocked = 'the bridge on the way in is down';
  const brg = roadBridgeOf(s);
  if (foot) {
    const lane = lanesOf(s), best = lane.length ? Math.min(...lane.map(l => l.hardness)) : 1;
    legs.push({ id: 'ground', name: 'The ground out', risk: clamp((best - 1) * 0.06, 0, 0.18), why: best > 1.6 ? 'rough going off the place: slow, with children and packs' : 'open ground off the place' });
    if (s.site.lot && bridgeDown(s)) legs.push({ id: 'ford', name: 'The creek', risk: 0.12, why: 'the bridge is down: a wet crossing on foot' });
  } else {
    legs.push({ id: 'drive', name: 'The drive out', risk: clamp(diff * 0.12, 0, 0.3), why: diff > 0.5 ? 'a steep, winding way down with a loaded vehicle' : 'an easy road out' });
    if (brg && !bridgeDown(s)) legs.push({ id: 'bridge', name: 'The one-lane bridge', risk: 0.05, why: 'single file, and anyone can wait at the far end' });
    if (closed > 0) legs.push({ id: 'snow', name: 'Snow', risk: 0.4, why: vehicleBlocked ?? 'drifted shut' });
  }
  // fog and the hour
  const sight = fogNow(s).sightM;
  if (sight < 400) legs.push({ id: 'fog', name: 'Fog', risk: foot ? 0 : clamp((400 - sight) / 400 * 0.2, 0, 0.2), why: foot ? 'thick fog hides a party on foot' : `${sight} m of sight on a road they know less well than they think` });
  const night = hour < 5 || hour >= 21;
  legs.push({ id: 'hour', name: night ? 'Night' : 'Daylight', risk: night ? (foot ? 0.04 : 0.12) : 0, why: night ? (foot ? 'dark, cold, hard to see the way' : 'headlights carry for miles') : 'good light' });
  // distance and the world
  const lawDown = clamp(1 - s.disaster.tracks.law, 0, 1);
  const trouble = miles * PER_MILE[mode] * (1 + lawDown);
  if (miles > 0) legs.push({ id: 'miles', name: `${miles} miles`, risk: clamp(trouble, 0, 0.5), why: lawDown > 0.5 ? 'no law on the roads: checkpoints, tolls, men with a rifle on an overpass' : 'roadblocks, breakdowns and strangers' });
  else legs.push({ id: 'miles', name: 'Nowhere in particular', risk: foot ? 0.25 : 0.2, why: 'no place to go to: nowhere to sleep, nobody expecting them' });
  if (!foot && miles * MILE_KM > rangeKm) legs.push({ id: 'fuel', name: 'Fuel', risk: 0.35, why: `the fuel is good for about ${Math.round(rangeKm)} km: the rest on foot` });
  const risk = 1 - legs.reduce((a, l) => a * (1 - l.risk), 1);
  const travelHours = foot ? Math.round(miles * MILE_KM / FOOT_KM_DAY * 24) : Math.round(miles * MILE_KM / ROAD_KMH * 2) / 2;
  return { risk: Math.round(risk * 100) / 100, level: risk >= 0.5 ? 'high' : risk >= 0.25 ? 'moderate' : 'low', legs: legs.filter(l => l.risk > 0 || l.id === 'hour'), travelHours, vehicleBlocked };
}

export type JourneyOutcome = 'clean' | 'late' | 'robbed' | 'lost_one';

/** Roll the trip: seeded by the game and the day, so the same decision on the same day goes the same way. */
export function rollJourney(s: GameState, risk: number): { outcome: JourneyOutcome; roll: number } {
  const r = mulberry32(s.seed * 7919 + dayIndex(s.clock.t) * 131 + 5)();
  const outcome: JourneyOutcome = r >= risk ? 'clean' : r >= risk * 0.55 ? 'late' : r >= risk * 0.15 ? 'robbed' : 'lost_one';
  return { outcome, roll: Math.round(r * 100) / 100 };
}
