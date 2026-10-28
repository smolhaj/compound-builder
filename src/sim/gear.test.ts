import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { defenseOf, postureOf } from './encounters';
import { gearPosture, softenWound } from './gear';
import { adoptDog } from './pets';

describe('kit, watching the place, hardening', () => {
  it('sensors, cameras and a dog raise detection; doors, bars and sandbags the barrier; plates and radios the fight', () => {
    const g = newGame(2);
    const p0 = postureOf(g), d0 = defenseOf(p0);
    Object.assign(g.stock, { driveway_alarm: 1, tripwire: 1, steel_door: 2, window_bars: 1, sandbags: 2, plate_carrier: 2, radios: 1 });
    adoptDog(g, { ageYears: 2, training: 0, guard: true });
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
});
