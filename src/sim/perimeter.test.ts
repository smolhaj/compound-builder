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

import { UPGRADE_NEXT, SALVAGE, planRun as plan, peopleBlock, upgradeProblem, upgradeRun, PERIMETER, type PerimeterRun } from './perimeter';

describe('upgrading in place', () => {
  const finished = (kind: Parameters<typeof plan>[1]) => {
    const g = newGame(5);
    const r = plan(g, kind, [[0, 0], [6, 0]]);
    r.done = r.hours; r.supplied = true; r.finishedAt = 0;
    return { g, r };
  };

  it('the chain runs from a split-rail fence to the poured-concrete wall, each tier stronger than the last', () => {
    let k: keyof typeof PERIMETER | undefined = 'split_rail', last = -1, steps = 0;
    while (k) {
      const b = PERIMETER[k].blocks.people;
      expect(b).toBeGreaterThanOrEqual(last);
      last = b; k = UPGRADE_NEXT[k]; steps++;
    }
    expect(steps).toBe(9);
    expect(last).toBeGreaterThan(0.95);
  });

  it('an upgrade is a new run over the same line; the old tier stands until it is done, then goes and half its materials come back', () => {
    const { g, r } = finished('chain_link');
    expect(upgradeProblem(g, r)).toBeNull();
    expect(upgradeRun(g, r.id)).toBeNull();
    const up = g.perimeter.find(x => x.replaces === r.id) as PerimeterRun;
    expect(up.kind).toBe('wrought_iron');
    expect(up.pts).toEqual(r.pts);
    expect(upgradeProblem(g, r)).toMatch(/under way/);
    // the old one is still the wall while the new one is built
    expect(g.perimeter.some(x => x.id === r.id && runFinished(x))).toBe(true);
    const bill = runBill('wrought_iron', wallLength(up)), before = { ...g.stock };
    for (const [m, n] of Object.entries(bill)) (g.stock as unknown as Record<string, number>)[m] += n as number;
    addRunWork(g, up, up.hours);
    expect(runFinished(up)).toBe(true);
    expect(g.perimeter.some(x => x.id === r.id)).toBe(false);
    expect(up.replaces).toBeUndefined();
    const back = runBill('chain_link', wallLength(r));
    for (const [m, n] of Object.entries(back)) expect((g.stock as unknown as Record<string, number>)[m] - (before as unknown as Record<string, number>)[m]).toBeGreaterThanOrEqual(Math.floor((n as number) * SALVAGE));
  });

  it('the top tier has nothing to upgrade to, and an unfinished run cannot be upgraded', () => {
    const { g, r } = finished('concrete_wall');
    expect(upgradeProblem(g, r)).toMatch(/nothing better/);
    const u = plan(g, 'chain_link', [[0, 0], [3, 0]]);
    expect(upgradeProblem(g, u)).toMatch(/not finished/);
  });

  it('an electrified wall without power is only a steel wall', () => {
    const { g, r } = finished('electric_steel');
    g.utilities.lit = []; g.utilities.grid = false;
    expect(peopleBlock(g, r)).toBe(PERIMETER.steel_wall.blocks.people);
    g.utilities.lit = ['h'];
    expect(peopleBlock(g, r)).toBe(PERIMETER.electric_steel.blocks.people);
  });
});
