/**
 * Pig, sheep and goat: one configurable quadruped builder (barrel, neck, head along its own axis, four jointed legs with cloven hooves,
 * tail, ears) and each species' numbers. Metres, forward +z, left +x. Anatomy from standard livestock references: a market hog is about
 * 0.8 m at the shoulder and 1.5 m nose to rump with large hams; a ewe 0.75 m at the withers in a wool coat that hides the belly line;
 * a dairy doe 0.8 m, lean, with an upright tail.
 */
import { BONE, REGION, append, blob, clovenHoof, skin, toGeometry, tube, type Lod, type Mesh, type V3 } from './animalKit';
import type { BoneAnim, Breed } from './animalMaterial';
import { WALK_OFF, bodyRings, eye, headRings, legBones, limb, nostrils, place, strand, type AnimalModel, type BodyRow, type HeadRow, type LimbRow } from './animalParts';

const sk = skin;
interface Quad {
  id: string;
  body: BodyRow[];
  /** Wool lumps on the barrel. */
  lump?: (x: number, y: number, z: number) => number;
  neck: Array<{ y: number; z: number; w: number; h: number; dn: number }>;
  head: HeadRow[]; headAt: V3; headPitch: number;
  /** Eye: x offset (positive), y, z in the head frame and radius. */
  eye: [number, number, number, number];
  fore: (b: number) => LimbRow[]; hind: (b: number) => LimbRow[];
  foreX: number; hindX: number; hoof: number;
  foreHoofZ: number; hindHoofZ: number;
  extras: (out: Mesh[], lod: Lod) => void;
  /** Head extras in the head frame (ears, horns, snout), added before the head is placed. */
  headExtras: (head: Mesh, lod: Lod) => void;
  tail: (lod: Lod) => Mesh;
  bones: Array<BoneAnim | undefined>;
  breeds: Breed[];
  withers: number; length: number; stride: number;
  graze: { neck: number; head: number };
  root: { bob: number; pitch: number; cy: number };
  hoofCol?: V3;
  /** Squeeze the whole animal along its length (the rows are authored long). */
  zs: number;
}

function buildQuad(q: Quad, lod: Lod) {
  const out: Mesh[] = [], { seg, sub } = lod;
  out.push(tube(bodyRings(q.body), { seg, sub, capStart: true, capEnd: true, lump: q.lump }));
  out.push(tube(q.neck.map((n, i, a) => ({ p: [0, n.y, n.z] as V3, w: n.w, h: n.h, dn: n.dn, skin: i === 0 ? sk(BONE.ROOT) : i === a.length - 1 ? sk(BONE.NECK, BONE.HEAD, 0.5) : i === 1 ? sk(BONE.ROOT, BONE.NECK, 0.5) : sk(BONE.NECK), coat: 1, col: [1, 1, 1] as V3 })), { seg, sub, lump: q.lump }));
  const head = tube(headRings(q.head, BONE.HEAD), { seg, sub, capStart: true, capEnd: true });
  append(head, eye(-1, [q.eye[0], q.eye[1], q.eye[2]], q.eye[3], sk(BONE.HEAD), lod));
  append(head, eye(1, [q.eye[0], q.eye[1], q.eye[2]], q.eye[3], sk(BONE.HEAD), lod));
  q.headExtras(head, lod);
  out.push(place(head, q.headPitch, q.headAt));
  out.push(q.tail(lod));
  q.extras(out, lod);
  const hc = q.hoofCol ?? [0.12, 0.1, 0.09];
  for (const [sx, bF, bH] of [[1, BONE.FL, BONE.HL], [-1, BONE.FR, BONE.HR]] as const) {
    out.push(limb(sx, q.foreX, q.fore(bF), lod, { coatFrom: 5 }));
    out.push(limb(sx, q.hindX, q.hind(bH), lod, { coatFrom: 5 }));
    if (lod.detail < 2) {
      out.push(clovenHoof(sx * q.foreX, q.foreHoofZ, q.hoof, { seg, skin: sk(bF + 3), col: hc }));
      out.push(clovenHoof(sx * q.hindX, q.hindHoofZ, q.hoof, { seg, skin: sk(bH + 3), col: hc }));
    }
  }
  const g = toGeometry(out);
  g.scale(1, 1, q.zs);
  return g;
}

