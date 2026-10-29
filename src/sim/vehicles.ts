/**
 * The fleet (docs/DECISIONS.md: "a small fleet with a garage"). Everyone
 * starts with a used pickup; the rest is bought, kept in a garage
 * (sim/garage.ts), fuelled, serviced and, sooner or later, mended. Pure.
 *
 *  Pickup         the family's used half-ton (130,000 miles). Town trips for
 *                 the day jobs, about 30 miles a workday at 18 mpg.
 *  SUV            a used 4x4 wagon ($32,000): seats seven, tows, takes a bad road.
 *  Motorhome      an off-road expedition camper on a truck chassis
 *                 ($138,000, diesel): sleeps six, carries a lot, the bug-out
 *                 vehicle. Takes two bays.
 *  Tractor        a used compact diesel tractor ($18,000): fields yield 15 %
 *                 more while it runs, and its implements (the tools system's
 *                 `tractor_implements`) work the soil and dig 2-3 times faster.
 *  ATV            a utility ATV ($9,500): runs the property on a trickle of gas.
 *  1970s pickup   a carbureted, points-ignition truck ($12,000): no
 *                 electronics, so an EMP doesn't touch it.
 *  Trailer        a 6 x 12 utility trailer ($2,200): hauls, never breaks down;
 *                 a truck that can pull it carries 700 kg more.
 *
 * Fuel is bought at the pump while the gas stations work; once they're down
 * (fuel track < 0.5) it comes from the jerry cans (20 L each). Maintenance:
 * an oil change every 5,000 miles and a service every 3,000 (a shop in
 * peacetime, a parts kit and someone who knows engines after). Overdue and worn
 * vehicles break down, more on long runs; a breakdown wants a parts kit and a
 * mechanic (or a tow and a bill in peacetime). A dead or fried vehicle can be
 * stripped for parts. An EMP kills every vehicle with electronics.
 */
import type { GameState } from './state';
import { dayIndex } from './state';
import { log } from './economy';
import { mulberry32 } from './rng';
import { parkingPlan, syncParking } from './parking';
import { addTool, kitOf } from './tools';
import { enclosure } from './enclosure';
import { COURT_THEFT_FACTOR, isCourt } from './motorCourt';
import { runFinished } from './perimeter';

export type VehicleKind = 'pickup' | 'suv' | 'motorhome' | 'tractor' | 'atv' | 'old_pickup' | 'trailer';

export interface Vehicle {
  id: string;
  kind: VehicleKind;
  /** Odometer, miles (tractor: engine hours read as miles). */
  mileage: number;
  /** 0–1; 0 is a dead vehicle. */
  condition: number;
  /** Liters in the tank. */
  fuel: number;
  /** Killed by an EMP (modern electronics). */
  fried?: boolean;
  /** Miles at the last oil change. */
  oilAt: number;
  /** Miles at the last service (filters, belts, plugs); absent = at the odometer reading when it was bought. */
  serviceAt?: number;
  /** Broken down: the day, and what failed. Needs a parts kit and a mechanic (or a tow in town). */
  down?: { since: number; part: string; /** Days of work left once the parts are in. */ left?: number };
  /** Away on a run (the world does not draw it; it cannot be used). */
  away?: boolean;
}

export interface VehicleDef {
  name: string; price: number; tankL: number; mpg: number; emp: boolean; dailyMiles: number;
  /** People it carries (the driver included). */
  seats: number;
  /** What it carries (kg), and what it can pull. */
  cargoKg: number; towKg: number;
  /** Parking bays it takes (sim/garage.ts). */
  bays: number;
  /** 0–1: how well it takes a bad road. */
  offroad: number;
  fuelType: 'gasoline' | 'diesel';
  /** A line for the shop and the fleet panel. */
  blurb: string;
  /** How many the family may keep. */
  max: number;
}

