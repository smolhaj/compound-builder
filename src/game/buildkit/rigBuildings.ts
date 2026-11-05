/**
 * What a joiner brings to live in (sim/joinerHome.ts): a travel trailer, a Class C RV, and a factory-built modular home.
 * The two rigs stand on their own wheels on a gravel pad and drive away with their owners; the modular home is a gabled
 * box on piers with skirting and a porch. Built with the shared gabled shell, plus wheels, a hitch, an A/C unit and an awning.
 *
 * Scale (SCALE v2, 1 unit = 6 m): a travel trailer is 2.5 × 8.4 m (0.42 × 1.4), an RV 2.6 × 7 m with a 2.4 m cab, a modular home
 * 4.3 × 9.8 m; a tire is 0.65 m across (r 0.054), a door 1.9 m (0.32).
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { Furniture } from './interior';
import { dressEvenings } from './goodsDress';
import { box, buildGabled, Parts, type BuildOpts, type FurnishCtx } from './shell';

/** A wheel on the x axis: tire and hub. */
function wheel(p: Parts, x: number, z: number, r = 0.054, w = 0.04): void {
  p.add('rubber', new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2).translate(x, r, z));
  p.add('steel', new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.004, 10).rotateZ(Math.PI / 2).translate(x, r, z));
}

/** The gravel pad and the cable and hose that tie a rig to the place. */
function pad(p: Parts, W: number, D: number, zc = 0): void {
  p.layer = 'foundation';
  p.add('gravel', box(W + 0.22, 0.012, D + 0.12, 0, -0.004, zc));
  // the pedestal at the rear corner: power cord and the water hose in a loop on the gravel
  p.add('steel', box(0.02, 0.1, 0.02, -W / 2 - 0.1, 0, zc - D / 2 + 0.1));
  p.add('rubber', box(0.1, 0.008, 0.008, -W / 2 - 0.05, 0.02, zc - D / 2 + 0.1));
}

/** A 28-foot travel trailer on a hitch. */
function travelTrailer(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const W = 0.42, D = 1.4, hd = D / 2;
  const { group } = buildGabled({
    W, D, floor: 0.1, wallH: 0.33, wallT: 0.015, rise: 0.025, eave: 0.015, gableOver: 0.01, porch: 0,
    foundation: 'none', floorMat: 'deck', outer: 'aluminum', inner: 'pine_panel', roof: 'metal_roof_grey', trim: 'trim',
    front: [{ kind: 'window', at: 0, w: 0.16, h: 0.12, sill: 0.13 }],
    back: [{ kind: 'window', at: 0, w: 0.16, h: 0.1, sill: 0.15 }],
    right: [{ kind: 'door', at: 0.3, w: 0.13, h: 0.29 }, { kind: 'window', at: -0.2, w: 0.2, h: 0.12, sill: 0.14 }, { kind: 'window', at: -0.55, w: 0.16, h: 0.12, sill: 0.14 }],
    left: [{ kind: 'window', at: 0.3, w: 0.2, h: 0.12, sill: 0.14 }, { kind: 'window', at: -0.1, w: 0.2, h: 0.12, sill: 0.14 }, { kind: 'window', at: -0.5, w: 0.16, h: 0.12, sill: 0.14 }],
    corners: 'none', curtains: 'curtain',
  }, (c: FurnishCtx) => {
    const { I, left, right, back, front } = c;
    const o = c.parts.opts;
    I({ x: back + 0.2, z: back + 0.2 }, a => Furniture.bed(a, true, 'quilt_blue'));
    I({ x: left + 0.05, z: 0.15, rot: Math.PI / 2 }, a => Furniture.counter(a, 2.2, 0.35, !!o.plumbed));
    I({ x: right - 0.1, z: -0.2, rot: -Math.PI / 2 }, a => Furniture.table(a, 0.8, 0.5));
    I({ x: 0, z: front - 0.15, rot: Math.PI }, a => Furniture.sofa(a, 'quilt_red'));
    dressEvenings(c, { x: 0, z: -0.05 });
  }, new Parts(seed, opts), p => {
    pad(p, W, D);
    p.layer = 'foundation';
    // chassis rails, two axles, the A-frame hitch with its coupler and the tongue jack
    for (const sx of [-1, 1]) p.add('steel', box(0.012, 0.025, D, sx * (W / 2 - 0.05), 0.065, 0));
    for (const z of [-0.18, -0.02]) for (const sx of [-1, 1]) wheel(p, sx * (W / 2 + 0.005), z);
    for (const sx of [-1, 1]) p.add('steel', new THREE.BoxGeometry(0.012, 0.014, 0.34).rotateY(sx * 0.32).translate(sx * 0.07, 0.085, hd + 0.13));
    p.add('steel', box(0.04, 0.03, 0.04, 0, 0.075, hd + 0.3));
    p.add('steel', box(0.012, 0.06, 0.012, 0, 0.02, hd + 0.2));
    // the propane bottles on the tongue
    for (const sx of [-0.025, 0.025]) p.add('steel', new THREE.CylinderGeometry(0.014, 0.014, 0.06, 8).translate(sx, 0.125, hd + 0.1));
    p.layer = 'roof';
    p.add('linen', box(0.18, 0.04, 0.22, 0, 0.1 + 0.33 + 0.02, -0.25));
    p.add('linen', box(0.07, 0.015, 0.07, 0.1, 0.1 + 0.33 + 0.025, 0.35));
    p.layer = 'walls';
    // a stripe down the side, the entry steps and a fold-out awning over the door
    for (const sx of [-1, 1]) p.add('paint_red', box(0.002, 0.025, D - 0.1, sx * (W / 2 + 0.006), 0.25, 0));
    p.add('steel', box(0.07, 0.015, 0.08, W / 2 + 0.04, 0.05, 0.3));
    p.add('steel', box(0.07, 0.015, 0.08, W / 2 + 0.04, 0.085, 0.3));
    p.add('paint_green', box(0.14, 0.006, 0.22, W / 2 + 0.07, 0.4, 0.3));
  });
  void def;
  return group;
}

