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

export type KitMaterialId = 'timber_lap' | 'trim' | 'fieldstone' | 'metal_roof' | 'deck' | 'door' | 'glass' | 'chimney_cap' | 'frame' | 'scaffold' | 'string'
  // interior finishes and furnishings
  | 'pine_panel' | 'wood_dark' | 'wood_mid' | 'iron' | 'enamel' | 'quilt_red' | 'quilt_blue' | 'linen' | 'rug' | 'books' | 'lamp' | 'cutcap' | 'crockery'
  // more buildings
  | 'concrete' | 'metal_siding' | 'log_wall' | 'log_end' | 'board_batten' | 'wire_mesh' | 'straw' | 'soil' | 'crop' | 'earth' | 'pegboard' | 'steel' | 'paint_red' | 'paint_green';

/** World units covered by one texture repeat. */
const TEX_WORLD: Partial<Record<KitMaterialId, number>> = {
  timber_lap: 0.5, fieldstone: 0.5, metal_roof: 0.5, deck: 0.5, door: 0.2,
  pine_panel: 0.5, quilt_red: 0.12, quilt_blue: 0.12, rug: 0.3, books: 0.1,
  concrete: 0.6, metal_siding: 0.5, log_wall: 0.5, board_batten: 0.5, wire_mesh: 0.15, straw: 0.3, soil: 0.4, earth: 0.8, pegboard: 0.2,
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

/** Knotty pine tongue-and-groove: vertical 10 cm boards, honey tone, knots and V-groove shadows. */
function paintPinePanel(): HTMLCanvasElement {
  const N = 512, n = 30, bw = N / n;
  const [c, g] = canvas(N);
  const r = lcg(61);
  for (let i = 0; i < n; i++) {
    const t = 0.88 + r() * 0.2;
    g.fillStyle = rgb(196 * t, 150 * t, 96 * t);
    g.fillRect(i * bw, 0, bw, N);
    for (let k = 0; k < 18; k++) {
      g.fillStyle = `rgba(150,100,55,${0.08 + r() * 0.14})`;
      g.fillRect(i * bw + r() * bw, r() * N, 1, 30 + r() * 140);
    }
    if (r() < 0.55) {
      const ky = r() * N, kx = i * bw + bw * (0.3 + r() * 0.4);
      g.fillStyle = 'rgba(95,55,25,0.75)';
      g.beginPath(); g.ellipse(kx, ky, 2.2 + r() * 2, 3 + r() * 3, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(70,42,20,0.7)';
    g.fillRect(i * bw, 0, 1.5, N);
  }
  return c;
}

/** Patchwork / plaid quilt in a base colour. */
function paintQuilt(base: [number, number, number], seed: number): () => HTMLCanvasElement {
  return () => {
    const N = 128, k = 8, s = N / k;
    const [c, g] = canvas(N);
    const r = lcg(seed);
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
      const t = (i + j) % 2 ? 0.75 + r() * 0.15 : 1 + r() * 0.1;
      g.fillStyle = rgb(base[0] * t, base[1] * t, base[2] * t);
      g.fillRect(i * s, j * s, s, s);
    }
    g.fillStyle = 'rgba(240,230,210,0.35)';
    for (let i = 0; i < k; i++) { g.fillRect(i * s + s / 2 - 1, 0, 2, N); g.fillRect(0, i * s + s / 2 - 1, N, 2); }
    return c;
  };
}

/** Braided rag rug: concentric bands of muted colours. */
function paintRug(): HTMLCanvasElement {
  const N = 128;
  const [c, g] = canvas(N);
  const cols = ['#8a3b2c', '#c49a5a', '#4f5f6e', '#7b6a4e', '#a65a3a', '#5d6b4a'];
  for (let i = 0; i < 12; i++) {
    g.fillStyle = cols[i % cols.length];
    const m = i * 5;
    g.fillRect(m, m, N - 2 * m, N - 2 * m);
  }
  return c;
}

/** Book spines: varied colours and heights along u. */
function paintBooks(): HTMLCanvasElement {
  const N = 128;
  const [c, g] = canvas(N);
  const r = lcg(71);
  g.fillStyle = '#3a2a1c';
  g.fillRect(0, 0, N, N);
  const cols = [[120, 40, 35], [40, 60, 90], [50, 80, 50], [150, 120, 70], [90, 50, 80], [30, 30, 30], [170, 150, 120]];
  for (let x = 0; x < N;) {
    const w = 3 + r() * 6, col = cols[Math.floor(r() * cols.length)], h = N * (0.7 + r() * 0.3);
    g.fillStyle = rgb(col[0], col[1], col[2]);
    g.fillRect(x, N - h, w - 0.6, h);
    g.fillStyle = 'rgba(230,210,150,0.5)';
    g.fillRect(x + 0.5, N - h + h * 0.2, w - 1.6, 1.5);
    x += w;
  }
  return c;
}

/** Poured concrete: grey with mottling, trowel swirls and a few cracks. */
function paintConcrete(): HTMLCanvasElement {
  const N = 256;
  const [c, g] = canvas(N);
  const r = lcg(91);
  g.fillStyle = rgb(150, 148, 142);
  g.fillRect(0, 0, N, N);
  for (let k = 0; k < 900; k++) {
    const t = r();
    g.fillStyle = `rgba(${t < 0.5 ? '110,108,104' : '185,182,176'},${0.05 + r() * 0.12})`;
    g.fillRect(r() * N, r() * N, 2 + r() * 10, 2 + r() * 10);
  }
  g.strokeStyle = 'rgba(80,78,74,0.5)';
  for (let k = 0; k < 3; k++) { g.beginPath(); let x = r() * N, y = r() * N; g.moveTo(x, y); for (let i = 0; i < 6; i++) { x += (r() - 0.5) * 40; y += (r() - 0.3) * 30; g.lineTo(x, y); } g.stroke(); }
  return c;
}

/** Corrugated / ribbed steel siding: vertical ribs, galvanised grey-green with streaks. */
function paintMetalSiding(): HTMLCanvasElement {
  const N = 256, ribs = 12, pw = N / ribs;
  const [c, g] = canvas(N);
  const r = lcg(97);
  for (let i = 0; i < ribs; i++) {
    const grd = g.createLinearGradient(i * pw, 0, (i + 1) * pw, 0);
    grd.addColorStop(0, rgb(70, 82, 74)); grd.addColorStop(0.5, rgb(112, 126, 116)); grd.addColorStop(1, rgb(64, 74, 68));
    g.fillStyle = grd;
    g.fillRect(i * pw, 0, pw, N);
  }
  for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(120,90,60,${0.04 + r() * 0.08})`; g.fillRect(r() * N, r() * N * 0.5 + N * 0.5, 1 + r() * 3, 20 + r() * 60); }
  return c;
}

/** Log wall: horizontal round logs (~30 cm) with pale chinking between. */
function paintLogWall(): HTMLCanvasElement {
  const N = 512, n = 10, lh = N / n;
  const [c, g] = canvas(N);
  const r = lcg(103);
  for (let i = 0; i < n; i++) {
    const t = 0.85 + r() * 0.25;
    const grd = g.createLinearGradient(0, i * lh, 0, (i + 1) * lh);
    grd.addColorStop(0, rgb(70 * t, 46 * t, 26 * t));
    grd.addColorStop(0.35, rgb(150 * t, 102 * t, 58 * t));
    grd.addColorStop(0.7, rgb(128 * t, 86 * t, 48 * t));
    grd.addColorStop(1, rgb(58 * t, 38 * t, 22 * t));
    g.fillStyle = grd;
    g.fillRect(0, i * lh, N, lh);
    for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(60,38,20,${0.1 + r() * 0.2})`; g.fillRect(r() * N, i * lh + lh * (0.2 + r() * 0.6), 30 + r() * 120, 1); }
    g.fillStyle = 'rgba(214,200,170,0.9)';
    g.fillRect(0, i * lh - 2, N, 4);
  }
  return c;
}

