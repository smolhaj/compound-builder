/**
 * The self-sufficient interior's buildings (docs/DECISIONS.md "Self-sufficient interior"): the
 * heated production greenhouse, the orchard grove, the 20 kW solar farm and its battery
 * container, the private pond and the freshwater reservoir, the sheep barn and the equipment
 * yard. Procedural, layered for construction like everything else (shell.ts Parts). Repeating
 * parts (panels, trees, bench plants) are merged per layer × material, so each building is a
 * handful of draw calls. SCALE v2: 1 unit ≈ 6 m (M = 1 m), a person ≈ 0.28 tall.
 *
 * Sim state the world animates from: the pond's trout and crayfish (`kit_fish`, `kit_crayfish`
 * meshes in `decor`, shown by stocking), the flock in the sheep barn's paddock (`kit_sheepwool`).
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { M, pipe, tube } from './interior';
import { box, buildGabled, Parts, type BuildOpts, type FurnishCtx } from './shell';
import { orchardBuilder } from './foodBuildings';

const cylY = (r: number, h: number, x: number, y: number, z: number, seg = 10) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);
const ball = (r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 6) => new THREE.SphereGeometry(r, seg, Math.max(3, seg - 2)).scale(sx, sy, sz).translate(x, y, z);
/** A deterministic wobble in 0..1 for outlines and plants. */
const hash = (a: number, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// ─────────────────────────────────────────────────────────────────────────
// Heated production greenhouse: 9 × 24 m, two gutter-connected glass bays
// ─────────────────────────────────────────────────────────────────────────

/** Heated greenhouse body: width, length, eave and ridge height, door. */
export const GHH = { W: 9 * M, D: 24 * M, E: 4.0 * M, R: 5.5 * M, doorW: 2.4 * M, doorH: 3 * M };

function greenhouseHeated(_def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const { W, D, E, R, doorW, doorH } = GHH;
  const hw = W / 2, hd = D / 2, t = 0.07 * M, pane = 0.004, y0 = 0.015, bayW = W / 2;
  const bays = 8, zs = Array.from({ length: bays + 1 }, (_, i) => -hd + i * D / bays);
  const xs = [-hw, 0, hw];
  // site: corner stakes
  p.layer = 'stakes';
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) p.add('trim', box(0.012, 0.09, 0.012, x, -0.02, z));
  // foundation: a gravel bed in a concrete curb, the heat-loop manifold trench along the north wall
  p.layer = 'foundation';
  p.add('gravel', box(W - 0.01, 0.006, D - 0.01, 0, -0.002, 0));
  for (const [w, d, x, z] of [[W + 0.03, 0.03, 0, -hd], [W + 0.03, 0.03, 0, hd], [0.03, D, -hw, 0], [0.03, D, hw, 0]] as const) p.add('concrete', box(w, 0.035, d, x, -0.014, z));
  p.add('gravel', box(doorW * 1.7, 0.005, 0.22, 0, -0.002, hd + 0.12));
  // deck: the main aisle (0 ± 0.85 m) and the cross aisle at the packing end, in pavers
  p.layer = 'deck';
  p.add('pavers', box(1.7 * M, 0.007, D - 2.4 * M, 0, 0.001, -1.2 * M));
  p.add('pavers', box(W - 0.04, 0.007, 1.8 * M, 0, 0.001, hd - 1.2 * M));
  // frame: columns on the three lines, eave and gutter beams, gable posts, the door frame
  p.layer = 'frame';
  for (const z of zs) for (const x of xs) p.add('aluminum', box(t, E - y0, t, x, y0, z));
  for (const x of xs) p.add('aluminum', box(t * 1.5, t * 1.5, D, x, E - t, 0));              // eave beams and the gutter line
  for (const x of [-hw, hw]) p.add('aluminum', box(t, t, D, x, y0 + 1.4 * M, 0));            // side girts
  for (const z of [-hd, hd]) {
    p.add('aluminum', box(W, t, t, 0, y0, z));
    for (const bx of [-bayW / 2, bayW / 2]) {
      for (const dx of [-1, -0.5, 0.5, 1].map(k => k * bayW / 2 * 0.8)) p.add('aluminum', box(t, E + (R - E) * (1 - Math.abs(dx) / (bayW / 2)) - y0, t, bx + dx, y0, z));
    }
  }
  // rafters at every column line, and the two ridge bars
  p.layer = 'rafters';
  const slope = Math.hypot(bayW / 2, R - E), ang = Math.atan2(R - E, bayW / 2);
  for (const z of zs) for (const bx of [-bayW / 2, bayW / 2]) for (const sx of [-1, 1]) p.add('aluminum', box(slope, t, t, 0, -t / 2, 0).rotateZ(-sx * ang).translate(bx + sx * bayW / 4, (E + R) / 2, z));
  for (const bx of [-bayW / 2, bayW / 2]) p.add('aluminum', box(t * 1.6, t * 1.6, D + 0.01, bx, R - t * 0.8, 0));
  // roof: four glass slopes, a ridge vent propped open on each ridge, the thermal curtain bunched at the gutter
  p.layer = 'roof';
  for (const bx of [-bayW / 2, bayW / 2]) for (const sx of [-1, 1]) p.add('glass', box(slope, pane, D, 0, 0, 0).rotateZ(-sx * ang).translate(bx + sx * bayW / 4, (E + R) / 2 + t / 2, 0));
  for (const bx of [-bayW / 2, bayW / 2]) p.add('aluminum', box(slope * 0.36, 0.006, 1.2 * M, 0, 0, 0).rotateZ(-(ang + 0.42)).translate(bx + bayW * 0.12, R - (R - E) * 0.14 + 0.03, -hd * 0.5));
  p.add('linen', box(0.35 * M, 0.35 * M, D - 0.1, 0, E + 0.05, 0), 'roof');
  // walls: glass-look polycarbonate sides, the end gables (door at the front)
  p.layer = 'walls';
  for (const x of [-hw, hw]) p.add('polycarb', box(pane, E - y0, D, x, y0, 0));
  const gable = (z: number, door: boolean) => {
    const sh = new THREE.Shape([new THREE.Vector2(-hw, y0), new THREE.Vector2(hw, y0), new THREE.Vector2(hw, E), new THREE.Vector2(bayW / 2, R), new THREE.Vector2(0, E), new THREE.Vector2(-bayW / 2, R), new THREE.Vector2(-hw, E)]);
    if (door) sh.holes.push(new THREE.Path([new THREE.Vector2(-doorW / 2, y0), new THREE.Vector2(-doorW / 2, doorH), new THREE.Vector2(doorW / 2, doorH), new THREE.Vector2(doorW / 2, y0)].reverse()));
    p.add('polycarb', new THREE.ExtrudeGeometry(sh, { depth: pane, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, z - pane / 2));
  };
  gable(-hd, false);
  gable(hd, true);
  // openings: a sliding door half open, the side roll-up vents rolled, the louvered exhaust fans on the back gable
  p.layer = 'openings';
  p.add('polycarb', box(doorW / 2 - t, doorH - 2 * t, pane, 0, y0 + t, 0).translate(doorW / 4 + 0.01, 0, hd + 0.02));
  for (const [w, h, x, y] of [[t, doorH - y0, -doorW / 2 + t / 2, y0], [t, doorH - y0, doorW / 2 - t / 2, y0], [doorW, t, 0, doorH - t], [t, doorH - y0, 0, y0]] as const) p.add('aluminum', box(w, h, t, x, y, hd + 0.01));
  for (const x of [-hw, hw]) for (const z of [-hd * 0.5, 0, hd * 0.5]) p.add('aluminum', box(0.04, 1.1 * M, 3.2 * M, x + Math.sign(x) * 0.02, 1.5 * M, z));   // side vent flaps
  for (const x of [-bayW / 2, bayW / 2]) {
    p.add('iron', new THREE.CylinderGeometry(0.55 * M, 0.55 * M, 0.25 * M, 14).rotateX(Math.PI / 2).translate(x, 2.4 * M, -hd - 0.02));
    p.add('steel', new THREE.CylinderGeometry(0.12 * M, 0.12 * M, 0.27 * M, 6).rotateX(Math.PI / 2).translate(x, 2.4 * M, -hd - 0.02));
  }
  // interior: four bench rows with trays of plants and tomatoes, the unit heater and boiler pipes, the fans, the drip lines, the grow lamps
  p.layer = 'interior';
  const rowX = [-bayW / 2 - 1.1 * M, -bayW / 2 + 1.1 * M, bayW / 2 - 1.1 * M, bayW / 2 + 1.1 * M];
  const benchZ0 = -hd + 1.2 * M, benchZ1 = hd - 4.2 * M, benchLen = benchZ1 - benchZ0, benchY = 0.85 * M, benchW = 1.2 * M;
  rowX.forEach((x, r) => {
    p.add('aluminum', box(benchW, 0.05 * M, benchLen, x, benchY - 0.05 * M, (benchZ0 + benchZ1) / 2));
    p.add('rubber', box(benchW - 0.1 * M, 0.08 * M, benchLen - 0.1 * M, x, benchY, (benchZ0 + benchZ1) / 2));
    for (let k = 0; k <= 6; k++) for (const sx of [-1, 1]) p.add('aluminum', box(0.05 * M, benchY - 0.05 * M, 0.05 * M, x + sx * (benchW / 2 - 0.05 * M), 0, benchZ0 + 0.1 * M + k * (benchLen - 0.2 * M) / 6));
    p.add('soil', box(benchW - 0.14 * M, 0.04 * M, benchLen - 0.14 * M, x, benchY + 0.08 * M, (benchZ0 + benchZ1) / 2));
    // plants: lettuce and greens clumps in two columns, tomato vines on strings on the outer rows
    const n = 11;
    for (let k = 0; k < n; k++) for (const c of [-0.3, 0.3]) {
      const h = (0.12 + 0.22 * hash(r * 13 + k, c)) * M, z = benchZ0 + 0.3 * M + k * (benchLen - 0.6 * M) / (n - 1), px = x + c * M;
      p.add('crop', ball(0.13 * M + h * 0.3, px, benchY + 0.12 * M + h * 0.5, z, 1, 0.7, 1));
      if (hash(k, r + c) > 0.55) p.add('crop', ball(0.1 * M, px + 0.12 * M, benchY + 0.2 * M + h, z + 0.06 * M, 1, 0.8, 1));
    }
    if (r === 0 || r === 3) for (let k = 0; k < 6; k++) {
      const z = benchZ0 + 0.8 * M + k * (benchLen - 1.6 * M) / 5, px = x + (r === 0 ? -1 : 1) * 0.35 * M;
      p.add('wood_mid', cylY(0.025 * M, 1.9 * M, px, benchY + 0.1 * M, z, 5));
      for (let f = 0; f < 5; f++) {
        const y = benchY + (0.35 + f * 0.33) * M;
        p.add('crop', ball(0.17 * M, px + (f % 2 ? 0.08 : -0.08) * M, y, z, 1, 0.8, 1, 5));
        p.add('fruit', ball(0.06 * M, px + (f % 2 ? 0.2 : -0.2) * M, y - 0.1 * M, z + (f < 3 ? 0.1 : -0.1) * M, 1, 1, 1, 5));
      }
      p.add('string', box(0.006, 2.1 * M, 0.006, px, benchY, z));
    }
  });
  // heat: a unit heater hung from the back gable with its flue, hot-water pipes along both side walls at the base, airflow fans down the center
  p.add('steel', box(1.2 * M, 0.8 * M, 0.7 * M, 0, 3.0 * M, -hd + 0.5 * M));
  p.add('paint_red', box(1.0 * M, 0.08 * M, 0.5 * M, 0, 3.4 * M, -hd + 0.5 * M));
  p.add('iron', cylY(0.14 * M, 1.6 * M, 0.3 * M, 3.4 * M, -hd + 0.5 * M, 8));
  for (const x of [-hw + 0.2 * M, hw - 0.2 * M]) { p.add('copper', pipe([x, 0.18 * M, -hd + 0.4 * M], [x, 0.18 * M, hd - 0.6 * M], 0.045 * M, 6)); p.add('copper', pipe([x, 0.46 * M, -hd + 0.4 * M], [x, 0.46 * M, hd - 0.6 * M], 0.045 * M, 6)); }
  for (const z of [-hd * 0.6, -hd * 0.1, hd * 0.4]) {
    p.add('steel', new THREE.CylinderGeometry(0.34 * M, 0.34 * M, 0.12 * M, 10).rotateX(Math.PI / 2).translate(0, 3.2 * M, z));
    p.add('iron', box(0.04 * M, 0.5 * M, 0.04 * M, 0, 3.4 * M, z));
  }
  // drip lines along every bench, a header across the packing end, the water barrel and the thermostat
  for (const x of rowX) p.add('rubber', pipe([x + 0.45 * M, benchY + 0.14 * M, benchZ0], [x + 0.45 * M, benchY + 0.14 * M, benchZ1], 0.014 * M, 4));
  p.add('rubber', pipe([rowX[0] + 0.45 * M, benchY + 0.14 * M, benchZ1 + 0.1 * M], [rowX[3] + 0.45 * M, benchY + 0.14 * M, benchZ1 + 0.1 * M], 0.03 * M, 5));
  for (const x of rowX) for (const z of [benchZ0 + benchLen * 0.25, benchZ0 + benchLen * 0.75]) {
    p.add('iron', box(0.8 * M, 0.04 * M, 0.2 * M, x, 2.6 * M, z));
    p.add('lamp', box(0.7 * M, 0.02 * M, 0.14 * M, x, 2.57 * M, z));
  }
  p.add('blue_tank', cylY(0.45 * M, 1.1 * M, hw - 0.7 * M, 0, hd - 1.2 * M, 12));
  p.add('wood_mid', box(2.6 * M, 0.05 * M, 1.0 * M, -hw + 1.6 * M, 0.9 * M, hd - 1.4 * M));     // the packing table
  for (const sx of [-1, 1]) p.add('wood_mid', box(0.06 * M, 0.9 * M, 0.8 * M, -hw + 1.6 * M + sx * 1.2 * M, 0, hd - 1.4 * M));
  for (let i = 0; i < 3; i++) p.add('wood_dark', box(0.5 * M, 0.25 * M, 0.38 * M, -hw + (0.9 + i * 0.7) * M, 0.95 * M, hd - 1.4 * M));   // harvest crates
  // colliders: the walls with the door gap, the bench rows
  const c = 0.012;
  p.collide({ x0: -hw - c, z0: -hd - c, x1: hw + c, z1: -hd + c });
  p.collide({ x0: -hw - c, z0: -hd, x1: -hw + c, z1: hd });
  p.collide({ x0: hw - c, z0: -hd, x1: hw + c, z1: hd });
  p.collide({ x0: -hw - c, z0: hd - c, x1: -doorW / 2, z1: hd + c });
  p.collide({ x0: doorW / 2, z0: hd - c, x1: hw + c, z1: hd + c });
  for (const x of rowX) p.collide({ x0: x - benchW / 2, z0: benchZ0, x1: x + benchW / 2, z1: benchZ1 });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Solar farm: 50 × 400 W panels in five rows, three inverters on a pad
// ─────────────────────────────────────────────────────────────────────────

/** Panels and rows in the 20 kW farm: five rows of ten, each 400 W. */
export const FARM = { rows: 5, perRow: 10, watts: 400 };

function solarFarm(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  const pw = 1.13 * M, ph = 1.72 * M, tilt = 0.6, low = 0.7 * M;
  const sinT = Math.sin(tilt), cosT = Math.cos(tilt);
  const hy = (s: number) => low + (ph / 2 - s) * sinT, hz = (s: number) => s * cosT;
  const half = FARM.perRow * pw / 2, pitch = (D - 2.4 * M) / FARM.rows;
  const rowZ = (i: number) => -D / 2 + 1.4 * M + (i + 0.5) * pitch - 0.9 * M;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (W / 2 - 0.04), -0.02, sz * (D / 2 - 0.04)));
  for (let i = 0; i < FARM.rows; i++) {
    const rz = rowZ(i);
    // foundation: a concrete footing under each of the post lines
    p.layer = 'foundation';
    for (let k = 0; k <= 4; k++) {
      const x = -half + 0.2 * M + k * (2 * half - 0.4 * M) / 4;
      for (const s of [ph / 2 - 0.12 * M, -ph / 2 + 0.12 * M]) p.add('concrete', box(0.32 * M, 0.25 * M, 0.32 * M, x, -0.1 * M, rz + hz(s)));
    }
    // frame: posts, the sloped rafters and two long purlins
    p.layer = 'frame';
    for (let k = 0; k <= 4; k++) {
      const x = -half + 0.2 * M + k * (2 * half - 0.4 * M) / 4;
      for (const s of [ph / 2 - 0.12 * M, -ph / 2 + 0.12 * M]) p.add('steel', box(0.09 * M, hy(s) - 0.3 * M, 0.09 * M, x, 0.1 * M, rz + hz(s)));
      p.add('steel', box(0.08 * M, 0.1 * M, ph, 0, -0.05 * M, 0).rotateX(tilt).translate(x, hy(0) - 0.16 * M, rz));
    }
    for (const s of [ph * 0.28, -ph * 0.28]) p.add('steel', box(2 * half + 0.1 * M, 0.05 * M, 0.06 * M, 0, -0.05 * M, 0).rotateX(tilt).translate(0, hy(s) - 0.12 * M, rz + hz(s)));
    // roof: the panels, cells up, aluminum frames
    p.layer = 'roof';
    for (let j = 0; j < FARM.perRow; j++) {
      const x = -half + (j + 0.5) * pw;
      const g = new THREE.PlaneGeometry(pw - 0.03 * M, ph - 0.03 * M).rotateX(-Math.PI / 2 + tilt).translate(x, hy(0) + 0.002, rz);
      g.userData.keepUV = true;
      p.add('solar_cell', g);
      p.add('steel', box(pw - 0.01 * M, 0.03 * M, 0.03 * M, 0, 0, 0).rotateX(tilt).translate(x, hy(ph / 2 - 0.01 * M) + 0.005, rz + hz(ph / 2 - 0.01 * M)));
      p.add('steel', box(0.03 * M, 0.03 * M, ph, 0, 0, 0).rotateX(tilt).translate(x + pw / 2 - 0.015 * M, hy(0) + 0.005, rz));
    }
    p.collide({ x0: -half, z0: rz - 0.1, x1: half, z1: rz + 0.1 });
  }
  // openings: the inverter pad at the corner (three 6 kW units on a rack), combiner box, conduit run, the disconnect and a grounding rod
  p.layer = 'openings';
  const ix = half + 0.5 * M, iz = D / 2 - 1.0 * M;
  p.add('concrete', box(1.8 * M, 0.06 * M, 1.0 * M, ix + 0.5 * M, -0.01, iz));
  for (let k = 0; k < 3; k++) {
    p.add('enamel', box(0.5 * M, 0.7 * M, 0.2 * M, ix + (0.1 + k * 0.55) * M, 0.06 * M, iz - 0.2 * M));
    p.add('paint_green', box(0.08 * M, 0.04 * M, 0.01 * M, ix + (0.1 + k * 0.55) * M, 0.5 * M, iz - 0.09 * M));
  }
  p.add('steel', box(0.06 * M, 1.2 * M, 0.06 * M, ix + 1.45 * M, 0, iz));
  p.add('iron', box(0.4 * M, 0.5 * M, 0.2 * M, ix + 1.45 * M, 0.8 * M, iz + 0.05 * M));
  p.add('paint_red', box(0.08 * M, 0.08 * M, 0.02 * M, ix + 1.55 * M, 1.1 * M, iz + 0.17 * M));
  p.add('rubber', tube([[ix + 0.4 * M, 0.04, iz + 0.2 * M], [ix + 0.4 * M, 0.04, D / 2], [ix + 0.4 * M, 0.04, D / 2 + 0.2]], 0.02 * M, 5));
  // a perimeter of wire-mesh fence on posts round the field with a gate at the access side
  p.layer = 'roof';
  const fx = W / 2 - 0.02, fz = D / 2 - 0.02;
  for (const [ax, az, bx, bz] of [[-fx, -fz, fx, -fz], [-fx, -fz, -fx, fz], [fx, -fz, fx, fz]] as const) {
    const L = Math.hypot(bx - ax, bz - az), a = Math.atan2(bz - az, bx - ax);
    p.add('wire_mesh', box(L, 1.4 * M, 0.004, 0, 0.1 * M, 0).rotateY(-a).translate((ax + bx) / 2, 0, (az + bz) / 2));
    const n = Math.ceil(L / (2.4 * M));
    for (let k = 0; k <= n; k++) p.add('steel', box(0.05 * M, 1.6 * M, 0.05 * M, ax + (bx - ax) * k / n, 0, az + (bz - az) * k / n));
  }
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Battery container: 60 kWh in a 20 ft container beside the array
// ─────────────────────────────────────────────────────────────────────────

function batteryBank(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  const L = 6.06 * M, Wd = 2.44 * M, H = 2.59 * M, y0 = 0.1 * M;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (W / 2 - 0.03), -0.02, sz * (D / 2 - 0.03)));
  p.layer = 'foundation';
  p.add('concrete', box(L + 0.5 * M, 0.1 * M, Wd + 0.5 * M, 0, -0.01, 0));
  p.layer = 'frame';
  // the container on its slab: corrugated sides, corner castings, doors at the +x end
  p.add('container_green', box(L, H - 0.1 * M, Wd, 0, y0, 0));
  for (let k = 0; k < 24; k++) p.add('steel', box(0.03 * M, H - 0.3 * M, 0.04 * M, -L / 2 + (k + 0.5) * L / 24, y0 + 0.1 * M, Wd / 2 + 0.01 * M));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('steel', box(0.18 * M, 0.18 * M, 0.18 * M, sx * (L / 2 - 0.09 * M), y0 + H - 0.2 * M, sz * (Wd / 2 - 0.09 * M)));
  p.layer = 'roof';
  p.add('metal_roof', box(L + 0.3 * M, 0.04 * M, Wd + 0.5 * M, 0, y0 + H - 0.1 * M, 0).rotateZ(0.03));    // the sun hood over the roof, slightly pitched
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('steel', box(0.06 * M, 0.3 * M, 0.06 * M, sx * (L / 2 - 0.1 * M), y0 + H - 0.4 * M, sz * (Wd / 2 + 0.2 * M)));
  p.layer = 'openings';
  // a personnel door and the double doors at one end, louvers, two air conditioning condensers, a conduit riser and a disconnect
  p.add('steel', box(0.04 * M, 2.0 * M, 1.0 * M, L / 2 + 0.01 * M, y0 + 0.1 * M, 0));
  for (let k = 0; k < 5; k++) p.add('iron', box(0.3 * M, 0.04 * M, 0.5 * M, 0, y0 + (1.8 + k * 0.1) * M, 0).translate(-1.4 * M, 0, Wd / 2 + 0.03 * M));
  for (const x of [-1.8 * M, -0.5 * M]) { p.add('enamel', box(0.9 * M, 0.7 * M, 0.35 * M, x, y0 + 0.4 * M, -Wd / 2 - 0.2 * M)); p.add('steel', new THREE.CylinderGeometry(0.27 * M, 0.27 * M, 0.04 * M, 12).translate(x, y0 + 1.1 * M, -Wd / 2 - 0.2 * M)); }
  p.add('steel', cylY(0.05 * M, 2.4 * M, L / 2 + 0.3 * M, 0, Wd / 2 - 0.2 * M, 6));
  p.add('iron', box(0.4 * M, 0.5 * M, 0.2 * M, L / 2 + 0.3 * M, 1.0 * M, Wd / 2 + 0.05 * M));
  p.add('paint_yellow', box(0.5 * M, 0.35 * M, 0.01 * M, 0, y0 + 2.0 * M, Wd / 2 + 0.03 * M));
  p.layer = 'interior';
  // inside: twelve battery racks in two rows down a center aisle, the inverter wall, the fire panel
  for (let k = 0; k < 6; k++) for (const sz of [-1, 1]) {
    const x = -L / 2 + 0.7 * M + k * 0.82 * M, z = sz * 0.8 * M;
    for (const sx of [-1, 1]) p.add('steel', box(0.04 * M, 1.7 * M, 0.04 * M, x + sx * 0.36 * M, y0, z + 0.1 * M * sz));
    for (let r = 0; r < 4; r++) { p.add('steel', box(0.8 * M, 0.025 * M, 0.5 * M, x, y0 + (0.12 + r * 0.4) * M, z)); p.add('iron', box(0.7 * M, 0.28 * M, 0.42 * M, x, y0 + (0.15 + r * 0.4) * M, z)); p.add('paint_green', box(0.08 * M, 0.03 * M, 0.01 * M, x + 0.25 * M, y0 + (0.4 + r * 0.4) * M, z - sz * 0.22 * M)); }
  }
  p.add('enamel', box(0.1 * M, 1.4 * M, 0.9 * M, L / 2 - 0.2 * M, y0 + 0.4 * M, 0));
  p.collide({ x0: -L / 2, z0: -Wd / 2, x1: L / 2, z1: Wd / 2 }, { x0: -L / 2 - 0.1, z0: -Wd / 2 - 0.1, x1: L / 2 + 0.1, z1: -Wd / 2 }, { x0: -L / 2 - 0.1, z0: Wd / 2, x1: L / 2 + 0.1, z1: Wd / 2 + 0.1 }, { x0: L / 2, z0: -Wd / 2, x1: L / 2 + 0.1, z1: Wd / 2 });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Pond and reservoir