export const VEHICLES: Record<VehicleKind, VehicleDef> = {
  pickup: { name: 'Used pickup', price: 28_000, tankL: 98, mpg: 18, emp: true, dailyMiles: 30, seats: 3, cargoKg: 800, towKg: 3200, bays: 1, offroad: 0.6, fuelType: 'gasoline', max: 2, blurb: 'A used half-ton: the town trips, the hauling, the bed full of lumber.' },
  suv: { name: 'Used SUV (4x4)', price: 32_000, tankL: 90, mpg: 17, emp: true, dailyMiles: 25, seats: 7, cargoKg: 520, towKg: 3000, bays: 1, offroad: 0.7, fuelType: 'gasoline', max: 2, blurb: 'A three-row 4x4 wagon: seats seven, tows a trailer, takes a bad road. Better with the family aboard than a pickup.' },
  motorhome: { name: 'Off-road motorhome', price: 138_000, tankL: 160, mpg: 9, emp: true, dailyMiles: 12, seats: 6, cargoKg: 1100, towKg: 0, bays: 2, offroad: 0.85, fuelType: 'diesel', max: 1, blurb: 'An expedition camper on a truck chassis: sleeps six, carries a month of supplies, a hand pump and a water tank. The way out. Takes two bays.' },
  tractor: { name: 'Compact diesel tractor', price: 18_000, tankL: 40, mpg: 4, emp: true, dailyMiles: 2, seats: 1, cargoKg: 400, towKg: 4000, bays: 1, offroad: 1, fuelType: 'diesel', max: 1, blurb: 'Plows, discs, hauls logs and digs with the loader: fields yield more and soil work runs 2 to 3 times faster.' },
  atv: { name: 'Utility ATV', price: 9_500, tankL: 15, mpg: 30, emp: true, dailyMiles: 4, seats: 2, cargoKg: 120, towKg: 450, bays: 1, offroad: 1, fuelType: 'gasoline', max: 1, blurb: 'Runs the property on a trickle of gas: checks the fence, hauls firewood, pulls a small trailer.' },
  old_pickup: { name: '1970s pickup (no electronics)', price: 12_000, tankL: 76, mpg: 12, emp: false, dailyMiles: 30, seats: 3, cargoKg: 650, towKg: 2500, bays: 1, offroad: 0.6, fuelType: 'gasoline', max: 1, blurb: 'Carbureted, points ignition: an EMP does not touch it, and anyone with a wrench can fix it. Thirsty.' },
  trailer: { name: 'Utility trailer', price: 2_200, tankL: 0, mpg: 0, emp: false, dailyMiles: 0, seats: 0, cargoKg: 700, towKg: 0, bays: 0, offroad: 0.5, fuelType: 'gasoline', max: 1, blurb: 'A 6 x 12 ft flatbed: hauls, never breaks down. A truck that can pull it carries 700 kg more.' },
};
export const VEHICLE_KINDS = Object.keys(VEHICLES) as VehicleKind[];
/** What a dealer sells (the family truck is only the one they start with, and a second). */
export const BUYABLE: readonly VehicleKind[] = ['suv', 'motorhome', 'pickup', 'old_pickup', 'tractor', 'atv', 'trailer'];

/** Gas at the pump, $ a liter ($3.20 a gallon); an oil change; a set of tires; a service at the shop; a tow. */
export const GAS_USD_L = 0.85, OIL_USD = 90, TIRES_USD = 900, SERVICE_USD = 260, TOW_USD = 450;
/** Tractor field bonus while it runs. */
export const TRACTOR_BOOST = 1.15;
/** Miles between services, and between oil changes. */
export const SERVICE_MILES = 3000, OIL_MILES = 5000;
/** Extra cargo a trailer adds when the truck can pull it. */
export const TRAILER_KG = 700;
const L_PER_GAL = 3.785, CAN_L = 20;

export function startingVehicles(): Vehicle[] {
  return [{ id: 'v1', kind: 'pickup', mileage: 130_000, condition: 0.8, fuel: 60, oilAt: 128_000, serviceAt: 128_500 }];
}

