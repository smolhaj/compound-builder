/**
 * Bug out (docs/ROADMAP.md: "a bug-out vehicle and bags"; GDS §: heed the
 * warning signs and leave early). One decision, taken from the fleet panel,
 * that loads the people and the supplies and ends the run at a second site.
 * Pure.
 *
 *  - Mode: by vehicle (what the running vehicles seat and carry) or on foot
 *    (everyone goes, each with a bug-out bag if the family packed one, else
 *    what they can snatch; a few days' food and 20 km a day).
 *  - Where: the buried cache (sim/bugoutRoute.ts `cacheMiles`: two weeks of
 *    food and water waiting), the kept town house, or nowhere in particular.
 *  - The way: `routeRisk` reads the road, the bridge, the snow, the fog, the
 *    hour, the fuel and the law; `rollJourney` decides how the trip went
 *    (seeded), and the report card says who arrived, late or robbed.
 *
 *  - Who goes: as many as the running vehicles seat (kids and the old first,
 *    then adults by what they can do on the road); the rest are left to hold
 *    the place, and the plan says who.
 *  - What goes: food and water for the people aboard, as much as the vehicles
 *    carry (2 kg of food and 3 kg of water a head a day), fuel in the tanks and
 *    the cans.
 *  - How far: the fuel (tanks and cans) over the fuel a kilometer costs the vehicles.
 *  - Loading takes hours: under cover (a garage joined to the house by a
 *    passage or a walkway) it takes half as long and nobody outside sees it.
 */
import { dayIndex, type GameState } from './state';
import { daysOfFood } from './needs';
import { log } from './economy';
import { roadVehicles, VEHICLES, cargoKg, type Vehicle } from './vehicles';
import { garageConnected } from './parking';
import type { Person } from './family';
import { fallbackHouse } from './weekender';
import { cacheMiles, rollJourney, routeRisk, FOOT_KM_DAY, MILE_KM, type BugDest, type BugMode, type JourneyOutcome, type RouteRisk } from './bugoutRoute';

export type { BugDest, BugMode, JourneyOutcome } from './bugoutRoute';

export interface BugOutPlan {
  ok: boolean;
  why: string | null;
  going: Person[];
  left: Person[];
  vehicles: Vehicle[];
  /** Days of food and water carried for those who go. */
  foodDays: number;
  /** Kilometers on the fuel aboard and in the cans. */
  rangeKm: number;
  /** Hours to load. */
  hours: number;
  /** Loaded under cover. */
  covered: boolean;
  seats: number;
  /** The kept town house (sim/weekender.ts): somewhere to head for, and how far. */
  fallback: { name: string; miles: number } | null;
  mode: BugMode;
  dest: BugDest;
  /** Where they are headed and how far (miles): the cache, the town house, or nowhere. */
  destName: string;
  miles: number;
  /** Which places the family has to go to. */
  options: Array<{ dest: BugDest; name: string; miles: number }>;
  /** Kilograms carried, how many bug-out bags are packed, and the cache's food on arrival. */
  carryKg: number;
  bags: number;
  cacheDays: number;
  route: RouteRisk;
}

/** Foot: food and water, kg per person a day; the weight of a pack snatched with no bag (adult / child). */
const FOOT_KG = 3.5, BAG_KG = 18, SNATCH_KG = [6, 3] as const;
/** Two weeks of food for the family waiting in a cache. */
export const CACHE_DAYS = 14;

const FOOD_KG = 2, WATER_KG = 3, CAN_L = 20;

const living = (s: GameState): Person[] => s.people.filter((_, i) => s.personState[i]?.needs.died == null && !s.personState[i]?.needs.taken);

/** The order people are given seats: the little ones, the old, the hurt, then adults who can drive, mend and shoot. */
function seatOrder(ps: readonly Person[]): Person[] {
  const rank = (p: Person) => (p.kid && p.age < 12 ? 0 : p.elder ? 1 : p.kid ? 2 : 3 - Math.min(2, (p.skills.mechanic + p.skills.hunter + p.skills.medic) / 12));
  return [...ps].sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1));
}

