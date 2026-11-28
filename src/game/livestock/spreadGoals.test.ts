import { describe, expect, it } from 'vitest';
import { spreadGoals } from './LivestockRenderer';
import type { AnimalGoal } from './livestockPlan';

const goal = (x: number, z: number): AnimalGoal => ({ x, z, inside: false, home: null, panic: false });

describe('spreadGoals keeps a herd off ground it may not stand on', () => {
  const herd = ['a', 'b', 'c', 'd'].map(id => ({ id, kind: 'cow' as const }));
  it('pushes animals apart on open ground', () => {
    const goals = herd.map(() => goal(5, 5));
    spreadGoals(herd, goals, []);
    const spread = Math.max(...goals.map(g => Math.hypot(g.x - 5, g.z - 5)));
    expect(spread).toBeGreaterThan(0.05);
  });
  it('never pushes one into water: a shore at x < 5 is off limits', () => {
    const goals = herd.map(() => goal(5.02, 5));
    spreadGoals(herd, goals, [], (x) => x >= 5);
    for (const g of goals) expect(g.x).toBeGreaterThanOrEqual(5);
  });
});
