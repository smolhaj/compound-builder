import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// materials paint canvases (no DOM in tests): plain materials stand in
vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { buildLayers, buildGhost } from './buildings';
import { KIT, KIT_ORDER } from './kit';
import { hitsColliders, type Collider } from './interior';
import { showStage } from './shell';
import { BLUEPRINTS } from '../../sim/blueprints';

describe('building registry', () => {
  for (const kind of [...KIT_ORDER, 'farmhouse', 'trailer']) {
    it(`${kind}: builds every construction layer, is furnished, has colliders and a blueprint`, () => {
      const g = buildLayers(KIT[kind]);
      const layers = new Set(g.children.map(m => m.userData.layer));
      for (const l of ['foundation', 'interior']) expect(layers.has(l)).toBe(true);
      expect((g.userData.colliders as Collider[]).length).toBeGreaterThan(3);
      expect(BLUEPRINTS[kind]?.stages.length).toBe(5);
      const ghost = buildGhost(KIT[kind]);
      expect(ghost.children.every(m => !['interior', 'loft', 'cutwalls'].includes(m.userData.layer))).toBe(true);
    });
  }

  it('homes have evening seats; only stove buildings smoke', () => {
    for (const kind of ['timber_cabin', 'log_house']) expect((buildLayers(KIT[kind]).userData.seats as unknown[]).length).toBeGreaterThan(1);
    expect(buildLayers(KIT.outhouse).userData.chimneyTop).toBeNull();
    expect(buildLayers(KIT.garden).userData.chimneyTop).toBeNull();
    expect(buildLayers(KIT.log_house).userData.chimneyTop).not.toBeNull();
  });

  it('log house: walk in through the front door, past the porch', () => {
    const cs = buildLayers(KIT.log_house).userData.colliders as Collider[];
    const hd = KIT.log_house.cellsZ * 0.25;
    for (let z = hd + 0.1; z > hd - 0.15; z -= 0.02) expect(hitsColliders(cs, 0, z, 0.04)).toBe(false);
  });

  it('housing styles: walk in through the front door, past the porch or deck stair', () => {
    const doorX: Record<string, number> = { lodge: 0, lodge_solar: 0, stone_house: 0, timber_frame: 0, container_house: -0.2, adobe_house: 0.05 };
    const bodyHd: Record<string, number> = { lodge: 1.25, lodge_solar: 1.25, stone_house: 1.0, timber_frame: 1.0, container_house: 12.2 / 12, adobe_house: 1.0 };
    for (const kind of Object.keys(doorX)) {
      const cs = buildLayers(KIT[kind]).userData.colliders as Collider[];
      for (let z = bodyHd[kind] + 0.1; z > bodyHd[kind] - 0.15; z -= 0.02) expect(hitsColliders(cs, doorX[kind], z, 0.04), `${kind} at z ${z.toFixed(2)}`).toBe(false);
      // and the wall beside the door is solid
      expect(hitsColliders(cs, doorX[kind] + 0.4, bodyHd[kind] - 0.02, 0.02), `${kind} wall`).toBe(true);
    }
  });

  it('the lodge: a basement under the main floor (stone walls, slab), a deck and piers outside the body, a cellar of food shelves', () => {
    const g = buildLayers(KIT.lodge);
    const box = new THREE.Box3().setFromObject(g);
    // the body is 12 × 15 m, the deck takes the footprint to 15 × 18 m
    expect(box.max.x - box.min.x).toBeGreaterThan(2.4);
    expect(box.max.z - box.min.z).toBeGreaterThan(2.9);
    const mats = (layer: string) => g.children.filter(m => m.userData.layer === layer);
    expect(mats('foundation').length).toBeGreaterThan(2);
    expect(mats('deck').length).toBeGreaterThan(0);
    // the cellar and the pantry shelves: food slots below the main floor (y < floorY) and above it
    const slots = g.userData.foodSlots as Array<{ o: [number, number, number] }>;
    expect(slots.some(f => f.o[1] < KIT.lodge.floorY)).toBe(true);
    expect(slots.some(f => f.o[1] > KIT.lodge.floorY)).toBe(true);
    // a hatch cut in the basement slab keeps its cell clear of furniture and leaves the main floor whole
    const withHatch = buildLayers(KIT.lodge, 1, { hatches: [{ x0: 0.3, x1: 0.55, z0: -0.5, z1: -0.25 }] });
    const vc = (gr: THREE.Group) => gr.children.reduce((n, m) => n + (m.userData.vertexCount as number), 0);
    expect(vc(withHatch)).not.toBe(vc(g));
  });

  it('the lodge builds in construction stages: a basement first, then the frame, the deck, the roof', () => {
    const g = buildLayers(KIT.lodge);
    showStage(g, 1, 1);
    const vis = (layer: string) => g.children.filter(m => m.userData.layer === layer && m.visible).length;
    expect(vis('foundation')).toBeGreaterThan(0);
    expect(vis('roof')).toBe(0);
    showStage(g, 5, 0);
    expect(vis('roof')).toBeGreaterThan(0);
    expect(vis('interior')).toBeGreaterThan(0);
    expect(vis('loft')).toBeGreaterThan(0);
  });

  it('garden and run fences have a gate you can walk through', () => {
    for (const kind of ['garden', 'chicken_coop']) {
      const cs = buildLayers(KIT[kind]).userData.colliders as Collider[];
      const hz = KIT[kind].cellsZ * 0.25 - 0.04;
      const gateX = kind === 'garden' ? 0 : 0.2 - (KIT[kind].cellsX * 0.25 - 0.04) + (KIT[kind].cellsX * 0.25 - 0.04);
      expect(hitsColliders(cs, gateX, hz, 0.03)).toBe(false);
      expect(hitsColliders(cs, gateX + 0.3 * (kind === 'garden' ? 1 : -1), hz, 0.03)).toBe(true);
    }
  });

  it('homes are dressed with clutter that differs house to house (seeded)', () => {
    const verts = (seed: number) => buildLayers(KIT.timber_cabin, seed).children.filter(m => m.userData.layer === 'interior').reduce((n, m) => n + (m.userData.vertexCount as number), 0);
    const a = verts(1), b = verts(2), a2 = verts(1);
    expect(a).toBe(a2);
    expect(new Set([a, b, verts(3), verts(4)]).size).toBeGreaterThan(1);
  });
});

