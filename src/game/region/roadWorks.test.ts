import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const used = new Set<string>();
vi.mock('../buildkit/materials', () => ({ kitMaterial: (id: string) => { used.add(id); return new THREE.MeshStandardMaterial(); }, setWindowGlow: () => {} }));

import { bankExtent, buildRoadWorks, featherStrip, type Frame } from './roadWorks';
import { planRoad, type RoadGround, type RoadInput } from '../../sim/roadPlan';
import { roadBedOf } from '../../sim/roadPlan';
import type { RegionId } from '../../sim/regions';

const input = (region: RegionId, ground: RoadGround, over: Partial<RoadInput> = {}): RoadInput => ({
  region, seed: 5, ground, rect: { x0: 0, z0: 0, x1: 67, z1: 67 }, frontage: { x: 67, zMin: 4, zMax: 63, band: [24, 40] }, county: () => 70.4, roadHalf: 0.5, yard: [30, 32], ...over,
});
const finite = (g: THREE.Group) => { let ok = true; g.traverse(o => { const a = (o as THREE.Mesh).geometry?.getAttribute('position'); if (a) for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) ok = false; }); return ok; };
const meshes = (g: THREE.Group) => { let n = 0; g.traverse(o => { if ((o as THREE.Mesh).isMesh) n++; }); return n; };
const opts = (g: RoadGround, built = true) => ({ built, surface: new THREE.MeshStandardMaterial(), track: new THREE.MeshStandardMaterial(), driveW: 0.55, natural: (x: number, z: number) => g.h(x, z) });

const creek = { zAt: () => 36, waterY: () => 0.6, halfWidth: 0.7 };
const wet: RoadGround = { h: (_x, z) => (Math.abs(z - 36) < 1.2 ? 0.7 : 1), creek };
const hillG: RoadGround = { h: x => 1 + (67 - x) * 0.2 };
const TIGHT: Partial<RoadInput> = { rect: { x0: 0, z0: 22, x1: 67, z1: 42 }, frontage: { x: 67, zMin: 24, zMax: 40, band: [24, 40] }, yard: [18, 32] };
const spur: RoadGround = { h: (x, z) => 1 + 3.5 * Math.exp(-(((x - 45) / 2) ** 2)) * (z > 20 && z < 44 ? 1 : 0) };
const bounds = (g: THREE.Group) => new THREE.Box3().setFromObject(g);

