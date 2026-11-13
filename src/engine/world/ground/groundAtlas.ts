/**
 * groundAtlas — the two procedural canvas atlases of the ground cover (no
 * external art). Colors are not painted in: the card atlas stores
 * R = luminance of the plant, G = blossom / fruit mask (the shader paints it
 * with the instance's flower color), alpha = coverage; the vertex shader tints
 * the plant per region and season. Likewise the litter atlas stores R = luminance.
 */
import * as THREE from 'three';

const TILE = 128;
const GRID = 4;
export const ATLAS_GRID = GRID;

type Ctx = CanvasRenderingContext2D;

function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const col = (lum: number, mask = 0, a = 1): string => `rgba(${Math.round(lum)},${Math.round(mask)},0,${a})`;

/** One tapered, curved blade from (x, y) leaning by `lean` px at the tip, `h` tall, `w` wide at the base. */
function blade(c: Ctx, x: number, y: number, h: number, w: number, lean: number, bend: number, l0: number, l1: number, mask = 0): void {
  const tx = x + lean, ty = y - h, mx = x + lean * 0.35 + bend, my = y - h * 0.55;
  const g = c.createLinearGradient(x, y, tx, ty);
  g.addColorStop(0, col(l0, mask)); g.addColorStop(1, col(l1, mask));
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(x - w / 2, y);
  c.quadraticCurveTo(mx - w * 0.38, my, tx, ty);
  c.quadraticCurveTo(mx + w * 0.38, my, x + w / 2, y);
  c.closePath();
  c.fill();
}

function stem(c: Ctx, x: number, y: number, tx: number, ty: number, w: number, l: number, mask = 0): void {
  c.strokeStyle = col(l, mask); c.lineWidth = w; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo((x + tx) / 2 + (tx - x) * 0.1, (y + ty) / 2, tx, ty); c.stroke();
}

function dot(c: Ctx, x: number, y: number, rx: number, ry: number, l: number, mask: number, rot = 0): void {
  c.fillStyle = col(l, mask);
  c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, 6.2832); c.fill();
}

const B = TILE - 3;   // the baseline (a little above the tile edge)

