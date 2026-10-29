/**
 * What comes with improved land (sim/improvements.ts): an old two-storey
 * farmhouse in peeling white clapboard under asphalt shingles, a
 * manufactured home on piers with vinyl skirting, and a board-and-batten
 * barn with a hay loft (the barn is also in the build menu). Built with the
 * shared gabled shell.
 *
 * Scale (SCALE v2): 1 unit ≈ 6 m; a storey ≈ 0.5.
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { Furniture, M } from './interior';
import { Clutter } from './clutter';
import { dressEvenings } from './goodsDress';
import { box, buildGabled, Parts, type BuildOpts, type FurnishCtx } from './shell';

/** 9 × 12 m two-storey farmhouse (1920s–70s): front porch, kitchen and parlor down, bedrooms up. */
function farmhouse(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  const up = 0.5;   // the upstairs floor above the main floor
  const { group } = buildGabled({
    W, D, floor: 0.12, wallH: 1.0, wallT: 0.035, rise: 0.5, eave: 0.06, gableOver: 0.05, porch: 0.4,
    foundation: 'concrete', floorMat: 'deck', outer: 'lap_white', inner: 'whitewash', roof: 'shingle', trim: 'trim',
    front: [{ kind: 'door', at: 0 }, { kind: 'window', at: -0.45 }, { kind: 'window', at: 0.45 }, { kind: 'window', at: -0.22, sill: 0.64 }, { kind: 'window', at: 0.22, sill: 0.64 }],
    back: [{ kind: 'door', at: 0.4 }, { kind: 'window', at: -0.35 }, { kind: 'window', at: 0.05, sill: 0.64 }, { kind: 'window', at: -0.6, w: 0.12, sill: 0.64 }],
    left: [{ kind: 'window', at: -0.6 }, { kind: 'window', at: 0.3 }, { kind: 'window', at: -0.2, sill: 0.64 }, { kind: 'window', at: 0.7, sill: 0.64 }],
    right: [{ kind: 'window', at: -0.6 }, { kind: 'window', at: 0.3 }, { kind: 'window', at: -0.2, sill: 0.64 }, { kind: 'window', at: 0.7, sill: 0.64 }],
    gableWindow: { front: true, back: true, w: 0.12, h: 0.14, y: 0.12 },
    chimney: { kind: 'stone', x: 0.35 },
    corners: 'boards', curtains: 'curtain',
  }, (c: FurnishCtx) => {
    const { I, L, left, right, back, front, y0, parts } = c;
    const yU = y0 + up;
    // the upstairs floor (hidden in cutaway, like a loft)
    parts.add('deck', box(right - left, 0.03, front - back, 0, yU - 0.03, (back + front) / 2), 'loft');
    // parlor (front): a sofa, a chair, a rug, a bookcase
    I({ x: -0.25, z: 0.55 }, a => Furniture.rug(a, 2.4, 1.8), false);
    I({ x: -0.25, z: 0.3 }, a => Furniture.sofa(a, 'quilt_red'));
    I({ x: 0.3, z: 0.7, rot: -Math.PI / 2 }, a => Furniture.armchair(a, 'quilt_blue'));
    I({ x: left + 0.04, z: 0.75, rot: Math.PI / 2 }, a => Furniture.shelfUnit(a, 1.2, 1.9, 'books'));
    // kitchen (back): counter, range, table, the fridge if it's wired
    const o = c.parts.opts;
    I({ x: left + 0.05, z: -0.5, rot: Math.PI / 2 }, a => Furniture.counter(a, 3.0, 0.4, !!o.plumbed));
    I({ x: left + 0.06, z: -0.05, rot: Math.PI / 2 }, a => Furniture.cookstove(a));
    if (o.wired) I({ x: left + 0.065, z: back + 0.12, rot: Math.PI / 2 }, a => Furniture.fridge(a));
    I({ x: 0.0, z: -0.55 }, a => Furniture.diningTable(a));
    dressEvenings(c, { x: 0.0, z: -0.55 });
    // the stair up along the right wall
    I({ x: right - 0.1, z: 0.05 }, a => Furniture.stairs(a, up / M, 3.6, 0.85));
    // the bathroom, a 1950s addition off the kitchen (back right): a tub along the right wall, a toilet and a washstand
    c.partition(0.46, back, 0.46, -0.5, [], 'whitewash');
    c.partition(0.46, -0.5, right, -0.5, [{ at: 0.0, w: 0.13, sill: 0, h: 0.36 }], 'whitewash');
    if (o.plumbed) I({ x: right - 0.07, z: back + 0.3, rot: Math.PI / 2 }, a => Furniture.tub(a));
    I({ x: 0.6, z: back + 0.04 }, a => (o.plumbed && o.septic ? Furniture.flushToilet(a) : Furniture.toilet(a)));
    I({ x: 0.5, z: -0.62, rot: Math.PI / 2 }, a => Furniture.washstand(a));
    // upstairs: two bedrooms
    L({ x: -0.35, z: back + 0.2, y: yU }, a => Furniture.bed(a, true, 'quilt_red'));
    L({ x: 0.25, z: back + 0.2, y: yU }, a => Furniture.bed(a, false, 'quilt_blue'));
    L({ x: -0.35, z: 0.45, y: yU }, a => Furniture.bunk(a, 'quilt_red', 'quilt_blue'));
    L({ x: left + 0.05, z: -0.2, y: yU, rot: Math.PI / 2 }, a => Furniture.dresser(a, 1.2));
    // lived in: boots, a calendar, an old dog bed, the porch swing seat
    c.C({ x: 0.12, z: front - 0.06, rot: 0.3 }, a => Clutter.boots(a), 0.9);
    c.C({ x: 0.5, z: c.hd + 0.22, y: y0, rot: 0.2 }, a => Clutter.rocker(a), 0.9);
    c.C({ x: -0.45, z: 0.0 }, a => Clutter.dogBed(a, c.rnd() < 0.5), 0.6);
    c.C({ x: -c.hw - 0.2, z: -0.4, y: 0.004 }, a => Clutter.woodpile(a, 5.0, 1.3), 1);
    c.C({ x: c.hw + 0.12, z: -0.9, y: 0.004 }, a => Clutter.washtub(a), 0.6);
  }, new Parts(seed, opts));
  return group;
}