interface LegCfg { fore: [V3, V3, V3, V3]; hind: [V3, V3, V3, V3]; swing: [number, number]; flexF: [number, number, number, number]; flexH: [number, number, number, number]; foot: number }
function quadBones(neck: V3, head: V3, tail: V3, tailBob: number, legs: LegCfg, graze: { neck: number; head: number; bob: number }, earAt: V3, rootY: number, earFlick = 0.3): Array<BoneAnim | undefined> {
  const b: Array<BoneAnim | undefined> = [];
  b[BONE.ROOT] = { pivot: [0, rootY, 0], parent: -1 };
  b[BONE.NECK] = { pivot: neck, parent: 0, graze: graze.neck, idle: 0.025, idleFreq: 0.5, idlePh: 0.3 };
  b[BONE.HEAD] = { pivot: head, parent: BONE.NECK, graze: graze.head, idle: 0.05, idleFreq: 0.8, idlePh: 1.0, bob: graze.bob };
  b[BONE.TAIL] = { pivot: tail, parent: 0, axis: 1, idle: tailBob, idleFreq: 1.3, idlePh: 0.5, swing: 0.05 };
  b[BONE.TAIL2] = { pivot: [tail[0], tail[1] - 0.12, tail[2]], parent: BONE.TAIL, axis: 1, idle: tailBob * 1.3, idleFreq: 1.9, idlePh: 0.9 };
  b[BONE.EAR_L] = { pivot: [earAt[0], earAt[1], earAt[2]], parent: BONE.HEAD, axis: 1, idle: earFlick, idleFreq: 0.37, idlePh: 2.3, pulse: true };
  b[BONE.EAR_R] = { pivot: [-earAt[0], earAt[1], earAt[2]], parent: BONE.HEAD, axis: 1, idle: earFlick, idleFreq: 0.29, idlePh: 5.1, pulse: true };
  for (const [sx, bf, bh, of, oh] of [[1, BONE.FL, BONE.HL, WALK_OFF.FL, WALK_OFF.HL], [-1, BONE.FR, BONE.HR, WALK_OFF.FR, WALK_OFF.HR]] as const) {
    legBones(b, { base: bf, pivots: legs.fore, swing: legs.swing[0], flex: legs.flexF, foot: legs.foot, off: of, sx });
    legBones(b, { base: bh, pivots: legs.hind, swing: legs.swing[1], flex: legs.flexH, foot: legs.foot, off: oh, sx });
  }
  return b;
}
const model = (q: Quad): AnimalModel => ({
  id: q.id, build: lod => buildQuad(q, lod), withers: q.withers, length: q.length, stride: q.stride, graze: q.graze,
  spec: { bones: q.bones.map(b => (b ? { ...b, pivot: [b.pivot[0], b.pivot[1], b.pivot[2] * q.zs] as V3 } : b)), breeds: q.breeds, root: { bob: q.root.bob, pitch: q.root.pitch, hop: false, cy: q.root.cy, cz: 0 }, grazeFreq: 7, key: q.id },
});
const c3 = (a: number, b: number, c: number): V3 => [a, b, c];

