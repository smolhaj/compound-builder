import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// materials paint canvases (no DOM in tests): plain materials stand in
vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { KIT, TOWER_KIT, TOWER_ORDER } from './kit';
import { buildLayers, buildGhost } from './buildings';
import { SPEC_PROBLEMS } from './shell';
import { BLUEPRINTS } from '../../sim/blueprints';
import { TOWERS, TOWER_CHAIN, type TowerKind } from '../../sim/towers';

/** The chain plus the plan variants (octagonal timber, hexagonal concrete). */
const ALL: TowerKind[] = [...TOWER_CHAIN, 'watchtower_octagon', 'watchtower_hex'];
import { offsetPts, UPGRADE_OFFSET } from '../perimeter/perimeterGeometry';

describe('watch tower pieces', () => {
  it('every tier has a kit piece the size the sim thinks it is, a blueprint and a drawing; only the first is on the build menu', () => {
    expect(TOWER_KIT.map(d => d.id).sort()).toEqual([...ALL].sort());
    expect(TOWER_ORDER).toEqual(['rise_lookout']);
    for (const kind of ALL) {
      expect(KIT[kind].cellsX).toBe(TOWERS[kind].cells);
      expect(KIT[kind].cellsZ).toBe(TOWERS[kind].cells);
      expect(BLUEPRINTS[kind].stages).toHaveLength(5);
      const g = buildLayers(KIT[kind]);
      expect(g.children.length).toBeGreaterThan(4);
      expect(g.userData.colliders.length).toBeGreaterThan(0);
      expect(buildGhost(KIT[kind]).children.length).toBeGreaterThan(2);
    }
    expect(SPEC_PROBLEMS).toEqual([]);
  });

  it('the floodlit tiers (4 up) carry lamp lenses the world switches on with power', () => {
    for (const kind of ALL) {
      const g = buildLayers(KIT[kind]);
      const bulb = g.getObjectByName('bldg_interior_bulb');
      expect(!!bulb).toBe(!!TOWERS[kind].flood);
      expect(!!KIT[kind].floodlit).toBe(!!TOWERS[kind].flood);
    }
  });

  it('a person is 0.28 tall: every tower\'s fighting post is well above head height, and the geometry reaches it', () => {
    for (const kind of ALL) {
      const g = buildLayers(KIT[kind]);
      let top = 0;
      g.traverse(o => { const m = o as { isMesh?: boolean; geometry?: { boundingBox: { max: { y: number } } | null; computeBoundingBox(): void } }; if (m.isMesh && m.geometry) { m.geometry.computeBoundingBox(); top = Math.max(top, m.geometry.boundingBox!.max.y); } });
      expect(TOWERS[kind].post.y).toBeGreaterThan(0.3);
      expect(top).toBeGreaterThan(TOWERS[kind].post.y + 0.15);          // a cab, a roof or a parapet over the post
      expect(top).toBeLessThan(2.4);                                    // under ≈ 14 m
    }
  });
});

describe('an upgrade run is drawn beside the old one', () => {
  it('shifts the line to its right by about 0.12 and keeps the length', () => {
    const o = offsetPts([[0, 0], [6, 0]], UPGRADE_OFFSET);
    expect(o[0][0]).toBeCloseTo(0); expect(o[0][1]).toBeCloseTo(UPGRADE_OFFSET);
    expect(o[1][0]).toBeCloseTo(6); expect(o[1][1]).toBeCloseTo(UPGRADE_OFFSET);
    const v = offsetPts([[0, 0], [0, 6]], UPGRADE_OFFSET);          // heading south: right is west
    expect(v[0][0]).toBeCloseTo(-UPGRADE_OFFSET);
    // a corner stays UPGRADE_OFFSET from both legs
    const c = offsetPts([[0, 0], [6, 0], [6, 6]], UPGRADE_OFFSET);
    expect(c[1][0]).toBeCloseTo(6 - UPGRADE_OFFSET); expect(c[1][1]).toBeCloseTo(UPGRADE_OFFSET);
  });
});
