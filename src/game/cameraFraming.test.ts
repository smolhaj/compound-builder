import { describe, expect, it } from 'vitest';
import { FRAME_MAX_R, FRAME_MIN_R, frameOn, startFrame } from './cameraFraming';

describe('camera framing', () => {
  it('nothing to frame gives nothing', () => expect(frameOn([])).toBeNull());
  it('one piece gets the closest view, centered on it', () => {
    const f = frameOn([{ x: 10, z: 20 }])!;
    expect(f).toMatchObject({ x: 10, z: 20, radius: FRAME_MIN_R });
  });
  it('a spread of pieces is centered and the radius grows with it, within the limits', () => {
    const small = frameOn([{ x: 0, z: 0 }, { x: 8, z: 0 }])!, wide = frameOn([{ x: 0, z: 0 }, { x: 30, z: 20 }])!, huge = frameOn([{ x: 0, z: 0 }, { x: 400, z: 0 }])!;
    expect(wide.x).toBe(15); expect(wide.z).toBe(10);
    expect(wide.radius).toBeGreaterThan(small.radius);
    expect(huge.radius).toBe(FRAME_MAX_R);
  });
  it('the start view is over the house, never the whole parcel (the old 90-unit view made it a speck)', () => {
    const camp = { x: 49, z: 28 };
    expect(startFrame([], camp).radius).toBeLessThan(60);
    const f = startFrame([{ x: 52, z: 30 }, { x: 54, z: 33 }, { x: 5, z: 5 }, { x: 0, z: 0, unplaced: true }], camp);
    expect(f.radius).toBeLessThan(45);
    expect(Math.hypot(f.x - 53, f.z - 31.5)).toBeLessThan(1);
  });
});
