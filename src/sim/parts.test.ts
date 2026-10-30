import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { CLASSIC } from './site';
import { partsOutlook, partsYears, wornFactor } from './parts';
import { overdue, serviceRate, fleetOf, SERVICE_MILES } from './vehicles';
import { sparePartsCard } from './guidance';

const after = (years: number): GameState => {
  const g = newGame(3, 105, 2027, { site: CLASSIC });
  g.disaster.kind = 'grid_down'; g.disaster.phase = 'survival'; g.disaster.hitAt = 10;
  g.disaster.tracks.stores = 0; g.disaster.tracks.banks = 0; g.disaster.tracks.grid = 0;
  g.clock.t = 10 + years * 365;
  return g;
};

describe('spare parts over the years', () => {
  it('nothing changes while the stores work, and the factor climbs to 3', () => {
    const g = newGame(3, 105, 2027, { site: CLASSIC });
    expect(partsYears(g)).toBe(0); expect(wornFactor(g)).toBe(1);
    expect(wornFactor(after(0))).toBeCloseTo(1); expect(wornFactor(after(2.5))).toBeCloseTo(2); expect(wornFactor(after(10))).toBe(3);
  });
  it('old machines are due for service sooner', () => {
    const v = fleetOf(after(0))[0];
    v.serviceAt = v.mileage - SERVICE_MILES * 0.6;
    expect(overdue(v)).toBe(false);
    expect(overdue(v, 2)).toBe(true);
  });
  it('the service rate rises with age', () => {
    expect(serviceRate(after(3))).toBeGreaterThan(serviceRate(after(0)) * 1.8);
  });
  it('the outlook counts days of kits and warns when they run short', () => {
    expect(partsOutlook(after(1), 0).days).toBeNull();
    expect(partsOutlook(after(1), 0.1)).toEqual({ kits: 0, days: 0 });
    const g = after(1.5); g.stock.vehicle_parts = 0;
    const atv = { id: 'v9', kind: 'atv' as const, mileage: 100, condition: 0.9, fuel: 5, oilAt: 0, serviceAt: 0 };
    fleetOf(g).push(atv);
    expect(sparePartsCard(g)?.title).toBe('No spare parts for the machines');
    g.stock.vehicle_parts = 400;
    expect(sparePartsCard(g)).toBeNull();
    expect(sparePartsCard(newGame(3, 105, 2027, { site: CLASSIC }))).toBeNull();
  });
});
