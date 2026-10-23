/**
 * waterShading — one water look for every water body in the scene (campus
 * lakes / rivers / PNW bay, the campus pond lot, regional rivers, lakes and
 * the Puget sound).
 *
 * `patchWaterMaterial()` turns a MeshStandardMaterial into water:
 *   • depth: shallow shelf → deep channel colour, the pebbly / sandy bed
 *     showing through the shallows, lighter toward the shore;
 *   • flow (optional flow texture from waterFlow.ts): ripples and foam
 *     streaks advected along the river (two-phase flow map, no stretching),
 *     riffles at bends / narrows, white water round mid-stream rocks;
 *   • still water: wind ripples with drifting cat's-paw gust patches and a
 *     lapping foam line at the waterline;
 *   • reflection: Schlick Fresnel over a live sky gradient (zenith / horizon
 *     from the light rig + fog), the far bank / trees darkening low rays near
 *     the shore, a sharp sun glitter path (long and orange at golden hour, a
 *     moon path at night) and vertical streak reflections of nearby campus
 *     lamps. On High the main campus water also samples a planar mirror
 *     render (PlanarReflection) for real reflections of buildings and trees.
 *   • rain drop rings (WeatherRenderer's global uWx patch).
 *
 * The per-frame inputs live in ONE shared uniform set (WATER_GLOBALS),
 * refreshed by updateWaterGlobals() from the scene's light rig.
 */
import * as THREE from 'three';
import { seasonIceGlsl } from '../season/seasonShader';

export const MAX_WATER_LAMPS = 12;

