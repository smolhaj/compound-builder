/**
 * WaterEdgeRenderer — life along the water's edge, instanced:
 *
 *   reeds    cattail / bulrush stands in the shallows of still water and slow
 *            river reaches (≈ 1.5–2.3 m: 0.25–0.38 u), clumped in stands with
 *            gaps, swaying in the wind (vertex shader), straw-coloured in
 *            fall / winter;
 *   rushes   lower, finer clumps on the damp bank just above the waterline;
 *   pebbles  flat river stones on the bank where the current runs, plus the
 *            mid-stream boulders the flow field already foams around;
 *   lilies   lily-pad colonies (some flowering) on still, sheltered water;
 *   willows  weeping willows on a few banks (≈ 10–14 m: 1.7–2.4 u).
 *
 * Modelled water (buildShore): placed against the site adapter (EdgeSite) —
 * never on structures or paths; willows keep clear of existing trees.
 * Regional water: reed fringes along still / slow shores near the town.
 *
 * 5 draw calls at most per instance of this renderer; no shadow casting
 * except willows on High. Low: reeds + lilies only, thinned.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WATER_GLOBALS } from './waterShading';

type Quality = 'high' | 'medium' | 'low';

function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Smooth value noise (clumping stands / colonies). */
function vnoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ── Geometry (unit-sized; instances scale them) ────────────────────────────

function colorize(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => [number, number, number]): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  const p = ng.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = fn(p.getX(i), p.getY(i), p.getZ(i));
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  ng.setAttribute('aEdge', new THREE.BufferAttribute(col, 3));
  if (ng.attributes.uv) ng.deleteAttribute('uv');
  return ng;
}

/**
 * A clump of tapered blades (each a 2-segment bent triangle strip) radiating
 * from a small base, height 1, radius ≈ 0.5; `heads` adds cattail spikes.
 * Vertex colour: darker at the base (AO), lighter tips; heads dark brown
 * (blue channel flag 0 → the shader keeps them out of the season tint).
 */
function reedClumpGeometry(blades: number, heads: number, seed: number, bend: number): THREE.BufferGeometry {
  const r = rng(seed);
  const pos: number[] = [];
  const col: number[] = [];
  const push = (x: number, y: number, z: number, c: number, head = 0): void => {
    pos.push(x, y, z);
    col.push(c, head, 1 - head);
  };
  for (let b = 0; b < blades; b++) {
    const a = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * 0.32;
    const bx = Math.cos(a) * rad, bz = Math.sin(a) * rad;
    const h = 0.55 + 0.45 * r();
    const lean = (0.08 + r() * bend) * h;
    const la = a + (r() - 0.5) * 0.8;
    const lx = Math.cos(la) * lean, lz = Math.sin(la) * lean;
    const w = 0.035 + 0.025 * r();
    // blade plane faces a random direction
    const fa = r() * Math.PI;
    const wx = Math.cos(fa) * w, wz = Math.sin(fa) * w;
    const mid = 0.55;
    const m = (t: number): [number, number, number] => [bx + lx * t * t, h * t, bz + lz * t * t];
    const p0 = m(0), p1 = m(mid), p2 = m(1);
    const s1 = 0.7;
    // base quad (2 tris) + tip triangle
    push(p0[0] - wx, p0[1], p0[2] - wz, 0.45); push(p0[0] + wx, p0[1], p0[2] + wz, 0.45); push(p1[0] + wx * s1, p1[1], p1[2] + wz * s1, 0.8);
    push(p0[0] - wx, p0[1], p0[2] - wz, 0.45); push(p1[0] + wx * s1, p1[1], p1[2] + wz * s1, 0.8); push(p1[0] - wx * s1, p1[1], p1[2] - wz * s1, 0.8);
    push(p1[0] - wx * s1, p1[1], p1[2] - wz * s1, 0.8); push(p1[0] + wx * s1, p1[1], p1[2] + wz * s1, 0.8); push(p2[0], p2[1], p2[2], 1.05);
  }
  for (let k = 0; k < heads; k++) {
    // a straight stalk ending in a sausage-shaped brown spike
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 0.2;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const h = 0.85 + 0.25 * r();
    const sw = 0.012;
    push(x - sw, 0, z, 0.5); push(x + sw, 0, z, 0.5); push(x, h * 0.75, z, 0.8);
    push(x, 0, z - sw, 0.5); push(x, 0, z + sw, 0.5); push(x, h * 0.75, z, 0.8);
    const sp = new THREE.CylinderGeometry(0.035, 0.035, h * 0.2, 4, 1, true).translate(x, h * 0.82, z).toNonIndexed();
    const sa = sp.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sa.count; i++) push(sa.getX(i), sa.getY(i), sa.getZ(i), 0.32, 1);
    sp.dispose();
    push(x - sw * 0.6, h * 0.92, z, 0.6); push(x + sw * 0.6, h * 0.92, z, 0.6); push(x, h * 1.05, z, 0.7);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Grass-like lighting: normals mostly up/out so both faces shade softly
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) {
    const ny = Math.abs(n.getY(i)) * 0.4 + 0.6;
    const nx = n.getX(i) * 0.5, nz = n.getZ(i) * 0.5;
    const l = Math.hypot(nx, ny, nz);
    n.setXYZ(i, nx / l, ny / l, nz / l);
  }
  return g;
}

