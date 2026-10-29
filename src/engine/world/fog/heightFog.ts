/**
 * Height fog — valley fog banks that fill the low ground, and low cloud that hugs the ridgelines. One global patch of
 * three's fog chunks, so every standard material (terrain, trees, buildings, people) is fogged by the HEIGHT of what it
 * shows, with no extra geometry and no depth texture:
 *
 *   • a bank: density D for everything below a top height Y, dying off exponentially above it. The optical depth along
 *     the ray from the eye to the fragment is integrated in closed form, so from above the bank reads as a white sea
 *     whose surface follows the contours, with the hilltops standing out of it, and from inside it is a wall of white;
 *   • a cloud deck: the same thing upside down, density D above a base height, so ridges that rise into it dissolve.
 *   • both are broken up by two octaves of drifting noise (High tier only: `noise` 0 skips it), so the bank has wisps and
 *     edges instead of a flat tone, and it moves slowly across the land.
 *
 * The parameters live in ONE shared uniform set (like the weather surface patch), so a frame costs three uniform
 * uploads, and a clear day costs one uniform branch per fragment. Low quality turns the scene fog off altogether.
 * Pure data on the CPU side (`HeightFogParams`); the maths is mirrored by `opticalDepthBelow` for tests.
 */
import * as THREE from 'three';

/** What the scene gives the patch each frame. Heights are world Y (1 unit ≈ 6 m); densities per world unit. */
export interface HeightFogParams {
  /** Top of the valley bank (world Y) and its density at full (per unit; ≈ 23.5 / visibility in m). 0 = no bank. */
  bankTop: number; bankDensity: number;
  /** Cloud base (world Y) and the cloud's density. 0 = none. */
  cloudBase: number; cloudDensity: number;
  /** Noise amount 0–1 (0 = flat; the Medium tier uses a little, High more). */
  noise: number;
  /** Mist colour as a multiplier on the scene fog colour (a little brighter and cooler than the distance haze) and the clock in seconds (drift). */
  tint: [number, number, number];
  time: number;
}

export const NO_HEIGHT_FOG: HeightFogParams = { bankTop: 0, bankDensity: 0, cloudBase: 0, cloudDensity: 0, noise: 0, tint: [1.1, 1.1, 1.13], time: 0 };

/** Falloff above the bank top and below the cloud base (1 / unit): the bank top is a fairly crisp lid, the cloud base fuzzier. */
export const BANK_FALLOFF = 1.0, CLOUD_FALLOFF = 0.18;

/** Shared uniform values: plain objects, so three keeps the reference when it clones the shader library's uniforms. */
const A = { x: 0, y: 0, z: BANK_FALLOFF, w: 0 };           // bank top, bank density, falloff, time
const B = { x: 0, y: 0, z: CLOUD_FALLOFF, w: 0 };          // cloud base, cloud density, falloff, noise
const C = { x: 1.1, y: 1.1, z: 1.13, w: 0 };              // tint on the fog colour

/** Write a frame's parameters into the shared uniforms. */
export function setHeightFog(p: HeightFogParams): void {
  A.x = p.bankTop; A.y = p.bankDensity; A.w = p.time;
  B.x = p.cloudBase; B.y = p.cloudDensity; B.w = p.noise;
  C.x = p.tint[0]; C.y = p.tint[1]; C.z = p.tint[2];
}

/** Is any height fog on (QA / tests)? */
export const heightFogOn = (): boolean => A.y > 1e-4 || B.y > 1e-4;
export const heightFogUniforms = (): { a: typeof A; b: typeof B; c: typeof C } => ({ a: A, b: B, c: C });

/**
 * Optical depth along a ray of length L between heights c and f, through density D below a top yt that dies off as
 * exp(-k (y - yt)) above it (the shader's `hfBelow`, kept here so the integral is tested).
 */
export function opticalDepthBelow(c: number, f: number, L: number, yt: number, k: number, D: number): number {
  const lo = Math.min(c, f), hi = Math.max(c, f), dy = hi - lo;
  if (dy < 1e-3) return lo <= yt ? D * L : D * L * Math.exp(-k * (lo - yt));
  const Lb = L * Math.min(1, Math.max(0, (yt - lo) / dy)), La = L - Lb;
  const a = Math.max(lo, yt), up = hi - a;
  const mean = up < 1e-3 ? Math.exp(-k * (a - yt)) : (Math.exp(-k * (a - yt)) - Math.exp(-k * (hi - yt))) / (k * up);
  return D * (Lb + La * mean);
}

/** The bank's opacity for a ray (what the shader mixes in): 1 − exp(−τ). */
export const fogOpacity = (tau: number): number => 1 - Math.exp(-tau);

