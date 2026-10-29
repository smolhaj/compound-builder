/**
 * The way in, drawn (docs/DECISIONS.md, "Roads follow the land"): from the
 * plan (sim/roadPlan.ts) a curved gravel ribbon on the benched ground, banked
 * on the curves, with what the land asks of it: stone-faced banks where the
 * cut or fill is tall, a guardrail on the drop side and round the hairpins, a
 * culvert with pipe ends and headwalls, a ford or a low-water slab with vent
 * pipes and depth posts, a one-lane plank-and-steel bridge on stone abutments,
 * a rough stone portal at each end of a rock bore, a cattle guard at the gate,
 * a cairn on the pass, a curve-warning sign before each hairpin, a dry-stack
 * wall along a New England lane. Real scale (1 u = 6 m): the drive is 0.55
 * wide, a pickup 0.31 × 0.75, a person 0.28.
 *
 * Draw calls: one ribbon per run of surface plus one merged mesh per material
 * (about 8 in all), however long the road. Procedural only.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildRibbon } from '../../engine/world/roads/RoadRibbon';
import { kitMaterial, type KitMaterialId } from '../buildkit/materials';
import { BED } from '../../sim/roadBed';
import { NO_BED, spanIndices, type RoadPlan } from '../../sim/roadPlan';
import { ROAD_STYLE } from '../../sim/roadStyle';

type Ground = (x: number, z: number) => number;
type V3 = [number, number, number];

/** Merged geometry per material: boxes, beams and tubes are queued, then one mesh each. */
class Parts {
  private readonly _by = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; shadow: boolean }>();
  private _mat(key: KitMaterialId | 'dark' | 'rust' | 'white'): THREE.Material {
    if (key === 'dark') return DARK;
    if (key === 'rust') return RUST;
    if (key === 'white') return WHITE;
    return kitMaterial(key);
  }
  add(key: KitMaterialId | 'dark' | 'rust' | 'white', g: THREE.BufferGeometry, shadow = true): void {
    let e = this._by.get(key);
    if (!e) { e = { mat: this._mat(key), geos: [], shadow }; this._by.set(key, e); }
    e.geos.push(g);
  }
  /** A box `sx` across, `sy` tall, `sz` long, centred at (cx, cy, cz), turned `rot` about y; texture in world units. */
  box(key: KitMaterialId | 'dark' | 'rust' | 'white', cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rot = 0, shadow = true): void {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    scaleBoxUv(g, sx, sy, sz);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(rot).setPosition(cx, cy, cz));
    this.add(key, g, shadow);
  }
  /** A beam from a to b: `w` wide (horizontal, across), `h` tall. */
  seg(key: KitMaterialId | 'dark' | 'rust' | 'white', a: V3, b: V3, w: number, h: number, shadow = true): void {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
    if (len < 1e-5) return;
    d.divideScalar(len);
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d);
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    right.normalize();
    const up = new THREE.Vector3().crossVectors(d, right).normalize();
    const g = new THREE.BoxGeometry(w, h, len);
    scaleBoxUv(g, w, h, len);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(right, up, d).setPosition((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2));
    this.add(key, g, shadow);
  }
  /** A tube from a to b. */
  tube(key: KitMaterialId | 'dark' | 'rust' | 'white', a: V3, b: V3, r: number, segs = 10, shadow = true): void {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
    if (len < 1e-5) return;
    const g = new THREE.CylinderGeometry(r, r, len, segs, 1, false);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(len));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, 1, 1)));
    this.add(key, g, shadow);
  }
  build(into: THREE.Group): void {
    for (const e of this._by.values()) {
      const merged = mergeGeometries(e.geos.map(g => { const x = g.index ? g.toNonIndexed() : g; for (const n of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(n)) x.deleteAttribute(n); return x; }), false);
      for (const g of e.geos) g.dispose();
      if (!merged) continue;
      const m = new THREE.Mesh(merged, e.mat);
      m.castShadow = e.shadow; m.receiveShadow = true;
      into.add(m);
    }
  }
}

