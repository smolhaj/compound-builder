/**
 * DistantRidges — the ranges beyond the modelled square. The regional landscape ends ~2 km out (±R_MAX); past it the
 * land used to fade straight into the sky haze. Here a few square rings of ridgeline ribbons stand beyond the edge,
 * their tops taken from the same analytic landscape the terrain is sampled from (so a region's ranges carry on
 * outside the square: Mountain West peaks, rounded chaparral hills, a flat plains horizon), each one hazier than the
 * one in front. Every ring is world-fixed, so they shift against each other when the camera moves (parallax).
 *
 * One merged geometry, one draw call, ~2 triangles per 40 units of ridge. The shader colors a ridge as its rock /
 * forest tint lit by the sky, mixed toward `skyHorizonColor` (the sky dome's own horizon, sun glow included) by the
 * ring's haze, a fade down to the valley mist at its foot, and a distance fade, so it dissolves into the dome and
 * never shows a seam. Seasonal snow caps the highest crests in the regions that have a snow line.
 */
import * as THREE from 'three';
import { SKY_HORIZON_GLSL, skyHorizonUniforms } from '../sky/ProceduralSky';
import { TOWN_Y, type RegionKind, type RegionLook } from './regionalLandscape';
import { seasonState } from '../season/seasonState';
import type { Quality } from '../WorldScene';

export interface RidgeOptions {
  kind: RegionKind;
  look: RegionLook;
  /** World center of the modelled square and its half-size (R_MAX). */
  cx: number; cz: number; half: number;
  /** The analytic landscape height at any (x, z), also beyond the square. */
  height(x: number, z: number): number;
  quality: Quality;
}

/** Rings, segments and the haze of each ring (0 = full color, 1 = the sky) by quality. */
export function ridgePlan(q: Quality): { rings: number; seg: number } {
  return q === 'high' ? { rings: 4, seg: 480 } : q === 'medium' ? { rings: 3, seg: 360 } : { rings: 2, seg: 240 };
}

/** Haze of ring k of n: the nearest is already veiled, the farthest almost sky. */
export const ringHaze = (k: number, n: number): number => 0.38 + 0.5 * (n <= 1 ? 0 : k / (n - 1));

/** Extra relief the regions would carry beyond the square (units): large for the high ranges, tiny for a plains horizon. */
export function extraRelief(kind: RegionKind): number {
  switch (kind) {
    case 'mountain': return 95;
    case 'sound': return 70;
    case 'coast': return 55;
    case 'desert': return 42;
    case 'appalachia': case 'north_woods': case 'ozarks': return 30;
    case 'hill_country': case 'drumlin': return 22;
    case 'rust_belt': return 20;
    default: return 8;
  }
}

const hash1 = (n: number): number => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (t: number): number => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return hash1(i) * (1 - u) + hash1(i + 1) * u; };

/** Point on the square ring of Chebyshev radius D at parameter s in [0, 1). */
export function ringPoint(cx: number, cz: number, D: number, s: number): [number, number] {
  const t = s * 4, side = Math.floor(t) & 3, u = (t - Math.floor(t)) * 2 - 1;
  switch (side) {
    case 0: return [cx + D, cz + u * D];
    case 1: return [cx - u * D, cz + D];
    case 2: return [cx - D, cz - u * D];
    default: return [cx + u * D, cz - D];
  }
}

const VERT = /* glsl */`
attribute vec3 aRidge;   // x: 0 at the foot, 1 at the crest; y: ring haze; z: crest height above the datum for the snow cap
varying vec3 vWPos; varying vec3 vRidge;
void main() {
  vRidge = aRidge;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWPos = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = /* glsl */`
