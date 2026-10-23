/**
 * Build-kit materials — procedural canvas textures (no external assets) with
 * normal maps derived by UE's Sobel generator (engine/world/materials/normalMapGen).
 *
 * Textures are painted at a fixed world size (TEX_WORLD units per repeat) and
 * the kit's geometry carries world-scaled UVs, so boards, stones and seams
 * keep their real size on any wall. Scale: 1 world unit ≈ 6 m.
 *
 * GDS §2.3: each material will carry stats (cost, build time, protection …);
 * this module is only the look. Weathering (age → bleaching, moss, rust) is a
 * later layer on top of these.
 */
import * as THREE from 'three';
import { generateNormalMap } from '../../engine/world/materials/normalMapGen';

export type KitMaterialId = 'timber_lap' | 'trim' | 'fieldstone' | 'metal_roof' | 'deck' | 'door' | 'glass' | 'chimney_cap' | 'frame' | 'scaffold' | 'string';

/** World units covered by one texture repeat. */
const TEX_WORLD: Partial<Record<KitMaterialId, number>> = {
  timber_lap: 0.5, fieldstone: 0.5, metal_roof: 0.5, deck: 0.5, door: 0.2,
};

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function canvas(n: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return [c, c.getContext('2d')!];
}

const rgb = (r: number, g: number, b: number) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;

/**
 * Lap siding: horizontal boards ~20 cm exposure (0.033 u → 15 boards per
 * 0.5 u repeat), weathered brown with grain streaks, a dark shadow line under
 * each lap.
 */
function paintLapSiding(): HTMLCanvasElement {
  const N = 512, boards = 15, bh = N / boards;
  const [c, g] = canvas(N);
  const r = lcg(11);
  for (let i = 0; i < boards; i++) {
    const tone = 0.85 + r() * 0.25;
    const base = [128 * tone, 96 * tone, 66 * tone];
    g.fillStyle = rgb(base[0], base[1], base[2]);
    g.fillRect(0, i * bh, N, bh);
    // grain streaks
    for (let k = 0; k < 40; k++) {
      const y = i * bh + r() * bh, x = r() * N, l = 40 + r() * 160;
      const d = (r() - 0.5) * 30;
      g.fillStyle = rgb(base[0] + d, base[1] + d * 0.8, base[2] + d * 0.6);
      g.fillRect(x, y, l, 1 + r() * 1.5);
    }
    // butt joints
    for (let x = r() * 200; x < N; x += 180 + r() * 160) { g.fillStyle = 'rgba(40,28,18,0.6)'; g.fillRect(x, i * bh, 2, bh); }
    // lap shadow (the board above overhangs this one)
    const grd = g.createLinearGradient(0, i * bh, 0, i * bh + bh * 0.35);
    grd.addColorStop(0, 'rgba(25,16,10,0.75)');
    grd.addColorStop(1, 'rgba(25,16,10,0)');
    g.fillStyle = grd;
    g.fillRect(0, i * bh, N, bh * 0.35);
  }
  return c;
}

