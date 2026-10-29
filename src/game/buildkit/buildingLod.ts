/**
 * Distance LOD for finished buildings (pure: no THREE, no scene).
 *
 * A finished, enclosed building (opaque walls and a roof, no open frame) shows its inside only through
 * its windows. From across the yard a window is a few pixels wide, so the studs behind the siding, the
 * rafters under the roof, the furniture and the loft are invisible: drawing them (and casting their
 * shadows) is pure cost. Beyond a tier-dependent distance those layers are hidden; walls, roof, openings,
 * decor (curtains, signs), the chimney and the foundation stay, so the building looks the same.
 *
 * Open frames (greenhouses, gardens, orchards, pergolas, towers: `keep` lists the frame) and anything with
 * see-through walls keep every layer: their inside IS what you see.
 */
export type LodTier = 'high' | 'medium' | 'low';

/** Camera-to-building distance (world units, 1 ≈ 6 m) beyond which the inside is hidden. */
export const INTERIOR_HIDE_DIST: Record<LodTier, number> = { high: 18, medium: 14, low: 10 };

/** Hysteresis band (world units) so a building at the threshold does not flicker. */
export const LOD_HYSTERESIS = 1.5;

/** Wall materials you can see through (their buildings never lose their inside). */
const SEE_THROUGH = /^(kit_)?(glass|polycarb|wire_mesh|string|glow)/;

export interface LodMesh { layer: string; material: string }

/**
 * The layers to hide on a far, finished building, or an empty list when its inside is visible from outside.
 * `keep`: the layers the kit lists as the finished thing (posts, racking, studs of an open frame); any entry means
 * the frame is part of the look, so nothing is hidden.
 */
export function farHiddenLayers(meshes: readonly LodMesh[], keep: readonly string[] = []): string[] {
  const walls = meshes.filter(m => m.layer === 'walls');
  const roofed = meshes.some(m => m.layer === 'roof');
  const opaqueWalls = walls.length > 0 && walls.every(m => !SEE_THROUGH.test(m.material));
  if (!roofed || !opaqueWalls || keep.length > 0) return [];
  const present = new Set(meshes.map(m => m.layer));
  return ['frame', 'rafters', 'interior', 'loft'].filter(l => present.has(l));
}

/** Is a building far (inside hidden)? `wasFar` gives the hysteresis. */
export function isFar(distance: number, wasFar: boolean, tier: LodTier): boolean {
  const limit = INTERIOR_HIDE_DIST[tier];
  return wasFar ? distance > limit - LOD_HYSTERESIS : distance > limit + LOD_HYSTERESIS;
}
