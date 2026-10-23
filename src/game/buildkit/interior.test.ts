import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// materials paint canvases (no DOM in tests): plain materials stand in
vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));
import { hitsColliders, wallRun, type Sink } from './interior';
import { buildCabinLayers, CABIN } from './cabinGeometry';
import { KIT, CELL } from './kit';

const collect = () => {
  const geos: THREE.BufferGeometry[] = [];
  const sink: Sink = (_l, _m, g) => { geos.push(g); };
  return { geos, sink };
};

describe('wallRun', () => {
  it('cuts a doorway through a wall: the collider splits and the gap is free', () => {
    const { sink } = collect();
    const cs = wallRun(sink, 'walls', 'pine_panel', { ax: 0, az: 0, bx: 1, bz: 0, y0: 0, h: 0.45, t: 0.03, openings: [{ at: 0.5, w: 0.16, sill: 0, h: 0.36 }] });
    expect(cs.length).toBe(2);
    expect(hitsColliders(cs, 0.5, 0, 0.02)).toBe(false);   // walk through the door
    expect(hitsColliders(cs, 0.2, 0, 0.02)).toBe(true);
  });

  it('a window leaves wall above and below; the cutaway stops at the cut height', () => {
    const a = collect(), b = collect();
    wallRun(a.sink, 'walls', 'pine_panel', { ax: 0, az: 0, bx: 1, bz: 0, y0: 0, h: 0.45, t: 0.03, openings: [{ at: 0.5, w: 0.2, sill: 0.17, h: 0.2 }] });
    const top = (g: THREE.BufferGeometry[]) => Math.max(...g.map(x => { x.computeBoundingBox(); return x.boundingBox!.max.y; }));
    expect(top(a.geos)).toBeCloseTo(0.45);
    wallRun(b.sink, 'cutwalls', 'pine_panel', { ax: 0, az: 0, bx: 1, bz: 0, y0: 0, h: 0.45, t: 0.03, cut: 0.2, openings: [{ at: 0.5, w: 0.2, sill: 0.17, h: 0.2 }] });
    expect(top(b.geos)).toBeLessThan(0.21);
  });
});

describe('cabin interior', () => {
  const g = buildCabinLayers(KIT.timber_cabin);
  const cs = g.userData.colliders as Array<{ x0: number; z0: number; x1: number; z1: number }>;
  const hd = KIT.timber_cabin.cellsZ * CELL / 2;

  it('is furnished (interior and loft layers have geometry)', () => {
    for (const layer of ['interior', 'loft', 'cutwalls']) expect(g.children.some(m => m.userData.layer === layer)).toBe(true);
  });

  it('you can walk in through the front door, but not through the walls', () => {
    const r = 0.04;
    for (let z = hd + 0.1; z > hd - 0.2; z -= 0.02) expect(hitsColliders(cs, CABIN.door.x, z, r)).toBe(false);
    expect(hitsColliders(cs, 0.3, hd - 0.017, r)).toBe(true);
    expect(hitsColliders(cs, -0.5, 0, r)).toBe(true);
  });

  it('furniture blocks (table, stove)', () => {
    expect(hitsColliders(cs, -0.25, 0.02, 0.01)).toBe(true);
    expect(hitsColliders(cs, 0.26, -hd + 0.11, 0.01)).toBe(true);
  });
});
