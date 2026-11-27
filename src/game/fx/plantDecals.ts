/**
 * A small shared decal atlas for the plant yard's merged machinery mesh (fx/DomePlant): louvers, coil fins, grilles, a panel door, warning and data plates, a lit lamp panel, a pegboard, a cable
 * tray and cylinder ribs and pleats, as texture and normal map instead of geometry (a louver is one quad, not a stack of slats). 512 x 256, sixteen 128 x 64 cells, painted once, near-white
 * where a vertex color should tint it, real colors for plates. The machinery's vertices carry a flag (`aDec`: 0 the tiling work sheet, 1 an atlas cell, 2 a lit atlas cell, 3 the work sheet self-lit); the material is
 * patched (`patchDecalMaterial`) to sample the atlas where it is set. The CPU copies are dropped after the GPU upload. Pure seeded art; no external assets.
 */
import * as THREE from 'three';
import { generateNormalMap } from '../../engine/world/materials/normalMapGen';

export const DECAL_CELLS = ['louver', 'fins', 'grille', 'door', 'hv', 'danger', 'hot', 'keepclear', 'plate', 'airin', 'light', 'pegboard', 'tray', 'ribs', 'pleats', 'firstaid'] as const;
export type DecalCell = typeof DECAL_CELLS[number];
const CW = 128, CH = 64, COLS = 4, AW = CW * COLS, AH = CH * 4;
/** Cells that glow (flag 2). */
export const LIT_CELLS: ReadonlySet<DecalCell> = new Set<DecalCell>(['light']);

const lcg = (seed: number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

/** The uv rectangle of a cell (u0, v0, u1, v1), inset a texel so a neighbor never bleeds in. */
export function cellRect(cell: DecalCell): [number, number, number, number] {
  const i = DECAL_CELLS.indexOf(cell), col = i % COLS, row = Math.floor(i / COLS), e = 1.2;
  return [(col * CW + e) / AW, 1 - ((row + 1) * CH - e) / AH, ((col + 1) * CW - e) / AW, 1 - (row * CH + e) / AH];
}

type G2 = CanvasRenderingContext2D;
const text = (g: G2, s: string, x: number, y: number, px: number, color: string, w = 120): void => {
  let f = px; g.font = `bold ${f}px sans-serif`; while (g.measureText(s).width > w && f > 6) { f -= 1; g.font = `bold ${f}px sans-serif`; }
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y);
};
const rivets = (g: G2, w: number, h: number, color = 'rgba(40,40,44,0.8)'): void => { g.fillStyle = color; for (const [x, y] of [[5, 5], [w - 5, 5], [5, h - 5], [w - 5, h - 5]]) { g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill(); } };