/** Board-and-batten: vertical boards with raised battens, barn red or weathered grey. */
function paintBoardBatten(): HTMLCanvasElement {
  const N = 256, n = 8, bw = N / n;
  const [c, g] = canvas(N);
  const r = lcg(107);
  for (let i = 0; i < n; i++) {
    const t = 0.88 + r() * 0.18;
    g.fillStyle = rgb(126 * t, 58 * t, 44 * t);
    g.fillRect(i * bw, 0, bw, N);
    for (let k = 0; k < 10; k++) { g.fillStyle = `rgba(80,40,30,${0.08 + r() * 0.12})`; g.fillRect(i * bw + r() * bw, r() * N, 1, 40 + r() * 100); }
    g.fillStyle = 'rgba(40,18,12,0.55)'; g.fillRect(i * bw - 3, 0, 2, N);
    g.fillStyle = rgb(142, 68, 52); g.fillRect(i * bw - 1, 0, 5, N);
  }
  return c;
}

/** Welded wire / chicken wire mesh (alpha). */
function paintMesh(): HTMLCanvasElement {
  const N = 128;
  const [c, g] = canvas(N);
  g.clearRect(0, 0, N, N);
  g.strokeStyle = 'rgba(170,175,170,1)';
  g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, N); g.stroke(); g.beginPath(); g.moveTo(0, i * 16); g.lineTo(N, i * 16); g.stroke(); }
  return c;
}

