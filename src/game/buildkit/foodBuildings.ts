/**
 * Greenhouse and orchard geometry (sim/greenhouse.ts has what they grow).
 * Procedural, layered for construction like the garden (shell.ts Parts).
 * SCALE v2: 1 unit ≈ 6 m (M = 1 m), a person ≈ 0.28 tall.
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { M, piece, pipe, tube, type Add, type Place } from './interior';
import { box, Parts } from './shell';
import { ORCHARD_GRID, isOrchard, orchardColumns, type Fruit } from '../../sim/orchard';
import type { KitMaterialId } from './materials';

// ─────────────────────────────────────────────────────────────────────────
// Greenhouse: 12 × 24 ft (3.6 × 7.3 m), aluminum frame, polycarbonate panels
// ─────────────────────────────────────────────────────────────────────────

/** Greenhouse body in world units: width, length, eave and ridge height. */
export const GH = { W: 3.6 * M, D: 7.3 * M, E: 1.65 * M, R: 2.45 * M, doorW: 0.85 * M, doorH: 1.9 * M };

// Interior layout (local units): benches down both sides, a ground bed of tomatoes in the back left,
// the potting bench across the back wall, the seed rack and the water by the door.
const BENCH_W = 0.75 * M, BENCH_Y = 0.8 * M, BENCH_X = GH.W / 2 - BENCH_W / 2 - 0.08 * M;
const BENCH_Z0 = -GH.D / 2 + 0.3 * M, BENCH_Z1 = GH.D / 2 - 0.9 * M, LEFT_Z0 = -0.6 * M;
const BED_Z0 = -GH.D / 2 + 0.035, BED_Z1 = -0.85 * M;
const POT_Z0 = -GH.D / 2 + 0.012, POT_Z1 = POT_Z0 + 0.6 * M;
/** Drip header (3/4" PVC) along the wall-side edge of each bench, just above the tray rims. */
const HEAD_X = BENCH_X + BENCH_W / 2 - 0.03 * M, HEAD_Y = BENCH_Y + 0.09 * M, PVC = 0.02 * M, DRIP = 0.008 * M;
/** Where the supply comes in from the rain barrel (right of the door) and runs along the front wall. */
const INLET_X = 0.19, INLET_Y = 0.079, FRONT_Z = GH.D / 2 - 0.015;

const cylY = (r: number, h: number, x: number, y: number, z: number, seg = 10) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);
/** A pipe elbow / tee: a short fat sleeve at a joint. */
const fitting = (x: number, y: number, z: number) => new THREE.SphereGeometry(PVC * 1.5, 6, 4).translate(x, y, z);

