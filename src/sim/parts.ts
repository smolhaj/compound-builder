/**
 * Spare parts getting scarcer over the years (GDS §10.5, long-term self-reliance).
 * Once the stores are shut nothing new is made: every machine on the place is
 * a year older each year, so it wants service sooner and the cheap fixes
 * (a hose, a belt) run out. `wornFactor` is 1 at the hit and climbs to 3 by
 * year five; the service interval shortens by it, hardware drawn for repairs
 * grows with it, and the machines wear faster between services. The outlook says how many days the kits on hand will
 * last. Pure.
 */
import type { GameState } from './state';

/** Years since the stores shut (0 while they work). */
export function partsYears(s: GameState): number {
  if (s.disaster.tracks.stores >= 0.5 || !s.disaster.kind || s.clock.t < s.disaster.hitAt) return 0;
  return Math.max(0, (s.clock.t - s.disaster.hitAt) / 365);
}

/** How much more a machine wants, and how sooner, than the day it hit: 1 → 3 over five years. */
export const wornFactor = (s: GameState): number => Math.min(3, 1 + 0.4 * partsYears(s));

/** Days the kits on hand will last at today's rate, or null when nothing is running. */
export function partsOutlook(s: GameState, services: number): { kits: number; days: number | null } {
  const kits = s.stock.vehicle_parts ?? 0;
  if (services <= 0) return { kits, days: null };
  return { kits, days: Math.floor(kits / services) };
}

