import { describe, expect, it } from 'vitest';
import { extraRelief, ridgePlan, ringHaze, ringPoint } from './DistantRidges';

describe('DistantRidges', () => {
  it('walks the square ring at constant Chebyshev radius and closes', () => {
    for (let k = 0; k <= 40; k++) {
      const [x, z] = ringPoint(10, -20, 2070, k / 40 % 1);
      expect(Math.max(Math.abs(x - 10), Math.abs(z + 20))).toBeCloseTo(2070, 6);
    }
    const a = ringPoint(0, 0, 100, 0), b = ringPoint(0, 0, 100, 1 - 1e-9);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-3);
  });
  it('gets hazier ring by ring and cheaper with the tier; ranges differ by region', () => {
    expect(ringHaze(0, 3)).toBeLessThan(ringHaze(1, 3));
    expect(ringHaze(2, 3)).toBeLessThan(1);
    const t = (q: 'low' | 'medium' | 'high') => { const p = ridgePlan(q); return p.rings * p.seg * 2; };
    expect(t('low')).toBeLessThan(t('medium'));
    expect(t('high')).toBeLessThan(4000);
    expect(extraRelief('mountain')).toBeGreaterThan(extraRelief('plains') * 5);
  });
});
