/**
 * Where the county road crosses a gap (docs/DECISIONS.md, "Terrain and infrastructure pass"): a creek, a ravine, a gorge. The road
 * is drawn on the ground, so left alone it dives into the cut and climbs out the far wall. A sane county puts a bridge there: the
 * deck runs level-ish from rim to rim, never lower than the water.
 *
 * Pure, deterministic. The ground along the road is sampled every `step` units; a grey closing (the lowest the road could run if
 * it were allowed to bridge anything narrower than 2 x `reach` units) minus the ground is the depth of the cut under the road.
 * A run deeper than `minDepth`, or wet, is a gap; gaps closer than `merge` units are one.
 */

export interface CountyGap {
  /** The first and last z (along the road) the deck covers: the rims. */
  z0: number; z1: number;
  /** Ground height at each rim (the deck starts and ends level with it) and the deepest cut under the span, units. */
  y0: number; y1: number; depth: number;
  /** Water runs under it (the creek, a lake): the deck is kept above the surface. */
  wet: boolean;
  lengthM: number;
}

export interface GapOptions {
  step?: number;
  /** Half the window the closing bridges, units (14 = 84 m each way). */
  reach?: number;
  /** A dry cut shallower than this is a dip, not a gap (units; 1 = 6 m: a county grades through anything lesser). Water is a gap at any depth. */
  minDepth?: number;
  merge?: number;
  /** Units added past each end so the deck rests on the rim. */
  pad?: number;
  /** A dry gap wider than this is a valley the road grades down into and out of, not a bridge (m; water is always bridged). */
  maxDryM?: number;
}

const U = 6;

/** Grey closing of `h` (dilate then erode, a window of ±`w` samples): fills every valley narrower than the window. */
export function closing(h: readonly number[], w: number): number[] {
  const n = h.length, dil = new Array<number>(n), out = new Array<number>(n);
  for (let i = 0; i < n; i++) { let m = -Infinity; for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) if (h[j] > m) m = h[j]; dil[i] = m; }
  for (let i = 0; i < n; i++) { let m = Infinity; for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) if (dil[j] < m) m = dil[j]; out[i] = m; }
  return out;
}

export function findCountyGaps(hAt: (z: number) => number, wetAt: (z: number) => boolean, zFrom: number, zTo: number, o: GapOptions = {}): CountyGap[] {
  const step = o.step ?? 0.5, w = Math.round((o.reach ?? 14) / step), minDepth = o.minDepth ?? 1.0, merge = o.merge ?? 2, pad = o.pad ?? 1;
  const n = Math.floor((zTo - zFrom) / step) + 1, z = (i: number) => zFrom + i * step;
  const h = Array.from({ length: n }, (_, i) => hAt(z(i))), wet = Array.from({ length: n }, (_, i) => wetAt(z(i)));
  const env = closing(h, w);
  // (the closing is unreliable within a window of the ends of the scan: nothing is a gap there)
  const bad = h.map((v, i) => wet[i] || (i > w && i < n - 1 - w && env[i] - v > minDepth));
  const runs: Array<[number, number]> = [];
  for (let i = 0; i < n;) {
    if (!bad[i]) { i++; continue; }
    let j = i; while (j + 1 < n && bad[j + 1]) j++;
    const last = runs[runs.length - 1];
    if (last && (i - last[1]) * step <= merge) last[1] = j; else runs.push([i, j]);
    i = j + 1;
  }
  const padN = Math.round(pad / step);
  const maxDryM = o.maxDryM ?? 72;
  return runs.map(([a0, b0]) => {
    // the deck rests on the rims: out along the walls to where the ground meets the closing again
    let a = a0, b = b0;
    while (a > 0 && env[a - 1] - h[a - 1] > 0.05) a--;
    while (b < n - 1 && env[b + 1] - h[b + 1] > 0.05) b++;
    const i0 = Math.max(0, a - padN), i1 = Math.min(n - 1, b + padN);
    let depth = 0, isWet = false;
    for (let i = a; i <= b; i++) { depth = Math.max(depth, env[i] - h[i]); if (wet[i]) isWet = true; }
    return { z0: z(i0), z1: z(i1), y0: h[i0], y1: h[i1], depth, wet: isWet, lengthM: (z(i1) - z(i0)) * U };
  }).filter(g => g.wet || g.lengthM <= maxDryM);
}

/** The deck height at `z` over a gap: level between the rims, lifted to `minY` (the water surface plus clearance) when it would sag below it. */
export function deckY(g: CountyGap, zq: number, minY = -Infinity): number {
  const t = Math.max(0, Math.min(1, (zq - g.z0) / (g.z1 - g.z0 || 1)));
  return Math.max(g.y0 + (g.y1 - g.y0) * t, minY);
}

/** Is z on a gap's deck? */
export const onGap = (gaps: readonly CountyGap[], z: number): CountyGap | null => gaps.find(g => z >= g.z0 && z <= g.z1) ?? null;