uniform vec3 uBody; uniform vec3 uBodyHi; uniform float uSnow; uniform float uSnowLine;
varying vec3 vWPos; varying vec3 vRidge;
${SKY_HORIZON_GLSL}
void main() {
  vec3 dir = normalize(vWPos - cameraPosition);
  vec3 sky = skyHorizonColor(dir);
  float lum = dot(sky, vec3(0.3, 0.55, 0.15));
  // lit by the sky: dark against a bright horizon at dusk, never black
  float lit = clamp(0.1 + lum * 0.85, 0.0, 1.0);
  vec3 body = mix(uBody, uBodyHi, smoothstep(0.35, 1.0, vRidge.x));
  float snow = uSnow * smoothstep(uSnowLine - 18.0, uSnowLine + 18.0, vRidge.z) * smoothstep(0.45, 0.9, vRidge.x);
  body = mix(body, vec3(0.86, 0.89, 0.93), snow * 0.9);
  body *= lit;
  float dist = length(vWPos - cameraPosition);
  float foot = 1.0 - smoothstep(0.0, 0.5, vRidge.x);
  float haze = clamp(vRidge.y + foot * 0.7 + smoothstep(1500.0, 2560.0, dist), 0.0, 1.0);
  gl_FragColor = vec4(mix(body, sky, haze), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class DistantRidges {
  private readonly _scene: THREE.Scene;
  private _mesh: THREE.Mesh | null = null;
  private _u: Record<string, THREE.IUniform> | null = null;
  private _snowLine = 1e9;
  private _snowWinter = 1e9;

  constructor(scene: THREE.Scene) { this._scene = scene; }
  get mesh(): THREE.Mesh | null { return this._mesh; }

  build(o: RidgeOptions): void {
    this.dispose();
    const { rings, seg } = ridgePlan(o.quality);
    const per = seg + 1;
    const pos = new Float32Array(rings * per * 2 * 3), att = new Float32Array(rings * per * 2 * 3);
    const idx: number[] = [];
    const relief = extraRelief(o.kind);
    const base = TOWN_Y - 40;
    for (let k = 0; k < rings; k++) {
      const D = o.half + 70 + k * 85;
      const haze = ringHaze(k, rings);
      for (let n = 0; n < per; n++) {
        const s = (n % seg) / seg;
        const [x, z] = ringPoint(o.cx, o.cz, D, s);
        // the landscape's own height here, a long-wave swell and a little per-ring crest noise, never below the datum
        const hh = o.height(x, z);
        const swell = vnoise(s * 9 + k * 17.3) * 0.65 + vnoise(s * 31 + k * 5.1) * 0.35;
        const crest = Math.max(0, hh - TOWN_Y) * (1.05 + 0.12 * k) + relief * (0.25 + 0.75 * swell) * (0.8 + 0.12 * k);
        const top = TOWN_Y + 4 + crest;
        const v = (k * per + n) * 2;
        pos.set([x, base, z], v * 3); pos.set([x, top, z], (v + 1) * 3);
        att.set([0, haze, 0], v * 3); att.set([1, haze, top], (v + 1) * 3);
        if (n < seg) { const a = v, b = v + 1, c = v + 2, d = v + 3; idx.push(a, c, b, b, c, d); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRidge', new THREE.BufferAttribute(att, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const body = new THREE.Color(o.look.rock).multiplyScalar(0.55).lerp(new THREE.Color(o.look.forest), 0.45 * o.look.evergreen + 0.2);
    const hi = new THREE.Color(o.look.rock).multiplyScalar(0.85);
    this._u = {
      uBody: { value: body }, uBodyHi: { value: hi }, uSnow: { value: 0 }, uSnowLine: { value: 1e9 },
    };
    const sky = skyHorizonUniforms() ?? {};
    const mat = new THREE.ShaderMaterial({ uniforms: { ...this._u, ...sky }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, fog: false, depthWrite: true });
    mat.customProgramCacheKey = () => 'distant_ridges_v1_' + (skyHorizonUniforms() ? '1' : '0');
    this._snowLine = Math.min(o.look.snowLine, 4000);
    this._snowWinter = Math.min(o.look.snowLineWinter, 4000);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'distant_ridges';
    mesh.userData = { type: 'distant_ridges', noSSAO: true };
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    this._scene.add(mesh);
    this._mesh = mesh;
    this.update();
  }

  /** Per frame: the snow line follows the season like the terrain's. */
  update(): void {
    const u = this._u;
    if (!u) return;
    const p = seasonState.params;
    u['uSnowLine'].value = this._snowLine + (this._snowWinter - this._snowLine) * p.cold;
    u['uSnow'].value = this._snowLine < 1e8 || this._snowWinter < 1e8 ? 1 : 0;
  }

  dispose(): void {
    if (this._mesh) {
      this._scene.remove(this._mesh);
      this._mesh.geometry.dispose();
      (this._mesh.material as THREE.Material).dispose();
      this._mesh = null;
    }
    this._u = null;
  }
}
