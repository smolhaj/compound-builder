import { describe, expect, it } from 'vitest';
import { canOrder, curveLevel, DISASTERS, NEVER, newDisaster, priceFactor, tension, tracksAt, triggerDisaster, updateDisaster } from './disaster';
import { newGame } from './state';
import { step } from './engine';
import { orderProblem } from './economy';
import { migrate } from './save/migrations';

describe('collapse clock', () => {
  it('Surprise rolls a hidden disaster 3–6 years out; Scenario uses the pick; Free build never hits', () => {
    for (let seed = 1; seed < 30; seed++) {
      const d = newDisaster(seed, 'surprise');
      expect(d.kind).not.toBeNull();
      expect(d.hitAt).toBeGreaterThanOrEqual(3 * 365);
      expect(d.hitAt).toBeLessThanOrEqual(6 * 365);
      expect(d.warnAt).toBeLessThan(d.hitAt);
    }
    const sc = newDisaster(1, 'scenario', 'short', 'nuclear', 'nearby');
    expect([sc.kind, sc.variant, sc.hitAt]).toEqual(['nuclear', 'nearby', 548]);
    const fb = newDisaster(1, 'sandbox');
    expect(fb.kind).toBeNull();
    expect(fb.hitAt).toBe(NEVER);
  });

  it('runs peace → warning → impact → survival, with headlines that darken', () => {
    const d = newDisaster(4, 'scenario', 'short', 'grid_down');
    const tones: number[] = [];
    let hitLines: string[] = [];
    for (let t = 0; t <= d.hitAt + 5; t++) {
      const lines = updateDisaster(d, t + 0.01, 4);
      if (lines.length) hitLines = lines;
      if (t === Math.floor(d.warnAt) + 1) expect(d.phase).toBe('warning');
      if (d.news.length) tones.push(d.news[d.news.length - 1].tone);
    }
    expect(d.phase).toBe('survival');
    expect(hitLines[0]).toMatch(/lights go out/);
    expect(Math.max(...tones)).toBe(3);
    expect(tension(d, d.warnAt - 1)).toBe(0);
    expect(tension(d, d.hitAt)).toBe(1);
  });

  it('grid-down: services fail on the research curve, then come back', () => {
    const d = newDisaster(2, 'scenario', 'short', 'grid_down', 'ice_storm');
    const at = (days: number) => tracksAt(d, d.hitAt + days);
    expect(at(-1).grid).toBe(1);
    expect(at(0.5).grid).toBe(0);
    expect(at(5).stores).toBeLessThan(0.2);          // shelves empty in about 3 days
    expect(at(7).law).toBe(1);                       // calm the first weeks
    expect(at(28).law).toBeLessThan(0.9);            // tempers fray, first thefts
    expect(at(400).grid).toBe(1);                    // an ice storm passes
  });

  it('prices climb through the warning signs; deliveries stop after the hit', () => {
    const d = newDisaster(3, 'scenario', 'short', 'nuclear');
    expect(priceFactor(d, 0)).toBe(1);
    expect(priceFactor(d, d.hitAt - 0.5)).toBeGreaterThan(1.4);
    expect(canOrder(d, d.hitAt - 1)).toBe(true);
    expect(canOrder(d, d.hitAt + 1)).toBe(false);
  });

  it('a curve falls to its floor, holds, then ramps back', () => {
    const c = { at: 2, fall: 4, floor: 0.2, back: [20, 20] as [number, number], ramp: 10 };
    expect(curveLevel(c, 20, 1)).toBe(1);
    expect(curveLevel(c, 20, 4)).toBeCloseTo(0.6);
    expect(curveLevel(c, 20, 10)).toBeCloseTo(0.2);
    expect(curveLevel(c, 20, 25)).toBeCloseTo(0.6);
    expect(curveLevel(c, 20, 40)).toBe(1);
  });

  it('chains a follow-on sometimes (end of the rule of law after a long outage)', () => {
    let chained = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const d = newDisaster(seed, 'scenario', 'short', 'grid_down');
      for (let t = 0; t <= d.hitAt + 1; t++) updateDisaster(d, t + 0.01, seed);
      if (d.chained.some(c => c.kind === 'lawless')) chained++;
    }
    expect(chained).toBeGreaterThan(8);
    expect(chained).toBeLessThan(40);
  });

  it('Free build: nothing until triggered', () => {
    const d = newDisaster(1, 'sandbox');
    for (let t = 0; t < 50; t++) updateDisaster(d, t + 0.01, 1);
    expect(d.phase).toBe('peace');
    triggerDisaster(d, 50, 'grid_down', 1, 3);
    for (let t = 50; t < 58; t++) updateDisaster(d, t + 0.01, 1);
    expect(d.phase).toBe('survival');
  });

  it('every ruleset is complete', () => {
    for (const def of Object.values(DISASTERS)) {
      expect(def!.variants.length).toBeGreaterThan(0);
      expect(def!.hints.every(h => h.length > 0)).toBe(true);
      expect(def!.hit.length).toBeGreaterThan(0);
    }
  });
});

describe('day jobs and the hit, in the sim', () => {
  it('adults earn in town on weekdays; the jobs end when it hits; then the yard stops delivering', () => {
    let g = newGame(5, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', dayJobs: true });
    expect(g.people.filter(p => !p.kid).every(p => p.job && p.job.wage > 100)).toBe(true);
    const m0 = g.money;
    g = step(g, 7);
    expect(g.money).toBeGreaterThan(m0 + 400);   // a week: five days of two wages, less seven days of household costs
    g = step(g, g.disaster.hitAt - g.clock.t + 1);
    expect(g.disaster.phase).toBe('impact');
    expect(g.personState.every(ps => !ps.employed)).toBe(true);
    expect(orderProblem(g, [{ material: 'lumber', qty: 1 }])).toBe('no_deliveries');
  });

  it('old saves become Free build', () => {
    const s = newGame(1) as unknown as Record<string, unknown>;
    const old = JSON.parse(JSON.stringify({ ...s, version: 8 }));
    delete old.disaster;
    const m = migrate(old);
    expect(m.disaster.mode).toBe('sandbox');
    expect(m.people.filter(p => !p.kid).every(p => p.job)).toBe(true);
  });
});
