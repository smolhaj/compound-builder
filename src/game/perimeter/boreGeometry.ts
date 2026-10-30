/**
 * The rock tunnel (sim/perimeter 'rock_tunnel', sim/terrain.ts `BORE`): a vehicle bore driven through a rock face or spur. Most of it is under the hill and is not
 * drawn; what the eye sees is
 *   - two stone portals (a face of fieldstone with the arch cut from it, a ring of voussoirs, wing walls stepping back along the cut, a steel blast door in the
 *     arch, a lamp, a hazard band),
 *   - where the hill does not yet close over the crown (the ends may lie in an earth-sheltered cutting), a mound of earth banked over the tube with its sides
 *     sloped down to the ground, so the lining is never seen standing out of the ground,
 *   - the dark inside of the arch and its road, seen through the open portals.
 * Pure geometry: returns world-space parts keyed by kit material, plus the dark tube, for `buildRun` to merge. The deck runs straight from the ground at one
 * end to the ground at the other (the grade the sim priced), the arch 4.4 m wide with its crown 4.8 m over the deck.
 */
import * as THREE from 'three';
import type { KitMaterialId } from '../buildkit/materials';
import { BORE } from '../../sim/terrain';
import type { Pt } from '../../sim/perimeter';

type Ground = (x: number, z: number) => number;

/** The arch inside: half width, the height of its straight walls and its crown (units: 4.4 m wide, 4.8 m high). */
export const ARCH = { hw: 0.366, wall: BORE.CROWN - 0.366, crown: BORE.CROWN } as const;
/** Earth banked over the crown where the hill has not closed over it (1.8 m), the half width of the mound's top, and its side slope (horizontal per vertical). */
export const MOUND = { over: 0.3, halfTop: 0.62, slope: 1.5 } as const;

export interface BoreParts {
  parts: Array<[KitMaterialId, THREE.BufferGeometry]>;
  /** The dark inside of the arch (seen from inside: give it a BackSide material), or null before it is built. */
  tube: THREE.BufferGeometry | null;
}

/** The arch's outline in a frame whose x is across, y is up: floor edge, straight wall, round crown, straight wall, floor edge. */
function archShape(scale = 1): THREE.Shape {
  const hw = ARCH.hw * scale, wall = ARCH.wall;
  const s = new THREE.Shape();
  s.moveTo(-hw, 0); s.lineTo(-hw, wall);
  s.absarc(0, wall, hw, Math.PI, 0, true);
  s.lineTo(hw, 0); s.lineTo(-hw, 0);
  return s;
}
function archHole(): THREE.Path {
  const hw = ARCH.hw, p = new THREE.Path();
  p.moveTo(-hw, 0); p.lineTo(-hw, ARCH.wall);
  p.absarc(0, ARCH.wall, hw, Math.PI, 0, true);
  p.lineTo(hw, 0); p.lineTo(-hw, 0);
  return p;
}

/** A frame at point (x, y, z): z along `fwd` (a unit vector, may rise), x across (to its right), y up: so a shape's x is across and its extrusion runs forward. */
function frame(x: number, y: number, z: number, fwd: THREE.Vector3): THREE.Matrix4 {
  const ez = fwd.clone().normalize();
  const ex = new THREE.Vector3(ez.z, 0, -ez.x).normalize();
  const ey = new THREE.Vector3().crossVectors(ez, ex).normalize();
  return new THREE.Matrix4().makeBasis(ex, ey, ez).setPosition(x, y, z);
}

/**
 * `built`: how much of the tunnel is built, 0 to 1 (a portal stands from 5 %, the second, the mound and the tube when it is finished).
 * `lit`: the lamps are on. `pts`: the run (its first and last points are the two portals).
 */
