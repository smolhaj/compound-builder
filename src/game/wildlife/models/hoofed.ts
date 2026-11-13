/**
 * The hoofed wildlife, built on animalQuad: white-tailed / mule deer (does and bucks; antlers grow with the season), elk, moose, pronghorn and
 * javelina. Real anatomy in metres (a whitetail doe about 0.9 m at the withers, 1.7 m nose to tail; an elk 1.4 m; a bull moose 1.9 m; a pronghorn
 * 0.85 m; a javelina 0.5 m), forward +z, left +x, ground y = 0; the instance scale is 1/6 (SCALE v2). Legs are long and thin with the real joints (elbow,
 * knee, fetlock; stifle, hock, fetlock: the hind leg has its Z shape), cloven hooves with dewclaws. Coats are painted in the shader (summer red / winter
 * gray, white belly, rump patch, throat patch, muzzle); antlers are REGION.ADORN, grown by the season (`antlerGrowth`).
 */
import { BONE, REGION, append, blob, clovenHoof, newMesh, skin, tube, type Lod, type Mesh, type Ring, type V3 } from '../../livestock/animalKit';
import type { Breed } from '../../livestock/animalMaterial';
import { nostrils, spike, strand, type AnimalModel, type HeadRow, type LimbRow } from '../../livestock/animalParts';
import { quadBones, quadModel, type NeckRow, type Quad } from '../../livestock/animalQuad';

const sk = skin;
const c3 = (a: number, b: number, c: number): V3 => [a, b, c];
const BONE_W: V3 = [0.86, 0.8, 0.68], BONE_T: V3 = [0.95, 0.92, 0.84], BONE_D: V3 = [0.5, 0.4, 0.3];
const HC: V3 = [0.12, 0.1, 0.09];

/** Where a point of the head frame ends up in the body frame once the head is placed (pitch about x, then translated). */
export const headPoint = (at: V3, pitch: number, p: V3): V3 => { const c = Math.cos(pitch), s = Math.sin(pitch); return [at[0] + p[0], at[1] + p[1] * c + p[2] * s, at[2] - p[1] * s + p[2] * c]; };

/** Cloven hoof plus the two small dewclaws behind the fetlock. */
function hoof(sx: number, b: number, x: number, z: number, s: number, lod: Lod, dew = true, col: V3 = HC): Mesh[] {
  const out: Mesh[] = [clovenHoof(sx * x, z, s, { seg: lod.seg, skin: sk(b), col, split: 0.3 })];
  if (dew && lod.detail < 2) for (const d of [-1, 1]) out.push(blob([sx * x + d * s * 0.3, s * 2.1, z - s * 1.05], [s * 0.22, s * 0.3, s * 0.4], { seg: 5, rings: 2, col, region: REGION.HOOF, skin: sk(b), flat: true }));
  return out;
}

/** An ear: a long flat leaf set at the crown, `len` long and `wd` wide, tilted out. Head frame. */
export function ear(sx: number, b: number, at: V3, len: number, wd: number, out: number, lod: Lod, o: { col?: V3; back?: number } = {}): Mesh {
  const col = o.col ?? [1, 1, 1];
  const rs: Ring[] = [0, 0.18, 0.5, 0.82, 1].map((t, i) => ({
    p: [at[0] + sx * (0.012 + t * len * out), at[1] + t * len * 0.92, at[2] - t * len * (o.back ?? 0.28)] as V3,
    w: wd * [0.34, 0.8, 1, 0.74, 0.18][i], h: 0.004, skin: i === 0 ? sk(BONE.HEAD, b, 0.35) : sk(b), coat: 1, region: REGION.EAR,
    col: i === 3 ? [col[0] * 0.92, col[1] * 0.92, col[2] * 0.92] as V3 : col,
  }));
  return tube(rs, { seg: Math.max(6, Math.round(lod.seg * 0.5)), sub: lod.sub > 1 ? 2 : 1, up: [0, 0, 1], flat: true, capEnd: true });
}

/** Scale a mesh's positions about the origin (a head part authored at deer size, grown to an elk's). */
function scaleMesh(m: Mesh, k: number): Mesh { for (let i = 0; i < m.pos.length; i++) m.pos[i] *= k; return m; }

/** Turn a head part built at the antler base `at` back against the head's downward pitch, so a rack that sweeps "back and up" does so in the world. */
function unpitch(m: Mesh, pitch: number, at: V3): Mesh {
  const c = Math.cos(-pitch), s = Math.sin(-pitch);
  for (let i = 0; i < m.pos.length; i += 3) {
    const y = m.pos[i + 1] - at[1], z = m.pos[i + 2] - at[2];
    m.pos[i + 1] = y * c + z * s + at[1]; m.pos[i + 2] = -y * s + z * c + at[2];
    const ny = m.nor[i + 1], nz = m.nor[i + 2]; m.nor[i + 1] = ny * c + nz * s; m.nor[i + 2] = -ny * s + nz * c;
  }
  return m;
}

