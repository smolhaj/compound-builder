/**
 * Vehicles driving through a rock tunnel (docs/DECISIONS.md, "Tunnel use"): the weekend cars leaving and coming home from the bench, and the delivery
 * truck driving on up to a yard beyond the rock. The real FleetRenderer and DeliveryTruck over a synthetic mountain.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { newGame } from '../../sim/state';
import { startingVehicles } from '../../sim/vehicles';
import { FleetRenderer, type FleetCtx } from './FleetRenderer';
import { CorridorNet } from '../paths/CorridorNet';
import type { PerimeterRun } from '../../sim/perimeter';

const FACE = { x0: 20, x1: 60 };
const ground = (x: number) => (x <= FACE.x0 ? 0 : x >= FACE.x1 ? 8 : 8 * (x - FACE.x0) / (FACE.x1 - FACE.x0) + 3 * Math.sin(Math.PI * (x - FACE.x0) / (FACE.x1 - FACE.x0)));
const hard = (x: number) => x > FACE.x0 - 0.3 && x < FACE.x1 + 0.3;
const run: PerimeterRun = { id: 'tun', kind: 'rock_tunnel', pts: [[FACE.x0 - 0.4, 10], [FACE.x1 + 0.4, 10]], gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0 };

function net(collapsed = false) {
  const n = new CorridorNet();
  n.sync([collapsed ? { ...run, collapsed: { at: 0, rubbleM3: 1, clearsAt: null } } : run]);
  n.ensure(ground);
  const reach = n.reach('k', { x0: 0, z0: 0, x1: 80, z1: 20 }, hard);
  return { n, route: (a: [number, number], b: [number, number]) => n.route(a, b, reach, () => []) };
}

describe('the family cars drive out through the tunnel and come home through it', () => {
  const drive: Array<[number, number]> = [[0, 10], [4, 10], [8, 10]];     // the county road at the gate, in to the court on the shelf
  function leave(collapsed = false) {
    const w = net(collapsed);
    const g = newGame(3);
    g.vehicles = startingVehicles();
    const v = g.vehicles[0];
    const scene = new THREE.Scene();
    const fleet = new FleetRenderer(scene);
    const park = new Map([[v.id, { x: 72, z: 12, rot: Math.PI / 2 }]]);      // parked in the compound on the bench
    const ctx: FleetCtx = { host: () => null, yard: { x: 9, z: 12, rot: 0 }, drive, ground: x => ground(x), route: w.route, park };
    fleet.update(0.1, g, ctx, 1);
    const item = fleet.group.children[0] as THREE.Group;
    expect(item.position.x).toBeCloseTo(72, 3);
    v.away = true;                                           // Sunday afternoon: out on the run
    const trace: Array<{ x: number; y: number; pitch: number; t: number; moving: number }> = [];
    let t = 0;
    for (; t < 200; t += 0.1) {
      fleet.update(0.1, g, ctx, 1);
      trace.push({ x: item.position.x, y: item.position.y, pitch: item.rotation.x, t, moving: fleet.moving.length });
      if (!item.visible || (trace.length > 20 && item.position.x < 1)) break;
    }
    return { trace, fleet, g, v, ctx, item };
  }

  it('drives down the deck under the hill, tilted with it, and out the gate', () => {
    const { trace } = leave();
    const inside = trace.filter(p => p.x > FACE.x0 + 2 && p.x < FACE.x1 - 2);
    expect(inside.length).toBeGreaterThan(20);
    for (const p of inside) expect(p.y, `at x ${p.x.toFixed(1)}`).toBeLessThan(ground(p.x) + 0.05);
    // going down the bore: the nose is down (pitch about the x axis, positive lowers the nose), 13 % grade ~ 0.2 rad
    expect(inside[Math.floor(inside.length / 2)].pitch).toBeGreaterThan(0.05);
    expect(inside[Math.floor(inside.length / 2)].pitch).toBeLessThan(0.4);
    expect(trace[trace.length - 1].x).toBeLessThan(2);
    // it is a key-holder on the move (the door opens for it)
    expect(trace.some(p => p.moving > 0)).toBe(true);
  });

  it('takes real time and drives through at half the pace of the open drive', () => {
    const { trace } = leave();
    const inside = trace.filter(p => p.x > FACE.x0 && p.x < FACE.x1);
    const outside = trace.filter(p => p.x > FACE.x1 + 2);
    const speed = (pts: typeof trace) => (Math.abs(pts[pts.length - 1].x - pts[0].x)) / ((pts.length - 1) * 0.1);
    expect(inside.length * 0.1).toBeGreaterThan(8);
    expect(speed(inside)).toBeLessThan(speed(outside.length > 5 ? outside : inside) + 0.01);
  });

  it('comes home the same way: in through the gate, up the bore, onto the bench', () => {
    const { fleet, g, v, ctx, item } = leave();
    for (let i = 0; i < 100; i++) fleet.update(0.1, g, ctx, 1);
    delete v.away;                                           // Friday evening: back
    let deck = 0, t = 0;
    for (; t < 300; t += 0.1) {
      fleet.update(0.1, g, ctx, 1);
      if (item.position.x > FACE.x0 + 2 && item.position.x < FACE.x1 - 2) { deck++; expect(item.position.y).toBeLessThan(ground(item.position.x) + 0.05); expect(item.rotation.x).toBeLessThan(-0.05); }
      if (item.position.x > 71) break;
    }
    expect(deck).toBeGreaterThan(20);
    expect(item.position.x).toBeGreaterThan(70);
    fleet.dispose();
  });

  it('a collapsed tunnel: no route, it drives straight (the old behaviour) rather than through rubble', () => {
    const w = net(true);
    expect(w.route([72, 12], [8, 10])).toBeNull();
  });

  it('a vehicle cut off outside waits at the place the world gives it', () => {
    const w = net();
    const g = newGame(3);
    g.vehicles = startingVehicles();
    const v = g.vehicles[0];
    const fleet = new FleetRenderer(new THREE.Scene());
    const ctx: FleetCtx = { host: () => null, yard: { x: 9, z: 12, rot: 0 }, drive, ground: x => ground(x), route: w.route, stranded: n => ({ x: 3 + n, z: 9, rot: 1 }) };
    v.away = true; v.stranded = true;
    fleet.update(0.1, g, ctx, 1);
    for (let i = 0; i < 5; i++) fleet.update(0.1, g, ctx, 1);
    const item = fleet.group.children[0] as THREE.Group;
    expect(item.visible).toBe(true);
    expect(item.position.x).toBeCloseTo(3, 3);
    expect(item.userData.status).toBe('stranded');
    fleet.dispose();
  });
});

