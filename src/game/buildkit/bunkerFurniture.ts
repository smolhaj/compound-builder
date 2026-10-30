/**
 * Bunker fit-out pieces (procedural; sizes in meters × M, scale.test.ts).
 * Each is a function of `add` in the usual kit convention: back at -z, front
 * at +z, floor at y = 0. Used by bunkerBuildings.ts. Everything merges into
 * the room's one-mesh-per-material, so none of it costs a draw call; the
 * screens are all one shared emissive atlas (buildkit/screenFeeds.ts).
 */
import * as THREE from 'three';
import { Furniture, M, type Add } from './interior';
import { box } from './shell';
import { mapPlane, screenPlane } from './screenFeeds';
import type { KitMaterialId } from './materials';

const cyl = (r: number, h: number, x: number, y: number, z: number, seg = 10) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);

// ── The arched, wood-lined tunnel ────────────────────────────────────────

/** Clear-height profile of the arch: springs at `spring` on both walls, crowns at `crown` in the middle. Returns y at x. */
export function archY(x: number, left: number, right: number, spring: number, crown: number): number {
  const a = (right - left) / 2, cx = (left + right) / 2, s = crown - spring;
  const rad = (a * a + s * s) / (2 * s), cy = crown - rad;
  const dx = Math.min(a, Math.abs(x - cx));
  return cy + Math.sqrt(Math.max(0, rad * rad - dx * dx));
}

/** Boards laid up the walls and across the vault in a curve, with timber ribs every `step`: pushes (material, geometry, layer) triples. */
export function archVault(put: (m: KitMaterialId, g: THREE.BufferGeometry, layer: 'roof' | 'walls' | 'cutwalls') => void,
  left: number, right: number, back: number, front: number, spring: number, crown: number, step: number, skip: (z: number) => boolean = () => false): void {
  const N = 12, pts: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) { const x = left + (right - left) * i / N; pts.push([x, archY(x, left, right, spring, crown)]); }
  const len = front - back, midZ = (front + back) / 2;
  const seg = (m: KitMaterialId, t: number, depth: number, z: number, d: number, ox = 0, oy = 0) => {
    for (let i = 0; i < N; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const l = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
      // a plank lying along the curve, its top face a little below the slab, offset `depth` into the room
      const g = new THREE.BoxGeometry(l + 0.003, t, d).rotateZ(ang).translate((x0 + x1) / 2 + ox, (y0 + y1) / 2 - depth + oy, z);
      put(m, g, 'roof');
    }
  };
  // the boards: a continuous sheet of 2.2 cm planks (the pine panel's own grain runs along the tunnel)
  seg('pine_panel', 0.012, 0.004, midZ, len);
  // ribs: a rim of dark timber every `step`, a little proud of the boards
  for (let z = back + step / 2; z < front; z += step) {
    if (skip(z)) continue;
    seg('wood_dark', 0.022, 0.014, z, 0.028);
    // the rib's feet: battens down the wall from the spring to the floor
    for (const sx of [-1, 1]) put('wood_dark', box(0.006, spring, 0.028, sx < 0 ? left + 0.003 : right - 0.003, 0, z), 'walls');
    for (const sx of [-1, 1]) put('wood_dark', box(0.006, Math.min(spring, 0.2) , 0.028, sx < 0 ? left + 0.003 : right - 0.003, 0, z), 'cutwalls');
  }
}

// ── Pantry, water, air ───────────────────────────────────────────────────

/** Food shelf (food slots on every board, drawn by quantity) with a colored tag plate on every board's lip, a row at a time: grain, cans, veg, water, medicine. */
export function pantryShelf(a: Add, lm = 1.0, hm = 2.0): void {
  Furniture.shelfUnit(a, lm, hm, 'food');
  const l = lm * M, h = hm * M, d = 0.35 * M, n = Math.max(3, Math.round(hm / 0.4));
  const tags: KitMaterialId[] = ['paint_yellow', 'paint_red', 'paint_green', 'blue_tank', 'paint_yellow'];
  for (let k = 0; k <= n; k++) {
    const yy = 0.05 * M + k * (h - 0.08 * M) / n;
    if (k === n) break;
    a('trim', box(0.16 * M, 0.045 * M, 0.006 * M, -l * 0.3, yy - 0.02 * M, d / 2 + 0.002));
    a(tags[k % tags.length], box(0.16 * M, 0.008 * M, 0.007 * M, -l * 0.3, yy - 0.02 * M, d / 2 + 0.003));
    a('iron', box(0.09 * M, 0.006 * M, 0.008 * M, -l * 0.3, yy - 0.008 * M, d / 2 + 0.004));
  }
}