type P4 = [number, number, number, number];
/** Antlers: a main beam through `beam` points (head frame, offsets from `at`; one side, mirrored) with tines [t along the beam, length, lean in, forward]. */
function antlers(at: V3, beam: P4[], tines: Array<[number, number, number, number]>, lod: Lod, thick = 1): Mesh {
  const out = newMesh(), root = sk(BONE.HEAD);
  const col = (t: number): V3 => [BONE_D[0] + (BONE_T[0] - BONE_D[0]) * Math.min(1, t * 3), BONE_D[1] + (BONE_T[1] - BONE_D[1]) * Math.min(1, t * 3), BONE_D[2] + (BONE_T[2] - BONE_D[2]) * Math.min(1, t * 3)];
  const seg = Math.max(5, Math.round(lod.seg * 0.5));
  for (const sx of [-1, 1]) {
    const bp = beam.map(([x, y, z, r]) => [at[0] + sx * x, at[1] + y, at[2] + z, r * thick] as P4);
    append(out, tube(bp.map(([x, y, z, r], i) => ({ p: [x, y, z] as V3, w: r, h: r, skin: root, coat: 0, region: REGION.ADORN, col: i === 0 ? BONE_D : i < 2 ? col(0.4) : BONE_W })), { seg, sub: lod.sub, up: [0, 0, 1], capEnd: true, flat: true }));
    const at2 = (t: number): P4 => {
      const f = t * (bp.length - 1), i = Math.min(bp.length - 2, Math.floor(f)), k = f - i;
      return [0, 1, 2, 3].map(j => bp[i][j] + (bp[i + 1][j] - bp[i][j]) * k) as P4;
    };
    if (lod.detail >= 2) continue;
    for (const [t, len, lean, fwd] of tines) {
      const [x, y, z, r] = at2(t);
      append(out, spike([[x, y, z, r * 0.8], [x - sx * len * 0.1 * lean, y + len * 0.5, z + len * fwd * 0.5, r * 0.55], [x - sx * len * 0.2 * lean, y + len, z + len * fwd, r * 0.15]], root, lod, { region: REGION.ADORN, col: BONE_W, colTip: BONE_T, seg: Math.max(4, Math.round(lod.seg * 0.36)) }));
    }
  }
  return out;
}

/** The parts every deer-family head has, authored at deer size (head frame): the pale muzzle ring, the nose pad, nostrils, eye rings, the throat patch, both ears. */
function cervHeadParts(head: Mesh, lod: Lod, o: { nose: number; earLen: number; earWd: number; earAt?: V3; earOut?: number; throat?: boolean; eyeRing?: boolean; muzzleW?: number; earCol?: V3 }): void {
  const z = o.nose, mw = o.muzzleW ?? 1;
  append(head, blob([0, -0.04 - (z - 0.245) * 0.18, z - 0.045], [0.03 * mw, 0.03, 0.045], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.ACC1, skin: sk(BONE.HEAD), flat: true }));
  append(head, blob([0, -0.04 - (z - 0.245) * 0.18, z], [0.0245 * mw, 0.0215, 0.018], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.NOSE, skin: sk(BONE.HEAD), flat: true }));
  append(head, nostrils([0, -0.04 - (z - 0.245) * 0.18, z + 0.012], 0.0115 * mw, 0.0065, sk(BONE.HEAD), lod));
  if (lod.detail < 2 && o.eyeRing !== false) for (const sx of [-1, 1]) append(head, blob([sx * 0.048, 0.034, 0.1], [0.0125, 0.017, 0.02], { seg: 6, rings: 3, col: [1, 1, 1], coat: 1, region: REGION.ACC2, skin: sk(BONE.HEAD), flat: true }));
  if (o.throat !== false) append(head, blob([0, -0.058, 0.045], [0.04, 0.03, 0.06], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.ACC2, skin: sk(BONE.HEAD), flat: true }));
  for (const sx of [-1, 1]) append(head, ear(sx, sx > 0 ? BONE.EAR_L : BONE.EAR_R, o.earAt ? [sx * o.earAt[0], o.earAt[1], o.earAt[2]] as V3 : [sx * 0.03, 0.062, -0.035] as V3, o.earLen, o.earWd, o.earOut ?? 1.15, lod, { col: o.earCol }));
}

// ---------------------------------------------------------------- the cervid base (a whitetail doe) and what scales from it
const DEER_FORE = (b: number): LimbRow[] => [
  [0.78, 0.38, 0.042, 0.06, sk(b)], [0.66, 0.355, 0.05, 0.068, sk(b)], [0.57, 0.335, 0.043, 0.054, sk(b, b + 1, 0.5)], [0.42, 0.345, 0.029, 0.035, sk(b + 1)], [0.285, 0.375, 0.023, 0.027, sk(b + 1, b + 2, 0.5)],
  [0.2, 0.378, 0.0155, 0.018, sk(b + 2)], [0.105, 0.388, 0.0145, 0.017, sk(b + 2, b + 3, 0.5)], [0.055, 0.4, 0.0145, 0.019, sk(b + 3)], [0.03, 0.41, 0.0155, 0.02, sk(b + 3)],
];
const DEER_HIND = (b: number): LimbRow[] => [
  [0.9, -0.42, 0.055, 0.095, sk(b)], [0.78, -0.4, 0.062, 0.12, sk(b)], [0.62, -0.33, 0.052, 0.09, sk(b)], [0.53, -0.31, 0.05, 0.074, sk(b, b + 1, 0.5)], [0.42, -0.4, 0.034, 0.05, sk(b + 1)],
  [0.31, -0.5, 0.026, 0.038, sk(b + 1, b + 2, 0.5)], [0.18, -0.465, 0.0165, 0.021, sk(b + 2)], [0.095, -0.435, 0.0148, 0.018, sk(b + 2, b + 3, 0.5)], [0.05, -0.42, 0.0148, 0.019, sk(b + 3)], [0.03, -0.415, 0.0155, 0.02, sk(b + 3)],
];
const FORE_PIV = [0, 2, 4, 6], HIND_PIV = [0, 3, 5, 7];
const DEER_BODY: Array<[number, number, number, number, number]> = [[0.53, 0.78, 0.56, 0.08, 2.1], [0.41, 0.93, 0.5, 0.125, 2.2], [0.15, 0.92, 0.5, 0.138, 2.3], [-0.12, 0.9, 0.54, 0.13, 2.3], [-0.38, 0.94, 0.6, 0.124, 2.2], [-0.56, 0.87, 0.65, 0.085, 2.0]];
const DEER_NECK: NeckRow[] = [{ y: 0.78, z: 0.4, w: 0.115, h: 0.15, dn: 0.16 }, { y: 0.93, z: 0.57, w: 0.085, h: 0.11, dn: 0.12 }, { y: 1.05, z: 0.71, w: 0.057, h: 0.075, dn: 0.082 }];
const DEER_HEAD: HeadRow[] = [[-0.06, 0, 0.054, 0.066, 0.072], [0.02, 0, 0.062, 0.07, 0.078], [0.1, -0.012, 0.05, 0.054, 0.058], [0.17, -0.03, 0.034, 0.038, 0.04], [0.225, -0.04, 0.029, 0.031, 0.031]];

