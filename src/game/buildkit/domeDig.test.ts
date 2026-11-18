import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { DOME_TIERS, TIER, cellsOfKind, DOME_KIND } from '../../sim/dome/tiers';
import { digState, pitShape, skirtParams } from '../../sim/dome/dig';
import { buildBuried, buildDigSite, buildSection, depthAtRadius, pitSkin, showBuried } from './domeDig';
import { pitProfile } from '../../sim/dome/dig';

const cellsOf = (t: (typeof DOME_TIERS)[number]) => cellsOfKind(DOME_KIND[t]) ?? TIER[t].cells;
const flat = () => 0;
const hill = (x: number, z: number) => 0.04 * x + 0.02 * z;

/** Triangles of a non-indexed geometry as [normal, centroid]. */
function faces(g: THREE.BufferGeometry): Array<{ n: THREE.Vector3; c: THREE.Vector3 }> {
  const p = g.getAttribute('position'), out = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    out.push({ n: b.clone().sub(a).cross(c.clone().sub(a)), c: a.clone().add(b).add(c).multiplyScalar(1 / 3) });
  }
  return out;
}

describe('crater skin', () => {
  for (const t of DOME_TIERS) it(`${t}: every face looks up or into the pit, none inside out, no NaN`, () => {
    const s = pitShape(t, cellsOf(t));
    for (const frac of [0.2, 0.6, 1]) for (const ground of [flat, hill]) {
      const g = pitSkin(s, s.depthU * frac, ground);
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count * 3; i++) expect(Number.isFinite((p.array as Float32Array)[i])).toBe(true);
      expect(g.getAttribute('color').count).toBe(p.count);
      let bad = 0;
      for (const { n, c } of faces(g)) {
        if (n.lengthSq() < 1e-14) continue;               // a sliver (degenerate), draws nothing
        const m = Math.hypot(c.x, c.z) || 1, toward = n.clone().normalize();
        // up (floor, benches) or toward the axis (risers); the lip ring beyond the rim is hidden under the ground and may look anywhere upward
        if (toward.y < -0.01 && toward.x * -c.x / m + toward.z * -c.z / m < -0.01) bad++;
      }
      expect(bad).toBe(0);
    }
  });
  it('the moat leaves the middle open and ends at the skirt', () => {
    const s = pitShape('glass', 15), g = pitSkin(s, s.depthU, flat, 'moat'), p = g.getAttribute('position');
    let minR = Infinity;
    for (let i = 0; i < p.count; i++) minR = Math.min(minR, Math.hypot(p.getX(i), p.getZ(i)));
    expect(minR).toBeGreaterThan(skirtParams('glass', 15).rOut - 0.01);
    expect(minR).toBeLessThan(s.rSkirt);
  });
  it('depth at a radius reads the profile', () => {
    const s = pitShape('arcology', 36), prof = pitProfile(s, s.depthU);
    expect(depthAtRadius(prof, s.rTop + 1)).toBe(0);
    expect(depthAtRadius(prof, 0)).toBeCloseTo(s.depthU, 9);
    expect(depthAtRadius(prof, s.rWork + 0.01)).toBeCloseTo(s.depthU, 1);
  });
});

describe('buried works', () => {
  for (const t of DOME_TIERS) it(`${t}: a skirt at the tier's depth, utilities before it, drawn by fraction`, () => {
    const g = buildBuried(t, cellsOf(t)), k = skirtParams(t, cellsOf(t));
    const layers = new Set(g.children.map(o => o.userData.layer));
    expect(layers.has('skirt')).toBe(true);
    expect(layers.has('utilities')).toBe(t !== 'earthen');
    const box = new THREE.Box3().setFromObject(g);
    expect(box.min.y).toBeCloseTo(-k.depthU, 2);
    expect(box.max.y).toBeLessThan(0.2 * 1.01 + 0.0 + 0.5);
    // faces of the ring are wound outward (the outer wall faces away from the axis)
    const skirt = g.children.find(o => o.userData.layer === 'skirt') as THREE.Mesh;
    let out = 0, inn = 0;
    for (const { n, c } of faces(skirt.geometry)) { if (Math.abs(n.y) < 0.2 * n.length() && n.length() > 1e-9) { if (n.x * c.x + n.z * c.z > 0) out++; else inn++; } }
    expect(out).toBeGreaterThan(0); expect(inn).toBeGreaterThan(0);
    // part-drawn: half poured draws half the ring's triangles
    showBuried(g, { poured: 0.5, utilities: 0 }, true);
    const n = skirt.userData.vertexCount as number, dr = skirt.geometry.drawRange.count;
    expect(dr).toBeLessThanOrEqual(n * 0.51); expect(dr).toBeGreaterThanOrEqual(n * 0.49 - 3);
    showBuried(g, { poured: 0, utilities: 0 }, true);
    expect(skirt.visible).toBe(false);
    showBuried(g, { poured: 1, utilities: 1 }, false);
    expect(skirt.visible).toBe(false);
  });
});

describe('dig site and section', () => {
  for (const t of DOME_TIERS) it(`${t}: a site at each stage builds, with props only while their phase runs`, () => {
    const cells = cellsOf(t), ground = (x: number, z: number) => hill(x, z) * 0.3;
    const at = (stage: number, f: number) => buildDigSite({ tier: t, cells, state: digState(t, stage, f), ground, seed: 3 });
    const names = (s: ReturnType<typeof at>) => s.group.children.length;
    const crater = at(0, 0.7), utilities = at(1, 0.2), pour = at(1, t === 'earthen' ? 0.3 : 0.75), fill = at(2, 0.3);
    for (const s of [crater, utilities, pour, fill]) { s.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { const p = m.geometry.getAttribute('position'); for (let i = 0; i < p.count * 3; i++) expect(Number.isFinite((p.array as Float32Array)[i])).toBe(true); } }); expect(names(s)).toBeGreaterThan(1); }
    expect(crater.hole.r).toBeCloseTo(pitShape(t, cells).rTop, 9);
    expect(crater.hole.rIn).toBe(0);
    // the pour front shows the cage and forms (frame / rust props), the early crater does not
    const mats = (s: ReturnType<typeof at>) => { const o = new Set<string>(); s.group.traverse(c => { if ((c as THREE.Mesh).isMesh && c.name) o.add(c.name); }); return o; };
    expect([...mats(pour)].some(n => /dig_prop_frame/.test(n))).toBe(true);
    expect([...mats(crater)].some(n => /dig_prop_frame/.test(n))).toBe(false);
    const m = buildDigSite({ tier: t, cells, state: digState(t, 5, 0), ground, seed: 1, mode: 'moat', sensors: 3 });
    expect(m.hole.rIn).toBeCloseTo(skirtParams(t, cells).rOut, 9);
  });
  it('the section has a face, side walls, a ruler and labels', () => {
    const g = buildSection({ tier: 'glass', cells: 15, ground: flat });
    expect(g.children.length).toBeGreaterThan(5);
    const box = new THREE.Box3().setFromObject(g);
    expect(box.min.y).toBeLessThan(-TIER.glass.skirtFt / 20);
  });
});