/** A wall of stackable totes with colored lids and a label card on each: dry goods, seed, batteries, first aid. */
export function toteStack(a: Add, cols = 2, rows = 3): void {
  const lids: KitMaterialId[] = ['paint_red', 'blue_tank', 'paint_yellow', 'paint_green', 'paint_red', 'blue_tank'];
  const w = 0.5 * M, d = 0.4 * M, h = 0.3 * M;
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const x = (c - (cols - 1) / 2) * (w + 0.02 * M), y = r * (h + 0.012 * M);
    a('enamel', box(w, h, d, x, y, 0));
    a(lids[(c + r * 2) % lids.length], box(w + 0.01 * M, 0.025 * M, d + 0.01 * M, x, y + h, 0));
    a('trim', box(0.2 * M, 0.1 * M, 0.006 * M, x, y + 0.1 * M, d / 2 + 0.002));
    a('iron', box(0.14 * M, 0.008 * M, 0.007 * M, x, y + 0.17 * M, d / 2 + 0.004));
    a('iron', box(0.1 * M, 0.008 * M, 0.007 * M, x, y + 0.14 * M, d / 2 + 0.004));
  }
}

/** A gravity water filter: two stainless buckets on a stand with the spigot and a blue-banded ceramic candle, plus a five-gallon jug and jerry cans. */
export function waterFilter(a: Add): void {
  a('wood_dark', box(0.7 * M, 0.05 * M, 0.45 * M, 0, 0.7 * M, 0));                        // the stand's top
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) a('wood_dark', box(0.05 * M, 0.7 * M, 0.05 * M, sx * 0.3 * M, 0, sz * 0.18 * M));
  a('aluminum', cyl(0.14 * M, 0.34 * M, 0, 1.22 * M, 0, 14));                            // upper chamber (dirty water in)
  a('aluminum', cyl(0.14 * M, 0.38 * M, 0, 0.75 * M, 0, 14));                            // lower chamber (clean)
  a('aluminum', cyl(0.145 * M, 0.02 * M, 0, 1.56 * M, 0, 14));                           // lid
  a('iron', cyl(0.03 * M, 0.03 * M, 0, 1.58 * M, 0, 8));
  a('blue_tank', cyl(0.045 * M, 0.2 * M, 0.17 * M, 0.75 * M, 0.03 * M, 8));              // inline carbon cartridge
  a('steel', cyl(0.015 * M, 0.1 * M, 0, 0.82 * M, 0.17 * M, 6).rotateX(Math.PI / 2).translate(0, 0.0, 0)); // spigot
  a('blue_tank', cyl(0.18 * M, 0.45 * M, -0.5 * M, 0, 0.0, 12));                         // a 5 gal water jug beside
  a('paint_yellow', box(0.3 * M, 0.5 * M, 0.14 * M, 0.55 * M, 0, 0.02 * M));              // a jerry can
  a('paint_yellow', box(0.3 * M, 0.5 * M, 0.14 * M, 0.55 * M, 0, -0.18 * M));
  a('trim', box(0.2 * M, 0.08 * M, 0.006 * M, 0, 0.9 * M, 0.223 * M));                    // a card: "boil / filter / settle"
}

/**
 * Air handling: a wall-mounted unit (grille, fan housing, a status lamp: green with the plant running, red without) with duct stubs
 * up into the ceiling. `air`: the bunker's plant room is built.
 */