/** Faces of a box carry UVs in world units (the kit's textures repeat per TEX_WORLD). */
function scaleBoxUv(g: THREE.BoxGeometry, sx: number, sy: number, sz: number): void {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims: Array<[number, number]> = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const k = f * 4 + v; uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]); }
}

const DARK = new THREE.MeshBasicMaterial({ color: 0x15120f, side: THREE.DoubleSide });
const RUST = new THREE.MeshStandardMaterial({ color: 0x7a4a2c, roughness: 0.75, metalness: 0.45 });
const WHITE = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.6 });

// ── helpers ──

interface Frame { x: number; z: number; y: number; rot: number; fx: number; fz: number; nx: number; nz: number; bank: number }

function frames(plan: RoadPlan): Frame[] {
  const p = plan.pts, n = p.length;
  return p.map((q, i) => {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)], rot = Math.atan2(b.x - a.x, b.z - a.z), fx = Math.sin(rot), fz = Math.cos(rot);
    return { x: q.x, z: q.z, y: q.y, rot, fx, fz, nx: fz, nz: -fx, bank: q.bank };
  });
}

/** A strip following the ground at signed offsets [o0, o1] from the centre line of stations i0..i1 (the stone facing on a bank), UVs in world units. */
function bankStrip(fr: readonly Frame[], i0: number, i1: number, o0: number, o1: number, ground: Ground, lift: number): THREE.BufferGeometry {
  const rows = i1 - i0 + 1, across = 4, pos = new Float32Array(rows * (across + 1) * 3), uv = new Float32Array(rows * (across + 1) * 2), idx: number[] = [];
  let sAcc = 0;
  for (let r = 0; r < rows; r++) {
    const f = fr[i0 + r];
    if (r > 0) sAcc += Math.hypot(f.x - fr[i0 + r - 1].x, f.z - fr[i0 + r - 1].z);
    for (let k = 0; k <= across; k++) {
      const o = o0 + (o1 - o0) * k / across, x = f.x + f.nx * o, z = f.z + f.nz * o, q = r * (across + 1) + k;
      pos[q * 3] = x; pos[q * 3 + 1] = ground(x, z) + lift; pos[q * 3 + 2] = z;
      uv[q * 2] = sAcc; uv[q * 2 + 1] = Math.abs(o - o0);
    }
  }
  for (let r = 0; r < rows - 1; r++) for (let k = 0; k < across; k++) { const a = r * (across + 1) + k, b = a + 1, c = a + across + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface RoadWorksOpts {
  /** The drive is built (benched, structures, walls); else a two-track along the survey line. */
  built: boolean;
  /** Surface material for the built road, and the two-track's. */
  surface: THREE.Material; track: THREE.Material;
  driveW: number;
  /** The bridge on the way in is down: its abutments stand, the deck and rails are gone. */
  bridgeDown?: boolean;
  /** The natural ground (no road): culverts find where the fill meets it. */
  natural: Ground;
}

/** Everything the plan draws on the ground, in one group. */
export function buildRoadWorks(plan: RoadPlan, ground: Ground, o: RoadWorksOpts): THREE.Group {
  const group = new THREE.Group();
  group.name = 'roadworks';
  const fr = frames(plan), n = fr.length;
  const style = ROAD_STYLE[plan.region];
  /** The first station at or past a distance along the road. */
  const stationAt = (sAlong: number) => { let lo = 0, hi = n - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (plan.pts[m].s < sAlong) lo = m + 1; else hi = m; } return lo; };
  // the surface runs: everything but the spans a deck, a bore or a slab covers
  const cover = new Uint8Array(n);
  // (the ribbon runs on to the first and last station of the span, so no gap shows at a portal or an abutment)
  if (o.built) for (const s of plan.structures) if (NO_BED.has(s.kind)) { const [a, b] = spanIndices(plan, s); for (let i = a + 1; i < b; i++) cover[i] = 1; }
  const runs: Array<[number, number]> = [];
  for (let i = 0; i < n;) {
    if (cover[i]) { i++; continue; }
    let j = i; while (j + 1 < n && !cover[j + 1]) j++;
    if (j - i >= 1) runs.push([i, j]);
    i = j + 1;
  }
  const w = o.built ? o.driveW : o.driveW * 0.55;
  for (const [a, b] of runs) {
    const line = fr.slice(a, b + 1).map(f => [f.x, f.z] as [number, number]);
    const m = new THREE.Mesh(buildRibbon(line, w, ground, o.built ? 0.024 : 0.012, 4), o.built ? o.surface : o.track);
    m.receiveShadow = true; group.add(m);
  }
  if (!o.built) return group;

  const parts = new Parts();
  const stone = new Parts();
  // ── stone facing on tall banks, a parapet on a tall fill ──
  for (const wl of plan.walls) {
    const i0 = stationAt(wl.s0 - 1e-6), i1 = stationAt(wl.s1 + 1e-6);
    if (i1 <= i0) continue;
    const sg = wl.side === 'L' ? 1 : -1, h = Math.min(0.5, wl.heightU), reach = h * (wl.kind === 'cut' ? BED.cutRatio : BED.fillRatio);
    const g = bankStrip(fr, i0, i1, sg * BED.halfW, sg * (BED.halfW + reach), ground, 0.012);
    const mesh = new THREE.Mesh(g, kitMaterial('fieldstone'));
    mesh.receiveShadow = true; mesh.castShadow = false;
    group.add(mesh);
    if (wl.kind === 'fill') for (let i = i0; i < i1; i += 2) {
      const f = fr[i], ox = f.x + f.nx * sg * (BED.halfW + 0.02), oz = f.z + f.nz * sg * (BED.halfW + 0.02);
      stone.box('fieldstone', ox, ground(ox, oz) + 0.03, oz, 0.07, 0.06 + 0.01 * ((i * 7) % 3), 0.5, f.rot);
    }
  }
  // ── guardrail ──
  const rail = style.guardrail;
  for (const r of plan.rails) {
    const i0 = stationAt(r.s0 - 1e-6);
    let i1 = i0; while (i1 + 1 < n && plan.pts[i1 + 1].s <= r.s1 + 1e-6) i1++;
    if (i1 <= i0) continue;
    const sg = r.side === 'L' ? 1 : -1;
    let prev: V3 | null = null;
    for (let i = i0; i <= i1; i += 3) {
      const f = fr[i], x = f.x + f.nx * sg * (BED.halfW - 0.02), z = f.z + f.nz * sg * (BED.halfW - 0.02), y = ground(x, z);
      if (rail === 'steel') {
        parts.box('steel', x, y + 0.05, z, 0.02, 0.1, 0.02, f.rot);
        const top: V3 = [x, y + 0.095, z];
        if (prev) parts.seg('steel', prev, top, 0.012, 0.055);
        prev = top;
      } else {
        // log posts and a rail: weathered timber
        parts.box('wood_dark', x, y + 0.045, z, 0.032, 0.09, 0.032, f.rot);
        const top: V3 = [x, y + 0.075, z];
        if (prev) parts.tube('wood_mid', prev, top, 0.016, 6);
        prev = top;
      }
    }
  }
  // ── structures ──
  for (const sx of plan.structures) {
    const [a, b] = spanIndices(plan, sx);
    switch (sx.kind) {
      case 'culvert': case 'arch_culvert': culvert(parts, fr, a, b, ground, o.natural, sx.kind === 'arch_culvert'); break;
      case 'ford': case 'low_water': slab(parts, fr, plan, a, b, ground, sx.kind === 'low_water'); break;
      case 'bridge1': case 'bridge': bridge(parts, stone, fr, plan, a, b, ground, sx.kind === 'bridge', !!o.bridgeDown); break;
      case 'tunnel': portals(group, stone, fr, a, b, ground); break;
      case 'cattle_guard': cattleGuard(parts, fr[Math.round((a + b) / 2)]); break;
      case 'pass': cairn(stone, fr[Math.round((a + b) / 2)], ground); break;
    }
  }
  // ── signs and delineators on the hairpins ──
  for (const h of plan.hairpins) {
    // the sign stands on the outside of the approach, 4 units before the apex, turned to the traffic coming in
    const i = stationAt(h.s - 4), f = fr[i], outSide = h.out === 'L' ? 1 : -1;
    const x = f.x + f.nx * outSide * (BED.halfW + 0.05), z = f.z + f.nz * outSide * (BED.halfW + 0.05), y = ground(x, z);
    parts.box('steel', x, y + 0.08, z, 0.012, 0.16, 0.012, f.rot);
    const sign = new THREE.BoxGeometry(0.11, 0.11, 0.008);
    sign.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 4));
    sign.applyMatrix4(new THREE.Matrix4().makeRotationY(f.rot + Math.PI).setPosition(x, y + 0.2, z));
    parts.add('paint_yellow', sign);
    // delineator posts round the apex
    for (let k = stationAt(h.s - 2.5); k < n && plan.pts[k].s < h.s + 2.5; k += 5) {
      const q = fr[k], px = q.x + q.nx * outSide * (BED.halfW + 0.03), pz = q.z + q.nz * outSide * (BED.halfW + 0.03);
      parts.box('white', px, ground(px, pz) + 0.035, pz, 0.014, 0.07, 0.014, q.rot);
    }
  }
  // ── a dry-stack wall along the lane (New England) ──
  if (style.laneWall) {
    const gate = plan.gateAt;
    for (const sg of [1, -1]) for (let i = gate + 6; i < n - 8; i += 2) {
      if (cover[i]) continue;
      const f = fr[i], x = f.x + f.nx * sg * (BED.halfW + 0.14), z = f.z + f.nz * sg * (BED.halfW + 0.14), y = ground(x, z);
      if (Math.abs(y - f.y) > 0.14 || fr[Math.max(0, i - 2)] === undefined) continue;
      // gaps: a gate gap now and then and where the road bends hard
      if ((i * 31 + (sg > 0 ? 7 : 3)) % 41 < 3) continue;
      stone.box('fieldstone', x, y + 0.045, z, 0.07, 0.09 + 0.012 * ((i * 13) % 4), 0.62, f.rot);
    }
  }
  parts.build(group);
  stone.build(group);
  return group;
}

