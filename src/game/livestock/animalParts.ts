/**
 * animalParts — shared builders for the species models: a limb through joint rings, a transform for a part built in a local frame
 * (a head along its own axis), eyes with a glint, nostrils, the standard four-bone leg animation tables.
 */
import type { BoneAnim } from './animalMaterial';
import { BONE, REGION, append, blob, newMesh, skin, tube, type Lod, type Mesh, type Ring, type Skin, type V3 } from './animalKit';

/** One ring of a limb: (y, z, half-width, half-depth, skin). The side offset x is added by `limb`. */
export type LimbRow = [y: number, z: number, w: number, h: number, bones: Skin];

/** A limb on side `sx` (+1 left) at lateral offset `x`, the first row the top (hip or shoulder). `coatFrom`: rows from here down are leg-coloured. */
export function limb(sx: number, x: number, rows: LimbRow[], lod: Lod, o: { coatFrom?: number; col?: V3; pw?: number; cap?: boolean; sub?: number } = {}): Mesh {
  const rs: Ring[] = [];
  rows.forEach((r, i) => {
    const reg = i >= (o.coatFrom ?? 4) ? REGION.LEG : REGION.BODY;
    const ring = (region: number): Ring => ({ p: [sx * x, r[0], r[1]] as V3, w: r[2], h: r[3], pw: o.pw ?? 2, skin: r[4], col: o.col ?? [1, 1, 1], coat: 1, region });
    // where the coat region changes (a white sock starts) a doubled ring makes a clean edge instead of a blended band
    if (i === (o.coatFrom ?? 4) && i > 0) rs.push(ring(REGION.BODY));
    rs.push(ring(reg));
  });
  return tube(rs, { seg: Math.max(5, Math.round(lod.seg * 0.6)), sub: o.sub ?? (lod.sub > 2 ? 2 : 1), up: [0, 0, 1], capEnd: o.cap });
}

/** Rotate a mesh built in a local frame about x by `pitch` (positive: the +z axis tilts up), then translate. */
export function place(m: Mesh, pitch: number, at: V3): Mesh {
  const c = Math.cos(pitch), s = Math.sin(pitch);
  for (let i = 0; i < m.pos.length; i += 3) {
    const y = m.pos[i + 1], z = m.pos[i + 2];
    m.pos[i + 1] = y * c + z * s + at[1]; m.pos[i + 2] = -y * s + z * c + at[2]; m.pos[i] += at[0];
    const ny = m.nor[i + 1], nz = m.nor[i + 2];
    m.nor[i + 1] = ny * c + nz * s; m.nor[i + 2] = -ny * s + nz * c;
  }
  return m;
}

/** Eye (dark, glossy) with a tiny pale glint, at p on side sx. */
export function eye(sx: number, p: V3, r: number, sk: Skin, lod: Lod): Mesh {
  const out = newMesh();
  if (lod.detail >= 2) return out;
  append(out, blob([sx * p[0], p[1], p[2]], [r * 0.7, r, r], { seg: lod.detail ? 6 : 8, rings: lod.detail ? 3 : 4, col: [0.04, 0.03, 0.03], region: REGION.EYE, skin: sk, flat: true }));
  if (!lod.detail) append(out, blob([sx * (p[0] + r * 0.28), p[1] + r * 0.4, p[2] + r * 0.55], [r * 0.2, r * 0.2, r * 0.2], { seg: 5, rings: 2, col: [0.95, 0.95, 0.95], region: REGION.EYE, skin: sk, flat: true }));
  return out;
}

/** A goat's eye: an amber iris on the side of the head with a horizontal rectangular pupil slit and a glint. */
export function slitEye(sx: number, p: V3, r: number, sk: Skin, lod: Lod): Mesh {
  const out = newMesh();
  if (lod.detail >= 2) return out;
  append(out, blob([sx * p[0], p[1], p[2]], [r * 0.6, r * 0.9, r], { seg: lod.detail ? 6 : 8, rings: lod.detail ? 3 : 4, col: [0.82, 0.58, 0.12], region: REGION.EYE, skin: sk, flat: true }));
  append(out, blob([sx * (p[0] + r * 0.32), p[1], p[2]], [r * 0.18, r * 0.2, r * 0.72], { seg: 6, rings: 3, col: [0.03, 0.025, 0.02], region: REGION.EYE, skin: sk, flat: true }));
  if (!lod.detail) append(out, blob([sx * (p[0] + r * 0.4), p[1] + r * 0.42, p[2] + r * 0.4], [r * 0.14, r * 0.14, r * 0.14], { seg: 5, rings: 2, col: [0.95, 0.95, 0.9], region: REGION.EYE, skin: sk, flat: true }));
  return out;
}

