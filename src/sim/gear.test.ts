import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { defenseOf, postureOf } from './encounters';
import { gearDay, gearPosture, softenWound } from './gear';

describe('kit, watching the place, hardening', () => {
  it('sensors, cameras and a dog raise detection; doors, bars and sandbags the barrier; plates and radios the fight', () => {
    const g = newGame(2);
    const p0 = postureOf(g), d0 = defenseOf(p0);
    Object.assign(g.stock, { driveway_alarm: 1, tripwire: 1, dog: 1, steel_door: 2, window_bars: 1, sandbags: 2, plate_carrier: 2, radios: 1 });
    const p1 = postureOf(g);
    const gp = gearPosture(g, 2);
    expect(gp.detection).toBe(10 + 5 + 12 + 5);
    expect(gp.barrier).toBe(10 + 8 + 10);
    expect(p1.detection).toBeGreaterThanOrEqual(Math.min(100, p0.detection + 20));
    expect(p1.barrier).toBeGreaterThan(p0.barrier);
    expect(defenseOf(p1)).toBeGreaterThan(d0);
    expect(p1.deter).toBe(6);
    // cameras and floodlights need power
    g.stock.cameras = 1;
    expect(gearPosture(g, 2).detection).toBe(gp.detection);
  });

  it('plates and an IFAK take the edge off a gunshot wound (the IFAK is used up)', () => {
    const g = newGame(2);
    expect(softenWound(g, 60, true)).toBe(60);
    g.stock.plate_carrier = 2; g.stock.ifak = 1;
    expect(softenWound(g, 60, true)).toBe(Math.round(60 * 0.65 * 0.7));
    expect(g.stock.ifak).toBe(0);
  });

  it('a dog eats from the stores once the stores are shut', () => {
    const g = newGame(2);
    g.stock.dog = 1; g.stock.staples = 1;
    gearDay(g);
    expect(g.stock.staples).toBe(1);
    g.disaster.tracks.stores = 0;
    for (let i = 0; i < 40; i++) gearDay(g);
    expect(g.stock.staples).toBeCloseTo(0.5);
  });
});
