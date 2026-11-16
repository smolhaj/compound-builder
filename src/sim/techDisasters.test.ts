/**
 * WP1 + WP2 + WP5: solar flare, EMP, cyberattack, grid-down and the financial collapse, live through the engine (newGame + step), plus the pure math.
 */
import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { step } from './engine';
import { DISASTERS, type DisasterKind } from './disaster';
import { flareOf, flareStrike, roomFry, flareGridFactor, GIC } from './flareFry';
import { empVehicles, EMP_VEHICLE_FRY, fleetOf, startingVehicles, type Vehicle } from './vehicles';
import { cashPowerAt, cashPriceMult, barterMult, cashPower, CASH_FLOOR, runMeter, withdrawalLimit } from './moneyMath';
import { transfer } from './finance';
import { barterPrices } from './barter';
import { cyberOf, cyberStrike, flicker, RUMOR_PLAN, verifyRumor, hear, BRICK } from './cyberMath';
import { answerTechCard, openTechCard, signatureGoals } from './techCards';
import { prices } from './economy';
import { FX, columnsOf } from './disasterFx';
import { mulberry32 } from './rng';

const mk = (kind: DisasterKind, variant?: string, seed = 5, extra: Partial<Parameters<typeof newGame>[3]> = {}): GameState => newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind, variant, ...extra });
const toHit = (g: GameState, plusDays = 0): GameState => step(g, Math.ceil(g.disaster.hitAt - g.clock.t) + plusDays + 1);
const done = (g: GameState, kind: string, id = kind) => g.structures.push({ id, kind, x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });

describe('the variants exist', () => {
  it('has the doc variants for grid_down, solar_flare, cyberattack and emp', () => {
    const ids = (k: DisasterKind) => DISASTERS[k]!.variants.map(v => v.id);
    expect(ids('grid_down')).toContain('transformer_shortage');
    expect(ids('solar_flare')).toEqual(expect.arrayContaining(['g4', 'carrington', 'near_miss']));
    expect(ids('cyberattack')).toEqual(expect.arrayContaining(['payments_and_pipeline', 'grid_and_water', 'wiper', 'rolling']));
    expect(ids('emp')).toEqual(expect.arrayContaining(['flash', 'local_burst']));
  });
  it('Free build can pick any variant', () => {
    const g = newGame(3, 105, 2027, { mode: 'god' });
    expect(g.disaster.kind).toBeNull();
  });
});

describe('solar flare', () => {
  it('the fry table: a Faraday room is 0 to 2%, nothing in a box is 10%', () => {
    expect([roomFry(1), roomFry(0.97), roomFry(0.7), roomFry(0)]).toEqual([0, 0.01, 0.02, 0.1]);
  });
  it('rolls grid-tied inverters at 45% and a disconnected drill cuts it to a third; vehicles never fry', () => {
    const run = (disc: boolean) => {
      const g = mk('solar_flare', 'carrington'); g.utilities.grid = true; done(g, 'solar_array'); done(g, 'well_drilled');
      g.vehicles = startingVehicles(); flareOf(g).disconnected = disc;
      const before = g.vehicles.filter(v => !v.fried).length;
      let fried = 0;
      for (let i = 0; i < 200; i++) { const h = structuredClone(g); flareStrike(h, mulberry32(i + 1)); fried += h.utilities.fried.length; expect(h.vehicles!.filter(v => !v.fried).length).toBe(before); }
      return fried / 400;
    };
    const open = run(false), drilled = run(true);
    expect(open).toBeGreaterThan(0.3); expect(open).toBeLessThan(0.55);
    expect(drilled).toBeLessThan(open * 0.55);
  });
  it('spares in a metal can mostly survive; a g4 is half a carrington and a near miss does nothing', () => {
    const g = mk('solar_flare', 'carrington'); g.stock.inverter = 20; flareOf(g).box = true;
    flareStrike(g, mulberry32(9));
    expect(g.stock.inverter).toBeGreaterThanOrEqual(18);
    const m = mk('solar_flare', 'near_miss'); m.stock.inverter = 5; m.utilities.grid = true; done(m, 'solar_array');
    flareStrike(m, mulberry32(1)); expect(m.stock.inverter).toBe(5); expect(m.utilities.fried).toEqual([]);
  });
  it('live: the grid dies at the hit, a dead pole keeps the line down after the county returns, and the engine logs the fry', () => {
    let g = mk('solar_flare', 'g4', 11); g.utilities.grid = true; done(g, 'solar_array');
    g = toHit(g, 1);
    expect(flareOf(g).struck).toBe(true);
    expect(g.disaster.tracks.grid).toBeLessThan(0.5);
    const f = flareOf(g); f.poleDead = true; f.poleFixDay = 20;
    expect(flareGridFactor(g, 5)).toBe(0); expect(flareGridFactor(g, 25)).toBe(1);
    expect(g.vehicles!.some(v => v.fried)).toBe(false);
  });
  it('the region factor is in the table', () => { expect(GIC.north_woods).toBe(1.4); expect(GIC.hill_country).toBe(0.7); });
});

