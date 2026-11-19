import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { KIT, type Placed, type SiteQuery } from './kit';
import { deepestUnder, floorDepthFt, siteProblem } from './underground';
import { TIER, kindOfCells, type DomeTier } from '../../sim/dome/tiers';
import { shellR, domeAt, usableR } from '../../sim/dome/bunker';

const flat: SiteQuery = { height: () => 1, owned: () => true, water: () => false };
const P = (id: string, kind: string, x: number, z: number, rot = 0): Placed => ({ id, kind, x, z, rot });
const at = (tier: DomeTier, cells?: number) => { const kind = kindOfCells(tier, cells ?? TIER[tier].cells); return { kind, dome: P('d', kind, 10, 10) }; };

describe('a bunker under a dome', () => {
  for (const tier of ['geodesic', 'glass', 'arcology'] as const) {
    it(`${tier}: a hatch inside the ring is allowed whether the dome is staked first or the bunker is`, () => {
      const { kind, dome } = at(tier);
      expect(siteProblem(KIT.bunker_hatch, 10.25, 10.25, 0, flat, [dome])).toBeNull();
      expect(siteProblem(KIT[kind], 10, 10, 0, flat, [P('s1', 'bunker_hatch', 10.25, 10.25)])).toBeNull();
    });
  }
  it('a bunkroom joins the hatch under a big dome, wall to wall, and a dome staked later accepts it', () => {
    const { kind, dome } = at('glass'), hatch = P('s1', 'bunker_hatch', 10.25, 10.25), room = P('s2', 'bunker_dorm', 11, 10.5);
    expect(siteProblem(KIT.bunker_dorm, 11, 10.5, 0, flat, [dome, hatch])).toBeNull();
    expect(siteProblem(KIT[kind], 10, 10, 0, flat, [hatch, room])).toBeNull();
  });
  it('a piece in the band between the usable ground and the ring is refused, from either side, with the skirt reason', () => {
    const { kind, dome } = at('glass'), d = domeAt(kind, 10, 10)!, x = 10 + (usableR(d) + shellR(d)) / 2;
    expect(siteProblem(KIT.bunker_hatch, x, 10.25, 0, flat, [dome])).toBe('straddles_skirt');
    expect(siteProblem(KIT[kind], 10, 10, 0, flat, [P('s1', 'bunker_hatch', x, 10.25)])).toBe('straddles_skirt');
    // across the shell itself the wall rule says it first; wholly outside the ring is an ordinary bunker
    expect(siteProblem(KIT.bunker_hatch, 10 + shellR(d), 10.25, 0, flat, [dome])).toBe('straddles_dome');
    expect(siteProblem(KIT.bunker_hatch, 10 + shellR(d) + 1.2, 10.25, 0, flat, [dome])).toBeNull();
  });
  it('the way in to an airlock stays clear', () => {
    const { kind, dome } = at('arcology'), d = domeAt(kind, 10, 10)!;
    // the first airlock is on the +z side
    expect(siteProblem(KIT.bunker_hatch, 10.25, 10 + usableR(d) - 0.3, 0, flat, [dome])).toBe('airlock_lane');
    expect(siteProblem(KIT.bunker_hatch, 10 + usableR(d) - 0.3, 10.25, 0, flat, [dome])).toBeNull();
  });
  it('the earthen dome is a hut: a bunker under it is refused with its own message, one beside it is fine', () => {
    const { dome } = at('earthen', 4);
    expect(siteProblem(KIT.bunker_dorm, 10.5, 10.5, 0, flat, [dome, P('s0', 'bunker_hatch', 20.25, 20.25)])).not.toBeNull();
    expect(siteProblem(KIT.bunker_hatch, 20.25, 20.25, 0, flat, [dome])).toBeNull();
    expect(siteProblem(KIT.dome_earthen_4, 10, 10, 0, flat, [P('s1', 'bunker_container', 10.5, 10.25), P('s0', 'bunker_hatch', 10, 9.5)])).not.toBeNull();
  });
  it('a bunker whose floor is deeper than the skirt can be taken is refused', () => {
    const { dome } = at('geodesic'), hatch = P('s1', 'bunker_hatch', 10.25, 10.25);
    // ground 1.5 u higher east of the hatch: the room's floor lies 17 + 30 ft down
    const hill: SiteQuery = { ...flat, height: (x: number) => (x > 10.6 ? 2.5 : 1) };
    expect(siteProblem(KIT.bunker_stores, 10.75, 10.0, 0, hill, [dome, hatch])).not.toBeNull();
  });
  it('the depth the placing card reads is the entrance shaft plus the slab', () => {
    expect(floorDepthFt(KIT.bunker_hatch, 10.25, 10.25, 0, flat.height, [])).toBeCloseTo(17, 0);
    expect(deepestUnder(at('geodesic').kind, 10, 10, 0, flat.height, [P('s1', 'bunker_hatch', 10.25, 10.25)])).toBeCloseTo(17, 0);
    expect(deepestUnder(at('geodesic').kind, 10, 10, 0, flat.height, [])).toBeNull();
  });
});
