/**
 * Watch towers: the upgrade chain (sim/towers.ts; docs/DECISIONS.md). Six
 * procedural pieces, each a finished tower of its own that rises beside the
 * one it replaces:
 *
 *   rise_lookout          a mound of earth, a timber nest on posts, a sandbag parapet, a plank roof
 *   watchtower_wood       a 6 m timber tower with braced legs, a roofed cab and a trapdoor ladder
 *   watchtower_concrete   a poured shaft with a steel cab, firing slits, a caged ladder
 *   watchtower_flood      the same with a light mast (lamp lenses glow at night when there is power)
 *   watchtower_mount      a taller armored tower: an open roof platform with a ring-mounted machine gun
 *   watchtower_turret     the same with a remote turret and a camera mast
 *
 * Local frame: origin at the footprint center on the pad (y = 0). Heights
 * in world units (1 ≈ 6 m); a person is 0.28 tall. The fighting
 * post of each tier (sim/towers.ts TOWERS[].post.y) is the floor of the cab
 * or the roof platform. Floodlight lenses are a separate `interior`-layer
 * 'bulb' mesh the world switches on at night with power.
 */
import * as THREE from 'three';
import { type KitPieceDef } from './kit';
import { pipe } from './interior';
import { box, Parts } from './shell';

const cyl = (r: number, h: number, x: number, y: number, z: number, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);

/** A fixed ladder up one face: rails and rungs, from the ground to `top`, on the +z face at x. */
function ladder(p: Parts, x: number, z: number, top: number, mat: 'wood_dark' | 'steel' = 'wood_dark', cage = false): void {
  for (const sx of [-1, 1]) p.add(mat, box(0.012, top, 0.012, x + sx * 0.05, 0, z), 'openings');
  for (let k = 1; k * 0.07 < top - 0.02; k++) p.add(mat, box(0.1, 0.009, 0.009, x, k * 0.07, z), 'openings');
  if (cage) for (let y = 0.5; y < top - 0.05; y += 0.14) p.add('steel', new THREE.TorusGeometry(0.075, 0.004, 4, 12).translate(x, y, z + 0.02), 'openings');
}

