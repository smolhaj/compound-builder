import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { canningToday, cannerCases, CELLAR_KCAL, cellarKcal, preserveDay, putUpMeat, storeHarvest, toCellar, TRIM } from './preserving';
import { foodUnits, FOOD, lifeDays, quality } from './pantry';
import { book, farmHours, hoursLeft, LABOR, workDay } from './farmWork';

const built = (g: GameState, id: string, kind: string): Structure => { const st: Structure = { id, kind, x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };
/** A family after the collapse with a cabin and a glut of fresh food. */
const kitchen = (doy = 240) => {
  const g = newGame(3, doy);
  g.disaster.tracks = { ...g.disaster.tracks, stores: 0, banks: 0, deliveries: 0 };
  built(g, 'h', 'timber_cabin');
  g.stock.fresh = 300; g.stock.firewood = 4;
  return g;
};
const need = 9000;

describe('preserving the harvest', () => {
  it('water-bath cans only the high-acid part; the pressure canner does the vegetables; jars, lids and heat are used', () => {
    const g = kitchen();
    g.stock.jars = 40; g.stock.lids = 40;
    preserveDay(g, need);
    const bath = foodUnits(g, 'home_canned');
    expect(bath).toBeGreaterThan(1.5);
    expect(bath).toBeLessThanOrEqual(cannerCases(g, false));
    expect(g.stock.jars).toBeCloseTo(40 - bath, 5);
    expect(g.stock.firewood).toBeLessThan(4);              // no power in the house: the cookstove
    expect(canningToday(g)).toBe(true);
    const h = kitchen();
    h.stock.jars = 40; h.stock.lids = 40; h.stock.pressure_canner = 1;
    preserveDay(h, need);
    expect(foodUnits(h, 'home_canned')).toBeGreaterThan(bath * 1.8);
    // labor: 2.5–3 person-hours a case, within the day's budget
    expect(h.farm.work.used.canning ?? 0).toBeGreaterThan(foodUnits(h, 'home_canned') * 2.4);
    expect(h.farm.work.used.canning ?? 0).toBeLessThanOrEqual(farmHours(h) + 1e-9);
  });

  it('no jars, no lids or no heat: nothing is canned', () => {
    for (const [jars, lids, wood] of [[0, 20, 4], [20, 0, 4], [20, 20, 0]]) {
      const g = kitchen();
      g.stock.jars = jars; g.stock.lids = lids; g.stock.firewood = wood; g.stock.pressure_canner = 1;
      preserveDay(g, need);
      expect(foodUnits(g, 'home_canned')).toBe(0);
    }
  });

  it('the jars come back as the food is eaten; single-use lids don\'t, reusable ones do', () => {
    const g = kitchen();
    g.stock.jars = 20; g.stock.tattler_lids = 20; g.stock.pressure_canner = 1;
    preserveDay(g, need);
    const full = foodUnits(g, 'home_canned'), jars = g.stock.jars, tl = g.stock.tattler_lids;
    expect(full).toBeGreaterThan(2);
    // eat it all
    g.pantry.items.home_canned!.q = 0; g.stock.canned = 0;
    g.clock.t += 1; g.stock.fresh = 0;
    preserveDay(g, need);
    expect(g.stock.jars).toBeCloseTo(jars + full * 0.97, 5);
    expect(g.stock.tattler_lids).toBeCloseTo(tl + full * 0.97, 5);
    // metal lids are spent
    const m = kitchen();
    m.stock.jars = 20; m.stock.lids = 20; m.stock.pressure_canner = 1;
    preserveDay(m, need);
    const used = 20 - m.stock.lids;
    m.pantry.items.home_canned!.q = 0; m.stock.canned = 0; m.clock.t += 1; m.stock.fresh = 0;
    preserveDay(m, need);
    expect(m.stock.lids).toBe(20 - used);
  });

  it('canning a case keeps about 85 % of the fresh calories (trim and failed seals)', () => {
    const g = kitchen();
    g.stock.jars = 40; g.stock.lids = 40; g.stock.pressure_canner = 1;
    const fresh0 = g.stock.fresh * 2000;
    preserveDay(g, need);
    const used = fresh0 - g.stock.fresh * 2000, kept = foodUnits(g, 'home_canned') * FOOD.home_canned.kcal;
    expect(kept / used).toBeGreaterThan(0.8);
    expect(kept / used).toBeLessThanOrEqual(TRIM + 1e-9);
  });

  it('a dehydrator needs the house\'s power; sun screens a dry summer day', () => {
    const g = kitchen(200);
    g.stock.dehydrator = 1;
    preserveDay(g, need);
    expect(foodUnits(g, 'dried_produce')).toBe(0);         // no power
    g.utilities.lit = ['h']; g.clock.t += 1;
    preserveDay(g, need);
    expect(foodUnits(g, 'dried_produce')).toBeGreaterThan(0);
    expect(g.farm.preserve.kwh).toBeGreaterThan(5);
    let sun = 0;
    for (let d = 0; d < 20; d++) { const s = kitchen(200); s.clock.t += d; s.stock.drying_screens = 1; preserveDay(s, need); sun += foodUnits(s, 'dried_produce'); }
    expect(sun).toBeGreaterThan(0);                        // the Mountain West: most summer days dry
  });

  it('the root cellar takes the potatoes, apples and late roots up to its bins; without one they go in the kitchen', () => {
    const g = kitchen();
    const f0 = g.stock.fresh;
    const fresh = storeHarvest(g, { fresh: 1000, field: 50_000, fieldDry: 0.4, orchard: 10_000, gardenKeep: 2000 });
    expect(foodUnits(g, 'home_dry') * FOOD.home_dry.kcal).toBeCloseTo(20_000);
    expect(fresh).toBeCloseTo(1000 + 30_000 + 10_000 + 2000);
    expect(g.stock.fresh - f0).toBeCloseTo(fresh / 2000);
    built(g, 'c', 'root_cellar');
    const fresh2 = storeHarvest(g, { fresh: 1000, field: 50_000, fieldDry: 0.4, orchard: 10_000, gardenKeep: 2000 });
    expect(cellarKcal(g)).toBeCloseTo(30_000 + 6000 + 2000);
    expect(fresh2).toBeCloseTo(1000 + 4000);
    // the bins fill
    expect(toCellar(g, CELLAR_KCAL)).toBeCloseTo(30_000 + 6000 + 2000);
  });

  it('cellar potatoes keep months (a little shrink a day); past their months they sprout and rot', () => {
    const g = kitchen();
    built(g, 'c', 'root_cellar');
    toCellar(g, 210_000);
    for (let d = 0; d < 90; d++) { g.clock.t += 1; preserveDay(g, need); }
    expect(foodUnits(g, 'cellar_roots')).toBeGreaterThan(9.5);
    expect(lifeDays(g, 'cellar_roots')).toBeGreaterThan(120);
    expect(lifeDays(g, 'cellar_roots')).toBeLessThan(180);
    expect(quality('cellar_roots', 90)).toBeLessThan(0.8);
  });

  it('meat: the freezer first; without power smoked, salt-cured (pork) and canned; the rest fresh', () => {
    const g = kitchen();
    expect(putUpMeat(g, 100_000, 'pork', true).freezer).toBe(100_000);
    const h = kitchen();
    h.stock.smoker = 1; h.stock.pressure_canner = 1; h.stock.jars = 30; h.stock.lids = 30;
    h.pantry.items.salt = { q: 2, age: 0 };
    const r = putUpMeat(h, 250_000, 'pork', false);
    expect(r.smoked).toBeCloseTo(100_000 * 0.8);
    expect(r.cured).toBeGreaterThan(0);
    expect(foodUnits(h, 'cured_pork')).toBeGreaterThan(0);
    expect(foodUnits(h, 'salt')).toBeLessThan(2);
    // salt ran short or the canner took the rest; nothing is lost but the trim
    expect(r.smoked + r.cured + r.canned + r.fresh).toBeLessThanOrEqual(250_000);
    expect(r.smoked + r.cured + r.canned + r.fresh).toBeGreaterThan(200_000);
    const n = kitchen();
    expect(putUpMeat(n, 50_000, 'red', false).fresh).toBe(50_000);
  });
});

describe('farm labor', () => {
  it('a budget from who is home; animal care always booked, the kitchen only what\'s left', () => {
    const g = newGame(1);
    const w = workDay(g);
    expect(w.budget).toBeGreaterThan(5);
    expect(book(g, 'animals', 100, true)).toBe(100);
    expect(hoursLeft(g)).toBe(0);
    expect(book(g, 'canning', LABOR.casePressure)).toBe(0);
    g.clock.t += 1;
    expect(hoursLeft(g)).toBeGreaterThan(5);           // a new day
  });
});
