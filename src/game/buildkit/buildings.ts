/**
 * Building registry: every kit piece's geometry (layered for construction,
 * furnished inside, with colliders, a chimney / smoke source and evening
 * seats). All use the shared shell (shell.ts) and interior kit
 * (interior.ts); see docs/ROADMAP.md for the catalogue still to come.
 */
import * as THREE from 'three';
import { CELL, KIT, type KitPieceDef } from './kit';
import { Furniture, M, wallRun } from './interior';
import { buildCabinLayers } from './cabinGeometry';
import { box, buildGabled, CUT_H, Parts, showStage, type BuildOpts, type FurnishCtx } from './shell';
import { Clutter } from './clutter';
import { UTILITY_BUILDERS } from './utilityBuildings';
import { BUNKER_BUILDERS } from './bunkerBuildings';
import { OLD_BUILDERS } from './oldBuildings';
import { COMPOUND_BUILDERS } from './compoundBuildings';
import { FOOD_BUILDERS } from './foodBuildings';

/** Seats for evenings at home: local x, z and the point the sitter faces. */
export type Seat = [number, number, number, number];

// ─────────────────────────────────────────────────────────────────────────
// Outhouse
// ─────────────────────────────────────────────────────────────────────────

function outhouse(_def: KitPieceDef, seed = 1): THREE.Group {
  const { group } = buildGabled({
    W: 0.24, D: 0.28, floor: 0.03, wallH: 0.38, wallT: 0.018, rise: 0.07, eave: 0.04, gableOver: 0.03, porch: 0,
    foundation: 'fieldstone', floorMat: 'deck', outer: 'board_batten', inner: null, roof: 'metal_roof', trim: 'wood_dark',
    front: [{ kind: 'door', at: 0, w: 0.13, h: 0.33 }],
    left: [{ kind: 'window', at: 0.02, w: 0.06, h: 0.05, sill: 0.3 }],
    corners: 'none',
  }, (c: FurnishCtx) => {
    // bench seat with the hole, a roll on a nail, the lime bucket and a lantern
    c.I({ x: 0, z: c.back + 0.04 }, a => {
      a('wood_mid', box(0.2, 0.075, 0.08, 0, 0, 0));
      a('cutcap', new THREE.CircleGeometry(0.022, 14).rotateX(-Math.PI / 2).translate(0, 0.0755, 0.005));
      a('wood_dark', new THREE.RingGeometry(0.022, 0.034, 14).rotateX(-Math.PI / 2).translate(0, 0.076, 0.005));
    });
    c.I({ x: 0.075, z: c.back + 0.004 }, a => a('linen', new THREE.CylinderGeometry(0.012, 0.012, 0.02, 10).rotateZ(Math.PI / 2).translate(0, 0.12, 0.015)), false);
    c.I({ x: -0.08, z: 0.06 }, a => { a('steel', new THREE.CylinderGeometry(0.03, 0.026, 0.06, 10).translate(0, 0.03, 0)); a('enamel', new THREE.CylinderGeometry(0.028, 0.028, 0.004, 10).translate(0, 0.058, 0)); }, false);
    c.I({ x: -0.09, z: c.back + 0.01 }, a => Furniture.oilLamp(a, 0, 1.4, 0.06), false);
    c.C({ x: -0.04, z: c.back + 0.03, y: c.y0 + 0.08 }, a => Clutter.mail(a), 0.8);
    c.C({ x: 0.0, z: c.back + 0.002, y: c.y0 + 1.3 * M }, a => Clutter.calendar(a), 0.4);
  }, new Parts(seed), p => {
    // crescent moon cut into the front gable (dark), and a vent stack out the back
    const moon = new THREE.Shape();
    moon.absarc(0, 0, 0.025, Math.PI * 0.35, Math.PI * 1.65, false);
    moon.absarc(0.012, 0, 0.02, Math.PI * 1.55, Math.PI * 0.45, true);
    p.add('cutcap', new THREE.ShapeGeometry(moon).translate(0, 0.03 + 0.38 + 0.03, 0.141), 'openings');
    p.add('iron', new THREE.CylinderGeometry(0.01, 0.01, 0.5, 8).translate(0.08, 0.27, -0.155), 'chimney');
  });
  return group;
}

// ─────────────────────────────────────────────────────────────────────────
// Workshop & garage
// ─────────────────────────────────────────────────────────────────────────

