import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { exposure, exposureParts, opsecOf, raidPressure, topExposure } from './opsec';
import { whoComes, postureOf } from './encounters';
import { mulberry32 } from './rng';

const fresh = (): GameState => newGame(1, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
const delivered = (g: GameState, n: number, cost = 3000) => {
  for (let i = 0; i < n; i++) g.orders.push({ id: `o${i}`, lines: [], cost, placedAt: 0, dueAt: 1, status: 'delivered' });
};

describe('OPSEC', () => {
  it('starts low and stays within 0–100', () => {
    const g = fresh();
    expect(exposure(g)).toBeGreaterThanOrEqual(0);
    expect(exposure(g)).toBeLessThan(20);
    delivered(g, 100); g.armory.onBooks = 50; g.fin.onBooks = 1e6;
    expect(exposure(g)).toBeLessThanOrEqual(100);
  });

  it('deliveries, guns on record and metals on the books raise it', () => {
    const g = fresh(), base = exposure(g);
    delivered(g, 6); g.armory.onBooks = 4; g.fin.onBooks = 30_000;
    expect(exposure(g)).toBeGreaterThan(base + 20);
    expect(topExposure(g)[0][0]).toBe('deliveries');
  });

  it('picking up in town cuts what deliveries give away', () => {
    const g = fresh(); delivered(g, 6);
    const loud = exposureParts(g).deliveries;
    opsecOf(g).quietDeliveries = true;
    expect(exposureParts(g).deliveries).toBeCloseTo(loud * 0.4);
  });

  it('lights after the grid fails show; blackout curtains halve it', () => {
    const g = fresh();
    g.utilities.lit = ['a', 'b'];
    g.disaster.tracks.grid = 1;
    expect(exposureParts(g).lights).toBe(0);
    g.disaster.tracks.grid = 0;
    const on = exposureParts(g).lights;
    expect(on).toBeGreaterThan(0);
    opsecOf(g).blackout = true;
    expect(exposureParts(g).lights).toBeCloseTo(on / 2);
  });

  it('a negotiator keeps the talk down', () => {
    const g = fresh(); delivered(g, 4);
    for (const p of g.people) p.skills.negotiator = 0;
    const loose = exposure(g);
    g.people[0].skills.negotiator = 5;
    expect(exposure(g)).toBeLessThan(loose);
  });

  it('raid pressure runs 0.7–1.6 and draws more raiders', () => {
    const g = fresh();
    expect(raidPressure(g)).toBeGreaterThanOrEqual(0.7);
    g.clock.t = g.disaster.hitAt + 20;
    g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
    const count = () => { const r = mulberry32(9), p = postureOf(g); let n = 0; for (let i = 0; i < 2000; i++) if (['looters', 'gang'].includes(whoComes(g, p, r))) n++; return n; };
    const quiet = count();
    delivered(g, 40); g.armory.onBooks = 20; g.fin.onBooks = 100_000;
    expect(raidPressure(g)).toBeGreaterThan(1.05);
    expect(raidPressure(g)).toBeLessThanOrEqual(1.6);
    expect(count()).toBeGreaterThan(quiet);
  });
});
