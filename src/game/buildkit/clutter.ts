/**
 * Clutter — the slice-of-life layer that makes spaces look lived in (user:
 * "make sure there's clutter and slice of life stuff too"). Small props,
 * each built in its own frame on a surface at y = 0 (pass the surface
 * height in the placement), sizes in metres × M:
 *
 *  table / counter  mugs, plates, bowls, bread, fruit, a cutting board,
 *                   jars, candles, an open book, mail, a puzzle / checkers
 *  floor            boots, slippers, a laundry basket, toys, a dog bed and
 *                   dog, a sleeping cat, a guitar, a fishing rod
 *  walls            pictures, a calendar, a clock, kids' drawings, a rifle
 *                   on pegs, a towel on a hook
 *  outside          a woodpile under a tarp, chopping block with the axe in
 *                   it, laundry line, wheelbarrow, porch rockers, a kid's
 *                   bike, a dog house, washtub, buckets
 *
 * `scatter` picks from a list with a seeded random, so no two homes are
 * dressed alike.
 */
import * as THREE from 'three';
import type { KitMaterialId } from './materials';
import { M, type Add } from './interior';

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cyl = (r: number, h: number, x: number, y: number, z: number, seg = 10) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);

/** Seeded random (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable hash of a string (structure ids → clutter seeds). */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const CLOTH: KitMaterialId[] = ['quilt_red', 'quilt_blue', 'linen', 'paint_green', 'wood_dark'];

