import { describe, expect, it } from 'vitest';
import { TAPS, TILT, tiltBlur, tiltStrength } from './tiltShift';

describe('tilt-shift look', () => {
  it('is off at eye level and on from above', () => {
    expect(tiltStrength(0)).toBe(0);
    expect(tiltStrength(-0.2)).toBe(0);
    expect(tiltStrength(-0.45)).toBeGreaterThan(0);
    expect(tiltStrength(-0.45)).toBeLessThan(1);
    expect(tiltStrength(-0.7)).toBe(1);
    expect(tiltStrength(-1)).toBe(1);
    let prev = 0;
    for (let d = 0; d >= -1; d -= 0.05) { const s = tiltStrength(d); expect(s).toBeGreaterThanOrEqual(prev - 1e-12); prev = s; }
  });

  it('keeps a band sharp and blurs more toward the top and bottom', () => {
    expect(tiltBlur(TILT.FOCUS)).toBe(0);
    expect(tiltBlur(TILT.FOCUS + TILT.BAND - 0.01)).toBe(0);
    expect(tiltBlur(TILT.FOCUS - TILT.BAND + 0.01)).toBe(0);
    expect(tiltBlur(0)).toBe(1);
    expect(tiltBlur(1)).toBe(1);
    let prev = 0;
    for (let y = TILT.FOCUS; y <= 1; y += 0.02) { const b = tiltBlur(y); expect(b).toBeGreaterThanOrEqual(prev - 1e-12); prev = b; }
    expect(tiltBlur(0.9)).toBeGreaterThan(tiltBlur(0.7));
  });

  it('has blur taps that sum to one (no brightness change) and are symmetric', () => {
    expect(TAPS.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
    for (let i = 0; i < 4; i++) expect(TAPS[i]).toBeCloseTo(TAPS[8 - i], 6);
  });
});
