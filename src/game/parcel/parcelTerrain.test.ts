import { describe, expect, it } from 'vitest';
import { PARCEL_SIZE, ParcelTerrain } from './parcelTerrain';

describe('ParcelTerrain', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = new ParcelTerrain(7), b = new ParcelTerrain(7), c = new ParcelTerrain(8);
    expect(a.height(20, 30)).toBe(b.height(20, 30));
    let diff = 0;
    for (let x = 0; x <= PARCEL_SIZE; x += 8) for (let z = 0; z <= PARCEL_SIZE; z += 8) diff += Math.abs(a.height(x, z) - c.height(x, z));
    expect(diff).toBeGreaterThan(1);
  });

  it('rises westward (benches toward the range) with tens of meters of relief', () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      const t = new ParcelTerrain(seed);
      // sample away from the creek
      let z = 2, best = -1;
      for (let zz = 2; zz <= PARCEL_SIZE - 2; zz++) {
        const d = Math.min(Math.abs(zz - t.creek.zAt(4)), Math.abs(zz - t.creek.zAt(PARCEL_SIZE - 4)));
        if (d > best) { best = d; z = zz; }
      }
      const west = t.height(4, z), east = t.height(PARCEL_SIZE - 4, z);
      expect(west - east).toBeGreaterThan(1.5);   // > 9 m
      expect(west - east).toBeLessThan(8);        // < 48 m
    }
  });

  it('carves a creek channel that crosses the whole parcel with water inside its banks', () => {
    for (const seed of [1, 7, 99]) {
      const t = new ParcelTerrain(seed);
      for (let x = -20; x <= PARCEL_SIZE + 20; x += 3) {
        const zc = t.creek.zAt(x);
        const wy = t.creek.waterY(x);
        expect(t.height(x, zc)).toBeLessThan(wy);                       // bed under water
        expect(t.height(x, zc + 2.5)).toBeGreaterThan(wy);              // banks above it
        expect(t.height(x, zc - 2.5)).toBeGreaterThan(wy);
      }
      expect(t.isCreek(PARCEL_SIZE / 2, t.creek.zAt(PARCEL_SIZE / 2))).toBe(true);
    }
  });

  it('keeps natural grades walkable on the parcel (no cliffs)', () => {
    const t = new ParcelTerrain(7);
    let max = 0;
    for (let x = 1; x < PARCEL_SIZE; x += 1) for (let z = 1; z < PARCEL_SIZE; z += 1) {
      const g = Math.hypot(t.height(x + 0.5, z) - t.height(x - 0.5, z), t.height(x, z + 0.5) - t.height(x, z - 0.5));
      max = Math.max(max, g);
    }
    expect(max).toBeLessThan(0.9);   // < ~42° even on a riser or cut bank
  });

  it('grades a pad flat and blends its skirt into the slope', () => {
    const t = new ParcelTerrain(7);
    const y = t.padHeight(10, 10, 12, 13);
    t.setPads([{ x0: 10, z0: 10, x1: 12, z1: 13, y, skirt: 1.5 }]);
    expect(t.height(11, 11.5)).toBeCloseTo(y, 6);
    expect(t.height(10.2, 12.8)).toBeCloseTo(y, 6);
    expect(t.height(20, 20)).toBe(t.natural(20, 20).h);
    expect(t.sample(11, 11).forest).toBe(0);
  });

  it('timbers part of the parcel and lines the creek with trees', () => {
    const t = new ParcelTerrain(7);
    let wooded = 0, n = 0;
    for (let x = 0; x <= PARCEL_SIZE; x += 2) for (let z = 0; z <= PARCEL_SIZE; z += 2) { n++; if (t.sample(x, z).forest > 0.5) wooded++; }
    expect(wooded / n).toBeGreaterThan(0.05);
    expect(wooded / n).toBeLessThan(0.6);
    const x = PARCEL_SIZE / 2, zc = t.creek.zAt(x);
    expect(Math.max(t.sample(x, zc + 1.6).forest, t.sample(x, zc - 1.6).forest)).toBeGreaterThan(0.4);
  });
});
