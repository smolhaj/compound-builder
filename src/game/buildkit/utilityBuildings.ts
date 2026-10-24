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
  batteryRack(add: Add, n = 4, wm = 1.0): void {
    add('steel', box(wm * M, 0.06 * M, 0.5 * M, 0, 0, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('steel', box(0.05 * M, 1.6 * M, 0.05 * M, sx * (wm / 2 - 0.025) * M, 0, sz * 0.22 * M));
    for (let k = 0; k < n; k++) {
      const y = (0.08 + k * 0.38) * M;
      add('steel', box(wm * M, 0.03 * M, 0.5 * M, 0, y, 0));                                       // shelf
      add('iron', box((wm - 0.12) * M, 0.28 * M, 0.42 * M, 0, y + 0.03 * M, 0.02 * M));           // battery module
      add('paint_green', box(0.1 * M, 0.04 * M, 0.01 * M, (wm / 2 - 0.16) * M, y + 0.22 * M, 0.235 * M));   // charge LED
      add('steel', box(0.5 * M, 0.02 * M, 0.02 * M, -0.1 * M, y + 0.26 * M, 0.235 * M));          // bus bar
    }
  },
  /** Wall extinguisher on a bracket (y = mounting height of its foot). */
  extinguisher(add: Add): void {
    add('paint_red', cyl(0.08 * M, 0.5 * M, 0, 0, 0.09 * M, 10));
    add('iron', cyl(0.03 * M, 0.08 * M, 0, 0.5 * M, 0.09 * M, 6));
    add('iron', box(0.14 * M, 0.03 * M, 0.04 * M, 0.04 * M, 0.58 * M, 0.09 * M));
    add('steel', box(0.12 * M, 0.06 * M, 0.02 * M, 0, 0.3 * M, 0.01 * M));
  },
  /** A yellow warning placard on a wall (art: plain sign). */
  sign(add: Add, w = 0.35, h = 0.25): void {
    add('paint_yellow', box(w * M, h * M, 0.01 * M, 0, 0, 0.005 * M));
    add('iron', box(w * 0.8 * M, h * 0.18 * M, 0.004 * M, 0, h * 0.62 * M, 0.011 * M));
    add('iron', box(w * 0.6 * M, h * 0.1 * M, 0.004 * M, 0, h * 0.3 * M, 0.011 * M));
  },
  /** Louvred wall vent (hydrogen / heat out). */
  vent(add: Add): void {
    add('steel', box(0.4 * M, 0.3 * M, 0.03 * M, 0, 0, 0.015 * M));
    for (let k = 0; k < 5; k++) add('iron', box(0.36 * M, 0.025 * M, 0.02 * M, 0, (0.03 + k * 0.055) * M, 0.035 * M));
  },
  /** Small parts shelf: a toolbox, fuse boxes, a coil of cable, a multimeter. */
  partsShelf(add: Add): void {
    add('wood_mid', box(0.9 * M, 0.03 * M, 0.3 * M, 0, 1.0 * M, 0));
    add('wood_mid', box(0.9 * M, 0.03 * M, 0.3 * M, 0, 1.45 * M, 0));
    for (const sx of [-1, 1]) add('iron', box(0.03 * M, 0.2 * M, 0.25 * M, sx * 0.38 * M, 0.8 * M, -0.02 * M));
    add('paint_red', box(0.4 * M, 0.18 * M, 0.2 * M, -0.2 * M, 1.03 * M, 0));                      // toolbox
    add('iron', box(0.3 * M, 0.02 * M, 0.04 * M, -0.2 * M, 1.21 * M, 0));
    add('paint_yellow', box(0.08 * M, 0.14 * M, 0.04 * M, 0.15 * M, 1.03 * M, 0.06 * M));          // multimeter
    add('iron', new THREE.TorusGeometry(0.09 * M, 0.03 * M, 6, 12).rotateX(Math.PI / 2).translate(0.28 * M, 1.05 * M, 0));   // cable coil
    for (let k = 0; k < 3; k++) add('paint_green', box(0.12 * M, 0.1 * M, 0.08 * M, (-0.3 + k * 0.15) * M, 1.48 * M, 0));       // fuse boxes
    add('iron', box(0.22 * M, 0.12 * M, 0.15 * M, 0.25 * M, 1.48 * M, 0));
  },
  /** Inverter, charge controller and disconnect on a plywood backboard (its back at z = 0, on the wall). */
  inverterWall(wallAdd: Add): void {
    const add: Add = (m, g) => wallAdd(m, g.translate(0, 0, 0.12 * M));
    add('wood_mid', box(1.75 * M, 1.0 * M, 0.02 * M, 0.05 * M, 0.75 * M, -0.11 * M));
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
  g.userData.keep = ['frame', 'rafters'];
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
    c.I({ x: -0.085, z: c.back + 0.05 }, a => Equipment.batteryRack(a, 4, 1.0));
    c.I({ x: 0.085, z: c.back + 0.05 }, a => Equipment.batteryRack(a, 3, 1.0));
    c.I({ x: c.left + 0.002, z: 0.0, rot: Math.PI / 2 }, a => Equipment.inverterWall(a), false);
    c.I({ x: c.right - 0.03, z: 0.02, rot: -Math.PI / 2 }, a => Equipment.partsShelf(a), false);
    c.I({ x: 0.04, z: 0.06 }, a => Furniture.stool(a));
    c.C({ x: c.right - 0.002, z: 0.13, y: c.y0 + 0.5 * M, rot: -Math.PI / 2 }, a => Equipment.extinguisher(a), 1);
    c.C({ x: c.left + 0.002, z: -0.13, y: c.y0 + 1.75 * M, rot: Math.PI / 2 }, a => Equipment.sign(a), 1);
    c.C({ x: 0.0, z: c.back + 0.002, y: c.y0 + 1.9 * M }, a => Equipment.vent(a), 1);
    c.C({ x: c.right - 0.002, z: -0.1, y: c.y0 + 1.2 * M, rot: -Math.PI / 2 }, a => Clutter.calendar(a), 0.6);
    c.C({ x: -0.1, z: 0.12 }, a => Clutter.broom(a), 0.5);
    c.parts.add('lamp', box(0.12, 0.01, 0.025, 0, c.yE - 0.03, 0), 'decor');
  }, seed);
}

