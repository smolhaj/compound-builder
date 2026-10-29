import { describe, expect, it } from 'vitest';
import { distToLine, lineLength, planAccess, pointAt, roadLine, roadX, smoothLine } from './access';
import { PARCEL_SIZE } from '../parcel/parcelTerrain';

describe('access', () => {
  it('runs the county road just east of the parcel, the whole way', () => {
    for (let z = -500; z <= 500; z += 37) {
      expect(roadX(z)).toBeGreaterThan(PARCEL_SIZE + 1);
      expect(roadX(z)).toBeLessThan(PARCEL_SIZE + 6);
    }
    expect(roadLine().length).toBeGreaterThan(300);
  });

  it('lays a driveway from the road through the gate to the yard', () => {
    const a = planAccess({ x: 30, z: 40 });
    const [sx, sz] = a.drive[0];
    expect(Math.abs(sx - roadX(sz))).toBeLessThan(0.6);
    expect(distToLine(a.drive, a.gate.x, a.gate.z)).toBeLessThan(0.1);
    expect(distToLine(a.drive, a.yard.x, a.yard.z)).toBeLessThan(1);
    expect(lineLength(a.drive)).toBeGreaterThan(30);
  });

  it('measures polylines', () => {
    const l: Array<[number, number]> = [[0, 0], [0, 10], [10, 10]];
    expect(lineLength(l)).toBeCloseTo(20);
    const p = pointAt(l, 15);
    expect(p.x).toBeCloseTo(5); expect(p.z).toBeCloseTo(10); expect(p.rot).toBeCloseTo(Math.PI / 2);
    expect(distToLine(l, 5, 5)).toBeCloseTo(5);
    const s = smoothLine(l, 1);
    expect(s[0]).toEqual([0, 0]);
    expect(s[s.length - 1]).toEqual([10, 10]);
  });
});

describe('access from the planned road', () => {
  it('turns a plan into the drive the world draws: a point every half unit from the county road to the yard, with coarse points and a box for the distance tests', async () => {
    const { accessFromPlan } = await import('./access');
    const { planRoad } = await import('../../sim/roadPlan');
    const plan = planRoad({ region: 'appalachia', seed: 3, ground: { h: () => 1 }, rect: { x0: 0, z0: 0, x1: 67, z1: 67 }, frontage: { x: 67, zMin: 4, zMax: 63, band: [24, 40] }, county: () => 70.4, roadHalf: 0.5, yard: [30, 32] });
    const a = accessFromPlan(plan);
    expect(a.drive.length).toBe(plan.pts.length);
    expect(a.driveQ.length).toBeLessThan(a.drive.length / 2);
    expect(distToLine(a.driveQ, a.gate.x, a.gate.z)).toBeLessThan(0.4);
    expect(distToLine(a.drive, a.yard.x, a.yard.z)).toBeLessThan(0.05);
    for (const [x, z] of a.drive) { expect(x).toBeGreaterThanOrEqual(a.box[0] - 1e-9); expect(x).toBeLessThanOrEqual(a.box[2] + 1e-9); expect(z).toBeGreaterThanOrEqual(a.box[1] - 1e-9); expect(z).toBeLessThanOrEqual(a.box[3] + 1e-9); }
  });
});
