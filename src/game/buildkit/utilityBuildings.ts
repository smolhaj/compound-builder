/**
 * Water and power buildings (docs/DECISIONS.md): hand-dug well, drilled
 * well + pump house, rain cistern, water tower (with a lookout deck), solar
 * array, battery shed, generator shed, septic system. Built in the same
 * layers as everything else; the sheds are furnished with working kit
 * (pressure tank, battery racks, inverter, generator, fuel drums). Sizes in
 * metres × M (scale.test.ts).
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { Furniture, M, type Add } from './interior';
import { box, buildGabled, Parts, type FurnishCtx } from './shell';
import { Clutter } from './clutter';

const cyl = (r: number, h: number, x: number, y: number, z: number, seg = 14) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);

/** Equipment pieces (front faces +z, floor y = 0). */
export const Equipment = {
  pressureTank(add: Add): void {
    add('blue_tank', cyl(0.25 * M, 0.9 * M, 0, 0.05 * M, 0));
    add('blue_tank', new THREE.SphereGeometry(0.25 * M, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.95 * M, 0));
    add('steel', box(0.4 * M, 0.06 * M, 0.06 * M, 0.3 * M, 0.4 * M, 0));
    add('steel', cyl(0.06 * M, 0.08 * M, 0.5 * M, 0.37 * M, 0, 8));                              // gauge
    add('iron', box(0.25 * M, 0.3 * M, 0.12 * M, 0.55 * M, 1.1 * M, -0.1 * M));                  // pressure switch box
  },
  wellCap(add: Add): void { add('steel', cyl(0.09 * M, 0.5 * M, 0, 0, 0, 10)); add('steel', cyl(0.12 * M, 0.06 * M, 0, 0.5 * M, 0, 10)); },
  batteryRack(add: Add, n = 4): void {
    add('steel', box(1.2 * M, 1.6 * M, 0.5 * M, 0, 0, 0));
    for (let k = 0; k < n; k++) {
      add('iron', box(1.05 * M, 0.3 * M, 0.42 * M, 0, (0.1 + k * 0.38) * M, 0.05 * M));
      add('paint_green', box(0.12 * M, 0.05 * M, 0.01 * M, 0.4 * M, (0.28 + k * 0.38) * M, 0.27 * M));   // charge LEDs
    }
  },
  inverterWall(add: Add): void {
    add('iron', box(0.55 * M, 0.75 * M, 0.2 * M, 0, 1.0 * M, 0));
    add('lamp', box(0.15 * M, 0.08 * M, 0.01 * M, 0, 1.55 * M, 0.1 * M));
    add('steel', box(0.4 * M, 0.5 * M, 0.15 * M, 0.7 * M, 1.1 * M, 0));                          // charge controller
    add('paint_red', box(0.3 * M, 0.4 * M, 0.12 * M, -0.6 * M, 1.2 * M, 0));                      // disconnect
    for (const x of [-0.6, 0, 0.7]) add('steel', cyl(0.025 * M, 1.0 * M, x * M, 0, 0, 6));      // conduit down to the floor
  },
  fuelDrums(add: Add): void {
    for (let i = 0; i < 2; i++) add(i ? 'paint_green' : 'paint_red', cyl(0.29 * M, 0.88 * M, (i - 0.5) * 0.62 * M, 0, 0));
    for (let i = 0; i < 3; i++) add('paint_red', box(0.18 * M, 0.45 * M, 0.34 * M, 0.95 * M + i * 0.0, 0, (i - 1) * 0.36 * M));
  },
};

// ─────────────────────────────────────────────────────────────────────────

