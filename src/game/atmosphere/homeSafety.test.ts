import { describe, expect, it } from 'vitest';
import { collapseProgress, homeSafety, homeSafetyInput, RISE_TAU, safetyTarget, type HomeSafetyInput } from './homeSafety';
import { newGame } from '../../sim/state';
import { triggerDisaster } from '../../sim/disaster';

const calm: HomeSafetyInput = { perimeter: 1, breaches: 0, raid: 'none', power: true, heat: true, collapse: 0.8, hurt: 0, missing: 0, people: 4 };

describe('homeSafety target', () => {
  it('is 1 for a held, warm, powered compound and says so', () => {
    const r = safetyTarget(calm);
    expect(r.target).toBe(1);
    expect(r.reasons).toEqual(['The walls hold and the lights are on']);
  });
  it('is 1 in disaster-free peacetime whatever the walls are', () => {
    expect(safetyTarget({ ...calm, collapse: 0, perimeter: 0, power: false, heat: false }).target).toBe(1);
  });
  it('drops on a breach, a raid, a dead grid, no heat, a hurt or missing person, each with a reason', () => {
    const b = safetyTarget({ ...calm, breaches: 1 });
    expect(b.target).toBeLessThan(0.75);
    expect(b.reasons[0]).toMatch(/breach/i);
    expect(safetyTarget({ ...calm, raid: 'attack' }).target).toBeLessThan(0.6);
    expect(safetyTarget({ ...calm, raid: 'knock' }).target).toBeLessThan(1);
    expect(safetyTarget({ ...calm, power: false }).reasons).toContain('The power is out');
    expect(safetyTarget({ ...calm, heat: false }).reasons).toContain('There is no heat');
    expect(safetyTarget({ ...calm, hurt: 2 }).target).toBeLessThan(0.9);
    expect(safetyTarget({ ...calm, missing: 1 }).reasons).toContain('Someone is missing');
  });
  it('open walls cost more as the world falls', () => {
    const a = safetyTarget({ ...calm, perimeter: 0, collapse: 0.3 }).target;
    const z = safetyTarget({ ...calm, perimeter: 0, collapse: 1 }).target;
    expect(z).toBeLessThan(a);
  });
  it('stays in 0..1 under the worst of everything', () => {
    const w = safetyTarget({ perimeter: 0, breaches: 9, raid: 'attack', power: false, heat: false, collapse: 1, hurt: 4, missing: 4, people: 4 });
    expect(w.target).toBeGreaterThanOrEqual(0);
    expect(w.target).toBeLessThan(0.2);
  });
});

describe('homeSafety smoothing', () => {
  it('drops fast on a breach and recovers slowly once it is mended', () => {
    let lv = 1;
    const hit = { ...calm, breaches: 1, raid: 'attack' as const };
    for (let i = 0; i < 6; i++) lv = homeSafety({ ...hit, prev: lv, dt: 0.5 }).level;   // 3 s
    expect(lv).toBeLessThan(0.4);
    const low = lv;
    for (let i = 0; i < 20; i++) lv = homeSafety({ ...calm, prev: lv, dt: 0.5 }).level;   // 10 s of repairs done
    expect(lv).toBeGreaterThan(low);
    expect(lv).toBeLessThan(0.85);   // not back yet: it takes a while
    for (let i = 0; i < 200; i++) lv = homeSafety({ ...calm, prev: lv, dt: 0.5 }).level;
    expect(lv).toBeGreaterThan(0.98);
    expect(RISE_TAU).toBeGreaterThan(10);
  });
  it('has no step in a frame: a long frame moves it at most to the target', () => {
    const r = homeSafety({ ...calm, breaches: 1, prev: 1, dt: 100 });
    expect(r.level).toBeCloseTo(r.target, 2);
    expect(homeSafety({ ...calm, prev: 0.5, dt: 0 }).level).toBe(0.5);
  });
});

describe('from the real game state', () => {
  it('is peaceful at the start and reads real state afterwards', () => {
    const g = newGame(7);
    expect(collapseProgress(g)).toBe(0);
    const i = homeSafetyInput(g);
    expect(i.collapse).toBe(0);
    expect(homeSafety(i).level).toBe(1);
  });
  it('collapse progress rises from the warning to the hit and after', () => {
    const g = newGame(7);
    triggerDisaster(g.disaster, g.clock.t, 'grid_down', 7, 10);
    g.clock.t += 5;
    const warn = collapseProgress(g);
    expect(warn).toBeGreaterThan(0);
    expect(warn).toBeLessThanOrEqual(0.3);
    g.clock.t += 6;
    expect(collapseProgress(g)).toBeGreaterThanOrEqual(0.3);
    g.clock.t += 60;
    expect(collapseProgress(g)).toBeGreaterThan(warn);
    expect(collapseProgress(g)).toBeLessThanOrEqual(1);
  });
  it('a stranger at the gate shows as a knock; a live raid overrides', () => {
    const g = newGame(7);
    expect(homeSafetyInput(g).raid).toBe('none');
    expect(homeSafetyInput(g, { raid: 'attack' }).raid).toBe('attack');
  });
});
