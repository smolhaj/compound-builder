/**
 * Stamps a dome's vehicle sally port when the dome is staked (sim/dome/vehiclePort.ts): the port faces the road (the nearest point of the planned drive) and shifts along
 * the shell to the nearest free arc (never the plant yard's span, a person or link airlock, or a bunker's hatch). Kept out of vehiclePort.ts because it reads the road plan.
 * Deterministic: the road plan is a pure function of the site and the seed. Pure reads; the one write is `Structure.portAngle` (optional, so no save bump).
 */
import { roadPlanOf } from '../roadState';
import { TIER, cellsOfKind, shellFt, tierOfKind } from './tiers';
import { FT_PER_UNIT, linkAirlocksOf } from './standing';
import { bearingToRoad, choosePortAngle, hasVehiclePort } from './vehiclePort';
import type { GameState, Structure } from '../state';

/** The port's angle for a dome about to stand at (x, z), against the drive and what is already there. */
export function portAngleFor(s: GameState, st: Pick<Structure, 'id' | 'kind' | 'x' | 'z' | 'rot'>): number | undefined {
  const tier = tierOfKind(st.kind);
  if (!tier || !hasVehiclePort(tier)) return undefined;
  const r = shellFt(tier, cellsOfKind(st.kind) ?? TIER[tier].cells) / 2 / FT_PER_UNIT - 0.03;
  const drive = roadPlanOf(s).pts.map(p => [p.x, p.z] as [number, number]);
  const links = linkAirlocksOf(s, tier, st, r, 0).map(a => a.angle);
  // a bunker piece already standing under the circle: keep clear of its hatch (about two cells across)
  const avoid = s.structures.filter(b => b.id !== st.id && b.kind.startsWith('bunker_') && Math.hypot(b.x - st.x, b.z - st.z) < r).map(b => ({ angle: Math.atan2(b.x - st.x, b.z - st.z), width: 0.5, why: 'bunker hatch' }));
  return choosePortAngle({ tier, r, rot: st.rot, links, avoid }, bearingToRoad(st.x, st.z, drive)).angle;
}

/** Stamp the angle on a freshly planned dome (a no-op for other kinds). */
export function stampPort(s: GameState, st: Structure): void {
  const a = portAngleFor(s, st);
  if (a !== undefined) st.portAngle = a;
}
