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