export function airHandler(a: Add, air: boolean): void {
  a('steel', box(0.7 * M, 0.5 * M, 0.35 * M, 0, 1.2 * M, -0.1 * M));
  a('iron', box(0.5 * M, 0.3 * M, 0.01 * M, -0.04 * M, 1.3 * M, 0.08 * M));
  for (let i = 0; i < 6; i++) a('steel', box(0.5 * M, 0.012 * M, 0.012 * M, -0.04 * M, (1.2 + i * 0.045) * M, 0.09 * M));
  a(air ? 'led_green' : 'led_red', cyl(0.018 * M, 0.012 * M, 0.28 * M, 1.58 * M, 0.08 * M, 8).rotateX(Math.PI / 2).translate(0, 0, 0.0));
  a('aluminum', cyl(0.12 * M, 0.55 * M, -0.12 * M, 1.7 * M, -0.1 * M, 12));
  a('steel', cyl(0.02 * M, 0.08 * M, 0.18 * M, 1.7 * M, -0.1 * M, 8));
  a('paint_yellow', box(0.3 * M, 0.1 * M, 0.008 * M, -0.1 * M, 0.92 * M, 0.07 * M));
}

/** A ceiling duct run along z with grilles (layer: roof): rectangular galvanized trunk on hangers, with a drop at the end. */
export function ductRun(put: (m: KitMaterialId, g: THREE.BufferGeometry) => void, x: number, back: number, front: number, ceilY: number, grilleEvery = 0.55): void {
  const w = 0.3 * M, h = 0.22 * M, y = ceilY - h - 0.01;
  put('aluminum', box(w, h, front - back, x, y, (back + front) / 2));
  for (let z = back + 0.08; z < front - 0.05; z += 0.3) put('steel', box(w + 0.02, 0.012, 0.016, x, y + h, z));       // hanger straps
  for (let z = back + grilleEvery / 2; z < front; z += grilleEvery) {
    put('iron', box(w * 0.7, 0.004, 0.1 * M, x, y - 0.004, z));
    for (let k = -1; k <= 1; k++) put('steel', box(w * 0.7, 0.003, 0.006, x, y - 0.008, z + k * 0.03 * M));
  }
}

// ── Bunkroom: the family's morale ───────────────────────────────────────

/** A TV on a low media stand with a games console and controllers; the screen is the shared atlas ('tv' cell: a game night, or a test card). */
export function tvStand(a: Add): void {
  const w = 1.4 * M, d = 0.4 * M;
  a('wood_dark', box(w, 0.45 * M, d, 0, 0, 0));
  a('wood_mid', box(w + 0.02 * M, 0.03 * M, d + 0.02 * M, 0, 0.45 * M, 0));
  for (let k = 0; k < 2; k++) a('iron', box(0.4 * M, 0.2 * M, 0.01 * M, (k - 0.5) * 0.5 * M, 0.1 * M, d / 2 + 0.002));
  const tw = 1.0 * M, th = tw * 144 / 256;
  a('iron', box(tw + 0.04 * M, th + 0.04 * M, 0.05 * M, 0, 0.7 * M, 0));                      // bezel / set
  a('screens', screenPlane(tw, th, 'tv', 0, 0.72 * M, 0.026 * M));
  a('iron', box(0.3 * M, 0.2 * M, 0.04 * M, 0, 0.48 * M, 0.0));                                // the neck
  a('iron', box(0.28 * M, 0.04 * M, 0.2 * M, -0.35 * M, 0.48 * M, 0.02 * M));                 // console
  a('led_green', box(0.012 * M, 0.012 * M, 0.004 * M, -0.28 * M, 0.5 * M, 0.125 * M));
  for (const s of [0.1, 0.22]) a('steel', box(0.1 * M, 0.025 * M, 0.06 * M, (s + 0.12) * M, 0.48 * M, 0.08 * M));   // controllers
}

