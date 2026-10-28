import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../buildkit/materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { buildVehicle, paintFor, VEHICLE_SIZE } from './vehicleGeometry';
import { VEHICLE_KINDS } from '../../sim/vehicles';
import { FleetRenderer } from './FleetRenderer';
import { newGame } from '../../sim/state';
import { fleetOf } from '../../sim/vehicles';

const PERSON_H = 0.28;
const box = (k: Parameters<typeof buildVehicle>[0]) => new THREE.Box3().setFromObject(buildVehicle(k));

describe('vehicles are at real scale (1 unit ≈ 6 m, a person 0.28)', () => {
  it('the measured size matches the declared size, within 12 %', () => {
    for (const k of VEHICLE_KINDS) {
      const s = box(k).getSize(new THREE.Vector3()), d = VEHICLE_SIZE[k];
      expect(s.z).toBeGreaterThan(d.l * 0.85); expect(s.z).toBeLessThan(d.l * 1.15);
      expect(s.x).toBeGreaterThan(d.w * 0.85); expect(s.x).toBeLessThan(d.w * 1.2);
      expect(s.y).toBeGreaterThan(d.h * 0.6); expect(s.y).toBeLessThan(d.h * 1.3);
    }
  });
  it('a car is about 0.75 × 0.31 and a motorhome is nearly bus length (1.5 of a bus’s 2.0)', () => {
    const suv = box('suv').getSize(new THREE.Vector3());
    expect(suv.z).toBeGreaterThan(0.7); expect(suv.z).toBeLessThan(0.9);
    expect(suv.x).toBeGreaterThan(0.28); expect(suv.x).toBeLessThan(0.36);
    expect(box('motorhome').getSize(new THREE.Vector3()).z).toBeGreaterThan(1.3);
    expect(box('motorhome').getSize(new THREE.Vector3()).z).toBeLessThan(2.0);
  });
  it('a person is shorter than a car’s roof but taller than its hood; an ATV seat is knee-high', () => {
    expect(box('suv').max.y).toBeGreaterThan(PERSON_H * 0.9);
    expect(box('suv').max.y).toBeLessThan(PERSON_H * 1.3);
    expect(box('pickup').max.y).toBeLessThan(PERSON_H * 1.25);
    expect(box('motorhome').max.y).toBeGreaterThan(PERSON_H * 1.8);
    expect(box('atv').max.y).toBeLessThan(PERSON_H * 0.8);
    expect(box('tractor').max.y).toBeGreaterThan(PERSON_H);
  });
  it('wheels sit on the ground (y = 0) and nothing is buried', () => {
    for (const k of VEHICLE_KINDS) expect(Math.abs(box(k).min.y)).toBeLessThan(0.004);
  });
  it('a handful of draw calls per vehicle', () => {
    for (const k of VEHICLE_KINDS) expect(buildVehicle(k).children.length).toBeLessThanOrEqual(6);
  });
  it('paint is stable per vehicle and varies across the fleet', () => {
    expect(paintFor('suv', 'v3')).toBe(paintFor('suv', 'v3'));
    expect(new Set(['v1', 'v2', 'v3', 'v4', 'v5', 'v6'].map(i => paintFor('pickup', i))).size).toBeGreaterThan(1);
  });
});

describe('the fleet renderer', () => {
  const ctx = (hosts: Record<string, { x: number; z: number; rot: number; kind: string }>) => ({ host: (id: string) => hosts[id] ?? null, yard: { x: 0, z: 0, rot: 0 }, drive: [[20, 0], [10, 0]] as Array<[number, number]>, ground: () => 0 });
  it('parks each vehicle in its bay inside the garage, 0.48 apart, and the rest in the yard', () => {
    const g = newGame(1);
    g.money = 1e6;
    fleetOf(g).push({ id: 'v2', kind: 'suv', mileage: 1, condition: 1, fuel: 50, oilAt: 0 }, { id: 'v3', kind: 'atv', mileage: 1, condition: 1, fuel: 5, oilAt: 0 });
    g.structures.push({ id: 'gar', kind: 'metal_garage', x: 30, z: 10, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const f = new FleetRenderer(new THREE.Scene());
    const spots = f.spots(g, ctx({ gar: { x: 30, z: 10, rot: 0, kind: 'metal_garage' } }));
    const xs = [...spots.values()].map(s => s.x).sort((a, b) => a - b);
    expect(xs).toHaveLength(3);
    expect(xs[1] - xs[0]).toBeCloseTo(0.48, 2); expect(xs[2] - xs[1]).toBeCloseTo(0.48, 2);
    for (const s of spots.values()) { expect(Math.abs(s.z - 10)).toBeLessThan(0.1); }
  });
  it('vehicles with no garage stand in a row in the yard, apart from each other', () => {
    const g = newGame(1);
    fleetOf(g).push({ id: 'v2', kind: 'suv', mileage: 1, condition: 1, fuel: 50, oilAt: 0 });
    const f = new FleetRenderer(new THREE.Scene());
    const spots = [...f.spots(g, ctx({})).values()];
    expect(Math.hypot(spots[0].x - spots[1].x, spots[0].z - spots[1].z)).toBeGreaterThan(0.5);
  });
  it('a vehicle on a run is hidden; it drives out the gate and back', () => {
    const g = newGame(1);
    const scene = new THREE.Scene();
    const f = new FleetRenderer(scene);
    const c = ctx({});
    f.update(0.016, g, c, 1);
    const grp = f.group.children[0];
    expect(grp.visible).toBe(true);
    fleetOf(g)[0].away = true;
    f.update(0.016, g, c, 1);
    expect(grp.visible).toBe(true);                         // still driving out
    for (let i = 0; i < 400; i++) f.update(0.1, g, c, 4);
    expect(grp.visible).toBe(false);
    fleetOf(g)[0].away = false;
    f.update(0.016, g, c, 1);
    expect(grp.visible).toBe(true);                         // coming home
  });
});
