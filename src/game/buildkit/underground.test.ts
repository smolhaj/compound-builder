import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { BUNKER_ORDER, CELL, KIT, type Placed, type SiteQuery } from './kit';
import { bunkerRoots, datums, doorsOf, DEPTH, MIN_COVER, ROOF_TOP, sharedEdge, siteProblem } from './underground';
import { buildLayers } from './buildings';
import { hitsColliders, type Collider } from './interior';
import { SPEC_PROBLEMS, showStage } from './shell';
import { BLUEPRINTS } from '../../sim/blueprints';

const flat: SiteQuery = { height: () => 1, owned: () => true, water: () => false };
const P = (id: string, kind: string, x: number, z: number, rot = 0): Placed => ({ id, kind, x, z, rot });

describe('underground rules', () => {
  it('a bunker starts at an entrance; rooms join wall to wall', () => {
    expect(siteProblem(KIT.bunker_dorm, 10, 10, 0, flat, [])).toBe('not_connected');
    expect(siteProblem(KIT.bunker_hatch, 10.25, 10.25, 0, flat, [])).toBeNull();
    const hatch = P('s1', 'bunker_hatch', 10.25, 10.25);
    // a 2 × 2 room east of the hatch, sharing one cell of wall
    expect(siteProblem(KIT.bunker_dorm, 11, 10.5, 0, flat, [hatch])).toBeNull();
    // a corner touch is not a wall
    expect(siteProblem(KIT.bunker_dorm, 11, 11, 0, flat, [hatch])).toBe('not_connected');
    // overlapping the hatch
    expect(siteProblem(KIT.bunker_dorm, 10.5, 10.5, 0, flat, [hatch])).toBe('overlaps');
  });

  it('rooms go under houses and the yard, not under wells or the septic field', () => {
    const hatch = P('s1', 'bunker_hatch', 10.25, 10.25);
    const house = P('s2', 'timber_cabin', 11, 10.75);
    expect(siteProblem(KIT.bunker_dorm, 11, 10.5, 0, flat, [hatch, house])).toBeNull();
    const well = P('s3', 'well_hand', 11.25, 10.25);
    expect(siteProblem(KIT.bunker_dorm, 11, 10.5, 0, flat, [hatch, well])).toBe('overlaps');
    // and a house can't go on the hatch
    expect(siteProblem(KIT.outhouse, 10.25, 10.25, 0, flat, [hatch])).toBe('overlaps');
  });

  it('every room of a bunker shares its entrance\'s floor level', () => {
    const slope = (x: number) => 1 + 0.05 * (x - 10);
    const site = { ...flat, height: (x: number) => slope(x) };
    const list = [P('s1', 'bunker_hatch', 10.25, 10.25), P('s2', 'bunker_corridor', 10.75, 10.5), P('s3', 'bunker_dorm', 11.5, 10.5)];
    const d = datums(list, site.height);
    expect(new Set([...d.values()]).size).toBe(1);
    expect(d.get('s3')).toBeCloseTo(slope(10.25) - DEPTH);
    expect(bunkerRoots(list).get('s3')).toBe('s1');
  });

  it('needs earth over the roof, and can\'t be dug too deep', () => {
    const hatch = P('s1', 'bunker_hatch', 10.25, 10.25);
    // the ground drops away east of the hatch: not enough cover over the room
    const low = { ...flat, height: (x: number) => (x > 10.6 ? 1 - (DEPTH - ROOF_TOP - MIN_COVER) - 0.05 : 1) };
    expect(siteProblem(KIT.bunker_dorm, 11, 10.5, 0, low, [hatch])).toBe('thin_cover');
    const high = { ...flat, height: (x: number) => (x > 10.6 ? 2.5 : 1) };
    expect(siteProblem(KIT.bunker_dorm, 11, 10.5, 0, high, [hatch])).toBe('too_deep');
  });

  it('a creek above is no place for a room', () => {
    const hatch = P('s1', 'bunker_hatch', 10.25, 10.25);
    expect(siteProblem(KIT.bunker_dorm, 11, 10.5, 0, { ...flat, water: x => x > 10.8 }, [hatch])).toBe('water');
  });

  it('neighbours agree on where their doorway is', () => {
    const a = P('s1', 'bunker_hatch', 10.25, 10.25), b = P('s2', 'bunker_dorm', 11, 10.5, 1);
    const list = [a, b];
    const da = doorsOf(a, list), db = doorsOf(b, list);
    expect(Object.keys(da)).toEqual(['right']);
    expect(Object.keys(db).length).toBe(1);
    // the hatch's right door at local z; the room's door (rotated) must be the same world point
    expect(10.25 + da.right!).toBeCloseTo(10.25);
    const e = sharedEdge({ x0: 10, z0: 10, x1: 10.5, z1: 10.5 }, { x0: 10.5, z0: 10, x1: 11.5, z1: 11 });
    expect(e).toEqual({ side: 'x1', from: 10, to: 10.5 });
  });
});

