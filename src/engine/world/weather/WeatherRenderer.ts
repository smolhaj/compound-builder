/**
 * WeatherRenderer — visual-only weather layer (no game state, no save data).
 *
 *  • Runs the seeded WeatherSim (weatherState.ts) and exposes its smoothed
 *    outputs for CampusScene (overcast sky, dimmer / softer light, fog) and
 *    AgentRenderer (umbrellas).
 *  • Precipitation: one instanced draw call of camera-facing quads that the
 *    VERTEX SHADER animates and wraps inside a box around the view (zero CPU
 *    work per particle). Rain = thin motion-blurred streaks, snow = soft
 *    drifting flakes.
 *  • Surface response for EVERY MeshStandardMaterial in the scene through a
 *    global, define-guarded patch of three's physical lighting chunks:
 *      – wet: darker porous albedo, glossier surfaces, reflective puddles on
 *        flat ground (noise-masked) with animated rain ripples;
 *      – snow: lying snow on upward-facing surfaces (by world normal.y),
 *        noise-broken edges that fill in as the cover builds.
 *    The parameters live in ONE shared uniform object, so the cost is a
 *    uniform branch per fragment when the weather is dry and snow-free.
 *    Low-roughness materials (glass, water, chrome) are left alone.
 *
 * Low tier: no precipitation, no sky/fog changes (CampusCanvas passes 'off').
 */
import * as THREE from 'three';
import { WeatherSim, WEATHER_NOW, hash01, snowShownUnderRain, type WeatherMode, type WeatherOutputs } from './weatherState';
import { installSeasonShaderPatch } from '../season/seasonShader';

// ── Global surface patch ──────────────────────────────────────────────────────

/**
 * Shared uniform value: x = wetness, y = snow cover, z = rain (ripples),
 * w = time (s). A PLAIN object (not a Vector4) so three's cloneUniforms keeps
 * the reference — every standard material sees the same live values.
 */
const WX_VALUE = { x: 0, y: 0, z: 0, w: 0 };
let _patched = false;

const PARS = /* glsl */`
#ifdef STANDARD
uniform vec4 uWx;
float wxHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float wxNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( wxHash( i ), wxHash( i + vec2( 1.0, 0.0 ) ), u.x ),
              mix( wxHash( i + vec2( 0.0, 1.0 ) ), wxHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
#endif
`;

