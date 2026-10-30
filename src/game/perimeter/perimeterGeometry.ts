/**
 * Perimeter geometry: each run drawn along its polyline, on the ground,
 * built up to its progress (hedges sized by growth), with gates. Berms and
 * ditches are earthworks in the terrain itself (ParcelTerrain.setEarthworks);
 * here they get only their gate posts. Sizes follow scale.test.ts (1 m = 1/6).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial, type KitMaterialId } from '../buildkit/materials';
import { worldUV } from '../buildkit/shell';
import { DECK_W, walkwayAccess } from '../../sim/walkway';
import { insideRing } from '../../sim/compounds';
import { boreParts } from './boreGeometry';
import { PERIMETER, RAZOR, footingOf, hasSkirt, runGrowth, runProgress, wallLength, type PerimeterKind, type PerimeterRun, type Pt } from '../../sim/perimeter';

const M = 1 / 6;
/** The dark inside of a bore: one shared material (never disposed with a run's geometry). */
let _boreDark: THREE.MeshStandardMaterial | null = null;
const boreDark = (): THREE.MeshStandardMaterial => (_boreDark ??= new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 1, side: THREE.BackSide }));
type Ground = (x: number, z: number) => number;

/** Point and unit direction at distance s along a polyline. */
export function along(pts: readonly Pt[], s: number): { x: number; z: number; dx: number; dz: number } {
  let left = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const l = Math.hypot(bx - ax, bz - az);
    if (left <= l || i === pts.length - 1) {
      const t = l > 0 ? Math.min(1, left / l) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: l ? (bx - ax) / l : 1, dz: l ? (bz - az) / l : 0 };
    }
    left -= l;
  }
  return { x: pts[0][0], z: pts[0][1], dx: 1, dz: 0 };
}

/**
 * Solid intervals of a run (gates removed), cut off at `built` wall length.
 * Pure (tested).
 */
export function solidSpans(run: Pick<PerimeterRun, 'pts' | 'gates'>, built: number): Array<[number, number]> {
  let L = 0;
  for (let i = 1; i < run.pts.length; i++) L += Math.hypot(run.pts[i][0] - run.pts[i - 1][0], run.pts[i][1] - run.pts[i - 1][1]);
  const gaps = run.gates.map(g => [g.at - g.w / 2, g.at + g.w / 2] as const).sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let s = 0, left = built;
  for (const [g0, g1] of [...gaps, [L, L] as const]) {
    const e = Math.min(g0, L);
    if (e > s && left > 1e-6) { const take = Math.min(e - s, left); out.push([s, s + take]); left -= take; }
    s = Math.max(s, g1);
  }
  return out;
}

/** How far an upgrade run is drawn to the right of the run it replaces, so the old tier stays visible while the new one rises (world units). */
export const UPGRADE_OFFSET = 0.12;

/**
 * The run's line moved `d` to its right (right of the direction of travel, x east / z south):
 * each vertex shifts along the mean of its neighbouring segments' normals. Pure (tested).
 */
export function offsetPts(pts: readonly Pt[], d: number): Pt[] {
  const seg = (i: number): [number, number] => {
    const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dz) || 1;
    return [-dz / l, dx / l];
  };
  return pts.map((p, i): Pt => {
    const a = i > 0 ? seg(i - 1) : null, b = i < pts.length - 1 ? seg(i) : null;
    let nx = (a?.[0] ?? 0) + (b?.[0] ?? 0), nz = (a?.[1] ?? 0) + (b?.[1] ?? 0);
    const l = Math.hypot(nx, nz) || 1;
    nx /= l; nz /= l;
    // at a corner the mean normal is shorter than 1: stretch it so the offset line stays d from both segments
    const cos = a && b ? a[0] * b[0] + a[1] * b[1] : 1;
    const k = d / Math.max(0.5, Math.sqrt((1 + cos) / 2));
    return [p[0] + nx * k, p[1] + nz * k];
  });
}

/** Geometry of one run (merged per material), in world coordinates. */
/**
 * `under` says whether a point is under a building: pipe and cable trenches
 * stop at its wall and their marker posts stand outside it.
 */
