import { describe, expect, it } from 'vitest';
import { LIGHT_BUDGET, LIGHT_KEEP_BONUS, lightScore, pickLights, type LightCandidate } from './lightPool';

const c = (id: string, dist: number, intensity = 0.3, was = false, weight?: number): LightCandidate => ({ id, dist, intensity, was, weight });

describe('light budget', () => {
  it('keeps every light while there are few', () => {
    const all = [c('a', 5), c('b', 50)];
    expect([...pickLights(all, 8)].sort()).toEqual(['a', 'b']);
  });
  it('keeps the budget\'s worth, nearest first', () => {
    const all = Array.from({ length: 20 }, (_, i) => c('b' + String(i).padStart(2, '0'), i * 3));
    const on = pickLights(all, 8);
    expect(on.size).toBe(8);
    for (let i = 0; i < 8; i++) expect(on.has('b' + String(i).padStart(2, '0'))).toBe(true);
  });
  it('a bright lit window beats a dim fill light at the same distance', () => {
    const on = pickLights([c('dim', 10, 0.25), c('lit', 10, 1.6), c('dim2', 10, 0.25)], 1);
    expect([...on]).toEqual(['lit']);
  });
  it('a light that cannot be seen from here (weight ~0) loses its slot', () => {
    const on = pickLights([c('house', 12, 0.4), c('bunker', 1, 0.5, false, 0.02)], 1);
    expect([...on]).toEqual(['house']);
  });
  it('hysteresis: the light that is on keeps its slot against a slightly better rival', () => {
    const slightly = c('rival', 10 * 0.97, 0.3, false);
    const mine = c('mine', 10, 0.3, true);
    expect([...pickLights([slightly, mine], 1)]).toEqual(['mine']);
    expect(lightScore({ ...mine, was: true }) / lightScore({ ...mine, was: false })).toBeCloseTo(LIGHT_KEEP_BONUS, 5);
  });
  it('a clearly better rival does take the slot', () => {
    expect([...pickLights([c('near', 1, 0.3), c('mine', 40, 0.3, true)], 1)]).toEqual(['near']);
  });
  it('the budget shrinks with the tier and is never negative', () => {
    expect(LIGHT_BUDGET.low).toBeLessThan(LIGHT_BUDGET.medium);
    expect(LIGHT_BUDGET.medium).toBeLessThan(LIGHT_BUDGET.high);
    expect(pickLights([c('a', 1)], 0).size).toBe(0);
  });
  it('is deterministic on ties', () => {
    const a = pickLights([c('x', 5), c('y', 5), c('z', 5)], 2), b = pickLights([c('z', 5), c('y', 5), c('x', 5)], 2);
    expect([...a].sort()).toEqual([...b].sort());
  });
});
