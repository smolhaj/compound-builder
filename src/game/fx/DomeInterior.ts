/**
 * The pieces of a big dome's floor dressing (domeInteriorPlan.ts): gravel paths with curbs, plaza, benches, supply crates, signs and planters, as vertex-colored geometry
 * in the dome's local frame. `fx/DomePlant.ts` merges them into the plant's own mesh and its lamp instances (the lamp posts, heads and pools of light), so the dressing
 * costs no draw call of its own (the dome scenes in scripts/perfBudget.json have no room for one). SCALE v2.
 */
import * as THREE from 'three';
import { BENCH, CRATE, LANE_W, PATH_W, type InteriorPlan } from './domeInteriorPlan';
import type { ControlBlockPlan } from '../../sim/dome/controlBlock';
import { detailTier } from '../buildkit/buildingDetail';


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
  const pieces: THREE.BufferGeometry[] = [], gy = (x: number, z: number): number => ground(x, z);
  plan.segs.forEach((s, i) => {
    const y = gy(s.x, s.z) + 0.002;
    const w = s.w ?? PATH_W, lane = w >= LANE_W;
    if (lane) return;   // (the vehicle lane is the entrance complex's own poured lane, fx/VehiclePorts: a second one drawn here floated in slabs over it)
    pieces.push(box(w, 0.02, s.len, s.x, y, s.z, s.rot, lane ? 0x6f6c68 : 0x8e9094, 0, 0, 0, 0.16, i, [0, 1, 3, 4, 5]));
    for (const k of [-1, 1]) pieces.push(box(0.022, 0.028, s.len, s.x, y, s.z, s.rot, 0x5a5d62, k * (w / 2 + 0.006), 0, 0, 0.1, i + 7, [3, 4, 5]));
  });
  if (plan.plaza) {
    const g = new THREE.CylinderGeometry(plan.plaza.r, plan.plaza.r, 0.02, 28); g.translate(plan.plaza.x, gy(plan.plaza.x, plan.plaza.z) + 0.012, plan.plaza.z); pieces.push(col(g, 0x969a9d));
    const ring = new THREE.CylinderGeometry(plan.plaza.r + 0.03, plan.plaza.r + 0.03, 0.026, 28); ring.translate(plan.plaza.x, gy(plan.plaza.x, plan.plaza.z) + 0.008, plan.plaza.z); pieces.push(col(ring, 0x5a5d62));
  }
  for (const b of plan.benches) {
    const y = gy(b.x, b.z), { len, dep, seat, back } = BENCH;
    pieces.push(box(len, 0.012, dep, b.x, y, b.z, b.rot, 0x7d5b3a, 0, 0, seat - 0.012));
    pieces.push(box(len, 0.055, 0.01, b.x, y, b.z, b.rot, 0x6f4f31, 0, -dep / 2 + 0.005, seat + 0.012));
    pieces.push(box(len, 0.012, 0.01, b.x, y, b.z, b.rot, 0x6f4f31, 0, -dep / 2 + 0.005, back - 0.012));
    for (const k of [-1, 1]) { pieces.push(box(0.012, seat - 0.012, dep * 0.85, b.x, y, b.z, b.rot, 0x30343a, k * (len / 2 - 0.02))); pieces.push(box(0.012, back - seat, 0.01, b.x, y, b.z, b.rot, 0x30343a, k * (len / 2 - 0.02), -dep / 2 + 0.005, seat)); }
  }
  plan.crates.forEach((c, i) => {
    const y = gy(c.x, c.z), cs = [0x8a6a3c, 0x5f6f4a, 0x7d7f84];
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
    const y = gy(p.x, p.z);
    pieces.push(box(0.17, 0.05, 0.08, p.x, y, p.z, p.rot, 0x6b6459));
    for (const k of [-1, 0, 1]) { const g = new THREE.IcosahedronGeometry(0.04 + 0.006 * ((i + k) % 2), 0); g.scale(1, 0.8, 1); g.translate(k * 0.05, 0.075, 0); g.rotateY(p.rot); g.translate(p.x, y, p.z); pieces.push(col(g, 0x4a7a3a, 0.3, i * 3 + k)); }
  });
  if (plan.control) controlPieces(plan.control, ground, pieces);
  return pieces;
}

const KIND_HEX: Record<'power' | 'water' | 'chill', number> = { power: 0xd9822b, water: 0x2f7fb5, chill: 0xb9c6cf };
const KIND_R: Record<'power' | 'water' | 'chill', number> = { power: 0.016, water: 0.02, chill: 0.032 };
/**
 * The control block's lines from the plant yard: three pipe runs (power conduit, water, chilled-water duct) rise from the manifold beside the yard's service airlock and run on
 * stanchions to the block's utility wings, with flanged joints, elbows and a hazard-striped manifold box (sim/dome/controlBlock.ts). Vertex-colored, merged with the floor dressing.
 */