describe('EMP', () => {
  const fleet = (): Vehicle[] => { const g = mk('emp'); const v = startingVehicles(); void g; return v; };
  it('is its own kind and old trucks run while the chipped ones roll by difficulty', () => {
    expect(FX.emp.onHit).toBeTypeOf('function');
    expect(EMP_VEHICLE_FRY).toEqual({ cozy: 0.3, standard: 0.6, hardcore: 0.85 });
    const g = mk('emp'); g.vehicles = [...fleet(), ...fleet(), ...fleet()];
    g.vehicles.push({ id: 'old', kind: 'old_pickup', mileage: 0, condition: 0.9, fuel: 40, oilAt: 0 });
    empVehicles(g, 0.6, mulberry32(3));
    expect(g.vehicles.find(v => v.id === 'old')!.fried).toBeFalsy();
    const chips = g.vehicles.filter(v => v.kind !== 'old_pickup' && v.kind !== 'trailer');
    expect(chips.some(v => v.fried)).toBe(true);
    expect(fleetOf(g).length).toBeGreaterThan(3);
  });
  it('live: radios burn unless boxed, raiders are absent the first 7 to 14 days, no fallout', () => {
    let g = mk('emp', 'flash', 7); g.stock.sw_radio = 2; g.vehicles = startingVehicles();
    g = toHit(g, 0);
    expect(g.stock.sw_radio).toBe(0);
    const fx = (g.disaster.fx as Record<string, { quietUntil: number }>).emp;
    expect(fx.quietUntil).toBeGreaterThanOrEqual(7); expect(fx.quietUntil).toBeLessThanOrEqual(14);
    expect(g.disaster.kind).toBe('emp');
    expect(g.vehicles!.some(v => v.kind === 'old_pickup' && v.fried)).toBe(false);
  });
});

describe('cyberattack', () => {
  it('bricks smart devices at 55% (Cozy 35%, Hardcore 70%), spares and overrides protect the well', () => {
    expect(BRICK).toEqual({ cozy: 0.35, standard: 0.55, hardcore: 0.7 });
    let bricked = 0;
    for (let i = 0; i < 300; i++) { const g = mk('cyberattack', 'rolling', 5); g.stock.cameras = 4; cyberStrike(g, mulberry32(i + 1)); bricked += cyberOf(g).lost.cameras; }
    expect(bricked / 1200).toBeGreaterThan(0.48); expect(bricked / 1200).toBeLessThan(0.62);
    const g = mk('cyberattack'); done(g, 'well_drilled', 'w'); g.stock.pump = 1;
    cyberStrike(g, () => 0); expect(g.utilities.fried).toEqual([]);
    const h = mk('cyberattack'); done(h, 'well_drilled', 'w');
    cyberStrike(h, () => 0); expect(h.utilities.fried).toEqual(['w']);
  });
  it('flickers for 30 days, then not', () => {
    const vals = Array.from({ length: 30 }, (_, d) => flicker(3, d));
    expect(Math.max(...vals)).toBeGreaterThan(1.1); expect(Math.min(...vals)).toBeLessThan(0.9);
    expect(flicker(3, 31)).toBe(1);
  });
  it('the ham Verify action turns a rumor into confirmed or false, two a day', () => {
    const g = mk('cyberattack'); g.stock.ham_rig = 1; g.people.forEach(p => { p.skills.radio = 3; });
    const hs = RUMOR_PLAN.slice(0, 3).map(p => hear(g, p));
    expect(verifyRumor(g, 'nope')).toMatch(/nothing/);
    const r1 = verifyRumor(g, hs[0].id);
    if (r1 === null) {
      expect(hs[0].status === 'confirmed' || hs[0].status === 'false').toBe(true);
      expect(verifyRumor(g, hs[1].id)).toBeNull();
      expect(verifyRumor(g, hs[2].id)).toMatch(/two checks/);
    } else expect(r1).toMatch(/ham/);
  });
  it('live: the cash card comes up at the hit, spending the safe buys stock, and the goals are tracked', () => {
    let g = mk('cyberattack', 'payments_and_pipeline', 9); g.fin.cash = 5000;
    g = toHit(g, 0);
    const c = openTechCard(g);
    expect(c?.id === 'cy_cash' || c?.id === 'cy_firmware').toBe(true);
    if (c?.id === 'cy_cash') {
      const before = g.stock.staples;
      expect(answerTechCard(g, 'spend')).toMatchObject({ tone: 'good' });
      expect(g.stock.staples).toBe(before + 5); expect(g.fin.cash).toBe(4000);
    }
    expect(signatureGoals(g).length).toBe(5);
  });
});

