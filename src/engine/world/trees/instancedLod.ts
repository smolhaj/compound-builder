/**
 * instancedLod — camera-driven frustum culling + distance LOD for large,
 * static instanced sets (forest / street / campus trees, parked cars).
 *
 * three.js culls an InstancedMesh as ONE object (its bounding sphere covers
 * every instance), so a forest spread around the whole lot is always drawn in
 * full — in the main pass, the SSAO normal pass and the shadow pass. An
 * InstancedLodSet keeps the source instances on the CPU and, whenever the
 * camera moves, compacts the instances that are inside the (margin-inflated)
 * view frustum into one InstancedMesh per LOD level, picked by distance to
 * the camera. Draw calls stay constant (one per level); triangles scale with
 * what is actually on screen.
 *
 * Work happens in THREE.Scene.onBeforeRender (see addSceneRenderHook), i.e.
 * before the renderer builds its render list, so there is no frame of lag.
 * The re-bucket is skipped entirely while the camera is still (matrix
 * compare), so a static view costs nothing.
 *
 * Shadows: instances just outside the view can still throw a shadow into it,
 * so the cull sphere is inflated by `shadowMargin` for sets that cast.
 */
import * as THREE from 'three';

// ── Scene render hook (chained Scene.onBeforeRender) ─────────────────────────

type RenderHook = (camera: THREE.Camera) => void;
const HOOKS_KEY = '__lodHooks';

/**
 * Register a callback run at the start of every renderer.render(scene, …)
 * with a perspective camera (main pass + SSAO normal pass — the callbacks
 * below are idempotent for an unchanged camera). Returns an unregister fn.
 */
