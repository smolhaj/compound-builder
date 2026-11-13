/**
 * animalKit — a small procedural toolkit for the farm animals (docs/DECISIONS.md, "Realistic livestock"). Pure geometry, no GL.
 *
 * Everything is built in METRES in the animal's own frame (ground y = 0, forward +z, left +x) and the renderer scales an instance by 1/6
 * (SCALE v2). The main tool is `tube`: a lofted surface through a list of cross-section rings (centre, half-width, half-height up and
 * down, squareness), the rings perpendicular to the path, optionally densified by a spline and closed with a rounded cap. A torso, a
 * neck, a head, a leg segment chain, an ear, a horn, a tail and a udder are all tubes. Every vertex carries
 *   color  baked shading and the fixed colours (hoof, nose, eye, horn)
 *   aSkin  (boneA, boneB, weight of B): two-bone skinning, posed in the vertex shader (animalMaterial.ts), so a walk, a graze or a peck
 *          costs no CPU geometry work
 *   aMark  (coat, region): how much of the procedural coat (breed patches, fur) replaces the baked colour, and which body region it is
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = [number, number, number];

/** Bones shared by every skeleton (a species leaves the ones it does not have unused). Legs: four bones each, upper to pastern. */
export const BONE = { ROOT: 0, NECK: 1, HEAD: 2, TAIL: 3, TAIL2: 4, EAR_L: 5, EAR_R: 6, JAW: 7, FL: 8, FR: 12, HL: 16, HR: 20, WING_L: 24, WING_R: 25 } as const;
export const BONE_COUNT = 26;
export const LEG_BONES = [BONE.FL, BONE.FR, BONE.HL, BONE.HR] as const;

/** Region codes of `aMark.y`. Below 10 the procedural coat applies; 10 and up are fixed colours with their own gloss. */
export const REGION = { BODY: 0, HEAD: 1, LEG: 2, TAIL: 3, EAR: 4, UDDER: 5, WOOL: 6, EYE: 10, HOOF: 11, HORN: 12, NOSE: 13, FLESH: 14, BEAK: 15, TEETH: 16 } as const;

export interface Skin { a: number; b: number; w: number }
export const skin = (a: number, b = a, w = 0): Skin => ({ a, b, w });

export interface Ring {
  p: V3;
  /** Half-width (across the frame's side axis) and half-height (up the frame's up axis, `dn` below when given). */
  w: number; h: number; dn?: number;
  /** Squareness: 2 is an ellipse, higher is boxier. */
  pw?: number;
  skin: Skin;
  col?: V3;
  coat?: number;
  region?: number;
  /** A single point (a rounded end). */
  pole?: boolean;
}

export interface Mesh { pos: number[]; nor: number[]; col: number[]; skn: number[]; mark: number[]; idx: number[]; }
export const newMesh = (): Mesh => ({ pos: [], nor: [], col: [], skn: [], mark: [], idx: [] });

export interface Lod {
  /** Vertices round a cross-section. */
  seg: number;
  /** Spline subdivisions between two control rings. */
  sub: number;
  /** 0: everything; 1: no eyes, nostrils, toes; 2: silhouette only. */
  detail: 0 | 1 | 2;
}
/** From the richest (High, near) to the plainest (far). */
export const LODS: readonly Lod[] = [{ seg: 14, sub: 3, detail: 0 }, { seg: 12, sub: 2, detail: 0 }, { seg: 8, sub: 1, detail: 1 }, { seg: 6, sub: 1, detail: 2 }];

const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a: V3): V3 => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sgnpow = (x: number, e: number): number => Math.sign(x) * Math.pow(Math.abs(x), e);

function cr(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
}
function blendSkin(a: Skin, b: Skin, t: number): Skin {
  const m = new Map<number, number>();
  const add = (s: Skin, k: number) => { m.set(s.a, (m.get(s.a) ?? 0) + (1 - s.w) * k); m.set(s.b, (m.get(s.b) ?? 0) + s.w * k); };
  add(a, 1 - t); add(b, t);
  const e = [...m.entries()].sort((x, y) => y[1] - x[1]);
  if (e.length === 1 || e[1][1] < 0.002) return { a: e[0][0], b: e[0][0], w: 0 };
  const tot = e[0][1] + e[1][1];
  return { a: e[0][0], b: e[1][0], w: e[1][1] / tot };
}

