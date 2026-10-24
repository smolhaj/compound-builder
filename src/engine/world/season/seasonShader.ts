/**
 * seasonShader — GPU side of the visual seasons (seasonState.ts).
 *
 * ONE set of shared uniform objects (plain {x,y,z,w} objects, so three's
 * cloneUniforms keeps the reference — every material sees the same live
 * values; one write per frame updates the whole world):
 *
 *   uSeaA = (fall, bare, fresh, bloom)      foliage
 *   uSeaB = (snow, dormant, dry, litter)    ground
 *   uSeaC = (ice, blaze, wet, cold)         water / region intensity
 *   uSeaP = cumulative fall palette shares (scarlet, +orange, +gold, 1)
 *   uSeaD = (broadleaf evergreen share, 0, 0, 0)   region (live oak / magnolia)
 *
 * Hooks (no geometry is rebuilt for a season):
 *   • Global surface patch for EVERY MeshStandardMaterial (`season_surface`
 *     chunk, run just before the weather patch in lights_physical_fragment):
 *       – lawns (green-dominant, upward-facing, porous): spring flush, dry tan
 *         late-summer grass, browned dormant winter grass;
 *       – leaf litter on lawns, curbs (SEA_CURB) and road gutters
 *         (SEA_PLOWED_UV: v runs across the carriageway);
 *       – snow multiplier `seaSnowK` read by the weather snow patch:
 *         plowed roads / paths (SEA_PLOWED) stay dark, banks at the edges,
 *         bare deciduous crowns (SEA_DECID) hold little;
 *       – frozen ponds (SEA_FREEZE materials).
 *   • Vegetation vertex code (treeGeometry.createVegetationMaterial and the
 *     regional far trees): per-tree fall color / timing from an instance
 *     position hash, spring flush and blossom, leaf drop to a twig haze.
 *   • Custom water shaders call `seasonIceGlsl()` at their output.
 */
import * as THREE from 'three';
import type { SeasonClimate, SeasonParams } from './seasonState';

type V4 = { x: number; y: number; z: number; w: number };
const A: V4 = { x: 0, y: 0, z: 0, w: 0 };
const B: V4 = { x: 0, y: 0, z: 0, w: 0 };
const C: V4 = { x: 0, y: 1, z: 0, w: 0 };
const P: V4 = { x: 0.25, y: 0.5, z: 0.75, w: 1 };
const D: V4 = { x: 0, y: 0, z: 0, w: 0 };

/** Shared uniform objects (assign into shader.uniforms). */
export const SEASON_UNIFORMS = {
  uSeaA: { value: A },
  uSeaB: { value: B },
  uSeaC: { value: C },
  uSeaP: { value: P },
  uSeaD: { value: D },
} as const;

/** Write the eased season into the shared uniforms. */
export function writeSeasonUniforms(p: SeasonParams, c: SeasonClimate): void {
  A.x = p.fall; A.y = p.bare; A.z = p.fresh; A.w = p.bloom;
  B.x = p.snow; B.y = p.dormant; B.z = p.dry; B.w = p.litter;
  C.x = p.ice; C.y = c.blaze; C.z = p.wet; C.w = p.cold;
  const [r, o, y, b] = c.palette;
  const s = r + o + y + b || 1;
  P.x = r / s; P.y = (r + o) / s; P.z = (r + o + y) / s; P.w = 1;
  D.x = c.broadEvergreen;
}

/** Current uniform values (tests / QA). */
export function getSeasonUniformValues(): { a: Readonly<V4>; b: Readonly<V4>; c: Readonly<V4>; p: Readonly<V4>; d: Readonly<V4> } {
  return { a: A, b: B, c: C, p: P, d: D };
}

// ── Shared GLSL ───────────────────────────────────────────────────────────────

const SEA_DECL = /* glsl */`
uniform vec4 uSeaA;
uniform vec4 uSeaB;
uniform vec4 uSeaC;
uniform vec4 uSeaP;
uniform vec4 uSeaD;
`;

/**
 * Per-tree foliage (vertex stage). `h` = four stable per-tree randoms.
 * Linear-space colors; `base` is the tree's summer canopy color.
 */