describe('the road, drawn', () => {
  it('a built drive: ribbons plus one merged mesh per material, however long the road (a handful of draw calls)', () => {
    const p = planRoad(input('mountain_west', hillG, TIGHT));
    const g = buildRoadWorks(p, hillG.h, opts(hillG));
    expect(finite(g)).toBe(true);
    expect(meshes(g)).toBeLessThanOrEqual(18);
    expect(p.hairpins.length).toBeGreaterThan(0);
    const longer = planRoad(input('mountain_west', hillG, { ...TIGHT, yard: [8, 32] }));
    expect(meshes(buildRoadWorks(longer, hillG.h, opts(hillG)))).toBeLessThanOrEqual(meshes(g) + 4);
    // the cattle guard, a stone facing and the sign posts use the kit's materials
    expect([...used]).toEqual(expect.arrayContaining(['steel']));
  });

  it('a one-lane bridge: a deck over the creek with girders, rails and stone abutments, and the road ribbon stops at each end', () => {
    used.clear();
    const p = planRoad(input('mountain_west', wet, { frontage: { x: 67, zMin: 4, zMax: 63, band: [10, 26] }, yard: [30, 50] }));
    const br = p.structures.find(s => s.kind === 'bridge1')!;
    expect(br).toBeTruthy();
    const g = buildRoadWorks(p, wet.h, opts(wet));
    expect(finite(g)).toBe(true);
    expect([...used]).toEqual(expect.arrayContaining(['deck', 'fieldstone']));
    // the deck stands at the road's height over the span, and the whole thing reaches across it
    const b = bounds(g);
    expect(b.max.y).toBeGreaterThan(br.s0 > 0 ? 0.9 : 0);
    expect(b.min.z).toBeLessThan(br.z - 0.4);
    expect(b.max.z).toBeGreaterThan(br.z + 0.4);
  });

  it('a bridge that is down leaves its abutments and no deck or rails', () => {
    const p = planRoad(input('mountain_west', wet, { frontage: { x: 67, zMin: 4, zMax: 63, band: [10, 26] }, yard: [30, 50] }));
    used.clear();
    const standing = buildRoadWorks(p, wet.h, opts(wet));
    expect(used.has('deck')).toBe(true);
    used.clear();
    const down = buildRoadWorks(p, wet.h, { ...opts(wet), bridgeDown: true });
    expect(used.has('deck')).toBe(false);
    expect(used.has('fieldstone')).toBe(true);
    expect(finite(down)).toBe(true);
    expect(bounds(down).max.y).toBeLessThan(bounds(standing).max.y);
  });

  it('a low-water crossing and a culvert: a slab with vent pipes and depth posts; a pipe through the fill with a headwall each end', () => {
    const p = planRoad(input('appalachia', wet, { frontage: { x: 67, zMin: 4, zMax: 63, band: [10, 26] }, yard: [30, 50] }));
    expect(p.structures.some(s => s.kind === 'low_water')).toBe(true);
    const g = buildRoadWorks(p, wet.h, opts(wet));
    expect(finite(g)).toBe(true);
    const small = { zAt: () => 36, waterY: () => 0.8, halfWidth: 0.2 };
    const dry: RoadGround = { h: (_x, z) => (Math.abs(z - 36) < 0.8 ? 0.85 : 1), creek: small };
    const q = planRoad(input('pnw', dry, { frontage: { x: 67, zMin: 4, zMax: 63, band: [10, 26] }, yard: [30, 50] }));
    expect(q.structures.some(s => s.kind === 'culvert' && s.s0 > 0)).toBe(true);
    expect(finite(buildRoadWorks(q, dry.h, opts(dry)))).toBe(true);
  });

  it('a rock bore: a stone portal at each end (two extruded faces) and a dark tube between', () => {
    const tight: Partial<RoadInput> = { rect: { x0: 0, z0: 22, x1: 67, z1: 42 }, frontage: { x: 67, zMin: 24, zMax: 40, band: [24, 40] }, yard: [25, 32] };
    const p = planRoad(input('mountain_west', spur, tight));
    const t = p.structures.find(s => s.kind === 'tunnel');
    expect(t).toBeTruthy();
    const g = buildRoadWorks(p, spur.h, opts(spur));
    expect(finite(g)).toBe(true);
    let extruded = 0;
    g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry.type === 'ExtrudeGeometry') extruded++; });
    expect(extruded).toBe(3);                                  // the tube and the two faces
    // the surface ribbon is not drawn through the bore
    const b = bounds(g);
    expect(b.max.y - b.min.y).toBeGreaterThan(0.5);
  });

  it('an unbuilt drive is a two-track along the survey line: ribbons only', () => {
    const p = planRoad(input('mountain_west', wet, { frontage: { x: 67, zMin: 4, zMax: 63, band: [10, 26] }, yard: [30, 50] }));
    const g = buildRoadWorks(p, wet.h, opts(wet, false));
    expect(meshes(g)).toBe(1);
    expect(finite(g)).toBe(true);
  });

  it('the bed it is cut into: the terrain hook is a bench along the plan (no bed under a deck)', () => {
    const p = planRoad(input('mountain_west', wet, { frontage: { x: 67, zMin: 4, zMax: 63, band: [10, 26] }, yard: [30, 50] }));
    const bed = roadBedOf(p), br = p.structures.find(s => s.kind === 'bridge1')!;
    expect(bed.apply(br.x, br.z, 0.5).h).toBeCloseTo(0.5, 5);   // under the deck the ground is left as it is
    const mid = p.pts[Math.floor(p.pts.length * 0.8)];
    expect(bed.apply(mid.x, mid.z, mid.y + 0.7).h).toBeCloseTo(mid.y, 1);
  });

  it('a bank facing reaches only as far as the bank does: nothing lies loose on level ground', () => {
    // a cut 0.4 high at the bench edge dying away at 1:1.2: gone after 0.48 out
    const bank = (o: number) => Math.max(0, 0.4 - o / 1.2);
    const e = bankExtent(bank, 3);
    expect(e).toBeGreaterThan(0.4); expect(e).toBeLessThan(0.6);
    expect(bankExtent(() => 0, 3)).toBe(0);                      // level: no facing at all
    expect(bankExtent(() => 0.005, 3)).toBe(0);                  // a hair of difference is not a bank
    expect(bankExtent(() => 0.5, 1)).toBeLessThanOrEqual(1);     // never past the reach
  });

  it('a road that ends on open ground has soft edges: the shoulder fades across and along, and it is one mesh', () => {
    const p = planRoad(input('mountain_west', hillG, TIGHT));
    const g = buildRoadWorks(p, hillG.h, opts(hillG));
    const soft = g.children.filter(o => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.getAttribute('color')) as THREE.Mesh[];
    expect(soft).toHaveLength(1);
    const col = soft[0].geometry.getAttribute('color');
    expect(col.itemSize).toBe(4);
    let lo = 1, hi = 0; for (let i = 0; i < col.count; i++) { const a = col.getW(i); lo = Math.min(lo, a); hi = Math.max(hi, a); }
    expect(lo).toBe(0); expect(hi).toBeGreaterThan(0.5); expect(hi).toBeLessThanOrEqual(0.85 + 1e-6);
  });

  it('featherStrip: alpha follows the callback, and every row stands on the ground', () => {
    const fr: Frame[] = [0, 1, 2, 3].map(i => ({ x: 0, z: i, y: 0, rot: 0, fx: 0, fz: 1, nx: 1, nz: 0, bank: 0 }));
    const gstrip = featherStrip(fr, 0, 3, 0.2, 0.5, (x, z) => x + z, 0.01, [1, 1, 1], (r, u) => (r === 0 ? 0 : u))!;
    const pos = gstrip.getAttribute('position'), col = gstrip.getAttribute('color');
    expect(pos.count).toBe(4 * 5);
    expect(col.getW(0)).toBe(0); expect(col.getW(5 + 4)).toBeCloseTo(1, 6);
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBeCloseTo(pos.getX(i) + pos.getZ(i) + 0.01, 5);
    expect(featherStrip(fr, 0, 0, 0, 1, () => 0, 0, [1, 1, 1], () => 1)).toBeNull();
  });
});
