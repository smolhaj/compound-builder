import { describe, expect, it } from 'vitest';
import { CELL, footprint, placementProblem, rotQ, snapCentre, TIMBER_CABIN, type SiteQuery } from './kit';

const flat: SiteQuery = { height: () => 0, owned: (x, z) => x >= 0 && z >= 0 && x <= 67 && z <= 67, water: () => false };

describe('build kit', () => {
  it('cabin is 6 × 9 m plus a 3 m porch strip', () => {
    const r = footprint(TIMBER_CABIN, 10, 10, 0);
    expect(r.x1 - r.x0).toBeCloseTo(1.0);
    expect(r.z1 - r.z0).toBeCloseTo(2.0);
    const r1 = footprint(TIMBER_CABIN, 10, 10, 1);
    expect(r1.x1 - r1.x0).toBeCloseTo(2.0);
    expect(r1.z1 - r1.z0).toBeCloseTo(1.0);
    const noFront = footprint(TIMBER_CABIN, 10, 10, 0, false);
    expect(noFront.z1 - noFront.z0).toBeCloseTo(1.5);
  });

  it('quarter-turn rotation is a proper rotation', () => {
    for (let q = 0; q < 4; q++) {
      const [x, z] = rotQ(1, 2, q);
      expect(Math.hypot(x, z)).toBeCloseTo(Math.hypot(1, 2));
    }
    expect(rotQ(1, 0, 4)).toEqual(rotQ(1, 0, 0));
  });

  it('snaps footprints to the 3 m grid', () => {
    for (const rot of [0, 1]) {
      const [x, z] = snapCentre(TIMBER_CABIN, 10.13, 7.41, rot);
      const r = footprint(TIMBER_CABIN, x, z, rot, false);
      for (const v of [r.x0, r.x1, r.z0, r.z1]) expect(Math.abs(v / CELL - Math.round(v / CELL))).toBeLessThan(1e-9);
    }
  });

  it('refuses water, steep ground, off-parcel and overlaps', () => {
    expect(placementProblem(TIMBER_CABIN, 10, 10, 0, flat, [])).toBeNull();
    expect(placementProblem(TIMBER_CABIN, 0.2, 10, 0, flat, [])).toBe('off_parcel');
    expect(placementProblem(TIMBER_CABIN, 10, 10, 0, { ...flat, water: (x) => x > 10 }, [])).toBe('water');
    expect(placementProblem(TIMBER_CABIN, 10, 10, 0, { ...flat, height: x => x * 0.6 }, [])).toBe('too_steep');
    const placed = [{ id: 'a', kind: 'timber_cabin', x: 10.5, z: 10.5, rot: 0 }];
    expect(placementProblem(TIMBER_CABIN, 10, 10, 0, flat, placed)).toBe('overlaps');
    expect(placementProblem(TIMBER_CABIN, 14, 10, 0, flat, placed)).toBeNull();
  });
});
