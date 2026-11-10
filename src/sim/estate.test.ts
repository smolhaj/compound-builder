import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { step } from './engine';
import { yearlyTax, premium } from './paperwork';
import { comfortMonthly, comfortTier, comfortTierMorale, estateFactor, hasEstate } from './estate';
import type { Difficulty } from './difficulty';

const run = (difficulty: Difficulty) => newGame(11, 105, 2027, { mode: 'scenario', peace: 'long', kind: 'financial', difficulty });

describe('Cozy later-years money sinks', () => {
  it('only Cozy has them', () => {
    expect(hasEstate(run('cozy'))).toBe(true);
    expect(hasEstate(run('standard'))).toBe(false);
    expect(hasEstate(run('hardcore'))).toBe(false);
    for (const d of ['standard', 'hardcore'] as const) { const s = run(d); s.stats.days = 2000; s.money = 1e6; expect(estateFactor(s)).toBe(1); expect(comfortTier(s)).toBe('plain'); expect(comfortTierMorale(s)).toBe(0); }
  });
  it('tax and premium are reassessed from the third year, capped', () => {
    const s = run('cozy'); s.site.price = 300_000; const base = yearlyTax(s);
    s.stats.days = 365; expect(estateFactor(s)).toBe(1);
    s.stats.days = 365 * 3; expect(estateFactor(s)).toBeCloseTo(1.2);
    expect(yearlyTax(s)).toBeGreaterThan(base);
    s.stats.days = 365 * 30; expect(estateFactor(s)).toBe(1.8);
    expect(premium(s)).toBeGreaterThanOrEqual(0);
  });
  it('the tier follows the savings from year two unless set, and costs money and lifts morale', () => {
    const s = run('cozy');
    s.stats.days = 100; s.money = 1e6; expect(comfortTier(s)).toBe('plain');
    s.stats.days = 400; expect(comfortTier(s)).toBe('gracious');
    s.money = 120_000; expect(comfortTier(s)).toBe('comfortable');
    s.money = 5_000; expect(comfortTier(s)).toBe('plain');
    s.money = 1e6; s.paper.comfort = 'plain'; expect(comfortTier(s)).toBe('plain');
    s.paper.comfort = 'gracious';
    expect(comfortMonthly(s)).toBeGreaterThan(5000);
    expect(comfortTierMorale(s)).toBeGreaterThan(2);
    const c = structuredClone(s); c.paper.comfort = 'plain';
    const a = step(s, 4), b = step(c, 4);
    expect(b.money - a.money).toBeGreaterThan(2 * comfortMonthly(s) / 30);
  });
  it('nothing is paid once the stores and banks are gone', () => {
    const s = run('cozy');
    s.paper.comfort = 'gracious'; s.disaster.tracks.stores = 0;
    expect(comfortTierMorale(s)).toBe(0);
  });
});
