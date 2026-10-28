/**
 * The gatehouse garage (sim/garage.ts; docs/DECISIONS.md "Fortress ring"):
 * a vehicle garage built into the wall at the gate, as in the user's
 * picture. Stacked containers on a slab, a drive-through steel gate in the
 * middle (a sally port: an outer gate and an inner gate), a bay each side
 * with two roll-up doors on the compound face, and a roof deck with a
 * parapet and a stair at each end up from the wall-top walkway.
 *
 * Local frame: origin at the footprint center on the pad (y = 0); x runs
 * along the wall, +z is the compound side (where the roll-up doors face and
 * vehicles come out), -z the road side, on the property line. 1 unit ≈ 6 m;
 * a person is 0.28 tall, a roll-up door 3 m (0.5).
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { box, Parts } from './shell';
import { GARAGE_GATE_W, GARAGE_H, SLOT_X_M } from '../../sim/garage';

const M = 1 / 6;

function gateGarage(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = def.cellsX * CELL, D = def.cellsZ * CELL, H = GARAGE_H, gw = GARAGE_GATE_W, T = 0.05;
  const hw = W / 2, hd = D / 2, hg = gw / 2;
  const doorW = 3.2 * M, doorH = 3.0 * M;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (hw - 0.02), -0.02, sz * (hd - 0.02)));

  // ── foundation: the slab, a thicker apron through the gate ──
  p.add('concrete', box(W + 0.05, 0.03, D + 0.05, 0, -0.01, 0), 'foundation');
  p.add('wet_concrete', box(gw - 0.02, 0.012, D + 0.3, 0, 0.02, 0.1), 'foundation');

  // ── frame: corner posts and the gate frame ──
  for (const x of [-hw, -hg, hg, hw]) for (const z of [-hd, hd]) p.add('steel', box(0.035, H, 0.035, x + (x < 0 ? 0.018 : -0.018), 0.02, z + (z < 0 ? 0.018 : -0.018)), 'frame');
  p.add('steel', box(gw + 0.08, 0.04, D, 0, H - 0.05, 0), 'frame');   // the lintel over the gate passage

  // ── walls: the two wings of stacked containers ──
  const cols = ['container_blue', 'container_tan', 'container_green', 'container_red'] as const;
  let ci = Math.abs(Math.round(seed)) % 4;
  for (const sg of [-1, 1] as const) {
    const x0 = sg * hg, x1 = sg * hw, cx = (x0 + x1) / 2, wl = Math.abs(x1 - x0);
    const m = cols[ci++ % 4];
    p.add(m, box(wl, H - 0.03, T, cx, 0.02, -hd + T / 2), 'walls');                  // the road face, on the line
    for (let k = 1; k < 18; k++) p.add('iron', box(0.006, H - 0.06, 0.006, x0 + sg * wl * k / 18, 0.03, -hd - 0.002), 'walls');   // container corrugation
    p.add('iron', box(wl, 0.012, T + 0.012, cx, 0.02 + (H - 0.03) / 2, -hd + T / 2), 'walls');   // the seam where the two containers stack
    p.add(m, box(T, H - 0.03, D - 0.02, x1 - sg * T / 2, 0.02, 0), 'walls');         // the outer end
    p.add(m, box(T, H - 0.03, D - 0.02, x0 + sg * T / 2, 0.02, 0), 'walls');         // the passage side
    // the compound face: piers between the roll-up doors and a band over them
    p.add(m, box(wl, H - 0.03 - doorH, T, cx, 0.02 + doorH, hd - T / 2), 'walls');
    const slots = SLOT_X_M.filter(v => Math.sign(v) === sg).map(v => v * M);
    const edges = [x0, ...slots.flatMap(c => [c - doorW / 2, c + doorW / 2].sort((a, b) => a - b)), x1].sort((a, b) => a - b);
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i], b = edges[i + 1];
      if (b - a > 0.004) p.add(m, box(b - a, doorH, T, (a + b) / 2, 0.02, hd - T / 2), 'walls');
    }
    // roll-up doors, closed: slatted steel with a handle and a red reflector strip
    for (const c of slots) {
      p.add('steel', box(doorW, doorH - 0.01, 0.012, c, 0.02, hd - 0.012), 'openings');
      for (let y = 0.07; y < doorH - 0.02; y += 0.07) p.add('iron', box(doorW, 0.006, 0.014, c, 0.02 + y, hd - 0.012), 'openings');
      p.add('paint_yellow', box(doorW, 0.014, 0.016, c, 0.02, hd - 0.012), 'openings');
      p.add('iron', box(0.03, 0.012, 0.02, c, 0.02 + doorH * 0.3, hd - 0.004), 'openings');
    }
  }

  // ── openings: the gate (an outer pair of leaves, closed, and an inner pair swung back) ──
  const leafH = H - 0.1;
  for (const sg of [-1, 1] as const) {
    const lx = sg * hg / 2;
    p.add('steel', box(hg - 0.01, leafH, 0.014, lx, 0.025, -hd + 0.03), 'openings');
    for (let k = 1; k < 7; k++) p.add('iron', box(0.008, leafH - 0.04, 0.012, sg * (hg * k / 7), 0.04, -hd + 0.044), 'openings');
    p.add('iron', box(hg - 0.01, 0.014, 0.02, lx, 0.025 + leafH * 0.5, -hd + 0.044), 'openings');
    p.add('paint_yellow', box(hg - 0.012, 0.012, 0.016, lx, 0.025 + leafH - 0.04, -hd + 0.036), 'openings');
    // the inner leaf, open against the passage wall
    p.add('steel', box(0.014, leafH, hg - 0.02, sg * (hg - 0.02), 0.025, hd - 0.03 - (hg - 0.02) / 2), 'openings');
  }
  p.add('iron', box(gw + 0.1, 0.03, 0.03, 0, H - 0.12, -hd + 0.01), 'openings');

  // ── roof: a deck on the containers, a kick plate and a handrail all round, a stair at each end ──
  p.add('concrete', box(W, 0.03, D, 0, H - 0.03, 0), 'roof');
  p.add('wet_concrete', box(W - 0.1, 0.006, D - 0.1, 0, H, 0), 'roof');
  const railH = 1.1 * M, openAt = (x: number, z: number) => Math.abs(z + hd) < 0.05 && Math.abs(Math.abs(x) - hw) < 0.07;
  const post = (x: number, z: number) => p.add('iron', box(0.012, railH, 0.012, x, H, z), 'roof');
  const rail = (x0: number, z0: number, x1: number, z1: number) => {
    const l = Math.hypot(x1 - x0, z1 - z0), yaw = -Math.atan2(z1 - z0, x1 - x0);
    p.add('steel', box(l, 0.06 * M * 6, 0.012, 0, 0, 0).rotateY(yaw).translate((x0 + x1) / 2, H, (z0 + z1) / 2), 'roof');               // the kick plate
    p.add('iron', box(l, 0.012, 0.014, 0, 0, 0).rotateY(yaw).translate((x0 + x1) / 2, H + railH, (z0 + z1) / 2), 'roof');             // the handrail
    p.add('iron', box(l, 0.008, 0.01, 0, 0, 0).rotateY(yaw).translate((x0 + x1) / 2, H + railH * 0.55, (z0 + z1) / 2), 'roof');       // the mid rail
  };
  const e = 0.012, X = hw - e, Z = hd - e;
  const sides: Array<[number, number, number, number]> = [[-X, Z, X, Z], [-X, -Z, X, -Z], [-X, -Z, -X, Z], [X, -Z, X, Z]];
  for (const [ax, az, bx, bz] of sides) {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / (1.5 * M)));
    for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n; if (!openAt(x, z)) post(x, z); }
    // the rails stop where a stair comes up (the road-side corners)
    const cut = (x: number, z: number) => openAt(x, z);
    if (!cut(ax, az) && !cut(bx, bz)) rail(ax, az, bx, bz);
    else if (cut(ax, az)) rail(ax + (bx - ax) * 0.14, az + (bz - az) * 0.14, bx, bz);
    else rail(ax, az, bx - (bx - ax) * 0.14, bz - (bz - az) * 0.14);
  }
  // the stairs from the top of the wall (container height, 2.6 m) up onto the roof, at the road-side corner of each end
  const wallTop = 2.6 * M, steps = 6, run = 0.3, treadW = 0.2;
  for (const sg of [-1, 1] as const) {
    for (let k = 0; k < steps; k++) {
      const y = wallTop + (H - wallTop) * (k + 1) / steps, x = sg * (hw + run - run * (k + 0.5) / steps);
      p.add('steel', box(run / steps + 0.004, 0.012, treadW, x, y - 0.012, -hd + 0.1), 'roof');
      p.add('steel', box(0.006, y - wallTop, treadW, x - sg * run / steps / 2, wallTop, -hd + 0.1), 'roof');   // the riser
    }
    for (const z of [-hd + 0.1 - treadW / 2, -hd + 0.1 + treadW / 2]) {
      p.add('iron', box(run, 0.012, 0.012, 0, 0, 0).rotateZ(sg * Math.atan2(H - wallTop, run)).translate(sg * (hw + run / 2), (wallTop + H) / 2 + railH * 0.8, z), 'roof');
    }
  }
  // a roof-top lamp mast and a satellite dish: it is the gate's eye
  p.add('steel', box(0.012, 0.3, 0.012, hw - 0.12, H, -hd + 0.1), 'roof');
  p.add('paint_yellow', box(0.05, 0.02, 0.03, hw - 0.12, H + 0.3, -hd + 0.1), 'roof');

  p.collide({ x0: -hw, z0: -hd, x1: -hg, z1: hd }, { x0: hg, z0: -hd, x1: hw, z1: hd });
  const g = p.finish();
  g.userData.keep = ['frame'];
  g.userData.chimneyTop = null;
  return g;
}

export const GATEHOUSE_BUILDERS: Record<string, (def: KitPieceDef, seed?: number) => THREE.Group> = { gate_garage: gateGarage };