export function bugOutPlan(s: GameState, opts: { mode?: BugMode; dest?: BugDest } = {}): BugOutPlan {
  const people = living(s);
  const foot = opts.mode === 'foot';
  const vs = foot ? [] : roadVehicles(s).filter(v => v.fuel > 0 || s.stock.fuel >= 1);
  const seats = foot ? people.length : vs.reduce((a, v) => a + VEHICLES[v.kind].seats, 0);
  const order = seatOrder(people);
  const going = order.slice(0, seats);
  const left = order.slice(seats);
  const bags = foot ? Math.min(going.length, Math.floor(s.stock.bugout_bag ?? 0)) : 0;
  const kg = foot ? bags * BAG_KG + going.slice(bags).reduce((a, p) => a + SNATCH_KG[p.kid && p.age < 12 ? 1 : 0], 0) : vs.reduce((a, v) => a + cargoKg(s, v), 0);
  // the cargo: food and water for those aboard, then the rest is tools and bags
  const perDay = going.length * (foot ? FOOT_KG : FOOD_KG + WATER_KG);
  const foodDays = going.length ? Math.min(Math.floor(kg * 0.7 / perDay), Math.floor(daysOfFood(s))) : 0;
  const lit = vs.reduce((a, v) => a + v.fuel, 0) + s.stock.fuel * CAN_L;
  const mpg = vs.length ? vs.reduce((a, v) => a + VEHICLES[v.kind].mpg, 0) / vs.length : 0;
  const slow = going.some(p => p.elder || (p.kid && p.age < 8));
  const rangeKm = foot ? Math.round(foodDays * FOOT_KM_DAY * (slow ? 0.7 : 1)) : mpg ? Math.round(lit / 3.785 * mpg * 1.609 / Math.max(1, vs.length)) : 0;
  const covered = !foot && garageConnected(s);
  const hours = foot ? Math.round((0.5 + going.length * 0.15) * 2) / 2 : Math.round((1.5 + going.length * 0.4 + vs.length * 0.5) * (covered ? 0.5 : 1) * 2) / 2;
  const fb = fallbackHouse(s);
  const fallback = fb && s.weekend?.town.status === 'kept' ? fb : null;
  const cacheOn = (s.stock.bugout_cache ?? 0) >= 1;
  const options: BugOutPlan['options'] = [];
  if (cacheOn) options.push({ dest: 'cache', name: 'the buried cache', miles: cacheMiles(s) });
  if (fallback) options.push({ dest: 'town', name: fallback.name, miles: fallback.miles });
  options.push({ dest: 'open', name: 'nowhere in particular', miles: 0 });
  const dest = opts.dest && options.some(o => o.dest === opts.dest) ? opts.dest : options[0].dest;
  const pick = options.find(o => o.dest === dest)!;
  const route = routeRisk(s, foot ? 'foot' : 'vehicle', pick.miles, rangeKm);
  let why: string | null = null;
  if (s.ending && !s.ending.continued) why = 'the run is over';
  else if (!people.length) why = 'nobody is left';
  else if (s.weekend?.mode === 'split' && !s.weekend.here) why = 'the family is in town, away from the place';
  else if (!foot && !vs.length) why = 'no running vehicle with fuel';
  else if (!foot && route.vehicleBlocked) why = `${route.vehicleBlocked}: only on foot`;
  else if (!s.disaster.kind) why = 'nothing is wrong yet: this is a free-build game';
  return { ok: !why, why, going, left, vehicles: vs, foodDays, rangeKm, hours, covered, seats, fallback, mode: foot ? 'foot' : 'vehicle', dest, destName: pick.name, miles: pick.miles, options, carryKg: Math.round(kg), bags, cacheDays: dest === 'cache' ? CACHE_DAYS : 0, route };
}

/** Load up and go. The run ends here: the report card tells who made it, what they took and how the trip went. */
export function bugOut(s: GameState, opts: { mode?: BugMode; dest?: BugDest } = {}): string | null {
  const plan = bugOutPlan(s, opts);
  if (!plan.ok) return plan.why;
  const day = dayIndex(s.clock.t);
  const { outcome } = rollJourney(s, plan.route.risk);
  // the people who go are off the place; the rest stay at the gate
  for (const p of plan.going) { const ps = s.personState.find(x => x.id === p.id); if (ps) { ps.task = 'away'; ps.target = null; } }
  for (const v of plan.vehicles) v.away = true;
  // the trip: one is lost on the worst rolls (the youngest or oldest, who could not keep up); a robbery takes half the load; a late arrival eats days
  let lost: string | null = null;
  if (outcome === 'lost_one' && plan.going.length > 1) {
    const weak = plan.going.find(p => p.elder || (p.kid && p.age < 8)) ?? plan.going[plan.going.length - 1];
    const ps = s.personState.find(x => x.id === weak.id);
    if (ps) { ps.needs.died = day; lost = weak.first; }
  }
  const foodAtArrival = Math.max(0, Math.round(plan.foodDays * (outcome === 'robbed' ? 0.5 : outcome === 'late' ? 0.75 : 1) - plan.route.travelHours / 24));
  const stocked = plan.dest === 'cache' ? plan.cacheDays : 0;
  s.stats.bugOut = {
    day, going: plan.going.length - (lost ? 1 : 0), left: plan.left.length, vehicles: plan.vehicles.map(v => v.kind), foodDays: plan.foodDays, rangeKm: plan.rangeKm, covered: plan.covered, ...(plan.fallback ? { fallback: plan.fallback.name } : {}),
    mode: plan.mode, dest: plan.dest, destName: plan.destName, miles: plan.miles, risk: plan.route.risk, outcome, ...(lost ? { lost } : {}), arrivedFoodDays: foodAtArrival + stocked, bags: plan.bags,
  };
  s.ending = { kind: 'bug_out', day, continued: false };
  s.clock.speed = 0;
  const how = plan.mode === 'foot' ? 'on foot' : `in ${plan.vehicles.length} vehicle${plan.vehicles.length === 1 ? '' : 's'}`;
  log(s, `The ${s.people[0]?.last ?? ''} family bugged out ${how}: ${plan.going.length} of ${plan.going.length + plan.left.length}, ${plan.foodDays} days of food, bound for ${plan.destName}${plan.miles ? ` (${plan.miles} miles)` : ''}.`);
  return null;
}

export const OUTCOME_TEXT: Record<JourneyOutcome, string> = {
  clean: 'The way was clear and they arrived on time.',
  late: 'It took longer than planned: a detour, a night in the open, some of the food gone.',
  robbed: 'They were stopped on the way and lost half of what they carried.',
  lost_one: 'The worst of it: someone did not make the trip.',
};
export { MILE_KM };
