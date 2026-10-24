/**
 * A bunker dig while it is open: bare earth draped over the cut, the spoil
 * heap beside it, and the hired mini excavator at the edge (while it is
 * digging or backfilling). Sizes in metres × M.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial, type KitMaterialId } from '../buildkit/materials';
import { worldUV } from '../buildkit/shell';

const M = 1 / 6;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

/** Collect geometry per material; one mesh each. */
class Bits {
  private readonly map = new Map<KitMaterialId, THREE.BufferGeometry[]>();
  add(m: KitMaterialId, g: THREE.BufferGeometry): void { let l = this.map.get(m); if (!l) this.map.set(m, l = []); l.push(worldUV(g)); }
  finish(): THREE.Group {
    const g = new THREE.Group();
    for (const [m, list] of this.map) {
      const geo = mergeGeometries(list);
      list.forEach(x => x.dispose());
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, kitMaterial(m));
      mesh.castShadow = m !== 'glass';
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    return g;
  }
}

/**
 * A mini excavator (≈ 1.5 m wide, 2.5 m to the cab roof), facing +z with
 * the boom reaching forward and the bucket down at `reachDown` below its tracks.
 */
export function buildExcavator(reachDown = 0.4): THREE.Group {
  const b = new Bits();
  // tracks: two rubber track frames with idler wheels
  for (const sx of [-1, 1]) {
    b.add('iron', box(0.32 * M, 0.42 * M, 1.9 * M, sx * 0.6 * M, 0, 0));
    for (const sz of [-1, 1]) b.add('iron', new THREE.CylinderGeometry(0.21 * M, 0.21 * M, 0.32 * M, 12).rotateZ(Math.PI / 2).translate(sx * 0.6 * M, 0.21 * M, sz * 0.85 * M));
    b.add('steel', new THREE.CylinderGeometry(0.12 * M, 0.12 * M, 0.34 * M, 10).rotateZ(Math.PI / 2).translate(sx * 0.6 * M, 0.21 * M, 0.85 * M));
  }
  b.add('steel', box(0.9 * M, 0.2 * M, 1.2 * M, 0, 0.18 * M, 0));                          // undercarriage
  b.add('paint_yellow', box(1.5 * M, 0.08 * M, 0.25 * M, 0, 0.1 * M, 1.15 * M));            // dozer blade
  // upper structure: turntable, body, counterweight, cab with glass
  b.add('iron', new THREE.CylinderGeometry(0.55 * M, 0.55 * M, 0.12 * M, 16).translate(0, 0.48 * M, 0));
  b.add('paint_yellow', box(1.45 * M, 0.55 * M, 1.6 * M, 0, 0.54 * M, -0.1 * M));
  b.add('iron', box(1.45 * M, 0.45 * M, 0.3 * M, 0, 0.55 * M, -0.95 * M));                  // counterweight
  const cab = { x: -0.32 * M, z: 0.15 * M, w: 0.8 * M, d: 1.0 * M, y: 1.09 * M, h: 1.3 * M };
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add('iron', box(0.05 * M, cab.h, 0.05 * M, cab.x + sx * cab.w / 2, cab.y, cab.z + sz * cab.d / 2));
  b.add('paint_yellow', box(cab.w + 0.06 * M, 0.06 * M, cab.d + 0.06 * M, cab.x, cab.y + cab.h, cab.z));
  b.add('glass', box(cab.w - 0.02 * M, cab.h - 0.1 * M, cab.d - 0.02 * M, cab.x, cab.y + 0.05 * M, cab.z));
  b.add('iron', box(0.45 * M, 0.08 * M, 0.45 * M, cab.x, cab.y + 0.35 * M, cab.z - 0.1 * M));  // seat
  // boom (up and out), dipper arm (down into the dig), bucket
  const pivot = new THREE.Vector3(0.3 * M, 0.85 * M, 0.75 * M);
  const elbow = new THREE.Vector3(0.3 * M, 2.2 * M, 2.3 * M);
  const tip = new THREE.Vector3(0.3 * M, -reachDown + 0.35 * M, 3.0 * M);
  const beam = (a: THREE.Vector3, c: THREE.Vector3, w: number, h: number) => {
    const len = a.distanceTo(c), mid = a.clone().add(c).multiplyScalar(0.5);
    const g = new THREE.BoxGeometry(w, h, len).lookAt(c.clone().sub(a)).translate(mid.x, mid.y, mid.z);
    b.add('paint_yellow', g);
  };
  beam(pivot, elbow, 0.22 * M, 0.3 * M);
  beam(elbow, tip, 0.18 * M, 0.24 * M);
  for (const [a, c] of [[pivot.clone().add(new THREE.Vector3(0, -0.2 * M, 0.1 * M)), elbow.clone().add(new THREE.Vector3(0, -0.25 * M, -0.3 * M))], [elbow.clone().add(new THREE.Vector3(0, 0.2 * M, -0.1 * M)), tip.clone().add(new THREE.Vector3(0, 0.6 * M, -0.1 * M))]] as const) {
    const len = a.distanceTo(c), mid = a.clone().add(c).multiplyScalar(0.5);
    b.add('steel', new THREE.CylinderGeometry(0.05 * M, 0.05 * M, len, 8).rotateX(Math.PI / 2).lookAt(c.clone().sub(a)).translate(mid.x, mid.y, mid.z));   // rams
  }
  b.add('iron', box(0.55 * M, 0.45 * M, 0.45 * M, tip.x, tip.y - 0.4 * M, tip.z));
  for (let k = 0; k < 4; k++) b.add('steel', box(0.05 * M, 0.12 * M, 0.08 * M, tip.x - 0.2 * M + k * 0.13 * M, tip.y - 0.5 * M, tip.z + 0.2 * M));
  return b.finish();
}

/**
 * Dug earth in a windrow along a dig's side (the way an excavator casts it):
 * `len` long (world units, along x), up to ≈ 1.8 m high, as wide as the
 * volume needs (capped: the rest has been carted off), on the ground at the origin.
 */
export function spoilHeap(m3: number, len: number): THREE.BufferGeometry {
  const v = Math.min(Math.max(1, m3), 140) * M * M * M;
  const h = Math.min(1.8 * M, Math.cbrt(v) * 0.6), w = Math.max(0.15, Math.min(1.4, v / (len * h * 0.55)));
  const g = new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(len / 2 + w * 0.3, h, w / 2);
  // lumpy: nudge the vertices
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 23.1 + z * 11.7) * 0.06 + Math.sin(x * 7.3 - z * 17.9) * 0.05;
    p.setXYZ(i, x, y * (1 + n * 1.5), z * (1 + n));
  }
  g.computeVertexNormals();
  return g;
}

/** Bare earth draped over a rect of ground (the cut and its batters). */
export function drapeSoil(x0: number, z0: number, x1: number, z1: number, ground: (x: number, z: number) => number, n = 48): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, n, n).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, ground(p.getX(i), p.getZ(i)) + 0.004);
  g.computeVertexNormals();
  return g;
}