function wellHand(_def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  p.layer = 'stakes';
  for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) p.add('trim', box(0.012, 0.09, 0.012, x, -0.02, z));
  // shaft collar of fieldstone, the dark shaft, the cover
  p.add('cutcap', new THREE.CircleGeometry(0.1, 16).rotateX(-Math.PI / 2).translate(0, 0.004, 0), 'foundation');
  p.add('fieldstone', new THREE.CylinderGeometry(0.15, 0.16, 0.12, 16, 1, true).translate(0, 0.06, 0), 'frame');
  p.add('fieldstone', new THREE.RingGeometry(0.1, 0.155, 16).rotateX(-Math.PI / 2).translate(0, 0.12, 0), 'frame');
  // little roof on two posts
  for (const sx of [-1, 1]) p.add('wood_dark', box(0.025, 0.42, 0.025, sx * 0.17, 0, 0), 'rafters');
  p.add('wood_dark', box(0.37, 0.025, 0.025, 0, 0.42, 0), 'rafters');
  for (const sx of [-1, 1]) p.add('metal_roof', box(0.2, 0.012, 0.36, 0, 0, 0).rotateZ(sx * -0.6).translate(sx * 0.08, 0.5, 0), 'roof');
  // hand pump and a bucket
  p.add('iron', box(0.04, 0.22, 0.04, 0.05, 0.12, 0), 'openings');
  p.add('iron', new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6).rotateZ(1.2).translate(0.1, 0.32, 0), 'openings');
  p.add('iron', box(0.06, 0.012, 0.012, 0.0, 0.26, 0), 'openings');
  const put = (x: number, z: number, fn: (a: Add) => void) => fn((m, g) => p.add(m, g.translate(x, 0.004, z), 'interior'));
  put(0.0, 0.2, a => Clutter.bucket(a));
  p.collide({ x0: -0.17, z0: -0.17, x1: 0.17, z1: 0.17 });
  const g = p.finish();
  g.userData.chimneyTop = null;
  return g;
}

function shed(spec: { W: number; D: number; outer: Parameters<typeof buildGabled>[0]['outer']; front: Parameters<typeof buildGabled>[0]['front'] }, furnish: (c: FurnishCtx) => void, seed: number, extras?: (p: Parts) => void): THREE.Group {
  return buildGabled({
    W: spec.W, D: spec.D, floor: 0.03, wallH: 0.4, wallT: 0.02, rise: 0.12, eave: 0.04, gableOver: 0.03, porch: 0,
    foundation: 'concrete', floorMat: 'concrete', outer: spec.outer, inner: null, roof: 'metal_roof', trim: 'trim',
    front: spec.front, left: [{ kind: 'window', at: 0, w: 0.1, h: 0.1, sill: 0.22 }], corners: 'boards',
  }, furnish, new Parts(seed), extras).group;
}

function wellDrilled(_def: KitPieceDef, seed = 1): THREE.Group {
  return shed({ W: 0.32, D: 0.38, outer: 'board_batten', front: [{ kind: 'door', at: 0.04, w: 0.14, h: 0.33 }] }, c => {
    c.I({ x: -0.06, z: c.back + 0.06 }, a => Equipment.pressureTank(a));
    c.I({ x: 0.08, z: -0.05 }, a => Equipment.wellCap(a));
    c.C({ x: 0.1, z: c.back + 0.004, y: c.y0 + 1.3 * M }, a => Clutter.calendar(a), 0.6);
    c.C({ x: c.right - 0.03, z: 0.1 }, a => Clutter.bucket(a), 0.7);
  }, seed);
}

function batteryShed(_def: KitPieceDef, seed = 1): THREE.Group {
  return shed({ W: 0.42, D: 0.42, outer: 'board_batten', front: [{ kind: 'door', at: 0.08, w: 0.14, h: 0.33 }] }, c => {
    c.I({ x: -0.06, z: c.back + 0.05 }, a => Equipment.batteryRack(a, 4));
    c.I({ x: c.left + 0.02, z: 0.0, rot: Math.PI / 2 }, a => Equipment.inverterWall(a), false);
    c.I({ x: 0.12, z: c.back + 0.05 }, a => Equipment.batteryRack(a, 3));
    c.C({ x: c.right - 0.002, z: 0.05, y: c.y0 + 1.2 * M, rot: -Math.PI / 2 }, a => Clutter.calendar(a), 0.5);
    c.parts.add('lamp', box(0.12, 0.01, 0.025, 0, c.yE - 0.03, 0), 'interior');
  }, seed);
}