/** Greenhouse kit pieces (own frame: front +z, floor y = 0, meters × M). */
export const GreenhouseKit = {
  /** A 1020 flat of seedlings, 3 × 5 plugs, w × d (m). */
  tray(add: Add, rnd: () => number, wm = 0.3, dm = 0.5, y = 0): void {
    add('rubber', box(wm * M, 0.06 * M, dm * M, 0, y, 0));
    add('soil', box((wm - 0.02) * M, 0.005, (dm - 0.02) * M, 0, y + 0.055 * M, 0));
    const h = (0.04 + 0.1 * rnd()) * M, na = Math.max(2, Math.round(wm / 0.1)), nb = Math.max(2, Math.round(dm / 0.1));
    for (let a = 0; a < na; a++) for (let b = 0; b < nb; b++) {
      add('crop', new THREE.IcosahedronGeometry(0.03 * M + h * 0.3, 0).scale(1, 0.7, 1).translate(((a + 0.5) / na - 0.5) * (wm - 0.05) * M, y + 0.07 * M + h, ((b + 0.5) / nb - 0.5) * (dm - 0.05) * M));
    }
  },

  /** Potting bench 1.5 × 0.6 m (top at 0.9 m), backboard and shelf at -z: soil heap, a flat being filled, pots, hand tools, bags below. */
  pottingBench(add: Add, rnd: () => number): void {
    const l = 1.5 * M, d = 0.6 * M, h = 0.9 * M;
    add('wood_mid', box(l, 0.04 * M, d, 0, h - 0.04 * M, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('wood_mid', box(0.06 * M, h - 0.04 * M, 0.06 * M, sx * (l / 2 - 0.04 * M), 0, sz * (d / 2 - 0.04 * M)));
    add('wood_mid', box(l - 0.1 * M, 0.025 * M, d - 0.06 * M, 0, 0.22 * M, 0));                         // lower shelf
    add('wood_mid', box(l, 0.5 * M, 0.02 * M, 0, h, -d / 2 + 0.01 * M));                                  // backboard
    add('wood_mid', box(l, 0.025 * M, 0.2 * M, 0, h + 0.36 * M, -d / 2 + 0.1 * M));                      // shelf
    // the work: a heap of potting mix out of an open bag, a flat half filled, a trowel stuck in
    add('soil', new THREE.SphereGeometry(0.26 * M, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 0.75).translate(-0.3 * M, h, 0.05 * M));
    add('paint_green', box(0.38 * M, 0.42 * M, 0.2 * M, 0, 0, 0).rotateY(0.12).translate(-0.58 * M, h, -0.14 * M));
    add('soil', box(0.34 * M, 0.01 * M, 0.16 * M, 0, 0, 0).rotateY(0.12).translate(-0.58 * M, h + 0.42 * M, -0.14 * M));
    GreenhouseKit.tray(add, rnd, 0.3, 0.5, h);
    add('steel', box(0.07 * M, 0.14 * M, 0.01 * M, 0, -0.07 * M, 0).rotateZ(0.5).translate(-0.18 * M, h + 0.1 * M, 0.08 * M));     // trowel in the heap
    add('wood_mid', box(0.03 * M, 0.12 * M, 0.03 * M, 0, 0, 0).rotateZ(0.5).translate(-0.18 * M, h + 0.1 * M, 0.08 * M));
    // nested pots: terracotta and black plastic
    for (let i = 0; i < 6; i++) add('paint_red', new THREE.CylinderGeometry(0.075 * M, 0.055 * M, 0.12 * M, 8, 1, true).translate(0.42 * M, h + 0.06 * M + i * 0.03 * M, -0.1 * M));
    for (let i = 0; i < 5; i++) add('rubber', new THREE.CylinderGeometry(0.06 * M, 0.045 * M, 0.1 * M, 8, 1, true).translate(0.6 * M, h + 0.05 * M + i * 0.025 * M, 0.12 * M));
    // hand tools on the backboard nails: trowel, hand fork, dibber, pruners
    for (let i = 0; i < 3; i++) {
      const x = 0.15 * M + i * 0.12 * M, y = h + 0.12 * M;
      add('wood_mid', box(0.03 * M, 0.12 * M, 0.03 * M, x, y + 0.14 * M, -d / 2 + 0.04 * M));
      add('steel', box(i === 2 ? 0.02 * M : 0.07 * M, 0.14 * M, 0.01 * M, x, y, -d / 2 + 0.035 * M));
    }
    for (const e of [-1, 1]) add('paint_red', box(0.02 * M, 0.16 * M, 0.02 * M, 0, 0, 0).rotateZ(e * 0.15).translate(0.565 * M + e * 0.015 * M, h + 0.12 * M, -d / 2 + 0.04 * M));   // pruners
    // shelf: seed packets, a ball of twine, a spray bottle, plant labels
    for (let i = 0; i < 5; i++) add(i % 2 ? 'paint_yellow' : 'linen', box(0.08 * M, 0.12 * M, 0.01 * M, 0, 0, 0).rotateX(-0.2).translate(-0.6 * M + i * 0.06 * M, h + 0.385 * M, -d / 2 + 0.06 * M + i * 0.012 * M));
    add('linen', new THREE.SphereGeometry(0.05 * M, 6, 5).translate(-0.15 * M, h + 0.435 * M, -d / 2 + 0.1 * M));
    add('enamel', cylY(0.035 * M, 0.2 * M, 0.05 * M, h + 0.385 * M, -d / 2 + 0.1 * M, 8));
    add('paint_green', box(0.05 * M, 0.04 * M, 0.08 * M, 0.05 * M, h + 0.585 * M, -d / 2 + 0.12 * M));
    add('linen', box(0.12 * M, 0.08 * M, 0.06 * M, 0.3 * M, h + 0.385 * M, -d / 2 + 0.1 * M));
    // below: bags of potting mix and perlite, a stack of flats
    add('paint_green', box(0.62 * M, 0.14 * M, 0.42 * M, 0, 0, 0).rotateY(0.08).translate(-0.36 * M, 0.245 * M, 0.02 * M));
    add('paint_green', box(0.6 * M, 0.13 * M, 0.4 * M, 0, 0, 0).rotateY(-0.1).translate(-0.34 * M, 0.385 * M, 0));
    add('linen', box(0.5 * M, 0.16 * M, 0.36 * M, 0, 0, 0).rotateY(0.15).translate(0.3 * M, 0.245 * M, 0.04 * M));
    for (let i = 0; i < 4; i++) add('rubber', box(0.3 * M, 0.05 * M, 0.5 * M, 0.35 * M, 0.41 * M + i * 0.05 * M, 0.0));
  },

  /** Four-tier rack of seed flats under shop lights, 1.2 × 0.4 m, back at -z. */
  seedRack(add: Add, rnd: () => number): void {
    const l = 1.2 * M, d = 0.4 * M, h = 1.6 * M, levels = [0.12, 0.52, 0.92, 1.32];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('aluminum', box(0.035 * M, h, 0.035 * M, sx * (l / 2 - 0.02 * M), 0, sz * (d / 2 - 0.02 * M)));
    for (const [k, y] of levels.entries()) {
      add('aluminum', box(l, 0.02 * M, d, 0, y * M, 0));
      // four flats side by side (the bottom shelf half empty: flats waiting to be sown)
      for (let i = 0; i < 4; i++) if (k > 0 || i % 2 === 0) GreenhouseKit.tray((m, g) => add(m, g.translate((i - 1.5) * 0.285 * M, 0, 0)), rnd, 0.27, 0.35, (y + 0.02) * M + 0.001);
      // a shop light under the shelf above
      const yl = (levels[k + 1] ?? 1.58) * M - 0.05 * M;
      add('aluminum', box(l - 0.1 * M, 0.03 * M, 0.12 * M, 0, yl, 0));
      add('lamp', box(l - 0.14 * M, 0.012 * M, 0.08 * M, 0, yl - 0.012 * M, 0));
    }
  },

  /** Hose reel cart (reel axis along x) with a coil of green hose and its lead out to a nozzle. */
  hoseReel(add: Add): void {
    for (const sx of [-1, 1]) {
      for (const e of [-1, 1]) add('iron', pipe([sx * 0.24 * M, 0.02 * M, e * 0.2 * M], [sx * 0.24 * M, 0.55 * M, 0], 0.015 * M, 4));   // A-frame legs
      add('rubber', new THREE.CylinderGeometry(0.08 * M, 0.08 * M, 0.04 * M, 10).rotateZ(Math.PI / 2).translate(sx * 0.27 * M, 0.08 * M, -0.12 * M));
    }
    add('steel', new THREE.CylinderGeometry(0.11 * M, 0.11 * M, 0.44 * M, 12).rotateZ(Math.PI / 2).translate(0, 0.5 * M, 0));
    for (let i = 0; i < 5; i++) add('paint_green', new THREE.TorusGeometry(0.15 * M, 0.025 * M, 5, 14).rotateY(Math.PI / 2).translate((i - 2) * 0.075 * M, 0.5 * M, 0));
    add('iron', new THREE.CylinderGeometry(0.015 * M, 0.015 * M, 0.56 * M, 6).rotateZ(Math.PI / 2).translate(0, 0.86 * M, -0.12 * M));    // handle
    add('iron', box(0.04 * M, 0.3 * M, 0.04 * M, 0.27 * M, 0.5 * M, 0));                                                         // crank
    add('paint_green', tube([[0.1 * M, 0.38 * M, 0.12 * M], [0.15 * M, 0.1 * M, 0.35 * M], [0.05 * M, 0.05 * M, 0.7 * M], [-0.2 * M, 0.05 * M, 0.9 * M]], 0.02 * M, 8));
    add('paint_yellow', new THREE.CylinderGeometry(0.03 * M, 0.025 * M, 0.14 * M, 6).rotateZ(Math.PI / 2).translate(-0.27 * M, 0.05 * M, 0.9 * M));   // spray nozzle
  },

  /** Galvanized watering can (rose to +x). */
  wateringCan(add: Add): void {
    add('steel', cylY(0.12 * M, 0.26 * M, 0, 0, 0, 12));
    add('steel', new THREE.TorusGeometry(0.1 * M, 0.012 * M, 4, 10, Math.PI).translate(0, 0.27 * M, 0));
    add('steel', new THREE.CylinderGeometry(0.012 * M, 0.025 * M, 0.38 * M, 6).rotateZ(-0.95).translate(0.25 * M, 0.2 * M, 0));
    add('steel', new THREE.CylinderGeometry(0.045 * M, 0.02 * M, 0.05 * M, 8).rotateZ(-Math.PI / 2 + 0.3).translate(0.41 * M, 0.31 * M, 0));
  },

  /** Electric greenhouse heater (1.5 kW, on the powered circuit: sim/greenhouse.ts), grille to +z, cord out the back. */
  heater(add: Add): void {
    add('paint_red', box(0.36 * M, 0.42 * M, 0.24 * M, 0, 0.05 * M, 0));
    for (const sx of [-1, 1]) add('iron', box(0.05 * M, 0.05 * M, 0.32 * M, sx * 0.14 * M, 0, 0));
    add('iron', box(0.3 * M, 0.3 * M, 0.01 * M, 0, 0.1 * M, 0.12 * M));
    for (let k = 0; k < 4; k++) add('lamp', box(0.26 * M, 0.025 * M, 0.006 * M, 0, (0.14 + k * 0.065) * M, 0.127 * M));   // the elements, glowing
    add('enamel', new THREE.CylinderGeometry(0.03 * M, 0.03 * M, 0.03 * M, 8).rotateX(Math.PI / 2).translate(0.12 * M, 0.44 * M, 0.12 * M));   // thermostat knob
    add('iron', box(0.16 * M, 0.04 * M, 0.04 * M, 0, 0.47 * M, 0));                                    // handle
  },

  /** Thermometer over a hygrometer on a post, dials to +z. */
  gaugePost(add: Add): void {
    add('wood_mid', box(0.06 * M, 1.6 * M, 0.06 * M, 0, 0, 0));
    for (const [y, r] of [[1.45, 0.07], [1.25, 0.055]] as const) {
      add('enamel', new THREE.CylinderGeometry(r * M, r * M, 0.02 * M, 14).rotateX(Math.PI / 2).translate(0, y * M, 0.04 * M));
      add('iron', new THREE.TorusGeometry(r * M, 0.008 * M, 4, 14).translate(0, y * M, 0.05 * M));
      add('paint_red', box(0.006 * M, r * 0.8 * M, 0.004 * M, 0, 0, 0).rotateZ(0.6).translate(0, y * M, 0.052 * M));   // needle
    }
  },
};

/** Everything inside the greenhouse (interior layer, local frame). */
function furnishGreenhouse(p: Parts): void {
  const { W, D, E, R } = GH;
  const hw = W / 2, hd = D / 2, add: Add = (m, g) => p.add(m, g);
  const put = (at: Place, fn: (a: Add) => void, solid = true) => { const c = piece(p.sink, 'interior', at, fn, solid); if (c) p.collide(c); };

  // ── benches with flats of seedlings, each flat on a drip line from the bench header ──
  const bench = (sx: number, z0: number, z1: number) => {
    const x = sx * BENCH_X, len = z1 - z0, zc = (z0 + z1) / 2, hx = sx * HEAD_X;
    add('wood_mid', box(BENCH_W, 0.04 * M, len, x, BENCH_Y - 0.04 * M, zc));
    const nl = Math.max(1, Math.round(len / (1.2 * M)));
    for (let i = 0; i <= nl; i++) {
      const lz = z0 + 0.008 + i * (len - 0.016) / nl;
      for (const lx of [-1, 1]) add('aluminum', box(0.04 * M, BENCH_Y - 0.04 * M, 0.04 * M, x + lx * (BENCH_W / 2 - 0.05 * M), 0, lz));
      add('aluminum', box(0.02 * M, 0.06 * M, 0.02 * M, hx, BENCH_Y, lz));                                   // header bracket
    }
    for (const lx of [-1, 1]) add('aluminum', box(0.03 * M, 0.03 * M, len, x + lx * (BENCH_W / 2 - 0.05 * M), 0.25 * M, zc));   // stretchers
    add('enamel', pipe([hx, HEAD_Y, z0 + 0.004], [hx, HEAD_Y, z1 - 0.004], PVC, 6));
    add('enamel', cylY(PVC * 1.3, 0.025 * M, hx, HEAD_Y - 0.012 * M, z0 + 0.004, 6));       // end cap
    const trays = Math.floor(len / (0.55 * M));
    for (let i = 0; i < trays; i++) for (const k of [-1, 1]) {
      if (p.rnd() < 0.12) continue;
      const tz = z0 + (i + 0.5) * len / trays, tx = x + k * 0.17 * M;
      GreenhouseKit.tray((m, g) => add(m, g.translate(tx, BENCH_Y, tz)), p.rnd);
      // spaghetti line from the header over the rim to a stake emitter among the plugs
      const ex = tx + 0.04 * M, ez = tz + 0.045 * M, ey = BENCH_Y + 0.07 * M;
      add('rubber', tube([[hx, HEAD_Y, tz + 0.03 * M], [(hx + ex) / 2, HEAD_Y + 0.05 * M, ez], [ex, ey + 0.05 * M, ez], [ex, ey + 0.01 * M, ez]], DRIP, 5));
      add('paint_red', cylY(0.018 * M, 0.03 * M, ex, ey - 0.005 * M, ez, 6));
      add('rubber', box(0.008 * M, 0.08 * M, 0.008 * M, ex, ey - 0.07 * M, ez));
    }
    const pots = Math.max(2, Math.round(len / (0.25 * M) / 4));
    for (let i = 0; i < pots; i++) add('paint_red', new THREE.CylinderGeometry(0.1 * M, 0.08 * M, 0.18 * M, 7).translate(x + (p.rnd() - 0.5) * 0.3 * M, 0.09 * M, z0 + (i + 0.5) * len / pots));
    p.collide({ x0: x - BENCH_W / 2, z0, x1: x + BENCH_W / 2, z1 });
  };
  bench(1, BENCH_Z0, BENCH_Z1);
  bench(-1, LEFT_Z0, BENCH_Z1);

  // ── the tomato bed (back left): strung plants at the front, two in cages at the back ──
  const bx = -BENCH_X, bw = BENCH_W, eh = 0.2 * M, soilY = 0.15 * M;
  for (const sx of [-1, 1]) add('wood_mid', box(0.05 * M, eh, BED_Z1 - BED_Z0, bx + sx * (bw / 2 - 0.025 * M), 0, (BED_Z0 + BED_Z1) / 2));
  for (const z of [BED_Z0, BED_Z1]) add('wood_mid', box(bw, eh, 0.05 * M, bx, 0, z + (z === BED_Z0 ? 0.025 : -0.025) * M));
  add('soil', box(bw - 0.1 * M, soilY, BED_Z1 - BED_Z0 - 0.1 * M, bx, 0, (BED_Z0 + BED_Z1) / 2));
  const plants = [BED_Z1 - 0.025, BED_Z1 - 0.115, BED_Z1 - 0.205, BED_Z0 + 0.14, BED_Z0 + 0.05];
  const wireY = E - 0.01;
  add('steel', box(0.006 * M, 0.006 * M, BED_Z1 - BED_Z0 - 0.02, bx, wireY, (BED_Z0 + BED_Z1) / 2));
  for (const z of [BED_Z0 + 0.03, (BED_Z0 + BED_Z1) / 2, BED_Z1 - 0.03]) add('aluminum', box(0.012 * M, (R - E) * (1 - Math.abs(bx) / hw) + 0.008, 0.012 * M, bx, wireY, z));
  for (const [i, z] of plants.entries()) {
    const strung = i < 3, h = (strung ? 1.45 : 1.0) * M * (0.9 + 0.2 * p.rnd());
    const lean = (p.rnd() - 0.5) * 0.04 * M;
    add('crop', pipe([bx, soilY, z], [bx + lean, soilY + h, z + lean], 0.018 * M, 5));
    for (let k = 0; k < (strung ? 7 : 6); k++) {
      const y = soilY + 0.15 * M + k * h / (strung ? 7.5 : 6.5), a = k * 2.4 + i;
      const r = (strung ? 0.13 : 0.17) * M;
      add('crop', new THREE.IcosahedronGeometry(r, 0).scale(1.2, 0.55, 1).translate(bx + Math.cos(a) * r * 0.7, y, z + Math.sin(a) * r * 0.7));
      if (k > 0 && k < 4 && p.rnd() < 0.8) for (let f = 0; f < 3; f++) add(f === 2 && k > 2 ? 'crop' : 'paint_red', new THREE.IcosahedronGeometry(0.032 * M, 0).translate(bx - Math.cos(a) * 0.06 * M + f * 0.03 * M, y - 0.06 * M - f * 0.02 * M, z - Math.sin(a) * 0.06 * M));
    }
    if (strung) {
      // twine from the wire down round the stem to a clip at the base
      add('linen', tube([[bx, wireY, z], [bx + 0.03 * M, soilY + h * 0.7, z + 0.02 * M], [bx - 0.03 * M, soilY + h * 0.35, z - 0.02 * M], [bx, soilY + 0.05 * M, z]], 0.006 * M, 6));
    } else {
      // a wire cage: three rings on four legs
      for (const [k, rr] of [[0.25, 0.17], [0.55, 0.21], [0.85, 0.25]] as const) add('steel', new THREE.TorusGeometry(rr * M, 0.006 * M, 3, 12).rotateX(Math.PI / 2).translate(bx, soilY + k * M, z));
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + 0.4;
        add('steel', pipe([bx + Math.cos(a) * 0.15 * M, soilY - 0.1 * M, z + Math.sin(a) * 0.15 * M], [bx + Math.cos(a) * 0.25 * M, soilY + 0.86 * M, z + Math.sin(a) * 0.25 * M], 0.006 * M, 3));
      }
    }
    add('paint_red', cylY(0.018 * M, 0.03 * M, bx + 0.05 * M, soilY + DRIP * 2, z, 6));   // emitter on the bed line
  }
  p.collide({ x0: bx - bw / 2, z0: BED_Z0, x1: bx + bw / 2, z1: BED_Z1 });

  // ── water: rain barrel outside right of the door, through the wall to the valve and timer, round to both benches ──
  const fz = FRONT_Z, backZ = -hd + 0.02, floorY = 0.012;
  // the inlet through the gable and the riser: ball valve, battery timer, disc filter
  add('enamel', pipe([INLET_X, INLET_Y, hd + 0.03], [INLET_X, INLET_Y, fz], PVC, 6));
  add('enamel', pipe([INLET_X, INLET_Y, fz], [INLET_X, HEAD_Y, fz], PVC, 6));
  add('steel', cylY(0.032 * M, 0.06 * M, INLET_X, 0.088, fz, 8));
  add('paint_red', box(0.14 * M, 0.02 * M, 0.025 * M, INLET_X + 0.06 * M, 0.088 + 0.04 * M, fz - 0.03 * M));      // valve lever
  add('paint_yellow', box(0.11 * M, 0.14 * M, 0.08 * M, INLET_X, 0.103, fz - 0.035 * M));                           // timer
  add('enamel', box(0.07 * M, 0.05 * M, 0.005 * M, INLET_X, 0.103 + 0.07 * M, fz - 0.077 * M));                     // its display
  add('blue_tank', cylY(0.035 * M, 0.1 * M, INLET_X, 0.128, fz, 8));                                                  // disc filter
  add('steel', box(0.03 * M, 0.03 * M, 0.08 * M, INLET_X - 0.04 * M, INLET_Y, fz - 0.03 * M));                       // hose bib for the reel
  // along the front wall to the right bench header; the header's far end drops to the floor and crosses the back wall
  add('enamel', pipe([INLET_X, HEAD_Y, fz], [HEAD_X, HEAD_Y, fz], PVC, 6));
  add('enamel', pipe([HEAD_X, HEAD_Y, fz], [HEAD_X, HEAD_Y, BENCH_Z1 - 0.004], PVC, 6));
  const rz0 = BENCH_Z0 - 0.005, lz0 = LEFT_Z0 - 0.005;                // drops just past the bench ends (clear of the legs)
  add('enamel', pipe([HEAD_X, HEAD_Y, BENCH_Z0 + 0.004], [HEAD_X, HEAD_Y, rz0], PVC, 6));
  add('enamel', pipe([HEAD_X, HEAD_Y, rz0], [HEAD_X, floorY, rz0], PVC, 6));
  add('enamel', pipe([HEAD_X, floorY, rz0], [HEAD_X, floorY, backZ], PVC, 6));
  const lwx = -(hw - 0.007);
  add('enamel', pipe([HEAD_X, floorY, backZ], [lwx, floorY, backZ], PVC, 6));
  // left: along the wall outside the bed edge, in under the bench end, up to the left bench header
  add('enamel', pipe([lwx, floorY, backZ], [lwx, floorY, lz0], PVC, 6));
  add('enamel', pipe([lwx, floorY, lz0], [-HEAD_X, floorY, lz0], PVC, 6));
  add('enamel', pipe([-HEAD_X, floorY, lz0], [-HEAD_X, HEAD_Y, lz0], PVC, 6));
  add('enamel', pipe([-HEAD_X, HEAD_Y, lz0], [-HEAD_X, HEAD_Y, LEFT_Z0 + 0.004], PVC, 6));
  for (const [x, y, z] of [[INLET_X, INLET_Y, fz], [INLET_X, HEAD_Y, fz], [HEAD_X, HEAD_Y, fz], [HEAD_X, HEAD_Y, rz0], [HEAD_X, floorY, rz0], [HEAD_X, floorY, backZ], [lwx, floorY, backZ], [lwx, floorY, lz0], [-HEAD_X, floorY, lz0], [-HEAD_X, HEAD_Y, lz0], [bx, floorY, backZ]] as const) add('enamel', fitting(x, y, z));
  // the bed's drip line: a tee off the back cross, over the edge board, down the row of plants
  add('rubber', tube([[bx, floorY, backZ], [bx, eh + 0.01 * M, BED_Z0 + 0.01], [bx + 0.05 * M, soilY + DRIP, BED_Z0 + 0.03]], DRIP * 1.4, 5));
  add('rubber', pipe([bx + 0.05 * M, soilY + DRIP, BED_Z0 + 0.03], [bx + 0.05 * M, soilY + DRIP, BED_Z1 - 0.01], DRIP * 1.4, 4));
  // gutter along the right eave, downspout into the barrel on its blocks
  add('aluminum', box(0.08 * M, 0.06 * M, D + 0.02, hw + 0.012, E - 0.012, 0));
  add('aluminum', pipe([hw + 0.012, E - 0.012, hd - 0.008], [hw + 0.012, 0.24, hd - 0.008], 0.03 * M, 6));
  add('aluminum', pipe([hw + 0.012, 0.24, hd - 0.008], [INLET_X + 0.015, 0.222, hd + 0.07], 0.03 * M, 6));
  const brl: Place = { x: INLET_X + 0.01, z: hd + 0.072 };
  put(brl, a => {
    // a timber stand lifts it 40 cm for head to the drip lines
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) a('wood_mid', box(0.08 * M, 0.36 * M, 0.08 * M, sx * 0.2 * M, 0, sz * 0.2 * M));
    a('wood_mid', box(0.56 * M, 0.04 * M, 0.56 * M, 0, 0.36 * M, 0));
    a('blue_tank', cylY(0.29 * M, 0.86 * M, 0, 0.4 * M, 0, 14));
    a('blue_tank', cylY(0.3 * M, 0.03 * M, 0, 1.26 * M, 0, 14));
    for (const y of [0.6, 1.0]) a('blue_tank', new THREE.TorusGeometry(0.29 * M, 0.015 * M, 4, 14).rotateX(Math.PI / 2).translate(0, y * M, 0));
    a('steel', box(0.04 * M, 0.04 * M, 0.12 * M, -0.06 * M, 0.47 * M, -0.3 * M));                           // spigot
    a('enamel', pipe([-0.06 * M, 0.47 * M, -0.36 * M], [-0.06 * M, 0.47 * M, -0.44 * M], PVC, 6));
  });
  // the hose reel and its feed from the bib, a watering can by the barrel wall
  put({ x: 0.12, z: hd - 0.07, rot: Math.PI }, a => GreenhouseKit.hoseReel(a));
  add('paint_green', tube([[INLET_X - 0.04 * M, INLET_Y, fz - 0.045 * M], [INLET_X - 0.03, INLET_Y - 0.02, fz - 0.02], [0.14, 0.05, hd - 0.06]], 0.02 * M, 6));
  put({ x: 0.25, z: hd - 0.06, rot: -2.4 }, a => GreenhouseKit.wateringCan(a), false);

  // ── potting bench across the back wall at the end of the aisle; the exhaust fan above it ──
  put({ x: 0, z: (POT_Z0 + POT_Z1) / 2 }, a => GreenhouseKit.pottingBench(a, p.rnd));
  const fx = -hw / 4, fy = 0.3, fzB = -hd, fs = 0.5 * M;
  for (const [w, h, x, y] of [[fs, 0.04 * M, fx, fy - fs / 2], [fs, 0.04 * M, fx, fy + fs / 2 - 0.04 * M], [0.04 * M, fs, fx - fs / 2 + 0.02 * M, fy - fs / 2], [0.04 * M, fs, fx + fs / 2 - 0.02 * M, fy - fs / 2]] as const) add('aluminum', box(w, h, 0.16 * M, x, y, fzB + 0.08 * M));
  add('steel', new THREE.CylinderGeometry(0.21 * M, 0.21 * M, 0.14 * M, 16, 1, true).rotateX(Math.PI / 2).translate(fx, fy, fzB + 0.08 * M));
  for (let k = 0; k < 3; k++) add('iron', box(0.17 * M, 0.08 * M, 0.01 * M, 0, -0.04 * M, 0).rotateX(0.35).translate(0.1 * M, 0, 0).rotateZ(k * Math.PI * 2 / 3).translate(fx, fy, fzB + 0.09 * M));   // blades
  add('iron', cylY(0.07 * M, 0.16 * M, 0, 0, 0, 10).rotateX(Math.PI / 2).translate(fx, fy, fzB + 0.1 * M));     // motor
  for (const r of [0.08, 0.15, 0.21]) add('steel', new THREE.TorusGeometry(r * M, 0.006 * M, 3, 16).translate(fx, fy, fzB + 0.16 * M));   // guard
  add('steel', box(fs - 0.06 * M, 0.008 * M, 0.008 * M, fx, fy, fzB + 0.16 * M));
  for (let k = 0; k < 5; k++) add('aluminum', box(fs - 0.04 * M, 0.06 * M, 0.01 * M, fx, fy - fs / 2 + 0.04 * M + k * 0.09 * M, fzB - 0.008));   // shutter louvres outside
  // thermostat on the back post, the fan cord up to it and the plug down to a GFCI outlet
  add('enamel', box(0.1 * M, 0.14 * M, 0.04 * M, -hw / 2 + 0.012, 0.19, -hd + 0.012));
  add('rubber', tube([[fx + 0.07 * M, fy, fzB + 0.12 * M], [-hw / 2 + 0.03, fy - 0.03, -hd + 0.02], [-hw / 2 + 0.012, 0.19 + 0.14 * M, -hd + 0.015]], 0.012 * M, 5));
  add('rubber', pipe([-hw / 2 + 0.012, 0.19, -hd + 0.016], [-hw / 2 + 0.012, 0.075, -hd + 0.016], 0.012 * M, 4));
  add('enamel', box(0.08 * M, 0.12 * M, 0.04 * M, -hw / 2 + 0.012, 0.06, -hd + 0.012));
  // intake shutter over the door
  for (let k = 0; k < 3; k++) add('aluminum', box(0.42 * M, 0.04 * M, 0.01 * M, 0, GH.doorH + 0.022 + k * 0.012, hd + 0.006));
  add('aluminum', box(0.46 * M, 0.2 * M, 0.02 * M, 0, GH.doorH + 0.016, hd - 0.002));

  // ── seed rack by the door (left), the electric heater beside the left bench, gauges on a post ──
  put({ x: -0.18, z: hd - 0.012 - 0.2 * M, rot: Math.PI }, a => GreenhouseKit.seedRack(a, p.rnd));
  put({ x: -0.118, z: 0.12, rot: Math.PI / 2 }, a => GreenhouseKit.heater(a));
  // its cord under the bench to an outlet on the wall post; the circuit runs in conduit along the wall to the back
  const wx = -hw + 0.007, ox = -hw / 2 + 0.012;
  add('rubber', tube([[-0.14, 0.02, 0.12], [-0.2, 0.004, 0.11], [wx + 0.004, 0.004, 0.105], [wx + 0.004, 0.05, 0.1]], 0.012 * M, 6));
  add('enamel', box(0.04 * M, 0.12 * M, 0.08 * M, wx, 0.05, 0.1));
  add('steel', pipe([wx, 0.07, 0.1], [wx, 0.07, -hd + 0.016], 0.012 * M, 4));
  add('steel', pipe([wx, 0.07, -hd + 0.016], [ox, 0.07, -hd + 0.016], 0.012 * M, 4));
  put({ x: BENCH_X - BENCH_W / 2 + 0.006, z: BENCH_Z1 + 0.012, rot: -0.7 }, a => GreenhouseKit.gaugePost(a), false);

  // ── overhead: three hanging baskets of petunias (red and white) from the ridge, the shade cloth rolled up along it ──
  const ridgeY = R - 0.016;
  for (const z of [0.3, 0.0, -0.3]) {
    const by = 1.9 * M, br = 0.17 * M;
    add('paint_green', new THREE.SphereGeometry(br, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, by + br, z));
    add('crop', new THREE.SphereGeometry(br * 1.05, 8, 5).scale(1, 0.55, 1).translate(0, by + br, z));
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9 + z * 7;
      add('crop', new THREE.ConeGeometry(0.07 * M, 0.2 * M, 5).rotateX(Math.PI).translate(Math.cos(a) * br * 0.95, by + br - 0.06 * M, z + Math.sin(a) * br * 0.95));   // trailing stems
      add(k % 3 ? 'paint_red' : 'linen', new THREE.IcosahedronGeometry(0.035 * M, 0).translate(Math.cos(a + 0.4) * br * 0.8, by + br * 1.25, z + Math.sin(a + 0.4) * br * 0.8));
    }
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3;
      add('iron', pipe([Math.cos(a) * br, by + br, z + Math.sin(a) * br], [0, ridgeY - 0.012, z], 0.004 * M, 3));
    }
    add('iron', new THREE.TorusGeometry(0.02 * M, 0.005 * M, 3, 6).translate(0, ridgeY - 0.006, z));
  }
  const rollX = 0.035, rollY = R - (R - E) * (rollX / hw) - 0.026;
  add('rubber', new THREE.CylinderGeometry(0.075 * M, 0.075 * M, D - 0.08, 10).rotateX(Math.PI / 2).translate(rollX, rollY, 0));
  for (const z of [-0.45, -0.15, 0.15, 0.45]) add('linen', new THREE.TorusGeometry(0.08 * M, 0.008 * M, 3, 10).translate(rollX, rollY, z));
}

