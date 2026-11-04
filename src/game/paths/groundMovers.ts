/**
 * Everything that is not a person but moves on the same ground (docs/DECISIONS.md, "Wildlife, livestock and trucks use the route network"):
 * how steep a slope each kind of animal takes, and the slope limit of a vehicle along a drawn route (the 12 % / 7 % in snow of sim/laneWalk
 * `vehicleCan`). Pure (tested): the world hands in the ground height.
 */
import { vehicleCan } from '../../sim/laneWalk';
import type { Pt } from '../../sim/pathRoute';
import { crossesHard, walkRoute } from './walkRoute';

/** Rise over run each kind takes on foot (people: 1.0, game/paths/walkRoute WALK_CLIFF). Goats and deer scramble; a cow or a pig will not leave the flat. */
export const CLIMB: Record<string, number> = {
  person: 1.0, dog: 1.0,
  goat: 1.3, sheep: 0.9, cow: 0.5, steer: 0.5, pig: 0.55, rabbit: 0.9, hen: 0.5,
  deer: 1.25, elk: 1.1, moose: 0.9, antelope: 1.1, javelina: 0.9, turkey: 0.6, squirrel: 1.6, grouse: 0.6, waterfowl: 0.4,
  bear: 1.0, cougar: 1.5, wolf: 1.0, coyote: 1.0,
};
export const climbLimit = (kind: string): number => CLIMB[kind] ?? 1.0;

/** Rise over run from a to b (uphill positive). */
export function gradeBetween(ground: (x: number, z: number) => number, a: Pt, b: Pt): number {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return L < 1e-6 ? 0 : (ground(b[0], b[1]) - ground(a[0], a[1])) / L;
}

/** Can a walker of this kind take the step a -> b (checked every 0.25 u along it)? */
export function stepOk(ground: (x: number, z: number) => number, a: Pt, b: Pt, limit: number): boolean {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.25));
  let p = a;
  for (let k = 1; k <= n; k++) {
    const q: Pt = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n];
    if (Math.abs(gradeBetween(ground, p, q)) > limit) return false;
    p = q;
  }
  return true;
}

/** A route point may carry a deck height (a tunnel or a bridge deck): [x, z, y?]. */
type Wp3 = readonly [number, number, number?, ...unknown[]];

/**
 * How much of a vehicle route is drivable: the route cut at the foot of the first stretch steeper than the limit (`vehicleCan`), with the
 * distance to it. Ground legs are checked, sampled every `every` u; a deck leg (a tunnel or a bridge, [x, z, y]) is the corridor's own design and is not. `ok` when the whole route is.
 */
export function drivablePrefix<P extends Wp3>(route: readonly P[], ground: (x: number, z: number) => number, hardWinter: boolean, every = 0.5): { route: P[]; ok: boolean; dist: number } {
  if (route.length < 2) return { route: [...route], ok: true, dist: 0 };
  const out: P[] = [route[0]];
  let dist = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / every));
    const deck = a[2] !== undefined && b[2] !== undefined;
    if (deck) { dist += L; out.push(b); continue; }
    let px = a[0], pz = a[1], py = ground(a[0], a[1]);
    for (let k = 1; k <= n; k++) {
      const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, y = ground(x, z), d = Math.hypot(x - px, z - pz);
      if (d > 1e-6 && !vehicleCan((y - py) / d, hardWinter)) {
        if (Math.hypot(px - out[out.length - 1][0], pz - out[out.length - 1][1]) > 1e-6) out.push([px, pz] as unknown as P);
        return { route: out, ok: false, dist };
      }
      dist += d; px = x; pz = z; py = y;
    }
    out.push(b);
  }
  return { route: out, ok: true, dist };
}

/**
 * The way for a four-legged walker from a to b: [] when the straight line is clear, the points round a wall / cliff / building / the creek
 * otherwise (the same search as the people's, game/paths/walkRoute, without the trails), null when there is no way.
 */
export function animalRoute(from: Pt, to: Pt, hard: (x: number, z: number) => boolean, cost?: (x: number, z: number) => number, pad = 0.14, ends = 0.05): Pt[] | null {
  // (the search keeps a little off the hard ground, so the straightened legs do not clip its corners)
  const blocked = (x: number, z: number) => hard(x, z) || hard(x + pad, z) || hard(x - pad, z) || hard(x, z + pad) || hard(x, z - pad);
  const r = walkRoute(from, to, { blocked, hard, cost }, () => []);
  if (r.length === 0 && crossesHard(hard, from, to, ends)) return null;
  return r;
}