const SEA_LEAF_FUNCS = /* glsl */`
vec4 seaTreeHash(vec2 p) {
  return fract(sin(vec4(dot(p, vec2(12.9898, 78.233)), dot(p, vec2(39.346, 11.135)),
                        dot(p, vec2(73.156, 52.235)), dot(p, vec2(26.651, 91.317)))) * 43758.5453);
}
/** 1 for a broadleaf evergreen (live oak, southern magnolia): the region's share (uSeaD.x) of the trees. */
float seaEverFor(vec4 h) { return step(fract(h.y * 5.31 + h.z * 2.17), uSeaD.x); }
/** Per-tree leaf drop (early droppers lead, stragglers hold on; evergreens keep their leaves). */
float seaBareFor(vec4 h) { return clamp(uSeaA.y * 1.35 - h.w * 0.35, 0.0, 1.0) * (1.0 - seaEverFor(h)); }
vec3 seaLeaf(vec3 base, vec4 h) {
  float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
  float k = clamp(lum / 0.11, 0.65, 1.4);
  vec3 c = base;
  // Spring flush: new leaves are a light yellow-green
  c = mix(c, vec3(0.16, 0.29, 0.055) * k, uSeaA.z * 0.55);
  // Blossom on the flowering trees (cherry / crabapple pink, pear / dogwood white)
  float bl = uSeaA.w * step(h.x, 0.17);
  c = mix(c, h.y < 0.55 ? vec3(0.82, 0.42, 0.52) : vec3(0.80, 0.79, 0.74), bl * 0.92);
  // Fall: each tree turns on its own schedule, to its own color; the region
  // caps how far it goes (blaze: New England 1 … SoCal 0.15)
  float ever = seaEverFor(h);
  float t = smoothstep(h.z * 0.72, h.z * 0.72 + 0.45, uSeaA.x) * uSeaC.y * (1.0 - ever);
  // Evergreen broadleaves stay green through winter: a little duller, darker-olive
  c = mix(c, c * vec3(0.94, 0.92, 0.82), ever * uSeaC.w * 0.6);
  float u = fract(h.x * 7.31 + h.y * 3.7);
  vec3 fc = u < uSeaP.x ? vec3(0.46, 0.04, 0.014)
          : u < uSeaP.y ? vec3(0.60, 0.15, 0.012)
          : u < uSeaP.z ? vec3(0.62, 0.38, 0.02)
          : vec3(0.25, 0.10, 0.03);
  fc *= (0.72 + 0.42 * h.y) * k * 0.78;
  c = mix(c, fc, t);
  // Senescence: the last leaves brown, then only the twig haze is left
  float b = seaBareFor(h);
  c = mix(c, vec3(0.15, 0.08, 0.03) * k, smoothstep(0.1, 0.6, b) * 0.55);
  c = mix(c, vec3(0.12, 0.10, 0.085) * (0.8 + 0.4 * h.y), smoothstep(0.5, 0.95, b));
  return c;
}
`;

/** Vertex declarations for the vegetation material (fragment gets the global ones). */
export const SEA_VEG_VERT_PARS = SEA_DECL + SEA_LEAF_FUNCS + /* glsl */`
varying float vSeaBare;
`;
export const SEA_VEG_FRAG_PARS = /* glsl */`
varying float vSeaBare;
`;

/**
 * Vertex snippet: per-tree hash + bare amount (`seaH`, `seaBare`, vSeaBare).
 * Place before any use; deciduous materials only (SEA_DECID).
 */
export const SEA_VEG_TREE = /* glsl */`
  vec4 seaH = vec4(0.5);
  #ifdef USE_INSTANCING
    seaH = seaTreeHash(instanceMatrix[3].xz);
  #endif
  float seaBare = 0.0;
  #ifdef SEA_DECID
    seaBare = seaBareFor(seaH);
  #endif
  vSeaBare = seaBare;
`;

// ── Global surface patch ──────────────────────────────────────────────────────