export const Clutter = {
  // ── On tables and counters ────────────────────────────────────────────
  mug(add: Add, mat: KitMaterialId = 'enamel'): void {
    add(mat, cyl(0.045 * M, 0.1 * M, 0, 0, 0, 10));
    add(mat, new THREE.TorusGeometry(0.03 * M, 0.008 * M, 5, 8).translate(0.055 * M, 0.05 * M, 0));
  },
  plate(add: Add, crumbs = true): void {
    add('crockery', cyl(0.12 * M, 0.015 * M, 0, 0, 0, 14));
    if (crumbs) { add('wood_mid', box(0.05 * M, 0.02 * M, 0.04 * M, 0.03 * M, 0.015 * M, 0.02 * M)); add('steel', box(0.18 * M, 0.005 * M, 0.015 * M, -0.02 * M, 0.017 * M, -0.05 * M).rotateY(0.4)); }
  },
  bowl(add: Add): void { add('crockery', new THREE.SphereGeometry(0.1 * M, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).rotateX(Math.PI).translate(0, 0.07 * M, 0)); },
  fruitBowl(add: Add): void {
    add('wood_mid', new THREE.SphereGeometry(0.14 * M, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).rotateX(Math.PI).translate(0, 0.08 * M, 0));
    const c: KitMaterialId[] = ['paint_red', 'paint_red', 'straw', 'paint_green', 'paint_red'];
    c.forEach((m, i) => add(m, new THREE.SphereGeometry(0.04 * M, 7, 5).translate(Math.cos(i * 1.3) * 0.06 * M, 0.08 * M + (i > 2 ? 0.04 * M : 0), Math.sin(i * 1.3) * 0.06 * M)));
  },
  bread(add: Add): void {
    add('wood_mid', box(0.4 * M, 0.025 * M, 0.25 * M, 0, 0, 0));
    add('straw', new THREE.CapsuleGeometry(0.06 * M, 0.16 * M, 4, 8).rotateZ(Math.PI / 2).scale(1, 0.75, 1).translate(-0.04 * M, 0.07 * M, 0));
    add('steel', box(0.22 * M, 0.006 * M, 0.025 * M, 0.08 * M, 0.03 * M, 0.08 * M).rotateY(-0.3));
  },
  cuttingBoard(add: Add): void {
    add('wood_mid', box(0.4 * M, 0.025 * M, 0.28 * M, 0, 0, 0));
    for (let i = 0; i < 4; i++) add(i % 2 ? 'paint_red' : 'crop', cyl(0.03 * M, 0.02 * M, -0.1 * M + i * 0.05 * M, 0.025 * M, 0.04 * M, 8));
    add('steel', box(0.2 * M, 0.005 * M, 0.03 * M, 0.08 * M, 0.026 * M, -0.06 * M));
  },
  jars(add: Add, n = 3): void { for (let i = 0; i < n; i++) add(i % 2 ? 'crockery' : 'glass', cyl(0.045 * M, (0.12 + (i % 3) * 0.04) * M, i * 0.1 * M, 0, (i % 2) * 0.04 * M, 8)); },
  candle(add: Add): void { add('iron', cyl(0.05 * M, 0.015 * M, 0, 0, 0, 8)); add('linen', cyl(0.02 * M, 0.12 * M, 0, 0.015 * M, 0, 8)); add('lamp', new THREE.SphereGeometry(0.012 * M, 6, 5).scale(1, 2, 1).translate(0, 0.15 * M, 0)); },
  openBook(add: Add): void {
    for (const s of [-1, 1]) add('linen', box(0.15 * M, 0.02 * M, 0.22 * M, s * 0.075 * M, 0, 0).rotateZ(s * -0.06));
    add('quilt_blue', box(0.32 * M, 0.008 * M, 0.23 * M, 0, -0.004 * M, 0));
  },
  bookStack(add: Add): void { const c: KitMaterialId[] = ['quilt_red', 'quilt_blue', 'wood_dark', 'paint_green']; c.forEach((m, i) => add(m, box(0.22 * M, 0.04 * M, 0.16 * M, (i % 2) * 0.015 * M, i * 0.04 * M, 0).rotateY(i * 0.15))); },
  mail(add: Add): void { for (let i = 0; i < 4; i++) add(i === 1 ? 'straw' : 'linen', box(0.22 * M, 0.004 * M, 0.11 * M, i * 0.02 * M, i * 0.004 * M, i * 0.015 * M).rotateY(i * 0.3 - 0.4)); },
  checkers(add: Add): void {
    add('wood_dark', box(0.4 * M, 0.02 * M, 0.4 * M, 0, 0, 0));
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) add('paint_red', box(0.05 * M, 0.003 * M, 0.05 * M, (i - 3.5) * 0.05 * M, 0.02 * M, (j - 3.5) * 0.05 * M));
    for (let k = 0; k < 9; k++) add(k % 2 ? 'linen' : 'iron', cyl(0.018 * M, 0.012 * M, ((k * 3) % 8 - 3.5) * 0.05 * M, 0.023 * M, ((k * 5) % 8 - 3.5) * 0.05 * M, 8));
  },
  crayons(add: Add): void {
    add('linen', box(0.3 * M, 0.003 * M, 0.21 * M, 0, 0, 0).rotateY(0.2));
    for (let i = 0; i < 5; i++) add(CLOTH[i], new THREE.CylinderGeometry(0.008 * M, 0.008 * M, 0.09 * M, 5).rotateZ(Math.PI / 2).rotateY(i * 0.7).translate(0.12 * M + i * 0.02 * M, 0.01 * M, 0.05 * M));
  },
  radio(add: Add): void { add('wood_dark', box(0.32 * M, 0.2 * M, 0.14 * M, 0, 0, 0)); add('linen', box(0.18 * M, 0.12 * M, 0.005 * M, -0.05 * M, 0.04 * M, 0.071 * M)); add('steel', cyl(0.02 * M, 0.02 * M, 0.1 * M, 0.08 * M, 0.072 * M, 8).rotateX(Math.PI / 2)); add('steel', box(0.005 * M, 0.45 * M, 0.005 * M, 0.12 * M, 0.2 * M, -0.04 * M).rotateZ(-0.3)); },
  dishes(add: Add): void { for (let i = 0; i < 4; i++) add('crockery', cyl(0.11 * M, 0.012 * M, 0, i * 0.014 * M, 0, 12).rotateX(0.15)); add('enamel', cyl(0.045 * M, 0.1 * M, 0.13 * M, 0, 0, 8)); },
  potOnStove(add: Add): void { add('iron', cyl(0.14 * M, 0.16 * M, 0, 0, 0, 12)); add('iron', box(0.18 * M, 0.02 * M, 0.025 * M, 0.2 * M, 0.12 * M, 0)); add('iron', cyl(0.145 * M, 0.015 * M, 0, 0.16 * M, 0, 12)); },
  herbsPot(add: Add): void { add('paint_red', new THREE.CylinderGeometry(0.07 * M, 0.05 * M, 0.11 * M, 8).translate(0, 0.055 * M, 0)); add('crop', new THREE.SphereGeometry(0.09 * M, 6, 5).scale(1, 0.8, 1).translate(0, 0.17 * M, 0)); },

  // ── On the floor ─────────────────────────────────────────────────────
  boots(add: Add, mat: KitMaterialId = 'wood_dark'): void {
    for (const s of [-1, 1]) {
      add(mat, box(0.1 * M, 0.08 * M, 0.28 * M, s * 0.07 * M, 0, 0.03 * M).rotateY(s * 0.1));
      add(mat, box(0.1 * M, 0.22 * M, 0.11 * M, s * 0.07 * M, 0.06 * M, -0.06 * M).rotateY(s * 0.1));
    }
  },
  laundryBasket(add: Add): void {
    add('straw', new THREE.CylinderGeometry(0.25 * M, 0.2 * M, 0.35 * M, 12, 1, true).translate(0, 0.175 * M, 0));
    add('straw', cyl(0.2 * M, 0.02 * M, 0, 0, 0, 12));
    for (let i = 0; i < 4; i++) add(CLOTH[i], new THREE.SphereGeometry(0.12 * M, 6, 4).scale(1.2, 0.5, 1).translate(Math.cos(i * 1.6) * 0.07 * M, 0.3 * M + i * 0.03 * M, Math.sin(i * 1.6) * 0.07 * M));
  },
  toys(add: Add): void {
    const c: KitMaterialId[] = ['paint_red', 'quilt_blue', 'straw', 'paint_green'];
    for (let i = 0; i < 6; i++) add(c[i % 4], box(0.06 * M, 0.06 * M, 0.06 * M, (i % 3) * 0.08 * M, Math.floor(i / 3) * 0.06 * M, (i % 2) * 0.03 * M).rotateY(i * 0.5));
    add('paint_red', box(0.22 * M, 0.08 * M, 0.11 * M, -0.25 * M, 0.04 * M, 0.1 * M));                  // toy truck
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('iron', new THREE.CylinderGeometry(0.03 * M, 0.03 * M, 0.02 * M, 8).rotateX(Math.PI / 2).translate(-0.25 * M + sx * 0.07 * M, 0.03 * M, 0.1 * M + sz * 0.06 * M));
    add('wood_mid', new THREE.SphereGeometry(0.1 * M, 8, 6).translate(0.1 * M, 0.1 * M, -0.25 * M));        // teddy
    add('wood_mid', new THREE.SphereGeometry(0.07 * M, 8, 6).translate(0.1 * M, 0.24 * M, -0.25 * M));
  },
  dogBed(add: Add, dog = true): void {
    add('quilt_red', new THREE.TorusGeometry(0.28 * M, 0.08 * M, 6, 14).rotateX(Math.PI / 2).translate(0, 0.08 * M, 0));
    add('linen', cyl(0.28 * M, 0.04 * M, 0, 0, 0, 14));
    if (!dog) return;
    add('wood_mid', new THREE.CapsuleGeometry(0.11 * M, 0.3 * M, 4, 8).rotateZ(Math.PI / 2).rotateY(0.6).translate(0, 0.14 * M, 0));   // curled-up dog
    add('wood_mid', new THREE.SphereGeometry(0.1 * M, 8, 6).translate(0.18 * M, 0.15 * M, 0.12 * M));
    add('wood_dark', new THREE.SphereGeometry(0.05 * M, 6, 5).scale(1.4, 0.6, 0.8).translate(0.22 * M, 0.22 * M, 0.08 * M));
  },
  cat(add: Add): void {
    add('wood_dark', new THREE.SphereGeometry(0.12 * M, 8, 6).scale(1.3, 0.7, 1).translate(0, 0.08 * M, 0));
    add('wood_dark', new THREE.SphereGeometry(0.06 * M, 8, 6).translate(0.12 * M, 0.1 * M, 0.04 * M));
    add('wood_dark', new THREE.TorusGeometry(0.12 * M, 0.02 * M, 5, 10, Math.PI).rotateX(Math.PI / 2).translate(-0.02 * M, 0.03 * M, 0));
  },
  guitar(add: Add): void {
    add('wood_mid', new THREE.CylinderGeometry(0.18 * M, 0.18 * M, 0.1 * M, 14).rotateX(Math.PI / 2).scale(1, 1.25, 1).translate(0, 0.22 * M, 0).rotateX(-0.25));
    add('wood_dark', box(0.05 * M, 0.55 * M, 0.03 * M, 0, 0.42 * M, 0.02 * M).rotateX(-0.25));
    add('iron', cyl(0.05 * M, 0.01 * M, 0, 0.22 * M, 0.06 * M, 10).rotateX(Math.PI / 2 - 0.25));
  },
  fishingRod(add: Add): void { add('steel', new THREE.CylinderGeometry(0.004 * M, 0.012 * M, 2.2 * M, 5).translate(0, 1.1 * M, 0).rotateX(-0.12)); add('iron', cyl(0.04 * M, 0.04 * M, 0, 0.35 * M, 0.06 * M, 8).rotateZ(Math.PI / 2)); },
  slippers(add: Add): void { for (const s of [-1, 1]) add('quilt_red', box(0.09 * M, 0.04 * M, 0.25 * M, s * 0.06 * M, 0, 0).rotateY(s * 0.25)); },

  // ── On walls (back at -z, hung at y) ─────────────────────────────────
  /** A framed picture on the wall (back at -z, bottom edge at y): painting, photo, poster or sampler. */
  picture(add: Add, w = 0.4, h = 0.3, art: KitMaterialId = 'art_mountains', frame: KitMaterialId = 'wood_dark'): void {
    const fw = 0.04;
    for (const [bw, bh, x, y] of [[w, fw, 0, 0], [w, fw, 0, h - fw], [fw, h, -w / 2 + fw / 2, 0], [fw, h, w / 2 - fw / 2, 0]] as const) add(frame, box(bw * M, bh * M, 0.03 * M, x * M, y * M, 0.015 * M));
    add('linen', box((w - 0.04) * M, (h - 0.04) * M, 0.006 * M, 0, 0.02 * M, 0.006 * M));
    add(art, artPlane((w - fw * 2 - 0.02) * M, (h - fw * 2 - 0.02) * M, 0, (h / 2) * M, 0.02 * M));
  },
  /** An unframed poster pinned to the wall. */
  poster(add: Add, w = 0.6, h = 0.8, art: KitMaterialId = 'poster_map'): void {
    add(art, artPlane(w * M, h * M, 0, (h / 2) * M, 0.004 * M));
    for (const sx of [-1, 1]) for (const sy of [0, 1]) add('paint_red', cyl(0.012 * M, 0.01 * M, sx * (w / 2 - 0.03) * M, (sy ? h - 0.03 : 0.03) * M, 0.006 * M, 6).rotateX(Math.PI / 2));
  },
  /** A few standing photo frames (on a shelf, mantel, dresser or nightstand top). */
  photoFrames(add: Add): void {
    const items: Array<[KitMaterialId, number, number, number, number]> = [['photo_family', 0.2, 0.25, -0.15, 0.15], ['photo_couple', 0.15, 0.2, 0.08, -0.2], ['photo_family', 0.13, 0.17, 0.25, 0.3]];
    for (const [art, w, h, x, r] of items) {
      const g: THREE.BufferGeometry[] = [];
      g.push(box(w * M, h * M, 0.02 * M, 0, 0, 0));
      for (const geo of g) add('wood_dark', geo.rotateX(-0.12).rotateY(r).translate(x * M, 0, 0));
      add(art, artPlane((w - 0.04) * M, (h - 0.04) * M, 0, (h / 2) * M, 0.011 * M).rotateX(-0.12).rotateY(r).translate(x * M, 0, 0));
    }
  },
  /** Mule-deer antlers on a wooden plaque. */
  antlers(add: Add): void {
    add('wood_dark', new THREE.CylinderGeometry(0.12 * M, 0.12 * M, 0.03 * M, 10).rotateX(Math.PI / 2).translate(0, 0, 0.015 * M));
    for (const s of [-1, 1]) {
      add('linen', new THREE.CylinderGeometry(0.012 * M, 0.02 * M, 0.45 * M, 5).rotateZ(s * -0.8).translate(s * 0.15 * M, 0.15 * M, 0.06 * M));
      for (let k = 0; k < 3; k++) add('linen', new THREE.CylinderGeometry(0.008 * M, 0.012 * M, 0.2 * M, 4).rotateZ(s * (-0.2 + k * 0.2)).translate(s * (0.12 + k * 0.08) * M, (0.28 + k * 0.05) * M, 0.06 * M));
    }
  },
  /** Evergreen wreath with a red bow. */
  wreath(add: Add): void {
    add('hedge', new THREE.TorusGeometry(0.2 * M, 0.06 * M, 6, 14).translate(0, 0, 0.04 * M));
    add('hedge_berry', box(0.12 * M, 0.08 * M, 0.04 * M, 0, -0.24 * M, 0.08 * M));
  },
  /** A vase of wildflowers (on a table or sill). */
  vaseFlowers(add: Add): void {
    add('crockery', new THREE.CylinderGeometry(0.05 * M, 0.07 * M, 0.2 * M, 10).translate(0, 0.1 * M, 0));
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9, lean = 0.12 + (i % 3) * 0.06;
      add('crop', new THREE.CylinderGeometry(0.004 * M, 0.004 * M, 0.25 * M, 4).rotateZ(lean).rotateY(a).translate(0, 0.3 * M, 0));
      add(i % 2 ? 'flowers' : 'hedge_berry', new THREE.SphereGeometry(0.03 * M, 6, 4).translate(Math.cos(a) * lean * 0.25 * M, 0.43 * M, Math.sin(a) * lean * 0.25 * M));
    }
  },
  /** A patchwork quilt hung on a rod (back at -z). */
  wallQuilt(add: Add, mat: KitMaterialId = 'quilt_red'): void {
    add('wood_dark', new THREE.CylinderGeometry(0.02 * M, 0.02 * M, 1.5 * M, 6).rotateZ(Math.PI / 2).translate(0, 1.4 * M, 0.04 * M));
    add(mat, box(1.4 * M, 1.4 * M, 0.02 * M, 0, 0, 0.03 * M));
  },
  /** A big houseplant in a clay pot (floor). */
  plant(add: Add): void {
    add('paint_red', new THREE.CylinderGeometry(0.18 * M, 0.13 * M, 0.35 * M, 10).translate(0, 0.175 * M, 0));
    add('soil', cyl(0.17 * M, 0.02 * M, 0, 0.33 * M, 0, 10));
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7, h = 0.5 + (i % 3) * 0.25;
      add('crop', new THREE.SphereGeometry(0.16 * M, 6, 4).scale(1, 0.45, 0.7).rotateZ(0.5).rotateY(a).translate(Math.cos(a) * 0.15 * M, (0.35 + h) * M, Math.sin(a) * 0.15 * M));
    }
    add('wood_mid', new THREE.CylinderGeometry(0.015 * M, 0.02 * M, 0.9 * M, 5).translate(0, 0.78 * M, 0));
  },
  calendar(add: Add): void { add('linen', box(0.3 * M, 0.42 * M, 0.005 * M, 0, 0, 0)); add('paint_red', box(0.3 * M, 0.08 * M, 0.006 * M, 0, 0.34 * M, 0)); for (let i = 0; i < 4; i++) add('iron', box(0.24 * M, 0.004 * M, 0.007 * M, 0, (0.05 + i * 0.06) * M, 0)); },
  clock(add: Add): void { add('wood_dark', new THREE.CylinderGeometry(0.16 * M, 0.16 * M, 0.04 * M, 16).rotateX(Math.PI / 2)); add('linen', new THREE.CircleGeometry(0.13 * M, 16).translate(0, 0, 0.021 * M)); add('iron', box(0.012 * M, 0.1 * M, 0.004 * M, 0, 0.04 * M, 0.024 * M)); add('iron', box(0.07 * M, 0.012 * M, 0.004 * M, 0.03 * M, 0, 0.024 * M)); },
  drawings(add: Add): void { const c: KitMaterialId[] = ['linen', 'straw', 'linen']; c.forEach((m, i) => { add(m, box(0.21 * M, 0.28 * M, 0.004 * M, (i - 1) * 0.25 * M, (i % 2) * 0.05 * M, 0).rotateZ((i - 1) * 0.06)); add(CLOTH[i], box(0.1 * M, 0.08 * M, 0.005 * M, (i - 1) * 0.25 * M, 0.08 * M + (i % 2) * 0.05 * M, 0.002 * M)); }); },
  riflePegs(add: Add): void {
    for (const s of [-1, 1]) add('wood_dark', box(0.04 * M, 0.06 * M, 0.1 * M, s * 0.35 * M, 0, 0.04 * M));
    add('wood_mid', box(0.95 * M, 0.04 * M, 0.04 * M, 0, 0.06 * M, 0.06 * M));
    add('iron', new THREE.CylinderGeometry(0.012 * M, 0.012 * M, 0.55 * M, 6).rotateZ(Math.PI / 2).translate(0.25 * M, 0.09 * M, 0.06 * M));
  },
  towel(add: Add, mat: KitMaterialId = 'quilt_blue'): void { add('iron', box(0.5 * M, 0.03 * M, 0.06 * M, 0, 0, 0.03 * M)); add(mat, box(0.4 * M, 0.55 * M, 0.02 * M, 0, -0.55 * M, 0.06 * M)); },

  // ── Draped on furniture ──────────────────────────────────────────────
  /** A jacket over a chair back (place at the chair, y = floor; faces like the chair). */
  jacketOnChair(add: Add, mat: KitMaterialId = 'quilt_red'): void {
    add(mat, box(0.42 * M, 0.5 * M, 0.06 * M, 0, 0.55 * M, -0.2 * M));
    add(mat, box(0.42 * M, 0.04 * M, 0.12 * M, 0, 1.03 * M, -0.2 * M));
  },
  /** Rumpled quilt and a thrown-back corner on a bed (place at the bed centre, y = mattress top). */
  rumple(add: Add, mat: KitMaterialId = 'quilt_red'): void {
    add(mat, new THREE.SphereGeometry(0.3 * M, 8, 5).scale(1.4, 0.25, 0.9).translate(0.1 * M, 0.02 * M, -0.1 * M));
    add('linen', new THREE.SphereGeometry(0.18 * M, 7, 5).scale(1.2, 0.5, 0.8).translate(-0.25 * M, 0.04 * M, 0.3 * M));
  },

  // ── Outside ───────────────────────────────────────────────────────────
  /** Split firewood stacked between end posts, len (m), with a tarp over the top. */
  woodpile(add: Add, lm = 2.5, hm = 1.2): void {
    const l = lm * M, h = hm * M, d = 0.45 * M;
    for (const s of [-1, 1]) add('wood_dark', box(0.08 * M, h + 0.1 * M, 0.08 * M, s * l / 2, 0, 0));
    add('log_end', box(l - 0.1 * M, h, d, 0, 0, 0));
    for (let i = 0; i < Math.floor(lm / 0.13); i++) for (let k = 0; k < Math.floor(hm / 0.13); k++) add('wood_mid', new THREE.CircleGeometry(0.055 * M, 5).translate(-l / 2 + 0.1 * M + i * 0.13 * M + (k % 2) * 0.06 * M, 0.07 * M + k * 0.13 * M, d / 2 + 0.002 * M));
    add('quilt_blue', box(l + 0.1 * M, 0.02 * M, d + 0.2 * M, 0, h, 0));
  },
  choppingBlock(add: Add): void {
    add('log_end', cyl(0.25 * M, 0.5 * M, 0, 0, 0, 12));
    add('wood_mid', box(0.05 * M, 0.75 * M, 0.04 * M, 0.08 * M, 0.5 * M, 0).rotateZ(0.5));
    add('steel', box(0.08 * M, 0.06 * M, 0.2 * M, 0.02 * M, 0.47 * M, 0));
    for (let i = 0; i < 5; i++) add('wood_mid', box(0.1 * M, 0.08 * M, 0.35 * M, Math.cos(i * 1.4) * 0.45 * M, 0, Math.sin(i * 1.4) * 0.45 * M).rotateY(i));
  },
  laundryLine(add: Add, lm = 4.0): void {
    const l = lm * M;
    for (const s of [-1, 1]) { add('wood_dark', box(0.08 * M, 1.9 * M, 0.08 * M, s * l / 2, 0, 0)); add('wood_dark', box(0.08 * M, 0.06 * M, 0.6 * M, s * l / 2, 1.8 * M, 0)); }
    for (const z of [-0.2, 0.2]) add('linen', box(l, 0.008 * M, 0.008 * M, 0, 1.82 * M, z * M));
    const items: Array<[KitMaterialId, number, number]> = [['linen', 0.9, 1.1], ['quilt_blue', 0.5, 0.7], ['quilt_red', 0.45, 0.6], ['linen', 0.4, 0.5], ['paint_green', 0.5, 0.65]];
    let x = -l / 2 + 0.3 * M;
    items.forEach(([m, w, h], i) => { add(m, box(w * M, h * M, 0.01 * M, x + w * M / 2, (1.82 - h) * M, (i % 2 ? 0.2 : -0.2) * M)); x += (w + 0.15) * M; });
  },
  wheelbarrow(add: Add): void {
    add('paint_green', new THREE.CylinderGeometry(0.45 * M, 0.3 * M, 0.35 * M, 4, 1, true).rotateY(Math.PI / 4).scale(1, 1, 1.4).translate(0, 0.5 * M, 0));
    add('soil', box(0.55 * M, 0.04 * M, 0.75 * M, 0, 0.6 * M, 0));
    add('iron', new THREE.CylinderGeometry(0.18 * M, 0.18 * M, 0.08 * M, 10).rotateZ(Math.PI / 2).translate(0, 0.18 * M, 0.6 * M));
    for (const s of [-1, 1]) add('wood_mid', box(0.04 * M, 0.04 * M, 1.4 * M, s * 0.25 * M, 0.38 * M, -0.1 * M).rotateX(0.15));
  },
  rocker(add: Add): void {
    for (const s of [-1, 1]) add('wood_dark', new THREE.TorusGeometry(0.5 * M, 0.025 * M, 4, 12, 1.2).rotateY(Math.PI / 2).rotateX(0.0).translate(s * 0.22 * M, 0.52 * M, 0).rotateZ(Math.PI));
    add('wood_mid', box(0.5 * M, 0.04 * M, 0.45 * M, 0, 0.42 * M, 0));
    add('wood_mid', box(0.5 * M, 0.6 * M, 0.04 * M, 0, 0.45 * M, -0.22 * M).rotateX(-0.15));
    for (const s of [-1, 1]) add('wood_dark', box(0.04 * M, 0.42 * M, 0.04 * M, s * 0.22 * M, 0.06 * M, 0.15 * M));
  },
  bike(add: Add): void {
    for (const z of [-0.35, 0.35]) add('iron', new THREE.TorusGeometry(0.22 * M, 0.025 * M, 5, 16).rotateY(Math.PI / 2).translate(0, 0.22 * M, z * M));
    add('paint_red', box(0.03 * M, 0.03 * M, 0.7 * M, 0, 0.42 * M, 0));
    add('paint_red', box(0.03 * M, 0.25 * M, 0.03 * M, 0, 0.22 * M, -0.1 * M));
    add('iron', box(0.4 * M, 0.03 * M, 0.03 * M, 0, 0.62 * M, 0.3 * M));
    add('iron', box(0.12 * M, 0.04 * M, 0.2 * M, 0, 0.5 * M, -0.12 * M));
  },
  dogHouse(add: Add): void {
    add('paint_red', box(0.8 * M, 0.6 * M, 0.9 * M, 0, 0, 0));
    for (const s of [-1, 1]) add('metal_roof', box(0.55 * M, 0.03 * M, 1.0 * M, s * 0.2 * M, 0.72 * M, 0).rotateZ(s * -0.6).translate(0, 0, 0));
    add('cutcap', box(0.3 * M, 0.38 * M, 0.01 * M, 0, 0.02 * M, 0.455 * M));
    add('steel', cyl(0.12 * M, 0.08 * M, 0.35 * M, 0, 0.7 * M, 10));
  },
  washtub(add: Add): void { add('steel', new THREE.CylinderGeometry(0.35 * M, 0.3 * M, 0.3 * M, 14, 1, true).translate(0, 0.15 * M, 0)); add('steel', cyl(0.3 * M, 0.01 * M, 0, 0, 0, 14)); add('wood_mid', box(0.4 * M, 0.5 * M, 0.03 * M, 0.25 * M, 0.05 * M, 0.2 * M).rotateZ(0.3)); },
  bucket(add: Add): void { add('steel', new THREE.CylinderGeometry(0.14 * M, 0.11 * M, 0.3 * M, 10, 1, true).translate(0, 0.15 * M, 0)); add('steel', cyl(0.11 * M, 0.01 * M, 0, 0, 0, 10)); add('steel', new THREE.TorusGeometry(0.14 * M, 0.006 * M, 4, 10, Math.PI).translate(0, 0.3 * M, 0)); },
  gardenTools(add: Add): void { for (let i = 0; i < 3; i++) { add('wood_mid', box(0.035 * M, 1.4 * M, 0.035 * M, i * 0.12 * M, 0, 0).rotateZ(0.18 + i * 0.04)); add('steel', box(0.18 * M, 0.2 * M, 0.02 * M, i * 0.12 * M - 0.02 * M, 0, 0.0)); } },
  broom(add: Add): void { add('wood_mid', box(0.03 * M, 1.3 * M, 0.03 * M, 0, 0.25 * M, 0).rotateZ(0.12)); add('straw', new THREE.ConeGeometry(0.14 * M, 0.3 * M, 8).scale(1, 1, 0.4).translate(0, 0.15 * M, 0)); },
  sawhorsesProject(add: Add): void {
    for (const s of [-1, 1]) { add('wood_mid', box(0.06 * M, 0.06 * M, 0.6 * M, s * 0.5 * M, 0.7 * M, 0)); for (const z of [-1, 1]) add('wood_mid', box(0.05 * M, 0.75 * M, 0.05 * M, s * 0.5 * M, 0, z * 0.22 * M).rotateX(z * 0.2)); }
    add('frame', box(1.6 * M, 0.04 * M, 0.3 * M, 0, 0.76 * M, 0));
    add('frame', box(0.45 * M, 0.04 * M, 0.45 * M, 0.3 * M, 0.8 * M, 0.05 * M));
    add('straw', box(0.6 * M, 0.01 * M, 0.5 * M, 0.1 * M, 0, 0.3 * M));                                    // sawdust
  },
} as const;

/** A flat image plane (its own 0–1 UVs, not world-scaled) facing +z, centred at (x, y, z). */
function artPlane(w: number, h: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h).translate(x, y, z);
  g.userData.keepUV = true;
  return g;
}

/** Pick `n` distinct entries from a list with a seeded random. */
export function pick<T>(r: () => number, list: readonly T[], n: number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, Math.min(n, a.length));
}
