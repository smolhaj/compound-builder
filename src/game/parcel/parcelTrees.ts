/**
 * parcelTrees — plant the parcel's trees from its cover: open ponderosa /
 * Douglas-fir timber on the upper bench, aspen clumps at the timber edge and
 * narrowleaf cottonwoods along the creek. Pure; a jittered grid with one
 * chance per cell, so stands thin out naturally toward their edges.
 *
 * Planted within `margin` of the parcel; the regional far trees take over
 * beyond (FarTreeRenderer starts its rings there). Other regions plant their
 * own mix (regionWorld.trees): hardwoods and hemlock in Appalachia, juniper
 * in the desert, spruce and birch in the North Woods, Douglas fir in the
 * Northwest, oak–maple woodlots in the Upper Midwest, cottonwoods on the
 * Plains creeks.
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
  /**
   * Plant a bought neighbor parcel instead of the home square: its own
   * rect and id range (ids stay stable: the home square's never change).
   */
  rect?: { x0: number; z0: number; x1: number; z1: number };
  idBase?: number;
}

/** A parcel tree: a forest spec plus a stable id (its grid cell), so marks and stumps survive replanting. */
export type ParcelTree = ForestTreeSpec & { id: number };

/** Crown radius of a woodland tree at scale 1 (u; measured on the forest geometry: oak 1.05, maple 0.88, conifer 0.72). */
export const CROWN_R: Record<string, number> = { broad: 1.0, oval: 0.85, conifer: 0.72, longleaf: 0.6, juniper: 0.6, mesquite: 0.9, paloverde: 0.9, saguaro: 0.3 };
/** A tree's crown radius as drawn (the kind's radius at scale 1, times the instance's scale and horizontal stretch). */
export const crownRadius = (t: Pick<ForestTreeSpec, 'kind' | 'scale' | 'sx'>): number => (CROWN_R[t.kind] ?? 0.9) * t.scale * Math.max(1, t.sx);
/** How far a crown may reach over a building before the tree is not planted: its centre stands at least this fraction of the radius off the footprint. */
export const CROWN_OVER = 0.65;

export function planParcelTrees(t: ParcelTerrain, o: PlantOptions): ParcelTree[] {
  const rnd = mulberry32(t.seed * 7919 + 17 + (o.idBase ?? 0));
  const out: ParcelTree[] = [];
  let cell = -1;
  const lo = -o.margin, hi = PARCEL_SIZE + o.margin;
  const [x0, x1, z0, z1] = o.rect ? [o.rect.x0, o.rect.x1, o.rect.z0, o.rect.z1] : [lo, hi, lo, hi];
  const density = o.density ?? 1;
  for (let gz = z0; gz < z1; gz += CELL) {
    for (let gx = x0; gx < x1; gx += CELL) {
      cell++;
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
      if (t.relief !== 'benches') {
        // the region's mix (the same random draws per cell, so ids and positions hold)
        const mix = t.world.trees;
        const wash = t.wash && Math.abs(z - t.wash(x)) < 5;
        let sx = 0.88 + sxR * 0.24, sy = 0.9 + syR * 0.25;
        if (riparian || wash) {
          // a dry wash takes its own mix (desert); a real creek keeps the riparian kind
          const rm = wash && !riparian && mix.wash ? mix.wash : mix.riparian;
          kind = rm.kind; scale = rm.scale[0] + sRoll * (rm.scale[1] - rm.scale[0]);
        }
        else {
          const tot = mix.timber.reduce((a, m) => a + m.w, 0);
          let acc = 0, pickM = mix.timber[mix.timber.length - 1];
          for (const m of mix.timber) { acc += m.w / tot; if (kindRoll < acc) { pickM = m; break; } }
          kind = pickM.kind;
          scale = pickM.scale[0] + sRoll * (pickM.scale[1] - pickM.scale[0]);
          if (pickM.sx) sx = pickM.sx[0] + sxR * (pickM.sx[1] - pickM.sx[0]);
          if (pickM.sy) sy = pickM.sy[0] + syR * (pickM.sy[1] - pickM.sy[0]);
        }
        if (kind === 'oval' && !(riparian || wash)) sy = Math.max(sy, 1.1 + syR * 0.3);
        out.push({
          ...(kind === 'conifer' && s.forest > 0.7 && scale > 0.6 ? { stand: true } : {}),
          id: (o.idBase ?? 0) + cell, x, y: s.h, z, kind, scale, sx, sy, rotY, cr,
        });
        continue;
      }
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
        // conifers in thick timber are stand-grown: lower limbs shed (the crown starts a third of the way up)
        ...(kind === 'conifer' && s.forest > 0.7 ? { stand: true } : {}),
        id: (o.idBase ?? 0) + cell, x, y: s.h, z, kind, scale,
        sx: 0.88 + sxR * 0.24, sy: kind === 'oval' ? 1.1 + syR * 0.3 : 0.9 + syR * 0.25,
        rotY, cr,
      });
    }
  }
  return out;
}

/**
 * The understory (landscape audit: real Douglas-fir / ponderosa stands carry
 * 100–250 stems an acre, most of them young; aspen grows in clones of many
 * stems at the timber's edge). On a half-cell offset grid with its own random
 * stream and id range (500,000 + cell), so the canopy trees and their ids
 * are untouched: young firs under the canopy in thick timber, aspen suckers
 * round the edge.
 */
export function planUnderstory(t: ParcelTerrain, o: PlantOptions): ParcelTree[] {
  const rnd = mulberry32(t.seed * 4513 + 101 + (o.idBase ?? 0));
  const out: ParcelTree[] = [];
  let cell = -1;
  const lo = -o.margin, hi = PARCEL_SIZE + o.margin;
  const [x0, x1, z0, z1] = o.rect ? [o.rect.x0, o.rect.x1, o.rect.z0, o.rect.z1] : [lo, hi, lo, hi];
  const density = o.density ?? 1;
  for (let gz = z0 + CELL / 2; gz < z1; gz += CELL) {
    for (let gx = x0 + CELL / 2; gx < x1; gx += CELL) {
      cell++;
      const x = gx + (rnd() - 0.5) * CELL * 0.8, z = gz + (rnd() - 0.5) * CELL * 0.8;
      const roll = rnd(), sRoll = rnd();
      const cr: [number, number, number, number] = [rnd(), rnd(), rnd(), rnd()];
      const rotY = rnd() * Math.PI * 2, sxR = rnd(), syR = rnd();
      const s = t.sample(x, z);
      const thick = s.forest > 0.6, edge = s.forest > 0.3 && s.forest <= 0.6;
      if (!thick && !edge) continue;
      if (roll > (thick ? 0.6 : 0.4) * density) continue;
      if (o.blocked?.(x, z)) continue;
      const dz = Math.abs(z - t.creek.zAt(x));
      if (dz < t.creek.halfWidth + 1.2 || s.h < t.creek.waterY(x) + 0.08) continue;
      const under = t.world.trees.under;
      const kind: ForestTreeSpec['kind'] | null = t.relief === 'benches' ? (thick ? 'conifer' : 'oval') : thick ? under.thick : under.edge;
      if (!kind) continue;
      const scale = kind === 'conifer' ? 0.32 + sRoll * 0.3 : kind === 'juniper' ? 0.5 + sRoll * 0.3 : 0.4 + sRoll * 0.25;
      out.push({ id: (o.idBase ?? 0) + 500_000 + cell, x, y: s.h, z, kind, scale, sx: 0.85 + sxR * 0.25, sy: kind === 'oval' ? 1.15 + syR * 0.3 : 0.95 + syR * 0.2, rotY, cr });
    }
  }
  return out;
}
