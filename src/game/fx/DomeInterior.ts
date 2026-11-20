/**
 * The pieces of a big dome's floor dressing (domeInteriorPlan.ts): gravel paths with curbs, plaza, benches, supply crates, signs and planters, as vertex-colored geometry
 * in the dome's local frame. `fx/DomePlant.ts` merges them into the plant's own mesh and its lamp instances (the lamp posts, heads and pools of light), so the dressing
 * costs no draw call of its own (the dome scenes in scripts/perfBudget.json have no room for one). SCALE v2.
 */
import * as THREE from 'three';
import { BENCH, CRATE, LANE_W, PATH_W, type InteriorPlan } from './domeInteriorPlan';


const col = (g: THREE.BufferGeometry, hex: number, jitter = 0, seed = 0): THREE.BufferGeometry => {
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
  const c = new THREE.Color(hex), k = 1 + (((Math.sin(seed * 12.9898) * 43758.5453) % 1) - 0.5) * jitter, n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
/** A box standing on y0 (its bottom), turned by `rot` about its own center, then moved to (x, z). */
const box = (w: number, h: number, d: number, x: number, y0: number, z: number, rot: number, hex: number, ox = 0, oz = 0, oy = 0, jitter = 0, seed = 0): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(ox, h / 2 + oy, oz); g.rotateY(rot); g.translate(x, y0, z);
  return col(g, hex, jitter, seed);
};

export function interiorPieces(plan: InteriorPlan, ground: (lx: number, lz: number) => number): THREE.BufferGeometry[] {
  const pieces: THREE.BufferGeometry[] = [], gy = (x: number, z: number): number => ground(x, z);
  plan.segs.forEach((s, i) => {
    const y = gy(s.x, s.z) + 0.002;
    const w = s.w ?? PATH_W, lane = w >= LANE_W;
    pieces.push(box(w, 0.02, s.len, s.x, y, s.z, s.rot, lane ? 0x6f6c68 : 0x8f846f, 0, 0, 0, 0.16, i));
    for (const k of [-1, 1]) pieces.push(box(0.022, 0.028, s.len, s.x, y, s.z, s.rot, 0x5f5a50, k * (w / 2 + 0.006), 0, 0, 0.1, i + 7));
  });
  if (plan.plaza) {
    const g = new THREE.CylinderGeometry(plan.plaza.r, plan.plaza.r, 0.02, 28); g.translate(plan.plaza.x, gy(plan.plaza.x, plan.plaza.z) + 0.012, plan.plaza.z); pieces.push(col(g, 0x9a8f7a));
    const ring = new THREE.CylinderGeometry(plan.plaza.r + 0.03, plan.plaza.r + 0.03, 0.026, 28); ring.translate(plan.plaza.x, gy(plan.plaza.x, plan.plaza.z) + 0.008, plan.plaza.z); pieces.push(col(ring, 0x5f5a50));
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
  return pieces;
}