/** A 1990s manufactured home on piers (≈ 6 × 18 m): vinyl siding, skirting, wooden steps to the side door. */
function trailer(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  const { group } = buildGabled({
    W, D, floor: 0.13, wallH: 0.4, wallT: 0.02, rise: 0.1, eave: 0.03, gableOver: 0.03, porch: 0,
    foundation: 'piers', floorMat: 'deck', outer: 'vinyl', inner: 'pine_panel', roof: 'shingle', trim: 'trim',
    front: [{ kind: 'window', at: -0.2, w: 0.2, h: 0.18, sill: 0.15 }, { kind: 'window', at: 0.2, w: 0.2, h: 0.18, sill: 0.15 }],
    back: [{ kind: 'window', at: 0, w: 0.15, h: 0.15, sill: 0.17 }],
    right: [{ kind: 'door', at: 0.35 }, { kind: 'window', at: -0.2 }, { kind: 'window', at: -0.9 }, { kind: 'window', at: 0.9 }, { kind: 'window', at: -1.3 }, { kind: 'door', at: -0.6 }],
    left: [{ kind: 'window', at: -1.1 }, { kind: 'window', at: -0.4 }, { kind: 'window', at: 0.3 }, { kind: 'window', at: 1.0 }],
    corners: 'none', curtains: 'curtain_red',
  }, (c: FurnishCtx) => {
    const { I, left, right, back, front, y0 } = c;
    const o = c.parts.opts;
    I({ x: left + 0.05, z: 0.1, rot: Math.PI / 2 }, a => Furniture.counter(a, 3.4, 0.4, !!o.plumbed));
    if (o.wired) I({ x: left + 0.065, z: -0.25, rot: Math.PI / 2 }, a => Furniture.fridge(a));
    I({ x: 0.1, z: 0.45 }, a => Furniture.table(a, 1.1, 0.8));
    dressEvenings(c, { x: 0.1, z: 0.45 });
    I({ x: 0, z: front - 0.25, rot: Math.PI }, a => Furniture.sofa(a, 'quilt_blue'));
    I({ x: 0, z: back + 0.2 }, a => Furniture.bed(a, true, 'quilt_red'));
    I({ x: 0.15, z: -0.75 }, a => Furniture.single(a, 'quilt_blue'));
    c.partition(left, -0.5, right, -0.5, [{ at: 0.25, w: 0.14, sill: 0, h: 0.36 }], 'pine_panel');
    c.partition(left, -1.05, right, -1.05, [{ at: -0.25, w: 0.14, sill: 0, h: 0.36 }], 'pine_panel');
    // the bath: the left half of the middle room, a toilet and a washstand against the back wall, a shower by the front one
    c.partition(-0.1, -1.05, -0.1, -0.5, [{ at: 0.15, w: 0.14, sill: 0, h: 0.36 }], 'pine_panel');
    I({ x: -0.38, z: -1.03 }, a => (o.plumbed && o.septic ? Furniture.flushToilet(a) : Furniture.toilet(a)));
    I({ x: -0.22, z: -1.03 }, a => Furniture.washstand(a));
    if (o.plumbed) I({ x: -0.4, z: -0.58, rot: Math.PI }, a => Furniture.shower(a));
    c.C({ x: right + 0.18, z: -1.0, y: 0.004 }, a => Clutter.bike(a), 0.5);
    c.C({ x: left - 0.15, z: 0.6, y: 0.004 }, a => Clutter.choppingBlock(a), 0.5);
    void y0;
  }, new Parts(seed, opts), p => {
    // vinyl skirting round the piers, and wooden steps up to each side door
    p.layer = 'foundation';
    const hw = W / 2, hd = D / 2;
    for (const sx of [-1, 1]) p.add('vinyl', box(0.008, 0.12, D, sx * (hw - 0.01), -0.01, 0));
    for (const sz of [-1, 1]) p.add('vinyl', box(W, 0.12, 0.008, 0, -0.01, sz * (hd - 0.01)));
    p.layer = 'deck';
    for (const z of [0.35, -0.6]) {
      p.add('deck', box(0.22, 0.012, 0.3, hw + 0.11, 0.11, z));
      p.add('deck', box(0.1, 0.012, 0.3, hw + 0.27, 0.06, z));
      p.add('deck', box(0.1, 0.012, 0.3, hw + 0.37, 0.01, z));
      p.add('wood_dark', box(0.012, 0.2, 0.012, hw + 0.21, 0.11, z + 0.15));
    }
  });
  return group;
}

