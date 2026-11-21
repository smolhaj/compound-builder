import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('./materials', () => ({ kitMaterial: (m: string) => { const x = new THREE.MeshStandardMaterial(); x.name = `kit_${m}`; return x; }, setWindowGlow: () => {} }));

import { CELL, DOME_WATER_MARGIN, KIT, placementProblem, PROBLEM_TEXT, type SiteQuery } from './kit';

const river = (zEdge: number): SiteQuery => ({ height: () => 0, owned: () => true, water: (_x, z) => z > zEdge });

describe('a dome keeps off the water', () => {
  it('is refused when a river runs through its footprint or just past its pad, and allowed with dry ground all round', () => {
    const def = KIT.dome_glass, r = def.cellsX * CELL / 2;      // (footprint radius in world units)
    expect(placementProblem(def, 0, 0, 0, river(0), [])).toBe('water');
    // water just outside the footprint, inside the pad / yard / kill zone margin: refused with the near-water reason
    expect(placementProblem(def, 0, 0, 0, river(r + DOME_WATER_MARGIN * 0.5), [])).toBe('water_near_dome');
    // water well beyond: allowed
    expect(placementProblem(def, 0, 0, 0, river(r + DOME_WATER_MARGIN + 1), [])).toBeNull();
  });
  it('says what to do', () => {
    expect(PROBLEM_TEXT.water_near_dome).toMatch(/Too close to water: move the dome or pick another spot/);
  });
});
