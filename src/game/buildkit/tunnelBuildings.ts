/**
 * Polytunnel, high tunnel and the aquaponics bay (sim/tunnels.ts, sim/aquaponics.ts). Procedural, layered for construction
 * (shell.ts Parts), merged per layer x material. SCALE v2: 1 unit = 6 m (M = 1 m), a person 0.28.
 *
 *  Polytunnel   6 x 12 m, nine round hoops on baseboards, one skin of film, a plank door at each end, beds of soil with rows.
 *  High tunnel  9 x 30 m, thirteen gothic bows 2.4 m apart, a film skin with the sides rolled up on a pole at 1.3 m, double doors,
 *               four long beds under a drip line. Film is the 'polycarb' material (milky, see-through).
 *  Aquaponics   6 x 12 m glazed bay: an aluminium shell, four round tanks in a row on the north side, two media beds of green
 *               plants down the south side, the sump and pump, the water heater, the air pump, grow lamps, vents.
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { M, pipe } from './interior';
import { box, Parts, type BuildOpts } from './shell';

const cylY = (r: number, h: number, x: number, y: number, z: number, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);

/** A profile of (x, y) points across a tunnel from the left foot to the right foot (local, y up). */
type Profile = Array<[number, number]>;
const arch = (hw: number, H: number, side: number, n: number, gothic: boolean): Profile => {
  const out: Profile = [];
  for (let i = 0; i <= n; i++) {
    const t = -1 + 2 * i / n, x = t * hw;
    // round: a half ellipse; gothic: near-vertical sides that lean into a pointed crown
    const y = gothic ? side + (H - side) * Math.pow(Math.max(0, 1 - Math.abs(t) ** 2.4), 0.8) * (1 - 0.0 * Math.abs(t)) : H * Math.sqrt(Math.max(0, 1 - t * t));
    out.push([x, i === 0 || i === n ? 0 : Math.max(0.02, y)]);
  }
  return out;
};

/** A skin over a profile along z (open ended): a strip of quads from z0 to z1. */
function skin(prof: Profile, z0: number, z1: number, rollFrom = 0, rollTo = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let i = 1; i < prof.length; i++) {
    const a = prof[i - 1], b = prof[i];
    // sides rolled up: the film stops at rollFrom on the left foot and rollTo on the right (heights, m): leave the part below bare
    if (Math.max(a[1], b[1]) < rollFrom && a[0] < 0) continue;
    if (Math.max(a[1], b[1]) < rollTo && a[0] > 0) continue;
    pos.push(a[0], a[1], z0, b[0], b[1], z0, b[0], b[1], z1, a[0], a[1], z0, b[0], b[1], z1, a[0], a[1], z1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Soil beds with rows of green: `n` beds along z at the x offsets, length L, width w. */
function beds(p: Parts, xs: number[], L: number, w: number, y: number, rowsPer = 4): void {
  for (const x of xs) {
    p.add('soil', box(w, 0.14 * M, L, x, y, 0));
    for (let r = 0; r < rowsPer; r++) {
      const rx = x - w / 2 + (r + 0.5) * w / rowsPer;
      for (let k = 0; k < Math.floor(L / (0.55 * M)); k++) p.add('crop', cylY(0.14 * M, 0.3 * M, rx, y + 0.14 * M, -L / 2 + (k + 0.5) * 0.55 * M, 5));
    }
  }
}

// ── polytunnel ──

function polytunnel(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = 6 * M, D = 12 * M, H = 2.4 * M, hw = W / 2, hd = D / 2, F = def.cellsX * CELL / 2;
  const prof = arch(hw, H, 0, 12, false);
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (F - 0.03), -0.02, sz * (def.cellsZ * CELL / 2 - 0.03)));
  p.layer = 'foundation';
  for (const sx of [-1, 1]) p.add('wood_dark', box(0.25 * M, 0.3 * M, D, sx * hw, 0, 0));       // the baseboards the film is clipped to
  p.layer = 'frame';
  const hoops = 9;
  for (let h = 0; h < hoops; h++) {
    const z = -hd + 0.4 * M + h * (D - 0.8 * M) / (hoops - 1);
    for (let i = 1; i < prof.length; i++) p.add('aluminum', pipe([prof[i - 1][0], prof[i - 1][1], z], [prof[i][0], prof[i][1], z], 0.03 * M, 5));
    for (const sx of [-1, 1]) p.add('steel', cylY(0.03 * M, 0.5 * M, sx * hw, -0.4 * M, z, 5));   // ground post
  }
  for (const x of [0, -hw * 0.55, hw * 0.55]) p.add('aluminum', pipe([x, H * Math.sqrt(1 - (x / hw) ** 2), -hd], [x, H * Math.sqrt(1 - (x / hw) ** 2), hd], 0.025 * M, 5));   // the ridge and shoulder purlins
  p.layer = 'roof';
  p.add('polycarb', skin(prof, -hd, hd));
  // end walls: plank frames with a door
  p.layer = 'walls';
  for (const sz of [-1, 1]) {
    const z = sz * hd, door = 0.9 * M, dh = 1.8 * M;
    const sh = new THREE.Shape([new THREE.Vector2(-hw, 0), new THREE.Vector2(hw, 0), ...prof.slice().reverse().map(([x, y]) => new THREE.Vector2(x, y))]);
    sh.holes.push(new THREE.Path([new THREE.Vector2(-door / 2, 0), new THREE.Vector2(-door / 2, dh), new THREE.Vector2(door / 2, dh), new THREE.Vector2(door / 2, 0)].reverse()));
    p.add('polycarb', new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, z - 0.01));
    for (const x of [-door / 2 - 0.04, door / 2 + 0.04]) p.add('wood_mid', box(0.08 * M, dh, 0.1 * M, x, 0, z));
    p.add('wood_mid', box(door + 0.2 * M, 0.08 * M, 0.1 * M, 0, dh, z));
  }
  p.layer = 'openings';
  p.add('door', box(0.88 * M, 1.75 * M, 0.04 * M, 0.2 * M, 0, hd + 0.03));
  p.layer = 'interior';
  beds(p, [-1.9 * M, 0, 1.9 * M].map(x => x * 0.8), D - 2.2 * M, 1.0 * M, 0, 3);
  p.add('pavers', box(0.6 * M, 0.01, D - 1 * M, 0, 0, 0));
  p.collide({ x0: -hw, z0: -hd, x1: -hw + 0.05, z1: hd }, { x0: hw - 0.05, z0: -hd, x1: hw, z1: hd }, { x0: -hw, z0: -hd, x1: hw, z1: -hd + 0.05 });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

