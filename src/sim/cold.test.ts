import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { freshNeeds } from './needs';
import { coldDay, coldExposure, frailty, HYPOTHERMIA_F, isColdHurt, PROPANE_USD, propaneDay, townHeat } from './cold';
import { heatOn, nightOf, sleepEffects } from './housing';
import type { Person } from './family';

const adult: Person = { id: 'a', first: 'Ann', last: 'Doe', age: 35, kid: false } as Person;
const baby: Person = { id: 'b', first: 'Bo', last: 'Doe', age: 1, kid: true } as Person;
const elder: Person = { id: 'c', first: 'Cal', last: 'Doe', age: 78, kid: false } as Person;

/** Days `p` lasts sleeping every night at `effF` in bed, resting and fed (+0.6 health a day). */
function lasts(p: Person, effF: number, limit = 120): number {
  const n = freshNeeds();
  for (let d = 1; d <= limit; d++) {
    n.health = Math.min(100, n.health + 0.6 + coldDay(p, n, effF, false, []));
    if (n.health <= 0) return d;
  }
  return Infinity;
}

/** Mid-January, out of firewood, the town gone. */
function winter(wood = false): GameState {
  const g = newGame(1, 15);
  g.disaster.tracks = { ...g.disaster.tracks, grid: 0, stores: 0, deliveries: 0, banks: 0 };
  g.heat.burned = wood ? 0 : 1;
  g.stock.firewood = wood ? 5 : 0;
  g.clock.t = 1;
  return g;
}

describe('hypothermia (survival realism, on top of the housing model)', () => {
  it('a bed above freezing never builds strain; a warm night eases it', () => {
    const n = freshNeeds();
    n.chill = 8;
    coldDay(adult, n, 50, false, []);
    expect(n.chill).toBe(0);
    expect(lasts(adult, HYPOTHERMIA_F + 1)).toBe(Infinity);
  });
  it('night after night well below freezing in bed: hypothermia within days, the baby and the elderly first', () => {
    const a = lasts(adult, 5), b = lasts(baby, 5), e = lasts(elder, 5);
    expect(a).toBeLessThan(60);
    expect(b).toBeLessThan(a);
    expect(e).toBeLessThan(a);
    expect(frailty(baby, 'cold')).toBe(2);
  });
  it('shows on the Family tab while it lasts and ends within a day or two of being warm', () => {
    const n = freshNeeds(), said: string[] = [];
    for (let d = 0; d < 3; d++) coldDay(adult, n, 0, false, said);
    expect(n.hurt.some(h => isColdHurt(h.what))).toBe(true);
    expect(said.some(l => l.includes('hypothermic'))).toBe(true);
    coldDay(adult, n, 60, false, said);
    coldDay(adult, n, 60, false, said);
    expect(n.hurt.some(h => isColdHurt(h.what))).toBe(false);
    expect(said.some(l => l.includes('warmed up'))).toBe(true);
  });
  it('Cozy takes health but never more than a point a day', () => {
    const n = freshNeeds();
    n.chill = 40;
    expect(coldDay(adult, n, 0, true, [])).toBeGreaterThanOrEqual(-1);
  });
  it('the housing model reports how warm it is in bed, colder without the stove', () => {
    const g = newGame(2, 15);
    g.structures.push({ id: 'h', kind: 'timber_cabin', x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    g.disaster.tracks = { ...g.disaster.tracks, stores: 0, deliveries: 0, grid: 0 };
    g.stock.firewood = 0; g.heat.burned = 1;
    const cold = sleepEffects(g).get(0)!.effF;
    g.stock.firewood = 5; g.heat.burned = 0;
    const warm = sleepEffects(g).get(0)!.effF;
    expect(warm).toBeGreaterThan(cold + 20);
    expect(nightOf(g, 0, true).lowF).toBeLessThan(40);
  });
});

describe('while the town works nobody freezes', () => {
  it('propane heaters from the farm store when the woodpile is bare: no frostbite, a bill', () => {
    const g = winter();
    g.disaster.tracks = { ...g.disaster.tracks, stores: 1, deliveries: 1 };
    expect(townHeat(g)).toBe('propane');
    expect(heatOn(g)).toBe(true);
    expect(coldExposure(g)).toBe(0);
    g.money = 1000;
    propaneDay(g);
    expect(g.money).toBeLessThan(1000);
    expect(g.money).toBeGreaterThan(1000 - 2 * PROPANE_USD);
  });
  it('after the collapse, with no wood, the house is cold and the frostbite risk is real', () => {
    const g = winter();
    expect(townHeat(g)).toBeNull();
    expect(heatOn(g)).toBe(false);
    expect(coldExposure(g)).toBeGreaterThan(0.3);
  });
  it('with wood in the stove there is nothing to add', () => {
    expect(townHeat(winter(true))).toBeNull();
    expect(heatOn(winter(true))).toBe(true);
  });
  it('broke, there is no propane bill (energy assistance)', () => {
    const g = winter();
    g.disaster.tracks = { ...g.disaster.tracks, stores: 1, deliveries: 1 };
    g.money = 0;
    propaneDay(g);
    expect(g.money).toBe(0);
  });
});
