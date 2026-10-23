/**
 * Gravel road texture: crushed-rock speckle, two worn wheel tracks and a
 * grassy crown / verges (u across the road, v along it). Procedural canvas;
 * normal map via the Sobel generator.
 */
import * as THREE from 'three';
import { generateNormalMap } from '../materials/normalMapGen';

let _gravel: THREE.MeshStandardMaterial | null = null;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** Gravel road material; `lengthRepeat` = world units per texture repeat along the road. */
export function gravelMaterial(lengthRepeat = 2): THREE.MeshStandardMaterial {
  if (_gravel) return _gravel;
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
    let cr = 150 + n * 55, cg = 138 + n * 50, cb = 116 + n * 45;
    if (r() < 0.12) { const d = 0.6 + r() * 0.3; cr *= d; cg *= d; cb *= d; }        // dark stones
    const t = Math.min(1, track * 0.8);
    cr = cr * (1 - t * 0.25) + 112 * t * 0.25; cg = cg * (1 - t * 0.25) + 100 * t * 0.25; cb = cb * (1 - t * 0.25) + 84 * t * 0.25;
    const gr = Math.min(1, verge * 0.9 + crown * 0.35) * (0.6 + 0.4 * r());
    cr = cr * (1 - gr) + 92 * gr; cg = cg * (1 - gr) + 104 * gr; cb = cb * (1 - gr) + 60 * gr;
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
  _gravel = new THREE.MeshStandardMaterial({
    map, normalMap: nm, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.95,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  return _gravel;
}
