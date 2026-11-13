/**
 * Geometry audit for the build-kit pieces that are not houses or farm buildings: towers (every tier), bunker rooms at several depths, wells and tanks,
 * solar / wind / hydro, generators, gatehouses, docks, outposts. Builds the real finished geometry (no rendering) and checks for NaN, degenerate or mirrored
 * triangles, parts with no chain of contact to the ground (a cab on legs that stop short, a lamp in the air), a bunker that pokes through its surface, and
 * piece counts over the draw-call budget. Helpers: ../perimeter/auditKit.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('./materials', () => ({ kitMaterial: (id: string) => { const m = new THREE.MeshStandardMaterial(); m.name = id; return m; }, setWindowGlow: () => {} }));

import { KIT } from './kit';
import { buildLayers } from './buildings';
import { showStage } from './shell';
import { audit, floating } from '../perimeter/auditKit';

const IDS = Object.keys(KIT).filter(id => {
  const c = KIT[id].category;
  return ['water', 'power', 'bunker', 'defense'].includes(c) || /^(helipad|boat_dock|marina|reservoir|tower_pod)$/.test(id);
}).filter(id => !/^lodge/.test(id));

describe('kit pieces: towers, bunkers, water, power, gatehouses', () => {
  it('covers the whole list', () => {
    for (const id of ['watchtower_wood', 'watchtower_turret', 'bunker_hatch', 'bunker_medical', 'well_hand', 'water_tower', 'solar_array', 'micro_hydro', 'wind_turbine', 'gate_garage', 'reservoir', 'tower_pod']) expect(IDS).toContain(id);
  });
  for (const id of IDS) {
    it(`${id} is finite, whole and standing on the ground`, () => {
      const bunker = KIT[id].category === 'bunker';
      for (const depth of bunker ? [0.5, 0.8, 1.3] : [0]) {
        const g = buildLayers(KIT[id], 3, bunker ? { depth } as never : {});
        showStage(g, 5, 0);
        const a = audit(g);
        expect(a.nanVerts).toBe(0);
        expect(a.degenerate).toBe(0);
        expect(a.mirrored).toBe(0);
        // a bunker's local floor is y = 0 and its surface is `depth` up; everything else stands on y = 0
        expect(floating(a.parts, () => depth).map(p => `${p.mat}@${p.minX.toFixed(2)},${p.minY.toFixed(2)},${p.minZ.toFixed(2)}`), `${id} depth ${depth}`).toEqual([]);
        expect(g.children.length).toBeLessThanOrEqual(45);              // layers, not parts: merged per material (the biggest today is 39)
        expect(a.meshes).toBeLessThanOrEqual(90);
        expect(a.tris).toBeLessThan(40000);
        // a bunker room stays under its surface except the vent stack and the entrance house
        if (bunker) expect(Math.max(...a.parts.map(p => p.maxY))).toBeLessThanOrEqual(depth + (id === 'bunker_stairs' ? 0.6 : 0.2));
      }
    });
  }
});
