/**
 * Shade at noon on the winter solstice (GDS §6 sun overlay; docs/GDS_AUDIT.md Q4). The sun is lowest and due south, so a shadow falls
 * straight north and is as long as it ever gets: what is shaded then is shaded all winter, which is what decides a solar array's
 * worst month and the one garden bed that never thaws. Pure (tested). The world is x east, z south, 1 unit = 6 m.
 *
 *   - hills: the ground itself (a ridge south of a point shades it when it rises above the sun's line);
 *   - buildings and walls: a box of its height;
 *   - trees: a crown box. A conifer holds its needles, a broadleaf is bare (it still casts a thin shadow: `BARE_LEAF`).
 */
import type { RegionId } from './regions';

/** Degrees north, near the middle of each region's homestead country. */
export const REGION_LAT: Record<RegionId, number> = {
  mountain_west: 44, appalachia: 37, desert: 34, north_woods: 46.5, plains: 40, pnw: 46, upper_midwest: 44.5,
  new_england: 43.5, ozarks: 37, hill_country: 30.3, rust_belt: 41,
};
export const SOLSTICE_TILT = 23.44;
/** How much of a bare broadleaf crown's light is cut at midwinter (twigs and trunk). */
export const BARE_LEAF = 0.3;
/** At or above this fraction of a patch in shade at noon, call it "shaded" in words. */
export const SHADED = 0.5;

/** Sun height above the horizon at noon on the winter solstice, degrees. */
export function winterNoonElevation(latDeg: number): number { return Math.max(1, 90 - latDeg - SOLSTICE_TILT); }

export interface ShadeBox {
  /** Footprint, world units. */
  x0: number; x1: number; z0: number; z1: number;
  /** Top, in world height (ground at the foot + its height). */
  top: number;
  /** 1 = solid; a bare tree is `BARE_LEAF`. */
  opacity: number;
  kind: 'building' | 'tree';
}

export interface ShadeTree { x: number; y: number; z: number; kind: 'conifer' | 'broad' | 'oval' | 'longleaf'; scale: number; sy: number }

/** Tree crown as a box: half-width and top (world units, 1 u = 6 m: a mature conifer is ~2.3 u = 14 m). */
export function treeBox(t: ShadeTree): ShadeBox {
  const conifer = t.kind === 'conifer' || t.kind === 'longleaf';
  const h = (conifer ? 2.3 : 1.9) * t.scale * t.sy, r = (conifer ? 0.3 : 0.55) * t.scale;
  return { x0: t.x - r, x1: t.x + r, z0: t.z - r, z1: t.z + r, top: t.y + h, opacity: conifer ? 1 : BARE_LEAF, kind: 'tree' };
}

/** How tall a kind of building stands, world units (storeys 0.6-0.7 u, a roof on top; panels tilted; underground nothing). */
export function buildingHeight(kind: string, category?: string): number {
  if (/^bunker_|root_cellar|escape_tunnel|underground|^well|septic|cistern_buried/.test(kind)) return 0;
  if (/tower|lookout/.test(kind)) return 2.2;
  if (kind === 'solar_array') return 0.35;
  if (/greenhouse|polytunnel|high_tunnel/.test(kind)) return 0.45;
  if (/garden|field|orchard|pond|moat/.test(kind)) return 0;
  if (category === 'home') return 1.25;
  if (category === 'work' || category === 'food') return 0.9;
  if (category === 'power') return 0.6;
  if (category === 'water' || category === 'sanitation') return 0.5;
  return 0.8;
}

export interface ShadeScene {
  /** Natural plus graded ground height. */
  ground: (x: number, z: number) => number;
  boxes: readonly ShadeBox[];
  /** Sun elevation, degrees. */
  elevation: number;
  /** Let the ground itself cast shade (default yes). */
  hills?: boolean;
}