/** Lily pad: a disc with a notch, 1 unit across; optional flower (blue channel flag). */
function lilyGeometry(flower: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const pad = new THREE.CircleGeometry(0.5, 10, 0.35, Math.PI * 2 - 0.35).rotateX(-Math.PI / 2);
  parts.push(colorize(pad, (x, _y, z) => { const e = Math.hypot(x, z) / 0.5; return [0.75 + 0.25 * e, 0, 1]; }));
  if (flower) {
    const fl = new THREE.ConeGeometry(0.16, 0.14, 6, 1, true).translate(0.05, 0.07, 0.05);
    parts.push(colorize(fl, () => [1, 1, 0]));
  }
  const g = mergeGeometries(parts)!;
  parts.forEach(p => p.dispose());
  return g;
}

/** Flattened jittered icosahedron (bank pebbles, mid-stream boulders). */
function stoneGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.85 + 0.3 * hash2(Math.round(x * 100), Math.round(z * 100 + y * 37));
    p.setXYZ(i, x * k, y * k * 0.55, z * k);
  }
  g.computeVertexNormals();
  return colorize(g, (_x, y) => [0.75 + 0.35 * (y + 0.3), 0, 1]);
}

/**
 * Weeping willow, height 1: a short leaning trunk forking into a broad
 * rounded crown whose rim hangs in a curtain of long drooping streamers
 * almost to the ground. Vertex colour R = shade, G = 1 for foliage.
 */
