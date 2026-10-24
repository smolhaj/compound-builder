import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { buyVehicle, empVehicles, startingVehicles, tractorBoost, TRACTOR_BOOST, vehiclesDay, VEHICLES } from './vehicles';

describe('vehicles', () => {
  it('everyone starts with a used pickup', () => {
    const g = newGame(1);
    vehiclesDay(g);
    expect(g.vehicles?.length).toBe(1);
    expect(g.vehicles?.[0].kind).toBe('pickup');
  });

  it('buying costs money, one of each kind', () => {
    const g = newGame(1);
    g.money = 50_000;
    expect(buyVehicle(g, 'tractor')).toBeNull();
    expect(g.money).toBe(50_000 - VEHICLES.tractor.price);
    expect(buyVehicle(g, 'tractor')).toMatch(/already/);
    g.money = 100;
    expect(buyVehicle(g, 'atv')).toMatch(/money/);
    expect(tractorBoost(g)).toBe(TRACTOR_BOOST);
  });

  it('the EMP kills modern vehicles, not the 1970s truck', () => {
    const g = newGame(1);
    g.money = 100_000;
    buyVehicle(g, 'old_pickup');
    buyVehicle(g, 'tractor');
    empVehicles(g);
    expect(g.vehicles!.find(v => v.kind === 'pickup')!.fried).toBe(true);
    expect(g.vehicles!.find(v => v.kind === 'old_pickup')!.fried).toBeFalsy();
    expect(tractorBoost(g)).toBe(1);
  });

  it('after the stations close, fuel comes from the cans and wear sets in without a mechanic', () => {
    const g = newGame(1);
    g.vehicles = startingVehicles();
    g.vehicles[0].fuel = 1;
    g.disaster.tracks.fuel = 0; g.disaster.tracks.stores = 0;
    g.stock.fuel = 5;
    g.people.forEach(p => { p.skills.mechanic = 0; });
    const c0 = g.vehicles[0].condition;
    vehiclesDay(g);
    expect(g.stock.fuel).toBeLessThan(5);
    expect(g.vehicles[0].condition).toBeLessThan(c0);
  });
});
