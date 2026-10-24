import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { step } from './engine';
import { placeOrder } from './economy';
import { burnRick, chimneyState, DIRTY, SEASON_DAYS, stackGreen, sweepChimney, upkeepDay, weatherDelay } from './upkeep';
import { CLASSIC, RAW } from './site';

const winterHouse = () => {
  const g = newGame(3, 15, 2027);           // mid-January
  g.money = 200_000; g.stock.firewood = 0;
  g.structures.push({ id: 'h', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
  return g;
};

describe('seasons and upkeep', () => {
  it('green wood seasons in about nine months; burning it green takes more and fouls the flue', () => {
    const g = winterHouse();
    stackGreen(g, 6);
    expect(burnRick(g)).toBe(true);
    expect(g.upkeep.creosote).toBe(3);
    expect(g.upkeep.green[0].ricks).toBeCloseTo(4.5);
    g.stock.firewood = 1;
    burnRick(g);
    expect(g.upkeep.creosote).toBe(4);
    const h = step(g, SEASON_DAYS + 2);
    expect(h.upkeep.green.length).toBe(0);
  });

  it('a dirty chimney can catch on cold days; a sweep clears it', () => {
    let fires = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = winterHouse(); g.seed = seed;
      g.upkeep.creosote = DIRTY + 40;
      for (let d = 0; d < 30 && g.upkeep.creosote > 0; d++) { g.clock.t = d; upkeepDay(g, 1, true); }
      if (g.upkeep.creosote === 0) fires++;
    }
    expect(fires).toBeGreaterThan(5);
    const g = winterHouse();
    g.upkeep.creosote = 30;
    expect(chimneyState(g)).toBe('dirty');
    const m = g.money;
    sweepChimney(g);
    expect(g.upkeep.creosote).toBe(0);
    expect(g.money).toBe(m - 250);
  });

  it('a plumbed house with no fire on a hard-freeze night: the pipes burst', () => {
    let burst = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = winterHouse(); g.seed = seed;
      g.utilities.fittings.push({ building: 'h', kind: 'plumb', done: 1, hours: 1, supplied: true, finishedAt: 0 });
      for (let d = 0; d < 5; d++) { g.clock.t = d; upkeepDay(g, 1, false); }
      if (!g.utilities.fittings.length) { burst++; expect(g.structures[0].fixes?.[0].part).toBe('plumbing'); }
    }
    expect(burst).toBeGreaterThan(10);
  });

  it('snow on a long drive delays the truck unless there is a plow; mud season holds heavy loads', () => {
    const winter = newGame(1, 20, 2027, { site: { ...CLASSIC, improvements: { ...RAW, power: true, drive: true, driveFt: 900 } } });
    expect(weatherDelay(winter, ['lumber']).days).toBeGreaterThan(1);
    winter.stock.plow = 1;
    expect(weatherDelay(winter, ['lumber']).days).toBe(0);
    const thaw = newGame(1, 130, 2027);          // Mountain West last frost ≈ day 140
    expect(weatherDelay(thaw, ['concrete']).days).toBeGreaterThan(10);
    expect(weatherDelay(thaw, ['lumber']).days).toBe(0);
    thaw.money = 50_000;
    placeOrder(thaw, [{ material: 'concrete', qty: 2 }]);
    expect(thaw.orders[0].dueAt).toBeGreaterThan(20);
    const summer = newGame(1, 200, 2027);
    expect(weatherDelay(summer, ['concrete']).days).toBe(0);
  });
});