function willowGeometry(seed: number): THREE.BufferGeometry {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const bark = (g: THREE.BufferGeometry): THREE.BufferGeometry => colorize(g, () => [0.6, 0, 1]);
  const trunk = new THREE.CylinderGeometry(0.035, 0.06, 0.42, 7).translate(0, 0.21, 0);
  trunk.rotateZ(0.12);
  parts.push(bark(trunk));
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + r();
    const limb = new THREE.CylinderGeometry(0.018, 0.03, 0.3, 5).translate(0, 0.15, 0);
    limb.rotateZ(0.6).rotateY(a).translate(0.025, 0.38, 0);
    parts.push(bark(limb));
  }
  // Crown dome (lathe) — top of the curtain
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    prof.push(new THREE.Vector2(Math.sin(t * Math.PI * 0.5) * 0.4 + 0.02, 1.0 - t * t * 0.24));
  }
  const dome = new THREE.LatheGeometry(prof, 14);
  const dp = dome.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < dp.count; i++) {
    const x = dp.getX(i), z = dp.getZ(i);
    const k = 1 + 0.35 * (vnoise(x * 6 + 3, z * 6) - 0.5);
    dp.setXYZ(i, x * k, dp.getY(i) + 0.03 * (vnoise(x * 7, z * 7 + 5) - 0.5), z * k);
  }
  parts.push(colorize(dome, (x, y, z) => [0.62 + 0.3 * (y - 0.76) * 4 + 0.15 * vnoise(x * 12, z * 12), 1, 1]));
  // Hanging streamers: narrow tapering ribbons from the dome down, ragged hem
  const N = 56;
  const pos: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + r() * 0.2;
    const lobe = 0.75 + 0.5 * vnoise(Math.cos(a) * 2 + 7, Math.sin(a) * 2);
    const R0 = (0.26 + 0.16 * r()) * lobe;
    const top = 0.8 + 0.12 * r();
    const bot = 0.04 + 0.4 * r() * r() + 0.15 * (1 - lobe);
    const out = (0.08 + 0.12 * r()) * lobe;
    const w = 0.05 + 0.05 * r();
    const tx = -Math.sin(a), tz = Math.cos(a);
    const S = 4;
    for (let s = 0; s < S; s++) {
      const t0 = s / S, t1 = (s + 1) / S;
      const y0 = top + (bot - top) * t0, y1 = top + (bot - top) * t1;
      const r0 = R0 + out * Math.sin(Math.min(1, t0 * 1.6) * Math.PI * 0.5), r1 = R0 + out * Math.sin(Math.min(1, t1 * 1.6) * Math.PI * 0.5);
      const w0 = w * (1 - t0 * 0.75), w1 = w * (1 - t1 * 0.75);
      const c0x = Math.cos(a) * r0, c0z = Math.sin(a) * r0, c1x = Math.cos(a) * r1, c1z = Math.sin(a) * r1;
      pos.push(c0x - tx * w0, y0, c0z - tz * w0, c0x + tx * w0, y0, c0z + tz * w0, c1x + tx * w1, y1, c1z + tz * w1);
      pos.push(c0x - tx * w0, y0, c0z - tz * w0, c1x + tx * w1, y1, c1z + tz * w1, c1x - tx * w1, y1, c1z - tz * w1);
    }
  }
  const st = new THREE.BufferGeometry();
  st.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  st.computeVertexNormals();
  // outward-facing soft normals (the curtain shades as one volume)
  const sn = st.attributes.normal as THREE.BufferAttribute, sp = st.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < sn.count; i++) {
    const x = sp.getX(i), z = sp.getZ(i), l = Math.hypot(x, z) || 1;
    const nx = x / l * 0.8, ny = 0.45, nz = z / l * 0.8, nl = Math.hypot(nx, ny, nz);
    sn.setXYZ(i, nx / nl, ny / nl, nz / nl);
  }
  parts.push(colorize(st, (x, y, z) => [0.38 + 0.45 * y + 0.18 * vnoise(x * 15 + 2, z * 15), 1, 1]));
  const g = mergeGeometries(parts.map(p => { if (!p.attributes.normal) p.computeVertexNormals(); return p; }))!;
  parts.forEach(p => p.dispose());
  return g;
}

// ── Season palettes ─────────────────────────────────────────────────────────

const REED_TINT: Record<string, number[]> = {
  spring: [0x6f9a3a, 0x5f8a34, 0x7da544],
  summer: [0x6a9436, 0x5e8a30, 0x7a9e40],
  fall:   [0x9a8a4a, 0x8a7a42, 0xa8925a],
  winter: [0xa89a72, 0x978a68, 0xb4a882],
};
// r9: a duller, darker willow green (the lime read as a toy blob next to the forest)
const WILLOW_TINT: Record<string, number> = { spring: 0x7a9446, summer: 0x52703a, fall: 0x98893c, winter: 0x7a7458 };

interface Inst { x: number; y: number; z: number; s: number; sy: number; rot: number; color: number; pal?: number }
type EdgeKind = 'reed' | 'lily' | 'stone' | 'willow';