function greenhouse(_def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const { W, D, E, R, doorW, doorH } = GH;
  const hw = W / 2, hd = D / 2, t = 0.04 * M * 1.5, pane = 0.004;
  // site: corner stakes
  p.layer = 'stakes';
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) p.add('trim', box(0.012, 0.09, 0.012, x, -0.02, z));
  // foundation: a pea-gravel bed inside a low concrete curb, a gravel apron at the door
  p.layer = 'foundation';
  p.add('gravel', box(W - 0.01, 0.006, D - 0.01, 0, -0.002, 0));
  for (const [w, d, x, z] of [[W + 0.02, 0.02, 0, -hd], [W + 0.02, 0.02, 0, hd], [0.02, D, -hw, 0], [0.02, D, hw, 0]] as const) p.add('concrete', box(w, 0.025, d, x, -0.01, z));
  p.add('gravel', box(doorW * 1.6, 0.005, 0.12, 0, -0.002, hd + 0.07));
  // deck: the center aisle of 45 cm pavers (two across) from the door to the potting bench, edged with concrete
  p.layer = 'deck';
  const aisleW = 0.9 * M, aisleZ0 = POT_Z1 + 0.004;
  p.add('pavers', box(aisleW, 0.007, hd - aisleZ0 - 0.005, 0, 0.001, (hd + aisleZ0) / 2 - 0.0025));
  for (const sx of [-1, 1]) p.add('concrete', box(0.06 * M, 0.01, hd - aisleZ0, sx * (aisleW / 2 + 0.03 * M), 0, (hd + aisleZ0) / 2));
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
  // interior: benches, the tomato bed, drip irrigation, the potting bench and the rest of the kit
  p.layer = 'interior';
  furnishGreenhouse(p);
  // colliders: the walls with the door gap (the furniture adds its own)
  const c = 0.012;
  p.collide({ x0: -hw - c, z0: -hd - c, x1: hw + c, z1: -hd + c });
  p.collide({ x0: -hw - c, z0: -hd, x1: -hw + c, z1: hd });
  p.collide({ x0: hw - c, z0: -hd, x1: hw + c, z1: hd });
  p.collide({ x0: -hw - c, z0: hd - c, x1: -doorW / 2, z1: hd + c });
  p.collide({ x0: doorW / 2, z0: hd - c, x1: hw + c, z1: hd + c });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Orchard: rows of semi-dwarf apple, pear, cherry and plum trees on a 3.6 × 4.5 m grid (sim/orchard.ts: one column, one fruit)
