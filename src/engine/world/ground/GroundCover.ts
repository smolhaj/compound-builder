/**
 * GroundCover — wind-swayed grass, wildflowers, ferns, scrub, fallen leaves,
 * needles, sticks, gravel, worn dirt and loose stones around the camera's
 * focus. Three instanced draws for all of it (crossed alpha cards, flat litter
 * decals, 20-triangle stones), no shadow casting, GPU-animated (wind sway,
 * seasonal color / height / visibility and the distance fade are all in the
 * vertex shader; nothing is rebuilt for a season).
 *
 * Placement is planned in cached chunks (groundCoverPlan.ts) and the instance
 * buffers are re-composed when the focus has moved about a unit. The cover
 * shrinks into the ground with distance from the focus (`uGcFade`) and the
 * set always reaches past the fade end, so nothing pops.
 */
import * as THREE from 'three';
import { VEG_WIND } from '../trees/treeGeometry';
import { SEASON_UNIFORMS } from '../season/seasonShader';
import { seasonState } from '../season/seasonState';
import type { Quality } from '../WorldScene';
import { cardAtlas, litterAtlas, ATLAS_GRID } from './groundAtlas';
import {
  CARD_STRIDE, CHUNK, DENSITY, LITTER_STRIDE, REACH, STONE_STRIDE, flowerSeason, groundProfileFor, hexLinear, planChunk, thinHash, thinKeep,
  type ChunkPlan, type CoverSampler, type GroundProfile,
} from './groundCoverPlan';
import type { RegionKind } from '../terrain/regionalLandscape';

export interface GroundCoverConfig {
  kind: RegionKind;
  sampler: CoverSampler;
  /** The terrain's live grass colors (the cover tints from the same objects). */
  grass: THREE.Color;
  dryGrass: THREE.Color;
  /** The terrain look's dry share 0..1. */
  terrainDry: number;
}

const SEA_DECL = /* glsl */`
uniform vec4 uSeaA;
uniform vec4 uSeaB;
uniform vec4 uSeaC;
uniform vec4 uSeaD;
`;

const COMMON_PARS = /* glsl */`
attribute float aTile;
attribute float aRand;
attribute vec3 aCol;
uniform vec2 uGcCenter;
uniform vec2 uGcFade;
uniform float uGcTime;
uniform float uGcWind;
uniform float uGcFlower;
uniform float uGcEver;
uniform float uGcTerrDry;
uniform vec3 uGcGrass;
uniform vec3 uGcDry;
uniform vec3 uGcStone;
uniform float uGcGrid;
varying vec2 vGcUv;
varying vec3 vGcTint;
varying vec3 vGcFlower;
varying float vGcFlag;
varying float vGcSnow;
bool gcIs(float a) { return abs(aTile - a) < 0.5; }
float gcThin(float d, float r) {
  float t = clamp((d - 2.0) / max(0.1, uGcFade.y - 2.0), 0.0, 1.0);
  float keep = 1.0 - 0.78 * t * t * (3.0 - 2.0 * t);
  return clamp((keep + 0.08 - fract(r * 91.7 + 0.37)) / 0.1, 0.0, 1.0);
}
`;

