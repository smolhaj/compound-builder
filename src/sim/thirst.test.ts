import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { freshNeeds, liveDay, workFactor } from './needs';
import { drinkShare, dryWork, thirstDay } from './thirst';
import { balanceDay, plant } from './utilities';
import { handPumpLph, handPumpReady, HAND_PUMP_MAX_M } from './water';
import type { Person } from './family';

const adult: Person = { id: 'a', first: 'Ann', last: 'Doe', age: 35, kid: false } as Person;
const baby: Person = { id: 'b', first: 'Bo', last: 'Doe', age: 1, kid: true } as Person;
const elder: Person = { id: 'c', first: 'Cal', last: 'Doe', age: 78, kid: false } as Person;

/** Days until death with `share` of the drinking ration, resting (+0.6 a day). */
function daysToDie(p: Person, share: number, heat = 1, limit = 60): number {
  const n = freshNeeds();
  for (let d = 1; d <= limit; d++) {
    n.health = Math.min(100, n.health + 0.6 + thirstDay(p, n, share, heat, false, []));
    if (n.health <= 0) return d;
  }
  return Infinity;
}

const built = (g: GameState, id: string, kind: string, x: number, z: number): Structure => {
  const st: Structure = { id, kind, x, z, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 };
  g.structures.push(st);
  return st;
};
/** The collapse: no stores, no grid, no water trucks; a drought (the creek is dry). */
const collapse = (g: GameState) => {
  g.disaster.kind = 'drought'; g.disaster.hitAt = 0;
  g.disaster.tracks = { ...g.disaster.tracks, grid: 0, stores: 0, deliveries: 0, banks: 0 };
};

describe('thirst', () => {
  it('with nothing to drink an adult dies in 3–5 days, 2–3 in a heat wave; a baby and the elderly sooner', () => {
    const d = daysToDie(adult, 0);
    expect(d).toBeGreaterThanOrEqual(3);
    expect(d).toBeLessThanOrEqual(5);
    const hot = daysToDie(adult, 0, 1.7);
    expect(hot).toBeGreaterThanOrEqual(2);
    expect(hot).toBeLessThanOrEqual(3);
    expect(daysToDie(baby, 0)).toBeLessThan(d);
    expect(daysToDie(elder, 0)).toBeLessThanOrEqual(d);
  });

  it('weak within a day: work falls off on the first dry day', () => {
    const n = freshNeeds();
    thirstDay(adult, n, 0, 1, false, []);
    thirstDay(adult, n, 0, 1, false, []);
    expect(dryWork(n)).toBeLessThan(0.7);
    expect(workFactor(n)).toBeLessThan(0.7);
    expect(n.hurt.some(h => h.what.startsWith('dehydrated'))).toBe(true);
  });

  it('rationing: about 70 % of the ration holds you; half a ration wears you down over weeks, not days', () => {
    expect(daysToDie(adult, 0.75)).toBe(Infinity);
    const half = daysToDie(adult, 0.5);
    expect(half).toBeGreaterThan(10);
    expect(half).toBeLessThan(40);
  });

  it('drinking again brings it back in a day or two', () => {
    const n = freshNeeds();
    for (let i = 0; i < 3; i++) thirstDay(adult, n, 0, 1, false, []);
    expect(n.dry).toBeGreaterThan(8);
    thirstDay(adult, n, 1, 1, false, []); thirstDay(adult, n, 1, 1, false, []);
    expect(n.dry).toBeLessThan(1);
    thirstDay(adult, n, 1, 1, false, []);
    expect(n.hurt.length).toBe(0);
  });

  it('drinking water comes before washing and the garden', () => {
    const g = newGame(1, 172);
    const living = g.personState.length;
    g.utilities.report = { ...g.utilities.report, useL: living * 25 + 400, shortL: 400 };
    expect(drinkShare(g)).toBe(1);
    g.utilities.report.shortL = living * 25 + 400;
    expect(drinkShare(g)).toBe(0);
  });

  it('in a drought with no well and the town gone, the family is dead of thirst within a week, not 50 days', () => {
    const g = newGame(1, 172);
    collapse(g);
    built(g, 'c', 'cistern', 10, 10);
    g.stock.water_jugs = 0;
    let dead = -1;
    for (let d = 0; d < 20 && dead < 0; d++) {
      g.clock.t = d;
      balanceDay(g, plant(g), 0.5);
      liveDay(g, 0.5);
      if (g.personState.every(ps => ps.needs.died != null)) dead = d;
    }
    expect(dead).toBeGreaterThanOrEqual(2);
    expect(dead).toBeLessThanOrEqual(7);
  });
});

describe('the deep-well hand pump', () => {
  it('lifts about 1,000 L an hour from 10 m, 300 from 100 m, nothing deeper', () => {
    expect(handPumpLph(10)).toBeGreaterThan(950);
    expect(handPumpLph(100)).toBe(300);
    expect(handPumpLph(HAND_PUMP_MAX_M + 1)).toBe(0);
  });

  it('a drilled well with the power out gives water by hand, at the cost of the adults\' chore hours', () => {
    const g = newGame(1, 172);
    collapse(g);
    g.site = { ...g.site, gwDepth: 60, creek: false, spring: false };
    built(g, 'w', 'well_drilled', 10, 10);
    balanceDay(g, plant(g), 0.5);
    expect(g.utilities.report.shortL).toBeGreaterThan(0);   // no power for the submersible
    g.stock.hand_pump = 1;
    expect(handPumpReady(g)).toBe(true);
    balanceDay(g, plant(g), 0.5);
    expect(g.utilities.report.shortL).toBe(0);
    expect(g.utilities.report.handL).toBeGreaterThan(0);
    expect(g.utilities.report.handH).toBeGreaterThan(0);
    expect(g.utilities.report.handH).toBeLessThanOrEqual(3);   // two adults, an hour and a half each at most
    // nobody fit to pump: the water stops
    for (const ps of g.personState) ps.needs.health = 20;
    balanceDay(g, plant(g), 0.5);
    expect(g.utilities.report.handL).toBe(0);
  });

  it('no use past ~100 m: the desert well too deep for any hand pump', () => {
    const g = newGame(1, 172);
    collapse(g);
    g.site = { ...g.site, gwDepth: 150, creek: false, spring: false };
    built(g, 'w', 'well_drilled', 10, 10);
    g.stock.hand_pump = 1;
    expect(handPumpReady(g)).toBe(false);
    balanceDay(g, plant(g), 0.5);
    expect(g.utilities.report.handL).toBe(0);
  });
});
