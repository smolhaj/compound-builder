/**
 * Lanterns on the wall (the threshold moments of the oasis grade): a lamp over each gate and a small oil lantern every few units along
 * the finished wall ring, lit from dusk, so from outside the compound reads as a warm line against the dark.
 *
 * Budget: one InstancedMesh for every lantern body (a bracket and a glass box) and one Points for every glow, 2 draw calls in all, both
 * hidden by day, under a blackout and when there is no wall. No point lights are added (the glow is an additive sprite, the lamp glass is
 * emissive and blooms). Plans come from lanternPlan.ts; this only draws them.
 */
import * as THREE from 'three';
import type { PerimeterRun } from '../../sim/perimeter';
import { lanternPlan, lanternLevel, type Lantern } from './lanternPlan';

const BODY = (() => {
  const post = new THREE.BoxGeometry(0.012, 0.06, 0.012).translate(0, 0.03, 0);
  const glass = new THREE.BoxGeometry(0.03, 0.042, 0.03).translate(0, 0.078, 0);
  const cap = new THREE.ConeGeometry(0.026, 0.016, 4).rotateY(Math.PI / 4).translate(0, 0.108, 0);
  const g = new THREE.BufferGeometry();
  const parts = [post, glass, cap];
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  let base = 0;
  parts.forEach((p, k) => {
    const pa = p.attributes.position, na = p.attributes.normal;
    for (let i = 0; i < pa.count; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i)); nor.push(na.getX(i), na.getY(i), na.getZ(i));
      // the glass is the lamp (a warm lit colour), the post and cap are dark iron
      if (k === 1) col.push(1.9, 0.78, 0.2); else col.push(0.07, 0.065, 0.06);
    }
    const ix = p.index!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
    base += pa.count;
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
})();

const GLOW_VERT = /* glsl */`
  attribute float aSize; attribute float aPhase;
  uniform float uScale; uniform float uTime; uniform float uLevel;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float flick = 0.88 + 0.12 * sin(uTime * 7.0 + aPhase * 6.283) * sin(uTime * 2.3 + aPhase * 17.0);
    vA = uLevel * flick;
    gl_PointSize = clamp(aSize * uScale / max(0.2, -mv.z), 1.0, 220.0);
    gl_Position = projectionMatrix * mv;
  }`;
const GLOW_FRAG = /* glsl */`
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float core = exp(-d * d * 14.0), halo = pow(1.0 - d, 2.4) * 0.5;
    vec3 col = vec3(1.0, 0.5, 0.17) * (halo * 1.0 + core * 1.3) + vec3(1.0, 0.8, 0.5) * core * 0.3;
    gl_FragColor = vec4(col * vA, 1.0);
  }`;

export class WallLanterns {
  private readonly _scene: THREE.Scene;
  private readonly _ground: (x: number, z: number) => number;
  private _body: THREE.InstancedMesh | null = null;
  private _glow: THREE.Points | null = null;
  private _key = '';
  private _glowOn = true;
  private readonly _u = { uScale: { value: 600 }, uTime: { value: 0 }, uLevel: { value: 0 } };
  private readonly _mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  private readonly _gmat = new THREE.ShaderMaterial({ uniforms: this._u, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  private _count = 0;
  /** QA: draw the glow at any quality (the on-request Low frames of the shot scripts). */
  forceGlow = false;
  /** The plan being drawn (QA, tests). */
  plan: Lantern[] = [];

  constructor(scene: THREE.Scene, ground: (x: number, z: number) => number) { this._scene = scene; this._ground = ground; }

  setQuality(q: 'high' | 'medium' | 'low'): void { this._glowOn = q !== 'low'; }
  get count(): number { return this._count; }

  /** `level` 0-1 (lanternLevel), `safety` the home safety level (the glow dims a little when the place is hit). */
  update(runs: Iterable<PerimeterRun>, hour: number, lightsOut: boolean, safety: number, time: number, fovDeg: number, viewportH: number): void {
    const list = [...runs];
    const key = list.map(r => `${r.id}:${r.finishedAt === null ? 0 : 1}:${r.gates.length}:${r.pts.length}:${r.dropped ? 1 : 0}:${r.kind}`).join('|');
    if (key !== this._key) { this._key = key; this._rebuild(list); }
    const lit = lanternLevel(hour, lightsOut);
    const on = lit > 0.01 && this._count > 0;
    if (this._body) this._body.visible = on;
    if (this._glow) this._glow.visible = on && (this._glowOn || this.forceGlow);
    if (!on) return;
    this._u.uTime.value = time;
    // the lamp glass is lit as the lantern is: HDR amber at full, a dull ember when it is just being lit
    this._mat.color.setScalar(0.25 + 0.75 * lit);
    this._u.uLevel.value = lit * (0.65 + 0.35 * safety);
    this._u.uScale.value = viewportH / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  private _rebuild(runs: PerimeterRun[]): void {
    this._clear();
    this.plan = lanternPlan(runs);
    this._count = this.plan.length;
    if (!this._count) return;
    const m = new THREE.InstancedMesh(BODY, this._mat, this._count);
    const pos = new Float32Array(this._count * 3), size = new Float32Array(this._count), ph = new Float32Array(this._count);
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    this.plan.forEach((l, i) => {
      const x = l.x + l.ox * 0.03, z = l.z + l.oz * 0.03, y = this._ground(l.x, l.z) + l.y;
      const s = l.size * (l.gate ? 2.2 : 1.7);
      mat.compose(new THREE.Vector3(x, y, z), q, sc.set(s, s, s));
      m.setMatrixAt(i, mat);
      // the glow sits at the lamp glass
      pos[i * 3] = x; pos[i * 3 + 1] = y + 0.078 * s; pos[i * 3 + 2] = z;
      size[i] = l.gate ? 1.05 : 0.55;
      ph[i] = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    });
    m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.name = 'wall_lanterns';
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    const p = new THREE.Points(g, this._gmat);
    p.frustumCulled = false; p.name = 'wall_lantern_glow'; p.renderOrder = 6;
    m.visible = false; p.visible = false;
    this._scene.add(m, p);
    this._body = m; this._glow = p;
  }

  private _clear(): void {
    for (const o of [this._body, this._glow]) if (o) { this._scene.remove(o); if (o !== this._body) (o as THREE.Points).geometry.dispose(); (o as THREE.InstancedMesh).dispose?.(); }
    this._body = null; this._glow = null; this._count = 0;
  }

  dispose(): void { this._clear(); this._mat.dispose(); this._gmat.dispose(); }
}