// ── culvert: a corrugated pipe through the fill, ends at the toe of the slope, a headwall each ──

function culvert(parts: Parts, fr: readonly Frame[], a: number, b: number, ground: Ground, natural: Ground, big: boolean): void {
  const f = fr[Math.round((a + b) / 2)], r = big ? 0.08 : 0.05;
  const toe = (sg: number): V3 => {
    // walk out along the cross-section to where the fill slope meets the natural ground
    let o = BED.halfW + 0.1;
    for (; o < 4; o += 0.05) { const x = f.x + f.nx * sg * o, z = f.z + f.nz * sg * o; if (ground(x, z) - natural(x, z) < 0.02) break; }
    const x = f.x + f.nx * sg * (o + 0.06), z = f.z + f.nz * sg * (o + 0.06);
    return [x, natural(x, z) + r + 0.01, z];
  };
  const A = toe(1), B = toe(-1);
  // the pipe: corrugated metal
  parts.tube('steel', A, B, r, 12);
  for (const e of [A, B]) {
    // a headwall of concrete round the mouth
    parts.box('concrete', e[0], e[1] - r * 0.2, e[2], 0.2 + (big ? 0.1 : 0), r * 2.6, 0.04, f.rot + Math.PI / 2);
    // the dark inside
    parts.tube('dark', [e[0], e[1], e[2]], [e[0] + (e === A ? -1 : 1) * f.nx * 0.001, e[1], e[2] + (e === A ? -1 : 1) * f.nz * 0.001], r * 0.92, 10, false);
  }
}

