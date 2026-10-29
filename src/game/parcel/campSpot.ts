/**
 * Where the camp goes on a parcel: open, level, dry ground a short walk from
 * the creek (water), or the lot archetype's best flat. Shared by the world and
 * by the road planner (sim/roadState.ts), so the road is planned to the very
 * yard the world builds. Pure.
 */
import type { ParcelTerrain } from './parcelTerrain';
import { lotStatsOf } from '../../sim/lotListing';

export interface CampSpot { x: number; z: number; rot: number }

export function pickCamp(p: ParcelTerrain, h: { x0: number; z0: number; x1: number; z1: number }): CampSpot {
  // inside the home forty part of the place (the 80's west forty is the back forty)
  let x0 = Math.max(h.x0, 0) + 6, x1 = h.x1 - 6, z0 = h.z0 + 6, z1 = h.z1 - 6;
  let cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (p.lot) {
    // a lot archetype: the camp goes on its best flat (the knoll's crown, the bench, the island), not the middle of the rect
    const st = lotStatsOf(p.lot);
    [cx, cz] = st.pad;
    x0 = Math.max(h.x0, 0) + 2; x1 = h.x1 - 2; z0 = h.z0 + 2; z1 = h.z1 - 2;
  }
  let best: CampSpot | null = null, bestScore = Infinity;
  for (let pass = 0; pass < 2 && !best; pass++) {
    for (let x = x0; x <= x1; x += 1) {
      for (let z = z0; z <= z1; z += 1) {
        const dc = Math.abs(z - p.creek.zAt(x));
        // by the creek when it runs through (water), else anywhere open; the second pass takes whatever is level
        if (p.creekHome && !p.lot && pass === 0 && (dc < 5 || dc > 14)) continue;
        if (dc < 5 && p.hasStream) continue;
        if (p.lot && p.isCreek(x, z)) continue;
        const s = p.natural(x, z);
        if (s.forest > (pass === 0 ? 0.05 : 0.3)) continue;
        const slope = Math.hypot(p.height(x + 1, z) - p.height(x - 1, z), p.height(x, z + 1) - p.height(x, z - 1)) / 2;
        if (slope > (pass === 0 ? 0.08 : 0.16)) continue;
        const score = Math.hypot(x - cx, z - cz) + slope * (p.lot ? 25 : 40);
        if (score < bestScore) {
          bestScore = score;
          // tent door toward the creek (or the road)
          best = { x, z, rot: p.creekHome ? Math.atan2(0, p.creek.zAt(x) - z) : Math.PI / 2 };
        }
      }
    }
  }
  return best ?? { x: cx, z: cz, rot: 0 };
}
