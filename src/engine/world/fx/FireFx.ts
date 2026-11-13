/**
 * FireFx — flames, embers and a rising smoke plume for up to MAX_FIRES burning (or smoldering) places, in TWO draw calls however many fires
 * there are: one additive Points (flame tongues, flying embers, a ground glow per fire) and one normally-blended Points (the plume). Every
 * particle is animated by the vertex shader from its own phase (no CPU work per particle); a fire is a row of the uSrc / uPar uniform arrays.
 * Procedural sprites, no assets; point-sprite triangles are zero (Points). Hidden (visible=false, zero cost) when nothing burns.
 *
 *   intensity  0-1: how hard it burns (flame height and count follow it)
 *   smolder    0-1: a burned-out ruin: thin grey smoke, a few dull embers, no flame
 *
 * Quality keeps a share of the particles (High all, Medium 60 %, Low 35 %). Scale v2: 1 unit ≈ 6 m.
 */
import * as THREE from 'three';

export const MAX_FIRES = 8;
const N_FLAME = 26, N_EMBER = 12, N_GLOW = 1, N_SMOKE = 14;
const PER_FIRE = N_FLAME + N_EMBER + N_GLOW;

export interface FireSource {
  /** World position of the seat of the fire (the roofline of a burning building, the ground of a ruin). */
  x: number; y: number; z: number;
  /** Half-width of the burning area (world units). */
  radius: number;
  /** Flame height at full intensity (world units). */
  height: number;
  intensity: number;
  smolder: number;
}

let _sprite: THREE.Texture | null = null;
function sprite(): THREE.Texture {
  if (_sprite) return _sprite;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _sprite = new THREE.CanvasTexture(c);
  return _sprite;
}

const COMMON = /* glsl */`
  uniform vec4 uSrc[${MAX_FIRES}];
  uniform vec4 uPar[${MAX_FIRES}];
  uniform float uTime; uniform float uScale; uniform vec2 uWind; uniform float uKeep; uniform float uDay;
  attribute float aFire; attribute float aSeed; attribute float aIdx;
  float h1( float n ) { return fract( sin( n * 12.9898 ) * 43758.5453 ); }
`;

const FIRE_VERT = /* glsl */`
  ${COMMON}
  attribute float aKind;
  varying float vA; varying vec3 vC; varying float vKind;
  void main() {
    int fi = int( aFire + 0.5 );
    vec4 s = uSrc[fi]; vec4 q = uPar[fi];
    float I = q.y, S = q.z;
    vec3 p = s.xyz;
    float size = 0.0; float a = 0.0; vec3 col = vec3( 1.0 );
    vKind = aKind;
    bool keep = aIdx < uKeep;
    if ( aKind < 0.5 ) {
      // flame tongue: rises from the seat, narrows, leans downwind
      float life = fract( aSeed * 7.31 + uTime * ( 1.1 + 0.7 * h1( aSeed * 3.0 ) ) );
      float ang = aSeed * 6.2831 * 13.0;
      float rr = sqrt( fract( aSeed * 17.7 ) ) * s.w * ( 1.0 - 0.55 * life );
      p.x += cos( ang ) * rr; p.z += sin( ang ) * rr;
      float hgt = q.x * ( 0.3 + 0.9 * I );
      p.y += life * hgt;
      p.x += sin( uTime * 7.0 + aSeed * 40.0 ) * 0.025 * life * s.w * 4.0 + uWind.x * life * life * hgt * 3.0;
      p.z += cos( uTime * 6.0 + aSeed * 31.0 ) * 0.025 * life * s.w * 4.0 + uWind.y * life * life * hgt * 3.0;
      size = s.w * ( 1.15 - 0.75 * life ) * ( 0.7 + 0.7 * I ) * 1.5;
      a = smoothstep( 0.0, 0.08, life ) * ( 1.0 - smoothstep( 0.5, 1.0, life ) ) * smoothstep( 0.03, 0.3, I ) * 0.85;
      col = mix( vec3( 1.0, 0.88, 0.45 ), vec3( 1.0, 0.3, 0.05 ), pow( life, 0.7 ) ) * 1.15;
    } else if ( aKind < 1.5 ) {
      // ember: a bright speck that flies up and downwind, flickering
      float life = fract( aSeed * 5.17 + uTime * ( 0.22 + 0.16 * h1( aSeed * 9.0 ) ) );
      float ang = aSeed * 6.2831 * 29.0;
      float rr = sqrt( fract( aSeed * 23.3 ) ) * s.w;
      p.x += cos( ang ) * rr; p.z += sin( ang ) * rr;
      float act = max( smoothstep( 0.12, 0.5, I ), smoothstep( 0.25, 0.7, S ) * 0.45 );
      float rise = ( 0.25 + life * ( q.x * 1.8 + 0.7 ) ) * mix( 0.35, 1.0, smoothstep( 0.1, 0.6, I ) );
      p.y += rise;
      p.xz += uWind * life * life * 14.0 * ( 0.5 + I ) + vec2( sin( uTime * 2.0 + aSeed * 50.0 ), cos( uTime * 1.7 + aSeed * 37.0 ) ) * 0.08 * life;
      size = 0.022;
      a = act * ( 1.0 - life ) * smoothstep( 0.0, 0.05, life ) * ( 0.55 + 0.45 * sin( uTime * 18.0 + aSeed * 90.0 ) );
      col = mix( vec3( 1.0, 0.75, 0.3 ), vec3( 1.0, 0.25, 0.04 ), life ) * 1.6;
    } else {
      // ground glow: one big soft orange pool of light on the ground round the fire
      p.y = s.y - q.x * 0.45;
      size = s.w * 7.0 * ( 0.6 + 0.4 * I );
      a = smoothstep( 0.05, 0.4, I ) * 0.2 * ( 0.8 + 0.2 * sin( uTime * 9.0 + aFire * 3.0 ) + 0.1 * sin( uTime * 23.0 ) ) * ( 0.5 + 1.1 * ( 1.0 - uDay ) );
      col = vec3( 1.0, 0.42, 0.1 );
    }
    if ( ! keep ) a = 0.0;
    vec4 mv = modelViewMatrix * vec4( p, 1.0 );
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min( max( uScale * size / -mv.z, aKind > 0.5 && aKind < 1.5 ? 2.0 : 0.0 ), 230.0 );
    vA = a; vC = col;
    if ( a < 0.002 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
  }
`;

