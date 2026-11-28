import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { buildDeciduousTree } from './treeGeometry';

const verts = (g: BufferGeometry): number => g.attributes['position']!.count;

describe('forest broadleaf skeleton (leafless winter trees must not be bare poles)', () => {
  it('adds scaffold limbs at the near and mid levels at low detail, not the far one', () => {
    for (const variant of [0, 1] as const) {
      for (const lod of [0, 1] as const) {
        expect(verts(buildDeciduousTree(variant, 'low', 41, lod, true))).toBeGreaterThan(verts(buildDeciduousTree(variant, 'low', 41, lod)));
      }
      expect(verts(buildDeciduousTree(variant, 'low', 41, 2, true))).toBe(verts(buildDeciduousTree(variant, 'low', 41, 2)));
    }
  });
  it('stays cheap: well under 1,000 extra vertices per tree', () => {
    const extra = verts(buildDeciduousTree(0, 'low', 41, 0, true)) - verts(buildDeciduousTree(0, 'low', 41, 0));
    expect(extra).toBeLessThan(1000);
  });
  it('leaves the default (garden trees) unchanged', () => {
    expect(verts(buildDeciduousTree(0, 'low', 41, 1))).toBe(verts(buildDeciduousTree(0, 'low', 41, 1, false)));
  });
});
