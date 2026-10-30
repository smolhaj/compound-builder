/**
 * The cabin village, the helipad, the tower pod and the stilted house (sim/outposts.ts). Procedural, layered for construction,
 * merged per layer x material. SCALE v2 (1 unit = 6 m, M = 1 m; a person 0.28).
 *
 *  Cabin village  six 4 x 4.5 m cabins on pier footings, a gable of tin over each, a door and a window to the green, a stovepipe, a bunk
 *                 on each side inside; a gravel path ring, a fire circle of fieldstone with log benches in the middle of a 24 m square.
 *  Helipad        12 x 12 m slab, a painted H in a yellow ring, sixteen edge lights, a windsock on a pole, an extinguisher post.
 *  Tower pod      a 10 m steel mast with a spiral stair round it, a railed platform, a glazed 3 m pod with a cone roof and a sweep light.
 *  Stilted house  the 6 x 5 m cottage lifted 2.4 m on a grid of piles with cross bracing, a deck and a straight stair to the ground.
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { M, pipe } from './interior';
import { box, Parts, type BuildOpts } from './shell';
import { COMPOUND_BUILDERS } from './compoundBuildings';
import type { KitMaterialId } from './materials';

const cylY = (r: number, h: number, x: number, y: number, z: number, seg = 10) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);
const yawed = (g: THREE.BufferGeometry, yaw: number, x: number, z: number) => g.rotateY(yaw).translate(x, 0, z);

// ── cabin village ──

function cabinVillage(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const F = def.cellsX * CELL / 2, R = 8.5 * M;
  const CW = 4.2 * M, CD = 4.6 * M, WH = 2.3 * M, t = 0.12 * M;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (F - 0.03), -0.02, sz * (F - 0.03)));
  const at = (k: number): [number, number, number] => { const a = k * Math.PI / 3 + Math.PI / 6; return [Math.sin(a) * R, Math.cos(a) * R, a]; };
  for (let k = 0; k < 6; k++) { const [x, z] = at(k); p.add('trim', box(0.012, 0.09, 0.012, x, -0.02, z)); }
  // foundation: a gravel path ring and spokes, the fire circle, a pier at each cabin corner
  p.layer = 'foundation';
  for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; p.add('gravel', yawed(box(0.4 * M, 0.02, 2.6 * M, 0, 0, 0), a, Math.sin(a) * (R - 3.4 * M), Math.cos(a) * (R - 3.4 * M)).clone()); }
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; p.add('fieldstone', box(0.4 * M, 0.25 * M, 0.35 * M, Math.sin(a) * 1.4 * M, 0, Math.cos(a) * 1.4 * M)); }
  p.add('soil', new THREE.CircleGeometry(1.1 * M, 12).rotateX(-Math.PI / 2).translate(0, 0.005, 0));
  for (let k = 0; k < 6; k++) {
    const [cx, cz, a] = at(k);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('concrete', yawed(cylY(0.2 * M, 0.5 * M, sx * (CW / 2 - 0.2 * M), -0.05 * M, sz * (CD / 2 - 0.2 * M), 6), a + Math.PI, cx, cz));
  }
  // frame: walls (door on the green side = local +z faces the centre after yaw), floor
  p.layer = 'frame';
  for (let k = 0; k < 6; k++) {
    const [cx, cz, a] = at(k), yaw = a + Math.PI, hw = CW / 2, hd = CD / 2, y0 = 0.45 * M;
    p.add('floorboards', yawed(box(CW, 0.1 * M, CD, 0, y0 - 0.1 * M, 0), yaw, cx, cz));
    p.add('board_batten', yawed(box(CW, WH, t, 0, y0, -hd + t / 2), yaw, cx, cz));
    p.add('board_batten', yawed(box(t, WH, CD - 2 * t, -hw + t / 2, y0, 0), yaw, cx, cz));
    p.add('board_batten', yawed(box(t, WH, CD - 2 * t, hw - t / 2, y0, 0), yaw, cx, cz));
    p.add('board_batten', yawed(box(CW * 0.5 - 0.5 * M, WH, t, -hw / 2 - 0.25 * M, y0, hd - t / 2), yaw, cx, cz));
    p.add('board_batten', yawed(box(CW * 0.5 - 0.5 * M, WH, t, hw / 2 + 0.25 * M, y0, hd - t / 2), yaw, cx, cz));
    p.add('board_batten', yawed(box(1.0 * M, WH - 2.0 * M, t, 0, y0 + 2.0 * M, hd - t / 2), yaw, cx, cz));
  }
  p.layer = 'roof';
  for (let k = 0; k < 6; k++) {
    const [cx, cz, a] = at(k), yaw = a + Math.PI, hw = CW / 2, y0 = 0.45 * M + WH, rise = 1.1 * M, sl = Math.hypot(hw + 0.4 * M, rise), ang = Math.atan2(rise, hw + 0.4 * M);
    for (const sx of [-1, 1]) p.add('metal_roof', yawed(box(sl, 0.06 * M, CD + 0.6 * M, 0, 0, 0).rotateZ(-sx * ang).translate(sx * (hw + 0.4 * M) / 2, y0 + rise / 2, 0), yaw, cx, cz));
    // the gable ends under the roof
    const gab = new THREE.Shape([new THREE.Vector2(-hw, 0), new THREE.Vector2(hw, 0), new THREE.Vector2(0, rise)]);
    for (const sz of [-1, 1]) p.add('board_batten', yawed(new THREE.ExtrudeGeometry(gab, { depth: t, bevelEnabled: false }).translate(0, y0, sz * (CD / 2 - t)), yaw, cx, cz));
  }
  p.layer = 'openings';
  for (let k = 0; k < 6; k++) {
    const [cx, cz, a] = at(k), yaw = a + Math.PI, hd = CD / 2, hw = CW / 2, y0 = 0.45 * M;
    p.add('door', yawed(box(0.9 * M, 1.9 * M, 0.05 * M, 0.1 * M, y0, hd + 0.04 * M), yaw, cx, cz));
    p.add('glass', yawed(box(0.9 * M, 0.8 * M, 0.03 * M, -hw * 0.6, y0 + 1.1 * M, hd + 0.01 * M), yaw, cx, cz));
    p.add('trim', yawed(box(1.0 * M, 0.06 * M, 0.06 * M, -hw * 0.6, y0 + 0.98 * M, hd + 0.04 * M), yaw, cx, cz));
    p.add('iron', yawed(pipe([hw - 0.5 * M, y0 + WH, -0.8 * M], [hw - 0.5 * M, y0 + WH + 1.5 * M, -0.8 * M], 0.07 * M, 6), yaw, cx, cz));      // the stovepipe
    p.add('wood_mid', yawed(box(1.6 * M, 0.1 * M, 0.9 * M, 0.1 * M, y0 - 0.12 * M, hd + 0.5 * M), yaw, cx, cz));                              // the step
  }
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; p.add('wood_dark', yawed(box(1.6 * M, 0.3 * M, 0.3 * M, 0, 0, 0), a + Math.PI / 2, Math.sin(a) * 2.3 * M, Math.cos(a) * 2.3 * M)); }   // the log benches
  p.layer = 'interior';
  for (let k = 0; k < 6; k++) {
    const [cx, cz, a] = at(k), yaw = a + Math.PI, hw = CW / 2, hd = CD / 2, y0 = 0.45 * M;
    for (const sx of [-1, 1]) { p.add('wood_mid', yawed(box(0.9 * M, 0.35 * M, 2.0 * M, sx * (hw - 0.55 * M), y0, -hd + 1.2 * M), yaw, cx, cz)); p.add('quilt_red', yawed(box(0.8 * M, 0.1 * M, 1.8 * M, sx * (hw - 0.55 * M), y0 + 0.35 * M, -hd + 1.2 * M), yaw, cx, cz)); }
    p.add('iron', yawed(box(0.5 * M, 0.7 * M, 0.5 * M, hw - 0.5 * M, y0, -0.8 * M), yaw, cx, cz));
  }
  p.collide({ x0: -0.9 * M, z0: -0.9 * M, x1: 0.9 * M, z1: 0.9 * M });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = [];
  return g;
}

// ── helipad ──

function helipad(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const S = 12 * M, hs = S / 2, F = def.cellsX * CELL / 2;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (F - 0.03), -0.02, sz * (F - 0.03)));
  p.layer = 'foundation';
  p.add('gravel', box(S + 1.0 * M, 0.12 * M, S + 1.0 * M, 0, -0.1 * M, 0));
  p.layer = 'frame';
  for (let i = 0; i <= 12; i++) { p.add('iron', box(S - 0.4 * M, 0.02 * M, 0.025 * M, 0, 0.02 * M, -hs + 0.2 * M + i * (S - 0.4 * M) / 12)); p.add('iron', box(0.025 * M, 0.02 * M, S - 0.4 * M, -hs + 0.2 * M + i * (S - 0.4 * M) / 12, 0.04 * M, 0)); }
  p.layer = 'roof';
  p.add('concrete', box(S, 0.15 * M, S, 0, 0, 0));
  p.layer = 'openings';
  const y = 0.151 * M;
  p.add('paint_yellow', new THREE.RingGeometry(4.6 * M, 5.1 * M, 40).rotateX(-Math.PI / 2).translate(0, y, 0));
  for (const [w, d, x, z] of [[0.7 * M, 4.4 * M, -1.5 * M, 0], [0.7 * M, 4.4 * M, 1.5 * M, 0], [3.7 * M, 0.7 * M, 0, 0]] as const) p.add('paint_yellow', box(w, 0.004, d, x, y, z));
  p.layer = 'interior';
  for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; p.add('lamp', box(0.18 * M, 0.12 * M, 0.18 * M, Math.cos(a) * (hs - 0.25 * M), 0.15 * M, Math.sin(a) * (hs - 0.25 * M))); }
  p.add('wood_dark', cylY(0.05 * M, 5.5 * M, hs + 1.2 * M, 0, -hs - 0.4 * M, 6));
  p.add('paint_red', new THREE.ConeGeometry(0.28 * M, 1.6 * M, 8).rotateZ(-Math.PI / 2).translate(hs + 1.2 * M + 0.8 * M, 5.2 * M, -hs - 0.4 * M));
  p.add('paint_red', box(0.1 * M, 0.9 * M, 0.5 * M, hs + 1.0 * M, 0, hs * 0.4));   // the extinguisher post
  p.collide();
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['foundation'];
  return g;
}

// ── tower pod ──

function towerPod(_def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const MAST = 10 * M, PR = 1.5 * M, POD_H = 2.2 * M;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * 0.2, -0.02, sz * 0.2));
  p.layer = 'foundation';
  p.add('concrete', cylY(1.0 * M, 0.5 * M, 0, -0.35 * M, 0, 12));
  p.layer = 'frame';
  p.add('steel', cylY(0.2 * M, MAST, 0, 0.1 * M, 0, 12));
  // the spiral stair: 44 treads round the mast, a handrail on posts
  const steps = 44, rise = (MAST - 0.2 * M) / steps;
  for (let i = 0; i < steps; i++) {
    const a = i * 0.34, y = 0.15 * M + i * rise;
    p.add('steel', box(0.9 * M, 0.04 * M, 0.34 * M, 0, 0, 0).translate(0.7 * M, 0, 0).rotateY(-a).translate(0, y, 0));
    if (i % 4 === 0) p.add('steel', cylY(0.015 * M, 1.0 * M, Math.cos(a) * 1.12 * M, y, -Math.sin(a) * 1.12 * M, 4));
  }
  // roof: the platform, rail, pod walls and roof
  p.layer = 'roof';
  const y0 = MAST;
  p.add('steel', cylY(PR + 0.4 * M, 0.12 * M, 0, y0 - 0.05 * M, 0, 20));
  p.add('steel', new THREE.TorusGeometry(PR + 0.35 * M, 0.02 * M, 4, 24).rotateX(Math.PI / 2).translate(0, y0 + 0.2 * M, 0));
  p.add('steel', new THREE.TorusGeometry(PR + 0.35 * M, 0.02 * M, 4, 24).rotateX(Math.PI / 2).translate(0, y0 + 0.95 * M, 0));
  for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; p.add('steel', cylY(0.02 * M, 1.0 * M, Math.cos(a) * (PR + 0.35 * M), y0 + 0.05 * M, Math.sin(a) * (PR + 0.35 * M), 4)); }
  p.add('glass', new THREE.CylinderGeometry(PR, PR, POD_H, 20, 1, true).translate(0, y0 + 0.07 * M + POD_H / 2, 0));
  for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5; p.add('steel', cylY(0.03 * M, POD_H, Math.cos(a) * PR, y0 + 0.07 * M, Math.sin(a) * PR, 4)); }
  p.add('steel', new THREE.TorusGeometry(PR, 0.04 * M, 4, 24).rotateX(Math.PI / 2).translate(0, y0 + 0.07 * M + POD_H, 0));
  p.add('metal_roof', new THREE.ConeGeometry(PR + 0.35 * M, 0.9 * M, 20).translate(0, y0 + 0.07 * M + POD_H + 0.45 * M, 0));
  p.layer = 'openings';
  p.add('lamp', box(0.5 * M, 0.2 * M, 0.3 * M, 0, y0 + 0.07 * M + POD_H + 0.95 * M, 0));   // the sweep light
  p.add('steel', cylY(0.02 * M, 1.2 * M, 0, y0 + 0.07 * M + POD_H + 0.85 * M, 0, 4));
  p.add('wood_mid', box(PR * 1.3, 0.05 * M, 0.4 * M, 0, y0 + 0.14 * M, 0));                     // a bunk
  p.collide({ x0: -0.3 * M, z0: -0.3 * M, x1: 0.3 * M, z1: 0.3 * M });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters', 'foundation'];
  return g;
}

// ── stilted house ──

const LIFT = 2.4 * M;
function stiltedHouse(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const g = COMPOUND_BUILDERS.guest_house(def, seed, opts);
  // lift every layer of the cottage; its floor was 0.08 up
  for (const c of g.children) c.position.y += LIFT;
  const W = def.cellsX * CELL, D = def.cellsZ * CELL - M, hw = W / 2, hd = D / 2;
  const e = new Parts(seed + 3);
  e.layer = 'foundation';
  // a 3 x 3 grid of round piles, each footed on a pad and running down to the low side of the slope
  for (const ix of [-1, 0, 1]) for (const iz of [-1, 0, 1]) {
    const x = ix * (hw - 0.3 * M), z = iz * (hd - 0.3 * M);
    e.add('wood_dark', cylY(0.14 * M, LIFT + 6 * M, x, -6 * M, z, 8));
    e.add('concrete', box(0.55 * M, 0.3 * M, 0.55 * M, x, -0.1 * M, z));
  }
  e.layer = 'frame';
  for (const iz of [-1, 0, 1]) e.add('wood_mid', box(W + 0.2 * M, 0.3 * M, 0.2 * M, 0, LIFT - 0.3 * M, iz * (hd - 0.3 * M)));
  for (const ix of [-1, 0, 1]) e.add('wood_mid', box(0.2 * M, 0.2 * M, D + 0.2 * M, ix * (hw - 0.3 * M), LIFT - 0.5 * M, 0));
  // cross bracing in both directions between the piles
  for (const s of [-1, 1]) {
    e.add('wood_mid', pipe([-hw + 0.3 * M, 0.4 * M, hd - 0.3 * M * s], [0, LIFT - 0.5 * M, hd - 0.3 * M * s], 0.05 * M, 5));
    e.add('wood_mid', pipe([hw - 0.3 * M, 0.4 * M, hd - 0.3 * M * s], [0, LIFT - 0.5 * M, hd - 0.3 * M * s], 0.05 * M, 5));
  }
  e.layer = 'deck';
  // the deck round the front door and a straight stair to the ground
  const pz = hd + 0.14 * 6 * M / 6;
  e.add('deck', box(2.6 * M, 0.08 * M, 1.5 * M, 0, LIFT, hd + 0.75 * M));
  const steps = 13, run = 0.28 * M;
  for (let i = 0; i < steps; i++) e.add('deck', box(1.0 * M, 0.06 * M, run, 0.2 * M, LIFT - (i + 1) * (LIFT / steps), hd + 1.5 * M + i * run));
  for (const sx of [-0.3 * M, 0.7 * M]) e.add('wood_mid', pipe([sx, LIFT + 0.9 * M, hd + 1.5 * M], [sx, 0.9 * M, hd + 1.5 * M + steps * run], 0.025 * M, 4));
  void pz;
  const eg = e.finish();
  for (const c of [...eg.children]) g.add(c);
  g.userData.keep = [...((g.userData.keep as string[] | undefined) ?? []), 'foundation'];
  const col = (g.userData.colliders ?? []) as unknown[];
  g.userData.colliders = col;
  return g;
}

export const OUTPOST_BUILDERS: Record<string, (def: KitPieceDef, seed?: number, opts?: BuildOpts) => THREE.Group> = {
  cabin_village: cabinVillage, helipad, tower_pod: towerPod, stilted_house: stiltedHouse,
};
export type { KitMaterialId };