export function boreParts(pts: readonly Pt[], ground: Ground, built: number, finished: boolean, lit: boolean): BoreParts {
  const out: BoreParts = { parts: [], tube: null };
  if (pts.length < 2 || built <= 0.05) return out;
  const add = (m: KitMaterialId, g: THREE.BufferGeometry) => out.parts.push([m, g]);
  const a = pts[0], b = pts[pts.length - 1];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 1e-6) return out;
  const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L, ya = ground(a[0], a[1]), yb = ground(b[0], b[1]);
  const deckAt = (s: number) => ya + (yb - ya) * (s / L);
  const at = (s: number): Pt => [a[0] + dx * s, a[1] + dz * s];

  // the dark inside, straight along the sloping axis (hidden under the hill; seen through the portals)
  if (finished) {
    const g = new THREE.ExtrudeGeometry(archShape(), { depth: L, bevelEnabled: false, curveSegments: 10 });
    g.applyMatrix4(frame(a[0], ya, a[1], new THREE.Vector3(dx * L, yb - ya, dz * L)));
    out.tube = g;
    // the road in it
    const floor = new THREE.BoxGeometry(ARCH.hw * 1.8, 0.012, L).translate(0, 0.008, L / 2);
    floor.applyMatrix4(frame(a[0], ya, a[1], new THREE.Vector3(dx * L, yb - ya, dz * L)));
    add('wet_concrete', floor);
  }

  // earth banked over the tube where the hill has not closed over it: a mound with its sides sloped down to the ground
  if (finished) {
    const N = Math.max(2, Math.ceil(L / 0.5)), top = (s: number) => deckAt(s) + ARCH.crown + MOUND.over;
    const rows: Array<{ l: THREE.Vector3; lt: THREE.Vector3; rt: THREE.Vector3; r: THREE.Vector3 } | null> = [];
    for (let i = 0; i <= N; i++) {
      const s = L * i / N, [x, z] = at(s), t = top(s), nx = dz, nz = -dx;
      if (ground(x, z) >= t - 0.02 && ground(x + nx * MOUND.halfTop, z + nz * MOUND.halfTop) >= t - 0.02 && ground(x - nx * MOUND.halfTop, z - nz * MOUND.halfTop) >= t - 0.02) { rows.push(null); continue; }
      // where each side slope meets the ground (a few passes: the ground there is not the ground at the centre)
      const foot = (sg: number): { f: number; y: number } => {
        let f = MOUND.halfTop + MOUND.slope * Math.max(0, t - ground(x + sg * nx * MOUND.halfTop, z + sg * nz * MOUND.halfTop));
        for (let k = 0; k < 3; k++) f = MOUND.halfTop + MOUND.slope * Math.max(0, t - ground(x + sg * nx * f, z + sg * nz * f));
        return { f, y: ground(x + sg * nx * f, z + sg * nz * f) - 0.04 };
      };
      const fl = foot(-1), fr = foot(1);
      rows.push({
        l: new THREE.Vector3(x - nx * fl.f, fl.y, z - nz * fl.f), lt: new THREE.Vector3(x - nx * MOUND.halfTop, t, z - nz * MOUND.halfTop),
        rt: new THREE.Vector3(x + nx * MOUND.halfTop, t, z + nz * MOUND.halfTop), r: new THREE.Vector3(x + nx * fr.f, fr.y, z + nz * fr.f),
      });
    }
    const pos: number[] = [];
    const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) => pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
    for (let i = 0; i < N; i++) {
      const p = rows[i], q = rows[i + 1];
      if (!p || !q) continue;
      tri(p.l, q.l, q.lt); tri(p.l, q.lt, p.lt);       // left slope
      tri(p.lt, q.lt, q.rt); tri(p.lt, q.rt, p.rt);    // top
      tri(p.rt, q.rt, q.r); tri(p.rt, q.r, p.r);       // right slope
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      add('earth', g);
    }
  }

  // a portal at one end: its face outward, the arch, the voussoirs, wing walls, the door and the lamp. `into` points into the hill.
  const portal = (s: number, into: 1 | -1, withDoor: boolean) => {
    const [x, z] = at(s), y = deckAt(s), fx = dx * into, fz = dz * into;
    const fwd = new THREE.Vector3(fx, 0, fz), m = frame(x, y, z, fwd);
    const place = (g: THREE.BufferGeometry, ox = 0, oy = 0, oz = 0) => { g.translate(ox, oy, oz); g.applyMatrix4(m); return g; };
    // the face: a block of fieldstone with the arch cut out, extruded 0.3 into the hill
    const PW = 2 * (MOUND.halfTop + 0.18), PH = ARCH.crown + 0.5;
    const shape = new THREE.Shape();
    shape.moveTo(-PW / 2, -0.5); shape.lineTo(PW / 2, -0.5); shape.lineTo(PW / 2, PH); shape.lineTo(-PW / 2, PH); shape.lineTo(-PW / 2, -0.5);
    shape.holes.push(archHole());
    add('fieldstone', place(new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false, curveSegments: 10 })));
    // a concrete cap over it
    add('concrete', place(new THREE.BoxGeometry(PW + 0.08, 0.05, 0.38), 0, PH + 0.025, 0.15));
    // voussoirs: rough stones round the arch, proud of the face
    for (let k = 0; k <= 12; k++) {
      const t = Math.PI * k / 12, lat = Math.cos(t) * (ARCH.hw + 0.05), up = ARCH.wall + Math.sin(t) * (ARCH.hw + 0.05);
      add('fieldstone', place(new THREE.BoxGeometry(0.09, 0.1, 0.08).rotateZ(t - Math.PI / 2), lat, up, -0.03 - ((k * 37) % 5) * 0.004));
    }
    // wing walls stepping back along the cut, lower as they go, splayed outward
    for (const sg of [-1, 1]) for (let k = 1; k <= 3; k++) {
      const h = 1.05 - 0.28 * k, lat = PW / 2 + 0.18 * k, back = 0.1 + 0.3 * k;
      add('fieldstone', place(new THREE.BoxGeometry(0.14, h, 0.46).rotateY(sg * 0.5), sg * lat, h / 2 - 0.05, back));
    }
    if (withDoor) {
      // the steel blast door in the arch, set back, with its hazard band and seam, a lamp over it
      add('steel', place(new THREE.ExtrudeGeometry(archShape(0.97), { depth: 0.05, bevelEnabled: false, curveSegments: 8 }), 0, 0.005, 0.2));
      add('paint_yellow', place(new THREE.BoxGeometry(ARCH.hw * 1.9, 0.05, 0.02), 0, 0.28, 0.18));
      add('iron', place(new THREE.BoxGeometry(0.012, ARCH.crown * 0.92, 0.02), 0, ARCH.crown * 0.46, 0.18));
      add(lit ? 'bulb' : 'enamel', place(new THREE.SphereGeometry(0.035, 8, 6), 0, ARCH.crown + 0.14, -0.05));
    }
  };
  portal(0, 1, true);
  if (finished) portal(L, -1, true);
  return out;
}
