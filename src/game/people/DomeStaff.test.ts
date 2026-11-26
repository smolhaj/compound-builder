import { describe, expect, it } from 'vitest';
import { controlBlockPlan, inBlock } from '../../sim/dome/controlBlock';
import { routeOf, staffAt, walkerAt, SEATS, STAFF_PACE } from './DomeStaff';

const plan = controlBlockPlan('arcology', 8.97, 2.46)!;
describe('control block staff', () => {
  it('routes run from each airlock door to the block landing and never cross the footprint', () => {
    for (const from of ['yard', 'gate'] as const) {
      const r = routeOf(plan, from);
      expect(r[0]).toEqual(from === 'yard' ? plan.yardDoor : plan.gateDoor);
      expect(r[r.length - 1]).toEqual(plan.landing);
      for (let i = 1; i < r.length; i++) for (let t = 0; t <= 1; t += 0.1) expect(inBlock(plan, r[i - 1][0] + (r[i][0] - r[i - 1][0]) * t, r[i - 1][1] + (r[i][1] - r[i - 1][1]) * t, 0)).toBe(false);
    }
  });
  it('walkers keep a walking pace and stay on their route', () => {
    const r = routeOf(plan, 'yard'); let prev = walkerAt(r, 0, 0);
    for (let t = 0.5; t < 120; t += 0.5) { const w = walkerAt(r, t, 0); expect(Math.hypot(w.x - prev.x, w.z - prev.z)).toBeLessThan(STAFF_PACE * 0.5 * 1.1 + 1e-6); prev = w; }
  });
  it('seats and figures are inside the footprint, standing figures are not weapons-bearing poses', () => {
    const figs = staffAt({ plan, ox: 0, oz: 0, y: 0 }, 10, false);
    expect(figs.length).toBe(SEATS.length + 3);
    for (const f of figs.slice(0, SEATS.length + 1)) expect(inBlock(plan, f.pose.x, f.pose.z)).toBe(true);
    for (const f of figs) expect([13, 17]).not.toContain(f.pose.pose);      // (no rifle poses)
  });
});