/** 12 × 18 m board-and-batten barn: a steep roof over the hay loft, big doors at both ends, stalls and hay. */
function barn(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const W = def.cellsX * CELL, D = def.cellsZ * CELL;
  const loftY = 0.45;
  const { group } = buildGabled({
    W, D, floor: 0.03, wallH: 0.75, wallT: 0.025, rise: 0.75, eave: 0.08, gableOver: 0.08, porch: 0,
    foundation: 'fieldstone', floorMat: 'earth', outer: 'board_batten', inner: null, roof: 'metal_roof', trim: 'trim',
    front: [{ kind: 'bay', at: 0, w: 0.62, h: 0.58 }],
    back: [{ kind: 'bay', at: 0, w: 0.62, h: 0.58 }],
    left: [{ kind: 'window', at: -1.0, w: 0.12, h: 0.12, sill: 0.25 }, { kind: 'window', at: 0, w: 0.12, h: 0.12, sill: 0.25 }, { kind: 'window', at: 1.0, w: 0.12, h: 0.12, sill: 0.25 }, { kind: 'arch', at: 0.5, w: 0.18 }],
    right: [{ kind: 'window', at: -1.0, w: 0.12, h: 0.12, sill: 0.25 }, { kind: 'window', at: 0, w: 0.12, h: 0.12, sill: 0.25 }, { kind: 'window', at: 1.0, w: 0.12, h: 0.12, sill: 0.25 }],
    gableWindow: { front: true, back: true, w: 0.3, h: 0.26, y: 0.08 },
    tieBeams: [-1.2, -0.4, 0.4, 1.2], corners: 'boards',
  }, (c: FurnishCtx) => {
    const { I, L, left, right, y0, parts } = c;
    const FW = right - left;
    // the hay loft over the back half
    parts.add('deck', box(FW, 0.025, 1.2, 0, y0 + loftY, -0.85), 'loft');
    // stalls down each side of the alley, a feed bunk, hay below and stacked in the loft
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
      const z = 0.75 - k * 0.55;
      parts.add('wood_mid', box(0.38, 0.22, 0.02, sx * (FW / 2 - 0.19), y0, z - 0.27), 'interior');
      parts.add('wood_mid', box(0.02, 0.22, 0.52, sx * (FW / 2 - 0.38), y0, z), 'interior');
      parts.add('straw', box(0.3, 0.012, 0.45, sx * (FW / 2 - 0.2), y0, z), 'interior');
    }
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) L({ x: -0.5 + i * 0.2, z: -1.2 + j * 0.25, y: y0 + loftY + 0.025 }, a => a('straw', new THREE.BoxGeometry(1.0 * M, 0.45 * M, 0.5 * M).translate(0, 0.225 * M, 0)));
    I({ x: 0.0, z: -1.3 }, a => Furniture.ladder(a, loftY / M));
    I({ x: -0.25, z: 0.2 }, a => Furniture.barrel(a));
    c.C({ x: 0.2, z: 0.9 }, a => Clutter.bucket(a), 0.8);
    c.C({ x: 0.3, z: 0.5, rot: 1 }, a => Clutter.broom(a), 0.6);
  }, new Parts(seed, opts));
  return group;
}

export const OLD_BUILDERS: Record<string, (def: KitPieceDef, seed?: number, opts?: BuildOpts) => THREE.Group> = { farmhouse, trailer, barn };
