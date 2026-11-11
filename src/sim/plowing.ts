/**
 * Who plows the drive (docs/DECISIONS.md, "Snow plowing on the drive"): the blade hangs on a real vehicle of the fleet, a pickup, an old pickup or the
 * tractor, and that vehicle has to run, be home and have fuel. Without one the blade in the shed does nothing (the road is shut as long as without
 * it), and a day the blade goes out costs fuel and a little wear. Pure (tested); `closureDays` (sim/slope.ts) reads `bladeOn`.
 */
import type { GameState } from './state';
import { VEHICLES, fleetOf, runs, type Vehicle, type VehicleKind } from './vehicles';

/** The vehicles a blade or a bucket-blade can be hung on, best first (a pickup is quick; the tractor is slow but never stuck). */
export const PLOW_KINDS: readonly VehicleKind[] = ['pickup', 'old_pickup', 'tractor'];

/** Liters of fuel a day's clearing takes (down the drive and back, then the yard) and the wear it puts on the vehicle (0-1 condition). */
export const PLOW_FUEL_L = 4, PLOW_WEAR = 0.0006;

/** The vehicle that would take the blade today: running, home, not stranded, with fuel; null when there is none. */
export function plowRig(s: GameState): Vehicle | null {
  const ok = (v: Vehicle) => runs(v) && !v.away && !v.stranded && v.fuel > 0 && VEHICLES[v.kind].tankL > 0;
  for (const kind of PLOW_KINDS) { const v = fleetOf(s).find(x => x.kind === kind && ok(x)); if (v) return v; }
  return null;
}

/** The blade is in stock and something can carry it. */
export const bladeOn = (s: GameState): boolean => s.stock.plow >= 1 && plowRig(s) !== null;

/** Burn the day's clearing from the rig (called on a day the blade went out). Returns the liters burned. */
export function burnPlowing(s: GameState): number {
  const v = plowRig(s);
  if (!v || s.stock.plow < 1) return 0;
  const l = Math.min(v.fuel, PLOW_FUEL_L);
  v.fuel -= l; v.condition = Math.max(0, v.condition - PLOW_WEAR);
  return l;
}
