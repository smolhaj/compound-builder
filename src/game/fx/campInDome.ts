/**
 * The starter camp and its chore yard when a dome's level pad covers them (pure; used by HomesteadWorld._snapCamp). The camp stands on the pad, but in a small dome it can sit on the
 * entrance: this says when the camp's ring (tent, yard, string lights) would touch the shell or lie across an airlock's lane, so the world hides it instead of letting a tent clip the module.
 */
export interface CampDome { x: number; z: number; r: number; airlocks: ReadonlyArray<{ angle: number }> }
/** The camp's clear ring (world units): the tent, the yard and the string lights lie inside it. */
export const CAMP_RING = 1.25;
/** Half width of a lane and its margin (a footpath is 0.3 wide, the vehicle lane 0.55). */
const LANE_HALF = 0.3 + 0.15;

export function campClashesDome(camp: { x: number; z: number }, d: CampDome): boolean {
  const rx = camp.x - d.x, rz = camp.z - d.z;
  const dist = Math.hypot(rx, rz);
  if (dist - CAMP_RING > d.r) return false;                                           // wholly outside the dome
  if (dist + CAMP_RING > d.r - 0.35) return true;                       // touches the shell or the entrance module at its foot
  for (const a of d.airlocks) {
    const along = rx * Math.sin(a.angle) + rz * Math.cos(a.angle), across = Math.abs(rx * Math.cos(a.angle) - rz * Math.sin(a.angle));
    if (along > d.r * 0.25 && across < CAMP_RING + LANE_HALF) return true;           // across an airlock's lane
  }
  return false;
}
