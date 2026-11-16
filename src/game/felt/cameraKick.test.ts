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
