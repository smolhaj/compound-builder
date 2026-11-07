import { describe, expect, it } from 'vitest';
import { poolRadius, spatter, stain, woundSpot } from './bloodFx';

describe('blood', () => {
  it('a pool spreads and then stops, and never passes its limit', () => {
    expect(poolRadius(0, 0.12)).toBe(0);
    expect(poolRadius(2, 0.12)).toBeGreaterThan(poolRadius(1, 0.12));
    expect(poolRadius(60, 0.12)).toBeLessThanOrEqual(0.12);
    expect(poolRadius(60, 0.12) - poolRadius(20, 0.12)).toBeLessThan(0.001);
  });
  it('spatter lands behind the hit, small, deterministic', () => {
    const a = spatter(3, 1, 1, { x: 0, z: 1 }, true), b = spatter(3, 1, 1, { x: 0, z: 1 }, true);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(4);
    for (const p of a) { expect(p.z).toBeGreaterThan(1); expect(p.r).toBeLessThan(0.05); expect(Math.hypot(p.x - 1, p.z - 1)).toBeLessThan(0.45); }
  });
  it('graphic stains deeper than restrained, and a worse wound stains more', () => {
    expect(stain(0.5, true)).toBeGreaterThan(stain(0.5, false));
    expect(stain(1, true)).toBeGreaterThan(stain(0.3, true));
  });
  it('wound patches sit where the wound is', () => {
    expect(woundSpot('head', false).h).toBeGreaterThan(woundSpot('torso', false).h);
    expect(woundSpot('torso', false).h).toBeGreaterThan(woundSpot('leg', false).h);
    expect(woundSpot('torso', true).h).toBeLessThan(woundSpot('torso', false).h);
  });
});
