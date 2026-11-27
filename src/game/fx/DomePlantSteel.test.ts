import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
vi.mock('../buildkit/materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));
import { PLANT_STEEL } from './DomePlant';
import { plantLayout } from '../../sim/dome/plant';
import { KIT } from '../buildkit/kit';
import { DOME_BUILDERS } from '../buildkit/domeBuildings';
import { TIER, shellFt } from '../../sim/dome/tiers';

describe('the yard and the service airlock are the dome armor, opaque', () => {
  const r = shellFt('arcology', TIER.arcology.cells) / 2 / 20 - 0.03, plant = plantLayout('arcology', r, 'closed');
  it('every wall run of the arcology yard and the airlock walls and leaves are flagged for the dome panel steel', () => {
    const walls = plant.parts.filter(p => p.wallTop !== undefined && p.steel), passage = plant.parts.filter(p => p.passage && p.steel);
    expect(walls.length).toBeGreaterThanOrEqual(8);
    expect(passage.length).toBeGreaterThanOrEqual(6);      // passage walls and ceiling, chamber walls and ceiling, the two leaves
    expect(plant.parts.some(p => p.wallTop !== undefined && !p.steel && p.color === 0)).toBe(false);
    for (const p of plant.parts.filter(q => q.steel)) expect(p.unit).toBeUndefined();      // (never a machine)
  });
  it('it is the same material id the dome itself is lined and faced with', () => {
    expect(PLANT_STEEL).toBe('panel_steel');
    const g = DOME_BUILDERS['dome_arcology'](KIT['dome_arcology'], 1, { port: 2.46 });
    expect(g.children.some(m => m.name === 'bldg_walls_panel_steel')).toBe(true);
  });
});