interface Cerv {
  id: string; k: number;
  /** Extra leg length (1 = a deer's proportions): the body rides higher on longer legs. */
  legK?: number;
  neckK?: number; neckRegion?: number;
  head?: HeadRow[]; headAt?: V3; headPitch?: number; eye?: [number, number, number, number];
  body?: Array<[number, number, number, number, number]>;
  /** Dewclaws (a pronghorn has none). */
  dew?: boolean;
  headExtras: (head: Mesh, lod: Lod, k: number) => void;
  tail: (lod: Lod, k: number, lift: number) => Mesh;
  extras?: (out: Mesh[], lod: Lod, k: number, lift: number) => void;
  breeds: Breed[];
  bones: { swing: [number, number]; graze: { neck: number; head: number; bob: number }; alert: { neck: number; head: number; tail: number }; earAt: V3; tailBob: number };
  stride: number; withers: number; length: number;
  adorn: V3;
}
function cervid(o: Cerv): Quad {
  const q = cervid0(o);
  // the body tips nose-down to graze; the legs stay upright
  for (const b of [BONE.FL, BONE.FR, BONE.HL, BONE.HR]) if (q.bones[b]) q.bones[b]!.graze = 0.18;
  return q;
}
function cervid0(o: Cerv): Quad {
  const k = o.k, ly = k * (o.legK ?? 1), lift = 0.56 * k * ((o.legK ?? 1) - 1);
  const sc = (rows: LimbRow[]): LimbRow[] => rows.map(r => [r[0] * ly, r[1] * k, r[2] * k, r[3] * k, r[4]]);
  const fore = (b: number) => sc(DEER_FORE(b)), hind = (b: number) => sc(DEER_HIND(b));
  const body = (o.body ?? DEER_BODY).map(([z, t, bt, hw, pw]) => [z * k, t * k + lift, bt * k + lift, hw * k, pw] as [number, number, number, number, number]);
  const nk = o.neckK ?? 1;
  const neck: NeckRow[] = DEER_NECK.map(n => ({ y: n.y * k + lift, z: n.z * k, w: n.w * k * nk, h: n.h * k * nk, dn: n.dn * k * nk, region: o.neckRegion }));
  const head = (o.head ?? DEER_HEAD).map(([z, cy, w, h, dn]) => [z * k, cy * k, w * k, h * k, dn * k] as HeadRow);
  const headAt = o.headAt ?? c3(0, 1.055 * k + lift, 0.715 * k), headPitch = o.headPitch ?? -0.62;
  const fx = 0.072 * k, hx = 0.066 * k;
  const fp = FORE_PIV.map(i => { const r = fore(0)[i]; return c3(fx, r[0], r[1]); }), hp = HIND_PIV.map(i => { const r = hind(0)[i]; return c3(hx, r[0], r[1]); });
  const fl = fore(0), hl = hind(0), ffz = fl[fl.length - 1][1], hfz = hl[hl.length - 1][1];
  return {
    id: o.id, body, neck, head, headAt, headPitch, eye: (o.eye ?? [0.052, 0.034, 0.105, 0.0115]).map(v => v * k) as [number, number, number, number],
    fore, hind, foreX: fx, hindX: hx, coatFrom: 1,
    foot: (sx, b, isHind, lod) => isHind ? hoof(sx, b, hx, hfz - 0.005 * k, 0.0165 * k, lod, o.dew !== false) : hoof(sx, b, fx, ffz - 0.005 * k, 0.0155 * k, lod, o.dew !== false),
    headExtras: (h, lod) => o.headExtras(h, lod, k),
    tail: lod => o.tail(lod, k, lift),
    extras: (out, lod) => o.extras?.(out, lod, k, lift),
    bones: quadBones(
      { fore: fp as [V3, V3, V3, V3], hind: hp as [V3, V3, V3, V3], swing: o.bones.swing, flexF: [0, 0, -0.75, 0.3], flexH: [0, -0.28, 0.62, -0.25], foot: -0.1 },
      { neck: c3(0, 0.8 * k + lift, 0.42 * k), head: headAt, tail: c3(0, 0.9 * k + lift, -0.56 * k), tailBob: o.bones.tailBob, earAt: o.bones.earAt, rootY: 0.7 * k + lift, earFlick: 0.35, tailLen: 0.1 * k,
        graze: o.bones.graze, alert: { ...o.bones.alert, ear: 0 }, gallop: true }),
    breeds: o.breeds, withers: o.withers, length: o.length, stride: o.stride, graze: { neck: o.bones.graze.neck, head: o.bones.graze.head },
    root: { bob: 0.012 * k, pitch: 0.015, cy: 0.74 * k + lift, grazePitch: -0.18 }, rootPose: { alertPitch: 0.02 }, adorn: o.adorn,
  };
}

