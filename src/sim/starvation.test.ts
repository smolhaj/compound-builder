import { describe, expect, it } from 'vitest';
import { HUNGER_MAX, healthFloor, isStarvingDay, nextStarved, starveThreshold, starveWarning, STARVE_GRACE, STARVE_WARN } from './starvation';
import { newGame } from './state';
import { liveDay } from './needs';

const adult = { kid: false, age: 40, sick: false, id: 'a' };
describe('Cozy starvation rule', () => {
  it('counts consecutive starving days and resets when fed', () => {
    let d = 0;
    for (let i = 0; i < 50; i++) d = nextStarved(d, 50000, 1);
    expect(d).toBe(50);
    expect(nextStarved(d, 50000, 0.3)).toBe(0);      // ate more than half
    expect(nextStarved(d, 1000, 1)).toBe(0);         // not at starvation level
    expect(isStarvingDay(20000, 0.6)).toBe(true);
  });
  it('warns after STARVE_WARN days, not before', () => {
    expect(starveWarning('Ann', STARVE_WARN - 1)).toBeNull();
    expect(starveWarning('Ann', 45)).toContain('Ann has been starving for 45 days');
  });
  it('never kills in the first 120 days; floor 5 until the person\'s time', () => {
    for (const f of [adult, { ...adult, kid: true, age: 5 }, { ...adult, age: 80 }, { ...adult, sick: true }])
      for (let d = 0; d < STARVE_GRACE; d++) expect(healthFloor(true, d, f)).toBe(5);
  });
  it('weakest first, the rest staggered', () => {
    const kid = starveThreshold({ ...adult, kid: true, age: 6 }), old = starveThreshold({ ...adult, age: 70 }), sick = starveThreshold({ ...adult, sick: true });
    const robust = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => starveThreshold({ ...adult, id }));
    expect(Math.max(kid, old, sick)).toBeLessThan(Math.min(...robust) + 21);
    expect(starveThreshold({ ...adult, kid: true, age: 6, id: 'a' })).toBeLessThan(starveThreshold(adult));
    expect(new Set(robust).size).toBeGreaterThan(1);
    expect(healthFloor(true, 400, adult)).toBe(0);
    const th = starveThreshold(adult);
    expect(healthFloor(true, th + 25, adult)).toBeCloseTo(2.5);   // health drains over weeks, not days
  });
  it('Standard and Hardcore have no floor', () => {
    expect(healthFloor(false, 0, adult)).toBe(0);
  });
});

function idleFamily(difficulty: 'cozy' | 'standard', days: number) {
  const g = newGame(3, 105, 2027, { difficulty, mode: 'scenario' });
  g.disaster.tracks = { ...g.disaster.tracks, stores: 0, banks: 0 };
  g.stock = { ...g.stock, fresh: 0, frozen: 0, canned: 0, staples: 0 };
  const first: number[] = [];
  for (let d = 0; d < days; d++) {
    g.clock.t = d + 0.5;
    liveDay(g, 0.5);
    const dead = g.personState.filter(p => p.needs.died != null).length;
    if (dead && !first.length) first.push(d);
  }
  return { g, dead: g.personState.filter(p => p.needs.died != null).length, first: first[0], total: g.people.length };
}
describe('engine: an idle family that never stocks food', () => {
  it('Cozy: alive and warned through 120 days, then dies slowly', () => {
    const early = idleFamily('cozy', 119);
    expect(early.dead).toBe(0);
    expect(Math.max(...early.g.personState.map(p => p.needs.starved ?? 0))).toBeGreaterThanOrEqual(STARVE_WARN);
    expect(early.g.personState.every(p => p.needs.hunger <= HUNGER_MAX)).toBe(true);
    const mid = idleFamily('cozy', 135);
    const late = idleFamily('cozy', 300);
    expect(mid.dead).toBeLessThan(mid.total);          // not everyone at once
    expect(late.dead).toBeGreaterThan(0);
    expect(late.first).toBeGreaterThanOrEqual(STARVE_GRACE);
  }, 60000);
  it('Standard: starvation kills within weeks (unchanged)', () => {
    const r = idleFamily('standard', 120);
    expect(r.dead).toBeGreaterThan(0);
    expect(r.first).toBeLessThan(120);
  }, 60000);
});

describe('engine: refeeding after a lean spell', () => {
  it.each(['standard', 'cozy'] as const)('%s: a family fed again after 20 starving days recovers; nobody dies with a full pantry', difficulty => {
    const g = newGame(3, 105, 2027, { difficulty, mode: 'scenario' });
    g.disaster.tracks = { ...g.disaster.tracks, stores: 0, banks: 0 };
    g.stock = { ...g.stock, fresh: 0, frozen: 0, canned: 0, staples: 0 };
    for (let d = 0; d < 20; d++) { g.clock.t = d + 0.5; liveDay(g, 0.5); }
    for (let d = 20; d < 140; d++) { g.stock = { ...g.stock, staples: 5000, canned: 500, fresh: 200 }; g.clock.t = d + 0.5; liveDay(g, 0.5); }
    expect(g.personState.filter(p => p.needs.died != null).length).toBe(0);
    expect(Math.max(...g.personState.map(p => p.needs.hunger))).toBeLessThan(1000);
    expect(Math.min(...g.personState.map(p => p.needs.health))).toBeGreaterThan(80);
  }, 60000);
});
