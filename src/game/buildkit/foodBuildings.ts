/**
 * Greenhouse and orchard geometry (sim/greenhouse.ts has what they grow).
 * Procedural, layered for construction like the garden (shell.ts Parts).
 * SCALE v2: 1 unit ≈ 6 m (M = 1 m), a person ≈ 0.28 tall.
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { M } from './interior';
import { box, Parts } from './shell';

// ─────────────────────────────────────────────────────────────────────────
// Greenhouse: 12 × 24 ft (3.6 × 7.3 m), aluminum frame, polycarbonate panels
// ─────────────────────────────────────────────────────────────────────────

/** Greenhouse body in world units: width, length, eave and ridge height. */
export const GH = { W: 3.6 * M, D: 7.3 * M, E: 1.65 * M, R: 2.45 * M, doorW: 0.85 * M, doorH: 1.9 * M };

function greenhouse(_def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const { W, D, E, R, doorW, doorH } = GH;
  const hw = W / 2, hd = D / 2, t = 0.04 * M * 1.5, pane = 0.004;
  // site: corner stakes
  p.layer = 'stakes';
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) p.add('trim', box(0.012, 0.09, 0.012, x, -0.02, z));
  // foundation: gravel bed, a low concrete curb, a gravel apron at the door
  p.layer = 'foundation';
  p.add('fieldstone', box(W - 0.01, 0.004, D - 0.01, 0, -0.002, 0));
  for (const [w, d, x, z] of [[W + 0.02, 0.02, 0, -hd], [W + 0.02, 0.02, 0, hd], [0.02, D, -hw, 0], [0.02, D, hw, 0]] as const) p.add('concrete', box(w, 0.025, d, x, -0.01, z));
  p.add('fieldstone', box(doorW * 1.6, 0.004, 0.12, 0, -0.002, hd + 0.07));
  // frame: posts every 0.6 m down both sides, gable posts and the door frame, eave and base rails
  const bays = Math.round(D / (0.61 * M)), y0 = 0.015;
  const zs = Array.from({ length: bays + 1 }, (_, i) => -hd + i * D / bays);
  for (const z of zs) for (const x of [-hw, hw]) p.add('aluminum', box(t, E - y0, t, x, y0, z), 'frame');
  for (const x of [-hw, hw]) for (const y of [y0, E - t]) p.add('aluminum', box(t, t, D, x, y, 0), 'frame');
  for (const z of [-hd, hd]) {
    p.add('aluminum', box(W, t, t, 0, y0, z), 'frame');
    const gx = z < 0 ? [-hw / 2, 0, hw / 2] : [-doorW / 2 - t / 2, doorW / 2 + t / 2, -hw * 0.72, hw * 0.72];
    for (const x of gx) p.add('aluminum', box(t, E + (R - E) * (1 - Math.abs(x) / hw) - y0, t, x, y0, z), 'frame');
    if (z > 0) p.add('aluminum', box(doorW + 2 * t, t, t, 0, doorH, z), 'frame');
    p.add('aluminum', box(W, t, t, 0, E - t, z), 'frame');
  }
  // rafters at every post and the ridge bar
  const slope = Math.hypot(hw, R - E), ang = Math.atan2(R - E, hw);
  for (const z of zs) for (const sx of [-1, 1]) p.add('aluminum', box(slope, t, t, 0, -t / 2, 0).rotateZ(-sx * ang).translate(sx * hw / 2, (E + R) / 2, z), 'rafters');
  p.add('aluminum', box(t * 1.4, t * 1.4, D + 0.01, 0, R - t * 0.7, 0), 'rafters');
  // roof: two polycarbonate slopes, one ridge vent propped open
  p.layer = 'roof';
  for (const sx of [-1, 1]) {
    p.add('polycarb', box(slope, pane, D, 0, 0, 0).rotateZ(-sx * ang).translate(sx * hw / 2, (E + R) / 2 + t / 2, 0));
  }
  p.add('aluminum', box(slope * 0.45, 0.006, 0.6 * M, 0, 0, 0).rotateZ(-(ang + 0.35)).translate(hw * 0.25, R - (R - E) * 0.2 + 0.02, -hd * 0.4));
  // walls: side panels, the back gable, the front gable round the door
  p.layer = 'walls';
  for (const x of [-hw, hw]) p.add('polycarb', box(pane, E - y0, D, x, y0, 0));
  const gable = (z: number, door: boolean) => {
    const sh = new THREE.Shape([new THREE.Vector2(-hw, y0), new THREE.Vector2(hw, y0), new THREE.Vector2(hw, E), new THREE.Vector2(0, R), new THREE.Vector2(-hw, E)]);
    if (door) sh.holes.push(new THREE.Path([new THREE.Vector2(-doorW / 2, y0), new THREE.Vector2(-doorW / 2, doorH), new THREE.Vector2(doorW / 2, doorH), new THREE.Vector2(doorW / 2, y0)].reverse()));
    p.add('polycarb', new THREE.ExtrudeGeometry(sh, { depth: pane, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, z - pane / 2));
  };
  gable(-hd, false);
  gable(hd, true);
  // openings: the door, standing open outward on its hinge
  p.layer = 'openings';
  const dx = -doorW / 2, open = -1.1;
  const doorGeo = (g: THREE.BufferGeometry) => g.translate(doorW / 2, 0, 0).rotateY(open).translate(dx, 0, hd + 0.005);
  p.add('polycarb', doorGeo(box(doorW - t, doorH - 2 * t, pane, 0, y0 + t, 0)));
  for (const [w, h, x, y] of [[t, doorH - y0, -doorW / 2 + t / 2, y0], [t, doorH - y0, doorW / 2 - t / 2, y0], [doorW, t, 0, y0], [doorW, t, 0, doorH - t], [doorW, t, 0, doorH * 0.5]] as const) p.add('aluminum', doorGeo(box(w, h, t, x, y, 0)));
  // interior: benches down both sides at ≈ 80 cm, trays of seedlings, pots under the benches, a watering can
  p.layer = 'interior';
  const benchW = 0.75 * M, benchY = 0.8 * M, bx = hw - benchW / 2 - 0.08 * M, bLen = D - 1.2 * M, bz = -0.3 * M;
  for (const sx of [-1, 1]) {
    const x = sx * bx;
    p.add('wood_mid', box(benchW, 0.04 * M, bLen, x, benchY - 0.04 * M, bz));
    for (const lz of [-bLen / 2 + 0.05, 0, bLen / 2 - 0.05]) for (const lx of [-benchW / 2 + 0.05 * M, benchW / 2 - 0.05 * M]) p.add('aluminum', box(0.04 * M, benchY - 0.04 * M, 0.04 * M, x + lx, 0, bz + lz));
    // trays: 25 × 50 cm flats of plugs, a few empty spots
    const trays = Math.floor(bLen / (0.55 * M));
    for (let i = 0; i < trays; i++) for (const k of [-1, 1]) {
      if (p.rnd() < 0.12) continue;
      const tz = bz - bLen / 2 + (i + 0.5) * bLen / trays, tx = x + k * 0.17 * M;
      p.add('rubber', box(0.3 * M, 0.06 * M, 0.5 * M, tx, benchY, tz));
      p.add('soil', box(0.28 * M, 0.005, 0.48 * M, tx, benchY + 0.055 * M, tz));
      const h = (0.05 + 0.1 * p.rnd()) * M;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 5; b++) {
        p.add('crop', new THREE.IcosahedronGeometry(0.035 * M + h * 0.3, 0).scale(1, 0.7, 1).translate(tx + (a - 1) * 0.085 * M, benchY + 0.07 * M + h, tz + (b - 2) * 0.09 * M));
      }
    }
    for (let i = 0; i < 4; i++) p.add('paint_red', new THREE.CylinderGeometry(0.1 * M, 0.08 * M, 0.18 * M, 7).translate(x + (p.rnd() - 0.5) * 0.3 * M, 0.09 * M, bz - bLen / 2 + (i + 0.5) * bLen / 4));
  }
  p.add('paint_green', new THREE.CylinderGeometry(0.1 * M, 0.11 * M, 0.25 * M, 8).translate(0.15 * M, 0.125 * M, hd - 0.5 * M));
  // colliders: the walls with the door gap, the benches
  const c = 0.012;
  p.collide({ x0: -hw - c, z0: -hd - c, x1: hw + c, z1: -hd + c });
  p.collide({ x0: -hw - c, z0: -hd, x1: -hw + c, z1: hd });
  p.collide({ x0: hw - c, z0: -hd, x1: hw + c, z1: hd });
  p.collide({ x0: -hw - c, z0: hd - c, x1: -doorW / 2, z1: hd + c });
  p.collide({ x0: doorW / 2, z0: hd - c, x1: hw + c, z1: hd + c });
  for (const sx of [-1, 1]) p.collide({ x0: sx * bx - benchW / 2, z0: bz - bLen / 2, x1: sx * bx + benchW / 2, z1: bz + bLen / 2 });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Orchard: twelve semi-dwarf apple, pear and peach trees on a 3.6 × 4.5 m grid