/** Two nostrils on the front of a muzzle. */
export function nostrils(p: V3, spread: number, r: number, sk: Skin, lod: Lod, tilt = 0): Mesh {
  const out = newMesh();
  if (lod.detail) return out;
  for (const sx of [-1, 1]) append(out, blob([sx * spread, p[1], p[2]], [r, r * 0.7, r * 0.5], { seg: 6, rings: 3, col: [0.05, 0.03, 0.03], region: REGION.EYE, skin: sk, flat: true, tilt }));
  return out;
}

/** Skeleton entry helper: a four-bone leg chain (upper, mid, cannon, pastern) with pivots and a gait. */
export interface LegSpec {
  base: number;
  /** Joint pivots (upper, mid, cannon, pastern), left leg; x is flipped for the right. */
  pivots: [V3, V3, V3, V3];
  swing: number; flex: [number, number, number, number]; foot: number;
  /** Gait phase offset (rad). */
  off: number;
  sx: number;
}
export function legBones(bones: Array<BoneAnim | undefined>, l: LegSpec): void {
  for (let k = 0; k < 4; k++) {
    const pv = l.pivots[k];
    bones[l.base + k] = {
      pivot: [l.sx * Math.abs(pv[0]), pv[1], pv[2]], parent: k === 0 ? BONE.ROOT : l.base + k - 1,
      swing: k === 0 ? l.swing : k === 3 ? l.foot : 0, off: l.off, flex: l.flex[k],
    };
  }
}
/** The lateral-sequence walk: hind left, fore left, hind right, fore right a quarter cycle apart. */
/** A walk in near-diagonal pairs (hind left with fore right, a beat apart): how sheep, goats and cattle really move at a walk. */
export const DIAG_OFF = { HL: 0, FR: 0.3 * Math.PI, HR: Math.PI, FL: 1.3 * Math.PI } as const;
export const WALK_OFF = { HL: 0, FL: Math.PI / 2, HR: Math.PI, FR: Math.PI * 1.5 } as const;
export const HOP_OFF = { HL: 0.2, FL: 0, HR: 0.2, FR: 0 } as const;
export const skinOf = skin;

import type * as THREE from 'three';
import type { AnimalMaterialSpec } from './animalMaterial';
/** What a species file hands the renderer. */
export interface AnimalModel {
  id: string;
  /** The geometry for a level of detail (metres, ground y = 0, forward +z). */
  build: (lod: Lod) => THREE.BufferGeometry;
  spec: AnimalMaterialSpec;
  /** Height at the withers / back (m) and body length (m), for scale checks and spacing. */
  withers: number; length: number;
  /** Distance travelled per gait cycle (m) so the feet do not slide. */
  stride: number;
  /** Where the muzzle / beak tip is when grazing (checked in tests: it must reach the ground). */
  graze: { neck: number; head: number };
}

/** Compact ring: [z along the axis, centre y, half-width, half-height up, half-height down]. */
export type HeadRow = [z: number, cy: number, w: number, h: number, dn: number];
export function headRings(rows: HeadRow[], b: number, region: number = REGION.HEAD, pw = 2.3): Ring[] {
  return rows.map(([z, cy, w, h, dn]) => ({ p: [0, cy, z] as V3, w, h, dn, pw, skin: skin(b), coat: 1, region, col: [1, 1, 1] as V3 }));
}
/** Compact ring on a body: [z, top y, bottom y, half-width, squareness], all in the root bone. */
export type BodyRow = [z: number, top: number, bot: number, hw: number, pw: number];
export function bodyRings(rows: BodyRow[], b = BONE.ROOT): Ring[] {
  return rows.map(([z, top, bot, hw, pw]) => ({ p: [0, (top + bot) / 2, z] as V3, w: hw, h: (top - bot) / 2, dn: (top - bot) / 2, pw, skin: skin(b), coat: 1, region: REGION.BODY, col: [1, 1, 1] as V3 }));
}
/** A thin tapered tube along points (y, z at x = `x`), radius per point; for tails, ears, horns, toes. */
export function strand(pts: Array<[number, number, number, number]>, b: Skin, lod: Lod, o: { x?: number; region?: number; col?: V3; coat?: number; up?: V3; capEnd?: boolean; flat?: boolean } = {}): Mesh {
  const rs: Ring[] = pts.map(([x, y, z, r]) => ({ p: [x, y, z] as V3, w: r, h: r, skin: b, col: o.col ?? [1, 1, 1], coat: o.coat ?? 1, region: o.region ?? REGION.BODY }));
  return tube(rs, { seg: Math.max(5, lod.seg - 6), sub: lod.sub, up: o.up ?? [0, 0, 1], capEnd: o.capEnd ?? true, flat: o.flat ?? true });
}