const DH = c3(0, 1.055, 0.715), DP = -0.62;
const deerBreed = (name: string, o: Partial<Breed> & { base: V3 }): Breed => ({ name, style: 0, fur: 0.45, furFreq: 60, nose: c3(0.06, 0.05, 0.05), acc1Mix: 0.95, acc2Mix: 0.95, ...o });
const DEER = cervid({
  id: 'deer', k: 1, stride: 1.2, withers: 0.93, length: 1.1, adorn: headPoint(DH, DP, c3(0, 0.072, -0.03)),
  bones: { swing: [0.27, 0.23], graze: { neck: -1.35, head: 0.15, bob: 0.1 }, alert: { neck: 0.32, head: 0.3, tail: -1.15 }, earAt: headPoint(DH, DP, c3(0.03, 0.062, -0.035)), tailBob: 0.18 },
  headExtras: (head, lod, k) => {
    const t = newMesh();
    cervHeadParts(t, lod, { nose: 0.245, earLen: 0.19, earWd: 0.046 });
    append(head, scaleMesh(t, k));
    // antlers (the whole set scales with the instance's growth; a doe's is zero): beam up, back and forward, three tines rising from it
    append(head, antlers([0, 0.072, -0.03], [[0.04, 0, 0, 0.016], [0.062, 0.07, -0.03, 0.0135], [0.082, 0.15, -0.0, 0.012], [0.082, 0.235, 0.085, 0.0105], [0.065, 0.285, 0.19, 0.008], [0.05, 0.3, 0.27, 0.0035]],
      [[0.45, 0.13, 0.7, 0.2], [0.62, 0.17, 0.7, 0.2], [0.8, 0.13, 0.7, 0.2]], lod));
  },
  tail: lod => {
    // the flag: brown above, white below; hangs at rest, lifts when alert
    const m = strand([[0, 0.9, -0.56, 0.026], [0, 0.82, -0.63, 0.042], [0, 0.7, -0.67, 0.046], [0, 0.6, -0.66, 0.026]], sk(BONE.TAIL, BONE.TAIL2, 0.6), lod, { region: REGION.TAIL, up: [1, 0, 0] });
    append(m, strand([[0, 0.89, -0.575, 0.02], [0, 0.8, -0.655, 0.035], [0, 0.68, -0.69, 0.04], [0, 0.6, -0.68, 0.02]], sk(BONE.TAIL, BONE.TAIL2, 0.6), lod, { region: REGION.ACC2, up: [1, 0, 0] }));
    return m;
  },
  extras: (out, lod) => { if (lod.detail < 2) out.push(blob([0, 0.76, -0.55], [0.06, 0.1, 0.045], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.ACC2, skin: sk(BONE.ROOT), flat: true })); },
  breeds: [
    deerBreed('Whitetail (summer)', { base: c3(0.6, 0.36, 0.19), face: c3(0.52, 0.34, 0.21), faceMix: 0.7, leg: c3(0.55, 0.34, 0.19), legMix: 0.6, belly: c3(0.9, 0.86, 0.78), bellyMix: 0.95, bellyY: 0.5, acc1: c3(0.93, 0.9, 0.86), acc2: c3(0.95, 0.93, 0.89) }),
    deerBreed('Whitetail (winter)', { base: c3(0.5, 0.39, 0.28), style: 8, patch: c3(0.4, 0.3, 0.21), cover: 0.4, scale: 14, face: c3(0.36, 0.3, 0.25), faceMix: 0.7, leg: c3(0.38, 0.3, 0.23), legMix: 0.6, belly: c3(0.84, 0.8, 0.74), bellyMix: 0.9, bellyY: 0.5, fur: 0.7, furFreq: 50, acc1: c3(0.88, 0.86, 0.82), acc2: c3(0.92, 0.9, 0.86) }),
    deerBreed('Mule deer (summer)', { base: c3(0.58, 0.4, 0.25), face: c3(0.44, 0.32, 0.22), faceMix: 0.6, leg: c3(0.5, 0.35, 0.22), legMix: 0.6, belly: c3(0.88, 0.84, 0.76), bellyMix: 0.95, bellyY: 0.5, acc1: c3(0.92, 0.9, 0.86), acc2: c3(0.94, 0.9, 0.82), size: 1.05 }),
    deerBreed('Mule deer (winter)', { base: c3(0.45, 0.4, 0.35), style: 8, patch: c3(0.33, 0.29, 0.25), cover: 0.4, scale: 14, face: c3(0.32, 0.28, 0.24), faceMix: 0.6, leg: c3(0.36, 0.32, 0.28), legMix: 0.6, belly: c3(0.84, 0.8, 0.74), bellyMix: 0.9, bellyY: 0.5, fur: 0.7, furFreq: 50, acc1: c3(0.88, 0.86, 0.82), acc2: c3(0.9, 0.88, 0.84), size: 1.05 }),
  ],
});
export const DEER_MODEL = (): AnimalModel => quadModel(DEER);

// ---------------------------------------------------------------- elk
const shortTail = (col: number, len = 0.14, wd = 0.04) => (lod: Lod, k: number, lift: number): Mesh =>
  strand([[0, 0.88 * k + lift, -0.56 * k, wd * k * 0.7], [0, (0.84 - len * 0.5) * k + lift, -0.6 * k, wd * k], [0, (0.84 - len) * k + lift, -0.62 * k, wd * k * 0.6]], sk(BONE.TAIL, BONE.TAIL2, 0.6), lod, { region: col, up: [1, 0, 0] });
