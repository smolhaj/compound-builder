/**
 * The guard dog's inner post (docs/DECISIONS.md, "Raiders walk the terrain lane": dogs posted inside the compound at the inner gate; sim/laneWalk
 * `guardDogs`). Where it is: just inside the gate of the innermost finished ring round the house, facing the gate; with no inner ring, by the
 * house on the gate's side. Pure (tested).
 */
import type { Pt } from '../../sim/pathRoute';
import { along } from '../perimeter/perimeterGeometry';

export interface RingForPost { pts: readonly Pt[]; gates: ReadonlyArray<{ at: number }> }
export interface Post { x: number; z: number; face: number; /** Which ring (0: none, the house itself). */ ring: number }

const meanR = (pts: readonly Pt[], c: Pt): number => pts.reduce((a, p) => a + Math.hypot(p[0] - c[0], p[1] - c[1]), 0) / Math.max(1, pts.length);

/** The inner post: `rings` are the finished closed rings round `house` (the property line among them), `outer` the gate on the property line. */
export function innerPost(rings: readonly RingForPost[], house: Pt, outer: Pt): Post {
  // the innermost ring that has a gate; of its gates the one nearest the way in
  const withGate = rings.filter(r => r.gates.length && r.pts.length > 2).map(r => ({ r, rad: meanR(r.pts, house) })).sort((a, b) => a.rad - b.rad);
  // (the property line alone is the outer gate's own post: the inner post is by the house then)
  const pick = rings.length >= 2 ? withGate.find(w => w.rad > 1.2) : undefined;
  if (pick) {
    let best: { x: number; z: number; d: number } | null = null;
    for (const g of pick.r.gates) {
      const p = along(pick.r.pts, g.at), d = Math.hypot(p.x - outer[0], p.z - outer[1]);
      if (!best || d < best.d) best = { x: p.x, z: p.z, d };
    }
    const gx = best!.x, gz = best!.z, d = Math.hypot(house[0] - gx, house[1] - gz) || 1;
    // 0.7 u (4 m) inside the gate, toward the house
    const x = gx + (house[0] - gx) / d * 0.7, z = gz + (house[1] - gz) / d * 0.7;
    return { x, z, face: Math.atan2(gx - x, gz - z), ring: withGate.indexOf(pick) + 1 };
  }
  const d = Math.hypot(outer[0] - house[0], outer[1] - house[1]) || 1, ux = (outer[0] - house[0]) / d, uz = (outer[1] - house[1]) / d;
  const x = house[0] + ux * 1.3, z = house[1] + uz * 1.3;
  return { x, z, face: Math.atan2(ux, uz), ring: 0 };
}
