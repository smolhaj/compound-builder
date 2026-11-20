import { describe, expect, it } from 'vitest';
import { WARM_INSIDE, easeInside, warmInside } from './DomeCameraGrade';

const ICE = { cast: [0.9, 0.98, 1.1], sat: 0.55, contrast: 0.02, dim: 0.62, amt: 0.65, other: 7 };

describe('dome camera grade', () => {
  it('is the same look outside (k = 0)', () => { expect(warmInside(ICE, 0)).toBe(ICE); expect(warmInside(ICE, NaN)).toBe(ICE); });
  it('is the warm neutral fully inside, and keeps every other field', () => {
    const w = warmInside(ICE, 1);
    expect(w.cast).toEqual([...WARM_INSIDE.cast]); expect(w.sat).toBe(WARM_INSIDE.sat); expect(w.dim).toBe(1); expect(w.amt).toBe(0); expect(w.other).toBe(7);
  });
  it('moves monotonically from cold to warm', () => {
    let last = warmInside(ICE, 0);
    for (let k = 0.1; k <= 1.001; k += 0.1) { const w = warmInside(ICE, k); expect(w.sat).toBeGreaterThanOrEqual(last.sat); expect(w.dim).toBeGreaterThanOrEqual(last.dim); expect(w.cast[2]).toBeLessThanOrEqual(last.cast[2] + 1e-9); expect(w.amt).toBeLessThanOrEqual(last.amt + 1e-9); last = w; }
  });
  it('never cools a look that is already warmer or more saturated', () => {
    const w = warmInside({ cast: [1, 1, 1], sat: 1.3, contrast: 0, dim: 1, amt: 0 }, 1);
    expect(w.sat).toBe(1.3);
  });
  it('eases without overshooting and ignores bad dt', () => {
    let v = 0; for (let i = 0; i < 60; i++) v = easeInside(v, 1, 1 / 60);
    expect(v).toBeGreaterThan(0.9); expect(v).toBeLessThanOrEqual(1);
    expect(easeInside(0.5, 1, NaN)).toBe(0.5);
  });
});
