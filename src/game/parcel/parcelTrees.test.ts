import { describe, expect, it } from 'vitest';
import { ParcelTerrain } from './parcelTerrain';
import { planParcelTrees } from './parcelTrees';

describe('planParcelTrees', () => {
  const t = new ParcelTerrain(7);
  const trees = planParcelTrees(t, { margin: 20 });

  it('plants a timber stand, aspens and creek cottonwoods', () => {
    expect(trees.length).toBeGreaterThan(150);
    expect(trees.length).toBeLessThan(4000);
    const kinds = new Set(trees.map(s => s.kind));
    expect(kinds.has('conifer')).toBe(true);
    expect(kinds.has('broad')).toBe(true);
  });

  it('is deterministic for a seed', () => {
    expect(planParcelTrees(t, { margin: 20 })).toEqual(trees);
  });

  it('keeps trunks out of the creek and stands them on the ground', () => {
    for (const s of trees) {
      expect(Math.abs(s.z - t.creek.zAt(s.x))).toBeGreaterThan(t.creek.halfWidth + 0.4);
      expect(s.y).toBeCloseTo(t.height(s.x, s.z), 6);
    }
  });

  it('respects exclusions (the cabin site)', () => {
    const blocked = (x: number, z: number) => x > 10 && x < 30 && z > 10 && z < 30;
    const some = planParcelTrees(t, { margin: 20, blocked });
    expect(some.some(s => blocked(s.x, s.z))).toBe(false);
  });
});

describe('parcel tree ids', () => {
  it('are stable across density and exclusions (marks and stumps survive replanting)', () => {
    const t = new ParcelTerrain(5);
    const full = planParcelTrees(t, { margin: 4 });
    const half = planParcelTrees(t, { margin: 4, density: 0.5, blocked: (x) => x < 20 });
    const byId = new Map(full.map(s => [s.id, s]));
    expect(new Set(full.map(s => s.id)).size).toBe(full.length);
    for (const s of half) {
      const f = byId.get(s.id)!;
      expect(f).toBeDefined();
      expect([f.x, f.z, f.kind]).toEqual([s.x, s.z, s.kind]);
    }
  });
});
