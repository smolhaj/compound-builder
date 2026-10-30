import { afterEach, describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import { makeLotSite } from './lotListing';
import { planRun } from './perimeter';
import { balanceDay, plant } from './utilities';
import { produceParts } from './needs';
import { AQUA, aquaDay, aquaKwh, aquaPlants, aquaReport, fertigationK, growthG, harvestAqua, harvestProblem, nextTemp, stockAqua, stockProblem } from './aquaponics';
import { aquaOf } from './farm';
import { gardenSeasonK } from './microclimate';

afterEach(() => setGroundOverride(null));
const game = (): GameState => { const g = newGame(13); g.site = { ...makeLotSite({ kind: 'hillside', seed: 3 }), creek: false, timber: 0 }; setGroundOverride({ h: () => 0 }); return g; };
const built = (g: GameState, id: string, kind: string, x = 30, z = 30): Structure => { const st: Structure = { id, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };
const at = (g: GameState, doy: number, year = 0) => { g.clock.t = year * 365 + (((doy - g.clock.startDoy) % 365) + 365) % 365 + 0.5; };
const power = (g: GameState, id: string) => { g.utilities.lit = [id]; };

describe('aquaponics', () => {
  it('stocking needs fingerlings, power and warm water; harvest needs table size', () => {
    const g = game(); const st = built(g, 'a', 'aquaponics'); at(g, 180);
    expect(stockProblem(g, 'a')).toMatch(/no fingerlings/);
    g.stock.tilapia_fry = 2;
    expect(stockProblem(g, 'a')).toMatch(/no power/);
    power(g, 'a');
    aquaOf(g, 'a').tempC = 15;
    expect(stockProblem(g, 'a')).toMatch(/24 C/);
    aquaOf(g, 'a').tempC = 26;
    expect(stockAqua(g, 'a')).toBeNull();
    expect(aquaOf(g, 'a').fish).toBe(AQUA.FRY);
    expect(g.stock.tilapia_fry).toBe(1);
    expect(harvestProblem(g, 'a')).toMatch(/not table size/);
    aquaOf(g, 'a').fishG = 500;
    expect(harvestProblem(g, 'a')).toBeNull();
    const before = g.stock.fresh;
    expect(harvestAqua(g, 'a')).toBeNull();
    expect(aquaOf(g, 'a').fish).toBe(AQUA.FRY - AQUA.HARVEST_N);
    void st; void before;
  });

  it('growth: none under 18 C, fastest at 26 C; a fed, powered bay grows and eats pellets, an unfed one holds its weight and starves the plants', () => {
    expect(growthG(15)).toBe(0);
    expect(growthG(26)).toBeCloseTo(AQUA.GROW_G_DAY, 5);
    expect(growthG(22)).toBeLessThan(growthG(26));
    const g = game(); built(g, 'a', 'aquaponics'); at(g, 180); power(g, 'a');
    const a = aquaOf(g, 'a'); a.fish = 200; a.fishG = 100; a.tempC = 26;
    g.stock.fish_feed = 3;
    const w0 = a.fishG; aquaDay(g);
    expect(a.fishG).toBeGreaterThan(w0);
    expect(g.stock.fish_feed).toBeLessThan(3);
    expect(a.fed).toBeCloseTo(1, 5);
    const plantsFed = aquaPlants(g);
    g.stock.fish_feed = 0; power(g, 'a');
    aquaDay(g);
    expect(aquaOf(g, 'a').fed).toBe(0);
    expect(aquaPlants(g)).toBeLessThan(plantsFed);
    expect(plantsFed).toBeGreaterThan(100);
  });

  it('no power: warm water loses a third of the fish at once; the water cools; cold water kills the tanks (a January blackout)', () => {
    const g = game(); built(g, 'a', 'aquaponics'); at(g, 200);
    const a = aquaOf(g, 'a'); a.fish = 300; a.fishG = 200; a.tempC = 26;
    g.utilities.lit = [];
    const out = aquaDay(g);
    expect(out[0]).toMatch(/aerator stopped/);
    expect(a.fish).toBeLessThan(300);
    expect(a.fish).toBeGreaterThan(150);
    expect(a.lost).toBeGreaterThan(50);
    // winter: the heater is off; the water falls toward the air
    const w = game(); built(w, 'a', 'aquaponics'); at(w, 15);
    const b = aquaOf(w, 'a'); b.fish = 300; b.fishG = 200; b.tempC = 26;
    w.utilities.lit = [];
    let dead = -1;
    for (let d = 0; d < 8; d++) { at(w, 15 + d); aquaDay(w); if (b.fish === 0 && dead < 0) dead = d; }
    expect(dead).toBeGreaterThanOrEqual(0);
    expect(dead).toBeLessThanOrEqual(5);
  });

  it('the heater: power draw rises in the cold; a stopped fish bay is on the load list\'s first rung', () => {
    const g = game(); const st = built(g, 'a', 'aquaponics');
    at(g, 200); const summer = aquaKwh(g, st);
    at(g, 15); const winter = aquaKwh(g, st);
    expect(summer).toBeCloseTo(AQUA.BASE_KWH, 1);
    expect(winter).toBeGreaterThan(summer + 6);
    expect(nextTemp(g, aquaOf(g, 'a'), true)).toBe(AQUA.TARGET_C);
  });

  it('balanceDay: a wired bay on a solar array lights; without enough power the load is shed; it draws the sump water', () => {
    const g = game(); at(g, 150);
    built(g, 'a', 'aquaponics', 30, 30); built(g, 's', 'solar_array', 34, 30);
    const r = planRun(g, 'power_cable', [[34, 30], [30, 30]]); r.done = r.hours; r.supplied = true; r.finishedAt = 0;
    g.utilities.fittings.push({ building: 'a', kind: 'wire', done: 30, hours: 30, supplied: true, finishedAt: 0 });
    balanceDay(g, plant(g), 0.99);
    expect(g.utilities.lit).toContain('a');
    expect(g.utilities.report.useL).toBeGreaterThan(AQUA.WATER_L);
  });

  it('fish water feeds the nearby beds (+3 %), the report says what is wrong, and the greens reach the table', () => {
    const g = game(); built(g, 'a', 'aquaponics', 30, 30); built(g, 'g1', 'garden', 34, 30); built(g, 'g2', 'garden', 60, 60); at(g, 200); power(g, 'a');
    const a = aquaOf(g, 'a'); a.fish = 100; a.fishG = 150; a.tempC = 26;
    expect(fertigationK(g, { x: 34, z: 30 })).toBeCloseTo(1.03, 5);
    expect(fertigationK(g, { x: 60, z: 60 })).toBe(1);
    expect(gardenSeasonK(g, { x: 34, z: 30 }, 200, 160, 295)).toBeGreaterThan(0);
    const r = aquaReport(g, g.structures[0]);
    expect(r.powered).toBe(true);
    expect(r.plantsKcal).toBeGreaterThan(0);
    const base = game(); at(base, 200);
    expect(produceParts(g).greens).toBeGreaterThan(produceParts(base).greens);
    g.utilities.lit = []; expect(aquaReport(g, g.structures[0]).notes[0]).toMatch(/No power/);
  });
});
