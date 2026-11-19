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

  it('the four tall tiers read apart at mid height (the cab is out of frame): distinct width, mass and marks', () => {
    const sig = (kind: TowerKind) => {
      const g = buildLayers(KIT[kind]);
      let minX = Infinity, maxX = -Infinity, n = 0;
      g.traverse(o => {
        const m = o as unknown as { isMesh?: boolean; geometry?: { getAttribute(n: string): { count: number; getX(i: number): number; getY(i: number): number } } };
        if (!m.isMesh || !m.geometry) return;
        const pos = m.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y > 0.3 && y < 0.95) { minX = Math.min(minX, pos.getX(i)); maxX = Math.max(maxX, pos.getX(i)); n++; } }
      });
      return { w: maxX - minX, n };
    };
    const tiers: TowerKind[] = ['watchtower_concrete', 'watchtower_flood', 'watchtower_mount', 'watchtower_turret'];
    const s4 = tiers.map(sig);
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      expect(Math.abs(s4[a].n - s4[b].n) + Math.abs(s4[a].w - s4[b].w) * 1000, `${tiers[a]} vs ${tiers[b]}`).toBeGreaterThan(40);
    }
    expect(s4[2].w).toBeGreaterThan(s4[0].w + 0.08);     // the mount tier's battered skirt and lockers are wider than a bare shaft
    expect(s4[1].w).toBeGreaterThan(s4[0].w + 0.08);     // the floodlight banks stick out of the shaft
  });
});
