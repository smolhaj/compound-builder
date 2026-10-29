/**
 * A bunker dig while it is open: bare earth draped over the cut, the spoil
 * heap beside it, and the hired mini excavator at the edge (while it is
 * digging or backfilling). Sizes in meters × M.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial, type KitMaterialId } from '../buildkit/materials';
import { worldUV } from '../buildkit/shell';

const M = 1 / 6;
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

/** Collect geometry per material; one mesh each. */
class Bits {
  private readonly map = new Map<KitMaterialId, THREE.BufferGeometry[]>();
  add(m: KitMaterialId, g: THREE.BufferGeometry): void { let l = this.map.get(m); if (!l) this.map.set(m, l = []); l.push(worldUV(g)); }
  finish(): THREE.Group {
    const g = new THREE.Group();
    for (const [m, list] of this.map) {
      const geo = mergeGeometries(list);
      list.forEach(x => x.dispose());
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, kitMaterial(m));
      mesh.castShadow = m !== 'glass';
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    return g;
  }
}

/**
 * A mini excavator (≈ 1.5 m wide, 2.5 m to the cab roof), facing +z with
 * the boom reaching forward and the bucket down at `reachDown` below its tracks.
 */
export function buildExcavator(reachDown = 0.4): THREE.Group {
  const b = new Bits();
  // tracks: two rubber track frames with idler wheels
  for (const sx of [-1, 1]) {
    b.add('iron', box(0.32 * M, 0.42 * M, 1.9 * M, sx * 0.6 * M, 0, 0));
    for (const sz of [-1, 1]) b.add('iron', new THREE.CylinderGeometry(0.21 * M, 0.21 * M, 0.32 * M, 12).rotateZ(Math.PI / 2).translate(sx * 0.6 * M, 0.21 * M, sz * 0.85 * M));
    b.add('steel', new THREE.CylinderGeometry(0.12 * M, 0.12 * M, 0.34 * M, 10).rotateZ(Math.PI / 2).translate(sx * 0.6 * M, 0.21 * M, 0.85 * M));
  }
  b.add('steel', box(0.9 * M, 0.2 * M, 1.2 * M, 0, 0.18 * M, 0));                          // undercarriage
  b.add('paint_yellow', box(1.5 * M, 0.08 * M, 0.25 * M, 0, 0.1 * M, 1.15 * M));            // dozer blade
  // upper structure: turntable, body, counterweight, cab with glass
  b.add('iron', new THREE.CylinderGeometry(0.55 * M, 0.55 * M, 0.12 * M, 16).translate(0, 0.48 * M, 0));
  b.add('paint_yellow', box(1.45 * M, 0.55 * M, 1.6 * M, 0, 0.54 * M, -0.1 * M));
  b.add('iron', box(1.45 * M, 0.45 * M, 0.3 * M, 0, 0.55 * M, -0.95 * M));                  // counterweight
  const cab = { x: -0.32 * M, z: 0.15 * M, w: 0.8 * M, d: 1.0 * M, y: 1.09 * M, h: 1.3 * M };
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add('iron', box(0.05 * M, cab.h, 0.05 * M, cab.x + sx * cab.w / 2, cab.y, cab.z + sz * cab.d / 2));
  b.add('paint_yellow', box(cab.w + 0.06 * M, 0.06 * M, cab.d + 0.06 * M, cab.x, cab.y + cab.h, cab.z));
  b.add('glass', box(cab.w - 0.02 * M, cab.h - 0.1 * M, cab.d - 0.02 * M, cab.x, cab.y + 0.05 * M, cab.z));
  b.add('iron', box(0.45 * M, 0.08 * M, 0.45 * M, cab.x, cab.y + 0.35 * M, cab.z - 0.1 * M));  // seat
  // boom (up and out), dipper arm (down into the dig), bucket
  const pivot = new THREE.Vector3(0.3 * M, 0.85 * M, 0.75 * M);
  const elbow = new THREE.Vector3(0.3 * M, 2.2 * M, 2.3 * M);
  const tip = new THREE.Vector3(0.3 * M, -reachDown + 0.35 * M, 3.0 * M);
  const beam = (a: THREE.Vector3, c: THREE.Vector3, w: number, h: number) => {
    const len = a.distanceTo(c), mid = a.clone().add(c).multiplyScalar(0.5);
    const g = new THREE.BoxGeometry(w, h, len).lookAt(c.clone().sub(a)).translate(mid.x, mid.y, mid.z);
    b.add('paint_yellow', g);
  };
  beam(pivot, elbow, 0.22 * M, 0.3 * M);
  beam(elbow, tip, 0.18 * M, 0.24 * M);
  for (const [a, c] of [[pivot.clone().add(new THREE.Vector3(0, -0.2 * M, 0.1 * M)), elbow.clone().add(new THREE.Vector3(0, -0.25 * M, -0.3 * M))], [elbow.clone().add(new THREE.Vector3(0, 0.2 * M, -0.1 * M)), tip.clone().add(new THREE.Vector3(0, 0.6 * M, -0.1 * M))]] as const) {
    const len = a.distanceTo(c), mid = a.clone().add(c).multiplyScalar(0.5);
    b.add('steel', new THREE.CylinderGeometry(0.05 * M, 0.05 * M, len, 8).rotateX(Math.PI / 2).lookAt(c.clone().sub(a)).translate(mid.x, mid.y, mid.z));   // rams
  }
  b.add('iron', box(0.55 * M, 0.45 * M, 0.45 * M, tip.x, tip.y - 0.4 * M, tip.z));
  for (let k = 0; k < 4; k++) b.add('steel', box(0.05 * M, 0.12 * M, 0.08 * M, tip.x - 0.2 * M + k * 0.13 * M, tip.y - 0.5 * M, tip.z + 0.2 * M));
  return b.finish();
}

