import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { makeLotSite } from './lotListing';
import { bladeOn, burnPlowing, plowRig, PLOW_FUEL_L } from './plowing';
import { closureFor, heavySnowOn, plowDay, plowReport, roadClosedFor } from './slope';
import { fleetOf } from './vehicles';

const hill = () => makeLotSite({ region: 'mountain_west', kind: 'hillside', relief: 12, acres: 40, seed: 3, elevM: 2300 });
const game = () => { const g = newGame(5, 20, 2027, { site: hill() }); g.stock.plow = 1; return g; };

describe('the plow rides on a real vehicle', () => {
  it('needs a running pickup, old pickup or tractor that is home and fueled', () => {
    const g = game();
    const fleet = fleetOf(g);
    expect(plowRig(g)).not.toBeNull();
    expect(bladeOn(g)).toBe(true);
    for (const v of fleet) v.away = true;
    expect(plowRig(g)).toBeNull();
    expect(bladeOn(g)).toBe(false);
    for (const v of fleet) { v.away = false; v.fuel = 0; }
    expect(bladeOn(g)).toBe(false);
    for (const v of fleet) { v.fuel = 40; v.stranded = true; }
    expect(bladeOn(g)).toBe(false);
  });

  it('without a rig the road is shut as long as with no blade at all', () => {
    const g = game();
    const withRig = plowReport(g)!;
    expect(withRig.haveBlade).toBe(true);
    for (const v of fleetOf(g)) v.away = true;
    const without = plowReport(g)!;
    expect(without.haveBlade).toBe(false);
    expect(closureFor(2.5, 0.5, false)).toBeGreaterThanOrEqual(closureFor(2.5, 0.5, true));
  });

  it('a heavy snow day burns fuel and wear from the rig; with no rig it says why', () => {
    const g = game();
    let day = -1;
    for (let d = 0; d < 400 && day < 0; d++) if (heavySnowOn(g, d)) day = d;
    expect(day).toBeGreaterThanOrEqual(0);
    const rig = plowRig(g)!;
    const fuel = rig.fuel, cond = rig.condition;
    expect(plowDay(g, day)).toEqual([]);
    expect(rig.fuel).toBeCloseTo(fuel - Math.min(fuel, PLOW_FUEL_L), 6);
    expect(rig.condition).toBeLessThan(cond);
    for (const v of fleetOf(g)) v.away = true;
    expect(plowDay(g, day)[0]).toMatch(/no truck to hang on/);
    expect(burnPlowing(g)).toBe(0);
  });

  it('a closure is a pure function of the seed and the day', () => {
    const g = game();
    const a = Array.from({ length: 120 }, (_, d) => roadClosedFor(g, d));
    const b = Array.from({ length: 120 }, (_, d) => roadClosedFor(g, d));
    expect(a).toEqual(b);
  });
});