/** A 26-foot Class C motorhome: cab-over bunk, hood, windshield. */
function rvCamper(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const W = 0.44, D = 1.05, hd = D / 2;
  const parts = new Parts(seed, opts);
  parts.oz = -0.2;
  const { group } = buildGabled({
    W, D, floor: 0.1, wallH: 0.34, wallT: 0.015, rise: 0.02, eave: 0.015, gableOver: 0.01, porch: 0,
    foundation: 'none', floorMat: 'deck', outer: 'aluminum', inner: 'pine_panel', roof: 'metal_roof_grey', trim: 'trim',
    front: [],
    back: [{ kind: 'window', at: 0, w: 0.16, h: 0.1, sill: 0.15 }],
    right: [{ kind: 'door', at: 0.2, w: 0.13, h: 0.29 }, { kind: 'window', at: -0.2, w: 0.2, h: 0.12, sill: 0.15 }],
    left: [{ kind: 'window', at: 0.25, w: 0.2, h: 0.12, sill: 0.15 }, { kind: 'window', at: -0.15, w: 0.2, h: 0.12, sill: 0.15 }],
    corners: 'none', curtains: 'curtain_red',
  }, (c: FurnishCtx) => {
    const { I, left, right, back, front } = c;
    const o = c.parts.opts;
    I({ x: 0, z: back + 0.22 }, a => Furniture.bed(a, true, 'quilt_red'));
    I({ x: left + 0.05, z: 0.05, rot: Math.PI / 2 }, a => Furniture.counter(a, 1.8, 0.35, !!o.plumbed));
    I({ x: right - 0.1, z: -0.1, rot: -Math.PI / 2 }, a => Furniture.table(a, 0.8, 0.5));
    I({ x: 0, z: front - 0.15, rot: Math.PI }, a => Furniture.sofa(a, 'quilt_blue'));
    dressEvenings(c, { x: 0, z: -0.0 });
  }, parts, p => {
    pad(p, W, D + 0.3, 0.1);
    p.layer = 'foundation';
    const fz = hd + 0.2 - 0.0;
    // two rear tires a side (dual) and a front axle under the cab
    for (const sx of [-1, 1]) { wheel(p, sx * (W / 2 - 0.0), -0.28, 0.056, 0.05); wheel(p, sx * (W / 2 - 0.0), -0.1, 0.056, 0.05); wheel(p, sx * (W / 2 - 0.01), fz + 0.12, 0.056, 0.04); }
    for (const sx of [-1, 1]) p.add('steel', box(0.012, 0.025, D + 0.5, sx * (W / 2 - 0.06), 0.065, 0.1));
    p.layer = 'walls';
    // the cab: a hood, a windshield and the cab-over bunk sticking out over it
    p.add('aluminum', box(W - 0.04, 0.15, 0.17, 0, 0.1, fz + 0.2));              // engine hood and grille
    p.add('steel', box(W - 0.1, 0.06, 0.012, 0, 0.1, fz + 0.29));               // bumper
    p.add('aluminum', box(W, 0.2, 0.2, 0, 0.1 + 0.15, fz + 0.04 - 0.02));       // cab box
    p.add('glass', new THREE.BoxGeometry(W - 0.07, 0.15, 0.006).rotateX(-0.35).translate(0, 0.1 + 0.28, fz + 0.15));
    for (const sx of [-1, 1]) p.add('glass', box(0.005, 0.1, 0.1, sx * (W / 2 + 0.002), 0.1 + 0.2, fz + 0.04));
    p.layer = 'roof';
    p.add('aluminum', box(W, 0.12, 0.3, 0, 0.1 + 0.34, fz - 0.08));              // the cab-over bunk
    p.add('metal_roof_grey', box(W + 0.01, 0.01, 0.31, 0, 0.1 + 0.46, fz - 0.08));
    p.add('linen', box(0.18, 0.04, 0.22, 0, 0.1 + 0.34 + 0.02, -0.15));
    p.layer = 'walls';
    for (const sx of [-1, 1]) p.add('paint_red', box(0.002, 0.025, D - 0.1, sx * (W / 2 + 0.006), 0.25, 0));
    p.add('steel', box(0.07, 0.015, 0.08, W / 2 + 0.04, 0.05, 0.2 - 0.2));
    p.add('steel', box(0.07, 0.015, 0.08, W / 2 + 0.04, 0.085, 0.2 - 0.2));
  });
  void def;
  return group;
}

