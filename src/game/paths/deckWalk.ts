/**
 * Walking (and driving) along a route that goes through corridors: a waypoint may carry a deck height (`Wp[2]`), so the figure rides the tunnel's floor
 * under the hill instead of the ground over it, and eases back onto the ground at the far portal. Pure (tested).
 */
import type { Wp } from './linkRoute';
import { doorOf, STOP_TAG } from './linkRoute';

/** Where a mover stands: ground position and the deck height it is on (null: on the ground). */
export interface Mover { x: number; z: number; y: number | null }

export interface Step { moved: number; arrived: boolean; /** Rise over run of this step (the deck's or the ground's). */ grade: number }

/**
 * Move `m` up to `step` units toward `leg`. On a deck leg the height eases to the leg's deck height in proportion to the distance covered; coming off a deck
 * onto a ground leg it eases to the ground and is back on the ground (y null) on arrival.
 */
export function stepToward(m: Mover, leg: Wp, step: number, ground: (x: number, z: number) => number): Step {
  const dx = leg[0] - m.x, dz = leg[1] - m.z, d = Math.hypot(dx, dz);
  const moved = Math.min(step, d), k = d > 1e-9 ? moved / d : 1;
  const y0 = m.y ?? ground(m.x, m.z);
  m.x += dx * k; m.z += dz * k;
  let y1: number | null;
  if (leg[2] !== undefined) y1 = y0 + (leg[2] - y0) * k;
  else if (m.y !== null) { const gy = ground(leg[0], leg[1]); y1 = y0 + (gy - y0) * k; if (k >= 1 - 1e-9) y1 = null; }
  else y1 = null;
  m.y = y1;
  const ye = y1 ?? ground(m.x, m.z);
  return { moved, arrived: d - moved < 1e-6, grade: moved > 1e-6 ? (ye - y0) / moved : 0 };
}

/** The door a leg stands at (null: not a door). */
export const doorAt = (leg: Wp): { link: number; end: 0 | 1 } | null => (leg[3] && leg[3] !== STOP_TAG ? doorOf(leg[3]) : null);

/** Is this the end of a route that is shut off (a tunnel choked with rubble)? The walker waits there. */
export const isStop = (leg: Wp | undefined): boolean => !!leg && leg[3] === STOP_TAG;

/** Has the route any deck in it (is it a way through a corridor)? */
export const hasDeck = (route: readonly Wp[]): boolean => route.some(p => p[2] !== undefined);

/** Height and pitch at distance `d` along a route polyline carrying deck heights (vehicles): y null where the route is on the ground. */
export function sampleRoute(route: ReadonlyArray<Wp>, d: number): { x: number; z: number; rot: number; y: number | null; pitch: number } {
  let left = Math.max(0, d);
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= l || i === route.length - 1) {
      const t = l > 0 ? Math.min(1, left / l) : 0;
      const ya = a[2], yb = b[2];
      const y = ya !== undefined && yb !== undefined ? ya + (yb - ya) * t : null;
      return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, rot: Math.atan2(b[0] - a[0], b[1] - a[1]), y, pitch: ya !== undefined && yb !== undefined && l > 1e-6 ? Math.atan2(yb - ya, l) : 0 };
    }
    left -= l;
  }
  return { x: route[0]?.[0] ?? 0, z: route[0]?.[1] ?? 0, rot: 0, y: null, pitch: 0 };
}

/** Is distance `d` along the route inside a corridor (between the two door points)? */
export function inCorridorAt(route: ReadonlyArray<Wp>, d: number): boolean {
  let left = d;
  let inside = false;
  for (let i = 0; i < route.length; i++) {
    if (i > 0) { const l = Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]); if (left <= l) return inside || route[i][2] !== undefined && route[i - 1][2] !== undefined; left -= l; }
    if (route[i][3]) inside = !inside;
  }
  return false;
}
