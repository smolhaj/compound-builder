/**
 * The pieces of a big dome's floor dressing (domeInteriorPlan.ts): gravel paths with curbs, plaza, benches, supply crates, signs and planters, as vertex-colored geometry
 * in the dome's local frame. `fx/DomePlant.ts` merges them into the plant's own mesh and its lamp instances (the lamp posts, heads and pools of light), so the dressing
 * costs no draw call of its own (the dome scenes in scripts/perfBudget.json have no room for one). SCALE v2.
 */
import * as THREE from 'three';
import { BENCH, CRATE, LANE_W, PATH_W, type InteriorPlan } from './domeInteriorPlan';
import type { ControlBlockPlan } from '../../sim/dome/controlBlock';
import { detailTier } from '../buildkit/buildingDetail';
import { contactPatch, slabMarks } from './interiorWear';


const col = (g: THREE.BufferGeometry, hex: number, jitter = 0, seed = 0): THREE.BufferGeometry => {
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
  const c = new THREE.Color(hex), k = 1 + (((Math.sin(seed * 12.9898) * 43758.5453) % 1) - 0.5) * jitter, n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
/** A box standing on y0 (its bottom), turned by `rot` about its own center, then moved to (x, z). */
const box = (w: number, h: number, d: number, x: number, y0: number, z: number, rot: number, hex: number, ox = 0, oz = 0, oy = 0, jitter = 0, seed = 0, drop: readonly number[] = [3]): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(ox, h / 2 + oy, oz);
  { const idx = g.index!.array as Uint16Array, keep: number[] = []; for (let f = 0; f < 6; f++) if (!drop.includes(f)) for (let k = 0; k < 6; k++) keep.push(idx[f * 6 + k]); g.setIndex(keep); }      // (faces nobody can see are left out: the underside, and the ends of a path piece)
  g.rotateY(rot); g.translate(x, y0, z);
  return col(g, hex, jitter, seed);
};

