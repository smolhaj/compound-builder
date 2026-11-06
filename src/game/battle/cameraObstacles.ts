/**
 * What the cutscene camera must not fly into: the boxes of the buildings and the
 * walls, read off the game (pure; the director checks every shot against them).
 * World units (1 = 6 m). A box is `h` tall from the ground it stands on.
 */
import { KIT, footprint } from '../buildkit/kit';
import { PERIMETER } from '../../sim/perimeter';
import type { GameState } from '../../sim/state';

export interface Box { x0: number; z0: number; x1: number; z1: number; h: number; kind: 'building' | 'wall' }

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
