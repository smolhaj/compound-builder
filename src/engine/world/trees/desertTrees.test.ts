import { describe, expect, it } from 'vitest';
import { buildDesertTree, type DesertTreeSpecies } from './treeGeometry';

const SPECIES: DesertTreeSpecies[] = ['juniper', 'mesquite', 'paloverde', 'saguaro'];
const tris = (g: { getAttribute(n: string): { count: number } }) => g.getAttribute('position').count / 3;

describe('desert tree geometry', () => {
  it('builds every species at every LOD, true to size (1 unit = 20 ft), within a small triangle budget', () => {
    const real: Record<DesertTreeSpecies, [number, number]> = { juniper: [0.6, 1.3], mesquite: [0.8, 1.4], paloverde: [0.7, 1.3], saguaro: [1.3, 1.8] };
    for (const sp of SPECIES) {
      let prev = Infinity;
      for (const lod of [0, 1, 2] as const) {
        const g = buildDesertTree(sp, 'low', 23, lod);
        g.computeBoundingBox();
        const h = g.boundingBox!.max.y;
        expect(h).toBeGreaterThan(real[sp][0]);
        expect(h).toBeLessThan(real[sp][1]);
        const t = tris(g);
        expect(t).toBeLessThan(lod === 0 ? 2600 : lod === 1 ? 1200 : 500);
        expect(t).toBeLessThanOrEqual(prev);
        prev = t;
        expect(g.getAttribute('aCard')).toBeTruthy();
        g.dispose();
      }
    }
  });
  it('mesquite is wide and low, saguaro a thin column, juniper a squat dome', () => {
    const box = (sp: DesertTreeSpecies) => { const g = buildDesertTree(sp, 'low', 23, 0); g.computeBoundingBox(); const b = g.boundingBox!; return { w: Math.max(b.max.x - b.min.x, b.max.z - b.min.z), h: b.max.y }; };
    expect(box('mesquite').w).toBeGreaterThan(box('mesquite').h * 1.2);
    expect(box('saguaro').h).toBeGreaterThan(box('saguaro').w * 1.4);
    expect(box('juniper').w).toBeGreaterThan(box('juniper').h * 0.8);
  });
});