// ─────────────────────────────────────────────────────────────────────────

export type FruitKind = 'apple' | 'pear' | 'peach';
/** Tree positions (local) and kinds, four across and three deep. */
export function orchardTrees(def: KitPieceDef): Array<{ x: number; z: number; kind: FruitKind }> {
  const LW = def.cellsX * CELL, LD = def.cellsZ * CELL;
  const kinds: FruitKind[] = ['apple', 'apple', 'pear', 'peach'];
  const out: Array<{ x: number; z: number; kind: FruitKind }> = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) out.push({ x: (c - 1.5) * LW / 4, z: (r - 1) * LD / 3.3, kind: kinds[(c + r) % 4] });
  return out;
}

function orchard(def: KitPieceDef, seed = 1): THREE.Group {
  const LW = def.cellsX * CELL, LD = def.cellsZ * CELL;
  const p = new Parts(seed);
  const x0 = -LW / 2 + 0.04, x1 = LW / 2 - 0.04, z0 = -LD / 2 + 0.04, z1 = LD / 2 - 0.04;
  p.layer = 'stakes';
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) p.add('trim', box(0.012, 0.09, 0.012, x, -0.02, z));
  for (const t of orchardTrees(def)) {
    const s = 0.85 + 0.3 * p.rnd(), j = (p.rnd() - 0.5) * 0.03;
    const x = t.x + j, z = t.z - j;
    p.add('trim', box(0.01, 0.06, 0.01, x, -0.01, z), 'stakes');
    // foundation: the planting hole and a mulch ring
    p.add('soil', new THREE.CylinderGeometry(0.065, 0.07, 0.008, 12).translate(x, 0.0, z), 'foundation');
    // frame: the trunk and scaffold limbs (bare in winter)
    const trunkH = (t.kind === 'peach' ? 0.6 : 0.8) * M * s;
    p.add('wood_dark', new THREE.CylinderGeometry(0.06 * M * s, 0.09 * M * s, trunkH, 6).translate(x, trunkH / 2, z), 'frame');
    const limbs = t.kind === 'pear' ? 3 : 4;
    for (let k = 0; k < limbs; k++) {
      const a = (k / limbs) * Math.PI * 2 + p.rnd(), lean = t.kind === 'pear' ? 0.35 : t.kind === 'peach' ? 0.85 : 0.6, len = 1.5 * M * s;
      const g = new THREE.CylinderGeometry(0.025 * M * s, 0.05 * M * s, len, 5).translate(0, len / 2, 0).rotateZ(lean).rotateY(a).translate(x, trunkH * 0.95, z);
      p.add('wood_dark', g, 'frame');
    }
    // roof stage: a stake and a white trunk guard
    p.add('wood_mid', box(0.008, 0.25, 0.008, x + 0.03, 0, z), 'rafters');
    p.add('trim', new THREE.CylinderGeometry(0.1 * M, 0.1 * M, 0.45 * M, 8, 1, true).translate(x, 0.225 * M, z), 'rafters');
    // finish: the canopy (round apple, upright pear, wide open peach) and the fruit
    const cr = 1.4 * M * s;
    const [sx, sy, sz] = t.kind === 'pear' ? [0.8, 1.25, 0.8] : t.kind === 'peach' ? [1.15, 0.7, 1.15] : [1, 0.88, 1];
    const cy = trunkH + cr * sy * 0.85;
    const leaf = t.kind === 'apple' ? 'hedge' : 'hedge2';
    p.add(leaf, new THREE.IcosahedronGeometry(cr, 2).scale(sx, sy, sz).translate(x, cy, z), 'interior');
    for (let k = 0; k < 5; k++) {
      const a = p.rnd() * Math.PI * 2, r = cr * 0.6;
      p.add(k % 2 ? 'hedge2' : leaf, new THREE.IcosahedronGeometry(cr * (0.45 + 0.15 * p.rnd()), 1).scale(sx, sy, sz).translate(x + Math.cos(a) * r * sx, cy + (p.rnd() - 0.6) * cr * 0.5, z + Math.sin(a) * r * sz), 'interior');
    }
    // fruit dots on the outside of the canopy (shown in late summer by the world)
    const fm = t.kind === 'pear' ? 'paint_yellow' : 'fruit';
    for (let k = 0; k < 22; k++) {
      const a = p.rnd() * Math.PI * 2, e = (p.rnd() - 0.35) * 1.1;
      const fx = Math.cos(a) * Math.cos(e) * cr * sx * 1.01, fy = Math.sin(e) * cr * sy * 1.01, fz = Math.sin(a) * Math.cos(e) * cr * sz * 1.01;
      p.add(fm, new THREE.IcosahedronGeometry(0.13 * M, 0).translate(x + fx, cy + fy, z + fz), 'decor');
    }
    p.collide({ x0: x - 0.03, z0: z - 0.03, x1: x + 0.03, z1: z + 0.03 });
  }
  // finish: a picking ladder and bushel crates at the front
  p.layer = 'openings';
  for (let i = 0; i < 3; i++) p.add('wood_mid', box(0.5 * M, 0.3 * M, 0.4 * M, -0.2 + i * 0.1, i > 1 ? 0.3 * M : 0, z1 - 0.06));
  const lad = (g: THREE.BufferGeometry) => g.rotateX(-0.25).translate(0.45, 0, z1 - 0.12);
  for (const lx of [-0.2 * M, 0.2 * M]) p.add('wood_mid', lad(box(0.05 * M, 2.4 * M, 0.05 * M, lx, 0, 0)));
  for (let r = 1; r < 6; r++) p.add('wood_mid', lad(box(0.4 * M, 0.04 * M, 0.04 * M, 0, r * 0.4 * M, 0)));
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

export const FOOD_BUILDERS: Record<string, (def: KitPieceDef, seed?: number) => THREE.Group> = { greenhouse, orchard };
