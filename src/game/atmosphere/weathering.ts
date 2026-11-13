/**
 * Weathering on the shared kit materials (GDS §8.1 step 2: "moss, rust,
 * bleaching and stains driven by age"). One shader patch per exterior kit
 * material, read from a per-vertex `aWear` vec4 that each building / run
 * mesh carries (aging.ts packWear), so a 15-year-old barn and a new cabin
 * share every material and draw call. Meshes without the attribute (props,
 * interiors) read the GL default (0, 0, 0, 1): not aged.
 *
 *   wood     silver-gray, board by board; fresh boards after a repair
 *   paint    chalky fade, then peeling to gray wood
 *   metal    the galvanizing dulls, then rust streaks down from the laps
 *            and blotches on the flats
 *   roof     (shingle) graying, moss on the north pitch in wet country
 *   stone    moss low on the stones, grime
 * All exterior classes: splash grime at the foot of the walls.
 */
import * as THREE from 'three';
import type { WearClass } from './aging';
import { BLDG } from '../buildkit/buildingDetail';

/** Exterior kit materials and how they weather (others never age). */
export const WEAR_CLASS: Readonly<Record<string, WearClass>> = {
  metal_roof: 'metal', metal_roof_green: 'metal', metal_roof_grey: 'metal', metal_siding: 'metal', steel: 'metal', chimney_cap: 'metal',
  container_red: 'container', container_blue: 'container', container_green: 'container', container_tan: 'container', container_black: 'container', container_rust: 'container', shell_blue: 'container', shell_rust: 'container', shell_tan: 'container', shell_green: 'container',
  timber_lap: 'wood', board_batten: 'wood', log_wall: 'wood', log_end: 'wood', deck: 'wood', frame: 'wood', wood_mid: 'wood', wood_dark: 'wood',
  lap_white: 'paint', trim: 'paint', door: 'paint', paint_red: 'paint', paint_green: 'paint', vinyl: 'paint',
  shingle: 'roof',
  fieldstone: 'stone', concrete: 'stone', adobe: 'stone', plaster: 'paint',
};

