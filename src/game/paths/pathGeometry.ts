/**
 * Geometry of the paths, all draped on the rendered ground (the same way the
 * road and the drive are): a worn track whose width and opacity follow its
 * wear along the way, a laid ribbon, duckboard planks, stepping stones and
 * the bare patch in front of a door. Attributes are the same on every
 * ribbon so each surface merges into one draw call: position, normal, uv
 * (u across 0-1, v along in world units) and an RGBA color (alpha is the
 * wear fade). Pure THREE geometry (tested without a scene).
 */
import * as THREE from 'three';
import type { Pt } from '../../sim/pathRoute';

type Ground = (x: number, z: number) => number;

/** Deterministic 0-1 from two numbers. */
export function h2(a: number, b: number, seed = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

export const smooth = (e0: number, e1: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function tangentAt(line: readonly Pt[], i: number): Pt {
  const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
  const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
  return [tx / l, tz / l];
}

export interface RibbonOpts {
  /** Half width at each point. */
  half: readonly number[];
  /** RGBA at each point. */
  color: ReadonlyArray<readonly [number, number, number, number]>;
  lift: number;
  across?: number;
  /** World units of v per texture repeat along (the texture repeats this far). */
  repeat?: number;
}

/** A ribbon along `line` draped on the ground, width and color per point. */
export function ribbon(line: readonly Pt[], ground: Ground, o: RibbonOpts): THREE.BufferGeometry | null {
  const n = line.length, across = o.across ?? 4, rep = o.repeat ?? 0.5;
  if (n < 2) return null;
  const pos = new Float32Array(n * (across + 1) * 3), uv = new Float32Array(n * (across + 1) * 2), col = new Float32Array(n * (across + 1) * 4);
  let v = 0;
  for (let i = 0; i < n; i++) {
    const [x, z] = line[i], [tx, tz] = tangentAt(line, i), nx = tz, nz = -tx;
    if (i > 0) v += Math.hypot(x - line[i - 1][0], z - line[i - 1][1]);
    for (let k = 0; k <= across; k++) {
      const u = k / across, off = (u - 0.5) * 2 * o.half[i], px = x + nx * off, pz = z + nz * off, q = i * (across + 1) + k;
      pos[q * 3] = px; pos[q * 3 + 1] = ground(px, pz) + o.lift; pos[q * 3 + 2] = pz;
      uv[q * 2] = u; uv[q * 2 + 1] = v / rep;
      const c = o.color[i];
      col[q * 4] = c[0]; col[q * 4 + 1] = c[1]; col[q * 4 + 2] = c[2]; col[q * 4 + 3] = c[3];
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < across; k++) {
    const a = i * (across + 1) + k, b = a + 1, c = a + across + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface WornColors { grass: THREE.Color; soil: THREE.Color }

/**
 * A worn track along a route: only where it is worn enough to show, its
 * width and opacity growing with the wear and its color going from the
 * trodden grass to bare soil. Returns one ribbon per stretch.
 */
export function wornRibbons(line: readonly Pt[], wear: readonly number[], ground: Ground, colors: WornColors, seed: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const show = (w: number) => w >= 0.1;
  let i = 0;
  while (i < line.length) {
    while (i < line.length && !show(wear[i])) i++;
    let j = i;
    while (j < line.length && show(wear[j])) j++;
    // a stretch of at least three points, one point of fade either side
    const a = Math.max(0, i - 1), b = Math.min(line.length, j + 1);
    if (j - i >= 3) {
      const seg = line.slice(a, b), w = wear.slice(a, b);
      const half = seg.map((p, k) => (0.035 + 0.07 * smooth(0.1, 0.9, w[k])) * (0.85 + 0.3 * h2(p[0] * 3, p[1] * 3, seed)));
      const color = seg.map((p, k) => {
        const t = smooth(0.25, 0.7, w[k]), c = colors.grass.clone().lerp(colors.soil, t), jit = 0.92 + 0.16 * h2(p[0] * 5, p[1] * 5, seed + 1);
        return [c.r * jit, c.g * jit, c.b * jit, Math.min(0.96, 0.18 + 0.85 * smooth(0.08, 0.55, w[k]))] as const;
      });
      const g = ribbon(seg, ground, { half, color, lift: 0.011 });
      if (g) out.push(g);
    }
    i = Math.max(j, i + 1);
  }
  return out;
}

/** A laid walk: constant width, full color (the texture shapes the edge). */
export function laidRibbon(line: readonly Pt[], ground: Ground, width: number, lift: number, tint: readonly [number, number, number] = [1, 1, 1]): THREE.BufferGeometry | null {
  const half = line.map(() => width / 2), color = line.map(() => [tint[0], tint[1], tint[2], 1] as const);
  return ribbon(line, ground, { half, color, lift, across: 2 });
}

/** Even spacing along a polyline: points and headings. */
export function along(line: readonly Pt[], step: number, from = 0): Array<{ x: number; z: number; tx: number; tz: number }> {
  const out: Array<{ x: number; z: number; tx: number; tz: number }> = [];
  let carry = from;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], [bx, bz] = line[i], l = Math.hypot(bx - ax, bz - az);
    if (l < 1e-6) continue;
    const tx = (bx - ax) / l, tz = (bz - az) / l;
    let d = carry;
    while (d <= l) { out.push({ x: ax + tx * d, z: az + tz * d, tx, tz }); d += step; }
    carry = d - l;
  }
  return out;
}

const box = (w: number, h: number, d: number): THREE.BoxGeometry => new THREE.BoxGeometry(w, h, d);

/** Colored copy (vertex colors for one merged mesh). */
function paint(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
}

/** Duckboards: planks across on two stringers (planks 10 cm, a 2 cm gap; 1 m wide). */
export function boardGeometry(line: readonly Pt[], ground: Ground, seed: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const W = 0.17, plank = 0.017, gap = 0.003, T = 0.01;
  const wood = new THREE.Color();
  const pts = along(line, plank + gap, 0.02);
  pts.forEach((p, i) => {
    const y = ground(p.x, p.z), ang = Math.atan2(p.tx, p.tz);
    wood.setHSL(0.085 + 0.02 * h2(i, seed), 0.32, 0.30 + 0.12 * h2(i, seed, 3));
    const g = box(W, T, plank).rotateY(ang).translate(p.x, y + 0.013 + (h2(i, seed, 9) - 0.5) * 0.001, p.z);
    out.push(paint(g, wood));
  });
  // two stringers under it, in short lengths that follow the ground
  const dark = new THREE.Color(0x3a2e22);
  const sp = along(line, 0.12, 0);
  for (let i = 1; i < sp.length; i++) {
    const a = sp[i - 1], b = sp[i], l = Math.hypot(b.x - a.x, b.z - a.z);
    if (l < 0.01) continue;
    for (const s of [-1, 1]) {
      const ox = a.tz * W * 0.3 * s, oz = -a.tx * W * 0.3 * s;
      const mx = (a.x + b.x) / 2 + ox, mz = (a.z + b.z) / 2 + oz;
      const g = box(0.012, 0.012, l * 1.05).rotateY(Math.atan2(b.x - a.x, b.z - a.z)).translate(mx, ground(mx, mz) + 0.006, mz);
      out.push(paint(g, dark));
    }
  }
  return out;
}

/** Stepping stones: flat irregular fieldstones a stride apart (60 cm), alternating a little each side. */
export function stoneGeometry(line: readonly Pt[], ground: Ground, seed: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const col = new THREE.Color();
  along(line, 0.095, 0.05).forEach((p, i) => {
    const side = (i % 2 ? 1 : -1) * (0.01 + 0.014 * h2(i, seed)), nx = p.tz, nz = -p.tx;
    const x = p.x + nx * side, z = p.z + nz * side, r = 0.033 + 0.017 * h2(i, seed, 2);
    col.setHSL(0.1 + 0.03 * h2(i, seed, 4), 0.06 + 0.06 * h2(i, seed, 5), 0.42 + 0.2 * h2(i, seed, 6));
    const g = new THREE.CylinderGeometry(r * 0.92, r, 0.016, 7).scale(1 + 0.3 * h2(i, seed, 7), 1, 1 - 0.2 * h2(i, seed, 8)).rotateY(h2(i, seed, 1) * 6.28).translate(x, ground(x, z) + 0.003, z);
    out.push(paint(g, col));
  });
  return out;
}

/**
 * A bare patch of earth (the dooryard, the well's apron): a disc draped on the
 * ground, alpha 1 in the middle fading out at the edge, ragged by noise.
 * UVs are planar world coordinates (the patch texture covers 2r).
 */
export function patchGeometry(cx: number, cz: number, r: number, ground: Ground, lift: number, color: readonly [number, number, number], seed: number, squash = 1, rot = 0): THREE.BufferGeometry {
  const rings = 4, segs = 18, pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const cs = Math.cos(rot), sn = Math.sin(rot);
  for (let ri = 0; ri <= rings; ri++) {
    const t = ri / rings;
    for (let s = 0; s < segs; s++) {
      const a = s / segs * Math.PI * 2, rag = 0.82 + 0.3 * h2(Math.cos(a) * 3 + seed, Math.sin(a) * 3, seed);
      const lx = Math.cos(a) * r * t * rag, lz = Math.sin(a) * r * t * rag * squash;
      const x = cx + lx * cs - lz * sn, z = cz + lx * sn + lz * cs;
      pos.push(x, ground(x, z) + lift, z);
      uv.push(0.5 + Math.cos(a) * t * 0.5, 0.5 + Math.sin(a) * t * 0.5);
      col.push(color[0], color[1], color[2], ri === 0 ? 1 : (1 - smooth(0.35, 1, t)) * 0.95);
    }
  }
  for (let ri = 0; ri < rings; ri++) for (let s = 0; s < segs; s++) {
    const a = ri * segs + s, b = ri * segs + (s + 1) % segs, c = (ri + 1) * segs + s, d = (ri + 1) * segs + (s + 1) % segs;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface SkirtRect { x0: number; z0: number; x1: number; z1: number }

/**
 * The bare earth round a building's foot: where the eaves drip and the boots
 * come and go the grass gives up. A ring round the rectangle, `margin` wide,
 * solid at the wall and fading to nothing at the outer edge, draped on the
 * ground; ragged by noise so it is no neat frame. UVs are planar world
 * coordinates (a repeating speckle).
 */
export function skirtGeometry(r: SkirtRect, margin: number, ground: Ground, color: readonly [number, number, number], alpha: number, seed: number, step = 0.22): THREE.BufferGeometry {
  const pairs: Array<{ i: Pt; o: Pt }> = [];
  const sides: Array<{ a: Pt; b: Pt; n: Pt }> = [
    { a: [r.x0, r.z0], b: [r.x1, r.z0], n: [0, -1] }, { a: [r.x1, r.z0], b: [r.x1, r.z1], n: [1, 0] },
    { a: [r.x1, r.z1], b: [r.x0, r.z1], n: [0, 1] }, { a: [r.x0, r.z1], b: [r.x0, r.z0], n: [-1, 0] },
  ];
  sides.forEach((s, si) => {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), n = Math.max(2, Math.round(len / step));
    const prev = sides[(si + 3) % 4].n;
    for (let k = 0; k < n; k++) {
      const t = k / n, ix = s.a[0] + (s.b[0] - s.a[0]) * t, iz = s.a[1] + (s.b[1] - s.a[1]) * t;
      // the corner vertex leaves on the diagonal (the outer corner of the rectangle), the rest straight out; the width wanders a little
      const w = margin * (0.78 + 0.4 * h2(ix * 4, iz * 4, seed));
      const [ox, oz] = k === 0 ? [(prev[0] + s.n[0]) * w, (prev[1] + s.n[1]) * w] : [s.n[0] * w, s.n[1] * w];
      pairs.push({ i: [ix, iz], o: [ix + ox, iz + oz] });
    }
  });
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  for (const p of pairs) {
    for (const [pt, a] of [[p.i, alpha], [p.o, 0]] as const) {
      pos.push(pt[0], ground(pt[0], pt[1]) + 0.009, pt[1]);
      uv.push(pt[0] * 0.9, pt[1] * 0.9);
      const j = 0.9 + 0.2 * h2(pt[0] * 7, pt[1] * 7, seed + 2);
      col.push(color[0] * j, color[1] * j, color[2] * j, a * (0.8 + 0.2 * h2(pt[0] * 5, pt[1] * 5, seed + 4)));
    }
  }
  const n = pairs.length;
  for (let k = 0; k < n; k++) { const a = k * 2, b = ((k + 1) % n) * 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
