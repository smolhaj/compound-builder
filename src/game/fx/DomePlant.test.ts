import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
vi.mock('../buildkit/materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));
import { makeDomePlant } from './DomePlant';
import { auditMeshes, components, floaters, triangleStats } from '../buildkit/geometryAudit';
import type { Filtering } from '../../sim/dome/air';

const flat = (): number => 0.01;
const cases: Array<['glass' | 'arcology', number, Filtering]> = [['glass', 3.75, 'closed'], ['glass', 6, 'advanced'], ['arcology', 9, 'closed'], ['arcology', 15, 'closed'], ['arcology', 9, 'scrubber']];

describe('the dome plant geometry audit', () => {
  for (const [tier, r, filtering] of cases) {
    it(`${tier} r=${r} ${filtering}: finite, no zero-area triangles, nothing floating near the ground`, () => {
      const fx = makeDomePlant(tier, r, filtering, flat, { loop: 'recycle', spares: ['chiller', 'air', 'substation'] });
      const meshes = auditMeshes(fx.group).filter(m => m.name === 'plant_machinery');
      expect(meshes.length).toBe(1);
      for (const m of meshes) { const s = triangleStats(m); expect(s.nonFinite).toBe(0); expect(s.degenerate).toBe(0); }
      const comps = meshes.flatMap(m => components(m));
      // (roof hatches and the louver slots stand on the shell and its band, not on the ground: only parts that start near the ground must be joined to it)
      const fl = floaters(comps, 0.012, 0.03).filter(c => c.box.min.y < 0.35 && c.box.max.y < 1.2).filter(c => !(c.box.min.y > 0.2 && Math.hypot(c.box.min.x, c.box.min.z) > r - 0.1 && Math.hypot(c.box.min.x, c.box.min.z) < r + 0.1));   // (the band's louver slots are in the band's own face)
      expect(fl.map(c => `${c.box.min.toArray().map(n => n.toFixed(2))}->${c.box.max.toArray().map(n => n.toFixed(2))}`)).toEqual([]);
      fx.dispose();
    });
  }
  it('is three draw calls with lamps (machinery, lamp heads, light pools), and the buried lines add one hidden mesh', () => {
    const fx = makeDomePlant('arcology', 9, 'closed', flat, { loop: 'recycle' });
    const visible: THREE.Object3D[] = []; fx.group.traverse(o => { if ((o as THREE.Mesh).isMesh && o.visible) visible.push(o); });
    expect(visible.length).toBe(3);
    const all: THREE.Object3D[] = []; fx.group.traverse(o => { if ((o as THREE.Mesh).isMesh) all.push(o); });
    expect(all.length).toBe(4);
    fx.setUnder(true);
    const v2: THREE.Object3D[] = []; fx.group.traverse(o => { if ((o as THREE.Mesh).isMesh && o.visible) v2.push(o); });
    expect(v2.length).toBe(4);
    fx.dispose();
  });
  it('a dark dome has no lamps and a burning unit adds no draw call', () => {
    const fx = makeDomePlant('glass', 3.75, 'closed', flat, { loop: 'recycle', hurt: { chiller: 'down', substation: 'damaged' }, dark: true });
    const visible: THREE.Object3D[] = []; fx.group.traverse(o => { if ((o as THREE.Mesh).isMesh && o.visible) visible.push(o); });
    expect(visible.length).toBe(1);
    fx.dispose();
  });
});