/** A factory-built one-bedroom home on piers: lap siding, a shingle roof, a porch, skirting. */
function modularHome(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const W = 0.72, D = 1.64, hd = D / 2;
  const { group } = buildGabled({
    W, D, floor: 0.12, wallH: 0.36, wallT: 0.02, rise: 0.13, eave: 0.04, gableOver: 0.03, porch: 0.3,
    foundation: 'piers', floorMat: 'deck', outer: 'lap_white', inner: 'pine_panel', roof: 'shingle', trim: 'trim',
    front: [{ kind: 'door', at: 0.1, w: 0.14, h: 0.32 }, { kind: 'window', at: -0.2, w: 0.16, h: 0.15, sill: 0.14 }],
    back: [{ kind: 'window', at: 0, w: 0.16, h: 0.14, sill: 0.15 }],
    right: [{ kind: 'window', at: 0.55, w: 0.2, h: 0.15, sill: 0.14 }, { kind: 'window', at: -0.05, w: 0.2, h: 0.15, sill: 0.14 }, { kind: 'window', at: -0.6, w: 0.2, h: 0.15, sill: 0.14 }],
    left: [{ kind: 'window', at: 0.55, w: 0.2, h: 0.15, sill: 0.14 }, { kind: 'window', at: -0.05, w: 0.2, h: 0.15, sill: 0.14 }, { kind: 'window', at: -0.6, w: 0.2, h: 0.15, sill: 0.14 }],
    corners: 'boards', curtains: 'curtain',
  }, (c: FurnishCtx) => {
    const { I, left, right, back, front } = c;
    const o = c.parts.opts;
    I({ x: left + 0.05, z: front - 0.45, rot: Math.PI / 2 }, a => Furniture.counter(a, 2.4, 0.4, !!o.plumbed));
    if (o.wired) I({ x: left + 0.065, z: front - 0.9, rot: Math.PI / 2 }, a => Furniture.fridge(a));
    I({ x: 0.1, z: front - 0.5 }, a => Furniture.table(a, 1.0, 0.7));
    dressEvenings(c, { x: 0.1, z: front - 0.5 });
    I({ x: 0, z: 0.05, rot: Math.PI }, a => Furniture.sofa(a, 'quilt_blue'));
    I({ x: 0, z: back + 0.25 }, a => Furniture.bed(a, true, 'quilt_red'));
    c.partition(left, back + 0.55, right, back + 0.55, [{ at: 0.2, w: 0.14, sill: 0, h: 0.32 }], 'pine_panel');
    I({ x: right - 0.1, z: back + 0.7, rot: -Math.PI / 2 }, a => (o.plumbed && o.septic ? Furniture.flushToilet(a) : Furniture.toilet(a)));
  }, new Parts(seed, opts), p => {
    p.layer = 'foundation';
    for (const sx of [-1, 1]) p.add('vinyl', box(0.008, 0.12, D, sx * (W / 2 - 0.01), -0.01, 0));
    for (const sz of [-1, 1]) p.add('vinyl', box(W, 0.12, 0.008, 0, -0.01, sz * (hd - 0.01)));
    p.layer = 'deck';
    // wooden steps down from the porch
    p.add('deck', box(0.2, 0.012, 0.1, 0.1, 0.03, hd + 0.34));
    p.add('deck', box(0.2, 0.012, 0.1, 0.1, 0.0, hd + 0.44));
  });
  void def;
  return group;
}

export const RIG_BUILDERS: Record<string, (def: KitPieceDef, seed?: number, opts?: BuildOpts) => THREE.Group> = { travel_trailer: travelTrailer, rv_camper: rvCamper, modular_home: modularHome };
void CELL;
