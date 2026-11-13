/**
 * AnimalBatches — instanced drawing for animal models that carry the `iExtra` attribute (wildlife and pets): one InstancedMesh per
 * (model, level of detail) that is in use, hidden when empty (so the census does not count it), the same quality tiers as the livestock
 * (LivestockRenderer.lodTier), one soft contact shadow for everyone, no shadow-map casters, no SSAO. The caller supplies the registry.
 */
import * as THREE from 'three';
import type { Lod } from './animalKit';
import { animalMaterial } from './animalMaterial';
import type { AnimalModel } from './animalParts';
import { lodTier, UNIT, type Quality } from './LivestockRenderer';

export interface PutAnimal {
  id: string; breed: number;
  x: number; y: number; z: number; rot: number;
  phase: number; gait: number; graze: number; seed: number; tone: number;
  /** World scale multiplier on top of UNIT and the breed's size. */
  size: number;
  /** iExtra: adornment growth (antlers, beard), lying, tail wag, alert; all 0..1. */
  adorn?: number; lie?: number; wag?: number; alert?: number;
  /** Level of detail index into the tier (0 near .. 2 far). */
  li: number;
  /** Ground normal x / z (for the contact shadow). */
  nx?: number; nz?: number;
  /** Pitch the whole animal (rad, nose up positive) and roll (a dog lying on a slope, a duck on water). */
  pitch?: number;
  noShadow?: boolean;
}

interface Batch { mesh: THREE.InstancedMesh; anim: Float32Array; coat: Float32Array; extra: Float32Array; n: number }
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpN = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

export class AnimalBatches {
  private readonly _batches = new Map<string, Batch>();
  private readonly _mats = new Map<string, { model: AnimalModel; material: THREE.MeshStandardMaterial; uniforms: Record<string, { value: unknown }> }>();
  private readonly _geos = new Map<string, THREE.BufferGeometry>();
  private _shadow: THREE.InstancedMesh | null = null;
  private _shadowN = 0;
  private _quality: Quality = 'medium';
  private readonly _scene: THREE.Scene;
  private readonly _cap: number;
  private readonly _tag: string;
  private readonly _lookup: (id: string) => AnimalModel;
  constructor(scene: THREE.Scene, cap: number, tag: string, lookup: (id: string) => AnimalModel) { this._scene = scene; this._cap = cap; this._tag = tag; this._lookup = lookup; }

  get quality(): Quality { return this._quality; }
  setQuality(q: Quality): void {
    if (q === this._quality) return;
    this._quality = q;
    for (const b of this._batches.values()) { this._scene.remove(b.mesh); b.mesh.geometry.dispose(); }
    this._batches.clear();
    for (const g of this._geos.values()) g.dispose();
    this._geos.clear();
  }
  /** The LOD tier now: the lods and the distances they switch at. */
  tier(): ReturnType<typeof lodTier> {
    const t = lodTier(this._quality);
    // Low: wildlife and pets are all drawn at the plainest level (the perf budget counts every triangle)
    return this._quality === 'low' ? { lods: [t.lods[2], t.lods[2], t.lods[2]], at: t.at } : t;
  }
  model(id: string): AnimalModel { return this._lookup(id); }

