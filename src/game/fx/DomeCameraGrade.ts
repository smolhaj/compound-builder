/**
 * Warm inside, cold outside (rendering only, nothing saved). The cold look of a disaster (the ice age's blue cast, low saturation and dim sky) is a
 * whole-frame grade, so it cannot be masked per pixel without depth. When the CAMERA is inside a protected dome, though, the whole frame should be the dome's
 * lit inside: this eases the grade's cast, saturation, contrast, light dim and sky tint toward a warm neutral by `k` (the camera's share of being under a
 * protected shell, 0 to 1). Outside (aerials, other views) `k` is 0 and the look is returned unchanged. No render target, pass or uniform is added: the
 * result feeds the existing `setCollapseLook`. Pure, tested.
 */
export interface GradeLook { cast: readonly number[]; sat: number; contrast: number; dim: number; amt: number }

/** The warm neutral the inside eases toward: a faint amber cast, a little extra saturation, a touch of contrast, full light, no cold sky tint. */
export const WARM_INSIDE = { cast: [1.06, 1.0, 0.88], sat: 1.08, contrast: 0.04, dim: 1, amt: 0 } as const;

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The look with the cold grade eased toward the warm interior by `k`. Same object back when k is 0. */
export function warmInside<T extends GradeLook>(look: T, k: number): T {
  const t = clamp01(k);
  if (t <= 0.001) return look;
  return {
    ...look,
    cast: [0, 1, 2].map(i => lerp(look.cast[i] ?? 1, WARM_INSIDE.cast[i], t)),
    sat: lerp(look.sat, Math.max(look.sat, WARM_INSIDE.sat), t),
    contrast: lerp(look.contrast, WARM_INSIDE.contrast, t),
    dim: lerp(look.dim, Math.max(look.dim, WARM_INSIDE.dim), t),
    amt: lerp(look.amt, WARM_INSIDE.amt, t),
  };
}

/** Ease the camera's inside-share toward its target (about 0.4 s to settle, so walking through an airlock fades the grade in and out). */
export function easeInside(prev: number, target: number, dt: number): number {
  const k = 1 - Math.exp(-Math.max(0, Number.isFinite(dt) ? dt : 0) * 6);
  return clamp01(prev + (clamp01(target) - prev) * k);
}
