import { describe, it, expect } from 'vitest';
import { pullOutOfBoxes, type OccBox } from './cameraOcclusion';

const tower: OccBox = { minX: -5, minY: 0, minZ: 20, maxX: 5, maxY: 30, maxZ: 30 };

describe('pullOutOfBoxes', () => {
  it('leaves a camera outside every box alone', () => {
    const p = { x: 0, y: 10, z: 10 };
    expect(pullOutOfBoxes(p, { x: 0, z: 0 }, [tower])).toBe(false);
    expect(p).toEqual({ x: 0, y: 10, z: 10 });
  });

  it('pulls a camera inside a tower in toward the target, in front of the tower', () => {
    const p = { x: 0, y: 6, z: 25 };
    expect(pullOutOfBoxes(p, { x: 0, z: 0 }, [tower], 0.6)).toBe(true);
    expect(p.z).toBeLessThan(20 - 0.5);
    expect(p.z).toBeGreaterThan(15);
    // Stays on the ray target → camera (same pitch)
    expect(p.y / p.z).toBeCloseTo(6 / 25, 5);
  });

  it('lifts over the roof when the target is right at the building', () => {
    const p = { x: 0, y: 6, z: 25 };
    pullOutOfBoxes(p, { x: 0, z: 22 }, [tower], 0.6);
    expect(p.y).toBeCloseTo(30.6, 5);
  });
});