export function buildRun(run0: PerimeterRun, ground: Ground, t: number, under: (x: number, z: number) => boolean = () => false, opts: { lit?: boolean; sensors?: boolean; hostKind?: PerimeterKind; /** The host wall carries razor wire (drawn on the deck's outer rail). */ hostRazor?: boolean; /** A patrol deck rides on this wall (its wire is drawn on the deck). */ deck?: boolean } = {}): THREE.Group {
  const lit = opts.lit ?? true;
  // an upgrade of a finished run is drawn beside the old tier (not on top of it) until it is done and the old one comes down
  const run = run0.replaces ? { ...run0, pts: offsetPts(run0.pts, (run0.replacesKind === 'container_wall' || run0.replacesKind === 'container_stack') ? 0.36 : UPGRADE_OFFSET) } : run0;
  const bits = new Map<KitMaterialId, THREE.BufferGeometry[]>();
  /** Geometry drawn with its own material (the dark inside of a bore, seen from inside). */
  const tubes: THREE.BufferGeometry[] = [];
  const add = (m: KitMaterialId, g: THREE.BufferGeometry) => { let l = bits.get(m); if (!l) bits.set(m, l = []); l.push(worldUV(g)); };
  const def = PERIMETER[run.kind];
  const wl = wallLength(run);
  const built = run.finishedAt !== null ? wl : wl * runProgress(run);
  const spans = solidSpans(run, built);
  const growth = runGrowth(run, t);
  /** A box from a to b (center line) at height y0..y0+h, thickness th. */
  const beam = (ax: number, az: number, bx: number, bz: number, y0: number, h: number, th: number, m: KitMaterialId, sag = 0) => {
    const l = Math.hypot(bx - ax, bz - az);
    if (l < 1e-4) return;
    const ya = ground(ax, az), yb = ground(bx, bz);
    const g = new THREE.BoxGeometry(l, h, th).translate(0, h / 2, 0);
    g.rotateZ(Math.atan2(yb - ya, l)).rotateY(-Math.atan2(bz - az, bx - ax)).translate((ax + bx) / 2, (ya + yb) / 2 + y0 - sag, (az + bz) / 2);
    add(m, g);
  };
  /**
   * `beam` for a low earthwork laid on lumpy ground (a drain's bed and lips): the box is sunk into the ground wherever the terrain
   * bulges or sags between its ends, so a piece never floats over a hollow nor pokes out of a rise as a loose strip.
   */
  const beamFit = (ax: number, az: number, bx: number, bz: number, y0: number, h: number, th: number, m: KitMaterialId) => {
    const l = Math.hypot(bx - ax, bz - az);
    if (l < 1e-4) return;
    const ya = ground(ax, az), yb = ground(bx, bz), mean = (ya + yb) / 2;
    let low = mean, high = mean;
    for (const f of [0.25, 0.5, 0.75]) for (const sd of [-0.5, 0, 0.5]) {
      const x = ax + (bx - ax) * f + (az - bz) / l * th * sd, z = az + (bz - az) * f + (bx - ax) / l * th * sd, y = ground(x, z), ly = ya + (yb - ya) * f;
      low = Math.min(low, mean + (y - ly)); high = Math.max(high, mean + (y - ly));
    }
    const sink = 0.03 + (mean - low), rise = Math.max(0, high - mean);
    const hh = h + sink + rise * 0.5;
    const g = new THREE.BoxGeometry(l, hh, th).translate(0, hh / 2, 0);
    g.rotateZ(Math.atan2(yb - ya, l)).rotateY(-Math.atan2(bz - az, bx - ax)).translate((ax + bx) / 2, mean + y0 - sink, (az + bz) / 2);
    add(m, g);
  };
  const post = (x: number, z: number, h: number, r: number, m: KitMaterialId, round = false) => {
    const y = ground(x, z) - 0.02;
    add(m, round ? new THREE.CylinderGeometry(r, r * 1.1, h + 0.02, 7).translate(x, y + (h + 0.02) / 2, z) : new THREE.BoxGeometry(r * 2, h + 0.02, r * 2).translate(x, y + (h + 0.02) / 2, z));
  };
  /** Bays along the spans at a spacing: f(a, b) for each bay, posts at both ends. */
  const bays = (spacing: number, f: (a: ReturnType<typeof along>, b: ReturnType<typeof along>, i: number) => void) => {
    for (const [s0, s1] of spans) {
      const n = Math.max(1, Math.round((s1 - s0) / spacing));
      for (let i = 0; i < n; i++) f(along(run.pts, s0 + (s1 - s0) * i / n), along(run.pts, s0 + (s1 - s0) * (i + 1) / n), i);
    }
  };
  const spanEnds = () => spans.flatMap(([a, b]) => [along(run.pts, a), along(run.pts, b)]);

  switch (run.kind) {
    case 'split_rail':
      bays(2.4 * M, (a, b) => {
        post(a.x, a.z, 1.2 * M, 0.06 * M, 'wood_mid');
        for (const y of [0.35, 0.7, 1.05]) beam(a.x, a.z, b.x, b.z, y * M, 0.1 * M, 0.08 * M, 'wood_mid');
      });
      for (const e of spanEnds()) post(e.x, e.z, 1.2 * M, 0.06 * M, 'wood_mid');
      break;
    case 'barbed_wire':
      bays(3 * M, (a, b, i) => {
        post(a.x, a.z, 1.3 * M, i % 4 === 0 ? 0.07 * M : 0.025 * M, i % 4 === 0 ? 'wood_dark' : 'paint_green', i % 4 === 0);
        for (const y of [0.35, 0.65, 0.95, 1.22]) beam(a.x, a.z, b.x, b.z, y * M, 0.012 * M, 0.012 * M, 'iron', 0.02 * M);
      });
      for (const e of spanEnds()) post(e.x, e.z, 1.35 * M, 0.08 * M, 'wood_dark', true);
      break;
    case 'woven_wire':
      bays(3.6 * M, (a, b) => {
        post(a.x, a.z, 2.45 * M, 0.08 * M, 'wood_dark', true);
        beam(a.x, a.z, b.x, b.z, 0.05 * M, 2.3 * M, 0.01 * M, 'wire_mesh');
        beam(a.x, a.z, b.x, b.z, 2.32 * M, 0.02 * M, 0.02 * M, 'iron');
      });
      for (const e of spanEnds()) post(e.x, e.z, 2.45 * M, 0.09 * M, 'wood_dark', true);
      break;
    case 'creek_bars': {
      // vertical steel bars in the bed, 15 cm clear apart (water, fish and drift pass), tied by a top rail and a low rail, a post every 2.4 m
      const H = def.height, sp = 0.18 * M;
      for (const [s0, s1] of spans) for (let s = s0; s <= s1 + 1e-6; s += sp) {
        const p = along(run.pts, s), y = ground(p.x, p.z) - 0.08;
        add('iron', new THREE.CylinderGeometry(0.025 * M, 0.025 * M, H + 0.08, 5).translate(p.x, y + (H + 0.08) / 2, p.z));
      }
      bays(2.4 * M, (a, b) => {
        post(a.x, a.z, H + 0.03, 0.05 * M, 'iron');
        beam(a.x, a.z, b.x, b.z, H - 0.02, 0.05 * M, 0.05 * M, 'iron');
        beam(a.x, a.z, b.x, b.z, 0.35 * M, 0.04 * M, 0.04 * M, 'iron');
      });
      for (const e of spanEnds()) post(e.x, e.z, H + 0.03, 0.06 * M, 'iron');
      break;
    }
    case 'chain_link':
      // 1.8 m galvanized mesh on round steel posts, top rail and a tension wire at the foot
      bays(3 * M, (a, b) => {
        post(a.x, a.z, 1.9 * M, 0.04 * M, 'steel', true);
        beam(a.x, a.z, b.x, b.z, 0.08 * M, 1.75 * M, 0.008 * M, 'wire_mesh');
        beam(a.x, a.z, b.x, b.z, 1.82 * M, 0.04 * M, 0.04 * M, 'steel');
        beam(a.x, a.z, b.x, b.z, 0.06 * M, 0.02 * M, 0.02 * M, 'steel');
      });
      for (const e of spanEnds()) post(e.x, e.z, 1.95 * M, 0.06 * M, 'steel', true);
      break;
    case 'wrought_iron':
    case 'iron_barbed': {
      // forged pickets with spear points between stone-capped posts, on a low stone footing; the barbed version adds outward-leaning arms and three strands
      const H = 2.0 * M;
      bays(2.4 * M, (a, b) => {
        post(a.x, a.z, H + 0.15 * M, 0.07 * M, 'iron');
        add('fieldstone', new THREE.BoxGeometry(0.2 * M, 0.2 * M, 0.2 * M).translate(a.x, ground(a.x, a.z) + 0.07 * M, a.z));
        beam(a.x, a.z, b.x, b.z, 0.15 * M, 0.2 * M, 0.1 * M, 'fieldstone');
        beam(a.x, a.z, b.x, b.z, 0.3 * M, 0.04 * M, 0.04 * M, 'iron');
        beam(a.x, a.z, b.x, b.z, H - 0.12 * M, 0.04 * M, 0.04 * M, 'iron');
        const l = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(2, Math.round(l / (0.12 * M)));
        for (let k = 1; k < n; k++) {
          const f = k / n, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, y = ground(x, z);
          add('iron', new THREE.CylinderGeometry(0.012 * M, 0.012 * M, H - 0.25 * M, 4).translate(x, y + 0.3 * M + (H - 0.25 * M) / 2, z));
          add('iron', new THREE.ConeGeometry(0.025 * M, 0.12 * M, 4).translate(x, y + H - 0.01 * M, z));
        }
        if (run.kind === 'iron_barbed') {
          const ox = a.dz * 0.18 * M, oz = -a.dx * 0.18 * M;    // outward (right of the run)
          for (const y of [0.18, 0.33, 0.48]) beam(a.x + ox, a.z + oz, b.x + ox, b.z + oz, H + y * M, 0.012 * M, 0.012 * M, 'iron', 0.02 * M);
          add('iron', new THREE.BoxGeometry(0.2 * M, 0.04 * M, 0.04 * M).rotateY(-Math.atan2(a.dz, a.dx) + Math.PI / 2).translate(a.x + ox * 0.5, ground(a.x, a.z) + H + 0.1 * M, a.z + oz * 0.5));
        }
      });
      for (const e of spanEnds()) post(e.x, e.z, H + 0.2 * M, 0.09 * M, 'iron');
      break;
    }
    case 'bar_fence': {
      // plain black bars between top and bottom rails, round-capped posts every 2.4 m, a low concrete curb: no spear points, nothing to catch a coat
      const H = 2.4 * M;
      bays(2.4 * M, (a, b) => {
        post(a.x, a.z, H + 0.05 * M, 0.06 * M, 'iron');
        add('iron', new THREE.SphereGeometry(0.075 * M, 8, 5).translate(a.x, ground(a.x, a.z) + H + 0.08 * M, a.z));
        beam(a.x, a.z, b.x, b.z, 0, 0.22 * M, 0.2 * M, 'concrete');
        beam(a.x, a.z, b.x, b.z, 0.3 * M, 0.05 * M, 0.05 * M, 'iron');
        beam(a.x, a.z, b.x, b.z, H - 0.14 * M, 0.06 * M, 0.05 * M, 'iron');
        const l = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(2, Math.round(l / (0.11 * M)));
        for (let k = 1; k < n; k++) {
          const f = k / n, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, y = ground(x, z);
          add('iron', new THREE.CylinderGeometry(0.011 * M, 0.011 * M, H - 0.22 * M, 4).translate(x, y + 0.22 * M + (H - 0.22 * M) / 2, z));
        }
      });
      for (const e of spanEnds()) post(e.x, e.z, H + 0.1 * M, 0.08 * M, 'iron');
      break;
    }
    case 'steel_wall':
    case 'electric_steel': {
      // 2.8 m steel plate panels bolted to concrete posts on a poured footing; razor wire (and, electrified, an energized wire on stand-offs with warning signs)
      const H = 2.8 * M;
      bays(3 * M, (a, b, i) => {
        post(a.x, a.z, H + 0.1 * M, 0.09 * M, 'concrete');
        beam(a.x, a.z, b.x, b.z, -0.05 * M, 0.35 * M, 0.2 * M, 'concrete');
        beam(a.x, a.z, b.x, b.z, 0.25 * M, H - 0.25 * M, 0.04 * M, 'steel');
        beam(a.x, a.z, b.x, b.z, H - 0.02 * M, 0.04 * M, 0.06 * M, 'iron');
        const l = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(2, Math.round(l / (0.2 * M)));
        for (let k = 0; k < n; k++) {   // razor-wire coils along the top
          const f = (k + 0.5) / n, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
          add('steel', new THREE.TorusGeometry(0.12 * M, 0.012 * M, 4, 10).rotateY(-Math.atan2(b.z - a.z, b.x - a.x)).translate(x, ground(x, z) + H + 0.14 * M, z));
        }
        if (run.kind === 'electric_steel') {
          for (const y of [0.3, 0.6]) beam(a.x, a.z, b.x, b.z, H + y * M, 0.012 * M, 0.012 * M, 'copper');
          add('paint_yellow', new THREE.BoxGeometry(0.02 * M, 0.3 * M, 0.3 * M).translate(a.x, ground(a.x, a.z) + 1.5 * M, a.z));   // a warning sign on every post
          post(a.x, a.z, H + 0.7 * M, 0.02 * M, 'iron');
        }
        void i;
      });
      for (const e of spanEnds()) post(e.x, e.z, H + 0.15 * M, 0.11 * M, 'concrete');
      break;
    }
    case 'covered_walkway': {
      // an enclosed steel walkway on trusses between two yards (SCALE v2: 2 m inside width, 2.6 m to the roof): portal frames every 3 m, X-bracing,
      // mesh below and glass above, a handrail inside, a roof with a ridge cap, pendant lights (lit only with power)
      const W = 2.0 * M, H = 2.6 * M, FL = 0.5 * M, hw = W / 2 + 0.06 * M;
      const floorY = FL;
      bays(3 * M, (a, b, i) => {
        const nx = -a.dz, nz = a.dx;                                     // lateral (left of the run)
        const side = (u: number, p: typeof a) => ({ x: p.x + nx * u, z: p.z + nz * u });
        for (const u of [-hw, hw]) {
          const A = side(u, a), B = side(u, b);
          post(A.x, A.z, H + FL, 0.05 * M, 'steel');                                 // square steel column on its pier
          add('concrete', new THREE.BoxGeometry(0.28 * M, FL * 0.6, 0.28 * M).translate(A.x, ground(A.x, A.z) + FL * 0.3 - 0.01, A.z));
          beam(A.x, A.z, B.x, B.z, floorY - 0.1 * M, 0.1 * M, 0.09 * M, 'steel');    // floor chord
          beam(A.x, A.z, B.x, B.z, floorY + H - 0.09 * M, 0.09 * M, 0.09 * M, 'steel');   // top chord
          // X-bracing in the side panel
          const l = Math.hypot(B.x - A.x, B.z - A.z), ang = Math.atan2(H - 0.35 * M, l);
          for (const sgn of [1, -1]) {
            const g = new THREE.BoxGeometry(Math.hypot(l, H - 0.35 * M), 0.04 * M, 0.04 * M).rotateZ(sgn * ang).translate(0, 0, 0);
            g.rotateY(-Math.atan2(B.z - A.z, B.x - A.x)).translate((A.x + B.x) / 2, ground((A.x + B.x) / 2, (A.z + B.z) / 2) + floorY + H / 2 - 0.05 * M, (A.z + B.z) / 2);
            add('steel', g);
          }
          // mesh below the handrail, glass above
          beam(A.x, A.z, B.x, B.z, floorY + 0.05 * M, 1.0 * M, 0.012 * M, 'wire_mesh');
          beam(A.x, A.z, B.x, B.z, floorY + 1.05 * M, H - 1.2 * M, 0.012 * M, 'glass');
          // handrail inside at hip height
          const inn = u > 0 ? -0.1 * M : 0.1 * M, RA = side(u + inn, a), RB = side(u + inn, b);
          beam(RA.x, RA.z, RB.x, RB.z, floorY + 0.95 * M, 0.04 * M, 0.04 * M, 'iron');
        }
        // roof: portal beam across at each frame, then a shallow gabled roof of two sheets and a ridge cap
        const L = side(-hw - 0.15 * M, a), R = side(hw + 0.15 * M, a);
        beam(L.x, L.z, R.x, R.z, floorY + H - 0.05 * M, 0.1 * M, 0.08 * M, 'steel');
        const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        for (const sgn of [-1, 1]) {
          const half = hw + 0.15 * M, rise = 0.18 * M, slope = Math.atan2(rise, half);
          const g = new THREE.BoxGeometry(Math.hypot(b.x - a.x, b.z - a.z) + 0.02 * M, 0.03 * M, Math.hypot(half, rise)).rotateX(sgn * slope).translate(0, rise / 2 + 0.03 * M, sgn * half / 2);
          g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x)).translate(mid.x, ground(mid.x, mid.z) + floorY + H, mid.z);
          add('metal_roof', g);
        }
        beam(a.x, a.z, b.x, b.z, floorY + H + 0.17 * M, 0.04 * M, 0.06 * M, 'steel');
        // floor: steel grating on the chords, a plank of deck down the middle
        beam(a.x, a.z, b.x, b.z, floorY - 0.12 * M, 0.06 * M, W, 'steel');
        beam(a.x, a.z, b.x, b.z, floorY - 0.06 * M, 0.025 * M, W * 0.8, 'deck');
        // pendant light on a cord at the middle of the bay
        add('iron', new THREE.CylinderGeometry(0.004, 0.004, 0.35 * M, 4).translate(mid.x, ground(mid.x, mid.z) + floorY + H - 0.2 * M, mid.z));
        add(lit ? 'bulb' : 'enamel', new THREE.SphereGeometry(0.075 * M, 10, 7).scale(1, 0.8, 1).translate(mid.x, ground(mid.x, mid.z) + floorY + H - 0.42 * M, mid.z));
        void i;
      });
      for (const e of spanEnds()) {   // the door frame at each end where it meets a wall: a steel portal and a threshold step
        const nx = -e.dz, nz = e.dx;
        for (const u of [-hw, hw]) post(e.x + nx * u, e.z + nz * u, H + FL + 0.05 * M, 0.07 * M, 'steel');
        beam(e.x + nx * -hw, e.z + nz * -hw, e.x + nx * hw, e.z + nz * hw, floorY + H, 0.1 * M, 0.12 * M, 'steel');
        add('concrete', new THREE.BoxGeometry(W, 0.3 * M, 0.5 * M).rotateY(-Math.atan2(e.dz, e.dx) + Math.PI / 2).translate(e.x - e.dx * 0.1 * M, ground(e.x, e.z) + 0.15 * M, e.z - e.dz * 0.1 * M));
      }
      break;
    }
    case 'concrete_wall': {
      // a 3.5 m poured wall in LEVEL panels (3 m bays, each set at the high point of its bay) on a stepped poured plinth that fills down to the ground on slopes and dips;
      // form-tie shadow lines, a pilaster at each joint, a capped top
      const H = 3.5 * M;
      bays(3 * M, (a, b) => {
        const len = Math.hypot(b.x - a.x, b.z - a.z), yaw = -Math.atan2(b.z - a.z, b.x - a.x), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        const samples = [0, 0.25, 0.5, 0.75, 1].map(f => ground(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f));
        const hi = Math.max(...samples), lo = Math.min(...samples) - 0.06;
        const box = (l: number, h: number, w: number, y0: number, m: KitMaterialId) => add(m, new THREE.BoxGeometry(l, h, w).translate(0, h / 2, 0).rotateY(yaw).translate(mx, y0, mz));
        box(len + 0.004, hi - lo + 0.03, 0.34 * M, lo, 'concrete');                 // the plinth step, from the lowest ground to the panel's base
        box(len, H, 0.3 * M, hi + 0.02, 'concrete');                                   // the level panel
        box(len + 0.01, 0.12 * M, 0.42 * M, hi + 0.02 + H - 0.02 * M, 'concrete');    // the cap
        box(len + 0.002, 0.03 * M, 0.32 * M, hi + 0.02 + H * 0.5, 'wet_concrete');    // form-tie lines
        box(len + 0.002, 0.03 * M, 0.32 * M, hi + 0.02 + H * 0.82, 'wet_concrete');
        const off = 0.17 * M;
        for (const sd of [-1, 1]) add('concrete', new THREE.BoxGeometry(0.24 * M, H, 0.12 * M).translate(0, H / 2, 0).rotateY(-Math.atan2(a.dz, a.dx)).translate(a.x - a.dz * off * sd, hi + 0.02, a.z + a.dx * off * sd));   // pilasters at the joint
      });
      for (const e of spanEnds()) post(e.x, e.z, H + 0.1 * M, 0.2 * M, 'concrete');
      break;
    }
    case 'wall_walk': {
      // a steel patrol deck on top of a container / steel / concrete wall (sim/walkway.ts): grating on stringers, a handrail with a mesh panel and kick plate each side,
      // brackets under it where the wall is thin, a lamp on every fourth post, and a steel stair up from the inside at each access point. Guards walk it (peopleGoals 'watch').
      const host = opts.hostKind ?? 'container_wall', hdef = PERIMETER[host];
      const HW = hdef.height;                                                // the wall's top above its footing, world units
      const DW = DECK_W, RH = 1.1 * M;
      const closedRing = run.pts.length > 3 && Math.hypot(run.pts[0][0] - run.pts.at(-1)![0], run.pts[0][1] - run.pts.at(-1)![1]) < 0.6;
      const p0 = along(run.pts, Math.min(0.3, wl / 2)), left0 = { x: p0.x - p0.dz * 0.3, z: p0.z + p0.dx * 0.3 };
      const inSign = closedRing ? (insideRing(run.pts, left0.x, left0.z) ? 1 : -1) : 1;
      // thick walls carry the deck on top (centered); thin ones carry it on brackets, set back inside
      const contLike = host === 'container_wall' || host === 'container_stack';
      const thick = contLike || host === 'concrete_wall' || host === 'stone_wall';
      const off = thick ? 0 : 0.5 * M + DW / 2 - 0.1 * M;
      const gx = (a: ReturnType<typeof along>, u: number) => a.x - a.dz * u * inSign, gz = (a: ReturnType<typeof along>, u: number) => a.z + a.dx * u * inSign;
      /** The top of the wall at a bay: containers and concrete panels are level at the high point of their bay, steel plate follows the ground. */
      const level = (a: ReturnType<typeof along>, b: ReturnType<typeof along>) => {
        const hi = Math.max(...[0, 0.25, 0.5, 0.75, 1].map(f => ground(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f)));
        return contLike ? hi + 0.015 + HW : host === 'concrete_wall' ? hi + 0.02 + HW + 0.12 * M : host === 'stone_wall' ? hi + 0.02 + HW + 0.2 * M : null;
      };
      const seg3 = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, th: number, m: KitMaterialId) => {
        const d = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0), l = d.length();
        if (l < 1e-5) return;
        const g = new THREE.BoxGeometry(l, th, th).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize()));
        add(m, g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
      };
      const access = walkwayAccess(run);
      const bayLen = contLike ? 12.2 * M : 3 * M;
      let lampK = 0;
      for (const [s0, s1] of spans) {
        const n = Math.max(1, Math.round((s1 - s0) / bayLen));
        for (let i = 0; i < n; i++) {
          const sa = s0 + (s1 - s0) * i / n, sb = s0 + (s1 - s0) * (i + 1) / n;
          const a = along(run.pts, sa), b = along(run.pts, sb), mid = (sa + sb) / 2;
          const lvl = level(a, b), yA = lvl ?? ground(a.x, a.z) + HW, yB = lvl ?? ground(b.x, b.z) + HW;
          const ca = { x: gx(a, off), z: gz(a, off) }, cb = { x: gx(b, off), z: gz(b, off) };
          // the deck: grating on two stringers
          const slope = Math.atan2(yB - yA, Math.hypot(cb.x - ca.x, cb.z - ca.z)), l = Math.hypot(cb.x - ca.x, cb.z - ca.z, yB - yA);
          const place = (g: THREE.BufferGeometry, u: number, y: number, m: KitMaterialId) => {
            const ox = -a.dz * u * inSign, oz = a.dx * u * inSign;
            g.rotateZ(slope).rotateY(-Math.atan2(cb.z - ca.z, cb.x - ca.x)).translate((ca.x + cb.x) / 2 + ox, (yA + yB) / 2 + y, (ca.z + cb.z) / 2 + oz);
            add(m, g);
          };
          place(new THREE.BoxGeometry(l, 0.04 * M, DW), 0, 0.02 * M, 'steel');                         // the deck plate (grating)
          place(new THREE.BoxGeometry(l, 0.06 * M, 0.06 * M), -DW / 2 + 0.05 * M, -0.05 * M, 'iron'); // stringers under it
          place(new THREE.BoxGeometry(l, 0.06 * M, 0.06 * M), DW / 2 - 0.05 * M, -0.05 * M, 'iron');
          for (const side of [-1, 1]) {
            const u = side * (DW / 2 - 0.02 * M);
            // the inner side (toward the compound) is open where a stair comes up
            const isInner = side === 1;
            const stairHere = isInner && access.some(q => Math.abs(q.at - mid) < (sb - sa) / 2 + 0.5 * M);
            place(new THREE.BoxGeometry(l, 0.18 * M, 0.02 * M), u, 0.1 * M, 'steel');                    // kick plate
            if (!stairHere) {
              place(new THREE.BoxGeometry(l, 0.03 * M, 0.03 * M), u, RH, 'iron');                         // handrail
              place(new THREE.BoxGeometry(l, 0.02 * M, 0.02 * M), u, RH * 0.55, 'iron');                  // mid rail
              if (!isInner) place(new THREE.BoxGeometry(l, RH * 0.5, 0.01 * M), u, RH * 0.25 + 0.2 * M, 'wire_mesh');   // the outer side is meshed
            }
          }
          // the host's razor wire: loose coils laid along the outer rail, outside the guards' mesh
          if (opts.hostRazor) {
            // (low-poly: an open 8-sided drum per coil every half metre, 16 triangles, not a torus every 26 cm at 72: the wall is long)
            const cl = Math.hypot(cb.x - ca.x, cb.z - ca.z), cn = Math.max(2, Math.round(cl / (0.5 * M))), th = Math.atan2(b.x - a.x, b.z - a.z), uo = off - DW / 2 - 0.02 * M;
            for (let k = 0; k < cn; k++) {
              const f = (k + 0.5) / cn, wx = a.x + (b.x - a.x) * f - a.dz * uo * inSign, wz = a.z + (b.z - a.z) * f + a.dx * uo * inSign;
              add('steel', new THREE.CylinderGeometry(0.17 * M, 0.17 * M, 0.3 * M, 8, 1, true).rotateX(Math.PI / 2).rotateY(th).translate(wx, yA + (yB - yA) * f + RH + 0.17 * M, wz));
            }
          }
          // posts at the bay end (a post every 3 m: containers get three more along their length)
          const posts = contLike ? 4 : 1;
          for (let k = 0; k <= posts; k++) {
            if (k === 0 && i > 0 && !contLike) continue;
            const f = k / posts, px = a.x + (b.x - a.x) * f, pz = a.z + (b.z - a.z) * f, py = yA + (yB - yA) * f;
            const pa = { x: px, z: pz, dx: a.dx, dz: a.dz };
            for (const side of [-1, 1]) {
              const u = off + side * (DW / 2 - 0.02 * M), sx = gx(pa, u), sz = gz(pa, u);
              add('iron', new THREE.BoxGeometry(0.03 * M, RH, 0.03 * M).translate(sx, py + RH / 2 + 0.03 * M, sz));
            }
            // a lamp on the inner rail every fourth post
            if (lampK++ % 4 === 0) {
              const sx = gx(pa, off + DW / 2), sz = gz(pa, off + DW / 2);
              add('steel', new THREE.CylinderGeometry(0.006, 0.006, 0.4 * M, 4).translate(sx, py + RH + 0.18 * M, sz));
              add(lit ? 'bulb' : 'enamel', new THREE.SphereGeometry(0.06 * M, 8, 6).scale(1, 0.7, 1).translate(sx, py + RH + 0.4 * M, sz));
            }
          }
          // brackets under a deck set back on a thin wall: a diagonal steel brace every bay
          if (!thick) {
            const bx = (a.x + b.x) / 2, bz = (a.z + b.z) / 2, by = (yA + yB) / 2;
            const wall = { x: bx, z: bz, dx: a.dx, dz: a.dz };
            seg3(gx(wall, 0.1 * M), by - 0.7 * M, gz(wall, 0.1 * M), gx(wall, off + DW / 2 - 0.1 * M), by - 0.02 * M, gz(wall, off + DW / 2 - 0.1 * M), 0.05 * M, 'steel');
            seg3(gx(wall, 0.1 * M), by - 0.03 * M, gz(wall, 0.1 * M), gx(wall, off + DW / 2), by - 0.03 * M, gz(wall, off + DW / 2), 0.05 * M, 'steel');
          }
        }
      }
      // the stairs: up from the ground on the inside to the deck, at each access point, with handrails each side
      for (const q of access) {
        if (q.at > built + 1e-6) continue;
        const qa = { x: q.x, z: q.z, dx: q.dx, dz: q.dz };
        const uIn = off + DW / 2, rise = hdef.height, steps = Math.max(8, Math.round(rise / (0.19 * M))), run1 = steps * 0.26 * M;
        const topY = (level({ ...qa, x: q.x - q.dx * 0.1, z: q.z - q.dz * 0.1 }, { ...qa, x: q.x + q.dx * 0.1, z: q.z + q.dz * 0.1 }) ?? ground(q.x, q.z) + HW);
        const foot = ground(gx(qa, uIn + run1), gz(qa, uIn + run1));
        const base = Math.min(foot, ground(q.x, q.z));
        const total = topY - base;
        for (let k = 0; k < steps; k++) {
          const u = uIn + run1 * (1 - (k + 0.5) / steps), y = base + total * (k + 1) / steps;
          const sx = gx(qa, u), sz = gz(qa, u);
          add('steel', new THREE.BoxGeometry(0.26 * M, 0.025 * M, 1.0 * M).rotateY(-Math.atan2(q.dz, q.dx) + Math.PI / 2).translate(sx, y - 0.0125 * M, sz));
        }
        for (const side of [-1, 1]) {
          const lat = side * 0.5 * M;
          const lx = (u: number) => gx(qa, u), lz = (u: number) => gz(qa, u);
          // stringer and handrail, offset sideways along the wall
          const sxA = lx(uIn + run1) + q.dx * lat, szA = lz(uIn + run1) + q.dz * lat, sxB = lx(uIn) + q.dx * lat, szB = lz(uIn) + q.dz * lat;
          seg3(sxA, base, szA, sxB, topY - 0.05 * M, szB, 0.05 * M, 'steel');
          seg3(sxA, base + RH, szA, sxB, topY + RH, szB, 0.03 * M, 'iron');
          add('iron', new THREE.BoxGeometry(0.03 * M, RH, 0.03 * M).translate(sxA, base + RH / 2, szA));
        }
        // a landing plate and a gate-width apron at the foot
        add('concrete', new THREE.BoxGeometry(1.4 * M, 0.04 * M, 1.4 * M).rotateY(-Math.atan2(q.dz, q.dx)).translate(gx(qa, uIn + run1 + 0.5 * M), base + 0.02 * M, gz(qa, uIn + run1 + 0.5 * M)));
      }
      break;
    }
    case 'thorn_hedge': {
      const g = Math.max(0.04, growth), h = def.height * g, w = (0.4 + 1.6 * g) * M;
      let k = 0;
      for (const [s0, s1] of spans) for (let s = s0; s < s1; s += 0.32 * M + 0.25 * M * g) {
        const p = along(run.pts, s), side = (k % 2 ? 1 : -1) * 0.25 * M, jitter = Math.sin(k * 12.9898) * 0.5 + 0.5;
        const x = p.x - p.dz * side, z = p.z + p.dx * side, y = ground(x, z);
        const r = w * (0.8 + 0.4 * jitter);
        add(k % 3 === 0 ? 'hedge2' : 'hedge', new THREE.SphereGeometry(r, 10, 7).scale(1, Math.max(0.6, h / r) * (0.85 + 0.3 * jitter), 1).rotateY(jitter * 6).translate(x, y + h * 0.5, z));
        add('wood_dark', new THREE.CylinderGeometry(0.02 * M, 0.03 * M, h * 0.5, 4).translate(x, y + h * 0.25, z));
        if (g > 0.5 && k % 3 === 0) add('hedge_berry', new THREE.IcosahedronGeometry(0.05 * M, 0).translate(x + p.dz * r * 0.9, y + h * (0.4 + 0.4 * jitter), z - p.dx * r * 0.9));
        k++;
      }
      break;
    }
    case 'log_palisade': {
      const d = 0.28 * M;
      for (const [s0, s1] of spans) for (let s = s0 + d / 2; s < s1; s += d) {
        const p = along(run.pts, s), y = ground(p.x, p.z) - 0.04;
        const hh = def.height + 0.04 + Math.sin(s * 97.1) * 0.01;
        add('log_end', new THREE.CylinderGeometry(d / 2, d / 2, hh, 7).translate(p.x, y + hh / 2, p.z));
        add('log_end', new THREE.ConeGeometry(d / 2, 0.35 * M, 7).translate(p.x, y + hh + 0.175 * M, p.z));
      }
      // walkway rail on the inside (left of the run direction)
      bays(2.5 * M, (a, b) => {
        const o = 0.25 * M;
        beam(a.x - a.dz * o, a.z + a.dx * o, b.x - b.dz * o, b.z + b.dx * o, 1.9 * M, 0.15 * M, 0.12 * M, 'wood_dark');
        post(a.x - a.dz * o, a.z + a.dx * o, 1.9 * M, 0.06 * M, 'wood_dark');
      });
      break;
    }
    case 'container_wall':
    case 'container_stack': {
      // used 40 ft boxes end to end, one or two high, painted to the run's `look` (black, rust, a single color, or the mixed old cycle)
      const look = run.look ?? 'mixed';
      const mixed: KitMaterialId[] = ['container_red', 'container_blue', 'container_green', 'container_tan'];
      const single: Partial<Record<string, KitMaterialId>> = { black: 'container_black', rust: 'container_rust', red: 'container_red', blue: 'container_blue', green: 'container_green', tan: 'container_tan' };
      const L = 12.2 * M, W = 2.44 * M, H = 2.6 * M, layers = run.kind === 'container_stack' ? 2 : 1;
      let k = Math.abs(Math.round(run.pts[0][0] * 7 + run.pts[0][1] * 13));
      for (const [s0, s1] of spans) for (let s = s0; s < s1 - 0.3 * M; s += L) {
        const e = Math.min(s1, s + L);
        const a = along(run.pts, s), b = along(run.pts, e);
        // set level on concrete piers at the high point (containers don't bend to the ground)
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const samples = [0, 0.25, 0.5, 0.75, 1].map(f => ground(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f));
        const y = Math.max(...samples) + 0.015;
        // a poured plinth under the whole container, following the terrain and filling the gap on slopes and dips: nothing to walk or crawl under
        const nSub = Math.max(2, Math.ceil(len / 0.3));
        for (let q = 0; q < nSub; q++) {
          const f0 = q / nSub, f1 = (q + 1) / nSub;
          const x0 = a.x + (b.x - a.x) * f0, z0 = a.z + (b.z - a.z) * f0, x1 = a.x + (b.x - a.x) * f1, z1 = a.z + (b.z - a.z) * f1;
          const gy = Math.min(ground(x0, z0), ground(x1, z1), ground((x0 + x1) / 2, (z0 + z1) / 2)) - 0.05;
          if (y - gy > 0.004) add('concrete', new THREE.BoxGeometry(Math.hypot(x1 - x0, z1 - z0) + 0.004, y - gy, W * 1.02).translate(0, (y - gy) / 2, 0).rotateY(-Math.atan2(z1 - z0, x1 - x0)).translate((x0 + x1) / 2, gy, (z0 + z1) / 2));
        }
        for (let layer = 0; layer < layers; layer++) {
          const m: KitMaterialId = single[look] ?? mixed[k++ % mixed.length];
          const y0 = y + layer * H;
          add(m, new THREE.BoxGeometry(len - 0.02 * M, H, W).translate(0, H / 2, 0).rotateY(-Math.atan2(b.z - a.z, b.x - a.x)).translate((a.x + b.x) / 2, y0, (a.z + b.z) / 2));
          // corner castings and the door end
          for (const c of [a, b]) add('iron', new THREE.BoxGeometry(0.2 * M, H + 0.02 * M, W + 0.02 * M).rotateY(-Math.atan2(c.dz, c.dx)).translate(c.x, y0 + H / 2, c.z));
        }
      }
      break;
    }
    case 'stone_wall': {
      // 3.3 m of mortared fieldstone: a wide footing course, the wall tapering up (a batter), a timber coping on the top and a squared post at every 3 m joint
      const H = 3.3 * M;
      bays(3 * M, (a, b, i) => {
        const len = Math.hypot(b.x - a.x, b.z - a.z), yaw = -Math.atan2(b.z - a.z, b.x - a.x), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        const samples = [0, 0.25, 0.5, 0.75, 1].map(f => ground(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f));
        const hi = Math.max(...samples), lo = Math.min(...samples) - 0.06;
        const box = (l: number, h: number, w: number, y0: number, m: KitMaterialId, dx = 0) => add(m, new THREE.BoxGeometry(l, h, w).translate(0, h / 2, dx).rotateY(yaw).translate(mx, y0, mz));
        box(len + 0.004, hi - lo + 0.03, 0.62 * M, lo, 'fieldstone');                           // the footing, from the lowest ground to the first course
        box(len, H * 0.42, 0.58 * M, hi + 0.02, 'fieldstone');                                   // the lower, wider part
        box(len, H * 0.46, 0.46 * M, hi + 0.02 + H * 0.42, 'fieldstone');                        // the upper part, set back
        box(len + 0.01, 0.1 * M, 0.5 * M, hi + 0.02 + H * 0.88, 'wood_mid');                     // the timber coping
        box(len + 0.01, 0.1 * M, 0.34 * M, hi + 0.02 + H * 0.88 + 0.1 * M, 'wood_dark');
        // a squared timber post at the joint, standing proud of the coping
        add('wood_dark', new THREE.BoxGeometry(0.2 * M, H * 0.28, 0.2 * M).translate(a.x, hi + 0.02 + H * 0.88, a.z));
        add('wood_mid', new THREE.BoxGeometry(0.26 * M, 0.06 * M, 0.26 * M).translate(a.x, hi + 0.02 + H * 0.88 + H * 0.28, a.z));
        void i;
      });
      for (const e of spanEnds()) add('fieldstone', new THREE.BoxGeometry(0.7 * M, H, 0.7 * M).translate(e.x, ground(e.x, e.z) + H / 2, e.z));
      break;
    }
    case 'tunnel_bridge':
    case 'slope_tunnel': {
      // an enclosed rust-red steel tube (4 m across inside: a truck drives through) with a steel door at each end. The bridge spans a gorge on trusses in a straight
      // line between its two rims; the slope tunnel lies along the hillside, half sunk in it. Ribs every 3 m, a concrete portal and a pair of closed steel doors at each end.
      const R = 2.0 * M, spanKind = run.kind === 'tunnel_bridge';
      const a0 = run.pts[0], b0 = run.pts[run.pts.length - 1];
      const axisY = (x: number, z: number, t: number) => spanKind
        ? ground(a0[0], a0[1]) + (ground(b0[0], b0[1]) - ground(a0[0], a0[1])) * t + R
        : ground(x, z) + R * 0.55;
      const L = wl, builtL = built;
      const v3 = (s_: number) => { const p = along(run.pts, s_), t = L > 0 ? s_ / L : 0; return new THREE.Vector3(p.x, axisY(p.x, p.z, t), p.z); };
      const tube = (p: THREE.Vector3, q: THREE.Vector3, r: number, m: KitMaterialId, open = true) => {
        const d = q.clone().sub(p), l = d.length();
        if (l < 1e-5) return;
        const g = new THREE.CylinderGeometry(r, r, l, 14, 1, open).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
        add(m, g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2));
      };
      const n = Math.max(1, Math.round(builtL / (3 * M)));
      for (let i = 0; i < n && builtL > 0.05; i++) {
        const s0 = builtL * i / n, s1 = builtL * (i + 1) / n, p = v3(s0), q = v3(s1);
        tube(p, q, R, 'container_rust');
        // a rib ring round the tube at the bay joint, proud of the skin
        tube(p.clone().lerp(q, 0.02), p.clone().lerp(q, 0.1), R * 1.05, 'iron');
        if (spanKind) {
          // trusses down to the ground at every other joint where the gap is more than a step: two legs and a cross brace, a concrete foot under each leg
          const pa = along(run.pts, s0), gy = ground(pa.x, pa.z), under = p.y - R - gy;
          if (i % 2 === 0 && under > 0.12) {
            const nx = -pa.dz, nz = pa.dx, legs: THREE.Vector3[] = [];
            for (const sg of [-1, 1]) {
              const lx = pa.x + nx * sg * R * 0.8, lz = pa.z + nz * sg * R * 0.8, ly = ground(lx, lz), top = p.y - R * 0.75;
              // a square steel leg (35 cm) up to the tube, on a concrete foot
              add('steel', new THREE.BoxGeometry(0.35 * M, top - ly + 0.05, 0.35 * M).translate(lx, ly - 0.05 + (top - ly + 0.05) / 2, lz));
              add('concrete', new THREE.BoxGeometry(0.9 * M, 0.45 * M, 0.9 * M).translate(lx, ly + 0.1 * M, lz));
              legs.push(new THREE.Vector3(lx, ly, lz));
            }
            // X-bracing across the pair, a third of the way up, and a cross beam under the tube
            const top0 = p.y - R * 0.75, mid = (a: THREE.Vector3, k: number) => new THREE.Vector3(a.x, a.y + (top0 - a.y) * k, a.z);
            tube(mid(legs[0], 0.15), mid(legs[1], 0.85), 0.07 * M, 'steel', false);
            tube(mid(legs[1], 0.15), mid(legs[0], 0.85), 0.07 * M, 'steel', false);
            tube(new THREE.Vector3(legs[0].x, top0, legs[0].z), new THREE.Vector3(legs[1].x, top0, legs[1].z), 0.12 * M, 'steel', false);
          }
        }
      }
      // the ends: a concrete portal (a frame round the opening), a pair of closed steel doors, an abutment under it, a lamp; drawn once the run is far enough built
      const end = (s_: number, sign: number) => {
        const p = v3(s_), d = along(run.pts, s_), yaw = -Math.atan2(d.dz, d.dx);
        const place = (g: THREE.BufferGeometry) => g.rotateY(yaw).translate(p.x + d.dx * sign * 0.05, 0, p.z + d.dz * sign * 0.05);
        const gy = ground(p.x, p.z);
        add('concrete', place(new THREE.BoxGeometry(0.5 * M, R * 2.4 + 0.1 * M, 0.9 * M).translate(0, p.y - R + (R * 2.4) / 2 + 0.02, 0)));      // portal block (the frame is the thick face round the doors)
        for (const sg of [-1, 1]) add('steel', place(new THREE.BoxGeometry(0.12 * M, R * 1.75, R * 0.95).translate(sign * 0.3 * M, p.y - R * 0.9 + R * 0.875, sg * R * 0.48)));   // the two door leaves
        add('paint_yellow', place(new THREE.BoxGeometry(0.02 * M, 0.25 * M, R * 1.9).translate(sign * 0.37 * M, p.y - R * 0.4, 0)));   // a hazard band across the doors
        if (spanKind && p.y - R - gy > 0.05) add('concrete', place(new THREE.BoxGeometry(0.9 * M, p.y - R - gy + 0.05, R * 2.3).translate(0, gy - 0.05 + (p.y - R - gy + 0.05) / 2, 0)));   // abutment down to the ground
        add(lit ? 'bulb' : 'enamel', new THREE.SphereGeometry(0.07 * M, 8, 6).translate(p.x - d.dx * sign * 0.0, p.y + R + 0.18 * M, p.z));
      };
      if (builtL > 0.05) { end(0, -1); if (run.finishedAt !== null) end(L, 1); }
      else if (run.dropped) {   // a dropped bridge leaves its abutments
        for (const [s_, sign] of [[0, -1], [L, 1]] as const) { const p = along(run.pts, s_), gy = ground(p.x, p.z); add('concrete', new THREE.BoxGeometry(0.9 * M, 0.5 * M, R * 2.3).rotateY(-Math.atan2(p.dz, p.dx)).translate(p.x, gy + 0.2 * M, p.z)); void sign; }
      }
      break;
    }
    case 'rock_tunnel': {
      // driven through the hill: only the two stone portals, the earth banked over the tube where the hill has not closed over it, and the dark inside show (game/perimeter/boreGeometry.ts)
      const b = boreParts(run.pts, ground, run.finishedAt !== null ? 1 : runProgress(run), run.finishedAt !== null, lit);
      for (const [m, g] of b.parts) add(m, g);
      if (b.tube) tubes.push(b.tube);
      break;
    }
    case 'drain_channel': {
      // a 1 m stone-lined swale: a gravel bed between two fieldstone lips, a culvert stub and an iron grating at each end (a dug, spoil-lipped trench while it is being laid)
      const open = run.finishedAt === null, w = 0.9 * M;
      for (const [s0, s1] of spans) {
        const n = Math.max(1, Math.ceil((s1 - s0) / 0.3));
        for (let i = 0; i < n; i++) {
          const a = along(run.pts, s0 + (s1 - s0) * i / n), b = along(run.pts, s0 + (s1 - s0) * (i + 1) / n);
          beamFit(a.x, a.z, b.x, b.z, -0.004, 0.016, w, open ? 'soil' : 'gravel');
          for (const sg of [-1, 1]) {
            const o = (w / 2 + 0.11 * M) * sg;
            beamFit(a.x + a.dz * o, a.z - a.dx * o, b.x + b.dz * o, b.z - b.dx * o, 0, open ? 0.08 * M : 0.11 * M, open ? 0.3 * M : 0.22 * M, open ? 'soil' : 'fieldstone');
          }
        }
      }
      if (!open) for (const e of spanEnds()) {
        add('concrete', new THREE.CylinderGeometry(0.2 * M, 0.2 * M, 0.5 * M, 10).rotateZ(Math.PI / 2).rotateY(-Math.atan2(e.dz, e.dx)).translate(e.x, ground(e.x, e.z) + 0.15 * M, e.z));
        add('iron', new THREE.BoxGeometry(0.03 * M, 0.34 * M, 0.5 * M).rotateY(-Math.atan2(e.dz, e.dx)).translate(e.x, ground(e.x, e.z) + 0.17 * M, e.z));
      }
      break;
    }
    case 'water_pipe': case 'power_cable': {
      // an open trench while it's being laid, then a backfilled strip that greens over; marker posts at the bends
      const open = run.finishedAt === null, age = open ? 0 : Math.min(1, (t - run.finishedAt!) / 120);
      const w = (open ? 0.5 : 0.7) * M, mat: KitMaterialId = open ? 'soil' : age < 0.6 ? 'soil' : 'earth';
      if (!(age >= 1)) for (const [s0, s1] of spans) {
        const n = Math.max(1, Math.ceil((s1 - s0) / 0.4));
        for (let i = 0; i < n; i++) {
          const a = along(run.pts, s0 + (s1 - s0) * i / n), b = along(run.pts, s0 + (s1 - s0) * (i + 1) / n);
          if (under((a.x + b.x) / 2, (a.z + b.z) / 2)) continue;
          beam(a.x, a.z, b.x, b.z, -0.004, 0.008, w, mat);
          if (open) { const o = w * 0.9; beam(a.x - a.dz * o, a.z + a.dx * o, b.x - b.dz * o, b.z + b.dx * o, 0, 0.025, 0.25 * M, 'soil'); }
        }
      }
      // a marker at each bend; where the line meets a building, one just outside its wall
      const L = wallLength(run), mark = (s: number) => { const q = along(run.pts, s); post(q.x, q.z, 0.9 * M, 0.04 * M, run.kind === 'water_pipe' ? 'blue_tank' : 'paint_red'); };
      let acc = 0;
      run.pts.forEach((p, i) => {
        if (i > 0) acc += Math.hypot(p[0] - run.pts[i - 1][0], p[1] - run.pts[i - 1][1]);
        if (!under(p[0], p[1])) { mark(acc); return; }
        // walk out of the footprint toward the neighboring points
        for (const dir of [1, -1]) {
          if ((dir < 0 && i === 0) || (dir > 0 && i === run.pts.length - 1)) continue;
          for (let d = 0.05; d < 2; d += 0.05) {
            const s = Math.max(0, Math.min(L, acc + dir * d)), q = along(run.pts, s);
            if (!under(q.x, q.z)) { mark(Math.max(0, Math.min(L, s + dir * 0.06))); break; }
          }
        }
      });
      break;
    }
    default: break;  // berm, ditch: earthworks in the terrain
  }
  // every wall tier is closed to the ground: a footing that follows the terrain (sim/perimeter footingOf)
  const footing = run.finishedAt !== null || built > 0 ? footingOf(run.kind) : null;
  if (footing && footing !== 'plinth' && footing !== 'trench') {
    const mat: KitMaterialId = footing === 'curb' ? 'concrete' : 'earth';
    const w = (footing === 'curb' ? 0.3 : 0.5) * M, h = (footing === 'curb' ? 0.2 : 0.25) * M;
    for (const [s0, s1] of spans) {
      const n = Math.max(1, Math.ceil((s1 - s0) / 0.3));
      for (let i = 0; i < n; i++) {
        const a = along(run.pts, s0 + (s1 - s0) * i / n), b = along(run.pts, s0 + (s1 - s0) * (i + 1) / n);
        const lo = Math.min(ground(a.x, a.z), ground(b.x, b.z), ground((a.x + b.x) / 2, (a.z + b.z) / 2));
        const hi = Math.max(ground(a.x, a.z), ground(b.x, b.z));
        add(mat, new THREE.BoxGeometry(Math.hypot(b.x - a.x, b.z - a.z) + 0.004, hi - lo + h + 0.05, w).translate(0, (hi - lo + h + 0.05) / 2, 0).rotateY(-Math.atan2(b.z - a.z, b.x - a.x)).translate((a.x + b.x) / 2, lo - 0.05, (a.z + b.z) / 2));
      }
    }
  }
  // a buried skirt shows as a darker poured collar at the foot of the wall, with a flush steel inspection plate every 12 m; the steel and concrete tiers already have their footing in the drawing
  if (run.finishedAt !== null && hasSkirt(run, t) && !def.deepFooting && def.height > 0 && !def.walkway) {
    for (const [s0, s1] of spans) {
      const n = Math.max(1, Math.ceil((s1 - s0) / 0.5));
      for (let i = 0; i < n; i++) {
        const a = along(run.pts, s0 + (s1 - s0) * i / n), b = along(run.pts, s0 + (s1 - s0) * (i + 1) / n);
        beam(a.x, a.z, b.x, b.z, -0.012, 0.045, 0.34 * M, 'wet_concrete');
      }
      for (let s = s0 + 1 * M; s < s1; s += 12 * M) { const q = along(run.pts, s); add('steel', new THREE.BoxGeometry(0.32 * M, 0.012, 0.18 * M).rotateY(-Math.atan2(q.dz, q.dx)).translate(q.x - q.dz * 0.4 * M, ground(q.x, q.z) + 0.004, q.z + q.dx * 0.4 * M)); }
    }
  }
  // ground sensors: a short steel stake with a green status cap on the outside of the wall every ~18 m
  if (opts.sensors && run.finishedAt !== null && def.blocks.people >= 0.6 && def.height > 0 && !def.walkway) {
    for (const [s0, s1] of spans) for (let s = s0 + 2 * M; s < s1; s += 18 * M) {
      const q = along(run.pts, s), x = q.x + q.dz * 0.9 * M, z = q.z - q.dx * 0.9 * M, y = ground(x, z);
      add('steel', new THREE.CylinderGeometry(0.014, 0.014, 0.3 * M, 5).translate(x, y + 0.15 * M, z));
      add('paint_green', new THREE.CylinderGeometry(0.03 * M, 0.03 * M, 0.06 * M, 7).translate(x, y + 0.33 * M, z));
      add(lit ? 'bulb' : 'enamel', new THREE.SphereGeometry(0.014, 6, 4).translate(x, y + 0.37 * M, z));
    }
  }
  // razor wire: loose concertina coils on the top of the run (a ring every 0.26 m)
  if (run.razor && !opts.deck && built > 0.05 && RAZOR.HOSTS.includes(run.kind)) {
    const top = Math.abs(def.height) + 0.06 * M;
    bays(2.4 * M, (a, b) => {
      const l = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(2, Math.round(l / (0.26 * M))), th = Math.atan2(b.x - a.x, b.z - a.z);
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
        add('steel', new THREE.TorusGeometry(0.17 * M, 0.012 * M, 4, 9).rotateY(th).translate(x, ground(x, z) + top + 0.17 * M, z));
      }
    });
  }
  /** Plank leaf hinged at (hx, hz), `w` wide and `h` tall, swung by `open` radians (mirror -1 hinges on the far side): vertical boards, iron straps and a Z brace. */
  const plankLeaf = (hx: number, hz: number, w: number, h: number, open: number, mirror: number, ang: number) => {
    const parts: Array<[KitMaterialId, THREE.BufferGeometry]> = [];
    const bar = (x: number, y: number, bw: number, bh: number, th: number, m: KitMaterialId) => parts.push([m, new THREE.BoxGeometry(bw, bh, th).translate(x, y, 0)]);
    for (let x = 0.08 * M; x < w - 0.04 * M; x += 0.15 * M) bar(x, h / 2, 0.14 * M, h - 0.04 * M, 0.05 * M, 'wood_mid');
    for (const f of [0.18, 0.5, 0.82]) bar(w / 2, h * f, w, 0.12 * M, 0.07 * M, 'iron');
    parts.push(['wood_dark', new THREE.BoxGeometry(Math.hypot(w, h) * 0.8, 0.1 * M, 0.06 * M).rotateZ(Math.atan2(h, w)).translate(w / 2, h / 2, 0.02 * M)]);
    const gy = ground(hx, hz) + 0.01;
    for (const [m, g] of parts) add(m, g.scale(mirror, 1, 1).rotateY(ang + mirror * open).translate(hx, gy, hz));
  };
  /** The stone gatehouse leaf (a gate gap in a stone wall) and the sally port (g.sally): see docs/DECISIONS.md, "Gatehouse leaf and sally port". */
  const stoneGate = (r: Pick<PerimeterRun, 'kind'>, g: { at: number; w: number; sally?: boolean }, p0: ReturnType<typeof along>, p1: ReturnType<typeof along>) => {
    const ang = -Math.atan2(p0.dz, p0.dx), mx = (p0.x + p1.x) / 2, mz = (p0.z + p1.z) / 2, gy = ground(mx, mz);
    const wallH = Math.abs(def.height), mat: KitMaterialId = r.kind === 'stone_wall' ? 'fieldstone' : r.kind === 'concrete_wall' ? 'concrete' : 'steel';
    /** Put a box in the gate's frame: x along the run, centered at the gap, z across it; y up from the ground at the gate. */
    const gb = (w: number, h: number, d: number, x: number, y: number, z: number, m: KitMaterialId) =>
      add(m, new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0).translate(x, y, z).rotateY(ang).translate(mx, gy, mz));
    if (g.sally) {
      // two stone jambs, a lintel under the wall's top course, a single plank door ajar, a lantern over it
      const doorH = Math.min(2.2 * M, wallH - 0.4 * M), jx = g.w / 2 + 0.18 * M;
      for (const sg of [-1, 1]) gb(0.36 * M, wallH, 0.66 * M, sg * jx, 0, 0, mat);
      gb(g.w + 0.72 * M, wallH - doorH, 0.62 * M, 0, doorH, 0, mat);
      gb(g.w + 0.84 * M, 0.1 * M, 0.74 * M, 0, wallH, 0, mat === 'steel' ? 'iron' : 'wood_dark');     // a coping over it
      gb(g.w + 0.1 * M, 0.08 * M, 0.7 * M, 0, 0, 0, 'concrete');                                       // the sill
      plankLeaf(p0.x, p0.z, g.w - 0.02 * M, doorH - 0.04 * M, 1.05, 1, ang);
      const lx = mx + Math.cos(ang) * 0 + Math.sin(ang) * 0.4 * M, lz = mz + Math.cos(ang) * 0.4 * M;
      add('iron', new THREE.BoxGeometry(0.05 * M, 0.2 * M, 0.05 * M).translate(lx, gy + doorH + 0.1 * M, lz));
      add(lit ? 'bulb' : 'enamel', new THREE.SphereGeometry(0.1 * M, 8, 6).translate(lx, gy + doorH + 0.32 * M, lz));
      return;
    }
    // the gatehouse: two stone piers wider than the wall with timber caps, a timber lintel under a stone upper course, a little gable roof of tin, two plank leaves swung open
    const pierH = wallH + 1.6 * M, jx = g.w / 2 + 0.45 * M, doorH = Math.min(wallH * 0.9, pierH - 1.3 * M);
    for (const sg of [-1, 1]) {
      gb(0.95 * M, pierH, 0.95 * M, sg * jx, 0, 0, "fieldstone");
      gb(0.9 * M, 0.14 * M, 0.94 * M, sg * jx, pierH, 0, 'wood_dark');
      gb(0.5 * M, 0.2 * M, 0.5 * M, sg * jx, pierH + 0.14 * M, 0, 'fieldstone');
    }
    gb(g.w + 0.8 * M, 0.34 * M, 0.5 * M, 0, doorH + 0.04 * M, 0, 'wood_dark');                         // the timber lintel
    gb(g.w + 0.8 * M, pierH - doorH - 0.38 * M, 0.66 * M, 0, doorH + 0.38 * M, 0, 'fieldstone');       // stone over it
    const roofL = g.w + 2.1 * M;
    for (const sg of [-1, 1]) add('metal_roof', new THREE.BoxGeometry(roofL, 0.08 * M, 0.72 * M).rotateX(sg * 0.42).translate(0, pierH + 0.36 * M, sg * 0.3 * M).rotateY(ang).translate(mx, gy, mz));
    plankLeaf(p0.x, p0.z, g.w / 2 - 0.01, doorH, 1.25, 1, ang);
    plankLeaf(p1.x, p1.z, g.w / 2 - 0.01, doorH, 1.25, -1, ang);
  };
  // gates: posts each side and a leaf swung open (wire / rail fences: tube gate; walls: plank or steel gates)
  if (run.finishedAt !== null && run.kind !== 'ditch') {
    for (const g of run.gates) {
      if (g.garage) continue;   // a gatehouse garage fills this gap
      const p0 = along(run.pts, g.at - g.w / 2), p1 = along(run.pts, g.at + g.w / 2);
      // a stone gatehouse (wide gate in a stone wall) and the sally port (a small side door in any ring wall) have their own piers, lintel and plank leaves
      if (g.sally || (run.kind === 'stone_wall' && g.w >= 0.35)) { stoneGate(run, g, p0, p1); continue; }
      const tall = Math.max(1.4 * M, Math.abs(def.height) + 0.05 * M);
      for (const p of [p0, p1]) post(p.x, p.z, tall, 0.1 * M, 'wood_dark', true);
      // a framed doorway: a steel lintel across the posts (the opening where a walkway meets a yard wall reads as a real door, from both sides)
      if (g.w <= 0.45 && def.height >= 0.4) {
        for (const p of [p0, p1]) post(p.x, p.z, def.height + 0.08 * M, 0.1 * M, 'steel');
        beam(p0.x, p0.z, p1.x, p1.z, def.height, 0.14 * M, 0.3 * M, 'steel');
      }
      const wall = run.kind === 'log_palisade' || run.kind === 'container_wall' || run.kind === 'container_stack' || run.kind === 'stone_wall' || run.kind === 'concrete_wall';
      const leafH = wall ? Math.abs(def.height) * 0.95 : 1.3 * M;
      const ang = -Math.atan2(p0.dz, p0.dx);
      /** A gate leaf, hinged at (hx, hz), `w` wide, swung open by `open` radians. */
      const leaf = (hx: number, hz: number, w: number, open: number, mirror: number) => {
        const parts: Array<[KitMaterialId, THREE.BufferGeometry]> = [];
        const fm: KitMaterialId = run.kind === 'log_palisade' ? 'wood_dark' : 'steel';
        const bar = (x: number, y: number, bw: number, bh: number, m: KitMaterialId = fm) => parts.push([m, new THREE.BoxGeometry(bw, bh, 0.02 * M).translate(x, y, 0)]);
        // frame
        bar(w / 2, 0.08 * M, w, 0.06 * M); bar(w / 2, leafH - 0.04 * M, w, 0.06 * M);
        bar(0.03 * M, leafH / 2, 0.06 * M, leafH); bar(w - 0.03 * M, leafH / 2, 0.06 * M, leafH);
        if (run.kind === 'log_palisade') {
          // planks with a Z brace
          for (let x = 0.12 * M; x < w - 0.06 * M; x += 0.16 * M) bar(x, leafH / 2, 0.14 * M, leafH - 0.06 * M, 'wood_mid');
          parts.push(['wood_dark', new THREE.BoxGeometry(Math.hypot(w, leafH) * 0.9, 0.08 * M, 0.03 * M).rotateZ(Math.atan2(leafH, w)).translate(w / 2, leafH / 2, 0.02 * M)]);
        } else if (wall) {
          // steel bars
          for (let x = 0.1 * M; x < w - 0.05 * M; x += 0.12 * M) bar(x, leafH / 2, 0.025 * M, leafH - 0.1 * M);
          bar(w / 2, leafH * 0.5, w, 0.05 * M);
        } else {
          // tube farm gate: five rails and a diagonal
          for (const f of [0.3, 0.5, 0.7]) bar(w / 2, leafH * f, w, 0.035 * M, 'scaffold');
          parts.push(['scaffold', new THREE.BoxGeometry(Math.hypot(w, leafH) * 0.92, 0.03 * M, 0.02 * M).rotateZ(Math.atan2(leafH, w)).translate(w / 2, leafH / 2, 0)]);
        }
        const gy = ground(hx, hz) + 0.01;
        for (const [m, g] of parts) add(m, g.scale(mirror, 1, 1).rotateY(ang + mirror * open).translate(hx, gy, hz));
      };
      // a narrow gate is a pedestrian man-door: one leaf, even in a wall; wide ones are a double vehicle gate
      if (wall && g.w >= 0.35) { leaf(p0.x, p0.z, g.w / 2 - 0.01, 1.3, 1); leaf(p1.x, p1.z, g.w / 2 - 0.01, -1.3, -1); }
      else if (wall) leaf(p0.x, p0.z, g.w - 0.01, 1.4, 1);
      else leaf(p0.x, p0.z, g.w * 0.96, 1.35, 1);
    }
  }

  const group = new THREE.Group();
  for (const [m, list] of bits) {
    const geo = mergeGeometries(list);
    list.forEach(x => x.dispose());
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, kitMaterial(m));
    mesh.castShadow = m !== 'wire_mesh';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const g of tubes) group.add(new THREE.Mesh(g, boreDark()));
  group.userData = { type: 'perimeter', runId: run.id };
  return group;
}
