/**
 * FL2: the flood (docs/FELT_LAYER.md 5.2): ONE low-resolution plane over the parcel, drawn only while there is water. The plane is flat in the
 * mesh and shaped in the shader: a half-float texture holds, per ground sample, the ground's height above the creek's water at that x and the
 * creek's water height; the vertex shader lifts the surface to creek + level and the fragment shader discards every texel the ground stands
 * above the level at (so the water stops at the bank and shows the lowland under it, no mesh rebuild). `uLevel` animates toward the sim's level.
 * On Low the plane is a flat translucent color (no shore softening).
 */
import * as THREE from 'three';

const RES = 128;

export interface FloodHost { size: number; groundAt(x: number, z: number): number; creekWaterY(x: number): number }

export class FloodPlane {
  readonly mesh: THREE.Mesh;
  private readonly _u = { uRise: { value: null as THREE.DataTexture | null }, uLevel: { value: 0 }, uSize: { value: 67 }, uTime: { value: 0 }, uSoft: { value: 1 } };
  private _built = '';
  private _target = 0;
  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x6b5a3c, transparent: true, opacity: 0.88, roughness: 0.6, metalness: 0, depthWrite: false });
    const u = this._u;
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform sampler2D uRise; uniform float uLevel; uniform float uSize; uniform float uTime; varying vec2 vFl;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vFl = position.xz / uSize;
          float cy = texture2D(uRise, vFl).g;
          transformed.y = cy + uLevel + 0.004 * sin(uTime * 1.3 + position.x * 0.9 + position.z * 0.7);`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uRise; uniform float uLevel; uniform float uTime; uniform float uSoft; varying vec2 vFl;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float rise = texture2D(uRise, vFl).r;
          if (rise > uLevel || uLevel < 0.004) discard;
          float depth = uLevel - rise;
          diffuseColor.rgb = mix(vec3(0.46, 0.38, 0.24), diffuseColor.rgb, clamp(depth * 6.0, 0.0, 1.0)) * (0.92 + 0.08 * sin(uTime * 0.7 + vFl.x * 61.0 + vFl.y * 47.0));
          diffuseColor.a *= mix(1.0, smoothstep(0.0, 0.05, depth), uSoft);`);
    };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), mat);
    this.mesh.name = 'felt_flood'; this.mesh.visible = false; this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 3; this.mesh.userData = { type: 'feltFlood', noSSAO: true };
    scene.add(this.mesh);
  }
  get level(): number { return this._u.uLevel.value; }
  private _build(h: FloodHost, key: string): void {
    this._built = key;
    const data = new Uint16Array(RES * RES * 2), toH = THREE.DataUtils.toHalfFloat;
    for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
      const x = (i + 0.5) / RES * h.size, z = (j + 0.5) / RES * h.size, cy = h.creekWaterY(x);
      data[(j * RES + i) * 2] = toH(h.groundAt(x, z) - cy); data[(j * RES + i) * 2 + 1] = toH(cy);
    }
    const t = new THREE.DataTexture(data, RES, RES, THREE.RGFormat, THREE.HalfFloatType);
    t.magFilter = t.minFilter = THREE.LinearFilter; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
    this._u.uRise.value?.dispose(); this._u.uRise.value = t; this._u.uSize.value = h.size;
    const seg = 48;
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.PlaneGeometry(h.size, h.size, seg, seg).rotateX(-Math.PI / 2).translate(h.size / 2, 0, h.size / 2);
  }
  /** Set the water's height over the creek in feet-as-units (0 = none). `now` jumps there instead of rising (a loaded save, a QA jump). */
  set(units: number, host: FloodHost, o: { flat?: boolean; now?: boolean } = {}): void {
    this._target = Math.max(0, units);
    this._u.uSoft.value = o.flat ? 0 : 1;
    if (this._target > 0.004 && this._built !== `${host.size}`) this._build(host, `${host.size}`);
    if (o.now) this._u.uLevel.value = this._target;
  }
  frame(dt: number): void {
    const u = this._u; u.uTime.value += dt;
    const d = this._target - u.uLevel.value;
    // the wave rises about a unit (20 ft) in 12 s of view time, and drains more slowly
    u.uLevel.value += Math.sign(d) * Math.min(Math.abs(d), dt * (d > 0 ? 0.09 : 0.03));
    this.mesh.visible = u.uLevel.value > 0.004 && !!u.uRise.value;
  }
  dispose(): void { this.mesh.geometry.dispose(); this._u.uRise.value?.dispose(); (this.mesh.material as THREE.Material).dispose(); this.mesh.removeFromParent(); }
}