/** Shared per-frame uniforms (plain objects so cloned uniforms keep the reference). */
export const WATER_GLOBALS = {
  uWTime:    { value: 0 },
  uSkyTop:   { value: new THREE.Color(0.25, 0.35, 0.5) },
  uSkyHor:   { value: new THREE.Color(0.45, 0.5, 0.55) },
  /** Key light direction (toward the sun by day, the moon by night). */
  uSunDir:   { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
  /** Key light colour × glint strength (HDR). */
  uSunCol:   { value: new THREE.Color(1, 1, 1) },
  /** 0 = day … 1 = night. */
  uWNight:   { value: 0 },
  /** Wind (world units / s) drifting the ripples on still water. */
  uWind:     { value: new THREE.Vector2(0.11, 0.06) },
  uRipple:   { value: null as THREE.Texture | null },
  uLampPos:  { value: Array.from({ length: MAX_WATER_LAMPS }, () => new THREE.Vector3(0, -1e4, 0)) },
  uLampN:    { value: 0 },
  uLampCol:  { value: new THREE.Color(1.0, 0.72, 0.42) },
};

export interface WaterLook {
  shallow: THREE.Color;
  deep: THREE.Color;
  /** Bed visibility in the shallows 0..1 (clear pond ≈ 0.8, silty river ≈ 0.35). */
  clarity: number;
  /** Bed tint (sand / pebbles / mud). */
  bed: THREE.Color;
}

export const WATER_LOOKS = {
  campus: { shallow: new THREE.Color(0.026, 0.052, 0.044), deep: new THREE.Color(0.010, 0.034, 0.056), clarity: 0.5, bed: new THREE.Color(0.30, 0.26, 0.19) },
  pond:   { shallow: new THREE.Color(0.055, 0.092, 0.070), deep: new THREE.Color(0.014, 0.046, 0.058), clarity: 0.75, bed: new THREE.Color(0.27, 0.23, 0.16) },
  river:  { shallow: new THREE.Color(0.075, 0.092, 0.070), deep: new THREE.Color(0.016, 0.046, 0.060), clarity: 0.45, bed: new THREE.Color(0.32, 0.29, 0.22) },
  bayou:  { shallow: new THREE.Color(0.075, 0.080, 0.045), deep: new THREE.Color(0.030, 0.042, 0.030), clarity: 0.15, bed: new THREE.Color(0.22, 0.19, 0.12) },
  sound:  { shallow: new THREE.Color(0.050, 0.090, 0.090), deep: new THREE.Color(0.010, 0.036, 0.060), clarity: 0.4, bed: new THREE.Color(0.30, 0.28, 0.22) },
} satisfies Record<string, WaterLook>;

export interface WaterPatchOptions {
  /** Program cache key (one per distinct GLSL variant). */
  key: string;
  look: WaterLook;
  /**
   * GLSL (fragment) that sets `float wDepth` (0 shore … 1 deep), `float wEdge`
   * (1 at the waterline … 0 a little way out) and may `discard`. Has vWPos
   * (world position) and anything declared in `pars`.
   */
  depthGLSL: string;
  /** Extra fragment declarations (uniforms, functions). */
  pars?: string;
  /** Extra vertex attribute(s) forwarded as varyings: name → GLSL type ('float'). */
  attributes?: Record<string, 'float'>;
  uniforms?: Record<string, THREE.IUniform>;
  /** Flow texture (waterFlow.encodeFlow) over a world rect: x0, z0, 1/w, 1/h. */
  flow?: { tex: { value: THREE.Texture | null }; rect: { value: THREE.Vector4 }; scale: { value: number } };
  /** Planar mirror (High tier, campus water). */
  reflection?: PlanarReflection;
  /** Ripple scale multiplier (big regional water reads calmer at range). */
  rippleScale?: number;
  /** Fade ripple / glitter detail out between these camera distances. */
  detailFade?: [number, number];
}

const COMMON_PARS = /* glsl */`
varying vec3 vWPos;
uniform float uWTime;
uniform vec3 uSkyTop;
uniform vec3 uSkyHor;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uWNight;
uniform vec2 uWind;
uniform sampler2D uRipple;
uniform vec3 uLampPos[${MAX_WATER_LAMPS}];
uniform int uLampN;
uniform vec3 uLampCol;
uniform vec3 uWShallow;
uniform vec3 uWDeep;
uniform vec3 uWBed;
uniform float uWClarity;
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Pebble bed: jittered cells, rounded stones with darker gaps
vec3 wPebbles(vec2 p) {
  vec2 c = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0; vec2 id = c;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = vec2(wHash(c + g), wHash(c + g + 17.3)) * 0.8 + 0.1;
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; id = c + g; } else if (d < d2) d2 = d;
  }
  float gap = smoothstep(0.02, 0.14, d2 - d1);
  float h = wHash(id * 1.7);
  return vec3(0.55 + 0.6 * h, 0.52 + 0.55 * h, 0.48 + 0.5 * wHash(id + 3.1)) * (0.45 + 0.55 * gap);
}
`;

/**
 * Fragment pieces. Variables shared between the injection points are
 * declared at the top of main() via the map_fragment replacement (which runs
 * before normal and output), so they stay in scope.
 */
function colorGLSL(o: WaterPatchOptions): string {
  return /* glsl */`
  float wDepth = 0.5;
  float wEdge = 0.0;
  ${o.depthGLSL}
  vec2 wp = vWPos.xz;
  float wCamD = length(cameraPosition - vWPos);
  float wDetail = 1.0 - smoothstep(${(o.detailFade?.[0] ?? 40).toFixed(1)}, ${(o.detailFade?.[1] ?? 160).toFixed(1)}, wCamD);
  vec2 wVel = vec2(0.0);
  float wFoamB = 0.0;
  float wRiver = 0.0;
#ifdef WATER_FLOW
  {
    vec4 fl = texture2D(uFlowTex, (wp - uFlowRect.xy) * uFlowRect.zw);
    wVel = (fl.rg * 2.0 - 1.0) * uFlowScale;
    wFoamB = fl.b;
    wRiver = fl.a;
  }
#endif
  float wSpeed = length(wVel);
  // Two-phase flow-map clock (no texture stretching however long it runs)
  const float W_PERIOD = 6.0;
  float wPh0 = fract(uWTime / W_PERIOD);
  float wPh1 = fract(uWTime / W_PERIOD + 0.5);
  float wBl = abs(wPh0 * 2.0 - 1.0);           // weight of phase 1
  vec2 wOff0 = wVel * wPh0 * W_PERIOD;
  vec2 wOff1 = wVel * wPh1 * W_PERIOD;

  // ── Body colour: shallows lighter / greener with the bed showing, deep channel dark
  float wShelf = 1.0 - wDepth;
  vec3 wCol = mix(uWShallow, uWDeep, smoothstep(0.0, 0.85, wDepth));
  // bed: soft silt / sand (low-contrast mottling, no cell pattern); small
  // pebbles (≈ 10–15 cm) only in a thin band right at the bank and only up
  // close — a large cell size read as paving flagstones under the water
  float wSilt = wNoise(wp * 1.3 + 2.7) * 0.6 + wNoise(wp * 4.1) * 0.4;
  vec3 wBedC = uWBed * (0.82 + 0.3 * wSilt);
  float wPebK = 0.35 * smoothstep(0.82, 0.97, wShelf) * (1.0 - smoothstep(6.0, 18.0, wCamD));
  if (wPebK > 0.001) wBedC = mix(wBedC, uWBed * (0.7 + 0.3 * wPebbles(wp * 42.0 + vec2(wNoise(wp * 7.0) * 0.6))), wPebK);
  // the bed shows only in the first metre or so, then the water goes opaque
  float wSee = uWClarity * pow(smoothstep(0.45, 1.0, wShelf), 2.5) * (1.0 - 0.6 * wRiver * smoothstep(0.1, 0.4, wSpeed));
  wCol = mix(wCol, wBedC * 0.4, wSee * 0.5);   // (r9: a dark, peaty margin — a bright bed read as an icy rim)

  // ── Foam: lapping line at the waterline (still water), riffles + rock wakes (rivers)
  float wFoam = 0.0;
  {
    float lap = 0.5 + 0.5 * sin(uWTime * 1.3 + wNoise(wp * 0.8) * 6.2831 + (wp.x * 0.6 + wp.y * 0.9));
    float edgeN = wNoise(wp * 5.0 + uWTime * vec2(0.15, -0.1));
    // a thin broken line right at the waterline — a wide band turned whole
    // narrow ponds / channels (all 'edge') into a pale grey sheet like ice
    float band = smoothstep(0.8, 1.0, wEdge) * (0.35 + 0.65 * lap);
    wFoam = band * smoothstep(0.45, 0.85, edgeN + 0.25 * lap) * 0.3;
  }
#ifdef WATER_FLOW
  if (wRiver > 0.01) {
    // streaks stretched along the current, advected with it
    vec2 d = wSpeed > 1e-4 ? wVel / wSpeed : vec2(1.0, 0.0);
    mat2 toF = mat2(d.x, -d.y, d.y, d.x);   // world → (along, across)
    vec2 q0 = toF * (wp - wOff0), q1 = toF * (wp - wOff1);
    float s0 = wNoise(vec2(q0.x * 0.9, q0.y * 3.6)) * 0.6 + wNoise(vec2(q0.x * 2.1, q0.y * 7.0)) * 0.4;
    float s1 = wNoise(vec2(q1.x * 0.9, q1.y * 3.6) + 7.7) * 0.6 + wNoise(vec2(q1.x * 2.1, q1.y * 7.0) + 3.1) * 0.4;
    float sn = mix(s0, s1, wBl);
    float riff = smoothstep(0.9 - wFoamB * 0.4, 1.05 - wFoamB * 0.3, sn) * smoothstep(0.05, 0.4, wFoamB) * 0.75;
    // fine bubbly trails everywhere the current runs
    float trail = smoothstep(0.78, 0.98, sn) * smoothstep(0.05, 0.3, wSpeed) * 0.35;
    // shore eddies: the current breaks along the banks
    float bankFoam = smoothstep(0.6, 1.0, wEdge) * smoothstep(0.05, 0.35, wSpeed) * smoothstep(0.62, 0.9, sn) * 0.6;
    wFoam = max(wFoam * (1.0 - wRiver), max(riff, max(trail, bankFoam)) * wRiver);
  }
#endif
  wFoam *= mix(0.4, 1.0, wDetail);
  diffuseColor.rgb = mix(wCol, vec3(0.62, 0.65, 0.64), clamp(wFoam, 0.0, 0.85));
  `;
}

function normalGLSL(o: WaterPatchOptions): string {
  const s = (o.rippleScale ?? 1).toFixed(3);
  return /* glsl */`
  float wRing = 0.0;
  vec3 wNw = vec3(0.0, 1.0, 0.0);
  {
    float fw = fwidth(wp.x);
    // still water: two wind layers + gusts (cat's paws) roughening patches
    vec2 w1 = wp * 0.045 * ${s} - uWind * uWTime * 0.05;
    vec2 w2 = mat2(0.6, -0.8, 0.8, 0.6) * wp * 0.11 * ${s} - vec2(uWind.y, -uWind.x) * uWTime * 0.11 - uWind * uWTime * 0.06;
    vec3 n1 = texture2D(uRipple, w1).xyz * 2.0 - 1.0;
    vec3 n2 = texture2D(uRipple, w2).xyz * 2.0 - 1.0;
    float gust = smoothstep(0.35, 0.8, wNoise(wp * 0.035 - uWind * uWTime * 0.08) * 0.7 + wNoise(wp * 0.09 + uWTime * 0.03) * 0.3);
    vec2 sl = (n1.xy + n2.xy * 0.75) * (0.16 + 0.22 * gust);
#ifdef WATER_FLOW
    if (wRiver > 0.01) {
      vec2 f0 = wp - wOff0, f1 = wp - wOff1;
      vec3 a0 = texture2D(uRipple, f0 * 0.16 * ${s}).xyz * 2.0 - 1.0;
      vec3 a1 = texture2D(uRipple, f1 * 0.16 * ${s} + 0.37).xyz * 2.0 - 1.0;
      vec3 b0 = texture2D(uRipple, f0 * 0.39 * ${s} + 0.21).xyz * 2.0 - 1.0;
      vec3 b1 = texture2D(uRipple, f1 * 0.39 * ${s} + 0.63).xyz * 2.0 - 1.0;
      vec2 fsl = mix(a0.xy + b0.xy * 0.6, a1.xy + b1.xy * 0.6, wBl);
      float rough = 0.2 + 0.5 * smoothstep(0.05, 0.4, wSpeed) + 0.5 * wFoamB;
      sl = mix(sl, fsl * rough, wRiver);
    }
#endif
    // calm toward the bank and with distance (no glitter aliasing)
    sl *= (1.0 - wEdge * 0.5) / (1.0 + fw * 5.0);
#ifdef STANDARD
    if (uWx.z > 0.01) {
      vec2 rC = wp / 0.38;
      vec2 rI = floor(rC);
      vec2 rF = fract(rC) - 0.5 - (vec2(wxHash(rI + 3.1), wxHash(rI + 7.7)) - 0.5) * 0.5;
      float rT = fract(uWx.w * 1.1 + wxHash(rI));
      float rR = length(rF);
      float ring = smoothstep(0.07, 0.0, abs(rR - rT * 0.42)) * (1.0 - rT)
                 * step(wxHash(rI + 1.9), uWx.z * 0.65) / (1.0 + fw * 12.0);
      sl += normalize(rF + 1e-4) * ring * 0.6;
      wRing = ring;
      sl *= 1.0 + uWx.z * 0.6;
    }
#endif
    wNw = normalize(vec3(sl.x, 1.0, sl.y));
    normal = normalize((viewMatrix * vec4(wNw, 0.0)).xyz);
  }
  `;
}

function outGLSL(): string {
  return /* glsl */`
  {
    vec3 Vw = normalize(cameraPosition - vWPos);
    // Fresnel from the mean surface (ripple normals only bend the reflected ray)
    float cosT = clamp(Vw.y, 0.0, 1.0);
    float F = clamp(0.02 + 0.98 * pow(1.0 - cosT, 5.0), 0.06, 0.88);
    F *= 1.0 - wEdge * 0.35;
    vec3 Rw = reflect(-Vw, normalize(mix(vec3(0.0, 1.0, 0.0), wNw, 0.45)));
    float ry = clamp(Rw.y, 0.0, 1.0);
    vec3 bankRefl = uSkyHor * vec3(0.26, 0.34, 0.24);
    vec3 sky = Rw.y >= 0.0
      ? mix(uSkyHor, uSkyTop, 0.35 + 0.65 * pow(ry, 0.45))
      : mix(uSkyHor, bankRefl, smoothstep(0.0, 0.12, -Rw.y));
    // warm glow of a low sun on the horizon behind the reflection
    vec3 sunH = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-4);
    float lowSun = (1.0 - uWNight) * (1.0 - smoothstep(0.12, 0.45, uSunDir.y));
    sky += uSunCol * 0.05 * lowSun * pow(max(dot(normalize(vec3(Rw.x, 0.0, Rw.z) + 1e-4), sunH), 0.0), 6.0) * (1.0 - smoothstep(0.0, 0.5, ry));
    // near the bank low reflected rays meet trees and grass, not sky
    float bank = (1.0 - smoothstep(0.0, 0.45, wDepth)) * (1.0 - smoothstep(0.05, 0.35, ry));
    sky = mix(sky, bankRefl, bank * 0.75);
#ifdef WATER_MIRROR
    {
      vec4 rc = uReflMat * vec4(vWPos + vec3(wNw.x, 0.0, wNw.z) * 0.9, 1.0);
      vec2 ruv = rc.xy / rc.w;
      float inside = step(0.0, ruv.x) * step(ruv.x, 1.0) * step(0.0, ruv.y) * step(ruv.y, 1.0);
      vec3 mirror = texture2D(uReflTex, clamp(ruv, 0.001, 0.999)).rgb;
      // a real surface loses some light; keep a low-sun sky from blowing out to a white sheet
      mirror = min(mirror * 0.85, vec3(1.25));
      float k = uReflOn * inside * wDetail * (1.0 - smoothstep(0.85, 1.0, max(abs(ruv.x - 0.5), abs(ruv.y - 0.5)) * 2.0));
      sky = mix(sky, mirror, k * 0.92);
    }
#endif
    vec3 body = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
    // water scatters blue-green whatever the light colour
    float bodyL = dot(body, vec3(0.2126, 0.7152, 0.0722));
    // (r9: less on the shallow shelf — there the green-brown of the shallows
    // and the bed show; a blue-grey wash over the bright shelf read as ice)
    body = mix(body, bodyL * vec3(0.42, 1.08, 1.12), 0.5 * (1.0 - wSee) * (1.0 - wFoam) * (0.35 + 0.65 * smoothstep(0.0, 0.55, wDepth)));
    // Sun / moon glitter path: sharp lobe on the full ripple normal, sparkling
    vec3 Rf = reflect(-Vw, wNw);
    float g = max(dot(Rf, normalize(uSunDir)), 0.0);
    float sparkle = 0.55 + 0.45 * sin(dot(wp, vec2(13.1, 17.7)) + uWTime * 3.7);
    // glitter: only facets aimed at the sun (sparse sparkles), never a sheet
    float facet = step(0.62, wHash(floor(wp * 9.0) + floor(uWTime * 6.0)));
    float glint = (pow(g, 2400.0) * 4.0 * (0.3 + 0.7 * facet) + pow(g, 400.0) * 0.06) * sparkle * wDetail;
    glint *= smoothstep(-0.02, 0.06, uSunDir.y) * (1.0 - wFoam);
    vec3 spec = min(uSunCol * glint, vec3(3.0));
    // Lamp reflections: vertical streaks under each lamp's mirror image
    vec3 lamps = vec3(0.0);
    if (uWNight > 0.05) {
      vec3 a = normalize(vWPos - cameraPosition + vec3(wNw.x, 0.0, wNw.z) * wCamD * 0.025);
      for (int i = 0; i < ${MAX_WATER_LAMPS}; i++) {
        if (i >= uLampN) break;
        vec3 L = uLampPos[i];
        vec3 Lm = vec3(L.x, 2.0 * vWPos.y - L.y, L.z);
        vec3 b = normalize(Lm - cameraPosition);
        vec3 rt = normalize(cross(b, vec3(0.0, 1.0, 0.0)));
        vec3 up = cross(rt, b);
        float dh = dot(a, rt), dv = dot(a, up);
        float dd = length(Lm - cameraPosition);
        float sh = 0.10 / dd + 0.004, sv = 0.55 / dd + 0.012;
        lamps += exp(-(dh * dh) / (sh * sh) - (dv * dv) / (sv * sv)) * step(0.0, dot(a, b));
      }
      lamps *= uLampCol * 1.6 * uWNight * (1.0 - wFoam) * F * 2.2;
    }
    float Fr = F * (1.0 - wFoam);
    sky = min(sky, vec3(1.25));
    outgoingLight = body * (1.0 - Fr) + sky * Fr + spec + lamps + totalEmissiveRadiance;
    outgoingLight += mix(uSkyHor, uSkyTop, 0.5) * wRing * 0.22;
  }
  `;
}

/** Turn a MeshStandardMaterial into water (see the module comment). */
export function patchWaterMaterial(mat: THREE.MeshStandardMaterial, o: WaterPatchOptions): void {
  mat.envMapIntensity = 0;
  mat.metalness = 0;
  mat.roughness = 0.2;
  if (!WATER_GLOBALS.uRipple.value) WATER_GLOBALS.uRipple.value = getRippleNormalMap();
  const local: Record<string, THREE.IUniform> = {
    uWShallow: { value: o.look.shallow },
    uWDeep: { value: o.look.deep },
    uWBed: { value: o.look.bed },
    uWClarity: { value: o.look.clarity },
    ...(o.uniforms ?? {}),
  };
  if (o.flow) Object.assign(local, { uFlowTex: o.flow.tex, uFlowRect: o.flow.rect, uFlowScale: o.flow.scale });
  if (o.reflection) Object.assign(local, o.reflection.uniforms);
  const defs: Record<string, string> = {};
  if (o.flow) defs['WATER_FLOW'] = '';
  if (o.reflection) defs['WATER_MIRROR'] = '';
  mat.defines = { ...(mat.defines ?? {}), ...defs };
  const attrs = o.attributes ?? {};
  const attrDecl = Object.entries(attrs).map(([n, t]) => `attribute ${t} ${n};\nvarying ${t} v_${n};`).join('\n');
  const attrVary = Object.keys(attrs).map(n => `v_${n} = ${n};`).join('\n');
  const attrFrag = Object.entries(attrs).map(([n, t]) => `varying ${t} v_${n};`).join('\n');
  const flowPars = o.flow ? 'uniform sampler2D uFlowTex;\nuniform vec4 uFlowRect;\nuniform float uFlowScale;' : '';
  const mirrorPars = o.reflection ? 'uniform sampler2D uReflTex;\nuniform mat4 uReflMat;\nuniform float uReflOn;' : '';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, WATER_GLOBALS, local);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${attrDecl}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n${attrVary}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON_PARS}\n${flowPars}\n${mirrorPars}\n${attrFrag}\n${o.pars ?? ''}`)
      .replace('#include <map_fragment>', colorGLSL(o))
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + normalGLSL(o))
      // Seasons: ponds / lakes / slow rivers freeze in cold winters; the
      // fast, deep river channel stays a dark open lead
      .replace('#include <opaque_fragment>', outGLSL()
        + seasonIceGlsl('vWPos', 'smoothstep(0.12, 0.4, wSpeed) * smoothstep(0.3, 0.75, wDepth) * wRiver')
        + '\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'water-v2-' + o.key + (o.flow ? '-f' : '') + (o.reflection ? '-m' : '');
}

// ── Per-frame globals ────────────────────────────────────────────────────────

const _tmpC = new THREE.Color();
const _tmpV = new THREE.Vector3();
let _hemi: THREE.HemisphereLight | null = null;
let _key: THREE.DirectionalLight | null = null;
let _lastScene: THREE.Scene | null = null;

/**
 * Refresh the shared water uniforms from the live light rig: reflected sky
 * from the hemisphere light (cooled at golden hour — the zenith stays blue)
 * and the horizon fog, the glint light from the shadow-casting key light
 * (sun by day, moon by night).
 */
export function updateWaterGlobals(scene: THREE.Scene, timeSec: number): void {
  const G = WATER_GLOBALS;
  G.uWTime.value = timeSec % 3600;
  if (_lastScene !== scene || !_hemi || _hemi.parent === null || !_key || _key.parent === null) {
    _lastScene = scene;
    _hemi = null; _key = null;
    scene.traverse(o => {
      if (!_hemi && (o as THREE.HemisphereLight).isHemisphereLight) _hemi = o as THREE.HemisphereLight;
      if (!_key && (o as THREE.DirectionalLight).isDirectionalLight && o.castShadow) _key = o as THREE.DirectionalLight;
    });
  }
  const top = G.uSkyTop.value, hor = G.uSkyHor.value;
  const hemi = _hemi as THREE.HemisphereLight | null;
  let dayF = 1;
  if (hemi) {
    // Day ≈ 1.15, night ≈ 0.55 (CampusScene.LIGHT) → 0..1 daylight factor
    dayF = Math.min(1, Math.max(0, (hemi.intensity - 0.55) / 0.6));
    const k = hemi.intensity * (0.08 + 0.92 * dayF);
    top.copy(hemi.color).multiplyScalar(k);
    const fog = scene.fog as THREE.FogExp2 | null;
    const bg = scene.background;
    if (fog) hor.copy(fog.color);
    else if (bg instanceof THREE.Color) hor.copy(bg);
    else hor.copy(hemi.color);
    hor.multiplyScalar(0.12 + 0.98 * dayF);
    const lum = top.r * 0.2126 + top.g * 0.7152 + top.b * 0.0722;
    const warm = Math.max(0, Math.min(1, (top.r - top.b) / Math.max(1e-3, lum) * 1.5));
    top.lerp(_tmpC.setRGB(lum * 0.62, lum * 0.95, lum * 1.45), 0.75 * warm);
  }
  G.uWNight.value = 1 - dayF;
  const key = _key as THREE.DirectionalLight | null;
  if (key) {
    _tmpV.copy(key.position).sub(key.target.position).normalize();
    G.uSunDir.value.copy(_tmpV);
    // HDR glint: bright sun sparkle by day, a softer silver moon path at night
    const k = dayF > 0.5 ? 2.2 : 3.2;
    G.uSunCol.value.copy(key.color).multiplyScalar(key.intensity * k);
  }
}

/** Campus lamp heads whose reflections the water shows (nearest to water first; ≤ MAX_WATER_LAMPS). */
export function setWaterLamps(lamps: ReadonlyArray<{ x: number; y: number; z: number }>): void {
  const arr = WATER_GLOBALS.uLampPos.value;
  const n = Math.min(MAX_WATER_LAMPS, lamps.length);
  for (let i = 0; i < MAX_WATER_LAMPS; i++) {
    if (i < n) arr[i].set(lamps[i].x, lamps[i].y, lamps[i].z);
    else arr[i].set(0, -1e4, 0);
  }
  WATER_GLOBALS.uLampN.value = n;
}

// ── Ripple normal map ────────────────────────────────────────────────────────

let _rippleTex: THREE.DataTexture | null = null;

/**
 * Tileable procedural ripple normal map (built once, shared). Height field
 * is a sum of ~24 sine waves with random integer wave-vectors (so it tiles
 * seamlessly) and a 1/|k| spectrum, which looks like irregular wind chop
 * rather than the regular diamond pattern a few waves produce.
 */
export function getRippleNormalMap(): THREE.DataTexture {
  if (_rippleTex) return _rippleTex;
  const N = 256;
  const TAU = Math.PI * 2;
  let seed = 4242;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const waves: Array<{ kx: number; ky: number; a: number; p: number }> = [];
  while (waves.length < 24) {
    const kx = Math.round((rnd() - 0.5) * 18);
    const ky = Math.round((rnd() - 0.5) * 18);
    const km = Math.hypot(kx, ky);
    if (km < 2) continue;
    waves.push({ kx, ky, a: 1 / Math.pow(km, 1.3), p: rnd() * TAU });
  }
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      let dx = 0, dy = 0;
      for (const w of waves) {
        const c = Math.cos(TAU * (w.kx * u + w.ky * v) + w.p) * w.a;
        dx += c * w.kx;
        dy += c * w.ky;
      }
      const nx = -dx * 0.16, ny = -dy * 0.16, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * N + x) * 4;
      data[i]     = Math.round((nx / len * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  _rippleTex = tex;
  return tex;
}

// ── Planar mirror (High tier) ────────────────────────────────────────────────

/**
 * A reduced-resolution planar mirror render of the scene about a horizontal
 * water plane (oblique near-plane clipping, as three's Reflector), sampled by
 * the water shader with a ripple-distorted projective lookup. Rendered
 * explicitly once per (every other) frame before the main render — never
 * from inside it — so the instanced-LOD culling hooks see the real camera
 * last. Skipped when the water is off screen or the camera is below it.
 */
export class PlanarReflection {
  readonly uniforms = {
    uReflTex: { value: null as THREE.Texture | null },
    uReflMat: { value: new THREE.Matrix4() },
    uReflOn: { value: 0 },
  };
  private _rt: THREE.WebGLRenderTarget | null = null;
  private readonly _cam = new THREE.PerspectiveCamera();
  private readonly _plane = new THREE.Plane();
  private readonly _clip = new THREE.Vector4();
  private readonly _q = new THREE.Vector4();
  private readonly _v = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), s: new THREE.Vector2(), n: new THREE.Vector3(0, 1, 0) };
  private readonly _rot = new THREE.Matrix4();
  private readonly _frustum = new THREE.Frustum();
  private readonly _pv = new THREE.Matrix4();
  private _frame = 0;
  enabled = false;
  /** Fraction of the drawing buffer resolution. */
  scale = 0.4;

  /**
   * Render the mirror for water at height `y` covering `bounds` (world box).
   * Call once per animation frame before the main scene render.
   */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, y: number, bounds: THREE.Box3 | null, hide: THREE.Object3D[]): void {
    const U = this.uniforms;
    if (!this.enabled || !bounds) { U.uReflOn.value = 0; return; }
    camera.updateMatrixWorld();
    const camPos = this._v.a.setFromMatrixPosition(camera.matrixWorld);
    if (camPos.y <= y + 0.05) { U.uReflOn.value = 0; return; }
    this._pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._pv);
    if (!this._frustum.intersectsBox(bounds)) { U.uReflOn.value = 0; return; }
    U.uReflOn.value = 1;
    if ((this._frame++ & 1) === 1 && this._rt) return;   // every other frame

    const size = renderer.getDrawingBufferSize(this._v.s);
    const w = Math.max(64, Math.floor(size.x * this.scale)), h = Math.max(64, Math.floor(size.y * this.scale));
    if (!this._rt) {
      this._rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
      this._rt.texture.generateMipmaps = false;
      U.uReflTex.value = this._rt.texture;
    } else if (this._rt.width !== w || this._rt.height !== h) this._rt.setSize(w, h);

    const n = this._v.n;
    const p0 = this._v.b.set(camPos.x, y, camPos.z);
    // Mirrored camera
    const view = this._v.c.copy(p0).sub(camPos).reflect(n).negate().add(p0);
    this._rot.extractRotation(camera.matrixWorld);
    const look = this._v.d.set(0, 0, -1).applyMatrix4(this._rot).add(camPos);
    const target = look.subVectors(p0, look).reflect(n).negate().add(p0);   // reuses _v.d
    const vc = this._cam;
    vc.position.copy(view);
    vc.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(n);
    vc.lookAt(target);
    vc.far = camera.far; vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    // texture matrix: clip → [0,1] uv
    U.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    // Oblique near plane = the water plane (nothing below it is mirrored)
    this._plane.setFromNormalAndCoplanarPoint(n, p0).applyMatrix4(vc.matrixWorldInverse);
    const cp = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const e = vc.projectionMatrix.elements;
    const q = this._q;
    q.x = (Math.sign(cp.x) + e[8]) / e[0];
    q.y = (Math.sign(cp.y) + e[9]) / e[5];
    q.z = -1;
    q.w = (1 + e[10]) / e[14];
    cp.multiplyScalar(2 / cp.dot(q));
    e[2] = cp.x; e[6] = cp.y; e[10] = cp.z + 1 - 0.003; e[14] = cp.w;

    const vis = hide.map(o => o.visible);
    hide.forEach(o => { o.visible = false; });
    const prevRT = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate, prevNeeds = renderer.shadowMap.needsUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = false;
    renderer.setRenderTarget(this._rt);
    renderer.state.buffers.depth.setMask(true);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevRT);
    renderer.shadowMap.autoUpdate = prevShadow;
    renderer.shadowMap.needsUpdate = prevNeeds;
    hide.forEach((o, i) => { o.visible = vis[i]; });
  }

  dispose(): void {
    this._rt?.dispose();
    this._rt = null;
    this.uniforms.uReflTex.value = null;
    this.uniforms.uReflOn.value = 0;
  }
}