/**
 * Dug earth in a windrow along a dig's side (the way an excavator casts it):
 * `len` long (world units, along x), up to ≈ 1.8 m high, as wide as the
 * volume needs (capped: the rest has been carted off), on the ground at the origin.
 */
export function spoilHeap(m3: number, len: number): THREE.BufferGeometry {
  const v = Math.min(Math.max(1, m3), 140) * M * M * M;
  const h = Math.min(1.8 * M, Math.cbrt(v) * 0.6), w = Math.max(0.15, Math.min(1.4, v / (len * h * 0.55)));
  const g = new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(len / 2 + w * 0.3, h, w / 2);
  // lumpy: nudge the vertices
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 23.1 + z * 11.7) * 0.06 + Math.sin(x * 7.3 - z * 17.9) * 0.05;
    p.setXYZ(i, x, y * (1 + n * 1.5), z * (1 + n));
  }
  g.computeVertexNormals();
  return g;
}

/** Bare earth draped over a rect of ground (the cut and its batters). */
export function drapeSoil(x0: number, z0: number, x1: number, z1: number, ground: (x: number, z: number) => number, n = 48): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, n, n).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, ground(p.getX(i), p.getZ(i)) + 0.004);
  g.computeVertexNormals();
  return g;
}

/**
 * A tipper truck (≈ 6 m long, 2.5 m wide), facing +z, bed hinged at the back (−z): `tip` 0..1 raises the bed (dumping the backfill).
 * Not pooled: it exists only while a dig is open.
 */
export function buildDumpTruck(tip = 0, loaded = true): THREE.Group {
  const b = new Bits();
  b.add('iron', box(1.1 * M, 0.3 * M, 5.6 * M, 0, 0.55 * M, 0));                                   // chassis rails
  for (const [z, d] of [[-1.7, 0.5], [-0.9, 0.5], [1.9, 0.45]] as const) for (const sx of [-1, 1]) {
    b.add('iron', new THREE.CylinderGeometry(0.5 * M, 0.5 * M, 0.38 * M, 14).rotateZ(Math.PI / 2).translate(sx * 1.05 * M, 0.5 * M, z * M));
    b.add('steel', new THREE.CylinderGeometry(0.22 * M, 0.22 * M, 0.4 * M, 10).rotateZ(Math.PI / 2).translate(sx * 1.05 * M, 0.5 * M, z * M));
    void d;
  }
  // cab: forward, a high roof, glass
  b.add('paint_yellow', box(2.3 * M, 1.5 * M, 1.5 * M, 0, 0.7 * M, 2.1 * M));
  b.add('glass', box(2.1 * M, 0.7 * M, 0.02 * M, 0, 1.45 * M, 2.86 * M));
  b.add('iron', box(2.4 * M, 0.4 * M, 0.6 * M, 0, 0.55 * M, 3.0 * M));                              // hood / bumper
  b.add('paint_yellow', box(2.3 * M, 0.1 * M, 1.7 * M, 0, 2.2 * M, 2.1 * M));
  // the tipper bed: floor, two sides, a front headboard over the cab; hinged at the rear
  const bed = new THREE.Group(), bb = new Bits();
  bb.add('rust', box(2.4 * M, 0.12 * M, 4.0 * M, 0, 0, 1.9 * M));
  for (const sx of [-1, 1]) bb.add('rust', box(0.1 * M, 1.1 * M, 4.0 * M, sx * 1.15 * M, 0.1 * M, 1.9 * M));
  bb.add('rust', box(2.4 * M, 1.1 * M, 0.1 * M, 0, 0.1 * M, 3.85 * M));
  if (loaded) bb.add('soil', new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.1 * M, 0.55 * M, 1.9 * M).translate(0, 1.0 * M, 1.9 * M));
  const bg = bb.finish();
  bed.add(bg);
  bed.position.set(0, 0.85 * M, -2.8 * M);
  bed.rotation.x = -tip * 0.6;           // the front rises: rotate about the rear hinge
  const g = b.finish();
  g.add(bed);
  g.traverse(o => { o.userData.own = true; });
  return g;
}

