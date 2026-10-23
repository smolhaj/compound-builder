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
