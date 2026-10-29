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
