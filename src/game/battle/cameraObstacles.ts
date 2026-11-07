/**
 * What the cutscene camera must not fly into: the boxes of the buildings and the
 * walls, read off the game (pure; the director checks every shot against them).
 * World units (1 = 6 m). A box is `h` tall from the ground it stands on.
 */
import { KIT, footprint } from '../buildkit/kit';
import { PERIMETER } from '../../sim/perimeter';
import type { GameState } from '../../sim/state';

export interface Box { x0: number; z0: number; x1: number; z1: number; h: number; kind: 'building' | 'wall' | 'tree' | 'brush'; /** Height of the underside above the ground (a tree's crown; default 0). */ y0?: number }

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

/** A clump of ground cover (sagebrush, willow, a rock): crown radius `r`, height `h` (units). */
export interface CoverLike { x: number; z: number; r: number; h?: number }

/**
 * Sagebrush, willow clumps and rocks near the house as low boxes. A person standing behind a bush is half hidden, so the framing check
 * (director.blockedBetween) treats cover between the eye and a subject, or right in front of it, as blocking. Nearest the house first. Pure.
 */
export function coverBoxes(cover: readonly CoverLike[], around: { x: number; z: number }, radius: number): Box[] {
  return cover
    .filter(c => Math.hypot(c.x - around.x, c.z - around.z) <= radius)
    .sort((a, b) => Math.hypot(a.x - around.x, a.z - around.z) - Math.hypot(b.x - around.x, b.z - around.z))
    .slice(0, 1200)
    .map(c => ({ x0: c.x - c.r, x1: c.x + c.r, z0: c.z - c.r, z1: c.z + c.r, h: c.h ?? 0.25, kind: 'brush' as const }));
}

/**
 * A function that moves a point out of any bush, rock or willow clump it stands in (to just outside the crown), so a raider is never
 * put down half hidden in cover. Indexed once per list (4-unit cells); pure.
 */
export function coverPusher(cover: readonly CoverLike[]): (x: number, z: number) => { x: number; z: number } {
  const cells = new Map<number, CoverLike[]>();
  for (const c of cover) { const k = Math.floor(c.x / 4) * 100003 + Math.floor(c.z / 4); (cells.get(k) ?? cells.set(k, []).get(k)!).push(c); }
  return (x, z) => {
    let px = x, pz = z;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) for (const c of cells.get((Math.floor(px / 4) + gx) * 100003 + Math.floor(pz / 4) + gz) ?? []) {
        const dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz), lim = c.r + 0.35;
        if (d < lim) { if (d > 1e-3) { px = c.x + dx * lim / d; pz = c.z + dz * lim / d; } else px = c.x + lim; moved = true; }
      }
      if (!moved) break;
    }
    return { x: px, z: pz };
  };
}
