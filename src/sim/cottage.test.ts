import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { BLUEPRINTS, homeBeds, isHome, totalBill, totalHours } from './blueprints';
import { balanceDay, plant, UTILITY } from './utilities';
import { treated, waterDay } from './water';
import { MATERIALS, type MaterialId } from './materials';
import { KIT } from '../game/buildkit/kit';

const cost = (kind: string) => Object.entries(totalBill(BLUEPRINTS[kind])).reduce((a, [m, q]) => a + (MATERIALS[m as MaterialId].price ?? 0) * (q as number), 0);
const finish = (s: ReturnType<typeof newGame>, kind: string, x = 0, z = 0) => {
  const st = { id: `t${s.nextId++}`, kind, x, z, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 };
  s.structures.push(st as (typeof s.structures)[number]);
  return st;
};

describe('compound buildings', () => {
  it('the cottage is a home that sleeps 3, priced like an owner-built cottage', () => {
    expect(isHome('cottage')).toBe(true);
    expect(KIT.cottage.sleeps).toBe(3);
    expect(totalHours(BLUEPRINTS.cottage)).toBeGreaterThan(800);
    expect(totalHours(BLUEPRINTS.cottage)).toBeLessThan(1000);
    expect(cost('cottage')).toBeGreaterThan(38000);
    expect(cost('cottage')).toBeLessThan(52000);
    const s = newGame(7);
    const before = homeBeds(s);
    finish(s, 'cottage');
    expect(homeBeds(s)).toBe(before + 3);
  });

  it('the metal garage costs about $28k and 250 hours; the solar roof adds 8 kW', () => {
    expect(totalHours(BLUEPRINTS.metal_garage)).toBe(250);
    expect(cost('metal_garage')).toBeGreaterThan(22000);
    expect(cost('metal_garage')).toBeLessThan(34000);
    expect(UTILITY.garage_solar.solarKw).toBe(8);
    const s = newGame(7);
    s.utilities.grid = false;
    finish(s, 'garage_solar', 5, 5);
    balanceDay(s, plant(s), 0.5);
    expect(s.utilities.report.solarKwh).toBeGreaterThan(8 * 2);
  });

  it('the filtration shed treats hauled water: no giardia, no filter or firewood used', () => {
    const s = newGame(7);
    finish(s, 'filtration_shed');
    expect(treated(s)).toBe(true);
    s.stock.water_filter = 0; s.stock.firewood = 0;
    for (let d = 0; d < 400; d++) {
      s.utilities.hauling = true;
      s.clock.t = d;
      waterDay(s);
    }
    const sick = s.personState.some(ps => ps.needs.hurt.some(h => h.what.includes('giardia')));
    expect(sick).toBe(false);
  });

  it('without it, hauling untreated water eventually makes someone sick', () => {
    const s = newGame(7);
    s.stock.water_filter = 0; s.stock.firewood = 0;
    for (let d = 0; d < 400; d++) { s.utilities.hauling = true; s.clock.t = d; waterDay(s); }
    expect(s.personState.some(ps => ps.needs.hurt.some(h => h.what.includes('giardia')))).toBe(true);
  });
});
