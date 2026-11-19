/**
 * Whether a camera stands under a dome's shell, so the weather layer can keep rain, snow and fog banks out of the dome (the shell is the roof: it
 * rains on the glass, not on the family's yard). Pure. A dome is a hemisphere of radius `r` (world units) on the ground; the shelter fades in over the
 * last few percent of the radius and out above the crown, so crossing the wall never pops. `groundY` is the ground under the dome (the camera's height is
 * measured from it).
 */
/** `k` (default 1): how much of the shell is whole, 0 to 1 (a breached shell lets the weather in: sim/dome/interiorClimate `1 - breachOf(health)`). */
export interface Shell { x: number; z: number; r: number; k?: number }

export function shelterUnderDome(domes: readonly Shell[], cam: { x: number; y: number; z: number }, groundY = 0): number {
  let best = 0;
  for (const d of domes) {
    const dx = cam.x - d.x, dz = cam.z - d.z, h = cam.y - groundY, rr = Math.hypot(dx, dz, Math.max(0, h));
    // inside the sphere of the shell: full cover; across the last 6 percent of the radius it fades out
    const k = Math.max(0, Math.min(1, (d.r * 1.0 - rr) / (d.r * 0.06))) * Math.max(0, Math.min(1, d.k ?? 1));
    if (k > best) best = k;
  }
  return best;
}
