/**
 * Stairs and ramps between terraces (docs/DECISIONS.md, "Stairs and ramps as props"): a stone stair and a gravel ramp the player sets along a slope.
 * They take no pad: the piece stands on the natural ground from its lower end (`opts.rise` says how far the far end is above it, signed along the
 * local z axis), so it follows the hill and joins the terraces either side. SCALE v2: 1 u = 6 m, a riser is 0.27 m (0.045 u), a person 0.28 u.
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { M } from './interior';
import { box, Parts, type BuildOpts } from './shell';

/** One riser (u, 27 cm): the same as the walls' stairs and the path stairs. */
export const RISER = 0.045;
/** Rail posts from this rise up (u, 1.2 m): a short stair needs none. */
const RAIL_FROM = 0.2;

/** Number of risers for a rise (at least 2). */
export const stepsFor = (rise: number): number => Math.max(2, Math.round(Math.abs(rise) / RISER));

/** The local z of a point `t` (0 low end .. 1 high end) along a piece of depth D whose high end is at +z when `up`, else at -z. */
const zAt = (t: number, D: number, up: boolean): number => (up ? -D / 2 + t * D : D / 2 - t * D);

function railing(p: Parts, W: number, D: number, rise: number, up: boolean, sx: number): void {
  const n = Math.max(2, Math.round(D / (1.6 * M)));
  const top = (t: number) => Math.abs(rise) * t + 0.95 * M;
  for (let k = 0; k <= n; k++) {
    const t = k / n, z = zAt(t, D, up), y0 = Math.abs(rise) * t;
    p.add('steel', box(0.05 * M, 0.95 * M, 0.05 * M, sx * (W / 2 - 0.05 * M), y0, z));
  }
  // the rail: a slanted tube from foot to head
  const L = Math.hypot(D, Math.abs(rise)), ang = Math.atan2(Math.abs(rise), D) * (up ? 1 : -1);
  const rail = new THREE.CylinderGeometry(0.03 * M, 0.03 * M, L, 6).rotateX(Math.PI / 2).rotateX(-ang).translate(sx * (W / 2 - 0.05 * M), (top(0) + top(1)) / 2, 0);
  p.add('steel', rail);
}

export function terraceStair(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const p = new Parts(seed);
  const W = def.cellsX * CELL, D = def.cellsZ * CELL, rise = opts.rise ?? 0.3, up = rise >= 0;
  const n = stepsFor(rise), rs = Math.abs(rise) / n, run = D / n;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const lz of [-D / 2, D / 2]) p.add('trim', box(0.012, 0.09, 0.012, sx * (W / 2 - 0.02), -0.02, lz));
  // the treads: stacked fieldstone blocks, each a riser higher than the last, sunk into the hill underneath
  p.layer = 'foundation';
  const cheek = 0.14 * M * 2;
  for (let i = 0; i < n; i++) {
    const z = zAt((i + 0.5) / n, D, up), top = (i + 1) * rs;
    p.add('fieldstone', box(W - cheek * 2, top + 0.04, run, 0, -0.04, z));
  }
  // cheek walls either side: dry-stack, following the steps
  p.layer = 'frame';
  for (const sx of [-1, 1]) for (let i = 0; i < n; i++) {
    const z = zAt((i + 0.5) / n, D, up), top = (i + 1) * rs + 0.07 * M;
    p.add('fieldstone', box(cheek, top + 0.06, run, sx * (W / 2 - cheek / 2), -0.06, z));
  }
  // a handrail on one side from a 1.2 m rise up, two when it is a high flight
  p.layer = 'roof';
  if (Math.abs(rise) >= RAIL_FROM) { railing(p, W, D, rise, up, 1); if (Math.abs(rise) >= 0.4) railing(p, W, D, rise, up, -1); }
  // landings: a flat gravel apron at each end
  p.layer = 'walls';
  p.add('gravel', box(W - cheek * 2, 0.012, 0.5 * M, 0, -0.002, zAt(0, D, up) - 0.25 * M));
  p.add('gravel', box(W - cheek * 2, 0.012, 0.5 * M, 0, Math.abs(rise) - 0.006, zAt(1, D, up) + 0.25 * M));
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame'];
  return g;
}

export function terraceRamp(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const p = new Parts(seed);
  const W = def.cellsX * CELL, D = def.cellsZ * CELL, rise = opts.rise ?? 0.1, up = rise >= 0, R = Math.abs(rise);
  const n = 14, run = D / n, curb = 0.12 * M;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const lz of [-D / 2, D / 2]) p.add('trim', box(0.012, 0.09, 0.012, sx * (W / 2 - 0.02), -0.02, lz));
  // the bed: packed gravel in slices that follow the grade, each a hair above the one before
  p.layer = 'foundation';
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, z = zAt(t, D, up), top = R * t;
    p.add('gravel', box(W - curb * 2, top + 0.04, run + 0.002, 0, -0.04, z));
  }
  // timber curbs along both edges, stepped with the bed
  p.layer = 'frame';
  for (const sx of [-1, 1]) for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, z = zAt(t, D, up), top = R * t;
    p.add('wood_dark', box(curb, top + 0.05, run + 0.002, sx * (W / 2 - curb / 2), -0.04, z));
  }
  p.layer = 'roof';
  if (R >= RAIL_FROM * 0.5) railing(p, W, D, rise, up, 1);
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame'];
  return g;
}

export const TERRACE_BUILDERS = { terrace_stair: terraceStair, terrace_ramp: terraceRamp };

/** The height of the stair or ramp tread under local z (0 at the low end), for a person walking up it: steps for the stair, a smooth grade for the ramp. */
export function treadHeight(kind: string, rise: number, D: number, lz: number): number {
  const up = rise >= 0, R = Math.abs(rise);
  const t = Math.max(0, Math.min(1, up ? (lz + D / 2) / D : (D / 2 - lz) / D));
  if (kind === 'terrace_ramp') return R * t;
  const n = stepsFor(rise);
  return Math.min(n, Math.floor(t * n) + 1) * (R / n) * (t <= 0 ? 0 : 1);
}