const PAINT: Record<DecalCell, (g: G2, r: () => number) => void> = {
  louver: (g, r) => {
    g.fillStyle = 'rgb(70,74,78)'; g.fillRect(0, 0, CW, CH);                                           // the dark behind the slats
    const n = 8, sh = CH / n;
    for (let i = 0; i < n; i++) {
      const y = i * sh, gr = g.createLinearGradient(0, y, 0, y + sh - 2); gr.addColorStop(0, 'rgb(248,248,248)'); gr.addColorStop(0.55, 'rgb(222,224,226)'); gr.addColorStop(1, 'rgb(170,174,178)');
      g.fillStyle = gr; g.fillRect(3, y + 0.5, CW - 6, sh - 2.4);                                      // a slanted blade: lit lip, shaded belly
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(3, y + 0.5, CW - 6, 0.9);
      g.fillStyle = 'rgba(0,0,0,0.16)'; for (let k = 0; k < 3; k++) g.fillRect(3 + r() * (CW - 14), y + 1 + r() * (sh - 3), 4 + r() * 12, 0.8);
    }
    g.fillStyle = 'rgb(236,238,240)'; g.fillRect(0, 0, 3, CH); g.fillRect(CW - 3, 0, 3, CH); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(3, 0, 1, CH); g.fillRect(CW - 4, 0, 1, CH);   // the frame
  },
  fins: (g, r) => {
    g.fillStyle = 'rgb(46,50,54)'; g.fillRect(0, 0, CW, CH);
    const n = 32, sw = (CW - 8) / n;
    for (let i = 0; i < n; i++) { const x = 4 + i * sw, v = 200 + r() * 40; g.fillStyle = `rgb(${v},${v + 2},${v + 5})`; g.fillRect(x + 0.4, 3, sw - 1.1, CH - 6); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x + 0.4, 3, 0.8, CH - 6); }
    g.fillStyle = 'rgb(150,155,160)'; g.fillRect(0, 0, CW, 4); g.fillRect(0, CH - 4, CW, 4); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 4, CW, 1); g.fillRect(0, CH - 5, CW, 1);
  },
  grille: (g, r) => {
    g.fillStyle = 'rgb(30,32,35)'; g.fillRect(0, 0, CW, CH);
    g.strokeStyle = 'rgb(176,182,188)'; g.lineWidth = 1.3;
    for (let k = -CH; k < CW + CH; k += 7) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + CH, CH); g.stroke(); g.beginPath(); g.moveTo(k + CH, 0); g.lineTo(k, CH); g.stroke(); }
    g.fillStyle = 'rgb(204,208,212)'; g.fillRect(0, 0, CW, 4); g.fillRect(0, CH - 4, CW, 4); g.fillRect(0, 0, 4, CH); g.fillRect(CW - 4, 0, 4, CH); rivets(g, CW, CH);
    void r;
  },
  door: (g, r) => {
    g.fillStyle = 'rgb(226,228,230)'; g.fillRect(0, 0, CW, CH);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, 0, CW, 2); g.fillRect(0, 0, 2, CH); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(0, CH - 2, CW, 2); g.fillRect(CW - 2, 0, 2, CH);
    g.strokeStyle = 'rgba(40,44,50,0.7)'; g.lineWidth = 1.4; g.strokeRect(10, 8, CW - 20, CH - 16); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.strokeRect(11.5, 9.5, CW - 23, CH - 19);   // the pressed panel
    g.fillStyle = 'rgb(38,42,48)'; g.fillRect(CW - 24, CH * 0.38, 10, 5); g.fillStyle = 'rgb(180,186,192)'; g.fillRect(CW - 24, CH * 0.38, 10, 1.4);                        // the pull handle
    g.fillStyle = 'rgb(60,64,70)'; for (const y of [10, CH / 2, CH - 12]) g.fillRect(2, y, 6, 4);                                                                           // hinges
    rivets(g, CW, CH); void r;
  },
  hv: (g) => {
    g.fillStyle = '#e8b800'; g.fillRect(0, 0, CW, CH); g.strokeStyle = '#141414'; g.lineWidth = 3; g.strokeRect(2.5, 2.5, CW - 5, CH - 5);
    g.fillStyle = '#141414'; g.fillRect(3, 3, CW - 6, 17); text(g, 'DANGER', CW / 2, 12, 14, '#ffd21a');
    g.fillStyle = '#141414'; g.beginPath(); g.moveTo(34, 26); g.lineTo(18, 46); g.lineTo(28, 46); g.lineTo(22, 60); g.lineTo(44, 38); g.lineTo(33, 38); g.lineTo(42, 26); g.closePath(); g.fill();   // the bolt
    text(g, 'HIGH', 84, 34, 14, '#141414', 66); text(g, 'VOLTAGE', 84, 49, 14, '#141414', 66);
  },
  danger: (g) => {
    g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, CW, CH); g.fillStyle = '#c4281c'; g.fillRect(0, 0, CW, 22); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(CW / 2, 11, 52, 8.5, 0, 0, Math.PI * 2); g.fill();
    text(g, 'DANGER', CW / 2, 11.5, 14, '#c4281c'); text(g, 'AUTOMATIC START', CW / 2, 36, 11, '#181818'); text(g, 'KEEP CLEAR OF FAN', CW / 2, 51, 10, '#181818');
    g.strokeStyle = '#181818'; g.lineWidth = 1.5; g.strokeRect(1.5, 1.5, CW - 3, CH - 3);
  },
  hot: (g) => {
    g.fillStyle = '#e8721c'; g.fillRect(0, 0, CW, CH); g.strokeStyle = '#161616'; g.lineWidth = 3; g.strokeRect(2.5, 2.5, CW - 5, CH - 5);
    text(g, 'CAUTION', CW / 2, 15, 14, '#161616'); g.strokeStyle = '#161616'; g.lineWidth = 2.2;
    for (const x of [26, 38, 50]) { g.beginPath(); g.moveTo(x, 50); g.bezierCurveTo(x - 6, 44, x + 6, 38, x, 30); g.stroke(); }
    text(g, 'HOT', 94, 33, 15, '#161616', 50); text(g, 'SURFACE', 94, 49, 12, '#161616', 56);
  },
  keepclear: (g) => {
    g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, CW, CH); g.fillStyle = '#b32217'; g.fillRect(0, 0, CW, 6); g.fillRect(0, CH - 6, CW, 6);
    text(g, 'KEEP CLEAR', CW / 2, 24, 17, '#b32217'); text(g, 'EQUIPMENT ACCESS', CW / 2, 43, 10, '#1a1a1a'); g.strokeStyle = '#1a1a1a'; g.lineWidth = 1.2; g.strokeRect(1.5, 1.5, CW - 3, CH - 3);
  },
  plate: (g, r) => {
    const gr = g.createLinearGradient(0, 0, CW, CH); gr.addColorStop(0, 'rgb(232,234,236)'); gr.addColorStop(1, 'rgb(196,200,204)'); g.fillStyle = gr; g.fillRect(0, 0, CW, CH);
    g.strokeStyle = 'rgb(70,74,80)'; g.lineWidth = 2; g.strokeRect(2, 2, CW - 4, CH - 4); rivets(g, CW, CH);
    text(g, 'MODEL  XF-500', CW / 2, 15, 11, '#1c1f23', 104); text(g, '480 V   60 HZ   3 PH', CW / 2, 29, 9, '#1c1f23', 104); text(g, 'SERIAL 0417-22', CW / 2, 42, 9, '#1c1f23', 104);
    g.fillStyle = 'rgba(30,30,34,0.5)'; for (let k = 0; k < 4; k++) g.fillRect(14 + r() * 80, 51, 6 + r() * 18, 1.4);
  },
  airin: (g) => {
    g.fillStyle = '#1f4c7a'; g.fillRect(0, 0, CW, CH); g.strokeStyle = '#e8f0f6'; g.lineWidth = 2; g.strokeRect(3, 3, CW - 6, CH - 6);
    g.fillStyle = '#e8f0f6'; g.beginPath(); g.moveTo(16, 28); g.lineTo(46, 28); g.lineTo(46, 17); g.lineTo(68, 32); g.lineTo(46, 47); g.lineTo(46, 36); g.lineTo(16, 36); g.closePath(); g.fill(); text(g, 'AIR', 98, 24, 15, '#e8f0f6', 44); text(g, 'IN', 98, 42, 15, '#e8f0f6', 44);
  },
  light: (g) => {
    g.fillStyle = 'rgb(88,92,98)'; g.fillRect(0, 0, CW, CH);                                        // the recessed frame
    const gr = g.createRadialGradient(CW / 2, CH / 2, 4, CW / 2, CH / 2, CW * 0.55); gr.addColorStop(0, 'rgb(255,251,236)'); gr.addColorStop(1, 'rgb(246,232,196)'); g.fillStyle = gr; g.fillRect(5, 5, CW - 10, CH - 10);
    g.fillStyle = 'rgba(190,176,140,0.5)'; for (const x of [CW / 3, (2 * CW) / 3]) g.fillRect(x - 0.5, 5, 1, CH - 10); g.fillRect(5, CH / 2 - 0.5, CW - 10, 1);                     // the diffuser's ribs
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(5, 5, CW - 10, 1.2);
  },
  pegboard: (g, r) => {
    g.fillStyle = 'rgb(255,196,128)'; g.fillRect(0, 0, CW, CH); for (let k = 0; k < 90; k++) { const v = r() * 22; g.fillStyle = `rgba(${190 + v},${120 + v},${70 + v},0.14)`; g.fillRect(r() * CW, r() * CH, 6 + r() * 18, 1); }
    for (let y = 5; y < CH; y += 8) for (let x = 5; x < CW; x += 8) { g.fillStyle = 'rgb(120,84,48)'; g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,240,200,0.55)'; g.fillRect(x - 1.8, y + 1.7, 3.6, 0.7); }
    g.fillStyle = 'rgb(170,140,98)'; g.fillRect(0, 0, CW, 1.5); g.fillRect(0, CH - 1.5, CW, 1.5);
  },
  tray: (g) => {
    g.fillStyle = 'rgb(32,34,38)'; g.fillRect(0, 0, CW, CH);                                         // a ladder tray seen from below: rungs between two side rails
    g.fillStyle = 'rgb(168,174,180)'; g.fillRect(0, 0, CW, 6); g.fillRect(0, CH - 6, CW, 6); g.fillStyle = 'rgb(236,240,244)'; g.fillRect(0, 0, CW, 1.4); g.fillRect(0, CH - 6, CW, 1.4);
    for (let x = 6; x < CW; x += 12) { g.fillStyle = 'rgb(150,156,162)'; g.fillRect(x, 6, 4.5, CH - 12); g.fillStyle = 'rgb(214,218,222)'; g.fillRect(x, 6, 1.2, CH - 12); }
  },
  ribs: (g, r) => {
    g.fillStyle = 'rgb(220,222,224)'; g.fillRect(0, 0, CW, CH);
    for (let y = 0; y < CH; y += 8) { const gr = g.createLinearGradient(0, y, 0, y + 8); gr.addColorStop(0, 'rgb(250,250,250)'); gr.addColorStop(0.7, 'rgb(214,216,218)'); gr.addColorStop(1, 'rgb(96,100,104)'); g.fillStyle = gr; g.fillRect(0, y, CW, 8); }
    for (let k = 0; k < 20; k++) { g.fillStyle = 'rgba(20,20,20,0.12)'; g.fillRect(r() * CW, r() * CH, 3 + r() * 10, 0.8); }
  },
  pleats: (g, r) => {
    g.fillStyle = 'rgb(230,228,214)'; g.fillRect(0, 0, CW, CH);
    for (let x = 0; x < CW; x += 6) { const gr = g.createLinearGradient(x, 0, x + 6, 0); gr.addColorStop(0, 'rgb(252,250,238)'); gr.addColorStop(0.6, 'rgb(220,216,198)'); gr.addColorStop(1, 'rgb(120,116,100)'); g.fillStyle = gr; g.fillRect(x, 0, 6, CH); }
    for (let k = 0; k < 24; k++) { g.fillStyle = 'rgba(70,60,40,0.10)'; g.fillRect(r() * CW, r() * CH, 1, 5 + r() * 14); }
  },
  firstaid: (g) => {
    g.fillStyle = '#1f7a45'; g.fillRect(0, 0, CW, CH); g.strokeStyle = '#f2f6f2'; g.lineWidth = 2; g.strokeRect(3, 3, CW - 6, CH - 6);
    g.fillStyle = '#f2f6f2'; g.fillRect(14, 22, 28, 9); g.fillRect(23.5, 12.5, 9, 28); text(g, 'FIRST', 86, 24, 14, '#f2f6f2', 54); text(g, 'AID', 86, 42, 14, '#f2f6f2', 54);
  },
};