function generatorShed(_def: KitPieceDef, seed = 1): THREE.Group {
  return shed({ W: 0.42, D: 0.38, outer: 'metal_siding', front: [{ kind: 'bay', at: 0, w: 0.3, h: 0.34 }] }, c => {
    c.I({ x: -0.05, z: -0.04 }, a => Furniture.generator(a));
    c.I({ x: 0.05, z: c.back + 0.06 }, a => Equipment.fuelDrums(a));
    c.I({ x: c.right - 0.02, z: -0.05, rot: -Math.PI / 2 }, a => Equipment.inverterWall(a), false);
  }, seed, p => p.add('iron', new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8).translate(-0.12, 0.6, -0.12), 'chimney'));
}

function cistern(_def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  p.layer = 'stakes';
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) p.add('trim', box(0.012, 0.09, 0.012, x, -0.02, z));
  p.add('concrete', cyl(0.24, 0.03, 0, -0.01, 0, 20), 'foundation');
  const r = 2.7 * M / 2, h = 2.2 * M;
  p.add('poly_tank', cyl(r, h, 0, 0.02, 0, 24), 'frame');
  for (let k = 1; k < 5; k++) p.add('poly_tank', new THREE.TorusGeometry(r + 0.003, 0.004, 4, 24).rotateX(Math.PI / 2).translate(0, 0.02 + k * h / 5, 0), 'frame');
  p.add('poly_tank', new THREE.ConeGeometry(r, 0.06, 24).translate(0, 0.02 + h + 0.03, 0), 'roof');
  p.add('iron', cyl(0.03, 0.04, 0, 0.02 + h + 0.05, 0, 10), 'roof');
  // inlet from the downspouts, the tap and the overflow
  p.add('steel', box(0.02, 0.02, 0.2, 0.1, 0.02 + h - 0.04, r + 0.08), 'openings');
  p.add('steel', cyl(0.012, 0.06, r * 0.7, 0.04, r * 0.7, 6), 'openings');
  p.add('steel', box(0.25, 0.015, 0.015, r + 0.1, 0.02 + h * 0.85, 0), 'openings');
  for (let k = 0; k < 8; k++) p.add('steel', box(0.06, 0.008, 0.008, -r - 0.012, 0.05 + k * 0.045, 0), 'openings');   // ladder rungs
  p.collide({ x0: -r, z0: -r, x1: r, z1: r });
  const g = p.finish();
  g.userData.chimneyTop = null;
  return g;
}

function waterTower(_def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const deck = 0.8, legX = 0.2;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * legX, -0.02, sz * legX));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('concrete', box(0.08, 0.06, 0.08, sx * legX, -0.03, sz * legX), 'foundation');
  // timber legs, cross bracing, the deck with a rail (a lookout)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('wood_dark', box(0.04, deck, 0.04, sx * legX, 0, sz * legX), 'frame');
  for (const y of [0.25, 0.55]) for (const [a, b] of [[[-1, -1], [1, -1]], [[-1, 1], [1, 1]], [[-1, -1], [-1, 1]], [[1, -1], [1, 1]]] as const) {
    const ax = a[0] * legX, az = a[1] * legX, bx = b[0] * legX, bz = b[1] * legX;
    p.add('wood_mid', box(Math.hypot(bx - ax, bz - az), 0.02, 0.02, 0, 0, 0).rotateY(-Math.atan2(bz - az, bx - ax)).translate((ax + bx) / 2, y, (az + bz) / 2), 'frame');
  }
  p.add('deck', box(legX * 2 + 0.14, 0.025, legX * 2 + 0.14, 0, deck, 0), 'rafters');
  for (const sx of [-1, 1]) {
    p.add('wood_mid', box(legX * 2 + 0.14, 0.02, 0.02, 0, deck + 0.17, sx * (legX + 0.07)), 'rafters');
    p.add('wood_mid', box(0.02, 0.02, legX * 2 + 0.14, sx * (legX + 0.07), deck + 0.17, 0), 'rafters');
  }
  // the tank on the deck
  const r = 1.8 * M / 2, h = 1.6 * M;
  p.add('wood_mid', cyl(r, h, 0, deck + 0.025, 0, 20), 'roof');
  for (let k = 0; k < 3; k++) p.add('iron', new THREE.TorusGeometry(r + 0.004, 0.005, 4, 20).rotateX(Math.PI / 2).translate(0, deck + 0.06 + k * h / 3, 0), 'roof');
  p.add('metal_roof', new THREE.ConeGeometry(r + 0.03, 0.09, 20).translate(0, deck + 0.025 + h + 0.045, 0), 'roof');
  // ladder and the downpipe
  for (const sx of [-1, 1]) p.add('wood_dark', box(0.012, deck + 0.2, 0.012, sx * 0.05, 0, legX + 0.09), 'openings');
  for (let k = 1; k < 12; k++) p.add('wood_dark', box(0.1, 0.01, 0.01, 0, k * 0.075, legX + 0.09), 'openings');
  p.add('steel', cyl(0.015, deck + 0.03, -0.08, 0, -0.08, 8), 'openings');
  p.collide({ x0: -legX - 0.03, z0: -legX - 0.03, x1: legX + 0.03, z1: legX + 0.03 });
  const g = p.finish();
  g.userData.chimneyTop = null;
  return g;
}

