/**
 * Procedural surface detail for the entrance complex (VehiclePorts): one tiling map that carries what the vertex colors cannot, so a close look matches the long view.
 * Poured concrete: expansion joints at the tile edge, hairline cracks, tire-wear bands, oil spots, rain stains and a fine aggregate speckle; the same sheet reads as worn
 * painted steel on the upright faces. Painted near-white (it multiplies the fixture's vertex colors); the normal map comes from its luminance.
 */
import * as THREE from 'three';
import { generateNormalMap } from '../../engine/world/materials/normalMapGen';
import { release } from './plantDecals';

export const PORT_TILE = 0.8;      // world units per repeat (16 ft: one slab of poured concrete)

const lcg = (seed: number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

export function paintPortSheet(): HTMLCanvasElement {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N / 2;        // (painted on a 512 grid, stored at half size: the shared sheet stays light)
  const g = c.getContext('2d', { willReadFrequently: true })!, r = lcg(4711);
  g.scale(0.5, 0.5);
  g.fillStyle = 'rgb(238,238,238)'; g.fillRect(0, 0, N, N);
  for (let k = 0; k < 5200; k++) { const v = 150 + r() * 105; g.fillStyle = `rgba(${v},${v},${v},${0.18 + r() * 0.3})`; g.fillRect(r() * N, r() * N, 1 + r() * 1.6, 1 + r() * 1.6); }                 // aggregate
  for (let k = 0; k < 20; k++) { const x = r() * N, y = r() * N, rad = 30 + r() * 80, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(110,106,98,0.28)'); gr.addColorStop(1, 'rgba(110,106,98,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }   // blotches
  for (const x of [N * 0.3, N * 0.62]) { g.fillStyle = 'rgba(60,62,66,0.34)'; g.fillRect(x - 11, 0, 22, N); g.fillStyle = 'rgba(60,62,66,0.26)'; g.fillRect(x + 36, 0, 15, N); }   // tire-wear bands
  for (let k = 0; k < 5; k++) { const x = r() * N, y = r() * N, rad = 5 + r() * 10, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(18,18,22,0.6)'); gr.addColorStop(0.7, 'rgba(30,28,30,0.25)'); gr.addColorStop(1, 'rgba(30,28,30,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }   // oil spots
  for (let k = 0; k < 7; k++) { const x = r() * N; g.fillStyle = `rgba(60,64,70,${0.10 + r() * 0.1})`; g.fillRect(x, 0, 2 + r() * 5, N * (0.3 + r() * 0.7)); }                                  // rain streaks
  g.strokeStyle = 'rgba(40,40,44,0.55)'; g.lineWidth = 1.1;
  for (let k = 0; k < 4; k++) { let x = r() * N, y = r() * N; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 9; j++) { x += (r() - 0.35) * 22; y += (r() - 0.5) * 22; g.lineTo(x, y); } g.stroke(); }   // hairline cracks
  g.fillStyle = 'rgba(24,26,30,0.92)'; g.fillRect(0, 0, N, 4); g.fillRect(0, 0, 4, N);                                                                                                   // expansion joints
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
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d', { willReadFrequently: true })!, r = lcg(9001), H = N / 2;
  g.fillStyle = 'rgb(238,238,238)'; g.fillRect(0, 0, N, N);
  for (let k = 0; k < 300; k++) { const v = r() < 0.5 ? 255 : 120, a = 0.05 + r() * 0.1; g.fillStyle = `rgba(${v},${v},${v},${a})`; g.fillRect(r() * N, r() * N, 20 + r() * 110, 0.8 + r() * 1.3); }     // grain and brush streaks
  for (let k = 0; k < 1500; k++) { const v = 140 + r() * 110; g.fillStyle = `rgba(${v},${v},${v},${0.2 + r() * 0.3})`; g.fillRect(r() * N, r() * N, 1, 1); }                                         // speckle
  for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) {                                                                                                                       // four panels of 0.2 units (4 ft)
    const x0 = px * H, y0 = py * H, gr = g.createLinearGradient(0, y0, 0, y0 + H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.72, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(36,30,24,0.26)');
    g.fillStyle = gr; g.fillRect(x0, y0, H, H);                                                                                                                                        // grime at each panel's foot
    g.fillStyle = 'rgba(14,16,20,0.72)'; g.fillRect(x0, y0, H, 1.8); g.fillRect(x0, y0, 1.8, H);                                                                                        // the seam
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(x0 + 1.8, y0 + 1.8, H - 1.8, 1.1); g.fillRect(x0 + 1.8, y0 + 1.8, 1.1, H - 1.8);                                                  // its bevel
    for (let i = 0; i < 4; i++) for (const [bx, by] of [[x0 + 10 + i * (H - 20) / 3, y0 + 8], [x0 + 10 + i * (H - 20) / 3, y0 + H - 8]] as const) {
      g.fillStyle = 'rgba(22,26,32,0.7)'; g.beginPath(); g.arc(bx, by, 2, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(bx - 0.5, by - 0.6, 0.8, 0, Math.PI * 2); g.fill();   // bolts
      if (r() < 0.4) { g.fillStyle = 'rgba(46,38,30,0.2)'; g.fillRect(bx - 0.7, by + 2, 1.4, 5 + r() * 14); }
    }
  }
  for (let k = 0; k < 7; k++) { g.fillStyle = 'rgba(40,36,30,0.13)'; g.fillRect(r() * N, r() * N * 0.5, 1.6, 14 + r() * 50); }                                                           // drips
  for (let k = 0; k < 8; k++) { g.strokeStyle = `rgba(255,255,255,${0.25 + r() * 0.2})`; g.lineWidth = 0.8; g.beginPath(); const sx = r() * N, sy = r() * N; g.moveTo(sx, sy); g.lineTo(sx + 6 + r() * 16, sy + (r() - 0.5) * 7); g.stroke(); }   // scuffs
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
  const h2 = document.createElement('canvas'); h2.width = h2.height = N / 2; h2.getContext('2d')!.drawImage(c, 0, 0, N / 2, N / 2);
  const nm = generateNormalMap(h2, 0.7); nm.wrapS = nm.wrapT = THREE.RepeatWrapping;
  release(map); release(nm);
  _work = { map, normalMap: nm, dispose: () => { /* shared */ } };
  return _work;
}

/** World-scaled UVs for a geometry (any indexing): one repeat per `tile` units, by dominant normal axis. */
export function worldUVs(g0: THREE.BufferGeometry, tile: number, keepDecal = false): THREE.BufferGeometry {
  const g = g0.index ? g0.toNonIndexed() : g0;
  const old = keepDecal ? g.getAttribute('uv') : null, dec = keepDecal ? g.getAttribute('aDec') : null;
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2), k = 1 / tile;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (old && dec && dec.getX(i) > 0 && dec.getX(i) < 2.5) { uv[i * 2] = old.getX(i); uv[i * 2 + 1] = old.getY(i); continue; }
    const top = ay >= ax && ay >= az;
    uv[i * 2] = (top ? p.getX(i) : ax >= az ? p.getZ(i) : p.getX(i)) * k; uv[i * 2 + 1] = (top ? p.getZ(i) : p.getY(i)) * k;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** The entrance signs' atlas: two columns by four rows of 256 x 64 plates with real lettering (white on dark steel, one amber caution). Shared, 512 x 256. */
export const SIGN_CELLS = ['SALLY PORT', 'VEHICLES ONLY', 'LOCK CYCLE', 'WAIT FOR GREEN', 'ENTRANCE', 'PERSONNEL AIRLOCK', 'SEALED', 'AUTHORIZED ONLY'] as const;
export type SignCell = number;
let _signs: THREE.CanvasTexture | null = null;
export function signAtlas(): THREE.CanvasTexture {
  if (_signs) return _signs;
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d')!;
  SIGN_CELLS.forEach((txt, i) => {
    const x = (i % 2) * 256, y = Math.floor(i / 2) * 64, amber = txt === 'WAIT FOR GREEN' || txt === 'SEALED';
    g.fillStyle = amber ? '#d9a21e' : '#1d242c'; g.fillRect(x, y, 256, 64);
    g.strokeStyle = amber ? '#1d242c' : '#cfd6dc'; g.lineWidth = 3; g.strokeRect(x + 4, y + 4, 248, 56);
    g.fillStyle = amber ? '#1d242c' : '#f2f5f7'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 30; while (g.measureText(txt).width > 220 && fs > 12) { fs -= 2; g.font = `bold ${fs}px sans-serif`; }
    g.fillText(txt, x + 128, y + 34);
    g.fillStyle = amber ? '#1d242c' : '#9aa4ad'; for (const bx of [12, 244]) for (const by of [12, 52]) { g.beginPath(); g.arc(x + bx, y + by, 2.2, 0, Math.PI * 2); g.fill(); }   // bolts
  });
  _signs = new THREE.CanvasTexture(c); _signs.colorSpace = THREE.SRGBColorSpace; _signs.anisotropy = 4;
  return _signs;
}
/** A plate quad of cell `cell` (0..7) as a plane in the XY plane facing +z, sized w by h. */
export function signQuad(cell: number, w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h), u0 = (cell % 2) * 0.5, v0 = 1 - (Math.floor(cell / 2) + 1) * 0.25, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.25);
  return g;
}
