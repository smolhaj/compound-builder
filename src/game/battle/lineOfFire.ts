/**
 * Line of fire for the cutscene's tracers (pure). The battle sim decides who hits whom; this decides what the PICTURE shows: a round
 * only crosses a solid wall or a building when the line of the shot clears its top (shooter and target both up high: a tower, a wall
 * walk, a roof) or the shooter stands against it (a loophole, a window, a rest on the wall). Otherwise the streak stops at the face
 * and the renderer throws dust and a spark there.
 *
 * World units: 1 = 6 m, a person is 0.28 tall (SCALE v2). A box is `h` tall from the ground under it.
 */
import { PERIMETER, type PerimeterKind } from '../../sim/perimeter';
import type { GameState } from '../../sim/state';
import { obstaclesOf, type Box } from './cameraObstacles';

export interface P3 { x: number; y: number; z: number }
type Ground = (x: number, z: number) => number;

/** Muzzle and chest heights above the feet (a 0.28 person: shoulder 0.21, chest 0.16; kneeling 0.13 / 0.10). */
export const MUZZLE = { stand: 0.21, kneel: 0.13 } as const;
export const TORSO = { stand: 0.16, kneel: 0.1 } as const;

/** A box this close (plan distance) to either end of the shot belongs to the shooter or the target: a loophole, a window, a wall they stand against. */
export const OWN_BOX = 0.3;
/**
 * A defender within this far of a solid wall stands AT it (the sim's wall posts sit on the line, up to a few units off the drawn run: a rifle on the
 * top, a loophole, a firing step): the wall beside them is theirs. A defender further back, or a raider outside, is not.
 */
export const WALL_POST = 4.5;

/** Walls and berms that stop a round. Chain-link, wire, pickets and bars, split-rail and a thorn hedge do not (they hide a man, they do not stop a bullet). */
export const FIRE_SOLID: ReadonlySet<PerimeterKind> = new Set<PerimeterKind>(['log_palisade', 'container_wall', 'container_stack', 'earth_berm', 'steel_wall', 'electric_steel', 'concrete_wall', 'stone_wall']);

const WALL_THICK = 0.1;

/**
 * Things a person kneels behind (a crate, a barrel, a well curb, a woodpile, a tank, a truck or a tractor), by the structure's kind id: low, about a
 * hip high (0.1 to 0.3), so they stop a round for a kneeling shooter but a standing one fires over them. Null for anything else (a building: roof high).
 */
export function lowCoverHeight(id: string): number | null {
  if (/vehicle|truck|car_|pickup|tractor|trailer|cart/.test(id)) return 0.3;
  if (/crate|barrel|well|woodpile|wood_stack|log_pile|stack|trough|planter|generator|mower|hay|bale|sandbag/.test(id)) return /hay|bale|sandbag|well|trough|planter/.test(id) ? 0.2 : 0.26;
  return null;
}

/** What stops a round: the buildings (to the roof line) and the solid runs of wall, off the game. */
export function fireBoxesOf(g: GameState): Box[] {
  const out: Box[] = obstaclesOf(g).filter(b => b.kind === 'building').map(b => (b.id && lowCoverHeight(b.id) ? { ...b, h: lowCoverHeight(b.id)! } : b));
  for (const run of g.perimeter) {
    const def = PERIMETER[run.kind];
    if (!def || !FIRE_SOLID.has(run.kind) || run.pts.length < 2) continue;
    for (let i = 1; i < run.pts.length && out.length < 900; i++) {
      const [ax, az] = run.pts[i - 1], [bx, bz] = run.pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.8));
      for (let k = 0; k < n; k++) {
        const x0 = ax + (bx - ax) * k / n, z0 = az + (bz - az) * k / n, x1 = ax + (bx - ax) * (k + 1) / n, z1 = az + (bz - az) * (k + 1) / n;
        out.push({ x0: Math.min(x0, x1) - WALL_THICK, x1: Math.max(x0, x1) + WALL_THICK, z0: Math.min(z0, z1) - WALL_THICK, z1: Math.max(z0, z1) + WALL_THICK, h: def.height, kind: 'wall' });
      }
    }
  }
  return out;
}

export interface FireResult {
  blocked: boolean;
  /** Where the round stops, just short of the face it hit (blocked only). */
  at?: P3;
  by?: Box;
}

const flatDist = (x: number, z: number, b: Box): number => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));

/** Where a segment (plan) is inside a box: the parameters it enters and leaves at, or null. */
function slab(a: P3, b: P3, bx: Box): [number, number] | null {
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[a.x, b.x - a.x, bx.x0, bx.x1], [a.z, b.z - a.z, bx.z0, bx.z1]] as const) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return null; continue; }
    let u0 = (lo - p) / d, u1 = (hi - p) / d;
    if (u0 > u1) [u0, u1] = [u1, u0];
    t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

/**
 * Does the round from `from` to `to` (world positions of the muzzle and the aim point) cross a solid box below its top? The first box it
 * strikes wins. Boxes the shooter or the target stand against are theirs (OWN_BOX) and never block.
 */
export function lineOfFire(from: P3, to: P3, boxes: readonly Box[], ground: Ground, own: number | { from: number; to: number } = OWN_BOX): FireResult {
  const ownFrom = typeof own === 'number' ? own : own.from, ownTo = typeof own === 'number' ? own : own.to;
  let best: { t: number; box: Box } | null = null;
  const x0 = Math.min(from.x, to.x) - 0.3, x1 = Math.max(from.x, to.x) + 0.3, z0 = Math.min(from.z, to.z) - 0.3, z1 = Math.max(from.z, to.z) + 0.3;
  for (const b of boxes) {
    if (b.kind !== 'wall' && b.kind !== 'building') continue;
    if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
    if ((flatDist(from.x, from.z, b) <= ownFrom && (b.kind === 'wall' || ownFrom <= OWN_BOX)) || flatDist(to.x, to.z, b) <= ownTo) continue;
    const s = slab(from, to, b);
    if (!s) continue;
    const yAt = (t: number) => from.y + (to.y - from.y) * t;
    const gAt = (t: number) => ground(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t);
    const top = (t: number) => gAt(t) + b.h;
    // below the top where it goes in, or where it comes out: it meets the face or the cap
    if (yAt(s[0]) < top(s[0]) || yAt(s[1]) < top(s[1])) { if (!best || s[0] < best.t) best = { t: s[0], box: b }; }
  }
  if (!best) return { blocked: false };
  const len = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) || 1;
  const t = Math.max(0, best.t - 0.02 / len);
  return { blocked: true, by: best.box, at: { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t } };
}

/** The outward unit normal (plan) of the face of `b` nearest to `p` (where a spatter or a spark lands on a wall). */
export function faceNormal(b: Box, p: { x: number; z: number }): { x: number; z: number } {
  const d = [[Math.abs(p.x - b.x0), -1, 0], [Math.abs(p.x - b.x1), 1, 0], [Math.abs(p.z - b.z0), 0, -1], [Math.abs(p.z - b.z1), 0, 1]].sort((a, c) => a[0] - c[0])[0];
  return { x: d[1], z: d[2] };
}
