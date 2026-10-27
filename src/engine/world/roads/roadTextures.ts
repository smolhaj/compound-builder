/**
 * Road textures (u across the road, v along it), procedural canvas with a
 * Sobel normal map:
 *   gravel   crushed-rock speckle, two worn wheel tracks, a grassy crown and verges;
 *   asphalt  a narrow rural blacktop (chip seal): dark aggregate, lighter
 *            polished wheel paths, a double yellow center line, crumbling edges;
 *   caliche  a desert road of packed pale caliche and sand, ruts, no crown grass.
 */
export type RoadSurface = 'gravel' | 'asphalt' | 'caliche';
import * as THREE from 'three';
import { generateNormalMap } from '../materials/normalMapGen';

const _mats = new Map<RoadSurface, THREE.MeshStandardMaterial>();

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** Gravel road material; `lengthRepeat` = world units per texture repeat along the road. */
export function gravelMaterial(lengthRepeat = 2): THREE.MeshStandardMaterial {
  return roadMaterial('gravel', lengthRepeat);
}

/** A road surface material (one shared per surface). */
export function roadMaterial(surface: RoadSurface, lengthRepeat = 2): THREE.MeshStandardMaterial {
  const have = _mats.get(surface);
  if (have) return have;
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  const r = lcg(77);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N;
    // tracks at ¼ and ¾; crown and verges grassier / looser
    const track = Math.exp(-(((u - 0.27) / 0.07) ** 2)) + Math.exp(-(((u - 0.73) / 0.07) ** 2));
    const verge = Math.max(0, 1 - Math.min(u, 1 - u) / 0.1);
    const crown = Math.exp(-(((u - 0.5) / 0.06) ** 2));
    const n = r();
    let cr: number, cg: number, cb: number;
    if (surface === 'asphalt') {
      cr = 70 + n * 30; cg = 70 + n * 29; cb = 68 + n * 27;
      if (r() < 0.08) { const d = 1.25 + r() * 0.3; cr *= d; cg *= d; cb *= d; }       // light chips
      const t = Math.min(1, track);
      cr += 16 * t; cg += 16 * t; cb += 15 * t;                                        // polished wheel paths
      // double yellow center line (two 10 cm lines, 10 cm apart: ~1 % of the width each)
      const dl = Math.min(Math.abs(u - 0.488), Math.abs(u - 0.512));
      if (dl < 0.007 && r() > 0.12) { cr = 196; cg = 160; cb = 52; }
      // the edges break up into the shoulder gravel and grass
      const edge = Math.max(0, 1 - Math.min(u, 1 - u) / 0.07) * (0.5 + 0.5 * r());
      cr = cr * (1 - edge) + 120 * edge; cg = cg * (1 - edge) + 118 * edge; cb = cb * (1 - edge) + 86 * edge;
    } else if (surface === 'caliche') {
      cr = 196 + n * 40; cg = 182 + n * 38; cb = 156 + n * 34;
      if (r() < 0.1) { const d = 0.75 + r() * 0.2; cr *= d; cg *= d; cb *= d; }
      const t = Math.min(1, track * 0.9);
      cr -= 26 * t; cg -= 26 * t; cb -= 24 * t;                                        // ruts
      const v = Math.max(0, 1 - Math.min(u, 1 - u) / 0.08) * (0.4 + 0.6 * r());
      cr = cr * (1 - v) + 168 * v; cg = cg * (1 - v) + 146 * v; cb = cb * (1 - v) + 112 * v;
    } else {
      cr = 150 + n * 55; cg = 138 + n * 50; cb = 116 + n * 45;
      if (r() < 0.12) { const d = 0.6 + r() * 0.3; cr *= d; cg *= d; cb *= d; }        // dark stones
      const t = Math.min(1, track * 0.8);
      cr = cr * (1 - t * 0.25) + 112 * t * 0.25; cg = cg * (1 - t * 0.25) + 100 * t * 0.25; cb = cb * (1 - t * 0.25) + 84 * t * 0.25;
      const gr = Math.min(1, verge * 0.9 + crown * 0.35) * (0.6 + 0.4 * r());
      cr = cr * (1 - gr) + 92 * gr; cg = cg * (1 - gr) + 104 * gr; cb = cb * (1 - gr) + 60 * gr;
    }
    const k = (y * N + x) * 4;
    img.data[k] = cr; img.data[k + 1] = cg; img.data[k + 2] = cb; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.ClampToEdgeWrapping; map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1, 1 / lengthRepeat);
  map.anisotropy = 8;
  const nm = generateNormalMap(c, 2.5);
  nm.wrapS = THREE.ClampToEdgeWrapping; nm.wrapT = THREE.RepeatWrapping;
  nm.repeat.copy(map.repeat);
  const mat = new THREE.MeshStandardMaterial({
    map, normalMap: nm, normalScale: new THREE.Vector2(surface === 'asphalt' ? 0.4 : 0.8, surface === 'asphalt' ? 0.4 : 0.8), roughness: surface === 'asphalt' ? 0.88 : 0.95,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  _mats.set(surface, mat);
  return mat;
}