export const runs = (v: Vehicle): boolean => !v.fried && v.condition > 0 && !v.down;
const alive = (v: Vehicle): boolean => !v.fried && v.condition > 0;
const stationsUp = (s: GameState) => s.disaster.tracks.fuel >= 0.5;
const shopsUp = (s: GameState) => stationsUp(s) && s.disaster.tracks.stores >= 0.5;
export const fleetOf = (s: GameState): Vehicle[] => (s.vehicles ??= startingVehicles());
const mechanicOf = (s: GameState): number => Math.max(0, ...s.people.filter((_, i) => s.personState[i]?.needs.died == null && !s.personState[i]?.needs.taken).map(p => p.skills.mechanic ?? 0));

const MILEAGE_NEW: Record<VehicleKind, number> = { pickup: 60_000, suv: 70_000, motorhome: 35_000, tractor: 1_500, atv: 8_000, old_pickup: 160_000, trailer: 0 };

/** Buy a vehicle. The family may keep as many of a kind as `max`. */
export function buyVehicle(s: GameState, kind: VehicleKind): string | null {
  const def = VEHICLES[kind];
  if (!def) return 'no such vehicle';
  const vs = fleetOf(s);
  if (vs.filter(v => v.kind === kind).length >= def.max) return def.max > 1 ? `the family keeps ${def.max} at most` : 'already have one';
  if (s.disaster.tracks.stores < 0.5) return 'no dealers open';
  if (s.money < def.price) return 'not enough money';
  s.money -= def.price;
  const id = `v${Math.max(0, ...vs.map(v => Number(v.id.slice(1)) || 0)) + 1}`;
  const mileage = MILEAGE_NEW[kind];
  vs.push({ id, kind, mileage, condition: 0.85, fuel: def.tankL, oilAt: mileage, serviceAt: mileage });
  // the tractor comes with its implements (plow, disc, loader bucket): the tools system works them
  syncParking(s);   // into the gatehouse garage if there is a free slot
  if (kind === 'tractor' && !kitOf(s).items.some(t => t.kind === 'tractor_implements')) addTool(s, 'tractor_implements', 0.85, 1);
  return null;
}

/** Field output multiplier: a running tractor with fuel. */
export function tractorBoost(s: GameState): number {
  return (s.vehicles ?? []).some(v => v.kind === 'tractor' && runs(v) && v.fuel > 0) ? TRACTOR_BOOST : 1;
}
/** A running tractor with fuel: its implements can work (sim/tools.ts). */
export const tractorRuns = (s: GameState): boolean => (s.vehicles ?? []).some(v => v.kind === 'tractor' && runs(v) && !v.away && v.fuel > 0);
/** Liters the tractor burns an hour of implement work. */
export const TRACTOR_L_PER_HOUR = 3.2;
/** Burn the tractor's fuel for `hours` of work (the tools system calls this). */
export function burnTractor(s: GameState, hours: number): void {
  const t = (s.vehicles ?? []).find(v => v.kind === 'tractor' && runs(v) && v.fuel > 0);
  if (!t) return;
  t.fuel = Math.max(0, t.fuel - TRACTOR_L_PER_HOUR * hours);
  t.mileage += hours;
}

/** The EMP: every vehicle with electronics dies; the 1970s truck and the trailer don't. */
export function empVehicles(s: GameState): string[] {
  const hit = fleetOf(s).filter(v => VEHICLES[v.kind].emp && !v.fried);
  hit.forEach(v => { v.fried = true; delete v.down; });
  return hit.length ? [`The EMP killed ${hit.map(v => VEHICLES[v.kind].name.toLowerCase()).join(', ')}.`] : [];
}

/** Top a tank up: at the pump in peacetime, from the jerry cans after. True if any fuel went in. */
export function refuel(s: GameState, v: Vehicle): boolean {
  const want = VEHICLES[v.kind].tankL - v.fuel;
  if (want <= 0) return true;
  if (stationsUp(s)) {
    const usd = want * GAS_USD_L;
    if (s.money < usd) return false;
    s.money -= usd; v.fuel += want; return true;
  }
  const cans = Math.min(s.stock.fuel, want / CAN_L);
  if (cans <= 0) return false;
  s.stock.fuel -= cans; v.fuel += cans * CAN_L; return true;
}

