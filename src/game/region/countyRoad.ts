/**
 * The county road past the parcel, the region's way (docs/DECISIONS.md,
 * "Roads follow the land"): it runs north-south just east of the forty and its
 * line is read straight from the region the way real rural roads lie.
 *
 *  - Plains: ruler-straight on the section line, with a right-angle jog (a
 *    correction line) a half mile off either side of the place;
 *  - Appalachia: a hollow road, many short bends following the creek;
 *  - Mountain West: long easy curves along the range front;
 *  - Pacific Northwest, New England, Ozarks, Hill Country, Rust Belt: winding
 *    to the degree the land is (0.5-0.9 of the hollow road);
 *  - Desert: nearly straight caliche with a gentle bend round the arroyo head;
 *  - North Woods / Upper Midwest: gravel with gentle curves.
 * Pure (tested). The sim never reads this; the world, the delivery truck and the
 * fences do. `x(z)` is the road's centre line.
 */
import type { RegionId } from '../../sim/regions';
import { mulberry32 } from '../../sim/rng';
import { PARCEL_SIZE } from '../parcel/parcelTerrain';

/** Road surface width (≈ 6 m gravel). */
export const ROAD_W = 1.0;
/** The county road runs this far north and south of the parcel. */
export const ROAD_EXTENT = 700;

export interface CountyRoad { x(z: number): number; region: RegionId }

const sst = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** [amplitude of the long wave, its scale (sin(z / scale)), amplitude of the short wave, its scale]: world units. The largest sum is 1.85, so the road never comes nearer than 1.5 to the line. */
const WAVES: Record<RegionId, [number, number, number, number]> = {
  mountain_west: [1.6, 85, 0.6, 31],
  appalachia: [1.3, 9, 0.55, 3.9],
  desert: [0.7, 40, 0.15, 14],
  north_woods: [0.9, 22, 0.3, 8],
  plains: [0, 1, 0, 1],
  pnw: [1.15, 13, 0.5, 5],
  upper_midwest: [0.8, 24, 0.25, 9],
  new_england: [1.1, 11, 0.55, 4.5],
  ozarks: [1.2, 13, 0.5, 5.5],
  hill_country: [0.85, 20, 0.3, 7],
  rust_belt: [1.0, 16, 0.4, 6],
};

export function countyRoad(region: RegionId, seed: number): CountyRoad {
  const base = PARCEL_SIZE + 3.4;
  const r = mulberry32(seed * 7919 + 101);
  const [a1, l1, a2, l2] = WAVES[region];
  const p1 = r() * 6.28, p2 = r() * 6.28;
  if (region === 'plains') {
    // the survey grid: straight, with a right-angle jog on each side of the place (a correction line)
    const jn = (r() < 0.5 ? -1 : 1), j1 = -(80 + r() * 90), j2 = PARCEL_SIZE + 80 + r() * 120;
    return { region, x: (z: number) => base - 0.1 + jn * 1.3 * sst(j1 - 0.8, j1 + 0.8, z) - jn * 1.3 * sst(j2 - 0.8, j2 + 0.8, z) };
  }
  return { region, x: (z: number) => base + a1 * Math.sin(z / l1 + p1) + a2 * Math.sin(z / l2 + p2) };
}

/** County road centre line, sampled every `step` units. */
export function roadLine(c: CountyRoad, step = 4): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let z = -ROAD_EXTENT; z <= PARCEL_SIZE + ROAD_EXTENT; z += step) out.push([c.x(z), z]);
  return out;
}