const CARD_VERT = /* glsl */`
vec4 gcBase = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
float gcD = length(gcBase.xz - uGcCenter);
float gcFade = 1.0 - smoothstep(uGcFade.x, uGcFade.y, gcD);
float gcSnowB = uSeaB.x;
float gcDor = uSeaB.y;
float gcFall = uSeaA.x;
float gcVis = 1.0, gcHy = 1.0;
bool gcGrassy = gcIs(0.0) || gcIs(1.0) || gcIs(9.0) || gcIs(11.0);
if (gcGrassy) { gcHy = mix(1.0, 0.62, gcDor) * mix(1.0, 0.4, gcSnowB); }
else if (gcIs(2.0)) { gcVis = 0.5 + 0.5 * clamp(max(max(gcDor, gcFall), uSeaB.z) + aRand * 0.4, 0.0, 1.0); gcHy = mix(1.0, 0.8, gcSnowB); }
else if (gcIs(3.0)) { gcVis = uGcEver > 0.5 ? 1.0 - 0.25 * uSeaC.w : 1.0 - smoothstep(0.35, 0.9, gcFall * 0.8 + gcDor + aRand * 0.2); gcHy = mix(1.0, 0.35, gcSnowB * (1.0 - uGcEver)); }
else if (gcIs(4.0) || gcIs(5.0)) { gcVis = smoothstep(aRand * 0.5, aRand * 0.5 + 0.45, uGcFlower); gcHy = mix(1.0, 0.5, gcSnowB); }
else if (gcIs(10.0)) { gcVis = 1.0 - 0.55 * smoothstep(0.4, 0.95, uSeaA.y + gcDor); gcHy = mix(1.0, 0.5, gcSnowB); }
gcVis *= gcFade * gcThin(gcD, aRand);
vec3 transformed = vec3(position);
float gcH = position.y;
// wind: a travelling gust across the field plus a quick flutter, bending the upper blades along the wind
vec3 gcX = instanceMatrix[0].xyz, gcZ = instanceMatrix[2].xyz;
float gcGust = sin(uGcTime * 1.55 + gcBase.x * 0.9 + gcBase.z * 0.55) * 0.6 + sin(uGcTime * 0.7 + gcBase.x * 0.31 - gcBase.z * 0.4) * 0.4;
float gcFlut = sin(uGcTime * 5.3 + aRand * 40.0 + position.x * 4.0) * 0.25;
float gcAmp = (0.06 + 0.5 * uGcWind) * (gcGust * 0.8 + 0.35 + gcFlut * uGcWind) * 0.03 * instanceMatrix[1].y;
bool gcStiff = gcIs(6.0) || gcIs(7.0) || gcIs(8.0);
if (gcStiff) gcAmp *= 0.25;
vec3 gcDisp = vec3(0.95, 0.0, 0.3) * gcAmp * gcH * gcH;
transformed.x += dot(gcDisp, gcX) / max(dot(gcX, gcX), 1e-6);
transformed.z += dot(gcDisp, gcZ) / max(dot(gcZ, gcZ), 1e-6);
transformed.xz *= gcVis;
transformed.y *= gcVis * gcHy;
vGcUv = (vec2(mod(aTile, uGcGrid), floor(aTile / uGcGrid)) + 0.02 + vec2(uv.x, 1.0 - uv.y) * 0.96) / uGcGrid;
vGcUv.y = 1.0 - vGcUv.y;
// color: the terrain's own grass colors through the season
float gcKk = clamp(dot(uGcGrass, vec3(0.2126, 0.7152, 0.0722)) / 0.09, 0.6, 1.5);
vec3 gcG = uGcGrass * (0.82 + 0.4 * aRand);
gcG = mix(gcG, uGcDry * (0.85 + 0.25 * aRand), clamp(uGcTerrDry * 0.55 * (0.3 + aRand), 0.0, 0.9));
gcG = mix(gcG, gcG * vec3(0.92, 1.16, 0.6), uSeaA.z * 0.6);
gcG = mix(gcG, vec3(0.30, 0.22, 0.095) * gcKk * (0.85 + 0.3 * aRand), uSeaB.z * (0.4 + 0.6 * aRand) * 0.9);
gcG = mix(gcG, vec3(0.30, 0.23, 0.10) * gcKk, gcFall * 0.5);
gcG = mix(gcG, vec3(0.22, 0.19, 0.115) * gcKk * (0.93 + 0.14 * aRand), gcDor * 0.9);
vec3 gcT = gcG;
vGcFlag = 0.0; vGcFlower = aCol;
if (gcIs(2.0)) gcT = vec3(0.34, 0.27, 0.13) * (0.75 + 0.5 * aRand) * mix(1.0, 0.8, uGcTerrDry * 0.0);
else if (gcIs(3.0)) gcT = mix(vec3(0.05, 0.14, 0.035) * (0.8 + 0.4 * aRand), vec3(0.30, 0.14, 0.045), gcFall * (1.0 - uGcEver));
else if (gcIs(4.0) || gcIs(5.0)) { gcT = gcG * 0.8; vGcFlag = 1.0; }
else if (gcIs(6.0)) gcT = mix(vec3(0.13, 0.17, 0.095), uGcGrass * 0.55, 0.25) * (0.8 + 0.4 * aRand) * (1.0 - 0.12 * gcDor);
else if (gcIs(7.0)) { gcT = vec3(0.075, 0.2, 0.075) * (0.85 + 0.3 * aRand); vGcFlag = 1.0; vGcFlower = aCol; }
else if (gcIs(8.0)) gcT = vec3(0.1, 0.17, 0.085) * (0.85 + 0.3 * aRand);
else if (gcIs(10.0)) gcT = mix(gcG * 0.85, vec3(0.34, 0.12, 0.05), gcFall * 0.7 + gcDor * 0.3);
else if (gcIs(11.0)) gcT = mix(gcG * vec3(0.75, 0.9, 0.7), vec3(0.28, 0.1, 0.05), gcFall * 0.55);
// morning frost / winter rime on the blades, snow lying on the tips
gcT = mix(gcT, vec3(0.6, 0.64, 0.7), clamp(uSeaD.y * 0.55 + uSeaD.w * 0.4, 0.0, 0.7) * smoothstep(0.1, 0.9, position.y));
vGcTint = gcT;
vGcSnow = gcStiff ? 0.0 : clamp(gcSnowB * 1.15, 0.0, 1.0) * smoothstep(0.0, 0.6, position.y + 0.15);
`;

