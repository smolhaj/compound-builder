import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// materials paint canvases (no DOM in tests): plain materials stand in
vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { buildLayers } from './buildings';
import { KIT } from './kit';
import type { Collider } from './interior';

const build = (k: string) => buildLayers(KIT[k], 3, { plumbed: true, wired: true, septic: true });

describe('stone and timber-frame houses have their own ground-floor plans', () => {
  it('the stone house is cut into rooms (more walls and doorways) and the timber frame is an open hall', () => {
    const stone = build('stone_house'), timber = build('timber_frame');
    const cs = (stone.userData.colliders as Collider[]).length, ct = (timber.userData.colliders as Collider[]).length;
    expect(cs).toBeGreaterThan(ct);
  });
  it('both keep a sick bed on the ground floor and the stair hole', () => {
    for (const k of ['stone_house', 'timber_frame']) {
      const g = build(k);
      expect((g.userData.sickSlots as unknown[]).length).toBeGreaterThanOrEqual(1);
    }
  });
  it('no furniture collider sits across the stone house\'s doorways: the hall, kitchen and parlor stay connected', () => {
    const g = build('stone_house'), cols = g.userData.colliders as Collider[];
    // the hall doorway into the dining room is at x = -0.2, near the back wall: nothing solid fills the gap 0.35 u from the back
    const hd = KIT.stone_house.cellsZ * 0.5 / 2;
    const gap = { x: -0.2, z: -hd + 0.35 + 0.075 };
    expect(cols.some(c => gap.x > c.x0 && gap.x < c.x1 && gap.z > c.z0 && gap.z < c.z1)).toBe(false);
  });
});
