/**
 * Line of fire (pure; shared by the battle sim and the cutscene). The sim (sim/battle.ts) asks it whether a shooter can hit a target at all:
 * a ground-level shot never crosses a solid wall or a building, only one from or to a height that clears its top does. The picture asks the
 * same question of the same boxes, so what is drawn agrees with what the sim decided. Originally the cutscene's tracers: a round
 * only crosses a solid wall or a building when the line of the shot clears its top (shooter and target both up high: a tower, a wall
 * walk, a roof) or the shooter stands against it (a loophole, a window, a rest on the wall). Otherwise the streak stops at the face
 * and the renderer throws dust and a spark there.
 *
 * World units: 1 = 6 m, a person is 0.28 tall (SCALE v2). A box is `h` tall from the ground under it.
 */
import { KIT, footprint } from '../game/buildkit/kit';
import { PERIMETER, runFinished, type PerimeterKind } from './perimeter';
import { isFinished } from './construction';
import type { GameState } from './state';

/** A box is `h` tall from the ground under it. Trees and brush are camera obstacles only: they never stop a round. */
export interface Box { x0: number; z0: number; x1: number; z1: number; h: number; kind: 'building' | 'wall' | 'tree' | 'brush'; /** Height of the underside above the ground (a tree's crown; default 0). */ y0?: number; /** A wall some rounds go through (sharpened logs): a shot across it is a partial hit, not blocked. */ leaky?: boolean }

export interface P3 { x: number; y: number; z: number }
type Ground = (x: number, z: number) => number;

/** Muzzle and chest heights above the feet (a 0.28 person: shoulder 0.21, chest 0.16; kneeling 0.13 / 0.10). */
export const MUZZLE = { stand: 0.21, kneel: 0.13 } as const;
export const TORSO = { stand: 0.16, kneel: 0.1 } as const;
/** Top of the head. A target whose chest is covered but whose head is clear is in partial cover. */
export const HEAD = { stand: 0.25, kneel: 0.17 } as const;

/** A box this close (plan distance) to either end of the shot belongs to the shooter or the target: a loophole, a window, a wall they stand against. */
export const OWN_BOX = 0.3;
/**
 * A defender within this far of a solid wall stands AT it (the sim's wall posts sit on the line, up to a few units off the drawn run: a rifle on the
 * top, a loophole, a firing step): the wall beside them is theirs. A defender further back, or a raider outside, is not.
 */
export const WALL_POST = 4.5;

/** Walls and berms that stop a round. Chain-link, wire, pickets and bars, split-rail and a thorn hedge do not (they hide a man, they do not stop a bullet). */
export const FIRE_SOLID: ReadonlySet<PerimeterKind> = new Set<PerimeterKind>(['log_palisade', 'container_wall', 'container_stack', 'earth_berm', 'steel_wall', 'electric_steel', 'concrete_wall', 'stone_wall']);

/**
 * Solid walls a rifle round goes through some of the time (balance pass "wall quality"): sharpened logs stop a pistol round and slow a rifle's, they do not
 * stop it, so a shot at someone behind one is a partial hit (PARTIAL_HIT), not blocked. Steel plate, stone, concrete, containers and earth stop it.
 */
export const LEAKY_WALLS: ReadonlySet<PerimeterKind> = new Set<PerimeterKind>(['log_palisade']);

const WALL_THICK = 0.1;

/**
 * Walls that come with a firing step (a palisade's catwalk, a stone wall's banquette, a bench or stack of crates behind a container wall): a
 * defender standing behind one fires over the top. A per-wall-type property; steel and concrete are plain faces (a wall walk or a tower does it there).
 */
export const FIRING_STEP: ReadonlySet<PerimeterKind> = new Set<PerimeterKind>(['log_palisade', 'stone_wall', 'container_wall']);

/** How high a defender stands on the step so the muzzle just clears the top of a wall of height `h` (0 where the wall has no step). */
export function stepHeight(kind: PerimeterKind | string, h: number): number {
  return FIRING_STEP.has(kind as PerimeterKind) ? Math.max(0, h - MUZZLE.stand + 0.05) : 0;
}

/** Roof line above the pad for a building (a storey 0.65 plus the roof); a watchtower is a bit over 1 unit (6 m). Same as the camera's boxes. */
const buildingHeight = (id: string, floorY: number): number => id.startsWith('watchtower') ? 1.25 : floorY + 1.3;
const PORCH_HEIGHT = 0.3;
const NOT_SOLID = new Set(['field', 'garden', 'pond', 'reservoir', 'orchard', 'orchard_grove', 'terrace_stair', 'terrace_ramp', 'equipment_yard', 'vehicle_yard', 'motor_court']);

/**
 * Things a person kneels behind (a crate, a barrel, a well curb, a woodpile, a truck or a tractor), by the structure's kind id: about hip high
 * (0.1 to 0.3), so they stop a round for a kneeling shooter but a standing one fires over them. Null for anything else (a building: roof high).
 */
export function lowCoverHeight(id: string): number | null {
  if (/vehicle|truck|car_|pickup|tractor|trailer|cart/.test(id)) return 0.3;
  if (/crate|barrel|well|woodpile|wood_stack|log_pile|stack|trough|planter|generator|mower|hay|bale|sandbag/.test(id)) return /hay|bale|sandbag|well|trough|planter/.test(id) ? 0.2 : 0.26;
  return null;
}

