import { describe, expect, it } from 'vitest';
import { carSlot } from './guardCarSlots';
import { distToPolyline } from './gateKitLayout';
import type { Pt } from '../../sim/perimeter';

const HW = 0.275;
const bend: Pt[] = [[0, 0], [8, 0], [11, 1], [13, 4], [14, 8], [14, 20]];

describe('guard car slots follow the drive', () => {
  it('stays beside the lane on a straight drive and on a bend, never wandering off it', () => {
    for (const side of [1, -1] as const) for (const d of [0.5, 2, 5, 9, 14]) for (const off of [0.3, 0.45]) {
      const s = carSlot(bend, 4, d, side, off, HW), dist = distToPolyline(bend, s.c);
      expect(dist).toBeGreaterThan(HW + off - 0.12);
      expect(dist).toBeLessThan(HW + off + 0.12);
    }
  });
  it('the nose points back toward the road along the drive and turns with the bend', () => {
    const a = carSlot(bend, 4, 0.5, 1, 0.3, HW), b = carSlot(bend, 4, 12, 1, 0.3, HW);
    expect(a.nose[0]).toBeLessThan(-0.9);                    // heading +x toward the camp: nose -x
    expect(b.nose[1]).toBeLessThan(-0.7);                    // after the bend the drive runs +z: nose -z
    for (const s of [a, b]) expect(Math.hypot(s.nose[0], s.nose[1])).toBeCloseTo(1, 6);
  });
  it('the two sides are on opposite sides of the lane', () => {
    const l = carSlot(bend, 4, 2, 1, 0.3, HW), r = carSlot(bend, 4, 2, -1, 0.3, HW);
    const v: Pt = [l.c[0] - r.c[0], l.c[1] - r.c[1]];
    expect(v[0] * l.left[0] + v[1] * l.left[1]).toBeGreaterThan(2 * HW);
  });
});
