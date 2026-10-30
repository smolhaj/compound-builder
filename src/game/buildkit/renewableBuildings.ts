/**
 * The renewable power buildings (sim/renewables.ts): the micro-hydro turbine house and the 5 kW wind
 * turbine on its guyed tilt-up tower. Procedural, layered for construction (shell.ts Parts) and merged
 * per layer x material, so each is a handful of draw calls. SCALE v2: 1 unit = 6 m (M = 1 m).
 *
 * The turbine's rotor is a separate group (`userData.rotor`, not a mesh, so showStage leaves it alone)
 * which the world spins from the day's wind (HomesteadWorld `_renewableLife`). The hydro house's
 * penstock and intake weir run to the creek and are drawn by the world from the sim's site
 * (`hydroSiteAt`), because they follow the ground, not the footprint.
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { M, pipe } from './interior';
import { box, Parts, type BuildOpts } from './shell';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial } from './materials';
import { TURBINE } from '../../sim/renewables';

const cylY = (r: number, h: number, x: number, y: number, z: number, seg = 10) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);

// ── micro-hydro turbine house: 4.8 x 4.2 m block house on a slab, shed roof, tailrace out the front ──

export const HYDRO_HOUSE = { W: 4.8 * M, D: 4.2 * M, H: 2.6 * M };

function microHydro(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const { W, D, H } = HYDRO_HOUSE;
  const hw = W / 2, hd = D / 2, t = 0.2 * M, y0 = 0.04 * M, F = def.cellsX * CELL / 2;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (F - 0.03), -0.02, sz * (F - 0.03)));
  // foundation: the slab, and the tailrace, a stone-lined channel out of the front wall that takes the spent water back to the creek
  p.layer = 'foundation';
  p.add('concrete', box(W + 0.5 * M, 0.2 * M, D + 0.5 * M, 0, -0.18 * M, 0));
  p.add('fieldstone', box(1.1 * M, 0.25 * M, 2.1 * M, 0, -0.1 * M, hd + 1.0 * M));
  p.add('earth', box(1.9 * M, 0.04 * M, 2.4 * M, 0, -0.02 * M, hd + 1.1 * M));
  // frame: concrete-block walls (a door in the front, a window on each side) and the penstock coming in through the back wall at knee height
  p.layer = 'frame';
  const doorW = 1.0 * M, doorH = 2.0 * M;
  p.add('concrete', box(W, H, t, 0, y0, -hd + t / 2));
  p.add('concrete', box(t, H, D - 2 * t, -hw + t / 2, y0, 0));
  p.add('concrete', box(t, H, D - 2 * t, hw - t / 2, y0, 0));
  p.add('concrete', box((W - doorW) / 2, H, t, -(W + doorW) / 4, y0, hd - t / 2));
  p.add('concrete', box((W - doorW) / 2, H, t, (W + doorW) / 4, y0, hd - t / 2));
  p.add('concrete', box(doorW, H - doorH, t, 0, y0 + doorH, hd - t / 2));
  // the penstock: 150 mm pipe from the hill to the nozzle manifold inside, a gate valve and a pressure gauge on it
  p.add('iron', pipe([0, y0 + 0.9 * M, -hd - 3.2 * M], [0, y0 + 0.9 * M, -hd + 1.0 * M], 0.14 * M, 10));
  p.add('paint_green', cylY(0.2 * M, 0.35 * M, 0, y0 + 0.9 * M, -hd - 0.8 * M, 10));
  p.add('steel', cylY(0.02 * M, 0.45 * M, 0, y0 + 1.15 * M, -hd - 0.8 * M, 6));
  p.add('steel', new THREE.CylinderGeometry(0.12 * M, 0.12 * M, 0.04 * M, 8).rotateX(Math.PI / 2).translate(0.3 * M, y0 + 1.2 * M, -hd - 0.1 * M));
  // roof: a shed roof sloping to the front, with a deep drip edge, and a vented ridge cap
  p.layer = 'roof';
  p.add('metal_roof_green', box(W + 0.6 * M, 0.08 * M, D + 0.7 * M, 0, 0, 0).rotateX(0.09).translate(0, y0 + H + 0.1 * M, 0));
  p.add('steel', box(0.9 * M, 0.25 * M, 0.5 * M, hw * 0.4, y0 + H + 0.3 * M, -hd * 0.5));
  // openings: the plank door (standing open on its hinge), the side windows with grills, the cable riser to a pole, the diversion load
  p.layer = 'openings';
  p.add('door', box(0.05 * M, doorH - 0.05, doorW * 0.9, -doorW / 2, y0, hd + doorW * 0.1).rotateY(-1.2).translate(0, 0, 0));
  for (const sx of [-1, 1]) { p.add('glass', box(0.03 * M, 0.7 * M, 0.9 * M, sx * (hw - 0.02), y0 + 1.1 * M, 0.2 * M)); for (let k = 0; k < 4; k++) p.add('iron', box(0.03 * M, 0.7 * M, 0.025 * M, sx * (hw + 0.03 * M), y0 + 1.1 * M, -0.1 * M + k * 0.25 * M)); }
  p.add('wood_dark', cylY(0.12 * M, 6.0 * M, hw + 1.6 * M, 0, hd * 0.6, 8));
  p.add('wood_dark', box(1.4 * M, 0.1 * M, 0.1 * M, hw + 1.6 * M, 5.7 * M, hd * 0.6));
  p.add('steel', pipe([hw - 0.02, y0 + 2.2 * M, hd * 0.3], [hw + 1.6 * M, 5.7 * M, hd * 0.6], 0.025 * M, 5));
  p.add('enamel', box(0.5 * M, 0.7 * M, 0.3 * M, -hw - 0.35 * M, y0 + 0.4 * M, -hd * 0.4));          // the dump-load heater box
  for (let k = 0; k < 5; k++) p.add('iron', box(0.46 * M, 0.02 * M, 0.02 * M, -hw - 0.35 * M, y0 + (0.5 + k * 0.1) * M, -hd * 0.4 + 0.16 * M));
  // interior: the Turgo runner in its housing, the alternator drum, the controller panel
  p.layer = 'interior';
  p.add('paint_green', new THREE.CylinderGeometry(0.55 * M, 0.55 * M, 0.5 * M, 16).translate(0, y0 + 0.65 * M, -0.3 * M));
  p.add('paint_green', new THREE.CylinderGeometry(0.45 * M, 0.45 * M, 0.55 * M, 14).rotateZ(Math.PI / 2).translate(0.85 * M, y0 + 0.65 * M, -0.3 * M));
  p.add('iron', box(2.2 * M, 0.12 * M, 0.9 * M, 0.2 * M, y0, -0.3 * M));
  p.add('enamel', box(0.7 * M, 1.0 * M, 0.2 * M, -hw + 0.5 * M, y0 + 0.9 * M, hd * 0.2));
  p.add('paint_green', box(0.1 * M, 0.06 * M, 0.02 * M, -hw + 0.5 * M, y0 + 1.5 * M, hd * 0.2 + 0.12 * M));
  p.collide({ x0: -hw, z0: -hd, x1: hw, z1: -hd + t }, { x0: -hw, z0: -hd, x1: -hw + t, z1: hd }, { x0: hw - t, z0: -hd, x1: hw, z1: hd },
    { x0: -hw, z0: hd - t, x1: -doorW / 2, z1: hd }, { x0: doorW / 2, z0: hd - t, x1: hw, z1: hd });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = [];
  return g;
}

// ── wind turbine: 18 m lattice tilt-up tower, three guys at two levels, nacelle with a furling tail, a three-blade rotor ──

/** Where the rotor's hub sits above the pad, local: the world spins `userData.rotor` about this point. */
export const TOWER = { H: TURBINE.HUB_M * M, LEG: 0.28 * M, BLADE: TURBINE.ROTOR_M / 2 * M, GUY_R: 12 * M };

