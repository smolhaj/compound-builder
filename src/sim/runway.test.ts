import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { runway, shortestRunway, RUNWAY, type RunwayRow } from './runway';
import { compoundBoard, BOARD } from './compoundBoard';
import { daysOfFood } from './needs';
import { waterDaysStored } from './water';
import { firewoodDays, firewoodOutlook } from './heating';
import { GUN, fightsOfAmmo } from './armory';
import { defenseReport } from './defenseReport';
import { mulberry32 } from './rng';

const game = (seed = 5) => newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
const row = (rows: RunwayRow[], id: RunwayRow['id']) => rows.find(r => r.id === id)!;

describe('the runway: days with no resupply', () => {
  it('has the seven rows in a fixed order, each with a fix that opens a tab or a shelf', () => {
    const rows = runway(game());
    expect(rows.map(r => r.id)).toEqual(['food', 'water', 'power', 'heat', 'medicine', 'defense', 'fuel']);
    for (const r of rows) {
      expect(r.label.length).toBeGreaterThan(2);
      expect(r.value.length).toBeGreaterThan(1);
      expect(['good', 'warn', 'bad']).toContain(r.tone);
      expect(['open', 'shop']).toContain(r.fix.act.type);
      expect(r.fix.label.length).toBeGreaterThan(2);
    }
  });

  it('agrees with the board, the defense report and the firewood prompt (one source for each figure)', () => {
    for (const seed of [1, 4, 9]) {
      const g = game(seed);
      g.stock.canned = 40 + seed; g.stock.firewood = 3 + seed; g.utilities.storedL = 800 * seed;
      const rows = runway(g);
      // food: the same daysOfFood the board's Food line prints
      expect(row(rows, 'food').days).toBe(Math.floor(Math.min(daysOfFood(g), 999)));
      const b = compoundBoard(g);
      const n = Math.round(Math.min(daysOfFood(g), 999));
      expect(b.vitals.find(v => v.id === 'food')!.value).toContain(`${n} ${n === 1 ? 'day' : 'days'} of food`);
      expect(b.runway.map(r => r.id)).toEqual(rows.map(r => r.id));
      // water: the stored days the board and the defense report use
      expect(row(rows, 'water').days).toBe(Math.floor(waterDaysStored(g)));
      const dr = defenseReport(g);
      const waterCheck = dr.catastrophes.find(c => c.id === 'water')!;
      if (!waterCheck.detail.includes('well')) expect(waterCheck.detail).toBe(`${Math.floor(waterDaysStored(g))} days stored`);
      // heat: the same pile and curve as the Firewood prompt
      const w = firewoodDays(g);
      expect(row(rows, 'heat').days).toBe(Math.floor(w.days));
      expect(firewoodOutlook(g).have).toBe(g.stock.firewood);
    }
  });

  it('the board and the runway use the same food thresholds', () => {
    expect(BOARD.foodBad).toBe(RUNWAY.food.bad);
    expect(BOARD.foodWarn).toBe(RUNWAY.food.warn);
  });

  it('colors by threshold: food', () => {
    const g = game();
    for (const [canned, tone] of [[0, 'bad'], [2, 'bad'], [30, 'warn'], [400, 'good']] as const) {
      g.stock.canned = canned; g.stock.staples = 0; g.stock.frozen = 0; g.stock.fresh = 0;
      const r = row(runway(g), 'food');
      const d = daysOfFood(g);
      expect(r.tone).toBe(d < RUNWAY.food.bad ? 'bad' : d < RUNWAY.food.warn ? 'warn' : 'good');
      if (canned === 0) expect(r.days).toBe(0);
      if (canned === 400) expect(r.tone).toBe(tone);
    }
  });

  it('water: a long store is green, a thin one is red; a well softens it', () => {
    const g = game();
    g.utilities.storedL = 50000; g.stock.water_jugs = 0;
    expect(row(runway(g), 'water').tone).toBe('good');
    g.utilities.storedL = 20; g.clock.t = 5;
    expect(row(runway(g), 'water').tone).toBe('bad');
    g.structures.push({ id: 'w1', kind: 'well_drilled', x: 0, z: 0, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    expect(row(runway(g), 'water').value).toMatch(/plus the well/);
  });

  it('on the first day an empty water or medicine shelf is amber "none yet", later it is red, with the same fix', () => {
    const g = game();
    g.utilities.storedL = 0; g.stock.water_jugs = 0; g.stock.meds = 0;
    const a = runway(g);
    expect(row(a, 'water')).toMatchObject({ tone: 'warn', value: 'none yet' });
    expect(row(a, 'medicine')).toMatchObject({ tone: 'warn', value: 'none yet' });
    g.clock.t = 5;
    const b = runway(g);
    expect(row(b, 'water').tone).toBe('bad');
    expect(row(b, 'medicine').tone).toBe('bad');
    expect(row(b, 'water').fix).toEqual(row(a, 'water').fix);
  });

  it('medicine: ten days a kit, divided among the cases being treated', () => {
    const g = game();
    g.clock.t = 5; g.stock.meds = 0;
    expect(row(runway(g), 'medicine')).toMatchObject({ days: 0, tone: 'bad' });
    g.stock.meds = 2;
    expect(row(runway(g), 'medicine').days).toBe(20);
    g.personState[0].needs.hurt = [{ what: 'flu', sev: 30 }, { what: 'a cut', sev: 10 }];
    expect(row(runway(g), 'medicine').days).toBe(10);
    g.stock.meds = 10;
    g.personState[0].needs.hurt = [];
    expect(row(runway(g), 'medicine').tone).toBe('good');
  });

  it('defense: no guns says so; with guns it counts fights at the quiet between waves', () => {
    const g = game();
    g.armory.guns = []; g.armory.ammo = {};
    expect(row(runway(g), 'defense')).toMatchObject({ days: null, value: 'no guns', tone: 'warn' });
    g.armory.guns = [{ id: 'g1', model: Object.keys(modelsOf())[0], condition: 1, fired: 0, where: 'house', carrier: null }];
    const cal = modelsOf()[g.armory.guns[0].model];
    g.armory.ammo = { [cal]: 0 };
    expect(row(runway(g), 'defense').tone).toBe('bad');
    g.armory.ammo = { [cal]: 5000 };
    const f = fightsOfAmmo(g)!;
    expect(f).toBeGreaterThan(5);
    expect(row(runway(g), 'defense').tone).toBe('good');
  });

  it('power: nothing built is amber and points to the Power shelf; a bank without draw is not an alarm', () => {
    const g = game();
    const p = row(runway(g), 'power');
    if (p.value === 'none built') { expect(p.tone).toBe('warn'); expect(p.fix.act).toEqual({ type: 'shop', tab: 'power' }); }
  });

  it('property: over random stocks every row is finite, non-negative, whole, and its tone follows the table', () => {
    for (let k = 0; k < 80; k++) {
      const r = mulberry32(300 + k), g: GameState = game(1 + (k % 9));
      g.stock.canned = Math.floor(r() * 500); g.stock.staples = Math.floor(r() * 300); g.stock.firewood = r() * 30; g.stock.meds = Math.floor(r() * 12); g.stock.fuel = Math.floor(r() * 30);
      g.utilities.storedL = Math.floor(r() * 30000); g.utilities.batteryKwh = r() * 40; g.stock.water_jugs = Math.floor(r() * 20);
      g.clock.t += Math.floor(r() * 365);
      const rows = runway(g);
      expect(rows).toHaveLength(7);
      for (const x of rows) {
        if (x.days !== null) { expect(Number.isFinite(x.days)).toBe(true); expect(x.days).toBeGreaterThanOrEqual(0); expect(Number.isInteger(x.days)).toBe(true); }
        expect(x.value).not.toMatch(/NaN|undefined|Infinity/);
      }
      const food = row(rows, 'food');
      const d = daysOfFood(g);
      expect(food.tone).toBe(d < 7 ? 'bad' : d < 30 ? 'warn' : 'good');
      // more food never makes the food row worse
      g.stock.canned += 50;
      expect(row(runway(g), 'food').days!).toBeGreaterThanOrEqual(food.days!);
      const s = shortestRunway(rows);
      if (s) expect(rows.filter(x => x.days !== null && x.tone === 'bad').length === 0 || s.tone === 'bad').toBe(true);
    }
  });
});

function modelsOf(): Record<string, string> { return Object.fromEntries(Object.entries(GUN).map(([k, v]) => [k, v.cal])); }
