/**
 * animalMaterial — one MeshStandardMaterial per animal model whose vertex shader poses the skeleton (walk, graze, peck, sway, tail
 * flick, all from a handful of per-instance numbers) and whose fragment shader paints the breed coat (Holstein patches, Hereford
 * face, barred hen, pig belt, wool) and a fur / wool / feather bump from 3-D noise in the rest pose. No textures, no CPU work per
 * frame beyond the instance attributes. See animalKit.ts for the vertex attributes.
 */
import * as THREE from 'three';
import type { V3 } from './animalKit';
import { BONE_COUNT } from './animalKit';

/** Per-bone animation (angles in radians; positive swings hanging parts forward / pitches a forward part up). */
export interface BoneAnim {
  /** Rest-pose pivot (metres), parent bone (-1: root). */
  pivot: V3; parent: number;
  /** Rest bias, gait swing amplitude, gait phase offset, flex amplitude (max(0, cos) part of the cycle). */
  bias?: number; swing?: number; off?: number; flex?: number;
  /** Bias when grazing / pecking (blended by the graze amount). */
  graze?: number;
  /** Idle sway: amplitude, frequency (rad/s), phase spread per bone. */
  idle?: number; idleFreq?: number; idlePh?: number;
  /** 0: pitch (about x), 1: roll (about z), 2: yaw (about y). */
  axis?: 0 | 1 | 2;
  /** Fast bob amplitude while grazing (a peck, a chew). */
  bob?: number;
  /** Pulse the idle motion (an ear twitch, a tail flick) instead of a smooth sway. */
  pulse?: boolean;
}

/** One coat. Colours are linear-ish sRGB triples in 0..1. */
export interface Breed {
  name: string;
  base: V3;
  /** 0 solid, 1 blotches, 2 bars, 3 belt, 4 spots, 5 saddle, 6 speckle. */
  style: number;
  patch?: V3; cover?: number; scale?: number;
  face?: V3; faceMix?: number;
  leg?: V3; legMix?: number;
  belly?: V3; bellyMix?: number; bellyY?: number;
  /** Belt centre (z, metres) and half-width; for style 5 the saddle. */
  belt?: [number, number];
  /** Muzzle / nose colour. */
  nose?: V3;
  /** Fur bump strength and frequency (per metre). */
  fur?: number; furFreq?: number;
  /** Curly fleece (0..1): clumpy locks in the shader, shaded between the clumps. */
  wool?: number;
  /** Overlapping body feathers (0..1): rows of rounded scales shaded and bumped. */
  feather?: number;
  /** Instance scale for this breed (a Jersey is smaller than a Holstein). */
  size?: number;
}

export const BREEDS_MAX = 4;
const PER = 8;

export interface AnimalMaterialSpec {
  bones: ReadonlyArray<BoneAnim | undefined>;
  breeds: readonly Breed[];
  /** Root bob (m) and pitch (rad) per unit gait, hop mode (bob = max(0, sin) instead of |sin|), centre of rotation y, z. */
  root: { bob: number; pitch: number; hop: boolean; cy: number; cz: number; grazePitch?: number };
  grazeFreq: number;
  /** Shader cache key. */
  key: string;
}

export const ANIM_ATTRS = { coat: 'iCoat', anim: 'iAnim' } as const;

const VERT_PARS = /* glsl */`
#define NB ${BONE_COUNT}
uniform vec4 uBP[NB];
uniform vec4 uA0[NB];
uniform vec4 uA1[NB];
uniform vec4 uA2[NB];
uniform vec4 uRoot;
uniform vec2 uRootC;
uniform float uTime;
uniform float uGrazeFreq;
attribute vec3 aSkin;
attribute vec2 aMark;
attribute vec4 iAnim;
attribute vec4 iCoat;
varying vec3 vRest;
varying vec2 vMark;
varying vec4 vCoat;
vec3 aRot(vec3 v, float a, int ax) {
  float c = cos(a), s = sin(a);
  if (ax == 0) return vec3(v.x, v.y * c + v.z * s, -v.y * s + v.z * c);
  if (ax == 1) return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
  return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
}
float boneAngle(int b) {
  vec4 a0 = uA0[b], a1 = uA1[b], a2 = uA2[b];
  float ph = iAnim.x + a0.z, g = iAnim.y, gr = iAnim.z, seed = iAnim.w;
  float a = a0.x + g * (a0.y * sin(ph) + a0.w * max(0.0, cos(ph)));
  a += gr * a1.x;
  float s = sin(uTime * a1.z + seed * 6.2831 * a1.w + seed * 11.0);
  if (a2.z > 0.5) s = sign(s) * pow(abs(s), 9.0);
  a += a1.y * s * (1.0 - 0.8 * g);
  a += gr * a2.y * sin(uTime * uGrazeFreq + seed * 7.0 + a1.w * 3.0);
  return a;
}
void skinChain(inout vec3 p, inout vec3 n, int b) {
  for (int i = 0; i < 6; i++) {
    if (b < 0) break;
    vec4 bp = uBP[b];
    float a = boneAngle(b);
    int ax = int(uA2[b].x + 0.5);
    p = aRot(p - bp.xyz, a, ax) + bp.xyz;
    n = aRot(n, a, ax);
    b = int(bp.w + 0.5);
  }
}
`;

