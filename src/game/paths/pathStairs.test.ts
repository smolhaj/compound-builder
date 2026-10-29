import { describe, expect, it } from 'vitest';
import { stairGeometry } from './pathGeometry';
import type { Pt } from '../../sim/pathRoute';

describe('dry-stack stair', () => {
  const ground = (x: number) => (x < 2 ? 0 : x > 5 ? 1.35 : (x - 2) * 0.45);
  const pts: Pt[] = []; for (let x = 2; x <= 5.01; x += 0.2) pts.push([x, 0]);

  it('has a tread per 27 cm of rise, each higher than the last, from the foot to the top', () => {
    const g = stairGeometry(pts, ground, 3);
    expect(g.length).toBe(30);                                   // 1.35 u / 0.045
    const tops = g.map(x => { x.computeBoundingBox(); return x.boundingBox!.max.y; });
    for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeGreaterThan(tops[i - 1]);
    expect(tops[0]).toBeCloseTo(0.075, 2);       // proud of the slope by 18 cm
    expect(tops[tops.length - 1]).toBeCloseTo(1.38, 2);
    const first = g[0].boundingBox!, last = g[g.length - 1].boundingBox!;
    expect(last.min.x).toBeGreaterThan(first.min.x);             // climbs along the trail
  });
  it('is nothing for a one-point trail', () => { expect(stairGeometry([[0, 0]], ground, 1)).toEqual([]); });
});
