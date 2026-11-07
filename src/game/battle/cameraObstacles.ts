/**
 * What the cutscene camera must not fly into: the boxes of the buildings and the
 * walls, read off the game (pure; the director checks every shot against them).
 * World units (1 = 6 m). A box is `h` tall from the ground it stands on.
 */
import { KIT, footprint } from '../buildkit/kit';
import { PERIMETER } from '../../sim/perimeter';
import type { GameState } from '../../sim/state';

export interface Box { x0: number; z0: number; x1: number; z1: number; h: number; kind: 'building' | 'wall' | 'tree'; /** Height of the underside above the ground (a tree's crown; default 0). */ y0?: number }

/** Roof line above the pad for a building (storey 0.65 plus the roof); towers are 1 unit (6 m) and a bit. */
const buildingHeight = (id: string, floorY: number): number => id.startsWith('watchtower') ? 1.25 : floorY + 1.3;
const WALL_THICK = 0.1;
const PORCH_HEIGHT = 0.3;
const MAX_BOXES = 700;

export function obstaclesOf(g: GameState): Box[] {
  const out: Box[] = [];
  for (const st of g.structures) {
    const def = KIT[st.kind];
    if (!def || st.unplaced || def.level === 'underground') continue;
    // (fields, gardens, ponds and the like are flat: no box to hit)
    if (['field', 'garden', 'pond', 'reservoir', 'orchard', 'orchard_grove', 'terrace_stair', 'terrace_ramp', 'equipment_yard', 'vehicle_yard', 'motor_court'].includes(st.kind)) continue;
    // the body to the roof line; the porch and steps in front of the door as a low deck only (open above: posts and rails do not hide a person)
    out.push({ ...footprint(def, st.x, st.z, st.rot, false), h: buildingHeight(st.kind, def.floorY), kind: 'building' });
    if (def.frontCells > 0) out.push({ ...footprint(def, st.x, st.z, st.rot, true), h: PORCH_HEIGHT, kind: 'building' });
  }
  for (const run of g.perimeter) {
    const def = PERIMETER[run.kind];
    if (!def || def.blocks.people < 0.5 || def.walkway || def.wallTop || run.pts.length < 2 || def.height < 0.3) continue;
    for (let i = 1; i < run.pts.length && out.length < MAX_BOXES; i++) {
      const [ax, az] = run.pts[i - 1], [bx, bz] = run.pts[i];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 0.8));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        out.push({ x0: Math.min(x0, x1) - WALL_THICK, x1: Math.max(x0, x1) + WALL_THICK, z0: Math.min(z0, z1) - WALL_THICK, z1: Math.max(z0, z1) + WALL_THICK, h: def.height, kind: 'wall' });
      }
    }
  }
  return out;
}

/** The parts of a tree the camera needs (a parcel tree spec). */
export interface TreeLike { x: number; z: number; y: number; scale: number; kind: string; sx: number; sy: number }

const MAX_TREE_BOXES = 900;

/**
 * Trunks and crowns of the standing trees near the house as boxes, so the cutscene camera keeps out of them and never frames a subject
 * through one (the same sizes the free camera's crown test uses). Nearest the house first; small shrubs are skipped. Pure.
 */
export function treeBoxes(trees: readonly TreeLike[], around: { x: number; z: number }, radius: number): Box[] {
  const near = trees
    .filter(t => t.scale >= 0.4 && Math.hypot(t.x - around.x, t.z - around.z) <= radius)
    .sort((a, b) => Math.hypot(a.x - around.x, a.z - around.z) - Math.hypot(b.x - around.x, b.z - around.z))
    .slice(0, MAX_TREE_BOXES / 2);
  const out: Box[] = [];
  for (const t of near) {
    const top = 3 * t.scale * t.sy, trunk = 0.08 * t.scale, crown = (t.kind === 'conifer' ? 0.62 : 0.72) * t.scale * t.sx;
    out.push({ x0: t.x - trunk, x1: t.x + trunk, z0: t.z - trunk, z1: t.z + trunk, h: top, kind: 'tree' });
    if (crown > trunk * 1.5) out.push({ x0: t.x - crown, x1: t.x + crown, z0: t.z - crown, z1: t.z + crown, h: top, y0: 0.25 * t.scale, kind: 'tree' });
  }
  return out;
}