const VERT_PARS = /* glsl */`
attribute vec4 aWear;
varying vec4 vWear;
varying vec3 vWearL;
varying vec3 vWearW;
varying vec3 vWearN;
varying vec2 vBdO;
`;
const VERT = /* glsl */`
  vWear = aWear;
  vWearL = transformed;
  vWearW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  vWearN = normalize( mat3( modelMatrix ) * objectNormal );
  vBdO = vec2( modelMatrix[3].x, modelMatrix[3].z );
`;
const FRAG_PARS = /* glsl */`
varying vec4 vWear;
varying vec3 vWearL;
varying vec3 vWearW;
varying vec3 vWearN;
varying vec2 vBdO;
uniform vec4 uBd;
float wearHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float wearNoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ), u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( wearHash( i ), wearHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( wearHash( i + vec2( 0.0, 1.0 ) ), wearHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
`;
const FRAG = /* glsl */`
{
  float wGi = floor( vWear.x * 0.5 + 1e-4 );
  float wRust = clamp( vWear.x - wGi * 2.0, 0.0, 1.0 );
  float wGrime = wGi * 0.1;
  float wGray = vWear.y;
  float wPatch = floor( vWear.z + 1e-4 ) * 0.1;
  float wMoss = vWear.z - floor( vWear.z + 1e-4 );
  float wPeel = 1.0 - vWear.w;
  if ( wRust + wGrime + wGray + wMoss + wPeel + wPatch > 0.003 ) {
    vec3 wP = vWearW;
    vec3 wN = normalize( vWearN );
    float wUp = wN.y;
    float wAlong = abs( wN.x ) > abs( wN.z ) ? wP.z : wP.x;
    float wLy = vWearL.y;
    vec3 wC = diffuseColor.rgb;
    float wLum = dot( wC, vec3( 0.2126, 0.7152, 0.0722 ) );
    // boards (lap ≈ 0.03 tall, ≈ 0.5 long): the unit of graying and of repairs
    vec2 wBoard = vec2( floor( wAlong * 2.0 + floor( wLy / 0.03 ) * 0.37 ), floor( wLy / 0.03 ) );
    float wFresh = step( wearHash( wBoard + 0.7 ), wPatch );
#ifdef WEAR_WOOD
    float wG = clamp( wGray * ( 0.72 + 0.5 * wearHash( wBoard + 3.1 ) ), 0.0, 1.0 ) * ( 1.0 - wFresh );
    vec3 wSilver = vec3( 0.25, 0.245, 0.23 ) * ( 0.78 + 0.44 * wearNoise( vec2( wAlong * 30.0, wLy * 120.0 ) ) );
    wC = mix( wC, mix( vec3( wLum ), wSilver, 0.75 ), wG * 0.88 );
    wC = mix( wC, wC * vec3( 1.18, 1.06, 0.86 ), wFresh * 0.7 );
    roughnessFactor = mix( roughnessFactor, 0.96, wG * 0.6 );
#endif
#if defined( WEAR_PAINT ) || defined( WEAR_CONTAINER )
    {
      // flakes lie along the boards (long and thin, not round blobs); a few boards lose far more paint than their neighbors
      float wPn = wearNoise( vec2( wAlong * 5.0, wLy * 34.0 + wP.y * 2.0 ) ) * 0.6 + wearNoise( vec2( wAlong * 23.0, wLy * 110.0 ) ) * 0.4;
      wPn += ( wearHash( wBoard + 5.3 ) - 0.5 ) * 0.22;
      float wFade = wPeel * ( 1.0 - wFresh );
      wC = mix( wC, mix( vec3( wLum ), wC, 0.5 ) * 1.05 + 0.012, wFade * 0.65 );
#ifdef WEAR_PAINT
      // a fully weathered wall still keeps most of its paint: peeling tops out near a fifth of the surface
      float wPeelM = smoothstep( 0.8 - wPeel * 0.22, 0.86 - wPeel * 0.22, wPn ) * smoothstep( 0.2, 0.4, wPeel ) * ( 1.0 - wFresh ) * 0.85;
      wC = mix( wC, vec3( 0.2, 0.19, 0.17 ) * ( 0.8 + 0.4 * wPn ), wPeelM );
#endif
      wC = mix( wC, wC * vec3( 1.08, 1.08, 1.12 ), wFresh * 0.5 );
      roughnessFactor = mix( roughnessFactor, 0.93, wFade * 0.5 );
    }
#endif
#if defined( WEAR_METAL ) || defined( WEAR_CONTAINER )
    {
      // streaks: thin, vertical, from the laps / top rail down
      float wSx = wearNoise( vec2( wAlong * 26.0, wP.y * 1.2 ) ) * 0.75 + wearNoise( vec2( wAlong * 70.0, wP.y * 3.0 ) ) * 0.25;
      float wStreak = smoothstep( 0.6, 0.86, wSx ) * ( 1.0 - smoothstep( 0.2, 0.7, wUp ) );
      // blotches on the flats and along panel edges
      float wBl = wearNoise( wP.xz * 6.0 + wP.y * 2.7 ) * 0.65 + wearNoise( wP.xz * 21.0 + wP.y * 9.0 ) * 0.35;
      float wBlot = smoothstep( 0.66 - wRust * 0.22, 0.8 - wRust * 0.22, wBl );
      float wR = clamp( ( wStreak * 0.95 + wBlot ) * smoothstep( 0.02, 0.4, wRust ), 0.0, 1.0 ) * ( 0.35 + 0.65 * wRust );
      vec3 wRustC = mix( vec3( 0.13, 0.04, 0.012 ), vec3( 0.36, 0.12, 0.03 ), wearNoise( wP.xz * 37.0 + wP.y * 19.0 ) );
#ifdef WEAR_METAL
      wC = mix( wC, vec3( wLum ) * 0.82, smoothstep( 0.0, 0.5, wRust ) * 0.55 );     // the zinc goes dull gray
#endif
      wC = mix( wC, wRustC, wR );
      roughnessFactor = mix( roughnessFactor, 0.9, max( wR, wRust * 0.4 ) );
      metalnessFactor = mix( metalnessFactor, 0.04, max( wR, wRust * 0.5 ) );
    }
#endif
#ifdef WEAR_ROOF
    wC = mix( wC, vec3( wLum ) * 0.95, wGray * 0.6 );
#endif
    // moss: on north-facing pitches (north = −z), thickest in the shade; on stone low down
    {
      float wNorth = 0.3 + 0.7 * smoothstep( 0.05, -0.45, wN.z );
      float wMn = wearNoise( wP.xz * 5.0 + wP.y ) * 0.6 + wearNoise( wP.xz * 19.0 - wP.y * 3.0 ) * 0.4;
      float wFace = smoothstep( 0.2, 0.5, wUp ) * wNorth;
#ifdef WEAR_STONE
      wFace = max( wFace, ( 1.0 - smoothstep( 0.02, 0.18, wLy ) ) * 0.8 );
#endif
      float wMm = wMoss * wFace * smoothstep( 0.62 - wMoss * 0.3, 0.74 - wMoss * 0.3, wMn );
      wC = mix( wC, vec3( 0.045, 0.07, 0.018 ) * ( 0.75 + 0.5 * wMn ), clamp( wMm, 0.0, 0.92 ) );
      roughnessFactor = mix( roughnessFactor, 1.0, wMm );
    }
    // splash grime at the foot of the walls
    float wGr = wGrime * ( 1.0 - smoothstep( 0.0, 0.15, wLy ) ) * ( 1.0 - smoothstep( 0.4, 0.8, abs( wUp ) ) ) * ( 0.55 + 0.45 * wearNoise( vec2( wAlong * 9.0, wLy * 25.0 ) ) );
    wC = mix( wC, vec3( 0.07, 0.055, 0.04 ), wGr * 0.5 );
    diffuseColor.rgb = wC;
  }
}
`;

