/**
 * A bore is set into the hill, not in front of it (user: "the tunnel leads to nowhere"): over several hills and layouts the planned road's bore (and the rock tunnel's
 * bore, same geometry) has (1) a portal whose face meets the ground at both sides, (2) a hill closed over the tube or earth banked over it along the whole length
 * (no stretch of open crown), (3) a road that continues out of both ends on level ground, and (4) a face that is a solid block the road really enters.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { planRoad, type RoadGround, type RoadPlan } from '../../sim/roadPlan';
import { ARCH, MOUND, boreParts } from '../perimeter/boreGeometry';
import { borePortals } from './roadWorks';
import { roadYAlong } from '../paths/driveHeight';

const PW = 2 * (MOUND.halfTop + 0.18);
const spurs = (): Array<{ name: string; g: RoadGround }> => {
  const out: Array<{ name: string; g: RoadGround }> = [];
  for (const sig of [2, 3, 4]) for (const ht of [3.5, 4.5]) for (const zr of [[20, 44], [14, 50]] as const)
    out.push({ name: `sigma ${sig} height ${ht} z ${zr}`, g: { h: (x, z) => 1 + ht * Math.exp(-(((x - 45) / sig) ** 2)) * (z > zr[0] && z < zr[1] ? 1 : 0) } });
  return out;
};
const planOn = (g: RoadGround, seed = 5): RoadPlan => planRoad({ region: 'mountain_west', seed, ground: g, rect: { x0: 0, z0: 22, x1: 67, z1: 42 }, frontage: { x: 67, zMin: 24, zMax: 40, band: [24, 40] }, county: () => 70.4, roadHalf: 0.5, yard: [25, 32] });

describe('the planned road bore is set into the hill', () => {
  const cases = spurs().map(c => ({ ...c, plan: planOn(c.g) })).filter(c => c.plan.structures.some(s => s.kind === 'tunnel'));
  it('has a bore on most of the hills', () => { expect(cases.length).toBeGreaterThanOrEqual(8); });
  for (const c of cases) it(`${c.name}: faces meet the ground, the crown is closed, the road continues both ends`, () => {
    const bore = c.plan.structures.find(s => s.kind === 'tunnel')!;
    const a = c.plan.pts.findIndex(p => p.s >= bore.s0 - 1e-6), b = c.plan.pts.findIndex(p => p.s >= bore.s1 - 1e-6);
    const { pts, ground } = borePortals(c.plan, a, b, c.g.h);
    const [A, B] = pts, L = Math.hypot(B[0] - A[0], B[1] - A[1]), dx = (B[0] - A[0]) / L, dz = (B[1] - A[1]) / L, nx = dz, nz = -dx;
    const yA = ground(A[0], A[1]), yB = ground(B[0], B[1]);
    // (3) the road continues past each portal: stations before the bore and after it, level with the portal (the road does not run into rock)
    expect(a).toBeGreaterThan(0); expect(b).toBeLessThan(c.plan.pts.length - 1);
    for (const [i, y] of [[a - 1, yA], [b + 1, yB]] as const) { expect(Math.abs(c.plan.pts[i].y - y)).toBeLessThan(0.9); }
    const out0 = c.plan.pts[a - 1], out1 = c.plan.pts[b + 1];
    expect(Math.hypot(out0.x - A[0], out0.z - A[1])).toBeGreaterThan(0.1);
    expect(Math.hypot(out1.x - B[0], out1.z - B[1])).toBeGreaterThan(0.1);
    // the road is on its own floor in the bore, under the hilltop
    const mid = c.plan.pts.find(p => p.s >= (bore.s0 + bore.s1) / 2)!;
    expect(roadYAlong(c.plan.pts, [bore], mid.x, mid.z)).not.toBeNull();
    // (1) both faces meet the ground at their sides: the slab's bottom edge is never above the ground it stands on
    for (const [P, y] of [[A, yA], [B, yB]] as const) for (const sg of [-1, 1]) {
      const gy = c.g.h(P[0] + nx * sg * PW / 2, P[1] + nz * sg * PW / 2);
      expect(gy, `a face edge hangs in the air: ground ${gy.toFixed(2)} under a slab bottom ${(y - 0.5).toFixed(2)}`).toBeGreaterThanOrEqual(y - 0.5 - 0.02);
    }
    // (2) wherever the hill has not closed over the crown, earth is banked over the tube (the tube is never a bare pipe on the ground)
    const bp = boreParts(pts, ground, 1, true, false);
    let open = 0;
    for (let s = 0.5; s < L - 0.5; s += 0.5) { const y = yA + (yB - yA) * s / L; if (c.g.h(A[0] + dx * s, A[1] + dz * s) < y + ARCH.crown + MOUND.over - 0.02) open++; }
    if (open) expect(bp.parts.some(([m]) => m === 'earth')).toBe(true);
    // (4) two portal faces and a tube
    expect(bp.tube).not.toBeNull();
    const faces = bp.parts.filter(([m]) => m === 'fieldstone');
    expect(faces.length).toBeGreaterThan(2);
    // the face block spans the arch: its bounding box is a PW-wide block that contains the opening
    const box = new THREE.Box3(); for (const [m, g] of bp.parts) if (m === 'fieldstone') { g.computeBoundingBox(); box.union(g.boundingBox!); }
    expect(box.max.y - box.min.y).toBeGreaterThan(ARCH.crown);
  });
});
