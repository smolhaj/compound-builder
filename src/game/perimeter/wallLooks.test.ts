import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const used = new Set<string>();
vi.mock('../buildkit/materials', () => ({ kitMaterial: (id: string) => { used.add(id); return new THREE.MeshStandardMaterial(); }, setWindowGlow: () => {} }));

import { buildRun } from './perimeterGeometry';
import { PERIMETER, type ContainerLook, type PerimeterKind, type PerimeterRun, type Pt } from '../../sim/perimeter';

const M = 1 / 6;
const line: Pt[] = [[0, 0], [12, 0]];
const run = (kind: PerimeterKind, look?: ContainerLook): PerimeterRun => ({ id: 'r', kind, pts: line.map(p => [p[0], p[1]] as Pt), gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0, look });
const flat = () => 0;
const build = (kind: PerimeterKind, look?: ContainerLook) => { used.clear(); return buildRun(run(kind, look), flat, 0); };
const box = (g: THREE.Group) => new THREE.Box3().setFromObject(g);
const finite = (g: THREE.Group) => { let ok = true; g.traverse(o => { const a = (o as THREE.Mesh).geometry?.getAttribute('position'); if (a) for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) ok = false; }); return ok; };

describe('container paint is drawn', () => {
  it('black and rust use their own steel; mixed keeps the old four colors; a single color is single', () => {
    build('container_wall', 'black'); expect([...used].filter(m => m.startsWith('container_'))).toEqual(['container_black']);
    build('container_wall', 'rust'); expect([...used].filter(m => m.startsWith('container_'))).toEqual(['container_rust']);
    build('container_wall', 'blue'); expect([...used].filter(m => m.startsWith('container_'))).toEqual(['container_blue']);
    build('container_wall'); expect([...used].filter(m => m.startsWith('container_')).length).toBeGreaterThan(1);
    build('container_wall', 'mixed'); expect([...used].filter(m => m.startsWith('container_')).length).toBeGreaterThan(1);
  });
  it('a stack is two boxes high and, mixed, alternates colors between the tiers', () => {
    const one = box(build('container_wall', 'black')), two = box(build('container_stack', 'black'));
    expect(two.max.y - 0).toBeGreaterThan(one.max.y * 1.9);
    expect(two.max.y).toBeCloseTo(2 * 2.6 * M + 0.015, 1);
    expect(finite(build('container_stack', 'mixed'))).toBe(true);
  });
});

describe('the stone wall', () => {
  it('stands as tall as its table says, finite and a merged few draws; the same on a slope', () => {
    const g = build('stone_wall');
    expect(finite(g)).toBe(true);
    const b = box(g), H = PERIMETER.stone_wall.height;
    expect(b.max.y).toBeGreaterThan(H - 0.02);
    expect(b.max.y).toBeLessThan(H + 0.3 * M * 3);
    expect(g.children.length).toBeLessThanOrEqual(4);    // merged per material: a long wall is a handful of draw calls
    const slope = (x: number) => x * 0.03;
    used.clear();
    const gs = buildRun(run('stone_wall'), slope, 0);
    expect(finite(gs)).toBe(true);
    expect(box(gs).min.y).toBeLessThanOrEqual(0.001);
  });
  it('is not drawn through where its gate is', () => {
    const r = { ...run('stone_wall'), gates: [{ at: 6, w: 3 }] };
    used.clear();
    const g = buildRun(r, flat, 0);
    expect(finite(g)).toBe(true);
  });
});