// ─────────────────────────────────────────────────────────────────────────

export type FruitKind = Fruit;
/** Tree positions (local) and kinds: a column of the grid is a row of one fruit (sim/orchard.ts `orchardColumns`). */
export function orchardTrees(def: KitPieceDef): Array<{ x: number; z: number; kind: FruitKind }> {
  const LW = def.cellsX * CELL, LD = def.cellsZ * CELL;
  const out: Array<{ x: number; z: number; kind: FruitKind }> = [];
  if (!isOrchard(def.id)) return out;
  const { cols, rows } = ORCHARD_GRID[def.id], fruits = orchardColumns(def.id);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: (c - (cols - 1) / 2) * LW / cols, z: (r - (rows - 1) / 2) * LD / (rows + 0.3), kind: fruits[c] });
  return out;
}

/**
 * How each fruit's tree is drawn: trunk height (m), canopy radius (m) and its x / y / z stretch (a round apple, an upright pear,
 * a tall open cherry, a low spreading plum), the limb lean, the leaf, and the fruit: material, radius (m) and how many on a tree.
 */
const TREE: Record<FruitKind, { trunk: number; crown: number; shape: [number, number, number]; lean: number; limbs: number; leaf: 'hedge' | 'hedge2'; fruit: KitMaterialId; fruitR: number; fruitN: number; blossom: KitMaterialId }> = {
  apple:  { trunk: 0.8, crown: 1.4, shape: [1, 0.88, 1], lean: 0.6, limbs: 4, leaf: 'hedge', fruit: 'fruit', fruitR: 0.13, fruitN: 22, blossom: 'blossom_apple' },
  pear:   { trunk: 0.8, crown: 1.35, shape: [0.8, 1.25, 0.8], lean: 0.35, limbs: 3, leaf: 'hedge2', fruit: 'paint_yellow', fruitR: 0.13, fruitN: 20, blossom: 'blossom_pear' },
  cherry: { trunk: 1.0, crown: 1.5, shape: [0.92, 1.12, 0.92], lean: 0.5, limbs: 4, leaf: 'hedge', fruit: 'fruit_cherry', fruitR: 0.07, fruitN: 36, blossom: 'blossom_cherry' },
  plum:   { trunk: 0.65, crown: 1.3, shape: [1.18, 0.74, 1.18], lean: 0.85, limbs: 4, leaf: 'hedge2', fruit: 'fruit_plum', fruitR: 0.09, fruitN: 26, blossom: 'blossom_plum' },
};