const EK = 1.5, EH = c3(0, 1.055 * EK + 0.56 * EK * 0.06, 0.715 * EK);
const ELK_HEAD: HeadRow[] = [[-0.06, 0, 0.056, 0.07, 0.075], [0.03, 0, 0.066, 0.075, 0.082], [0.12, -0.015, 0.055, 0.06, 0.063], [0.2, -0.035, 0.04, 0.045, 0.047], [0.27, -0.05, 0.034, 0.037, 0.037]];
const elkBreed = (name: string, o: Partial<Breed> & { base: V3 }): Breed => ({ name, style: 0, fur: 0.55, furFreq: 50, nose: c3(0.08, 0.06, 0.05), acc1Mix: 0.9, acc2Mix: 0.95, acc3Mix: 0.9, ...o });
const ELK = cervid({
  id: 'elk', k: EK, legK: 1.06, neckK: 1.28, neckRegion: REGION.ACC3, stride: 1.9, withers: 1.4, length: 1.7,
  head: ELK_HEAD, headPitch: -0.55, adorn: headPoint(EH, -0.55, c3(0, 0.11, -0.05)), eye: [0.052, 0.036, 0.11, 0.0125],
  bones: { swing: [0.26, 0.22], graze: { neck: -1.35, head: 0.2, bob: 0.08 }, alert: { neck: 0.3, head: 0.28, tail: -0.5 }, earAt: headPoint(EH, -0.55, c3(0.04, 0.09, -0.05)), tailBob: 0.12 },
  headExtras: (head, lod, k) => {
    const t = newMesh();
    cervHeadParts(t, lod, { nose: 0.27, earLen: 0.17, earWd: 0.04, throat: false, eyeRing: false, muzzleW: 1.05 });
    append(head, scaleMesh(t, k));
    // a bull's rack: beams sweep up and back over the shoulders, tines point forward and up
    append(head, unpitch(antlers([0, 0.11, -0.05], [[0.06, 0, 0, 0.026], [0.1, 0.12, -0.05, 0.022], [0.16, 0.26, -0.2, 0.02], [0.2, 0.38, -0.45, 0.018], [0.2, 0.46, -0.75, 0.016], [0.16, 0.5, -1.05, 0.013], [0.12, 0.5, -1.3, 0.005]],
      [[0.13, 0.36, -0.3, 0.9], [0.22, 0.42, -0.1, 0.9], [0.36, 0.34, 0.1, 0.7], [0.52, 0.4, 0.2, 0.45], [0.72, 0.3, 0.3, 0.2]], lod), -0.35, [0, 0.11, -0.05]));
  },
  tail: shortTail(REGION.ACC2, 0.12, 0.05),
  extras: (out, lod, k) => {
    if (lod.detail < 2) {
      out.push(blob([0, 0.8 * k, -0.55 * k], [0.08 * k, 0.1 * k, 0.07 * k], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.ACC2, skin: sk(BONE.ROOT), flat: true }));      // the cream rump patch
      out.push(blob([0, 0.66 * k, 0.45 * k], [0.09 * k, 0.12 * k, 0.1 * k], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.ACC3, skin: sk(BONE.ROOT), flat: true }));        // dark chest
    }
  },
  breeds: [
    elkBreed('Elk (summer)', { base: c3(0.66, 0.5, 0.33), face: c3(0.32, 0.22, 0.15), faceMix: 0.9, leg: c3(0.3, 0.2, 0.13), legMix: 0.9, belly: c3(0.5, 0.38, 0.26), bellyMix: 0.4, bellyY: 0.62, acc1: c3(0.55, 0.45, 0.35), acc1Mix: 0.6, acc2: c3(0.88, 0.8, 0.62), acc3: c3(0.27, 0.18, 0.12) }),
    elkBreed('Elk (winter)', { base: c3(0.52, 0.44, 0.34), style: 8, patch: c3(0.4, 0.32, 0.24), cover: 0.4, scale: 12, fur: 0.8, face: c3(0.27, 0.19, 0.14), faceMix: 0.9, leg: c3(0.26, 0.18, 0.13), legMix: 0.9, belly: c3(0.4, 0.32, 0.25), bellyMix: 0.4, bellyY: 0.62, acc1: c3(0.5, 0.42, 0.34), acc1Mix: 0.6, acc2: c3(0.82, 0.76, 0.6), acc3: c3(0.22, 0.16, 0.11) }),
  ],
});
export const ELK_MODEL = (): AnimalModel => quadModel(ELK);