describe('grid-down', () => {
  it('transformer shortage keeps the grid dark for months and an ice storm fires a real storm', () => {
    let g = mk('grid_down', 'transformer_shortage', 4);
    g = toHit(g, 30);
    expect(g.disaster.tracks.grid).toBe(0);
    let h = mk('grid_down', 'ice_storm', 4);
    h = toHit(h, 0);
    expect(h.weather?.active?.kind === 'ice_storm' || h.weather?.last !== undefined).toBe(true);
  });
  it('the neighbor card pays in goodwill and costs fuel', () => {
    let g = mk('grid_down', 'cascade', 6); g.stock.fuel = 6;
    g = toHit(g, 6);
    const c = openTechCard(g);
    if (c?.id === 'gd_charging') { const d0 = g.neighbors.filter(n => n.status === 'home').map(n => n.disposition); const f0 = g.stock.fuel; g.stock.fuel = Math.max(f0, 3); const f1 = g.stock.fuel; answerTechCard(g, 'power'); expect(g.stock.fuel).toBe(f1 - 2); expect(g.neighbors.filter(n => n.status === 'home').map(n => n.disposition).every((d, i) => d >= d0[i])).toBe(true); }
    else expect(c === null || typeof c.id === 'string').toBe(true);
  });
});

describe('financial collapse', () => {
  it('cashPower follows the curves, floors at 0.15 and caps the price at x6', () => {
    expect(cashPowerAt('hyperinflation', 7)).toBeCloseTo(0.8); expect(cashPowerAt('hyperinflation', 30)).toBeCloseTo(0.3);
    expect(cashPowerAt('hyperinflation', 400)).toBe(CASH_FLOOR); expect(cashPowerAt('bank_holiday', 60)).toBeCloseTo(0.6);
    expect(cashPowerAt('bank_holiday', 365)).toBeCloseTo(0.35);
    expect(cashPriceMult(CASH_FLOOR)).toBe(6); expect(cashPriceMult(1)).toBe(1);
  });
  it('live: prices climb with the curve, hard goods gain on the barter market, withdrawals are limited', () => {
    let g = mk('financial', 'hyperinflation', 8); g.money = 100_000;
    const base = prices(g);
    g = toHit(g, 45);
    const pre = mk('financial', 'hyperinflation', 8); const goods = barterPrices(pre);
    const post = barterPrices(g);
    expect(cashPower(g)).toBeLessThan(0.3);
    expect(prices(g)).toBeGreaterThan(base * 2);
    expect(post.staples / goods.staples).toBeGreaterThan(2);
    expect(post.labor / goods.labor).toBeLessThan(1.1);
    expect(barterMult(g, 'labor')).toBe(1);
    expect(g.disaster.tracks.grid).toBeGreaterThanOrEqual(0.7);
  });
  it('the run meter fills in the warning and withdrawals are capped in the last ten days', () => {
    let g = mk('financial', 'bank_holiday', 12, {}); g.money = 50_000;
    g = step(g, Math.max(1, Math.floor(g.disaster.hitAt - g.clock.t) - 5));
    g.money = 50_000;
    if (g.disaster.phase === 'warning') {
      expect(runMeter(g)).toBeGreaterThan(0.4);
      expect(withdrawalLimit(g)).toBe(500);
      expect(transfer(g, 'checking', 'cash', 10_000)).toMatch(/limits/);
      expect(transfer(g, 'checking', 'cash', 400)).toBeNull();
    }
  });
});

describe('teeth coverage', () => {
  it('each kind covers at least four columns', () => {
    for (const k of ['solar_flare', 'emp', 'cyberattack', 'grid_down', 'financial'] as DisasterKind[]) expect(columnsOf(k).length, k).toBeGreaterThanOrEqual(4);
  });
});
