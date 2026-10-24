/**
 * The escape tunnel's long section (pure, tested): along its route the
 * floor starts at the bunker's floor and follows the land at a gentle grade
 * (≤ 8 %) so there is always MIN_COVER of earth over the vault; it can run
 * on under neighboring land (user: "half a mile or longer"; an exit far
 * from any fighting). Sampled every STEP world units.
 */
import { footprint, KIT, type Placed } from './kit';
import { levelOf, MIN_COVER } from './underground';

/** Inside of the vault (photo reference: a whitewashed, board-formed arch you walk upright in). */
export const VAULT_W = 2.2 / 6, VAULT_WALL = 1.7 / 6, VAULT_CROWN = 2.6 / 6;
/** Top of the vault's concrete above its floor. */
export const VAULT_TOP = VAULT_CROWN + 0.05;
/** Steepest floor grade, sample spacing (world units). */
export const TUNNEL_GRADE = 0.08, STEP = 0.25;
/** Deepest exit shaft a ladder may climb (≈ 9 m). */
export const MAX_EXIT_DEPTH = 1.5;

type Pt = [number, number];
export interface PathSample { x: number; z: number; s: number; floor: number }
export type PathProblem = 'start_too_shallow' | 'exit_too_deep';

/** Samples along the route (every STEP, plus each bend), with the floor level at each. */
export function tunnelPath(pts: readonly Pt[], datum: number, ground: (x: number, z: number) => number): { samples: PathSample[]; problem: PathProblem | null } {
  const out: PathSample[] = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / STEP));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) out.push({ x: ax + (bx - ax) * k / n, z: az + (bz - az) * k / n, s: acc + l * k / n, floor: 0 });
    acc += l;
  }
  // the most the floor may be at each point to keep cover; level at the bunker's floor where it can be
  const cap = out.map(p => ground(p.x, p.z) - VAULT_TOP - MIN_COVER);
  const f = out.map((_, i) => Math.min(datum, cap[i]));
  // ease down ahead of a dip (backward), then back up after it (forward), never steeper than the grade
  for (let i = f.length - 2; i >= 0; i--) f[i] = Math.min(f[i], f[i + 1] + TUNNEL_GRADE * (out[i + 1].s - out[i].s));
  for (let i = 1; i < f.length; i++) f[i] = Math.min(f[i], f[i - 1] + TUNNEL_GRADE * (out[i].s - out[i - 1].s));
  out.forEach((p, i) => { p.floor = f[i]; });
  let problem: PathProblem | null = null;
  // the first stretch leaves through the room's door: it must be at the room's floor for a few meters
  if (out.slice(0, 3).some(p => p.floor < datum - 0.01)) problem = 'start_too_shallow';
  const e = out[out.length - 1];
  if (!problem && ground(e.x, e.z) - e.floor > MAX_EXIT_DEPTH) problem = 'exit_too_deep';
  return { samples: out, problem };
}

/** Floor level at distance s along a sampled path (linear between samples). */
export function floorAt(samples: readonly PathSample[], s: number): number {
  if (s <= 0) return samples[0].floor;
  for (let i = 1; i < samples.length; i++) {
    if (s <= samples[i].s) { const a = samples[i - 1], b = samples[i], t = (s - a.s) / Math.max(1e-6, b.s - a.s); return a.floor + (b.floor - a.floor) * t; }
  }
  return samples[samples.length - 1].floor;
}

export type TunnelProblem = 'too_short' | 'too_close' | 'water' | 'through_room' | PathProblem;

/** An escape tunnel comes up well away from the compound (user): at least this long, its exit this far from any building. */
export const TUNNEL_MIN_LEN = 10, TUNNEL_EXIT_CLEAR = 8;

/**
 * A route from a room wall (pts[0]) out to an exit: long enough, its exit
 * well clear of every building, not under the creek, not through another
 * room or a deep surface piece, and a floor that can keep its cover at a
 * walkable grade (tunnelPath). It may run on under neighboring land.
 */
export function tunnelProblem(pts: readonly Pt[], datum: number, height: (x: number, z: number) => number, water: (x: number, z: number) => boolean, placed: readonly Placed[]): TunnelProblem | null {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (pts.length < 2 || L < TUNNEL_MIN_LEN) return 'too_short';
  const [ex, ez] = pts[pts.length - 1];
  if (placed.some(p => Math.hypot(p.x - ex, p.z - ez) < TUNNEL_EXIT_CLEAR)) return 'too_close';
  const blockers = placed.filter(p => KIT[p.kind] && levelOf(KIT[p.kind]) !== 'surface').map(p => footprint(KIT[p.kind], p.x, p.z, p.rot, false));
  const path = tunnelPath(pts, datum, height);
  for (const q of path.samples) {
    if (q.s < 0.12) continue;          // leaving the room's wall
    if (water(q.x, q.z)) return 'water';
    if (blockers.some(r => q.x > r.x0 - 0.08 && q.x < r.x1 + 0.08 && q.z > r.z0 - 0.08 && q.z < r.z1 + 0.08)) return 'through_room';
  }
  return path.problem;
}

export const TUNNEL_PROBLEM_TEXT: Record<TunnelProblem | 'no_room' | 'no_wall', string> = {
  no_room: 'Start the tunnel in a bunker room',
  no_wall: 'Every wall of that room already has a doorway',
  too_short: 'Run it at least 60 m: it should come up far from any fighting',
  too_close: 'Bring the exit up at least 50 m from every building',
  start_too_shallow: 'The ground right outside the room is too low to tunnel under',
  exit_too_deep: 'The exit would be too deep to climb out',
  water: 'Under the creek',
  through_room: 'Through another room, a well or the septic field',
};