const FIRE_FRAG = /* glsl */`
  uniform sampler2D uMap;
  varying float vA; varying vec3 vC; varying float vKind;
  void main() {
    float t = texture2D( uMap, gl_PointCoord ).a;
    if ( vKind > 0.5 && vKind < 1.5 ) t = t * t;
    float a = t * vA;
    if ( a < 0.004 ) discard;
    gl_FragColor = vec4( vC * a, a );
  }
`;

const SMOKE_VERT = /* glsl */`
  ${COMMON}
  varying float vA; varying vec3 vC;
  void main() {
    int fi = int( aFire + 0.5 );
    vec4 s = uSrc[fi]; vec4 q = uPar[fi];
    float I = q.y, S = q.z;
    float life = fract( aSeed + uTime * ( 0.075 + 0.03 * I ) );
    float cap = max( I, S * 0.5 );
    float rise = life * ( q.x * 2.4 + 1.4 + 2.2 * I ) * ( 0.85 + 0.3 * h1( aSeed * 5.0 ) );
    vec3 p = s.xyz;
    float ang = aSeed * 6.2831 * 11.0;
    p.x += cos( ang ) * s.w * 0.6 * ( 1.0 - life * 0.5 ); p.z += sin( ang ) * s.w * 0.6 * ( 1.0 - life * 0.5 );
    p.y += rise;
    p.xz += uWind * life * life * ( 22.0 + 20.0 * I ) + vec2( sin( life * 8.0 + aSeed * 30.0 ), cos( life * 6.0 + aSeed * 20.0 ) ) * 0.1 * life;
    float size = ( s.w * 1.1 + life * ( s.w * 2.6 + 0.35 + 0.5 * I ) );
    vec4 mv = modelViewMatrix * vec4( p, 1.0 );
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min( uScale * size / -mv.z, 230.0 );
    float live = aIdx < uKeep ? 1.0 : 0.0;
    vA = cap * live * smoothstep( 0.0, 0.07, life ) * ( 1.0 - smoothstep( 0.35, 1.0, life ) ) * mix( 0.5, 0.78, I ) * step( 0.02, cap );
    // soot-dark where it burns, a light grey for a smolder; lit by the day, warm underneath by the flames at night
    vec3 base = mix( vec3( 0.44, 0.43, 0.42 ), vec3( 0.12, 0.11, 0.105 ), smoothstep( 0.1, 0.7, I ) );
    float lit = 0.22 + 0.78 * uDay;
    vC = base * lit + vec3( 0.55, 0.2, 0.05 ) * I * ( 1.0 - life ) * ( 1.0 - life ) * ( 0.25 + 0.75 * ( 1.0 - uDay ) );
    if ( vA < 0.002 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
  }
`;

const SMOKE_FRAG = /* glsl */`
  uniform sampler2D uMap;
  varying float vA; varying vec3 vC;
  void main() {
    float a = texture2D( uMap, gl_PointCoord ).a * vA;
    if ( a < 0.004 ) discard;
    gl_FragColor = vec4( vC, a );
  }
`;

export class FireFx {
  readonly fire: THREE.Points;
  readonly smoke: THREE.Points;
  private readonly _u: Record<string, THREE.IUniform>;
  private readonly _src = Array.from({ length: MAX_FIRES }, () => new THREE.Vector4());
  private readonly _par = Array.from({ length: MAX_FIRES }, () => new THREE.Vector4());
  private _keep = 1;