// ── a ford / low-water slab with vent pipes and depth posts ──

function slab(parts: Parts, fr: readonly Frame[], plan: RoadPlan, a: number, b: number, ground: Ground, vents: boolean): void {
  const lo = Math.max(0, a - 1), hi = Math.min(fr.length - 1, b + 1);
  for (let i = lo; i < hi; i++) {
    const p = fr[i], q = fr[i + 1], len = Math.hypot(q.x - p.x, q.z - p.z);
    const y = (plan.pts[i].y + plan.pts[i + 1].y) / 2;
    parts.box('concrete', (p.x + q.x) / 2, y - (vents ? 0.07 : 0.03), (p.z + q.z) / 2, 0.62, vents ? 0.14 : 0.06, len + 0.04, Math.atan2(q.x - p.x, q.z - p.z), true);
  }
  const mid = fr[Math.round((a + b) / 2)];
  if (vents) {
    // three vent pipes through the slab, mouths showing on both faces
    for (const k of [-0.18, 0, 0.18]) for (const sg of [1, -1]) {
      const x = mid.x + mid.fx * k + mid.nx * sg * 0.32, z = mid.z + mid.fz * k + mid.nz * sg * 0.32;
      parts.tube('dark', [x, plan.pts[Math.round((a + b) / 2)].y - 0.08, z], [x + mid.nx * sg * 0.01, plan.pts[Math.round((a + b) / 2)].y - 0.08, z + mid.nz * sg * 0.01], 0.034, 10, false);
    }
  }
  // depth posts at each end: white with a red band, 1 m
  for (const [i, sg] of [[lo, 1], [hi, 1], [lo, -1], [hi, -1]] as const) {
    const f = fr[i], x = f.x + f.nx * sg * 0.34, z = f.z + f.nz * sg * 0.34, y = ground(x, z);
    parts.box('white', x, y + 0.1, z, 0.02, 0.2, 0.02, f.rot);
    parts.box('paint_red', x, y + 0.17, z, 0.022, 0.04, 0.022, f.rot);
  }
}

