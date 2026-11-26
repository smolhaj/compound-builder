/**
 * lawnTexture: the one shared grass surface for a climate-held dome's interior lawn (season patch, SEA_LAWN on the terrain material). Pure array math (no canvas, so it
 * is testable in node and keeps no canvas backing alive): a tileable RGBA8 texture, sRGB color in RGB and a blade height in A.
 *
 *   - tonal variation: several greens (deep, mid, blue-green, yellow-green) mixed by low-frequency tileable noise, a few dry, tan-brown patches
 *   - blade streaks: short strokes of varied tone and direction, brighter at the tip, each lifting the height channel (the shader bumps the normal from it)
 *   - specks: clover (pale green clusters), dandelion (yellow) and daisy (white) dots, sparse
 *
 * The mean color sits at the terrain's own olive grass (0x557a3a), not the neon green the flat lawn colour had. Sized 512 on High and 256 on Medium and Low (heap: one
 * texture, the CPU copy is dropped after the GPU upload). Everything is seeded; nothing here reads the clock or Math.random.
 */
import * as THREE from 'three';

export type LawnTier = 'low' | 'medium' | 'high';
/** Texture edge in texels for a tier: 512 on High, 256 below. */
export const lawnSize = (tier: LawnTier): number => (tier === 'high' ? 512 : 256);

const lcg = (seed: number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

/** Tileable value-noise field (0..1) of `n` x `n` samples, summed over lattice periods (octave amplitudes halve). Deterministic for a seed. */
export function tileNoise(n: number, periods: readonly number[], seed: number): Float32Array {
  const rnd = lcg(seed), out = new Float32Array(n * n);
  let amp = 1, total = 0;
  for (const P of periods) {
    const lat = new Float32Array(P * P); for (let k = 0; k < lat.length; k++) lat[k] = rnd();
    const cell = n / P;
    for (let y = 0; y < n; y++) {
      const fy = y / cell, y0 = Math.floor(fy) % P, y1 = (y0 + 1) % P; let ty = fy - Math.floor(fy); ty = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < n; x++) {
        const fx = x / cell, x0 = Math.floor(fx) % P, x1 = (x0 + 1) % P; let tx = fx - Math.floor(fx); tx = tx * tx * (3 - 2 * tx);
        const a = lat[y0 * P + x0], b = lat[y0 * P + x1], c = lat[y1 * P + x0], d = lat[y1 * P + x1];
        out[y * n + x] += amp * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
      }
    }
    total += amp; amp *= 0.5;
  }
  for (let k = 0; k < out.length; k++) out[k] /= total;
  return out;
}