  constructor() {
    this._u = {
      uSrc: { value: this._src }, uPar: { value: this._par },
      uTime: { value: 0 }, uScale: { value: 800 }, uWind: { value: new THREE.Vector2() }, uKeep: { value: 1 }, uDay: { value: 1 },
      uMap: { value: sprite() },
    };
    const nF = MAX_FIRES * PER_FIRE;
    const fa = new Float32Array(nF), sd = new Float32Array(nF), ix = new Float32Array(nF), kd = new Float32Array(nF);
    for (let f = 0; f < MAX_FIRES; f++) for (let i = 0; i < PER_FIRE; i++) {
      const k = f * PER_FIRE + i;
      fa[k] = f; sd[k] = (i * 0.61803 + f * 0.37) % 1 + 0.0001; kd[k] = i < N_FLAME ? 0 : i < N_FLAME + N_EMBER ? 1 : 2;
      // (the share kept at a lower tier: spread evenly through each kind)
      ix[k] = kd[k] === 0 ? (i + 0.5) / N_FLAME : kd[k] === 1 ? (i - N_FLAME + 0.5) / N_EMBER : 0;
    }
    const gf = new THREE.BufferGeometry();
    gf.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nF * 3), 3));
    gf.setAttribute('aFire', new THREE.BufferAttribute(fa, 1));
    gf.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    gf.setAttribute('aIdx', new THREE.BufferAttribute(ix, 1));
    gf.setAttribute('aKind', new THREE.BufferAttribute(kd, 1));
    const nS = MAX_FIRES * N_SMOKE;
    const sf = new Float32Array(nS), ss = new Float32Array(nS), si = new Float32Array(nS);
    for (let f = 0; f < MAX_FIRES; f++) for (let i = 0; i < N_SMOKE; i++) { const k = f * N_SMOKE + i; sf[k] = f; ss[k] = (i + 0.37 * f) / N_SMOKE % 1 + 0.0001; si[k] = (i + 0.5) / N_SMOKE; }
    const gs = new THREE.BufferGeometry();
    gs.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nS * 3), 3));
    gs.setAttribute('aFire', new THREE.BufferAttribute(sf, 1));
    gs.setAttribute('aSeed', new THREE.BufferAttribute(ss, 1));
    gs.setAttribute('aIdx', new THREE.BufferAttribute(si, 1));
    const mk = (g: THREE.BufferGeometry, v: string, fr: string, additive: boolean, order: number, type: string): THREE.Points => {
      const m = new THREE.ShaderMaterial({
        uniforms: this._u, vertexShader: v, fragmentShader: fr, transparent: true, depthWrite: false, fog: false,
        blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
        ...(additive ? { blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor } : {}),
      });
      const p = new THREE.Points(g, m);
      p.frustumCulled = false; p.renderOrder = order; p.visible = false;
      p.userData = { type, noSSAO: true };
      return p;
    };
    this.smoke = mk(gs, SMOKE_VERT, SMOKE_FRAG, false, 4, 'fire_smoke');
    this.fire = mk(gf, FIRE_VERT, FIRE_FRAG, true, 5, 'fire_flames');
  }

  setQuality(q: 'high' | 'medium' | 'low'): void { this._keep = q === 'high' ? 1 : q === 'medium' ? 0.6 : 0.35; }

  /** Add both draws to a scene / group. */
  addTo(parent: THREE.Object3D): void { parent.add(this.smoke, this.fire); }

  /** `wind`: world units/s on x, z (the smoke plume's). `daylight` 0 (night) – 1. */
  update(time: number, sources: readonly FireSource[], windX: number, windZ: number, daylight: number, viewportH: number): void {
    const n = Math.min(MAX_FIRES, sources.length);
    for (let i = 0; i < MAX_FIRES; i++) {
      const s = sources[i];
      if (i < n && s) { this._src[i].set(s.x, s.y, s.z, Math.max(0.05, s.radius)); this._par[i].set(Math.max(0.1, s.height), s.intensity, s.smolder, 0); }
      else { this._src[i].set(0, -1e4, 0, 0.05); this._par[i].set(0.1, 0, 0, 0); }
    }
    const u = this._u;
    u.uTime.value = time;
    (u.uWind.value as THREE.Vector2).set(windX, windZ);
    u.uKeep.value = this._keep;
    u.uDay.value = Math.max(0, Math.min(1, daylight));
    u.uScale.value = viewportH * 1.2;
    this.fire.visible = this.smoke.visible = n > 0;
  }

  dispose(): void {
    for (const p of [this.fire, this.smoke]) { p.parent?.remove(p); p.geometry.dispose(); (p.material as THREE.Material).dispose(); }
  }
}