const SURFACE_PARS = /* glsl */`
#ifdef STANDARD
${SEA_DECL}
float seaHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float seaNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(seaHash(i), seaHash(i + vec2(1.0, 0.0)), u.x),
             mix(seaHash(i + vec2(0.0, 1.0)), seaHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
/** Snow multiplier from earlier stages (regional terrain: forest canopy holds less). */
float seaSnowMul = 1.0;
/** Fallen-leaf color at a world xz (fine speckle, averaged out with distance). */
vec3 seaLitterColor(vec2 xz, float fw) {
  vec2 cell = floor(xz * 26.0);
  float h = seaHash(cell);
  vec3 c = h < uSeaP.x ? vec3(0.30, 0.03, 0.015)
         : h < uSeaP.y ? vec3(0.42, 0.12, 0.012)
         : h < uSeaP.z ? vec3(0.44, 0.27, 0.02)
         : vec3(0.17, 0.08, 0.025);
  c = mix(c, vec3(0.13, 0.07, 0.025), smoothstep(0.55, 1.0, uSeaA.y) * 0.5 * seaHash(cell + 7.1)); // older leaves brown
  vec3 avg = vec3(0.30, 0.13, 0.025);
  return mix(c * (0.75 + 0.5 * seaHash(cell + 3.3)), avg, smoothstep(0.25, 0.9, fw * 26.0));
}
/** Far forest canopy on the regional terrain: deciduous share turns, then goes gray-brown. */
vec3 seaFarCanopy(vec3 col, float decid, vec2 xz) {
  decid *= 1.0 - uSeaD.x;   // live oak / magnolia stands stay green
  if (decid < 0.002) return col;
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  // Crown-sized speckle (≈ 3–5 units) so stands read as many trees, not bands
  float h = fract(seaNoise(xz * 0.07) * 3.1 + seaNoise(xz * 0.31 + 9.0) * 0.9);
  float h2 = seaNoise(xz * 0.21 + 3.7);
  float h3 = seaNoise(xz * 0.55 + 1.3);
  vec3 fc = h < uSeaP.x ? vec3(0.36, 0.06, 0.02) : h < uSeaP.y ? vec3(0.50, 0.17, 0.02) : h < uSeaP.z ? vec3(0.50, 0.32, 0.03) : vec3(0.24, 0.12, 0.04);
  fc = mix(vec3(dot(fc, vec3(0.3, 0.59, 0.11))), fc, 0.8) * (0.55 + 0.45 * h2);
  float t = smoothstep(h2 * 0.5, h2 * 0.5 + 0.5, uSeaA.x) * uSeaC.y * (0.7 + 0.3 * h3);
  vec3 c = mix(col, fc * clamp(lum / 0.06, 0.4, 1.3), t * decid);
  c = mix(c, vec3(0.085, 0.07, 0.06) * (0.8 + 0.4 * h2), smoothstep(0.3, 0.95, uSeaA.y) * decid);
  c = mix(c, c * vec3(0.95, 1.12, 0.7), uSeaA.z * decid * 0.5);
  return c;
}
#endif
`;