/** What stops a round: the buildings (to the roof line) and the solid runs of wall, off the game. */
export function fireBoxesOf(g: Pick<GameState, 'structures' | 'perimeter'>): Box[] {
  const out: Box[] = [];
  for (const st of g.structures) {
    const def = KIT[st.kind];
    if (!def || st.unplaced || def.level === 'underground' || NOT_SOLID.has(st.kind) || !isFinished(st)) continue;
    out.push({ ...footprint(def, st.x, st.z, st.rot, false), h: lowCoverHeight(st.kind) ?? buildingHeight(st.kind, def.floorY), kind: 'building' });
    if (def.frontCells > 0) out.push({ ...footprint(def, st.x, st.z, st.rot, true), h: PORCH_HEIGHT, kind: 'building' });
  }
  for (const run of g.perimeter) {
    const def = PERIMETER[run.kind];
    if (!def || !FIRE_SOLID.has(run.kind) || run.pts.length < 2 || !runFinished(run)) continue;
    for (let i = 1; i < run.pts.length && out.length < 1400; i++) {
      const [ax, az] = run.pts[i - 1], [bx, bz] = run.pts[i];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.8));
      for (let k = 0; k < n; k++) {
        const x0 = ax + (bx - ax) * k / n, z0 = az + (bz - az) * k / n, x1 = ax + (bx - ax) * (k + 1) / n, z1 = az + (bz - az) * (k + 1) / n;
        out.push({ x0: Math.min(x0, x1) - WALL_THICK, x1: Math.max(x0, x1) + WALL_THICK, z0: Math.min(z0, z1) - WALL_THICK, z1: Math.max(z0, z1) + WALL_THICK, h: def.height, kind: 'wall', ...(LEAKY_WALLS.has(run.kind) ? { leaky: true } : {}) });
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

// ── the sim's questions: who can shoot whom ──

/** The boxes in a coarse grid, so a shot looks only at what lies along it (the battle sim asks thousands of times a fight). */
export class FireMap {
  private readonly cells = new Map<number, Box[]>();
  private readonly cell: number;
  readonly boxes: readonly Box[];
  constructor(boxes: readonly Box[], cell = 3) {
    this.cell = cell; this.boxes = boxes;
    for (const b of boxes) {
      if (b.kind !== 'wall' && b.kind !== 'building') continue;
      const i0 = Math.floor(b.x0 / cell), i1 = Math.floor(b.x1 / cell), j0 = Math.floor(b.z0 / cell), j1 = Math.floor(b.z1 / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); const a = this.cells.get(k); if (a) a.push(b); else this.cells.set(k, [b]); }
    }
  }
  /** The solid boxes in the cells the segment passes through (each once). */
  along(a: { x: number; z: number }, b: { x: number; z: number }): Box[] {
    if (this.cells.size === 0) return [];
    const len = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    const seen = new Set<Box>(), out: Box[] = [];
    let last = NaN;
    for (let k = 0; k <= steps; k++) {
      const x = a.x + (b.x - a.x) * k / steps, z = a.z + (b.z - a.z) * k / steps;
      const ci = Math.floor(x / this.cell), cj = Math.floor(z / this.cell);
      const kk = key(ci, cj);
      if (kk === last) continue;
      last = kk;
      // the cell and its neighbours (a thin box on a cell border)
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const c = this.cells.get(key(ci + di, cj + dj));
        if (c) for (const bx of c) if (!seen.has(bx)) { seen.add(bx); out.push(bx); }
      }
    }
    return out;
  }
}
const key = (i: number, j: number): number => (i + 4096) * 8192 + (j + 4096);

/** Where someone stands for the purposes of a shot: feet on the ground at `y` (a tower's cab, a wall walk, the top of a wall a climber is on), kneeling or not. */
export interface Stance { x: number; z: number; y: number; kneel?: boolean }
/** clear: the round gets there. partial: the chest is covered but the head is not, so most rounds miss. blocked: it stops in a wall or a building. */
export type Sight = 'clear' | 'partial' | 'blocked';

/** Hit chance of a shot at someone in partial cover (only the head shows). */
export const PARTIAL_HIT = 0.4;

const muzzleOf = (a: Stance): P3 => ({ x: a.x, z: a.z, y: a.y + (a.kneel ? MUZZLE.kneel : MUZZLE.stand) });
const flatGround: Ground = () => 0;

/**
 * Can `from` hit `to`? Ground-level shots are stopped by a solid wall or a building in between; a shot from or to a height that clears the top
 * is not (a tower, a wall walk, an upper floor, a climber on top of a wall); a wall the shooter or the target stands in is theirs and never
 * blocks. `ports`: the shooter fires through a loophole in the wall he stands against (no hardening item gives one yet).
 */
export function fireLine(map: FireMap, from: Stance, to: Stance, opts: { ports?: boolean; ground?: Ground } = {}): Sight {
  const ground = opts.ground ?? flatGround;
  const near = map.along(from, to);
  if (near.length === 0) return 'clear';
  const own = { from: opts.ports ? OWN_BOX : 0, to: OWN_BOX };
  const m = muzzleOf(from);
  const chest: P3 = { x: to.x, z: to.z, y: to.y + (to.kneel ? TORSO.kneel : TORSO.stand) };
  const first = lineOfFire(m, chest, near, ground, own);
  if (!first.blocked) return 'clear';
  if (first.by?.leaky) return 'partial';   // through the logs: only some rounds find a man behind them
  const head: P3 = { x: to.x, z: to.z, y: to.y + (to.kneel ? HEAD.kneel : HEAD.stand) };
  if (!lineOfFire(m, head, near, ground, own).blocked) return 'partial';
  return 'blocked';
}