function workshop(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  const forgeX = -0.4;
  const { group } = buildGabled({
    W, D, floor: 0.03, wallH: 0.55, wallT: 0.03, rise: 0.3, eave: 0.06, gableOver: 0.05, porch: 0,
    foundation: 'concrete', floorMat: 'concrete', outer: 'metal_siding', inner: null, roof: 'metal_roof', trim: 'trim',
    front: [{ kind: 'bay', at: -0.22, w: 0.6, h: 0.46 }, { kind: 'door', at: 0.5 }],
    left: [{ kind: 'window', at: -0.55, w: 0.3 }, { kind: 'window', at: 0.35, w: 0.3 }],
    right: [{ kind: 'window', at: -0.55, w: 0.3 }, { kind: 'window', at: 0.35, w: 0.3 }],
    chimney: { kind: 'pipe', x: forgeX - 0.4 * M, z: -D / 2 + 0.03 + 0.07 },
    tieBeams: [-0.6, 0, 0.6], corners: 'boards',
  }, (c: FurnishCtx) => {
    const { I, left, right, back } = c;
    I({ x: forgeX, z: back + 0.07 }, a => Furniture.forge(a));
    I({ x: 0.22, z: back + 0.065 }, a => Furniture.workbench(a, 3.2));
    I({ x: 0.22, z: back + 0.005 }, a => Furniture.toolWall(a, 3.2, 1.05), false);
    I({ x: 0.15, z: back + 0.2 }, a => Furniture.stool(a));
    I({ x: 0.4, z: back + 0.2 }, a => Furniture.stool(a));
    I({ x: right - 0.045, z: -0.45, rot: -Math.PI / 2 }, a => Furniture.rack(a, 2.4));
    I({ x: right - 0.045, z: 0.05, rot: -Math.PI / 2 }, a => Furniture.rack(a, 1.8));
    I({ x: left + 0.045, z: 0.05, rot: Math.PI / 2 }, a => Furniture.lumberRack(a, 3.6));
    I({ x: 0.28, z: -0.32 }, a => Furniture.tableSaw(a));
    I({ x: 0.52, z: 0.62, rot: Math.PI }, a => Furniture.generator(a));
    I({ x: -0.22, z: 0.4 }, a => Furniture.atv(a));
    // two hanging shop lights
    for (const z of [-0.45, 0.35]) c.parts.add('lamp', box(0.2, 0.012, 0.03, 0, c.yE - 0.06, z), 'decor');
    // a shop in use: a chair half built on the sawhorses, the radio, coffee, rags, a broom, boots
    const benchY = c.y0 + 0.004 + 0.92 * M;
    c.C({ x: 0.28, z: 0.22, rot: Math.PI / 2 }, a => Clutter.sawhorsesProject(a), 0.85);
    c.C({ x: 0.45, z: back + 0.07, y: benchY }, a => Clutter.radio(a), 0.8);
    c.C({ x: 0.0, z: back + 0.09, y: benchY }, a => Clutter.mug(a), 0.8);
    c.C({ x: 0.1, z: back + 0.05, y: benchY }, a => Clutter.jars(a, 4), 0.8);
    c.C({ x: right - 0.03, z: 0.55, rot: -Math.PI / 2 }, a => Clutter.broom(a), 0.8);
    c.C({ x: right - 0.002, z: 0.3, y: c.y0 + 1.4 * M, rot: -Math.PI / 2 }, a => Clutter.calendar(a), 0.8);
    c.C({ x: 0.5, z: c.front - 0.08, rot: 0.4 }, a => Clutter.boots(a, 'paint_green'), 0.7);
    c.C({ x: -0.55, z: back + 0.25 }, a => Clutter.bucket(a), 0.7);
    c.C({ x: -0.62, z: -0.35 }, a => Clutter.dogBed(a, c.rnd() < 0.5), 0.4);
  }, new Parts(seed, opts));
  return group;
}

// ─────────────────────────────────────────────────────────────────────────
// Root cellar: stone vault dug into the ground, earth bermed over
// ─────────────────────────────────────────────────────────────────────────

function rootCellar(def: KitPieceDef, seed = 1): THREE.Group {
  const W = 0.5, D = 0.72;
  const hz = def.cellsZ * CELL / 2;
  const parts = new Parts(seed);
  parts.oz = hz - D / 2 - 0.02;                // door wall near the front of the lot
  const { group } = buildGabled({
    W, D, floor: 0.02, wallH: 0.34, wallT: 0.05, rise: 0.12, eave: 0.03, gableOver: 0.03, porch: 0,
    foundation: 'concrete', floorMat: 'concrete', outer: 'fieldstone', inner: 'fieldstone', roof: 'earth', trim: 'wood_dark',
    front: [{ kind: 'door', at: 0, w: 0.14, h: 0.3 }], ceiling: 'wood_dark', corners: 'none',
  }, (c: FurnishCtx) => {
    const { I, left, right, back } = c;
    for (const z of [-0.2, 0.1]) {
      I({ x: left + 0.03, z, rot: Math.PI / 2 }, a => Furniture.shelfUnit(a, 1.6, 1.7, 'jars'));
      I({ x: right - 0.03, z, rot: -Math.PI / 2 }, a => Furniture.shelfUnit(a, 1.6, 1.7, 'jars'));
    }
    I({ x: -0.1, z: back + 0.06 }, a => Furniture.rootBin(a, 'log_end'));
    I({ x: 0.1, z: back + 0.06 }, a => Furniture.rootBin(a, 'paint_red'));
    I({ x: 0, z: 0.0 }, a => Furniture.crocks(a));
    I({ x: 0, z: -0.1, rot: 0 }, a => Furniture.hangingStrings(a, 2.0, 1.85), false);
    I({ x: 0.12, z: 0.2 }, a => Furniture.barrel(a));
    c.C({ x: 0, z: 0.0, y: c.y0 + 0.43 * M }, a => Clutter.candle(a), 0.8);
    c.C({ x: -0.12, z: 0.22 }, a => Clutter.laundryBasket(a), 0.5);
    c.C({ x: 0.1, z: 0.3 }, a => Clutter.bucket(a), 0.6);
  }, parts, p => {
    // the earth berm over the vault (with a sod cap), stone wing walls flanking the door, a vent pipe
    const oz = hz - D / 2 - 0.02;
    // sod-covered berm over the whole vault, banked against the stone headwall
    const mound = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.6, 0.62, 0.62).translate(0, -0.02, oz - 0.24);
    p.add('earth', mound, 'roof');
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.06, 0.42, 0.24).translate(sx * (W / 2 + 0.02), 0.21, oz + D / 2 - 0.1).rotateY(sx * 0.0);
      p.add('fieldstone', g, 'walls');
    }
    p.add('fieldstone', box(W + 0.1, 0.12, 0.05, 0, 0.32, oz + D / 2 - 0.02), 'walls');
    p.add('iron', new THREE.CylinderGeometry(0.014, 0.014, 0.18, 8).translate(0, 0.6, oz - 0.15), 'chimney');
    p.add('iron', new THREE.ConeGeometry(0.03, 0.03, 8).translate(0, 0.71, oz - 0.15), 'chimney');
  });
  return group;
}

