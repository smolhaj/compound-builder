import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { orderTanker, TANKER_USD, waterDay, waterPrice } from './water';
import { storageCapacity } from './utilities';
import { CLASSIC } from './site';

describe('water beyond the well', () => {
  it('totes add storage; a tanker fills it while the trucks run', () => {
    const g = newGame(1);
    g.money = 10_000;
    expect(storageCapacity(g)).toBe(0);
    expect(orderTanker(g, storageCapacity(g))).toMatch(/full/);
    g.stock.ibc_tote = 5;
    expect(storageCapacity(g)).toBe(5000);
    expect(orderTanker(g, storageCapacity(g))).toBeNull();
    expect(g.utilities.storedL).toBe(5000);
    expect(g.money).toBe(10_000 - TANKER_USD);
  });

  it('a water trailer makes town water cheaper and hauling one trip', () => {
    const g = newGame(1);
    expect(waterPrice(g)).toBe(0.03);
    g.stock.water_trailer = 1;
    expect(waterPrice(g)).toBe(0.01);
    g.utilities.hauling = true; g.utilities.haulFar = true; g.stock.firewood = 5;
    waterDay(g);
    expect(g.utilities.haulFar).toBe(false);
  });

  it('jugs cover drinking when water runs short', () => {
    const g = newGame(1);
    g.stock.water_jugs = 10;
    g.utilities.report.shortL = 500;
    waterDay(g);
    expect(g.stock.water_jugs).toBeCloseTo(10 - 16 / 19, 3);
    expect(g.utilities.report.shortL).toBe(0);
  });

  it('untreated creek water makes people sick; a filter (or boiling) prevents it', () => {
    const sick = (setup: (g: ReturnType<typeof newGame>) => void) => {
      let n = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const g = newGame(seed); setup(g);
        for (let d = 0; d < 60; d++) { g.clock.t = d; g.utilities.hauling = true; waterDay(g); }
        n += g.personState.filter(ps => ps.needs.hurt.some(h => h.what.startsWith('giardia'))).length;
      }
      return n;
    };
    expect(sick(g => { g.stock.firewood = 0; })).toBeGreaterThan(3);
    expect(sick(g => { g.stock.water_filter = 1; g.stock.firewood = 0; })).toBe(0);
    expect(sick(g => { g.stock.firewood = 10; })).toBe(0);
  });

  it('arsenic in the well wears on health without reverse osmosis', () => {
    const g = newGame(1, 105, 2027, { site: { ...CLASSIC, gwQuality: 'arsenic' } });
    g.structures.push({ id: 'w', kind: 'well_hand', x: 1, z: 1, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    const h0 = g.personState[0].needs.health;
    for (let d = 0; d < 100; d++) waterDay(g);
    expect(g.personState[0].needs.health).toBeCloseTo(h0 - 1, 1);
    g.stock.ro_system = 1;
    const h1 = g.personState[0].needs.health;
    waterDay(g);
    expect(g.personState[0].needs.health).toBe(h1);
  });
});
