/**
 * The motor court (docs/DECISIONS.md, "Motor court, bar fence and razor wire"): a gravel forecourt in front of the gatehouse garage, fenced on three sides in
 * black steel bars, with a double drive gate in the far fence and six marked bays. It is a structure of kind `motor_court` and uses the equipment yard's bay
 * machinery (sim/farm.ts `YARD_KINDS`: the court's bays come first), so the fleet parks here before it stands in the open yard and the world draws the
 * vehicles in the bays. A raid that gets in drives off the vehicles standing in the open yard; one behind the court's bars and gate is much harder to take.
 * Pure (tested).
 */
import { CELL } from '../game/buildkit/kit';
import { garageRotFor } from './garage';
import { finishedOf } from './farm';
import type { GameState, Structure } from './state';

export const MOTOR_COURT = 'motor_court';
/** Footprint in 3 m cells: along the wall x out from it (18 x 12 m). */
export const COURT_CELLS_X = 6, COURT_CELLS_Z = 4;
export const COURT_D = COURT_CELLS_Z * CELL;
/** The chance a raid that gets in drives off a vehicle behind a finished court's bars, against 1 for one standing in the open yard (and 0.5 in the equipment yard). */
export const COURT_THEFT_FACTOR = 0.25;

/** Where a motor court goes for a gate at (x, z) with the unit vector `inx, inz` pointing from the wall into the compound: outside the gate, back to the wall, drive gate facing the road. */
export function courtSpot(gs: { x: number; z: number; inx: number; inz: number }): { x: number; z: number; rot: number } {
  // the garage stands inside the wall; the court stands outside it, its open back against the garage's road face
  return { x: gs.x - gs.inx * (COURT_D / 2 + 0.04), z: gs.z - gs.inz * (COURT_D / 2 + 0.04), rot: garageRotFor([-gs.inx, -gs.inz]) };
}

/** The finished motor courts. */
export const courts = (s: GameState): Structure[] => finishedOf(s, MOTOR_COURT);
/** Is this yard id a motor court? */
export const isCourt = (s: GameState, yardId: string): boolean => s.structures.some(st => st.id === yardId && st.kind === MOTOR_COURT);