// ─────────────────────────────────────────────────────────────────────────

/** A lumpy closed outline (local x, z) of half-extents (rx, rz): the shore of a dug pond. */
function shore(rx: number, rz: number, seed: number, n = 28): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, w = 1 + 0.12 * Math.sin(a * 3 + seed) + 0.07 * Math.sin(a * 5 + seed * 2.3) + 0.04 * hash(i, seed);
    out.push([Math.cos(a) * rx * w, Math.sin(a) * rz * w]);
  }
  return out;
}
const flat = (pts: ReadonlyArray<[number, number]>, y: number) => {
  const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  return new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).translate(0, y, 0);
};
/** A ring strip between an inner and an outer outline at heights y0 (inner) → y1 (outer). */
function ring(inner: ReadonlyArray<[number, number]>, outer: ReadonlyArray<[number, number]>, y0: number, y1: number): THREE.BufferGeometry {
  const pos: number[] = [], n = inner.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = inner[i], b = inner[j], c = outer[j], d = outer[i];
    pos.push(a[0], y0, a[1], b[0], y0, b[1], c[0], y1, c[1], a[0], y0, a[1], c[0], y1, c[1], d[0], y1, d[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
const scaleOutline = (pts: ReadonlyArray<[number, number]>, k: number): Array<[number, number]> => pts.map(([x, z]) => [x * k, z * k]);

/** A small trout (body, tail) seen from above in the water, pointing along `a`. */
const troutGeo = (x: number, z: number, a: number, y: number): THREE.BufferGeometry => {
  const g = new THREE.BufferGeometry();
  const l = 0.55 * M, w = 0.1 * M;
  const pts = [[l / 2, 0], [l / 6, w], [-l / 3, w * 0.7], [-l / 2, 0], [-l / 3, -w * 0.7], [l / 6, -w]] as const;
  const pos: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) pos.push(pts[0][0], 0, pts[0][1], pts[i][0], 0, pts[i][1], pts[i + 1][0], 0, pts[i + 1][1]);
  pos.push(-l / 2, 0, 0, -l / 2 - 0.2 * M, 0, 0.12 * M, -l / 2 - 0.2 * M, 0, -0.12 * M);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g.rotateY(-a).translate(x, y, z);
};

/**
 * The private pond: an earth berm round a lined, spring-green water surface, a spillway of stones, a
 * standpipe, a dock with a feed bin, an aerator float, a wire fish fence, reed margins, and dozens of trout
 * and crayfish (decor meshes the world shows by stocking).
 */
function pond(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  const rx = W / 2 - 0.3, rz = D / 2 - 0.3;
  const sh = shore(rx * 0.8, rz * 0.8, seed);
  const bank = scaleOutline(sh, 1.18), outer = scaleOutline(sh, 1.42);
  p.layer = 'stakes';
  for (let i = 0; i < sh.length; i += 4) p.add('trim', box(0.012, 0.09, 0.012, sh[i][0] * 1.2, -0.02, sh[i][1] * 1.2));
  // foundation: the dug basin (a dark floor shows through water-less), the spoil berm piled round it
  p.layer = 'foundation';
  p.add('soil', flat(scaleOutline(sh, 1.0), -0.02));
  p.add('earth', ring(bank, outer, 0.03, 0.0));
  p.add('earth', ring(sh, bank, -0.01, 0.045));
  // frame: the liner turned up the banks and a coping of stones at the water line
  p.layer = 'frame';
  p.add('rubber', ring(scaleOutline(sh, 0.97), sh, -0.015, 0.012));
  for (let i = 0; i < sh.length; i++) {
    const [x, z] = sh[i];
    p.add('fieldstone', ball(0.035 + 0.02 * hash(i, 3), x * 1.02, 0.012, z * 1.02, 1.3, 0.55, 1, 5));
  }
  // roof: the stone spillway notch at the low end and the bank dressed with turf
  p.layer = 'roof';
  const sp = sh[Math.floor(sh.length * 0.25)];
  for (let k = 0; k < 8; k++) p.add('fieldstone', ball(0.04 + 0.02 * hash(k, 9), sp[0] * 1.25 + (hash(k, 1) - 0.5) * 0.2, 0.012, sp[1] * 1.25 + k * 0.025, 1.3, 0.5, 1, 5));
  p.add('hedge2', ring(scaleOutline(sh, 1.04), scaleOutline(sh, 1.3), 0.047, 0.047), 'roof');
  // walls: the fish fence (wire mesh on posts) round the whole bank
  p.layer = 'walls';
  const fence = scaleOutline(sh, 1.38);
  for (let i = 0; i < fence.length; i++) {
    const a = fence[i], b = fence[(i + 1) % fence.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (i === 20) continue;                                                       // the gate gap
    p.add('wire_mesh', box(L, 0.9 * M, 0.004, 0, 0.04, 0).rotateY(-Math.atan2(b[1] - a[1], b[0] - a[0])).translate((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2));
    p.add('wood_dark', box(0.04 * M, 1.0 * M, 0.04 * M, a[0], 0.03, a[1]));
  }
  // openings: the standpipe (a monk), the dock with a feed bin, the aerator and its air line, the intake and overflow pipes
  p.layer = 'openings';
  const dockZ = sh[Math.floor(sh.length * 0.75)];
  const da = Math.atan2(dockZ[1], dockZ[0]);
  const dockG = (g: THREE.BufferGeometry) => g.rotateY(-da).translate(dockZ[0] * 0.95, 0, dockZ[1] * 0.95);
  p.add('deck', dockG(box(0.9 * M, 0.06 * M, 3.6 * M, 0, 0.03 + 0.2 * M, 0).rotateY(Math.PI / 2).translate(-1.4 * M, 0, 0)));
  for (const dz of [-0.4 * M, 0.4 * M]) for (const dx of [-3 * M, -0.3 * M]) p.add('wood_dark', dockG(box(0.08 * M, 0.35 * M, 0.08 * M, dx, 0.0, dz)));
  p.add('paint_green', dockG(box(0.5 * M, 0.5 * M, 0.5 * M, -0.4 * M, 0.03 + 0.26 * M, 0)));
  p.add('steel', cylY(0.15 * M, 1.2 * M, sh[Math.floor(sh.length * 0.5)][0] * 0.75, 0.012, sh[Math.floor(sh.length * 0.5)][1] * 0.75, 8));
  p.add('iron', box(0.3 * M, 0.04 * M, 0.3 * M, sh[Math.floor(sh.length * 0.5)][0] * 0.75, 1.15 * M, sh[Math.floor(sh.length * 0.5)][1] * 0.75));
  p.add('paint_red', new THREE.CylinderGeometry(0.28 * M, 0.28 * M, 0.2 * M, 12).translate(-rx * 0.3, 0.025, rz * 0.1));
  p.add('enamel', new THREE.CylinderGeometry(0.2 * M, 0.2 * M, 0.08 * M, 12).translate(-rx * 0.3, 0.07, rz * 0.1));
  p.add('rubber', tube([[-rx * 0.3, 0.03, rz * 0.1], [-rx * 0.55, 0.02, rz * 0.3], [-rx * 0.95, 0.04, rz * 0.42], [-rx * 1.25, 0.05, rz * 0.45]], 0.015 * M, 4));
  p.add('iron', box(0.5 * M, 0.7 * M, 0.35 * M, -rx * 1.3, 0.05, rz * 0.45));
  p.layer = 'interior';
  // interior: the water, a clear skin just under the rim, reeds and cattails along the margin, lily pads
  p.add('pond_water', flat(scaleOutline(sh, 0.985), 0.026));
  for (let i = 0; i < sh.length; i++) {
    if (hash(i, 5) < 0.45 || i === 20) continue;
    const [x, z] = sh[i];
    for (let k = 0; k < 5; k++) {
      const hh = (0.7 + 0.9 * hash(i, k)) * M, ox = x * 1.0 + (hash(i * 3, k) - 0.5) * 0.08, oz = z * 1.0 + (hash(i * 5, k) - 0.5) * 0.08;
      p.add('hedge2', new THREE.ConeGeometry(0.03 * M, hh, 4).translate(ox, 0.03 + hh / 2, oz));
      if (k === 0) p.add('wood_dark', cylY(0.025 * M, 0.3 * M, ox, 0.03 + hh - 0.1 * M, oz, 5));
    }
  }
  for (let k = 0; k < 7; k++) { const a = hash(k, 2) * Math.PI * 2, r = 0.3 + 0.4 * hash(k, 4); p.add('crop', new THREE.CylinderGeometry(0.08 * M, 0.08 * M, 0.01, 8).translate(Math.cos(a) * rx * r, 0.03, Math.sin(a) * rz * r)); }
  p.layer = 'decor';
  // decor: the fish and crayfish, shown by the world in proportion to the stock (the first meshes show first)
  for (let k = 0; k < 18; k++) {
    const a = hash(k, 11) * Math.PI * 2, r = 0.15 + 0.6 * hash(k, 12), ang = hash(k, 13) * Math.PI * 2;
    p.add('fish', troutGeo(Math.cos(a) * rx * 0.8 * r, Math.sin(a) * rz * 0.8 * r, ang, 0.024));
  }
  for (let k = 0; k < 14; k++) {
    const i = Math.floor(hash(k, 14) * sh.length), [x, z] = sh[i], d = 0.88 - 0.1 * hash(k, 15);
    p.add('crayfish', ball(0.035 * M, x * d, 0.016, z * d, 1.8, 0.5, 0.8, 5));
    p.add('crayfish', ball(0.03 * M, x * d * 0.98 + 0.01, 0.016, z * d * 0.98, 0.6, 0.5, 0.8, 4));
  }
  // colliders: the water and the bank are not walkable on the inside (a ring), the fence line
  for (let i = 0; i < sh.length; i += 2) {
    const [x, z] = sh[i], [x2, z2] = sh[(i + 3) % sh.length];
    p.collide({ x0: Math.min(x, x2) * 0.9, z0: Math.min(z, z2) * 0.9, x1: Math.max(x, x2) * 0.9 + 0.01, z1: Math.max(z, z2) * 0.9 + 0.01 });
  }
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

/** A lined reservoir: a rectangle of water in a concrete edge, with an intake tower, a pump pad and a fence. No fish. */
function reservoir(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  const iw = W / 2 - 0.12, id = D / 2 - 0.12;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (W / 2 - 0.03), -0.02, sz * (D / 2 - 0.03)));
  p.layer = 'foundation';
  p.add('soil', box(2 * iw, 0.004, 2 * id, 0, -0.02, 0));
  p.add('earth', box(W, 0.06, D, 0, -0.03, 0));
  p.layer = 'frame';
  // the concrete edge beam all round and the sloped liner
  for (const [w, d, x, z] of [[2 * iw + 0.16, 0.08, 0, -id - 0.04], [2 * iw + 0.16, 0.08, 0, id + 0.04], [0.08, 2 * id, -iw - 0.04, 0], [0.08, 2 * id, iw + 0.04, 0]] as const) p.add('concrete', box(w, 0.07, d, x, 0, z));
  p.add('rubber', box(2 * iw - 0.02, 0.004, 2 * id - 0.02, 0, -0.012, 0));
  p.layer = 'roof';
  // the overflow weir and a steel stair down the side
  p.add('concrete', box(0.4, 0.07, 0.08, iw * 0.4, 0, id + 0.05));
  for (let k = 0; k < 5; k++) p.add('steel', box(0.5 * M, 0.04 * M, 0.3 * M, -iw + 0.1, -0.012 - k * 0.02, -id * 0.4 + k * 0.045));
  p.layer = 'walls';
  const fx = W / 2 - 0.02, fz = D / 2 - 0.02;
  for (const [ax, az, bx, bz] of [[-fx, -fz, fx, -fz], [-fx, fz, fx, fz], [-fx, -fz, -fx, fz], [fx, -fz, fx, fz]] as const) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / (2.4 * M));
    p.add('wire_mesh', box(L, 1.2 * M, 0.004, 0, 0.0, 0).rotateY(-Math.atan2(bz - az, bx - ax)).translate((ax + bx) / 2, 0, (az + bz) / 2));
    for (let k = 0; k <= n; k++) p.add('steel', box(0.04 * M, 1.3 * M, 0.04 * M, ax + (bx - ax) * k / n, 0, az + (bz - az) * k / n));
  }
  p.layer = 'openings';
  // the intake tower with its catwalk and the pump pad with a submersible-pump control box
  p.add('concrete', cylY(0.22 * M, 1.6 * M, -iw * 0.55, -0.01, 0, 10));
  p.add('steel', box(0.04, 0.03, iw * 0.55 + 0.05, -iw * 0.28, 1.55 * M - 0.01, 0));
  p.add('iron', box(0.5 * M, 0.7 * M, 0.3 * M, iw * 0.8, 0.02, id + 0.16));
  p.add('blue_tank', cylY(0.25 * M, 0.8 * M, iw * 0.55, 0.02, id + 0.2, 10));
  p.add('rubber', tube([[-iw * 0.55, 0.02, 0], [-iw * 0.55, -0.01, id * 0.6], [iw * 0.5, 0.02, id + 0.2]], 0.04 * M, 5));
  p.layer = 'interior';
  p.add('pond_water', box(2 * iw - 0.03, 0.002, 2 * id - 0.03, 0, 0.034, 0));
  p.collide({ x0: -fx, z0: -fz, x1: fx, z1: -fz + 0.02 }, { x0: -fx, z0: fz - 0.02, x1: fx, z1: fz }, { x0: -fx, z0: -fz, x1: -fx + 0.02, z1: fz }, { x0: fx - 0.02, z0: -fz, x1: fx, z1: fz });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Sheep barn and its paddock
// ─────────────────────────────────────────────────────────────────────────

/** A sheep (wool body, dark face and legs) lying along local +x at (x, z), turned by `a`. */
function sheepGeo(add: (m: 'sheepwool' | 'wood_dark', g: THREE.BufferGeometry) => void, x: number, z: number, a: number, grazing: boolean): void {
  const T = (g: THREE.BufferGeometry) => g.rotateY(-a).translate(x, 0, z);
  add('sheepwool', T(ball(0.2 * M, 0, 0.62 * M, 0, 1.4, 1, 0.95, 7)));
  add('sheepwool', T(ball(0.14 * M, -0.12 * M, 0.74 * M, 0, 1, 0.9, 1, 6)));
  add('wood_dark', T(ball(0.1 * M, 0.34 * M, grazing ? 0.4 * M : 0.72 * M, 0, 1.3, 1, 0.9, 6)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('wood_dark', T(box(0.04 * M, 0.38 * M, 0.04 * M, sx * 0.17 * M, 0, sz * 0.09 * M)));
}

function sheepBarn(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  const { group } = buildGabled({
    W, D, floor: 0.03, wallH: 0.5, wallT: 0.022, rise: 0.4, eave: 0.07, gableOver: 0.06, porch: 0,
    foundation: 'fieldstone', floorMat: 'earth', outer: 'board_batten', inner: null, roof: 'metal_roof', trim: 'trim',
    front: [{ kind: 'bay', at: 0, w: 0.5, h: 0.4 }],
    left: [{ kind: 'window', at: -0.5, w: 0.1, h: 0.1, sill: 0.25 }, { kind: 'window', at: 0.5, w: 0.1, h: 0.1, sill: 0.25 }],
    right: [{ kind: 'window', at: -0.5, w: 0.1, h: 0.1, sill: 0.25 }, { kind: 'arch', at: 0.4, w: 0.3 }],
    gableWindow: { front: true, back: true, w: 0.2, h: 0.14, y: 0.06 },
    tieBeams: [-0.6, 0, 0.6], corners: 'boards',
  }, (c: FurnishCtx) => {
    const { y0, parts, left, right } = c;
    const FW = right - left;
    // pens down each side: rails, hay racks along the walls, water troughs, straw bedding; a lambing pen at the back
    for (const sx of [-1, 1]) {
      parts.add('wood_mid', box(0.015, 0.14, D * 0.62, sx * (FW / 2 - 0.2), y0, -0.1), 'interior');
      parts.add('wood_mid', box(0.015, 0.03, D * 0.62, sx * (FW / 2 - 0.2), y0 + 0.1, -0.1), 'interior');
      parts.add('wood_mid', box(0.1, 0.06, D * 0.55, sx * (FW / 2 - 0.06), y0 + 0.14, -0.1), 'interior');
      parts.add('straw', box(0.3, 0.012, D * 0.58, sx * (FW / 2 - 0.2 + sx * -0.1), y0, -0.1), 'interior');
      parts.add('blue_tank', box(0.1, 0.05, 0.2, sx * (FW / 2 - 0.3), y0, D * 0.2), 'interior');
    }
    parts.add('wood_mid', box(FW - 0.3, 0.14, 0.015, 0, y0, -D / 2 + 0.5), 'interior');
    parts.add('straw', box(FW - 0.4, 0.012, 0.4, 0, y0, -D / 2 + 0.28), 'interior');
    for (let i = 0; i < 5; i++) parts.add('straw', box(0.17, 0.08, 0.09, -0.3 + i * 0.12, y0 + (i % 2) * 0.08, D / 2 - 0.3), 'interior');
    // a few sheep always inside (the world shows more in the paddock by the flock)
    const add = (m: 'sheepwool' | 'wood_dark', g: THREE.BufferGeometry) => parts.add(m, g, 'interior');
    for (const [x, z, a] of [[-0.3, -0.5, 0.7], [0.3, -0.4, 2.4], [-0.35, 0.1, 1.2]] as const) sheepGeo(add, x, z, a, false);
  }, new Parts(seed, opts), p => {
    // the paddock in front: a plank fence three sides, a trough, a round bale; the flock stands in it (decor, shown by head count)
    const pw = W + 0.3, pz0 = D / 2 + 0.05, pz1 = D / 2 + 0.95;
    p.layer = 'openings';
    for (const [ax, az, bx, bz] of [[-pw / 2, pz0, -pw / 2, pz1], [pw / 2, pz0, pw / 2, pz1], [-pw / 2, pz1, pw / 2, pz1]] as const) {
      const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 0.22);
      for (const y of [0.1, 0.19, 0.28]) p.add('wood_mid', box(L, 0.03, 0.012, 0, y, 0).rotateY(-Math.atan2(bz - az, bx - ax)).translate((ax + bx) / 2, 0, (az + bz) / 2));
      for (let k = 0; k <= n; k++) p.add('wood_dark', box(0.03, 0.32, 0.03, ax + (bx - ax) * k / n, 0, az + (bz - az) * k / n));
    }
    p.add('blue_tank', box(0.4, 0.07, 0.12, -pw * 0.28, 0, pz1 - 0.12));
    p.add('straw', new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12).rotateZ(Math.PI / 2).translate(pw * 0.25, 0.1, pz1 - 0.14));
    p.layer = 'decor';
    const add = (m: 'sheepwool' | 'wood_dark', g: THREE.BufferGeometry) => p.add(m, g);
    for (let k = 0; k < 10; k++) sheepGeo(add, -pw / 2 + 0.25 + (k % 5) * (pw - 0.5) / 4.2, pz0 + 0.25 + Math.floor(k / 5) * 0.32 + 0.06 * hash(k, 1), hash(k, 2) * Math.PI * 2, k % 3 === 0);
    p.collide({ x0: -pw / 2, z0: pz1 - 0.02, x1: pw / 2, z1: pz1 + 0.02 }, { x0: -pw / 2 - 0.02, z0: pz0, x1: -pw / 2 + 0.02, z1: pz1 }, { x0: pw / 2 - 0.02, z0: pz0, x1: pw / 2 + 0.02, z1: pz1 });
  });
  return group;
}

// ─────────────────────────────────────────────────────────────────────────
// Equipment yard: a graded gravel pad with bays, a fuel tank and fixtures
// ─────────────────────────────────────────────────────────────────────────

function equipmentYard(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = def.cellsX * CELL, D = def.cellsZ * CELL, hw = W / 2 - 0.03, hd = D / 2 - 0.03;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * hw, -0.02, sz * hd));
  p.layer = 'foundation';
  p.add('gravel', box(W - 0.04, 0.01, D - 0.04, 0, -0.004, 0));
  p.add('concrete', box(W * 0.42, 0.012, D * 0.22, W * 0.2, -0.002, hd - D * 0.12));          // the wash pad
  p.layer = 'frame';
  // the pipe-rail fence on three sides with a wide gate at the front
  for (const [ax, az, bx, bz] of [[-hw, -hd, hw, -hd], [-hw, -hd, -hw, hd], [hw, -hd, hw, hd]] as const) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / (3 * M)), a = -Math.atan2(bz - az, bx - ax);
    for (const y of [0.5 * M, 1.0 * M]) p.add('steel', box(L, 0.05 * M, 0.05 * M, 0, y, 0).rotateY(a).translate((ax + bx) / 2, 0, (az + bz) / 2));
    for (let k = 0; k <= n; k++) p.add('steel', box(0.07 * M, 1.2 * M, 0.07 * M, ax + (bx - ax) * k / n, 0, az + (bz - az) * k / n));
  }
  p.layer = 'roof';
  // the bays: painted yellow stalls (two rows of three) with wheel stops, and the fuel tank and its guard posts
  const bw = (W - 0.3) / 3;
  for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
    const x = -W / 2 + 0.15 + (k + 0.5) * bw, z = -hd + 0.45 + r * 0.8;
    for (const sx of [-1, 1]) p.add('paint_yellow', box(0.012, 0.004, 0.6, x + sx * (bw / 2 - 0.02), 0.004, z));
    p.add('concrete', box(bw * 0.5, 0.025, 0.04, x, 0, z - 0.28));
  }
  p.add('paint_red', cylY(0.3 * M, 2.4 * M, -hw + 0.3, 0.02, hd - 0.4, 12).rotateZ(0));
  p.add('paint_red', new THREE.CylinderGeometry(0.4 * M, 0.4 * M, 2.4 * M, 12).rotateZ(Math.PI / 2).translate(-hw + 0.3, 0.45 * M, hd - 0.35));
  for (const dz of [-0.35, 0.05]) p.add('paint_yellow', cylY(0.06 * M, 0.9 * M, -hw + 0.12 + 0.3, 0, hd - 0.35 + dz, 6));
  p.layer = 'openings';
  // fixtures: a hay wagon and a spring-tooth harrow parked as implements, a light pole, the hitch rail, a tool locker
  p.add('wood_mid', box(2.4 * M, 0.1 * M, 1.2 * M, W * 0.18, 0.5 * M, -D * 0.1));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('iron', new THREE.CylinderGeometry(0.28 * M, 0.28 * M, 0.1 * M, 10).rotateX(Math.PI / 2).translate(W * 0.18 + sx * 0.8 * M, 0.3 * M, -D * 0.1 + sz * 0.62 * M));
  for (let k = 0; k < 6; k++) p.add('straw', box(0.5 * M, 0.35 * M, 0.38 * M, W * 0.18 - 0.9 * M + k % 3 * 0.55 * M, 0.55 * M + Math.floor(k / 3) * 0.35 * M, -D * 0.1));
  p.add('steel', box(1.8 * M, 0.06 * M, 0.5 * M, -W * 0.22, 0.2 * M, -D * 0.15));
  for (let k = 0; k < 6; k++) p.add('iron', box(0.03 * M, 0.5 * M, 0.03 * M, -W * 0.22 - 0.8 * M + k * 0.32 * M, 0, -D * 0.15));
  p.add('wood_dark', cylY(0.08 * M, 5.5 * M, hw - 0.1, 0, -hd + 0.15, 6));
  p.add('lamp', box(0.5 * M, 0.08 * M, 0.2 * M, hw - 0.1, 5.4 * M, -hd + 0.15));
  p.add('steel', box(1.2 * M, 2.0 * M, 0.7 * M, hw - 0.4, 0, hd - 0.1));
  p.layer = 'interior';
  p.add('oil_stain', box(0.5 * M, 0.002, 0.4 * M, -W * 0.15, 0.012, hd * 0.1));
  p.add('oil_stain', box(0.3 * M, 0.002, 0.7 * M, W * 0.3, 0.012, -hd * 0.3));
  for (const [x0, z0, x1, z1] of [[-hw, -hd, hw, -hd + 0.03], [-hw, -hd, -hw + 0.03, hd], [hw - 0.03, -hd, hw, hd]] as const) p.collide({ x0, z0, x1, z1 });
  p.collide({ x0: -hw + 0.1, z0: hd - 0.75, x1: -hw + 0.7, z1: hd - 0.05 });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

export const FARM_BUILDERS: Record<string, (def: KitPieceDef, seed?: number, opts?: BuildOpts) => THREE.Group> = {
  greenhouse_heated: greenhouseHeated,
  orchard_grove: (def, seed) => orchardBuilder(def, seed),
  solar_farm: solarFarm,
  battery_bank: batteryBank,
  pond,
  reservoir,
  sheep_barn: sheepBarn,
  equipment_yard: equipmentYard,
};
