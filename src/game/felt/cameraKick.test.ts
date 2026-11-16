import { describe, expect, it } from 'vitest';
import { shakeOffset } from './cameraKick';

describe('shakeOffset', () => {
  it('is still with no amplitude or with reduced motion', () => {
    expect(shakeOffset(0, 1.2)).toEqual({ x: 0, y: 0 });
    expect(shakeOffset(1, 1.2, true)).toEqual({ x: 0, y: 0 });
  });
  it('stays within 14 px and is deterministic', () => {
    for (let t = 0; t < 6; t += 0.05) { const o = shakeOffset(1, t); expect(Math.abs(o.x)).toBeLessThanOrEqual(14); expect(Math.abs(o.y)).toBeLessThanOrEqual(14); expect(shakeOffset(1, t)).toEqual(o); }
  });
});

import { bearingNudge } from './cameraKick';
describe('bearing nudge (FL2)', () => {
  it('turns toward the bearing, at most 25 degrees either way', () => {
    const lim = 25 * Math.PI / 180;
    expect(Math.abs(bearingNudge(0, 0.1))).toBeLessThanOrEqual(lim + 1e-9);
    expect(bearingNudge(0, Math.PI + 0.1)).toBeCloseTo(0.1, 5);        // already looking that way: a small turn
    expect(bearingNudge(0, 0)).toBeCloseTo(lim, 5);                    // wants to turn half way round: clamped
    expect(bearingNudge(0.3 + Math.PI, 0.3 + 0)).toBeCloseTo(0, 5);
  });
});
