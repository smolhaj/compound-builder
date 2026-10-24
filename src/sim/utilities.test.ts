import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { planRun } from './perimeter';
import { addFitWork, balanceDay, fitProblem, networks, orderFit, plant, serviceOf, sunHours } from './utilities';
import { step } from './engine';

const built = (g: GameState, id: string, kind: string, x: number, z: number): Structure => {
  const st: Structure = { id, kind, x, z, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 };
  g.structures.push(st);
  return st;
};
const line = (g: GameState, kind: 'water_pipe' | 'power_cable', pts: Array<[number, number]>) => { const r = planRun(g, kind, pts); r.done = r.hours; r.supplied = true; r.finishedAt = 0; return r; };

describe('utilities', () => {
  it('lines join buildings into networks; unconnected ones stay apart', () => {
    const nodes = [{ id: 'a', kind: 'x', x: 0, z: 0, r: 0.3 }, { id: 'b', kind: 'x', x: 5, z: 0, r: 0.3 }, { id: 'c', kind: 'x', x: 0, z: 9, r: 0.3 }];
    const g = newGame(1);
    const r = line(g, 'water_pipe', [[0, 0], [5, 0]]);
    const n = networks(nodes, [r]);
    expect(n.get('a')).toBe(n.get('b'));
    expect(n.get('c')).not.toBe(n.get('a'));
  });

  it('a house can only be plumbed once pressurised water reaches it, and wired once power does', () => {
    const g = newGame(1);
    const home = built(g, 'h', 'timber_cabin', 10, 10);
    built(g, 'w', 'well_hand', 14, 10);
    let p = plant(g);
    expect(fitProblem(g, p, home, 'plumb')).toMatch(/no pressurised/);
    built(g, 'd', 'well_drilled', 14, 12);
    line(g, 'water_pipe', [[14, 12], [10, 10]]);
    p = plant(g);
    expect(serviceOf(g, p, 'h').water).toBe(true);
    expect(fitProblem(g, p, home, 'plumb')).toBeNull();
    expect(fitProblem(g, p, home, 'wire')).toMatch(/no power/);
    built(g, 's', 'solar_array', 10, 15);
    line(g, 'power_cable', [[10, 15], [10, 10]]);
    expect(fitProblem(g, plant(g), home, 'wire')).toBeNull();
  });

  it('fitting takes fixtures and labour; a mechanic is faster', () => {
    const g = newGame(1);
    built(g, 'h', 'timber_cabin', 10, 10);
    g.stock.pipe = 4; g.stock.fixtures = 2;
    const f1 = orderFit(g, 'h', 'plumb');
    addFitWork(g, f1, 20, 0);
    expect(f1.finishedAt).toBeNull();
    expect(g.stock.fixtures).toBe(1);
    const g2 = newGame(1); built(g2, 'h', 'timber_cabin', 10, 10); g2.stock.pipe = 4; g2.stock.fixtures = 2;
    const f2 = orderFit(g2, 'h', 'plumb');
    addFitWork(g2, f2, 20, 9);
    expect(f2.done).toBeGreaterThan(f1.done * 2);
  });

  it('solar fills the battery by day; more sun in June than December', () => {
    expect(sunHours(172)).toBeGreaterThan(6);
    expect(sunHours(355)).toBeLessThan(3);
    const g = newGame(1, 172);
    built(g, 'h', 'timber_cabin', 10, 10);
    built(g, 's', 'solar_array', 12, 10);
    built(g, 'b', 'battery_shed', 11, 12);
    line(g, 'power_cable', [[12, 10], [10, 10], [11, 12]]);
    g.utilities.fittings.push({ building: 'h', kind: 'wire', done: 30, hours: 30, supplied: true, finishedAt: 0 });
    balanceDay(g, plant(g), 0.5);
    expect(g.utilities.report.solarKwh).toBeGreaterThan(20);
    expect(g.utilities.report.shortKwh).toBe(0);
    expect(g.utilities.batteryKwh).toBeGreaterThan(5);
  });

  it('the generator covers a shortfall while there is fuel, then the lights go out', () => {
    const g = newGame(1, 355);
    built(g, 'h', 'log_house', 10, 10);
    built(g, 'gen', 'generator_shed', 12, 10);
    line(g, 'power_cable', [[12, 10], [10, 10]]);
    g.utilities.fittings.push({ building: 'h', kind: 'wire', done: 30, hours: 30, supplied: true, finishedAt: 0 });
    g.stock.fuel = 1;
    balanceDay(g, plant(g), 0.5);
    expect(g.utilities.report.genKwh).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) balanceDay(g, plant(g), 0.5);
    expect(g.stock.fuel).toBe(0);
    expect(g.utilities.report.shortKwh).toBeGreaterThan(0);
  });

  it('a cistern on the water line fills from the connected roofs', () => {
    const g = newGame(1, 100);
    built(g, 'h', 'log_house', 10, 10);
    built(g, 'c', 'cistern', 12, 10);
    line(g, 'water_pipe', [[12, 10], [10, 10]]);
    balanceDay(g, plant(g), 0.5);
    expect(g.utilities.storedL).toBeGreaterThan(50);
  });

  it('the daily balance runs from the engine', () => {
    let g = newGame(1, 172);
    built(g, 's', 'solar_array', 12, 10);
    built(g, 'b', 'battery_shed', 11, 12);
    line(g, 'power_cable', [[12, 10], [11, 12]]);
    g = step(g, 1.1);
    expect(g.utilities.lastDay).toBeGreaterThanOrEqual(0);
  });
});