// ── a one-lane bridge: plank deck on two steel girders, stone abutments, a rail each side ──

function bridge(parts: Parts, stone: Parts, fr: readonly Frame[], plan: RoadPlan, a: number, b: number, ground: Ground, big: boolean, down: boolean): void {
  const W = big ? 0.78 : 0.62;
  for (let i = a; !down && i < b; i++) {
    const p = fr[i], q = fr[i + 1], len = Math.hypot(q.x - p.x, q.z - p.z), y = (plan.pts[i].y + plan.pts[i + 1].y) / 2, rot = Math.atan2(q.x - p.x, q.z - p.z);
    const mx = (p.x + q.x) / 2, mz = (p.z + q.z) / 2, nx = Math.cos(rot), nz = -Math.sin(rot);
    parts.box('deck', mx, y - 0.0175, mz, W, 0.035, len + 0.02, rot);
    for (const s of [-1, 1]) {
      parts.box('rust', mx + nx * s * W * 0.34, y - 0.085, mz + nz * s * W * 0.34, 0.032, 0.07, len + 0.02, rot);
    }
    // cross-bracing every few stations
    if ((i - a) % 3 === 0) parts.box('rust', mx, y - 0.075, mz, W * 0.7, 0.012, 0.014, rot);
  }
  // rails: posts every 0.3, two bars
  for (const s of down ? [] : [-1, 1]) {
    let prev: V3 | null = null, prev2: V3 | null = null;
    for (let i = a; i <= b; i += 2) {
      const f = fr[i], x = f.x + f.nx * s * (W / 2 - 0.015), z = f.z + f.nz * s * (W / 2 - 0.015), y = plan.pts[i].y;
      parts.box('steel', x, y + 0.075, z, 0.02, 0.15, 0.02, f.rot);
      const t1: V3 = [x, y + 0.14, z], t2: V3 = [x, y + 0.075, z];
      if (prev) parts.seg('steel', prev, t1, 0.012, 0.014);
      if (prev2) parts.seg('steel', prev2, t2, 0.012, 0.012);
      prev = t1; prev2 = t2;
    }
  }
  // abutments: stone blocks down to the ground, a little wider than the deck, with wing walls
  for (const [i, dir] of [[a, -1], [b, 1]] as const) {
    const f = fr[i], y = plan.pts[i].y;
    const x = f.x + f.fx * dir * 0.06, z = f.z + f.fz * dir * 0.06;
    let low = Infinity;
    for (const k of [-1, 0, 1]) low = Math.min(low, ground(x + f.nx * k * W * 0.45, z + f.nz * k * W * 0.45));
    const hgt = Math.max(0.12, y - low + 0.05);
    stone.box('fieldstone', x, y - 0.035 - hgt / 2 + 0.035, z, W + 0.16, hgt, 0.16, f.rot);
    for (const s of [-1, 1]) stone.box('fieldstone', x - f.fx * dir * 0.09 + f.nx * s * (W / 2 + 0.1), y - hgt * 0.4, z - f.fz * dir * 0.09 + f.nz * s * (W / 2 + 0.1), 0.1, hgt * 0.8, 0.32, f.rot);
  }
  void big;
}

