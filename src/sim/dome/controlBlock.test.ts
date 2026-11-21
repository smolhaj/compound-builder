import { describe, expect, it } from 'vitest';
import { shellFt, TIER } from './tiers';
import { controlBlockPlan, turnPlan, inBlock, toBlock, fromBlock, CB } from './controlBlock';
import { choosePortAngle, DEFAULT_BEARING, portFrame, insideLane, entryR, personLateral } from './vehiclePort';
import { yardGeometry } from './plantYard';

const r = shellFt('arcology', TIER.arcology.cells) / 2 / 20 - 0.03;
const ports = Array.from({ length: 24 }, (_, i) => i * Math.PI / 12 + 0.07);

describe('the arcology control block plan', () => {
  it('is for the arcology only', () => {
    expect(controlBlockPlan('glass', 5, 1)).toBeNull();
    expect(controlBlockPlan('geodesic', 5, 1)).toBeNull();
  });
  it('is deterministic', () => {
    const p = choosePortAngle({ tier: 'arcology', r, rot: 0, links: [] }, DEFAULT_BEARING).angle;
    expect(controlBlockPlan('arcology', r, p)).toEqual(controlBlockPlan('arcology', r, p));
  });
  for (const port of ports) {
    it(`port ${(port * 180 / Math.PI).toFixed(0)} deg: fits the pad, clear of the lane, the airlocks and the yard's way in`, () => {
      const p = controlBlockPlan('arcology', r, port)!;
      expect(p).not.toBeNull();
      // curved and flush: the back wall is an arc concentric with the shell, within 0.05 of its inner wall; every corner and the arc's middle are inside the pad, in front of the ring path
      expect(Math.abs(p.rho + p.d / 2 - (r - CB.WALL_GAP))).toBeLessThan(0.05);
      for (const lx of [-p.w / 2, -p.w / 4, 0, p.w / 4, p.w / 2]) for (const lz of [-p.d / 2, p.d / 2]) {
        const [x, z] = fromBlock(p, lx, lz), rr = Math.hypot(x, z);
        expect(rr).toBeLessThanOrEqual(r + 1e-6);
        expect(rr).toBeGreaterThan(p.ringR + 0.3);
        expect(Math.abs(rr - (lz < 0 ? p.rho + p.d / 2 : p.rho - p.d / 2))).toBeLessThan(1e-6);       // (both walls are concentric arcs)
      }
      // the lane, its pad and the module are clear
      const f = portFrame('arcology', 0, 0, r, port)!, lane = insideLane(f)!, lat = personLateral('arcology', r);
      for (let t = 0; t <= 1; t += 0.05) {
        const x = f.inner[0] + (lane.pad[0] - f.inner[0]) * t, z = f.inner[1] + (lane.pad[1] - f.inner[1]) * t;
        expect(inBlock(p, x, z, 0.3)).toBe(false);
      }
      for (const lam of [-1.3, 0, 1.3, lat]) for (const u of [3, 5, entryR('arcology', r) - 0.3]) expect(inBlock(p, f.u[0] * u + f.u[1] * lam, f.u[1] * u - f.u[0] * lam, 0.1)).toBe(false);
      // the person airlock's inner door and the yard door are not inside it, and the paths reach the landing
      expect(inBlock(p, p.gateDoor[0], p.gateDoor[1], 0.4)).toBe(false);
      expect(inBlock(p, p.yardDoor[0], p.yardDoor[1], 0.4)).toBe(false);
      expect(inBlock(p, p.manifold[0], p.manifold[1], 0.1)).toBe(false);
      const [lx, lz] = toBlock(p, p.landing[0], p.landing[1]);
      expect(Math.abs(lx)).toBeLessThan(0.01); expect(lz).toBeGreaterThan(p.d / 2);
      // the service strip: the yard path and the entrance path both end at the landing
      expect(p.paths[0][0]).toEqual(p.yardDoor); expect(p.paths[1][0]).toEqual(p.gateDoor);
      for (const pl of p.paths) expect(pl[pl.length - 1]).toEqual(p.landing);
      // pipes start at the manifold, end by the block, stay in the dome and never cross the footprint
      for (const run of p.pipes) {
        expect(run.pts[0]).toEqual(p.manifold);
        for (const q of run.pts) expect(Math.hypot(q[0], q[1])).toBeLessThan(r - 0.2);
        for (let i = 1; i < run.pts.length; i++) for (let t = 0; t <= 1; t += 0.1) { const x = run.pts[i - 1][0] + (run.pts[i][0] - run.pts[i - 1][0]) * t, z = run.pts[i - 1][1] + (run.pts[i][1] - run.pts[i - 1][1]) * t; expect(inBlock(p, x, z, -0.03)).toBe(false); }
      }
      // colliders cover the footprint
      for (const [a, b] of [[-0.9, -0.4], [0.9, 0.4], [0, 0], [0.5, -0.9], [-0.5, 0.9]]) { const [x, z] = fromBlock(p, a * p.w / 2, b * p.d / 2); expect(p.colliders.some(c => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1)).toBe(true); }
    });
  }
  it('stands in the gap between the yard airlock and the entrance, against the inner wall, whenever the gap is wide enough', () => {
    const yg = yardGeometry('arcology', r, 0)!, S = Math.atan2(yg.portal.from[0], yg.portal.from[1]);
    let between = 0;
    for (const port of ports) {
      const p = controlBlockPlan('arcology', r, port)!, G = port + Math.atan2(personLateral('arcology', r) / 2, entryR('arcology', r));
      const wr = (a: number): number => { let d = a % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
      if (!p.between) continue;
      between++;
      // its centre is on the shorter arc between the two entrances
      expect(Math.abs(wr(p.angle - S)) + Math.abs(wr(G - p.angle))).toBeLessThanOrEqual(Math.abs(wr(G - S)) + 1e-6);
      // and it stands against the inner wall (flush, no lawn behind it)
      expect(Math.abs(r - (p.rho + p.d / 2) - CB.WALL_GAP)).toBeLessThan(0.05);
    }
    expect(between).toBeGreaterThanOrEqual(14);      // (the gap is wide enough in most layouts; the rest fall back to the far side)
    const usual = controlBlockPlan('arcology', r, 141 * Math.PI / 180)!;
    expect(usual.between).toBe(true);
    expect(usual.w).toBeGreaterThanOrEqual(4.8);      // (the widest block fits in the usual gap)
  });
  it('turns with the dome: the world plan is the same block rotated', () => {
    const p = controlBlockPlan('arcology', r, 2.1)!, q = turnPlan(p, Math.PI / 2);
    expect(Math.hypot(q.cx, q.cz)).toBeCloseTo(Math.hypot(p.cx, p.cz), 6);
    expect(q.colliders.length).toBe(p.colliders.length);
    expect(inBlock(q, q.cx, q.cz)).toBe(true);
  });
});