/** The orchard and the grove share one builder (the grove is the same trees, four times as many, with lighter canopies and fruit). */
export function orchardBuilder(def: KitPieceDef, seed = 1): THREE.Group {
  return orchard(def, seed);
}

function orchard(def: KitPieceDef, seed = 1): THREE.Group {
  const grove = def.id === 'orchard_grove' || def.id === 'orchard_terraced';
  const LW = def.cellsX * CELL, LD = def.cellsZ * CELL;
  const p = new Parts(seed);
  const x0 = -LW / 2 + 0.04, x1 = LW / 2 - 0.04, z0 = -LD / 2 + 0.04, z1 = LD / 2 - 0.04;
  // the terraced plot: three benches of two rows, the back one highest, each held by a dry-stack wall (sim/orchard.ts TERRACE)
  const terr = def.id === 'orchard_terraced', STEP = 0.8 * M, rowsN = isOrchard(def.id) ? ORCHARD_GRID[def.id].rows : 6, rowZ = LD / (rowsN + 0.3);
  const benchOf = (z: number): number => Math.floor(Math.max(0, Math.min(rowsN - 1, Math.round(z / rowZ + (rowsN - 1) / 2))) / 2);
  const benchY = (z: number): number => (2 - benchOf(z)) * STEP;
  p.layer = 'stakes';
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) p.add('trim', box(0.012, 0.09, 0.012, x, -0.02, z));
  if (terr) {
    for (let b = 0; b < 3; b++) {
      const top = (2 - b) * STEP, zb0 = z0 + b * (z1 - z0) / 3, zb1 = z0 + (b + 1) * (z1 - z0) / 3, depth = zb1 - zb0, W = x1 - x0, cx = (x0 + x1) / 2, cz = (zb0 + zb1) / 2;
      if (top <= 0) { p.add('fieldstone', box(W, 0.06 * M, 0.5 * M, cx, 0, zb1 + 0.1 * M), 'foundation'); continue; }
      p.add('fieldstone', box(W + 0.4 * M, 0.25 * M, depth + 0.5 * M, cx, -0.2 * M, cz), 'foundation');                       // the footing course
      // the dry-stack wall at the front of the bench: courses of rough blocks, each laid half a block over the one below
      const courses = Math.max(2, Math.round(top / (0.22 * M)));
      for (let c = 0; c < courses; c++) {
        const ch = top / courses, n = Math.round(W / (0.9 * M));
        for (let k = 0; k < n; k++) {
          const bw = W / n, off = (c % 2 ? 0.5 : 0) * bw * 0.8;
          const x = x0 + bw * (k + 0.5) + off - (c % 2 ? bw * 0.4 : 0);
          if (x - bw / 2 < x0 - 0.05 || x + bw / 2 > x1 + 0.05) continue;
          p.add('fieldstone', box(bw * (0.92 + 0.08 * p.rnd()), ch * 0.96, 0.45 * M, x, c * ch, zb1 + (p.rnd() - 0.5) * 0.04 * M), 'frame');
        }
      }
      p.add('fieldstone', box(W, 0.05 * M, 0.55 * M, cx, top, zb1), 'frame');                                                  // the cap course
      // the bench: filled behind the wall, soil on top, a lip of stones at the back
      p.add('earth', box(W, top, depth, cx, 0, cz - 0.2 * M), 'roof');
      p.add('soil', box(W - 0.1 * M, 0.04 * M, depth - 0.3 * M, cx, top, cz - 0.05 * M), 'roof');
    }
    // a stair of flat stones at the left end, up the three benches
    for (let i = 0; i < 6; i++) p.add('fieldstone', box(1.0 * M, 0.2 * M, 0.5 * M, x0 + 0.5 * M, i * 0.27 * M, z1 - 0.3 * M - i * (z1 - z0) / 3 * 0.42), 'frame');
  }
  for (const t of orchardTrees(def)) {
    const T = TREE[t.kind];
    const ty = terr ? benchY(t.z) : 0;
    const put = (m: KitMaterialId, g: THREE.BufferGeometry, l?: Parameters<Parts['add']>[2]): void => p.add(m, ty ? g.translate(0, ty, 0) : g, l);
    const s = 0.85 + 0.3 * p.rnd(), j = (p.rnd() - 0.5) * 0.03;
    const x = t.x + j, z = t.z - j;
    put('trim', box(0.01, 0.06, 0.01, x, -0.01, z), 'stakes');
    // foundation: the planting hole and a mulch ring
    put('soil', new THREE.CylinderGeometry(0.065, 0.07, 0.008, 12).translate(x, 0.0, z), 'foundation');
    // frame: the trunk and scaffold limbs (bare in winter)
    const trunkH = T.trunk * M * s;
    put('wood_dark', new THREE.CylinderGeometry(0.06 * M * s, 0.09 * M * s, trunkH, 6).translate(x, trunkH / 2, z), 'frame');
    for (let k = 0; k < T.limbs; k++) {
      const a = (k / T.limbs) * Math.PI * 2 + p.rnd(), len = 1.5 * M * s;
      const g = new THREE.CylinderGeometry(0.025 * M * s, 0.05 * M * s, len, 5).translate(0, len / 2, 0).rotateZ(T.lean).rotateY(a).translate(x, trunkH * 0.95, z);
      put('wood_dark', g, 'frame');
    }
    // roof stage: a stake and a white trunk guard
    put('wood_mid', box(0.008, 0.25, 0.008, x + 0.03, 0, z), 'rafters');
    put('trim', new THREE.CylinderGeometry(0.1 * M, 0.1 * M, 0.45 * M, 8, 1, true).translate(x, 0.225 * M, z), 'rafters');
    // finish: the canopy and the fruit
    const cr = T.crown * M * s;
    const [sx, sy, sz] = T.shape;
    const cy = trunkH + cr * sy * 0.85;
    const leaf = T.leaf;
    put(leaf, new THREE.IcosahedronGeometry(cr, 2).scale(sx, sy, sz).translate(x, cy, z), 'interior');
    for (let k = 0; k < (grove ? 3 : 5); k++) {
      const a = p.rnd() * Math.PI * 2, r = cr * 0.6;
      put(k % 2 ? 'hedge2' : leaf, new THREE.IcosahedronGeometry(cr * (0.45 + 0.15 * p.rnd()), 1).scale(sx, sy, sz).translate(x + Math.cos(a) * r * sx, cy + (p.rnd() - 0.6) * cr * 0.5, z + Math.sin(a) * r * sz), 'interior');
    }
    // fruit dots and blossom clusters on the outside of the canopy (the world shows each by the fruit's own season: HomesteadWorld, sim/orchard.ts `fruitLook`)
    const onCanopy = (rad: number, mat: KitMaterialId, n: number, lo: number): void => {
      for (let k = 0; k < n; k++) {
        const a = p.rnd() * Math.PI * 2, e = (p.rnd() - lo) * 1.1;
        const fx = Math.cos(a) * Math.cos(e) * cr * sx * 1.02, fy = Math.sin(e) * cr * sy * 1.02, fz = Math.sin(a) * Math.cos(e) * cr * sz * 1.02;
        put(mat, new THREE.IcosahedronGeometry(rad * M, 0).translate(x + fx, cy + fy, z + fz), 'decor');
      }
    };
    onCanopy(T.fruitR, T.fruit, grove ? Math.round(T.fruitN * 0.4) : T.fruitN, 0.35);
    onCanopy(0.17, T.blossom, grove ? 40 : 90, 0.12);
    p.collide({ x0: x - 0.03, z0: z - 0.03, x1: x + 0.03, z1: z + 0.03 });
  }
  // finish: drip irrigation (the orchard's water): a valve box at the front corner, a mainline up the
  // side, a lateral down each row, and a ring of emitter line round each tree on its mulch
  p.layer = 'openings';
  const trees = orchardTrees(def), rows = [...new Set(trees.map(t => t.z))], mx = x0 + 0.03, lr = 0.06, dr = 0.016 * M;
  const vz = z1 - 0.16;
  p.add('paint_green', box(0.5 * M, 0.25 * M, 0.35 * M, mx, -0.01, vz));
  p.add('paint_green', box(0.42 * M, 0.025 * M, 0.27 * M, mx, 0.25 * M - 0.01, vz));                    // its lid
  p.add('rubber', pipe([mx, 0.006, vz - 0.03], [mx, 0.006, Math.min(...rows) + lr], dr * 1.5, 5));
  p.add('rubber', pipe([mx, 0.006, vz + 0.03], [mx, 0.006, z1 + 0.02], dr * 1.5, 5));          // in from the house line
  for (const rz of rows) {
    const lz = rz + lr, xs = trees.filter(t => t.z === rz).map(t => t.x);
    p.add('rubber', pipe([mx, 0.006, lz], [Math.max(...xs) + 0.03, 0.006, lz], dr, 4));
    p.add('rubber', new THREE.SphereGeometry(dr * 2.5, 5, 3).translate(mx, 0.006, lz));
  }
  for (const t of trees) {
    p.add('rubber', new THREE.TorusGeometry(lr, dr, 3, 18).rotateX(Math.PI / 2).translate(t.x, 0.008, t.z));
    for (let k = 0; k < 4; k++) p.add('paint_green', new THREE.CylinderGeometry(0.02 * M, 0.02 * M, 0.025 * M, 5).translate(t.x + Math.cos(k * Math.PI / 2 + 0.8) * lr, 0.012, t.z + Math.sin(k * Math.PI / 2 + 0.8) * lr));
  }
  // a picking ladder and bushel crates at the front
  for (let i = 0; i < 3; i++) p.add('wood_mid', box(0.5 * M, 0.3 * M, 0.4 * M, -0.2 + i * 0.1, i > 1 ? 0.3 * M : 0, z1 - 0.06));
  const lad = (g: THREE.BufferGeometry) => g.rotateX(-0.25).translate(0.45, 0, z1 - 0.12);
  for (const lx of [-0.2 * M, 0.2 * M]) p.add('wood_mid', lad(box(0.05 * M, 2.4 * M, 0.05 * M, lx, 0, 0)));
  for (let r = 1; r < 6; r++) p.add('wood_mid', lad(box(0.4 * M, 0.04 * M, 0.04 * M, 0, r * 0.4 * M, 0)));
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

