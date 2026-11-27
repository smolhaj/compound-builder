/**
 * The arcology's lattice stops at the top of its armored skirt band. A strut 0.03 wide that ran on down inside the opaque band poked through its face (the footing sits 0.02 inside
 * the band), a ring of dark spikes round the foot of the shell on Medium and High. The census below reads the frame mesh the world draws.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { buildLayers } from './buildings';
import { KIT } from './kit';
import { setDetailTier } from './buildingDetail';

const STEM = 0.14, BAND = 0.8;

/** Frame vertices under the band's top (less 0.05: a strut cut at the band is a 3-sided prism, its corners hang a little below the cut). */
function lowFrameVertices(kind: string): { below: number; verts: number } {
  const g = buildLayers(KIT[kind], 1, {});
  let below = 0, verts = 0;
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.name.startsWith('bldg_frame_')) return;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { verts++; const y = pos.getY(i); if (y < STEM + BAND - 0.05) below++; }
  });
  return { below, verts };
}

describe('the arcology lattice and its armored band', () => {
  afterEach(() => setDetailTier('high'));
  for (const tier of ['high', 'medium', 'low'] as const) it(`${tier}: no lattice strut runs down inside the band`, () => {
    setDetailTier(tier);
    const { below, verts } = lowFrameVertices('dome_arcology');
    expect(verts).toBeGreaterThan(1000);
    expect(below).toBe(0);
  });
  it('the geodesic and glass domes (no band) keep their struts to the foot', () => {
    for (const kind of ['dome_glass', 'dome_geodesic']) expect(lowFrameVertices(kind).verts).toBeGreaterThan(100);
  });
});