describe('the county grid and grid-down', () => {
  const day = (g: GameState) => balanceDay(g, plant(g), 0.5);
  const grid = (seed = 1) => { const g = newGame(seed, 172, 2027, { grid: true }); return g; };
  const outage = (g: GameState) => { g.disaster.tracks = { ...g.disaster.tracks, grid: 0 }; };

  it('on the grid, a wired house and a drilled well just run, and there is a bill', () => {
    const g = grid();
    built(g, 'h', 'timber_cabin', 10, 10); built(g, 'w', 'well_drilled', 14, 10);
    expect(fitProblem(g, plant(g), g.structures[0], 'wire')).toBeNull();     // the grid reaches it
    g.utilities.fittings.push({ building: 'h', kind: 'wire', done: 30, hours: 30, supplied: true, finishedAt: 0 });
    const m = g.money;
    day(g);
    expect(g.utilities.lit).toEqual(expect.arrayContaining(['h', 'w']));
    expect(g.utilities.report.waterL).toBeGreaterThan(5000);
    expect(g.money).toBeLessThan(m);
  });

  it('when the grid goes down, only what you built runs; grid-tied solar without a battery shuts off', () => {
    const g = grid();
    built(g, 'h', 'timber_cabin', 10, 10); built(g, 'w', 'well_drilled', 14, 10); built(g, 's', 'solar_array', 10, 14);
    g.utilities.fittings.push({ building: 'h', kind: 'wire', done: 30, hours: 30, supplied: true, finishedAt: 0 });
    line(g, 'power_cable', [[10, 14], [10, 10]]);
    outage(g);
    day(g);
    expect(g.utilities.lit).toEqual([]);                 // anti-islanding: the panels go dead
    expect(g.utilities.report.waterL).toBe(0);           // the well pump on the grid alone is dead
    built(g, 'b', 'battery_shed', 12, 14);
    line(g, 'power_cable', [[12, 14], [10, 14]]);
    line(g, 'power_cable', [[14, 10], [10, 10]]);
    g.utilities.batteryKwh = 10;
    day(g);
    expect(g.utilities.lit).toEqual(expect.arrayContaining(['h', 'w']));
    expect(g.utilities.report.waterL).toBeGreaterThan(5000);
  });

  it('short of power, the pump comes first and the workshop goes without', () => {
    const g = newGame(1, 355);   // December: little sun, off the grid
    built(g, 'w', 'well_drilled', 14, 10); built(g, 'k', 'workshop', 10, 6); built(g, 's', 'solar_array', 10, 14);
    built(g, 'l', 'log_house', 6, 10);
    for (const b of ['k', 'l']) g.utilities.fittings.push({ building: b, kind: 'wire', done: 30, hours: 30, supplied: true, finishedAt: 0 });
    line(g, 'power_cable', [[10, 14], [14, 10], [10, 6], [6, 10]]);
    g.stock.fuel = 0;
    day(g);
    expect(g.utilities.lit).toEqual(expect.arrayContaining(['w', 'l']));   // ~9.6 kWh of December sun: pump 1.2 + house 8
    expect(g.utilities.report.shed).toContain('k');
  });

  it('a breaker switched off takes a building off the load', () => {
    const g = grid();
    built(g, 'h', 'timber_cabin', 10, 10);
    g.utilities.fittings.push({ building: 'h', kind: 'wire', done: 30, hours: 30, supplied: true, finishedAt: 0 });
    g.utilities.off = ['h'];
    day(g);
    expect(g.utilities.lit).not.toContain('h');
  });
});