function generatorShed(_def: KitPieceDef, seed = 1): THREE.Group {
  return shed({ W: 0.42, D: 0.38, outer: 'metal_siding', front: [{ kind: 'bay', at: 0, w: 0.3, h: 0.34 }] }, c => {
    c.I({ x: -0.05, z: -0.04 }, a => Furniture.generator(a));
    c.I({ x: 0.05, z: c.back + 0.06 }, a => Equipment.fuelDrums(a));
    c.I({ x: c.right - 0.002, z: -0.05, rot: -Math.PI / 2 }, a => Equipment.inverterWall(a), false);
    c.C({ x: c.left + 0.002, z: 0.1, y: c.y0 + 0.5 * M, rot: Math.PI / 2 }, a => Equipment.extinguisher(a), 1);
    c.C({ x: c.left + 0.002, z: -0.08, y: c.y0 + 1.6 * M, rot: Math.PI / 2 }, a => Equipment.sign(a), 1);
    c.C({ x: c.left + 0.05, z: c.back + 0.04 }, a => { for (let k = 0; k < 3; k++) a('paint_yellow', box(0.14 * M, 0.3 * M, 0.1 * M, k * 0.16 * M, 0, 0)); }, 0.8);   // oil jugs
    c.C({ x: 0.1, z: 0.12 }, a => Clutter.bucket(a), 0.6);
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
  // inlet: the buried line from the house gutters comes up beside the tank, over the top, through a first-flush filter
  const pr = 0.05 * M, top = 0.02 + h;
  p.add('iron', cyl(pr, top + 0.02, 0.06, 0, r + 0.03, 8), 'openings');
  p.add('iron', box(pr * 2, pr * 2, 0.06, 0.06, top + 0.02 - pr, r + 0.0), 'openings');
  p.add('enamel', cyl(0.07 * M, 0.5 * M, 0.06, top - 0.5 * M, r + 0.03, 8), 'openings');               // first-flush chamber
  // the tap on a short stand-pipe, and the overflow elbowing down to a splash stone
  p.add('steel', cyl(0.012, 0.06, r * 0.7, 0.04, r * 0.7, 6), 'openings');
  p.add('iron', box(0.06, pr * 2, pr * 2, r + 0.03, top - 0.03, 0), 'openings');
  p.add('iron', cyl(pr, top - 0.03, r + 0.06, 0, 0, 8), 'openings');
  p.add('fieldstone', box(0.08, 0.015, 0.08, r + 0.06, -0.005, 0), 'openings');
  // fixed ladder up the side: two rails and rungs
  for (const sz of [-1, 1]) p.add('steel', box(0.008, top + 0.06, 0.008, -r - 0.016, 0, sz * 0.03), 'openings');
  for (let k = 0; k < 8; k++) p.add('steel', box(0.008, 0.008, 0.06, -r - 0.016, 0.05 + k * 0.045, 0), 'openings');
  p.collide({ x0: -r, z0: -r, x1: r, z1: r });
  const g = p.finish();
  g.userData.keep = ['frame', 'rafters'];
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
  // X-braces on each face between the two girts
  for (const [a, b] of [[[-1, -1], [1, -1]], [[-1, 1], [1, 1]], [[-1, -1], [-1, 1]], [[1, -1], [1, 1]]] as const) {
    const ax = a[0] * legX, az = a[1] * legX, bx = b[0] * legX, bz = b[1] * legX;
    const run = Math.hypot(bx - ax, bz - az), rise = 0.3, len = Math.hypot(run, rise), yaw = -Math.atan2(bz - az, bx - ax);
    // nudge each brace a little outboard of the legs so it reads on the face
    const ox = (a[0] === b[0] ? a[0] : 0) * 0.025, oz = (a[1] === b[1] ? a[1] : 0) * 0.025;
    for (const sgn of [-1, 1]) p.add('wood_mid', box(len, 0.016, 0.016, 0, 0, 0).rotateZ(sgn * Math.atan2(rise, run)).rotateY(yaw).translate((ax + bx) / 2 + ox, 0.4, (az + bz) / 2 + oz), 'frame');
  }
  const half = legX + 0.07;
  p.add('deck', box(half * 2, 0.025, half * 2, 0, deck, 0), 'rafters');
  // lookout rail: posts at the corners and mid-sides, a top rail and a mid rail
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) {
    if (sx === 0 && sz === 0) continue;
    if (sz === 1 && sx === 0) continue;                    // the ladder comes up here
    p.add('wood_dark', box(0.02, 0.18, 0.02, sx * (half - 0.01), deck + 0.025, sz * (half - 0.01)), 'rafters');
  }
  for (const y of [0.09, 0.18]) for (const sx of [-1, 1]) {
    p.add('wood_mid', box(0.016, 0.016, half * 2, sx * (half - 0.01), deck + y, 0), 'rafters');
    if (sx < 0) p.add('wood_mid', box(half * 2, 0.016, 0.016, 0, deck + y, -(half - 0.01)), 'rafters');
    else for (const ex of [-1, 1]) p.add('wood_mid', box(half - 0.07, 0.016, 0.016, ex * (half + 0.07) / 2, deck + y, half - 0.01), 'rafters');
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
  g.userData.keep = ['frame', 'rafters'];
  g.userData.chimneyTop = null;
  return g;
}

function solarArray(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  // 400 W panels (1.13 × 1.72 m, portrait), tilted ≈ 34° toward +z; low edge ≈ 0.8 m off the ground
  const pw = 1.13 * M, ph = 1.72 * M, tilt = 0.6, low = 0.8 * M;
  const sinT = Math.sin(tilt), cosT = Math.cos(tilt);
  const hy = (s: number) => low + (ph / 2 - s) * sinT;          // height of a point s along the slope (s = +ph/2 low edge … −ph/2 high edge)
  const hz = (s: number) => s * cosT;                           // its z offset from the row centre
  const slab = (w: number, t: number, len: number, s: number, up: number, x: number, rz: number) =>
    box(w, t, len, 0, -t / 2, 0).rotateX(tilt).translate(x, hy(s) + up, rz + hz(s));
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (W / 2 - 0.05), -0.02, sz * (D / 2 - 0.05)));
  const rows = [-0.24, 0.25], perRow = 6;
  for (const rz of rows) {
    const half = (perRow * pw) / 2;
    const fs = ph / 2 - 0.12 * M, bs = -ph / 2 + 0.12 * M;     // front / rear post positions along the slope
    // trestles: front and rear posts on concrete footings, a sloped rafter, a diagonal brace
    for (let i = 0; i <= 3; i++) {
      const x = -half + 0.1 * M + i * (2 * half - 0.2 * M) / 3;
      for (const s of [fs, bs]) {
        p.add('concrete', box(0.3 * M, 0.25 * M, 0.3 * M, x, -0.1 * M, rz + hz(s)), 'foundation');
        p.add('steel', box(0.09 * M, hy(s) - 0.32 * M, 0.09 * M, x, 0.1 * M, rz + hz(s)), 'frame');
      }
      p.add('steel', slab(0.08 * M, 0.12 * M, ph, 0, -0.16 * M, x, rz), 'frame');
      const dy = hy(bs) - 0.3 * M, dz = hz(bs) - hz(fs);
      const br = new THREE.BoxGeometry(0.05 * M, 0.05 * M, Math.hypot(dy, dz)).rotateX(Math.atan2(dy, -dz)).translate(x, 0.3 * M + dy / 2, rz + hz(fs) + dz / 2);
      p.add('steel', br, 'frame');
    }
    // two purlins (rails) the length of the row, under the panels
    for (const s of [ph * 0.28, -ph * 0.28]) p.add('steel', slab(2 * half + 0.1 * M, 0.06 * M, 0.06 * M, s, -0.07 * M, 0, rz), 'frame');
    // panels: cells on top, an aluminium frame round each, a pale backsheet underneath
    for (let i = 0; i < perRow; i++) {
      const x = -half + (i + 0.5) * pw;
      const g = new THREE.PlaneGeometry(pw - 0.03 * M, ph - 0.03 * M).rotateX(-Math.PI / 2 + tilt).translate(x, hy(0) + 0.002, rz);
      g.userData.keepUV = true;
      p.add('solar_cell', g, 'roof');
      p.add('trim', slab(pw - 0.02 * M, 0.035 * M, ph - 0.02 * M, 0, -0.02 * M, x, rz), 'roof');                           // backsheet
      for (const s of [ph / 2 - 0.01 * M, -ph / 2 + 0.01 * M]) p.add('steel', slab(pw - 0.01 * M, 0.04 * M, 0.025 * M, s, 0.012 * M, x, rz), 'roof');
      for (const dx of [-1, 1]) p.add('steel', slab(0.025 * M, 0.04 * M, ph, 0, 0.012 * M, x + dx * (pw / 2 - 0.0125 * M), rz), 'roof');
    }
    p.collide({ x0: -half, z0: rz - 0.15, x1: half, z1: rz + 0.15 });
  }
  // combiner box on a post and a conduit to the ground (the cable trench leaves from here)
  p.add('steel', box(0.06 * M, 1.1 * M, 0.06 * M, W / 2 - 0.1, 0, 0.05), 'openings');
  p.add('iron', box(0.4 * M, 0.5 * M, 0.18 * M, W / 2 - 0.1, 0.7 * M, 0.05 + 0.06 * M), 'openings');
  p.add('paint_red', box(0.06 * M, 0.06 * M, 0.02 * M, W / 2 - 0.1 + 0.1 * M, 0.95 * M, 0.05 + 0.16 * M), 'openings');
  const g = p.finish();
  g.userData.keep = ['frame', 'rafters'];
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