/** Miles on the clock since the last service. */
export const sinceService = (v: Vehicle): number => v.mileage - (v.serviceAt ?? v.oilAt);
export const overdue = (v: Vehicle): boolean => v.kind !== 'trailer' && sinceService(v) >= SERVICE_MILES;

/** Service a vehicle now: the shop in peacetime, otherwise a parts kit and a mechanic of 2 or more. Null on success. */
export function serviceVehicle(s: GameState, id: string): string | null {
  const v = fleetOf(s).find(x => x.id === id);
  if (!v || v.kind === 'trailer') return 'nothing to service';
  if (!alive(v)) return 'it is past servicing';
  if (shopsUp(s)) {
    if (s.money < SERVICE_USD) return 'not enough money';
    s.money -= SERVICE_USD; v.serviceAt = v.mileage; v.oilAt = v.mileage; v.condition = Math.min(1, v.condition + 0.04);
    return null;
  }
  if (mechanicOf(s) < 2) return 'nobody here knows engines well enough (mechanic 2)';
  if (s.stock.vehicle_parts < 1) return 'needs a parts kit';
  s.stock.vehicle_parts -= 1; v.serviceAt = v.mileage; v.oilAt = v.mileage; v.condition = Math.min(1, v.condition + 0.05);
  return null;
}

/** Strip a dead or fried vehicle for parts: two kits (three from a motorhome). */
export function stripForParts(s: GameState, id: string): string | null {
  const vs = fleetOf(s);
  const v = vs.find(x => x.id === id);
  if (!v) return 'no such vehicle';
  if (alive(v)) return 'it still runs';
  s.stock.vehicle_parts += v.kind === 'motorhome' ? 3 : v.kind === 'trailer' ? 1 : 2;
  vs.splice(vs.indexOf(v), 1);
  syncParking(s);
  log(s, `Stripped the dead ${VEHICLES[v.kind].name.toLowerCase()} for parts.`);
  return null;
}

// ── Breakdowns ─────────────────────────────────────────────────────────────

const PARTS = ['fuel pump', 'alternator', 'radiator hose', 'starter', 'serpentine belt', 'water pump', 'ignition coil'];
const OLD_PARTS = ['carburetor', 'points and condenser', 'fuel pump', 'water pump', 'generator belt'];

/** A day's chance a vehicle breaks down while it is driven: worn, overdue for service, a hard road. A mechanic in the house trims it. */
export function breakdownChance(v: Vehicle, mechanic: number, hardRoad = 0): number {
  if (v.kind === 'trailer') return 0;
  const wear = (1 - v.condition) ** 2 * 0.04;
  const p = 0.0015 + wear + (overdue(v) ? 0.006 : 0) + hardRoad * 0.01 * (1 - VEHICLES[v.kind].offroad);
  return Math.min(0.2, p * (v.kind === 'old_pickup' ? 0.7 : 1) * (mechanic >= 5 ? 0.7 : 1));
}

/** Days of work to mend a breakdown once the parts are in: faster with a good mechanic. */
export const repairDays = (mechanic: number): number => Math.max(1, 4 - Math.floor(mechanic / 3));

function rollDown(s: GameState, v: Vehicle, p: number, salt: number): boolean {
  const u = mulberry32(s.seed * 4003 + dayIndex(s.clock.t) * 97 + (Number(v.id.slice(1)) || 0) * 13 + salt)();
  return u < p;
}

/** Break a vehicle down (a log line). */
function breakDown(s: GameState, v: Vehicle, salt: number): string {
  const list = v.kind === 'old_pickup' ? OLD_PARTS : PARTS;
  const part = list[Math.floor(mulberry32(s.seed * 31 + salt + (Number(v.id.slice(1)) || 0))() * list.length)];
  v.down = { since: dayIndex(s.clock.t), part };
  return `The ${VEHICLES[v.kind].name.toLowerCase()} broke down: the ${part}.`;
}