export interface DecalTextures { map: THREE.CanvasTexture; normalMap: THREE.Texture }
let _atlas: DecalTextures | null = null;
export const release = (t: THREE.Texture): void => { const c = t.image as HTMLCanvasElement | undefined; t.onUpdate = () => { if (c && 'width' in c) { c.width = 1; c.height = 1; } t.onUpdate = null; }; };
/** One shared atlas and normal map (painted once; the canvases are freed after the first upload; kept for the page's life like the other shared sheets). */
export function decalAtlas(): DecalTextures {
  if (_atlas) return _atlas;
  const c = document.createElement('canvas'); c.width = AW; c.height = AH;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  DECAL_CELLS.forEach((name, i) => { g.save(); g.translate((i % COLS) * CW, Math.floor(i / COLS) * CH); g.beginPath(); g.rect(0, 0, CW, CH); g.clip(); PAINT[name](g, lcg(500 + i * 17)); g.restore(); });
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; map.generateMipmaps = true;
  const h2 = document.createElement('canvas'); h2.width = AW / 2; h2.height = AH / 2; h2.getContext('2d')!.drawImage(c, 0, 0, AW / 2, AH / 2);      // (the relief is read from a half-size copy: a quarter of the memory)
  const nm = generateNormalMap(h2, 1.0); nm.anisotropy = 2;
  release(map); release(nm);
  _atlas = { map, normalMap: nm };
  return _atlas;
}

