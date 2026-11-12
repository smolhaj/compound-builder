/**
 * Procedural geometry for the farm animals (see LivestockRenderer): three small merged, vertex-coloured meshes that every kind shares and the
 * renderer scales per kind and per animal. The instance colour tints them, the vertex colour carries the shading and the dark bits (hooves,
 * nose, eye) so no extra draw calls are needed.
 *   body: a barrel (deeper through the chest, tucked up behind, a lighter belly) with a tail, long axis +z, unit half-length and half-width
 *   head: a neck (a tapering cone running back from the skull), skull, muzzle, nose, two ears; origin at the skull, nose along +z
 *   leg:  one leg hanging from the origin down to y = -1: thigh, cannon and a dark hoof, tapering
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function tint(g: THREE.BufferGeometry, f: (x: number, y: number, z: number) => number): THREE.BufferGeometry {
  const p = g.attributes.position, a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = f(p.getX(i), p.getY(i), p.getZ(i)); a[i * 3] = a[i * 3 + 1] = a[i * 3 + 2] = v; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const flat = (g: THREE.BufferGeometry, v: number): THREE.BufferGeometry => tint(g, () => v);
const finish = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const out = mergeGeometries(parts.map(p => { const n = p.index ? p.toNonIndexed() : p; n.deleteAttribute('uv'); return n; }), false)!;
  for (const p of parts) p.dispose();
  return out;
};

/** The barrel: x half-width 1, y half-height 1, z half-length 1 (the renderer scales it), chest end at +z. */
export function bodyGeometry(): THREE.BufferGeometry {
  const s = new THREE.SphereGeometry(1, 14, 10);
  const p = s.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    let y = p.getY(i);
    // deeper through the chest, tucked up at the flank; a flatter back and a heavier belly
    const k = 1 + 0.1 * z - 0.06 * z * z;
    y = y > 0 ? y * 0.9 * k : y * 1.05 * k;
    // squarer in plan than a sphere: the ends are blunt, the middle is a barrel
    const ez = Math.sign(z) * Math.pow(Math.abs(z), 0.82);
    p.setXYZ(i, x * k, y, ez);
  }
  s.computeVertexNormals();
  tint(s, (_x, y) => (y < -0.25 ? 0.8 : y > 0.55 ? 1.04 : 0.93));
  const tail = new THREE.ConeGeometry(0.2, 0.55, 5);
  tail.translate(0, -0.275, 0).rotateX(-0.35).translate(0, 0.28, -0.98);
  return finish([s, flat(tail, 0.7)]);
}

/** Neck + skull + muzzle + ears. Unit: skull radius 1. Nose along +z, the neck back along -z. */
export function headGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], face: THREE.BufferGeometry[] = [];
  // neck: thick at the shoulder (z = -2.6), narrowing to the skull
  const neck = new THREE.CylinderGeometry(0.56, 0.72, 2.6, 8, 1, false).rotateX(Math.PI / 2).translate(0, -0.05, -1.35);
  parts.push(flat(neck, 0.97));
  const skull = new THREE.SphereGeometry(1, 10, 8).scale(0.82, 0.88, 1.0);
  face.push(tint(skull, (_x, y) => (y < -0.3 ? 0.88 : 1)));
  const muzzle = new THREE.CylinderGeometry(0.46, 0.66, 1.15, 8).rotateX(Math.PI / 2).translate(0, -0.2, 1.05);
  face.push(flat(muzzle, 0.98));
  const nose = new THREE.SphereGeometry(0.4, 6, 5).scale(1, 0.75, 0.6).translate(0, -0.14, 1.64);
  face.push(flat(nose, 0.28));
  for (const sx of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.3, 0.95, 5).scale(1, 1, 0.35);        // a flat leaf
    ear.translate(0, 0.475, 0).rotateZ(-sx * 1.15).rotateX(-0.25).translate(sx * 0.62, 0.42, -0.22);
    face.push(flat(ear, 0.8));
    const eye = new THREE.SphereGeometry(0.11, 5, 4).translate(sx * 0.7, 0.2, 0.42);
    face.push(flat(eye, 0.12));
  }
  // the face hangs a little below the line of the neck (the head is carried nose-down)
  for (const f of face) { f.rotateX(0.3); parts.push(f); }
  return finish(parts);
}

/** A leg from the origin (the body) to y = -1 (the ground): the radius is 1 at the top and tapers to a fine cannon and a hoof. */
export function legGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const thigh = new THREE.CylinderGeometry(1.05, 0.62, 0.46, 7).translate(0, -0.23, 0);
  parts.push(flat(thigh, 1));
  const cannon = new THREE.CylinderGeometry(0.55, 0.44, 0.44, 6).translate(0, -0.68, 0);
  parts.push(flat(cannon, 0.92));
  const hoof = new THREE.CylinderGeometry(0.5, 0.66, 0.1, 6).translate(0, -0.95, 0.06);
  parts.push(flat(hoof, 0.3));
  return finish(parts);
}