// ─────────────────────────────────────────────────────────────────────────
// Chicken coop & run
// ─────────────────────────────────────────────────────────────────────────

function chickenCoop(def: KitPieceDef, seed = 1): THREE.Group {
  const LW = def.cellsX * CELL, LD = def.cellsZ * CELL;
  const W = 0.36, D = 0.4;
  const parts = new Parts(seed);
  parts.oz = -LD / 2 + D / 2 + 0.05;            // coop at the back of the lot, the run in front
  const hens: Array<[number, number, number, 'paint_red' | 'linen' | 'wood_dark']> = [
    [-0.25, 0.1, 0.4, 'paint_red'], [0.05, 0.2, 2.2, 'linen'], [0.28, 0.05, -1.2, 'wood_dark'], [-0.1, 0.32, 3.4, 'paint_red'], [0.2, 0.32, 1.0, 'linen'], [-0.32, 0.3, -0.6, 'wood_dark'],
  ];
  const { group } = buildGabled({
    W, D, floor: 0.12, wallH: 0.24, wallT: 0.018, rise: 0.1, eave: 0.04, gableOver: 0.04, porch: 0,
    foundation: 'piers', floorMat: 'straw', outer: 'board_batten', inner: null, roof: 'metal_roof', trim: 'trim',
    front: [{ kind: 'door', at: 0.06, w: 0.12, h: 0.21 }, { kind: 'window', at: -0.08, w: 0.08, h: 0.08, sill: 0.12 }],
    left: [{ kind: 'arch', at: 0.05, w: 0.05, h: 0.06 }],
    corners: 'boards',
  }, (c: FurnishCtx) => {
    c.I({ x: 0, z: c.back + 0.08 }, a => Furniture.roosts(a, 1.6));
    c.I({ x: c.right - 0.03, z: -0.02, rot: -Math.PI / 2 }, a => Furniture.nestBoxes(a, 3, 0.25));
    c.I({ x: -0.07, z: c.back + 0.1, y: c.y0 + 0.004 + 0.5 * M }, a => Furniture.hen(a, 'linen'), false);
    c.I({ x: 0.07, z: c.back + 0.13, y: c.y0 + 0.004 + 0.8 * M }, a => Furniture.hen(a, 'wood_dark'), false);
  }, parts, p => {
    // the run: posts, welded-wire walls and roof, a gate in front; feeder, ramp and hens
    const x0 = -LW / 2 + 0.04, x1 = LW / 2 - 0.04, z0 = -LD / 2 + 0.04, z1 = LD / 2 - 0.04, H = 0.3;
    const runZ0 = parts.oz + D / 2;
    const runs: Array<[number, number, number, number, Array<{ at: number; w: number; sill: number; h: number }>]> = [
      [x0, z1, x1, z1, [{ at: (x1 - x0) / 2 + 0.2, w: 0.14, sill: 0, h: 0.27 }]],
      [x0, z0, x0, z1, []], [x1, z0, x1, z1, []], [x0, z0, x1, z0, []],
    ];
    for (const [ax, az, bx, bz, ops] of runs) {
      p.collide(...wallRun(p.sink, 'roof', 'wire_mesh', { ax, az, bx, bz, y0: 0, h: H, t: 0.004, openings: ops }));
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.25));
      for (let i = 0; i <= n; i++) p.add('frame', box(0.02, H + 0.02, 0.02, ax + (bx - ax) * i / n, 0, az + (bz - az) * i / n), 'rafters');
    }
    p.add('wire_mesh', new THREE.PlaneGeometry(x1 - x0, z1 - runZ0).rotateX(-Math.PI / 2).translate(0, H + 0.01, (runZ0 + z1) / 2), 'roof');
    p.add('frame', box(x1 - x0, 0.02, 0.02, 0, H, runZ0), 'rafters');
    // gate leaf swung open
    p.add('frame', box(0.14, 0.27, 0.012, 0.07, 0, 0).rotateY(-1.2).translate(0.2 - 0.07, 0, z1), 'openings');
    // pop-door ramp from the coop side down into the run
    p.add('wood_mid', box(0.05, 0.008, 0.2, 0, 0, 0).rotateX(0.55).translate(-W / 2 - 0.03, 0.06, parts.oz + 0.05 + 0.06), 'openings');
    const sink = p.sink;
    const place = (x: number, z: number, rot: number, fn: (a: (m: Parameters<typeof sink>[1], g: THREE.BufferGeometry) => void) => void) =>
      fn((m, g) => sink('interior', m, g.rotateY(rot).translate(x, 0.004, z)));
    place(0.1, 0.32, 0, a => Furniture.feeder(a));
    for (const [x, z, r, col] of hens) place(x, z, r, a => Furniture.hen(a, col));
    p.add('straw', box(x1 - x0 - 0.02, 0.004, z1 - runZ0 - 0.02, 0, 0, (runZ0 + z1) / 2), 'deck');
    if (p.rnd() < 0.8) place(-0.32, 0.4, 0, a => Clutter.bucket(a));
    if (p.rnd() < 0.7) place(0.35, LD / 2 + 0.05, 0.4, a => Clutter.fruitBowl(a));
  });
  group.userData.keep = ['rafters'];       // the run's posts and top rails stay when it is finished
  return group;
}

// ─────────────────────────────────────────────────────────────────────────
// Kitchen garden
// ─────────────────────────────────────────────────────────────────────────

