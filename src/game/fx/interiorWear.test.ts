import { describe, expect, it } from 'vitest';
import { contactPatch, slabMarks } from './interiorWear';

describe('interior wear', () => {
  it('is deterministic for an index and tier', () => {
    expect(slabMarks(5, 0.3, 0.3, 'high')).toEqual(slabMarks(5, 0.3, 0.3, 'high'));
    expect(contactPatch(3, 0.1, 0.05)).toEqual(contactPatch(3, 0.1, 0.05));
  });
  it('is thinner on Medium and Low than on High, and stays on the slab', () => {
    let hi = 0, med = 0, low = 0;
    for (let i = 0; i < 200; i++) {
      const h = slabMarks(i, 0.3, 0.3, 'high'); hi += h.length; med += slabMarks(i, 0.3, 0.3, 'medium').length; low += slabMarks(i, 0.3, 0.3, 'low').length;
      for (const m of h) { expect(Math.abs(m.u)).toBeLessThanOrEqual(0.5); expect(Math.abs(m.v)).toBeLessThanOrEqual(0.5); }
    }
    expect(hi).toBeGreaterThan(med); expect(med).toBeGreaterThan(low);
  });
  it('the contact patch is larger than the footing', () => { const p = contactPatch(9, 0.1, 0.05); expect(p.hx).toBeGreaterThan(0.1); expect(p.hz).toBeGreaterThan(0.05); });
});