const NORMAL_BEGIN = /* glsl */`
vec3 objectNormal = vec3(normal);
vec3 skPos = position;
{
  vec3 pA = position, nA = objectNormal;
  skinChain(pA, nA, int(aSkin.x + 0.5));
  if (aSkin.z > 0.001) {
    vec3 pB = position, nB = objectNormal;
    skinChain(pB, nB, int(aSkin.y + 0.5));
    pA = mix(pA, pB, aSkin.z); nA = normalize(mix(nA, nB, aSkin.z));
  }
  // body bob and pitch while moving (a hop for a rabbit)
  float rph = iAnim.x * 2.0, g = iAnim.y;
  float bob = uRoot.w > 0.5 ? max(0.0, sin(iAnim.x)) : abs(sin(rph * 0.5));
  float rp = uRoot.y * g * cos(iAnim.x * (uRoot.w > 0.5 ? 1.0 : 2.0)) + iAnim.z * uRoot.z;
  vec3 q = pA - vec3(0.0, uRootC.x, uRootC.y);
  q = aRot(q, rp, 0);
  pA = q + vec3(0.0, uRootC.x + uRoot.x * g * bob, uRootC.y);
  nA = aRot(nA, rp, 0);
  skPos = pA; objectNormal = nA;
}
vRest = position; vMark = aMark; vCoat = iCoat;
`;