function garden(def: KitPieceDef, seed = 1): THREE.Group {
  const LW = def.cellsX * CELL, LD = def.cellsZ * CELL;
  const p = new Parts(seed);
  const x0 = -LW / 2 + 0.04, x1 = LW / 2 - 0.04, z0 = -LD / 2 + 0.04, z1 = LD / 2 - 0.04, H = 0.33;
  // site: corner stakes and lines
  p.layer = 'stakes';
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) p.add('trim', box(0.012, 0.09, 0.012, x, -0.02, z));
  // foundation: dug ground and a mulched path
  p.layer = 'foundation';
  p.add('soil', box(x1 - x0, 0.006, z1 - z0, 0, -0.002, 0));
  p.add('straw', box(0.14, 0.008, z1 - z0 - 0.04, 0, 0.0, 0));
  // frame: the raised beds (crops come with the finish)
  const crops: Array<'greens' | 'tall' | 'squash' | 'roots'> = ['tall', 'greens', 'squash', 'roots', 'greens', 'squash', 'roots', 'tall'];
  let i = 0;
  for (const bx of [-0.46, -0.21, 0.21, 0.46]) for (const bz of [-0.2, 0.34]) {
    const crop = crops[i++];
    const geos: Array<[Parameters<typeof p.add>[0], THREE.BufferGeometry]> = [];
    Furniture.raisedBed((m, g) => geos.push([m, g.translate(bx, 0.004, bz)]), 1.2, 2.8, crop);
    for (const [m, g] of geos) p.add(m, g, m === 'crop' || m === 'paint_red' ? 'interior' : 'frame');
    p.collide({ x0: bx - 0.1, z0: bz - 0.235, x1: bx + 0.1, z1: bz + 0.235 });
  }
  // fence posts (rafters stage) and wire (roof stage), gate gap at the front
  const runs: Array<[number, number, number, number, Array<{ at: number; w: number; sill: number; h: number }>]> = [
    [x0, z1, x1, z1, [{ at: (x1 - x0) / 2, w: 0.18, sill: 0, h: 0.33 }]],
    [x0, z0, x0, z1, []], [x1, z0, x1, z1, []], [x0, z0, x1, z0, []],
  ];
  for (const [ax, az, bx, bz, ops] of runs) {
    p.collide(...wallRun(p.sink, 'roof', 'wire_mesh', { ax, az, bx, bz, y0: 0, h: H, t: 0.004, openings: ops }));
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.3));
    for (let k = 0; k <= n; k++) p.add('wood_dark', box(0.02, H + 0.03, 0.02, ax + (bx - ax) * k / n, 0, az + (bz - az) * k / n), 'rafters');
    p.add('wood_mid', box(Math.abs(bx - ax) + 0.02, 0.015, Math.abs(bz - az) + 0.02, (ax + bx) / 2, H, (az + bz) / 2), 'rafters');
  }
  // finish: compost bins, rain barrel, tool rack, a bench
  p.layer = 'openings';
  const put = (x: number, z: number, rot: number, fn: (a: (m: Parameters<typeof p.add>[0], g: THREE.BufferGeometry) => void) => void, solid = true) => {
    const bb = new THREE.Box3(), t = new THREE.Box3();
    let any = false;
    fn((m, g) => { g.rotateY(rot).translate(x, 0.004, z); g.computeBoundingBox(); t.copy(g.boundingBox!); if (any) bb.union(t); else { bb.copy(t); any = true; } p.add(m, g, 'openings'); });
    if (solid && any) p.collide({ x0: bb.min.x, z0: bb.min.z, x1: bb.max.x, z1: bb.max.z });
  };
  put(-0.42, z0 + 0.1, 0, a => Furniture.compost(a));
  put(0.62, z0 + 0.08, 0, a => Furniture.barrel(a));
  put(0.4, z0 + 0.04, 0, a => Furniture.bench(a, 1.2));
  // work in progress: the wheelbarrow in the path, tools against the fence, a bucket, the day's picking
  if (p.rnd() < 0.85) put(0.0, -0.05 + p.rnd() * 0.2, 0.3, a => Clutter.wheelbarrow(a), false);
  if (p.rnd() < 0.85) put(x1 - 0.03, 0.05, -Math.PI / 2, a => Clutter.gardenTools(a), false);
  if (p.rnd() < 0.7) put(-0.08, 0.6, 0, a => Clutter.bucket(a), false);
  if (p.rnd() < 0.7) put(0.33, z0 + 0.06, 0, a => { const add = (m: Parameters<typeof p.add>[0], g: THREE.BufferGeometry) => a(m, g.translate(0, 0.4 * M, 0)); Clutter.fruitBowl(add); }, false);
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Field plot (a quarter acre: potatoes, dry beans, wheat)
// ─────────────────────────────────────────────────────────────────────────

