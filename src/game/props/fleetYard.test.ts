import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { newGame } from '../../sim/state';
import { startingVehicles } from '../../sim/vehicles';
import { FleetRenderer } from './FleetRenderer';

describe('the fleet in the equipment yard', () => {
  it('a vehicle with no roof stands in a marked bay of the yard, not in the camp row', () => {
    const g = newGame(1); g.vehicles = startingVehicles();
    g.structures.push({ id: 'y', kind: 'equipment_yard', x: 40, z: 30, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    const fr = new FleetRenderer(new THREE.Scene());
    const spots = fr.spots(g, { host: id => (id === 'y' ? { x: 40, z: 30, rot: 0, kind: 'equipment_yard' } : null), yard: { x: 5, z: 5, rot: 0 } as never, drive: [], ground: () => 0 });
    const s = spots.get(g.vehicles[0].id)!;
    expect(Math.abs(s.x - 40)).toBeLessThan(1.1);
    expect(Math.abs(s.z - 30)).toBeLessThan(1.1);
  });
});

describe('the cars in the open yard are obstacles', () => {
  it('only vehicles without a garage slot or bay count, and a box says what is in it', async () => {
    const { inCarBox } = await import('./FleetRenderer');
    const g = newGame(1); g.vehicles = startingVehicles();
    const fr = new FleetRenderer(new THREE.Scene());
    const ctx = { host: () => null, yard: { x: 5, z: 5, rot: 0 } as never, drive: [], ground: () => 0 };
    const boxes = fr.openBoxes(g, ctx);
    expect(boxes.length).toBe(g.vehicles.length);
    const b = boxes[0];
    expect(inCarBox(b, b.x, b.z)).toBe(true);
    expect(inCarBox(b, b.x + b.hl * 3, b.z + b.hl * 3)).toBe(false);
    // a yard with a bay takes that car out of the open
    g.structures.push({ id: 'y', kind: 'equipment_yard', x: 40, z: 30, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    const withYard = fr.openBoxes(g, { ...ctx, host: id => (id === 'y' ? { x: 40, z: 30, rot: 0, kind: 'equipment_yard' } : null) });
    expect(withYard.length).toBeLessThan(boxes.length);
  });
});
