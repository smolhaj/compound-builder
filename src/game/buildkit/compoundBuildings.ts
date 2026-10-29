/**
 * Compound buildings (a homestead compound inside a container wall): the
 * grandparents' cottage, and the steel pole garage (with or without 8 kW of
 * panels on its roof). Built with the shared gabled shell.
 *
 * Scale (SCALE v2): 1 unit ≈ 6 m; M = 1 m.
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { Furniture, M, pipe, type Add } from './interior';
import { Clutter } from './clutter';
import { dressEvenings } from './goodsDress';
import { Equipment } from './utilityBuildings';
import { box, buildGabled, Parts, type BuildOpts, type FurnishCtx } from './shell';

/** The cottage's cookstove (local), its hearth height, and its stovepipe (offset, top above the hearth) from Furniture.cookstove. */
const STOVE = { x: -0.22, z: 0.12 }, HEARTH = 0.05 * M, STOVE_PIPE = { x: -0.35 * M, z: -0.2 * M, top: 2.27 * M };

/** 6 × 8 m one-storey cottage: a kitchen-sitting room at the front, a bedroom behind, a small porch. */
function cottage(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const W = def.cellsX * CELL, D = def.cellsZ * CELL - M, small = D < 6.5 * M;   // the cottage 6 × 8 m; the guest house 6 × 5; Mom's house 9 × 8
  const { group } = buildGabled({
    W, D, floor: 0.08, wallH: 0.43, wallT: 0.03, rise: 0.24, eave: 0.05, gableOver: 0.05, porch: 0.28,
    foundation: 'concrete', floorMat: 'floorboards', outer: 'timber_lap', inner: 'whitewash', roof: 'metal_roof', trim: 'trim',
    front: [{ kind: 'door', at: 0.12 }, { kind: 'window', at: -0.25 }],
    back: [{ kind: 'window', at: -0.2 }, { kind: 'window', at: 0.22 }],
    left: small ? [{ kind: 'window', at: 0 }] : [{ kind: 'window', at: -0.35 }, { kind: 'window', at: 0.3 }],
    right: small ? [{ kind: 'window', at: 0 }] : [{ kind: 'window', at: -0.35 }, { kind: 'door', at: 0.38 }],
    chimney: { kind: 'pipe', x: STOVE.x + STOVE_PIPE.x, z: STOVE.z + STOVE_PIPE.z },
    corners: 'boards', curtains: 'curtain',
  }, (c: FurnishCtx) => {
    const { I, left, right, back, front } = c;
    const o = c.parts.opts;
    const wallZ = -0.08;
    // bedroom (back): a double bed for the grandparents and a single for a grandchild
    c.partition(left, wallZ, right, wallZ, [{ at: 0.25, w: 0.14, sill: 0, h: 0.36 }], 'whitewash');
    I({ x: -0.2, z: back + 0.18 }, a => Furniture.bed(a, true, 'quilt_red'));
    I({ x: 0.3, z: back + 0.18 }, a => Furniture.single(a, 'quilt_blue'));
    I({ x: right - 0.05, z: wallZ - 0.12, rot: -Math.PI / 2 }, a => Furniture.dresser(a, 1.0));
    I({ x: left + 0.05, z: back + 0.05 }, a => Furniture.nightstand(a));
    // front room: counter and sink along the left wall, the wood cookstove on its hearth, a table with chairs
    I({ x: left + 0.05, z: 0.3, rot: Math.PI / 2 }, a => Furniture.counter(a, 2.4, 0.4, !!o.plumbed));
    I({ x: STOVE.x, z: STOVE.z }, a => {
      a('fieldstone', box(1.35 * M, HEARTH, 1.05 * M, 0, 0, 0.12 * M));
      Furniture.cookstove((m, g) => a(m, g.translate(0, HEARTH, 0)));
    });
    // the stovepipe on up through the ceiling to the roof jack (above the cut, so it goes with the roof in cutaway)
    const pipeX = STOVE.x + STOVE_PIPE.x, pipeZ = STOVE.z + STOVE_PIPE.z, pipeY = c.y0 + 0.004 + HEARTH + STOVE_PIPE.top;
    const roofY = c.yE + c.spec.rise * (1 - Math.abs(pipeX) / c.hw);
    c.parts.add('iron', pipe([pipeX, pipeY, pipeZ], [pipeX, roofY + 0.02, pipeZ], 0.07 * M, 10), 'decor');
    c.parts.add('iron', new THREE.CylinderGeometry(0.1 * M, 0.1 * M, 0.03 * M, 10).translate(pipeX, pipeY - 0.25 * M, pipeZ), 'decor');   // damper collar
    I({ x: STOVE.x + 0.165, z: STOVE.z - 0.005 }, a => Furniture.woodbox(a));
    if (o.wired) I({ x: left + 0.065, z: front - 0.1, rot: Math.PI / 2 }, a => Furniture.fridge(a));
    I({ x: 0.22, z: 0.35 }, a => { Furniture.table(a, 1.0, 0.8); Furniture.oilLamp(a, 0.25, 0.76, -0.15); });
    dressEvenings(c, { x: 0.22, z: 0.35 });
    I({ x: 0.22, z: 0.35 - 0.1 }, a => Furniture.chair(a));
    I({ x: 0.22, z: 0.35 + 0.1, rot: Math.PI }, a => Furniture.chair(a));
    I({ x: 0.3, z: 0.05, rot: Math.PI }, a => Furniture.armchair(a, 'quilt_blue'));
    I({ x: 0.0, z: 0.3 }, a => Furniture.rug(a, 1.6, 1.2), false);
    I({ x: -0.18, z: back + 0.36 }, a => Furniture.rug(a, 1.4, 0.7), false);
    // jars of the summer's canning on shelves on the partition, coats and hats by the front door
    I({ x: -0.38, z: wallZ + 0.01 + 0.125 * M, rot: 0 }, a => Furniture.wallShelf(a, 0.95, 1.4, 2, 'jars'), false);
    I({ x: 0.33, z: front - 0.008, rot: Math.PI }, a => Furniture.coatPegs(a, 0.9), false);
    if (o.wired) for (const [x, z] of [[0.22, 0.35], [-0.1, -0.4]]) I({ x, z, y: c.yE - 0.03 }, a => Furniture.pendant(a, 0.5), false);
    // lived in: rockers on the porch, flowers, a cat, the woodpile, boots
    c.C({ x: -0.3, z: c.hd + 0.16, y: c.y0, rot: 0.2 }, a => Clutter.rocker(a), 0.95);
    c.C({ x: 0.36, z: c.hd + 0.16, y: c.y0, rot: -0.3 }, a => Clutter.rocker(a), 0.7);
    c.C({ x: 0.22, z: 0.35, y: c.y0 + 0.004 + 0.76 * M }, a => Clutter.vaseFlowers(a), 0.8);
    c.C({ x: 0.3, z: 0.05, y: c.y0 + 0.004 + 0.42 * M, rot: Math.PI }, a => Clutter.cat(a), 0.5);
    c.C({ x: 0.08, z: front - 0.06, rot: 0.3 }, a => Clutter.slippers(a), 0.7);
    c.C({ x: left + 0.002, z: 0.0, y: c.y0 + 1.4 * M, rot: Math.PI / 2 }, a => Clutter.picture(a, 0.5, 0.4, 'photo_family'), 0.9);
    c.C({ x: -c.hw - 0.12, z: -0.3, y: 0.004, rot: Math.PI / 2 }, a => Clutter.woodpile(a, 3.0, 1.1), 0.9);
    c.C({ x: c.hw + 0.1, z: -0.4, y: 0.004 }, a => Clutter.plant(a), 0.6);
    // kitchen: dishes by the sink, a pot on the stove, bread on the table, a mug
    const counterY = c.y0 + 0.004 + 0.9 * M, tableY = c.y0 + 0.004 + 0.76 * M;
    c.C({ x: left + 0.05, z: 0.4, y: counterY, rot: Math.PI / 2 }, a => Clutter.dishes(a), 0.9);
    c.C({ x: left + 0.05, z: 0.18, y: counterY, rot: Math.PI / 2 }, a => Clutter.cuttingBoard(a), 0.7);
    c.C({ x: STOVE.x + 0.03, z: STOVE.z + 0.01, y: c.y0 + 0.004 + HEARTH + 0.87 * M }, a => Clutter.potOnStove(a), 0.85);
    c.C({ x: 0.2, z: 0.36, y: tableY }, a => Clutter.bread(a), 0.6);
    c.C({ x: 0.25, z: 0.31, y: tableY }, a => Clutter.mug(a), 0.8);
    c.C({ x: -0.2, z: back + 0.36 }, a => Clutter.slippers(a), 0.6);
  }, new Parts(seed, opts));
  return group;
}

