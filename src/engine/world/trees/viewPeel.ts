/**
 * viewPeel — fades trees out of the way of the cutscene camera.
 *
 * A raid cutscene often puts the camera in the woods, and a crown a few yards
 * from the lens fills the frame while the people it is about stand behind it.
 * While a cutscene runs, the player publishes where the action is (a handful
 * of points, the people on the field); InstancedLodSet then shrinks every
 * opted-in tree that (a) stands on the line from the camera to one of those
 * points or (b) is so close to the camera that it fills the picture. Shrinking
 * is done on the CPU while the instances are compacted for the frame, so it
 * adds no draw call, no material and no shader work. Pure math, no three.js.
 */

export interface PeelPoint { x: number; y: number; z: number }
export interface ViewPeel {
  /** Where the action is (people, chest height). */
  targets: readonly PeelPoint[];
}

/** A tree this close to the lens (beyond its own radius, world units; 1 = 6 m) is out of the picture's way. */
export const PEEL_NEAR = 1.0;
/** The line from the camera to a person is kept clear this far out from its centre (world units). */
export const PEEL_LANE = 0.3;
/** Below this scale a tree is not drawn at all. */
const GONE = 0.06;

const smooth = (a: number, b: number, v: number): number => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

let current: ViewPeel | null = null;
let epoch = 0;
let enabled = true;
/** QA switch (before / after screenshots from one frame): off draws every tree as before. */
export function setViewPeelEnabled(on: boolean): void { enabled = on; epoch++; }
/** Publish (or clear, with null) the cutscene's action points. Bumps the epoch so tree sets re-bucket. */
export function setViewPeel(p: ViewPeel | null): void { if (p === null && current === null) return; current = p; epoch++; }
export const getViewPeel = (): ViewPeel | null => (enabled ? current : null);
export const viewPeelEpoch = (): number => epoch;

/**
 * The scale (1 = untouched, 0 = gone) for a tree whose bounding sphere is (cx, cy, cz, r), seen from (ex, ey, ez).
 * Smooth in the camera and sphere position, so a drifting shot shrinks a crown gradually rather than popping it.
 */
export function peelScale(cx: number, cy: number, cz: number, r: number, ex: number, ey: number, ez: number, peel: ViewPeel): number {
  const vx = cx - ex, vy = cy - ey, vz = cz - ez;
  const dist = Math.hypot(vx, vy, vz);
  let f = 1;
  // the crown is in the lens's face
  if (dist < r + PEEL_NEAR) f = Math.min(f, smooth(r * 0.9, r + PEEL_NEAR, dist));
  // the crown is on the way to someone (a tree behind the person is background and stays)
  const crown = r * 0.7;
  for (let i = 0; i < peel.targets.length && f > 0; i++) {
    const t = peel.targets[i];
    const tx = t.x - ex, ty = t.y - ey, tz = t.z - ez;
    const L2 = tx * tx + ty * ty + tz * tz;
    if (L2 < 1e-6) continue;
    const s = (vx * tx + vy * ty + vz * tz) / L2;      // 0 at the camera, 1 at the person
    if (s <= 0) continue;
    // beyond the person: only a crown that reaches back over them
    if (s > 1 && (s - 1) * Math.sqrt(L2) > crown) continue;
    const sc = Math.min(1, s);
    const dx = vx - tx * sc, dy = vy - ty * sc, dz = vz - tz * sc;
    const d = Math.hypot(dx, dy, dz);
    const inner = crown + PEEL_LANE;
    f = Math.min(f, smooth(inner * 0.6, inner + 0.5, d));
  }
  return f < GONE ? 0 : f;
}
