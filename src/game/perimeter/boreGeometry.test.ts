import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const used = new Set<string>();
vi.mock('../buildkit/materials', () => ({ kitMaterial: (id: string) => { used.add(id); return new THREE.MeshStandardMaterial(); }, setWindowGlow: () => {} }));

import { buildRun } from './perimeterGeometry';
import { ARCH, MOUND, boreParts, rubbleHeap } from './boreGeometry';
import { boreStats } from '../../sim/terrain';
import { type PerimeterRun, type Pt } from '../../sim/perimeter';

const run = (pts: Pt[], over: Partial<PerimeterRun> = {}): PerimeterRun => ({ id: 'r', kind: 'rock_tunnel', pts, gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0, ...over });
/** A spur across the line z = 20: 4 units (24 m) high at x = 20. */
const spur = (x: number, _z: number) => 4 * Math.exp(-(((x - 20) / 6) ** 2));
const pts: Pt[] = [[12, 20], [28, 20]];
const box = (g: THREE.Object3D) => new THREE.Box3().setFromObject(g);
const finite = (g: THREE.Object3D) => { let ok = true; g.traverse(o => { const a = (o as THREE.Mesh).geometry?.getAttribute('position'); if (a) for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) ok = false; }); return ok; };

describe('the rock tunnel is drawn as two portals and a mound, the rest is under the hill', () => {
  it('stands two stone portals with a steel door each, one at each end of the line, and nothing standing up in between', () => {
    used.clear();
    const g = buildRun(run(pts), spur, 0);
    expect(finite(g)).toBe(true);
    const b = box(g);
    expect(b.min.x).toBeLessThan(12.1); expect(b.max.x).toBeGreaterThan(27.9);                 // from portal to portal
    expect([...used]).toEqual(expect.arrayContaining(['fieldstone', 'steel', 'earth', 'paint_yellow', 'concrete']));
    // under the hill's top (4 u) nothing stands out of the ground in the middle of the line
    const mid = new THREE.Box3(new THREE.Vector3(16.5, -1, 18), new THREE.Vector3(23.5, 6, 22));
    const ground = spur(20, 20);
    let tallest = -Infinity;
    g.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh || m.material instanceof THREE.MeshStandardMaterial && m.material.side === THREE.BackSide) return; const bb = new THREE.Box3().setFromObject(m); const inter = bb.clone().intersect(mid); if (!inter.isEmpty()) tallest = Math.max(tallest, inter.max.y); });
    expect(tallest, 'nothing above the ground in the middle').toBeLessThanOrEqual(ground + 0.01);
  });

  it('the dark inside is a closed arch that fits the 4.4 m by 4.8 m bore, from deck to crown, at the grade of the line', () => {
    const slope = (x: number, z: number) => spur(x, z) + 0.05 * x;      // the ends stand at different heights: a rising deck
    const g = buildRun(run(pts), slope, 0);
    const dark = g.children.filter(c => (c as THREE.Mesh).isMesh && ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).side === THREE.BackSide);
    expect(dark).toHaveLength(1);
    const b = box(dark[0]);
    expect(b.max.x - b.min.x).toBeGreaterThan(15.9);                                              // the whole length
    expect(b.max.y - b.min.y).toBeGreaterThan(ARCH.crown);                                        // the arch (plus the rise along it)
    const s = boreStats(slope, pts[0], pts[1]);
    expect(b.max.y - b.min.y).toBeLessThan(ARCH.crown + s.grade * 16 + 0.05);
  });

  it('banks earth over the tube where the hill does not close over the crown, with its sides sloped down to the ground, and none where the hill is over it', () => {
    const lowAt = boreParts(pts, spur, 1, true, true);
    const earth = lowAt.parts.filter(p => p[0] === 'earth');
    expect(earth.length).toBeGreaterThan(0);
    const e = new THREE.Box3(); earth.forEach(([, geo]) => e.expandByObject(new THREE.Mesh(geo)));
    // it is at the two ends only: not over the 24 m high middle of the spur
    const cover = (x: number) => spur(x, 20) - (spur(12, 20) + ARCH.crown);
    expect(cover(20)).toBeGreaterThan(1);
    for (const [, geo] of earth) {
      const p = geo.getAttribute('position');
      for (let i = 0; i < p.count; i++) { const x = p.getX(i); expect(x < 16 || x > 24, `an earth vertex at x = ${x.toFixed(1)} over the deep part`).toBe(true); }
    }
    // each mound is no higher than the crown plus its earth
    expect(e.max.y).toBeLessThanOrEqual(Math.max(spur(12, 20), spur(28, 20)) + ARCH.crown + MOUND.over + 1e-6 + 4 * 0);
    // on level ground the whole tube is under a mound
    const flat = boreParts(pts, () => 0, 1, true, true).parts.filter(p => p[0] === 'earth');
    expect(flat.length).toBeGreaterThan(0);
  });

  it('a tunnel still being driven shows its first portal only; nothing is drawn before work starts', () => {
    const none = buildRun(run(pts, { finishedAt: null, done: 0, hours: 10 }), spur, 0);
    expect(none.children).toHaveLength(0);
    const part = buildRun(run(pts, { finishedAt: null, done: 5, hours: 10 }), spur, 0);
    expect(finite(part)).toBe(true);
    const b = box(part);
    expect(b.max.x).toBeLessThan(14);                                                             // the portal at the first end only
    expect(part.children.every(c => !(c as THREE.Mesh).isMesh || ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).side !== THREE.BackSide)).toBe(true);
  });

  it('is merged per material (a few draw calls however long the bore) and finite on a steep rock face', () => {
    const face = (x: number, z: number) => { void z; return Math.max(0, Math.min(3, (x - 10) * 1.4)); };
    const g = buildRun(run([[6, 20], [30, 20]]), face, 0);
    expect(finite(g)).toBe(true);
    expect(g.children.length).toBeLessThanOrEqual(10);
  });
});

describe('a portal brought down by a charge', () => {
  it('chokes both mouths with a heap of rubble no higher than the crown, and draws it only when it is down', () => {
    const open = boreParts(pts, spur, 1, true, true), down = boreParts(pts, spur, 1, true, true, true);
    expect(down.parts.length).toBeGreaterThan(open.parts.length + 60);              // ~44 blocks at each end
    const heap = new THREE.Box3();
    for (const [, g] of rubbleHeap(17)) heap.expandByObject(new THREE.Mesh(g));     // (in the portal's own frame: x across, y up from the deck, z into the hill)
    expect(heap.max.y).toBeLessThanOrEqual(ARCH.crown);
    expect(heap.max.y).toBeGreaterThan(ARCH.crown * 0.4);                           // it fills the arch, it is not a few pebbles
    expect(heap.max.x - heap.min.x).toBeGreaterThan(ARCH.hw * 1.5);
    for (const [, g] of down.parts) { const a = g.getAttribute('position'); for (let i = 0; i < a.count; i++) expect(Number.isFinite(a.getX(i) + a.getY(i) + a.getZ(i))).toBe(true); }
    // the same every time
    expect(boreParts(pts, spur, 1, true, true, true).parts.length).toBe(down.parts.length);
  });
  it('rubbleHeap is deterministic from its seed', () => {
    expect(rubbleHeap(17).length).toBe(rubbleHeap(17).length);
    const a = rubbleHeap(17)[3][1].getAttribute('position').array, b = rubbleHeap(17)[3][1].getAttribute('position').array;
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(rubbleHeap(18)[3][1].getAttribute('position').array)).not.toEqual(Array.from(a));
  });
});
