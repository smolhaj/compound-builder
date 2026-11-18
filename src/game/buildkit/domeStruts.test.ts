import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { buildLayers } from './buildings';
import { KIT } from './kit';
import { setDetailTier } from './buildingDetail';
import { arcologyFrequency } from './domeBuildings';

/** Triangles of the meshes that cast a shadow in the arcology's frame layer (the lattice struts). */
function strutTris(): number {
  const g = buildLayers(KIT['dome_arcology'], 1, {});
  let n = 0;
  g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.name === 'bldg_frame_steel') n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  return n;
}

describe('arcology lattice by detail tier', () => {
  afterEach(() => setDetailTier('high'));
  it('is finer on High and never finer on a lower tier', () => {
    expect(arcologyFrequency('high')).toBeGreaterThan(arcologyFrequency('medium'));
    expect(arcologyFrequency('medium')).toBeGreaterThanOrEqual(arcologyFrequency('low'));
  });
  it('struts are 3-sided prisms: 6 triangles each, and Medium has far fewer than High', () => {
    setDetailTier('high');
    const hi = strutTris();
    setDetailTier('medium');
    const med = strutTris();
    expect(hi % 6).toBe(0);
    expect(med % 6).toBe(0);
    expect(hi).toBeLessThanOrEqual(1400 * 6);
    expect(med).toBeLessThan(hi * 0.5);
  });
});