const PARS_VERT = /* glsl */`
#if defined( USE_FOG ) && defined( STANDARD )
  varying vec3 vFogV;
#endif
`;
const VERT = /* glsl */`
#if defined( USE_FOG ) && defined( STANDARD )
  vFogV = mvPosition.xyz;
#endif
`;
const PARS_FRAG = /* glsl */`
#if defined( USE_FOG ) && defined( STANDARD )
  uniform vec4 uHFogA;   // bank top, bank density, falloff above the top, time (s)
  uniform vec4 uHFogB;   // cloud base, cloud density, falloff below the base, noise amount
  uniform vec4 uHFogC;   // mist tint (multiplies the fog colour)
  varying vec3 vFogV;
  float hfHash( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
  float hfNoise( vec2 p ) {
    vec2 i = floor( p ); vec2 f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hfHash( i ), hfHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( hfHash( i + vec2( 0.0, 1.0 ) ), hfHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
  }
  // optical depth of density D below a top yt (exp falloff k above it) along a ray of length L between heights c and f
  float hfBelow( float c, float f, float L, float yt, float k, float D ) {
    float lo = min( c, f ); float hi = max( c, f ); float dy = hi - lo;
    if ( dy < 1e-3 ) return lo <= yt ? D * L : D * L * exp( - k * ( lo - yt ) );
    float Lb = L * clamp( ( yt - lo ) / dy, 0.0, 1.0 );
    float La = L - Lb;
    float a = max( lo, yt ); float up = hi - a;
    float mean = up < 1e-3 ? exp( - k * ( a - yt ) ) : ( exp( - k * ( a - yt ) ) - exp( - k * ( hi - yt ) ) ) / ( k * up );
    return D * ( Lb + La * mean );
  }
#endif
`;
/** The height-fog mix, to sit inside a `#ifdef USE_FOG` block after the material's own distance fog (regional terrain, far trees and farm props have their own). */
export const HEIGHT_FOG_GLSL = /* glsl */`
  #ifdef STANDARD
  if ( uHFogA.y + uHFogB.y > 1e-4 ) {
    vec3 hfW = cameraPosition + ( vec4( vFogV, 0.0 ) * viewMatrix ).xyz;   // world position of the fragment
    float hfL = length( vFogV );
    float hfNA = 1.0; float hfNB = 1.0;
    if ( uHFogB.w > 0.001 ) {
      // two octaves of slowly drifting noise at the fragment: wisps in the bank, tatters in the cloud
      vec2 q = hfW.xz * 0.022 + vec2( uHFogA.w * 0.0035, uHFogA.w * 0.0015 );
      float n = hfNoise( q ) * 0.62 + hfNoise( q * 2.7 + 11.3 ) * 0.38;
      float n2 = hfNoise( q * 0.8 + vec2( 5.0 - uHFogA.w * 0.003, 2.0 ) ) * 0.6 + hfNoise( q * 2.1 - 3.7 ) * 0.4;
      hfNA = 1.0 + uHFogB.w * ( n - 0.5 ) * 1.8;
      hfNB = 1.0 + uHFogB.w * ( n2 - 0.5 ) * 2.2;
    }
    float tau = 0.0;
    if ( uHFogA.y > 1e-4 ) tau += hfBelow( cameraPosition.y, hfW.y, hfL, uHFogA.x, uHFogA.z, uHFogA.y * max( hfNA, 0.0 ) );
    if ( uHFogB.y > 1e-4 ) tau += hfBelow( - cameraPosition.y, - hfW.y, hfL, - uHFogB.x, uHFogB.z, uHFogB.y * max( hfNB, 0.0 ) );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * uHFogC.rgb, 1.0 - exp( - tau ) );
  }
  #endif
`;
const FRAG = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogThin = mix(1.0, 0.1, smoothstep(80.0, 420.0, vFogDepth));
    float fogFactor = 1.0 - exp(- fogDensity * fogDensity * fogThin * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  ${HEIGHT_FOG_GLSL}
#endif`;

let installed = false;
/** Install the global patch (idempotent). Must run before any standard material compiles. */
export function installHeightFogPatch(): void {
  if (installed) return;
  installed = true;
  const SC = THREE.ShaderChunk as unknown as Record<string, string>;
  SC.fog_pars_vertex += PARS_VERT;
  SC.fog_vertex += VERT;
  SC.fog_pars_fragment += PARS_FRAG;
  SC.fog_fragment = FRAG;
  for (const id of ['standard', 'physical'] as const) {
    const u = THREE.ShaderLib[id].uniforms as Record<string, THREE.IUniform>;
    u.uHFogA = { value: A }; u.uHFogB = { value: B }; u.uHFogC = { value: C };
  }
}
