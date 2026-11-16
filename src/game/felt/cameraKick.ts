/** The hit moment's shake curve (docs/FELT_LAYER.md 5.1): pure, so it is tested without a canvas. Offsets are in CSS pixels. */

/** Pixel offset of the picture at `t` seconds for a shake of amplitude `amp` (0..1). Zero when `amp` is 0 or `reduced` is set. */
export function shakeOffset(amp: number, t: number, reduced = false): { x: number; y: number } {
  if (reduced || amp <= 0) return { x: 0, y: 0 };
  const a = Math.min(1, amp) * 14;
  return { x: a * Math.sin(t * 47.3) * Math.cos(t * 13.1), y: a * Math.sin(t * 39.7 + 1.3) * Math.cos(t * 17.9) };
}

/** The yaw offset (radians) that turns the diorama camera toward a skyline bearing, at most `maxDeg` either way (docs/FELT_LAYER.md 5.1). */
export function bearingNudge(currentYaw: number, az: number, maxDeg = 25): number {
  // the camera sits on the opposite side of its target from where it looks: to look toward `az` its yaw is az + pi
  const want = az + Math.PI;
  let d = (want - currentYaw) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  const lim = maxDeg * Math.PI / 180;
  return Math.max(-lim, Math.min(lim, d));
}
