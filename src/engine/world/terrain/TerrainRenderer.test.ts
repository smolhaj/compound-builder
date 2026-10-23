import { describe, expect, it } from 'vitest';
import { R_MAX, terrainAxis } from './TerrainRenderer';

describe('terrainAxis', () => {
  it('is uniform in the core, grows outside it and spans ±R_MAX, sorted', () => {
    const a = terrainAxis(30, 50, 0.5, 1.07);
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThan(a[i - 1]);
    expect(a[0]).toBeCloseTo(30 - R_MAX, 6);
    expect(a[a.length - 1]).toBeCloseTo(30 + R_MAX, 6);
    const mid = a.indexOf(30);
    expect(mid).toBeGreaterThan(0);
    expect(a[mid + 1] - a[mid]).toBeCloseTo(0.5, 6);
    expect(a[mid + 100] - a[mid + 99]).toBeCloseTo(0.5, 6);
    expect(a[a.length - 1] - a[a.length - 2]).toBeGreaterThan(10);
    expect(a.length).toBeLessThan(500);
  });
});
