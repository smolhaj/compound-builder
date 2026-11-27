/**
 * The frame ribs of a dome's shell as thin segments the cutscene camera must keep off (pure). The shell's panels are clear glass, so a shot may look through
 * them, but a strut 0.03 thick passing a hand's breadth from the lens fills a quarter of the picture with a dark slab. The lattice is the one
 * game/buildkit/domeBuildings builds (a triangulated hemisphere for the geodesic and arcology, meridians and parallels for the glass dome), in the dome's own frame
 * (its group is turned by `rot` quarter turns). World units (1 = 20 ft).
 */
import { triDome, arcologyFrequency } from '../buildkit/domeBuildings';
import { LOOK } from '../buildkit/domeBuildings';
import type { DetailTier } from '../buildkit/buildingDetail';
import type { Dome } from '../../sim/dome/standing';

export type Seg = readonly [number, number, number, number, number, number];
export interface Shell { x: number; z: number; r: number; tier: Dome['tier']; rot: number; strut: number; segs: readonly Seg[] }

const TAU = Math.PI * 2;
/** The eye keeps this far from a strut's axis; a shot's line of sight keeps RIB_VIEW from one within RIB_LOOK ahead. */
export const RIB_EYE = 0.3, RIB_VIEW = 0.14, RIB_LOOK = 0.9;
/** The armored band the arcology's lattice stands on (domeBuildings: 0.8 above the stem). */
const BAND = 0.8;

const cache = new Map<string, readonly Seg[]>();

/** Every strut of a dome tier's lattice, in the dome's frame (y up from the group origin). Cached by tier, radius and frequency. */
export function shellSegments(tier: Dome['tier'], R: number, detail: DetailTier = 'high'): readonly Seg[] {
  const N = tier === 'geodesic' ? 5 : tier === 'arcology' ? arcologyFrequency(detail) : 0;
  const key = `${tier}|${R.toFixed(3)}|${N}`, hit = cache.get(key);
  if (hit) return hit;
  const y0 = LOOK[tier].stem, out: Seg[] = [];
  if (tier === 'geodesic' || tier === 'arcology') {
    const { rings, tris } = triDome(N), Rv = R - 0.02;
    const V = (k: number, j: number): [number, number, number] => { const th = k / N * Math.PI / 2, ph = j * TAU / rings[k].length; return [Rv * Math.sin(th) * Math.sin(ph), y0 + Rv * Math.cos(th), Rv * Math.sin(th) * Math.cos(ph)]; };
    const seen = new Set<string>(), top = y0 + (tier === 'arcology' ? BAND : 0);
    const edge = (A: [number, number], B: [number, number]): void => {
      const k = [A, B].map(([r, j]) => `${r}:${j}`).sort().join('|');
      if (seen.has(k)) return; seen.add(k);
      const a = V(...A), b = V(...B);
      if (a[1] < top && b[1] < top) return;
      out.push([...a, ...b]);
    };
    for (const [A, B, C] of tris) { edge(A, B); edge(B, C); edge(C, A); }
  } else if (tier === 'glass') {
    const M = 32, P = 8, Rv = R - 0.03;
    const V = (i: number, m: number): [number, number, number] => { const th = i === P ? Math.PI / 2 : i / P * Math.PI / 2 * 0.985, ph = m * TAU / M; return [Rv * Math.sin(th) * Math.sin(ph), y0 + Rv * Math.cos(th), Rv * Math.sin(th) * Math.cos(ph)]; };
    for (let i = 1; i <= P; i++) for (let m = 0; m < M; m++) out.push([...V(i, m), ...V(i, m + 1)]);
    for (let i = 1; i < P; i++) for (let m = 0; m < M; m++) out.push([...V(i, m), ...V(i + 1, m)]);
    const crown: [number, number, number] = [0, y0 + Rv, 0];
    for (let m = 0; m < M; m += 2) out.push([...crown, ...V(1, m)]);
  }
  cache.set(key, out);
  return out;
}

/** The shells of a game's lattice domes (the earthen dome has no frame). */
export function shellsOf(domes: readonly Pick<Dome, 'tier' | 'x' | 'z' | 'r' | 'structure'>[], detail: DetailTier = 'high'): Shell[] {
  return domes.filter(d => d.tier !== 'earthen').map(d => ({ x: d.x, z: d.z, r: d.r, tier: d.tier, rot: d.structure.rot * Math.PI / 2, strut: LOOK[d.tier].strut, segs: shellSegments(d.tier, d.r, detail) }));
}

const segDist = (px: number, py: number, pz: number, s: Seg): number => {
  const dx = s[3] - s[0], dy = s[4] - s[1], dz = s[5] - s[2], l2 = dx * dx + dy * dy + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - s[0]) * dx + (py - s[1]) * dy + (pz - s[2]) * dz) / l2));
  return Math.hypot(px - (s[0] + dx * t), py - (s[1] + dy * t), pz - (s[2] + dz * t));
};

/**
 * How far a point is from the nearest frame strut's surface of a shell (Infinity when it is not near the shell at all: the quick test is the distance to the sphere
 * the struts lie on). `ground` is the height of the dome's floor (the group origin) in world y.
 */
export function ribGap(p: { x: number; y: number; z: number }, sh: Shell, floorY: number, within = RIB_EYE): number {
  const dx = p.x - sh.x, dz = p.z - sh.z, c = Math.cos(sh.rot), s = Math.sin(sh.rot);
  const lx = dx * c - dz * s, lz = dx * s + dz * c, ly = p.y - floorY;
  const y0 = LOOK[sh.tier].stem, rho = Math.hypot(lx, ly - y0, lz);
  if (Math.abs(rho - (sh.r - 0.025)) > within + sh.strut + 0.02) return Infinity;
  let best = Infinity;
  for (const g of sh.segs) { const d = segDist(lx, ly, lz, g); if (d < best) best = d; }
  return best - sh.strut;
}

/** The nearest strut gap over several shells. */
export const ribGapAll = (p: { x: number; y: number; z: number }, shells: readonly Shell[], floorOf: (x: number, z: number) => number, within = RIB_EYE): number =>
  shells.reduce((m, sh) => Math.min(m, ribGap(p, sh, floorOf(sh.x, sh.z), within)), Infinity);
