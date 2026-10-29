/**
 * Draws the path network (pathNet.ts): trampled and bare tracks, gravel,
 * stepping stones, duckboards, poured walks, and the bare patch of earth in
 * front of the doors. One merged mesh per surface (a handful of draw calls,
 * rebuilt only when the layout, what is laid or the wear tier changes), no
 * per-frame cost. Mud season, snow and frost come from the shared season
 * patch (the materials carry the same defines the drive does: an earth track
 * goes to mud, a laid walk is "plowed" and stays dark in snow).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Quality } from '../../engine/world/WorldScene';
import { PATH_WIDTH, type PathSurface } from '../../sim/paths';
import type { PathNetwork } from './pathNet';
import { boardGeometry, h2, laidRibbon, patchGeometry, skirtGeometry, stoneGeometry, wornRibbons, type SkirtRect } from './pathGeometry';

type Ground = (x: number, z: number) => number;

/** Ground colors the tracks wear through (the region's grass, its bare earth). */
export interface PathLook { grass: number; soil: number }

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function tex(w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Across-the-track alpha: solid in the middle, ragged and soft at the edge. */
function edgeAlpha(u: number, rnd: number, solid: number, soft: number): number {
  const d = Math.abs(u * 2 - 1) + (rnd - 0.5) * 0.35;
  return Math.max(0, Math.min(1, (solid + soft - d) / soft));
}

/** Packed earth: gray speckle (the vertex color carries the hue), a few pebbles. */
function dirtTexture(): THREE.CanvasTexture {
  return tex(64, 128, (g, w, h) => {
    const img = g.createImageData(w, h), r = lcg(31);
    const rowNoise = Array.from({ length: h }, () => r());
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / (w - 1), n = r(), k = 205 + n * 50 - (r() < 0.04 ? 60 : 0);
      const a = edgeAlpha(u, (rowNoise[y] + n) / 2, 0.45, 0.55);
      const q = (y * w + x) * 4;
      img.data[q] = k; img.data[q + 1] = k * 0.98; img.data[q + 2] = k * 0.95; img.data[q + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
  });
}

function gravelTexture(): THREE.CanvasTexture {
  return tex(64, 128, (g, w, h) => {
    const img = g.createImageData(w, h), r = lcg(77);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / (w - 1), n = r(), chip = r() < 0.12 ? 1.18 : 1;
      let k = (150 + n * 70) * chip;
      const e = Math.abs(u * 2 - 1);
      k *= 1 - 0.28 * Math.max(0, e - 0.78) / 0.22;                       // the shaded edge of the bed
      const a = e < 0.9 ? 1 : Math.max(0, 1 - (e - 0.9) / 0.1 + (r() - 0.5) * 0.4);
      const q = (y * w + x) * 4;
      img.data[q] = k * 1.0; img.data[q + 1] = k * 0.97; img.data[q + 2] = k * 0.9; img.data[q + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
  });
}

/** A poured walk: light concrete with a trowelled grain and a control joint every 1.2 m (the texture is 0.5 units = 3 m long: two joints). */
function pavedTexture(): THREE.CanvasTexture {
  return tex(32, 128, (g, w, h) => {
    const img = g.createImageData(w, h), r = lcg(5);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / (w - 1), e = Math.abs(u * 2 - 1);
      let k = 196 + r() * 26;
      if (y % 64 < 2) k -= 55;                                              // control joint
      if (e > 0.9) k -= 30;                                                 // the edge
      const q = (y * w + x) * 4;
      img.data[q] = k; img.data[q + 1] = k; img.data[q + 2] = k * 0.97; img.data[q + 3] = e < 0.97 ? 255 : 0;
    }
    g.putImageData(img, 0, 0);
  });
}

/** Fine earth speckle, solid (the fade is the vertex alpha): the bare ground under the eaves. */
function speckTexture(): THREE.CanvasTexture {
  const t = tex(64, 64, (g, w, h) => {
    const img = g.createImageData(w, h), r = lcg(21);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = r(), k = 214 + n * 41 - (r() < 0.06 ? 50 : 0), q = (y * w + x) * 4;
      img.data[q] = k; img.data[q + 1] = k * 0.98; img.data[q + 2] = k * 0.95; img.data[q + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** The bare patch: soft round blob, ragged, speckled. */
function patchTexture(): THREE.CanvasTexture {
  const t = tex(64, 64, (g, w, h) => {
    const img = g.createImageData(w, h), r = lcg(9);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = x / (w - 1) * 2 - 1, dz = y / (h - 1) * 2 - 1, d = Math.hypot(dx, dz), n = r();
      const k = 200 + n * 55 - (r() < 0.05 ? 55 : 0);
      const a = Math.max(0, Math.min(1, (0.95 - d) / 0.45 + (n - 0.5) * 0.35));
      const q = (y * w + x) * 4;
      img.data[q] = k; img.data[q + 1] = k * 0.98; img.data[q + 2] = k * 0.95; img.data[q + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
  });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export class PathRenderer {
  readonly group = new THREE.Group();
  private readonly _mats = new Map<string, THREE.Material>();
  private readonly _tex: THREE.Texture[] = [];
  private _key = '';
  private _apronKey = '';
  private _aprons: THREE.Mesh | null = null;
  private _skirtKey = '';
  private _skirts: THREE.Mesh | null = null;

  constructor() { this.group.name = 'paths'; }

  /** `define`: SEA_MUD (an earth track: goes to mud, and snow lies thin on it where feet have packed it) or SEA_PLOWED (a laid walk: cleared of snow). */
  private _ribbonMat(name: string, make: () => THREE.Texture, define: 'SEA_MUD' | 'SEA_PLOWED', rough = 0.96): THREE.MeshStandardMaterial {
    const have = this._mats.get(name) as THREE.MeshStandardMaterial | undefined;
    if (have) return have;
    const map = make();
    const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, transparent: true, depthWrite: false, roughness: rough, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    m.defines = define === 'SEA_MUD' ? { SEA_MUD: '', SEA_DECID: '' } : { SEA_PLOWED: '' };
    m.name = 'path_' + name;
    this._mats.set(name, m);
    this._tex.push(map);
    return m;
  }

  private _solid(name: string, color: number, rough: number, define: 'SEA_PLOWED' | 'SEA_MUD' = 'SEA_PLOWED'): THREE.MeshStandardMaterial {
    const have = this._mats.get(name) as THREE.MeshStandardMaterial | undefined;
    if (have) return have;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, color, roughness: rough, metalness: 0 });
    m.defines = { [define]: '' };
    this._mats.set(name, m);
    return m;
  }

  /** Rebuild when the layout, what is laid, the wear tier or the quality changes (cheap key check otherwise). */
  update(net: PathNetwork, ground: Ground, look: PathLook, quality: Quality, key: string): void {
    const k = `${key}|${quality}`;
    if (k === this._key) return;
    this._key = k;
    this.clear();
    if (!net.trails.length) return;
    const colors = { grass: new THREE.Color(look.grass), soil: new THREE.Color(look.soil) };
    const bySurface = new Map<PathSurface, THREE.BufferGeometry[]>();
    const push = (s: PathSurface, g: THREE.BufferGeometry | null) => { if (g) (bySurface.get(s) ?? bySurface.set(s, []).get(s)!).push(g); };
    const planks: THREE.BufferGeometry[] = [], stones: THREE.BufferGeometry[] = [];
    net.trails.forEach((t, i) => {
      const seed = 17 + i * 31;
      // a worn track shows where nothing is laid
      if (!t.laid) for (const g of wornRibbons(t.pts, t.pts.map(() => t.wear), ground, colors, seed)) push('dirt', g);
      else if (t.laid === 'gravel') push('gravel', laidRibbon(t.pts, ground, PATH_WIDTH.gravel, 0.016, [0.8, 0.78, 0.74]));
      else if (t.laid === 'paved') push('paved', laidRibbon(t.pts, ground, PATH_WIDTH.paved, 0.02, [0.68, 0.68, 0.66]));
      else if (t.laid === 'boards') {
        // a bare earth bed under the planks
        push('gravel', laidRibbon(t.pts, ground, PATH_WIDTH.boards * 0.9, 0.012, [0.45, 0.38, 0.3]));
        planks.push(...boardGeometry(t.pts, ground, seed));
      } else if (t.laid === 'stones') stones.push(...stoneGeometry(t.pts, ground, seed));
    });
    // the bare patch at each door where the ground is trodden
    const patch: THREE.BufferGeometry[] = [];
    const seen = new Set<string>();
    for (const e of net.edges) {
      if (!e.trails.length) continue;
      for (const [id, t] of [[e.a, net.trails[e.trails[0]]], [e.b, net.trails[e.trails[e.trails.length - 1]]]] as const) {
        const n = net.nodes.find(x => x.id === id);
        if (!n || n.ring || seen.has(id) || n.role === 'creek' || (n.role === 'gate' && n.kind !== 'gate_garage')) continue;
        seen.add(id);
        if (t.laid && t.laid !== 'stones') continue;
        const w = t.wear;
        if (w < 0.2) continue;
        const r = 0.07 + 0.17 * w + (n.role === 'home' ? 0.05 : 0);
        const c = colors.grass.clone().lerp(colors.soil, 0.9);
        patch.push(patchGeometry(n.ax, n.az, r, ground, 0.01, [c.r, c.g, c.b], hashId(id), 0.8 + 0.3 * h2(n.ax, n.az), h2(n.az, n.ax) * 3));
      }
    }
    const worn = this._ribbonMat('worn', dirtTexture, 'SEA_MUD', 0.97);
    const addMerged = (list: THREE.BufferGeometry[], mat: THREE.Material, name: string, shadow = false) => {
      if (!list.length) return;
      const g = mergeGeometries(list, false);
      for (const x of list) x.dispose();
      if (!g) return;
      const m = new THREE.Mesh(g, mat);
      m.name = name; m.receiveShadow = true; m.castShadow = shadow; m.renderOrder = 1;
      this.group.add(m);
    };
    addMerged(bySurface.get('dirt') ?? [], worn, 'path_worn');
    addMerged(patch, this._ribbonMat('patch', patchTexture, 'SEA_MUD'), 'path_patch');
    addMerged(bySurface.get('gravel') ?? [], this._ribbonMat('gravel', gravelTexture, 'SEA_PLOWED', 0.92), 'path_gravel');
    addMerged(bySurface.get('paved') ?? [], this._ribbonMat('paved', pavedTexture, 'SEA_PLOWED', 0.88), 'path_paved');
    addMerged(planks, this._solid('boards', 0xb0a090, 0.9), 'path_boards', true);
    addMerged(stones, this._solid('stones', 0xc0b8a8, 0.95), 'path_stones', true);
  }

  /** Hard-packed gravel where the trucks stand and where the drive meets the road: soft-edged rectangles on the ground. */
  setAprons(list: ReadonlyArray<{ x: number; z: number; w: number; d: number; rot: number }>, ground: Ground, key: string): void {
    if (key === this._apronKey) return;
    this._apronKey = key;
    if (this._aprons) { this.group.remove(this._aprons); this._aprons.geometry.dispose(); this._aprons = null; }
    if (!list.length) return;
    const nx = 6, nz = 4, geos: THREE.BufferGeometry[] = [];
    for (const a of list) {
      const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
      const cs = Math.cos(a.rot), sn = Math.sin(a.rot);
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const lx = (i / nx - 0.5) * a.w, lz = (j / nz - 0.5) * a.d;
        const x = a.x + lx * cs + lz * sn, z = a.z - lx * sn + lz * cs;
        pos.push(x, ground(x, z) + 0.013, z);
        uv.push(i / nx, j / nz * a.d / 0.5);
        const edge = i === 0 || j === 0 || i === nx || j === nz;
        col.push(0.66, 0.63, 0.57, edge ? 0 : 0.97);
      }
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const q = j * (nx + 1) + i; idx.push(q, q + nx + 1, q + 1, q + 1, q + nx + 1, q + nx + 2); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
      g.setIndex(idx);
      g.computeVertexNormals();
      geos.push(g);
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) return;
    // the gravel texture's edge fade runs across u; an apron is solid to its edge, so it uses the paved/gravel bed at full width
    const mat = this._ribbonMat('apron', gravelTexture, 'SEA_PLOWED', 0.93);
    this._aprons = new THREE.Mesh(merged, mat);
    this._aprons.name = 'path_apron'; this._aprons.receiveShadow = true; this._aprons.renderOrder = 1;
    this.group.add(this._aprons);
  }

  /** The bare earth at the foot of each building (alpha 0-1 by how long it has stood and how much it is used). */
  setSkirts(list: ReadonlyArray<SkirtRect & { alpha: number; id: string }>, ground: Ground, look: PathLook, key: string): void {
    if (key === this._skirtKey) return;
    this._skirtKey = key;
    if (this._skirts) { this.group.remove(this._skirts); this._skirts.geometry.dispose(); this._skirts = null; }
    if (!list.length) return;
    const c = new THREE.Color(look.grass).lerp(new THREE.Color(look.soil), 0.92);
    const geos = list.map(b => skirtGeometry(b, 0.3, ground, [c.r, c.g, c.b], b.alpha, hashId(b.id)));
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) return;
    this._skirts = new THREE.Mesh(merged, this._ribbonMat('skirt', speckTexture, 'SEA_MUD', 0.97));
    this._skirts.name = 'path_skirts'; this._skirts.receiveShadow = true; this._skirts.renderOrder = 1;
    this.group.add(this._skirts);
  }

  clear(): void {
    for (const o of [...this.group.children]) {
      if (o === this._aprons || o === this._skirts) continue;
      this.group.remove(o);
      (o as THREE.Mesh).geometry?.dispose();
    }
  }

  dispose(): void {
    this.clear();
    if (this._aprons) { this.group.remove(this._aprons); this._aprons.geometry.dispose(); this._aprons = null; }
    if (this._skirts) { this.group.remove(this._skirts); this._skirts.geometry.dispose(); this._skirts = null; }
    for (const m of this._mats.values()) m.dispose();
    for (const t of this._tex) t.dispose();
    this._mats.clear();
  }
}

function hashId(s: string): number { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 1000; }