// ---------------------------------------------------------------- moose
const MK = 1.8, MLIFT = 0.56 * MK * 0.18, MH = c3(0, 1.0 * MK + MLIFT, 0.74 * MK);
const MOOSE_HEAD: HeadRow[] = [[-0.07, 0, 0.062, 0.078, 0.082], [0.03, 0, 0.072, 0.084, 0.092], [0.13, -0.02, 0.062, 0.072, 0.074], [0.23, -0.055, 0.054, 0.064, 0.058], [0.31, -0.09, 0.052, 0.062, 0.05], [0.36, -0.115, 0.046, 0.052, 0.04]];
const MOOSE_BODY: Array<[number, number, number, number, number]> = [[0.53, 0.8, 0.56, 0.09, 2.1], [0.41, 1.0, 0.5, 0.14, 2.2], [0.15, 0.94, 0.5, 0.15, 2.3], [-0.12, 0.88, 0.54, 0.135, 2.3], [-0.38, 0.86, 0.6, 0.12, 2.2], [-0.56, 0.8, 0.64, 0.085, 2.0]];
const mooseBreed = (name: string, o: Partial<Breed> & { base: V3 }): Breed => ({ name, style: 0, fur: 0.7, furFreq: 40, nose: c3(0.12, 0.09, 0.08), acc1Mix: 0.7, acc2Mix: 0.9, acc3Mix: 0.9, ...o });
const MOOSE = cervid({
  id: 'moose', k: MK, legK: 1.18, neckK: 1.2, stride: 2.2, withers: 1.9, length: 2.2, body: MOOSE_BODY,
  head: MOOSE_HEAD, headPitch: -0.82, headAt: MH, adorn: headPoint(MH, -0.82, c3(0, 0.12, -0.06)), eye: [0.062, 0.04, 0.1, 0.012],
  bones: { swing: [0.22, 0.2], graze: { neck: -1.3, head: 0.25, bob: 0.06 }, alert: { neck: 0.28, head: 0.3, tail: -0.3 }, earAt: headPoint(MH, -0.82, c3(0.05, 0.08, -0.05)), tailBob: 0.08 },
  headExtras: (head, lod, k) => {
    const t = newMesh();
    cervHeadParts(t, lod, { nose: 0.36, earLen: 0.17, earWd: 0.045, throat: false, eyeRing: false, earOut: 1.5, muzzleW: 1.05 });
    append(head, scaleMesh(t, k));
    // the bell under the throat
    append(head, blob([0, -0.1 * k, 0.0], [0.03 * k, 0.1 * k, 0.03 * k], { seg: Math.max(6, lod.seg - 2), rings: 4, col: [1, 1, 1], coat: 1, region: REGION.ACC3, skin: sk(BONE.HEAD), flat: true, tilt: -0.3 }));
    // palmate antlers: a short beam out to a broad palm with fingers along its front edge
    const rack = newMesh(), root = sk(BONE.HEAD), palm: Ring[] = [[0.06, 0.12, -0.06, 0.03, 0.03], [0.22, 0.16, -0.04, 0.06, 0.03], [0.42, 0.22, 0.0, 0.17, 0.034], [0.62, 0.29, 0.06, 0.24, 0.036], [0.82, 0.35, 0.1, 0.19, 0.03], [0.95, 0.38, 0.12, 0.08, 0.02]].map(([x, y, z, w, h], i) => ({ p: [x, y, z] as V3, w, h, skin: root, coat: 0, region: REGION.ADORN, col: i < 2 ? BONE_D : i === 2 ? BONE_W : BONE_T, pw: 2.4 }));
    for (const sx of [-1, 1]) {
      append(rack, tube(palm.map(r => ({ ...r, p: [sx * r.p[0], r.p[1], r.p[2]] as V3 })), { seg: Math.max(6, Math.round(lod.seg * 0.6)), sub: lod.sub, up: [0, 1, 0], capEnd: true, flat: true, flip: sx < 0 }));
      if (lod.detail < 2) for (const [i, len] of [[2, 0.26], [3, 0.36], [3.5, 0.32], [4, 0.28], [4.4, 0.2]] as const) {
        const f = i - Math.floor(i), a = palm[Math.floor(i)], b = palm[Math.min(palm.length - 1, Math.floor(i) + 1)];
        const x = a.p[0] + (b.p[0] - a.p[0]) * f, y = a.p[1] + (b.p[1] - a.p[1]) * f, z = a.p[2] + (b.p[2] - a.p[2]) * f, w = a.w + (b.w - a.w) * f;
        append(rack, spike([[sx * x, y, z + w * 0.7, 0.02], [sx * (x + 0.03), y + len * 0.2, z + w * 0.7 + len * 0.55, 0.014], [sx * (x + 0.05), y + len * 0.28, z + w * 0.7 + len, 0.004]], root, lod, { region: REGION.ADORN, col: BONE_W, colTip: BONE_T }));
      }
    }
    append(head, unpitch(rack, -0.82 + 0.3, [0, 0.12, -0.06]));
  },
  tail: shortTail(REGION.TAIL, 0.1, 0.03),
  extras: () => undefined,
  breeds: [
    mooseBreed('Moose', { base: c3(0.2, 0.14, 0.1), face: c3(0.18, 0.13, 0.1), faceMix: 0.7, leg: c3(0.5, 0.45, 0.38), legMix: 0.9, belly: c3(0.17, 0.12, 0.09), bellyMix: 0.3, bellyY: 0.7, acc1: c3(0.4, 0.3, 0.24), acc3: c3(0.17, 0.12, 0.09) }),
    mooseBreed('Moose (brown)', { base: c3(0.32, 0.22, 0.15), face: c3(0.28, 0.2, 0.14), faceMix: 0.7, leg: c3(0.55, 0.5, 0.42), legMix: 0.9, belly: c3(0.28, 0.2, 0.14), bellyMix: 0.3, bellyY: 0.7, acc1: c3(0.45, 0.34, 0.26), acc3: c3(0.25, 0.18, 0.12), size: 0.97 }),
  ],
});
export const MOOSE_MODEL = (): AnimalModel => quadModel(MOOSE);