/** Densify control rings with a Catmull-Rom spline (position, size, colour); skin blends, the discrete fields take the nearer ring. */
export function densify(rings: Ring[], sub: number): Ring[] {
  if (sub <= 1 || rings.length < 2) return rings;
  const out: Ring[] = [], n = rings.length, g = (i: number) => rings[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const r0 = g(i - 1), r1 = g(i), r2 = g(i + 1), r3 = g(i + 2);
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      if (s === 0) { out.push(r1); continue; }
      const near = t < 0.5 ? r1 : r2;
      const k = (f: (r: Ring) => number) => cr(f(r0), f(r1), f(r2), f(r3), t);
      const c = (j: number) => cr(r0.col?.[j] ?? 1, r1.col?.[j] ?? 1, r2.col?.[j] ?? 1, r3.col?.[j] ?? 1, t);
      out.push({
        p: [k(r => r.p[0]), k(r => r.p[1]), k(r => r.p[2])],
        w: Math.max(0.0005, k(r => r.w)), h: Math.max(0.0005, k(r => r.h)), dn: Math.max(0.0005, k(r => r.dn ?? r.h)),
        pw: k(r => r.pw ?? 2), skin: blendSkin(r1.skin, r2.skin, t),
        col: r1.col || r2.col ? [c(0), c(1), c(2)] : undefined,
        coat: k(r => r.coat ?? 0), region: near.region ?? 0,
      });
    }
  }
  out.push(rings[n - 1]);
  return out;
}

export interface TubeOpts {
  seg: number;
  sub?: number;
  /** The direction the cross-section's "up" axis is taken from (default up; use +z for a vertical limb). */
  up?: V3;
  /** Rounded caps at the ends (the radius of the end ring is used). */
  capStart?: boolean; capEnd?: boolean;
  /** Radial displacement (metres) by position — wool lumps. */
  lump?: (x: number, y: number, z: number) => number;
  /** Do not bake the downward-facing darkening (a udder, an eye). */
  flat?: boolean;
  /** Flip the surface winding (a part built mirrored by a negative scale). */
  flip?: boolean;
}

function capRings(r: Ring, tan: V3, atEnd: boolean): Ring[] {
  const R = Math.max(r.w, r.h, r.dn ?? 0), s = atEnd ? 1 : -1;
  const at = (d: number, k: number, pole = false): Ring => ({ ...r, p: [r.p[0] + tan[0] * d * s, r.p[1] + tan[1] * d * s, r.p[2] + tan[2] * d * s], w: r.w * k, h: r.h * k, dn: (r.dn ?? r.h) * k, pole });
  return atEnd ? [at(R * 0.3, 0.86), at(R * 0.5, 0.0, true)] : [at(R * 0.5, 0.0, true), at(R * 0.3, 0.86)];
}