/**
 * The road: a run of `km` out and back. May strand the truck for a day or three
 * (a mechanic and a kit on board fix it on the roadside; otherwise it is towed
 * home, and stays down). Returns the extra days on the road and a log line.
 */
export function roadTrouble(s: GameState, v: Vehicle, km: number, salt = 0): { extraDays: number; line: string | null } {
  const mech = mechanicOf(s);
  const p = breakdownChance(v, mech, Math.min(3, km / 60));
  if (!rollDown(s, v, p * Math.min(3, 1 + km / 80), 700 + salt)) return { extraDays: 0, line: null };
  if (mech >= 2 && s.stock.vehicle_parts >= 1) {
    s.stock.vehicle_parts -= 1; v.condition = Math.max(0, v.condition - 0.02);
    return { extraDays: 1, line: `The ${VEHICLES[v.kind].name.toLowerCase()} broke down on the road (${PARTS[0]}); they fixed it by the roadside with a parts kit. A day lost.` };
  }
  const line = breakDown(s, v, 800 + salt);
  return { extraDays: 2, line: `${line} They got it home on the second day and it is not going anywhere until it is fixed.` };
}

// ── Trips: which vehicle, how much fuel, what it carries ───────────────────

/** Vehicles that can carry people and goods on the road. */
const ROAD: readonly VehicleKind[] = ['pickup', 'old_pickup', 'suv', 'motorhome'];

/** A running road vehicle at home with fuel in it (or fuel in the cans). */
export function roadVehicles(s: GameState): Vehicle[] {
  return fleetOf(s).filter(v => ROAD.includes(v.kind) && runs(v) && !v.away && v.condition > 0.1);
}

/** Liters there and back for `km` kilometers in this vehicle. */
export const tripLiters = (v: Vehicle, km: number): number => Math.ceil(2 * km / 1.609 / VEHICLES[v.kind].mpg * L_PER_GAL);

/** Cargo (kg): the vehicle's own, plus a trailer a running truck can pull. */
export function cargoKg(s: GameState, v: Vehicle): number {
  const trailer = fleetOf(s).some(t => t.kind === 'trailer' && !t.away);
  return VEHICLES[v.kind].cargoKg + (trailer && VEHICLES[v.kind].towKg >= 1500 ? TRAILER_KG : 0);
}

/**
 * The vehicle for a trip of `km` with `team` people: the one that seats them and the load with the least
 * fuel, best kept; a vehicle that would run dry is the last choice. Null if nothing runs.
 */
export function tripVehicle(s: GameState, km: number, team = 2): Vehicle | undefined {
  const cans = s.stock.fuel * CAN_L;
  const ok = roadVehicles(s).filter(v => VEHICLES[v.kind].seats >= team);
  const score = (v: Vehicle) => {
    const need = tripLiters(v, km), have = v.fuel + cans;
    return (have >= need ? 0 : 1000) + need * 0.5 - v.condition * 20 - cargoKg(s, v) / 200;
  };
  return [...ok].sort((a, b) => score(a) - score(b))[0];
}

export interface TripPlan { truck: Vehicle | undefined; liters: number; have: number; seats: number; cargoKg: number }
export function tripPlan(s: GameState, km: number, team = 2): TripPlan {
  const truck = tripVehicle(s, km, team);
  if (!truck) return { truck, liters: 0, have: 0, seats: 0, cargoKg: 0 };
  return { truck, liters: tripLiters(truck, km), have: truck.fuel + s.stock.fuel * CAN_L, seats: VEHICLES[truck.kind].seats, cargoKg: cargoKg(s, truck) };
}

/** Burn a trip's fuel (the tank, then the cans), add the miles and the wear. */
export function driveTrip(s: GameState, v: Vehicle, km: number, liters: number, wear: number): void {
  const fromTank = Math.min(v.fuel, liters);
  v.fuel -= fromTank;
  s.stock.fuel = Math.max(0, s.stock.fuel - (liters - fromTank) / CAN_L);
  v.mileage += 2 * km / 1.609;
  v.condition = Math.max(0, v.condition - wear);
}