// ---------------------------------------------------------------- pronghorn
const PK = 0.96, PH = c3(0, 1.055 * PK, 0.715 * PK);
const pgBreed = (name: string, o: Partial<Breed> & { base: V3 }): Breed => ({ name, style: 0, fur: 0.35, furFreq: 60, nose: c3(0.05, 0.045, 0.045), acc1Mix: 0.95, acc2Mix: 0.95, acc3Mix: 0.9, ...o });
const PRONG = cervid({
  id: 'pronghorn', k: PK, neckK: 1.1, dew: false, stride: 1.4, withers: 0.88, length: 1.25, head: [[-0.05, 0, 0.056, 0.07, 0.075], [0.03, 0, 0.066, 0.075, 0.08], [0.11, -0.01, 0.05, 0.055, 0.058], [0.18, -0.03, 0.036, 0.04, 0.04], [0.235, -0.04, 0.03, 0.033, 0.033]],
  headPitch: -0.5, adorn: PH, eye: [0.058, 0.04, 0.095, 0.0165],
  bones: { swing: [0.3, 0.26], graze: { neck: -1.35, head: 0.15, bob: 0.1 }, alert: { neck: 0.3, head: 0.3, tail: -0.3 }, earAt: headPoint(PH, -0.5, c3(0.03, 0.06, -0.03)), tailBob: 0.1 },
  headExtras: (head, lod, k) => {
    const t = newMesh();
    cervHeadParts(t, lod, { nose: 0.245, earLen: 0.11, earWd: 0.03, throat: true, eyeRing: false });
    // the black cheek patch and the black nose
    for (const sx of [-1, 1]) append(t, blob([sx * 0.05, -0.03, 0.115], [0.012, 0.03, 0.045], { seg: 6, rings: 3, col: [1, 1, 1], coat: 1, region: REGION.ACC3, skin: sk(BONE.HEAD), flat: true }));
    append(head, scaleMesh(t, k));
    // horns: black, a prong forward, then a hook back; on a REGION.HORN spike
    const root = sk(BONE.HEAD);
    for (const sx of [-1, 1]) {
      append(head, spike([[sx * 0.036, 0.065, -0.03, 0.017], [sx * 0.046, 0.14, -0.045, 0.015], [sx * 0.05, 0.2, -0.03, 0.012], [sx * 0.044, 0.25, 0.01, 0.007], [sx * 0.034, 0.268, 0.055, 0.002]], root, lod, { region: REGION.HORN, col: [0.1, 0.09, 0.08], colTip: [0.28, 0.25, 0.2] }));
      append(head, spike([[sx * 0.046, 0.14, -0.04, 0.012], [sx * 0.05, 0.17, 0.0, 0.009], [sx * 0.05, 0.19, 0.05, 0.002]], root, lod, { region: REGION.HORN, col: [0.1, 0.09, 0.08], colTip: [0.28, 0.25, 0.2] }));
    }
  },
  tail: shortTail(REGION.ACC1, 0.08, 0.03),
  extras: (out, lod, k) => {
    if (lod.detail < 2) {
      out.push(blob([0, 0.8 * k, -0.5 * k], [0.1 * k, 0.12 * k, 0.1 * k], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.ACC1, skin: sk(BONE.ROOT), flat: true }));      // the white rump
      out.push(blob([0, 0.97 * k, 0.4 * k], [0.02 * k, 0.04 * k, 0.12 * k], { seg: 6, rings: 3, col: [1, 1, 1], coat: 1, region: REGION.ACC3, skin: sk(BONE.ROOT), flat: true }));         // the dark mane
    }
  },
  breeds: [
    pgBreed('Pronghorn', { base: c3(0.74, 0.5, 0.26), face: c3(0.68, 0.46, 0.24), faceMix: 0.7, leg: c3(0.72, 0.5, 0.28), legMix: 0.5, belly: c3(0.93, 0.9, 0.84), bellyMix: 0.97, bellyY: 0.58, acc1: c3(0.95, 0.93, 0.88), acc2: c3(0.94, 0.92, 0.87), acc3: c3(0.09, 0.08, 0.07) }),
    pgBreed('Pronghorn (pale)', { base: c3(0.66, 0.48, 0.3), face: c3(0.6, 0.44, 0.28), faceMix: 0.7, leg: c3(0.66, 0.5, 0.32), legMix: 0.5, belly: c3(0.93, 0.9, 0.84), bellyMix: 0.97, bellyY: 0.58, acc1: c3(0.95, 0.93, 0.88), acc2: c3(0.94, 0.92, 0.87), acc3: c3(0.1, 0.09, 0.08), size: 0.96 }),
  ],
});
export const PRONGHORN_MODEL = (): AnimalModel => quadModel(PRONG);