function field(def: KitPieceDef, seed = 1): THREE.Group {
  const LW = def.cellsX * CELL, LD = def.cellsZ * CELL;
  const p = new Parts(seed);
  const x0 = -LW / 2 + 0.04, x1 = LW / 2 - 0.04, z0 = -LD / 2 + 0.04, z1 = LD / 2 - 0.04, H = 0.3;
  p.layer = 'stakes';
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) p.add('trim', box(0.012, 0.09, 0.012, x, -0.02, z));
  // foundation: the plowed ground, a grass headland round the edge and a lane up the middle
  p.layer = 'foundation';
  const hx0 = x0 + 0.12, hx1 = x1 - 0.12, hz0 = z0 + 0.12, hz1 = z1 - 0.32;
  p.add('soil', box(hx1 - hx0, 0.006, hz1 - hz0, (hx0 + hx1) / 2, -0.002, (hz0 + hz1) / 2));
  // frame: the crops in three bands across the field (rows run front to back, 0.9 m apart)
  const rowW = 0.9 * M, lane = 0.16, w = hx1 - hx0, band = (w - 2 * lane) / 3;
  const len = hz1 - hz0 - 0.04, zc = (hz0 + hz1) / 2;
  const bands: Array<'potato' | 'bean' | 'wheat'> = ['potato', 'bean', 'wheat'];
  bands.forEach((crop, b) => {
    const bx0 = hx0 + b * (band + lane);
    if (crop === 'wheat') {
      // drilled wheat (rows 25 cm apart, ≈ 0.9 m): each drill row is a ragged run of stalks with the heads above,
      // its height wandering a little along the row
      const drills = Math.round(band / (0.25 * M)), seg = 0.06;
      for (let i = 0; i < drills; i++) {
        const sx = bx0 + (i + 0.5) * band / drills;
        for (let z = zc - len / 2; z < zc + len / 2 - 1e-3; z += seg) {
          const h = (0.78 + 0.18 * p.rnd()) * M, l = Math.min(seg, zc + len / 2 - z) * 0.92;
          p.add('straw', box(0.05 * M, h, l, sx + (p.rnd() - 0.5) * 0.004, 0.004, z + l / 2), 'frame');
          p.add('grain', box(0.09 * M, 0.1 * M, l * 0.9, sx, 0.004 + h, z + l / 2), 'frame');
        }
      }
      return;
    }
    const rows = Math.floor(band / rowW);
    for (let i = 0; i < rows; i++) {
      const x = bx0 + (i + 0.5) * band / rows;
      // the hill or the ridge the row is planted in
      p.add('soil', box(0.35 * M, 0.18 * M, len, x, 0.004, zc), 'frame');
      const step = crop === 'potato' ? 0.6 * M * 2 : 0.5 * M * 2, n = Math.floor(len / step);
      for (let j = 0; j < n; j++) {
        const z = zc - len / 2 + (j + 0.5) * len / n, j2 = (p.rnd() - 0.5) * 0.02;
        if (crop === 'potato') p.add('crop', new THREE.IcosahedronGeometry(0.42 * M, 1).scale(1.2, 0.5, 1.5).translate(x + j2, 0.18 * M + 0.2 * M, z), 'interior');
        else p.add('crop', new THREE.IcosahedronGeometry(0.3 * M, 1).scale(1, 0.8, 1.8).translate(x + j2, 0.18 * M + 0.22 * M, z), 'interior');
      }
    }
  });
  // roof stage: the deer fence (≈ 2.4 m wire on posts) with a gate wide enough for a cart at the front
  const runs: Array<[number, number, number, number, Array<{ at: number; w: number; sill: number; h: number }>]> = [
    [x0, z1, x1, z1, [{ at: (x1 - x0) / 2, w: 0.5, sill: 0, h: H }]],
    [x0, z0, x0, z1, []], [x1, z0, x1, z1, []], [x0, z0, x1, z0, []],
  ];
  for (const [ax, az, bx, bz, ops] of runs) {
    p.collide(...wallRun(p.sink, 'roof', 'wire_mesh', { ax, az, bx, bz, y0: 0, h: H, t: 0.004, openings: ops }));
    const l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(l / 0.5));
    for (let k = 0; k <= n; k++) p.add('wood_dark', box(0.022, H + 0.03, 0.022, ax + (bx - ax) * k / n, 0, az + (bz - az) * k / n), 'rafters');
  }
  for (const sx of [-0.25, 0.25]) p.add('wood_dark', box(0.03, H + 0.06, 0.03, (x0 + x1) / 2 + sx, 0, z1), 'rafters');
  // finish: a bean-drying rack, a potato crate stack and a wheelbarrow at the gate
  p.layer = 'openings';
  const rx = hx1 - 0.3, rz = z1 - 0.18;
  for (const dx of [-0.25, 0, 0.25]) p.add('wood_mid', box(0.02, 0.28, 0.02, rx + dx, 0, rz));
  for (const y of [0.12, 0.22]) p.add('wood_mid', box(0.52, 0.015, 0.015, rx, y, rz));
  p.add('straw', box(0.48, 0.1, 0.05, rx, 0.14, rz));
  for (let i = 0; i < 3; i++) p.add('wood_mid', box(0.09, 0.06, 0.07, hx0 + 0.15 + (i % 2) * 0.1, (i > 1 ? 0.06 : 0), z1 - 0.16));
  if (p.rnd() < 0.85) {
    const geos: Array<[Parameters<typeof p.add>[0], THREE.BufferGeometry]> = [];
    Clutter.wheelbarrow((m, g) => geos.push([m, g]));
    for (const [m, g] of geos) p.add(m, g.rotateY(0.4).translate((x0 + x1) / 2 + 0.35, 0.004, z1 - 0.2), 'openings');
  }
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Log house
// ─────────────────────────────────────────────────────────────────────────

/** Bath / bedroom partitions (back right). */
const LH = { px: 0.15, bedZ: -0.45, bathZ: 0.15, loftZ: -0.32 };

