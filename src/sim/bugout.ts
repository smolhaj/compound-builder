/**
 * Bug out (docs/ROADMAP.md: "a bug-out vehicle and bags"; GDS §: heed the
 * warning signs and leave early). Deliberately minimal: one decision, taken
 * from the fleet panel, that loads the people and the supplies into the
 * running vehicles and ends the run. The road, a fallback camp and rally
 * points are not built; the report card says so. Pure.
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
import { garageConnected } from './garage';
import type { Person } from './family';

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
}

const FOOD_KG = 2, WATER_KG = 3, CAN_L = 20;

const living = (s: GameState): Person[] => s.people.filter((_, i) => s.personState[i]?.needs.died == null && !s.personState[i]?.needs.taken);

/** The order people are given seats: the little ones, the old, the hurt, then adults who can drive, mend and shoot. */
function seatOrder(ps: readonly Person[]): Person[] {
  const rank = (p: Person) => (p.kid && p.age < 12 ? 0 : p.elder ? 1 : p.kid ? 2 : 3 - Math.min(2, (p.skills.mechanic + p.skills.hunter + p.skills.medic) / 12));
  return [...ps].sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1));
}

export function bugOutPlan(s: GameState): BugOutPlan {
  const people = living(s);
  const vs = roadVehicles(s).filter(v => v.fuel > 0 || s.stock.fuel >= 1);
  const seats = vs.reduce((a, v) => a + VEHICLES[v.kind].seats, 0);
  const order = seatOrder(people);
  const going = order.slice(0, seats);
  const left = order.slice(seats);
  const kg = vs.reduce((a, v) => a + cargoKg(s, v), 0);
  // the cargo: food and water for those aboard, then the rest is tools and bags
  const perDay = going.length * (FOOD_KG + WATER_KG);
  const foodDays = going.length ? Math.min(Math.floor(kg * 0.7 / perDay), Math.floor(daysOfFood(s))) : 0;
  const lit = vs.reduce((a, v) => a + v.fuel, 0) + s.stock.fuel * CAN_L;
  const mpg = vs.length ? vs.reduce((a, v) => a + VEHICLES[v.kind].mpg, 0) / vs.length : 0;
  const rangeKm = mpg ? Math.round(lit / 3.785 * mpg * 1.609 / Math.max(1, vs.length)) : 0;
  const covered = garageConnected(s);
  const hours = Math.round((1.5 + going.length * 0.4 + vs.length * 0.5) * (covered ? 0.5 : 1) * 2) / 2;
  let why: string | null = null;
  if (s.ending && !s.ending.continued) why = 'the run is over';
  else if (!people.length) why = 'nobody is left';
  else if (!vs.length) why = 'no running vehicle with fuel';
  else if (!s.disaster.kind) why = 'nothing is wrong yet: this is a free-build game';
  return { ok: !why, why, going, left, vehicles: vs, foodDays, rangeKm, hours, covered, seats };
}

/** Load up and go. The run ends here: the report card tells who made it and what they took. */
export function bugOut(s: GameState): string | null {
  const plan = bugOutPlan(s);
  if (!plan.ok) return plan.why;
  const day = dayIndex(s.clock.t);
  // the people who go are off the place; the rest stay at the gate
  for (const p of plan.going) { const ps = s.personState.find(x => x.id === p.id); if (ps) { ps.task = 'away'; ps.target = null; } }
  for (const v of plan.vehicles) v.away = true;
  s.stats.bugOut = { day, going: plan.going.length, left: plan.left.length, vehicles: plan.vehicles.map(v => v.kind), foodDays: plan.foodDays, rangeKm: plan.rangeKm, covered: plan.covered };
  s.ending = { kind: 'bug_out', day, continued: false };
  s.clock.speed = 0;
  log(s, `The ${s.people[0]?.last ?? ''} family bugged out: ${plan.going.length} of ${plan.going.length + plan.left.length} in ${plan.vehicles.length} vehicle${plan.vehicles.length === 1 ? '' : 's'}, ${plan.foodDays} days of food, about ${plan.rangeKm} km of fuel.`);
  return null;
}
