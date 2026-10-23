import { describe, expect, it } from 'vitest';
import { goalFor, type GoalCtx } from './peopleGoals';
import { FIG_POSE } from '../../engine/world/people/figureKit';

const ctx: GoalCtx = {
  camp: { x: 10, z: 10, rot: 0 },
  site: id => (id === 's1' ? { x: 20, z: 20, rot: 0, w: 1, d: 1.5 } : null),
  home: null,
};

describe('peopleGoals', () => {
  it('builders spread round the walls of the site and face it', () => {
    const a = goalFor(0, false, 'build', 's1', 10, ctx), b = goalFor(1, false, 'build', 's1', 10, ctx);
    for (const g of [a, b]) {
      expect(Math.hypot(g.x - 20, g.z - 20)).toBeLessThan(1.2);
      expect(Math.max(Math.abs(g.x - 20) - 0.5, Math.abs(g.z - 20) - 0.75)).toBeGreaterThan(0.05);   // outside the walls
      expect(g.work).toBe(true);
    }
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.3);
  });

  it('kids sit at the camp table for school; everyone sleeps hidden', () => {
    const s = goalFor(2, true, 'school', null, 10, ctx);
    expect(s.pose).toBe(FIG_POSE.BENCH);
    expect(Math.hypot(s.x - 10, s.z - 10)).toBeLessThan(1);
    expect(goalFor(0, false, 'sleep', null, 2, ctx).hidden).toBe(true);
    expect(goalFor(0, false, 'sleep', null, 2, { ...ctx, home: { x: 20, z: 20, rot: 0, w: 1, d: 1.5 } }).x).toBe(20);
  });

  it('evenings round the fire; a builder with no site does chores at camp', () => {
    const e = goalFor(1, false, 'leisure', null, 20, ctx);
    expect(e.pose).toBe(FIG_POSE.LAWN);
    const c = goalFor(0, false, 'build', 'gone', 10, ctx);
    expect(Math.hypot(c.x - 10, c.z - 10)).toBeLessThan(1);
  });
});