const LITTER_VERT = /* glsl */`
vec4 gcBase = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
float gcD = length(gcBase.xz - uGcCenter);
float gcFade = 1.0 - smoothstep(uGcFade.x, uGcFade.y, gcD);
float gcLeaf = max(0.2, uSeaB.w) * (1.0 - 0.5 * uSeaA.z);
float gcVis = 1.0;
vec3 gcT = vec3(1.0);
float gcDry = max(max(uSeaB.y, uSeaB.z), uSeaA.x);
if (gcIs(0.0) || gcIs(1.0)) {
  gcVis = clamp((gcLeaf - aRand) * 7.0, 0.0, 1.0);
  gcT = aCol * mix(1.0, 0.72, uSeaA.z) * (0.85 + 0.3 * aRand);
  // the fresh drop is bright; old litter is browner
  if (gcIs(1.0)) gcT = mix(gcT, gcT * vec3(0.75, 0.62, 0.5), (1.0 - uSeaA.x) * 0.7);
} else if (gcIs(2.0)) gcT = vec3(0.26, 0.15, 0.06) * (0.8 + 0.4 * aRand);
else if (gcIs(3.0)) gcT = vec3(0.17, 0.115, 0.07) * (0.8 + 0.4 * aRand);
else if (gcIs(4.0)) gcT = uGcStone * (0.8 + 0.4 * aRand) * 1.25;
else if (gcIs(5.0)) { gcT = aCol * mix(1.0, 0.5, uSeaD.z); }
else if (gcIs(6.0)) gcT = vec3(0.2, 0.12, 0.06);
else if (gcIs(7.0)) { gcVis = clamp(0.35 + gcDry * 0.8 - aRand * 0.5, 0.0, 1.0); gcT = vec3(0.36, 0.28, 0.14) * (0.8 + 0.4 * aRand); }
vGcSnow = clamp(uSeaB.x * 1.2, 0.0, 0.95);
gcVis *= gcThin(gcD, aRand);
vec3 transformed = vec3(position) * gcFade * gcVis;
vGcUv = (vec2(mod(aTile, uGcGrid), floor(aTile / uGcGrid)) + 0.02 + vec2(uv.x, 1.0 - uv.y) * 0.96) / uGcGrid;
vGcUv.y = 1.0 - vGcUv.y;
vGcTint = gcT; vGcFlag = 0.0; vGcFlower = vec3(0.0);
`;

const FRAG_PARS = /* glsl */`
uniform sampler2D uGcAtlas;
varying vec2 vGcUv;
varying vec3 vGcTint;
varying vec3 vGcFlower;
varying float vGcFlag;
varying float vGcSnow;
`;