/** A low shelf of games (boxes, a chess set) and a few paperbacks; `games` / `books` come from what the family actually owns. */
export function gameShelf(a: Add, games: boolean, books: boolean, music: boolean): void {
  const l = 1.0 * M, d = 0.3 * M, h = 1.1 * M;
  for (const sx of [-1, 1]) a('wood_dark', box(0.03 * M, h, d, sx * (l / 2 - 0.015 * M), 0, 0));
  for (let k = 0; k < 3; k++) a('wood_dark', box(l, 0.025 * M, d, 0, 0.04 * M + k * 0.5 * M, 0));
  a('wood_dark', box(l, h, 0.015 * M, 0, 0, -d / 2 + 0.008 * M));
  if (games) {
    const cols: KitMaterialId[] = ['paint_red', 'blue_tank', 'paint_yellow', 'paint_green', 'paint_red'];
    for (let i = 0; i < 5; i++) a(cols[i], box(0.18 * M, 0.04 * M, 0.26 * M, -0.3 * M + (i % 2) * 0.02 * M, 0.065 * M + i * 0.04 * M, 0));      // stacked boxes
    for (let i = 0; i < 4; i++) a(cols[i + 1], box(0.2 * M, 0.04 * M, 0.26 * M, 0.2 * M, 0.565 * M + i * 0.04 * M, 0));
    a('wood_mid', box(0.34 * M, 0.02 * M, 0.34 * M, 0.2 * M, 0.065 * M, 0));                         // a chess board
  }
  if (books) a('books', box(0.7 * M, 0.3 * M, d * 0.8, -0.1 * M, 0.065 * M + 0.5 * M, 0));
  if (music) {
    a('wood_mid', new THREE.CylinderGeometry(0.1 * M, 0.1 * M, 0.04 * M, 14).rotateX(Math.PI / 2).scale(1, 1.2, 1).translate(0.3 * M, 1.12 * M + 0.12 * M, 0));      // guitar on top
    a('wood_dark', box(0.04 * M, 0.5 * M, 0.025 * M, 0.3 * M, 1.12 * M + 0.18 * M, 0));
  }
}

// ── Control room ─────────────────────────────────────────────────────────

/** An office chair on casters, facing +z. */
export function officeChair(a: Add): void {
  a('iron', cyl(0.03 * M, 0.28 * M, 0, 0.05 * M, 0, 8));
  for (let k = 0; k < 5; k++) { const r = (k / 5) * Math.PI * 2; a('iron', box(0.28 * M, 0.025 * M, 0.04 * M, Math.cos(r) * 0.14 * M, 0.04 * M, Math.sin(r) * 0.14 * M).rotateY(-r).translate(0, 0, 0)); a('iron', cyl(0.025 * M, 0.04 * M, Math.cos(r) * 0.28 * M, 0, Math.sin(r) * 0.28 * M, 6)); }
  a('quilt_blue', box(0.5 * M, 0.08 * M, 0.5 * M, 0, 0.45 * M, 0));
  a('quilt_blue', box(0.46 * M, 0.5 * M, 0.08 * M, 0, 0.5 * M, -0.22 * M));
  for (const sx of [-1, 1]) a('iron', box(0.04 * M, 0.03 * M, 0.3 * M, sx * 0.27 * M, 0.66 * M, 0.0));
}

/**
 * The wall of screens on a desk: a radar (left), the four camera feeds
 * (center, over the radio net's news strip), the weather (right) and a status
 * panel; a laptop with the security app, an HF rig and a mic, a mug, a lamp.
 * Back at -z; 2.6 m wide, 0.75 m deep.
 */