const attr1 = (n: number, v: number): THREE.BufferAttribute => new THREE.BufferAttribute(new Uint8Array(n).fill(v), 1);

/** Which faces of a box carry the decal: the two big faces along an axis (`x`, `y`, `z`), or one named face. */
export type DecalFace = 'x' | 'y' | 'z' | 'pz' | 'nz' | 'px' | 'nx' | 'py' | 'ny' | 'side';
const FACE_IDX: Record<string, number[]> = { x: [0, 1], y: [2, 3], z: [4, 5], px: [0], nx: [1], py: [2], ny: [3], pz: [4], nz: [5], side: [0, 1, 4, 5] };
/**
 * Point a Box (or Plane) geometry's chosen faces at an atlas cell: their uvs become the cell's rectangle (u across, v up, as seen from outside, `rep` repeats across v), and the vertex flag
 * is set (1, or 2 for a lit cell). Other faces keep flag 0 (the tiling work sheet). `uvScale`: how much of the cell's width and height to show (a long strip shows a part).
 */
export function decalBox(geo: THREE.BufferGeometry, cell: DecalCell, faces: DecalFace, flip = false, swap = false): THREE.BufferGeometry {
  const [u0, v0, u1, v1] = cellRect(cell), uv = geo.getAttribute('uv') as THREE.BufferAttribute, n = uv.count, dec = new Uint8Array(n), val = LIT_CELLS.has(cell) ? 2 : 1;
  for (const f of FACE_IDX[faces]) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k, a = flip ? 1 - uv.getX(i) : uv.getX(i), b = uv.getY(i), u = swap ? b : a, v = swap ? a : b;
    uv.setXY(i, u0 + (u1 - u0) * u, v0 + (v1 - v0) * v); dec[i] = val;
  }
  geo.setAttribute('aDec', new THREE.BufferAttribute(dec, 1));
  return geo;
}
/** A cylinder's side wrapped in a cell (u around `turns` times, v along its height). */
export function decalCylinder(geo: THREE.CylinderGeometry, cell: DecalCell, turns = 1, rep = 1): THREE.CylinderGeometry {
  const [u0, v0, u1, v1] = cellRect(cell), uv = geo.getAttribute('uv') as THREE.BufferAttribute, n = uv.count, dec = new Uint8Array(n), rs = geo.parameters.radialSegments, side = (rs + 1) * 2;
  for (let i = 0; i < side && i < n; i++) {
    const uu = (uv.getX(i) * turns) % 1 || (uv.getX(i) * turns > 0 ? 1 : 0), vv = (uv.getY(i) * rep) % 1 || (uv.getY(i) > 0 ? 1 : 0);
    uv.setXY(i, u0 + (u1 - u0) * uu, v0 + (v1 - v0) * vv); dec[i] = 1;
  }
  geo.setAttribute('aDec', new THREE.BufferAttribute(dec, 1));
  return geo;
}