// ── Raids: what a lost fight takes ─────────────────────────────────────────

/** Is the yard open to a crew? A closed property line (sim/enclosure.ts) keeps what stands inside it safe. */
export function yardOpen(s: GameState): boolean {
  const e = enclosure(s, s.clock.t);
  return !(e.openShare === 0 && e.creekOpen === 0 && s.perimeter.some(r => runFinished(r) && e.onLine.has(r.id)));
}

/**
 * A lost fight: a crew that gets in drives off what is standing in the open yard (docs/DECISIONS.md, user answer):
 * each vehicle outside takes its chance (looters 40 %, an organized crew 60 %). A vehicle under a roof (the garages, the
 * gatehouse garage) or inside a closed wall is safe, and one away on a run is not here. Returns the report lines.
 */
export function raidTakesVehicles(s: GameState, organized: boolean): string[] {
  if (!yardOpen(s)) return [];
  const vs = fleetOf(s);
  const outside = parkingPlan(s).outside.map(id => vs.find(v => v.id === id)).filter((v): v is Vehicle => !!v && !v.away);
  const lines: string[] = [];
  const p = organized ? 0.6 : 0.4;
  const fenced = new Set(parkingPlan(s).inYard);
  for (const v of outside) {
    const u = mulberry32(s.seed * 5413 + dayIndex(s.clock.t) * 41 + (Number(v.id.slice(1)) || 0) * 7)();
    const pk = parkingPlan(s).parked.find(x => x.vehicle === v.id);
    const behind = pk?.yard && isCourt(s, pk.yard.yard) ? COURT_THEFT_FACTOR : fenced.has(v.id) ? 0.5 : 1;   // (a fenced, lit equipment yard with the hitches locked: half the chance; behind the motor court's bars and gate: a quarter)
    if (u >= p * behind) continue;
    vs.splice(vs.indexOf(v), 1);
    lines.push(`They drove off the ${VEHICLES[v.kind].name.toLowerCase()} that was standing in the open yard.`);
  }
  if (lines.length) syncParking(s);
  return lines;
}

// ── Once a day ─────────────────────────────────────────────────────────────

