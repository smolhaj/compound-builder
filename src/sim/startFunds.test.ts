import { describe, expect, it } from 'vitest';
import { FUNDS_RANGE, startFunds } from './startFunds';
import { generateFamily, JOB_POOL, jobDef, jobTools, randomJobId, variedFamily } from './family';
import { affordable, listings, MIN_LEFT, type Lifestyle } from './site';
import { REGION_IDS, PLAYABLE } from './regions';
import { newGame } from './state';
import { migrate } from './save/migrations';

const LIVES: Lifestyle[] = ['weekend', 'fulltime', 'independent'];

describe('starting money', () => {
  it('stays inside the lifestyle range, adds up from its lines, and is deterministic', () => {
    for (const life of LIVES) {
      const [lo, hi] = FUNDS_RANGE[life];
      for (let seed = 1; seed <= 120; seed++) {
        const { people } = variedFamily(seed, seed % 5);
        const f = startFunds(people, life, seed, seed % 5);
        expect(f.budget).toBeGreaterThanOrEqual(lo);
        expect(f.budget).toBeLessThanOrEqual(hi);
        expect(f.lines.reduce((a, l) => a + l.usd, 0)).toBe(f.budget);
        expect(f.lines.length).toBeGreaterThanOrEqual(2);
        expect(startFunds(people, life, seed, seed % 5)).toEqual(f);
        expect(life === 'independent' ? f.passive > 0 : f.passive === 0).toBe(true);
      }
    }
  });

  it('varies between families and follows the jobs and the debts', () => {
    const budgets = new Set<number>(), notes = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const f = startFunds(variedFamily(seed, 0).people, 'fulltime', seed);
      budgets.add(Math.round(f.budget / 50_000));
      f.lines.forEach(l => notes.add(l.label));
    }
    expect(budgets.size).toBeGreaterThanOrEqual(8);
    expect([...notes].some(n => /Student loans|Medical debt/.test(n))).toBe(true);
    expect([...notes].some(n => /Inheritance/.test(n))).toBe(true);
    // a pharmacist household has more to spend than a nursery-hand one, same luck
    const a = variedFamily(9, 0, ['pharmacist', 'accountant']).people, b = variedFamily(9, 0, ['nursery', 'nursery']).people;
    expect(startFunds(a, 'fulltime', 9).lines.filter(l => l.usd > 0).reduce((x, l) => x + l.usd, 0))
      .toBeGreaterThan(startFunds(b, 'fulltime', 9).lines.filter(l => l.usd > 0).reduce((x, l) => x + l.usd, 0));
  });

  it('listings give sensible choices at the low and the high end of the budget, in every region', () => {
    for (const region of REGION_IDS.filter(r => PLAYABLE.has(r))) for (const budget of [450_000, 1_100_000, 2_000_000]) {
      let cheapest = 0, seen = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const ls = listings(seed, region, undefined, 6, budget);
        const ok = ls.filter(l => affordable(l, budget));
        expect(ok.length).toBeGreaterThanOrEqual(1);
        // at the low end, something leaves at least half the money to build with (the Pacific Northwest is the tight one)
        if (budget === 450_000 && ok.some(l => budget - l.price >= budget / 2)) cheapest++;
        if (budget === 2_000_000) expect(ok.some(l => l.acres >= 40)).toBe(true);
        seen++;
        expect(budget - Math.min(...ok.map(l => l.price))).toBeGreaterThanOrEqual(MIN_LEFT);
      }
      if (budget === 450_000) expect(cheapest / seen).toBeGreaterThan(0.55);
    }
  });

  it('a new game takes its money from the breakdown, and old saves migrate', () => {
    const site = listings(3, 'mountain_west', undefined, 6, 450_000).find(l => affordable(l, 450_000))!;
    const g = newGame(3, 105, 2027, { site, lifestyle: 'fulltime' });
    expect(g.startFunds).not.toBeNull();
    expect(g.money).toBeLessThan(g.startFunds!.budget);
    const old = JSON.parse(JSON.stringify({ ...g, version: 44, startFunds: undefined }));
    delete old.startFunds;
    expect(migrate(old).startFunds).toBeNull();
  });
});

describe('occupations', () => {
  it('the pool is wide, wages are rural Mountain West, and trades have tools', () => {
    expect(JOB_POOL.length).toBeGreaterThanOrEqual(24);
    expect(new Set(JOB_POOL.map(j => j.id)).size).toBe(JOB_POOL.length);
    for (const j of JOB_POOL) { expect(j.wage).toBeGreaterThanOrEqual(120); expect(j.wage).toBeLessThanOrEqual(500); expect(j.good.length).toBeGreaterThan(10); expect(j.lead.length).toBeGreaterThan(0); }
    expect(jobTools('welder').length).toBeGreaterThan(0);
    expect(jobTools('nope')).toEqual([]);
  });

  it('families start with many different trades, and the job drives the skills', () => {
    const lead = new Map<string, number>(), firstJobs = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const { people } = variedFamily(seed, 0);
      const adults = people.filter(p => !p.kid && !p.elder);
      adults.forEach(p => {
        const d = jobDef(p.job!.id)!;
        lead.set(d.id, (lead.get(d.id) ?? 0) + 1);
        expect(p.skills[d.lead[0]]).toBeGreaterThanOrEqual(6);
      });
      firstJobs.add(adults[0].job!.id!);
      expect(Math.max(...adults.map(p => p.skills.builder))).toBeGreaterThanOrEqual(3);
      if (adults.length === 2) expect(adults[0].job!.id).not.toBe(adults[1].job!.id);
    }
    expect(lead.size).toBeGreaterThanOrEqual(22);
    expect(firstJobs.size).toBeGreaterThanOrEqual(15);
    expect(Math.max(...lead.values()) / [...lead.values()].reduce((a, b) => a + b, 0)).toBeLessThan(0.15);
    const g = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) generateFamily(seed).filter(p => !p.kid).forEach(p => g.add(p.job!.id!));
    expect(g.size).toBeGreaterThanOrEqual(12);
  });

  it('picking an adult’s job changes only that adult, never the rest of the family', () => {
    for (const seed of [2, 7, 31]) {
      const base = variedFamily(seed, 1).people;
      const picked = variedFamily(seed, 1, ['electrician']).people;
      expect(picked[0].job!.id).toBe('electrician');
      expect(picked.map(p => `${p.first}${p.age}`)).toEqual(base.map(p => `${p.first}${p.age}`));
      expect(picked.slice(1)).toEqual(base.slice(1).map((p, i) => (i === 0 && !p.kid && !p.elder ? picked[1] : p)));
      expect(randomJobId(seed, 1, 0, 3)).toBe(randomJobId(seed, 1, 0, 3));
    }
  });
});

describe('uniformed trades', () => {
  it('a soldier gets hunter with negotiator and medic; police lead with negotiator, and both keep their background', async () => {
    const { backgroundOf } = await import('./family');
    for (const [id, lead] of [['soldier', 'hunter'], ['police', 'negotiator']] as const) {
      const p = variedFamily(4, 0, [id]).people[0];
      expect(p.skills[lead]).toBeGreaterThanOrEqual(6);
      expect(p.skills.negotiator).toBeGreaterThanOrEqual(3);
      expect(p.skills.medic).toBeGreaterThanOrEqual(3);
      expect(p.skills.hunter).toBeGreaterThanOrEqual(3);
      expect(backgroundOf(p)).toBe(id === 'soldier' ? 'military' : 'police');
    }
  });
});