/** Straw bedding: tangled pale stalks. */
function paintStraw(): HTMLCanvasElement {
  const N = 128;
  const [c, g] = canvas(N);
  const r = lcg(109);
  g.fillStyle = rgb(196, 168, 98);
  g.fillRect(0, 0, N, N);
  for (let k = 0; k < 400; k++) {
    g.strokeStyle = `rgba(${r() < 0.5 ? '230,205,130' : '150,120,60'},0.7)`;
    g.beginPath(); const x = r() * N, y = r() * N, a = r() * Math.PI; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12); g.stroke();
  }
  return c;
}

/** Tilled garden soil: dark loam with clods. */
function paintSoil(): HTMLCanvasElement {
  const N = 128;
  const [c, g] = canvas(N);
  const r = lcg(113);
  g.fillStyle = rgb(72, 52, 36);
  g.fillRect(0, 0, N, N);
  for (let k = 0; k < 500; k++) { const t = r(); g.fillStyle = `rgba(${t < 0.5 ? '40,28,18' : '110,84,60'},${0.3 + r() * 0.4})`; g.fillRect(r() * N, r() * N, 1 + r() * 4, 1 + r() * 3); }
  return c;
}

/** Sod over an earth-bermed roof: grass with patches of soil. */
function paintEarth(): HTMLCanvasElement {
  const N = 128;
  const [c, g] = canvas(N);
  const r = lcg(127);
  g.fillStyle = rgb(92, 104, 60);
  g.fillRect(0, 0, N, N);
  for (let k = 0; k < 600; k++) { const t = r(); g.fillStyle = `rgba(${t < 0.3 ? '96,74,48' : t < 0.7 ? '120,132,72' : '70,84,46'},${0.3 + r() * 0.4})`; g.fillRect(r() * N, r() * N, 1 + r() * 3, 2 + r() * 4); }
  return c;
}

