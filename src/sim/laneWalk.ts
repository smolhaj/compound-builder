/**
 * Raiders walk the lane, not a straight line (docs/DECISIONS.md, "Raiders walk the terrain lane"). The terrain pass
 * (sim/terrain.ts) already finds the cheapest way in, outside in, round cliffs, water and walls; the battle used to draw
 * it as a bearing and march the crew down it in a straight line. Now a crew spawns on the lane and walks along it, at
 * the pace of the going (a hard lane is slow, so the towers have longer to shoot), and leaves it only for the last
 * stretch to the wall. Also:
 *  - `vehicleCan`: whether a truck can take a stretch of lane (slope limits; the road closes on a hard-winter day);
 *  - `guardDogs`: the dogs posted inside the compound, at the inner gate, and what they do when a crew gets in.
 * Pure (tested).
 */
import type { Pt } from './perimeter';
import type { Dog } from './pets';

/** Where a crew's pace on a lane bottoms out (a hard lane never slows them past this). */
export const LANE = { PACE_MIN: 0.55, TRUCK_MAX_GRADE: 0.12, TRUCK_MAX_GRADE_SNOW: 0.07 } as const;

/** Total length of a path. */
export function routeLength(path: readonly Pt[]): number {
  let L = 0;
  for (let i = 1; i < path.length; i++) L += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return L;
}

/**
 * The point `d` along the path measured back from its END (the target), with the unit direction of travel there (inward). Past the start the
 * path is extended straight outward along its first segment, so a crew can always be put further out than the path reaches.
 */
export function routeAt(path: readonly Pt[], d: number): { x: number; z: number; dx: number; dz: number } {
  if (path.length < 2) return { x: path[0]?.[0] ?? 0, z: path[0]?.[1] ?? 0, dx: 0, dz: 1 };
  let left = Math.max(0, d);
  for (let i = path.length - 1; i > 0; i--) {
    const a = path[i - 1], b = path[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) continue;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    if (left <= L) return { x: b[0] - ux * left, z: b[1] - uz * left, dx: ux, dz: uz };
    left -= L;
  }
  const a = path[0], b = path[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
  return { x: a[0] - ux * left, z: a[1] - uz * left, dx: ux, dz: uz };
}

/** The distance back along the path at which the crew is at least `reach` (straight-line) from `c`: where they come up from. */
export function spawnArc(path: readonly Pt[], c: Pt, reach: number): number {
  const total = routeLength(path);
  for (let d = reach; d <= Math.max(reach, total) + reach * 2; d += 0.5) {
    const p = routeAt(path, d);
    if (Math.hypot(p.x - c[0], p.z - c[1]) >= reach) return d;
  }
  return reach;
}

/** A crew's pace on a lane, 0.55 to 1: the going slows them (hardness 1 = open ground), a cliff or a ford more. */
export function lanePace(hardness: number, cliff: boolean, fords: boolean): number {
  return Math.max(LANE.PACE_MIN, 1 / Math.max(1, hardness) - (cliff ? 0.1 : 0) - (fords ? 0.08 : 0));
}

/**
 * Can a truck take a stretch of ground at this grade (rise over run) on this day? Steeper than 12 % no; 7 % once snow has closed
 * the roads (`hardWinter`). Their own trucks stop at the foot of a pitch and the crew walks the rest (the battle's dismount point).
 */
export function vehicleCan(grade: number, hardWinter: boolean): boolean {
  return Math.abs(grade) <= (hardWinter ? LANE.TRUCK_MAX_GRADE_SNOW : LANE.TRUCK_MAX_GRADE);
}

export interface GuardDogs { n: number; /** Seconds a posted dog holds the first raider inside, and the wound its bite does. */ hold: number; bite: number }

/**
 * The dogs posted inside the compound at the inner gate (the player's "on guard" dogs that are healthy and have been trained a little).
 * Up to two; each is also an alarm at the inner gate. When a crew gets in, the dog goes for the first man.
 */
export function guardDogs(dogs: readonly Dog[]): GuardDogs {
  const on = dogs.filter(d => d.died == null && d.guard && d.health >= 40 && d.training >= 25).sort((a, b) => b.training - a.training).slice(0, 2);
  if (!on.length) return { n: 0, hold: 0, bite: 0 };
  const t = on.reduce((a, d) => a + d.training, 0) / on.length;
  return { n: on.length, hold: 2 + t / 40, bite: 12 + t / 5 };
}
