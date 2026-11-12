import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DeliveryTruck } from './DeliveryTruck';

vi.mock('./props/truckGeometry', () => ({ buildTruck: () => new THREE.Group() }));
vi.mock('./props/stockpileGeometry', () => ({ buildStockpile: () => new THREE.Group() }));
const mk = () => new DeliveryTruck(new THREE.Scene(), [[10, 100], [12, 105], [14, 110]], () => 0, () => 10);
const lines = [{ material: 'lumber', qty: 2 }] as never;

describe('the delivery truck on the county road', () => {
  it('stops short of an animal on the road and goes on once it is gone', () => {
    const t = mk();
    t.enqueue(lines);
    t.update(0.1, 1);
    const pos = () => (t as unknown as { _truck: THREE.Object3D })._truck.position.z;
    for (let i = 0; i < 40; i++) t.update(0.1, 1);
    const z0 = pos();
    t.setCrossers([{ z: z0 + 3 }]);
    for (let i = 0; i < 200; i++) t.update(0.1, 1);
    const held = pos();
    expect(held).toBeLessThan(z0 + 3);
    expect(held).toBeGreaterThan(z0 - 0.01);
    t.setCrossers([]);
    for (let i = 0; i < 40; i++) t.update(0.1, 1);
    expect(pos()).toBeGreaterThan(held + 1);
  });
});
