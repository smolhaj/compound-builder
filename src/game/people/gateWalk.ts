/**
 * Newcomers and leavers use the gate (pure; tested). Someone taken in walks up the drive from the road to where they live now; someone who
 * goes home, is sent on or moves out walks down the drive and off the map's edge, then is no longer drawn. Purely visual: the sim already
 * adds them (sim/newcomers.ts admitNewcomers) and removes them (moveOut: needs.left).
 */
import type { Person } from '../../sim/family';
import type { PersonState } from '../../sim/state';
import { FIG_POSE } from '../../engine/world/people/figureKit';
import type { Goal } from './peopleGoals';

export type GateRole = 'arriving' | 'leaving' | null;

/** `today` is the sim's dayIndex. Arriving: taken in today. Leaving: moved out (home, sent on). */
export function gateRole(p: Person, st: Pick<PersonState, 'needs'>, today: number): GateRole {
  if (st.needs.left) return 'leaving';
  if (p.origin && p.origin.since >= today && st.needs.died == null) return 'arriving';
  return null;
}

/** Where a leaver heads: the road end of the drive, unseen once there. */
export function leaveGoal(entry: { x: number; z: number }): Goal {
  return { x: entry.x, z: entry.z, pose: FIG_POSE.STAND, face: null, hidden: true, work: false };
}
