/**
 * The cosy decor pieces (procedural, SCALE v2, sizes in meters × M). Each is built in its own frame with its base on y = 0;
 * a wall piece has its back on z = 0 and reaches into the room along +z. buildkit/cozyDress.ts places them.
 */
import * as THREE from 'three';
import { M, pipe, type Add } from './interior';
import type { KitMaterialId } from './materials';

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cyl = (r: number, h: number, x: number, y: number, z: number, seg = 10) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);

export const CozyKit = {
  /** A throw pillow standing on a seat, leaning back (the bottom edge on the seat at the origin, leaning toward -z). */
  pillow(add: Add, mat: KitMaterialId = 'quilt_red', size = 0.4): void {
    add(mat, box(size * M, size * 0.92 * M, 0.12 * M, 0, 0, 0).rotateX(-0.27));
  },

  /** A wool throw over the back of an armchair (Furniture.armchair's frame): a fold over the top and a drape down its face. */
  throwOnArmchair(add: Add, mat: KitMaterialId = 'wool_grey'): void {
    add(mat, box(0.42 * M, 0.025 * M, 0.26 * M, 0.1 * M, 0.79 * M, -0.3 * M));
    add(mat, box(0.42 * M, 0.5 * M, 0.02 * M, 0.1 * M, 0.3 * M, -0.222 * M));
    add(mat, box(0.42 * M, 0.025 * M, 0.04 * M, 0.1 * M, 0.275 * M, -0.222 * M));
  },

  /** A kettle on the stove (base on the stove top): body, lid, spout and a bail handle. */
  kettle(add: Add): void {
    add('crockery', new THREE.CylinderGeometry(0.085 * M, 0.11 * M, 0.13 * M, 12).translate(0, 0.065 * M, 0));
    add('crockery', cyl(0.06 * M, 0.02 * M, 0, 0.13 * M, 0, 10));
    add('iron', new THREE.SphereGeometry(0.014 * M, 6, 4).translate(0, 0.16 * M, 0));
    add('crockery', pipe([0.09 * M, 0.07 * M, 0], [0.19 * M, 0.15 * M, 0], 0.018 * M, 6));
    add('iron', new THREE.TorusGeometry(0.075 * M, 0.008 * M, 4, 10, Math.PI).rotateY(Math.PI / 2).translate(0, 0.13 * M, 0));
  },

  /** A rod on two brackets with bundles of herbs hung to dry (wall frame). */
  herbRack(add: Add, lengthM = 0.9, dry = true): void {
    const L = lengthM * M, n = Math.max(3, Math.round(lengthM / 0.16));
    for (const sx of [-1, 1]) add('iron', box(0.02 * M, 0.03 * M, 0.12 * M, sx * (L / 2 - 0.04 * M), -0.015 * M, 0.06 * M));
    add('wood_dark', pipe([-L / 2, 0, 0.1 * M], [L / 2, 0, 0.1 * M], 0.012 * M, 6));
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.08 * M + i * (L - 0.16 * M) / (n - 1), h = (0.17 + (i % 3) * 0.03) * M;
      add(i % 2 === 0 && dry ? 'herb_dry' : 'herb_green', new THREE.ConeGeometry(0.04 * M, h, 7).translate(x, -h / 2, 0.1 * M));
      add('straw', cyl(0.006 * M, 0.025 * M, x, -0.012 * M, 0.1 * M, 5));
    }
  },

  /** A braid of garlic on a peg (wall frame). */
  garlicBraid(add: Add): void {
    add('iron', box(0.014 * M, 0.014 * M, 0.07 * M, 0, -0.007 * M, 0.035 * M));
    add('straw', cyl(0.008 * M, 0.06 * M, 0, -0.06 * M, 0.06 * M, 5));
    for (let i = 0; i < 6; i++) add('garlic', new THREE.SphereGeometry(0.034 * M, 7, 5).translate((i % 2 ? 1 : -1) * 0.012 * M, (-0.085 - i * 0.05) * M, 0.06 * M));
  },

  /** A window sill: a board on the inside of the wall under a window (wall frame, back at z = 0, centred on the window). */
  sillBoard(add: Add, w: number): void {
    add('trim', box(w, 0.008, 0.034, 0, -0.008, 0.017));
  },

  /** A small clay pot with a herb or flowers, for a sill. */
  sillPot(add: Add): void {
    add('paint_red', new THREE.CylinderGeometry(0.04 * M, 0.03 * M, 0.06 * M, 8).translate(0, 0.03 * M, 0));
    add('soil', cyl(0.038 * M, 0.006 * M, 0, 0.06 * M, 0, 8));
    for (let i = 0; i < 4; i++) add('herb_green', new THREE.SphereGeometry(0.035 * M, 6, 4).scale(1, 0.8, 1).translate(Math.cos(i * 1.6) * 0.025 * M, (0.09 + (i % 2) * 0.03) * M, Math.sin(i * 1.6) * 0.025 * M));
  },

  /** A few jars of preserves (peaches, pickles, jam), tinted. */
  preserves(add: Add, n = 3): void {
    const tints: KitMaterialId[] = ['paint_yellow', 'paint_red', 'herb_green'];
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.095 * M, h = (0.12 + (i % 2) * 0.03) * M;
      add('glass', cyl(0.04 * M, h, x, 0, 0, 8));
      add(tints[i % 3], cyl(0.034 * M, h * 0.72, x, 0.005 * M, 0, 8));
      add('iron', cyl(0.042 * M, 0.012 * M, x, h, 0, 8));
    }
  },

  /** A smaller rag rug laid over a bigger one, turned a little (the caller sets the angle). */
  rugLayer(add: Add, wm: number, dm: number, mat: KitMaterialId = 'quilt_blue'): void {
    add(mat, box(wm * M, 0.006 * M, dm * M, 0, 0, 0));
  },
} as const;