function solarArray(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  const pw = 1.13 * M, ph = 1.72 * M, tilt = 0.6;          // 400 W panels, ≈ 35° toward +z
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (W / 2 - 0.05), -0.02, sz * (D / 2 - 0.05)));
  const rows = [-0.22, 0.25], perRow = 6;
  for (const rz of rows) {
    const x0 = -(perRow * pw) / 2;
    // footings and racking
    for (let i = 0; i <= 3; i++) {
      const x = x0 + i * (perRow * pw) / 3;
      p.add('concrete', box(0.05, 0.04, 0.05, x, -0.02, rz - 0.08), 'foundation');
      p.add('concrete', box(0.05, 0.04, 0.05, x, -0.02, rz + 0.08), 'foundation');
      p.add('steel', box(0.02, 0.06, 0.02, x, 0, rz + 0.08), 'frame');
      p.add('steel', box(0.02, 0.2, 0.02, x, 0, rz - 0.08), 'frame');
      p.add('steel', box(0.015, 0.015, ph + 0.02, 0, 0, 0).rotateX(tilt).translate(x, 0.13, rz), 'frame');
    }
    // panels (portrait, one row of 6)
    for (let i = 0; i < perRow; i++) {
      const x = x0 + (i + 0.5) * pw;
      const g = new THREE.PlaneGeometry(pw - 0.004, ph).rotateX(-Math.PI / 2 + tilt).translate(x, 0.145, rz);
      g.userData.keepUV = true;
      p.add('solar_cell', g, 'roof');
      p.add('steel', box(pw - 0.004, 0.008, ph, 0, -0.005, 0).rotateX(tilt).translate(x, 0.145, rz), 'roof');
    }
    p.collide({ x0: x0, z0: rz - 0.15, x1: -x0, z1: rz + 0.15 });
  }
  // combiner box and conduit
  p.add('iron', box(0.05, 0.07, 0.03, W / 2 - 0.1, 0.05, 0), 'openings');
  p.add('steel', box(0.012, 0.05, 0.012, W / 2 - 0.1, 0, 0), 'openings');
  const g = p.finish();
  g.userData.chimneyTop = null;
  return g;
}

function septic(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (W / 2 - 0.05), -0.02, sz * (D / 2 - 0.05)));
  // dug ground (foundation), then the field lines show as faint green stripes over the gravel trenches
  p.add('soil', box(W - 0.1, 0.004, D - 0.1, 0, 0, 0), 'foundation');
  for (let k = -2; k <= 2; k++) p.add('earth', box(W - 0.2, 0.006, 0.05, 0, 0.002, k * 0.15 + 0.08), 'roof');
  p.add('concrete', cyl(0.06, 0.02, -0.3, 0.004, -0.38, 14), 'openings');
  p.add('concrete', cyl(0.06, 0.02, -0.12, 0.004, -0.38, 14), 'openings');
  p.add('steel', cyl(0.012, 0.15, 0.0, 0, -0.38, 8), 'openings');
  p.add('steel', box(0.6, 0.004, 0.01, 0.1, 0.004, -0.33), 'interior');
  const g = p.finish();
  g.userData.chimneyTop = null;
  return g;
}

export const UTILITY_BUILDERS: Record<string, (def: KitPieceDef, seed?: number) => THREE.Group> = {
  well_hand: wellHand, well_drilled: wellDrilled, cistern, water_tower: waterTower,
  solar_array: solarArray, battery_shed: batteryShed, generator_shed: generatorShed, septic,
};
