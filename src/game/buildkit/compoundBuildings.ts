/**
 * Compound buildings (a homestead compound inside a container wall): the
 * grandparents' cottage, and the steel pole garage (with or without 8 kW of
 * panels on its roof). Built with the shared gabled shell.
 *
 * Scale (SCALE v2): 1 unit ≈ 6 m; M = 1 m.
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { Furniture, M } from './interior';
import { Clutter } from './clutter';
import { box, buildGabled, Parts, type BuildOpts, type FurnishCtx } from './shell';

/** 6 × 8 m one-storey cottage: a kitchen-sitting room at the front, a bedroom behind, a small porch. */
function cottage(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const W = def.cellsX * CELL, D = 8 * M;
  const { group } = buildGabled({
    W, D, floor: 0.08, wallH: 0.43, wallT: 0.03, rise: 0.24, eave: 0.05, gableOver: 0.05, porch: 0.28,
    foundation: 'concrete', floorMat: 'deck', outer: 'timber_lap', inner: 'whitewash', roof: 'metal_roof', trim: 'trim',
    front: [{ kind: 'door', at: 0.12 }, { kind: 'window', at: -0.25 }],
    back: [{ kind: 'window', at: -0.2 }, { kind: 'window', at: 0.22 }],
    left: [{ kind: 'window', at: -0.35 }, { kind: 'window', at: 0.3 }],
    right: [{ kind: 'window', at: -0.35 }, { kind: 'door', at: 0.38 }],
    chimney: { kind: 'pipe', x: -0.22, z: 0.25 },
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
    // front room: counter and stove along the left wall, a table, a rocker by the stove
    I({ x: left + 0.05, z: 0.3, rot: Math.PI / 2 }, a => Furniture.counter(a, 2.4, 0.4, !!o.plumbed));
    I({ x: -0.22, z: 0.12 }, a => Furniture.cookstove(a));
    if (o.wired) I({ x: left + 0.065, z: front - 0.1, rot: Math.PI / 2 }, a => Furniture.fridge(a));
    I({ x: 0.22, z: 0.35 }, a => Furniture.table(a, 1.0, 0.8));
    I({ x: 0.3, z: 0.05, rot: Math.PI }, a => Furniture.armchair(a, 'quilt_blue'));
    I({ x: 0.0, z: 0.3 }, a => Furniture.rug(a, 1.6, 1.2), false);
    // lived in: rockers on the porch, flowers, a cat, the woodpile, boots
    c.C({ x: -0.3, z: c.hd + 0.16, y: c.y0, rot: 0.2 }, a => Clutter.rocker(a), 0.95);
    c.C({ x: 0.36, z: c.hd + 0.16, y: c.y0, rot: -0.3 }, a => Clutter.rocker(a), 0.7);
    c.C({ x: 0.22, z: 0.35, y: c.y0 + 0.004 + 0.76 * M }, a => Clutter.vaseFlowers(a), 0.8);
    c.C({ x: 0.3, z: 0.05, y: c.y0 + 0.004 + 0.42 * M, rot: Math.PI }, a => Clutter.cat(a), 0.5);
    c.C({ x: 0.08, z: front - 0.06, rot: 0.3 }, a => Clutter.slippers(a), 0.7);
    c.C({ x: left + 0.002, z: 0.0, y: c.y0 + 1.4 * M, rot: Math.PI / 2 }, a => Clutter.picture(a, 0.5, 0.4, 'photo_family'), 0.9);
    c.C({ x: -c.hw - 0.12, z: -0.3, y: 0.004, rot: Math.PI / 2 }, a => Clutter.woodpile(a, 3.0, 1.1), 0.9);
    c.C({ x: c.hw + 0.1, z: -0.4, y: 0.004 }, a => Clutter.plant(a), 0.6);
  }, new Parts(seed, opts));
  return group;
}

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
    I({ x: 0.3, z: back + 0.065 }, a => Furniture.workbench(a, 3.0));
    I({ x: 0.3, z: back + 0.005 }, a => Furniture.toolWall(a, 3.0, 1.05), false);
    I({ x: left + 0.045, z: -0.3, rot: Math.PI / 2 }, a => Furniture.rack(a, 2.4));
    I({ x: right - 0.045, z: -0.2, rot: -Math.PI / 2 }, a => Furniture.lumberRack(a, 3.0));
    I({ x: -0.36, z: 0.1 }, a => Furniture.atv(a));
    I({ x: -0.4, z: back + 0.1 }, a => Furniture.generator(a));
    for (const z of [-0.5, 0.4]) c.parts.add('lamp', box(0.2, 0.012, 0.03, 0, c.yE - 0.06, z), 'decor');
    c.C({ x: 0.36, z: 0.3 }, a => Clutter.wheelbarrow(a), 0.7);
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

export const COMPOUND_BUILDERS: Record<string, (def: KitPieceDef, seed?: number, opts?: BuildOpts) => THREE.Group> = { cottage, metal_garage: metalGarage, garage_solar: garageSolar };
