import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const used = new Set<string>();
vi.mock('../buildkit/materials', () => ({ kitMaterial: (id: string) => { used.add(id); return new THREE.MeshStandardMaterial(); }, setWindowGlow: () => {} }));

import { buildRun } from './perimeterGeometry';
import { type PerimeterKind, type PerimeterRun, type Pt } from '../../sim/perimeter';

const M = 1 / 6;
const run = (kind: PerimeterKind, pts: Pt[], over: Partial<PerimeterRun> = {}): PerimeterRun => ({ id: 'r', kind, pts, gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0, ...over });
/** A gorge across z = 20: rims at 4 units (24 m), the bed at 0. */
const gorge = (_x: number, z: number) => Math.min(4, Math.abs(z - 20) * 0.7);
const box = (g: THREE.Group) => new THREE.Box3().setFromObject(g);
const finite = (g: THREE.Group) => { let ok = true; g.traverse(o => { const a = (o as THREE.Mesh).geometry?.getAttribute('position'); if (a) for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) ok = false; }); return ok; };

describe('the tunnel-bridge', () => {
  const pts: Pt[] = [[10, 8], [10, 32]];
  it('is a rust tube on trusses straight across the gorge, from rim to rim, with a door at each end', () => {
    used.clear();
    const g = buildRun(run('tunnel_bridge', pts), gorge, 0);
    expect(finite(g)).toBe(true);
    const b = box(g);
    expect(b.max.z).toBeGreaterThan(31.5); expect(b.min.z).toBeLessThan(8.5);          // the whole span
    expect(b.max.y).toBeGreaterThan(4 + 3.5 * M);                                       // the tube stands above the rim (a truck's headroom)
    expect(b.min.y).toBeLessThan(0.2);                                                  // the trusses reach the gorge bed
    expect([...used]).toEqual(expect.arrayContaining(['container_rust', 'steel', 'concrete']));
    expect(g.children.length).toBeLessThanOrEqual(8);                                   // merged per material
  });
  it('a bridge still being built is drawn only as far as it has got; a dropped one leaves its abutments', () => {
    const half = buildRun(run('tunnel_bridge', pts, { finishedAt: null, done: 0.5, hours: 1 }), gorge, 0);
    expect(box(half).max.z).toBeLessThan(21);
    const gone = buildRun(run('tunnel_bridge', pts, { finishedAt: null, done: 0, hours: 1, dropped: true }), gorge, 0);
    expect(finite(gone)).toBe(true);
    const b = box(gone);
    expect(b.max.y).toBeLessThan(4 + 1);                                               // abutments only: nothing spans the gap
  });
});

describe('the slope tunnel', () => {
  it('follows the hillside half sunk in it, a door at each end, finite on a steep slope', () => {
    const hill = (x: number) => -0.35 * x;
    const g = buildRun(run('slope_tunnel', [[0, 5], [14, 5]]), (x, z) => { void z; return hill(x); }, 0);
    expect(finite(g)).toBe(true);
    const b = box(g);
    expect(b.max.x).toBeGreaterThan(13.5);
    // the tube runs down the slope with the ground: its top is within a couple of metres of it at each end
    expect(b.max.y).toBeGreaterThan(hill(0));
    expect(b.min.y).toBeLessThan(hill(14) + 1.2);
  });
});