export function interiorPieces(plan: InteriorPlan, ground: (lx: number, lz: number) => number): THREE.BufferGeometry[] {
  const tier = detailTier(), pieces: THREE.BufferGeometry[] = [], gy = (x: number, z: number): number => ground(x, z);
  plan.segs.forEach((s, i) => {
    const y = gy(s.x, s.z) + 0.002;
    const w = s.w ?? PATH_W, lane = w >= LANE_W;
    if (lane) return;   // (the vehicle lane is the entrance complex's own poured lane, fx/VehiclePorts: a second one drawn here floated in slabs over it)
    // a dark bed under the slab shows as seams between slabs and a darker edge; the slab is a little shorter than its step; moss and stains sit on its top
    pieces.push(box(w + 0.016, 0.012, s.len, s.x, y - 0.002, s.z, s.rot, 0x4a4d4a, 0, 0, 0, 0.1, i + 21, [0, 1, 3, 4, 5]));
    pieces.push(box(w, 0.02, s.len - 0.01, s.x, y, s.z, s.rot, 0x8e9094, 0, 0, 0, 0.2, i, [0, 1, 3, 4, 5]));
    for (const k of [-1, 1]) pieces.push(box(0.022, 0.028, s.len, s.x, y, s.z, s.rot, 0x5a5d62, k * (w / 2 + 0.006), 0, 0, 0.1, i + 7, [3, 4, 5]));
    // worn lawn edge: a darker, packed-earth band just outside each curb (the lawn is textured; this is the contact line where feet cut the corner)
    if (tier === 'high') for (const k of [-1, 1]) pieces.push(box(0.03, 0.002, s.len, s.x, y - 0.0005, s.z, s.rot, 0x2e3420, k * (w / 2 + 0.032), 0, 0, 0.18, i + 40, [0, 1, 3, 4, 5]));
    for (const m of slabMarks(i, w, s.len, tier)) {
      const hex = m.kind === 'moss' ? 0x3a4a28 : m.kind === 'stain' ? 0x80807a : 0x5a5c60, jit = 0.25;
      pieces.push(box(m.hw * 2, 0.0015, m.hl * 2, s.x, y + 0.02, s.z, s.rot, hex, m.v * w, m.u * s.len, 0, jit, i * 3 + (m.k * 100 | 0), [0, 1, 3, 4, 5]));
    }
  });
  if (plan.plaza) {
    const g = new THREE.CylinderGeometry(plan.plaza.r, plan.plaza.r, 0.02, 28); g.translate(plan.plaza.x, gy(plan.plaza.x, plan.plaza.z) + 0.012, plan.plaza.z); pieces.push(col(g, 0x969a9d));
    const ring = new THREE.CylinderGeometry(plan.plaza.r + 0.03, plan.plaza.r + 0.03, 0.026, 28); ring.translate(plan.plaza.x, gy(plan.plaza.x, plan.plaza.z) + 0.008, plan.plaza.z); pieces.push(col(ring, 0x5a5d62));
  }
  const patch = (x: number, z: number, hx: number, hz: number, rot: number, i: number, y: number): void => {
    const q = contactPatch(i, hx, hz);
    pieces.push(box(q.hx * 2, 0.0015, q.hz * 2, x, y + 0.0005, z, rot + q.rot, 0x1c2314, 0, 0, 0, 0.2, i + 60, [0, 1, 3, 4, 5]));   // (a dark, packed-earth contact patch: ambient occlusion where a footing meets the lawn)
  };
  plan.benches.forEach((b, bi) => {
    const y = gy(b.x, b.z), { len, dep, seat, back } = BENCH, hi = tier === 'high', slats = hi ? 3 : 2, sd = dep / slats;
    patch(b.x, b.z, len / 2, dep / 2 + 0.01, b.rot, bi, y);
    // seat slats with gaps, each its own tone (bleached, weathered, darker)
    for (let k = 0; k < slats; k++) pieces.push(box(len, 0.012, sd - 0.006, b.x, y, b.z, b.rot, 0x7d5b3a, 0, -dep / 2 + sd * (k + 0.5), seat - 0.012, 0.3, bi * 5 + k, [1, 3]));
    // back rest: two slats; a darker rail along the seat's front edge reads as a bevel
    pieces.push(box(len, 0.024, 0.01, b.x, y, b.z, b.rot, 0x6f4f31, 0, -dep / 2 + 0.005, seat + 0.014, 0.3, bi * 5 + 8));
    pieces.push(box(len, 0.024, 0.01, b.x, y, b.z, b.rot, 0x6f4f31, 0, -dep / 2 + 0.005, seat + 0.046, 0.3, bi * 5 + 9));
    pieces.push(box(len, 0.012, 0.01, b.x, y, b.z, b.rot, 0x6a4a2e, 0, -dep / 2 + 0.005, back - 0.012, 0.3, bi * 5 + 10));
    pieces.push(box(len + 0.004, 0.006, 0.004, b.x, y, b.z, b.rot, 0x4a3522, 0, dep / 2 - 0.002, seat - 0.012));
    for (const k of [-1, 1]) {
      pieces.push(box(0.012, seat - 0.012, dep * 0.85, b.x, y, b.z, b.rot, 0x30343a, k * (len / 2 - 0.02), 0, 0, 0.1, bi + k));
      pieces.push(box(0.012, back - seat, 0.01, b.x, y, b.z, b.rot, 0x30343a, k * (len / 2 - 0.02), -dep / 2 + 0.005, seat));
      pieces.push(box(0.022, 0.004, dep * 0.95, b.x, y, b.z, b.rot, 0x23262a, k * (len / 2 - 0.02), 0, 0, 0, 0, [3]));   // (a foot plate)
    }
  });
  plan.crates.forEach((c, i) => {
    const y = gy(c.x, c.z), cs = [0x8a6a3c, 0x5f6f4a, 0x7d7f84];
    patch(c.x, c.z, CRATE * 1.4, CRATE * 0.8, c.rot, i + 300, y);
    pieces.push(box(CRATE, CRATE * 0.8, CRATE, c.x, y, c.z, c.rot, cs[i % 3], 0, 0, 0, 0.2, i));
    pieces.push(box(CRATE, CRATE * 0.8, CRATE, c.x, y, c.z, c.rot, cs[(i + 1) % 3], CRATE * 1.05, 0.01, 0, 0.2, i + 3));
    pieces.push(box(CRATE * 0.9, CRATE * 0.8, CRATE * 0.9, c.x, y, c.z, c.rot + 0.2, cs[(i + 2) % 3], CRATE * 0.5, 0.0, CRATE * 0.8, 0.2, i + 5));
    pieces.push(box(CRATE * 0.9, 0.05, CRATE * 0.9, c.x, y, c.z, c.rot, 0x6b4d2a, -CRATE * 1.2, 0.02));   // a pallet-height pad of boards beside them for a hand truck
  });
  for (const s of plan.signs) {
    const y = gy(s.x, s.z);
    pieces.push(box(0.012, 0.3, 0.012, s.x, y, s.z, s.rot, 0x30343a));
    pieces.push(box(0.14, 0.075, 0.008, s.x, y, s.z, s.rot, 0x2f6f5a, 0, 0, 0.27));
    pieces.push(box(0.11, 0.012, 0.01, s.x, y, s.z, s.rot, 0xf0eee0, 0, 0, 0.31));
  }
  plan.planters.forEach((p, i) => {
    const y = gy(p.x, p.z), hi = tier === 'high';
    patch(p.x, p.z, 0.09, 0.05, p.rot, i + 500, y);
    pieces.push(box(0.17, 0.05, 0.08, p.x, y, p.z, p.rot, 0x6b6459, 0, 0, 0, 0.14, i));
    pieces.push(box(0.178, 0.008, 0.088, p.x, y, p.z, p.rot, 0x514c44, 0, 0, 0.044, 0.1, i + 2));       // (a darker rim band)
    pieces.push(box(0.15, 0.004, 0.06, p.x, y, p.z, p.rot, 0x3a2f24, 0, 0, 0.05, 0.2, i + 4, [0, 1, 3, 4, 5]));    // (soil)
    const n = hi ? 4 : 3;
    for (let k = 0; k < n; k++) {
      const g = new THREE.IcosahedronGeometry(0.036 + 0.008 * ((i + k) % 3), 0); g.scale(1, 0.8, 1); g.translate((k - (n - 1) / 2) * (0.15 / n + 0.012), 0.072 + 0.01 * (k % 2), ((k % 2) - 0.5) * 0.02); g.rotateY(p.rot); g.translate(p.x, y, p.z);
      pieces.push(col(g, k % 2 ? 0x5d8a44 : 0x44703a, 0.3, i * 7 + k));
    }
  });
  if (plan.control) controlPieces(plan.control, ground, pieces);
  return pieces;
}