/** Once a day: drive, fuel, maintain, wear, break down, mend. */
export function vehiclesDay(s: GameState): string[] {
  const vs = fleetOf(s);
  const out: string[] = [];
  const peace = shopsUp(s);
  // (a weekender's commute is counted on the trip up and down, sim/weekender.ts)
  const commuting = peace && s.weekend?.mode !== 'split' && s.personState.some(ps => ps.employed);
  // (the living: a dead mechanic used to keep the trucks running)
  const mechanic = mechanicOf(s);
  syncParking(s);
  const plan = parkingPlan(s);
  const day = dayIndex(s.clock.t);
  // the commute: one running truck makes the town trip on workdays (≈ 5/7 of days)
  const truck = vs.find(v => (v.kind === 'pickup' || v.kind === 'old_pickup' || v.kind === 'suv') && runs(v) && !v.away);
  // a storm that dents what stands in the yard
  const hail = s.weather?.active && s.weather.active.kind === 'hail' && day >= s.weather.active.at && day <= s.weather.active.until;
  for (const v of vs) {
    const def = VEHICLES[v.kind];
    const outside = plan.outside.includes(v.id);
    if (alive(v) && outside && v.kind !== 'trailer') v.condition = Math.max(0, v.condition - (hail ? 0.03 : 0.0002));
    // a breakdown: mended with a parts kit and someone who knows engines; in town, towed to the shop
    if (v.down && alive(v)) {
      if (v.down.left === undefined) {
        if (peace && s.money >= TOW_USD + SERVICE_USD) { s.money -= TOW_USD + SERVICE_USD; v.down.left = 2; out.push(`The ${def.name.toLowerCase()} is at the shop: $${TOW_USD + SERVICE_USD} for the tow and the ${v.down.part}.`); }
        else if (mechanic >= 1 && s.stock.vehicle_parts >= 1) { s.stock.vehicle_parts -= 1; v.down.left = repairDays(mechanic); out.push(`The family started on the ${def.name.toLowerCase()}'s ${v.down.part}: about ${v.down.left} days.`); }
      }
      if (v.down.left !== undefined) {
        v.down.left -= 1;
        if (v.down.left <= 0) { out.push(`The ${def.name.toLowerCase()} runs again.`); v.condition = Math.min(1, v.condition + 0.04); delete v.down; }
      }
      continue;
    }
    if (!runs(v) || def.tankL === 0 || v.away) continue;
    const miles = v === truck && commuting ? def.dailyMiles * 5 / 7 : v === truck ? 3 : def.dailyMiles;
    if (v.fuel < def.tankL * 0.25) refuel(s, v);
    const burn = Math.min(v.fuel, miles / def.mpg * L_PER_GAL);
    v.fuel -= burn;
    if (burn <= 0) continue;
    v.mileage += miles;
    // maintenance: the shop in peacetime, the family's own hands and parts after
    if (peace) {
      if (v.mileage - v.oilAt >= OIL_MILES && s.money >= OIL_USD) { s.money -= OIL_USD; v.oilAt = v.mileage; v.condition = Math.min(1, v.condition + 0.02); }
      if (overdue(v) && s.money >= SERVICE_USD) { s.money -= SERVICE_USD; v.serviceAt = v.mileage; v.condition = Math.min(1, v.condition + 0.03); }
      if (Math.floor(v.mileage / 50_000) > Math.floor((v.mileage - miles) / 50_000) && s.money >= TIRES_USD) { s.money -= TIRES_USD; out.push(`New tires on the ${def.name.toLowerCase()}.`); }
    } else {
      // a service when it is due, if there is a kit and someone who can
      if (overdue(v) && mechanic >= 2 && s.stock.vehicle_parts >= 1) { s.stock.vehicle_parts -= 1; v.serviceAt = v.mileage; v.oilAt = v.mileage; v.condition = Math.min(1, v.condition + 0.05); out.push(`Serviced the ${def.name.toLowerCase()}: a kit of filters, belts and plugs.`); }
      const fixing = mechanic >= 3 && s.stock.hardware >= 0.01;
      if (fixing) s.stock.hardware -= 0.01;
      v.condition -= (fixing ? 0.0002 : 0.002 * (1 - mechanic / 10)) * (overdue(v) ? 1.5 : 1);
      if (v.condition <= 0) { v.condition = 0; out.push(`The ${def.name.toLowerCase()} broke down for good.`); continue; }
    }
    // the odd breakdown (the miles they drive every day are not many, but the old ones go)
    if (rollDown(s, v, breakdownChance(v, mechanic) * (miles > 8 ? 1 : 0.3), 29)) out.push(breakDown(s, v, 5));
  }
  return out;
}

// ── The fleet in words ─────────────────────────────────────────────────────

/** "1 of 3": a vehicle's rank among its kind, for the panel. */
export function vehicleName(s: GameState, v: Vehicle): string {
  const same = fleetOf(s).filter(x => x.kind === v.kind);
  return same.length > 1 ? `${VEHICLES[v.kind].name} ${same.indexOf(v) + 1}` : VEHICLES[v.kind].name;
}

/** Total seats in the running vehicles, and cargo; what a bug-out can carry. */
export function fleetCapacity(s: GameState): { seats: number; cargoKg: number; vehicles: number } {
  const vs = roadVehicles(s).filter(v => v.fuel > 0 || s.stock.fuel > 0);
  const kg = vs.reduce((a, v) => a + cargoKg(s, v), 0);
  return { seats: vs.reduce((a, v) => a + VEHICLES[v.kind].seats, 0), cargoKg: kg, vehicles: vs.length };
}