/** Fieldstone: rounded irregular stones in grey-buff tones with dark mortar. */
function paintFieldstone(): HTMLCanvasElement {
  const N = 512;
  const [c, g] = canvas(N);
  g.fillStyle = rgb(70, 66, 58);
  g.fillRect(0, 0, N, N);
  const r = lcg(23);
  let y = 0;
  while (y < N) {
    const rowH = 38 + r() * 34;
    let x = -r() * 40;
    while (x < N) {
      const w = 50 + r() * 70;
      const t = 0.75 + r() * 0.4;
      const hue = r();
      const col = hue < 0.3 ? [150, 140, 122] : hue < 0.6 ? [128, 124, 116] : hue < 0.85 ? [160, 146, 118] : [112, 100, 86];
      // draw with wrap so the texture tiles
      for (const ox of [0, -N, N]) for (const oy of [0, -N, N]) {
        g.fillStyle = rgb(col[0] * t, col[1] * t, col[2] * t);
        g.beginPath();
        g.ellipse(x + w / 2 + ox, y + rowH / 2 + oy, w / 2 - 3, rowH / 2 - 3, (r() - 0.5) * 0.2, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.beginPath();
        g.ellipse(x + w / 2 + ox - w * 0.08, y + rowH / 2 + oy - rowH * 0.12, w / 3, rowH / 4, 0, 0, Math.PI * 2);
        g.fill();
      }
      x += w;
    }
    y += rowH;
  }
  return c;
}

/** Standing-seam metal roof: ribs every ~45 cm, faded barn red with streaks. */
function paintMetalRoof(): HTMLCanvasElement {
  const N = 256, ribs = 7, pw = N / ribs;
  const [c, g] = canvas(N);
  const r = lcg(37);
  for (let i = 0; i < ribs; i++) {
    const t = 0.92 + r() * 0.12;
    g.fillStyle = rgb(122 * t, 52 * t, 40 * t);
    g.fillRect(i * pw, 0, pw, N);
    for (let k = 0; k < 14; k++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '90,60,50' : '170,120,100'},${0.08 + r() * 0.1})`;
      g.fillRect(i * pw + r() * pw, 0, 1 + r() * 3, N);
    }
    g.fillStyle = 'rgba(230,200,190,0.55)';
    g.fillRect(i * pw, 0, 2, N);
    g.fillStyle = 'rgba(40,15,10,0.6)';
    g.fillRect(i * pw + 2, 0, 3, N);
  }
  return c;
}

/** Deck planks: 14 cm boards along u with gaps, grey-brown. */
function paintDeck(): HTMLCanvasElement {
  const N = 256, n = 21, pw = N / n;
  const [c, g] = canvas(N);
  const r = lcg(41);
  for (let i = 0; i < n; i++) {
    const t = 0.85 + r() * 0.25;
    g.fillStyle = rgb(118 * t, 98 * t, 76 * t);
    g.fillRect(0, i * pw, N, pw);
    g.fillStyle = 'rgba(30,22,14,0.8)';
    g.fillRect(0, i * pw, N, 1.5);
    for (let k = 0; k < 10; k++) { g.fillStyle = `rgba(60,45,30,${0.1 + r() * 0.15})`; g.fillRect(r() * N, i * pw + r() * pw, 30 + r() * 80, 1); }
  }
  return c;
}

/** Plank door: vertical boards with a Z brace. */
function paintDoor(): HTMLCanvasElement {
  const N = 128;
  const [c, g] = canvas(N);
  const r = lcg(53);
  for (let i = 0; i < 6; i++) {
    const t = 0.85 + r() * 0.2;
    g.fillStyle = rgb(82 * t, 56 * t, 36 * t);
    g.fillRect(i * N / 6, 0, N / 6, N);
    g.fillStyle = 'rgba(20,12,6,0.8)';
    g.fillRect(i * N / 6, 0, 1.5, N);
  }
  g.fillStyle = 'rgba(30,18,10,0.55)';
  g.fillRect(0, N * 0.18, N, 10);
  g.fillRect(0, N * 0.78, N, 10);
  return c;
}

const _cache = new Map<KitMaterialId, THREE.MeshStandardMaterial>();

function texMat(id: KitMaterialId, paint: () => HTMLCanvasElement, strength: number, roughness: number, metalness = 0, ns = 1): THREE.MeshStandardMaterial {
  const cv = paint();
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  const k = 1 / (TEX_WORLD[id] ?? 1);
  map.repeat.set(k, k);
  const nm = generateNormalMap(cv, strength);
  nm.wrapS = nm.wrapT = THREE.RepeatWrapping;
  nm.repeat.set(k, k);
  return new THREE.MeshStandardMaterial({ map, normalMap: nm, normalScale: new THREE.Vector2(ns, ns), roughness, metalness });
}

/** Shared kit material (cached; never dispose these per building). */
export function kitMaterial(id: KitMaterialId): THREE.MeshStandardMaterial {
  let m = _cache.get(id);
  if (m) return m;
  switch (id) {
    case 'timber_lap': m = texMat(id, paintLapSiding, 2.2, 0.86, 0, 0.8); break;
    case 'fieldstone': m = texMat(id, paintFieldstone, 3.5, 0.92, 0, 1.2); break;
    case 'metal_roof': m = texMat(id, paintMetalRoof, 2.0, 0.55, 0.35, 0.9); break;
    case 'deck': m = texMat(id, paintDeck, 1.6, 0.85); break;
    case 'door': m = texMat(id, paintDoor, 1.5, 0.75); break;
    case 'trim': m = new THREE.MeshStandardMaterial({ color: 0xe9e2cf, roughness: 0.7 }); break;
    case 'frame': m = new THREE.MeshStandardMaterial({ color: 0xd8b98a, roughness: 0.8 }); break;   // fresh-sawn studs
    case 'scaffold': m = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.45, metalness: 0.6 }); break;
    case 'string': m = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6, emissive: new THREE.Color(0.3, 0.08, 0) }); break;
    case 'chimney_cap': m = new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 0.6, metalness: 0.3 }); break;
    case 'glass': m = new THREE.MeshStandardMaterial({ color: 0x1d2730, roughness: 0.08, metalness: 0.6, emissive: new THREE.Color(1.0, 0.72, 0.42), emissiveIntensity: 0 }); break;
  }
  m.name = `kit_${id}`;
  _cache.set(id, m);
  return m;
}

/** Interior lights behind the glass (0 = off … 1 = a warm lit room at night). */
export function setWindowGlow(k: number): void {
  const g = _cache.get('glass');
  if (g) g.emissiveIntensity = 1.6 * k;
}
