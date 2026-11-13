/**
 * Cattle: a Holstein-type dairy cow (angular, deep barrel, udder; Holstein / Jersey / Ayrshire coats) and a beef steer (stockier, shorter
 * leg, heavier neck and hindquarter; Angus / Hereford / Red Angus / Charolais coats). Metres, forward +z, left +x.
 */
import { BONE, REGION, append, blob, clovenHoof, skin, toGeometry, tube, type Lod, type Mesh, type Ring, type V3 } from './animalKit';
import type { BoneAnim, Breed } from './animalMaterial';
import { WALK_OFF, eye, legBones, limb, nostrils, place, type AnimalModel, type LimbRow } from './animalParts';

interface Frame {
  /** Withers height scale, depth/width scale, leg length scale. */
  graze: [number, number]; s: number; deep: number; wide: number; udder: boolean; neckThick: number; muscle: number; brow: number;
}
const DAIRY: Frame = { graze: [-0.85, 0.35], s: 1, deep: 1, wide: 1, udder: true, neckThick: 1, muscle: 1, brow: 1 };
const BEEF: Frame = { graze: [-0.8, 0.3], s: 0.93, deep: 1.05, wide: 1.13, udder: false, neckThick: 1.22, muscle: 1.22, brow: 1.1 };

const sk = skin;
const R = BONE.ROOT, FL = BONE.FL, FR = BONE.FR, HL = BONE.HL, HR = BONE.HR;

