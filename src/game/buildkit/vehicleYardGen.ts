/**
 * The vehicle yard (sim/vehicleYard.ts): a fenced gravel lot for the fleet, outside the walls, past the motor court. 12 × 12 m of crushed rock behind a 2.4 m
 * chain-link fence on all four sides with a double drive gate (padlocked) in the front, six painted bays with wheel stops in two rows of three (the same layout the
 * fleet renderer parks into: sim/farm.ts yard bays), a floodlight pole at each back corner, a lockbox and a sign. Local frame: +z is the front (the gate).
 * 1 unit ≈ 6 m; a person is 0.28 tall.
 */
import * as THREE from 'three';
import type { KitPieceDef } from './kit';
import { CELL } from './kit';
import { box, Parts, type BuildOpts } from './shell';

const M = 1 / 6;
const cylY = (r: number, h: number, x: number, y: number, z: number, seg = 8) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);

/** The gravel spur's mesh: see below (exported for its test). */
export function spurGeometry(hd: number, spurL: number, spurW: number, sh?: (lx: number, lz: number) => number): THREE.BoxGeometry {
  // gravel laid on the ground from the gate to the road's edge, flaring to meet the road. Like a driveway apron it is graded into the ground: the crown is draped on the highest
  // ground within a terrain cell (the terrain mesh is coarser than the ground is sampled, so the gravel never sinks into a triangle) and 2 cm over it, the two outer columns
  // are tucked into the ground's own height at the edge (flush, no skirt standing proud) and the far end lies exactly on the road's level, 6 mm over it
  const NX = 8, NZ = 12, g = new THREE.BoxGeometry(1, 1, 1, NX, 1, NZ), pos = g.attributes.position;
  const lo = (v: number) => Math.max(-0.5, Math.min(0.5, v));
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getZ(i) + 0.5, ix = Math.round((pos.getX(i) + 0.5) * NX), edge = ix === 0 || ix === NX, shoulder = ix === 1 || ix === NX - 1;
    // the outer column is a shoulder 0.06 wider than the apron, running out into the ground
    const lx = (pos.getX(i) * spurW + (edge ? Math.sign(pos.getX(i)) * 0.06 : 0)) * (1 + 0.2 * t), lz = hd + t * spurL;
    let yt = 0;
    if (sh) {
      const exact = sh(lx, lz), reach = Math.max(exact, sh(lx, lz + 0.4), sh(lx, lz - 0.4), sh(lx + 0.4, lz), sh(lx - 0.4, lz));
      const nearEnd = t > 0.995;
      yt = nearEnd ? lo(exact) + 0.006 : edge ? lo(exact) - 0.02 : shoulder ? lo(Math.max(exact, 0.5 * (exact + reach))) + 0.004 : lo(reach) + 0.02;
    } else yt = 0.02;
    pos.setXYZ(i, lx, pos.getY(i) > 0 ? yt : yt - 0.25, lz);
  }
  return g;
}