// ── a rock bore: a rough stone portal at each end, a dark tube between ──

const ARCH_W = 0.66, ARCH_H = 0.46;

function portals(group: THREE.Group, stone: Parts, fr: readonly Frame[], a: number, b: number, ground: Ground): void {
  const A = fr[a], B = fr[b];
  // the dark tube: an arch profile extruded along the bore, seen from inside
  const prof = new THREE.Shape();
  prof.moveTo(-ARCH_W / 2, 0); prof.lineTo(-ARCH_W / 2, ARCH_H);
  prof.absarc(0, ARCH_H, ARCH_W / 2, Math.PI, 0, true);
  prof.lineTo(ARCH_W / 2, 0); prof.lineTo(-ARCH_W / 2, 0);
  const len = Math.hypot(B.x - A.x, B.z - A.z) + 0.2;
  const tube = new THREE.ExtrudeGeometry(prof, { depth: len, bevelEnabled: false, curveSegments: 10 });
  const rot = Math.atan2(B.x - A.x, B.z - A.z), mid = new THREE.Mesh(tube, new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 1, side: THREE.BackSide }));
  mid.position.set(A.x - Math.sin(rot) * 0.1, A.y - 0.0, A.z - Math.cos(rot) * 0.1);
  mid.rotation.y = rot;
  // (the road inside: a dark floor)
  group.add(mid);
  // lights inside so the bore reads as a tunnel, not a hole
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(ARCH_W * 0.98, len).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 1 }));
  dark.position.set((A.x + B.x) / 2, (A.y + B.y) / 2 + 0.004, (A.z + B.z) / 2); dark.rotation.y = rot;
  group.add(dark);
  // the two faces
  for (const [f, out] of [[A, -1], [B, 1]] as const) portalFace(group, stone, f, out, ground);
}