function buildCattle(f: Frame, lod: Lod): ReturnType<typeof toGeometry> {
  const out: Mesh[] = [];
  const { seg, sub } = lod, wd = f.wide, dp = f.deep, ly = f.s;      // ly: scales heights above the ground (the whole animal)
  const Y = (v: number) => v * ly;
  // --- barrel: [z, top, bottom, half-width, squareness]
  const rows: Array<[number, number, number, number, number]> = [
    [1.10, 1.12, 0.78, 0.17, 2.2], [0.93, 1.35, 0.66, 0.26, 2.2], [0.70, 1.42, 0.60, 0.31, 2.2], [0.40, 1.38, 0.57, 0.35, 2.3],
    [0.05, 1.37, 0.54, 0.37, 2.4], [-0.30, 1.39, 0.58, 0.36, 2.4], [-0.62, 1.42, 0.72, 0.33, 2.3], [-0.88, 1.44, 0.80, 0.31, 2.4],
    [-1.08, 1.40, 0.84, 0.26, 2.2], [-1.22, 1.32, 0.90, 0.17, 2.0],
  ];
  const body: Ring[] = rows.map(([z, top, bot, hw, pw]) => {
    const t = Y(top), b = Y(bot), mid = (t + b) / 2, half = ((t - b) / 2) * (0.5 + 0.5 * dp);
    return { p: [0, mid + (dp - 1) * -0.03, z], w: hw * wd * 1.07, h: half, dn: half * 1.04, pw, skin: skin(R), coat: 1, region: REGION.BODY, col: [1, 1, 1] };
  });
  out.push(tube(body, { seg, sub, capStart: true, capEnd: true }));
  // --- neck: base buried in the shoulders, dewlap under the throat
  const nk = f.neckThick;
  const neck: Ring[] = [
    { p: [0, Y(1.09), 0.86], w: 0.23 * nk, h: 0.25 * nk, dn: 0.30 * nk, skin: sk(R), coat: 1, col: [1, 1, 1] },
    { p: [0, Y(1.15), 1.18], w: 0.2 * nk, h: 0.22 * nk, dn: 0.30 * nk, skin: sk(R, BONE.NECK, 0.5), coat: 1, col: [1, 1, 1] },
    { p: [0, Y(1.16), 1.5], w: 0.17 * nk, h: 0.18 * nk, dn: 0.24 * nk, skin: sk(BONE.NECK), coat: 1, col: [1, 1, 1] },
    { p: [0, Y(1.15), 1.8], w: 0.14 * nk, h: 0.14, dn: 0.17, skin: sk(BONE.NECK, BONE.HEAD, 0.5), coat: 1, col: [1, 1, 1] },
  ];
  out.push(tube(neck, { seg, sub }));
  // --- head, built along its own axis from the poll, then pitched down
  const hs = f.brow, H = (z: number, cy: number, w: number, h: number, dn: number): Ring => ({ p: [0, cy, z], w: w * hs, h, dn, pw: 2.3, skin: sk(BONE.HEAD), coat: 1, region: REGION.HEAD, col: [1, 1, 1] });
  const head = tube([
    H(-0.05, 0, 0.11, 0.105, 0.115), H(0.06, 0, 0.14, 0.12, 0.125), H(0.18, -0.01, 0.135, 0.105, 0.13), H(0.28, -0.035, 0.11, 0.088, 0.12),
    H(0.36, -0.055, 0.1, 0.08, 0.108), H(0.43, -0.068, 0.108, 0.074, 0.095), H(0.47, -0.074, 0.105, 0.066, 0.08),
  ], { seg, sub, capStart: true, up: [0, 1, 0] });
  const nose = blob([0, -0.077, 0.47], [0.104, 0.064, 0.04], { seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.NOSE, skin: sk(BONE.HEAD), flat: true });
  append(head, nose);
  append(head, nostrils([0, -0.07, 0.508], 0.046, 0.017, sk(BONE.HEAD), lod, 0.1));
  for (const sx of [-1, 1]) {
    append(head, eye(sx, [0.112 * hs, 0.045, 0.2], 0.019, sk(BONE.HEAD), lod));
    // ear: a flat leaf out and a little down and back from behind the brow
    const e = (BONE_EAR: number): Ring[] => [
      { p: [sx * 0.09, 0.06, -0.02], w: 0.04, h: 0.012, skin: sk(BONE.HEAD, BONE_EAR, 0.4), coat: 1, region: REGION.EAR, col: [1, 1, 1] },
      { p: [sx * 0.17, 0.05, -0.04], w: 0.056, h: 0.009, skin: sk(BONE_EAR), coat: 1, region: REGION.EAR, col: [1, 1, 1] },
      { p: [sx * 0.245, 0.02, -0.07], w: 0.046, h: 0.007, skin: sk(BONE_EAR), coat: 1, region: REGION.EAR, col: [0.9, 0.9, 0.9] },
      { p: [sx * 0.285, -0.015, -0.09], w: 0.016, h: 0.005, skin: sk(BONE_EAR), coat: 1, region: REGION.EAR, col: [0.85, 0.85, 0.85] },
    ];
    append(head, tube(e(sx > 0 ? BONE.EAR_L : BONE.EAR_R), { seg: Math.max(6, seg - 4), sub: 1, up: [0, 1, 0], flat: true }));
  }
  out.push(place(head, -0.8, [0, Y(1.15), 1.8]));
  // --- tail: hangs from the tailhead to a switch near the hocks
  const T = (y: number, z: number, w: number, b: number, b2 = b, wt = 0): Ring => ({ p: [0, Y(y), z], w, h: w, skin: sk(b, b2, wt), coat: 1, region: REGION.TAIL, col: [0.95, 0.95, 0.95], pw: 2 });
  out.push(tube([T(1.33, -1.20, 0.04, BONE.TAIL), T(1.05, -1.30, 0.03, BONE.TAIL), T(0.80, -1.31, 0.024, BONE.TAIL, BONE.TAIL2, 0.5), T(0.55, -1.30, 0.022, BONE.TAIL2), T(0.40, -1.30, 0.05, BONE.TAIL2), T(0.27, -1.30, 0.045, BONE.TAIL2), T(0.22, -1.30, 0.02, BONE.TAIL2)],
    { seg: Math.max(6, seg - 4), sub, up: [0, 0, 1], capEnd: true }));
  // --- udder and teats
  if (f.udder) {
    out.push(blob([0, Y(0.66), -0.62], [0.16, 0.15, 0.21], { seg, rings: 5, col: [0.92, 0.72, 0.68], region: REGION.UDDER, coat: 0, skin: sk(R), flat: true }));
    if (lod.detail < 2) for (const [x, z] of [[0.06, -0.52], [-0.06, -0.52], [0.065, -0.72], [-0.065, -0.72]]) {
      out.push(tube([{ p: [x, Y(0.58), z], w: 0.022, h: 0.022, skin: sk(R), col: [0.88, 0.62, 0.6], region: REGION.FLESH }, { p: [x, Y(0.50), z], w: 0.016, h: 0.016, skin: sk(R), col: [0.8, 0.52, 0.5], region: REGION.FLESH }],
        { seg: 6, up: [0, 0, 1], capEnd: true, flat: true }));
    }
  }
  // --- legs. Rows: [y, z, half-width, half-depth, skin]
  const fore = (b: number): LimbRow[] => [
    [Y(1.12), 0.80, 0.13 * wd, 0.17, sk(b)], [Y(0.96), 0.76, 0.125 * wd, 0.16, sk(b)], [Y(0.80), 0.70, 0.105 * wd, 0.13, sk(b, b + 1, 0.5)],
    [Y(0.64), 0.73, 0.075, 0.09, sk(b + 1)], [Y(0.50), 0.76, 0.062, 0.068, sk(b + 1, b + 2, 0.5)], [Y(0.32), 0.765, 0.041, 0.046, sk(b + 2)],
    [Y(0.15), 0.775, 0.052, 0.056, sk(b + 2, b + 3, 0.5)], [Y(0.095), 0.80, 0.040, 0.044, sk(b + 3)], [Y(0.06), 0.82, 0.046, 0.05, sk(b + 3)],
  ];
  const m = f.muscle;
  const hind = (b: number): LimbRow[] => [
    [Y(1.20), -0.80, 0.17 * m, 0.21 * m, sk(b)], [Y(1.02), -0.74, 0.17 * m, 0.24 * m, sk(b)], [Y(0.86), -0.62, 0.12 * m, 0.16 * m, sk(b, b + 1, 0.5)],
    [Y(0.70), -0.76, 0.085 * m, 0.12 * m, sk(b + 1)], [Y(0.52), -0.93, 0.062, 0.095, sk(b + 1, b + 2, 0.5)], [Y(0.33), -0.90, 0.04, 0.05, sk(b + 2)],
    [Y(0.15), -0.87, 0.05, 0.056, sk(b + 2, b + 3, 0.5)], [Y(0.095), -0.85, 0.04, 0.044, sk(b + 3)], [Y(0.06), -0.83, 0.046, 0.05, sk(b + 3)],
  ];
  const hoofCol: V3 = [0.13, 0.11, 0.10];
  for (const [sx, bF, bH] of [[1, FL, HL], [-1, FR, HR]] as const) {
    out.push(limb(sx, 0.17 * wd, fore(bF), lod, { coatFrom: 5 }));
    out.push(limb(sx, 0.185 * wd, hind(bH), lod, { coatFrom: 5 }));
    if (lod.detail < 2) {
      out.push(clovenHoof(sx * 0.17 * wd, 0.80, 0.055, { seg, skin: sk(bF + 3), col: hoofCol }));
      out.push(clovenHoof(sx * 0.185 * wd, -0.855, 0.055, { seg, skin: sk(bH + 3), col: hoofCol }));
    }
  }
  const g = toGeometry(out);
  g.scale(1, 1, ZS);
  return g;
}
const ZS = 0.84;

