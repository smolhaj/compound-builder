import { describe, expect, it } from 'vitest';
import { ParcelTerrain, PARCEL_SIZE } from '../parcel/parcelTerrain';
import { planNeighbours } from './neighbours';

describe('planNeighbours', () => {
  it('places a few spaced farms off the parcel on level, dry ground', () => {
    for (const seed of [1, 7, 42]) {
      const t = new ParcelTerrain(seed);
      const farms = planNeighbours(t);
      expect(farms.length).toBe(3);
      for (const f of farms) {
        expect(Math.max(Math.abs(f.x - PARCEL_SIZE / 2), Math.abs(f.z - PARCEL_SIZE / 2))).toBeGreaterThan(PARCEL_SIZE / 2 + 20);
        expect(Math.abs(f.z - t.creek.zAt(f.x))).toBeGreaterThan(15);
      }
      for (let i = 0; i < farms.length; i++) for (let j = i + 1; j < farms.length; j++) {
        expect(Math.hypot(farms[i].x - farms[j].x, farms[i].z - farms[j].z)).toBeGreaterThan(59);
      }
      expect(planNeighbours(t)).toEqual(farms);
    }
  });
});
