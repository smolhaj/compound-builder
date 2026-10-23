/**
 * Ranch gate on the property line: two peeled-log posts with a crossbar
 * overhead and a swung-open pipe gate. Local frame: driveway along +x.
 */
import * as THREE from 'three';
import { kitMaterial } from '../buildkit/materials';

export function buildGate(width: number): THREE.Group {
  const g = new THREE.Group();
  const wood = kitMaterial('frame'), metal = kitMaterial('scaffold');
  const half = width / 2 + 0.06;
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.62, 8), wood);
    post.position.set(0, 0.31, s * half);
    post.castShadow = true;
    g.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, half * 2 + 0.12, 8).rotateX(Math.PI / 2), wood);
  bar.position.y = 0.6;
  bar.castShadow = true;
  g.add(bar);
  // pipe gate swung open against the fence line
  const leaf = new THREE.Group();
  for (const y of [0.05, 0.1, 0.15]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, half * 2 - 0.05, 6).rotateZ(Math.PI / 2), metal);
    r.position.set(-(half - 0.025), y, 0);
    leaf.add(r);
  }
  leaf.position.set(0, 0, half - 0.03);
  leaf.rotation.y = -Math.PI / 2 + 0.2;
  g.add(leaf);
  return g;
}
