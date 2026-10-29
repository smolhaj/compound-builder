/**
 * Farm & kitchen part 2 (docs/DECISIONS.md): the apiary (four hives behind a bear fence), the sugar shack
 * (evaporator house and a stand of maples with buckets) and the barnyard (loafing shed, fenced yard, trough, hay
 * rack, cows, goats and pigs). Procedural, layered for construction (shell.ts Parts). SCALE v2: 1 unit ≈ 6 m
 * (M = 1 m), a person ≈ 0.28 tall.
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { M } from './interior';
import { box, Parts } from './shell';
import type { KitMaterialId } from './materials';

const cylY = (r: number, h: number, x: number, y: number, z: number, seg = 8) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);
const ball = (r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 7) => new THREE.SphereGeometry(r, seg, Math.max(3, seg - 2)).scale(sx, sy, sz).translate(x, y, z);
const hash = (a: number, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
type Add = (m: KitMaterialId, g: THREE.BufferGeometry) => void;

// ────────────────────────────────────────────────────
// Apiary: four Langstroth hives on stands behind a bear fence
// ────────────────────────────────────────────────────

function apiary(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = def.cellsX * CELL, D = def.cellsZ * CELL, hw = W / 2 - 0.05, hd = D / 2 - 0.05;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * hw, -0.02, sz * hd));
  // foundation: a gravel pad and the cinder-block hive stands
  p.layer = 'foundation';
  p.add('gravel', box(W - 0.08, 0.008, D - 0.08, 0, -0.003, 0));
  const hives: Array<[number, number]> = [[-0.17, -0.1], [0.17, -0.1], [-0.17, 0.12], [0.17, 0.12]];
  for (const [x, z] of hives) {
    p.add('concrete', box(0.1, 0.03, 0.09, x, 0, z));
    p.add('wood_mid', box(0.1, 0.008, 0.1, x, 0.03, z));
  }
  // frame: the hive bodies (two deeps, a honey super on the strong ones)
  p.layer = 'frame';
  hives.forEach(([x, z], i) => {
    const boxes = 2 + (i % 2);
    for (let k = 0; k < boxes; k++) p.add('hive_white', box(0.085, 0.034, 0.1, x, 0.038 + k * 0.035, z));
  });
  // roof: telescoping lids with a brick on top
  p.layer = 'roof';
  hives.forEach(([x, z], i) => {
    const top = 0.038 + (2 + (i % 2)) * 0.035;
    p.add('metal_roof', box(0.098, 0.01, 0.112, x, top, z));
    p.add('fieldstone', box(0.03, 0.012, 0.02, x + 0.01, top + 0.01, z - 0.01));
  });
  // walls: the electric bear fence (posts, three strands, a gate at the front)
  p.layer = 'walls';
  const runs: Array<[number, number, number, number]> = [[-hw, -hd, hw, -hd], [-hw, -hd, -hw, hd], [hw, -hd, hw, hd], [-hw, hd, hw, hd]];
  for (const [ax, az, bx, bz] of runs) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(L / 0.16)), a = -Math.atan2(bz - az, bx - ax);
    for (let k = 0; k <= n; k++) p.add('wood_dark', box(0.01, 0.1, 0.01, ax + (bx - ax) * k / n, 0, az + (bz - az) * k / n));
    for (const y of [0.025, 0.055, 0.085]) p.add('steel', box(L, 0.0025, 0.0025, 0, y, 0).rotateY(a).translate((ax + bx) / 2, 0, (az + bz) / 2));
  }
  p.add('steel', box(0.04, 0.05, 0.03, hw - 0.02, 0.03, -hd + 0.03));        // the charger
  // openings: the entrances, with the bees at them
  p.layer = 'openings';
  hives.forEach(([x, z]) => {
    p.add('wood_dark', box(0.05, 0.005, 0.004, x, 0.036, z + 0.052));
    p.add('wood_mid', box(0.06, 0.004, 0.025, x, 0.032, z + 0.063));            // the landing board
  });
  // interior: frames of comb inside the supers (seen in the cutaway) and the bees on the landing boards
  p.layer = 'interior';
  hives.forEach(([x, z], i) => {
    for (let k = 0; k < 5; k++) p.add('bee_gold', box(0.006, 0.026, 0.085, x - 0.034 + k * 0.017, 0.074 + (i % 2) * 0.035, z));
  });
  p.layer = 'decor';
  hives.forEach(([x, z], i) => {
    for (let k = 0; k < 7; k++) p.add('bee_gold', ball(0.0035, x + (hash(i, k) - 0.5) * 0.07, 0.04 + hash(k, i) * 0.06, z + 0.06 + hash(i + 3, k) * 0.05, 1.3, 0.8, 1, 4));
  });
  // a work bench with the smoker and a honey bucket, and a strip of flowers for the bees
  p.add('wood_mid', box(0.12, 0.05, 0.05, -0.02, 0, hd - 0.05));
  p.add('steel', cylY(0.012, 0.03, 0.03, 0.05, hd - 0.05));
  p.add('steel', cylY(0.016, 0.03, -0.06, 0.05, hd - 0.05));
  for (let k = 0; k < 9; k++) p.add('flowers', ball(0.012, -hw + 0.04 + k * 0.025, 0.03, -hd + 0.04, 1, 1, 1, 4));
  p.collide({ x0: -hw, z0: -hd, x1: hw, z1: -hd + 0.01 }, { x0: -hw, z0: -hd, x1: -hw + 0.01, z1: hd }, { x0: hw - 0.01, z0: -hd, x1: hw, z1: hd }, { x0: -0.2, z0: hd - 0.07, x1: 0.1, z1: hd - 0.02 });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'roof', 'walls'];
  return g;
}

// ────────────────────────────────────────────────────
// Sugar shack and the sugar bush
// ────────────────────────────────────────────────────

function sugarShack(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  const sw = 0.5, sd = 0.4, sz = -D / 2 + sd / 2 + 0.06;               // the shack at the back of the lot
  p.layer = 'stakes';
  for (const [x, z] of [[-W / 2 + 0.04, -D / 2 + 0.04], [W / 2 - 0.04, -D / 2 + 0.04], [-W / 2 + 0.04, D / 2 - 0.04], [W / 2 - 0.04, D / 2 - 0.04]]) p.add('trim', box(0.012, 0.09, 0.012, x, -0.02, z));
  p.layer = 'foundation';
  p.add('concrete', box(sw + 0.04, 0.03, sd + 0.04, 0, -0.005, sz));
  p.add('fieldstone', box(0.14, 0.04, 0.2, 0, 0.02, sz - 0.02));            // the arch's firebox pad
  // frame: posts and plates, a loft of cordwood stacked along the east wall
  p.layer = 'frame';
  for (const sx of [-1, 1]) for (const zz of [-1, 1]) p.add('wood_mid', box(0.022, 0.26, 0.022, sx * sw / 2, 0.03, sz + zz * sd / 2));
  for (const zz of [-1, 1]) p.add('wood_mid', box(sw + 0.03, 0.02, 0.022, 0, 0.29, sz + zz * sd / 2));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) p.add('wood_mid', new THREE.CylinderGeometry(0.014, 0.014, 0.1, 6).rotateZ(Math.PI / 2).translate(sw / 2 + 0.1, 0.02 + i * 0.026, sz - 0.14 + j * 0.056));
  p.layer = 'roof';
  const pitch = 0.5;
  for (const sgn of [-1, 1]) p.add('metal_roof', box(sw / 2 + 0.06, 0.012, sd + 0.1, 0, 0, 0).rotateZ(sgn * pitch).translate(sgn * (sw / 4 + 0.01), 0.36, sz));
  p.add('metal_roof', box(0.1, 0.1, 0.1, 0, 0.38, sz));                    // the cupola that lets the steam out
  p.layer = 'walls';
  p.add('board_batten', box(sw, 0.26, 0.012, 0, 0.03, sz - sd / 2));
  for (const sx of [-1, 1]) p.add('board_batten', box(0.012, 0.26, sd, sx * sw / 2, 0.03, sz));
  p.add('board_batten', box(sw * 0.3, 0.26, 0.012, -sw * 0.35, 0.03, sz + sd / 2));
  p.add('board_batten', box(sw * 0.3, 0.26, 0.012, sw * 0.35, 0.03, sz + sd / 2));
  p.layer = 'openings';
  p.add('wood_dark', box(sw * 0.34, 0.2, 0.01, 0, 0.04, sz + sd / 2));        // the big door, open to the sugar-house light
  p.layer = 'chimney';
  p.add('iron', cylY(0.016, 0.22, 0.05, 0.3, sz - 0.04, 8));
  // interior: the evaporator arch and its pans, the sap tank, the finishing pot
  p.layer = 'interior';
  p.add('steel', box(0.22, 0.06, 0.1, 0, 0.05, sz - 0.02));
  p.add('hive_white', box(0.2, 0.012, 0.085, 0, 0.11, sz - 0.02));
  p.add('bee_gold', box(0.18, 0.004, 0.07, 0, 0.123, sz - 0.02));              // the syrup in the pan
  p.add('blue_tank', cylY(0.05, 0.1, -0.17, 0.0, sz + 0.02, 10));
  p.add('steel', cylY(0.02, 0.04, 0.17, 0.0, sz + 0.05, 8));
  // decor and the bush: sap buckets on the maples
  p.layer = 'decor';
  const trees: Array<[number, number]> = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) trees.push([-W / 2 + 0.2 + c * (W - 0.4) / 3 + (hash(r, c) - 0.5) * 0.08, -D / 2 + 0.55 + r * 0.32 + (hash(c, r) - 0.5) * 0.06]);
  for (const [x, z] of trees) {
    const h = (0.9 + 0.5 * hash(x * 10, z * 10)) * M * 2.2;
    p.add('wood_dark', cylY(0.05 * M, h, x, 0, z, 6));
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + hash(x, z) * 2;
      p.add('wood_dark', new THREE.CylinderGeometry(0.012 * M, 0.025 * M, 0.5 * M * 2, 4).rotateZ(Math.PI / 2 - 0.6).rotateY(a).translate(x + Math.cos(a) * 0.04, h * 0.9, z - Math.sin(a) * 0.04));
    }
    p.add('steel', cylY(0.016, 0.026, x + 0.012, 0.075, z + 0.012, 8));         // the bucket on its spile
    p.add('steel', cylY(0.017, 0.004, x + 0.012, 0.101, z + 0.012, 8));
  }
  p.add('wood_mid', box(0.2, 0.012, 0.08, W / 2 - 0.14, 0.012, D / 2 - 0.14));  // the gathering sled
  p.add('blue_tank', cylY(0.03, 0.05, W / 2 - 0.2, 0.025, D / 2 - 0.12, 8));
  p.collide({ x0: -sw / 2, z0: sz - sd / 2, x1: sw / 2, z1: sz + sd / 2 }, { x0: sw / 2, z0: sz - 0.16, x1: sw / 2 + 0.16, z1: sz + 0.18 }, { x0: W / 2 - 0.24, z0: D / 2 - 0.2, x1: W / 2 - 0.04, z1: D / 2 - 0.06 }, { x0: -0.02, z0: -0.02, x1: 0.02, z1: 0.02 });
  const g = p.finish();
  g.userData.chimneyTop = new THREE.Vector3(0.05, 0.54, sz - 0.04);
  g.userData.keep = ['frame', 'roof', 'walls'];
  return g;
}

// ────────────────────────────────────────────────────
// Barnyard: loafing shed, fenced yard, trough, hay rack; a cow, goats and pigs
// ────────────────────────────────────────────────────

/** A cow standing along local +x at (x, z), turned by `a` (Jersey tan, or a black-and-white Holstein). */
function cowGeo(add: Add, x: number, z: number, a: number, black: boolean, grazing: boolean): void {
  const T = (g: THREE.BufferGeometry) => g.rotateY(-a).translate(x, 0, z);
  const hide: KitMaterialId = black ? 'hide_black' : 'hide_tan';
  add(hide, T(box(0.5 * M * 2, 0.48 * M * 2, 0.34 * M * 2, 0, 0.5 * M * 2, 0)));
  if (black) add('sheepwool', T(box(0.24 * M * 2, 0.34 * M * 2, 0.36 * M * 2, 0.06 * M * 2, 0.52 * M * 2, 0)));
  add(hide, T(box(0.2 * M * 2, 0.22 * M * 2, 0.2 * M * 2, 0.36 * M * 2, grazing ? 0.4 * M * 2 : 0.7 * M * 2, 0).rotateZ(grazing ? -0.5 : 0)));
  add('hide_pink', T(box(0.07 * M * 2, 0.08 * M * 2, 0.15 * M * 2, 0.5 * M * 2, grazing ? 0.34 * M * 2 : 0.62 * M * 2, 0)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('wood_dark', T(box(0.06 * M * 2, 0.5 * M * 2, 0.06 * M * 2, sx * 0.18 * M * 2, 0, sz * 0.11 * M * 2)));
  add('hide_pink', T(box(0.09 * M * 2, 0.07 * M * 2, 0.09 * M * 2, -0.04 * M * 2, 0.34 * M * 2, 0)));       // the udder
  add(hide, T(box(0.03 * M * 2, 0.3 * M * 2, 0.03 * M * 2, -0.26 * M * 2, 0.26 * M * 2, 0)));                  // the tail
}
function goatGeo(add: Add, x: number, z: number, a: number, white: boolean): void {
  const T = (g: THREE.BufferGeometry) => g.rotateY(-a).translate(x, 0, z);
  const hide: KitMaterialId = white ? 'sheepwool' : 'hide_tan';
  add(hide, T(box(0.3 * M * 2, 0.22 * M * 2, 0.16 * M * 2, 0, 0.28 * M * 2, 0)));
  add(hide, T(box(0.12 * M * 2, 0.14 * M * 2, 0.1 * M * 2, 0.2 * M * 2, 0.42 * M * 2, 0)));
  for (const sz of [-1, 1]) add('wood_dark', T(box(0.02 * M * 2, 0.08 * M * 2, 0.02 * M * 2, 0.19 * M * 2, 0.52 * M * 2, sz * 0.03 * M * 2)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('wood_dark', T(box(0.03 * M * 2, 0.28 * M * 2, 0.03 * M * 2, sx * 0.1 * M * 2, 0, sz * 0.05 * M * 2)));
}
function pigGeo(add: Add, x: number, z: number, a: number): void {
  const T = (g: THREE.BufferGeometry) => g.rotateY(-a).translate(x, 0, z);
  add('hide_pink', T(ball(0.2 * M * 2, 0, 0.25 * M * 2, 0, 1.4, 0.95, 0.9, 8)));
  add('hide_pink', T(ball(0.1 * M * 2, 0.26 * M * 2, 0.24 * M * 2, 0, 1, 0.9, 0.9, 6)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('hide_pink', T(box(0.05 * M * 2, 0.14 * M * 2, 0.05 * M * 2, sx * 0.12 * M * 2, 0, sz * 0.07 * M * 2)));
}

function barnyard(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = def.cellsX * CELL, D = def.cellsZ * CELL, hw = W / 2 - 0.04, hd = D / 2 - 0.04;
  const shedD = 0.38, sz0 = -hd, sz1 = -hd + shedD;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * hw, -0.02, sz * hd));
  p.layer = 'foundation';
  p.add('earth', box(W - 0.06, 0.008, D - 0.06, 0, -0.004, 0));
  p.add('concrete', box(W - 0.2, 0.012, shedD, 0, 0, (sz0 + sz1) / 2));          // the shed's slab
  p.add('concrete', box(0.3, 0.012, 0.16, hw * 0.3, 0, hd - 0.25));                // the feeding apron
  // frame: the shed's posts and the stall partitions
  p.layer = 'frame';
  const pw = W - 0.24;
  for (let k = 0; k <= 4; k++) p.add('wood_mid', box(0.024, 0.3, 0.024, -pw / 2 + k * pw / 4, 0, sz1));
  for (let k = 0; k <= 4; k++) p.add('wood_mid', box(0.024, 0.34, 0.024, -pw / 2 + k * pw / 4, 0, sz0 + 0.02));
  for (const x of [-pw / 4, pw / 4]) p.add('wood_mid', box(0.012, 0.14, shedD - 0.04, x, 0.01, (sz0 + sz1) / 2));
  p.layer = 'roof';
  p.add('metal_roof', box(pw + 0.12, 0.012, shedD + 0.12, 0, 0, 0).rotateX(0.13).translate(0, 0.33, (sz0 + sz1) / 2));
  p.add('straw', box(pw - 0.1, 0.05, shedD - 0.08, 0, 0.012, (sz0 + sz1) / 2));        // the hay mow under the roof, seen at the edge
  p.layer = 'walls';
  p.add('board_batten', box(pw, 0.3, 0.012, 0, 0, sz0 + 0.012));
  for (const sx of [-1, 1]) p.add('board_batten', box(0.012, 0.3, shedD, sx * pw / 2, 0, (sz0 + sz1) / 2));
  // the yard fence: three rails, a gate at the front
  const runs: Array<[number, number, number, number]> = [[-hw, sz0, -hw, hd], [hw, sz0, hw, hd], [-hw, hd, -0.12, hd], [0.12, hd, hw, hd]];
  for (const [ax, az, bx, bz] of runs) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(L / 0.2)), a = -Math.atan2(bz - az, bx - ax);
    for (let k = 0; k <= n; k++) p.add('wood_dark', box(0.016, 0.1, 0.016, ax + (bx - ax) * k / n, 0, az + (bz - az) * k / n));
    for (const y of [0.03, 0.06, 0.09]) p.add('wood_mid', box(L, 0.008, 0.008, 0, y, 0).rotateY(a).translate((ax + bx) / 2, 0, (az + bz) / 2));
  }
  p.layer = 'openings';
  p.add('wood_mid', box(0.2, 0.09, 0.008, 0.0, 0.02, hd).rotateY(-0.9).translate(0.1, 0, 0));      // the gate swung open
  // interior: the hay rack, the water trough, a round bale, the pig pen
  p.layer = 'interior';
  p.add('wood_mid', box(pw * 0.7, 0.03, 0.02, 0, 0.09, sz0 + 0.06));
  p.add('straw', box(pw * 0.7, 0.04, 0.04, 0, 0.06, sz0 + 0.07));
  p.add('blue_tank', box(0.22, 0.04, 0.07, -hw * 0.45, 0.0, sz1 + 0.1));
  p.add('pond_water', box(0.2, 0.002, 0.055, -hw * 0.45, 0.04, sz1 + 0.1));
  p.add('straw', new THREE.CylinderGeometry(0.05, 0.05, 0.07, 14).rotateZ(Math.PI / 2).translate(hw * 0.55, 0.05, hd - 0.12));
  p.layer = 'decor';
  const add: Add = (m, g) => p.add(m, g);
  cowGeo(add, -pw * 0.3, (sz0 + sz1) / 2 + 0.02, 1.2, false, false);
  cowGeo(add, pw * 0.05, (sz0 + sz1) / 2 + 0.04, 2.3, true, false);
  goatGeo(add, pw * 0.34, (sz0 + sz1) / 2, 0.8, true);
  goatGeo(add, pw * 0.4, (sz0 + sz1) / 2 + 0.08, 2.8, false);
  for (let k = 0; k < 3; k++) goatGeo(add, -hw * 0.5 + k * 0.17, sz1 + 0.34 + 0.08 * hash(k, 1), hash(k, 2) * 6, k !== 1);
  pigGeo(add, hw * 0.55, sz1 + 0.22, 0.4);
  pigGeo(add, hw * 0.35, sz1 + 0.38, 3.6);
  cowGeo(add, hw * 0.05, sz1 + 0.46, 0.2, true, true);
  p.collide({ x0: -hw, z0: sz0, x1: hw, z1: sz0 + 0.02 }, { x0: -hw, z0: sz0, x1: -hw + 0.02, z1: hd }, { x0: hw - 0.02, z0: sz0, x1: hw, z1: hd }, { x0: -hw, z0: hd - 0.02, x1: -0.12, z1: hd }, { x0: 0.12, z0: hd - 0.02, x1: hw, z1: hd });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'roof', 'walls'];
  return g;
}

export const HERD_BUILDERS: Record<string, (def: KitPieceDef, seed?: number) => THREE.Group> = { apiary, sugar_shack: sugarShack, barnyard };
