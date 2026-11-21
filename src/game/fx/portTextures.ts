/**
 * Procedural surface detail for the entrance complex (VehiclePorts): one tiling map that carries what the vertex colors cannot, so a close look matches the long view.
 * Poured concrete: expansion joints at the tile edge, hairline cracks, tire-wear bands, oil spots, rain stains and a fine aggregate speckle; the same sheet reads as worn
 * painted steel on the upright faces. Painted near-white (it multiplies the fixture's vertex colors); the normal map comes from its luminance.
 */
import * as THREE from 'three';
import { generateNormalMap } from '../../engine/world/materials/normalMapGen';

export const PORT_TILE = 0.8;      // world units per repeat (16 ft: one slab of poured concrete)

const lcg = (seed: number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

export function paintPortSheet(): HTMLCanvasElement {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N / 2;        // (painted on a 512 grid, stored at half size: the shared sheet stays light)
  const g = c.getContext('2d', { willReadFrequently: true })!, r = lcg(4711);
  g.scale(0.5, 0.5);
  g.fillStyle = 'rgb(238,238,238)'; g.fillRect(0, 0, N, N);
  for (let k = 0; k < 5200; k++) { const v = 150 + r() * 105; g.fillStyle = `rgba(${v},${v},${v},${0.18 + r() * 0.3})`; g.fillRect(r() * N, r() * N, 1 + r() * 1.6, 1 + r() * 1.6); }                 // aggregate
  for (let k = 0; k < 14; k++) { const x = r() * N, y = r() * N, rad = 30 + r() * 70, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(120,118,112,0.16)'); gr.addColorStop(1, 'rgba(120,118,112,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }   // blotches
  for (const x of [N * 0.3, N * 0.62]) { g.fillStyle = 'rgba(70,72,76,0.22)'; g.fillRect(x - 11, 0, 22, N); g.fillStyle = 'rgba(70,72,76,0.18)'; g.fillRect(x + 36, 0, 15, N); }   // tire-wear bands
  for (let k = 0; k < 5; k++) { const x = r() * N, y = r() * N, rad = 5 + r() * 10, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(18,18,22,0.6)'); gr.addColorStop(0.7, 'rgba(30,28,30,0.25)'); gr.addColorStop(1, 'rgba(30,28,30,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }   // oil spots
  for (let k = 0; k < 7; k++) { const x = r() * N; g.fillStyle = `rgba(60,64,70,${0.10 + r() * 0.1})`; g.fillRect(x, 0, 2 + r() * 5, N * (0.3 + r() * 0.7)); }                                  // rain streaks
  g.strokeStyle = 'rgba(40,40,44,0.55)'; g.lineWidth = 1.1;
  for (let k = 0; k < 4; k++) { let x = r() * N, y = r() * N; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 9; j++) { x += (r() - 0.35) * 22; y += (r() - 0.5) * 22; g.lineTo(x, y); } g.stroke(); }   // hairline cracks
  g.fillStyle = 'rgba(30,32,36,0.85)'; g.fillRect(0, 0, N, 3); g.fillRect(0, 0, 3, N);                                                                                                   // expansion joints
  g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(0, 3, N, 1.5); g.fillRect(3, 0, 1.5, N);
  return c;
}

export interface PortTextures { map: THREE.CanvasTexture; normalMap: THREE.Texture; dispose(): void }
let _tex: PortTextures | null = null;
/** One shared pair of maps for every entrance complex (painted once; kept for the page's life, like the kit materials). */
export function portTextures(): PortTextures {
  if (_tex) return _tex;
  const cv = paintPortSheet(), map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
  const nm = generateNormalMap(cv, 1.5); nm.wrapS = nm.wrapT = THREE.RepeatWrapping;
  _tex = { map, normalMap: nm, dispose: () => { /* shared: never disposed per instance */ } };
  return _tex;
}

/** World-scaled UVs by dominant normal axis (one repeat per PORT_TILE), for a non-indexed geometry with positions and normals. */
export function portUV(g: THREE.BufferGeometry): void {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2), k = 1 / PORT_TILE;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const u = ay >= ax && ay >= az ? p.getX(i) : ax >= az ? p.getZ(i) : p.getX(i), v = ay >= ax && ay >= az ? p.getZ(i) : p.getY(i);
    uv[i * 2] = u * k; uv[i * 2 + 1] = v * k;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * A small shared sheet for painted and weathered utility surfaces (the dome plant's machinery, benches, crates, lamp posts): grain and brush streaks, speckle,
 * scuffed edges and a few drips, near-white so the vertex colors keep their hues. 128 px, tiled every 0.4 units.
 */
export const WORK_TILE = 0.4;
let _work: PortTextures | null = null;
export function workTextures(): PortTextures {
  if (_work) return _work;
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d', { willReadFrequently: true })!, r = lcg(9001);
  g.fillStyle = 'rgb(236,236,236)'; g.fillRect(0, 0, N, N);
  for (let k = 0; k < 160; k++) { const v = r() < 0.5 ? 255 : 120, a = 0.06 + r() * 0.12; g.fillStyle = `rgba(${v},${v},${v},${a})`; g.fillRect(r() * N, r() * N, 14 + r() * 60, 0.8 + r() * 1.2); }     // grain and brush streaks
  for (let k = 0; k < 700; k++) { const v = 140 + r() * 110; g.fillStyle = `rgba(${v},${v},${v},${0.2 + r() * 0.3})`; g.fillRect(r() * N, r() * N, 1, 1); }                                         // speckle
  for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(40,36,30,0.14)'; g.fillRect(r() * N, r() * N * 0.5, 1.4, 12 + r() * 36); }                                                         // drips
  g.fillStyle = 'rgba(30,30,34,0.5)'; g.fillRect(0, 0, N, 1.4); g.fillRect(0, 0, 1.4, N);                                                                                                // a seam line
  g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, N - 1.6, N, 1.2);                                                                                                                 // worn edge
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 2;
  const nm = generateNormalMap(c, 1.3); nm.wrapS = nm.wrapT = THREE.RepeatWrapping;
  _work = { map, normalMap: nm, dispose: () => { /* shared */ } };
  return _work;
}

/** World-scaled UVs for a geometry (any indexing): one repeat per `tile` units, by dominant normal axis. */
export function worldUVs(g0: THREE.BufferGeometry, tile: number): THREE.BufferGeometry {
  const g = g0.index ? g0.toNonIndexed() : g0;
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2), k = 1 / tile;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const top = ay >= ax && ay >= az;
    uv[i * 2] = (top ? p.getX(i) : ax >= az ? p.getZ(i) : p.getX(i)) * k; uv[i * 2 + 1] = (top ? p.getZ(i) : p.getY(i)) * k;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