/** A course of sandbags laid along a straight edge (x0,z0)→(x1,z1) at height y, `rows` high, bags staggered. */
function sandbags(p: Parts, x0: number, z0: number, x1: number, z1: number, y: number, rows = 2, skip: Array<[number, number]> = []): void {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.07)), yaw = -Math.atan2(z1 - z0, x1 - x0);
  for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
    const t = (i + 0.5 + (r % 2 ? 0.5 : 0)) / n;
    if (t > 1) continue;
    if (skip.some(([a, b]) => t >= a && t <= b)) continue;
    const bag = new THREE.BoxGeometry(len / n * 0.96, 0.028, 0.055).rotateY(yaw).translate(x0 + (x1 - x0) * t, y + 0.014 + r * 0.03, z0 + (z1 - z0) * t);
    p.add('straw', bag, 'walls');
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Tier 1: a rise with a lookout nest
// ─────────────────────────────────────────────────────────────────────────
function riseLookout(_def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const R = 0.46, Rt = 0.2, H = 0.22, deckY = 0.38, half = 0.15;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * 0.42, -0.02, sz * 0.42));
  // the rise: a tamped, faced mound with a rubble toe (a natural knoll is just a better start)
  p.add('earth', new THREE.CylinderGeometry(Rt, R, H, 22).translate(0, H / 2, 0), 'foundation');
  p.add('earth', new THREE.SphereGeometry(Rt, 16, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.18, 1).translate(0, H, 0), 'foundation');
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2 + p.rnd() * 0.2; p.add('fieldstone', box(0.05 + p.rnd() * 0.03, 0.03, 0.04, Math.cos(a) * (R - 0.02), 0, Math.sin(a) * (R - 0.02)).rotateY(-a), 'foundation'); }
  // the nest: four posts from the mound to a plank deck, cross-braced
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('wood_dark', box(0.028, deckY - H + 0.02, 0.028, sx * (half - 0.02), H - 0.02, sz * (half - 0.02)), 'frame');
  for (const [a, b] of [[[-1, 1], [1, 1]], [[-1, -1], [1, -1]], [[-1, -1], [-1, 1]], [[1, -1], [1, 1]]] as const) {
    const ax = a[0] * (half - 0.02), az = a[1] * (half - 0.02), bx = b[0] * (half - 0.02), bz = b[1] * (half - 0.02);
    p.add('wood_mid', box(Math.hypot(bx - ax, bz - az), 0.014, 0.014, 0, 0, 0).rotateY(-Math.atan2(bz - az, bx - ax)).translate((ax + bx) / 2, H + 0.07, (az + bz) / 2), 'frame');
  }
  p.add('deck', box(half * 2 + 0.06, 0.02, half * 2 + 0.06, 0, deckY - 0.02, 0), 'deck');
  // sandbag parapet on three sides, the ladder side open; a firing gap in the front course
  const e = half + 0.02;
  sandbags(p, -e, -e, e, -e, deckY, 3);
  sandbags(p, -e, -e, -e, e, deckY, 3);
  sandbags(p, e, -e, e, e, deckY, 3);
  sandbags(p, -e, e, e, e, deckY, 2, [[0.34, 0.66]]);
  // a plank roof on four short posts (a lean-to sloping to the front), with a sheet of tin on top
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) p.add('wood_dark', box(0.016, 0.2 + (sz < 0 ? 0.04 : 0), 0.016, sx * (e - 0.01), deckY, sz * (e - 0.01)), 'rafters');
  p.add('wood_mid', box(half * 2 + 0.1, 0.014, half * 2 + 0.1, 0, deckY + 0.205, 0).rotateX(0.12), 'roof');
  p.add('metal_roof', box(half * 2 + 0.12, 0.008, half * 2 + 0.12, 0, deckY + 0.222, 0).rotateX(0.12), 'roof');
  // a ladder from the foot of the mound up to the open side of the nest, and a bench
  for (const sx of [-1, 1]) p.add('wood_dark', pipe([sx * 0.05, 0.03, 0.43], [sx * 0.05, deckY - 0.03, e + 0.03], 0.006, 4), 'openings');
  for (let k = 1; k < 6; k++) { const t = k / 6.2; p.add('wood_dark', box(0.1, 0.009, 0.009, 0, 0, 0).translate(0, 0.03 + (deckY - 0.06) * t, 0.43 + (e + 0.03 - 0.43) * t), 'openings'); }
  p.add('wood_mid', box(0.2, 0.02, 0.06, 0, deckY + 0.07, -e + 0.05), 'openings');
  p.collide({ x0: -0.3, z0: -0.3, x1: 0.3, z1: 0.3 });
  const g = p.finish();
  g.userData.keep = ['frame', 'rafters'];
  g.userData.chimneyTop = null;
  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Tier 2: a wooden watchtower
