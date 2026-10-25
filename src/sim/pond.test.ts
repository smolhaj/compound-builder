import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { capacity, FISHES, pondDay, stockPond, yearLimit } from './pond';
import { siteProblem, CLASSIC } from './site';
import { MAPLE_REGIONS, mapleDay, sapSeason, sugarbush, tapsOut, SAP_TO_SYRUP } from './maple';
import { foodUnits } from './pantry';

const withPond = (doy = 150) => {
  const g = newGame(2, doy);
  g.structures.push({ id: 'p', kind: 'pond', x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
  g.stock.fishing_gear = 1;
  return g;
};
const year = (g: GameState, fn: (g: GameState) => number) => { let k = 0; for (let d = 0; d < 365; d++) { g.clock.t += 1; k += fn(g); } return k; };

describe('the pond', () => {
  it('holds water only with a creek, a spring, a high water table or rain', () => {
    expect(siteProblem({ ...CLASSIC, creek: false, spring: false, gwDepth: 40 }, 'pond')).toMatch(/won't hold water/);
    expect(siteProblem({ ...CLASSIC, creek: true }, 'pond')).toBeNull();
    expect(siteProblem({ ...CLASSIC, creek: false, spring: false, gwDepth: 40, region: 'appalachia' }, 'pond')).toBeNull();
  });

  it('stocked, it gives nothing the first year, then a steady catch held to what it can make again', () => {
    const g = withPond();
    g.stock.fingerlings = 1;
    expect(stockPond(g)).toMatch(/Stocked/);
    const first = year(g, x => pondDay(x, true));
    expect(first).toBeLessThan(1000);
    const second = year(g, x => pondDay(x, true));
    expect(second).toBeGreaterThan(1500);
    expect(second).toBeLessThan(15_000);
    for (const f of FISHES) expect(g.farm.pond!.taken[f]).toBeLessThanOrEqual(yearLimit(g.farm.pond!, f) + 1e-6);
    // and it holds: the third year about the same
    const third = year(g, x => pondDay(x, true));
    expect(third).toBeGreaterThan(second * 0.6);
  });

  it('fished hard it crashes; fed, the catfish carry more', () => {
    const g = withPond(); g.stock.fingerlings = 1; stockPond(g);
    year(g, x => pondDay(x, true));
    g.farm.pond!.hard = true;
    year(g, x => pondDay(x, true)); year(g, x => pondDay(x, true));
    expect(g.farm.pond!.lb.bluegill).toBeLessThan(capacity(g.farm.pond!, 'bluegill') * 0.35);
    const p = withPond(); p.stock.fingerlings = 1; stockPond(p);
    p.farm.pond!.feed = true;
    expect(capacity(p.farm.pond!, 'catfish')).toBeGreaterThan(capacity({ ...p.farm.pond!, feed: false }, 'catfish'));
  });
});

describe('maple sugaring', () => {
  const north = (doy: number) => newGame(4, doy, 2027, { site: { ...CLASSIC, region: 'upper_midwest', timber: 1 } });
  it('only where sugar maples grow', () => {
    expect(MAPLE_REGIONS.has('mountain_west')).toBe(false);
    expect(sugarbush(newGame(1))).toBe(0);
    expect(sugarbush(north(1))).toBeGreaterThan(100);
    expect(siteProblem({ ...CLASSIC }, 'sugar_shack')).toMatch(/No sugar maples/);
  });

  it('a season of 50 taps: about 10 gallons of sap a tap, boiled 40:1 into a dozen gallons of syrup, with firewood', () => {
    const [a] = sapSeason(north(1));
    const g = north(a - 1);
    g.stock.maple_taps = 2; g.farm.maple.taps = 50; g.stock.firewood = 10;
    g.structures.push({ id: 's', kind: 'sugar_shack', x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    expect(tapsOut(g)).toBe(50);
    let kcal = 0;
    for (let d = 0; d < 70; d++) { g.clock.t += 1; kcal += mapleDay(g); }
    const m = g.farm.maple;
    expect(m.gathered / 50).toBeGreaterThan(6);
    expect(m.gathered / 50).toBeLessThan(15);
    expect(m.syrup).toBeGreaterThan(m.gathered / SAP_TO_SYRUP * 0.8);
    expect(foodUnits(g, 'maple_syrup')).toBeCloseTo(m.syrup, 5);
    expect(kcal).toBeGreaterThan(80_000);
    expect(g.stock.firewood).toBeLessThan(10);
  });

  it('without firewood the sap waits, and sours', () => {
    const [a] = sapSeason(north(1));
    const g = north(a - 1);
    g.stock.maple_taps = 1; g.farm.maple.taps = 25; g.stock.firewood = 0;
    for (let d = 0; d < 40; d++) { g.clock.t += 1; mapleDay(g); }
    expect(g.farm.maple.syrup).toBe(0);
    expect(g.farm.maple.sap).toBeLessThan(g.farm.maple.gathered * 0.5);
  });
});
