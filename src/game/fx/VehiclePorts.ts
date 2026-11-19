/**
 * What a dome's vehicle sally port shows outside and in (sim/dome/vehiclePort.ts): the paved apron the access road ends at (with a center line and a stop bar), a row of
 * bollards across its mouth, a camera pole and a light pole beside the gate, a guard booth when guards are on staff, and inside the lane of pavement that runs from the inner
 * gate to a pad. The gates and the chamber are part of the dome's own group (buildkit/domeBuildings `airlock`). One merged vertex-colored mesh and one instanced set of lamp heads
 * for every port on the place. SCALE v2: 1 unit = 20 ft, a person 0.28, a door 0.37.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial } from '../buildkit/materials';
import { APRON_LEN, type InsideLane, type PortFrame } from '../../sim/dome/vehiclePort';

export interface PortInput { id: string; frame: PortFrame; lane: InsideLane | null; guarded: boolean }
export interface PortFixtures { group: THREE.Group; key: string; dispose(): void }

export const portsKey = (ins: readonly PortInput[]): string => ins.map(i => `${i.id}:${i.frame.angle.toFixed(3)}:${i.frame.cx.toFixed(2)},${i.frame.cz.toFixed(2)}:${i.frame.r.toFixed(2)}:${i.lane ? 1 : 0}:${i.guarded ? 1 : 0}`).join('|');

const ASPHALT = 0x54575b, CONCRETE = 0xb3afa3, PAINT = 0xe6e2d2, YELLOW = 0xe3b92a, STEEL = 0x8a929a, DARK = 0x2a2e33, BOOTH = 0xb9b49f;

function paint(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g; ng.deleteAttribute('uv');
  const c = new THREE.Color(color), n = ng.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}
function box(w: number, h: number, d: number, x: number, y: number, z: number, yaw: number, color: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d); g.rotateY(yaw); g.translate(x, y, z); return paint(g, color);
}
function cyl(r: number, h: number, x: number, y: number, z: number, color: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, 8); g.translate(x, y, z); return paint(g, color);
}

/** A flat slab draped on the ground: `hl` along the axis `u` and `hw` across it, centered at (cx, cz), in cells of about 0.2 so it follows the hill. */
function drape(cx: number, cz: number, u: [number, number], hl: number, hw: number, lift: number, ground: (x: number, z: number) => number, color: number): THREE.BufferGeometry {
  const nl = Math.max(1, Math.ceil(hl * 2 / 0.2)), nw = Math.max(1, Math.ceil(hw * 2 / 0.2)), pos: number[] = [];
  const P = (a: number, b: number): [number, number, number] => { const x = cx + u[0] * a + u[1] * b, z = cz + u[1] * a - u[0] * b; return [x, ground(x, z) + lift, z]; };
  for (let i = 0; i < nl; i++) for (let j = 0; j < nw; j++) {
    const a0 = -hl + 2 * hl * i / nl, a1 = -hl + 2 * hl * (i + 1) / nl, b0 = -hw + 2 * hw * j / nw, b1 = -hw + 2 * hw * (j + 1) / nw;
    const A = P(a0, b0), B = P(a1, b0), C = P(a1, b1), D = P(a0, b1);
    pos.push(...A, ...C, ...B, ...A, ...D, ...C);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return paint(g, color);
}

export function makeVehiclePorts(ins: readonly PortInput[], ground: (x: number, z: number) => number): PortFixtures {
  const group = new THREE.Group(); group.name = 'vehicle_ports';
  const geos: THREE.BufferGeometry[] = [], lamps: Array<{ x: number; y: number; z: number }> = [];
  for (const { frame: f, lane, guarded } of ins) {
    const { u, v } = f, yaw = f.angle, at = (rho: number, lam: number): [number, number] => [f.cx + u[0] * rho + u[1] * lam, f.cz + u[1] * rho - u[0] * lam];
    // the apron: a concrete slab from the shell out APRON_LEN, wider than the gate, with a yellow center line to the stop bar
    const [ax, az] = f.apron.c;
    geos.push(drape(ax, az, u, f.apron.hl + 0.1, f.apron.hw, 0.03, ground, CONCRETE));
    geos.push(drape(...at(f.r + APRON_LEN / 2 + 0.05, 0), u, APRON_LEN / 2 - 0.05, 0.015, 0.04, ground, YELLOW));
    geos.push(drape(...at(f.r + APRON_LEN - 0.3, 0), u, 0.02, v.dw / 2, 0.04, ground, PAINT));
    // a flared throat where the road meets the apron: the road's own surface carries on, the slab just widens to the corners
    // bollards: steel posts set in concrete across the mouth of the apron, a gap for the road
    for (const [bx, bz] of f.bollards) {
      const lam = (bx - f.cx) * u[1] - (bz - f.cz) * u[0];
      if (Math.abs(lam) < v.dw * 0.5) continue;
      const y = ground(bx, bz);
      geos.push(cyl(0.018, 0.12, bx, y + 0.06, bz, STEEL), cyl(0.02, 0.014, bx, y + 0.114, bz, YELLOW));
    }
    // the camera pole with its head angled at the gate, and the light pole opposite with a lamp
    { const [x, z] = f.camera, y = ground(x, z); geos.push(cyl(0.01, 0.34, x, y + 0.17, z, DARK), box(0.07, 0.035, 0.05, x, y + 0.34, z, yaw, DARK), box(0.02, 0.02, 0.02, x, y + 0.34, z, yaw, STEEL)); }
    { const [x, z] = f.light, y = ground(x, z); geos.push(cyl(0.011, 0.42, x, y + 0.21, z, STEEL), box(0.1, 0.014, 0.04, x, y + 0.425, z, yaw, DARK)); lamps.push({ x, y: y + 0.41, z }); }
    // a guard booth beside the gate: a small glazed cabin a man can sit in (0.34 high: a door is 0.37, a sitting guard's head under the roof)
    if (guarded) {
      const [x, z] = f.booth, y = ground(x, z);
      geos.push(box(0.2, 0.01, 0.2, x, y + 0.005, z, yaw, CONCRETE), box(0.17, 0.3, 0.17, x, y + 0.16, z, yaw, BOOTH), box(0.21, 0.02, 0.21, x, y + 0.325, z, yaw, DARK));
      const [wx, wz] = [x - u[0] * 0.088 * -1, z - u[1] * 0.088 * -1]; geos.push(box(0.12, 0.1, 0.006, wx, y + 0.19, wz, yaw, 0x7fb4c4));
    }
    // inside: the paved lane from the inner gate to the pad, so a truck never crosses the lawn
    if (lane) {
      const [ix, iz] = f.inner, [px, pz] = lane.pad, L = Math.hypot(px - ix, pz - iz), mx = (ix + px) / 2, mz = (iz + pz) / 2;
      geos.push(drape(mx, mz, u, L / 2 + 0.05, lane.w / 2 + 0.06, 0.03, ground, ASPHALT));
      geos.push(drape(px, pz, u, lane.half, lane.half, 0.03, ground, ASPHALT));
      geos.push(drape(mx, mz, u, L / 2, 0.012, 0.04, ground, PAINT));
    }
  }
  const owned: Array<{ dispose(): void }> = [];
  if (geos.length) {
    const merged = mergeGeometries(geos, false); geos.forEach(g => g.dispose());
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1, flatShading: true });
    const m = new THREE.Mesh(merged, mat); m.name = 'vehicle_port_fixtures'; m.matrixAutoUpdate = false; m.updateMatrix(); m.castShadow = true; m.receiveShadow = true;
    group.add(m); owned.push(merged, mat);
  }
  if (lamps.length) {
    const geo = new THREE.SphereGeometry(0.024, 8, 6), heads = new THREE.InstancedMesh(geo, kitMaterial('lamp'), lamps.length), m4 = new THREE.Matrix4();
    lamps.forEach((l, i) => heads.setMatrixAt(i, m4.makeTranslation(l.x, l.y, l.z)));
    heads.instanceMatrix.needsUpdate = true; heads.frustumCulled = false; heads.castShadow = false;
    group.add(heads); owned.push(geo);
  }
  return { group, key: portsKey(ins), dispose: () => { for (const o of owned) o.dispose(); } };
}