function skeleton(f: Frame): Array<BoneAnim | undefined> {
  const Y = (v: number) => v * f.s, b: Array<BoneAnim | undefined> = [];
  b[BONE.ROOT] = { pivot: [0, Y(0.9), 0], parent: -1 };
  b[BONE.NECK] = { pivot: [0, Y(1.25), 0.86], parent: 0, graze: f.graze[0], idle: 0.025, idleFreq: 0.5, idlePh: 0.3 };
  b[BONE.HEAD] = { pivot: [0, Y(1.15), 1.8], parent: BONE.NECK, graze: f.graze[1], idle: 0.05, idleFreq: 0.8, idlePh: 1.0, bob: 0.1 };
  b[BONE.TAIL] = { pivot: [0, Y(1.33), -1.2], parent: 0, axis: 1, idle: 0.1, idleFreq: 1.1, idlePh: 0.5, swing: 0.06 };
  b[BONE.TAIL2] = { pivot: [0, Y(0.85), -1.3], parent: BONE.TAIL, axis: 1, idle: 0.16, idleFreq: 1.7, idlePh: 0.9 };
  b[BONE.EAR_L] = { pivot: [0.08, Y(1.15), 1.8], parent: BONE.HEAD, axis: 1, idle: 0.35, idleFreq: 0.37, idlePh: 2.3, pulse: true };
  b[BONE.EAR_R] = { pivot: [-0.08, Y(1.15), 1.8], parent: BONE.HEAD, axis: 1, idle: 0.35, idleFreq: 0.29, idlePh: 5.1, pulse: true };
  const wd = f.wide;
  const fp = (x: number): [V3, V3, V3, V3] => [[x, Y(1.05), 0.82], [x, Y(0.80), 0.70], [x, Y(0.50), 0.76], [x, Y(0.15), 0.775]];
  const hp = (x: number): [V3, V3, V3, V3] => [[x, Y(1.22), -0.80], [x, Y(0.86), -0.62], [x, Y(0.52), -0.93], [x, Y(0.15), -0.87]];
  for (const [sx, bf, bh, of, oh] of [[1, BONE.FL, BONE.HL, WALK_OFF.FL, WALK_OFF.HL], [-1, BONE.FR, BONE.HR, WALK_OFF.FR, WALK_OFF.HR]] as const) {
    legBones(b, { base: bf, pivots: fp(0.17 * wd), swing: 0.34, flex: [0, 0, -0.7, 0.3], foot: -0.12, off: of, sx });
    legBones(b, { base: bh, pivots: hp(0.185 * wd), swing: 0.31, flex: [0, -0.35, 0.6, -0.25], foot: -0.1, off: oh, sx });
  }
  for (const x of b) if (x) x.pivot = [x.pivot[0], x.pivot[1], x.pivot[2] * ZS];
  return b;
}