const SURFACE = /* glsl */`
#ifdef STANDARD
// Living vegetation (lawns, grass cards, crowns, shrubs) is judged on the
// summer albedo, before the season patch browns a dormant lawn: a Deep South
// winter lawn is straw-olive but still grass, and must not turn into glossy
// paving with puddles when it rains.
float wxVeg = smoothstep( 1.04, 1.22, diffuseColor.g / max( max( diffuseColor.r, diffuseColor.b ), 1e-4 ) );
#if defined( SEA_VEG ) || defined( WX_LAWN )
wxVeg = 1.0;
#endif
#endif
#include <season_surface>
#ifdef STANDARD
float wxSheen = 0.0;
if ( uWx.x + uWx.y > 0.002 ) {
  // World-space normal (after normal maps) and position, from view space.
  vec3 wxN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
  vec3 wxP = cameraPosition + ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz;
  float wxUp = clamp( wxN.y, 0.0, 1.0 );
  // Glass, water and polished metal stay as they are.
  float wxPorous = smoothstep( 0.18, 0.38, roughnessFactor );
  float wxNz = wxNoise( wxP.xz * 0.32 ) * 0.62 + wxNoise( wxP.xz * 1.9 + 17.3 ) * 0.38;

  // ── Wet surfaces ─────────────────────────────────────────────────────────
  float wxW = uWx.x * wxPorous;
  if ( wxW > 0.001 ) {
    float wxFace = 0.45 + 0.55 * wxUp;              // walls get less wet than roofs / ground
    // Wet grass and leaves: darker and a touch more saturated, with at most a
    // soft sheen (roughness stays >= 0.62). A glossy blade normal under the
    // sun read as white per-pixel glitter -- frost / snow on a rainy lawn.
    vec3 wxDark = diffuseColor.rgb * ( 1.0 - 0.38 * wxW * wxFace );
    vec3 wxVegD = diffuseColor.rgb * ( 1.0 - 0.3 * wxW * wxFace );
    vec3 wxVegC = mix( vec3( dot( wxVegD, vec3( 0.2126, 0.7152, 0.0722 ) ) ), wxVegD, 1.0 + 0.25 * wxW );
    diffuseColor.rgb = mix( wxDark, max( wxVegC, vec3( 0.0 ) ), wxVeg );
    float wxVegR = 0.62;
#ifdef SEA_VEG
    wxVegR = 0.74;   // leaves / blades: a soft wet sheen only, no glossy crowns
#endif
    float wxRough = mix( mix( roughnessFactor, 0.34, wxW * wxUp * 0.85 ), max( mix( roughnessFactor, wxVegR, wxW * 0.7 ), wxVegR ), wxVeg );
    roughnessFactor = min( roughnessFactor, wxRough );
    // Puddles: flat ground only, noise-masked, spreading as it gets wetter.
    float wxFlat = smoothstep( 0.965, 0.995, wxN.y );
    float wxPud = wxFlat * smoothstep( 0.69, 0.75, wxNz + uWx.x * 0.22 - 0.08 ) * smoothstep( 0.35, 0.85, uWx.x ) * wxPorous * ( 1.0 - wxVeg );
    if ( wxPud > 0.001 ) {
      diffuseColor.rgb *= 1.0 - 0.6 * wxPud;
      roughnessFactor = mix( roughnessFactor, 0.035, wxPud );
      metalnessFactor *= 1.0 - wxPud;
      // Rain ripples: one expanding ring per 0.7-unit cell, random phase.
      if ( uWx.z > 0.01 ) {
        vec2 wxC = wxP.xz / 0.7;
        vec2 wxI = floor( wxC );
        vec2 wxF = fract( wxC ) - 0.5 - ( vec2( wxHash( wxI + 3.1 ), wxHash( wxI + 7.7 ) ) - 0.5 ) * 0.4;
        float wxT = fract( uWx.w * 1.3 + wxHash( wxI ) );
        float wxR = length( wxF );
        float wxRing = smoothstep( 0.05, 0.0, abs( wxR - wxT * 0.45 ) ) * ( 1.0 - wxT ) * step( wxHash( wxI + 1.9 ), uWx.z );
        vec3 wxDir = normalize( vec3( wxF.x, 0.0, wxF.y ) + 1e-4 );
        vec3 wxNv = normalize( ( viewMatrix * vec4( wxDir, 0.0 ) ).xyz );
        normal = normalize( normal + wxNv * wxRing * 0.55 * wxPud );
      }
      wxSheen = wxPud;
    }
  }

  // ── Lying snow ───────────────────────────────────────────────────────────
  // seaSnowK (season patch): plowed roads / paths, bare crowns, snowbanks
  float wxS = uWx.y * wxPorous * smoothstep( 0.42, 0.8, wxUp ) * seaSnowK;
  // Plowed roads: dark, unsaturated surfaces only keep slushy patches
  float wxLum = dot( diffuseColor.rgb, vec3( 0.3, 0.55, 0.15 ) );
  float wxSat = max( diffuseColor.r, max( diffuseColor.g, diffuseColor.b ) ) - min( diffuseColor.r, min( diffuseColor.g, diffuseColor.b ) );
  wxS *= 1.0 - 0.6 * ( 1.0 - smoothstep( 0.03, 0.08, wxSat ) ) * ( 1.0 - smoothstep( 0.1, 0.2, wxLum ) );
  if ( wxS > 0.001 ) {
    float wxT = 1.0 - wxS * 1.12;
    float wxM = smoothstep( wxT - 0.07, wxT + 0.07, wxNz * 0.8 + wxUp * 0.2 );
#ifdef SEA_VEG
    // Foliage: crown-sized clumps with a soft edge (not whole tiers of flat
    // white card), never quite covering the green
    float wxNv = wxNoise( wxP.xz * 2.7 + wxP.y * 1.9 ) * 0.6 + wxNoise( wxP.xz * 7.1 - wxP.y * 3.3 ) * 0.4;
    wxM = smoothstep( wxT - 0.22, wxT + 0.22, wxNv * 0.75 + wxUp * 0.25 ) * 0.88;
#endif
    // Snowfields are not flat white: low-frequency drift brightness, wind
    // sastrugi (stretched along the prevailing wind), cool blue-gray in
    // hollows / on tilted lee faces (sky-lit), albedo kept below clipping;
    // seaSnowTint (season patch) grays plow banks and curbs.
    float wxLo = wxNoise( wxP.xz * 0.06 + 1.3 ) * 0.55 + wxNoise( wxP.xz * 0.21 + 7.9 ) * 0.45;
    float wxSa = wxNoise( vec2( wxP.x * 0.35 + wxP.z * 0.12, wxP.z * 2.6 - wxP.x * 0.9 ) );
    float wxDr = wxLo * 0.55 + wxSa * 0.25 + wxNoise( wxP.xz * 4.0 ) * 0.2;
    float wxCool = clamp( ( 1.0 - smoothstep( 0.35, 0.8, wxDr ) ) * 0.7 + ( 1.0 - smoothstep( 0.9, 0.995, wxN.y ) ) * 0.6, 0.0, 1.0 );
    vec3 wxSnow = mix( vec3( 0.80, 0.82, 0.84 ), vec3( 0.62, 0.69, 0.80 ), wxCool ) * ( 0.94 + 0.08 * wxSa ) * seaSnowTint;
    // Drift relief: tilt the normal along the drift field so low sun shades it
    if ( wxM > 0.5 ) {
      float wxE = 0.6;
      vec2 wxG = vec2( wxNoise( ( wxP.xz + vec2( wxE, 0.0 ) ) * 0.21 + 7.9 ), wxNoise( ( wxP.xz + vec2( 0.0, wxE ) ) * 0.21 + 7.9 ) ) - wxNoise( wxP.xz * 0.21 + 7.9 );
      vec3 wxBn = normalize( vec3( -wxG.x, 0.35, -wxG.y ) );
      normal = normalize( mix( normal, normalize( ( viewMatrix * vec4( wxBn, 0.0 ) ).xyz ), 0.35 * wxUp * ( wxM - 0.5 ) * 2.0 ) );
    }
    diffuseColor.rgb = mix( diffuseColor.rgb, wxSnow, wxM );
    roughnessFactor = mix( roughnessFactor, 0.82, wxM );
    metalnessFactor *= 1.0 - wxM;
    wxSheen *= 1.0 - wxM;
  }
}
#endif
`;

