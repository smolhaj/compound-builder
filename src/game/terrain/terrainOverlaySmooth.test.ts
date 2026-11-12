import { describe, expect, it } from 'vitest';
import { smoothColors } from './TerrainOverlay';

describe('smoothColors', () => {
  it('softens a hard edge without tinting it with clear neighbors', () => {
    const nx = 5, nz = 1, col = new Float32Array(nx * nz * 4);
    for (let i = 0; i < 2; i++) col.set([1, 0, 0, 0.5], i * 4);
    smoothColors(col, nx, nz, 1);
    expect(col[2 * 4 + 3]).toBeGreaterThan(0);          // the wash bleeds one cell
    expect(col[0 * 4 + 3]).toBeLessThanOrEqual(0.5);
    expect(col[2 * 4]).toBeCloseTo(1, 5);                // and stays red: clear cells do not dilute the color
    expect(col[4 * 4 + 3]).toBe(0);                      // far cells stay clear
  });
});
