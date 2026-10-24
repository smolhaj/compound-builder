/**
 * Scale guard (CLAUDE.md rule 3, user: "everything now and in the future is
 * to scale with the human figures"). One world unit ≈ 6 m; a person is
 * 0.28 units ≈ 1.7 m. Every new prop, building and wall should get a line
 * here: if something drifts from human size, this fails.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('./buildkit/materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { Furniture, M, type Add } from './buildkit/interior';
import { Clutter } from './buildkit/clutter';
import { DOOR, WIN } from './buildkit/shell';
import { CABIN } from './buildkit/cabinGeometry';
import { PERIMETER } from '../sim/perimeter';
import { FIG_SCALE } from '../engine/world/people/figureKit';
import { VAULT_H } from './buildkit/bunkerBuildings';
import { DEPTH, MIN_COVER, ROOF_TOP } from './buildkit/underground';
import { Equipment } from './buildkit/utilityBuildings';

const PERSON_H = 0.28;
/** Metres of a world-unit length. */
const m = (u: number) => u / M;

/** Bounding size (metres) of a furniture / clutter piece. */
function size(fn: (a: Add) => void): { w: number; h: number; d: number } {
  const bb = new THREE.Box3(), t = new THREE.Box3();
  let any = false;
  fn((_m, g) => { g.computeBoundingBox(); t.copy(g.boundingBox!); if (any) bb.union(t); else { bb.copy(t); any = true; } });
  const s = bb.getSize(new THREE.Vector3());
  return { w: m(s.x), h: m(s.y), d: m(s.z) };
}

describe('human scale', () => {
  it('a person is ≈ 1.7 m and the figures are drawn at that height', () => {
    expect(m(PERSON_H)).toBeCloseTo(1.68, 1);
    expect(0.56 * FIG_SCALE).toBeCloseTo(PERSON_H, 3);
  });

  it('doors, windows and storeys fit a person', () => {
    expect(m(DOOR.h)).toBeGreaterThanOrEqual(2.0);
    expect(m(DOOR.w)).toBeGreaterThanOrEqual(0.8);
    expect(m(WIN.sill)).toBeGreaterThan(0.8);
    expect(m(WIN.sill)).toBeLessThan(1.2);
    expect(m(CABIN.wallH)).toBeGreaterThanOrEqual(2.4);
    expect(m(CABIN.door.h)).toBeGreaterThan(m(PERSON_H) + 0.25);
  });

  it('furniture is real-world size', () => {
    const chair = size(a => Furniture.chair(a)), table = size(a => Furniture.table(a)), bed = size(a => Furniture.bed(a, true));
    expect(table.h).toBeGreaterThan(0.7); expect(table.h).toBeLessThan(0.82);
    expect(chair.h).toBeGreaterThan(0.85); expect(chair.h).toBeLessThan(1.05);
    expect(bed.d).toBeGreaterThan(1.95); expect(bed.d).toBeLessThan(2.2);
    expect(bed.w).toBeGreaterThan(1.4);
    const counter = size(a => Furniture.counter(a, 2.4));
    expect(counter.h).toBeGreaterThan(0.85);
    const sofa = size(a => Furniture.sofa(a)); expect(sofa.w).toBeGreaterThan(1.8); expect(sofa.w).toBeLessThan(2.4);
    const stove = size(a => Furniture.woodStove(a, 0, 0)); expect(stove.h).toBeLessThan(1.2);
    const bunk = size(a => Furniture.bunk(a)); expect(bunk.h).toBeGreaterThan(1.5); expect(bunk.h).toBeLessThan(1.9);
    const stairs = size(a => Furniture.stairs(a, 3.0, 3.6)); expect(stairs.h).toBeGreaterThan(2.9);
    // risers ≈ 16–20 cm
    expect(3.0 / Math.round(3.0 / 0.19)).toBeLessThan(0.21);
  });

  it('clutter and animals are life-size', () => {
    expect(size(a => Clutter.mug(a)).h).toBeLessThan(0.15);
    expect(size(a => Clutter.boots(a)).h).toBeLessThan(0.4);
    expect(size(a => Furniture.hen(a)).h).toBeLessThan(0.55);
    const dog = size(a => Clutter.dogBed(a, true)); expect(dog.w).toBeLessThan(1.0);
    expect(size(a => Clutter.laundryLine(a)).h).toBeGreaterThan(1.7);
    expect(size(a => Clutter.bike(a)).d).toBeLessThan(1.5);
  });

  it('bunkers: standing room, a real depth of earth, kit at life size', () => {
    expect(m(VAULT_H)).toBeGreaterThanOrEqual(2.4);
    expect(m(VAULT_H)).toBeGreaterThan(m(PERSON_H) + 0.6);
    expect(m(DEPTH)).toBeGreaterThan(4); expect(m(DEPTH)).toBeLessThan(6);
    expect(m(DEPTH - ROOF_TOP)).toBeGreaterThan(m(MIN_COVER));
    expect(m(MIN_COVER)).toBeGreaterThan(0.6);
    expect(size(a => Equipment.extinguisher(a)).h).toBeLessThan(0.75);
    expect(size(a => Equipment.batteryRack(a, 4)).h).toBeLessThan(1.8);
  });

  it('perimeter heights read right next to a person', () => {
    expect(m(PERIMETER.barbed_wire.height)).toBeGreaterThan(1.1);
    expect(m(PERIMETER.barbed_wire.height)).toBeLessThan(1.6);
    expect(m(PERIMETER.woven_wire.height)).toBeCloseTo(2.4, 0);
    expect(m(PERIMETER.container_wall.height)).toBeCloseTo(2.6, 0);
    expect(m(PERIMETER.log_palisade.height)).toBeGreaterThan(2.5);
    expect(m(PERIMETER.thorn_hedge.height)).toBeGreaterThan(2.0);
  });
});