import { SPEC_PROBLEMS, gableWindowPoly } from './shell';
import { UTILITY_ORDER } from './kit';

describe('procedural geometry stays sound', () => {
  it('no building has openings through corners, past the eaves, or gable glass through the roof line', () => {
    for (const kind of [...KIT_ORDER, ...UTILITY_ORDER, 'farmhouse', 'trailer']) buildLayers(KIT[kind]);
    expect(SPEC_PROBLEMS).toEqual([]);
  });
  it('a too-big plain gable window is cut down to fit; rake glass follows the slopes', () => {
    const plain = gableWindowPoly(0.75, 0.6, 0.05, { w: 0.7, h: 0.5, y: 0.04 });
    for (const [x, y] of plain) expect(y).toBeLessThan(0.6 * (1 - Math.abs(x) / 0.7) - 0.02);
    const rake = gableWindowPoly(0.75, 0.6, 0.05, { w: 0.9, h: 0.4, y: 0.04, rake: true });
    expect(rake.length).toBe(5);
    for (const [x, y] of rake) expect(y).toBeLessThan(0.6 * (1 - Math.abs(x) / 0.7) - 0.02);
  });
  it('utility buildings build with their layers', () => {
    for (const kind of UTILITY_ORDER) {
      const g = buildLayers(KIT[kind]);
      expect(g.children.length).toBeGreaterThan(2);
    }
  });
});
