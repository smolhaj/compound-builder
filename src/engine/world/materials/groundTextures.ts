/**
 * groundTextures — shared procedural ground textures (grass-blade detail,
 * macro noise) and the dusk sky fill for ground-level materials.
 * From UE GroundDetailRenderer (the campus wear / cover masks are not ported).
 */
import * as THREE from 'three';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Tileable 4-channel value-noise texture (each channel an independent fbm).
 * Sampled at several world scales by the shader for macro variation.
 */
function makeNoiseTexture(): THREE.DataTexture {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const rnd = lcg(1337);
  const periods = [4, 8, 16, 32];
  const amps    = [0.5, 0.27, 0.15, 0.08];
  for (let ch = 0; ch < 4; ch++) {
    const field = new Float32Array(N * N);
    for (let o = 0; o < periods.length; o++) {
      const P = periods[o];
      const lat = new Float32Array(P * P);
      for (let k = 0; k < lat.length; k++) lat[k] = rnd();
      const cell = N / P;
      for (let y = 0; y < N; y++) {
        const fy = y / cell;
        const y0 = Math.floor(fy) % P, y1 = (y0 + 1) % P;
        let ty = fy - Math.floor(fy); ty = ty * ty * (3 - 2 * ty);
        for (let x = 0; x < N; x++) {
          const fx = x / cell;
          const x0 = Math.floor(fx) % P, x1 = (x0 + 1) % P;
          let tx = fx - Math.floor(fx); tx = tx * tx * (3 - 2 * tx);
          const a = lat[y0 * P + x0], b = lat[y0 * P + x1];
          const c = lat[y1 * P + x0], d = lat[y1 * P + x1];
          field[y * N + x] += amps[o] * ((a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
        }
      }
    }
    // Normalise to 0..1 (fbm sums cluster around the middle — stretch it)
    let mn = Infinity, mx = -Infinity;
    for (let k = 0; k < field.length; k++) { mn = Math.min(mn, field[k]); mx = Math.max(mx, field[k]); }
    const sc = 1 / Math.max(1e-6, mx - mn);
    for (let k = 0; k < field.length; k++) data[k * 4 + ch] = Math.round((field[k] - mn) * sc * 255);
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Tileable grass-blade detail texture. RGB is a colour modulation centred on
 * 0.5 (the shader multiplies by 2×), A is a pseudo height used for bump.
 * Blades are short, mostly upright strokes of varying tone; later strokes
 * sit "on top" (higher A) like a real sward.
 */
function makeGrassDetailTexture(): THREE.DataTexture {
  const N = 512;
  const r = new Float32Array(N * N).fill(0.40);
  const g = new Float32Array(N * N).fill(0.40);
  const b = new Float32Array(N * N).fill(0.40);
  const hgt = new Float32Array(N * N).fill(0.15);
  const rnd = lcg(90210);
  const BLADES = 26000;
  for (let n = 0; n < BLADES; n++) {
    const x0 = rnd() * N, y0 = rnd() * N;
    const ang = (rnd() - 0.5) * 2.2 + Math.PI / 2; // mostly one direction, wide spread
    const len = 3 + rnd() * 7;
    const layer = n / BLADES;
    const tone = 0.34 + rnd() * 0.30 + layer * 0.10;
    // hue jitter: some yellow-green, some blue-green blades
    const hue = rnd();
    const cr = tone * (hue < 0.18 ? 1.22 : hue > 0.85 ? 0.86 : 1.0);
    const cg = tone;
    const cb = tone * (hue < 0.18 ? 0.70 : hue > 0.85 ? 1.10 : 0.92);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let s = 0; s < len; s += 0.7) {
      const t = s / len; // tip brighter
      const px = ((Math.floor(x0 + dx * s) % N) + N) % N;
      const py = ((Math.floor(y0 + dy * s) % N) + N) % N;
      const k = py * N + px;
      const lift = 0.85 + t * 0.3;
      r[k] = cr * lift; g[k] = cg * lift; b[k] = cb * lift;
      hgt[k] = 0.25 + layer * 0.5 + t * 0.25;
    }
  }
  const data = new Uint8Array(N * N * 4);
  for (let k = 0; k < N * N; k++) {
    data[k * 4]     = Math.round(Math.min(1, r[k]) * 255);
    data[k * 4 + 1] = Math.round(Math.min(1, g[k]) * 255);
    data[k * 4 + 2] = Math.round(Math.min(1, b[k]) * 255);
    data[k * 4 + 3] = Math.round(Math.min(1, hgt[k]) * 255);
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Uniforms shared by every patched ground material. */
export const groundUniforms = {
  uGDetail: { value: null as THREE.Texture | null },
  uGNoise: { value: null as THREE.Texture | null },
};

let _sharedTexturesReady = false;
/** Build the shared ground textures (grass blades, noise) if not yet built. */
export function ensureGroundTextures(): void {
  if (_sharedTexturesReady) return;
  _sharedTexturesReady = true;
  groundUniforms.uGDetail.value = makeGrassDetailTexture();
  groundUniforms.uGNoise.value = makeNoiseTexture();
}

/**
 * r15 dusk: with the sun near the horizon flat ground gets only grazing
 * direct light (walls facing the sun still get plenty), and the hemisphere
 * term alone left lawns and asphalt near-black while the facades glowed.
 * Real ground at sunset / civil twilight is still lit by the whole bright
 * sky dome, so upward faces get an extra share of the sky irradiance as the
 * key light drops (or turns to the dim moon) — none at midday.
 * Shared by the grass shader, the town yards and the road / street asphalt.
 */
export const GROUND_SKY_FILL_GLSL = /* glsl */`
  #if NUM_DIR_LIGHTS > 0 && NUM_HEMI_LIGHTS > 0
  {
    vec3 gsUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    float gsFace = max(dot(normalize(geometryNormal), gsUp), 0.0);
    #ifdef GS_ANY_FACE
      gsFace = 0.55 + 0.45 * gsFace;   // foliage: lit by the sky dome from every side
    #endif
    float gsSunUp = dot(directionalLights[0].direction, gsUp);
    float gsSun = dot(directionalLights[0].color, vec3(0.3333));
    // 0 at midday; 1 with a low sun; strongest when the key is dim (dusk → moon)
    float gsLow = 1.0 - smoothstep(0.2, 0.55, gsSunUp) * smoothstep(0.6, 1.6, gsSun);
    vec3 gsSky = hemisphereLights[0].skyColor;
    // …but not at night (a dim sky dome: the ground stays dark)
    gsLow *= smoothstep(0.13, 0.28, dot(gsSky, vec3(0.3333)));
    reflectedLight.indirectDiffuse += BRDF_Lambert(material.diffuseColor) * gsSky * gsFace * gsLow * 2.0;
  }
  #endif
`;

/**
 * Give any ground-level MeshStandardMaterial (asphalt, sidewalks, yards) the
 * dusk sky fill — chained after its own onBeforeCompile patch.
 */
export function applyGroundSkyFill<M extends THREE.MeshStandardMaterial>(mat: M): M {
  if (mat.userData.groundSkyFill) return mat;
  mat.userData.groundSkyFill = true;
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + GROUND_SKY_FILL_GLSL);
  };
  mat.customProgramCacheKey = () => prevKey.call(mat) + '|gsf1';
  mat.needsUpdate = true;
  return mat;
}
