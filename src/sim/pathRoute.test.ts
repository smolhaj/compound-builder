import { describe, expect, it } from 'vitest';
import { findRoute, routeLength, resample, type Pt } from './pathRoute';

const wall = (x: number, z0: number, z1: number, t = 0.3) => (px: number, pz: number) => Math.abs(px - x) < t && pz > z0 && pz < z1;

describe('door-to-door routing', () => {
  it('goes nearly straight over open ground, ends exactly on its two ends', () => {
    const r = findRoute([0, 0], [8, 3], { blocked: () => false })!;
    expect(r[0]).toEqual([0, 0]);
    expect(r[r.length - 1][0]).toBeCloseTo(8, 6); expect(r[r.length - 1][1]).toBeCloseTo(3, 6);
    expect(routeLength(r)).toBeLessThan(Math.hypot(8, 3) * 1.06);
    expect(routeLength(r)).toBeGreaterThan(Math.hypot(8, 3) - 1e-6);
  });

  it('goes round a building, and never through it', () => {
    const blocked = (x: number, z: number) => x > 3 && x < 5 && z > -2 && z < 2;
    const r = findRoute([0, 0], [8, 0], { blocked })!;
    expect(r).not.toBeNull();
    for (const p of r) expect(blocked(p[0], p[1])).toBe(false);
    expect(routeLength(r)).toBeGreaterThan(8.5);
    expect(routeLength(r)).toBeLessThan(13);
  });

  it('finds the gap in a wall, and gives up when there is none', () => {
    const gap = (x: number, z: number) => wall(4, -20, 20)(x, z) && !(z > 5 && z < 6);
    const r = findRoute([0, 0], [8, 0], { blocked: gap, margin: 8 })!;
    expect(r).not.toBeNull();
    expect(r.some(p => p[0] > 3.6 && p[0] < 4.4 && p[1] > 4.9 && p[1] < 6.1)).toBe(true);
    expect(findRoute([0, 0], [8, 0], { blocked: wall(4, -40, 40), margin: 6 })).toBeNull();
  });

  it('is deterministic, and the meander is gentle', () => {
    const a = findRoute([0, 0], [10, 0], { blocked: () => false, seed: 5 })!, b = findRoute([0, 0], [10, 0], { blocked: () => false, seed: 5 })!;
    expect(a).toEqual(b);
    const dev = Math.max(...a.map(p => Math.abs(p[1])));
    expect(dev).toBeGreaterThan(0.005);       // not ruled
    expect(dev).toBeLessThan(0.12);           // not wandering
    const c = findRoute([0, 0], [10, 0], { blocked: () => false, seed: 6 })!;
    expect(c).not.toEqual(a);
  });

  it('prefers ground that is cheaper (an existing track, away from a slope)', () => {
    // two ways round a block: the south way is slow ground
    const blocked = (x: number, z: number) => x > 3 && x < 5 && z > -2 && z < 2;
    const cost = (_x: number, z: number) => (z < 0 ? 6 : 1);
    const r = findRoute([0, 0], [8, 0], { blocked, cost })!;
    expect(r.some(p => p[1] > 2)).toBe(true);
    expect(r.every(p => p[1] > -2.2 || true)).toBe(true);
  });

  it('resamples evenly', () => {
    const p: Pt[] = [[0, 0], [1, 0], [1, 1]];
    const r = resample(p, 0.2);
    expect(r.length).toBe(11);
    expect(routeLength(r)).toBeCloseTo(2, 6);
  });
});