export function controlWall(a: Add, powered: boolean): void {
  const w = 2.6 * M, d = 0.75 * M, top = 0.74 * M;
  a('iron', box(w, 0.04 * M, d, 0, top - 0.04 * M, 0));
  for (const sx of [-1, 1]) a('steel', box(0.05 * M, top - 0.04 * M, d - 0.06 * M, sx * (w / 2 - 0.05 * M), 0, 0));
  a('steel', box(w - 0.12 * M, 0.2 * M, 0.02 * M, 0, 0.3 * M, -d / 2 + 0.05 * M));               // modesty panel
  // the wall: a steel backboard with the monitors on arms
  const z0 = -d / 2 + 0.06 * M;
  a('iron', box(w, 1.25 * M, 0.04 * M, 0, top, z0 - 0.04 * M));
  const mon = (cell: 'cams' | 'news' | 'radar' | 'weather' | 'status', x: number, y: number, ww: number, hh: number) => {
    a('iron', box(ww + 0.05 * M, hh + 0.05 * M, 0.04 * M, x, y - 0.025 * M, z0));
    a('screens', screenPlane(ww, hh, cell, x, y, z0 + 0.0036));
  };
  mon('radar', -0.95 * M, 1.05 * M, 0.66 * M, 0.66 * M);
  mon('cams', 0, 1.32 * M, 1.14 * M, 0.64 * M);
  mon('weather', 0.95 * M, 1.05 * M, 0.66 * M, 0.66 * M);
  mon('news', 0, 0.9 * M, 0.82 * M, 0.36 * M);
  mon('status', 0.95 * M, 1.78 * M, 0.5 * M, 0.31 * M);
  // an HF rig with a mic and a speaker on the left of the desk
  a('iron', box(0.45 * M, 0.16 * M, 0.3 * M, -0.8 * M, top, 0.02 * M));
  a('led_amber', box(0.1 * M, 0.025 * M, 0.004 * M, -0.88 * M, top + 0.1 * M, 0.172 * M));
  a('steel', cyl(0.012 * M, 0.22 * M, -0.5 * M, top, 0.1 * M, 6));
  a('iron', box(0.05 * M, 0.04 * M, 0.04 * M, -0.5 * M, top + 0.22 * M, 0.1 * M));
  a('iron', box(0.2 * M, 0.3 * M, 0.2 * M, -1.15 * M, top, 0.0));                                    // speaker
  // laptop with the security app, keyboard, mouse, mug
  a('iron', box(0.34 * M, 0.02 * M, 0.24 * M, 0.55 * M, top, 0.1 * M));
  const lw = 0.3 * M, lh = lw * 160 / 256;
  a('iron', box(lw + 0.02 * M, lh + 0.02 * M, 0.015 * M, 0.55 * M, top, -0.04 * M).rotateX(0));
  a('screens', screenPlane(lw, lh, 'laptop', 0.55 * M, top + 0.012 * M, -0.04 * M + 0.0085 * M));
  a('iron', box(0.4 * M, 0.015 * M, 0.14 * M, 0.0, top, 0.22 * M));                                 // keyboard
  a('iron', box(0.06 * M, 0.02 * M, 0.09 * M, 0.35 * M, top, 0.22 * M));
  a('crockery', cyl(0.045 * M, 0.1 * M, 0.95 * M, top, 0.2 * M, 10));                                // a mug
  a('steel', cyl(0.04 * M, 0.26 * M, 1.05 * M, top, 0.05 * M, 10));                                  // a thermos
  a('steel', cyl(0.025 * M, 0.35 * M, -0.2 * M, top, -0.2 * M, 6));                                  // desk lamp arm
  a('lamp', new THREE.SphereGeometry(0.05 * M, 8, 6).translate(-0.2 * M, top + 0.37 * M, -0.12 * M));
  if (powered) a('led_green', box(0.02 * M, 0.02 * M, 0.004 * M, 1.2 * M, top + 0.01 * M, 0.2 * M));
}

/** A steel gun rack, floor-standing: three rifles in padded slots, a pistol box and a spare magazine rail. */
export function gunRack(a: Add): void {
  const w = 1.1 * M, d = 0.3 * M;
  a('iron', box(w, 0.05 * M, d, 0, 0.1 * M, 0));
  a('iron', box(w, 0.05 * M, d, 0, 1.1 * M, 0));
  for (const sx of [-1, 1]) a('iron', box(0.04 * M, 1.2 * M, 0.04 * M, sx * (w / 2 - 0.02 * M), 0, -d / 2 + 0.03 * M));
  a('paint_green', box(w, 0.05 * M, 0.02 * M, 0, 0.12 * M, 0.1 * M));
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.3 * M;
    a('iron', box(0.04 * M, 0.9 * M, 0.04 * M, x, 0.15 * M, 0.0));                       // barrel and receiver
    a('wood_dark', box(0.05 * M, 0.35 * M, 0.05 * M, x, 0.15 * M, 0.0));                 // stock
    a('iron', box(0.025 * M, 0.2 * M, 0.04 * M, x, 0.32 * M, 0.05 * M));                // magazine
    a('iron', box(0.03 * M, 0.04 * M, 0.1 * M, x, 0.88 * M, 0.0));                       // optic
  }
  a('paint_green', box(0.4 * M, 0.14 * M, 0.2 * M, 0.35 * M, 0.0, 0.2 * M));            // an ammo can on the floor
}

