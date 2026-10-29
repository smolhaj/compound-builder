import { describe, expect, it } from 'vitest';
import { ROAD_EXTENT, countyRoad, roadLine } from './countyRoad';
import { PARCEL_SIZE } from '../parcel/parcelTerrain';
import { REGION_IDS } from '../../sim/regions';

/** Total sideways wandering of the road over the length of the forty and a half mile each way (units). */
const wander = (r: ReturnType<typeof countyRoad>) => { let t = 0; for (let z = -100; z < PARCEL_SIZE + 100; z += 2) t += Math.abs(r.x(z + 2) - r.x(z)); return t; };

describe('the county road, the region\'s way', () => {
  it('runs just east of the parcel the whole way, in every region and any seed', () => {
    for (const region of REGION_IDS) for (const seed of [1, 2, 3, 99]) {
      const r = countyRoad(region, seed);
      for (let z = -ROAD_EXTENT; z <= PARCEL_SIZE + ROAD_EXTENT; z += 13) {
        expect(r.x(z), `${region} ${seed} z${z}`).toBeGreaterThan(PARCEL_SIZE + 1.2);
        expect(r.x(z)).toBeLessThan(PARCEL_SIZE + 6);
      }
      expect(roadLine(r).length).toBeGreaterThan(300);
    }
  });

  it('is deterministic by seed and differs between seeds', () => {
    expect(countyRoad('pnw', 5).x(10)).toBe(countyRoad('pnw', 5).x(10));
    expect(countyRoad('pnw', 5).x(10)).not.toBe(countyRoad('pnw', 6).x(10));
  });

  it('plains: straight on the survey line with a right-angle jog to either side of the place; a hollow road bends far more', () => {
    const p = countyRoad('plains', 4), h = countyRoad('appalachia', 4);
    // straight across the forty
    for (let z = 0; z <= PARCEL_SIZE; z += 5) expect(Math.abs(p.x(z) - p.x(0))).toBeLessThan(0.01);
    // a jog: the line steps sideways within a unit or two, somewhere within a mile of the place
    let jog = 0;
    for (let z = -400; z < PARCEL_SIZE + 400; z += 0.5) jog = Math.max(jog, Math.abs(p.x(z + 0.5) - p.x(z)));
    expect(jog).toBeGreaterThan(0.2);
    expect(Math.abs(p.x(-400) - p.x(PARCEL_SIZE + 400))).toBeLessThan(0.01);
    expect(wander(h)).toBeGreaterThan(wander(p) * 3);
  });

  it('winding regions wind more than straight ones', () => {
    const w = (id: Parameters<typeof countyRoad>[0]) => wander(countyRoad(id, 2));
    expect(w('appalachia')).toBeGreaterThan(w('desert'));
    expect(w('new_england')).toBeGreaterThan(w('upper_midwest'));
    expect(w('pnw')).toBeGreaterThan(w('mountain_west'));
  });
});
