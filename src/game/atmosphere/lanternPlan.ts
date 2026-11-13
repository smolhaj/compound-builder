/**
 * Where the wall lanterns hang (pure): one on a post beside each gate, a bigger lamp over the gate itself, and one every `spacing` units
 * along the finished, closed wall rings. Lit only at dusk and night and only while the household lights are allowed (not under a blackout).
 */
import { PERIMETER, runFinished, type PerimeterRun, type Pt } from '../../sim/perimeter';
import { headingAt, lineLen, pointAtArc } from '../perimeter/gateKitLayout';
import { compoundPolygons } from './compoundRegion';

export interface Lantern { x: number; z: number; /** Height above the ground (world units). */ y: number; /** 1 = the gate lamp, 0.55 = a wall lantern. */ size: number; gate: boolean; /** Unit vector pointing out of the compound (for the post's offset). */ ox: number; oz: number }

export const WALL_SPACING = 7;
export const MAX_LANTERNS = 96;

type RunLike = Pick<PerimeterRun, 'id' | 'kind' | 'pts' | 'gates' | 'finishedAt' | 'dropped' | 'hostId'>;

/** Lanterns for every closed ring plus the gates of any finished wall of height. */
export function lanternPlan(runs: readonly RunLike[], spacing = WALL_SPACING): Lantern[] {
  const out: Lantern[] = [];
  const rings = new Set(compoundPolygons(runs));
  for (const r of runs) {
    const d = PERIMETER[r.kind];
    if (!d || !runFinished(r as PerimeterRun) || r.dropped || r.hostId || r.pts.length < 2 || d.height < 0.3 || d.blocks.people < 0.3) continue;
    const len = lineLen(r.pts), top = d.height;
    const normal = (s: number): [number, number] => { const [hx, hz] = headingAt(r.pts, s, 0.6); return [hz, -hx]; };
    // which side is outside: for a ring, away from its centre; for an open run it does not matter (left of travel)
    const cen = ringCentre(r.pts);
    const outward = (s: number, p: Pt): [number, number] => { const n = normal(s); if (rings.has(r.pts as Pt[]) && cen) { const k = (p[0] - cen[0]) * n[0] + (p[1] - cen[1]) * n[1]; return k < 0 ? [-n[0], -n[1]] : n; } return n; };
    for (const g of r.gates) {
      if (g.garage || g.breach) continue;
      for (const side of [-1, 1]) {
        const s = g.at + side * (g.w / 2 + 0.15);
        if (s <= 0 || s >= len) continue;
        const p = pointAtArc(r.pts, s), o = outward(s, p);
        out.push({ x: p[0], z: p[1], y: top + 0.1, size: 0.55, gate: false, ox: o[0], oz: o[1] });
      }
      const p = pointAtArc(r.pts, g.at), o = outward(g.at, p);
      out.push({ x: p[0], z: p[1], y: top + 0.32, size: 1, gate: true, ox: o[0], oz: o[1] });
    }
    if (!rings.has(r.pts as Pt[])) continue;
    const n = Math.max(0, Math.floor(len / spacing));
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) * (len / n);
      if (r.gates.some(g => Math.abs(g.at - s) < g.w / 2 + 1.6)) continue;
      const p = pointAtArc(r.pts, s), o = outward(s, p);
      out.push({ x: p[0], z: p[1], y: top + 0.08, size: 0.55, gate: false, ox: o[0], oz: o[1] });
    }
  }
  return out.slice(0, MAX_LANTERNS);
}

function ringCentre(pts: readonly Pt[]): Pt | null {
  if (pts.length < 4) return null;
  let x = 0, z = 0;
  for (let i = 1; i < pts.length; i++) { x += pts[i][0]; z += pts[i][1]; }
  return [x / (pts.length - 1), z / (pts.length - 1)];
}

/** 0-1 how lit the lanterns are: dusk to dark, nothing under a blackout, flickering a little handled by the renderer. */
export function lanternLevel(night: number, lightsOut: boolean): number {
  if (lightsOut) return 0;
  return Math.max(0, Math.min(1, (night - 0.18) / 0.35));
}