const SHEEN = /* glsl */`
#if defined( STANDARD ) && defined( RE_IndirectSpecular )
// Puddles mirror the sky: boost the (deliberately subtle) scene IBL there.
radiance *= 1.0 + wxSheen * 1.5;
#endif
`;

/** Install the global surface patch (idempotent). Must run before materials compile. */
export function installWeatherShaderPatch(): void {
  if (_patched) return;
  _patched = true;
  // Season patch first: it registers the season_surface chunk SURFACE includes
  installSeasonShaderPatch();
  const SC = THREE.ShaderChunk as unknown as Record<string, string>;
  SC.lights_physical_pars_fragment = PARS + SC.lights_physical_pars_fragment;
  SC.lights_physical_fragment = SURFACE + SC.lights_physical_fragment;
  SC.lights_fragment_end = SHEEN + SC.lights_fragment_end;
  for (const id of ['standard', 'physical'] as const) {
    const lib = THREE.ShaderLib[id];
    (lib.uniforms as Record<string, THREE.IUniform>).uWx = { value: WX_VALUE };
  }
}

/** Current shared surface uniform (tests / QA). */
export function getWeatherSurfaceUniform(): Readonly<typeof WX_VALUE> {
  return WX_VALUE;
}

// ── Precipitation ─────────────────────────────────────────────────────────────