const cow = (c: number[]): V3 => [c[0], c[1], c[2]];
export const HOLSTEIN: Breed[] = [
  { name: 'Holstein', base: cow([0.93, 0.92, 0.89]), style: 1, patch: cow([0.07, 0.065, 0.065]), cover: 0.46, scale: 2.1, face: cow([0.1, 0.09, 0.09]), faceMix: 0.75, leg: cow([0.92, 0.91, 0.88]), legMix: 0.95, belly: cow([0.9, 0.88, 0.85]), bellyMix: 0.7, bellyY: 0.7, fur: 0.4, furFreq: 38, nose: cow([0.36, 0.26, 0.26]) },
  { name: 'Holstein (black)', base: cow([0.92, 0.91, 0.88]), style: 1, patch: cow([0.06, 0.055, 0.055]), cover: 0.68, scale: 1.7, face: cow([0.08, 0.075, 0.075]), faceMix: 0.9, leg: cow([0.9, 0.9, 0.87]), legMix: 0.9, belly: cow([0.9, 0.88, 0.85]), bellyMix: 0.6, bellyY: 0.7, fur: 0.4, furFreq: 38, nose: cow([0.12, 0.1, 0.1]) },
  { name: 'Jersey', base: cow([0.62, 0.38, 0.2]), style: 1, patch: cow([0.46, 0.27, 0.13]), cover: 0.4, scale: 3.2, face: cow([0.5, 0.34, 0.2]), faceMix: 0.5, leg: cow([0.45, 0.3, 0.18]), legMix: 0.6, belly: cow([0.78, 0.62, 0.45]), bellyMix: 0.6, bellyY: 0.78, fur: 0.35, furFreq: 42, nose: cow([0.12, 0.09, 0.08]), size: 0.9 },
  { name: 'Ayrshire', base: cow([0.93, 0.9, 0.86]), style: 1, patch: cow([0.52, 0.2, 0.12]), cover: 0.42, scale: 2.2, face: cow([0.52, 0.2, 0.12]), faceMix: 0.5, leg: cow([0.92, 0.9, 0.86]), legMix: 0.9, fur: 0.4, furFreq: 38, nose: cow([0.5, 0.35, 0.33]), size: 0.95 },
];
export const BEEF_BREEDS: Breed[] = [
  { name: 'Angus', base: cow([0.075, 0.07, 0.07]), style: 0, face: cow([0.07, 0.065, 0.065]), faceMix: 0, fur: 0.55, furFreq: 40, nose: cow([0.08, 0.07, 0.07]) },
  { name: 'Hereford', base: cow([0.5, 0.2, 0.1]), style: 0, face: cow([0.93, 0.9, 0.85]), faceMix: 0.97, leg: cow([0.93, 0.9, 0.85]), legMix: 0.95, belly: cow([0.93, 0.9, 0.85]), bellyMix: 0.95, bellyY: 0.78, fur: 0.6, furFreq: 40, nose: cow([0.55, 0.4, 0.38]) },
  { name: 'Red Angus', base: cow([0.36, 0.1, 0.06]), style: 0, face: cow([0.3, 0.09, 0.05]), faceMix: 0.4, fur: 0.55, furFreq: 40, nose: cow([0.2, 0.12, 0.1]) },
  { name: 'Charolais', base: cow([0.88, 0.82, 0.7]), style: 0, face: cow([0.9, 0.84, 0.72]), faceMix: 0.5, fur: 0.5, furFreq: 40, nose: cow([0.62, 0.48, 0.44]), size: 1.04 },
];

const make = (id: string, f: Frame, breeds: Breed[]): AnimalModel => ({
  id, build: lod => buildCattle(f, lod), withers: 1.42 * f.s, length: 2.05, stride: 1.2,
  graze: { neck: f.graze[0], head: f.graze[1] },
  spec: { bones: skeleton(f), breeds, root: { bob: 0.012, pitch: 0.008, hop: false, cy: 0.9, cz: 0 }, grazeFreq: 7, key: id },
});
export const COW_DAIRY = (): AnimalModel => make('cow', DAIRY, HOLSTEIN);
export const COW_BEEF = (): AnimalModel => make('steer', BEEF, BEEF_BREEDS);