function portalFace(group: THREE.Group, stone: Parts, f: Frame, out: number, ground: Ground): void {
  // `out` is +1 where the opening looks along the road's heading (the far end of the bore), -1 at the near end.
  // The face is a stone block with the arch cut from it, extruded 0.3 deep into the hill.
  const W = 1.7, H = 1.0, D = 0.3;
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2, -0.4); shape.lineTo(W / 2, -0.4); shape.lineTo(W / 2, H); shape.lineTo(-W / 2, H); shape.lineTo(-W / 2, -0.4);
  const hole = new THREE.Path();
  hole.moveTo(-ARCH_W / 2, 0); hole.lineTo(-ARCH_W / 2, ARCH_H);
  hole.absarc(0, ARCH_H, ARCH_W / 2, Math.PI, 0, true);
  hole.lineTo(ARCH_W / 2, 0); hole.lineTo(-ARCH_W / 2, 0);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false, curveSegments: 10 });
  // world-unit UVs for the stone texture
  const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute, nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) { const side = Math.abs(nrm.getX(i)) > 0.5; uv.setXY(i, side ? pos.getZ(i) : pos.getX(i), pos.getY(i)); }
  const m = new THREE.Mesh(g, kitMaterial('fieldstone'));
  m.castShadow = true; m.receiveShadow = true;
  // local +z (the extrusion) points into the hill: against the opening's outward direction
  m.position.set(f.x, f.y, f.z);
  m.rotation.y = f.rot + (out > 0 ? Math.PI : 0);
  group.add(m);
  // voussoirs: rough stones round the arch, a little proud of the face
  for (let k = 0; k <= 14; k++) {
    const t = Math.PI * k / 14, lat = Math.cos(t) * (ARCH_W / 2 + 0.04), up = ARCH_H + Math.sin(t) * (ARCH_W / 2 + 0.04), jit = ((k * 37) % 5) * 0.004;
    stone.box('fieldstone', f.x + f.nx * lat + f.fx * out * (0.03 + jit), f.y + up, f.z + f.nz * lat + f.fz * out * (0.03 + jit), 0.078, 0.088, 0.07, f.rot + (k % 2 ? 0.06 : -0.06));
  }
  // wing walls stepping back along the cut, lower as they go
  for (const s of [-1, 1]) for (let k = 1; k <= 3; k++) {
    const lat = 0.85 + 0.3 * k, back = 0.12 + 0.28 * k, hgt = 0.6 - 0.14 * k;
    stone.box('fieldstone', f.x + f.nx * s * lat - f.fx * out * back, f.y + hgt / 2 - 0.04, f.z + f.nz * s * lat - f.fz * out * back, 0.12, hgt, 0.42, f.rot + s * out * 0.55);
  }
  void ground;
}

// ── a cattle guard at the gate: pit, rails, concrete ends ──

function cattleGuard(parts: Parts, f: Frame): void {
  parts.box('dark', f.x, f.y - 0.01, f.z, 0.56, 0.005, 0.5, f.rot, false);
  for (let k = -3; k <= 3; k++) {
    const cx = f.x + f.fx * k * 0.065, cz = f.z + f.fz * k * 0.065;
    parts.tube('steel', [cx - f.nx * 0.28, f.y + 0.012, cz - f.nz * 0.28], [cx + f.nx * 0.28, f.y + 0.012, cz + f.nz * 0.28], 0.011, 6);
  }
  for (const s of [-1, 1]) parts.box('concrete', f.x + f.fx * s * 0.27, f.y + 0.004, f.z + f.fz * s * 0.27, 0.6, 0.02, 0.06, f.rot);
}

// ── a cairn on the pass ──

function cairn(stone: Parts, f: Frame, ground: Ground): void {
  const x = f.x + f.nx * 0.5, z = f.z + f.nz * 0.5, y = ground(x, z);
  stone.box('fieldstone', x, y + 0.02, z, 0.16, 0.04, 0.14, f.rot + 0.3);
  stone.box('fieldstone', x, y + 0.055, z, 0.11, 0.035, 0.1, f.rot - 0.2);
  stone.box('fieldstone', x, y + 0.085, z, 0.07, 0.03, 0.07, f.rot + 0.7);
  stone.box('fieldstone', x, y + 0.108, z, 0.04, 0.025, 0.04, f.rot);
}