export function vehicleYard(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const p = new Parts(seed);
  const W = def.cellsX * CELL, D = def.cellsZ * CELL, hw = W / 2 - 0.03, hd = D / 2 - 0.03;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * hw, -0.02, sz * hd));
  p.layer = 'foundation';
  p.add('gravel', box(W - 0.04, 0.012, D - 0.04, 0, -0.005, 0));
  p.add('concrete', box(W - 0.04, 0.02, 0.05, 0, -0.004, hd - 0.02));                                    // the apron at the gate
  // the spur: a gravel apron from the gate across the strip of ground to the drive (a yard sited beside the road, game/buildkit/yardSite, stands YARD_SITE.gap
  // or more from its edge; `opts.spur` is that distance); it flares to the road and sinks 0.2 into the ground so it never floats over the skirt of the pad
  const spurL = opts.spur ?? 0.4, spurW = 4.2 * M + 0.1;
  {
    p.add('gravel', spurGeometry(hd, spurL, spurW, opts.spurH));
  }
  p.layer = 'frame';
  const H = 2.4 * M, gate = 4.2 * M;
  // the fence: steel posts every 3 m, a top and a bottom rail, wire mesh between, on all four sides; the front is split by the drive gate
  const side = (ax: number, az: number, bx: number, bz: number) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (3 * M))), a = -Math.atan2(bz - az, bx - ax);
    for (const y of [0.1 * M, H - 0.05 * M]) p.add('steel', box(L, 0.05 * M, 0.05 * M, 0, y, 0).rotateY(a).translate((ax + bx) / 2, 0, (az + bz) / 2));
    p.add('wire_mesh', box(L, H - 0.2 * M, 0.012, 0, 0.12 * M, 0).rotateY(a).translate((ax + bx) / 2, 0, (az + bz) / 2));
    for (let k = 0; k <= n; k++) p.add('steel', box(0.07 * M, H, 0.07 * M, ax + (bx - ax) * k / n, 0, az + (bz - az) * k / n));
  };
  side(-hw, -hd, hw, -hd); side(-hw, -hd, -hw, hd); side(hw, -hd, hw, hd);
  side(-hw, hd, -gate / 2, hd); side(gate / 2, hd, hw, hd);
  for (const sx of [-1, 1]) p.add('steel', box(0.12 * M, H + 0.3 * M, 0.12 * M, sx * gate / 2, 0, hd));       // the gate posts
  // razor-free but barbed: three strands on outward arms along the top of the back and the sides
  for (const [ax, az, bx, bz] of [[-hw, -hd, hw, -hd], [-hw, -hd, -hw, hd], [hw, -hd, hw, hd]] as const) {
    const L = Math.hypot(bx - ax, bz - az), a = -Math.atan2(bz - az, bx - ax);
    p.add('wire_mesh', box(L, 0.2 * M, 0.012, 0, H + 0.05 * M, 0).rotateY(a).translate((ax + bx) / 2, 0, (az + bz) / 2));
  }
  p.layer = 'roof';
  // the bays: two rows of three painted stalls with a wheel stop each (nose toward the back fence, as the fleet parks)
  const bw = (W - 0.3) / 3;
  for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
    const x = -W / 2 + 0.15 + (k + 0.5) * bw, z = -hd + 0.45 + r * 0.8;
    for (const sx of [-1, 1]) p.add('paint_yellow', box(0.012, 0.004, 0.6, x + sx * (bw / 2 - 0.02), 0.006, z));
    p.add('concrete', box(bw * 0.5, 0.025, 0.04, x, 0, z - 0.28));
  }
  p.layer = 'openings';
  // the drive gate: two leaves of tube frame and mesh, swung half open, and the chain and padlock hanging on the post
  for (const sg of [-1, 1]) {
    const w = gate / 2 - 0.02, a = sg * 0.55;
    p.add('scaffold', box(w, 0.06 * M, 0.06 * M, 0, 0.12 * M, 0).translate(w / 2, 0, 0).rotateY(a).translate(sg * gate / 2, 0, hd));
    p.add('scaffold', box(w, 0.06 * M, 0.06 * M, 0, H - 0.1 * M, 0).translate(w / 2, 0, 0).rotateY(a).translate(sg * gate / 2, 0, hd));
    p.add('wire_mesh', box(w, H - 0.3 * M, 0.012, 0, 0.15 * M, 0).translate(w / 2, 0, 0).rotateY(a).translate(sg * gate / 2, 0, hd));
  }
  // floodlight poles at the two back corners (a lamp head each), a lockbox by the gate, a sign on the front fence
  for (const sx of [-1, 1]) {
    p.add('wood_dark', cylY(0.08 * M, 6 * M, sx * (hw - 0.1), 0, -hd + 0.12, 6));
    p.add('steel', box(0.9 * M, 0.08 * M, 0.2 * M, sx * (hw - 0.1), 5.8 * M, -hd + 0.12));
    p.add('lamp', box(0.6 * M, 0.06 * M, 0.16 * M, sx * (hw - 0.1), 5.72 * M, -hd + 0.16));
  }
  p.add('steel', box(0.5 * M, 0.9 * M, 0.35 * M, gate / 2 + 0.5 * M, 0, hd - 0.12));
  p.add('paint_yellow', box(0.9 * M, 0.5 * M, 0.02 * M, -gate / 2 - 1.2 * M, 1.2 * M, hd));
  p.layer = 'interior';
  p.add('oil_stain', box(0.5 * M, 0.002, 0.4 * M, -W * 0.15, 0.014, hd * 0.2));
  p.add('oil_stain', box(0.3 * M, 0.002, 0.7 * M, W * 0.3, 0.014, -hd * 0.3));
  for (const [x0, z0, x1, z1] of [[-hw, -hd, hw, -hd + 0.03], [-hw, -hd, -hw + 0.03, hd], [hw - 0.03, -hd, hw, hd]] as const) p.collide({ x0, z0, x1, z1 });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  return g;
}
