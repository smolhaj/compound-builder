/**
 * Interior kit — shared by every building (docs/REFERENCE_LAYOUT.md: all
 * buildings are furnished like real ones). Three parts:
 *
 *  • wallRun      a wall between two points with real openings (doors,
 *                 windows) cut through it, optionally cut down to a height
 *                 for the cutaway view; returns its solid segments as
 *                 colliders so people (and the walk camera) use the doors.
 *  • furniture    a library of pieces (beds, bunks, tables, chairs, wood
 *                 stove, kitchen counter, shelves, armchairs, rugs, lamps,
 *                 barrels, ladders …) built in their own frame (front +z,
 *                 floor y = 0) and placed with a position and turn.
 *  • colliders    each solid piece's footprint, so the walk camera and the
 *                 family move round furniture.
 *
 * Scale (UE SCALE v2): 1 unit ≈ 6 m, so 1 m = 1/6 unit (M). Furniture sizes
 * are written in meters × M so they read as real furniture.
 */
import * as THREE from 'three';
import type { KitMaterialId } from './materials';

/** One meter in world units. */
export const M = 1 / 6;

/** Where geometry goes: a building layer × material. */
export type Sink = (layer: string, mat: KitMaterialId, g: THREE.BufferGeometry) => void;

/** Axis-aligned footprint in the building's local frame. */
export interface Collider { x0: number; z0: number; x1: number; z1: number }

/** A placement in the building's local frame: position, turn (radians, 0 = front faces +z), floor height. */
export interface Place { x: number; z: number; rot?: number; y?: number }

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cyl = (r: number, h: number, x: number, y: number, z: number, seg = 10) =>
  new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);

/**
 * Build a piece in its own frame with `fn(add)`, move it to `p`, send it to
 * the sink, and return its footprint (null if `solid` is false).
 */
