import { describe, expect, it } from 'vitest';
import { FLIGHT_W, hatchPlan, STEPS } from './bunkerHatchPlan';
import { M } from './interior';

describe('floor hatch stairwell', () => {
  const depth = 0.89, p = hatchPlan(depth);
  it('three flights side by side, down, back, down: they join end to end and reach the floor', () => {
    const [a, b, c] = p.flights;
    expect(a.yFrom).toBeCloseTo(depth); expect(a.yTo).toBeCloseTo(b.yFrom); expect(b.yTo).toBeCloseTo(c.yFrom); expect(c.yTo).toBeCloseTo(0);
    expect(a.zTo).toBeCloseTo(b.zFrom); expect(b.zTo).toBeCloseTo(c.zFrom);
    expect(a.x).toBeLessThan(b.x); expect(b.x).toBeLessThan(c.x);
    // the columns fit inside the shaft with a gap between them
    expect(a.x - FLIGHT_W / 2).toBeGreaterThanOrEqual(p.inner.x0 - 1e-9); expect(c.x + FLIGHT_W / 2).toBeLessThanOrEqual(p.inner.x1 + 1e-9);
    expect(b.x - FLIGHT_W / 2).toBeGreaterThan(a.x + FLIGHT_W / 2);
  });
  it('real stairs: a step rises 12 to 25 cm (a bit under 18), a tread runs 18 to 35 cm (steep, a utility stair), and a person stands upright at the first landing', () => {
    const [a] = p.flights;
    const riser = (a.yFrom - a.yTo) / STEPS / M * 100, tread = Math.abs(a.zTo - a.zFrom) / STEPS / M * 100;
    expect(riser).toBeGreaterThan(12); expect(riser).toBeLessThan(21);
    expect(tread).toBeGreaterThan(18); expect(tread).toBeLessThan(35);
    // the floor over the turn is a full body height above the landing (1.77 m for a 5.3 m shaft)
    expect(p.rise / M).toBeGreaterThan(1.7);
  });
  it('the opening is over the first flight only, and tread height follows each flight', () => {
    const [a, b, c] = p.flights;
    expect(p.hole.x0).toBeLessThan(a.x); expect(p.hole.x1).toBeLessThan(b.x - FLIGHT_W / 2 + 0.01);
    expect(p.yAt(a.x, a.zFrom)).toBeCloseTo(depth); expect(p.yAt(c.x, c.zTo)).toBeCloseTo(0);
    expect(p.yAt(b.x, (b.zFrom + b.zTo) / 2)).toBeCloseTo((b.yFrom + b.yTo) / 2);
    expect(p.yAt(0, 0.9)).toBeNull();
    expect(p.top[1]).toBeLessThan(p.inner.z0);
  });
});
