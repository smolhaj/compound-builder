import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// materials paint canvases (no DOM in tests): named plain materials stand in
vi.mock('./materials', () => ({ kitMaterial: (m: string) => { const x = new THREE.MeshStandardMaterial(); x.name = `kit_${m}`; return x; }, setWindowGlow: () => {} }));

import { buildLayers } from './buildings';
import { KIT } from './kit';
import { hitsColliders, type Collider } from './interior';
import { GH } from './foodBuildings';

const meshes = (kind: string) => buildLayers(KIT[kind]).children as THREE.Mesh[];
const has = (kind: string, layer: string, mat: string) => meshes(kind).some(m => m.userData.layer === layer && (m.material as THREE.Material).name === `kit_${mat}`);

// user: "greenhouse inside should have a floor, irrigation etc. the little details inside buildings never neglect."
describe('interior detail', () => {
  it('greenhouse: gravel floor with a paver aisle, PVC drip headers, drip lines, and you can walk in to the potting bench', () => {
    expect(has('greenhouse', 'foundation', 'gravel')).toBe(true);
    expect(has('greenhouse', 'deck', 'pavers')).toBe(true);
    for (const mat of ['enamel', 'rubber', 'blue_tank', 'lamp']) expect(has('greenhouse', 'interior', mat)).toBe(true);
    const cs = buildLayers(KIT.greenhouse).userData.colliders as Collider[];
    for (let z = GH.D / 2 + 0.08; z > -GH.D / 2 + 0.2; z -= 0.02) expect(hitsColliders(cs, 0, z, 0.03)).toBe(false);
    expect(hitsColliders(cs, 0, -GH.D / 2 + 0.05, 0.01)).toBe(true);    // the potting bench
  });

  it('orchard has drip lines; cottage has floorboards; garage has an oil-stained slab and a clear truck bay; shed is plumbed in copper', () => {
    expect(has('orchard', 'openings', 'rubber')).toBe(true);
    expect(has('cottage', 'deck', 'floorboards')).toBe(true);
    expect(has('metal_garage', 'interior', 'oil_stain')).toBe(true);
    const cs = buildLayers(KIT.metal_garage).userData.colliders as Collider[];
    for (let z = 0.95; z > -0.7; z -= 0.05) expect(hitsColliders(cs, 0.36, z, 0.12)).toBe(false);
    expect(has('filtration_shed', 'interior', 'copper')).toBe(true);
  });

  it('stays cheap: one mesh per layer × material, a bounded count per building', () => {
    const budget: Record<string, number> = { greenhouse: 28, orchard: 14, cottage: 46, metal_garage: 42, filtration_shed: 32 };
    for (const [kind, n] of Object.entries(budget)) {
      const ms = meshes(kind);
      expect(ms.length).toBeLessThanOrEqual(n);
      const keys = ms.map(m => `${m.userData.layer}|${(m.material as THREE.Material).name}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
