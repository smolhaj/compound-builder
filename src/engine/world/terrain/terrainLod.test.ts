import { describe, expect, it } from 'vitest';
import { R_MAX, terrainAxis } from './TerrainRenderer';
import { applySnaps, buildAdaptiveMesh, leafSurface, planLeaves, retriangulate } from './terrainLod';

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
  it('after the ground is regraded, the height function is the drawn triangles (the diagonals are chosen again where a pad corner flipped them)', () => {
    const { xs, zs, m, hv } = setup(), NX = xs.length;
    // the heights the drawn triangles interpolate: find the triangle of the leaf's two that holds the point
    const drawn = (x: number, z: number): number => {
      const ci = xs.findIndex(v => v > x) - 1, cj = zs.findIndex(v => v > z) - 1, k = m.cellLeaf[cj * (NX - 1) + ci];
      for (let t = 0; t < 2; t++) {
        const vs = [0, 1, 2].map(q => m.index[k * 6 + t * 3 + q]), pts = vs.map(v => { const n = m.nodeOf[v], i = n % NX; return [xs[i], zs[(n - i) / NX], hv[v]]; });
        const [a, b, c] = pts;
        const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
        const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / det, l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / det, l3 = 1 - l1 - l2;
        if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) return l1 * a[2] + l2 * b[2] + l3 * c[2];
      }
      return NaN;
    };
    // a graded pad's corner: one leaf whose heights now ask for the other diagonal (a 0.3 u rise on one corner, or on the other pair)
    const ix = xs.findIndex(x => x >= 10), iz = zs.findIndex(z => z >= 5);
    const va = m.vertexOf[iz * NX + ix], vb = m.vertexOf[iz * NX + ix + 1], vc = m.vertexOf[(iz + 1) * NX + ix], vd = m.vertexOf[(iz + 1) * NX + ix + 1];
    const was = Math.abs(hv[va] - hv[vd]) <= Math.abs(hv[vb] - hv[vc]);
    hv[vb] = hv[vc] = hv[va];
    if (was) hv[vd] = hv[va] + 0.3; else { hv[vd] = hv[va]; hv[vc] = hv[va] + 0.3; }
    applySnaps(hv, m.snaps);
    const probe = (): number => { let worst = 0; for (let fz = 0.1; fz < 1; fz += 0.2) for (let fx = 0.1; fx < 1; fx += 0.2) { const x = xs[ix] + (xs[ix + 1] - xs[ix]) * fx, z = zs[iz] + (zs[iz + 1] - zs[iz]) * fz; worst = Math.max(worst, Math.abs(drawn(x, z) - leafSurface(xs, zs, m, x, z, v => hv[v]))); } return worst; };
    expect(probe()).toBeGreaterThan(0.01);                 // the old index with the new heights: the function and the mesh disagree
    expect(retriangulate(m, hv, ix, ix + 1, iz, iz + 1, NX)).toBe(true);
    expect(probe()).toBeLessThan(1e-4);                    // chosen again: they agree
    expect(retriangulate(m, hv, ix, ix + 1, iz, iz + 1, NX)).toBe(false);
  });
});