const FRAG_PARS = /* glsl */`
uniform vec4 uBreed[${BREEDS_MAX * PER}];
varying vec3 vRest;
varying vec2 vMark;
varying vec4 vCoat;
float ah(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float an(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ah(i), ah(i + vec3(1,0,0)), f.x), mix(ah(i + vec3(0,1,0)), ah(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(ah(i + vec3(0,0,1)), ah(i + vec3(1,0,1)), f.x), mix(ah(i + vec3(0,1,1)), ah(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float gDome = 0.0, gWool = 0.0;
// Cellular noise: distance to the nearest of a jittered point per cell (clumps of wool).
float acell(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  vec3 o = step(0.5, f) - 1.0;   // search the 2 x 2 x 2 cells on the near side of the point
  float d = 1.0;
  for (int a = 0; a < 2; a++) for (int b = 0; b < 2; b++) for (int c = 0; c < 2; c++) {
    vec3 n = vec3(float(a), float(b), float(c)) + o;
    vec3 q = i + n;
    vec3 pt = vec3(ah(q), ah(q + 13.7), ah(q + 29.3));
    d = min(d, length(n + pt - f));
  }
  return d;
}
float afbm(vec3 p) { return an(p) * 0.55 + an(p * 2.03 + 7.1) * 0.3 + an(p * 4.1 + 3.7) * 0.15; }
vec3 coatColor(out float fur, out float freq) {
  int br = int(clamp(vCoat.x + 0.5, 0.0, ${BREEDS_MAX}.0 - 1.0));
  int o = br * ${PER};
  vec4 c0 = uBreed[o], c1 = uBreed[o + 1], c2 = uBreed[o + 2], c3 = uBreed[o + 3], c4 = uBreed[o + 4], c5 = uBreed[o + 5], c6 = uBreed[o + 6], c7 = uBreed[o + 7];
  vec3 p = vRest + vec3(vCoat.y * 13.7, vCoat.y * 3.1, vCoat.y * 7.9);
  float style = c5.x;
  vec3 col = c0.rgb;
  float region = vMark.y;
  float mask = 0.0;
  if (style > 0.5) {
    if (style < 1.5) {                      // blotches
      vec3 w = p * c0.w; w += 0.45 * vec3(an(w * 1.7 + 2.0), an(w * 1.7 + 9.0), an(w * 1.7 + 5.0));
      float n = afbm(w * 0.9 + vec3(0.0, 0.0, 0.0));
      mask = smoothstep(1.0 - c1.w - 0.025, 1.0 - c1.w + 0.025, n);
    } else if (style < 2.5) {               // bars (barred feathers)
      float n = an(p * vec3(30.0, 30.0, 4.0)) * 0.4;
      float s = fract((p.z + p.y * 0.5) * c0.w + n);
      mask = smoothstep(0.42, 0.5, s) * (1.0 - smoothstep(0.5, 0.58, s));
      mask = smoothstep(0.1, 0.3, mask) * c1.w;
      mask = mix(mask, c1.w * 0.42, smoothstep(0.25, 0.6, length(fwidth(vRest)) * c0.w));   // bars thinner than a pixel average out
    } else if (style < 3.5) {               // belt: a band round the shoulders
      float d = abs(vRest.z - c6.y);
      mask = 1.0 - smoothstep(c6.z * 0.8, c6.z, d + (an(p * 25.0) - 0.5) * 0.02);
    } else if (style < 4.5) {               // spots
      vec3 w = p * c0.w; vec3 cell = floor(w); vec3 fc = fract(w) - 0.5;
      float r = ah(cell) , d = length(fc + (vec3(ah(cell + 3.0), ah(cell + 5.0), ah(cell + 8.0)) - 0.5) * 0.5);
      mask = (r < c1.w ? 1.0 : 0.0) * (1.0 - smoothstep(0.22, 0.3, d));
      mask = mix(mask, c1.w * 0.28, smoothstep(0.3, 0.7, length(fwidth(vRest)) * c0.w));
    } else if (style < 5.5) {               // saddle / coloured ends: the middle is the colour of "patch"
      float d = abs(vRest.z - c6.y);
      mask = 1.0 - smoothstep(c6.z * 0.45, c6.z * 1.15, d + (afbm(p * 22.0) - 0.5) * 0.09);
    } else {                                // speckle
      mask = step(1.0 - c1.w, an(p * c0.w * 3.0));
    }
  }
  col = mix(col, c1.rgb, mask);
  if (region > 0.5 && region < 1.5) col = mix(col, c2.rgb, c2.w);           // face
  if (region > 1.5 && region < 3.5) col = mix(col, c3.rgb, c3.w);           // lower legs, tail
  if (region > 3.5 && region < 4.5) col = mix(col, mix(c2.rgb, c0.rgb, 0.5), c2.w * 0.6);   // ears
  float below = smoothstep(c4.w + 0.06, c4.w - 0.06, vRest.y);
  if (region < 0.5) col = mix(col, c4.rgb, below * c6.w);
  if (region > 12.5 && region < 13.5) col = c7.rgb;
  float px = length(fwidth(vRest)) * c5.z;           // how many noise cells one pixel covers: past about one, the detail fades out
  float fade = 1.0 - smoothstep(0.1, 0.38, px);
  fur = c5.y * fade; freq = c5.z;
  gWool = 0.0;
  if (c7.w > 0.01 && (region < 0.5 || (region > 2.5 && region < 3.5))) {
    // feathers: rows of rounded scales (every second row shifted half a scale), soft at the edges, a touch darker where they overlap
    float row = floor(vRest.y * 26.0);
    float off = ah(vec3(row, 1.3, 2.1));
    float u = fract(-vRest.z * 21.0 + off + abs(vRest.x) * 5.0);
    float v = fract(vRest.x * 30.0 + 0.5 * mod(row, 2.0) + off * 0.3);
    float d = length((vec2(u, v) - 0.5) * vec2(1.0, 1.25));
    float dome = 1.0 - smoothstep(0.25, 0.85, d);
    float pxf = length(fwidth(vRest)) * 26.0;
    float wf = 1.0 - smoothstep(0.09, 0.3, pxf);
    gDome = dome * wf + 0.5 * (1.0 - wf);
    gWool = c7.w * wf * 0.35;
    col *= mix(1.0, 0.94 + 0.1 * dome, c7.w * wf);
  }
  if (c5.w > 0.01 && (region < 0.5 || (region > 2.5 && region < 3.5))) {
    // locks: big domes with a finer crimp riding on them; fades to a smooth tone when a pixel covers more than a lock
    vec3 q = vRest * 15.0; q += 0.35 * vec3(an(q * 0.8), an(q * 0.8 + 5.0), an(q * 0.8 + 11.0));
    float d1 = acell(q);
    float dome = sqrt(max(0.0, 1.0 - min(1.0, d1 / 0.82) * min(1.0, d1 / 0.82)));
    float crimp = an(vRest * 38.0 + 3.7);
    float px2 = length(fwidth(vRest)) * 15.0;
    float wf = 1.0 - smoothstep(0.2, 0.55, px2);
    gDome = (dome * 0.8 + crimp * 0.2) * wf + 0.55 * (1.0 - wf);
    gWool = c5.w * wf;
    col *= mix(1.0, 0.8 + 0.28 * dome + 0.04 * crimp, c5.w * wf);
  }
  float lum = afbm(p * c5.z * 0.5);
  float fine = an(p * c5.z * 2.0);
  col *= 1.0 + (lum - 0.5) * 0.34;
  col *= 1.0 + (fine - 0.5) * 0.16 * fade;
  return col * (0.93 + vCoat.z * 0.14);
}
vec3 bumpN(vec3 N, vec3 vp, float h, float k) {
  vec3 dpx = dFdx(vp), dpy = dFdy(vp);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 gr = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * N - k * gr);
}
`;

