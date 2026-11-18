import { describe, expect, it } from 'vitest';
import { shelterUnderDome } from './shelter';

describe('dome shelter', () => {
  const d = { x: 10, z: 10, r: 15 };
  it('is full inside the shell, none outside and above, and fades across the wall', () => {
    expect(shelterUnderDome([d], { x: 10, y: 0.5, z: 10 })).toBe(1);
    expect(shelterUnderDome([d], { x: 40, y: 0.5, z: 10 })).toBe(0);
    expect(shelterUnderDome([d], { x: 10, y: 30, z: 10 })).toBe(0);
    const edge = shelterUnderDome([d], { x: 10 + 14.6, y: 0.3, z: 10 });
    expect(edge).toBeGreaterThan(0); expect(edge).toBeLessThan(1);
  });
  it('is zero with no dome and monotone toward the centre', () => {
    expect(shelterUnderDome([], { x: 0, y: 0, z: 0 })).toBe(0);
    let last = 0;
    for (let r = 20; r >= 0; r -= 0.5) { const v = shelterUnderDome([d], { x: 10 + r, y: 0.3, z: 10 }); expect(v).toBeGreaterThanOrEqual(last); last = v; }
  });
});
