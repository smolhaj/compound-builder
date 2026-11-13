import { describe, expect, it } from 'vitest';
import { R_MAX, terrainAxis } from './TerrainRenderer';
import { buildAdaptiveMesh, leafSurface, planLeaves } from './terrainLod';

const setup = (tau = 0.055) => {
  const xs = terrainAxis(0, 100, 0.5, 1.07), zs = terrainAxis(0, 50, 0.5, 1.07);
  const focus = { x0: -100, x1: 100, z0: -50, z1: 50 };
  const leaves = planLeaves(xs, zs, focus, tau, 0.505);
  const h = (x: number, z: number): number => 30 * Math.sin(x * 0.01) * Math.cos(z * 0.013) + 0.02 * x;
  const nodeH = new Float32Array(xs.length * zs.length);
  for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) nodeH[j * xs.length + i] = h(xs[i], zs[j]);
  const out = { out: null as Float32Array | null };
  const m = buildAdaptiveMesh(xs, zs, leaves, nodeH, out);
  return { xs, zs, leaves, m, hv: out.out!, h };
};

describe('terrainLod', () => {
  it('tiles every grid cell exactly once and keeps the core at full resolution', () => {
    const { xs, zs, leaves } = setup();
    let cells = 0;
    for (const l of leaves) cells += (l.i1 - l.i0) * (l.j1 - l.j0);
    expect(cells).toBe((xs.length - 1) * (zs.length - 1));
    const coreLeaves = leaves.filter(l => xs[l.i0] >= -100 && xs[l.i1] <= 100 && zs[l.j0] >= -50 && zs[l.j1] <= 50);
    expect(coreLeaves.every(l => l.i1 - l.i0 === 1 && l.j1 - l.j0 === 1)).toBe(true);
  });
  it('uses far fewer triangles than the tensor grid and caps leaf size by distance', () => {
    const { xs, zs, leaves } = setup();
    expect(leaves.length).toBeLessThan((xs.length - 1) * (zs.length - 1) * 0.7);
    for (const l of leaves) {
      const dx = Math.max(-100 - xs[l.i1], xs[l.i0] - 100, 0), dz = Math.max(-50 - zs[l.j1], zs[l.j0] - 50, 0);
      const lim = Math.max(0.505, 0.055 * Math.hypot(dx, dz));
      if (l.i1 - l.i0 > 1) expect(xs[l.i1] - xs[l.i0]).toBeLessThanOrEqual(lim + 1e-6);
      if (l.j1 - l.j0 > 1) expect(zs[l.j1] - zs[l.j0]).toBeLessThanOrEqual(lim + 1e-6);
    }
    expect(xs[xs.length - 1]).toBeCloseTo(R_MAX, 3);
  });
  it('is watertight: every node on a leaf edge lies on that edge', () => {
    const { xs, leaves, m, hv } = setup();
    const NX = xs.length;
    for (const l of leaves) {
      for (let i = l.i0 + 1; i < l.i1; i++) for (const j of [l.j0, l.j1]) {
        const v = m.vertexOf[j * NX + i];
        if (v < 0) continue;
        const a = hv[m.vertexOf[j * NX + l.i0]], b = hv[m.vertexOf[j * NX + l.i1]];
        const t = (xs[i] - xs[l.i0]) / (xs[l.i1] - xs[l.i0]);
        expect(hv[v]).toBeCloseTo(a * (1 - t) + b * t, 3);
      }
    }
  });
  it('reads the drawn surface: exact at nodes in the core, close elsewhere', () => {
    const { xs, zs, m, hv, h } = setup();
    const at = (x: number, z: number): number => leafSurface(xs, zs, m, x, z, v => hv[v]);
    const ix = xs.findIndex(x => x >= 20), iz = zs.findIndex(z => z >= 10);
    expect(at(xs[ix], zs[iz])).toBeCloseTo(h(xs[ix], zs[iz]), 3);
    expect(Math.abs(at(900, 400) - h(900, 400))).toBeLessThan(6);
  });
});