const PRECIP_VERT = /* glsl */`
  attribute vec3 aSeed;
  uniform vec3 uCenter;
  uniform vec3 uBox;
  uniform float uTime;
  uniform float uSnow;
  uniform float uSize;
  uniform float uDrift;
  uniform vec2 uWind;
  varying vec2 vUv;
  varying float vFade;
  #include <fog_pars_vertex>
  void main() {
    float spd = mix( 14.0, 0.7 * uDrift, uSnow ) * ( 0.8 + 0.4 * fract( aSeed.x * 37.1 ) );   // 1 unit ≈ 6 m
    vec3 p = aSeed * uBox;
    p.y -= uTime * spd;
    p.xz += uWind * uTime * mix( 1.0, 0.7, uSnow );
    // Snow flutters sideways
    float ph = aSeed.z * 40.0;
    p.x += uSnow * sin( uTime * 1.1 + ph ) * 0.15;
    p.z += uSnow * cos( uTime * 0.9 + ph * 1.3 ) * 0.15;
    // Wrap into the box around the view (stable in world space)
    vec3 base = uCenter - uBox * 0.5;
    p = base + mod( p - base, uBox );

    vec3 toCam = cameraPosition - p;
    float dist = length( toCam );
    vec3 viewDir = toCam / max( dist, 1e-3 );
    vec3 vel = normalize( vec3( uWind.x, -spd, uWind.y ) );
    vec3 offs;
    if ( uSnow < 0.5 ) {
      // Rain streak: length along the fall direction, thin across it
      vec3 side = normalize( cross( vel, viewDir ) + 1e-5 );
      offs = vel * ( position.y - 0.5 ) * 0.5 + side * position.x * 0.012;
    } else {
      // Snow flake: small camera-facing disc
      vec3 right = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
      vec3 up = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
      float sz = ( 0.014 + 0.012 * fract( aSeed.y * 51.3 ) ) * uSize;
      offs = ( right * position.x + up * ( position.y - 0.5 ) ) * sz * 2.0;
    }
    vec3 wp = p + offs;
    vUv = vec2( position.x + 0.5, position.y );
    // Fade very close to the lens, near the box walls (wrap seams) and far off
    vec3 q = abs( p - uCenter ) / ( uBox * 0.5 );
    float edge = 1.0 - smoothstep( 0.75, 1.0, max( q.x, max( q.y, q.z ) ) );
    vFade = smoothstep( mix( 1.5, 2.5, uSnow ), mix( 6.0, 9.0, uSnow ), dist ) * edge;
    vec4 mvPosition = viewMatrix * vec4( wp, 1.0 );
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const PRECIP_FRAG = /* glsl */`
  uniform float uSnow;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying float vFade;
  #include <fog_pars_fragment>
  void main() {
    float a;
    if ( uSnow < 0.5 ) {
      float across = 1.0 - abs( vUv.x * 2.0 - 1.0 );
      a = across * across * smoothstep( 0.0, 0.35, vUv.y ) * smoothstep( 1.0, 0.6, vUv.y );
    } else {
      vec2 d = vUv - 0.5;
      a = smoothstep( 0.25, 0.08, dot( d, d ) );
    }
    a *= vFade * uOpacity;
    if ( a < 0.004 ) discard;
    gl_FragColor = vec4( uColor, a );
    #include <fog_fragment>
  }