function windTurbine(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const { H, LEG, BLADE, GUY_R } = TOWER, F = def.cellsX * CELL / 2;
  const legs: Array<[number, number]> = [0, 1, 2].map(i => [Math.cos(i * 2.094 + 0.52) * LEG, Math.sin(i * 2.094 + 0.52) * LEG]);
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (F - 0.03), -0.02, sz * (F - 0.03)));
  for (let i = 0; i < 3; i++) p.add('trim', box(0.012, 0.09, 0.012, Math.cos(i * 2.094 + 0.52) * GUY_R, -0.02, Math.sin(i * 2.094 + 0.52) * GUY_R));
  // foundation: the footing with the tower's hinge plate, and a concrete anchor block at the end of each guy
  p.layer = 'foundation';
  p.add('concrete', box(1.4 * M, 0.35 * M, 1.4 * M, 0, -0.2 * M, 0));
  for (let i = 0; i < 3; i++) p.add('concrete', box(0.6 * M, 0.25 * M, 0.6 * M, Math.cos(i * 2.094 + 0.52) * GUY_R, -0.12 * M, Math.sin(i * 2.094 + 0.52) * GUY_R));
  p.add('steel', box(0.7 * M, 0.08 * M, 0.7 * M, 0, 0.1 * M, 0));
  // frame: three tapered legs, rungs and diagonals every 1.5 m, and the guy wires at 9 m and 17 m down to the anchors
  p.layer = 'frame';
  const rungs = 12, rise = H / rungs;
  for (const [lx, lz] of legs) p.add('steel', pipe([lx, 0.1 * M, lz], [lx * 0.5, H, lz * 0.5], 0.045 * M, 5));
  for (let r = 0; r <= rungs; r++) {
    const y = 0.1 * M + r * (H - 0.1 * M) / rungs, k = 1 - 0.5 * r / rungs;
    for (let i = 0; i < 3; i++) {
      const a = legs[i], b = legs[(i + 1) % 3];
      p.add('steel', pipe([a[0] * k, y, a[1] * k], [b[0] * k, y, b[1] * k], 0.016 * M, 4));
      if (r < rungs) { const k2 = 1 - 0.5 * (r + 1) / rungs; p.add('steel', pipe([a[0] * k, y, a[1] * k], [b[0] * k2, y + rise, b[1] * k2], 0.012 * M, 4)); }
    }
  }
  for (let i = 0; i < 3; i++) {
    const ax = Math.cos(i * 2.094 + 0.52) * GUY_R, az = Math.sin(i * 2.094 + 0.52) * GUY_R;
    for (const hf of [0.5, 0.94]) {
      const y = H * hf, k = 1 - 0.5 * hf;
      p.add('iron', pipe([ax, 0.2 * M, az], [Math.cos(i * 2.094 + 0.52) * LEG * k, y, Math.sin(i * 2.094 + 0.52) * LEG * k], 0.01 * M, 3));
    }
    p.add('paint_yellow', cylY(0.03 * M, 2.0 * M, ax * 0.97, 0.1 * M, az * 0.97, 5));              // a yellow guard on each anchor's guy, so nobody walks into it
  }
  // roof: the nacelle (generator housing), the yaw bearing, the tail boom with its vane (furls up out of the wind in a gale)
  p.layer = 'roof';
  const nz = 0.0;
  p.add('enamel', box(0.5 * M, 0.5 * M, 1.4 * M, 0, H, nz - 0.2 * M));
  p.add('steel', cylY(0.14 * M, 0.3 * M, 0, H - 0.25 * M, nz, 8));
  p.add('steel', pipe([0, H + 0.25 * M, nz - 0.9 * M], [0, H + 0.45 * M, nz - 3.0 * M], 0.04 * M, 5));
  p.add('paint_red', box(0.05 * M, 0.9 * M, 1.0 * M, 0, H + 0.2 * M, nz - 3.0 * M));
  // finish: the cable down the tower to the controller box on the footing, and a lightning rod above the nacelle
  p.layer = 'openings';
  p.add('iron', pipe([0.1 * M, H - 0.2 * M, nz], [LEG * 0.5, 0.2 * M, 0.2 * M], 0.015 * M, 4));
  p.add('enamel', box(0.5 * M, 0.7 * M, 0.25 * M, 1.0 * M, 0, 0.3 * M));
  p.add('steel', pipe([0, H + 0.25 * M, nz], [0, H + 1.0 * M, nz], 0.01 * M, 3));
  p.collide({ x0: -0.3 * M, z0: -0.3 * M, x1: 0.3 * M, z1: 0.3 * M });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  // the rotor: hub, spinner and three tapered blades in a group that turns about the shaft (+z, into the wind)
  const rotor = new THREE.Group();
  rotor.position.set(0, H, nz + 0.6 * M);
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.4 });
  const bladeGeo = new THREE.BoxGeometry(0.34 * M, BLADE, 0.05 * M).translate(0, BLADE / 2 + 0.2 * M, 0);
  // taper: the tip narrower than the root (scale the top vertices)
  const pos = bladeGeo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > BLADE * 0.5) pos.setX(i, pos.getX(i) * 0.45);
  bladeGeo.computeVertexNormals();
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(bladeGeo, white);
    b.rotation.z = i * 2.094;
    b.castShadow = true;
    rotor.add(b);
  }
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.2 * M, 0.5 * M, 10).rotateX(Math.PI / 2).translate(0, 0, 0.25 * M), white);
  rotor.add(hub);
  rotor.visible = false;
  g.add(rotor);
  g.userData.rotor = rotor;
  return g;
}

