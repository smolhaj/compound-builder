/**
 * The hardened gate house (sim/richSinks.ts): a small prefab steel guard house beside the drive at the property gate, ballistic glass facing the
 * drive, a rising vehicle barrier across it, two bollards and a camera pole. Built with the kit's `Parts` (one merged mesh per material, 4 draw
 * calls) and drawn once, only while the good is in stock.
 *
 * Local frame: origin on the ground at the gate, the drive along +x (to the road), the house on the -z side. SCALE v2: 1 unit = 6 m; the house
 * is 2.4 x 2.4 m and 2.7 m high, the barrier arm 3.6 m, a person 0.28 tall.
 */
import * as THREE from 'three';
import { box, Parts } from '../buildkit/shell';

const M = 1 / 6;

export function buildGateHouse(driveW: number): THREE.Group {
  const p = new Parts(7);
  p.layer = 'decor';
  const hw = driveW / 2;
  const hx = 2.4 * M, hz = 2.4 * M, hh = 2.7 * M;
  const cz = -(hw + 0.12 + hz / 2);                       // the house stands clear of the drive
  // slab and the prefab shell
  p.add('concrete', box(hx + 0.06, 0.02, hz + 0.06, 0, 0, cz));
  p.add('metal_siding', box(hx, hh, hz, 0, 0.02, cz));
  p.add('steel', box(hx + 0.07, 0.025, hz + 0.07, 0, hh + 0.02, cz));         // the flat roof with its overhang
  p.add('trim', box(hx + 0.07, 0.012, 0.012, 0, hh + 0.045, cz + hz / 2 + 0.03)); // the parapet lip on the drive side
  // ballistic glass in a steel frame on the drive side, a door on the compound side
  p.add('steel', box(hx * 0.62, 0.17, 0.012, 0, 0.26, cz + hz / 2 + 0.002));
  p.add('glass', box(hx * 0.62 - 0.03, 0.15, 0.012, 0, 0.27, cz + hz / 2 + 0.008));
  p.add('door', box(0.1, 0.3, 0.012, hx * 0.2, 0.02, cz - hz / 2 - 0.002));
  // the barrier: a post across the drive and an arm that rises (shown down, red and white)
  const bx = hx / 2 + 0.07, bz = -hw;
  p.add('steel', box(0.04, 0.12, 0.04, bx, 0.02, bz));
  for (let i = 0; i < 6; i++) p.add(i % 2 ? 'trim' : 'container_red', box(0.035, 0.022, 3.6 * M / 6 + 0.002, bx, 0.115, bz + 0.03 + i * (3.6 * M / 6)));
  p.add('steel', box(0.03, 0.05, 0.03, bx, 0.02, hw + 0.02));                 // the catch post across the drive
  // two bollards at the barrier and a camera pole at the corner
  for (const z of [-hw * 0.4, hw * 0.4]) p.add('steel', box(0.022, 0.07, 0.022, bx + 0.05, 0.02, z));
  p.add('steel', box(0.012, 0.5, 0.012, -hx / 2 - 0.04, 0.02, cz + hz / 2 + 0.04));
  p.add('steel', box(0.045, 0.03, 0.03, -hx / 2 - 0.04, 0.5, cz + hz / 2 + 0.05));
  const g = p.finish();
  g.name = 'gate_house';
  return g;
}