function lilyColor(season: string, v: number): number {
  const g = new THREE.Color(0x3d6b28).offsetHSL((v - 0.5) * 0.04, 0, (((v * 7.3) % 1) - 0.5) * 0.08);
  if (season === 'fall') g.lerp(new THREE.Color(0x8a7a34), 0.5);
  return g.getHex();
}

const SWAY_VERT = /* glsl */`
  #ifdef USE_INSTANCING
    vec3 eWp = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
  #else
    vec3 eWp = vec3(0.0);
  #endif
  float eSw = sin(uWTime * 1.7 + eWp.x * 0.9 + eWp.z * 0.7) * 0.6 + sin(uWTime * 2.9 + eWp.x * 2.1) * 0.25;
  transformed.xz += vec2(eSw, eSw * 0.6) * uSwayAmt * position.y * position.y;
`;

/** What the edge planting needs to know about the site (UE: the campus occupancy mask). */
export interface EdgeSite {
  ground(x: number, z: number): number;
  /** Blocked for a plant of radius `r` (`tree`: also keep clear of existing trees). */
  blocked?(x: number, z: number, r: number, tree: boolean): boolean;
  /** A willow now stands here. */
  reserveTree?(x: number, z: number, r: number): void;
}

export class WaterEdgeRenderer {
  private readonly _scene: THREE.Scene;
  private readonly _objs: THREE.Object3D[] = [];
  private readonly _disp: Array<{ dispose(): void }> = [];
  private _geos: Record<string, THREE.BufferGeometry> | null = null;
  private readonly _spawned: Array<{ mesh: THREE.InstancedMesh; list: Inst[]; kind: EdgeKind }> = [];

  constructor(scene: THREE.Scene) {
    this._scene = scene;
  }

  private _g(): Record<string, THREE.BufferGeometry> {
    if (!this._geos) {
      this._geos = {
        reed: reedClumpGeometry(13, 2, 11, 0.35),
        rush: reedClumpGeometry(16, 0, 23, 0.6),
        reedFar: reedClumpGeometry(7, 0, 31, 0.4),
        lily: lilyGeometry(false),
        lilyF: lilyGeometry(true),
        stone: stoneGeometry(),
        willow: willowGeometry(5),
      };
    }
    return this._geos;
  }