type RGB = readonly [number, number, number];
// sRGB 0..255. MID matches the terrain's own grass (0x557a3a = 85, 122, 58), so the lawn and the outside ground read as one family.
const DEEP: RGB = [58, 90, 40], MID: RGB = [88, 122, 56], BLUE: RGB = [66, 108, 62], YELLOW: RGB = [128, 148, 64], DRY: RGB = [152, 128, 74];
const mix3 = (a: RGB, b: RGB, t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** RGBA8 texels (sRGB color, blade height in A) of an `n` x `n` tileable lawn for a seed. Pure and deterministic. */
export function lawnTexels(n: number, seed = 20261126): Uint8Array {
  const rnd = lcg(seed), k2 = (n / 512) * (n / 512), lk = n / 512;
  const tone = tileNoise(n, [3, 6, 12], seed + 1), hue = tileNoise(n, [2, 5], seed + 2), dry = tileNoise(n, [3, 7], seed + 3), clump = tileNoise(n, [8, 16, 32], seed + 4);
  const r = new Float32Array(n * n), g = new Float32Array(n * n), b = new Float32Array(n * n), h = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    // base: deep to mid by tone, drifting to blue-green or yellow-green by hue
    let c = mix3(DEEP, MID, Math.min(1, tone[i] * 1.25));
    const hv = hue[i];
    if (hv < 0.38) c = mix3(c, BLUE, (0.38 - hv) / 0.38 * 0.7); else if (hv > 0.62) c = mix3(c, YELLOW, (hv - 0.62) / 0.38 * 0.8);
    // dry patches: the top of a second field, a soft edge, never the whole lawn
    const d = Math.max(0, (dry[i] - 0.64) / 0.2); if (d > 0) c = mix3(c, DRY, Math.min(1, d) * 0.6);
    r[i] = c[0]; g[i] = c[1]; b[i] = c[2]; h[i] = 0.18 + clump[i] * 0.2;
  }
  // blade streaks: short strokes, mostly upright with a wide spread, later strokes on top; the tone follows the base with a jitter, the tip is lighter
  const blades = Math.round(30000 * k2);
  for (let q = 0; q < blades; q++) {
    const x0 = rnd() * n, y0 = rnd() * n, ang = Math.PI / 2 + (rnd() - 0.5) * 2.4, len = (3 + rnd() * 8) * Math.max(0.6, lk);
    const layer = q / blades, jit = 0.72 + rnd() * 0.5, yel = rnd() < 0.14 ? 1.18 : 1, dx = Math.cos(ang), dy = Math.sin(ang);
    const base = (((Math.floor(y0) % n) + n) % n) * n + (((Math.floor(x0) % n) + n) % n);
    for (let s = 0; s < len; s += 0.6) {
      const t = s / len, px = ((Math.floor(x0 + dx * s) % n) + n) % n, py = ((Math.floor(y0 + dy * s) % n) + n) % n, k = py * n + px, lift = (0.82 + t * 0.34) * jit;
      const a = 0.55 + 0.25 * (1 - t);
      r[k] += (r[base] * lift * yel - r[k]) * a; g[k] += (g[base] * lift - g[k]) * a; b[k] += (b[base] * lift * 0.92 - b[k]) * a;
      h[k] = Math.max(h[k], 0.3 + layer * 0.35 + t * 0.3);
    }
  }
  // specks: clover clusters, dandelions, a few daisies (a 1 to 3 texel dot; kept rare so the lawn reads as grass first)
  const put = (cx: number, cy: number, rad: number, col: RGB, a: number, lift: number): void => {
    for (let oy = -rad; oy <= rad; oy++) for (let ox = -rad; ox <= rad; ox++) {
      if (ox * ox + oy * oy > rad * rad + 0.3) continue;
      const k = (((Math.floor(cy + oy) % n) + n) % n) * n + (((Math.floor(cx + ox) % n) + n) % n);
      r[k] += (col[0] - r[k]) * a; g[k] += (col[1] - g[k]) * a; b[k] += (col[2] - b[k]) * a; h[k] = Math.max(h[k], lift);
    }
  };
  const clovers = Math.round(46 * k2), dandel = Math.round(26 * k2), daisy = Math.round(12 * k2);
  for (let q = 0; q < clovers; q++) { const cx = rnd() * n, cy = rnd() * n; for (let m = 0; m < 7; m++) put(cx + (rnd() - 0.5) * 9, cy + (rnd() - 0.5) * 9, 1, [118 + rnd() * 30, 150 + rnd() * 25, 80], 0.6, 0.5); }
  for (let q = 0; q < dandel; q++) put(rnd() * n, rnd() * n, lk > 0.75 ? 1 : 0, [236, 200 + rnd() * 20, 56], 0.85, 0.62);
  for (let q = 0; q < daisy; q++) put(rnd() * n, rnd() * n, 0, [236, 236, 222], 0.85, 0.6);
  // a light [1 2 1] blur, half strength, so single-texel blade strokes do not show as stair steps up close
  const soften = (f: Float32Array): void => {
    const t = new Float32Array(f.length);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const xm = (x + n - 1) % n, xp = (x + 1) % n, ym = (y + n - 1) % n, yp = (y + 1) % n, k = y * n + x; t[k] = (f[k] * 4 + f[y * n + xm] + f[y * n + xp] + f[ym * n + x] + f[yp * n + x]) / 8; }
    for (let k = 0; k < f.length; k++) f[k] = (f[k] + t[k]) / 2;
  };
  soften(r); soften(g); soften(b); soften(h);
  const out = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    out[i * 4] = Math.round(Math.max(0, Math.min(255, r[i]))); out[i * 4 + 1] = Math.round(Math.max(0, Math.min(255, g[i]))); out[i * 4 + 2] = Math.round(Math.max(0, Math.min(255, b[i])));
    out[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, h[i])) * 255);
  }
  return out;
}

/** The shared uniform the terrain material's lawn branch samples (assigned into the shader's uniforms by reference). */
export const LAWN_UNIFORM: { value: THREE.DataTexture | null } = { value: null };
let _size = 0;

/**
 * Build (or rebuild at another tier size) the shared lawn texture. The CPU texel array is released once the GPU has the image, so the texture costs video memory
 * only; a lost GL context would need another call (`ensure` after a `releaseLawnTexture`). Returns the texture.
 */
export function ensureLawnTexture(tier: LawnTier): THREE.DataTexture {
  const n = lawnSize(tier);
  if (LAWN_UNIFORM.value && _size === n) return LAWN_UNIFORM.value;
  const old = LAWN_UNIFORM.value;
  const tex = new THREE.DataTexture(lawnTexels(n), n, n, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4;
  tex.onUpdate = () => { (tex.image as { data: unknown }).data = null; tex.onUpdate = null; };
  tex.needsUpdate = true;
  LAWN_UNIFORM.value = tex; _size = n;
  old?.dispose();
  return tex;
}

/** Free the shared texture (tests, a page teardown). */
export function releaseLawnTexture(): void { LAWN_UNIFORM.value?.dispose(); LAWN_UNIFORM.value = null; _size = 0; }
