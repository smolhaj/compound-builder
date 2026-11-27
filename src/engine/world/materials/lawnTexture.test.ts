import { describe, expect, it } from 'vitest';
import { LAWN_UNIFORM, ensureLawnTexture, lawnSize, lawnTexels, releaseLawnTexture } from './lawnTexture';

describe('lawn texture', () => {
  const N = 64, a = lawnTexels(N, 7);
  it('is deterministic and sized by tier (512 High, 256 below)', () => {
    expect(Array.from(lawnTexels(N, 7).slice(0, 400))).toEqual(Array.from(a.slice(0, 400)));
    expect(lawnTexels(N, 8)).not.toEqual(a);
    expect(lawnSize('high')).toBe(512); expect(lawnSize('medium')).toBe(256); expect(lawnSize('low')).toBe(256);
  });
  it('reads as natural grass: green dominant, not neon, with tonal variation and some dry patches', () => {
    let r = 0, g = 0, b = 0, minG = 255, maxG = 0;
    for (let i = 0; i < N * N; i++) { r += a[i * 4]; g += a[i * 4 + 1]; b += a[i * 4 + 2]; minG = Math.min(minG, a[i * 4 + 1]); maxG = Math.max(maxG, a[i * 4 + 1]); }
    r /= N * N; g /= N * N; b /= N * N;
    expect(g).toBeGreaterThan(r); expect(g).toBeGreaterThan(b);
    expect(g / 255).toBeLessThan(0.6);                       // the old flat lawn was sRGB green 142+
    expect((g - b) / g).toBeLessThan(0.65);                  // saturation capped: olive, not neon
    expect(maxG - minG).toBeGreaterThan(40);
  });
  it('tiles: the edge texels are close to the opposite edge (no hard seam)', () => {
    let d = 0; for (let y = 0; y < N; y++) for (const c of [1, 2]) d += Math.abs(a[(y * N) * 4 + c] - a[(y * N + N - 1) * 4 + c]);
    expect(d / (N * 2)).toBeLessThan(40);
  });
  it('shares one texture across calls and rebuilds only when the size changes', () => {
    releaseLawnTexture();
    const t1 = ensureLawnTexture('medium'), t2 = ensureLawnTexture('low');
    expect(t2).toBe(t1); expect(LAWN_UNIFORM.value).toBe(t1);
    const t3 = ensureLawnTexture('high'); expect(t3).not.toBe(t1); expect(t3.image.width).toBe(512);
    releaseLawnTexture();
  });
});