  private _material(sway: number, shade: 'veg' | 'lily' | 'stone' | 'willow'): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      roughness: shade === 'lily' ? 0.45 : 0.85, metalness: 0,
      side: shade === 'veg' || shade === 'willow' ? THREE.DoubleSide : THREE.FrontSide,
    });
    const swayU = { value: sway };
    m.onBeforeCompile = (sh) => {
      sh.uniforms['uWTime'] = WATER_GLOBALS.uWTime;
      sh.uniforms['uSwayAmt'] = swayU;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWTime;\nuniform float uSwayAmt;\nattribute vec3 aEdge;\nvarying vec3 vEdge;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge;\n' + SWAY_VERT);
      // vertex colour: R = shade, G = 1 → tinted part (instance colour), B = 1 → also tinted;
      // heads / flowers / bark keep a fixed colour
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEdge;')
        .replace('#include <color_fragment>', /* glsl */`
        vec3 eInst = vec3(1.0);
        #if defined( USE_COLOR )
          eInst = vColor.rgb;   // instance colour (three folds it into vColor)
        #endif
        float eShade = vEdge.r;
        ${shade === 'veg' ? 'vec3 eFixed = vec3(0.30, 0.17, 0.08);   // cattail heads' : ''}
        ${shade === 'lily' ? 'vec3 eFixed = vec3(0.98, 0.90, 0.93);   // flowers' : ''}
        ${shade === 'stone' ? 'vec3 eFixed = eInst;' : ''}
        ${shade === 'willow' ? 'vec3 eFixed = vec3(0.30, 0.25, 0.19);   // bark' : ''}
        float eTint = ${shade === 'willow' ? 'vEdge.g' : 'vEdge.b'};
        diffuseColor.rgb *= mix(eFixed, eInst, eTint) * eShade;`);
    };
    m.customProgramCacheKey = () => 'water-edge-' + shade;
    this._disp.push(m);
    return m;
  }

  private _pal(tints: number[], r: () => number): { color: number; pal: number } {
    const pal = Math.floor(r() * 3);
    return { color: tints[pal % tints.length], pal };
  }

  /** Re-tint for a new visual season (reeds straw-coloured in fall / winter, no lilies in winter). */
  setSeason(season: string): void {
    const c = new THREE.Color();
    for (const sp of this._spawned) {
      if (sp.kind === 'stone') continue;
      if (sp.kind === 'lily') sp.mesh.visible = season !== 'winter';
      sp.list.forEach((it, i) => {
        const hex = sp.kind === 'reed' ? (REED_TINT[season] ?? REED_TINT.summer)[(it.pal ?? 0) % 3]
          : sp.kind === 'lily' ? lilyColor(season, it.pal ?? 0.5)
          : (WILLOW_TINT[season] ?? WILLOW_TINT.summer);
        sp.mesh.setColorAt(i, c.setHex(hex));
      });
      if (sp.mesh.instanceColor) sp.mesh.instanceColor.needsUpdate = true;
    }
  }

  private _spawn(list: Inst[], geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial, name: string, castShadow = false, kind: EdgeKind = 'reed'): void {
    if (list.length === 0) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    list.forEach((it, i) => {
      q.setFromAxisAngle(up, it.rot);
      m.compose(v.set(it.x, it.y, it.z), q, s.set(it.s, it.sy, it.s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setHex(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.name = name;
    mesh.userData = { type: name };
    this._scene.add(mesh);
    this._objs.push(mesh);
    this._spawned.push({ mesh, list, kind });
  }

  /**
   * Water edges of a modelled water body (pond, creek). `shore(x, z)` is the rendered shoreline field (0.5 =
   * waterline, > 0.5 water), `depth(x, z)` 0..1 toward deep water,
   * `speed(x, z)` the surface current (units / s).
   */
  buildShore(o: {
    bounds: { x0: number; z0: number; x1: number; z1: number };
    shore: (x: number, z: number) => number;
    depth: (x: number, z: number) => number;
    speed: (x: number, z: number) => number;
    rocks: Array<{ x: number; z: number; r: number }>;
    /** Ground height and what may not be planted on (structures, paths). */
    site: EdgeSite;
    waterY: number;
    quality: Quality;
    season: string;
    seed: number;
  }): void {
    this.clear();
    const { bounds, shore, depth, speed, site, waterY, quality, season } = o;
    const r = rng(o.seed);
    const reeds: Inst[] = [], rushes: Inst[] = [], lilies: Inst[] = [], liliesF: Inst[] = [], stones: Inst[] = [], willows: Inst[] = [];
    const tints = REED_TINT[season] ?? REED_TINT.summer;
    const thin = quality === 'low' ? 0.4 : quality === 'medium' ? 0.75 : 1;
    // Never on structures, paths or anything the site reserves
    const free = (x: number, z: number, rad: number, tree = false): boolean => !site.blocked?.(x, z, rad, tree);
    const ground = (x: number, z: number): number => site.ground(x, z);
    const step = 0.42;
    const willowPts: Array<[number, number]> = [];
    for (let z = bounds.z0; z < bounds.z1; z += step) {
      for (let x = bounds.x0; x < bounds.x1; x += step) {
        const jx = x + (r() - 0.5) * step, jz = z + (r() - 0.5) * step;
        const s = shore(jx, jz);
        if (s < 0.12 || s > 0.98) continue;
        const sp = speed(jx, jz);
        const stand = vnoise(jx * 0.35 + 11, jz * 0.35);
        // Emergent reeds: in the shallows just off the waterline, still / slow water
        if (s > 0.5 && s < 0.7 && sp < 0.09 && stand > 0.38 && r() < 0.8 * thin) {
          if (free(jx, jz, 0.3)) {
            const h = (0.3 + 0.12 * r()) * (0.8 + 0.4 * stand);
            reeds.push({ x: jx, y: waterY - 0.03, z: jz, s: 0.34 + 0.16 * r(), sy: h, rot: r() * Math.PI * 2, ...this._pal(tints, r) });
          }
          continue;
        }
        // Rushes on the damp bank
        if (s > 0.36 && s <= 0.5 && quality !== 'low' && sp < 0.15 && stand > 0.3 && r() < 0.32 * thin) {
          if (free(jx, jz, 0.25)) {
            rushes.push({ x: jx, y: ground(jx, jz) - 0.01, z: jz, s: 0.2 + 0.1 * r(), sy: 0.13 + 0.07 * r(), rot: r() * Math.PI * 2, ...this._pal(tints, r) });
          }
          continue;
        }
        // Pebble bars where the current runs along the bank
        if (s > 0.4 && s < 0.58 && sp >= 0.09 && quality !== 'low' && r() < 0.5 * thin) {
          if (free(jx, jz, 0.12)) {
            const k = 0.05 + 0.07 * r();
            const g = 0.42 + 0.25 * r();
            const col = new THREE.Color(g, g * 0.97, g * 0.92).getHex();
            stones.push({ x: jx, y: Math.max(ground(jx, jz), waterY - 0.02), z: jz, s: k, sy: k, rot: r() * Math.PI * 2, color: col });
          }
          continue;
        }
        // Lily-pad colonies: still, mid-depth water away from the bank
        const d = depth(jx, jz);
        if (s > 0.7 && d > 0.25 && d < 0.8 && sp < 0.03 && vnoise(jx * 0.5 + 40, jz * 0.5 - 7) > 0.58 && r() < 0.6 * thin) {
          if (free(jx, jz, 0.2)) {
            const flower = (season === 'summer' || season === 'spring') && r() < 0.15;
            const k = 0.12 + 0.1 * r();
            const v = r();
            const list = flower ? liliesF : lilies;
            list.push({ x: jx, y: waterY + 0.004 + r() * 0.002, z: jz, s: k, sy: 1, rot: r() * Math.PI * 2, color: lilyColor(season, v), pal: v });
          }
          continue;
        }
        // Willow candidates on the bank, a little back from the waterline
        if (s > 0.16 && s < 0.3 && quality !== 'low' && sp < 0.2) willowPts.push([jx, jz]);
      }
    }
    // Willows: sparse, spaced, only where a tree fits (no forest, trees, paths …)
    const shoreLen = willowPts.length * step;
    const want = Math.min(quality === 'high' ? 8 : 5, Math.floor(shoreLen / 34));
    for (let t = 0; t < willowPts.length * 2 && willows.length < want; t++) {
      const [x, z] = willowPts[Math.floor(r() * willowPts.length)];
      if (willows.some(w => Math.hypot(w.x - x, w.z - z) < 7)) continue;
      if (!free(x, z, 0.9, true)) continue;
      if (shore(x, z) > 0.3) continue;
      const h = 1.1 + 0.4 * r(); // ≈ 7–9 m crown
      willows.push({ x, y: ground(x, z) - 0.02, z, s: h * (1.05 + 0.15 * r()), sy: h, rot: r() * Math.PI * 2, color: WILLOW_TINT[season] ?? WILLOW_TINT.summer });
      site.reserveTree?.(x, z, 1.3);
    }
    // Mid-stream boulders from the flow field (white water already foams round them)
    for (const rk of o.rocks) {
      if (!free(rk.x, rk.z, rk.r * 0.6)) continue;
      const g = 0.38 + 0.2 * r();
      stones.push({ x: rk.x, y: waterY - 0.04, z: rk.z, s: rk.r * 1.6, sy: rk.r * 1.1, rot: r() * Math.PI * 2, color: new THREE.Color(g, g, g * 0.95).getHex() });
    }
    this._emit(reeds, rushes, lilies, liliesF, stones, willows, quality);
    if (season === 'winter') this.setSeason(season);
  }

  /**
   * Regional reed fringes: along still / slow shores within `radius` of the
   * campus centre (sampled from the regional field; nothing in the town).
   */
  buildRegional(o: {
    cx: number; cz: number; radius: number; inner: number;
    height: (x: number, z: number) => number;
    waterY: number;
    speed: (x: number, z: number) => number;
    quality: Quality;
    season: string;
  }): void {
    this.clear();
    if (o.quality === 'low') return;
    const r = rng(77);
    const reeds: Inst[] = [];
    const tints = REED_TINT[o.season] ?? REED_TINT.summer;
    const budget = o.quality === 'high' ? 2000 : 1200;
    const step = 2.2;
    const R = o.radius;
    for (let z = o.cz - R; z < o.cz + R && reeds.length < budget; z += step) {
      for (let x = o.cx - R; x < o.cx + R && reeds.length < budget; x += step) {
        const jx = x + (r() - 0.5) * step, jz = z + (r() - 0.5) * step;
        const dc = Math.max(Math.abs(jx - o.cx), Math.abs(jz - o.cz));
        if (dc < o.inner || Math.hypot(jx - o.cx, jz - o.cz) > R) continue;
        const h = o.height(jx, jz);
        const dh = o.waterY - h;
        if (dh < 0.02 || dh > 0.35) continue;          // the shallow shelf only
        if (o.speed(jx, jz) > 0.09) continue;
        if (vnoise(jx * 0.08, jz * 0.08 + 5) < 0.45 || r() > 0.7) continue;
        // a stand of a few clumps
        for (let k = 0; k < 3; k++) {
          const px = jx + (r() - 0.5) * 1.6, pz = jz + (r() - 0.5) * 1.6;
          const ph = o.height(px, pz);
          if (o.waterY - ph < -0.05 || o.waterY - ph > 0.4) continue;
          reeds.push({ x: px, y: o.waterY - 0.04, z: pz, s: 0.5 + 0.3 * r(), sy: 0.3 + 0.12 * r(), rot: r() * Math.PI * 2, ...this._pal(tints, r) });
        }
      }
    }
    this._emit(reeds, [], [], [], [], [], o.quality, true);
  }

  private _emit(reeds: Inst[], rushes: Inst[], lilies: Inst[], liliesF: Inst[], stones: Inst[], willows: Inst[], quality: Quality, far = false): void {
    const g = this._g();
    if (reeds.length || rushes.length) {
      const veg = this._material(0.05, 'veg');
      this._spawn(reeds, far ? g.reedFar : g.reed, veg, 'water_reeds');
      this._spawn(rushes, g.rush, veg, 'water_rushes');
    }
    if (lilies.length || liliesF.length) {
      const lm = this._material(0, 'lily');
      this._spawn(lilies, g.lily, lm, 'water_lilies', false, 'lily');
      this._spawn(liliesF, g.lilyF, lm, 'water_lilies_flower', false, 'lily');
    }
    if (stones.length) this._spawn(stones, g.stone, this._material(0, 'stone'), 'water_stones', false, 'stone');
    if (willows.length) this._spawn(willows, g.willow, this._material(0.025, 'willow'), 'water_willows', quality === 'high', 'willow');
  }

  clear(): void {
    for (const o of this._objs) {
      this._scene.remove(o);
      (o as THREE.InstancedMesh).dispose?.();
    }
    this._objs.length = 0;
    this._spawned.length = 0;
    for (const d of this._disp) d.dispose();
    this._disp.length = 0;
  }

  dispose(): void {
    this.clear();
    if (this._geos) for (const g of Object.values(this._geos)) g.dispose();
    this._geos = null;
  }
}
