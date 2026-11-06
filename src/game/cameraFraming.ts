/**
 * Where the diorama camera should stand to show something: the start view (the player's house or camp), and "show me" / "place all"
 * (the pieces just staked). Pure, tested. Units are world units (1 ≈ 6 m); the radius is the orbit distance of `DioramaCamera`.
 */
export interface Pt { x: number; z: number }
export interface Frame { x: number; z: number; radius: number; pitch: number }

/** Closest and farthest the framing goes: close enough to read a house (and see white staked pads), far enough to see its yard. */
export const FRAME_MIN_R = 26, FRAME_MAX_R = 70;
export const FRAME_PITCH = 0.68;

/** A frame that holds all the points with a margin; one point gets the closest view. */
export function frameOn(points: readonly Pt[], margin = 5): Frame | null {
  if (!points.length) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const ext = Math.hypot(x1 - x0, z1 - z0) + margin * 2;
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, radius: Math.max(FRAME_MIN_R, Math.min(FRAME_MAX_R, ext * 1.25 + 8)), pitch: FRAME_PITCH };
}

/**
 * The first view of a place: the buildings that stand on it (the house and its neighbors within a short walk), else the camp.
 * Never the whole parcel: from there the house is a speck.
 */
export function startFrame(structures: ReadonlyArray<{ x: number; z: number; unplaced?: boolean }>, camp: Pt): Frame {
  const placed = structures.filter(s => !s.unplaced);
  const near = placed.filter(s => Math.hypot(s.x - camp.x, s.z - camp.z) < 18);
  const f = frameOn(near.length ? near : [camp], near.length ? 6 : 10)!;
  return { ...f, radius: near.length ? f.radius : 40 };
}