/** Pegboard: brown hardboard with a hole grid. */
function paintPegboard(): HTMLCanvasElement {
  const N = 128;
  const [c, g] = canvas(N);
  g.fillStyle = rgb(150, 112, 74);
  g.fillRect(0, 0, N, N);
  g.fillStyle = 'rgba(40,26,16,0.85)';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.beginPath(); g.arc(8 + i * 16, 8 + j * 16, 2.2, 0, Math.PI * 2); g.fill(); }
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
    // see-through (rooms are furnished); a little reflection, warm glow from the lamps at night
    case 'glass': m = new THREE.MeshStandardMaterial({ color: 0x9fb4c0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false, emissive: new THREE.Color(1.0, 0.72, 0.42), emissiveIntensity: 0 }); break;
    case 'pine_panel': m = texMat(id, paintPinePanel, 1.2, 0.7); break;
    case 'wood_dark': m = new THREE.MeshStandardMaterial({ color: 0x5a3b24, roughness: 0.6 }); break;
    case 'wood_mid': m = new THREE.MeshStandardMaterial({ color: 0x9a6a3e, roughness: 0.65 }); break;
    case 'iron': m = new THREE.MeshStandardMaterial({ color: 0x1e1e1f, roughness: 0.55, metalness: 0.7 }); break;
    case 'enamel': m = new THREE.MeshStandardMaterial({ color: 0xece8de, roughness: 0.25 }); break;
    case 'crockery': m = new THREE.MeshStandardMaterial({ color: 0x8fa6b6, roughness: 0.35 }); break;
    case 'linen': m = new THREE.MeshStandardMaterial({ color: 0xeee6d6, roughness: 0.9 }); break;
    case 'quilt_red': m = texMat(id, paintQuilt([168, 52, 44], 81), 0.6, 0.95); break;
    case 'quilt_blue': m = texMat(id, paintQuilt([52, 78, 128], 83), 0.6, 0.95); break;
    case 'rug': m = texMat(id, paintRug, 0.8, 0.95); break;
    case 'books': m = texMat(id, paintBooks, 0.8, 0.8); break;
    case 'lamp': m = new THREE.MeshStandardMaterial({ color: 0xffe6b0, roughness: 0.3, emissive: new THREE.Color(1.0, 0.75, 0.4), emissiveIntensity: 0.4, transparent: true, opacity: 0.85 }); break;
    case 'cutcap': m = new THREE.MeshStandardMaterial({ color: 0x3b2a1d, roughness: 0.9 }); break;
    case 'concrete': m = texMat(id, paintConcrete, 1.2, 0.92); break;
    case 'metal_siding': m = texMat(id, paintMetalSiding, 2.5, 0.5, 0.5); break;
    case 'log_wall': m = texMat(id, paintLogWall, 4, 0.85, 0, 1.4); break;
    case 'log_end': m = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.85 }); break;
    case 'board_batten': m = texMat(id, paintBoardBatten, 2, 0.85); break;
    case 'wire_mesh': {
      const mm = texMat(id, paintMesh, 0.5, 0.5, 0.6);
      mm.transparent = true; mm.alphaTest = 0.3; mm.side = THREE.DoubleSide; mm.normalMap = null;
      m = mm; break;
    }
    case 'straw': m = texMat(id, paintStraw, 1, 0.95); break;
    case 'soil': m = texMat(id, paintSoil, 2, 0.98); break;
    case 'earth': m = texMat(id, paintEarth, 1.5, 0.97); break;
    case 'pegboard': m = texMat(id, paintPegboard, 1, 0.8); break;
    case 'crop': m = new THREE.MeshStandardMaterial({ color: 0x4f8a34, roughness: 0.85 }); break;
    case 'steel': m = new THREE.MeshStandardMaterial({ color: 0x7c8186, roughness: 0.4, metalness: 0.75 }); break;
    case 'paint_red': m = new THREE.MeshStandardMaterial({ color: 0x9c2f26, roughness: 0.6 }); break;
    case 'paint_green': m = new THREE.MeshStandardMaterial({ color: 0x3f5f3a, roughness: 0.6 }); break;
  }
  m.name = `kit_${id}`;
  _cache.set(id, m);
  return m;
}

/** Interior lights behind the glass (0 = off … 1 = a warm lit room at night). */
export function setWindowGlow(k: number): void {
  const g = _cache.get('glass');
  if (g) g.emissiveIntensity = 1.1 * k;
  const l = _cache.get('lamp');
  if (l) l.emissiveIntensity = 0.4 + 2.6 * k;
}