const cylY = (r: number, h: number, x: number, y: number, z: number, seg = 10) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);

/** An irregular oil drip of radius r on the floor at (x, y, z). */
function stain(r: number, x: number, y: number, z: number, rnd: () => number): THREE.BufferGeometry {
  const n = 14, sh = new THREE.Shape();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, k = r * (0.65 + 0.5 * rnd());
    if (i === 0) sh.moveTo(Math.cos(a) * k, Math.sin(a) * k); else sh.lineTo(Math.cos(a) * k, Math.sin(a) * k);
  }
  return new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).translate(x, y, z);
}

/** Garage kit pieces (front faces +z, floor y = 0, meters × M). */
export const Shop = {
  /** 20-gallon wheeled air compressor: red tank, motor and pump on top, gauge, a coiled yellow hose. */
  compressor(add: Add): void {
    add('paint_red', new THREE.CylinderGeometry(0.2 * M, 0.2 * M, 0.75 * M, 14).rotateZ(Math.PI / 2).translate(0, 0.3 * M, 0));
    for (const sx of [-1, 1]) add('paint_red', new THREE.SphereGeometry(0.2 * M, 10, 6).scale(0.35, 1, 1).translate(sx * 0.375 * M, 0.3 * M, 0));
    for (const sz of [-1, 1]) add('rubber', new THREE.CylinderGeometry(0.1 * M, 0.1 * M, 0.05 * M, 10).rotateX(Math.PI / 2).translate(-0.3 * M, 0.1 * M, sz * 0.2 * M));
    add('steel', box(0.06 * M, 0.1 * M, 0.3 * M, 0.3 * M, 0, 0));                                            // foot
    add('iron', new THREE.CylinderGeometry(0.11 * M, 0.11 * M, 0.3 * M, 10).rotateZ(Math.PI / 2).translate(-0.12 * M, 0.61 * M, 0.02 * M));   // motor
    add('iron', box(0.18 * M, 0.2 * M, 0.18 * M, 0.17 * M, 0.5 * M, 0));                                     // pump
    for (let k = 0; k < 4; k++) add('steel', box(0.22 * M, 0.012 * M, 0.22 * M, 0.17 * M, 0.72 * M + k * 0.03 * M, 0));   // cooling fins
    add('steel', box(0.04 * M, 0.04 * M, 0.04 * M, 0.3 * M, 0.5 * M, 0.2 * M));
    add('enamel', new THREE.CylinderGeometry(0.04 * M, 0.04 * M, 0.02 * M, 10).rotateX(Math.PI / 2).translate(0.3 * M, 0.56 * M, 0.23 * M));   // gauge
    add('paint_yellow', new THREE.TorusGeometry(0.16 * M, 0.02 * M, 4, 14).rotateX(Math.PI / 2).translate(-0.15 * M, 0.82 * M, 0.02 * M));
    add('paint_yellow', new THREE.TorusGeometry(0.15 * M, 0.02 * M, 4, 14).rotateX(Math.PI / 2).translate(-0.15 * M, 0.85 * M, 0.02 * M));
  },
  /** A stack of n spare tires, a fifth leaning on it. */
  tires(add: Add, n = 4): void {
    for (let i = 0; i < n; i++) add('rubber', new THREE.TorusGeometry(0.28 * M, 0.11 * M, 6, 14).rotateX(Math.PI / 2).translate((i % 2) * 0.02 * M, 0.11 * M + i * 0.22 * M, 0));
    add('rubber', new THREE.TorusGeometry(0.28 * M, 0.11 * M, 6, 14).rotateX(0.25).translate(0.05 * M, 0.38 * M, 0.42 * M));
  },
  /** Wall rack of jerry cans: gasoline (red), diesel (yellow), kerosene (blue), with a funnel. */
  fuelRack(add: Add): void {
    const l = 1.2 * M;
    add('steel', box(l, 0.04 * M, 0.42 * M, 0, 0.08 * M, 0));
    for (const sx of [-1, 1]) add('steel', box(0.04 * M, 0.6 * M, 0.42 * M, sx * l / 2, 0, 0));
    add('steel', box(l, 0.04 * M, 0.04 * M, 0, 0.45 * M, 0.19 * M));
    add('steel', box(l, 0.5 * M, 0.02 * M, 0, 0.1 * M, -0.2 * M));
    const cans: Array<'paint_red' | 'paint_yellow' | 'blue_tank'> = ['paint_red', 'paint_red', 'paint_yellow', 'blue_tank', 'paint_red'];
    cans.forEach((m, i) => {
      const x = -l / 2 + 0.13 * M + i * 0.235 * M;
      add(m, box(0.17 * M, 0.47 * M, 0.34 * M, x, 0.12 * M, 0));
      add(m, box(0.04 * M, 0.06 * M, 0.2 * M, x, 0.59 * M, -0.03 * M));
      add('iron', cylY(0.025 * M, 0.04 * M, x, 0.59 * M, 0.12 * M, 6));
    });
    add('paint_green', new THREE.ConeGeometry(0.08 * M, 0.16 * M, 8).rotateX(Math.PI).translate(0.2 * M, 0.72 * M, 0.0));
  },
  /** Floor jack (handle up, saddle to +z). */
  floorJack(add: Add): void {
    add('paint_red', box(0.3 * M, 0.14 * M, 0.7 * M, 0, 0.04 * M, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add('iron', new THREE.CylinderGeometry(0.04 * M, 0.04 * M, 0.03 * M, 8).rotateZ(Math.PI / 2).translate(sx * 0.16 * M, 0.04 * M, sz * 0.28 * M));
    add('iron', cylY(0.06 * M, 0.04 * M, 0, 0.18 * M, 0.3 * M, 10));
    add('steel', pipe([0, 0.12 * M, -0.3 * M], [0, 1.15 * M, -0.62 * M], 0.018 * M, 6));                                  // handle
  },
};
/** 9 × 12 m steel pole building on a slab: two roll-up doors, a man door, a low corrugated roof. */
function garageShell(def: KitPieceDef, seed: number, opts: BuildOpts, solar: boolean): THREE.Group {
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  const floor = 0.03, wallH = 0.6, rise = 0.19, eave = 0.06;
  const hw = W / 2, yE = floor + wallH;
  const { group } = buildGabled({
    W, D, floor, wallH, wallT: 0.025, rise, eave, gableOver: 0.05, porch: 0,
    foundation: 'concrete', floorMat: 'concrete', outer: 'metal_siding', inner: null, roof: 'metal_roof', trim: 'trim',
    front: [{ kind: 'bay', at: -0.36, w: 0.5, h: 0.46 }, { kind: 'bay', at: 0.36, w: 0.5, h: 0.46 }],
    right: [{ kind: 'door', at: 0.6 }, { kind: 'window', at: -0.3, w: 0.3 }],
    left: [{ kind: 'window', at: -0.4, w: 0.3 }, { kind: 'window', at: 0.4, w: 0.3 }],
    tieBeams: [-0.6, 0, 0.6], corners: 'boards',
  }, (c: FurnishCtx) => {
    const { I, left, right, back } = c;
    const floorY = c.y0 + 0.0025;
    // the slab: saw-cut control joints (≈ 3 × 4 m panels), oil drips where the truck and the ATV stand
    for (const x of [-0.25, 0.25]) c.parts.add('iron', box(0.004, 0.0006, back * -2 - 0.01, x, floorY - 0.0003, 0), 'interior');
    for (const z of [-0.5, 0, 0.5]) c.parts.add('iron', box(right * 2 - 0.01, 0.0006, 0.004, 0, floorY - 0.0003, z), 'interior');
    for (const [x, z, r] of [[0.36, -0.32, 0.05], [0.33, -0.39, 0.022], [0.39, 0.26, 0.026], [-0.35, 0.02, 0.02]] as const) c.parts.add('oil_stain', stain(r, x, floorY + 0.0004, z, c.rnd), 'interior');
    // back wall: workbench under the pegboard, the compressor, the generator; tires stacked in the corner
    I({ x: 0.3, z: back + 0.065 }, a => Furniture.workbench(a, 3.0));
    I({ x: 0.3, z: back + 0.005 }, a => Furniture.toolWall(a, 3.0, 1.05), false);
    I({ x: -0.15, z: back + 0.06 }, a => Shop.compressor(a));
    I({ x: -0.4, z: back + 0.1 }, a => Furniture.generator(a));
    I({ x: left + 0.06, z: back + 0.06 }, a => Shop.tires(a, 4));
    // left: the parts rack with its bins, the fuel cans in their rack; right: lumber, floor jack, extinguisher by the door
    I({ x: left + 0.045, z: -0.3, rot: Math.PI / 2 }, a => Furniture.rack(a, 2.4));
    I({ x: left + 0.045, z: 0.3, rot: Math.PI / 2 }, a => Shop.fuelRack(a));
    I({ x: right - 0.045, z: -0.2, rot: -Math.PI / 2 }, a => Furniture.lumberRack(a, 3.0));
    I({ x: right - 0.04, z: 0.22, rot: Math.PI }, a => Shop.floorJack(a));
    I({ x: right - 0.002, z: 0.45, y: c.y0 + 0.5 * M, rot: -Math.PI / 2 }, a => Equipment.extinguisher(a), false);
    // the left bay: the ATV; the right bay left clear for the truck, a tennis ball on a string to stop it by
    I({ x: -0.36, z: 0.1 }, a => Furniture.atv(a));
    const ballY = c.y0 + 1.25 * M;
    c.parts.add('linen', box(0.003, c.yE - 0.03 - ballY, 0.003, 0.36, ballY, -0.6), 'decor');
    c.parts.add('paint_yellow', new THREE.SphereGeometry(0.035 * M, 8, 6).translate(0.36, ballY, -0.6), 'decor');
    for (const z of [-0.5, 0.4]) c.parts.add('lamp', box(0.2, 0.012, 0.03, 0, c.yE - 0.06, z), 'decor');
    c.C({ x: -0.02, z: -0.55, rot: 0.4 }, a => Clutter.wheelbarrow(a), 0.7);
    c.C({ x: 0.1, z: back + 0.09, y: c.y0 + 0.004 + 0.92 * M }, a => Clutter.radio(a), 0.7);
    c.C({ x: right - 0.03, z: 0.5, rot: -Math.PI / 2 }, a => Clutter.broom(a), 0.8);
    c.C({ x: -0.05, z: 0.6 }, a => Clutter.bucket(a), 0.6);
  }, new Parts(seed, opts), p => {
    if (!solar) return;
    // 20 × 400 W panels (1.13 × 1.72 m, portrait up the slope) in two rows of 10 on the +x roof slope
    const pitch = Math.atan2(rise, hw);
    const pw = 1.13 * M, ph = 1.72 * M, gap = 0.02 * M;
    // the roof sheets sit 0.034 above the rafter line; the panels stand ≈ 10 cm off them on rails
    const roofY = (x: number) => yE + rise * (1 - x / hw) + 0.034 + 0.016;
    const cosP = Math.cos(pitch);
    for (let row = 0; row < 2; row++) {
      // distance down the slope from just below the ridge to the row center
      const s = 0.06 + (row + 0.5) * (ph + gap);
      const xc = s * cosP;
      for (let i = 0; i < 10; i++) {
        const zc = (i - 4.5) * (pw + gap);
        const place = (g: THREE.BufferGeometry, up = 0) => g.rotateZ(-pitch).translate(xc, roofY(xc) + up, zc);
        const cell = new THREE.PlaneGeometry(ph - 0.03 * M, pw - 0.03 * M).rotateX(-Math.PI / 2);
        cell.userData.keepUV = true;
        p.add('solar_cell', place(cell, 0.004), 'openings');
        p.add('steel', place(box(ph, 0.035 * M, pw, 0, -0.03 * M, 0)), 'openings');
      }
    }
    // two rails under the panels and the conduit down the gable to the combiner box
    for (const s of [0.1, 0.42]) p.add('steel', box(0.02, 0.012, 10 * (pw + gap), 0, -0.012, 0).rotateZ(-pitch).translate(s * cosP, roofY(s * cosP), 0), 'openings');
    p.add('iron', box(0.012, yE - 0.2, 0.012, hw + 0.01, 0.2, -D / 2 + 0.15), 'openings');
    p.add('iron', box(0.03, 0.05, 0.08, hw + 0.02, 0.2, -D / 2 + 0.15), 'openings');
  });
  return group;
}

const metalGarage = (def: KitPieceDef, seed = 1, opts: BuildOpts = {}) => garageShell(def, seed, opts, false);
const garageSolar = (def: KitPieceDef, seed = 1, opts: BuildOpts = {}) => garageShell(def, seed, opts, true);

export const COMPOUND_BUILDERS: Record<string, (def: KitPieceDef, seed?: number, opts?: BuildOpts) => THREE.Group> = { cottage, guest_house: cottage, moms_house: cottage, metal_garage: metalGarage, garage_solar: garageSolar };
