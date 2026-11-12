import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LivestockRenderer } from './LivestockRenderer';
import type { Home } from './livestockPlan';
import { animalRoute } from '../paths/groundMovers';

const homes: Home[] = [
  { id: 'barn_out', kind: 'barn', x: 40, z: 0, rot: 0, w: 3, d: 4, depth: 0 },
  { id: 'barn_in', kind: 'barn', x: 10, z: 0, rot: 2, w: 3, d: 4, depth: 2 },
];
const house: [number, number] = [8, 6];
const c = (over = {}) => ({ hour: 11, raided: false, storm: false, house, clock: 5, ...over });
const flat = () => 0;
/** a wall across x = 25 from z = -30 to 30 (no gap: a barn lies on each side) */
const wall = (x: number, z: number) => Math.abs(x - 25) < 0.3 && Math.abs(z) < 30;
const ctx = { ground: flat, via: (_k: string, a: [number, number], b: [number, number]) => animalRoute(a, b, wall, undefined, 0.14, 1.3) };

describe('the herd on the route network', () => {
  it('is turned out by day, driven to the innermost barn on a raid, never over the wall', () => {
    const r = new LivestockRenderer(new THREE.Scene());
    const stock = { goat: 3, cow: 2 };
    let crossed = false;
    const step = (n: number, h = c()) => { for (let i = 0; i < n; i++) { r.update(0.1, stock, 0, homes, h, ctx, 1); for (const a of r.animals()) if (wall(a.x, a.z)) crossed = true; } };
    step(300);
    const day = r.animals();
    expect(day).toHaveLength(5);
    expect(day.every(a => !a.inside)).toBe(true);
    // the raid: every one goes in at the inner barn (x about 10), the ones by the far barn go round the wall's end or stay (no way: they wait)
    step(1500, c({ raided: true }));
    const raid = r.animals();
    expect(crossed).toBe(false);
    for (const a of raid) { if (a.x < 25) expect(a.inside).toBe(true); }
    expect(raid.filter(a => a.inside).length).toBeGreaterThan(0);
  });
  it('hens are shut in at night and out by day', () => {
    const r = new LivestockRenderer(new THREE.Scene());
    const coop: Home[] = [{ id: 'coop', kind: 'chicken_coop', x: 12, z: 6, rot: 0, w: 1.5, d: 1.5, depth: 1 }];
    for (let i = 0; i < 200; i++) r.update(0.1, {}, 1, coop, c(), ctx, 1);
    expect(r.animals().every(a => !a.inside)).toBe(true);
    for (let i = 0; i < 600; i++) r.update(0.1, {}, 1, coop, c({ hour: 23 }), ctx, 1);
    expect(r.animals().every(a => a.inside)).toBe(true);
  });
});

describe('a creek between the barns', () => {
  it('on a raid the animals go to the barn they can reach, not the one across the water', () => {
    const creek = (x: number) => Math.abs(x - 25) < 0.5;          // runs the whole way: no crossing
    const via = (_k: string, a: [number, number], b: [number, number]) => animalRoute(a, b, (x, z) => creek(x) || (z > 100), undefined, 0.14, 1.3);
    const two: Home[] = [
      { id: 'near_far', kind: 'barn', x: 40, z: 0, rot: 0, w: 3, d: 4, depth: 0 },       // across the creek, but the nearer one to the house
      { id: 'mine', kind: 'barn', x: 10, z: 0, rot: 0, w: 3, d: 4, depth: 0 },
    ];
    const r = new LivestockRenderer(new THREE.Scene());
    for (let i = 0; i < 100; i++) r.update(0.1, { goat: 4 }, 0, two, c({ house: [38, 4] }), { ground: flat, via }, 1);
    // they start by the barn each prefers by day; now the alarm
    for (let i = 0; i < 2500; i++) r.update(0.1, { goat: 4 }, 0, two, c({ raided: true, house: [38, 4] }), { ground: flat, via }, 1);
    for (const a of r.animals()) { if (a.x < 25) expect(a.inside).toBe(true); expect(Math.abs(a.x - 25)).toBeGreaterThan(0.4); }
  });
});

describe('the herd is spread out', () => {
  it('no two animals in the field are sent to the same spot, and none to the strip the barn stands on', () => {
    const r = new LivestockRenderer(new THREE.Scene());
    const stock = { cow: 8, sheep: 8, pig: 8, goat: 8 };
    const one: Home[] = [{ id: 'b', kind: 'barn', x: 10, z: 0, rot: 0, w: 3, d: 4, depth: 0 }];
    for (let i = 0; i < 4000; i++) r.update(0.1, stock, 0, one, c({ clock: 5 }), ctx, 1);
    const out = r.animals().filter(a => !a.inside);
    expect(out.length).toBe(32);
    let min = Infinity;
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) min = Math.min(min, Math.hypot(out[i].x - out[j].x, out[i].z - out[j].z));
    expect(min).toBeGreaterThan(0.12);
  });
});