/** A folding cot with a sleeping bag and a pillow, head at -z. */
export function cot(a: Add): void {
  const w = 0.7 * M, l = 1.9 * M;
  a('paint_green', box(w, 0.05 * M, l, 0, 0.32 * M, 0));
  for (const sx of [-1, 1]) a('steel', box(0.03 * M, 0.34 * M, l - 0.1 * M, sx * (w / 2 - 0.01 * M), 0.0, 0));
  for (const z of [-0.4, 0.4]) { a('steel', box(w, 0.025 * M, 0.04 * M, 0, 0.0, z * M).rotateX(0)); }
  a('quilt_blue', box(w - 0.06 * M, 0.12 * M, l * 0.75, 0, 0.37 * M, l * 0.12));           // the sleeping bag, unzipped
  a('paint_green', box(w - 0.06 * M, 0.03 * M, l * 0.5, 0, 0.49 * M, l * 0.22));
  a('linen', box(0.4 * M, 0.1 * M, 0.3 * M, 0, 0.37 * M, -l / 2 + 0.2 * M));              // pillow
  a('steel', cyl(0.035 * M, 0.26 * M, 0.5 * M, 0, -0.2 * M, 10));                         // the thermos on the floor beside
  a('paint_green', box(0.5 * M, 0.3 * M, 0.34 * M, -0.55 * M, 0, 0.3 * M));               // a tote under the cot's side
}

/** The corkboard on an easel: the compound's site plan (drawn from what is built), pinned papers and sticky notes. Not emissive. */
export function mapEasel(a: Add): void {
  const bw = 1.0 * M, bh = 0.78 * M, y0 = 0.62 * M;
  for (const sx of [-1, 1]) a('wood_dark', box(0.04 * M, 1.5 * M, 0.04 * M, sx * 0.4 * M, 0, 0.12 * M).rotateZ(0));
  a('wood_dark', box(0.9 * M, 0.04 * M, 0.04 * M, 0, 0.5 * M, 0.13 * M));
  a('wood_dark', box(0.04 * M, 1.3 * M, 0.04 * M, 0, 0, -0.2 * M).rotateX(0.18));
  a('wood_dark', box(bw + 0.06 * M, bh + 0.06 * M, 0.03 * M, 0, y0 - 0.03 * M, 0.0));
  a('straw', box(bw, bh, 0.01 * M, 0, y0, 0.02 * M));                                     // the cork
  a('sitemap', mapPlane(0.56 * M, 0.56 * M, -0.14 * M, y0 + 0.14 * M, 0.0261 * M));
  a('trim', box(0.28 * M, 0.34 * M, 0.004 * M, 0.34 * M, y0 + 0.34 * M, 0.026 * M));   // a printed checklist
  for (let i = 0; i < 6; i++) a('iron', box(0.2 * M, 0.008 * M, 0.005 * M, 0.34 * M, y0 + 0.62 * M - i * 0.045 * M, 0.0285 * M));
  a('paint_yellow', box(0.1 * M, 0.1 * M, 0.004 * M, 0.34 * M, y0 + 0.08 * M, 0.027 * M).rotateZ(0.1));
  a('paint_red', box(0.1 * M, 0.1 * M, 0.004 * M, -0.38 * M, y0 + 0.6 * M, 0.027 * M).rotateZ(-0.08));
  for (const [x, y] of [[-0.14, 0.14], [-0.14, 0.7], [0.34, 0.65]] as const) a('paint_red', cyl(0.012 * M, 0.01 * M, x * M, y0 + y * M, 0.03 * M, 6).rotateX(Math.PI / 2));
}

