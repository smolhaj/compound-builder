/**
 * A field of shrubs (instanced, near only, sharing the vegetation material
 * so they move in the wind and hold snow like the trees). Used for the
 * Mountain West's two signature shrubs:
 *   sagebrush — the gray-green shrub on the dry benches (big sagebrush,
 *               Artemisia tridentata: 0.5–1.5 m, a plant every meter or two
 *               on good sage ground, thinning into the grass);
 *   willow    — the thickets along the creek banks (sandbar / Geyer willow:
 *               dense multi-stem clumps 2–4 m tall).
 */
import * as THREE from 'three';
import type { Quality } from '../WorldScene';
import { applyVegetationDepth, buildSagePatch, buildWillowClump, createVegetationMaterial } from './treeGeometry';
import { InstancedLodSet } from './instancedLod';

export interface ShrubSpec { x: number; y: number; z: number; s: number; rot: number; tone: number }

/** Sage: silvery gray-green, some bluer, some more olive. Willow: fresh yellow-green to blue-green. */
export const SAGE = [0x7d8468, 0x868d70, 0x737a5e, 0x8f9377, 0x7a8064];
export const WILLOW = [0x6f8f3e, 0x7c9a48, 0x5f8040, 0x86a052, 0x6a8a52];

export class ShrubField {
  private _set: InstancedLodSet | null = null;
  private _mat: THREE.MeshStandardMaterial | null = null;
  private _geos: THREE.BufferGeometry[] = [];
  private _shown = true;
  private readonly _bark = { value: new THREE.Color(0x6a5e4c) };

  private readonly _scene: THREE.Scene;
  private readonly _name: string;
  private readonly _palette: readonly number[];
  /** Height vs width of the clump (sage is low and wide, willow tall). */
  private readonly _tall: number;

  constructor(scene: THREE.Scene, name: string, palette: readonly number[], tall: number) {
    this._scene = scene; this._name = name; this._palette = palette; this._tall = tall;
  }

  set visible(v: boolean) { this._shown = v; if (this._set) this._set.visible = v; }

  build(list: readonly ShrubSpec[], quality: Quality): void {
    this.clear();
    if (!list.length) return;
    if (!this._geos.length) {
      const make = this._name === 'willow' ? buildWillowClump : buildSagePatch;
      this._geos = [make(907, true), make(907, false)];
    }
    this._mat = createVegetationMaterial({ detail: quality, leafFill: { value: 1 }, barkColor: this._bark, evergreen: true });
    const d = new THREE.Object3D();
    const mats = list.map(p => {
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(0, p.rot, 0);
      d.scale.set(p.s, p.s * this._tall, p.s);
      d.updateMatrix();
      return d.matrix.clone();
    });
    const near = quality === 'high' ? 40 : 28, far = quality === 'high' ? 95 : 70;
    const set = new InstancedLodSet(this._scene, [{ geometry: this._geos[0], maxDist: near }, { geometry: this._geos[1], maxDist: far }], this._mat, mats, {
      name: this._name, userData: { type: this._name }, castShadow: quality === 'high', shadowMargin: 2,
    });
    applyVegetationDepth(set.meshes, this._mat);
    const c = new THREE.Color();
    list.forEach((p, i) => { c.setHex(this._palette[Math.floor(p.tone * this._palette.length) % this._palette.length]); c.multiplyScalar(0.9 + 0.2 * ((p.tone * 7.3) % 1)); set.setColorAt(i, c); });
    if (!this._shown) set.visible = false;
    this._set = set;
  }

  clear(): void {
    this._set?.dispose();
    this._set = null;
    this._mat?.dispose();
    this._mat = null;
  }

  dispose(): void {
    this.clear();
    for (const g of this._geos) g.dispose();
    this._geos = [];
  }
}