describe('bunker rooms', () => {
  for (const kind of BUNKER_ORDER) {
    it(`${kind}: builds, is fitted out, has a blueprint that turns up spoil`, () => {
      const def = KIT[kind];
      const g = buildLayers(def, 7, { doors: { front: 0, left: 0 }, depth: 0.9 });
      const layers = new Set(g.children.map(m => m.userData.layer));
      for (const l of ['foundation', 'walls', 'roof', 'interior']) expect(layers.has(l), l).toBe(true);
      expect(BLUEPRINTS[kind]?.stages.length).toBe(5);
      expect(BLUEPRINTS[kind].stages.some(s => (s.yields?.spoil ?? 0) > 0)).toBe(true);
      // walls go up with the frame stage: visible while the walls are being poured
      showStage(g, 2, 0.9);
      expect(g.children.filter(m => m.userData.layer === 'walls').every(m => m.visible)).toBe(true);
      showStage(g, 5, 0);
      expect(g.children.filter(m => m.userData.layer === 'walls').every(m => m.visible)).toBe(true);
    });
  }

  it('a room\'s doorways are open (walk through) and the rest of the wall is solid', () => {
    const def = KIT.bunker_dorm, hd = def.cellsZ * CELL / 2;
    const cs = buildLayers(def, 3, { doors: { front: 0.25 }, depth: 0.9 }).userData.colliders as Collider[];
    for (let z = hd + 0.05; z > hd - 0.2; z -= 0.02) expect(hitsColliders(cs, 0.25, z, 0.03)).toBe(false);
    expect(hitsColliders(cs, -0.25, hd - 0.02, 0.03)).toBe(true);
  });

  it('furniture keeps clear of every doorway', () => {
    for (const kind of ['bunker_dorm', 'bunker_stores', 'bunker_plant', 'bunker_galley']) {
      const def = KIT[kind], hw = def.cellsX * CELL / 2, hd = def.cellsZ * CELL / 2;
      for (const doors of [{ front: 0 }, { left: -0.25 }, { right: 0.25, back: -0.25 }] as const) {
        const cs = buildLayers(def, 5, { doors, depth: 0.9 }).userData.colliders as Collider[];
        for (const [side, at] of Object.entries(doors) as Array<[string, number]>) {
          // walk 25 cm in from the doorway
          for (let d = 0.06; d < 0.2; d += 0.02) {
            const [x, z] = side === 'front' ? [at, hd - d] : side === 'back' ? [at, -hd + d] : side === 'left' ? [-hw + d, at] : [hw - d, at];
            expect(hitsColliders(cs, x, z, 0.03), `${kind} ${side} ${d.toFixed(2)}`).toBe(false);
          }
        }
      }
    }
  });

  it('vent caps and the hatch reach the surface; nothing else pokes up', () => {
    const depth = 0.9;
    for (const kind of BUNKER_ORDER) {
      const g = buildLayers(KIT[kind], 2, { depth });
      showStage(g, 5, 0);
      const box = new THREE.Box3();
      for (const m of g.children as THREE.Mesh[]) {
        if (!m.visible) continue;
        box.setFromObject(m);
        const surface = ['chimney', 'stakes'].includes(m.userData.layer) || kind === 'bunker_hatch' || kind === 'bunker_stairs';
        if (!surface) expect(box.max.y, `${kind} ${m.name}`).toBeLessThan(depth - MIN_COVER + 0.01);
      }
    }
  });

  it('no geometry problems in any shell', () => {
    for (const kind of BUNKER_ORDER) buildLayers(KIT[kind]);
    expect(SPEC_PROBLEMS).toEqual([]);
  });
});
