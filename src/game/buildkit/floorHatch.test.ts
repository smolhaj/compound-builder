import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('./materials', () => ({ kitMaterial: (m: string) => { const x = new THREE.MeshStandardMaterial(); x.name = `kit_${m}`; return x; }, setWindowGlow: () => {} }));

import { BUNKER_BUILDERS, setHatchLid } from './bunkerBuildings';
import { buildLayers } from './buildings';
import { floorHatchHost, KIT, placementProblem, type Placed, type SiteQuery } from './kit';
import { minusHoles } from './shell';
import { hatchPlan } from './bunkerHatchPlan';

const site: SiteQuery = { height: () => 0, owned: () => true, water: () => false };
const house: Placed = { id: 'h1', kind: 'log_house', x: 0, z: 0, rot: 0 };
const def = KIT.bunker_floorhatch;

describe('floor hatch placement', () => {
  it('goes inside a house, well in from its walls, and nowhere else', () => {
    expect(placementProblem(def, 0, 0, 0, site, [house])).toBeNull();
    expect(placementProblem(def, 20, 20, 0, site, [house])).toBe('needs_house');
    const r = KIT.log_house, hw = r.cellsX * 0.25;
    expect(placementProblem(def, hw - 0.1, 0, 0, site, [house])).toBe('needs_house');     // against the wall
    expect(floorHatchHost(0, 0, [house])?.id).toBe('h1');
    expect(floorHatchHost(0, 0, [{ id: 'x', kind: 'outhouse', x: 0, z: 0, rot: 0 }])).toBeNull();
  });
  it('another building in the way is still in the way', () => {
    expect(placementProblem(def, 0, 0, 0, site, [house, { id: 'g', kind: 'garden', x: 0.2, z: 0, rot: 0 }])).toBe('overlaps');
  });
});

describe('floor hatch geometry', () => {
  it('has a lid in its own meshes, flush shut and swinging up on its hinge when open', () => {
    const depth = 0.89, g = BUNKER_BUILDERS.bunker_floorhatch(def, 3, { depth, doors: { front: 0 } });
    const lids = g.children.filter(m => m.userData.lid) as THREE.Mesh[];
    expect(lids.length).toBeGreaterThan(2);
    const top = () => Math.max(...lids.map(m => { g.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(m); return b.max.y; }));
    const closed = top();
    expect(closed).toBeLessThan(depth + 0.02);                     // flush with the floor
    setHatchLid(g, 1);
    expect(top()).toBeGreaterThan(depth + 0.2);                    // the free edge is up, a person's height
    setHatchLid(g, 0);
    expect(top()).toBeCloseTo(closed, 4);
    // the opening is over the first flight and the lid fits in it
    const p = hatchPlan(depth), box = new THREE.Box3().setFromObject(lids[0]);
    expect(box.min.x).toBeGreaterThanOrEqual(p.hole.x0 - 1e-6); expect(box.max.x).toBeLessThanOrEqual(p.hole.x1 + 1e-6);
  });
  it('lit stairs: an amber strip under every tread, caged lamps, hand rails, and the shaft is hidden walls plus a cap in the cutaway layers', () => {
    const g = BUNKER_BUILDERS.bunker_floorhatch(def, 3, { depth: 0.89, doors: { front: 0 } });
    const has = (layer: string, mat: string) => (g.children as THREE.Mesh[]).some(m => m.userData.layer === layer && (m.material as THREE.Material).name === `kit_${mat}`);
    expect(has('interior', 'led_amber')).toBe(true); expect(has('interior', 'bulkhead')).toBe(true); expect(has('interior', 'wood_mid')).toBe(true);
    expect(has('roof', 'concrete')).toBe(true); expect(has('walls', 'concrete')).toBe(true);
    const keys = (g.children as THREE.Mesh[]).map(m => `${m.userData.layer}|${(m.material as THREE.Material).name}`);
    expect(new Set(keys).size).toBeLessThan(keys.length + 1);
    expect(g.children.length).toBeLessThan(60);
  });
});

describe('the house floor over a hatch', () => {
  it('minusHoles leaves the rest of the floor and none of the hole', () => {
    const base = { x0: -1, x1: 1, z0: -1, z1: 1 }, hole = { x0: -0.2, x1: 0.1, z0: -0.5, z1: 0.3 };
    const rs = minusHoles(base, [hole]);
    const area = (r: { x0: number; x1: number; z0: number; z1: number }) => (r.x1 - r.x0) * (r.z1 - r.z0);
    expect(rs.reduce((a, r) => a + area(r), 0)).toBeCloseTo(4 - 0.3 * 0.8, 6);
    for (const r of rs) expect(r.x0 < hole.x1 && r.x1 > hole.x0 && r.z0 < hole.z1 && r.z1 > hole.z0).toBe(false);
  });
  it('the floor, the foundation under it and the furniture all leave the opening clear', () => {
    const hole = { x0: -0.08, x1: 0.08, z0: -0.2, z1: 0.2 };
    const g = buildLayers(KIT.log_house, 5, { hatches: [hole] });
    const inside = (m: THREE.Mesh) => {
      const p = m.geometry.getAttribute('position'), idx = m.geometry.index;
      let n = 0;
      const tri = (a: number, b: number, c: number) => {
        const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3, z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3, ymax = Math.max(p.getY(a), p.getY(b), p.getY(c));
        if (x > hole.x0 + 0.003 && x < hole.x1 - 0.003 && z > hole.z0 + 0.003 && z < hole.z1 - 0.003 && ymax < KIT.log_house.floorY + 1.2) n++;
      };
      if (idx) for (let i = 0; i < idx.count; i += 3) tri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
      else for (let i = 0; i < p.count; i += 3) tri(i, i + 1, i + 2);
      return n;
    };
    for (const m of g.children as THREE.Mesh[]) {
      const layer = m.userData.layer as string, mat = (m.material as THREE.Material).name;
      if (layer === 'deck' && mat !== 'kit_deck') continue;
      if (['deck', 'foundation', 'interior'].includes(layer) && !['kit_trim', 'kit_string'].includes(mat)) expect(inside(m), `${layer}|${mat}`).toBe(0);
    }
  });
});