const SURFACE = /* glsl */`
float seaSnowK = 1.0;
vec3 seaSnowTint = vec3( 1.0 );
#ifdef STANDARD
  seaSnowK = seaSnowMul;
#ifdef SEA_CURB
  seaSnowTint = vec3( 0.78, 0.76, 0.72 ); // grit + spray along the curb
#endif
#ifdef SEA_DECID
  seaSnowK = 0.3;
#endif
#ifdef SEA_PLOWED
  seaSnowK = 0.12;
#endif
#if defined( SEA_PLOWED_UV ) && defined( USE_MAP )
  {
    // Plowed carriageway: dark tire tracks in each lane, packed snow
    // between and along the crown, dirty gray banks at the curbs
    float seV = vMapUv.y;
    float seTr = 0.0;
    for ( int i = 0; i < 4; i++ ) {
      float c = i == 0 ? 0.17 : i == 1 ? 0.33 : i == 2 ? 0.67 : 0.83;
      seTr = max( seTr, smoothstep( 0.055, 0.02, abs( seV - c ) ) );
    }
    float seEdgeB = smoothstep( 0.14, 0.03, min( seV, 1.0 - seV ) );
    seaSnowK = mix( mix( 0.5, 0.04, seTr ), 1.25, seEdgeB );
    seaSnowTint = mix( vec3( 0.80, 0.79, 0.76 ), vec3( 0.62, 0.58, 0.52 ), seEdgeB );
  }
#endif
#ifndef SEA_VEG
if ( uSeaB.x + uSeaB.y + uSeaB.z + uSeaB.w + uSeaA.z + uSeaC.x > 0.003 ) {
  vec3 seN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
  vec3 seP = cameraPosition + ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz;
  float seUp = smoothstep( 0.6, 0.9, seN.y );
  float seFw = length( fwidth( seP.xz ) );
  vec3 seC = diffuseColor.rgb;
  float seLum = dot( seC, vec3( 0.2126, 0.7152, 0.0722 ) );
  float seN1 = seaNoise( seP.xz * 0.17 ) * 0.62 + seaNoise( seP.xz * 1.1 + 5.3 ) * 0.38;
#ifdef SEA_FREEZE
  // Frozen pond: matte gray-white ice with darker clear patches + cracks
  if ( uSeaC.x > 0.002 ) {
    float seCr = smoothstep( 0.035, 0.0, abs( seaNoise( seP.xz * 2.3 ) - 0.5 ) );
    vec3 seIce = mix( vec3( 0.36, 0.42, 0.47 ), vec3( 0.58, 0.62, 0.66 ), smoothstep( 0.3, 0.75, seN1 ) ) * ( 1.0 - 0.25 * seCr );
    diffuseColor.rgb = mix( diffuseColor.rgb, seIce, uSeaC.x );
    roughnessFactor = mix( roughnessFactor, 0.42, uSeaC.x );
    metalnessFactor *= 1.0 - uSeaC.x;
  }
#else
  float seGreen = smoothstep( 0.004, 0.025, seC.g - max( seC.r, seC.b ) ) * seUp * smoothstep( 0.18, 0.38, roughnessFactor );
  if ( seGreen > 0.001 ) {
    float seK = clamp( seLum / 0.09, 0.6, 1.5 );
    vec3 seT = seC;
    // Spring flush: lawns green up bright
    seT = mix( seT, seT * vec3( 0.92, 1.16, 0.6 ), uSeaA.z * 0.6 );
    // Late-summer dry grass: patchy tan, the patches spreading as it dries
    // (r16: watered lawns — SEA_IRRIGATED, the SoCal yards — stay green)
#ifndef SEA_IRRIGATED
    float seDry = uSeaB.z * smoothstep( 0.25, 0.65, seN1 + uSeaB.z * 0.35 );
    seT = mix( seT, vec3( 0.30, 0.22, 0.095 ) * seK * ( 0.85 + 0.3 * seN1 ), seDry * 0.9 );
#endif
    // Dormant winter lawns: an even olive-straw, greener in places. (A hard
    // threshold on the large-scale noise read as dark brown camo blotches
    // ~40 m across from the overview.)
    float seDor = uSeaB.y * ( 0.5 + 0.3 * smoothstep( 0.15, 0.85, seN1 ) );
    seT = mix( seT, vec3( 0.22, 0.19, 0.115 ) * seK * ( 0.93 + 0.14 * seN1 ), seDor );
    diffuseColor.rgb = mix( diffuseColor.rgb, seT, seGreen );
  }
  // Fallen leaves: drifts on lawns, along curbs and in road gutters
  if ( uSeaB.w > 0.003 ) {
    float seLm = seGreen;
#ifdef SEA_CURB
    seLm = max( seLm, seUp * 0.9 );
#endif
#if defined( SEA_PLOWED_UV ) && defined( USE_MAP )
    float seEdge = smoothstep( 0.16, 0.02, min( vMapUv.y, 1.0 - vMapUv.y ) );
    seLm = max( seLm, seEdge * seUp );
#endif
    if ( seLm > 0.001 ) {
      float seDrift = seaNoise( seP.xz * 0.8 + 11.0 ) * 0.6 + seaNoise( seP.xz * 4.0 ) * 0.4;
      // Lawns: scattered drifts (most of the lawn stays green); curbs / gutters: dense
      float seCov = mix( 0.55, 1.0, max( seLm - seGreen, 0.0 ) );
      float seL = smoothstep( 0.7, 0.52, seDrift - uSeaB.w * 0.18 ) * uSeaB.w * seLm * seCov;
      // each litter cell holds one leaf: a small jittered ellipse, not a filled
      // square (filled cells read as a pixel mosaic at eye level)
      vec2 seLc = seP.xz * 26.0, seCi = floor( seLc );
      vec2 seCf = fract( seLc ) - 0.5 - ( vec2( seaHash( seCi + 2.3 ), seaHash( seCi + 5.9 ) ) - 0.5 ) * 0.36;
      float seAng = seaHash( seCi + 9.1 ) * 3.1416;
      vec2 seRot = vec2( cos( seAng ) * seCf.x + sin( seAng ) * seCf.y, -sin( seAng ) * seCf.x + cos( seAng ) * seCf.y );
      float seLeaf = 1.0 - smoothstep( 0.24, 0.32, length( seRot * vec2( 1.0, 1.7 ) ) );
      seL *= mix( step( 0.3, seaHash( seCi + 1.7 ) ) * seLeaf, 0.4, smoothstep( 0.25, 0.9, seFw * 26.0 ) );
      diffuseColor.rgb = mix( diffuseColor.rgb, seaLitterColor( seP.xz, seFw ), seL );
      roughnessFactor = max( roughnessFactor, mix( roughnessFactor, 0.8, seL ) );
    }
  }
#endif
}
#endif
#endif
`;