// ── high tunnel ──

function highTunnel(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = 9 * M, D = 30 * M, H = 4.3 * M, SIDE = 1.5 * M, hw = W / 2, hd = D / 2, F = def.cellsX * CELL / 2;
  const prof = arch(hw, H, SIDE, 18, true);
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (F - 0.03), -0.02, sz * (def.cellsZ * CELL / 2 - 0.03)));
  p.layer = 'foundation';
  const bows = 13;
  const zs = Array.from({ length: bows }, (_, i) => -hd + 0.6 * M + i * (D - 1.2 * M) / (bows - 1));
  for (const z of zs) for (const sx of [-1, 1]) p.add('concrete', cylY(0.1 * M, 0.5 * M, sx * hw, -0.45 * M, z, 6));      // the bows' feet
  for (const sx of [-1, 1]) p.add('wood_dark', box(0.2 * M, 0.3 * M, D, sx * (hw + 0.2 * M), 0, 0));                   // the hip boards
  p.layer = 'frame';
  for (const z of zs) for (let i = 1; i < prof.length; i++) p.add('aluminum', pipe([prof[i - 1][0], prof[i - 1][1], z], [prof[i][0], prof[i][1], z], 0.04 * M, 5));
  for (const t of [-0.8, -0.45, 0, 0.45, 0.8]) { const i = Math.round((t + 1) / 2 * (prof.length - 1)), [x, y] = prof[i]; p.add('aluminum', pipe([x, y, -hd + 0.2 * M], [x, y, hd - 0.2 * M], 0.03 * M, 5)); }
  for (const sx of [-1, 1]) p.add('aluminum', pipe([sx * hw, 1.3 * M, -hd + 0.2 * M], [sx * hw, 1.3 * M, hd - 0.2 * M], 0.03 * M, 5));   // the roll-up rails
  p.layer = 'roof';
  p.add('polycarb', skin(prof, -hd, hd, 1.35 * M, 1.35 * M));
  // the rolled side film: a roll on a crank pole at the rail, both sides
  for (const sx of [-1, 1]) p.add('polycarb', new THREE.CylinderGeometry(0.1 * M, 0.1 * M, D - 0.6 * M, 8).rotateX(Math.PI / 2).translate(sx * (hw + 0.05), 1.3 * M, 0));
  p.layer = 'walls';
  for (const sz of [-1, 1]) {
    const z = sz * hd, dw = 2.4 * M, dh = 2.5 * M;
    const sh = new THREE.Shape([new THREE.Vector2(-hw, 0), new THREE.Vector2(hw, 0), ...prof.slice().reverse().map(([x, y]) => new THREE.Vector2(x, y))]);
    sh.holes.push(new THREE.Path([new THREE.Vector2(-dw / 2, 0), new THREE.Vector2(-dw / 2, dh), new THREE.Vector2(dw / 2, dh), new THREE.Vector2(dw / 2, 0)].reverse()));
    p.add('polycarb', new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, z - 0.01));
    for (const x of [-dw / 2 - 0.05, dw / 2 + 0.05]) p.add('wood_mid', box(0.1 * M, dh, 0.14 * M, x, 0, z));
    p.add('wood_mid', box(dw + 0.3 * M, 0.1 * M, 0.14 * M, 0, dh, z));
  }
  p.layer = 'openings';
  for (const sx of [-1, 1]) p.add('door', box(1.1 * M, 2.3 * M, 0.05 * M, sx * 0.62 * M, 0, hd + 0.04).rotateY(sx * 0.0));
  p.layer = 'interior';
  beds(p, [-3.1 * M, -1.05 * M, 1.05 * M, 3.1 * M], D - 3 * M, 1.5 * M, 0, 4);
  for (const x of [-3.1 * M, -1.05 * M, 1.05 * M, 3.1 * M]) p.add('rubber', pipe([x, 0.4 * M, -hd + 1.4 * M], [x, 0.4 * M, hd - 1.4 * M], 0.02 * M, 4));   // the drip header
  p.add('gravel', box(1.0 * M, 0.01, D - 0.6 * M, 0, 0, 0));
  p.collide({ x0: -hw - 0.1, z0: -hd, x1: -hw, z1: hd }, { x0: hw, z0: -hd, x1: hw + 0.1, z1: hd });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

