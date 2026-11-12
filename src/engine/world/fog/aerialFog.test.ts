import { describe, expect, it } from 'vitest';
import { weatherFogAerialScale } from './aerialFog';

describe('weatherFogAerialScale', () => {
  it('keeps the full weather fog at eye level', () => {
    expect(weatherFogAerialScale(0.3)).toBe(1);
    expect(weatherFogAerialScale(4)).toBe(1);
  });
  it('fades monotonically to a readable floor from the air', () => {
    let prev = 1;
    for (let h = 4; h <= 40; h += 2) { const k = weatherFogAerialScale(h); expect(k).toBeLessThanOrEqual(prev + 1e-9); prev = k; }
    expect(weatherFogAerialScale(40)).toBeCloseTo(0.18, 5);
    expect(weatherFogAerialScale(40)).toBeGreaterThan(0);
  });
});