let _installed = false;

/**
 * Install the global season surface patch (idempotent). Must run before any
 * MeshStandardMaterial compiles. The weather patch (WeatherRenderer) includes
 * the `season_surface` chunk and multiplies its lying snow by `seaSnowK`.
 */
export function installSeasonShaderPatch(): void {
  if (_installed) return;
  _installed = true;
  const SC = THREE.ShaderChunk as unknown as Record<string, string>;
  SC.season_surface = SURFACE;
  SC.lights_physical_pars_fragment = SURFACE_PARS + SC.lights_physical_pars_fragment;
  for (const id of ['standard', 'physical'] as const) {
    const lib = THREE.ShaderLib[id];
    Object.assign(lib.uniforms as Record<string, THREE.IUniform>, SEASON_UNIFORMS);
  }
}

/**
 * Ice over a custom water shader: call at the very end of its output, where
 * `outgoingLight`, `reflectedLight` and `diffuseColor` are in scope. Re-lights
 * a matte ice albedo with the water's own diffuse irradiance.
 * `worldPos` is the GLSL expression of the fragment's world position;
 * `openWater` (GLSL float 0..1) keeps e.g. a fast river channel open.
 */
export function seasonIceGlsl(worldPos: string, openWater = '0.0'): string {
  return /* glsl */`
  #ifdef STANDARD
  if ( uSeaC.x > 0.002 ) {
    vec2 icXZ = (${worldPos}).xz;
    float icN = seaNoise( icXZ * 0.17 ) * 0.6 + seaNoise( icXZ * 1.3 + 2.1 ) * 0.4;
    float icCr = smoothstep( 0.035, 0.0, abs( seaNoise( icXZ * 2.3 ) - 0.5 ) );
    vec3 icAlb = mix( vec3( 0.36, 0.42, 0.47 ), vec3( 0.62, 0.66, 0.70 ), smoothstep( 0.3, 0.75, icN ) ) * ( 1.0 - 0.25 * icCr );
    // Snow lying on the ice (weather cover)
    // Snow lies in wind-blown drifts on the ice; skating-clear gray ice shows between
    float icDr = seaNoise( icXZ * 0.35 + 5.1 ) * 0.7 + seaNoise( icXZ * 2.2 ) * 0.3;
    icAlb = mix( icAlb, vec3( 0.80, 0.83, 0.88 ), clamp( uSeaB.x * smoothstep( 0.5, 0.72, icDr ), 0.0, 0.9 ) );
    vec3 icIrr = ( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse ) / max( diffuseColor.rgb, vec3( 1e-3 ) );
    vec3 icCol = icIrr * icAlb + reflectedLight.directSpecular * 0.05;
    float icOpen = clamp( ${openWater}, 0.0, 1.0 );
    float icK = smoothstep( 0.0, 0.3, uSeaC.x ) * uSeaC.x * ( 1.0 - icOpen );
    outgoingLight = mix( outgoingLight, icCol, clamp( icK * 1.2, 0.0, 1.0 ) );
  }
  #endif
  `;
}

/**
 * Season patch for simple vertex-colored instanced trees (regional far
 * trees): leaf vertices (white vertex color) of deciduous sets take the
 * per-tree seasonal color. Call from the material's onBeforeCompile.
 */
export function applySeasonToFarTrees(shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string }, deciduous: boolean): void {
  if (!deciduous) return;
  Object.assign(shader.uniforms, SEASON_UNIFORMS);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + SEA_DECL + SEA_LEAF_FUNCS)
    .replace('#include <color_vertex>', /* glsl */`#include <color_vertex>
      #if defined( USE_INSTANCING_COLOR ) && defined( USE_INSTANCING )
        if (color.r > 0.5) vColor.rgb = color.rgb * seaLeaf(instanceColor.rgb, seaTreeHash(instanceMatrix[3].xz));
      #endif`);
}
