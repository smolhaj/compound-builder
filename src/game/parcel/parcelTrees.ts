/**
 * parcelTrees — plant the parcel's trees from its cover: open ponderosa /
 * Douglas-fir timber on the upper bench, aspen clumps at the timber edge and
 * narrowleaf cottonwoods along the creek. Pure; a jittered grid with one
 * chance per cell, so stands thin out naturally toward their edges.
 *
 * Planted within `margin` of the parcel; the regional far trees take over
 * beyond (FarTreeRenderer starts its rings there).
 */
import type { ForestTreeSpec } from '../../engine/world/trees/ForestRenderer';
import { PARCEL_SIZE, type ParcelTerrain } from './parcelTerrain';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Grid cell (world units ≈ 10 m): ponderosa parkland is open, not a closed wall. */
const CELL = 1.7;

export interface PlantOptions {
  margin: number;
  /** Density multiplier (quality tiers). */
  density?: number;
  /** Extra exclusions (structures, the cabin site). */
  blocked?: (x: number, z: number) => boolean;
}

export function planParcelTrees(t: ParcelTerrain, o: PlantOptions): ForestTreeSpec[] {
  const rnd = mulberry32(t.seed * 7919 + 17);
  const out: ForestTreeSpec[] = [];
  const lo = -o.margin, hi = PARCEL_SIZE + o.margin;
  const density = o.density ?? 1;
  for (let gz = lo; gz < hi; gz += CELL) {
    for (let gx = lo; gx < hi; gx += CELL) {
      const x = gx + rnd() * CELL, z = gz + rnd() * CELL;
      const roll = rnd(), kindRoll = rnd(), sRoll = rnd();
      const cr: [number, number, number, number] = [rnd(), rnd(), rnd(), rnd()];
      const rotY = rnd() * Math.PI * 2, sxR = rnd(), syR = rnd();
      const s = t.sample(x, z);
      if (s.forest < 0.25 || roll > Math.pow(s.forest, 1.3) * density) continue;
      if (o.blocked?.(x, z)) continue;
      // keep trunks out of the creek and off its cut bank
      const dz = Math.abs(z - t.creek.zAt(x));
      if (dz < t.creek.halfWidth + 0.45) continue;
      const wy = t.creek.waterY(x);
      if (s.h < wy + 0.08) continue;
      const riparian = dz < 6.5 && s.forest < 0.85;
      let kind: ForestTreeSpec['kind'];
      let scale: number;
      if (riparian) {
        kind = 'broad';                           // narrowleaf cottonwood / box elder
        scale = 0.8 + sRoll * 0.4;
      } else if (s.forest < 0.6 && kindRoll < 0.35) {
        kind = 'oval';                            // aspen clump at the timber edge
        scale = 0.6 + sRoll * 0.3;
      } else {
        kind = 'conifer';                         // ponderosa / Douglas fir
        scale = 0.75 + sRoll * 0.55;
      }
      out.push({
        x, y: s.h, z, kind, scale,
        sx: 0.88 + sxR * 0.24, sy: kind === 'oval' ? 1.1 + syR * 0.3 : 0.9 + syR * 0.25,
        rotY, cr,
      });
    }
  }
  return out;
}