export function piece(sink: Sink, layer: string, p: Place, fn: (add: (m: KitMaterialId, g: THREE.BufferGeometry) => void) => void, solid = true): Collider | null {
  const rot = p.rot ?? 0, y = p.y ?? 0;
  const bb = new THREE.Box3(), tmp = new THREE.Box3();
  let any = false;
  fn((m, g) => {
    g.rotateY(rot);
    g.translate(p.x, y, p.z);
    g.computeBoundingBox();
    tmp.copy(g.boundingBox!);
    if (any) bb.union(tmp); else { bb.copy(tmp); any = true; }
    sink(layer, m, g);
  });
  return solid && any ? { x0: bb.min.x, z0: bb.min.z, x1: bb.max.x, z1: bb.max.z } : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Walls with openings
// ─────────────────────────────────────────────────────────────────────────

/** An opening along a wall: center `at` (distance from the start), width, sill and height above the wall base. */
export interface Opening { at: number; w: number; sill: number; h: number }

export interface WallSpec {
  ax: number; az: number; bx: number; bz: number;
  /** Base height and full height. */
  y0: number; h: number;
  /** Thickness, and offset of the wall's center line to its left (+) of a→b. */
  t: number; offset?: number;
  openings?: readonly Opening[];
  /** Cut the wall off at this height above its base (cutaway view); a dark cap marks the cut. */
  cut?: number;
}

/**
 * A straight wall a→b with openings through it, as boxes (merged later by
 * material). Returns the solid footprint segments (between doorways) as
 * colliders in the same frame.
 */
export function wallRun(sink: Sink, layer: string, mat: KitMaterialId, w: WallSpec): Collider[] {
  const len = Math.hypot(w.bx - w.ax, w.bz - w.az);
  if (len < 1e-4) return [];
  const ux = (w.bx - w.ax) / len, uz = (w.bz - w.az) / len;
  const off = w.offset ?? 0;
  const top = w.cut !== undefined ? Math.min(w.h, w.cut) : w.h;
  const ops = (w.openings ?? []).map(o => ({ u0: Math.max(0, o.at - o.w / 2), u1: Math.min(len, o.at + o.w / 2), y0: o.sill, y1: o.sill + o.h }));
  // split points along the wall
  const cuts = [0, len, ...ops.flatMap(o => [o.u0, o.u1])].sort((a, b) => a - b);
  const xs = cuts.filter((v, i) => i === 0 || v - cuts[i - 1] > 1e-5);
  const angle = Math.atan2(-uz, ux);
  const at = (u: number) => [w.ax + ux * u - uz * off, w.az + uz * u + ux * off] as const;
  const out: Collider[] = [];
  const emit = (u0: number, u1: number, ya: number, yb: number, m: KitMaterialId) => {
    const L = u1 - u0, [cx, cz] = at((u0 + u1) / 2);
    const g = new THREE.BoxGeometry(L, yb - ya, w.t).rotateY(angle).translate(cx, w.y0 + (ya + yb) / 2, cz);
    sink(layer, m, g);
  };
  for (let i = 0; i < xs.length - 1; i++) {
    const u0 = xs[i], u1 = xs[i + 1], mid = (u0 + u1) / 2;
    // vertical solid ranges in this strip: [0, top] minus the openings covering it
    const holes = ops.filter(o => mid > o.u0 && mid < o.u1).map(o => [o.y0, o.y1] as const).sort((a, b) => a[0] - b[0]);
    let y = 0;
    let door = false;
    for (const [h0, h1] of holes) {
      if (h0 <= 1e-4) door = true;
      if (h0 > y) emit(u0, u1, y, Math.min(h0, top), mat);
      y = Math.max(y, h1);
      if (y >= top) break;
    }
    if (y < top) emit(u0, u1, y, top, mat);
    if (w.cut !== undefined && (y < top || holes.every(([h0]) => h0 >= top))) {
      const [cx, cz] = at(mid);
      sink(layer, 'cutcap', new THREE.BoxGeometry(u1 - u0, 0.004, w.t + 0.002).rotateY(angle).translate(cx, w.y0 + top + 0.002, cz));
    }
    if (!door) {
      const [x0, z0] = at(u0), [x1, z1] = at(u1);
      const nx = -uz * w.t / 2, nz = ux * w.t / 2;
      out.push({ x0: Math.min(x0, x1) - Math.abs(nx), z0: Math.min(z0, z1) - Math.abs(nz), x1: Math.max(x0, x1) + Math.abs(nx), z1: Math.max(z0, z1) + Math.abs(nz) });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Furniture library (front faces +z, floor at y = 0, sizes in meters × M)
// ─────────────────────────────────────────────────────────────────────────

export type Add = (m: KitMaterialId, g: THREE.BufferGeometry) => void;

/** Four legs under a top w × d at height h. */
function legs(add: Add, w: number, d: number, h: number, r = 0.03 * M, mat: KitMaterialId = 'wood_dark'): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(mat, box(r * 2, h, r * 2, sx * (w / 2 - r * 1.5), 0, sz * (d / 2 - r * 1.5)));
}

export const Furniture = {
  /** Double (1.5 × 2 m) or single (0.95 × 2 m) bed, head at -z, with quilt and pillows. */
  bed(add: Add, wide = true, quilt: KitMaterialId = 'quilt_red'): void {
    const w = (wide ? 1.5 : 0.95) * M, l = 2.0 * M;
    add('wood_dark', box(w, 0.28 * M, l, 0, 0.05 * M, 0));                 // frame / box spring
    legs(add, w, l, 0.06 * M);
    add('linen', box(w - 0.04 * M, 0.2 * M, l - 0.06 * M, 0, 0.33 * M, 0.01 * M));   // mattress
    add(quilt, box(w + 0.03 * M, 0.04 * M, l * 0.7, 0, 0.52 * M, l * 0.14));         // quilt over the foot
    add(quilt, box(0.03 * M, 0.3 * M, l * 0.7, -w / 2 - 0.015 * M, 0.26 * M, l * 0.14));
    add(quilt, box(0.03 * M, 0.3 * M, l * 0.7, w / 2 + 0.015 * M, 0.26 * M, l * 0.14));
    const pw = wide ? 0.6 * M : 0.7 * M;
    for (const sx of wide ? [-1, 1] : [0]) add('linen', box(pw, 0.12 * M, 0.38 * M, sx * w * 0.24, 0.53 * M, -l / 2 + 0.28 * M));
    add('wood_dark', box(w + 0.06 * M, 1.05 * M, 0.06 * M, 0, 0, -l / 2 - 0.03 * M));   // headboard
    add('wood_mid', box(w + 0.06 * M, 0.08 * M, 0.08 * M, 0, 1.0 * M, -l / 2 - 0.03 * M));
  },

  /** A mattress on the floor (loft sleeping). */
  mattress(add: Add, quilt: KitMaterialId = 'quilt_blue'): void {
    const w = 0.9 * M, l = 1.95 * M;
    add('linen', box(w, 0.16 * M, l, 0, 0, 0));
    add(quilt, box(w + 0.02 * M, 0.04 * M, l * 0.68, 0, 0.15 * M, l * 0.15));
    add('linen', box(0.6 * M, 0.11 * M, 0.36 * M, 0, 0.16 * M, -l / 2 + 0.26 * M));
  },

  /** Table w × d (m), top at 0.76 m. */
  table(add: Add, wm = 1.2, dm = 0.85): void {
    const w = wm * M, d = dm * M, h = 0.76 * M;
    add('wood_mid', box(w, 0.045 * M, d, 0, h - 0.045 * M, 0));
    add('wood_dark', box(w - 0.12 * M, 0.08 * M, d - 0.12 * M, 0, h - 0.125 * M, 0));
    legs(add, w - 0.06 * M, d - 0.06 * M, h - 0.045 * M, 0.035 * M);
  },

  /** Ladder-back chair; sitter faces +z. */
  chair(add: Add): void {
    const w = 0.44 * M, d = 0.42 * M, seat = 0.45 * M;
    add('wood_mid', box(w, 0.04 * M, d, 0, seat - 0.04 * M, 0));
    legs(add, w, d, seat - 0.04 * M, 0.02 * M);
    for (const sx of [-1, 1]) add('wood_dark', box(0.04 * M, 0.5 * M, 0.04 * M, sx * (w / 2 - 0.03 * M), seat, -d / 2 + 0.02 * M));
    for (const yy of [0.18, 0.34, 0.48]) add('wood_dark', box(w - 0.06 * M, 0.05 * M, 0.025 * M, 0, seat + yy * M, -d / 2 + 0.02 * M));
  },

  /** Upholstered armchair with a quilt throw; sitter faces +z. */
  armchair(add: Add, quilt: KitMaterialId = 'quilt_red'): void {
    const w = 0.8 * M, d = 0.8 * M;
    add('wood_dark', box(w, 0.12 * M, d, 0, 0.08 * M, 0));
    legs(add, w, d, 0.08 * M, 0.025 * M);
    add('linen', box(w - 0.24 * M, 0.16 * M, d - 0.18 * M, 0, 0.2 * M, 0.06 * M));      // seat cushion
    add('linen', box(w - 0.12 * M, 0.55 * M, 0.16 * M, 0, 0.2 * M, -d / 2 + 0.08 * M));   // back
    for (const sx of [-1, 1]) add('wood_mid', box(0.12 * M, 0.42 * M, d, sx * (w / 2 - 0.06 * M), 0.2 * M, 0));
    add(quilt, box(w - 0.1 * M, 0.03 * M, 0.5 * M, 0, 0.76 * M, -d / 2 + 0.12 * M));
  },

  /** Plank bench (no back) len (m). */
  bench(add: Add, lm = 1.2): void {
    const l = lm * M;
    add('wood_mid', box(l, 0.05 * M, 0.35 * M, 0, 0.4 * M, 0));
    for (const sx of [-1, 1]) add('wood_dark', box(0.05 * M, 0.4 * M, 0.3 * M, sx * (l / 2 - 0.1 * M), 0, 0));
  },

  /**
   * Cast-iron wood stove on a stone hearth, with a stovepipe that rises
   * `pipeUp` then turns back into the wall `pipeBack` behind it (to the
   * chimney outside).
   */
  woodStove(add: Add, pipeUp = 1.6, pipeBack = 0.45): void {
    add('fieldstone', box(1.3 * M, 0.06 * M, 1.1 * M, 0, 0, 0.1 * M));                  // hearth
    const w = 0.62 * M, d = 0.55 * M, h = 0.62 * M, lift = 0.16 * M;
    legs(add, w, d, lift + 0.06 * M, 0.03 * M, 'iron');
    add('iron', box(w, h, d, 0, lift + 0.06 * M, 0));
    add('iron', box(w + 0.04 * M, 0.04 * M, d + 0.04 * M, 0, lift + 0.06 * M + h, 0));
    add('lamp', box(w * 0.5, h * 0.35, 0.01 * M, 0, lift + 0.2 * M, d / 2 + 0.002 * M));   // fire glowing behind the door glass
    add('iron', box(w * 0.62, h * 0.5, 0.02 * M, 0, lift + 0.15 * M, d / 2 + 0.01 * M));
    const pr = 0.075 * M, py = lift + 0.1 * M + h;
    add('iron', cyl(pr, pipeUp * M, 0, py, -0.05 * M));
    add('iron', new THREE.CylinderGeometry(pr, pr, pipeBack * M, 10).rotateX(Math.PI / 2).translate(0, py + pipeUp * M - pr, -0.05 * M - pipeBack * M / 2));
    // kettle on top
    add('enamel', cyl(0.1 * M, 0.14 * M, 0.12 * M, lift + 0.1 * M + h, 0.05 * M));
  },

  /** Wood box with split firewood. */
  woodbox(add: Add): void {
    add('wood_dark', box(0.6 * M, 0.45 * M, 0.45 * M, 0, 0, 0));
    for (let i = 0; i < 6; i++) {
      add('wood_mid', new THREE.CylinderGeometry(0.06 * M, 0.06 * M, 0.42 * M, 6).rotateZ(Math.PI / 2).translate(((i % 3) - 1) * 0.16 * M, 0.48 * M + Math.floor(i / 3) * 0.1 * M, (Math.floor(i / 3) - 0.5) * 0.1 * M));
    }
  },

  /** Kitchen counter len (m): cabinets, butcher-block top, enamel sink, a pot and crockery. */
  counter(add: Add, lm = 2.4, sinkAt = 0.25, faucet = false): void {
    const l = lm * M, d = 0.6 * M, h = 0.9 * M;
    add('wood_mid', box(l, h - 0.1 * M, d - 0.05 * M, 0, 0.1 * M, -0.025 * M));
    add('wood_dark', box(l, 0.1 * M, d - 0.1 * M, 0, 0, -0.05 * M));                    // toe kick
    add('wood_dark', box(l + 0.02 * M, 0.05 * M, d + 0.02 * M, 0, h - 0.05 * M, 0));     // top
    // cabinet doors
    const n = Math.max(2, Math.round(lm / 0.6));
    for (let i = 0; i < n; i++) add('wood_dark', box(l / n - 0.04 * M, h - 0.3 * M, 0.015 * M, -l / 2 + (i + 0.5) * l / n, 0.15 * M, d / 2 - 0.04 * M));
    const sx = (sinkAt - 0.5) * l;
    add('enamel', box(0.6 * M, 0.06 * M, 0.45 * M, sx, h - 0.03 * M, 0));
    if (faucet) {
      add('steel', box(0.03 * M, 0.3 * M, 0.03 * M, sx, h, -d / 2 + 0.06 * M));
      add('steel', box(0.03 * M, 0.03 * M, 0.18 * M, sx, h + 0.28 * M, -d / 2 + 0.14 * M));                  // gooseneck faucet
      for (const e of [-1, 1]) add('steel', cyl(0.02 * M, 0.05 * M, sx + e * 0.08 * M, h, -d / 2 + 0.06 * M, 6));
    } else {
      add('iron', box(0.03 * M, 0.3 * M, 0.03 * M, sx, h, -d / 2 + 0.06 * M));            // pitcher pump
      add('iron', box(0.04 * M, 0.04 * M, 0.2 * M, sx, h + 0.3 * M, -d / 2 + 0.12 * M).rotateX(0.25));
      add('iron', box(0.02 * M, 0.02 * M, 0.3 * M, sx, h + 0.32 * M, -d / 2 - 0.05 * M).rotateX(-0.6));    // handle
    }
    add('iron', cyl(0.11 * M, 0.14 * M, -sx * 0.6, h, 0.02 * M));                         // pot
    for (let i = 0; i < 3; i++) add('crockery', cyl(0.05 * M, 0.1 * M, l * 0.32 + i * 0.12 * M - l * 0.05, h, -0.12 * M, 8));
  },

  /** Open shelves on the wall (back at -z): `levels` boards from `y` up; jars, crocks or books on them. */
  wallShelf(add: Add, lm = 1.2, y = 1.35, levels = 2, fill: 'lids' | 'books' = 'lids'): void {
    const l = lm * M, d = 0.25 * M;
    for (let k = 0; k < levels; k++) {
      const yy = (y + k * 0.38) * M;
      add('wood_dark', box(l, 0.03 * M, d, 0, yy, 0));
      if (fill === 'books') add('books', box(l * 0.9, 0.26 * M, d * 0.8, 0, yy + 0.03 * M, 0));
      else for (let i = 0; i < Math.floor(lm / 0.16); i++) add(i % 3 ? 'crockery' : 'enamel', cyl(0.045 * M + (i % 2) * 0.01 * M, (0.14 + (i % 3) * 0.05) * M, -l / 2 + 0.1 * M + i * 0.16 * M, yy + 0.03 * M, 0, 8));
    }
    for (const sx of [-1, 1]) add('iron', box(0.02 * M, 0.12 * M, d * 0.8, sx * (l / 2 - 0.08 * M), y * M - 0.12 * M, 0));
  },

  /** Free-standing shelf unit (bookcase / pantry), back at -z. */
  shelfUnit(add: Add, lm = 1.0, hm = 1.9, fill: 'lids' | 'books' = 'books'): void {
    const l = lm * M, h = hm * M, d = 0.35 * M;
    for (const sx of [-1, 1]) add('wood_dark', box(0.03 * M, h, d, sx * (l / 2 - 0.015 * M), 0, 0));
    add('wood_dark', box(l, h, 0.02 * M, 0, 0, -d / 2 + 0.01 * M));
    const n = Math.max(3, Math.round(hm / 0.4));
    for (let k = 0; k <= n; k++) {
      const yy = 0.05 * M + k * (h - 0.08 * M) / n;
      add('wood_dark', box(l - 0.04 * M, 0.025 * M, d, 0, yy, 0));
      if (k === n) break;
      if (fill === 'books') add('books', box(l - 0.1 * M, (h / n) * 0.7, d * 0.8, 0, yy + 0.025 * M, 0.01 * M));
      else for (let i = 0; i < 5; i++) add(i % 2 ? 'crockery' : 'enamel', cyl(0.055 * M, (h / n) * 0.55, -l / 2 + 0.14 * M + i * (l - 0.28 * M) / 4, yy + 0.025 * M, 0, 8));
    }
  },

  /** Chest of drawers. */
  dresser(add: Add, lm = 1.0): void {
    const l = lm * M, h = 0.85 * M, d = 0.5 * M;
    add('wood_mid', box(l, h, d, 0, 0, 0));
    for (let k = 0; k < 3; k++) {
      add('wood_dark', box(l - 0.08 * M, 0.2 * M, 0.015 * M, 0, 0.08 * M + k * 0.25 * M, d / 2));
      add('iron', box(0.12 * M, 0.025 * M, 0.02 * M, 0, 0.17 * M + k * 0.25 * M, d / 2 + 0.01 * M));
    }
    add('wood_dark', box(l + 0.03 * M, 0.04 * M, d + 0.03 * M, 0, h, 0));
  },

  /** Nightstand with an oil lamp. */
  nightstand(add: Add): void {
    add('wood_mid', box(0.45 * M, 0.6 * M, 0.4 * M, 0, 0, 0));
    add('wood_dark', box(0.48 * M, 0.03 * M, 0.43 * M, 0, 0.6 * M, 0));
    Furniture.oilLamp(add, 0, 0.63, 0);
  },

  /** Hurricane oil lamp (glows at night). Position in meters in the piece frame. */
  oilLamp(add: Add, xm = 0, ym = 0, zm = 0): void {
    add('iron', cyl(0.07 * M, 0.06 * M, xm * M, ym * M, zm * M, 8));
    add('lamp', new THREE.SphereGeometry(0.075 * M, 10, 8).scale(1, 1.4, 1).translate(xm * M, (ym + 0.15) * M, zm * M));
    add('iron', cyl(0.03 * M, 0.06 * M, xm * M, (ym + 0.25) * M, zm * M, 6));
  },

  /** Braided rag rug w × d (m), flat on the floor. */
  rug(add: Add, wm = 2.0, dm = 1.4): void {
    add('rug', box(wm * M, 0.008 * M, dm * M, 0, 0, 0));
  },

  /** Water barrel with a dipper. */
  barrel(add: Add): void {
    add('wood_mid', new THREE.CylinderGeometry(0.27 * M, 0.24 * M, 0.85 * M, 12).translate(0, 0.425 * M, 0));
    for (const yy of [0.12, 0.72]) add('iron', new THREE.CylinderGeometry(0.275 * M, 0.275 * M, 0.04 * M, 12).translate(0, yy * M, 0));
    add('wood_dark', new THREE.CylinderGeometry(0.28 * M, 0.28 * M, 0.03 * M, 12).translate(0, 0.86 * M, 0));
  },

  /** Ladder from the floor up `hm` (m) to a loft edge at -z (leans back 12°). */
  ladder(add: Add, hm = 2.7): void {
    const lean = 0.21, h = hm * M, len = h / Math.cos(lean);
    const g = (geo: THREE.BufferGeometry) => geo.rotateX(-lean);
    for (const sx of [-1, 1]) add('wood_mid', g(box(0.05 * M, len, 0.05 * M, sx * 0.22 * M, 0, 0)));
    for (let k = 1; k * 0.3 < hm; k++) add('wood_dark', g(box(0.44 * M, 0.035 * M, 0.04 * M, 0, k * 0.3 * M, 0)));
  },

  /** Pegs on a wall with coats and hats hanging (back at -z). */
  coatPegs(add: Add, lm = 1.0): void {
    const l = lm * M;
    add('wood_dark', box(l, 0.1 * M, 0.03 * M, 0, 1.7 * M, 0));
    const coats: KitMaterialId[] = ['quilt_red', 'wood_dark', 'quilt_blue', 'linen'];
    for (let i = 0; i < 4; i++) add(coats[i], box(0.22 * M, 0.75 * M, 0.12 * M, -l / 2 + (i + 0.5) * l / 4, 0.98 * M, 0.08 * M));
  },

  /** Steamer trunk. */
  trunk(add: Add): void {
    add('wood_dark', box(0.9 * M, 0.5 * M, 0.5 * M, 0, 0, 0));
    for (const sx of [-1, 1]) add('iron', box(0.04 * M, 0.52 * M, 0.52 * M, sx * 0.3 * M, 0, 0));
  },

  /** Loft rail: posts and a rail along x, `lm` long, at the floor edge. */
  rail(add: Add, lm: number): void {
    const l = lm * M;
    add('wood_mid', box(l, 0.05 * M, 0.05 * M, 0, 0.9 * M, 0));
    for (let x = -l / 2; x <= l / 2 + 1e-6; x += Math.max(0.15 * M, l / Math.max(1, Math.round(lm / 0.9)))) add('wood_dark', box(0.05 * M, 0.9 * M, 0.05 * M, x, 0, 0));
  },

  // ── Workshop ──────────────────────────────────────────────────────────
  /** Heavy workbench len (m) with a vise, a lower shelf and clutter. */
  workbench(add: Add, lm = 2.4): void {
    const l = lm * M, d = 0.75 * M, h = 0.92 * M;
    add('wood_mid', box(l, 0.07 * M, d, 0, h - 0.07 * M, 0));
    add('wood_dark', box(l - 0.1 * M, 0.04 * M, d - 0.1 * M, 0, 0.18 * M, 0));
    legs(add, l, d, h - 0.07 * M, 0.05 * M);
    add('steel', box(0.22 * M, 0.14 * M, 0.2 * M, l / 2 - 0.2 * M, h, d / 2 - 0.08 * M));          // vise
    add('steel', box(0.04 * M, 0.04 * M, 0.3 * M, l / 2 - 0.2 * M, h + 0.05 * M, d / 2 + 0.08 * M));
    add('paint_red', box(0.5 * M, 0.22 * M, 0.25 * M, -l / 2 + 0.4 * M, h, -0.15 * M));               // toolbox
    add('iron', box(0.35 * M, 0.08 * M, 0.08 * M, 0.1 * M, h, 0.1 * M));
    for (let i = 0; i < 4; i++) add(i % 2 ? 'crockery' : 'steel', cyl(0.05 * M, 0.12 * M, -0.3 * M + i * 0.14 * M, h, -0.2 * M, 6));
  },

  /** Pegboard tool wall (back at -z): saws, hammers, wrenches, coiled cord. */
  toolWall(add: Add, lm = 2.4, ym = 1.0): void {
    const l = lm * M;
    add('pegboard', box(l, 1.1 * M, 0.02 * M, 0, ym * M, 0));
    for (let i = 0; i < Math.floor(lm / 0.2); i++) {
      const x = -l / 2 + 0.15 * M + i * 0.2 * M, k = i % 4;
      if (k === 0) add('steel', box(0.07 * M, 0.45 * M, 0.01 * M, x, (ym + 0.45) * M, 0.03 * M));         // hand saw
      else if (k === 1) { add('wood_mid', box(0.03 * M, 0.32 * M, 0.03 * M, x, (ym + 0.5) * M, 0.03 * M)); add('iron', box(0.12 * M, 0.04 * M, 0.04 * M, x, (ym + 0.8) * M, 0.03 * M)); }
      else if (k === 2) for (let j = 0; j < 4; j++) add('steel', box(0.025 * M, (0.14 + j * 0.03) * M, 0.012 * M, x - 0.06 * M + j * 0.04 * M, (ym + 0.15) * M, 0.03 * M));
      else add('paint_red', new THREE.TorusGeometry(0.1 * M, 0.025 * M, 6, 12).translate(x, (ym + 0.62) * M, 0.04 * M));
    }
  },

  /** Steel shelving rack with parts bins and boxes. */
  rack(add: Add, lm = 1.8, hm = 2.0): void {
    const l = lm * M, d = 0.5 * M, h = hm * M;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('steel', box(0.04 * M, h, 0.04 * M, sx * (l / 2 - 0.02 * M), 0, sz * (d / 2 - 0.02 * M)));
    for (let k = 0; k < 4; k++) {
      const y = 0.1 * M + k * (h - 0.15 * M) / 3;
      add('steel', box(l, 0.025 * M, d, 0, y, 0));
      if (k === 3) break;
      for (let i = 0; i < Math.floor(lm / 0.36); i++) add(i % 3 === 0 ? 'paint_green' : i % 3 === 1 ? 'wood_mid' : 'paint_red', box(0.3 * M, 0.25 * M, 0.38 * M, -l / 2 + 0.2 * M + i * 0.36 * M, y + 0.025 * M, 0));
    }
  },

  /** Anvil on a stump, and a coal forge with its hood and flue. */
  forge(add: Add): void {
    add('wood_dark', cyl(0.22 * M, 0.55 * M, 0.7 * M, 0, 0, 10));
    add('iron', box(0.55 * M, 0.2 * M, 0.16 * M, 0.7 * M, 0.55 * M, 0));
    add('iron', new THREE.ConeGeometry(0.08 * M, 0.25 * M, 6).rotateZ(Math.PI / 2).translate(0.39 * M, 0.7 * M, 0));
    add('fieldstone', box(0.9 * M, 0.8 * M, 0.7 * M, -0.4 * M, 0, 0));
    add('lamp', box(0.4 * M, 0.04 * M, 0.3 * M, -0.4 * M, 0.8 * M, 0));                                       // coals
    add('iron', new THREE.CylinderGeometry(0.12 * M, 0.45 * M, 0.5 * M, 4).rotateY(Math.PI / 4).translate(-0.4 * M, 1.6 * M, 0));
    add('iron', cyl(0.12 * M, 1.4 * M, -0.4 * M, 1.85 * M, 0));
  },

  /** Table saw on a stand. */
  tableSaw(add: Add): void {
    add('steel', box(1.0 * M, 0.06 * M, 0.7 * M, 0, 0.86 * M, 0));
    add('paint_green', box(0.6 * M, 0.6 * M, 0.5 * M, 0, 0.26 * M, 0));
    legs(add, 0.8 * M, 0.6 * M, 0.26 * M, 0.025 * M, 'steel');
    add('steel', new THREE.CylinderGeometry(0.13 * M, 0.13 * M, 0.01 * M, 16).rotateX(Math.PI / 2).translate(0, 0.92 * M, 0));
  },

  /** Lumber rack: arms off the wall (back at -z) with boards and offcuts. */
  lumberRack(add: Add, lm = 3.0): void {
    const l = lm * M;
    for (let i = 0; i < 3; i++) add('steel', box(0.06 * M, 2.0 * M, 0.06 * M, -l / 2 + 0.2 * M + i * (l - 0.4 * M) / 2, 0, -0.25 * M));
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 3; i++) add('steel', box(0.04 * M, 0.04 * M, 0.45 * M, -l / 2 + 0.2 * M + i * (l - 0.4 * M) / 2, (0.5 + k * 0.6) * M, 0));
      add('frame', box(l, 0.12 * M, 0.35 * M, 0, (0.54 + k * 0.6) * M, 0.02 * M));
    }
  },

  /** Generator on a cart, with jerry cans of fuel beside it. */
  generator(add: Add): void {
    add('paint_red', box(0.7 * M, 0.5 * M, 0.5 * M, 0, 0.15 * M, 0));
    add('iron', box(0.75 * M, 0.04 * M, 0.55 * M, 0, 0.65 * M, 0));
    for (const sx of [-1, 1]) add('iron', new THREE.CylinderGeometry(0.12 * M, 0.12 * M, 0.06 * M, 10).rotateX(Math.PI / 2).translate(sx * 0.3 * M, 0.12 * M, 0.28 * M));
    for (let i = 0; i < 3; i++) add(i === 2 ? 'paint_green' : 'paint_red', box(0.18 * M, 0.45 * M, 0.34 * M, 0.55 * M + i * 0.21 * M, 0, -0.05 * M));
  },

  /** ATV (front faces +z) with a small dump trailer behind. */
  atv(add: Add): void {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('iron', new THREE.CylinderGeometry(0.28 * M, 0.28 * M, 0.25 * M, 12).rotateZ(Math.PI / 2).translate(sx * 0.55 * M, 0.28 * M, sz * 0.6 * M));
    add('paint_green', box(1.05 * M, 0.35 * M, 1.6 * M, 0, 0.45 * M, 0));
    add('iron', box(0.5 * M, 0.15 * M, 0.7 * M, 0, 0.8 * M, -0.1 * M));                                          // seat
    add('steel', box(0.9 * M, 0.04 * M, 0.04 * M, 0, 1.05 * M, 0.55 * M));                                       // bars
    add('steel', box(1.1 * M, 0.04 * M, 0.4 * M, 0, 0.85 * M, 0.75 * M));                                        // front rack
    add('steel', box(0.06 * M, 0.06 * M, 0.9 * M, 0, 0.3 * M, -1.15 * M));                                       // hitch
    add('paint_green', box(1.1 * M, 0.45 * M, 1.2 * M, 0, 0.4 * M, -2.1 * M));
    for (const sx of [-1, 1]) add('iron', new THREE.CylinderGeometry(0.2 * M, 0.2 * M, 0.15 * M, 10).rotateZ(Math.PI / 2).translate(sx * 0.62 * M, 0.2 * M, -2.1 * M));
  },

  /** Work stool. */
  stool(add: Add): void {
    add('wood_mid', cyl(0.18 * M, 0.05 * M, 0, 0.65 * M, 0, 10));
    for (let i = 0; i < 3; i++) { const a = i * 2.09; add('wood_dark', box(0.04 * M, 0.66 * M, 0.04 * M, Math.cos(a) * 0.13 * M, 0, Math.sin(a) * 0.13 * M)); }
  },

  // ── Cellar / pantry ───────────────────────────────────────────────────
  /** Slatted bin of potatoes / roots. */
  rootBin(add: Add, crop: KitMaterialId = 'log_end'): void {
    add('wood_mid', box(0.8 * M, 0.6 * M, 0.6 * M, 0, 0, 0));
    for (let i = 0; i < 10; i++) add(crop, new THREE.SphereGeometry(0.07 * M, 6, 5).translate(((i % 5) - 2) * 0.13 * M, 0.6 * M + Math.floor(i / 5) * 0.04 * M, ((i * 7) % 3 - 1) * 0.15 * M));
  },

  /** Stoneware crocks (sauerkraut, pickles, lard). */
  crocks(add: Add): void {
    const r = [0.18, 0.14, 0.16];
    r.forEach((rr, i) => { add('crockery', new THREE.CylinderGeometry(rr * M, rr * 0.9 * M, rr * 2.4 * M, 12).translate((i - 1) * 0.38 * M, rr * 1.2 * M, (i % 2) * 0.15 * M)); add('wood_dark', cyl(rr * 0.9 * M, 0.03 * M, (i - 1) * 0.38 * M, rr * 2.4 * M, (i % 2) * 0.15 * M, 12)); });
  },

  /** Herbs / onions hanging from a pole across the ceiling (back at -z). */
  hangingStrings(add: Add, lm = 1.6, ym = 1.9): void {
    const l = lm * M;
    add('wood_dark', box(l, 0.04 * M, 0.04 * M, 0, ym * M, 0));
    for (let i = 0; i < 7; i++) add(i % 2 ? 'crop' : 'straw', new THREE.ConeGeometry(0.07 * M, 0.45 * M, 6).rotateX(Math.PI).translate(-l / 2 + 0.12 * M + i * (l - 0.24 * M) / 6, (ym - 0.25) * M, 0));
  },

  // ── Coop ──────────────────────────────────────────────────────────────
  /** Roost ladder: rungs at rising heights. */
  roosts(add: Add, lm = 1.2): void {
    const l = lm * M;
    for (let k = 0; k < 3; k++) {
      add('wood_mid', box(l, 0.05 * M, 0.05 * M, 0, (0.4 + k * 0.3) * M, -0.05 * M + k * 0.25 * M));
      for (const sx of [-1, 1]) add('wood_dark', box(0.04 * M, (0.4 + k * 0.3) * M, 0.04 * M, sx * (l / 2 - 0.05 * M), 0, -0.05 * M + k * 0.25 * M));
    }
  },

  /** A row of nest boxes with straw (back at -z), mounted at `ym`. */
  nestBoxes(add: Add, n = 4, ym = 0.45): void {
    const w = 0.32 * M, l = n * w;
    add('wood_mid', box(l, 0.02 * M, 0.35 * M, 0, ym * M, 0));
    add('wood_mid', box(l, 0.3 * M, 0.02 * M, 0, ym * M, -0.17 * M));
    for (let i = 0; i <= n; i++) add('wood_dark', box(0.02 * M, 0.3 * M, 0.35 * M, -l / 2 + i * w, ym * M, 0));
    for (let i = 0; i < n; i++) {
      add('straw', box(w - 0.04 * M, 0.06 * M, 0.3 * M, -l / 2 + (i + 0.5) * w, (ym + 0.02) * M, 0));
      if (i % 2 === 0) add('enamel', new THREE.SphereGeometry(0.03 * M, 6, 5).scale(1, 1.3, 1).translate(-l / 2 + (i + 0.5) * w, (ym + 0.1) * M, 0.03 * M));
    }
    add('wood_dark', box(l, 0.06 * M, 0.04 * M, 0, ym * M, 0.19 * M));
  },

  /** Hanging feeder and a waterer. */
  feeder(add: Add): void {
    add('steel', new THREE.CylinderGeometry(0.12 * M, 0.12 * M, 0.45 * M, 10).translate(0, 0.35 * M, 0));
    add('steel', new THREE.CylinderGeometry(0.22 * M, 0.2 * M, 0.06 * M, 12).translate(0, 0.3 * M, 0));
    add('enamel', new THREE.CylinderGeometry(0.14 * M, 0.17 * M, 0.38 * M, 12).translate(0.5 * M, 0.19 * M, 0));
  },

  /** A hen (faces +z): body, tail, head, comb. */
  hen(add: Add, color: KitMaterialId = 'paint_red'): void {
    add(color, new THREE.SphereGeometry(0.13 * M, 8, 6).scale(1, 0.85, 1.25).translate(0, 0.22 * M, 0));
    add(color, new THREE.ConeGeometry(0.08 * M, 0.18 * M, 6).rotateX(-0.8).translate(0, 0.32 * M, -0.15 * M));
    add(color, new THREE.SphereGeometry(0.065 * M, 7, 6).translate(0, 0.36 * M, 0.13 * M));
    add('paint_red', box(0.015 * M, 0.05 * M, 0.06 * M, 0, 0.41 * M, 0.13 * M));
    add('straw', new THREE.ConeGeometry(0.02 * M, 0.05 * M, 5).rotateX(Math.PI / 2).translate(0, 0.35 * M, 0.2 * M));
    for (const sx of [-1, 1]) add('straw', box(0.015 * M, 0.12 * M, 0.015 * M, sx * 0.05 * M, 0.02 * M, 0));
  },

  // ── Garden ────────────────────────────────────────────────────────────
  /** Raised bed w × l (m) with crops of a kind. */
  raisedBed(add: Add, wm = 1.2, lm = 3.0, crop: 'greens' | 'tall' | 'squash' | 'roots' = 'greens'): void {
    const w = wm * M, l = lm * M, h = 0.35 * M;
    for (const sx of [-1, 1]) add('wood_mid', box(0.06 * M, h, l, sx * (w / 2 - 0.03 * M), 0, 0));
    for (const sz of [-1, 1]) add('wood_mid', box(w, h, 0.06 * M, 0, 0, sz * (l / 2 - 0.03 * M)));
    add('soil', box(w - 0.1 * M, h - 0.04 * M, l - 0.1 * M, 0, 0, 0));
    const rows = Math.max(2, Math.round(wm / 0.4)), per = Math.round(lm / 0.35);
    for (let i = 0; i < rows; i++) for (let j = 0; j < per; j++) {
      const x = -w / 2 + (i + 0.5) * w / rows, z = -l / 2 + (j + 0.5) * l / per, y = h - 0.04 * M;
      if (crop === 'greens') add('crop', new THREE.SphereGeometry(0.11 * M, 6, 4).scale(1, 0.6, 1).translate(x, y + 0.05 * M, z));
      else if (crop === 'roots') add('crop', new THREE.ConeGeometry(0.07 * M, 0.28 * M, 5).translate(x, y + 0.14 * M, z));
      else if (crop === 'tall') { add('crop', new THREE.CylinderGeometry(0.03 * M, 0.04 * M, 1.3 * M, 5).translate(x, y + 0.65 * M, z)); add('crop', new THREE.ConeGeometry(0.14 * M, 0.5 * M, 6).translate(x, y + 1.0 * M, z)); }
      else if ((i + j) % 2 === 0) { add('crop', new THREE.SphereGeometry(0.2 * M, 7, 5).scale(1.3, 0.45, 1.3).translate(x, y + 0.07 * M, z)); add('paint_red', new THREE.SphereGeometry(0.09 * M, 8, 6).scale(1.3, 1, 1).translate(x + 0.08 * M, y + 0.06 * M, z)); }
    }
  },

  /** Three-bay compost bin. */
  compost(add: Add): void {
    for (let i = 0; i < 4; i++) add('wood_mid', box(0.06 * M, 1.0 * M, 1.0 * M, -1.5 * M + i * 1.0 * M, 0, 0));
    add('wood_mid', box(3.0 * M, 1.0 * M, 0.06 * M, 0, 0, -0.5 * M));
    for (let i = 0; i < 3; i++) add(i === 2 ? 'straw' : 'soil', box(0.9 * M, (0.4 + i * 0.15) * M, 0.9 * M, -1.0 * M + i * 1.0 * M, 0, 0));
  },

  // ── Services (plumbed / wired) ────────────────────────────────────────
  /** Refrigerator. */
  fridge(add: Add): void {
    add('enamel', box(0.7 * M, 1.75 * M, 0.7 * M, 0, 0, 0));
    add('steel', box(0.03 * M, 0.5 * M, 0.04 * M, 0.27 * M, 1.05 * M, 0.37 * M));
    add('steel', box(0.03 * M, 0.3 * M, 0.04 * M, 0.27 * M, 0.45 * M, 0.37 * M));
    add('iron', box(0.68 * M, 0.01 * M, 0.01 * M, 0, 0.95 * M, 0.355 * M));
  },
  /** Electric water heater (tank) with pipes up into the wall. */
  waterHeater(add: Add): void {
    add('enamel', cyl(0.25 * M, 1.4 * M, 0, 0.05 * M, 0, 14));
    add('steel', cyl(0.25 * M, 0.05 * M, 0, 1.45 * M, 0, 14));
    // cold in, hot out: up from the top, then back into the wall behind (−z)
    for (const x of [-0.08, 0.08]) {
      const m: KitMaterialId = x < 0 ? 'blue_tank' : 'paint_red';
      add(m, cyl(0.02 * M, 0.4 * M, x * M, 1.5 * M, 0, 6));
      add(m, new THREE.CylinderGeometry(0.02 * M, 0.02 * M, 0.32 * M, 6).rotateX(Math.PI / 2).translate(x * M, 1.9 * M, -0.16 * M));
    }
  },
  /** A pendant lamp hanging `drop` m from the ceiling (place at the ceiling height). */
  pendant(add: Add, drop = 0.6): void {
    add('iron', cyl(0.006 * M, drop * M, 0, -drop * M, 0, 4));
    add('iron', new THREE.ConeGeometry(0.18 * M, 0.16 * M, 12, 1, true).translate(0, -drop * M - 0.06 * M, 0));
    add('lamp', new THREE.SphereGeometry(0.06 * M, 8, 6).translate(0, -drop * M - 0.12 * M, 0));
  },
  /** Flush toilet (bowl and tank). */
  flushToilet(add: Add): void {
    add('enamel', new THREE.CylinderGeometry(0.2 * M, 0.15 * M, 0.4 * M, 12).scale(1, 1, 1.25).translate(0, 0.2 * M, 0.05 * M));
    add('enamel', box(0.45 * M, 0.4 * M, 0.2 * M, 0, 0.42 * M, -0.2 * M));
    add('wood_dark', new THREE.CylinderGeometry(0.21 * M, 0.21 * M, 0.03 * M, 12).scale(1, 1, 1.25).translate(0, 0.41 * M, 0.05 * M));
  },
  /** Shower: tiled corner tray, curtain on a rail, a head. */
  shower(add: Add): void {
    add('enamel', box(0.9 * M, 0.08 * M, 0.9 * M, 0, 0, 0));
    add('steel', box(0.9 * M, 0.02 * M, 0.02 * M, 0, 2.0 * M, 0.44 * M));
    add('curtain', box(0.85 * M, 1.7 * M, 0.01 * M, 0, 0.3 * M, 0.44 * M));
    add('steel', box(0.03 * M, 0.03 * M, 0.25 * M, 0, 1.9 * M, -0.35 * M));
  },

  // ── House ─────────────────────────────────────────────────────────────
  /** Three-seat sofa with cushions and a throw; sitter faces +z. */
  sofa(add: Add, quilt: KitMaterialId = 'quilt_blue'): void {
    const w = 2.1 * M, d = 0.9 * M;
    add('wood_dark', box(w, 0.1 * M, d, 0, 0.06 * M, 0));
    legs(add, w, d, 0.06 * M, 0.025 * M);
    add('linen', box(w - 0.3 * M, 0.2 * M, d - 0.2 * M, 0, 0.16 * M, 0.08 * M));
    add('linen', box(w - 0.1 * M, 0.6 * M, 0.2 * M, 0, 0.16 * M, -d / 2 + 0.1 * M));
    for (const sx of [-1, 1]) add('linen', box(0.16 * M, 0.5 * M, d, sx * (w / 2 - 0.08 * M), 0.16 * M, 0));
    add(quilt, box(0.8 * M, 0.04 * M, 0.7 * M, w * 0.22, 0.37 * M, 0.05 * M));
  },

  /** Stone fireplace with hearth, firebox and a mantel; the chimney breast runs up `hm`. */
  fireplace(add: Add, hm = 3.0): void {
    add('fieldstone', box(1.9 * M, hm * M, 0.7 * M, 0, 0, 0));
    add('fieldstone', box(2.1 * M, 0.25 * M, 0.75 * M, 0, 0, 0.6 * M));
    add('iron', box(0.9 * M, 0.75 * M, 0.04 * M, 0, 0.35 * M, 0.34 * M));
    add('lamp', box(0.6 * M, 0.25 * M, 0.02 * M, 0, 0.4 * M, 0.37 * M));
    add('wood_dark', box(2.0 * M, 0.12 * M, 0.3 * M, 0, 1.35 * M, 0.42 * M));
    add('crockery', cyl(0.06 * M, 0.25 * M, -0.6 * M, 1.47 * M, 0.42 * M, 8));
    Furniture.oilLamp(add, 0.6, 1.47, 0.42);
  },

  /** Kitchen island with a butcher-block top and stools on the far side. */
  island(add: Add, lm = 1.8): void {
    const l = lm * M, d = 0.9 * M, h = 0.92 * M;
    add('wood_mid', box(l, h - 0.06 * M, d - 0.1 * M, 0, 0.06 * M, 0));
    add('wood_dark', box(l + 0.1 * M, 0.06 * M, d + 0.1 * M, 0, h - 0.06 * M, 0));
    add('iron', cyl(0.15 * M, 0.2 * M, -0.4 * M, h, 0, 10));
    add('crop', new THREE.SphereGeometry(0.1 * M, 6, 5).translate(0.4 * M, h + 0.08 * M, 0));
  },

  /** Clawfoot tub (along x): an oval bowl with a rolled rim on four claw feet, water in it. */
  tub(add: Add): void {
    const rim = 0.62 * M;
    add('enamel', new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.82 * M, 0.47 * M, 0.38 * M).translate(0, rim, 0));
    add('enamel', new THREE.TorusGeometry(1, 0.045, 6, 28).rotateX(Math.PI / 2).scale(0.82 * M, 1, 0.38 * M).translate(0, rim, 0));
    add('crockery', new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2).scale(0.74 * M, 1, 0.32 * M).translate(0, rim - 0.08 * M, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      add('steel', new THREE.CylinderGeometry(0.03 * M, 0.05 * M, 0.2 * M, 6).translate(sx * 0.5 * M, 0.1 * M, sz * 0.2 * M));
      add('steel', new THREE.SphereGeometry(0.05 * M, 6, 4).scale(1, 0.5, 1).translate(sx * 0.5 * M, 0.02 * M, sz * 0.2 * M));
    }
    add('steel', box(0.04 * M, 0.25 * M, 0.04 * M, -0.78 * M, rim, 0));                                       // taps
    add('linen', box(0.5 * M, 0.02 * M, 0.35 * M, 0.95 * M, 0, 0.3 * M));                                       // bath mat
  },

  /** Washstand with basin and pitcher, mirror above (back at -z). */
  washstand(add: Add): void {
    add('wood_mid', box(0.8 * M, 0.8 * M, 0.45 * M, 0, 0, 0));
    add('enamel', cyl(0.2 * M, 0.08 * M, 0, 0.8 * M, 0, 12));
    add('enamel', cyl(0.08 * M, 0.25 * M, 0.25 * M, 0.8 * M, 0, 10));
    add('glass', box(0.5 * M, 0.6 * M, 0.02 * M, 0, 1.25 * M, -0.2 * M));
    add('wood_dark', box(0.58 * M, 0.68 * M, 0.015 * M, 0, 1.21 * M, -0.215 * M));
  },

  /** Composting toilet (a wooden box seat with a lid, sawdust bucket). */
  toilet(add: Add): void {
    add('wood_mid', box(0.55 * M, 0.45 * M, 0.6 * M, 0, 0, 0));
    add('wood_dark', box(0.45 * M, 0.03 * M, 0.45 * M, 0, 0.45 * M, 0.04 * M));
    add('steel', cyl(0.13 * M, 0.3 * M, 0.45 * M, 0, 0.1 * M, 10));
    add('straw', cyl(0.12 * M, 0.02 * M, 0.45 * M, 0.3 * M, 0.1 * M, 10));
  },

  /** Single bed (0.95 × 2 m) with a quilt. */
  single(add: Add, quilt: KitMaterialId = 'quilt_blue'): void { Furniture.bed(add, false, quilt); },

  /** Bunk bed: two singles stacked on corner posts with a ladder. */
  bunk(add: Add, q1: KitMaterialId = 'quilt_red', q2: KitMaterialId = 'quilt_blue'): void {
    const w = 0.95 * M, l = 2.0 * M;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('wood_dark', box(0.07 * M, 1.7 * M, 0.07 * M, sx * w / 2, 0, sz * l / 2));
    for (const [y, q] of [[0.2, q1], [1.1, q2]] as const) {
      add('wood_mid', box(w, 0.1 * M, l, 0, y * M, 0));
      add('linen', box(w - 0.05 * M, 0.16 * M, l - 0.06 * M, 0, (y + 0.1) * M, 0));
      add(q, box(w + 0.02 * M, 0.04 * M, l * 0.68, 0, (y + 0.25) * M, l * 0.15));
      add('linen', box(0.6 * M, 0.1 * M, 0.35 * M, 0, (y + 0.26) * M, -l / 2 + 0.25 * M));
    }
    for (let k = 0; k < 4; k++) add('wood_mid', box(0.04 * M, 0.04 * M, 0.4 * M, w / 2 + 0.03 * M, (0.4 + k * 0.3) * M, l / 2 - 0.3 * M));
  },

  /** Straight stair run rising toward -z: `rise` (m) over `run` (m), width (m), with a handrail on the +x side. */
  stairs(add: Add, rise = 3.0, run = 3.6, wm = 0.9): void {
    const n = Math.round(rise / 0.19), w = wm * M, tr = run * M / n, rr = rise * M / n;
    for (let i = 0; i < n; i++) {
      add('wood_mid', box(w, 0.04 * M, tr + 0.02 * M, 0, (i + 1) * rr - 0.04 * M, run * M / 2 - (i + 0.5) * tr));
      add('wood_dark', box(w, rr, 0.02 * M, 0, i * rr, run * M / 2 - i * tr));
    }
    const len = Math.hypot(rise * M, run * M), ang = Math.atan2(rise * M, run * M);
    for (const sx of [-1, 1]) add('wood_dark', box(0.05 * M, 0.25 * M, len, sx * w / 2, 0, 0).rotateX(ang).translate(0, rise * M / 2 - 0.05 * M, 0));
    add('wood_mid', box(0.05 * M, 0.05 * M, len, w / 2, 0, 0).rotateX(ang).translate(0, rise * M / 2 + 0.85 * M, 0));
  },

  /** Six-seat dining table with benches. */
  diningTable(add: Add): void {
    Furniture.table(add, 2.0, 0.95);
    for (const sz of [-1, 1]) { const g: THREE.BufferGeometry[] = []; Furniture.bench((m, geo) => { g.push(geo); add(m, geo.translate(0, 0, sz * 0.7 * M)); }, 1.8); }
    Furniture.oilLamp(add, 0, 0.76, 0);
  },

  /** Bathroom / kitchen: a cast-iron cookstove (wood range) with oven door and warming shelf. */
  cookstove(add: Add): void {
    add('iron', box(1.1 * M, 0.75 * M, 0.65 * M, 0, 0.12 * M, 0));
    legs(add, 1.1 * M, 0.65 * M, 0.12 * M, 0.035 * M, 'iron');
    add('steel', box(0.45 * M, 0.35 * M, 0.02 * M, 0.2 * M, 0.25 * M, 0.33 * M));
    add('iron', box(1.1 * M, 0.3 * M, 0.25 * M, 0, 1.2 * M, -0.2 * M));
    add('iron', cyl(0.07 * M, 1.4 * M, -0.35 * M, 0.87 * M, -0.2 * M));
    add('enamel', cyl(0.12 * M, 0.16 * M, 0.25 * M, 0.87 * M, 0.05 * M));
  },
} as const;

/** Point-in-collider test with a body radius (local frame). */
export function hitsColliders(cs: readonly Collider[], x: number, z: number, r: number): boolean {
  for (const c of cs) if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true;
  return false;
}