function logHouse(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  const { group } = buildGabled({
    W, D, floor: 0.1, wallH: 0.55, wallT: 0.05, rise: 0.6, eave: 0.08, gableOver: 0.06, porch: 0.45,
    foundation: 'fieldstone', floorMat: 'deck', outer: 'log_wall', inner: 'log_wall', roof: 'metal_roof', trim: 'wood_dark',
    front: [{ kind: 'door', at: 0 }, { kind: 'window', at: -0.42, w: 0.38, h: 0.42, sill: 0.06 }, { kind: 'window', at: 0.42, w: 0.38, h: 0.42, sill: 0.06 }],
    back: [{ kind: 'door', at: 0.55 }, { kind: 'window', at: 0.05 }],
    left: [{ kind: 'window', at: -0.95 }, { kind: 'window', at: -0.3 }, { kind: 'window', at: 0.45 }, { kind: 'window', at: 0.95 }],
    right: [{ kind: 'window', at: -0.85 }, { kind: 'window', at: -0.15, w: 0.1, h: 0.1, sill: 0.3 }, { kind: 'window', at: 0.55 }, { kind: 'window', at: 0.95 }],
    gableWindow: { front: true, back: true, w: 0.9, h: 0.4, y: 0.04, rake: true },
    chimney: { kind: 'stone', x: -0.4 },
    ceiling: 'pine_panel', corners: 'logs', curtains: 'curtain_red',
  }, (c: FurnishCtx) => {
    const { I, L, left, right, front, back, y0, yE, parts } = c;
    // bedroom (back right) and bath (middle right)
    c.partition(LH.px, back, LH.px, LH.bathZ, [{ at: (LH.bedZ - back) - 0.3, w: 0.14, sill: 0, h: 0.36 }], 'pine_panel');
    c.partition(LH.px, LH.bedZ, right, LH.bedZ, [], 'pine_panel');
    c.partition(LH.px - 0.01, LH.bathZ, right, LH.bathZ, [{ at: 0.3, w: 0.14, sill: 0, h: 0.36 }], 'pine_panel');
    // living: stone fireplace on the back wall, sofa and chairs facing it, a rug, books
    I({ x: -0.4, z: back + 0.06 }, a => Furniture.fireplace(a, c.spec.wallH / M));
    I({ x: -0.4, z: -0.62 }, a => Furniture.rug(a, 2.6, 2.0), false);
    I({ x: -0.4, z: -0.45, rot: Math.PI }, a => Furniture.sofa(a, 'quilt_blue'));
    I({ x: -0.64, z: -0.8, rot: Math.PI / 2 + 0.4 }, a => Furniture.armchair(a, 'quilt_red'));
    I({ x: -0.12, z: -0.82, rot: -Math.PI / 2 - 0.4 }, a => Furniture.armchair(a, 'quilt_red'));
    I({ x: left + 0.03, z: -0.12, rot: Math.PI / 2 }, a => Furniture.shelfUnit(a, 1.4, 2.0, 'books'));
    I({ x: -0.62, z: back + 0.06 }, a => Furniture.woodbox(a));
    // kitchen and dining by the glass gable
    const o = c.parts.opts;
    I({ x: left + 0.05, z: 0.68, rot: Math.PI / 2 }, a => Furniture.counter(a, 3.4, 0.4, !!o.plumbed));
    if (o.wired) {
      I({ x: left + 0.065, z: 0.06, rot: Math.PI / 2 }, a => Furniture.fridge(a));
      for (const [x, z] of [[-0.32, 0.55], [-0.32, 0.72], [0.35, 0.78], [-0.4, -0.65], [0.45, -0.8]]) I({ x, z, y: z < -0.3 ? yE - 0.07 : yE + 0.2 }, a => Furniture.pendant(a, z < -0.3 ? 0.5 : 1.6), false);
    }
    if (o.plumbed) I({ x: LH.px + 0.06, z: LH.bathZ - 0.06, rot: Math.PI }, a => Furniture.waterHeater(a));
    I({ x: left + 0.02, z: 0.8, rot: Math.PI / 2 }, a => Furniture.wallShelf(a, 1.5, 1.5, 2, 'jars'), false);
    I({ x: left + 0.06, z: 0.22, rot: Math.PI / 2 }, a => Furniture.cookstove(a));
    I({ x: -0.32, z: 0.62, rot: Math.PI / 2 }, a => Furniture.island(a, 1.8));
    I({ x: 0.35, z: 0.78, rot: Math.PI / 2 }, a => Furniture.diningTable(a));
    I({ x: 0.62, z: front - 0.04, rot: Math.PI }, a => Furniture.shelfUnit(a, 1.0, 1.6, 'jars'));
    I({ x: -0.15, z: front - 0.01, rot: Math.PI }, a => Furniture.coatPegs(a, 0.9), false);
    // stairs up to the loft, rising toward the back along the partition
    I({ x: 0.06, z: LH.loftZ + 0.3 }, a => Furniture.stairs(a, c.spec.wallH / M, 3.6, 0.85));
    // bedroom
    I({ x: 0.45, z: back + 0.01 + 0.18 }, a => Furniture.bed(a, true, 'quilt_red'));
    I({ x: right - 0.04, z: back + 0.05 }, a => Furniture.nightstand(a));
    I({ x: 0.22, z: back + 0.05 }, a => Furniture.nightstand(a));
    I({ x: right - 0.05, z: LH.bedZ - 0.1, rot: -Math.PI / 2 }, a => Furniture.dresser(a, 1.2));
    // bath: clawfoot tub, washstand, composting toilet
    I({ x: 0.5, z: LH.bedZ + 0.08 }, a => Furniture.tub(a));
    I({ x: right - 0.04, z: 0.02, rot: -Math.PI / 2 }, a => Furniture.washstand(a));
    I({ x: 0.25, z: LH.bedZ + 0.1 }, a => (o.plumbed && o.septic ? Furniture.flushToilet(a) : Furniture.toilet(a)));
    // the loft over the back: floor, beam, rail; bunks and a bed under the roof
    const FW = right - left;
    parts.add('deck', box(FW, 0.025, LH.loftZ - back, 0, yE - 0.025, (LH.loftZ + back) / 2), 'loft');
    parts.add('wood_dark', box(FW, 0.04, 0.04, 0, yE - 0.065, LH.loftZ - 0.02), 'loft');
    L({ x: -0.32, z: LH.loftZ - 0.01 }, a => Furniture.rail(a, (FW / 2 - 0.12) / M));
    L({ x: 0.45, z: LH.loftZ - 0.01 }, a => Furniture.rail(a, 0.3 / M));
    L({ x: -0.32, z: -0.85 }, a => Furniture.bunk(a, 'quilt_red', 'quilt_blue'));
    L({ x: 0.32, z: -0.85 }, a => Furniture.single(a, 'quilt_blue'));
    L({ x: 0, z: back + 0.06 }, a => { Furniture.trunk(a); Furniture.oilLamp(a, 0, 0.5, 0); });
    L({ x: 0, z: -0.6 }, a => Furniture.rug(a, 1.6, 1.2));
    dressLogHouse(c);
    void y0;
  }, new Parts(seed, opts));
  return group;
}

