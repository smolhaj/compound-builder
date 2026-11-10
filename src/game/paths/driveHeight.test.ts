import { describe, expect, it } from 'vitest';
import { boreTube, roadYAlong, type DrivePt } from './driveHeight';

// a road running +z with a bore between s=4 and s=8 that climbs 1.2 u (ground over it is a hill at y=3)
const pts: DrivePt[] = Array.from({ length: 13 }, (_, i) => ({ x: 0, z: i, s: i, y: i < 4 ? 0 : i > 8 ? 1.2 : (i - 4) * 0.3 }));

describe('roadYAlong', () => {
  it('follows the road inside a span, between stations too', () => {
    const spans = [{ s0: 4, s1: 8 }];
    expect(roadYAlong(pts, spans, 0, 6)).toBeCloseTo(0.6, 6);
    expect(roadYAlong(pts, spans, 0.1, 6.5)).toBeCloseTo(0.75, 6);
    expect(roadYAlong(pts, spans, 0, 4)).toBeCloseTo(0, 6);
    expect(roadYAlong(pts, spans, 0, 8)).toBeCloseTo(1.2, 6);
  });
  it('is null off the span and off the road', () => {
    const spans = [{ s0: 4, s1: 8 }];
    expect(roadYAlong(pts, spans, 0, 2)).toBeNull();
    expect(roadYAlong(pts, spans, 0, 10)).toBeNull();
    expect(roadYAlong(pts, spans, 3, 6)).toBeNull();
    expect(roadYAlong(pts, [], 0, 6)).toBeNull();
  });
  it('picks the nearest of several spans', () => {
    expect(roadYAlong(pts, [{ s0: 0, s1: 2 }, { s0: 9, s1: 12 }], 0, 10.5)).toBeCloseTo(1.2, 6);
  });
});

describe('boreTube', () => {
  it('pitches with the climb and is longer than its run', () => {
    const t = boreTube({ x: 0, y: 0, z: 0 }, { x: 0, y: 1.2, z: 4 });
    expect(t.rot).toBeCloseTo(0, 6);
    expect(t.pitch).toBeCloseTo(Math.atan2(1.2, 4), 6);
    expect(t.len).toBeCloseTo(Math.hypot(4, 1.2), 6);
    expect(boreTube({ x: 0, y: 5, z: 0 }, { x: 3, y: 5, z: 0 }).pitch).toBe(0);
  });
});

import { surfacePitch } from './driveHeight';
describe('surfacePitch', () => {
  it('reads the slope along the heading, nose up uphill, capped', () => {
    const hill = (_x: number, z: number) => z * 0.1;
    expect(surfacePitch(hill, 0, 0, 0)).toBeCloseTo(Math.atan(0.1), 6);          // heading +z, rising
    expect(surfacePitch(hill, 0, 0, Math.PI)).toBeCloseTo(-Math.atan(0.1), 6);    // heading -z, descending
    expect(surfacePitch(hill, 0, 0, Math.PI / 2)).toBeCloseTo(0, 6);              // across the slope
    expect(surfacePitch((_x, z) => z * 5, 0, 0, 0)).toBe(0.3);
  });
});

import { planRoad, type RoadGround, type RoadInput } from '../../sim/roadPlan';
describe('the planned road\'s own bore', () => {
  const spur: RoadGround = { h: (x, z) => 1 + 3.5 * Math.exp(-(((x - 45) / 2) ** 2)) * (z > 20 && z < 44 ? 1 : 0) };
  const inp: RoadInput = { region: 'mountain_west', seed: 5, ground: spur, rect: { x0: 0, z0: 22, x1: 67, z1: 42 }, frontage: { x: 67, zMin: 24, zMax: 40, band: [24, 40] }, county: () => 70.4, roadHalf: 0.5, yard: [25, 32] };
  it('a car inside the bore is at the road\'s height, far below the hilltop; outside it follows the ground', () => {
    const plan = planRoad(inp), bore = plan.structures.find(s => s.kind === 'tunnel')!;
    expect(bore).toBeTruthy();
    const mid = plan.pts.find(p => p.s >= (bore.s0 + bore.s1) / 2)!;
    const y = roadYAlong(plan.pts, [bore], mid.x, mid.z)!;
    expect(y).toBeCloseTo(mid.y, 3);
    expect(spur.h(mid.x, mid.z) - y).toBeGreaterThan(1.5);             // the hill is metres over the car
    expect(roadYAlong(plan.pts, [bore], plan.pts[0].x, plan.pts[0].z)).toBeNull();
    // never steeper than the bore's own grade: a climb of the road, not a climb over the hill
    const grade = Math.abs(plan.pts.find(p => p.s >= bore.s1)!.y - plan.pts.find(p => p.s >= bore.s0)!.y) / (bore.s1 - bore.s0);
    expect(grade).toBeLessThan(0.15);
  });
});
