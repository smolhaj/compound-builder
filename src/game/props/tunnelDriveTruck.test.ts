/**
 * The delivery truck driving on through a rock tunnel to a yard beyond the rock (docs/DECISIONS.md, "Tunnel use"). The real DeliveryTruck over a
 * synthetic mountain (the kit materials are mocked: they paint canvases).
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../buildkit/materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { DeliveryTruck } from '../DeliveryTruck';
import { CorridorNet } from '../paths/CorridorNet';
import type { PerimeterRun } from '../../sim/perimeter';
import { inCorridorAt } from '../paths/deckWalk';

const FACE = { x0: 20, x1: 60 };
const ground = (x: number) => (x <= FACE.x0 ? 0 : x >= FACE.x1 ? 8 : 8 * (x - FACE.x0) / (FACE.x1 - FACE.x0) + 3 * Math.sin(Math.PI * (x - FACE.x0) / (FACE.x1 - FACE.x0)));
const hard = (x: number) => x > FACE.x0 - 0.3 && x < FACE.x1 + 0.3;
const run: PerimeterRun = { id: 'tun', kind: 'rock_tunnel', pts: [[FACE.x0 - 0.4, 10], [FACE.x1 + 0.4, 10]], gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0 };

function net() {
  const n = new CorridorNet();
  n.sync([run]);
  n.ensure(ground);
  const reach = n.reach('k', { x0: 0, z0: 0, x1: 80, z1: 20 }, hard);
  return { n, route: (a: [number, number], b: [number, number]) => n.route(a, b, reach, () => []) };
}

describe('the delivery truck drives on through the tunnel to a yard on the bench', () => {
  it('unloads at the far yard after driving up the deck, and goes back the same way', () => {
    const w = net();
    const drive: Array<[number, number]> = [[0, 10], [4, 10], [8, 10]];
    const scene = new THREE.Scene();
    const truck = new DeliveryTruck(scene, drive, ground, () => -10);
    expect(truck.setTail(w.route([8, 10], [70, 12]) ?? [])).toBe(true);
    expect(truck.tail.length).toBeGreaterThan(10);
    expect(inCorridorAt(truck.tail, 15)).toBe(true);
    truck.enqueue([{ material: 'lumber', qty: 10 } as never]);
    const body = scene.children[0] as THREE.Group;
    let deck = 0, maxX = 0, back = false, t = 0, tilt = 0;
    for (; t < 600; t += 0.1) {
      truck.update(0.1, 1);
      if (body.visible && body.position.x > FACE.x0 + 2 && body.position.x < FACE.x1 - 2) { deck++; tilt = Math.max(tilt, Math.abs(body.rotation.x)); expect(body.position.y).toBeLessThan(ground(body.position.x) + 0.05); }
      maxX = Math.max(maxX, body.position.x);
      if (maxX > 60 && body.position.x < 30) back = true;
      if (!truck.busy && t > 5) break;
    }
    expect(maxX).toBeGreaterThan(62);
    expect(deck).toBeGreaterThan(20);
    expect(tilt).toBeGreaterThan(0.05);
    expect(back).toBe(true);
    expect(truck.busy).toBe(false);
    truck.dispose();
  });
  it('with no tunnel the truck stops at the end of the drive as ever', () => {
    const scene = new THREE.Scene();
    const truck = new DeliveryTruck(scene, [[0, 10], [8, 10]], ground, () => -10);
    expect(truck.tail).toHaveLength(0);
    expect(truck.at).toBeNull();
    truck.dispose();
  });
  it('the way on is not changed while a delivery is under way', () => {
    const w = net();
    const scene = new THREE.Scene();
    const truck = new DeliveryTruck(scene, [[0, 10], [8, 10]], ground, () => -10);
    truck.enqueue([{ material: 'lumber', qty: 1 } as never]);
    truck.update(0.1, 1);
    expect(truck.setTail(w.route([8, 10], [70, 12]) ?? [])).toBe(false);
    truck.dispose();
  });
});
