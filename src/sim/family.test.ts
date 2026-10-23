import { describe, expect, it } from 'vitest';
import { buildRate, generateFamily, workHoursPerDay } from './family';

describe('generateFamily', () => {
  it('is 2 adults + 2 kids sharing a surname, deterministic per seed', () => {
    for (const seed of [1, 2, 3, 99]) {
      const f = generateFamily(seed);
      expect(f.filter(p => !p.kid)).toHaveLength(2);
      expect(f.filter(p => p.kid)).toHaveLength(2);
      expect(new Set(f.map(p => p.last)).size).toBe(1);
      expect(new Set(f.map(p => p.first)).size).toBe(4);
      expect(generateFamily(seed)).toEqual(f);
      for (const p of f) expect(p.kid ? p.age < 18 : p.age >= 25).toBe(true);
    }
  });

  it('gives the adults different lead skills, one of them a builder', () => {
    const f = generateFamily(7);
    const [a, b] = f.filter(p => !p.kid);
    expect(Math.max(a.skills.builder, b.skills.builder)).toBeGreaterThanOrEqual(6);
    expect(Math.max(a.skills.gardener, a.skills.medic, b.skills.gardener, b.skills.medic)).toBeGreaterThanOrEqual(4);
  });

  it('adults out-build kids, and kids give fewer hours', () => {
    const f = generateFamily(3);
    const adult = f.find(p => !p.kid)!, kid = f.find(p => p.kid)!;
    expect(buildRate(adult)).toBeGreaterThan(buildRate(kid));
    expect(workHoursPerDay(adult)).toBeGreaterThan(workHoursPerDay(kid));
  });
});
