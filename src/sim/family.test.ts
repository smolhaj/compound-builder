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

import { variedFamily } from './family';
import { newGame } from './state';
import { step } from './engine';

describe('varied households (setup screen, with a reroll)', () => {
  it('every shape turns up; names unique, ages sensible, only working-age adults have jobs', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed < 80; seed++) for (let roll = 0; roll < 4; roll++) {
      const { kind, people } = variedFamily(seed, roll);
      kinds.add(kind);
      expect(new Set(people.map(p => p.first)).size).toBe(people.length);
      expect(people.some(p => !p.kid && !p.elder)).toBe(true);
      for (const p of people) {
        if (p.kid) { expect(p.age).toBeGreaterThanOrEqual(2); expect(p.age).toBeLessThanOrEqual(17); expect(p.job).toBeUndefined(); }
        else if (p.elder) { expect(p.age).toBeGreaterThanOrEqual(60); expect(p.job).toBeUndefined(); }
        else expect(p.job).toBeDefined();
      }
      // parents are old enough to be parents, grandparents older than parents
      const parents = people.filter(p => !p.kid && !p.elder), kids = people.filter(p => p.kid);
      for (const k of kids) expect(Math.max(...parents.map(p => p.age)) - k.age).toBeGreaterThanOrEqual(18);
    }
    expect(kinds.size).toBe(7);
    expect(variedFamily(5, 2)).toEqual(variedFamily(5, 2));
    expect(variedFamily(5, 2)).not.toEqual(variedFamily(5, 3));
  });

  it('a new game takes the household chosen, and a grandparent works slower but the run plays', () => {
    let fam = variedFamily(1, 0);
    for (let r = 0; fam.kind !== 'four_gen'; r++) fam = variedFamily(1, r);
    let g = newGame(1, 105, 2027, { family: fam.people, dayJobs: true });
    expect(g.people.map(p => p.first)).toEqual(fam.people.map(p => p.first));
    expect(g.personState.length).toBe(fam.people.length);
    const elder = g.people.find(p => p.elder)!;
    expect(buildRate(elder)).toBeLessThan(0.6 + elder.skills.builder * 0.1);
    g = step(g, 30);
    expect(g.personState.every(ps => ps.needs.died == null)).toBe(true);
  });
});