function controlPieces(cb: ControlBlockPlan, ground: (lx: number, lz: number) => number, out: THREE.BufferGeometry[]): void {
  const gy = (x: number, z: number): number => ground(x, z), hi = detailTier() === 'high';
  const yaw = Math.atan2(cb.yardDoor[0] - cb.manifold[0], cb.yardDoor[1] - cb.manifold[1]) + Math.PI;
  const [mx, mz] = cb.manifold, y0 = gy(mx, mz);
  // the manifold: a dark armored box on a plinth with a hazard stripe, a warning plate and three flanged stubs
  out.push(box(0.42, 0.03, 0.26, mx, y0, mz, yaw, 0x585d63));
  out.push(box(0.36, 0.17, 0.2, mx, y0, mz, yaw, 0x3a424b, 0, 0, 0.03, 0.08, 3));
  out.push(box(0.37, 0.022, 0.21, mx, y0, mz, yaw, 0xe3b92a, 0, 0, 0.1));
  out.push(box(0.38, 0.012, 0.22, mx, y0, mz, yaw, 0x2a2f35, 0, 0, 0.2));
  out.push(box(0.1, 0.06, 0.006, mx, y0, mz, yaw, 0xe3b92a, 0.1, 0.103, 0.11));
  (['power', 'water', 'chill'] as const).forEach((k, i) => { const g = new THREE.CylinderGeometry(0.026, 0.026, 0.02, 8); g.rotateX(Math.PI / 2); g.translate(-0.12 + i * 0.12, 0.09, -0.108); g.rotateY(yaw); g.translate(mx, y0 + 0.03, mz); out.push(col(g, KIND_HEX[k])); });
  for (const run of cb.pipes) {
    const r = KIND_R[run.kind], hex = KIND_HEX[run.kind], pts = run.pts;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az);
      if (L < 0.02) continue;
      const mxp = (ax + bx) / 2, mzp = (az + bz) / 2, y = gy(mxp, mzp) + run.y;
      const g = new THREE.CylinderGeometry(r, r, L, hi ? (run.kind === 'chill' ? 10 : 7) : 5); g.rotateZ(Math.PI / 2); g.rotateY(Math.atan2(-(bz - az), bx - ax)); g.translate(mxp, y, mzp);
      out.push(col(g, hex, 0.06, i * 3 + run.y * 100));
      // a power run is a pair of conduits side by side; a chilled-water duct is wrapped in a lighter jacket with a dark seam
      if (run.kind === 'power') { const g2 = new THREE.CylinderGeometry(r * 0.8, r * 0.8, L, 6); g2.rotateZ(Math.PI / 2); g2.rotateY(Math.atan2(-(bz - az), bx - ax)); g2.translate(mxp - (bz - az) / L * 0.04, y + 0.01, mzp + (bx - ax) / L * 0.04); out.push(col(g2, 0xc47524)); }
      // a flanged joint and a stanchion every ~0.4 along the run
      const n = Math.max(1, Math.round(L / (hi ? 0.45 : 0.8))), rot = Math.atan2(bx - ax, bz - az);
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, yy = gy(x, z);
        out.push(box(0.014, run.y + 0.002, 0.05, x, yy, z, rot, 0x30343a, 0, 0, 0, 0, 0, [3, 4, 5]));
        if (hi) out.push(box(0.05, 0.01, 0.014, x, yy, z, rot, 0x30343a, 0, 0, run.y - r - 0.004));
        if (hi && k % 2 === 0) { const f = new THREE.CylinderGeometry(r * 1.45, r * 1.45, 0.012, 8); f.rotateZ(Math.PI / 2); f.rotateY(Math.atan2(-(bz - az), bx - ax)); f.translate(x, yy + run.y, z); out.push(col(f, 0x7d838a)); }
      }
      if (hi && i < pts.length - 1) { const j = new THREE.SphereGeometry(r * 1.2, 7, 5); j.translate(bx, gy(bx, bz) + run.y, bz); out.push(col(j, hex)); }
    }
    // the end of the run: a flanged collar against the wing's wall
    const [ex, ez] = pts[pts.length - 1], g = new THREE.CylinderGeometry(r * 1.5, r * 1.5, 0.014, 8); g.rotateX(Math.PI / 2); const [px, pz] = pts[pts.length - 2];
    g.rotateY(Math.atan2(ex - px, ez - pz)); g.translate(ex, gy(ex, ez) + run.y, ez); out.push(col(g, 0x7d838a));
  }
}