/** Life in the log house. */
function dressLogHouse(c: FurnishCtx): void {
  const { C, L, y0, yE, left, right, front, back, hw, hd } = c;
  const tableY = y0 + 0.004 + 0.76 * M, islandY = y0 + 0.004 + 0.92 * M, counterY = y0 + 0.004 + 0.9 * M;
  const loft = (p: { x: number; z: number; rot?: number }, fn: Parameters<FurnishCtx['L']>[1], prob = 0.75) => { if (c.rnd() < prob) L({ ...p, y: yE + 0.002 }, fn); };
  // dining by the glass: places laid, mugs, the fruit bowl, a candle
  for (const [z, x, r] of [[0.68, 0.31, 1.57], [0.88, 0.31, 1.57], [0.68, 0.39, -1.57], [0.88, 0.39, -1.57]] as const) C({ x, z, y: tableY, rot: r }, a => Clutter.plate(a), 0.7);
  C({ x: 0.36, z: 0.78, y: tableY }, a => Clutter.fruitBowl(a), 0.8);
  C({ x: 0.33, z: 0.75, y: tableY }, a => Clutter.candle(a), 0.6);
  C({ x: 0.4, z: 0.72, y: tableY }, a => Clutter.mug(a), 0.8);
  C({ x: 0.31, z: 0.95, y: tableY, rot: 0.4 }, a => Clutter.crayons(a), 0.5);
  // kitchen: bread and the board on the island, dishes in the sink, a pot on the range, herbs on the sill
  C({ x: -0.32, z: 0.52, y: islandY, rot: Math.PI / 2 }, a => Clutter.bread(a), 0.85);
  C({ x: -0.32, z: 0.72, y: islandY, rot: Math.PI / 2 + 0.3 }, a => Clutter.cuttingBoard(a), 0.85);
  C({ x: left + 0.05, z: 0.74, y: counterY - 0.006 }, a => Clutter.dishes(a), 0.9);
  C({ x: left + 0.05, z: 0.5, y: counterY }, a => Clutter.jars(a, 3), 0.8);
  C({ x: left + 0.03, z: 0.92, y: counterY + 0.01 }, a => Clutter.herbsPot(a), 0.7);
  C({ x: left + 0.06, z: 0.2, y: y0 + 0.004 + 0.87 * M }, a => Clutter.potOnStove(a), 0.8);
  // living: the dog on the rug, the cat on the sofa, books, toys, the guitar
  C({ x: -0.62, z: -0.62 }, a => Clutter.dogBed(a, true), 0.85);
  C({ x: -0.5, z: -0.45, y: y0 + 0.004 + 0.36 * M, rot: Math.PI }, a => Clutter.cat(a), 0.5);
  C({ x: -0.25, z: -0.45, y: y0 + 0.004 + 0.38 * M, rot: 0.4 }, a => Clutter.openBook(a), 0.6);
  C({ x: -0.3, z: -0.7, rot: 1.1 }, a => Clutter.toys(a), 0.8);
  C({ x: -0.4, z: -0.66, rot: 0.2 }, a => Clutter.checkers(a), 0.4);
  C({ x: left + 0.06, z: 0.06, rot: Math.PI / 2 }, a => Clutter.guitar(a), 0.6);
  C({ x: left + 0.002, z: -0.6, y: y0 + 1.3 * M, rot: Math.PI / 2 }, a => Clutter.picture(a, 0.9, 0.6, c.rnd() < 0.5 ? 'art_mountains' : 'art_sunset'), 1);
  C({ x: left + 0.002, z: -0.98, y: y0 + 1.3 * M, rot: Math.PI / 2 }, a => Clutter.picture(a, 0.45, 0.55, 'photo_family'), 0.9);
  C({ x: -0.4, z: back + 0.06 + 0.42 * M, y: y0 + 0.004 + 1.47 * M }, a => Clutter.photoFrames(a), 0.95);
  C({ x: -0.4, z: back + 0.06 + 0.36 * M, y: y0 + 2.4 * M }, a => Clutter.antlers(a), 0.7);
  C({ x: 0.138, z: -0.12, y: y0 + 1.2 * M, rot: -Math.PI / 2 }, a => Clutter.poster(a, 0.6, 0.75, 'poster_map'), 0.8);
  C({ x: -0.62, z: -0.25 }, a => Clutter.plant(a), 0.8);
  C({ x: 0.36, z: 0.78, y: tableY + 0.002 }, a => Clutter.vaseFlowers(a), 0.6);
  C({ x: 0.0, z: c.hd + 0.004, y: y0 + 2.4 * M }, a => Clutter.wreath(a), 0.6);
  C({ x: -0.05, z: front - 0.002, y: y0 + 1.0 * M, rot: Math.PI }, a => Clutter.picture(a, 0.3, 0.38, 'sampler', 'wood_mid'), 0.7);
  C({ x: 0.138, z: 0.06, y: y0 + 1.9 * M, rot: -Math.PI / 2 }, a => Clutter.clock(a), 0.6);
  C({ x: 0.138, z: 0.06, y: y0 + 1.1 * M, rot: -Math.PI / 2 }, a => Clutter.calendar(a), 0.8);
  // entry: boots, the rifle over the coats, a fishing rod
  C({ x: 0.1, z: front - 0.06, rot: 0.2 }, a => Clutter.boots(a), 0.95);
  C({ x: -0.3, z: front - 0.07, rot: -0.3 }, a => Clutter.boots(a, 'paint_green'), 0.7);
  C({ x: -0.15, z: front - 0.005, y: y0 + 2.1 * M, rot: Math.PI }, a => Clutter.riflePegs(a), 0.6);
  C({ x: -0.04, z: front - 0.03 }, a => Clutter.fishingRod(a), 0.5);
  // bedroom: unmade bed, slippers, laundry, a picture over the bed
  C({ x: 0.45, z: -0.98, y: y0 + 0.004 + 0.55 * M }, a => Clutter.rumple(a, 'quilt_red'), 0.7);
  C({ x: 0.28, z: -0.78, rot: -0.3 }, a => Clutter.slippers(a), 0.7);
  C({ x: 0.62, z: -0.6 }, a => Clutter.laundryBasket(a), 0.7);
  C({ x: 0.45, z: back + 0.002, y: y0 + 1.2 * M }, a => Clutter.picture(a, 0.8, 0.55, c.rnd() < 0.5 ? 'art_lake' : 'photo_couple'), 0.95);
  C({ x: right - 0.05, z: LH.bedZ - 0.1, y: y0 + 0.004 + 0.89 * M, rot: -Math.PI / 2 }, a => Clutter.photoFrames(a), 0.9);
  // bath: towels, a bucket
  C({ x: LH.px + 0.012, z: -0.2, y: y0 + 1.5 * M, rot: Math.PI / 2 }, a => Clutter.towel(a, 'quilt_blue'), 0.8);
  C({ x: 0.3, z: 0.05 }, a => Clutter.bucket(a), 0.5);
  // the kids' loft: toys, drawings, a book
  loft({ x: 0.05, z: -0.55, rot: 0.5 }, a => Clutter.toys(a), 0.9);
  loft({ x: -0.2, z: -0.6, rot: -0.3 }, a => Clutter.crayons(a), 0.7);
  loft({ x: 0.3, z: -0.62 }, a => Clutter.laundryBasket(a), 0.5);
  if (c.rnd() < 0.85) L({ x: -0.3, z: back + 0.004, y: yE + 0.03 }, a => Clutter.poster(a, 0.45, 0.6, 'poster_seeds'));
  if (c.rnd() < 0.85) L({ x: 0.3, z: back + 0.004, y: yE + 0.03 }, a => Clutter.drawings(a));
  if (c.rnd() < 0.6) L({ x: -0.32, z: -0.85, y: yE + 0.002 }, a => Clutter.wallQuilt(a, 'quilt_blue'));
  // outside: woodpile, chopping block, laundry line, rockers on the porch, the bike, the dog's house
  C({ x: -hw - 0.06, z: -0.5, y: 0.004, rot: -Math.PI / 2 }, a => Clutter.woodpile(a, 6.0, 1.4), 1);
  C({ x: -hw - 0.2, z: 0.4, y: 0.004 }, a => Clutter.choppingBlock(a), 0.9);
  C({ x: 0, z: -hd - 0.38, y: 0.004 }, a => Clutter.laundryLine(a, 5.0), 0.85);
  C({ x: -0.4, z: hd + 0.25, y: y0, rot: 0.25 }, a => Clutter.rocker(a), 0.95);
  C({ x: -0.55, z: hd + 0.22, y: y0, rot: -0.3 }, a => Clutter.rocker(a), 0.8);
  C({ x: hw + 0.1, z: 0.9, y: 0.004, rot: 1.2 }, a => Clutter.bike(a), 0.7);
  C({ x: hw + 0.18, z: -0.7, y: 0.004, rot: -Math.PI / 2 }, a => Clutter.dogHouse(a), 0.7);
  C({ x: 0.55, z: -hd - 0.12, y: 0.004 }, a => Clutter.washtub(a), 0.6);
  void right;
}