/** Loft a surface through the rings. Returns the finished mesh (smooth normals, baked down-facing shade). */
export function tube(rings0: Ring[], o: TubeOpts): Mesh {
  let rings = densify(rings0, o.sub ?? 1);
  const upHint: V3 = o.up ?? [0, 1, 0];
  const tanAt = (i: number, rs: Ring[]): V3 => norm3(sub3(rs[Math.min(rs.length - 1, i + 1)].p, rs[Math.max(0, i - 1)].p));
  if (o.capStart) rings = [...capRings(rings[0], tanAt(0, rings), false), ...rings];
  if (o.capEnd) rings = [...rings, ...capRings(rings[rings.length - 1], tanAt(rings.length - 1, rings), true)];
  // (the cap rings above were made before the neighbours shifted; recompute tangents on the final list)
  const m = newMesh(), seg = o.seg;
  const ringStart: number[] = [], ringCount: number[] = [];
  let sideP: V3 = [1, 0, 0];
  rings.forEach((r, i) => {
    const T = norm3(sub3(rings[Math.min(rings.length - 1, i + 1)].p, rings[Math.max(0, i - 1)].p));
    let S = cross3(upHint, T);
    if (len3(S) < 1e-4) S = sideP;
    S = norm3(S); sideP = S;
    const U = cross3(T, S), e = 2 / (r.pw ?? 2);
    ringStart.push(m.pos.length / 3);
    const n = r.pole ? 1 : seg;
    ringCount.push(n);
    for (let k = 0; k < n; k++) {
      const th = (k / seg) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      const a = r.pole ? 0 : sgnpow(c, e) * r.w, b = r.pole ? 0 : sgnpow(s, e) * (s >= 0 ? r.h : (r.dn ?? r.h));
      let x = r.p[0] + S[0] * a + U[0] * b, y = r.p[1] + S[1] * a + U[1] * b, z = r.p[2] + S[2] * a + U[2] * b;
      if (o.lump && !r.pole) { const d = o.lump(x, y, z); x += (x - r.p[0]) * d; y += (y - r.p[1]) * d; z += (z - r.p[2]) * d; }
      m.pos.push(x, y, z);
      const col = r.col ?? [1, 1, 1];
      m.col.push(col[0], col[1], col[2]);
      m.skn.push(r.skin.a, r.skin.b, r.skin.w);
      m.mark.push(r.coat ?? 0, r.region ?? 0);
    }
  });
  // faces
  for (let i = 0; i < rings.length - 1; i++) {
    const a0 = ringStart[i], b0 = ringStart[i + 1], na = ringCount[i], nb = ringCount[i + 1];
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      const A = a0 + (na === 1 ? 0 : k), A1 = a0 + (na === 1 ? 0 : k1), B = b0 + (nb === 1 ? 0 : k), B1 = b0 + (nb === 1 ? 0 : k1);
      const tri = (p: number, q: number, r: number) => (o.flip ? m.idx.push(p, r, q) : m.idx.push(p, q, r));
      if (na === 1) tri(A, B1, B);
      else if (nb === 1) tri(A, A1, B);
      else { tri(A, A1, B1); tri(A, B1, B); }
    }
  }
  finishNormals(m, !!o.flat);
  return m;
}

/** Smooth normals from the indexed faces, plus a baked shade: faces looking down are darker (a belly, an under-jaw). */
function finishNormals(m: Mesh, flat: boolean): void {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
  g.setIndex(m.idx);
  g.computeVertexNormals();
  const nor = g.attributes.normal.array as Float32Array;
  m.nor = Array.from(nor);
  g.dispose();
  if (flat) return;
  for (let i = 0; i < m.pos.length / 3; i++) {
    const ny = m.nor[i * 3 + 1], f = 1 + 0.05 * Math.max(0, ny) - 0.15 * Math.max(0, -ny);
    m.col[i * 3] *= f; m.col[i * 3 + 1] *= f; m.col[i * 3 + 2] *= f;
  }
}

export interface BlobOpts { seg: number; rings?: number; col?: V3; coat?: number; region?: number; skin: Skin; tilt?: number; flat?: boolean; pw?: number; yaw?: number }
/** An ellipsoid with radii (rx across, ry up, rz along its axis), the axis pitched `tilt` rad (positive: nose up) and yawed `yaw` about y. */
export function blob(c: V3, r: V3, o: BlobOpts): Mesh {
  const n = o.rings ?? 5, tilt = o.tilt ?? 0, yaw = o.yaw ?? 0;
  const ax: V3 = [Math.sin(yaw) * Math.cos(tilt), Math.sin(tilt), Math.cos(yaw) * Math.cos(tilt)];
  const rs: Ring[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI, s = Math.cos(a), z = Math.sin(a) * r[2];
    rs.push({ p: [c[0] + ax[0] * z, c[1] + ax[1] * z, c[2] + ax[2] * z], w: Math.max(0.0004, r[0] * s), h: Math.max(0.0004, r[1] * s), pw: o.pw, skin: o.skin, col: o.col, coat: o.coat, region: o.region, pole: i === 0 || i === n });
  }
  return tube(rs, { seg: o.seg, flat: o.flat });
}

