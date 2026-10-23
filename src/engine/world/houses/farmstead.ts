/**
 * Farmstead layout record (UE regionalRoads): yard centre, facing, size and
 * an optional annex block behind the yard. Local frame: +z away from the
 * road; the yard is the ±7.5 square.
 */
export interface Farmstead {
  x: number; z: number; rot: number; big: boolean;
  annex?: { kind: 'poultry' | 'hog' | 'pecan' | 'plots'; x0: number; x1: number; z0: number; z1: number };
  /** A land-grant university research farm (UE only; never set here). */
  uni?: boolean;
}

/** Is (x, z) on a farmstead's yard or annex (plus `pad`)? */
export function onFarmstead(farms: ReadonlyArray<Farmstead>, x: number, z: number, pad = 0): boolean {
  for (const f of farms) {
    if (Math.abs(x - f.x) < 10.5 + pad && Math.abs(z - f.z) < 10.5 + pad) return true;
    const a = f.annex;
    if (!a) continue;
    const dx = x - f.x, dz = z - f.z, c = Math.cos(f.rot), s = Math.sin(f.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (lx > a.x0 - pad && lx < a.x1 + pad && lz > a.z0 - pad && lz < a.z1 + pad) return true;
  }
  return false;
}
