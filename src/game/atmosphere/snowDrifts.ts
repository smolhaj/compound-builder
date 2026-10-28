/**
 * Snow drifts against the walls (and both faces of a container wall): one
 * merged mesh for the whole compound, built at full winter depth and scaled
 * down to the lying snow in the vertex shader (no rebuild as it melts).
 * Lee sides (the westerlies blow toward +x) build the deep drift; windward
 * sides are scoured to a low ridge (seasonCover.driftDepth). High / Medium
 * only.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { driftDepth, sideFor } from './seasonCover';
import { sstep } from './aging';

/** A wall to drift against: from (x0, z0) to (x1, z1), with its outward normal. */
export interface DriftWall { x0: number; z0: number; x1: number; z1: number; nx: number; nz: number }

/** Prevailing wind direction (toward which the snow blows). */
export const WIND = { x: 1, z: 0.25 };

const PROFILE = [0, 0.18, 0.42, 0.7, 1];   // distance out from the wall (share of the reach)
const shape = (u: number) => u >= 1 ? 0 : Math.pow(1 - u, 1.7) * (1 - 0.25 * Math.exp(-u * 18));

function hash(n: number): number { const s = Math.sin(n * 91.7 + 13.1) * 43758.5453; return s - Math.floor(s); }

/** Geometry of the drift along one wall (full depth), with `aRoot` (the wall-foot point each vertex scales toward). */
export function driftGeometry(w: DriftWall, ground: (x: number, z: number) => number, seed = 0): THREE.BufferGeometry | null {
  const L = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
  if (L < 0.05) return null;
  const { h, reach } = driftDepth(1, sideFor(w.nx, w.nz, WIND.x, WIND.z));
  const tx = (w.x1 - w.x0) / L, tz = (w.z1 - w.z0) / L;
  const n = Math.max(2, Math.ceil(L / 0.08));
  const P = PROFILE.length;
  const pos: number[] = [], root: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    // ends taper; the drift humps and dips along the wall
    const end = Math.min(1, s * L / 0.16, (1 - s) * L / 0.16);
    const wob = 0.75 + 0.5 * (0.5 * Math.sin(s * L * 7.3 + seed) + 0.5 * hash(Math.floor(s * L * 4) + seed * 7));
    const hh = h * end * wob, rr = reach * (0.6 + 0.4 * end) * (0.85 + 0.3 * wob * 0.5);
    const bx = w.x0 + tx * s * L + w.nx * 0.004, bz = w.z0 + tz * s * L + w.nz * 0.004;
    const by = ground(bx, bz) - 0.012;
    for (let j = 0; j < P; j++) {
      const u = PROFILE[j], d = u * rr;
      const x = bx + w.nx * d, z = bz + w.nz * d;
      pos.push(x, Math.max(ground(x, z) - 0.012, by) + hh * shape(u) + (j === P - 1 ? -0.01 : 0), z);
      root.push(bx, by, bz);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < P - 1; j++) {
    const a = i * P + j, b = a + 1, c = a + P, d = c + 1;
    // wind each quad so its face points up/out
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aRoot', new THREE.Float32BufferAttribute(root, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure the faces point up (the wall's side decides the winding)
  const nrm = g.getAttribute('normal');
  let up = 0;
  for (let i = 0; i < nrm.count; i++) up += nrm.getY(i);
  if (up < 0) { const ix = g.getIndex()!.array as Uint16Array | Uint32Array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}

export class SnowDrifts {
  readonly mesh: THREE.Mesh;
  private readonly _u = { uDrift: { value: 0 } };
  private _key = '';

  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.8, 0.82, 0.86), roughness: 0.86 });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uDrift = this._u.uDrift;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aRoot;\nuniform float uDrift;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = aRoot + ( transformed - aRoot ) * uDrift;');
    };
    mat.customProgramCacheKey = () => 'snow_drift';
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.mesh.name = 'snow_drifts';
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.visible = false;
    this.mesh.userData = { type: 'snow_drifts' };
    scene.add(this.mesh);
  }

  /** (Re)build for these walls when the key changes. */
  build(key: string, walls: readonly DriftWall[], ground: (x: number, z: number) => number): void {
    if (key === this._key) return;
    this._key = key;
    const parts = walls.map((w, i) => driftGeometry(w, ground, i * 1.37)).filter((g): g is THREE.BufferGeometry => !!g);
    this.mesh.geometry.dispose();
    this.mesh.geometry = parts.length ? mergeGeometries(parts) ?? new THREE.BufferGeometry() : new THREE.BufferGeometry();
    parts.forEach(p => p.dispose());
    this.mesh.geometry.computeBoundingSphere();
  }

  get built(): boolean { return this._key !== ''; }

  /** Lying snow 0–1 (season + weather); `on` false hides them (Low quality). */
  update(snow: number, on: boolean): void {
    const k = sstep(0.15, 0.85, snow);
    this._u.uDrift.value = k;
    this.mesh.visible = on && k > 0.02 && this.mesh.geometry.getAttribute('position') !== undefined;
  }

  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
