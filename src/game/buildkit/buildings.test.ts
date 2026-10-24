import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// materials paint canvases (no DOM in tests): plain materials stand in
vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { buildLayers, buildGhost } from './buildings';
import { KIT, KIT_ORDER } from './kit';
import { hitsColliders, type Collider } from './interior';
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