/** Fraction of light cut at a point (0 lit .. 1 dark) by the hill and the boxes. `skip` ignores boxes the point stands under (its own building). */
export function shadeAt(sc: ShadeScene, x: number, z: number, index?: BoxIndex, skip?: (b: ShadeBox) => boolean): number {
  const tan = Math.tan(sc.elevation * Math.PI / 180), gy = sc.ground(x, z);
  let lit = 1;
  // hills: march south until the sun's line is above any possible ridge
  for (let d = 0.5, miss = 0; sc.hills !== false && d < 60; d += 0.5) {
    const rise = sc.ground(x, z + d) - gy;
    if (rise > d * tan + 0.02) { lit = 0; break; }
    if (rise < d * tan - 6) { if (++miss > 8) break; } else miss = 0;
  }
  if (lit === 0) return 1;
  for (const b of (index ? index.near(x) : sc.boxes)) {
    if (x < b.x0 || x > b.x1 || z > b.z1) continue;
    const reach = (b.top - gy) / tan;           // how far north of the box's south face its shadow runs
    if (reach <= 0) continue;
    if (z < b.z0 - reach) continue;
    if (z >= b.z0 && z <= b.z1 && b.kind === 'building') continue;   // under the roof itself: not "in shade", it is the building
    if (skip?.(b)) continue;
    lit *= 1 - b.opacity;
    if (lit < 0.02) return 1;
  }
  return 1 - lit;
}

/** Boxes bucketed by x column, so a grid pass does not test every tree for every cell. */
export class BoxIndex {
  private readonly _cols = new Map<number, ShadeBox[]>();
  private readonly _cell: number;
  constructor(boxes: readonly ShadeBox[], cell = 2) {
    this._cell = cell; const _cell = cell;
    for (const b of boxes) for (let c = Math.floor(b.x0 / _cell); c <= Math.floor(b.x1 / _cell); c++) { let a = this._cols.get(c); if (!a) this._cols.set(c, a = []); a.push(b); }
  }
  near(x: number): readonly ShadeBox[] { return this._cols.get(Math.floor(x / this._cell)) ?? []; }
}

export interface ShadeGrid { nx: number; nz: number; x0: number; z0: number; step: number; shade: Float32Array }

/** The shade of every cell of a terrain grid (cell centers). */
export function shadeGrid(sc: ShadeScene, grid: { nx: number; nz: number; x0: number; z0: number; step: number }): ShadeGrid {
  const idx = new BoxIndex(sc.boxes), shade = new Float32Array(grid.nx * grid.nz);
  for (let j = 0; j < grid.nz; j++) for (let i = 0; i < grid.nx; i++) shade[j * grid.nx + i] = shadeAt(sc, grid.x0 + i * grid.step, grid.z0 + j * grid.step, idx);
  return { ...grid, shade };
}

export interface SiteShade { id: string; kind: string; x: number; z: number; pct: number; by: 'hill' | 'trees' | 'buildings' | null }

/** Share of a rectangle in shade (a 5 x 5 sample), and what mostly causes it. Its own building (when it is one) casts nothing on itself. */
export function rectShade(sc: ShadeScene, r: { x0: number; x1: number; z0: number; z1: number }, own?: ShadeBox): { pct: number; by: SiteShade['by'] } {
  const idx = new BoxIndex(sc.boxes);
  let sum = 0, n = 0; const by = { hill: 0, trees: 0, buildings: 0 };
  for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
    const x = r.x0 + (r.x1 - r.x0) * (a + 0.5) / 5, z = r.z0 + (r.z1 - r.z0) * (b + 0.5) / 5;
    const s = shadeAt(sc, x, z, idx, bx => bx === own); sum += s; n++;
    if (s > 0.05) {
      const noHill = shadeAt({ ...sc, hills: false }, x, z, idx, bx => bx === own);
      if (noHill < s - 0.05) by.hill++;
      else { const bld = shadeAt({ ...sc, boxes: sc.boxes.filter(q => q.kind === 'building') }, x, z, undefined, bx => bx === own); if (bld >= s - 0.05) by.buildings++; else by.trees++; }
    }
  }
  const pct = Math.round(100 * sum / n);
  const top = (Object.entries(by) as Array<['hill' | 'trees' | 'buildings', number]>).sort((p, q) => q[1] - p[1])[0];
  return { pct, by: pct >= 5 && top[1] > 0 ? top[0] : null };
}

export const SHADE_WORDS: Record<NonNullable<SiteShade['by']>, string> = { hill: 'the hill to the south', trees: 'trees to the south', buildings: 'a building to the south' };

/** One line for a solar array or a bed: "Solar array: 62% shaded at noon on Dec 21 by trees to the south". */
export function shadeLine(name: string, s: { pct: number; by: SiteShade['by'] }): string {
  if (s.pct < 5) return `${name}: full sun at noon on Dec 21`;
  return `${name}: ${s.pct}% shaded at noon on Dec 21${s.by ? ` by ${SHADE_WORDS[s.by]}` : ''}`;
}
