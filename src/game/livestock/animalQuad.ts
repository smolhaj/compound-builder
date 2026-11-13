/**
 * animalQuad — one configurable four-legged builder for the wildlife and the dogs (deer, elk, moose, pronghorn, javelina, bear, cougar, wolf, coyote,
 * every dog breed): a lofted barrel, neck, a head along its own axis, four jointed legs (shoulder / elbow / knee / fetlock; hip / stifle / hock /
 * fetlock) ending in whatever feet the species has, tail, ears and extras. The livestock models (modelFarm.ts) have their own copy of this idea with
 * cloven hooves only; this one takes the feet and everything else as functions. Metres, forward +z, left +x, ground y = 0.
 */
import { BONE, append, skin, toGeometry, tube, type Lod, type Mesh, type V3 } from './animalKit';
import type { BoneAnim, Breed } from './animalMaterial';
import { HOP_OFF, WALK_OFF, bodyRings, eye, headRings, legBones, limb, place, type AnimalModel, type BodyRow, type HeadRow, type LimbRow } from './animalParts';

const sk = skin;
export interface NeckRow { y: number; z: number; w: number; h: number; dn: number; pw?: number; region?: number }

export interface Quad {
  id: string;
  body: BodyRow[];
  /** Wool, fur ruff or a mane hump: radial displacement by position. */
  lump?: (x: number, y: number, z: number) => number;
  neck: NeckRow[];
  head: HeadRow[]; headAt: V3; headPitch: number;
  /** Eye: x offset (positive), y, z in the head frame, radius. */
  eye: [number, number, number, number];
  fore: (b: number) => LimbRow[]; hind: (b: number) => LimbRow[];
  foreX: number; hindX: number;
  /** The foot at the bottom of a leg: `bone` is the leg's pastern bone. */
  foot: (sx: number, bone: number, hind: boolean, lod: Lod) => Mesh[];
  /** Rows from here down are leg-coloured. */
  coatFrom?: number;
  /** Head extras in the head frame (ears, antlers, nose, muzzle patch), added before the head is placed. */
  headExtras: (head: Mesh, lod: Lod) => void;
  tail: (lod: Lod) => Mesh;
  /** Anything else in the root frame (a mane, a hump, a dewlap, teats). */
  extras: (out: Mesh[], lod: Lod) => void;
  bones: Array<BoneAnim | undefined>;
  breeds: Breed[];
  withers: number; length: number; stride: number;
  graze: { neck: number; head: number };
  root: { bob: number; pitch: number; cy: number; cz?: number; hop?: boolean; grazePitch?: number };
  rootPose?: { lieDrop?: number; sitDrop?: number; alertPitch?: number };
  adorn?: V3;
  /** Per-instance extras attribute (see AnimalMaterialSpec.extra). */
  extra?: boolean;
  /** The part of the body ring set that skins to the neck at the front (default: none). */
  grazeFreq?: number;
}

export function buildQuad(q: Quad, lod: Lod) {
  const out: Mesh[] = [], { seg, sub } = lod;
  out.push(tube(bodyRings(q.body), { seg, sub, capStart: true, capEnd: true, lump: q.lump }));
  out.push(tube(q.neck.map((n, i, a) => ({ p: [0, n.y, n.z] as V3, w: n.w, h: n.h, dn: n.dn, pw: n.pw, region: n.region, skin: i === 0 ? sk(BONE.ROOT) : i === a.length - 1 ? sk(BONE.NECK, BONE.HEAD, 0.5) : i === 1 ? sk(BONE.ROOT, BONE.NECK, 0.5) : sk(BONE.NECK), coat: 1, col: [1, 1, 1] as V3 })), { seg, sub, lump: q.lump }));
  const head = tube(headRings(q.head, BONE.HEAD), { seg, sub, capStart: true, capEnd: true });
  append(head, eye(-1, q.eye.slice(0, 3) as V3, q.eye[3], sk(BONE.HEAD), lod));
  append(head, eye(1, q.eye.slice(0, 3) as V3, q.eye[3], sk(BONE.HEAD), lod));
  q.headExtras(head, lod);
  out.push(place(head, q.headPitch, q.headAt));
  out.push(q.tail(lod));
  q.extras(out, lod);
  // the far levels keep every other row of a limb (the joints stay: their rows carry the skin blend)
  const thin = (rows: LimbRow[]): LimbRow[] => (lod.detail >= 1 ? rows.filter((r, i) => i === 0 || i === rows.length - 1 || r[4].w > 0 || i % 2 === 0) : rows);
  for (const [sx, bF, bH] of [[1, BONE.FL, BONE.HL], [-1, BONE.FR, BONE.HR]] as const) {
    out.push(limb(sx, q.foreX, thin(q.fore(bF)), lod, { coatFrom: q.coatFrom ?? 5, capStart: true }));
    out.push(limb(sx, q.hindX, thin(q.hind(bH)), lod, { coatFrom: q.coatFrom ?? 5, capStart: true }));
    out.push(...q.foot(sx, bF + 3, false, lod), ...q.foot(sx, bH + 3, true, lod));
  }
  return toGeometry(out);
}