// ─────────────────────────────────────────────────────────────────────────
function woodTower(_def: KitPieceDef, seed = 1): THREE.Group {
  const p = new Parts(seed);
  const deck = 1.0, legB = 0.2, legT = 0.15, half = 0.25;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * 0.23, -0.02, sz * 0.23));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('concrete', box(0.09, 0.06, 0.09, sx * legB, -0.02, sz * legB), 'foundation');
  // four legs splayed in toward the top, three levels of girts and X-bracing on every face
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    // a leg leans in on both axes: build it from x-lean and z-lean boxes merged by shear
    const g = new THREE.BoxGeometry(0.04, deck, 0.04, 1, 1, 1);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / deck + 0.5;
      pos.setX(i, pos.getX(i) + sx * (legB + (legT - legB) * t));
      pos.setZ(i, pos.getZ(i) + sz * (legB + (legT - legB) * t));
      pos.setY(i, pos.getY(i) + deck / 2);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    p.add('wood_dark', g, 'frame');
  }
  const wAt = (y: number) => legB + (legT - legB) * (y / deck);
  for (const y of [0.22, 0.52, 0.82]) {
    const w = wAt(y);
    for (const [ax, az, bx, bz] of [[-w, -w, w, -w], [-w, w, w, w], [-w, -w, -w, w], [w, -w, w, w]]) p.add('wood_mid', box(Math.hypot(bx - ax, bz - az), 0.022, 0.022, 0, 0, 0).rotateY(-Math.atan2(bz - az, bx - ax)).translate((ax + bx) / 2, y, (az + bz) / 2), 'frame');
  }
  for (const [y0, y1] of [[0.22, 0.52], [0.52, 0.82]]) for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) {
    const w0 = wAt(y0), w1 = wAt(y1), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const run = Math.hypot((bx - ax) * w0, (bz - az) * w0), rise = y1 - y0, len = Math.hypot(run, rise), yaw = -Math.atan2((bz - az), (bx - ax));
    for (const sgn of [-1, 1]) p.add('wood_mid', box(len, 0.014, 0.014, 0, 0, 0).rotateZ(sgn * Math.atan2(rise, run)).rotateY(yaw).translate(mx * (w0 + w1) / 2 + (ax === bx ? ax * 0.02 : 0), (y0 + y1) / 2, mz * (w0 + w1) / 2 + (az === bz ? az * 0.02 : 0)), 'frame');
  }
  // the deck and the cab: half-height board walls with an open band for the rifles, four posts, a pyramid roof
  p.add('deck', box(half * 2, 0.026, half * 2, 0, deck, 0), 'deck');
  const cabH = 0.3, wallT = 0.014;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('wood_dark', box(0.026, cabH, 0.026, sx * (half - 0.015), deck + 0.026, sz * (half - 0.015)), 'rafters');
  for (const [w, d, x, z] of [[half * 2, wallT, 0, -half + 0.01], [wallT, half * 2, -half + 0.01, 0], [wallT, half * 2, half - 0.01, 0]] as const) p.add('board_batten', box(w, 0.11, d, x, deck + 0.026, z), 'walls');
  p.add('board_batten', box(half * 2, 0.11, wallT, 0, deck + 0.026, half - 0.01), 'walls');
  for (const [w, d, x, z] of [[half * 2, 0.02, 0, -half + 0.01], [0.02, half * 2, -half + 0.01, 0], [0.02, half * 2, half - 0.01, 0], [half * 2, 0.02, 0, half - 0.01]] as const) p.add('wood_mid', box(w, 0.02, d, x, deck + 0.026 + cabH - 0.02, z), 'rafters');
  p.add('metal_roof', new THREE.ConeGeometry(half * 1.55, 0.17, 4).rotateY(Math.PI / 4).translate(0, deck + 0.026 + cabH + 0.085, 0), 'roof');
  p.add('wood_dark', cyl(0.006, 0.07, 0, deck + 0.026 + cabH + 0.17, 0, 5), 'roof');
  // ladder up the +z face to a trapdoor, a rail round the foot of the cab, a lantern
  ladder(p, 0, wAt(0) + 0.035, deck + 0.02);
  p.add('wood_mid', box(0.18, 0.012, 0.18, 0, deck + 0.026, half - 0.12), 'openings');
  p.add('iron', cyl(0.012, 0.03, half - 0.03, deck + 0.026 + cabH - 0.05, half - 0.03, 6), 'openings');
  p.collide({ x0: -0.26, z0: -0.26, x1: 0.26, z1: 0.26 });
  const g = p.finish();
  g.userData.keep = ['frame', 'rafters'];
  g.userData.chimneyTop = null;
  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Tiers 3–6: the concrete and steel tower (and its floodlit, armed forms)
// ─────────────────────────────────────────────────────────────────────────
interface ConcreteOpts { floorY: number; mast: boolean; ring: boolean; turret: boolean }

/** A floodlight head at (x, y, z) facing `yaw` (0 = +z): a housing, a dark lens, and (layer 'interior') a glowing panel the world lights with power. */
function lamp(p: Parts, x: number, y: number, z: number, yaw: number): void {
  const at = (g: THREE.BufferGeometry) => g.rotateY(yaw).translate(x, y, z);
  p.add('iron', at(box(0.08, 0.05, 0.04, 0, -0.025, 0)), 'openings');
  p.add('steel', at(box(0.09, 0.01, 0.05, 0, 0.025, 0)), 'openings');
  p.add('bulb', at(new THREE.PlaneGeometry(0.07, 0.04).translate(0, 0, 0.0205)), 'interior');
  p.add('glass', at(new THREE.PlaneGeometry(0.075, 0.044).translate(0, 0, 0.021)), 'openings');
}