const KIND_HEX: Record<'power' | 'water' | 'chill', number> = { power: 0xd9822b, water: 0x2f7fb5, chill: 0xe4e9ec };
/** The pipes' real diameters (SCALE v2: 0.03 to 0.05 units is 7 to 12 inches of pipe, conduit or insulation). */
export const PIPE_R: Record<'power' | 'water' | 'chill', number> = { power: 0.03, water: 0.042, chill: 0.05 };
const JACKET = { water: 0xc2ccd4, chill: 0x9aa4ad, power: 0x9aa0a6 } as const;
/**
 * The control block's utility pipe rack (sim/dome/controlBlock.ts pipes): from the hazard-striped manifold beside the yard's service airlock to the utility wings, three real runs on low
 * stanchions: a heavy rigid power conduit (a pair, with galvanized junction boxes), an insulated water pipe (blue lagging with aluminum jacket bands) and a large chilled-water pipe (white
 * jacket with a dark seam and band rings). Flange couplings at the manifold, at the wing walls and along the run, spheres at the turns. Vertex-colored, merged with the floor dressing.
 */
function controlPieces(cb: ControlBlockPlan, ground: (lx: number, lz: number) => number, out: THREE.BufferGeometry[]): void {
  const gy = (x: number, z: number): number => ground(x, z), hi = detailTier() === 'high', side = hi ? 8 : 6;
  const yaw = Math.atan2(cb.yardDoor[0] - cb.manifold[0], cb.yardDoor[1] - cb.manifold[1]) + Math.PI;
  const [mx, mz] = cb.manifold, y0 = gy(mx, mz);
  // the manifold: a dark armored box on a plinth with a hazard stripe, a warning plate and three flanged stubs
  out.push(box(0.42, 0.03, 0.26, mx, y0, mz, yaw, 0x585d63));
  out.push(box(0.36, 0.17, 0.2, mx, y0, mz, yaw, 0x3a424b, 0, 0, 0.03, 0.08, 3));
  out.push(box(0.37, 0.022, 0.21, mx, y0, mz, yaw, 0xe3b92a, 0, 0, 0.1));
  out.push(box(0.38, 0.012, 0.22, mx, y0, mz, yaw, 0x2a2f35, 0, 0, 0.2));
  out.push(box(0.1, 0.06, 0.006, mx, y0, mz, yaw, 0xe3b92a, 0.1, 0.103, 0.11));
  (['power', 'water', 'chill'] as const).forEach((k, i) => { const g = new THREE.CylinderGeometry(PIPE_R[k] * 1.5, PIPE_R[k] * 1.5, 0.02, side); g.rotateX(Math.PI / 2); g.translate(-0.12 + i * 0.12, 0.09, -0.108); g.rotateY(yaw); g.translate(mx, y0 + 0.03, mz); out.push(col(g, 0x7d838a)); });
  const along = (ax: number, az: number, bx: number, bz: number, r: number, h: number, y: number, x: number, z: number, hex: number, open = false, sd = side): THREE.BufferGeometry => {
    const g = new THREE.CylinderGeometry(r, r, h, sd, 1, open); g.rotateZ(Math.PI / 2); g.rotateY(Math.atan2(-(bz - az), bx - ax)); g.translate(x, y, z); return col(g, hex, 0.04, x * 7 + z * 3);
  };
  for (const run of cb.pipes) {
    const k = run.kind, r = PIPE_R[k], hex = KIND_HEX[k], si = k === 'power' ? 0 : k === 'water' ? 1 : 2, lx = -0.12 + si * 0.12, lz = -0.108;
    // each run leaves its own flanged stub on the manifold (they fan out instead of piling on one line)
    const pts = [[mx + lx * Math.cos(yaw) + lz * Math.sin(yaw), mz - lx * Math.sin(yaw) + lz * Math.cos(yaw)] as [number, number], ...run.pts.slice(1)];
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.02) continue;
      const dx = (bx - ax) / L, dz = (bz - az) / L, rot = Math.atan2(dx, dz), mxp = (ax + bx) / 2, mzp = (az + bz) / 2, y = gy(mxp, mzp) + run.y;
      const rr = k === 'power' ? r * 0.8 : r;
      if (k === 'power') {      // a pair of heavy rigid conduits side by side
        for (const o of [-0.045, 0.045]) out.push(along(ax, az, bx, bz, rr, L, y, mxp - dz * o, mzp + dx * o, hex, true, side));
      } else out.push(along(ax, az, bx, bz, r, L, y, mxp, mzp, hex, true, side));
      // jacket bands (water: aluminum, chilled: dark rings) every ~0.35 (every 0.7 on Medium and Low); a conduit has a coupling every ~0.5
      const nb = Math.max(1, Math.round(L / (hi ? 0.35 : 0.7)));
      for (let b = 0; b <= nb; b++) {
        const t = (b + 0.5) / (nb + 1), x = ax + (bx - ax) * t, z = az + (bz - az) * t, yy = gy(x, z) + run.y;
        if (k === 'power') { for (const o of [-0.045, 0.045]) out.push(along(ax, az, bx, bz, rr * 1.25, 0.022, yy, x - dz * o, z + dx * o, JACKET.power, true, side)); }
        else out.push(along(ax, az, bx, bz, r * 1.1, 0.02, yy, x, z, JACKET[k], true, side));
      }
      // the chilled-water jacket's seam: a dark strip along the top
      if (k === 'chill' && hi) { const g = new THREE.BoxGeometry(0.008, 0.006, L); g.translate(0, r + 0.001, 0); g.rotateY(rot); g.translate(mxp, y, mzp); out.push(col(g, 0x5a6168)); }
      // stanchions: a post and a saddle under the pipe every ~0.5 (0.8 on Medium and Low), a galvanized junction box on the power run
      const n = Math.max(1, Math.round(L / (hi ? 0.5 : 0.8)));
      for (let q = 0; q <= n; q++) {
        const t = q / n, x = ax + dx * L * t, z = az + dz * L * t, yy = gy(x, z), wide = k === 'power' ? 0.17 : 2.2 * r;
        out.push(box(0.018, run.y - rr, 0.05, x, yy, z, rot, 0x30343a, 0, 0, 0, 0, 0, [3, 4, 5]));
        out.push(box(wide, 0.012, 0.07, x, yy, z, rot, 0x30343a, 0, 0, run.y - rr - 0.012, 0, 0, [3]));
        if (k === 'power' && q % 3 === 1) { out.push(box(0.1, 0.08, 0.1, x, yy, z, rot, 0x8c9399, 0, 0, run.y - 0.04, 0.05, q)); out.push(box(0.07, 0.01, 0.07, x, yy, z, rot, 0x5a5f66, 0, 0, run.y + 0.04)); }
      }
      // a flange coupling at the start of the segment (the manifold's, or the turn's); spheres round the turns
      { const f = new THREE.CylinderGeometry(rr * 1.45, rr * 1.45, 0.014, side); f.rotateZ(Math.PI / 2); f.rotateY(Math.atan2(-(bz - az), bx - ax)); f.translate(ax + dx * 0.06, gy(ax, az) + run.y, az + dz * 0.06); out.push(col(f, 0x7d838a)); }
      if (i < pts.length - 1 && k !== 'power') { const j = new THREE.SphereGeometry(r * 1.12, 6, 4); j.translate(bx, gy(bx, bz) + run.y, bz); out.push(col(j, hex)); }
    }
    // the end: a flanged collar against the wing's wall
    const [ex, ez] = pts[pts.length - 1], [px, pz] = pts[pts.length - 2], dl = Math.hypot(ex - px, ez - pz) || 1;
    const g = new THREE.CylinderGeometry(rr(k) * 1.6, rr(k) * 1.6, 0.016, side); g.rotateZ(Math.PI / 2); g.rotateY(Math.atan2(-(ez - pz), ex - px)); g.translate(ex - (ex - px) / dl * 0.01, gy(ex, ez) + run.y, ez - (ez - pz) / dl * 0.01); out.push(col(g, 0x7d838a));
  }
}
const rr = (k: 'power' | 'water' | 'chill'): number => (k === 'power' ? PIPE_R.power * 0.8 : PIPE_R[k]);
