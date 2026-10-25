import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { keeping, LIFE, shelfDay } from './shelf';

const days = (g: ReturnType<typeof newGame>, n: number) => { for (let d = 0; d < n; d++) { g.clock.t = d; shelfDay(g); } };

describe('shelf life and pests', () => {
  it('stores age; new stock comes in fresh and pulls the average down', () => {
    const g = newGame(1);
    g.stock.canned = 10; g.stock.traps = 0;
    days(g, 100);
    expect(keeping(g, 'canned').age).toBeCloseTo(100, 0);
    g.stock.canned = 20;
    shelfDay(g);
    expect(g.shelf.age.canned).toBeLessThan(55);
  });

  it('past its shelf life a good spoils slowly; gas goes stale in six months unless stabilized', () => {
    const g = newGame(1);
    g.stock.fuel = 10; g.stock.traps = 100;
    days(g, 400);
    expect(g.stock.fuel).toBeLessThan(10 * Math.pow(1 - LIFE.fuel.loss, 200) + 0.01);
    const h = newGame(1);
    h.stock.fuel = 10; h.stock.stabilizer = 1; h.stock.traps = 100;
    days(h, 400);
    expect(h.stock.fuel).toBe(10);
  });

  it('rotating the pantry while town is open keeps the stores young', () => {
    const g = newGame(1);
    g.stock.canned = 50; g.shelf.rotate = true; g.stock.traps = 100;
    days(g, 2000);
    expect(keeping(g, 'canned').tone).toBe('good');
    expect(g.stock.canned).toBe(50);
  });

  it('mice get into the staples and seed without traps (not in a concrete storeroom); traps keep them out', () => {
    const g = newGame(1);
    g.stock.staples = 100; g.stock.seed = 10;
    days(g, 365);
    expect(g.stock.staples).toBeLessThan(90);
    const h = newGame(1);
    h.stock.staples = 100; h.stock.traps = 7;
    days(h, 365);
    // (the flour in the mix goes rancid in a warm house inside the year: that's not the mice)
    expect(h.stock.staples).toBeGreaterThan(95);
    expect(h.stock.staples).toBeGreaterThan(g.stock.staples + 5);
    const v = newGame(1);
    v.stock.staples = 100;
    v.structures.push({ id: 'v', kind: 'bunker_stores', x: 1, z: 1, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    days(v, 365);
    expect(v.stock.staples).toBe(100);
  });
});