const FRAG_MAP = /* glsl */`
vec4 gcTex = texture2D(uGcAtlas, vGcUv, -0.5);
if (gcTex.a < 0.5) discard;
vec3 gcCol = vGcTint * (0.22 + 1.0 * gcTex.r);
if (vGcFlag > 0.5) {
  float pm = smoothstep(0.55, 0.85, gcTex.g);
  float ctr = smoothstep(0.35, 0.5, gcTex.g) * (1.0 - pm);
  gcCol = mix(gcCol, vGcFlower * (0.38 + 0.55 * gcTex.r), pm);
  gcCol = mix(gcCol, vec3(0.5, 0.33, 0.02), ctr);
}
gcCol = mix(gcCol, vec3(0.80, 0.83, 0.88), vGcSnow);
diffuseColor.rgb = gcCol;
`;

type Uniforms = Record<string, THREE.IUniform>;

export class GroundCover {
  private readonly _scene: THREE.Scene;
  private readonly _u: Uniforms;
  private _cfg: GroundCoverConfig | null = null;
  private _profile: GroundProfile | null = null;
  private _quality: Quality = 'medium';
  private _cards: THREE.InstancedMesh | null = null;
  private _litter: THREE.InstancedMesh | null = null;
  private _stones: THREE.InstancedMesh | null = null;
  private _mats: THREE.Material[] = [];
  private _geos: THREE.BufferGeometry[] = [];
  private readonly _cache = new Map<string, ChunkPlan>();
  private readonly _center = new THREE.Vector2(1e9, 1e9);
  private readonly _built = new THREE.Vector2(1e9, 1e9);
  private _dirty = true;
  private _shown = true;
  private _amount = 1;
  private _wind = 0.3;
  private readonly _dir = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this._scene = scene;
    this._u = {
      uGcCenter: { value: new THREE.Vector2(1e9, 1e9) },
      uGcFade: { value: new THREE.Vector2(6, 10) },
      uGcTime: VEG_WIND,
      uGcWind: { value: 0.3 },
      uGcFlower: { value: 1 },
      uGcEver: { value: 0 },
      uGcTerrDry: { value: 0 },
      uGcGrass: { value: new THREE.Color(0x557a3a) },
      uGcDry: { value: new THREE.Color(0x8c8152) },
      uGcStone: { value: new THREE.Color(0x7a7468) },
      uGcGrid: { value: ATLAS_GRID },
    };
  }

  get visible(): boolean { return this._shown; }
  set visible(v: boolean) { this._shown = v; this._sync(); }

  /** Counts of what is drawn now (QA and the perf notes). */
  get counts(): { cards: number; litter: number; stones: number; triangles: number } {
    const c = this._cards?.count ?? 0, l = this._litter?.count ?? 0, s = this._stones?.count ?? 0;
    return { cards: c, litter: l, stones: s, triangles: c * 8 + l * 2 + s * 20 };
  }

  /** User slider (0 = off … 1 = full). */
  setAmount(a: number): void { if (a !== this._amount) { this._amount = a; this.invalidate(); } }
  setWind(w: number): void { this._wind = w; }

  configure(cfg: GroundCoverConfig): void {
    this._cfg = cfg;
    this._profile = groundProfileFor(cfg.kind);
    // the colors are read live from the terrain's own uniforms
    (this._u.uGcGrass as { value: THREE.Color }).value = cfg.grass;
    (this._u.uGcDry as { value: THREE.Color }).value = cfg.dryGrass;
    this._u.uGcTerrDry.value = cfg.terrainDry;
    this._u.uGcEver.value = this._profile.evergreenFern ? 1 : 0;
    (this._u.uGcStone.value as THREE.Color).setRGB(...hexLinear(this._profile.stoneColor));
    this.invalidate();
  }

  setQuality(q: Quality): void {
    if (q === this._quality && this._cards) return;
    this._quality = q;
    this._alloc();
  }

  /** The place changed (a building, a wall, a path): plan the nearby ground again. */
  invalidate(): void { this._cache.clear(); this._dirty = true; this._built.set(1e9, 1e9); }

  private _sync(): void {
    const on = this._shown && this._amount > 0;
    for (const m of [this._cards, this._litter, this._stones]) if (m) m.visible = on;
  }

  private _alloc(): void {
    this._free();
    if (!this._cfg) return;
    const q = this._quality, reach = REACH[q];
    this._u.uGcFade.value.set(reach.fadeStart, reach.fadeEnd);
    const area = Math.PI * (reach.fadeEnd + 1.3) * (reach.fadeEnd + 1.3), d = DENSITY[q];
    const capC = Math.ceil(d.cards * area * 0.7), capL = Math.ceil((d.litter + d.scuffs) * area * 0.7), capS = Math.max(8, Math.ceil(d.stones * area * 1.6 * (this._profile?.stoneDensity ?? 1)));

    const share = (m: THREE.MeshStandardMaterial, vert: string, atlas: THREE.Texture | null, name: string) => {
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, this._u, SEASON_UNIFORMS);
        if (atlas) sh.uniforms.uGcAtlas = { value: atlas };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\n' + SEA_DECL + COMMON_PARS)
          .replace('#include <begin_vertex>', vert);
        if (atlas) {
          sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
            .replace('#include <map_fragment>', FRAG_MAP)
            .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);');
        }
      };
      m.customProgramCacheKey = () => 'ground_cover_' + name;
    };

    // cards
    const cardGeo = cardGeometry();
    const cardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    share(cardMat, CARD_VERT, cardAtlas(), 'cards');
    this._cards = this._instanced(cardGeo, cardMat, capC, 'ground_cover_cards', true);
    // litter
    const litGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const litMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    share(litMat, LITTER_VERT, litterAtlas(), 'litter');
    this._litter = this._instanced(litGeo, litMat, capL, 'ground_cover_litter', true);
    // stones
    const stGeo = stoneGeometry();
    const stMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0, flatShading: true });
    stMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this._u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec2 uGcCenter;\nuniform vec2 uGcFade;')
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position);\n{ vec4 gb = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); transformed *= 1.0 - smoothstep(uGcFade.x, uGcFade.y, length(gb.xz - uGcCenter)); }');
    };
    stMat.customProgramCacheKey = () => 'ground_cover_stones';
    this._stones = this._instanced(stGeo, stMat, capS, 'ground_cover_stones', false);
    this._mats = [cardMat, litMat, stMat];
    this._geos = [cardGeo, litGeo, stGeo];
    this._cache.clear();
    this._dirty = true;
    this._built.set(1e9, 1e9);
    this._sync();
  }

  private _instanced(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, name: string, attrs: boolean): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(geo.clone(), mat, cap);
    if (attrs) {
      m.geometry.setAttribute('aTile', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
      m.geometry.setAttribute('aRand', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
      m.geometry.setAttribute('aCol', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
    } else {
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    }
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = true;
    m.name = name;
    m.userData = { type: 'ground_cover' };
    this._scene.add(m);
    return m;
  }

  private _free(): void {
    for (const m of [this._cards, this._litter, this._stones]) if (m) { this._scene.remove(m); m.geometry.dispose(); m.dispose(); }
    for (const m of this._mats) m.dispose();
    for (const g of this._geos) g.dispose();
    this._cards = this._litter = this._stones = null;
    this._mats = []; this._geos = [];
  }

  private _chunk(ix: number, iz: number): ChunkPlan {
    const key = ix + ',' + iz;
    let c = this._cache.get(key);
    if (!c) {
      c = planChunk(ix, iz, this._profile!, this._quality, this._cfg!.sampler, { amount: this._amount });
      this._cache.set(key, c);
      if (this._cache.size > 400) { const first = this._cache.keys().next().value; if (first !== undefined) this._cache.delete(first); }
    }
    return c;
  }

  /**
   * Per frame. `cam` is the render camera; `dt` seconds. The focus is where the
   * eye is (low) or where it looks at the ground (high).
   */
  update(dt: number, cam: THREE.Camera): void {
    if (!this._cfg || !this._cards || !this._shown || this._amount <= 0) return;
    const s = this._cfg.sampler, p = cam.position;
    const gy = s.height(p.x, p.z), h = p.y - gy;
    const reach = REACH[this._quality];
    const off = h > 140;
    for (const m of [this._cards, this._litter, this._stones]) if (m) m.visible = !off;
    if (off) return;
    cam.getWorldDirection(this._dir);
    const d = this._dir;
    const hl = Math.hypot(d.x, d.z) || 1;
    const fx = p.x + (d.x / hl) * reach.fadeEnd * 0.3, fz = p.z + (d.z / hl) * reach.fadeEnd * 0.3;
    let tx = fx, tz = fz;
    const high = THREE.MathUtils.smoothstep(h, 2.5, 9);
    if (high > 0 && d.y < -0.05) {
      const t = Math.min(h / -d.y, 90);
      tx = THREE.MathUtils.lerp(fx, p.x + d.x * t, high);
      tz = THREE.MathUtils.lerp(fz, p.z + d.z * t, high);
    }
    const first = this._center.x > 1e8;
    const k = first ? 1 : Math.min(1, dt * 5);
    this._center.x += (tx - this._center.x) * k; this._center.y += (tz - this._center.y) * k;
    (this._u.uGcCenter.value as THREE.Vector2).copy(this._center);
    this._u.uGcWind.value = this._wind;
    const sp = seasonState.params;
    this._u.uGcFlower.value = flowerSeason(sp, this._profile?.springFlowers ?? false);
    if (this._dirty || this._center.distanceToSquared(this._built) > 1.2) this._compose();
  }

  private _compose(): void {
    const cards = this._cards!, litter = this._litter!, stones = this._stones!;
    const fadeEnd = REACH[this._quality].fadeEnd, R = fadeEnd + 1.3, R2 = R * R, cx = this._center.x, cz = this._center.y;
    const i0 = Math.floor((cx - R) / CHUNK), i1 = Math.floor((cx + R) / CHUNK), j0 = Math.floor((cz - R) / CHUNK), j1 = Math.floor((cz + R) / CHUNK);
    const aT = cards.geometry.getAttribute('aTile') as THREE.InstancedBufferAttribute, aR = cards.geometry.getAttribute('aRand') as THREE.InstancedBufferAttribute, aC = cards.geometry.getAttribute('aCol') as THREE.InstancedBufferAttribute;
    const lT = litter.geometry.getAttribute('aTile') as THREE.InstancedBufferAttribute, lR = litter.geometry.getAttribute('aRand') as THREE.InstancedBufferAttribute, lC = litter.geometry.getAttribute('aCol') as THREE.InstancedBufferAttribute;
    const capC = cards.instanceMatrix.count, capL = litter.instanceMatrix.count, capS = stones.instanceMatrix.count;
    const cm = cards.instanceMatrix.array as Float32Array, lm = litter.instanceMatrix.array as Float32Array, sm = stones.instanceMatrix.array as Float32Array;
    const sc = stones.instanceColor!.array as Float32Array;
    let nc = 0, nl = 0, ns = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = this._chunk(i, j);
      const A = c.cards;
      for (let o = 0; o < A.length && nc < capC; o += CARD_STRIDE) {
        const x = A[o], z = A[o + 2], dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > R2 || thinHash(A[o + 7]) > thinKeep(Math.sqrt(d2), fadeEnd) + 0.08) continue;
        const r = A[o + 3], w = A[o + 4], hh = A[o + 5], cs = Math.cos(r), sn = Math.sin(r), m = nc * 16;
        cm[m] = cs * w; cm[m + 1] = 0; cm[m + 2] = -sn * w; cm[m + 3] = 0;
        cm[m + 4] = 0; cm[m + 5] = hh; cm[m + 6] = 0; cm[m + 7] = 0;
        cm[m + 8] = sn * w; cm[m + 9] = 0; cm[m + 10] = cs * w; cm[m + 11] = 0;
        cm[m + 12] = x; cm[m + 13] = A[o + 1]; cm[m + 14] = z; cm[m + 15] = 1;
        aT.array[nc] = A[o + 6]; aR.array[nc] = A[o + 7];
        aC.array[nc * 3] = A[o + 8]; aC.array[nc * 3 + 1] = A[o + 9]; aC.array[nc * 3 + 2] = A[o + 10];
        nc++;
      }
      const L = c.litter;
      for (let o = 0; o < L.length && nl < capL; o += LITTER_STRIDE) {
        const x = L[o], z = L[o + 2], dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > R2 || thinHash(L[o + 6]) > thinKeep(Math.sqrt(d2), fadeEnd) + 0.08) continue;
        const r = L[o + 3], size = L[o + 4], nx = L[o + 10], nz = L[o + 11], ny = Math.sqrt(Math.max(0.0001, 1 - nx * nx - nz * nz)), m = nl * 16;
        // basis lying on the slope: Y = normal, X = the heading projected onto the plane, Z = X × Y
        let hx = Math.cos(r), hz = Math.sin(r), hy = 0;
        const dp = hx * nx + hy * ny + hz * nz;
        hx -= nx * dp; hy -= ny * dp; hz -= nz * dp;
        const hl = Math.hypot(hx, hy, hz) || 1; hx /= hl; hy /= hl; hz /= hl;
        const zx = hy * nz - hz * ny, zy = hz * nx - hx * nz, zz = hx * ny - hy * nx;
        lm[m] = hx * size; lm[m + 1] = hy * size; lm[m + 2] = hz * size; lm[m + 3] = 0;
        lm[m + 4] = nx; lm[m + 5] = ny; lm[m + 6] = nz; lm[m + 7] = 0;
        lm[m + 8] = zx * size; lm[m + 9] = zy * size; lm[m + 10] = zz * size; lm[m + 11] = 0;
        lm[m + 12] = x; lm[m + 13] = L[o + 1]; lm[m + 14] = z; lm[m + 15] = 1;
        lT.array[nl] = L[o + 5]; lR.array[nl] = L[o + 6];
        lC.array[nl * 3] = L[o + 7]; lC.array[nl * 3 + 1] = L[o + 8]; lC.array[nl * 3 + 2] = L[o + 9];
        nl++;
      }
      const S = c.stones;
      for (let o = 0; o < S.length && ns < capS; o += STONE_STRIDE) {
        const x = S[o], z = S[o + 2], dx = x - cx, dz = z - cz;
        if (dx * dx + dz * dz > R2) continue;
        const r = S[o + 3], size = S[o + 4], sq = S[o + 5], cs = Math.cos(r), sn = Math.sin(r), m = ns * 16;
        sm[m] = cs * size; sm[m + 1] = 0; sm[m + 2] = -sn * size; sm[m + 3] = 0;
        sm[m + 4] = 0; sm[m + 5] = size * sq; sm[m + 6] = 0; sm[m + 7] = 0;
        sm[m + 8] = sn * size * 1.2; sm[m + 9] = 0; sm[m + 10] = cs * size * 1.2; sm[m + 11] = 0;
        sm[m + 12] = x; sm[m + 13] = S[o + 1] + size * sq * 0.25; sm[m + 14] = z; sm[m + 15] = 1;
        sc[ns * 3] = S[o + 6]; sc[ns * 3 + 1] = S[o + 7]; sc[ns * 3 + 2] = S[o + 8];
        ns++;
      }
    }
    cards.count = nc; litter.count = nl; stones.count = ns;
    for (const [m, attrs] of [[cards, [aT, aR, aC]], [litter, [lT, lR, lC]], [stones, [stones.instanceColor!]]] as Array<[THREE.InstancedMesh, THREE.BufferAttribute[]]>) {
      m.instanceMatrix.needsUpdate = true;
      for (const a of attrs) a.needsUpdate = true;
    }
    this._built.copy(this._center);
    this._dirty = false;
  }

  dispose(): void { this._free(); this._cache.clear(); }
}

/** Two crossed quads, two rows of segments each (12 verts, 8 triangles). */
export function cardGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [], nor: number[] = [];
  for (let q = 0; q < 2; q++) {
    const base = pos.length / 3;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      const u = c, v = r / 2;
      pos.push(q === 0 ? u - 0.5 : 0, v, q === 0 ? 0 : u - 0.5);
      uv.push(u, v); nor.push(0, 1, 0);
    }
    for (let r = 0; r < 2; r++) { const a = base + r * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** A lumpy 20-triangle stone, flat bottom (unit radius). */
export function stoneGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.8 + 0.35 * Math.abs(Math.sin(x * 12.9 + y * 7.3 + z * 5.1));
    p.setXYZ(i, x * k, Math.max(-0.2, y * k), z * k);
  }
  g.computeVertexNormals();
  return g;
}