const CARD_PAINT: Array<(c: Ctx, r: () => number) => void> = [
  // 0 TUFT: a fan of curved blades
  (c, r) => {
    for (let i = 0; i < 22; i++) {
      const a = (i / 21 - 0.5) * 2, x = 64 + a * 26 + (r() - 0.5) * 10;
      blade(c, x, B, 52 + r() * 62 - Math.abs(a) * 18, 4.2 + r() * 2.4, a * (22 + r() * 22) + (r() - 0.5) * 8, (r() - 0.5) * 12, 70 + r() * 30, 175 + r() * 70);
    }
  },
  // 1 TALL: long stems with seed heads
  (c, r) => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 11 - 0.5) * 2, x = 64 + a * 22 + (r() - 0.5) * 8, h = 78 + r() * 44, lean = a * (16 + r() * 18);
      blade(c, x, B, h, 3 + r() * 1.6, lean, (r() - 0.5) * 14, 80, 200 + r() * 50);
      if (r() < 0.75) {   // seed head
        const hx = x + lean, hy = B - h;
        for (let k = 0; k < 4; k++) dot(c, hx + (r() - 0.5) * 3, hy + k * 4.2, 2.6, 4.4, 150 + r() * 70, 0, lean * 0.02);
      }
    }
    for (let i = 0; i < 8; i++) { const a = (r() - 0.5) * 2; blade(c, 64 + a * 26, B, 40 + r() * 30, 4, a * 24, 0, 70, 170); }
  },
  // 2 STRAW: dry stalks with fine heads
  (c, r) => {
    for (let i = 0; i < 14; i++) {
      const a = (i / 13 - 0.5) * 2, x = 64 + a * 24 + (r() - 0.5) * 10, h = 60 + r() * 56, lean = a * (20 + r() * 20);
      stem(c, x, B, x + lean, B - h, 2 + r() * 1.4, 130 + r() * 90);
      if (r() < 0.55) dot(c, x + lean, B - h - 3, 2.2, 6, 190 + r() * 50, 0, lean * 0.02);
    }
  },
  // 3 FERN: arching fronds with pinnae
  (c, r) => {
    for (let f = 0; f < 5; f++) {
      const a = (f / 4 - 0.5) * 2, ex = 64 + a * 54, ey = B - 52 - r() * 36 + Math.abs(a) * 10;
      const cx = 64 + a * 14, cy = ey - 28;
      c.strokeStyle = col(110); c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(64, B); c.quadraticCurveTo(cx, cy, ex, ey); c.stroke();
      const N = 11;
      for (let i = 1; i < N; i++) {
        const t = i / N, u = 1 - t;
        const px = u * u * 64 + 2 * u * t * cx + t * t * ex, py = u * u * B + 2 * u * t * cy + t * t * ey;
        const tx = 2 * u * (cx - 64) + 2 * t * (ex - cx), ty = 2 * u * (cy - B) + 2 * t * (ey - cy);
        const l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l, len = (1 - t * 0.85) * 22 + 4;
        // pinnae as two short leaves either side (drawn as rotated blades)
        for (const sg of [-1, 1]) {
          c.save(); c.translate(px, py); c.rotate(Math.atan2(ny * sg, nx * sg) + Math.PI / 2 - 0.3 * sg);
          blade(c, 0, 0, len, 3.6, 0, 0, 130, 205 + r() * 40); c.restore();
        }
      }
    }
  },
  // 4 DAISY: stems topped with open blossoms (G = mask: 255 petals, 150 centre)
  (c, r) => {
    for (let i = 0; i < 4; i++) { const a = (r() - 0.5) * 2; blade(c, 64 + a * 26, B, 30 + r() * 24, 4, a * 20, 0, 80, 170); }
    for (let i = 0; i < 6; i++) {
      const a = (i / 5 - 0.5) * 2, x = 64 + a * 24 + (r() - 0.5) * 8, h = 52 + r() * 50, lean = a * 16;
      stem(c, x, B, x + lean, B - h, 2.2, 110);
      blade(c, x + (r() - 0.5) * 6, B - h * 0.4, 16, 4.5, (r() - 0.5) * 18, 0, 100, 170);
      const hx = x + lean, hy = B - h, R = 8 + r() * 3.5;
      for (let p = 0; p < 9; p++) { const an = p / 9 * 6.2832; dot(c, hx + Math.cos(an) * R * 0.68, hy + Math.sin(an) * R * 0.68, R * 0.52, R * 0.2, 245, 255, an); }
      dot(c, hx, hy, R * 0.34, R * 0.34, 200, 150);
    }
  },
  // 5 SPIKE: upright spikes of small blossoms along the upper half (lupine, fireweed, paintbrush)
  (c, r) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 4 - 0.5) * 2, x = 64 + a * 22 + (r() - 0.5) * 8, h = 68 + r() * 40, lean = a * 10;
      stem(c, x, B, x + lean, B - h, 2.4, 105);
      blade(c, x - 4, B, 28 + r() * 10, 5, -14 + (r() - 0.5) * 10, 0, 90, 165);
      blade(c, x + 4, B, 28 + r() * 10, 5, 14 + (r() - 0.5) * 10, 0, 90, 165);
      for (let k = 0; k < 15; k++) {
        const t = 0.45 + 0.55 * (k / 14), y = B - h * t, w = (1 - k / 18) * 7 + 3;
        dot(c, x + lean * t + (r() - 0.5) * 3, y, w * 0.6, 3.6, 215 + r() * 40, 255);
      }
    }
  },
  // 6 SCRUB: a rounded woody bush of small leaf clusters (sage)
  (c, r) => {
    for (let i = 0; i < 14; i++) {
      const a = (i / 13 - 0.5) * 2;
      stem(c, 64 + a * 4, B, 64 + a * 42, B - 38 - (1 - Math.abs(a)) * 40 - r() * 14, 2.4, 70);
    }
    for (let i = 0; i < 130; i++) {
      const a = r() * 6.2832, d = Math.sqrt(r());
      const x = 64 + Math.cos(a) * 46 * d, y = B - 50 - Math.abs(Math.sin(a)) * 38 * d * (a > 3.14 ? 0.6 : 1) * 0.9 - 4;
      if (y > B - 12) continue;
      dot(c, x, y, 3 + r() * 3.4, 2 + r() * 2.2, 135 + r() * 90, 0, r() * 3);
    }
    for (let i = 0; i < 40; i++) { const x = 64 + (r() - 0.5) * 50; dot(c, x, B - 14 - r() * 18, 3, 2.2, 120 + r() * 60, 0, r() * 3); }
  },
  // 7 CACTUS: prickly pear pads (G = fruit), spines as light dots
  (c, r) => {
    const pads: Array<[number, number, number, number]> = [[64, B - 24, 22, 17], [44, B - 54, 17, 21], [86, B - 56, 16, 22], [66, B - 82, 15, 20], [100, B - 38, 13, 17]];
    for (const [x, y, rx, ry] of pads) {
      dot(c, x, y, rx, ry, 120 + r() * 30, 0, (r() - 0.5) * 0.5);
      dot(c, x, y, rx * 0.8, ry * 0.8, 150 + r() * 40, 0, (r() - 0.5) * 0.5);
      for (let k = 0; k < 14; k++) dot(c, x + (r() - 0.5) * rx * 1.5, y + (r() - 0.5) * ry * 1.5, 1.1, 1.1, 235, 0);
    }
    for (const [x, y] of [[52, B - 72], [92, B - 78], [72, B - 100]] as const) dot(c, x, y, 5, 6.5, 180, 255);
  },
  // 8 YUCCA: a rosette of stiff spiky blades
  (c, r) => {
    for (let i = 0; i < 26; i++) {
      const a = (i / 25 - 0.5) * 2.1, h = 70 + r() * 40 - Math.abs(a) * 26;
      blade(c, 64 + a * 4, B, h, 4.6, a * 52 + (r() - 0.5) * 10, 0, 80 + r() * 20, 190 + r() * 50);
    }
  },
  // 9 CLOVER: low broad leaves
  (c, r) => {
    for (let i = 0; i < 20; i++) {
      const x = 64 + (r() - 0.5) * 100, y = B - 6 - r() * 48 * (1 - Math.abs(x - 64) / 70);
      stem(c, 64 + (x - 64) * 0.2, B, x, y, 1.6, 100);
      for (let k = 0; k < 3; k++) dot(c, x + Math.cos(k * 2.09 + r()) * 5, y + Math.sin(k * 2.09) * 5 - 3, 5.4, 4.6, 150 + r() * 80, 0, k);
    }
  },
  // 10 BRAMBLE: arching canes with toothed broad leaves
  (c, r) => {
    for (let f = 0; f < 4; f++) {
      const a = (f / 3 - 0.5) * 2, ex = 64 + a * 56, ey = B - 70 - r() * 30 + Math.abs(a) * 24;
      stem(c, 64, B, ex, ey, 2.6, 75);
      for (let i = 1; i < 9; i++) {
        const t = i / 9, x = 64 + (ex - 64) * t, y = B + (ey - B) * (t * (2 - t) * 0.98) + 6;
        for (const sg of [-1, 1]) dot(c, x + sg * 7, y - 4 + sg * 2, 9, 5.6, 140 + r() * 80, 0, sg * 0.7 + (r() - 0.5));
      }
    }
  },
  // 11 LOW: a mound of rounded leaves (bearberry, blueberry, moss cushion)
  (c, r) => {
    for (let i = 0; i < 110; i++) {
      const a = r() * 3.1416, d = Math.sqrt(r());
      const x = 64 + Math.cos(a) * 52 * d, y = B - 4 - Math.sin(a) * 38 * d;
      dot(c, x, y, 3.4 + r() * 3, 2.6 + r() * 2.4, 120 + r() * 120, 0, r() * 3);
    }
  },
];