// ────────────────────────────────────────────────────
// Wood-fired bread oven: stone base, cob dome, flue, a roof over the working side
// ────────────────────────────────────────────────────

function woodOven(_def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = 0.26, D = 0.3;
  p.layer = 'stakes';
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) p.add('trim', box(0.012, 0.09, 0.012, x, -0.02, z));
  // foundation: footing and the stone base (a hearth-high plinth with a wood storage arch)
  p.add('concrete', box(W + 0.04, 0.02, D + 0.04, 0, 0, 0), 'foundation');
  p.add('fieldstone', box(W, 0.2, D, 0, 0.02, 0), 'foundation');
  p.add('cutcap', box(0.07, 0.07, 0.01, 0, 0.04, D / 2 + 0.002), 'foundation');
  // frame: the firebrick floor and the dome (a squashed half sphere, mouth to the front)
  p.add('whitewash', box(W - 0.02, 0.012, D - 0.02, 0, 0.22, 0), 'frame');
  p.add('whitewash', new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.125, 0.12, 0.14).translate(0, 0.232, -0.01), 'walls');
  p.add('fieldstone', new THREE.TorusGeometry(0.038, 0.01, 6, 12, Math.PI).rotateY(0).translate(0, 0.232, D / 2 - 0.004), 'walls');
  // the arched mouth with its door, a chimney and the shelf to land the peel
  p.add('cutcap', box(0.07, 0.05, 0.012, 0, 0.234, D / 2 - 0.012), 'openings');
  p.add('wood_dark', box(0.05, 0.035, 0.008, 0.075, 0.23, D / 2 + 0.01).rotateY(0.5), 'openings');
  p.add('fieldstone', box(0.1, 0.014, 0.05, 0, 0.222, D / 2 + 0.02), 'foundation');
  p.add('iron', new THREE.CylinderGeometry(0.014, 0.017, 0.15, 8).translate(0.03, 0.36, -0.03), 'chimney');
  // roof: four posts and a little metal roof over the working side
  for (const [x, z] of [[-W / 2 - 0.02, D / 2 + 0.05], [W / 2 + 0.02, D / 2 + 0.05], [-W / 2 - 0.02, -D / 2], [W / 2 + 0.02, -D / 2]]) p.add('wood_mid', box(0.014, 0.4, 0.014, x, 0, z), 'rafters');
  p.add('metal_roof', box(W + 0.12, 0.012, D + 0.16, 0, 0.4, 0.02).rotateX(0.08), 'roof');
  // the firebox: coals and ash on the firebrick, a baking stone and two loaves (the interior layer)
  p.add('wood_dark', new THREE.CylinderGeometry(0.05, 0.05, 0.006, 12).translate(0, 0.234, -0.02), 'interior');
  p.add('trim', new THREE.CylinderGeometry(0.03, 0.03, 0.01, 10).translate(0.02, 0.24, 0.03), 'interior');
  for (const x of [-0.02, 0.03]) p.add('wood_mid', new THREE.SphereGeometry(0.018, 8, 6).scale(1.2, 0.7, 0.8).translate(x, 0.252, 0.0), 'interior');
  // colliders: the base and the four roof posts
  p.collide({ x0: -W / 2, z0: -D / 2, x1: W / 2, z1: D / 2 });
  for (const [x, z] of [[-W / 2 - 0.02, D / 2 + 0.05], [W / 2 + 0.02, D / 2 + 0.05], [-W / 2 - 0.02, -D / 2], [W / 2 + 0.02, -D / 2]]) p.collide({ x0: x - 0.01, z0: z - 0.01, x1: x + 0.01, z1: z + 0.01 });
  // a woodpile and a peel leaning on the wall
  for (let i = 0; i < 5; i++) p.add('wood_mid', new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6).rotateZ(Math.PI / 2).translate(-W / 2 - 0.07, 0.015 + (i % 2) * 0.025, -0.05 + (i >> 1) * 0.027), 'decor');
  p.add('wood_mid', box(0.01, 0.2, 0.008, W / 2 + 0.05, 0.02, D / 2 - 0.02).rotateZ(0.2), 'decor');
  const g = p.finish();
  g.userData.chimneyTop = new THREE.Vector3(0.03, 0.44, -0.03);
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