/**
 * Building detail (the second block): per-building tint, sun-fade on the south and west faces, algae streaks down shaded
 * north walls and dirt runs under sills and eaves (both scaled by the wear's moss and grime), wet runs and sheen while it
 * rains, and rime speckle in a cold dawn. `uBd` = (detail on, rain, roof snow, rime); all of it is off on the Low tier.
 */
const FRAG_DETAIL = /* glsl */`
if ( uBd.x > 0.5 ) {
  vec3 bP = vWearW;
  vec3 bN = normalize( vWearN );
  float bWall = 1.0 - smoothstep( 0.3, 0.65, abs( bN.y ) );
  float bUp = clamp( bN.y, 0.0, 1.0 );
  vec2 bO = floor( vBdO * 4.0 );
  float bh1 = wearHash( bO + 1.3 ), bh2 = wearHash( bO + 9.1 );
  vec3 bC = diffuseColor.rgb;
  // one building: its own brightness and a little warm / cool drift
  bC *= ( 0.92 + 0.16 * bh1 ) * mix( vec3( 1.045, 1.0, 0.955 ), vec3( 0.96, 1.0, 1.04 ), bh2 );
  float bLum = dot( bC, vec3( 0.2126, 0.7152, 0.0722 ) );
  // sun fade: south (+z) and west (-x) walls and the roofs bleach with age
  float bAge = clamp( vWear.y * 0.5 + ( 1.0 - vWear.w ) * 0.7, 0.0, 1.0 );
  float bSun = max( clamp( 0.55 * bN.z - 0.35 * bN.x + 0.1, 0.0, 1.0 ) * bWall, bUp * 0.6 );
  bC = mix( bC, vec3( bLum ) * 1.1 + 0.015, bSun * bAge * 0.3 );
  float bAlong = abs( bN.x ) > abs( bN.z ) ? bP.z : bP.x;
  float bS = wearNoise( vec2( bAlong * 36.0, bP.y * 1.5 ) ) * 0.65 + wearNoise( vec2( bAlong * 91.0, bP.y * 3.7 + 4.0 ) ) * 0.35;
  float bRun = smoothstep( 0.5, 0.8, bS ) * bWall;
  float bMoss = vWear.z - floor( vWear.z + 1e-4 );
  float bGrime = floor( vWear.x * 0.5 + 1e-4 ) * 0.1;
  float bNorth = smoothstep( -0.05, -0.7, bN.z );
  float bLow = 1.0 - smoothstep( 0.05, 0.55, vWearL.y );
  bC = mix( bC, vec3( 0.085, 0.12, 0.06 ) * ( 0.8 + 0.4 * bS ), bRun * bNorth * bMoss * ( 0.4 + 0.5 * bLow ) * 0.65 );
  bC *= 1.0 - 0.22 * bGrime * bRun;
  // rain: the runs darken and shine
  bC *= 1.0 - 0.12 * uBd.y * bRun;
  roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.62, uBd.y * bRun * 0.8 );
  // a cold dawn: rime speckle, most on what faces up
  if ( uBd.w > 0.01 ) {
    float bR = wearNoise( bP.xz * 55.0 + bP.y * 31.0 ) * 0.6 + wearNoise( bP.xz * 140.0 - bP.y * 70.0 ) * 0.4;
    float bRm = smoothstep( 0.62 - uBd.w * 0.35, 0.78 - uBd.w * 0.3, bR ) * ( 0.45 + 0.55 * max( bUp, 0.5 * bWall ) );
    bC = mix( bC, vec3( 0.86, 0.91, 0.97 ), bRm * 0.8 );
    roughnessFactor = mix( roughnessFactor, 0.55, bRm * 0.5 );
  }
  diffuseColor.rgb = bC;
}
`;