// ── aquaponics bay ──

function aquaponics(def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const W = 6 * M, D = 12 * M, E = 2.6 * M, R = 3.9 * M, hw = W / 2, hd = D / 2, t = 0.06 * M, y0 = 0.1 * M, F = def.cellsX * CELL / 2;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (F - 0.03), -0.02, sz * (def.cellsZ * CELL / 2 - 0.03)));
  p.layer = 'foundation';
  p.add('concrete', box(W + 0.2 * M, 0.2 * M, D + 0.2 * M, 0, -0.1 * M, 0));
  p.add('gravel', box(1.6 * M, 0.01, 1.8 * M, 0, -0.01, hd + 1.0 * M));
  p.layer = 'frame';
  const zs = Array.from({ length: 7 }, (_, i) => -hd + i * D / 6);
  for (const z of zs) { for (const sx of [-1, 1]) p.add('aluminum', box(t, E - y0, t, sx * hw, y0, z)); }
  for (const sx of [-1, 1]) p.add('aluminum', box(t * 1.6, t * 1.6, D, sx * hw, E - t, 0));
  p.layer = 'rafters';
  const slope = Math.hypot(hw, R - E), ang = Math.atan2(R - E, hw);
  for (const z of zs) for (const sx of [-1, 1]) p.add('aluminum', box(slope, t, t, 0, -t / 2, 0).rotateZ(-sx * ang).translate(sx * hw / 2, (E + R) / 2, z));
  p.add('aluminum', box(t * 1.6, t * 1.6, D, 0, R - t, 0));
  p.layer = 'roof';
  for (const sx of [-1, 1]) p.add('glass', box(slope, 0.004, D, 0, 0, 0).rotateZ(-sx * ang).translate(sx * hw / 2, (E + R) / 2 + t / 2, 0));
  p.add('aluminum', box(0.7 * M, 0.5 * M, 1.4 * M, 0, R - 0.02, -hd * 0.5));   // the ridge vent housing
  p.layer = 'walls';
  for (const sx of [-1, 1]) p.add('polycarb', box(0.004, E - y0, D, sx * hw, y0, 0));
  for (const sz of [-1, 1]) {
    const door = sz > 0, dw = 1.2 * M, dh = 2.1 * M;
    const sh = new THREE.Shape([new THREE.Vector2(-hw, y0), new THREE.Vector2(hw, y0), new THREE.Vector2(hw, E), new THREE.Vector2(0, R), new THREE.Vector2(-hw, E)]);
    if (door) sh.holes.push(new THREE.Path([new THREE.Vector2(-dw / 2, y0), new THREE.Vector2(-dw / 2, dh), new THREE.Vector2(dw / 2, dh), new THREE.Vector2(dw / 2, y0)].reverse()));
    p.add('polycarb', new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, sz * hd - 0.002));
  }
  p.layer = 'openings';
  p.add('door', box(1.1 * M, 2.05 * M, 0.04 * M, 0.3 * M, y0, hd + 0.04).rotateY(0));
  // the exhaust fan on the north gable, the louvers
  p.add('iron', new THREE.CylinderGeometry(0.4 * M, 0.4 * M, 0.1 * M, 12).rotateX(Math.PI / 2).translate(0, E + 0.5 * M, -hd - 0.03));
  p.layer = 'interior';
  // four 1,000 L tanks along the north-west wall with water showing, a sump at the end, the pump and the heater
  for (let i = 0; i < 4; i++) {
    const z = -hd + 1.2 * M + i * 1.5 * M, x = -hw + 0.85 * M;
    p.add('steel', cylY(0.6 * M, 1.0 * M, x, y0, z, 16));
    p.add('pond_water', new THREE.CircleGeometry(0.55 * M, 16).rotateX(-Math.PI / 2).translate(x, y0 + 0.92 * M, z));
    p.add('paint_green', box(1.2 * M, 0.04 * M, 0.04 * M, x, y0 + 1.02 * M, z));
  }
  p.add('steel', cylY(0.45 * M, 0.8 * M, -hw + 0.85 * M, y0, hd - 1.0 * M, 12));
  p.add('enamel', box(0.35 * M, 0.5 * M, 0.3 * M, -hw + 0.3 * M, y0, hd - 2.0 * M));    // the heater
  p.add('iron', box(0.3 * M, 0.2 * M, 0.2 * M, -hw + 0.3 * M, y0, hd - 2.6 * M));       // the air pump
  p.add('iron', pipe([-hw + 0.85 * M, y0 + 1.0 * M, -hd + 1.2 * M], [-hw + 0.85 * M, y0 + 1.0 * M, hd - 1.0 * M], 0.05 * M, 6));
  // two media beds down the east side on stands: gravel, rows of lettuce, basil and chard
  for (const bx of [0.35 * M, 1.5 * M]) {
    p.add('wood_mid', box(1.0 * M, 0.05 * M, D - 3 * M, bx, y0 + 0.75 * M, -0.5 * M));
    p.add('gravel', box(0.9 * M, 0.15 * M, D - 3.1 * M, bx, y0 + 0.8 * M, -0.5 * M));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('steel', cylY(0.03 * M, 0.75 * M, bx + sx * 0.45 * M, y0, -0.5 * M + sz * (D / 2 - 1.6 * M), 5));
    for (let k = 0; k < 14; k++) for (const o of [-0.25, 0.25]) p.add('crop', cylY(0.14 * M, 0.3 * M, bx + o * M, y0 + 0.95 * M, -0.5 * M - (D - 3.4 * M) / 2 + (k + 0.5) * (D - 3.4 * M) / 14, 5));
  }
  // grow lamps along the ridge (lamp material glows when lit)
  for (let k = 0; k < 4; k++) p.add('lamp', box(0.9 * M, 0.04 * M, 0.2 * M, 0, E + 0.2 * M, -hd + 1.5 * M + k * 3 * M));
  p.collide({ x0: -hw, z0: -hd, x1: -hw + 0.05, z1: hd }, { x0: hw - 0.05, z0: -hd, x1: hw, z1: hd }, { x0: -hw, z0: -hd, x1: hw, z1: -hd + 0.05 }, { x0: -hw, z0: hd - 0.05, x1: -0.7 * M, z1: hd }, { x0: 0.7 * M, z0: hd - 0.05, x1: hw, z1: hd });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'rafters'];
  return g;
}

export const TUNNEL_BUILDERS: Record<string, (def: KitPieceDef, seed?: number, opts?: BuildOpts) => THREE.Group> = { polytunnel, high_tunnel: highTunnel, aquaponics };