// ---------------------------------------------------------------- javelina (collared peccary)
const JV_FORE = (b: number): LimbRow[] => [
  [0.46, 0.34, 0.04, 0.055, sk(b)], [0.38, 0.32, 0.04, 0.05, sk(b, b + 1, 0.5)], [0.27, 0.33, 0.026, 0.03, sk(b + 1, b + 2, 0.5)], [0.17, 0.34, 0.016, 0.019, sk(b + 2)],
  [0.07, 0.35, 0.015, 0.02, sk(b + 2, b + 3, 0.5)], [0.035, 0.36, 0.015, 0.022, sk(b + 3)], [0.022, 0.365, 0.016, 0.024, sk(b + 3)],
];
const JV_HIND = (b: number): LimbRow[] => [
  [0.5, -0.33, 0.07, 0.1, sk(b)], [0.42, -0.31, 0.06, 0.09, sk(b)], [0.34, -0.27, 0.04, 0.06, sk(b, b + 1, 0.5)], [0.25, -0.33, 0.026, 0.035, sk(b + 1)],
  [0.18, -0.38, 0.02, 0.027, sk(b + 1, b + 2, 0.5)], [0.1, -0.36, 0.015, 0.019, sk(b + 2)], [0.05, -0.34, 0.015, 0.02, sk(b + 2, b + 3, 0.5)], [0.025, -0.335, 0.016, 0.022, sk(b + 3)],
];
const jvBreed = (name: string, o: Partial<Breed> & { base: V3 }): Breed => ({ name, style: 8, patch: c3(0.42, 0.38, 0.32), cover: 0.45, scale: 14, fur: 1.4, furFreq: 40, nose: c3(0.1, 0.08, 0.08), acc1Mix: 0.9, ...o });
const JAV: Quad = {
  id: 'javelina',
  body: [[0.4, 0.46, 0.3, 0.09, 2.1], [0.28, 0.54, 0.26, 0.14, 2.2], [0.06, 0.53, 0.25, 0.16, 2.3], [-0.16, 0.51, 0.26, 0.155, 2.3], [-0.33, 0.46, 0.29, 0.12, 2.1], [-0.4, 0.4, 0.31, 0.07, 2.0]],
  neck: [{ y: 0.42, z: 0.36, w: 0.12, h: 0.15, dn: 0.14 }, { y: 0.44, z: 0.5, w: 0.1, h: 0.12, dn: 0.11 }, { y: 0.4, z: 0.6, w: 0.085, h: 0.09, dn: 0.09 }],
  head: [[-0.05, 0, 0.075, 0.09, 0.09], [0.05, 0, 0.088, 0.095, 0.095], [0.13, -0.018, 0.072, 0.075, 0.07], [0.2, -0.035, 0.058, 0.058, 0.054], [0.24, -0.045, 0.055, 0.052, 0.047]],
  headAt: c3(0, 0.4, 0.62), headPitch: -0.55, eye: [0.058, 0.04, 0.115, 0.0095],
  fore: JV_FORE, hind: JV_HIND, foreX: 0.07, hindX: 0.075, coatFrom: 3,
  foot: (sx, b, hind, lod) => [clovenHoof(sx * (hind ? 0.085 : 0.075), hind ? -0.34 : 0.362, 0.0125, { seg: lod.seg, skin: sk(b), col: HC, split: 0.3 })],
  headExtras: (head, lod) => {
    append(head, blob([0, -0.047, 0.245], [0.052, 0.04, 0.022], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.NOSE, skin: sk(BONE.HEAD), flat: true }));      // the flat snout disc
    append(head, nostrils([0, -0.045, 0.265], 0.018, 0.008, sk(BONE.HEAD), lod));
    if (lod.detail < 2) for (const sx of [-1, 1]) {
      append(head, spike([[sx * 0.04, -0.06, 0.16, 0.007], [sx * 0.044, -0.045, 0.175, 0.005], [sx * 0.042, -0.025, 0.182, 0.0015]], sk(BONE.HEAD), lod, { region: REGION.TEETH, col: [0.85, 0.82, 0.7], seg: 4 }));    // the tusk tips
    }
    for (const sx of [-1, 1]) append(head, ear(sx, sx > 0 ? BONE.EAR_L : BONE.EAR_R, [sx * 0.05, 0.08, -0.02], 0.085, 0.036, 0.5, lod, { back: 0.1 }));
  },
  tail: lod => strand([[0, 0.5, -0.44, 0.012], [0, 0.46, -0.48, 0.01], [0, 0.43, -0.49, 0.004]], sk(BONE.TAIL, BONE.TAIL2, 0.5), lod, { region: REGION.TAIL, up: [1, 0, 0] }),
  extras: (out, lod) => {
    // the pale collar over the shoulders and a ridge of bristles down the spine
    if (lod.detail < 2) out.push(tube([-150, -120, -85, -50, -20, 20, 50, 85, 120, 150].map(d => d * Math.PI / 180).map(th => [0.168 * Math.sin(th), 0.385 + 0.165 * Math.cos(th)]).map(([x, y]) => ({ p: [x, y, 0.3] as V3, w: 0.026, h: 0.024, skin: sk(BONE.ROOT), coat: 1, region: REGION.ACC1, col: [1, 1, 1] as V3 })), { seg: 6, sub: 1, up: [0, 0, 1], flat: true }));
    out.push(tube([[0.36, 0.495, 0.012], [0.28, 0.535, 0.02], [0.1, 0.53, 0.022], [-0.15, 0.51, 0.02], [-0.32, 0.465, 0.012]].map(([z, y, w]) => ({ p: [0, y, z] as V3, w, h: 0.028, dn: 0.004, skin: sk(BONE.ROOT), coat: 1, region: REGION.TAIL, col: [1, 1, 1] as V3 })), { seg: 6, sub: 1, up: [0, 1, 0], flat: true }));
  },
  bones: quadBones(
    { fore: [[0.075, 0.46, 0.34], [0.075, 0.38, 0.32], [0.075, 0.27, 0.33], [0.075, 0.07, 0.35]], hind: [[0.085, 0.5, -0.33], [0.085, 0.34, -0.27], [0.085, 0.18, -0.38], [0.085, 0.05, -0.34]],
      swing: [0.4, 0.36], flexF: [0, 0, -0.8, 0.3], flexH: [0, -0.35, 0.7, -0.3], foot: -0.1 },
    { neck: c3(0, 0.42, 0.36), head: c3(0, 0.4, 0.62), tail: c3(0, 0.5, -0.44), tailBob: 0.1, earAt: headPoint(c3(0, 0.4, 0.62), -0.55, c3(0.045, 0.075, -0.02)), rootY: 0.42, earFlick: 0.3, tailLen: 0.05,
      graze: { neck: -0.4, head: 0.1, bob: 0.1 }, alert: { neck: 0.25, head: 0.2, tail: -0.3 }, gallop: true }),
  breeds: [
    jvBreed('Javelina', { base: c3(0.2, 0.19, 0.17), face: c3(0.18, 0.17, 0.15), faceMix: 0.5, leg: c3(0.17, 0.15, 0.13), legMix: 0.6, belly: c3(0.28, 0.26, 0.23), bellyMix: 0.3, bellyY: 0.3, acc1: c3(0.72, 0.68, 0.58) }),
    jvBreed('Javelina (gray)', { base: c3(0.28, 0.27, 0.25), face: c3(0.2, 0.19, 0.17), faceMix: 0.5, leg: c3(0.2, 0.18, 0.16), legMix: 0.6, belly: c3(0.34, 0.32, 0.28), bellyMix: 0.3, bellyY: 0.3, acc1: c3(0.78, 0.74, 0.64), size: 0.95 }),
  ],
  withers: 0.53, length: 0.95, stride: 0.6, graze: { neck: -0.4, head: 0.1 }, root: { bob: 0.01, pitch: 0.02, cy: 0.42 }, rootPose: { alertPitch: 0.02 }, extra: true,
};
export const JAVELINA_MODEL = (): AnimalModel => quadModel(JAV);

/** How far an adult buck's antlers have grown on this day of the year (0..1): shed by March, new in velvet from April, full and hard by September, kept through the rut, dropped in winter. */
export function antlerGrowth(doy: number): number {
  const d = ((doy % 365) + 365) % 365;
  if (d < 100) return 0.0001;                                                  // shed (January to early April): pedicles only
  if (d < 250) return Math.min(1, 0.04 + ((d - 100) / 150) * 0.96);            // growing in velvet from April
  if (d < 335) return 1;                                                       // hard from September through the rut
  return Math.max(0.0001, 1 - (d - 335) / 22);                                 // dropped by early January
}
