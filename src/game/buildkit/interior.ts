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
 * are written in metres × M so they read as real furniture.
 */
import * as THREE from 'three';
import type { KitMaterialId } from './materials';

/** One metre in world units. */
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

/** An opening along a wall: centre `at` (distance from the start), width, sill and height above the wall base. */
export interface Opening { at: number; w: number; sill: number; h: number }

export interface WallSpec {
  ax: number; az: number; bx: number; bz: number;
  /** Base height and full height. */
  y0: number; h: number;
  /** Thickness, and offset of the wall's centre line to its left (+) of a→b. */
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
// Furniture library (front faces +z, floor at y = 0, sizes in metres × M)
// ─────────────────────────────────────────────────────────────────────────

type Add = (m: KitMaterialId, g: THREE.BufferGeometry) => void;

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
  counter(add: Add, lm = 2.4, sinkAt = 0.25): void {
    const l = lm * M, d = 0.6 * M, h = 0.9 * M;
    add('wood_mid', box(l, h - 0.1 * M, d - 0.05 * M, 0, 0.1 * M, -0.025 * M));
    add('wood_dark', box(l, 0.1 * M, d - 0.1 * M, 0, 0, -0.05 * M));                    // toe kick
    add('wood_dark', box(l + 0.02 * M, 0.05 * M, d + 0.02 * M, 0, h - 0.05 * M, 0));     // top
    // cabinet doors
    const n = Math.max(2, Math.round(lm / 0.6));
    for (let i = 0; i < n; i++) add('wood_dark', box(l / n - 0.04 * M, h - 0.3 * M, 0.015 * M, -l / 2 + (i + 0.5) * l / n, 0.15 * M, d / 2 - 0.04 * M));
    const sx = (sinkAt - 0.5) * l;
    add('enamel', box(0.6 * M, 0.06 * M, 0.45 * M, sx, h - 0.03 * M, 0));
    add('iron', box(0.03 * M, 0.3 * M, 0.03 * M, sx, h, -d / 2 + 0.06 * M));            // pump spout
    add('iron', cyl(0.11 * M, 0.14 * M, -sx * 0.6, h, 0.02 * M));                         // pot
    for (let i = 0; i < 3; i++) add('crockery', cyl(0.05 * M, 0.1 * M, l * 0.32 + i * 0.12 * M - l * 0.05, h, -0.12 * M, 8));
  },

  /** Open shelves on the wall (back at -z): `levels` boards from `y` up; jars, crocks or books on them. */
  wallShelf(add: Add, lm = 1.2, y = 1.35, levels = 2, fill: 'jars' | 'books' = 'jars'): void {
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
  shelfUnit(add: Add, lm = 1.0, hm = 1.9, fill: 'jars' | 'books' = 'books'): void {
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

  /** Hurricane oil lamp (glows at night). Position in metres in the piece frame. */
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
} as const;

/** Point-in-collider test with a body radius (local frame). */
export function hitsColliders(cs: readonly Collider[], x: number, z: number, r: number): boolean {
  for (const c of cs) if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true;
  return false;
}
