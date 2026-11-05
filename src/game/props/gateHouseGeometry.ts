/**
 * The hardened gate house (sim/richSinks.ts): a small prefab steel guard house beside the drive at the property gate, ballistic glass facing the
 * drive, a rising vehicle barrier across it, two bollards and a camera pole. Every piece is a box with a vertex color, merged into ONE mesh with
 * one shared material (1 draw call; it used to be 7, one per kit material).
 *
 * Local frame: origin on the ground at the gate, the drive along +x (to the road), the house on the -z side. SCALE v2: 1 unit = 6 m; the house
 * is 2.4 x 2.4 m and 2.7 m high, the barrier arm 3.6 m, a person 0.28 tall.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box } from '../buildkit/shell';

const M = 1 / 6;
const COLOR = { slab: 0x8c8a84, wall: 0x4e5a52, roof: 0x3a3f44, steel: 0x7c8186, trim: 0xe9e2cf, red: 0xa8322a, glass: 0x35505e, door: 0x6a5a3a } as const;

let _mat: THREE.MeshStandardMaterial | null = null;
const material = (): THREE.MeshStandardMaterial => (_mat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35 }));

export function buildGateHouse(driveW: number): THREE.Group {
  const parts: THREE.BufferGeometry[] = [];
  const add = (c: keyof typeof COLOR, g: THREE.BufferGeometry): void => {
    const n = g.getAttribute('position').count, col = new THREE.Color(COLOR[c]);
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  const hw = driveW / 2;
  const hx = 2.4 * M, hz = 2.4 * M, hh = 2.7 * M;
  const cz = -(hw + 0.12 + hz / 2);                       // the house stands clear of the drive
  add('slab', box(hx + 0.06, 0.1, hz + 0.06, 0, -0.08, cz));                           // the footing is sunk 0.08 so the slab never floats on a slope
  add('wall', box(hx, hh, hz, 0, 0.02, cz));
  add('roof', box(hx + 0.07, 0.025, hz + 0.07, 0, hh + 0.02, cz));
  add('trim', box(hx + 0.07, 0.012, 0.012, 0, hh + 0.045, cz + hz / 2 + 0.03));
  add('steel', box(hx * 0.62, 0.17, 0.012, 0, 0.26, cz + hz / 2 + 0.002));       // ballistic glass in a steel frame, drive side
  add('glass', box(hx * 0.62 - 0.03, 0.15, 0.012, 0, 0.27, cz + hz / 2 + 0.008));
  add('door', box(0.1, 0.3, 0.012, hx * 0.2, 0.02, cz - hz / 2 - 0.002));         // the door, compound side
  const bx = hx / 2 + 0.07, bz = -hw;                                              // the barrier: post, a red-and-white arm across the drive, a catch post
  add('steel', box(0.04, 0.16, 0.04, bx, -0.02, bz));
  for (let i = 0; i < 6; i++) add(i % 2 ? 'trim' : 'red', box(0.035, 0.022, 3.6 * M / 6 + 0.002, bx, 0.115, bz + 0.03 + i * (3.6 * M / 6)));
  add('steel', box(0.03, 0.09, 0.03, bx, -0.02, hw + 0.02));
  for (const z of [-(hw + 0.05), hw + 0.05]) add('steel', box(0.022, 0.11, 0.022, bx + 0.05, -0.02, z));   // two bollards, one each side OUTSIDE the drive's edge (they were in the lane: a pickup 0.34 wide could not pass between them)
  add('steel', box(0.012, 0.52, 0.012, -hx / 2 - 0.04, 0, cz + hz / 2 + 0.04));                      // the camera pole and head
  add('steel', box(0.045, 0.03, 0.03, -hx / 2 - 0.04, 0.5, cz + hz / 2 + 0.05));
  add('glass', box(0.012, 0.016, 0.016, -hx / 2 - 0.04 + 0.027, 0.505, cz + hz / 2 + 0.05));                          // its lens, on the road (+x) side: the camera faces the approach
  const merged = mergeGeometries(parts)!;
  parts.forEach(p => p.dispose());
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, material());
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'gate_house_mesh';
  const g = new THREE.Group(); g.name = 'gate_house'; g.add(mesh);
  return g;
}