/** A cylinder's top cap in a cell (its circular uv square cropped to the cell): a fan grille as one flat texture. */
export function decalCap(geo: THREE.CylinderGeometry, cell: DecalCell): THREE.CylinderGeometry {
  const [u0, v0, u1, v1] = cellRect(cell), uv = geo.getAttribute('uv') as THREE.BufferAttribute, nm = geo.getAttribute('normal') as THREE.BufferAttribute, n = uv.count, dec = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (nm.getY(i) > 0.5) { uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), v0 + (v1 - v0) * uv.getY(i)); dec[i] = 1; }
  geo.setAttribute('aDec', new THREE.BufferAttribute(dec, 1));
  return geo;
}

/** Give every geometry the attributes a merge needs: a flag (0) and a uv (zeros), where missing. */
export function withDecalAttrs(geos: THREE.BufferGeometry[]): void {
  for (const g of geos) {
    const n = g.getAttribute('position').count;
    if (!g.getAttribute('aDec')) g.setAttribute('aDec', attr1(n, 0));
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
}

const SHARED_KEY = 'plantDecals2';
/** Patch a MeshStandardMaterial that has a `map` and a `normalMap` (the tiling work sheet) so a vertex flag `aDec` picks the atlas instead, and flag 2 glows. */
export function patchDecalMaterial(mat: THREE.MeshStandardMaterial, atlas: DecalTextures, glow = 1.5): void {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.decalMap = { value: atlas.map }; sh.uniforms.decalNormal = { value: atlas.normalMap }; sh.uniforms.decalGlow = { value: glow };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aDec;\nvarying float vDec;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDec = aDec;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D decalMap;\nuniform sampler2D decalNormal;\nuniform float decalGlow;\nvarying float vDec;')
      .replace('#include <map_fragment>', 'float decSel = step( 0.5, vDec ) - step( 2.5, vDec );\nvec4 sampledDiffuseColor = mix( texture2D( map, vMapUv ), texture2D( decalMap, vMapUv ), decSel );\ndiffuseColor *= sampledDiffuseColor;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * ( decalGlow * ( step( 1.5, vDec ) - step( 2.5, vDec ) ) + 0.5 * step( 2.5, vDec ) );')
      .split('texture2D( normalMap, vNormalMapUv )').join('mix( texture2D( normalMap, vNormalMapUv ), texture2D( decalNormal, vNormalMapUv ), step( 0.5, vDec ) - step( 2.5, vDec ) )');
  };
  mat.customProgramCacheKey = () => SHARED_KEY;
}