// ────────────────────────────────────────────────────
// Forge: an open-sided smithy (stone hearth with a hood and flue, bellows, anvil on a stump, quench trough)
// ────────────────────────────────────────────────────

function forge(_def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = 0.84, D = 0.4;
  const post = (x: number, z: number, h: number) => box(0.016, h, 0.016, x, 0.02, z);
  const posts: Array<[number, number]> = [[-W / 2 + 0.02, D / 2 - 0.02], [W / 2 - 0.02, D / 2 - 0.02], [W / 2 - 0.02, -D / 2 + 0.02]];
  p.layer = 'stakes';
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) p.add('trim', box(0.012, 0.09, 0.012, x, -0.02, z));
  // foundation: the slab and the hearth block against the back wall (waist-high: 0.15 ≈ 0.9 m)
  p.add('concrete', box(W, 0.02, D, 0, 0, 0), 'foundation');
  p.add('fieldstone', box(0.26, 0.15, 0.17, -0.26, 0.02, -D / 2 + 0.11), 'foundation');
  p.add('concrete', box(0.2, 0.012, 0.12, -0.26, 0.17, -D / 2 + 0.11), 'foundation');
  // frame: the posts and the hood over the fire (a tapering stone throat), the flue above it
  p.layer = 'frame';
  for (const [x, z] of posts) p.add('wood_mid', post(x, z, 0.48), 'frame');
  p.add('fieldstone', box(0.26, 0.1, 0.17, -0.26, 0.32, -D / 2 + 0.11), 'frame');
  p.add('fieldstone', box(0.18, 0.12, 0.12, -0.26, 0.42, -D / 2 + 0.11), 'frame');
  p.add('fieldstone', box(0.1, 0.16, 0.08, -0.26, 0.54, -D / 2 + 0.11), 'frame');
  p.add('wood_dark', box(W - 0.02, 0.014, 0.014, 0, 0.48, D / 2 - 0.02), 'frame');
  // roof: a low metal roof over the working side, a back wall of stone to the hood
  p.add('metal_roof', box(W + 0.1, 0.012, D + 0.1, 0, 0.5, 0.0).rotateX(0.06), 'roof');
  p.add('fieldstone', box(W - 0.02, 0.4, 0.03, 0, 0.02, -D / 2 + 0.015), 'walls');
  p.add('iron', new THREE.CylinderGeometry(0.018, 0.02, 0.22, 8).translate(-0.26, 0.7, -D / 2 + 0.11), 'chimney');
  // the fire: coals in the hearth pot, a bellows on the side, a rack of tongs and hammers on the back wall (interior)
  p.add('iron', new THREE.CylinderGeometry(0.05, 0.035, 0.03, 10).translate(-0.26, 0.182, -D / 2 + 0.11), 'interior');
  p.add('paint_red', new THREE.CylinderGeometry(0.036, 0.036, 0.006, 8).translate(-0.26, 0.2, -D / 2 + 0.11), 'interior');
  p.add('wood_dark', box(0.09, 0.03, 0.05, -0.12, 0.1, -D / 2 + 0.1).rotateZ(0.12), 'interior');
  p.add('rubber', box(0.07, 0.04, 0.045, -0.12, 0.122, -D / 2 + 0.1).rotateZ(0.12), 'interior');
  p.add('iron', new THREE.CylinderGeometry(0.006, 0.006, 0.1, 6).rotateZ(Math.PI / 2 - 0.12).translate(-0.17, 0.115, -D / 2 + 0.1), 'interior');
  for (let i = 0; i < 4; i++) p.add('iron', box(0.006, 0.07 + (i % 2) * 0.02, 0.006, 0.0 + i * 0.045, 0.3, -D / 2 + 0.04).rotateZ(0.1 * (i - 1.5)), 'interior');
  p.add('wood_mid', box(0.2, 0.01, 0.014, 0.07, 0.38, -D / 2 + 0.04), 'interior');
  // the anvil on its stump, the quench trough, a pile of billets, a bucket (interior)
  p.add('wood_mid', new THREE.CylinderGeometry(0.036, 0.042, 0.1, 10).translate(0.1, 0.02 + 0.05, 0.03), 'interior');
  p.add('iron', box(0.09, 0.022, 0.034, 0.1, 0.122, 0.03), 'interior');
  p.add('iron', box(0.04, 0.03, 0.026, 0.1, 0.136, 0.03), 'interior');
  p.add('iron', new THREE.ConeGeometry(0.014, 0.05, 6).rotateZ(-Math.PI / 2).translate(0.168, 0.14, 0.03), 'interior');
  p.add('wood_dark', box(0.15, 0.06, 0.06, 0.28, 0.02, 0.08), 'interior');
  p.add('trim', box(0.13, 0.004, 0.04, 0.28, 0.078, 0.08), 'interior');
  for (let i = 0; i < 5; i++) p.add('iron', box(0.1, 0.008, 0.008, -0.34, 0.025 + i * 0.009, 0.12), 'decor');
  p.add('wood_mid', new THREE.CylinderGeometry(0.02, 0.018, 0.04, 8).translate(0.2, 0.04, 0.16), 'decor');
  // colliders: the hearth, the anvil stump, the trough
  p.collide({ x0: -0.39, z0: -D / 2, x1: -0.13, z1: -D / 2 + 0.19 });
  p.collide({ x0: 0.06, z0: -0.01, x1: 0.14, z1: 0.07 });
  p.collide({ x0: 0.205, z0: 0.05, x1: 0.355, z1: 0.11 });
  for (const [x, z] of posts) p.collide({ x0: x - 0.008, z0: z - 0.008, x1: x + 0.008, z1: z + 0.008 });
  const g = p.finish();
  g.userData.chimneyTop = new THREE.Vector3(-0.26, 0.82, -D / 2 + 0.11);
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

export const FOOD_BUILDERS: Record<string, (def: KitPieceDef, seed?: number) => THREE.Group> = { greenhouse, orchard, wood_oven: woodOven, forge };
