import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { addFood, foodUnits, newPantry } from './pantry';
import { dishLines, kitchenOf, putByDay, putUpMeat, tableQuality, toggleMethod, moraleOf, capacities } from './kitchen';
import { cellarCapacity, cellarDay, cellarTempC, binShrink, freshSpoilRate, overflow, shelveRoots, crowdDay } from './storage';

const built = (g: GameState, id: string, kind: string): Structure => {
  const st: Structure = { id, kind, x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: -100 };
  g.structures.push(st);
  return st;
};
const home = () => { const g = newGame(1, 250); built(g, 'h', 'timber_cabin'); g.disaster.tracks = { ...g.disaster.tracks, stores: 0 }; return g; };

describe('kitchen', () => {
  it('without a canner only the high-acid third is water-bath canned, one case a day', () => {
    const g = home(); g.stock.fresh = 200; g.stock.lids = 24;
    putByDay(g, 8000, 1);
    expect(foodUnits(g, 'home_canned')).toBeCloseTo(0.85);
    expect(g.stock.lids).toBe(23);
  });

  it('a pressure canner takes two cases, and the cook\'s day gates it', () => {
    const g = home(); g.stock.fresh = 200; g.stock.lids = 24; g.stock.canner = 1;
    putByDay(g, 8000, 0);
    expect(foodUnits(g, 'home_canned')).toBe(0);
    putByDay(g, 8000, 1);
    expect(foodUnits(g, 'home_canned')).toBeCloseTo(1.7);
  });

  it('the glut also goes to the dehydrator and the crocks, no lids needed', () => {
    const g = home(); g.stock.fresh = 200; g.stock.dehydrator = 1; g.stock.crocks = 1;
    g.utilities.lit.push('h');
    addFood(g, 'salt', 2);
    putByDay(g, 8000, 1);
    expect(foodUnits(g, 'dried_produce')).toBeGreaterThan(0);
    expect(foodUnits(g, 'ferments')).toBeGreaterThan(0);
    expect(foodUnits(g, 'salt')).toBeLessThan(2);
  });

  it('meat goes to the freezer, smoker, salt barrel, canner, else the table, in that order', () => {
    const g = home(); g.stock.fresh = 0; addFood(g, 'salt', 2);
    g.clock.startDoy = 20; g.clock.t = 0;     // January: cold enough to cure
    expect(putUpMeat(g, 50_000, { freezer: true }).where).toBe('freezer');
    g.stock.smoker = 1;
    expect(putUpMeat(g, 50_000).where).toBe('smoked');
    g.stock.smoker = 0;
    const cured = putUpMeat(g, 50_000, { pork: true });
    expect(cured.where).toBe('cured');
    expect(cured.kept).toBeCloseTo(45_000);
    expect(foodUnits(g, 'cured_meat')).toBeGreaterThan(0);
    toggleMethod(g, 'curing');
    expect(putUpMeat(g, 50_000).where).toBe('fresh');
    expect(kitchenOf(g).off).toContain('curing');
  });

  it('the table: beans and rice are plain, a stocked kitchen sets a better one', () => {
    const g = home(); g.pantry = newPantry(); g.stock.canned = 0;
    addFood(g, 'rice_bag', 1); addFood(g, 'black_beans', 1);
    const plain = tableQuality(g);
    expect(plain.dishes).toEqual(['Beans and rice']);
    expect(moraleOf(plain.q)).toBeLessThanOrEqual(0.2);
    addFood(g, 'cellar_roots', 2); addFood(g, 'lard', 1); addFood(g, 'salt', 1); addFood(g, 'canned_meat', 1);
    built(g, 'o', 'wood_oven');
    const rich = tableQuality(g);
    expect(rich.q).toBeGreaterThan(plain.q + 0.15);
    expect(dishLines(g).find(l => l.dish.id === 'roast')!.ok).toBe(true);
    expect(dishLines(g).find(l => l.dish.id === 'pancakes')!.missing).not.toBeNull();
  });

  it('capacities say why a method is out', () => {
    const g = home();
    const c = capacities(g, 1);
    expect(c.find(x => x.method === 'canning')!.why).toMatch(/canner/);
    expect(c.find(x => x.method === 'fermenting')!.why).toMatch(/crocks/);
  });
});

describe('storage', () => {
  it('the harvest goes into the cellar bins while there is room; the rest is left over', () => {
    const g = home();
    expect(shelveRoots(g, 100_000)).toBe(100_000);
    built(g, 'c', 'root_cellar');
    expect(cellarCapacity(g)).toBe(2_500_000);
    expect(shelveRoots(g, 3_000_000)).toBeCloseTo(500_000);
    expect(g.stock.canned).toBeGreaterThan(0);
  });

  it('bins shrink with the cellar\'s temperature: slow in winter, fast in August; power cools it', () => {
    const g = home(); const c = built(g, 'c', 'root_cellar');
    const winter = cellarTempC(g, 20), summer = cellarTempC(g, 230);
    expect(summer).toBeGreaterThan(winter + 3);
    expect(binShrink(summer)).toBeGreaterThan(binShrink(winter) * 2);
    g.utilities.lit.push(c.id);
    expect(cellarTempC(g, 230)).toBeLessThan(summer);
  });

  it('fresh food keeps better in a cellar than a kitchen', () => {
    const g = home();
    expect(freshSpoilRate(g)).toBe(0.08);
    built(g, 'c', 'root_cellar');
    expect(freshSpoilRate(g)).toBeLessThan(0.03);
  });

  it('a daily shrink takes roots out of the bin and the aggregate together', () => {
    const g = home(); built(g, 'c', 'root_cellar');
    shelveRoots(g, 400_000);
    const before = foodUnits(g, 'cellar_roots'), agg = g.stock.canned;
    cellarDay(g);
    expect(foodUnits(g, 'cellar_roots')).toBeLessThan(before);
    expect(g.stock.canned).toBeLessThan(agg);
  });

  it('stores past the shelves crowd the pantry', () => {
    const g = home();
    addFood(g, 'rice_bag', 200);       // 16 million kcal in a cabin
    expect(overflow(g)).toBeGreaterThan(0.5);
    crowdDay(g);
    expect(g.pantry.crowd).toBeGreaterThan(0.1);
  });
});