export interface LegCfg { fore: [V3, V3, V3, V3]; hind: [V3, V3, V3, V3]; swing: [number, number]; flexF: [number, number, number, number]; flexH: [number, number, number, number]; foot: number }
export interface QuadBoneOpts {
  neck: V3; head: V3; tail: V3; tailBob: number; earAt: V3; rootY: number; earFlick?: number;
  graze: { neck: number; head: number; bob: number };
  /** Alert: neck / head pitch, ears forward (roll), tail lift. Lie and sit pitches for dogs. */
  alert?: { neck?: number; head?: number; ear?: number; tail?: number };
  /** Gallop: fore / hind pair offsets (rad) above gait 1. */
  gallop?: boolean;
  /** Above gait 1 the legs move in diagonal pairs (a trot) instead of a gallop. */
  trot?: boolean;
  /** A hopper (rabbit, squirrel): the fore pair and the hind pair move together. */
  hop?: boolean;
  wag?: [number, number];
  alertLie?: number; tailLen?: number;
}
export function quadBones(legs: LegCfg, o: QuadBoneOpts): Array<BoneAnim | undefined> {
  const b: Array<BoneAnim | undefined> = [];
  b[BONE.ROOT] = { pivot: [0, o.rootY, 0], parent: -1 };
  b[BONE.NECK] = { pivot: o.neck, parent: 0, graze: o.graze.neck, alert: o.alert?.neck, idle: 0.025, idleFreq: 0.5, idlePh: 0.3 };
  b[BONE.HEAD] = { pivot: o.head, parent: BONE.NECK, graze: o.graze.head, alert: o.alert?.head, idle: 0.05, idleFreq: 0.8, idlePh: 1.0, bob: o.graze.bob };
  // the tail root pitches (alert: raised; a dog's: up when happy) and the rest of it swishes or wags sideways
  b[BONE.TAIL] = { pivot: o.tail, parent: 0, axis: 0, swing: 0.05, alert: o.alert?.tail, lie: o.alertLie, idle: 0.02, idleFreq: 0.9 };
  b[BONE.TAIL2] = { pivot: [o.tail[0], o.tail[1] - (o.tailLen ?? 0.1), o.tail[2]], parent: BONE.TAIL, axis: o.wag ? 2 : 1, idle: o.tailBob, idleFreq: 1.9, idlePh: 0.9, wag: o.wag };
  b[BONE.EAR_L] = { pivot: o.earAt, parent: BONE.HEAD, axis: 1, idle: o.earFlick ?? 0.3, idleFreq: 0.37, idlePh: 2.3, pulse: true, alert: o.alert?.ear };
  b[BONE.EAR_R] = { pivot: [-o.earAt[0], o.earAt[1], o.earAt[2]], parent: BONE.HEAD, axis: 1, idle: o.earFlick ?? 0.3, idleFreq: 0.29, idlePh: 5.1, pulse: true, alert: o.alert?.ear === undefined ? undefined : -o.alert.ear };
  const run = o.trot ? { FL: 0, FR: Math.PI, HL: Math.PI, HR: 0 } : { FL: 0, FR: 0.45, HL: Math.PI * 0.95, HR: Math.PI * 0.95 + 0.45 };
  const OFF = o.hop ? HOP_OFF : WALK_OFF;
  for (const [sx, bf, bh, of, oh, rf, rh] of [[1, BONE.FL, BONE.HL, OFF.FL, OFF.HL, run.FL, run.HL], [-1, BONE.FR, BONE.HR, OFF.FR, OFF.HR, run.FR, run.HR]] as const) {
    legBones(b, { base: bf, pivots: legs.fore, swing: legs.swing[0], flex: legs.flexF, foot: legs.foot, off: of, sx });
    legBones(b, { base: bh, pivots: legs.hind, swing: legs.swing[1], flex: legs.flexH, foot: legs.foot, off: oh, sx });
    if (o.gallop || o.trot) { for (let k = 0; k < 4; k++) { b[bf + k]!.offRun = rf; b[bh + k]!.offRun = rh; } }
  }
  return b;
}

export const quadModel = (q: Quad): AnimalModel => ({
  id: q.id, build: lod => buildQuad(q, lod), withers: q.withers, length: q.length, stride: q.stride, graze: q.graze,
  spec: { bones: q.bones, breeds: q.breeds, root: { bob: q.root.bob, pitch: q.root.pitch, hop: !!q.root.hop, cy: q.root.cy, cz: q.root.cz ?? 0, grazePitch: q.root.grazePitch }, grazeFreq: q.grazeFreq ?? 7, key: q.id, extra: q.extra ?? true, adorn: q.adorn, rootPose: q.rootPose },
});
