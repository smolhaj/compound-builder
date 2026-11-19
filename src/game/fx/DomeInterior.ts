/**
 * Draws a big dome's floor dressing (domeInteriorPlan.ts): gravel paths from each airlock to a plaza, benches, supply crates, signs, planters, and lamp posts at the
 * plaza with their warm pools of light. Two draw calls (one merged vertex-colored mesh; one instanced mesh of lamp heads) and one instanced mesh of pools: no real lights.
 * Rides in the world at the dome's origin (local frame: the dome's center). SCALE v2.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial } from '../buildkit/materials';
import { BENCH, CRATE, PATH_W, type InteriorPlan } from './domeInteriorPlan';

export interface DomeInteriorFx { /** What was laid out (QA reads it to put the camera on a free path). */ plan: InteriorPlan; group: THREE.Group; /** The signature the world compares to decide a redraw (set by the caller). */ key: string; setUnder(on: boolean): void; dispose(): void }

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

export function makeDomeInterior(plan: InteriorPlan, ground: (lx: number, lz: number) => number, dark = false): DomeInteriorFx {
  const pieces: THREE.BufferGeometry[] = [], owned: Array<{ dispose(): void }> = [], gy = (x: number, z: number): number => ground(x, z);
  plan.segs.forEach((s, i) => {
    const y = gy(s.x, s.z) + 0.002;
    pieces.push(box(PATH_W, 0.02, s.len, s.x, y, s.z, s.rot, 0x8f846f, 0, 0, 0, 0.16, i));
    for (const k of [-1, 1]) pieces.push(box(0.022, 0.028, s.len, s.x, y, s.z, s.rot, 0x5f5a50, k * (PATH_W / 2 + 0.006), 0, 0, 0.1, i + 7));
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
  for (const l of plan.lamps) { const g = new THREE.CylinderGeometry(0.012, 0.016, 0.62, 6); g.translate(l.x, gy(l.x, l.z) + 0.31, l.z); pieces.push(col(g, 0x30343a)); }
  const group = new THREE.Group(); group.name = 'dome_interior';
  if (pieces.length) {
    const geo = mergeGeometries(pieces, false); pieces.forEach(g => g.dispose());
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.05, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat); mesh.name = 'dome_interior_props'; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.castShadow = false; mesh.receiveShadow = true;
    group.add(mesh); owned.push(geo, mat);
  }
  if (plan.lamps.length && !dark) {
    const n = plan.lamps.length, hg = new THREE.SphereGeometry(0.035, 8, 6), heads = new THREE.InstancedMesh(hg, kitMaterial('lamp'), n);
    const pg = new THREE.CircleGeometry(0.95, 24); pg.rotateX(-Math.PI / 2);
    const pools = new THREE.InstancedMesh(pg, kitMaterial('spill_electric'), n), m4 = new THREE.Matrix4();
    plan.lamps.forEach((l, i) => { const y = gy(l.x, l.z); heads.setMatrixAt(i, m4.makeTranslation(l.x, y + 0.65, l.z)); pools.setMatrixAt(i, m4.makeTranslation(l.x, y + 0.03, l.z)); });
    for (const m of [heads, pools]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; group.add(m); }
    pools.renderOrder = 2; owned.push(hg, pg);
  }
  if (plan.glows.length && !dark) {
    const g1 = new THREE.CircleGeometry(1, 28); g1.rotateX(-Math.PI / 2);
    const gl = new THREE.InstancedMesh(g1, kitMaterial('spill_electric_b'), plan.glows.length), m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), q0 = new THREE.Quaternion();
    plan.glows.forEach((o, i) => { m4.compose(new THREE.Vector3(o.x, gy(o.x, o.z) + 0.022, o.z), q0, sc.set(o.r, 1, o.r)); gl.setMatrixAt(i, m4); });
    gl.instanceMatrix.needsUpdate = true; gl.frustumCulled = false; gl.castShadow = false; gl.receiveShadow = false; gl.renderOrder = 1; group.add(gl); owned.push(g1);
  }
  const key = `${plan.segs.length}:${plan.benches.length}:${plan.crates.length}:${plan.lamps.length}:${dark ? 1 : 0}`;
  return { plan, group, key, setUnder: on => { group.visible = !on; }, dispose: () => { for (const o of owned) o.dispose(); } };
}
