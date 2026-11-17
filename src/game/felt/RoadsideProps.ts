/**
 * FL2: the roadside set (docs/FELT_LAYER.md 5.2): barriers, sandbags, signs, flags, tents, posts, figures, tarps, red tags, planks, cones, logs and
 * cordon tape, merged into ONE vertex-colored mesh (one draw call, no shadows) and rebuilt only when the marks' signature changes.
 * Scale v2: a person is 0.28 tall, a jersey barrier 0.18, a pickup 0.31.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Prop } from './markPlacement';

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1), tmpC = new THREE.Color();

interface Part { geo: THREE.BufferGeometry; x: number; y: number; z: number; color: number; rx?: number; rz?: number }
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number, rx = 0, rz = 0): Part => ({ geo: new THREE.BoxGeometry(w, h, d), x, y: y + h / 2, z, color, rx, rz });
const cyl = (r0: number, r1: number, h: number, seg: number, x: number, y: number, z: number, color: number, rx = 0, rz = 0): Part => ({ geo: new THREE.CylinderGeometry(r1, r0, h, seg), x, y: y + h / 2, z, color, rx, rz });
const shade = (c: number, k: number): number => tmpC.setHex(c).multiplyScalar(k).getHex();

/** The parts of one prop in its local frame (+z is its front); `k` is the prop's scale. */
function partsOf(p: Prop): Part[] {
  // roadside pieces are drawn about twice true scale (a jersey barrier is 0.1 units, a person 0.28) so they read from the diorama's distance; people stay true size
  const c = p.color, k = p.scale * (['barrier', 'sandbags', 'sign', 'flag', 'tent', 'post', 'cone'].includes(p.type) ? 1.8 : 1);
  switch (p.type) {
    case 'barrier': return [box(0.9 * k, 0.12 * k, 0.1 * k, 0, 0, 0, c), box(0.9 * k, 0.07 * k, 0.16 * k, 0, 0, 0, shade(c, 0.85)), box(0.9 * k, 0.03 * k, 0.11 * k, 0, 0.1 * k, 0, 0xc8482a)];
    case 'sandbags': return [box(0.5 * k, 0.05 * k, 0.16 * k, 0, 0, 0, c), box(0.44 * k, 0.05 * k, 0.15 * k, 0.03, 0.05 * k, 0, shade(c, 0.92)), box(0.36 * k, 0.05 * k, 0.14 * k, 0, 0.1 * k, 0, shade(c, 0.85))];
    case 'sign': return [cyl(0.02, 0.02, 0.26 * k, 5, 0, 0, 0, 0x5a4a3a), box(0.2 * k, 0.12 * k, 0.03, 0, 0.24 * k, 0, c), box(0.15 * k, 0.012, 0.035, 0, 0.29 * k, 0, 0x2a2622), box(0.11 * k, 0.012, 0.035, 0, 0.26 * k, 0, 0x2a2622)];
    case 'flag': return [cyl(0.014, 0.014, 0.5 * k, 5, 0, 0, 0, 0x8a8e92), box(0.2 * k, 0.12 * k, 0.02, 0.1 * k, 0.4 * k, 0, c)];
    case 'tent': return [{ geo: new THREE.CylinderGeometry(0.28, 0.28, 0.62, 3).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), x: 0, y: 0.24, z: 0, color: c, rx: 0 }, box(0.56, 0.015, 0.7, 0, 0, 0, shade(c, 0.6))];
    case 'post': return [cyl(0.03, 0.03, 0.42, 5, 0, 0, 0, c)];
    case 'figure': return [box(0.08 * k, 0.15 * k, 0.05 * k, 0, 0.0, 0, c), box(0.036 * k, 0.1 * k, 0.04 * k, -0.02 * k, 0, 0, shade(c, 0.7)), box(0.036 * k, 0.1 * k, 0.04 * k, 0.02 * k, 0, 0, shade(c, 0.7)), box(0.06 * k, 0.065 * k, 0.06 * k, 0, 0.17 * k, 0, 0xc9a284)].map((q, i) => (i === 0 ? { ...q, y: q.y + 0.1 * k } : i === 3 ? { ...q, y: q.y + 0.1 * k } : q));
    case 'tarp': return [box(0.9 * k, 0.012, 0.7 * k, 0, 0, 0, c, 0, 0.12)];
    case 'tag': return [box(0.07, 0.09, 0.012, 0, 0, 0, c), box(0.045, 0.01, 0.014, 0, 0.04, 0, 0xf2e6c8)];
    case 'plank': return [box(0.5 * k, 0.015, 0.06, 0, 0.005, 0, c)];
    case 'cone': return [cyl(0.06, 0.012, 0.12 * k, 6, 0, 0, 0, c)];
    case 'log': return [cyl(0.035 * k, 0.03 * k, 0.7 * k, 6, 0, 0.03, 0, c, 0, Math.PI / 2)];
    case 'tape': return [box(0.03, 0.05, p.scale, 0, 0, 0, c)];  // (length is the scale)
    case 'slot': return [];
  }
}

export class RoadsideProps {
  readonly mesh: THREE.Mesh;
  private _count = 0;
  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 }));
    this.mesh.name = 'felt_props'; this.mesh.castShadow = false; this.mesh.receiveShadow = false; this.mesh.visible = false;
    this.mesh.frustumCulled = false; this.mesh.userData = { type: 'feltProps', noSSAO: true };
    scene.add(this.mesh);
  }
  get triangles(): number { const g = this.mesh.geometry; return g.index ? g.index.count / 3 : 0; }
  get count(): number { return this._count; }
  /** `zoom` scales every prop about its own origin: the felt world makes the set bigger the farther the camera is (a map marker from the air, true size up close). */
  set(props: readonly Prop[], zoom = 1): void {
    this.mesh.geometry.dispose();
    this._count = props.length;
    if (!props.length) { this.mesh.geometry = new THREE.BufferGeometry(); this.mesh.visible = false; return; }
    const geos: THREE.BufferGeometry[] = [];
    for (const p of props) {
      const zk = p.type === 'figure' ? Math.min(zoom, 3) : zoom;   // people grow less (a giant on the diorama reads as a cartoon)
      for (const part of partsOf(p)) {
        const g = part.geo;
        tmpE.set(part.rx ?? 0, 0, part.rz ?? 0);
        tmpQ.setFromEuler(tmpE);
        // local (part) -> prop frame (rotate about y by the prop's rot) -> world
        tmpS.set(zk, zk, p.type === 'tape' ? 1 : zk);
        tmpM.compose(tmpV.set(part.x * zk, part.y * zk, part.z * zk), tmpQ, tmpS);
        g.applyMatrix4(tmpM);
        tmpM.makeRotationY(p.rot); g.applyMatrix4(tmpM);
        g.translate(p.x, p.y, p.z);
        const n = g.attributes.position.count, col = new Float32Array(n * 3);
        tmpC.setHex(part.color);
        for (let i = 0; i < n; i++) { col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.deleteAttribute('uv');
        geos.push(g);
      }
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    this.mesh.geometry = merged ?? new THREE.BufferGeometry();
    this.mesh.visible = !!merged;
  }
  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.mesh.removeFromParent(); }
}