// ---------------------------------------------------------------- pig
const PIG_FORE = (b: number): LimbRow[] => [
  [0.52, 0.46, 0.12, 0.15, sk(b)], [0.40, 0.44, 0.10, 0.12, sk(b, b + 1, 0.5)], [0.26, 0.45, 0.065, 0.075, sk(b + 1, b + 2, 0.5)],
  [0.15, 0.455, 0.044, 0.048, sk(b + 2)], [0.075, 0.465, 0.048, 0.05, sk(b + 2, b + 3, 0.5)], [0.045, 0.48, 0.04, 0.042, sk(b + 3)], [0.035, 0.49, 0.042, 0.046, sk(b + 3)],
];
const PIG_HIND = (b: number): LimbRow[] => [
  [0.56, -0.60, 0.16, 0.21, sk(b)], [0.45, -0.57, 0.15, 0.2, sk(b)], [0.36, -0.53, 0.105, 0.14, sk(b, b + 1, 0.5)], [0.28, -0.59, 0.08, 0.1, sk(b + 1)],
  [0.18, -0.64, 0.055, 0.078, sk(b + 1, b + 2, 0.5)], [0.11, -0.64, 0.042, 0.05, sk(b + 2)], [0.065, -0.64, 0.046, 0.05, sk(b + 2, b + 3, 0.5)], [0.04, -0.63, 0.04, 0.042, sk(b + 3)], [0.03, -0.62, 0.042, 0.046, sk(b + 3)],
];
const PIG: Quad = {
  id: 'pig',
  body: [[0.66, 0.62, 0.30, 0.15, 2.1], [0.50, 0.74, 0.25, 0.23, 2.2], [0.20, 0.80, 0.21, 0.26, 2.3], [-0.15, 0.82, 0.22, 0.27, 2.3], [-0.45, 0.80, 0.29, 0.27, 2.2], [-0.68, 0.76, 0.36, 0.25, 2.1], [-0.84, 0.66, 0.42, 0.18, 2.0]],
  neck: [{ y: 0.56, z: 0.52, w: 0.18, h: 0.16, dn: 0.19 }, { y: 0.59, z: 0.72, w: 0.165, h: 0.145, dn: 0.17 }, { y: 0.60, z: 0.86, w: 0.13, h: 0.12, dn: 0.13 }],
  head: [[-0.03, 0, 0.115, 0.115, 0.12], [0.08, 0, 0.125, 0.115, 0.125], [0.20, -0.01, 0.10, 0.09, 0.11], [0.31, -0.02, 0.07, 0.065, 0.075], [0.39, -0.025, 0.058, 0.058, 0.06]],
  headAt: c3(0, 0.605, 0.87), headPitch: -0.38,
  eye: [0.098, 0.05, 0.15, 0.011],
  fore: PIG_FORE, hind: PIG_HIND, foreX: 0.14, hindX: 0.16, hoof: 0.03, foreHoofZ: 0.47, hindHoofZ: -0.65,
  headExtras: (head, lod) => {
    append(head, blob([0, -0.027, 0.405], [0.062, 0.056, 0.02], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.NOSE, skin: sk(BONE.HEAD), flat: true }));
    append(head, nostrils([0, -0.025, 0.424], 0.024, 0.0105, sk(BONE.HEAD), lod));
    for (const sx of [-1, 1]) {
      const b = sx > 0 ? BONE.EAR_L : BONE.EAR_R;
      // lop ear: out from the crown, then flopping forward and down over the eye
      append(head, tube([
        { p: [sx * 0.07, 0.10, 0.0], w: 0.04, h: 0.01, skin: sk(BONE.HEAD, b, 0.4), coat: 1, region: REGION.EAR, col: [1, 1, 1] },
        { p: [sx * 0.12, 0.13, 0.04], w: 0.058, h: 0.007, skin: sk(b), coat: 1, region: REGION.EAR, col: [1, 1, 1] },
        { p: [sx * 0.17, 0.10, 0.10], w: 0.06, h: 0.006, skin: sk(b), coat: 1, region: REGION.EAR, col: [1, 1, 1] },
        { p: [sx * 0.19, 0.045, 0.14], w: 0.035, h: 0.005, skin: sk(b), coat: 1, region: REGION.EAR, col: [0.9, 0.9, 0.9] },
        { p: [sx * 0.19, 0.01, 0.155], w: 0.008, h: 0.003, skin: sk(b), coat: 1, region: REGION.EAR, col: [0.85, 0.85, 0.85] },
      ], { seg: 6, sub: 1, up: [0, 1, 0], flat: true }));
    }
  },
  tail: lod => strand([[0, 0.70, -0.84, 0.02], [0, 0.68, -0.92, 0.013], [0, 0.72, -0.98, 0.01], [0, 0.79, -0.97, 0.009], [0.012, 0.8, -0.9, 0.008], [0.02, 0.75, -0.88, 0.006]], sk(BONE.TAIL, BONE.TAIL2, 0.5), lod, { region: REGION.TAIL, up: [1, 0, 0] }),
  extras: (out, lod) => { // teats along the belly, barely there
    if (lod.detail < 2) out.push(blob([0, 0.2, -0.05], [0.03, 0.02, 0.2], { seg: 6, rings: 3, col: [0.9, 0.7, 0.66], region: REGION.FLESH, skin: sk(BONE.ROOT), flat: true }));
  },
  bones: quadBones(c3(0, 0.6, 0.52), c3(0, 0.6, 0.87), c3(0, 0.72, -0.84), 0.15,
    { fore: [[0.14, 0.52, 0.46], [0.14, 0.40, 0.44], [0.14, 0.26, 0.45], [0.14, 0.075, 0.465]], hind: [[0.16, 0.56, -0.60], [0.16, 0.36, -0.53], [0.16, 0.18, -0.64], [0.16, 0.065, -0.64]], swing: [0.45, 0.42], flexF: [0, 0, -0.9, 0.3], flexH: [0, -0.4, 0.7, -0.3], foot: -0.1 },
    { neck: -0.38, head: -0.5, bob: 0.1 }, c3(0.08, 0.7, 0.87), 0.4, 0.25),
  breeds: [
    { name: 'Yorkshire', base: c3(0.9, 0.7, 0.66), style: 0, face: c3(0.9, 0.7, 0.66), faceMix: 0, leg: c3(0.88, 0.68, 0.64), legMix: 0.3, fur: 0.25, furFreq: 70, nose: c3(0.86, 0.55, 0.52) },
    { name: 'Hampshire', base: c3(0.07, 0.065, 0.065), style: 3, patch: c3(0.92, 0.84, 0.8), belt: [0.38, 0.17], face: c3(0.07, 0.065, 0.065), faceMix: 0, fur: 0.3, furFreq: 70, nose: c3(0.2, 0.15, 0.15) },
    { name: 'Duroc', base: c3(0.52, 0.2, 0.1), style: 0, fur: 0.3, furFreq: 60, nose: c3(0.3, 0.16, 0.13) },
    { name: 'Spotted', base: c3(0.88, 0.72, 0.68), style: 4, patch: c3(0.1, 0.09, 0.09), cover: 0.55, scale: 3.4, face: c3(0.88, 0.72, 0.68), faceMix: 0, fur: 0.25, furFreq: 70, nose: c3(0.5, 0.35, 0.34), size: 0.95 },
  ],
  zs: 0.86, withers: 0.8, length: 1.3, stride: 0.7, graze: { neck: -0.38, head: -0.5 }, root: { bob: 0.008, pitch: 0.012, cy: 0.5 },
};

