import { describe, expect, it } from 'vitest';
import { moatPools, weirTop } from './moatLevel';

describe('level moat water', () => {
  const lift = 0.25, tol = 0.12;
  const ramp = (n: number, slope: number, h = 0.35) => Array.from({ length: n }, (_, i) => 10 + i * h * slope);

  it('level ground is one pool at one level', () => {
    const p = moatPools(Array(20).fill(5), lift, tol);
    expect(p.breaks).toEqual([]);
    expect(new Set(p.level).size).toBe(1);
    expect(p.level[0]).toBeCloseTo(5.25, 9);
  });
  it('a hillside is a chain of level pools, each flat, never a ribbon that climbs', () => {
    const bed = ramp(40, 0.1);                       // 10 % fall over 14 units
    const p = moatPools(bed, lift, tol);
    expect(p.breaks.length).toBeGreaterThan(2);
    for (let i = 1; i < bed.length; i++) if (p.pool[i] === p.pool[i - 1]) expect(p.level[i]).toBe(p.level[i - 1]);
    // the surface is never a slope: the biggest rise of the surface along a pool is zero, and a step between pools is a weir
    for (const b of p.breaks) expect(p.level[b]).not.toBe(p.level[b - 1]);
  });
  it('the water is always over the bed and never deeper than the lift', () => {
    for (const slope of [0, 0.03, 0.1, 0.15, 0.3]) {
      const bed = ramp(60, slope), p = moatPools(bed, lift, tol);
      bed.forEach((b, i) => { expect(p.level[i] - b).toBeGreaterThanOrEqual(lift - tol - 1e-9); expect(p.level[i] - b).toBeLessThanOrEqual(lift + 1e-9); });
    }
  });
  it('a pool is as long as the ground allows: gentle ground needs few weirs, steep ground many', () => {
    expect(moatPools(ramp(60, 0.03), lift, tol).breaks.length).toBeLessThan(moatPools(ramp(60, 0.15), lift, tol).breaks.length);
  });
  it('a weir reaches the higher of the two surfaces', () => { expect(weirTop(5.2, 5.5)).toBeGreaterThan(5.5); });
  it('handles an empty and a single-sample run', () => {
    expect(moatPools([], lift, tol).level).toEqual([]);
    expect(moatPools([3], lift, tol).level).toEqual([3.25]);
  });
});
