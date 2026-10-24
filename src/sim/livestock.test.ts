import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { feedDemand, livestockDay, winterHay } from './livestock';

const farm = (doy: number) => { const g = newGame(7, doy, 2027); g.stock.fresh = 0; g.stock.frozen = 0; return g; };
const run = (g: ReturnType<typeof newGame>, days: number, freezer = true) => { let k = 0; const t0 = g.clock.t; for (let d = 0; d < days; d++) { g.clock.t = t0 + d; k += livestockDay(g, freezer); } return k; };

describe('livestock', () => {
  it('no animals: nothing happens', () => {
    const g = farm(150);
    expect(run(g, 30)).toBe(0);
    expect(g.livestock).toBeUndefined();
  });

  it('fed goats give milk; they go dry in midwinter', () => {
    const g = farm(150);
    g.stock.goat = 2; g.stock.hay = 100; g.stock.feed = 20;
    expect(run(g, 10)).toBeGreaterThan(20_000);
    expect(g.stock.fresh).toBeGreaterThan(10);
    const w = farm(360);
    w.stock.goat = 2; w.stock.hay = 100; w.stock.feed = 20;
    expect(run(w, 10)).toBe(0);
  });

  it('pigs go to the butcher in November, into the freezer', () => {
    const g = farm(290);
    g.stock.pig = 2; g.stock.feed = 50;
    const k = run(g, 30);
    expect(k).toBeGreaterThan(250_000);
    expect(g.stock.pig).toBe(0);
    expect(g.stock.frozen).toBeGreaterThan(25);
  });

  it('rabbits breed: fryers and a growing colony', () => {
    const g = farm(100);
    g.stock.rabbit = 3; g.stock.feed = 20;
    const k = run(g, 130);
    expect(g.stock.rabbit).toBeGreaterThan(3);
    expect(k).toBeGreaterThan(0);
  });

  it('without feed they lose condition and die', () => {
    const g = farm(20);
    g.stock.steer = 1; g.stock.goat = 1;
    expect(feedDemand(g).hay).toBeGreaterThan(0);
    run(g, 60);
    expect(g.stock.steer).toBe(0);
    expect(g.stock.goat).toBe(0);
  });

  it('winter hay scales with the herd and the winter', () => {
    const g = farm(250);
    g.stock.steer = 1;
    const one = winterHay(g);
    expect(one).toBeGreaterThan(50);
    g.stock.steer = 2;
    expect(winterHay(g)).toBeGreaterThanOrEqual(one * 2 - 1);
  });
});
