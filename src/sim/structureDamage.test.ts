import { describe, it, expect } from 'vitest';
import { buildQuality, damageFraction, damageState, repairPlan, buildProfile, type BuildProfile } from './structureDamage';
import type { Structure } from './state';

const poor: BuildProfile = { material: 0, footings: 0, roof: 0.2, hardening: 0, slope: 0.3, wealth: 0 };
const rich: BuildProfile = { material: 2, footings: 1, roof: 0.9, hardening: 0.8, slope: 0.3, wealth: 1 };

describe('structure damage (WP0 stub API)', () => {
  it('better builds and more money lose less to the same hazard', () => {
    for (const h of ['quake', 'flood', 'wind', 'ash_load', 'fire'] as const) {
      const lo = damageFraction(h, buildQuality(poor), 0.8, poor), hi = damageFraction(h, buildQuality(rich), 0.8, rich);
      expect(hi, h).toBeLessThan(lo);
    }
  });
  it('an EMP does no structural damage; damage stays in 0..1 and maps to states', () => {
    expect(damageFraction('emp', 0, 1)).toBe(0);
    expect(damageFraction('blast', 0, 5)).toBeLessThanOrEqual(1);
    expect([0, 0.1, 0.4, 0.9].map(damageState)).toEqual(['none', 'cosmetic', 'major', 'destroyed']);
  });
  it('money and crews shorten the repair', () => {
    const slow = repairPlan(0.5, 40000, 0, 0), fast = repairPlan(0.5, 40000, 1, 2);
    expect(fast.days).toBeLessThan(slow.days);
    expect(fast.cost).toBe(slow.cost);
    expect(repairPlan(0, 40000, 0, 0)).toEqual({ cost: 0, days: 0 });
  });
  it('reads a profile off a structure', () => {
    const st = { id: 'a', kind: 'cabin', x: 0, z: 0, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0, roofLost: true } as Structure;
    expect(buildProfile(st, 0.5).roof).toBe(0);
  });
});