/** A window onto the gate from the guard room: a barred slot window in the room's wall (hung; layer 'decor'). */
export function gateWindow(a: Add): void {
  const w = 0.9 * M, h = 0.5 * M;
  a('iron', box(w + 0.1 * M, h + 0.1 * M, 0.03 * M, 0, 0, 0));
  a('glass', box(w, h, 0.012 * M, 0, 0.05 * M, 0.012 * M));
  for (let i = 1; i < 6; i++) a('iron', box(0.012 * M, h, 0.016 * M, -w / 2 + i * w / 6, 0.05 * M, 0.02 * M));
}

// ── Medical corner ───────────────────────────────────────────────────────

/** A hand-wash sink on a steel stand with a foot-pump tank, a sharps box, and wall-mounted glove / mask dispensers. */
export function scrubSink(a: Add): void {
  a('steel', box(0.6 * M, 0.9 * M, 0.45 * M, 0, 0, 0));
  a('enamel', box(0.5 * M, 0.04 * M, 0.35 * M, 0, 0.9 * M, 0));
  a('steel', cyl(0.015 * M, 0.25 * M, 0, 0.94 * M, -0.15 * M, 6));
  a('steel', box(0.015 * M, 0.015 * M, 0.12 * M, 0, 1.17 * M, -0.1 * M));
  a('blue_tank', cyl(0.12 * M, 0.3 * M, 0.5 * M, 0, 0, 10));
  a('paint_red', box(0.18 * M, 0.2 * M, 0.12 * M, -0.45 * M, 0.9 * M, 0));                 // sharps container
  a('paint_green', box(0.2 * M, 0.12 * M, 0.06 * M, 0.0, 1.25 * M, -0.2 * M));              // a soap / sanitizer pump
  a('trim', box(0.16 * M, 0.2 * M, 0.04 * M, -0.2 * M, 1.3 * M, -0.2 * M));                  // glove box
}

/** An exam light on a stand, a tray table of instruments and a folding stretcher against the wall. */
export function examGear(a: Add): void {
  a('steel', cyl(0.025 * M, 1.5 * M, 0, 0, 0, 8));
  a('iron', cyl(0.2 * M, 0.03 * M, 0, 0, 0, 12));
  a('steel', box(0.4 * M, 0.025 * M, 0.025 * M, 0.15 * M, 1.45 * M, 0));
  a('lamp', new THREE.CylinderGeometry(0.14 * M, 0.1 * M, 0.06 * M, 12).translate(0.32 * M, 1.4 * M, 0));
  // tray table
  a('steel', box(0.5 * M, 0.02 * M, 0.35 * M, 0.7 * M, 0.78 * M, 0));
  a('steel', box(0.02 * M, 0.78 * M, 0.02 * M, 0.7 * M, 0, 0));
  a('trim', box(0.2 * M, 0.01 * M, 0.1 * M, 0.62 * M, 0.8 * M, 0.02 * M));
  a('iron', box(0.12 * M, 0.01 * M, 0.02 * M, 0.78 * M, 0.8 * M, -0.05 * M));
}

/** A folded stretcher leaned against the wall with a blanket roll and a defibrillator case on a hook. */
export function stretcher(a: Add): void {
  a('paint_green', box(0.55 * M, 1.8 * M, 0.04 * M, 0, 0.1 * M, 0));
  for (const sx of [-1, 1]) a('steel', box(0.03 * M, 1.9 * M, 0.05 * M, sx * 0.28 * M, 0.05 * M, 0.01 * M));
  a('quilt_red', box(0.4 * M, 0.2 * M, 0.2 * M, 0, 0.0, 0.18 * M));
  a('paint_red', box(0.3 * M, 0.22 * M, 0.12 * M, 0, 1.0 * M, 0.06 * M));                    // AED case
  a('trim', box(0.12 * M, 0.03 * M, 0.004 * M, 0, 1.15 * M, 0.127 * M));
}
