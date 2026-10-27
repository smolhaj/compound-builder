/**
 * RockField — loose rocks, slabs and ledges on the ground: two lumpy
 * procedural rock shapes (a rounded boulder and a flat-bedded slab),
 * instanced, per-instance size / squash / tint, half-buried so they sit in
 * the ground rather than on it. Sandstone ledges in Appalachia, red rock in
 * the desert, granite erratics in the north woods, fieldstone in the
 * Midwest, mossy basalt in the Northwest.
 *
 * Pure placement is the caller's (a list of RockSpec on any ground).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Quality } from '../WorldScene';

export interface RockSpec {
  x: number; y: number; z: number;
  /** Radius (world units; 0.1 ≈ 60 cm). */
  s: number;
  /** 0 = round boulder … 1 = flat slab. */
  flat: number;
  rot: number;
  /** 0–1 tint jitter. */
  tone: number;
}

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** A lumpy unit rock (radius ≈ 1, base cut flat at y = −0.35). */
function rockGeometry(seed: number, detail: number, flat: boolean): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // big facets plus fine roughness; slabs are bedded (flattened, with a step in the top)
    let k = 0.78 + 0.32 * hash3(Math.round(x * 3 + seed), Math.round(y * 3), Math.round(z * 3)) + 0.06 * hash3(x * 9, y * 9 + seed, z * 9);
    if (flat && y > 0.25) k *= 0.92;
    p.setXYZ(i, x * k * (flat ? 1.25 : 1), Math.max(-0.35, y * k * (flat ? 0.42 : 0.8)), z * k * (flat ? 1.05 : 0.95));
  }
  g.computeVertexNormals();
  return g;
}

export class RockField {
  private readonly _scene: THREE.Scene;
  private _meshes: THREE.InstancedMesh[] = [];
  private _geos: THREE.BufferGeometry[] = [];
  private _mat: THREE.MeshStandardMaterial | null = null;
  private _shown = true;

  constructor(scene: THREE.Scene) { this._scene = scene; }

  set visible(v: boolean) { this._shown = v; for (const m of this._meshes) m.visible = v; }

  build(list: readonly RockSpec[], color: number, quality: Quality): void {
    this.clear();
    if (!list.length) return;
    const detail = quality === 'low' ? 1 : 2;
    if (!this._geos.length) this._geos = [mergeGeometries([rockGeometry(3, detail, false)])!, mergeGeometries([rockGeometry(11, detail, true)])!];
    this._mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0, flatShading: quality === 'low' });
    const groups: RockSpec[][] = [[], []];
    for (const r of list) groups[r.flat > 0.5 ? 1 : 0].push(r);
    const d = new THREE.Object3D(), c = new THREE.Color(), base = new THREE.Color(color), hsl = { h: 0, s: 0, l: 0 };
    groups.forEach((g, k) => {
      if (!g.length) return;
      const mesh = new THREE.InstancedMesh(this._geos[k], this._mat!, g.length);
      g.forEach((r, i) => {
        d.position.set(r.x, r.y - r.s * 0.12, r.z);
        d.rotation.set(0, r.rot, 0);
        d.scale.set(r.s * (0.85 + 0.3 * r.tone), r.s, r.s * (1.15 - 0.3 * r.tone));
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
        base.getHSL(hsl);
        c.setHSL(hsl.h + (r.tone - 0.5) * 0.03, hsl.s * (0.8 + 0.4 * r.tone), hsl.l * (0.82 + 0.3 * ((r.tone * 7.31) % 1)));
        mesh.setColorAt(i, c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = quality === 'high';
      mesh.receiveShadow = true;
      mesh.name = 'rocks';
      mesh.userData = { type: 'rocks' };
      mesh.visible = this._shown;
      this._scene.add(mesh);
      this._meshes.push(mesh);
    });
  }

  clear(): void {
    for (const m of this._meshes) { this._scene.remove(m); m.dispose(); }
    this._meshes = [];
    this._mat?.dispose();
    this._mat = null;
  }

  dispose(): void {
    this.clear();
    for (const g of this._geos) g.dispose();
    this._geos = [];
  }
}