const _patched = new WeakSet<THREE.Material>();

/** Add the weathering patch to a shared kit material (idempotent). */
export function patchWear(m: THREE.MeshStandardMaterial, cls: WearClass): void {
  if (_patched.has(m)) return;
  _patched.add(m);
  m.defines = { ...(m.defines ?? {}), WEAR: '', [`WEAR_${cls.toUpperCase()}`]: '' };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + FRAG + FRAG_DETAIL);
    sh.uniforms.uBd = BLDG.uBd;
  };
  m.customProgramCacheKey = () => `wear:${cls}`;
}

/** The winter roof's snow slabs: their top face drops toward the roof as the snow thins (`aLift`: the slab's up times its depth, w = 1 on the top face; `uIce.x` the snow). */
export function patchSnowSlab(m: THREE.MeshStandardMaterial): void {
  m.onBeforeCompile = sh => {
    sh.uniforms.uIce = BLDG.uIce;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aLift;\nuniform vec4 uIce;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed -= aLift.xyz * aLift.w * ( 1.0 - mix( 0.3, 1.0, uIce.x ) );');
  };
  m.customProgramCacheKey = () => 'snowslab';
}

/** Set a mesh's wear (packed, aging.packWear): one value for every vertex. */
export function setMeshWear(mesh: THREE.Mesh, v: readonly [number, number, number, number]): void {
  const g = mesh.geometry, n = g.getAttribute('position')?.count ?? 0;
  if (!n) return;
  let a = g.getAttribute('aWear') as THREE.BufferAttribute | undefined;
  if (!a || a.count !== n) { a = new THREE.BufferAttribute(new Float32Array(n * 4), 4); g.setAttribute('aWear', a); }
  const arr = a.array as Float32Array;
  if (arr[0] === v[0] && arr[1] === v[1] && arr[2] === v[2] && arr[3] === v[3] && arr[n * 4 - 1] === v[3]) return;
  for (let i = 0; i < n; i++) { arr[i * 4] = v[0]; arr[i * 4 + 1] = v[1]; arr[i * 4 + 2] = v[2]; arr[i * 4 + 3] = v[3]; }
  a.needsUpdate = true;
}

/** The kit material id of a building mesh (its shared base material's name, `kit_<id>`). */
export function kitIdOf(mesh: THREE.Mesh): string | null {
  const m = (mesh.userData.baseMat as THREE.Material | undefined) ?? (mesh.material as THREE.Material);
  return m?.name?.startsWith('kit_') ? m.name.slice(4) : null;
}