const LITTER_PAINT: Array<(c: Ctx, r: () => number) => void> = [
  // 0 OAK leaves
  (c, r) => {
    for (let i = 0; i < 9; i++) {
      const x = 22 + r() * 84, y = 22 + r() * 84, a = r() * 6.2832, s = 12 + r() * 6;
      c.save(); c.translate(x, y); c.rotate(a);
      c.fillStyle = col(150 + r() * 90); c.beginPath(); c.moveTo(-s, 0);
      for (let k = 0; k < 4; k++) { const t = -s + (k + 0.5) * s * 0.5; c.quadraticCurveTo(t, -s * 0.62, t + s * 0.25, -s * 0.28); }
      c.lineTo(s, 0);
      for (let k = 3; k >= 0; k--) { const t = -s + (k + 0.5) * s * 0.5; c.quadraticCurveTo(t + s * 0.25, s * 0.28, t, s * 0.62); }
      c.closePath(); c.fill();
      c.strokeStyle = col(90); c.lineWidth = 1; c.beginPath(); c.moveTo(-s, 0); c.lineTo(s, 0); c.stroke();
      c.restore();
    }
  },
  // 1 MAPLE leaves (five points)
  (c, r) => {
    for (let i = 0; i < 8; i++) {
      const x = 24 + r() * 80, y = 24 + r() * 80, a = r() * 6.2832, s = 13 + r() * 5;
      c.save(); c.translate(x, y); c.rotate(a);
      c.fillStyle = col(160 + r() * 80); c.beginPath();
      for (let k = 0; k < 10; k++) { const an = k / 10 * 6.2832, rr = k % 2 === 0 ? s : s * 0.45; c.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
      c.closePath(); c.fill(); c.restore();
    }
  },
  // 2 NEEDLES: brushed clusters of fine lines
  (c, r) => {
    for (let k = 0; k < 7; k++) {
      const x = 20 + r() * 88, y = 20 + r() * 88, a = r() * 6.2832;
      for (let i = 0; i < 16; i++) {
        const aa = a + (r() - 0.5) * 0.7, l = 9 + r() * 6, ox = (r() - 0.5) * 8, oy = (r() - 0.5) * 8;
        c.strokeStyle = col(130 + r() * 110); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + ox, y + oy); c.lineTo(x + ox + Math.cos(aa) * l, y + oy + Math.sin(aa) * l); c.stroke();
      }
    }
  },
  // 3 TWIGS: forked sticks
  (c, r) => {
    for (let k = 0; k < 4; k++) {
      const x = 16 + r() * 96, y = 16 + r() * 96, a = r() * 6.2832, l = 30 + r() * 28;
      c.strokeStyle = col(110 + r() * 60); c.lineWidth = 3.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
      const f = 0.35 + r() * 0.4, fx = x + Math.cos(a) * l * f, fy = y + Math.sin(a) * l * f, fa = a + (r() - 0.5) * 1.4;
      c.lineWidth = 2.2; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + Math.cos(fa) * l * 0.4, fy + Math.sin(fa) * l * 0.4); c.stroke();
    }
  },
  // 4 GRAVEL: small stones with highlights
  (c, r) => {
    for (let i = 0; i < 26; i++) {
      const x = 12 + r() * 104, y = 12 + r() * 104, s = 3 + r() * 5, l = 120 + r() * 110;
      dot(c, x + 0.8, y + 1, s, s * 0.8, 60, 0, r() * 3);
      dot(c, x, y, s, s * 0.8, l, 0, r() * 3);
      dot(c, x - s * 0.25, y - s * 0.3, s * 0.4, s * 0.3, Math.min(255, l + 40), 0, 0);
    }
  },
  // 5 SCUFF: a worn bare-soil patch with a ragged, noisy edge
  (c, r) => {
    for (let i = 0; i < 60; i++) {
      const a = r() * 6.2832, d = Math.sqrt(r()) * 46, rr = 6 + r() * 14 * (1 - d / 60);
      dot(c, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d * 0.8, rr, rr * 0.8, 150 + r() * 80, 0, r() * 3);
    }
    for (let i = 0; i < 18; i++) { const x = 64 + (r() - 0.5) * 70, y = 64 + (r() - 0.5) * 56; dot(c, x, y, 2.4, 2, 70, 0); }
  },
  // 6 CONES / acorns
  (c, r) => {
    for (let i = 0; i < 6; i++) {
      const x = 22 + r() * 84, y = 22 + r() * 84, a = r() * 6.2832, l = 11 + r() * 6;
      c.save(); c.translate(x, y); c.rotate(a);
      for (let k = 0; k < 6; k++) dot(c, -l + k * l * 0.4, 0, l * 0.28, l * (0.34 - Math.abs(k - 2.5) * 0.045), 110 + (k % 2) * 60, 0);
      c.restore();
    }
  },
  // 7 THATCH: matted dry grass
  (c, r) => {
    for (let i = 0; i < 46; i++) {
      const x = 8 + r() * 112, y = 8 + r() * 112, a = r() * 6.2832, l = 14 + r() * 22;
      c.strokeStyle = col(110 + r() * 130); c.lineWidth = 1.5 + r(); c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 8, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
  },
];

function atlas(paint: Array<(c: Ctx, r: () => number) => void>, seed: number): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = TILE * GRID;
  const c = cv.getContext('2d')!;
  c.clearRect(0, 0, cv.width, cv.height);
  paint.forEach((fn, i) => {
    c.save();
    c.translate((i % GRID) * TILE, Math.floor(i / GRID) * TILE);
    c.beginPath(); c.rect(1, 1, TILE - 2, TILE - 2); c.clip();
    fn(c, rng(seed + i * 101));
    c.restore();
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.premultiplyAlpha = false;
  t.needsUpdate = true;
  return t;
}

let _cards: THREE.CanvasTexture | null = null;
let _litter: THREE.CanvasTexture | null = null;
export function cardAtlas(): THREE.CanvasTexture { return (_cards ??= atlas(CARD_PAINT, 7)); }
export function litterAtlas(): THREE.CanvasTexture { return (_litter ??= atlas(LITTER_PAINT, 31)); }
export function disposeGroundAtlases(): void { _cards?.dispose(); _litter?.dispose(); _cards = _litter = null; }