export function addSceneRenderHook(scene: THREE.Scene, fn: RenderHook): () => void {
  let hooks = scene.userData[HOOKS_KEY] as RenderHook[] | undefined;
  if (!hooks) {
    const list: RenderHook[] = [];
    hooks = list;
    scene.userData[HOOKS_KEY] = list;
    scene.onBeforeRender = (_r, _s, camera) => {
      if (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera) return;
      for (let i = 0; i < list.length; i++) list[i](camera);
    };
  }
  hooks.push(fn);
  const list = hooks;
  return () => {
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
}

// ── InstancedLodSet ───────────────────────────────────────────────────────────

export interface LodLevel {
  geometry: THREE.BufferGeometry;
  /** Instances whose distance to the camera is < maxDist use this level
   *  (levels are tested in order; the last level catches everything). */
  maxDist: number;
}

export interface InstancedLodOptions {
  name?: string;
  userData?: Record<string, unknown>;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Extra cull-sphere radius for shadow casters (world units). */
  shadowMargin?: number;
  /** Beyond this distance instances are dropped entirely (default ∞). */
  maxDrawDist?: number;
  /** Levels with index ≥ this skip the SSAO pre-pass (userData.noSSAO) —
   *  far instances contribute no visible AO. Default: never. */
  noSSAOFromLevel?: number;
  /** Extra per-instance attributes (source data, itemSize floats per
   *  instance) compacted alongside the matrices. Only valid when every level
   *  geometry is exclusive to this set — the GPU copies live on it. */
  instanceAttributes?: Array<{ name: string; itemSize: number; data: Float32Array }>;
  /** Whether per-instance colours are used (allocates instanceColor). */
  colors?: boolean;
}

const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _camPos = new THREE.Vector3();

export class InstancedLodSet {
  /**
   * QA / tooling switch: when true every instance is drawn at LOD 0 with no
   * culling, so inspection tools that read the instance buffers see the full
   * set. Call InstancedLodSet.setCullingEnabled() to toggle.
   */
  private static _noCull = false;
  private static _epoch = 0;
  static setCullingEnabled(on: boolean): void {
    InstancedLodSet._noCull = !on;
    InstancedLodSet._epoch++;
  }

  readonly meshes: THREE.InstancedMesh[] = [];
  readonly count: number;
  private readonly _levels: LodLevel[];
  /** Source instance matrices (16 floats each). */
  private readonly _mtx: Float32Array;
  /** Source colours (3 floats each) — null when colours are unused. */
  private readonly _col: Float32Array | null;
  /** World-space cull sphere per instance: x, y, z, r. */
  private readonly _bound: Float32Array;
  /** Extra attributes: source data + one GPU attribute per level. */
  private readonly _extra: Array<{ itemSize: number; data: Float32Array; gpu: THREE.InstancedBufferAttribute[] }> = [];
  private readonly _margin: number;
  private readonly _maxDraw2: number;
  private readonly _lastCam = new Float64Array(32);
  private _dirty = true;
  private _epoch = -1;
  private _lodScale = 1;
  private _visible = true;
  private readonly _shown: boolean[] = [];
  private _unhook: (() => void) | null = null;
  private readonly _scene: THREE.Scene;

  constructor(
    scene: THREE.Scene,
    levels: LodLevel[],
    material: THREE.Material,
    matrices: ArrayLike<THREE.Matrix4> | THREE.Matrix4[],
    opts: InstancedLodOptions = {},
  ) {
    this._scene = scene;
    this._levels = levels;
    const n = matrices.length;
    this.count = n;
    this._margin = opts.castShadow ? (opts.shadowMargin ?? 0) : 0;
    this._maxDraw2 = opts.maxDrawDist !== undefined ? opts.maxDrawDist * opts.maxDrawDist : Infinity;
    this._mtx = new Float32Array(n * 16);
    this._col = opts.colors === false ? null : new Float32Array(n * 3).fill(1);
    this._bound = new Float32Array(n * 4);

    // Cull sphere = the largest level's local bounding sphere, transformed
    let bs: THREE.Sphere | null = null;
    for (const l of levels) {
      if (!l.geometry.boundingSphere) l.geometry.computeBoundingSphere();
      const s = l.geometry.boundingSphere!;
      if (!bs || s.radius > bs.radius) bs = s;
    }
    for (let i = 0; i < n; i++) {
      const m = matrices[i];
      m.toArray(this._mtx, i * 16);
      _sphere.copy(bs!).applyMatrix4(m);
      this._bound[i * 4] = _sphere.center.x;
      this._bound[i * 4 + 1] = _sphere.center.y;
      this._bound[i * 4 + 2] = _sphere.center.z;
      this._bound[i * 4 + 3] = _sphere.radius;
    }

    for (let li = 0; li < levels.length; li++) {
      const mesh = new THREE.InstancedMesh(levels[li].geometry, material, Math.max(1, n));
      mesh.count = 0;
      // Culling is done per instance here — the set-wide sphere is useless
      mesh.frustumCulled = false;
      mesh.castShadow = !!opts.castShadow;
      mesh.receiveShadow = !!opts.receiveShadow;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (this._col) {
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3);
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      for (const a of opts.instanceAttributes ?? []) {
        let e = this._extra.find(x => x.data === a.data);
        if (!e) { e = { itemSize: a.itemSize, data: a.data, gpu: [] }; this._extra.push(e); }
        const g = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * a.itemSize), a.itemSize);
        g.setUsage(THREE.DynamicDrawUsage);
        levels[li].geometry.setAttribute(a.name, g);
        e.gpu.push(g);
      }
      if (opts.name) mesh.name = levels.length > 1 ? `${opts.name}_lod${li}` : opts.name;
      mesh.userData = { ...(opts.userData ?? {}), lod: li };
      if (opts.noSSAOFromLevel !== undefined && li >= opts.noSSAOFromLevel) mesh.userData.noSSAO = true;
      this.meshes.push(mesh);
      this._shown.push(true);
      scene.add(mesh);
    }
    this._unhook = addSceneRenderHook(scene, (cam) => this.update(cam));
  }

  /** Source matrix of instance i (read-only view). */
  getMatrixAt(i: number, out: THREE.Matrix4): THREE.Matrix4 {
    return out.fromArray(this._mtx, i * 16);
  }

  setColorAt(i: number, c: THREE.Color): void {
    if (!this._col) return;
    this._col[i * 3] = c.r; this._col[i * 3 + 1] = c.g; this._col[i * 3 + 2] = c.b;
    this._dirty = true;
  }

  /** Multiply every LOD switch distance (quality tiers). */
  setLodScale(s: number): void {
    if (s !== this._lodScale) { this._lodScale = s; this._dirty = true; }
  }

  set castShadow(v: boolean) {
    for (const m of this.meshes) m.castShadow = v;
    this._dirty = true;
  }

  set visible(v: boolean) {
    this._visible = v;
    this.meshes.forEach((m, li) => { this._shown[li] = v && m.count > 0; m.visible = this._shown[li]; });
  }

  /** Re-bucket instances for this camera (no-op when nothing changed). */
  update(camera: THREE.Camera): void {
    const cm = camera.matrixWorld.elements, pm = camera.projectionMatrix.elements;
    const last = this._lastCam;
    if (this._epoch !== InstancedLodSet._epoch) { this._epoch = InstancedLodSet._epoch; this._dirty = true; }
    if (!this._dirty) {
      let same = true;
      for (let k = 0; k < 16; k++) {
        if (last[k] !== cm[k] || last[16 + k] !== pm[k]) { same = false; break; }
      }
      if (same) return;
    }
    for (let k = 0; k < 16; k++) { last[k] = cm[k]; last[16 + k] = pm[k]; }
    this._dirty = false;

    _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv, camera.coordinateSystem);
    _camPos.setFromMatrixPosition(camera.matrixWorld);
    const planes = _frustum.planes;
    const L = this._levels.length;
    const lim2: number[] = [];
    for (let li = 0; li < L; li++) {
      const d = li === L - 1 ? Infinity : this._levels[li].maxDist * this._lodScale;
      lim2.push(d * d);
    }
    const counts = new Array<number>(L).fill(0);
    const mArr = this.meshes.map(m => m.instanceMatrix.array as Float32Array);
    const cArr = this.meshes.map(m => (m.instanceColor ? m.instanceColor.array as Float32Array : null));
    const b = this._bound, src = this._mtx, col = this._col;
    const noCull = InstancedLodSet._noCull;
    const margin = noCull ? Infinity : this._margin, maxD2 = noCull ? Infinity : this._maxDraw2;
    if (noCull) lim2[0] = Infinity;
    const cx = _camPos.x, cy = _camPos.y, cz = _camPos.z;

    for (let i = 0; i < this.count; i++) {
      const x = b[i * 4], y = b[i * 4 + 1], z = b[i * 4 + 2];
      const r = b[i * 4 + 3] + margin;
      let inside = true;
      for (let p = 0; p < 6; p++) {
        const pl = planes[p];
        if (pl.normal.x * x + pl.normal.y * y + pl.normal.z * z + pl.constant < -r) { inside = false; break; }
      }
      if (!inside) continue;
      const dx = x - cx, dy = y - cy, dz = z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > maxD2) continue;
      let li = 0;
      while (li < L - 1 && d2 >= lim2[li]) li++;
      const k = counts[li]++;
      mArr[li].set(src.subarray(i * 16, i * 16 + 16), k * 16);
      const ca = cArr[li];
      if (ca && col) { ca[k * 3] = col[i * 3]; ca[k * 3 + 1] = col[i * 3 + 1]; ca[k * 3 + 2] = col[i * 3 + 2]; }
      for (let e = 0; e < this._extra.length; e++) {
        const x = this._extra[e], sz = x.itemSize;
        (x.gpu[li].array as Float32Array).set(x.data.subarray(i * sz, i * sz + sz), k * sz);
      }
    }
    for (let li = 0; li < L; li++) {
      const m = this.meshes[li];
      const k = counts[li];
      m.count = k;
      // Empty levels are hidden so they cost no draw call in any pass. Only
      // touch .visible when OUR wish changes — the SSAO pre-pass hides
      // noSSAO meshes around its render and this hook runs inside it.
      const want = this._visible && k > 0;
      if (want !== this._shown[li]) { this._shown[li] = want; m.visible = want; }
      if (k > 0) {
        m.instanceMatrix.clearUpdateRanges();
        m.instanceMatrix.addUpdateRange(0, k * 16);
        m.instanceMatrix.needsUpdate = true;
        for (const x of this._extra) {
          const g = x.gpu[li];
          g.clearUpdateRanges();
          g.addUpdateRange(0, k * x.itemSize);
          g.needsUpdate = true;
        }
        if (m.instanceColor) {
          m.instanceColor.clearUpdateRanges();
          m.instanceColor.addUpdateRange(0, k * 3);
          m.instanceColor.needsUpdate = true;
        }
      }
    }
  }

  /** Remove the meshes from the scene. Geometries / material are NOT disposed
   *  (they are usually shared caches owned by the caller). */
  dispose(): void {
    this._unhook?.();
    this._unhook = null;
    for (const m of this.meshes) {
      this._scene.remove(m);
      m.dispose();
    }
    this.meshes.length = 0;
  }
}