/** Merge meshes (applying `mirrorX` copies if asked) into one BufferGeometry with the animal attributes. */
export function toGeometry(meshes: Mesh[]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const m of meshes) {
    if (!m.idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(m.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(m.col, 3));
    g.setAttribute('aSkin', new THREE.Float32BufferAttribute(m.skn, 3));
    g.setAttribute('aMark', new THREE.Float32BufferAttribute(m.mark, 2));
    g.setIndex(m.idx);
    parts.push(g);
  }
  const out = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}

/** The mirror image of a mesh across x = 0 (left limb to right limb), winding kept outward. */
export function mirrorX(m: Mesh): Mesh {
  const o: Mesh = { pos: [...m.pos], nor: [...m.nor], col: m.col, skn: m.skn, mark: m.mark, idx: [] };
  for (let i = 0; i < o.pos.length; i += 3) { o.pos[i] = -o.pos[i]; o.nor[i] = -o.nor[i]; }
  for (let i = 0; i < m.idx.length; i += 3) o.idx.push(m.idx[i], m.idx[i + 2], m.idx[i + 1]);
  return o;
}

/** Append `b` into `a` (same attribute layout). */
export function append(a: Mesh, b: Mesh): void {
  const base = a.pos.length / 3;
  for (const k of ['pos', 'nor', 'col', 'skn', 'mark'] as const) for (const v of b[k]) a[k].push(v);
  for (const i of b.idx) a.idx.push(i + base);
}

/** Shift every skin index of a mesh whose bones were authored for the left leg to another leg's bones. */
export function reskin(m: Mesh, from: number, to: number): Mesh {
  for (let i = 0; i < m.skn.length; i += 3) {
    if (m.skn[i] >= from && m.skn[i] < from + 4) m.skn[i] += to - from;
    if (m.skn[i + 1] >= from && m.skn[i + 1] < from + 4) m.skn[i + 1] += to - from;
  }
  return m;
}

/** A cloven hoof: two toes, each a squat tapered wedge, on the ground at (x, 0, z) facing +z, `s` the half-width of the foot. */
export function clovenHoof(x: number, z: number, s: number, o: { seg: number; skin: Skin; col?: V3; split?: number }): Mesh {
  const out = newMesh(), gap = s * (o.split ?? 0.34);
  for (const side of [-1, 1]) {
    const cx = x + side * gap, cz = z + s * 0.28;
    const rs: Ring[] = [
      { p: [cx, s * 1.15, cz - s * 0.2], w: s * 0.62, h: s * 0.78, dn: s * 0.78, pw: 2.4, skin: o.skin, col: o.col, region: REGION.HOOF },
      { p: [cx, s * 0.5, cz + s * 0.12], w: s * 0.68, h: s * 0.9, dn: s * 0.9, pw: 2.6, skin: o.skin, col: o.col, region: REGION.HOOF },
      { p: [cx, s * 0.06, cz + s * 0.45], w: s * 0.66, h: s * 0.98, dn: s * 0.98, pw: 2.8, skin: o.skin, col: o.col, region: REGION.HOOF },
    ];
    // the hoof wall slopes forward: the axis runs from the coronet (high, back) down to the toe (low, front)
    append(out, tube(rs, { seg: Math.max(5, Math.round(o.seg * 0.55)), up: [0, 1, 0], flat: true, capEnd: true }));
  }
  // sit the hoof on the ground (the rounded cap would otherwise reach below it)
  let lo = Infinity;
  for (let i = 1; i < out.pos.length; i += 3) lo = Math.min(lo, out.pos[i]);
  for (let i = 1; i < out.pos.length; i += 3) out.pos[i] -= lo;
  return out;
}

/** Triangle count of a geometry. */
export const triCount = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.attributes.position.count) / 3;