export const RENEWABLE_BUILDERS: Record<string, (def: KitPieceDef, seed?: number, opts?: BuildOpts) => THREE.Group> = {
  micro_hydro: microHydro,
  wind_turbine: windTurbine,
};

/**
 * The line the footprint cannot hold (local to the turbine house): the penstock laid along the ground from the house's back wall to the
 * intake weir upstream, with a low mound of trench spoil along it, and the weir across the creek with its screen box. The weir is its own
 * child (`userData.weir`) so a flood that takes it can hide it. `pts` run from the house to the intake, local x/y/z; `weir` is the intake in
 * the same frame with the creek's half width and the channel's direction (radians in the local frame).
 */
export function hydroLine(pts: ReadonlyArray<[number, number, number]>, weir: { x: number; y: number; z: number; half: number; yaw: number }): THREE.Group {
  const out = new THREE.Group();
  const pipeGeos: THREE.BufferGeometry[] = [], moundGeos: THREE.BufferGeometry[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    pipeGeos.push(pipe([a[0], a[1] + 0.07 * M, a[2]], [b[0], b[1] + 0.07 * M, b[2]], 0.075 * M, 6));
    const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1;
    const m = box(0.5 * M, 0.2 * M, L, 0, 0, 0).rotateY(Math.atan2(dx, dz)).translate((a[0] + b[0]) / 2 - dz / L * 0.55 * M, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 + dx / L * 0.55 * M);
    moundGeos.push(m);
  }
  const mesh = (gs: THREE.BufferGeometry[], mat: Parameters<typeof kitMaterial>[0], name: string, parent: THREE.Object3D) => {
    const g = mergeGeometries(gs); gs.forEach(x => x.dispose());
    if (!g) return;
    const m = new THREE.Mesh(g, kitMaterial(mat)); m.castShadow = false; m.receiveShadow = true; m.name = name; parent.add(m);
  };
  mesh(pipeGeos, 'rubber', 'penstock', out);
  mesh(moundGeos, 'earth', 'spoil', out);
  // the weir: a concrete sill across the channel a metre proud of the water, wing walls into the banks, and the screen box with its gate on the near bank
  const w = new THREE.Group();
  w.position.set(weir.x, weir.y, weir.z);
  w.rotation.y = weir.yaw;
  const span = (weir.half + 1.6 * M) * 2;
  const wg: THREE.BufferGeometry[] = [box(0.5 * M, 0.9 * M, span, 0, -0.3 * M, 0), box(1.2 * M, 0.3 * M, span - 0.4 * M, 0.4 * M, -0.3 * M, 0)];
  const sg: THREE.BufferGeometry[] = [box(1.4 * M, 0.9 * M, 1.2 * M, -0.9 * M, -0.1 * M, -span / 2 + 0.7 * M)];
  for (let k = 0; k < 7; k++) sg.push(box(0.03 * M, 0.7 * M, 0.03 * M, -1.62 * M, 0.0, -span / 2 + 0.2 * M + k * 0.15 * M));
  mesh(wg, 'concrete', 'weir', w);
  mesh(sg, 'steel', 'screen', w);
  w.userData.weir = true;
  out.add(w);
  out.userData.weir = w;
  return out;
}