/** Build the material for one model. `uniforms` is returned so the renderer can drive uTime. */
export function animalMaterial(spec: AnimalMaterialSpec): { material: THREE.MeshStandardMaterial; uniforms: Record<string, { value: unknown }> } {
  const bp = new Float32Array(BONE_COUNT * 4), a0 = new Float32Array(BONE_COUNT * 4), a1 = new Float32Array(BONE_COUNT * 4), a2 = new Float32Array(BONE_COUNT * 4);
  for (let i = 0; i < BONE_COUNT; i++) {
    const b = spec.bones[i];
    bp[i * 4 + 3] = -1;
    if (!b) continue;
    bp.set([b.pivot[0], b.pivot[1], b.pivot[2], b.parent], i * 4);
    a0.set([b.bias ?? 0, b.swing ?? 0, b.off ?? 0, b.flex ?? 0], i * 4);
    a1.set([b.graze ?? 0, b.idle ?? 0, b.idleFreq ?? 1, b.idlePh ?? 0], i * 4);
    a2.set([b.axis ?? 0, b.bob ?? 0, b.pulse ? 1 : 0, 0], i * 4);
  }
  const br = new Float32Array(BREEDS_MAX * PER * 4);
  spec.breeds.slice(0, BREEDS_MAX).forEach((b, i) => {
    const o = i * PER * 4, d = (k: number, v: number[]) => br.set(v, o + k * 4);
    d(0, [...b.base, b.scale ?? 6]);
    d(1, [...(b.patch ?? b.base), b.cover ?? 0.4]);
    d(2, [...(b.face ?? b.base), b.faceMix ?? 0]);
    d(3, [...(b.leg ?? b.base), b.legMix ?? 0]);
    d(4, [...(b.belly ?? b.base), b.bellyY ?? 0.5]);
    d(5, [b.style, b.fur ?? 0.5, b.furFreq ?? 60, b.wool ?? 0]);
    d(6, [0, b.belt?.[0] ?? 0, b.belt?.[1] ?? 0.2, b.bellyMix ?? 0]);
    d(7, [...(b.nose ?? [0.3, 0.22, 0.22]), b.feather ?? 0]);
  });
  const uniforms = {
    uBP: { value: bp }, uA0: { value: a0 }, uA1: { value: a1 }, uA2: { value: a2 },
    uRoot: { value: new THREE.Vector4(spec.root.bob, spec.root.pitch, spec.root.grazePitch ?? 0, spec.root.hop ? 1 : 0) },
    uRootC: { value: new THREE.Vector2(spec.root.cy, spec.root.cz) },
    uTime: { value: 0 }, uGrazeFreq: { value: spec.grazeFreq }, uBreed: { value: br },
  };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, vertexColors: true });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <beginnormal_vertex>', NORMAL_BEGIN)
      .replace('#include <begin_vertex>', 'vec3 transformed = skPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', /* glsl */`
        float furK = 0.0, furF = 40.0;
        {
          float coatK = vMark.x;
          vec3 base = vColor.rgb;
          if (coatK > 0.01) {
            vec3 cc = coatColor(furK, furF);
            float shade = dot(vColor.rgb, vec3(0.3333));
            diffuseColor.rgb *= mix(base, cc * shade, coatK);
          } else diffuseColor.rgb *= base;
        }`)
      .replace('#include <normal_fragment_maps>', /* glsl */`
        #include <normal_fragment_maps>
        if (vMark.x > 0.01 && furK > 0.0) {
          float h = afbm(vRest * furF * 2.0) + 0.5 * an(vRest * furF * 3.5);
          normal = bumpN(normal, -vViewPosition, h, furK * 0.0012);
        }
        if (vMark.x > 0.01 && gWool > 0.0) normal = bumpN(normal, -vViewPosition, gDome, gWool * 0.011);`)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        #include <roughnessmap_fragment>
        { float rg = vMark.y;
          if (rg > 9.5) { roughnessFactor = rg < 10.5 ? 0.12 : rg < 11.5 ? 0.55 : rg < 12.5 ? 0.45 : rg < 13.5 ? 0.3 : rg < 14.5 ? 0.6 : 0.4; } }`);
  };
  material.customProgramCacheKey = () => 'animal_' + spec.key;
  return { material, uniforms };
}