/** Evening seats per kind (local). */
const SEATS: Record<string, Seat[]> = {
  log_house: [[-0.3, -0.45, -0.4, -1.1], [-0.5, -0.45, -0.4, -1.1], [0.35, 0.62, 0.35, 0.78], [0.35, 0.94, 0.35, 0.78]],
};

const BUILDERS: Record<string, (def: KitPieceDef, seed?: number, opts?: BuildOpts) => THREE.Group> = {
  timber_cabin: buildCabinLayers,
  outhouse,
  workshop,
  root_cellar: rootCellar,
  chicken_coop: chickenCoop,
  garden,
  field,
  log_house: logHouse,
  ...UTILITY_BUILDERS,
  ...BUNKER_BUILDERS,
  ...OLD_BUILDERS,
  ...COMPOUND_BUILDERS,
  ...FOOD_BUILDERS,
};

/** Every layer of a kit piece (construction shows them stage by stage). */
export function buildLayers(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const g = BUILDERS[def.id](def, seed, opts);
  g.userData.opts = opts;
  g.userData.seats ??= SEATS[def.id] ?? [];
  g.userData.chimneyTop ??= null;
  return g;
}

/** The finished piece as a placement ghost (shell only, no interior). */
export function buildGhost(def: KitPieceDef): THREE.Group {
  const g = buildLayers(def);
  showStage(g, 5, 0);
  for (const m of [...g.children]) if (!m.visible || ['cutwalls', 'interior', 'decor', 'loft'].includes(m.userData.layer)) { g.remove(m); (m as THREE.Mesh).geometry?.dispose(); }
  return g;
}

export { KIT, CUT_H };