  private _shadowMesh(): THREE.InstancedMesh {
    if (this._shadow) return this._shadow;
    const N = 32, d = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const r = Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) * 2, v = Math.round(255 * Math.pow(Math.max(0, 1 - r), 1.4));
      d.set([v, v, v, 255], (j * N + i) * 4);
    }
    const tex = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ color: 0x14130e, alphaMap: tex, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, this._cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0; m.visible = false; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.renderOrder = 1;
    m.name = `${this._tag}_shadow`; m.userData = { type: this._tag, noSSAO: true };
    this._scene.add(m);
    this._shadow = m;
    return m;
  }

  private _material(id: string) {
    let m = this._mats.get(id);
    if (!m) { const model = this._lookup(id); m = { model, ...animalMaterial(model.spec) }; this._mats.set(id, m); }
    return m;
  }

  private _batch(id: string, li: number): Batch {
    const key = `${id}|${li}`;
    let b = this._batches.get(key);
    if (b) return b;
    const { model, material } = this._material(id), lod: Lod = this.tier().lods[li];
    const gk = `${id}|${lod.seg}|${lod.sub}|${lod.detail}`;
    let g = this._geos.get(gk);
    if (!g) { g = model.build(lod); this._geos.set(gk, g); }
    const geo = g.clone();
    const cap = this._cap, anim = new Float32Array(cap * 4), coat = new Float32Array(cap * 4), extra = new Float32Array(cap * 4);
    geo.setAttribute('iAnim', new THREE.InstancedBufferAttribute(anim, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('iCoat', new THREE.InstancedBufferAttribute(coat, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('iExtra', new THREE.InstancedBufferAttribute(extra, 4).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.InstancedMesh(geo, material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0; mesh.visible = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
    mesh.name = `${this._tag}_${id}_${li}`; mesh.userData = { type: this._tag, noSSAO: true };
    this._scene.add(mesh);
    b = { mesh, anim, coat, extra, n: 0 };
    this._batches.set(key, b);
    return b;
  }

  private _drawn = 0;
  begin(): void { for (const b of this._batches.values()) b.n = 0; this._shadowN = 0; this._drawn = 0; }

  put(a: PutAnimal): void {
    // Low: at most 8 animals are drawn at all (the perf budget counts every triangle on the screen)
    if (this._quality === 'low' && this._drawn >= 8) return;
    const b = this._batch(a.id, a.li), { model } = this._material(a.id);
    if (b.n >= this._cap) return;
    this._drawn++;
    const nb = model.spec.breeds.length, bi = ((a.breed % nb) + nb) % nb, sc = UNIT * a.size * (model.spec.breeds[bi].size ?? 1);
    tmpQ.setFromEuler(tmpE.set(a.pitch ?? 0, a.rot, 0, 'YXZ'));
    tmpM.compose(tmpV.set(a.x, a.y, a.z), tmpQ, tmpS.set(sc, sc, sc));
    b.mesh.setMatrixAt(b.n, tmpM);
    b.anim.set([a.phase, a.gait, a.graze, a.seed], b.n * 4);
    b.coat.set([bi, a.seed, a.tone, 0], b.n * 4);
    b.extra.set([a.adorn ?? 0, a.lie ?? 0, a.wag ?? 0, a.alert ?? 0], b.n * 4);
    b.n++;
    if (a.noShadow || this._shadowN >= this._cap) return;
    const sh = this._shadowMesh(), hl = model.length * sc * 0.62, hw = hl * Math.min(0.62, Math.max(0.3, (model.spec.root.cy ?? 0.5) > 0.4 ? 0.42 : 0.55));
    tmpN.set(a.nx ?? 0, 1, a.nz ?? 0).normalize();
    tmpQ2.setFromUnitVectors(UP, tmpN);
    tmpQ.setFromEuler(tmpE.set(0, a.rot, 0)); tmpQ2.multiply(tmpQ);
    tmpM.compose(tmpV.set(a.x, a.y + 0.004, a.z), tmpQ2, tmpS.set(hw * 2, 1, hl * 2));
    sh.setMatrixAt(this._shadowN++, tmpM);
  }

  flush(time: number): void {
    if (this._shadow) { this._shadow.count = this._shadowN; this._shadow.visible = this._shadowN > 0; this._shadow.instanceMatrix.needsUpdate = true; }
    for (const b of this._batches.values()) {
      b.mesh.count = b.n; b.mesh.visible = b.n > 0;
      b.mesh.instanceMatrix.needsUpdate = true;
      for (const k of ['iAnim', 'iCoat', 'iExtra']) (b.mesh.geometry.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
    }
    for (const m of this._mats.values()) m.uniforms.uTime.value = time;
  }

  /** Animals drawn this frame (tests / QA). */
  count(): number { let n = 0; for (const b of this._batches.values()) n += b.n; return n; }
  /** Meshes visible now (draw calls). */
  drawCalls(): number { let n = 0; for (const b of this._batches.values()) if (b.mesh.visible) n++; return n + (this._shadow?.visible ? 1 : 0); }

  dispose(): void {
    for (const b of this._batches.values()) { this._scene.remove(b.mesh); b.mesh.geometry.dispose(); }
    for (const g of this._geos.values()) g.dispose();
    for (const m of this._mats.values()) m.material.dispose();
    this._batches.clear(); this._geos.clear(); this._mats.clear();
    if (this._shadow) { this._scene.remove(this._shadow); this._shadow.geometry.dispose(); (this._shadow.material as THREE.Material).dispose(); this._shadow = null; }
  }
}