// ---------------------------------------------------------------- sheep
const SHEEP_FORE = (b: number): LimbRow[] => [
  [0.62, 0.46, 0.08, 0.1, sk(b)], [0.50, 0.44, 0.07, 0.085, sk(b, b + 1, 0.5)], [0.36, 0.45, 0.04, 0.045, sk(b + 1, b + 2, 0.5)], [0.22, 0.455, 0.028, 0.03, sk(b + 2)],
  [0.09, 0.46, 0.034, 0.036, sk(b + 2, b + 3, 0.5)], [0.05, 0.47, 0.028, 0.03, sk(b + 3)], [0.03, 0.48, 0.03, 0.033, sk(b + 3)],
];
const SHEEP_HIND = (b: number): LimbRow[] => [
  [0.66, -0.46, 0.115, 0.15, sk(b)], [0.54, -0.43, 0.10, 0.14, sk(b)], [0.46, -0.37, 0.07, 0.095, sk(b, b + 1, 0.5)], [0.36, -0.43, 0.045, 0.06, sk(b + 1)],
  [0.26, -0.5, 0.032, 0.05, sk(b + 1, b + 2, 0.5)], [0.14, -0.49, 0.026, 0.03, sk(b + 2)], [0.07, -0.48, 0.032, 0.035, sk(b + 2, b + 3, 0.5)], [0.04, -0.47, 0.028, 0.03, sk(b + 3)], [0.03, -0.46, 0.03, 0.033, sk(b + 3)],
];
const woolLump = (x: number, y: number, z: number): number => {
  const a = Math.sin(x * 38 + y * 21 + 1.3) * Math.sin(z * 33 - y * 17) + Math.sin(z * 71 + x * 29) * 0.5;
  return a * 0.045;
};
const SHEEP: Quad = {
  id: 'sheep',
  body: [[0.50, 0.76, 0.40, 0.17, 2.2], [0.36, 0.85, 0.34, 0.25, 2.3], [0.08, 0.88, 0.30, 0.29, 2.4], [-0.22, 0.88, 0.31, 0.29, 2.4], [-0.48, 0.85, 0.37, 0.26, 2.3], [-0.66, 0.78, 0.43, 0.2, 2.1]],
  lump: woolLump,
  neck: [{ y: 0.68, z: 0.36, w: 0.17, h: 0.19, dn: 0.21 }, { y: 0.75, z: 0.64, w: 0.15, h: 0.17, dn: 0.18 }, { y: 0.8, z: 0.92, w: 0.105, h: 0.12, dn: 0.125 }],
  head: [[-0.03, 0, 0.07, 0.08, 0.085], [0.05, 0, 0.08, 0.09, 0.09], [0.14, -0.012, 0.07, 0.08, 0.08], [0.22, -0.03, 0.055, 0.065, 0.06], [0.285, -0.045, 0.046, 0.055, 0.05], [0.32, -0.05, 0.043, 0.048, 0.043]],
  headAt: c3(0, 0.82, 0.92), headPitch: -0.12,
  eye: [0.068, 0.04, 0.12, 0.013],
  fore: SHEEP_FORE, hind: SHEEP_HIND, foreX: 0.105, hindX: 0.12, hoof: 0.022, foreHoofZ: 0.46, hindHoofZ: -0.475,
  headExtras: (head, lod) => {
    append(head, blob([0, -0.052, 0.322], [0.043, 0.036, 0.02], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.NOSE, skin: sk(BONE.HEAD), flat: true }));
    append(head, nostrils([0, -0.05, 0.34], 0.016, 0.0075, sk(BONE.HEAD), lod, 0.1));
    for (const sx of [-1, 1]) {
      const b = sx > 0 ? BONE.EAR_L : BONE.EAR_R;
      append(head, tube([
        { p: [sx * 0.05, 0.05, -0.02], w: 0.022, h: 0.007, skin: sk(BONE.HEAD, b, 0.4), coat: 1, region: REGION.EAR, col: [1, 1, 1] },
        { p: [sx * 0.11, 0.055, -0.04], w: 0.032, h: 0.005, skin: sk(b), coat: 1, region: REGION.EAR, col: [1, 1, 1] },
        { p: [sx * 0.19, 0.05, -0.06], w: 0.026, h: 0.004, skin: sk(b), coat: 1, region: REGION.EAR, col: [0.9, 0.9, 0.9] },
        { p: [sx * 0.225, 0.04, -0.07], w: 0.008, h: 0.003, skin: sk(b), coat: 1, region: REGION.EAR, col: [0.85, 0.85, 0.85] },
      ], { seg: 6, sub: 1, up: [0, 1, 0], flat: true }));
    }
  },
  tail: lod => strand([[0, 0.8, -0.62, 0.05], [0, 0.7, -0.68, 0.04], [0, 0.6, -0.69, 0.028], [0, 0.54, -0.68, 0.012]], sk(BONE.TAIL, BONE.TAIL2, 0.5), lod, { region: REGION.BODY, up: [0, 0, 1] }),
  extras: () => undefined,
  bones: quadBones(c3(0, 0.68, 0.44), c3(0, 0.82, 0.92), c3(0, 0.8, -0.62), 0.07,
    { fore: [[0.105, 0.62, 0.46], [0.105, 0.50, 0.44], [0.105, 0.36, 0.45], [0.105, 0.09, 0.46]], hind: [[0.12, 0.66, -0.40], [0.12, 0.46, -0.30], [0.12, 0.26, -0.50], [0.12, 0.07, -0.48]], swing: [0.4, 0.38], flexF: [0, 0, -0.9, 0.3], flexH: [0, -0.4, 0.75, -0.3], foot: -0.1 },
    { neck: -1.1, head: 0.0, bob: 0.1 }, c3(0.05, 0.86, 0.9), 0.55, 0.3),
  breeds: [
    { name: 'Suffolk', base: c3(0.94, 0.92, 0.86), style: 0, face: c3(0.06, 0.055, 0.055), faceMix: 0.98, leg: c3(0.07, 0.065, 0.065), legMix: 0.97, fur: 1.5, furFreq: 24, nose: c3(0.08, 0.07, 0.07) },
    { name: 'Dorset', base: c3(0.95, 0.94, 0.9), style: 0, face: c3(0.9, 0.84, 0.8), faceMix: 0.9, leg: c3(0.9, 0.84, 0.8), legMix: 0.85, fur: 1.5, furFreq: 24, nose: c3(0.82, 0.55, 0.52) },
    { name: 'Cream', base: c3(0.86, 0.78, 0.6), style: 0, face: c3(0.5, 0.36, 0.24), faceMix: 0.85, leg: c3(0.46, 0.33, 0.22), legMix: 0.8, fur: 1.5, furFreq: 24, nose: c3(0.22, 0.15, 0.13) },
    { name: 'Black', base: c3(0.07, 0.065, 0.06), style: 0, face: c3(0.06, 0.055, 0.05), faceMix: 0.5, fur: 1.5, furFreq: 24, nose: c3(0.1, 0.08, 0.08), size: 0.97 },
  ],
  zs: 0.78, withers: 0.78, length: 0.95, stride: 0.5, graze: { neck: -1.1, head: 0.0 }, root: { bob: 0.007, pitch: 0.01, cy: 0.6 },
};

