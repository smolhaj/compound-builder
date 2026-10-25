/**
 * Flashlight cones for whoever is out on watch at night: a faint beam in
 * the air (one instanced, additive draw for everyone) sweeping slowly from
 * side to side, and on High one real spotlight on the ground ahead of the
 * first of them. Attached to people by id each frame (the schedule decides
 * who; atmosphere/nightLife.flashlightCarriers).
 */
import * as THREE from 'three';
import type { Quality } from '../../engine/world/WorldScene';

const MAX = 6;
/** Beam length (≈ 7 m of visible beam) and spread at its end. */
const LEN = 1.2, END_R = 0.22;

export interface Carrier { x: number; y: number; z: number; rot: number }

export class Flashlights {
  private readonly _mesh: THREE.InstancedMesh;
  private readonly _spot: THREE.SpotLight | null = null;
  private readonly _scene: THREE.Scene;
  private _q: Quality = 'high';
  private readonly _m = new THREE.Matrix4();
  private readonly _e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly _qt = new THREE.Quaternion();
  private readonly _v = new THREE.Vector3();
  private readonly _s = new THREE.Vector3(1, 1, 1);

  constructor(scene: THREE.Scene) {
    this._scene = scene;
    const g = new THREE.ConeGeometry(END_R, LEN, 18, 1, true).translate(0, -LEN / 2, 0).rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uLen: { value: LEN }, uK: { value: 1 } },
      vertexShader: /* glsl */`
        uniform float uLen; varying float vT; varying vec3 vN; varying vec3 vV;
        void main() {
          vT = position.z / uLen;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform float uK; varying float vT; varying vec3 vN; varying vec3 vV;
        void main() {
          // brightest near the lens, fading out along the beam; soft at the silhouette edges
          float edge = pow(abs(dot(normalize(vN), normalize(vV))), 0.8);
          float a = (1.0 - smoothstep(0.0, 1.0, vT)) * smoothstep(0.0, 0.04, vT) * edge * 0.16 * uK;
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.82) * a, a);
        }`,
    });
    this._mesh = new THREE.InstancedMesh(g, mat, MAX);
    this._mesh.count = 0;
    this._mesh.frustumCulled = false;
    this._mesh.renderOrder = 5;
    this._mesh.userData = { noSSAO: true };
    scene.add(this._mesh);
    this._spot = new THREE.SpotLight(0xfff2d8, 0, 2.2, 0.32, 0.5, 1.6);
    this._spot.castShadow = false;
    scene.add(this._spot, this._spot.target);
  }

  setQuality(q: Quality): void { this._q = q; }

  /** Draw a beam for each carrier (≤ 6); `night` 0–1; `time` s. */
  update(carriers: readonly Carrier[], night: number, time: number): void {
    const n = Math.min(MAX, carriers.length);
    const k = Math.max(0, Math.min(1, (night - 0.25) / 0.4));
    (this._mesh.material as THREE.ShaderMaterial).uniforms.uK.value = k;
    for (let i = 0; i < n; i++) {
      const c = carriers[i];
      // sweep ±35° over ≈ 6 s, each on their own beat; aimed a little down at the ground ahead
      const yaw = c.rot + Math.sin(time * 1.05 + i * 2.3) * 0.6;
      this._e.set(0.32 + 0.06 * Math.sin(time * 0.7 + i), yaw, 0);
      this._qt.setFromEuler(this._e);
      // the torch at chest height, a hand's width out in front
      this._v.set(c.x + Math.sin(yaw) * 0.03, c.y + 0.19, c.z + Math.cos(yaw) * 0.03);
      this._m.compose(this._v, this._qt, this._s);
      this._mesh.setMatrixAt(i, this._m);
    }
    this._mesh.count = k > 0.01 ? n : 0;
    this._mesh.instanceMatrix.needsUpdate = true;
    const spot = this._spot!;
    if (n && this._q === 'high' && k > 0.01) {
      const c = carriers[0];
      const yaw = c.rot + Math.sin(time * 1.05) * 0.6;
      spot.position.set(c.x, c.y + 0.19, c.z);
      spot.target.position.set(c.x + Math.sin(yaw) * 0.9, c.y - 0.1, c.z + Math.cos(yaw) * 0.9);
      spot.intensity = 3.2 * k;
    } else spot.intensity = 0;
  }

  dispose(): void {
    this._scene.remove(this._mesh, this._spot!, this._spot!.target);
    this._mesh.geometry.dispose();
    (this._mesh.material as THREE.Material).dispose();
  }
}
