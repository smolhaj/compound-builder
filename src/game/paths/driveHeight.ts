/**
 * The height of the access road where it leaves the ground (docs/DECISIONS.md, "Vehicles drive the bore"): on a bridge deck and inside a rock
 * bore the road is not on the hill. Given the planned road's stations and the spans that carry it on a deck or under the hill, `roadYAlong`
 * projects a point onto the nearest piece of those spans and returns the road's own height there (null when the point is not on one, so
 * callers fall back to the ground). Pure (tested).
 */
export interface DrivePt { x: number; z: number; y: number; s: number }
export interface DriveSpan { s0: number; s1: number }

export function roadYAlong(pts: readonly DrivePt[], spans: readonly DriveSpan[], x: number, z: number, maxD = 0.45): number | null {
  let best = maxD * maxD, y: number | null = null;
  for (const sp of spans) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (a.s < sp.s0 - 1e-6 || b.s > sp.s1 + 1e-6) continue;
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
      const t = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
      const px = a.x + dx * t, pz = a.z + dz * t, d = (x - px) ** 2 + (z - pz) ** 2;
      if (d < best) { best = d; y = a.y + (b.y - a.y) * t; }
    }
  }
  return y;
}

/** Pitch (radians, nose up positive) of something heading `rot` at (x, z) on a surface of height `h`, read over `span` units. */
export function surfacePitch(h: (x: number, z: number) => number, x: number, z: number, rot: number, span = 0.6, limit = 0.3): number {
  const dx = Math.sin(rot) * span / 2, dz = Math.cos(rot) * span / 2;
  return Math.max(-limit, Math.min(limit, Math.atan2(h(x + dx, z + dz) - h(x - dx, z - dz), span)));
}

/** A bore's tube from portal A to portal B: its heading, its climb and its length along the slope. */
export function boreTube(A: { x: number; y: number; z: number }, B: { x: number; y: number; z: number }): { rot: number; pitch: number; len: number } {
  const run = Math.hypot(B.x - A.x, B.z - A.z);
  return { rot: Math.atan2(B.x - A.x, B.z - A.z), pitch: Math.atan2(B.y - A.y, Math.max(1e-6, run)), len: Math.hypot(run, B.y - A.y) };
}