function concreteTower(opts: ConcreteOpts): (def: KitPieceDef, seed?: number) => THREE.Group {
  return (_def, seed = 1) => {
    const p = new Parts(seed);
    const fy = opts.floorY, shaft = 0.15, cabW = opts.ring ? 0.46 : 0.54, cabH = opts.ring ? 0.28 : 0.3;
    const hc = cabW / 2;
    p.layer = 'stakes';
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * 0.23, -0.02, sz * 0.23));
    // the footing, the shaft in poured lifts (a faint seam between), the inset slits
    p.add('concrete', box(0.46, 0.05, 0.46, 0, -0.01, 0), 'foundation');
    const lifts = Math.round((fy - 0.04) / 0.22);
    p.add('concrete', box(shaft * 2, fy - 0.04, shaft * 2, 0, 0.04, 0), 'frame');
    for (let k = 1; k < lifts; k++) p.add('iron', box(shaft * 2 + 0.004, 0.004, shaft * 2 + 0.004, 0, 0.04 + k * (fy - 0.04) / lifts, 0), 'frame');
    for (const y of [0.45, 0.8]) if (y < fy - 0.1) for (const sx of [-1, 1]) p.add('iron', box(0.004, 0.09, 0.03, sx * (shaft + 0.001), y, 0), 'frame');
    // the floor of the cab sits on a corbelled slab
    p.add('concrete', box(cabW + 0.04, 0.03, cabW + 0.04, 0, fy - 0.03, 0), 'deck');
    if (!opts.ring) {
      // enclosed steel cab: plate walls with a band of firing slits, posts at the corners, a slab roof with a parapet
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('steel', box(0.03, cabH, 0.03, sx * (hc - 0.015), fy, sz * (hc - 0.015)), 'rafters');
      for (const [w, d, x, z] of [[cabW, 0.016, 0, -hc + 0.008], [0.016, cabW, -hc + 0.008, 0], [0.016, cabW, hc - 0.008, 0], [cabW, 0.016, 0, hc - 0.008]] as const) {
        p.add('steel', box(w, 0.09, d, x, fy, z), 'walls');                          // the sill plate
        p.add('steel', box(w, 0.1, d, x, fy + cabH - 0.1, z), 'walls');               // the header plate
        // slit glazing, dark, in the band between
        p.add('glass', box(w - 0.06, 0.1, d * 0.5, x, fy + 0.09, z), 'openings');
      }
      p.add('concrete', box(cabW + 0.08, 0.035, cabW + 0.08, 0, fy + cabH, 0), 'roof');
      p.add('concrete', box(cabW + 0.08, 0.035, 0.016, 0, fy + cabH + 0.035, hc + 0.04 - 0.008), 'roof');
      p.add('concrete', box(cabW + 0.08, 0.035, 0.016, 0, fy + cabH + 0.035, -hc - 0.04 + 0.008), 'roof');
      p.add('steel', box(0.1, 0.03, 0.1, hc * 0.5, fy + cabH + 0.035, -hc * 0.4), 'roof');      // roof vent
    } else {
      // armored lower cab (the ammunition locker) under an open roof platform with a parapet of concrete and sandbags
      for (const [w, d, x, z] of [[cabW, 0.02, 0, -hc + 0.01], [0.02, cabW, -hc + 0.01, 0], [0.02, cabW, hc - 0.01, 0], [cabW, 0.02, 0, hc - 0.01]] as const) p.add('steel', box(w, cabH, d, x, fy, z), 'walls');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('steel', box(0.034, cabH + 0.02, 0.034, sx * (hc - 0.017), fy, sz * (hc - 0.017)), 'rafters');
      const py = fy + cabH;                                                         // the platform deck: where the gun crew stands
      p.add('concrete', box(cabW + 0.06, 0.035, cabW + 0.06, 0, py, 0), 'roof');
      const e = hc + 0.02;
      for (const [w, d, x, z] of [[cabW + 0.06, 0.03, 0, -e], [0.03, cabW + 0.06, -e, 0], [0.03, cabW + 0.06, e, 0], [cabW + 0.06, 0.03, 0, e]] as const) p.add('concrete', box(w, 0.1, d, x, py + 0.035, z), 'roof');
      sandbags(p, -e, -e, e, -e, py + 0.135, 1);
      sandbags(p, -e, -e, -e, e, py + 0.135, 1);
      sandbags(p, e, -e, e, e, py + 0.135, 1);
      // the hatch the crew come up through, and an ammunition crate stack
      p.add('iron', box(0.12, 0.012, 0.12, hc - 0.14, py + 0.035, hc - 0.12), 'openings');
      p.add('paint_green', box(0.07, 0.04, 0.05, -hc + 0.08, py + 0.035, -hc + 0.08), 'openings');
      p.add('paint_green', box(0.07, 0.04, 0.05, -hc + 0.08, py + 0.075, -hc + 0.08), 'openings');
      // the ring mount: a pedestal, a ring, the gun with its shield, feed tray and can
      const gx = opts.turret ? -0.1 : 0, gz = 0.0, gy = py + 0.035;
      p.add('iron', cyl(0.012, 0.1, gx, gy, gz, 8), 'openings');
      p.add('steel', new THREE.TorusGeometry(0.075, 0.006, 5, 18).rotateX(Math.PI / 2).translate(gx, gy + 0.1, gz), 'openings');
      p.add('iron', box(0.03, 0.03, 0.16, gx, gy + 0.1, gz + 0.04), 'openings');                                  // receiver
      p.add('steel', cyl(0.006, 0.22, gx, gy + 0.115, gz, 6).rotateX(Math.PI / 2).translate(0, 0, 0.14), 'openings'); // barrel
      p.add('steel', cyl(0.011, 0.04, gx, gy + 0.115, gz + 0.25, 6).rotateX(Math.PI / 2), 'openings');             // flash hider
      p.add('steel', box(0.11, 0.1, 0.01, gx, gy + 0.1, gz + 0.1), 'openings');                                  // gun shield
      p.add('paint_green', box(0.04, 0.035, 0.05, gx + 0.045, gy + 0.09, gz + 0.02), 'openings');                 // ammunition can
      p.add('steel', box(0.008, 0.03, 0.03, gx + 0.026, gy + 0.115, gz + 0.03), 'openings');                      // belt
      if (opts.turret) {
        // the remote turret on its own plinth: a gyro housing, a twin-barrel cradle, optics; a camera mast with two domes
        const tx = 0.12, ty = py + 0.035;
        p.add('concrete', box(0.12, 0.03, 0.12, tx, ty, 0), 'openings');
        p.add('steel', new THREE.SphereGeometry(0.052, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(tx, ty + 0.03, 0), 'openings');
        p.add('iron', box(0.07, 0.04, 0.07, tx, ty + 0.06, 0), 'openings');
        p.add('steel', cyl(0.005, 0.18, tx - 0.014, ty + 0.085, 0, 6).rotateX(Math.PI / 2).translate(0, 0, 0.12), 'openings');
        p.add('steel', cyl(0.005, 0.18, tx + 0.014, ty + 0.085, 0, 6).rotateX(Math.PI / 2).translate(0, 0, 0.12), 'openings');
        p.add('glass', new THREE.SphereGeometry(0.014, 8, 6).translate(tx, ty + 0.11, 0.035), 'openings');
        p.add('iron', cyl(0.007, 0.17, tx + 0.04, py + 0.035, -hc + 0.05, 6), 'openings');
        for (const dx of [-0.018, 0.018]) { p.add('iron', new THREE.SphereGeometry(0.015, 8, 6).translate(tx + 0.04 + dx, py + 0.215, -hc + 0.05), 'openings'); p.add('glass', new THREE.SphereGeometry(0.008, 6, 5).translate(tx + 0.04 + dx, py + 0.215, -hc + 0.064), 'openings'); }
      }
    }
    // the light mast (tier 4 up): a pole at the back corner with two flood heads, and a pair of heads at the front corners of the cab
    if (opts.mast) {
      const roofY = opts.ring ? fy + cabH + 0.035 : fy + cabH + 0.035;
      const mx = -hc + 0.03, mz = -hc + 0.03, top = roofY + (opts.ring ? 0.3 : 0.27);
      p.add('steel', cyl(0.007, top - roofY, mx, roofY, mz, 6), 'openings');
      lamp(p, mx + 0.0, top - 0.03, mz + 0.03, 0);
      lamp(p, mx + 0.1, top - 0.08, mz + 0.03, 0.2);
      lamp(p, hc - 0.02, fy + cabH - 0.02, hc + 0.0, 0.5);
      lamp(p, -hc + 0.02, fy + cabH - 0.02, hc + 0.0, -0.5);
    }
    // the caged ladder on the +z face up to the cab hatch, and a steel door at its foot
    ladder(p, 0, shaft + 0.03, fy - 0.02, 'steel', true);
    p.add('iron', box(0.085, 0.16, 0.012, -0.08, 0.04, shaft + 0.006), 'openings');
    p.collide({ x0: -0.25, z0: -0.25, x1: 0.25, z1: 0.25 });
    const g = p.finish();
    g.userData.keep = ['frame', 'rafters'];
    g.userData.chimneyTop = null;
    return g;
  };
}

export const TOWER_BUILDERS: Record<string, (def: KitPieceDef, seed?: number) => THREE.Group> = {
  rise_lookout: riseLookout,
  watchtower_wood: woodTower,
  watchtower_concrete: concreteTower({ floorY: 1.22, mast: false, ring: false, turret: false }),
  watchtower_flood: concreteTower({ floorY: 1.27, mast: true, ring: false, turret: false }),
  watchtower_mount: concreteTower({ floorY: 1.0, mast: true, ring: true, turret: false }),
  watchtower_turret: concreteTower({ floorY: 1.05, mast: true, ring: true, turret: true }),
};
