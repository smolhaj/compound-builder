import { describe, expect, it } from 'vitest';
import { YARD, YARD_BOXES, yardBlockedLocal, yardSolidLocal } from './yardGeometry';

describe('yard props', () => {
  it('keeps the camera / walker out of the picnic table, woodpile and grill', () => {
    expect(yardSolidLocal(YARD.picnic.x, 0.05, YARD.picnic.z)).toBe(true);
    expect(yardBlockedLocal(YARD.woodpile.x, YARD.woodpile.z, 0.1)).toBe(true);
    expect(yardBlockedLocal(YARD.grill.x, YARD.grill.z, 0)).toBe(true);
  });
  it('lets an eye above a table, or well clear of every prop, through', () => {
    expect(yardSolidLocal(YARD.picnic.x, 0.45, YARD.picnic.z, 0.04)).toBe(false);
    expect(yardBlockedLocal(0.1, -0.2, 0.1)).toBe(false);
  });
  it('has boxes with sane extents', () => {
    for (const b of YARD_BOXES) { expect(b.x1).toBeGreaterThan(b.x0); expect(b.z1).toBeGreaterThan(b.z0); expect(b.top).toBeGreaterThan(0); }
  });
});