/** Plywood formwork round a wall pour: panels standing along the sides of a rect (x0..x1, z0..z1 in the group's frame), `h` tall, with walers, braces back to the soil and a rebar cage inside. */
export function buildFormwork(w: number, d: number, h: number): THREE.Group {
  const b = new Bits();
  const side = (len: number, x: number, z: number, alongX: boolean) => {
    const g = (m: KitMaterialId, bw: number, bh: number, bd: number, ox: number, oy: number, oz: number) => b.add(m, box(alongX ? bw : bd, bh, alongX ? bd : bw, x + (alongX ? ox : oz), oy, z + (alongX ? oz : ox)));
    g('frame', len, h, 0.012, 0, 0, 0);                                                              // plywood sheet
    for (const y of [0.25, 0.7]) if (y * h < h) g('wood_mid', len, 0.03 * M, 0.04 * M, 0, y * h, 0.02);        // walers
    for (let i = 0; i <= Math.floor(len / 0.2); i++) g('wood_mid', 0.04 * M, h, 0.03 * M, -len / 2 + i * (len / Math.max(1, Math.floor(len / 0.2))), 0, 0.024);   // studs
  };
  side(w + 0.04, 0, d / 2 + 0.012, true); side(w + 0.04, 0, -d / 2 - 0.012, true);
  side(d, w / 2 + 0.012, 0, false); side(d, -w / 2 - 0.012, 0, false);
  // diagonal braces out to stakes in the soil
  for (const [x, z, ax] of [[w * 0.3, d / 2 + 0.03, 0], [-w * 0.3, d / 2 + 0.03, 0], [w * 0.3, -d / 2 - 0.03, Math.PI], [-w * 0.3, -d / 2 - 0.03, Math.PI]] as const) {
    b.add('wood_mid', new THREE.BoxGeometry(0.03 * M, 0.03 * M, h * 1.2).rotateX(-0.7 * Math.sign(z)).translate(x, h * 0.45, z + Math.sign(z) * 0.07));
    void ax;
  }
  // rebar: horizontal mats, two layers a hand inside the sheet, bars every 20 cm
  for (const y of [0.3, 0.65]) {
    for (let i = -Math.floor(w / 0.08); i <= Math.floor(w / 0.08); i++) b.add('rust', box(0.012 * M, 0.012 * M, d - 0.04, i * 0.04, y * h, 0));
    for (let k = -Math.floor(d / 0.08); k <= Math.floor(d / 0.08); k++) b.add('rust', box(w - 0.04, 0.012 * M, 0.012 * M, 0, y * h + 0.006, k * 0.04));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('rust', box(0.018 * M, h * 1.08, 0.018 * M, sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03)));    // corner starter bars
  const g = b.finish(); g.traverse(o => { o.userData.own = true; });
  return g;
}

/** Corrugated steel culvert tube segments (2.6 m across, 6 m long) lying on timber cribbing beside a trench, waiting to be laid. */
export function buildTubeSegments(n: number): THREE.Group {
  const b = new Bits(), R = 1.3 * M, L = 5.5 * M;
  for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * (L + 0.25 * M);
    b.add('rust', new THREE.CylinderGeometry(R, R, L, 18, 1, true).rotateX(Math.PI / 2).translate(0, R + 0.2 * M, z));
    for (let k = 0; k <= 10; k++) b.add('rust', new THREE.TorusGeometry(R + 0.012, 0.03 * M, 5, 22).translate(0, R + 0.2 * M, z - L / 2 + k * L / 10));
    b.add('wood_dark', box(2.2 * M, 0.2 * M, 0.3 * M, 0, 0, z - L * 0.3)); b.add('wood_dark', box(2.2 * M, 0.2 * M, 0.3 * M, 0, 0, z + L * 0.3));
  }
  const g = b.finish(); g.traverse(o => { o.userData.own = true; });
  return g;
}

/** A settled mound of fresh backfill over a finished roof slab: `w` × `d` footprint, `h` high. */
export function earthMound(w: number, d: number, h: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(w / 2 + 0.1, h, d / 2 + 0.1);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = Math.sin(x * 19.3 + z * 13.1) * 0.05 + Math.sin(x * 6.1 - z * 15.7) * 0.04; p.setXYZ(i, x, y * (1 + n * 1.6), z * (1 + n)); }
  g.computeVertexNormals();
  return g;
}
