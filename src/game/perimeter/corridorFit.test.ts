/** The rock tunnel and the tunnel-bridge meet the land at both ends, over several hills and gorges (user: "the tunnel leads to nowhere"). */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../buildkit/materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { buildRun } from './perimeterGeometry';
import { ARCH, MOUND } from './boreGeometry';
import { type PerimeterKind, type PerimeterRun, type Pt } from '../../sim/perimeter';

const run = (kind: PerimeterKind, pts: Pt[]): PerimeterRun => ({ id: 'r', kind, pts, gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0 });
const PW = 2 * (MOUND.halfTop + 0.18);

describe('the rock tunnel is set into the hill', () => {
  // a ridge across the way (x = 30), from a low shelf on the west to a high bench on the east
  const hills = [3, 4, 5, 6.5].flatMap(ht => [2.5, 4].map(sig => ({ ht, sig, h: (x: number, z: number) => { void z; return 0.3 + ht * Math.exp(-(((x - 30) / sig) ** 2)) + (x > 30 ? 0.08 * (x - 30) : 0); } })));
  for (const hill of hills) it(`ridge ${hill.ht} x ${hill.sig}: a built, finite tube with two faces, earth where the crown is open, the ground at both face edges`, () => {
    const pts: Pt[] = [[20, 10], [40, 10]];
    const g = buildRun(run('rock_tunnel', pts), hill.h, 0);
    let ok = true, tris = 0; g.traverse(o => { const a = (o as THREE.Mesh).geometry?.getAttribute('position'); if (a) { tris += a.count / 3; for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) ok = false; } });
    expect(ok).toBe(true); expect(tris).toBeGreaterThan(100);
    for (const [x, into] of [[20, 1], [40, -1]] as const) {
      const y = hill.h(x, 10);
      for (const sg of [-1, 1]) expect(hill.h(x, 10 + sg * PW / 2), `face edge at x=${x} hangs`).toBeGreaterThanOrEqual(Math.min(y, hill.h(x + into * 0.5, 10)) - 0.5 - 0.02);
      // the road out of the portal: the mouth (0.9 u beyond) is on ground level with the deck, not in rock
      expect(Math.abs(hill.h(x - into * 0.9, 10) - y)).toBeLessThan(0.9);
    }
    // the tube joins the two ends: its bounds reach both portals
    const b = new THREE.Box3().setFromObject(g);
    expect(b.min.x).toBeLessThan(20.1); expect(b.max.x).toBeGreaterThan(39.9);
    expect(b.max.y - b.min.y).toBeGreaterThan(ARCH.crown);
  });
});

describe('the tunnel-bridge meets both rims', () => {
  const gorges = [3, 4.5, 6].flatMap(rim => [0.5, 0.9].map(slope => ({ rim, slope, h: (_x: number, z: number) => Math.min(rim, Math.abs(z - 20) * slope) })));
  for (const gg of gorges) it(`rim ${gg.rim} slope ${gg.slope}: the tube runs rim to rim over open ground and stands on the rim at each end`, () => {
    const lo = 20 - rim2run(gg.rim, gg.slope) - 3, hi = 20 + rim2run(gg.rim, gg.slope) + 3;
    const g = buildRun(run('tunnel_bridge', [[10, lo], [10, hi]]), gg.h, 0);
    const b = new THREE.Box3().setFromObject(g);
    expect(b.min.z).toBeLessThan(lo + 0.6); expect(b.max.z).toBeGreaterThan(hi - 0.6);       // portal to portal
    expect(b.max.y).toBeGreaterThan(gg.rim + 0.5);                                           // the tube is on the rims, headroom over them
    expect(gg.h(10, lo)).toBeCloseTo(gg.rim, 1); expect(gg.h(10, hi)).toBeCloseTo(gg.rim, 1); // both ends stand on level rim ground
    expect(b.min.y).toBeLessThan(gg.h(10, 20) + 0.3);                                        // trusses reach the bed
  });
});
function rim2run(rim: number, slope: number): number { return rim / slope; }
