import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { buildLayers } from './buildings';
import { KIT } from './kit';
import { showStage } from './shell';

/** Pieces whose posts, stands and racking are the finished thing (not studs hidden in walls). */
const OPEN_FRAMES = ['well_hand', 'cistern', 'water_tower', 'solar_array', 'garden'];

describe('finished open-frame pieces', () => {
  for (const id of OPEN_FRAMES) {
    it(`${id} keeps its frame when finished`, () => {
      const g = buildLayers(KIT[id], 3);
      showStage(g, 5, 0);
      const framed = g.children.filter(o => ['frame', 'rafters'].includes(o.userData.layer)) as THREE.Mesh[];
      expect(framed.length).toBeGreaterThan(0);
      for (const m of framed) expect(m.visible, `${id} ${m.name}`).toBe(true);
    });
  }
  it('the chicken run keeps its posts', () => {
    const g = buildLayers(KIT.chicken_coop, 3);
    showStage(g, 5, 0);
    const posts = g.children.filter(o => o.userData.layer === 'rafters');
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every(o => o.visible)).toBe(true);
  });
});