`;

// ── Fog banks ─────────────────────────────────────────────────────────────────
// Five stacked horizontal sheets of drifting noise just above the ground: from
// the air a fog bank lying over the campus and the water, from eye level a
// gray wall that thickens toward the horizon. One draw call, hidden unless
// the fog is up. Fades round the camera so it never reads as a slab when the
// eye sits inside a layer.
const BANK_VERT = /* glsl */`
  varying vec3 vW;
  varying float vLayer;
  #include <fog_pars_vertex>
  void main() {
    vLayer = position.y;
    vec4 wp = modelMatrix * vec4(position.x, position.y * 0.55 + 0.25, position.z, 1.0);
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const BANK_FRAG = /* glsl */`
  uniform float uBank;
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uCenter;
  uniform float uRadius;
  varying vec3 vW;
  varying float vLayer;
  float bh( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
  float bn( vec2 p ) { vec2 i = floor( p ); vec2 f = fract( p ); vec2 u = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( bh( i ), bh( i + vec2( 1.0, 0.0 ) ), u.x ), mix( bh( i + vec2( 0.0, 1.0 ) ), bh( i + vec2( 1.0, 1.0 ) ), u.x ), u.y ); }
  void main() {
    vec2 q = vW.xz * 0.045 + vec2( uTime * 0.012, uTime * 0.005 ) + vLayer * 3.7;
    float n = bn( q ) * 0.55 + bn( q * 2.3 + 5.1 ) * 0.3 + bn( q * 5.9 - 2.7 ) * 0.15;
    float a = smoothstep( 0.32, 0.78, n ) * uBank * ( 0.26 - vLayer * 0.035 );
    // Thin out at the edge of the sheet and right round the eye
    float r = length( vW.xz - uCenter.xz ) / uRadius;
    a *= 1.0 - smoothstep( 0.6, 1.0, r );
    float e = length( vW - cameraPosition );
    a *= smoothstep( 2.0, 9.0, e );
    if ( a < 0.003 ) discard;
    gl_FragColor = vec4( uColor, a );
  }
`;

/** Max precipitation particles per quality tier (instance count scales with intensity). */
const PRECIP_MAX: Record<'high' | 'medium' | 'low', number> = { high: 5000, medium: 2800, low: 0 };

export interface WeatherFrameInput {
  /** Real seconds since last frame. */
  dt: number;
  /** Game speed multiplier (weather spells advance with the visual day). */
  speed: number;
  season: string;
  /** Visual hour of day 0–24. */
  hour: number;
  mode: WeatherMode;
  /** Event-driven wetness from CampusScene (storm notifications etc.). */
  eventWetness: number;
  /** 0 = day … 1 = night (precipitation tint). */
  night: number;
  camera: THREE.PerspectiveCamera;
  /** Point the camera orbits (precipitation box sits between it and the camera). */
  focus: { x: number; z: number };
  /** Seasonal lying snow (season/seasonState) — the floor under the weather's own cover. */
  snowBase?: number;
  /** Share of the weather's own snow cover that lies (region climate; 0 = never). */
  snowAllow?: number;
  /** Campus region (location id): regional spell weights (weatherState REGION_WEATHER). */
  region?: string;
  /** Fog-bank strength for the site (PNW sound / river valleys thicker). Default 1. */
  fogBankScale?: number;
  /** The sim's valley bank (fog/ValleyFog.ts): sheets of drifting mist ride its top (world Y) at this opacity 0–1, instead of lying on the ground. */
  valleyBank?: { y: number; amount: number } | null;
  /** 0-1: the camera stands in the valley bank or the low cloud (fog/ValleyFog.nearMist): fine mist droplets drift past the lens. */
  mist?: number;
}

export class WeatherRenderer {
  readonly sim: WeatherSim;
  private readonly _scene: THREE.Scene;
  private _quality: 'high' | 'medium' | 'low' = 'high';
  private _time = 0;
  private readonly _geo: THREE.InstancedBufferGeometry;
  private readonly _mat: THREE.ShaderMaterial;
  private readonly _mesh: THREE.Mesh;
  private readonly _center = new THREE.Vector3();
  private readonly _tmp = new THREE.Vector3();
  /** Lightning flash level (0–1), decays quickly — lights the whole scene (strikes near by). */
  private _flash = 0;
  private _nextFlash = 6;
  private _flashSeq = 0;
  /** Sky-only lightning: in-cloud flicker and visible bolts (near or in a distant cell). */
  private _skyFlash = 0;
  private _bolt = 0;
  private _boltAz = 0;
  private _boltSeed = 0;
  private _boltT = 0;
  private _nextDistant = 4;
  /** Fog bank sheets (one draw call). */
  private readonly _bankGeo: THREE.BufferGeometry;
  private readonly _bankMat: THREE.ShaderMaterial;
  private readonly _bank: THREE.Mesh;

  // Each session draws its own weather (visual only; tests seed WeatherSim directly)
  constructor(scene: THREE.Scene, seed = (Math.random() * 0x7fffffff) | 0) {
    installWeatherShaderPatch();
    this._scene = scene;
    this.sim = new WeatherSim(seed);

    const n = PRECIP_MAX.high;
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0);  // x ∈ [-0.5, 0.5], y ∈ [0, 1]
    this._geo = new THREE.InstancedBufferGeometry();
    this._geo.index = quad.index;
    this._geo.setAttribute('position', quad.getAttribute('position'));
    const seeds = new Float32Array(n * 3);
    let s = 0x2545f491;
    for (let i = 0; i < seeds.length; i++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      seeds[i] = ((s >>> 0) % 100000) / 100000;
    }
    this._geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));
    this._geo.instanceCount = 0;

    this._mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uCenter: { value: new THREE.Vector3() },
          uBox: { value: new THREE.Vector3(32, 18, 32) },
          uTime: { value: 0 },
          uSnow: { value: 0 },
          uSize: { value: 1 },
          uDrift: { value: 1 },
          uWind: { value: new THREE.Vector2(2.2, 0.9) },
          uOpacity: { value: 0 },
          uColor: { value: new THREE.Color(0.75, 0.8, 0.88) },
        },
      ]),
      vertexShader: PRECIP_VERT,
      fragmentShader: PRECIP_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this._mesh = new THREE.Mesh(this._geo, this._mat);
    this._mesh.frustumCulled = false;
    this._mesh.visible = false;
    this._mesh.renderOrder = 10;
    this._mesh.userData = { type: 'weather_precip', noSSAO: true, sim: this.sim };
    scene.add(this._mesh);

    // Fog banks: 5 sheets 260 × 260 (y = layer index, remapped in the shader)
    const sheets: THREE.BufferGeometry[] = [];
    for (let l = 0; l < 5; l++) {
      const g = new THREE.PlaneGeometry(260, 260, 1, 1);
      g.rotateX(-Math.PI / 2);
      g.translate(0, l, 0);
      sheets.push(g);
    }
    const pos: number[] = [];
    const idx: number[] = [];
    for (const g of sheets) {
      const base = pos.length / 3;
      pos.push(...(g.getAttribute('position').array as Float32Array));
      for (const i of g.index!.array as Uint16Array) idx.push(base + i);
      g.dispose();
    }
    this._bankGeo = new THREE.BufferGeometry();
    this._bankGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this._bankGeo.setIndex(idx);
    this._bankMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uBank: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(0.7, 0.72, 0.75) },
          uCenter: { value: new THREE.Vector3() }, uRadius: { value: 130 },
        },
      ]),
      vertexShader: BANK_VERT,
      fragmentShader: BANK_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this._bank = new THREE.Mesh(this._bankGeo, this._bankMat);
    this._bank.frustumCulled = false;
    this._bank.visible = false;
    this._bank.renderOrder = 9;
    this._bank.userData = { type: 'weather_fogbank', noSSAO: true };
    scene.add(this._bank);
  }

  /** Sky-only lightning for the sky dome (CampusScene.setWeather's third argument). */
  get skyLightning(): { flash: number; bolt: number; boltAz: number; boltSeed: number; stormAz: number } {
    return { flash: this._skyFlash, bolt: this._bolt, boltAz: this._boltAz, boltSeed: this._boltSeed, stormAz: this.sim.stormAz };
  }

  setQuality(q: 'high' | 'medium' | 'low'): void {
    this._quality = q;
  }

  /** Current smoothed weather. */
  get outputs(): WeatherOutputs { return this.sim.out; }
  /** Lightning flash level 0–1. */
  get flash(): number { return this._flash; }

  update(f: WeatherFrameInput): WeatherOutputs {
    const low = this._quality === 'low';
    const mode: WeatherMode = low ? 'off' : f.mode;
    const vdt = f.dt * Math.max(1, f.speed || 1);
    if (f.region !== undefined) this.sim.region = f.region;
    const o = this.sim.update(vdt, f.season, f.hour, mode);
    this._time = (this._time + f.dt) % 3600;
    WEATHER_NOW.kind = mode === 'off' ? 'clear' : mode === 'auto' ? this.sim.kind : mode;
    WEATHER_NOW.mode = mode;

    // ── Surface uniform ──────────────────────────────────────────────────────
    WX_VALUE.x = Math.min(1, Math.max(o.wetness, f.eventWetness * 0.75));
    // Rain washes lying snow off: a rainy scene never shows snow
    WX_VALUE.y = snowShownUnderRain(Math.max(o.snowCover * (f.snowAllow ?? 1), f.snowBase ?? 0), o.rain, mode);
    WX_VALUE.z = o.rain;
    WX_VALUE.w = this._time;

    // ── Lightning ────────────────────────────────────────────────────────────
    // Near strikes (storm overhead) flash the whole scene and draw a bolt;
    // a distant cell flickers inside its anvil with the odd bolt under it.
    this._flash = Math.max(0, this._flash - f.dt * 4.5);
    this._skyFlash = Math.max(0, this._skyFlash - f.dt * 5);
    this._boltT -= f.dt;
    // the bolt flickers (return strokes) for ~0.35 s
    this._bolt = this._boltT > 0 ? (Math.sin(this._boltT * 60) > -0.3 ? 1 : 0.25) * Math.min(1, this._boltT / 0.1) : 0;
    if (!low && o.storm > 0.6 && o.rain > 0.6) {
      this._nextFlash -= f.dt;
      if (this._nextFlash <= 0) {
        this._flashSeq++;
        const r = hash01(this._flashSeq, 91);
        this._flash = 0.7 + 0.3 * r;
        this._skyFlash = 1;
        if (r < 0.6) this._strike(this.sim.stormAz + (hash01(this._flashSeq, 7) - 0.5) * 4.5);
        this._nextFlash = 4 + r * 10;
      }
    }
    if (!low && o.distantStorm > 0.25) {
      this._nextDistant -= f.dt;
      if (this._nextDistant <= 0) {
        this._flashSeq++;
        const r = hash01(this._flashSeq, 33);
        this._skyFlash = Math.max(this._skyFlash, 0.5 + 0.5 * r);
        if (r < 0.35) this._strike(this.sim.stormAz + (hash01(this._flashSeq, 13) - 0.5) * 0.3);
        // flickers come in bursts: often a quick second flash
        this._nextDistant = r < 0.4 ? 0.25 + r : 2.5 + r * 7 / Math.max(0.4, o.distantStorm);
      }
    }

    // ── Fog banks ────────────────────────────────────────────────────────────
    const vb = f.valleyBank;
    const bank = low ? 0 : vb ? vb.amount : Math.max(0, Math.min(1, (o.fog - 0.2) / 0.6)) * (f.fogBankScale ?? 1);
    this._bank.visible = bank > 0.01;
    if (this._bank.visible) {
      const bu = this._bankMat.uniforms;
      bu.uBank.value = bank;
      bu.uTime.value = this._time;
      const fog = this._scene.fog as THREE.FogExp2 | null;
      if (fog) (bu.uColor.value as THREE.Color).copy(fog.color).multiplyScalar(1.08);
      this._bank.position.set(f.focus.x, vb ? vb.y - 0.9 : 0, f.focus.z);
      (bu.uCenter.value as THREE.Vector3).set(f.focus.x, 0, f.focus.z);
    }

    // ── Precipitation particles ──────────────────────────────────────────────
    const precip = mode === 'snow' ? o.snow : mode === 'rain' ? o.rain : Math.max(o.rain, o.snow);
    // mist: where there is no rain or snow, a fog the camera stands in sends fine droplets drifting past (the snow-flake draw, a third the size, hardly falling)
    const mist = low ? 0 : (f.mist ?? 0), misty = mist > 0.05 && precip < 0.05;
    const amount = misty ? mist * 0.3 : precip;
    const max = PRECIP_MAX[this._quality];
    const count = Math.floor(max * Math.min(1, amount * 1.15 + o.wind * 0.1));
    if (count < 30 || low) {
      this._mesh.visible = false;
      return o;
    }
    // A forced Settings mode decides the particle type outright: while the
    // sim eases from a previous rain spell into forced snow (or the season
    // isn't winter) the lingering rain must not win and draw rain streaks.
    const snowy = misty ? true : mode === 'snow' ? true : mode === 'rain' ? false : o.snow > o.rain;
    const u = this._mat.uniforms;
    u.uTime.value = this._time;
    u.uSnow.value = snowy ? 1 : 0;
    u.uSize.value = misty ? 0.4 : 1;
    u.uDrift.value = misty ? 0.25 : 1;
    u.uOpacity.value = misty ? 0.35 : snowy ? 0.9 : 0.3 + 0.2 * o.rain;
    // Light level: precipitation is lit by the (dim, overcast) sky
    const lit = 1 - 0.8 * f.night;
    (u.uColor.value as THREE.Color).setRGB(
      (snowy ? 0.95 : 0.70) * lit + this._flash * 0.6,
      (snowy ? 0.96 : 0.75) * lit + this._flash * 0.6,
      (snowy ? 1.0 : 0.84) * lit + this._flash * 0.6,
    );
    // Wind: rain slants in a gust front; snow squalls drive the flakes sideways
    (u.uWind.value as THREE.Vector2).set(snowy ? 0.3 + o.wind * 2.6 : 1.1 + o.rain * 1.2 + o.wind * 1.6, snowy ? 0.15 + o.wind * 0.8 : 0.5 + o.wind * 0.5);
    // Box between the camera and what it looks at, so the near view fills
    const cam = f.camera;
    const dist = cam.position.distanceTo(this._tmp.set(f.focus.x, 0, f.focus.z));
    const along = Math.min(dist * 0.45, 18);
    cam.getWorldDirection(this._center).multiplyScalar(along).add(cam.position);
    (u.uCenter.value as THREE.Vector3).copy(this._center);
    this._geo.instanceCount = count;
    this._mesh.visible = true;
    return o;
  }

  /** Start a visible lightning bolt at an azimuth (radians). */
  private _strike(az: number): void {
    this._boltT = 0.35;
    this._boltAz = az;
    this._boltSeed = (this._boltSeed + 17.3) % 997;
  }

  dispose(): void {
    this._scene.remove(this._bank);
    this._bankGeo.dispose();
    this._bankMat.dispose();
    this._scene.remove(this._mesh);
    this._geo.dispose();
    this._mat.dispose();
    WX_VALUE.x = WX_VALUE.y = WX_VALUE.z = 0;
  }
}