// ---------------------------------------------------------------- goat
const GOAT_FORE = (b: number): LimbRow[] => [
  [0.64, 0.42, 0.065, 0.09, sk(b)], [0.52, 0.40, 0.06, 0.075, sk(b, b + 1, 0.5)], [0.38, 0.41, 0.036, 0.04, sk(b + 1, b + 2, 0.5)], [0.22, 0.415, 0.026, 0.028, sk(b + 2)],
  [0.09, 0.42, 0.032, 0.034, sk(b + 2, b + 3, 0.5)], [0.05, 0.43, 0.026, 0.028, sk(b + 3)], [0.03, 0.44, 0.028, 0.03, sk(b + 3)],
];
const GOAT_HIND = (b: number): LimbRow[] => [
  [0.70, -0.42, 0.095, 0.13, sk(b)], [0.58, -0.39, 0.085, 0.12, sk(b)], [0.48, -0.33, 0.058, 0.08, sk(b, b + 1, 0.5)], [0.38, -0.40, 0.04, 0.055, sk(b + 1)],
  [0.28, -0.47, 0.03, 0.05, sk(b + 1, b + 2, 0.5)], [0.15, -0.46, 0.024, 0.028, sk(b + 2)], [0.07, -0.45, 0.03, 0.033, sk(b + 2, b + 3, 0.5)], [0.04, -0.44, 0.026, 0.028, sk(b + 3)], [0.03, -0.43, 0.028, 0.03, sk(b + 3)],
];
const GOAT: Quad = {
  id: 'goat',
  body: [[0.50, 0.82, 0.44, 0.12, 2.1], [0.36, 0.86, 0.36, 0.17, 2.2], [0.08, 0.84, 0.34, 0.19, 2.3], [-0.20, 0.83, 0.38, 0.185, 2.3], [-0.44, 0.84, 0.45, 0.17, 2.2], [-0.60, 0.8, 0.5, 0.12, 2.0]],
  neck: [{ y: 0.72, z: 0.38, w: 0.1, h: 0.14, dn: 0.17 }, { y: 0.82, z: 0.64, w: 0.085, h: 0.105, dn: 0.125 }, { y: 0.87, z: 0.88, w: 0.062, h: 0.07, dn: 0.08 }],
  head: [[-0.03, 0, 0.055, 0.065, 0.07], [0.05, 0, 0.062, 0.07, 0.075], [0.15, -0.01, 0.052, 0.062, 0.065], [0.24, -0.025, 0.042, 0.05, 0.05], [0.31, -0.04, 0.036, 0.042, 0.04], [0.345, -0.045, 0.034, 0.038, 0.035]],
  headAt: c3(0, 0.87, 0.88), headPitch: -0.5,
  eye: [0.06, 0.04, 0.11, 0.012],
  fore: GOAT_FORE, hind: GOAT_HIND, foreX: 0.085, hindX: 0.095, hoof: 0.02, foreHoofZ: 0.42, hindHoofZ: -0.455,
  headExtras: (head, lod) => {
    append(head, blob([0, -0.046, 0.348], [0.036, 0.032, 0.018], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.NOSE, skin: sk(BONE.HEAD), flat: true }));
    append(head, nostrils([0, -0.044, 0.364], 0.014, 0.0065, sk(BONE.HEAD), lod, 0.1));
    // beard
    if (lod.detail < 2) append(head, strand([[0, -0.07, 0.3, 0.015], [0, -0.12, 0.285, 0.012], [0, -0.17, 0.275, 0.006]], sk(BONE.HEAD), lod, { region: REGION.HEAD, up: [0, 0, 1] }));
    for (const sx of [-1, 1]) {
      const b = sx > 0 ? BONE.EAR_L : BONE.EAR_R;
      // erect, slightly sideways ear
      append(head, tube([
        { p: [sx * 0.05, 0.055, -0.02], w: 0.02, h: 0.006, skin: sk(BONE.HEAD, b, 0.4), coat: 1, region: REGION.EAR, col: [1, 1, 1] },
        { p: [sx * 0.10, 0.065, -0.03], w: 0.03, h: 0.005, skin: sk(b), coat: 1, region: REGION.EAR, col: [1, 1, 1] },
        { p: [sx * 0.15, 0.07, -0.05], w: 0.026, h: 0.004, skin: sk(b), coat: 1, region: REGION.EAR, col: [0.9, 0.9, 0.9] },
        { p: [sx * 0.185, 0.07, -0.07], w: 0.008, h: 0.003, skin: sk(b), coat: 1, region: REGION.EAR, col: [0.85, 0.85, 0.85] },
      ], { seg: 6, sub: 1, up: [0, 1, 0], flat: true }));
      // horn: sweeps up and back
      append(head, tube([
        { p: [sx * 0.035, 0.07, 0.0], w: 0.017, h: 0.017, skin: sk(BONE.HEAD), col: [0.62, 0.58, 0.5], region: REGION.HORN },
        { p: [sx * 0.045, 0.14, -0.04], w: 0.014, h: 0.014, skin: sk(BONE.HEAD), col: [0.55, 0.5, 0.43], region: REGION.HORN },
        { p: [sx * 0.05, 0.2, -0.11], w: 0.009, h: 0.009, skin: sk(BONE.HEAD), col: [0.48, 0.43, 0.37], region: REGION.HORN },
        { p: [sx * 0.05, 0.225, -0.17], w: 0.003, h: 0.003, skin: sk(BONE.HEAD), col: [0.4, 0.36, 0.3], region: REGION.HORN },
      ], { seg: 6, sub: 2, up: [0, 0, 1], flat: true }));
    }
  },
  tail: lod => strand([[0, 0.8, -0.58, 0.032], [0, 0.88, -0.64, 0.026], [0, 0.95, -0.67, 0.018], [0, 0.99, -0.66, 0.008]], sk(BONE.TAIL, BONE.TAIL2, 0.5), lod, { region: REGION.TAIL, up: [1, 0, 0] }),
  extras: (out, lod) => {
    // wattles (two small tags under the jaw are skipped); udder
    out.push(blob([0, 0.46, -0.34], [0.07, 0.07, 0.1], { seg: lod.seg, rings: 4, col: [0.9, 0.72, 0.68], region: REGION.UDDER, skin: sk(BONE.ROOT), flat: true }));
  },
  bones: quadBones(c3(0, 0.72, 0.42), c3(0, 0.87, 0.88), c3(0, 0.8, -0.58), 0.1,
    { fore: [[0.085, 0.64, 0.42], [0.085, 0.52, 0.40], [0.085, 0.38, 0.41], [0.085, 0.09, 0.42]], hind: [[0.095, 0.70, -0.36], [0.095, 0.48, -0.27], [0.095, 0.28, -0.47], [0.095, 0.07, -0.45]], swing: [0.42, 0.4], flexF: [0, 0, -0.9, 0.3], flexH: [0, -0.4, 0.75, -0.3], foot: -0.1 },
    { neck: -1.0, head: 0.0, bob: 0.1 }, c3(0.05, 0.93, 0.86), 0.58, 0.3),
  breeds: [
    { name: 'Saanen', base: c3(0.93, 0.92, 0.88), style: 0, face: c3(0.9, 0.88, 0.84), faceMix: 0.5, fur: 0.45, furFreq: 55, nose: c3(0.7, 0.5, 0.48) },
    { name: 'Alpine', base: c3(0.52, 0.34, 0.2), style: 0, face: c3(0.12, 0.09, 0.08), faceMix: 0.6, leg: c3(0.1, 0.08, 0.07), legMix: 0.85, belly: c3(0.15, 0.11, 0.09), bellyMix: 0.8, bellyY: 0.55, fur: 0.45, furFreq: 55, nose: c3(0.12, 0.09, 0.08) },
    { name: 'Boer', base: c3(0.92, 0.9, 0.85), style: 0, face: c3(0.48, 0.2, 0.12), faceMix: 0.95, fur: 0.45, furFreq: 55, nose: c3(0.4, 0.3, 0.28) },
    { name: 'Pied', base: c3(0.9, 0.88, 0.84), style: 1, patch: c3(0.12, 0.1, 0.09), cover: 0.4, scale: 3.2, face: c3(0.12, 0.1, 0.09), faceMix: 0.3, fur: 0.45, furFreq: 55, nose: c3(0.3, 0.22, 0.2), size: 0.97 },
  ],
  zs: 0.8, withers: 0.84, length: 0.95, stride: 0.5, graze: { neck: -1.0, head: 0.0 }, root: { bob: 0.007, pitch: 0.01, cy: 0.62 },
};

export const PIG_MODEL = (): AnimalModel => model(PIG);
export const SHEEP_MODEL = (): AnimalModel => model(SHEEP);
export const GOAT_MODEL = (): AnimalModel => model(GOAT);
