/**
 * A flatbed delivery truck (lumber-yard style): cab over a black chassis,
 * hood, wooden flatbed with headboard, six wheels. ≈ 7 m long. Local frame:
 * front toward +z, wheels on y = 0.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial } from '../buildkit/materials';

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

export function buildTruck(cabColor = 0xc8c2b4): THREE.Group {
  const cab: THREE.BufferGeometry[] = [], black: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [], bed: THREE.BufferGeometry[] = [], chrome: THREE.BufferGeometry[] = [];
  const W = 0.39, wheelR = 0.08;
  black.push(box(0.3, 0.06, 1.12, 0, wheelR * 0.9, -0.02));                 // chassis rails
  cab.push(box(W, 0.26, 0.3, 0, 0.17, 0.33));                                 // cab body
  cab.push(box(W - 0.01, 0.12, 0.2, 0, 0.13, 0.53));                          // hood
  glass.push(box(W - 0.03, 0.1, 0.006, 0, 0.3, 0.484));                       // windscreen
  for (const s of [-1, 1]) glass.push(box(0.006, 0.09, 0.18, s * (W / 2 + 0.002), 0.3, 0.34));
  chrome.push(box(W - 0.02, 0.05, 0.012, 0, 0.12, 0.632));                    // grille / bumper
  bed.push(box(W + 0.02, 0.03, 0.74, 0, 0.17, -0.2));                         // flatbed deck
  bed.push(box(W + 0.02, 0.18, 0.025, 0, 0.2, 0.16));                         // headboard
  for (const [z, s] of [[0.47, 1], [-0.2, 1], [-0.42, 1]] as const) for (const sx of [-1, 1]) {
    const wheel = new THREE.CylinderGeometry(wheelR, wheelR, 0.06, 12).rotateZ(Math.PI / 2).translate(sx * (W / 2 - 0.03) * s, wheelR, z);
    black.push(wheel);
  }
  const g = new THREE.Group();
  const add = (list: THREE.BufferGeometry[], mat: THREE.Material) => {
    const geo = mergeGeometries(list.map(x => x.toNonIndexed()));
    if (!geo) return;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  };
  add(cab, new THREE.MeshStandardMaterial({ color: cabColor, roughness: 0.45, metalness: 0.3 }));
  add(black, new THREE.MeshStandardMaterial({ color: 0x1e1f21, roughness: 0.8 }));
  add(glass, kitMaterial('glass'));
  add(bed, kitMaterial('deck'));
  add(chrome, new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.25, metalness: 0.9 }));
  g.userData = { type: 'truck' };
  return g;
}
