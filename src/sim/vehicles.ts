/**
 * Vehicles (the family truck and what can be bought besides). Everyone
 * starts with a used pickup. Pure.
 *
 *  Pickup         the family's used half-ton (130,000 miles). Town trips for
 *                 the day jobs, about 30 miles a workday at 18 mpg.
 *  Tractor        a used compact diesel tractor ($18,000): fields yield 15 %
 *                 more while it runs.
 *  ATV            a utility ATV ($9,500): runs the property on a trickle of gas.
 *  1970s pickup   a carbureted, points-ignition truck ($12,000): no
 *                 electronics, so an EMP doesn't touch it.
 *  Trailer        a 6 × 12 utility trailer ($2,200): hauls, never breaks down.
 *
 * Fuel is bought at the pump while the gas stations work; once they're down
 * (fuel track < 0.5) it comes from the jerry cans (20 L each). Peacetime
 * maintenance (oil change every 5,000 miles, tires every 50,000) costs money;
 * after it hits, condition wears unless someone knows engines (mechanic 3+)
 * and there are hardware kits for parts.
 */
import type { GameState } from './state';

export type VehicleKind = 'pickup' | 'tractor' | 'atv' | 'old_pickup' | 'trailer';

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
}

export interface VehicleDef { name: string; price: number; tankL: number; mpg: number; emp: boolean; dailyMiles: number }

export const VEHICLES: Record<VehicleKind, VehicleDef> = {
  pickup: { name: 'Used pickup', price: 28_000, tankL: 98, mpg: 18, emp: true, dailyMiles: 30 },
  tractor: { name: 'Compact diesel tractor', price: 18_000, tankL: 40, mpg: 4, emp: true, dailyMiles: 2 },
  atv: { name: 'Utility ATV', price: 9_500, tankL: 15, mpg: 30, emp: true, dailyMiles: 4 },
  old_pickup: { name: '1970s pickup (no electronics)', price: 12_000, tankL: 76, mpg: 12, emp: false, dailyMiles: 30 },
  trailer: { name: 'Utility trailer', price: 2_200, tankL: 0, mpg: 0, emp: false, dailyMiles: 0 },
};

/** Gas at the pump, $ a liter ($3.20 a gallon); an oil change; a set of tires. */
export const GAS_USD_L = 0.85, OIL_USD = 90, TIRES_USD = 900;
/** Tractor field bonus while it runs. */
export const TRACTOR_BOOST = 1.15;
const L_PER_GAL = 3.785, CAN_L = 20;

export function startingVehicles(): Vehicle[] {
  return [{ id: 'v1', kind: 'pickup', mileage: 130_000, condition: 0.8, fuel: 60, oilAt: 128_000 }];
}

const runs = (v: Vehicle) => !v.fried && v.condition > 0;
const stationsUp = (s: GameState) => s.disaster.tracks.fuel >= 0.5;

/** Buy a vehicle (one of each kind, besides the family truck). */
export function buyVehicle(s: GameState, kind: VehicleKind): string | null {
  const def = VEHICLES[kind];
  if (!def) return 'no such vehicle';
  const vs = (s.vehicles ??= startingVehicles());
  if (kind !== 'pickup' && vs.some(v => v.kind === kind)) return 'already have one';
  if (s.disaster.tracks.stores < 0.5) return 'no dealers open';
  if (s.money < def.price) return 'not enough money';
  s.money -= def.price;
  vs.push({ id: `v${vs.length + 1}`, kind, mileage: kind === 'old_pickup' ? 160_000 : kind === 'trailer' ? 0 : 20_000, condition: 0.85, fuel: def.tankL, oilAt: 0 });
  return null;
}

/** Field output multiplier: a running tractor with fuel. */
export function tractorBoost(s: GameState): number {
  return (s.vehicles ?? []).some(v => v.kind === 'tractor' && runs(v) && v.fuel > 0) ? TRACTOR_BOOST : 1;
}

/** The EMP: every vehicle with electronics dies; the 1970s truck and the trailer don't. */
export function empVehicles(s: GameState): string[] {
  const hit = (s.vehicles ??= startingVehicles()).filter(v => VEHICLES[v.kind].emp && !v.fried);
  hit.forEach(v => { v.fried = true; });
  return hit.length ? [`The EMP killed ${hit.map(v => VEHICLES[v.kind].name.toLowerCase()).join(', ')}.`] : [];
}

/** Top a tank up: at the pump in peacetime, from the jerry cans after. True if any fuel went in. */
function refuel(s: GameState, v: Vehicle): boolean {
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

/** Once a day: drive, fuel, maintain, wear. */
export function vehiclesDay(s: GameState): string[] {
  const vs = (s.vehicles ??= startingVehicles());
  const out: string[] = [];
  const peace = stationsUp(s) && s.disaster.tracks.stores >= 0.5;
  const commuting = peace && s.personState.some(ps => ps.employed);
  const mechanic = Math.max(0, ...s.people.map(p => p.skills.mechanic ?? 0));
  // the commute: one running truck makes the town trip on workdays (≈ 5/7 of days)
  const truck = vs.find(v => (v.kind === 'pickup' || v.kind === 'old_pickup') && runs(v));
  for (const v of vs) {
    const def = VEHICLES[v.kind];
    if (!runs(v) || def.tankL === 0) continue;
    const miles = v === truck && commuting ? def.dailyMiles * 5 / 7 : v === truck ? 3 : def.dailyMiles;
    if (v.fuel < def.tankL * 0.25) refuel(s, v);
    const burn = Math.min(v.fuel, miles / def.mpg * L_PER_GAL);
    v.fuel -= burn;
    if (burn <= 0) continue;
    v.mileage += miles;
    // maintenance: the shop in peacetime, the family's own hands and parts after
    if (peace) {
      if (v.mileage - v.oilAt >= 5000 && s.money >= OIL_USD) { s.money -= OIL_USD; v.oilAt = v.mileage; v.condition = Math.min(1, v.condition + 0.02); }
      if (Math.floor(v.mileage / 50_000) > Math.floor((v.mileage - miles) / 50_000) && s.money >= TIRES_USD) { s.money -= TIRES_USD; out.push(`New tires on the ${def.name.toLowerCase()}.`); }
    } else {
      const fixing = mechanic >= 3 && s.stock.hardware >= 0.01;
      if (fixing) s.stock.hardware -= 0.01;
      v.condition -= fixing ? 0.0002 : 0.002 * (1 - mechanic / 10);
      if (v.condition <= 0) { v.condition = 0; out.push(`The ${def.name.toLowerCase()} broke down for good.`); }
    }
  }
  return out;
}
