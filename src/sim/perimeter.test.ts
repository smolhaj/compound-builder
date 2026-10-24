import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { step } from './engine';
import { addRunWork, nextRun, planRun, runBill, runBlocked, runFinished, runGrowth, runStops, wallLength } from './perimeter';

describe('perimeter', () => {
  it('bills per length, rounded up, and leaves gates out', () => {
    expect(runBill('barbed_wire', 10)).toEqual({ wire: 1, hardware: 1 });
    expect(runBill('container_wall', 4)).toEqual({ container: 2 });
    expect(wallLength({ pts: [[0, 0], [10, 0]], gates: [{ at: 5, w: 0.5 }] })).toBeCloseTo(9.5);
  });

  it('waits for materials, then the family builds it', () => {
    let g = newGame(1);
    const r = planRun(g, 'barbed_wire', [[0, 0], [8, 0]]);
    expect(runBlocked(g, r)).toMatch(/Waiting/);
    expect(nextRun(g)).toBeNull();
    g.stock.wire = 2; g.stock.hardware = 2;
    expect(nextRun(g)).toBe(r);
    g = step(g, 3);
    expect(runFinished(g.perimeter[0])).toBe(true);
    expect(g.stock.wire).toBe(1);
  });

  it('a thorn hedge is planted, then grows for years before it stops anyone', () => {
    const g = newGame(1);
    g.stock.seedlings = 10;
    const r = planRun(g, 'thorn_hedge', [[0, 0], [5, 0]]);
    addRunWork(g, r, 1000);
    const t0 = r.finishedAt!;
    expect(runStops(r, 'people', t0)).toBeLessThan(0.1);
    expect(runGrowth(r, t0 + 2 * 365)).toBeCloseTo(0.5, 1);
    expect(runStops(r, 'people', t0 + 5 * 365)).toBeCloseTo(0.9);
  });

  it('the crew builds houses before fences', () => {
    let g = newGame(1);
    g.stock.wire = 5; g.stock.hardware = 5; g.stock.fieldstone = 1; g.stock.lumber = 3; g.stock.roofing = 1;
    planRun(g, 'barbed_wire', [[0, 0], [20, 0]]);
    g.structures.push({ id: 's9', kind: 'outhouse', x: 1, z: 1, rot: 0, stage: 0, done: 0, supplied: false, finishedAt: null });
    g = step(g, 0.2);
    expect(g.perimeter[0].done).toBe(0);
    expect(g.structures[0].done + g.structures[0].stage).toBeGreaterThan(0);
  });
});
