/**
 * What a wall has to go round: the footprints of the surface buildings already staked or standing. The ring wall and the inner rings
 * (sim/fortress.ts, sim/rings.ts) bend round them (`avoidRects`, sim/ringShape.ts) instead of running through a house. Pure.
 */
import { KIT, footprint } from '../game/buildkit/kit';
import type { GameState } from './state';

/** Pieces that belong on a wall (they are laid with it, or stand in its gap), so the wall does not shy away from them. */
const ON_THE_WALL = (kind: string): boolean => kind === 'gate_garage' || kind === 'motor_court' || kind === 'rise_lookout' || kind.startsWith('watchtower');

export interface Box { x0: number; z0: number; x1: number; z1: number }

/** The footprints (porch and deck included) of every surface building on the place that a wall must not cross. */
export function buildingRects(s: Pick<GameState, 'structures'>): Box[] {
  const out: Box[] = [];
  for (const st of s.structures) {
    if (st.unplaced || ON_THE_WALL(st.kind)) continue;
    const def = KIT[st.kind];
    if (!def || def.level === 'underground') continue;
    out.push(footprint(def, st.x, st.z, st.rot));
  }
  return out;
}
