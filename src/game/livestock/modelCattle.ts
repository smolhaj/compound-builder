/**
 * Cattle: a Holstein-type dairy cow (angular, deep barrel, udder; Holstein / Jersey / Ayrshire coats) and a beef steer (stockier, shorter
 * leg, heavier neck and hindquarter; Angus / Hereford / Red Angus / Charolais coats). Metres, forward +z, left +x.
 */
import { BONE, REGION, append, blob, clovenHoof, skin, toGeometry, tube, type Lod, type Mesh, type Ring, type V3 } from './animalKit';
import type { BoneAnim, Breed } from './animalMaterial';
import { eye, legBones, limb, nostrils, place, type AnimalModel, type LimbRow } from './animalParts';

interface Frame {
  /** Graze pose of the neck / head bones. */
  graze: [number, number];
  /** Withers height scale, barrel width scale, leg muscle scale, neck thickness, brow width scale. */
  s: number; wide: number; muscle: number; neckThick: number; brow: number;
  /** A dairy cow: udder, angular hooks and pins, clean neck; a beef steer: crest, horn buds, heavy gaskin. */
  dairy: boolean;
}
const DAIRY: Frame = { graze: [-0.97, 0.3], s: 1, wide: 1, muscle: 1, neckThick: 1, brow: 1, dairy: true };
const BEEF: Frame = { graze: [-0.95, 0.3], s: 0.93, wide: 1.12, muscle: 1.22, neckThick: 1.28, brow: 1.1, dairy: false };

const sk = skin;
const R = BONE.ROOT, FL = BONE.FL, FR = BONE.FR, HL = BONE.HL, HR = BONE.HR;
/** Where the poll sits (y, z) before the height scale: carried level with the back, on a short thick neck. */
const POLL = { y: 1.33, z: 1.30 };
/** Where the neck bone pivots (the shoulder / withers). */
const NECKP = { y: 1.22, z: 0.60 };
const FORE_Z = 0.63, HIND_Z = -0.84;

/** A barrel ring: widest `f` of the way up from the belly (a rib cage bulges low), top and bottom heights in metres. */
function bring(z: number, top: number, bot: number, hw: number, f: number, pw: number, region: number = REGION.BODY): Ring {
  const cy = bot + (top - bot) * f;
  return { p: [0, cy, z], w: hw, h: top - cy, dn: cy - bot, pw, skin: sk(R), coat: 1, region, col: [1, 1, 1] };
}

function buildCattle(f: Frame, lod: Lod): ReturnType<typeof toGeometry> {
  const out: Mesh[] = [];
  const { seg, sub } = lod, wd = f.wide, ly = f.s, dairy = f.dairy;
  const Y = (v: number) => v * ly;
  // --- barrel: [z, top, bottom, half-width, widest-fraction, squareness]. Dairy: angular wedge, deep barrel, tuck-up at the flank;
  // beef: straighter underline, wider and blockier through the shoulder and loin.
  const D = dairy;
  const rows: Array<[number, number, number, number, number, number]> = D ? [
    [0.95, 1.16, 0.76, 0.17, 0.5, 2.1], [0.80, 1.38, 0.64, 0.25, 0.42, 2.2], [0.52, 1.46, 0.585, 0.30, 0.42, 2.3], [0.22, 1.42, 0.54, 0.345, 0.42, 2.4],
    [-0.10, 1.40, 0.535, 0.37, 0.42, 2.4], [-0.38, 1.435, 0.62, 0.35, 0.44, 2.4], [-0.60, 1.44, 0.80, 0.32, 0.5, 2.3], [-0.82, 1.41, 0.88, 0.27, 0.5, 2.2],
    [-0.98, 1.36, 0.93, 0.18, 0.5, 2.0],
  ] : [
    [0.96, 1.18, 0.74, 0.20, 0.5, 2.2], [0.80, 1.43, 0.64, 0.29, 0.42, 2.3], [0.52, 1.47, 0.60, 0.345, 0.42, 2.4], [0.22, 1.41, 0.56, 0.385, 0.42, 2.5],
    [-0.10, 1.39, 0.56, 0.40, 0.42, 2.5], [-0.38, 1.42, 0.62, 0.385, 0.45, 2.5], [-0.60, 1.44, 0.74, 0.355, 0.5, 2.4], [-0.82, 1.42, 0.82, 0.30, 0.5, 2.3],
    [-0.98, 1.37, 0.88, 0.2, 0.5, 2.0],
  ];
  const body: Ring[] = rows.map(([z, top, bot, hw, fr, pw]) => bring(z, Y(top), Y(bot), hw * wd, fr, pw));
  out.push(tube(body, { seg, sub, capStart: true, capEnd: true }));
  const bump = (c: V3, r: V3, col: V3 = [1, 1, 1], region: number = REGION.BODY, rings = 3) => lod.detail < 1 && out.push(blob([c[0], Y(c[1]), c[2]], r, { seg: Math.max(6, seg - 6), rings, col, coat: 1, region, skin: sk(R), flat: true }));
  // brisket, and the shoulder muscle either side of the withers
  bump([0, 0.74, 0.74], [0.2 * wd, 0.2, 0.22]);
  if (dairy) for (const sx of [-1, 1]) {
    bump([sx * 0.22, 1.37, -0.40], [0.08, 0.025, 0.12]);      // hook bones (a soft rise, not a knob)
  } else for (const sx of [-1, 1]) {
    bump([sx * 0.25 * wd, 1.12, 0.58], [0.07, 0.2, 0.22]);      // shoulder muscle
  }
  if (!dairy) {
    bump([0, 1.49, 0.66], [0.14, 0.075, 0.34], [1, 1, 1], REGION.BODY, 5);   // the hump over the withers
    bump([0, 1.38, 0.97], [0.09, 0.055, 0.28], [1, 1, 1], REGION.BODY, 5);                        // the crest along the top of the neck
  }
  // --- neck: base buried in the shoulders; dairy slim and clean, beef short, thick and crested; a dewlap hangs under the throat
  const nk = f.neckThick;
  const N = (y: number, z: number, w: number, h: number, dn: number, a: number, b = a, wt = 0): Ring => ({ p: [0, Y(y), z], w: w * nk, h, dn, pw: 2.2, skin: sk(a, b, wt), coat: 1, col: [1, 1, 1] });
  const neck: Ring[] = [
    N(1.12, 0.60, 0.22, 0.31 + (dairy ? 0 : 0.08), 0.34, R), N(1.19, 0.86, 0.185, 0.26 + (dairy ? 0 : 0.09), 0.27, R, BONE.NECK, 0.5), N(1.26, 1.08, 0.15, 0.2 + (dairy ? 0 : 0.06), 0.2, BONE.NECK),
    N(1.31, 1.26, 0.125 + (dairy ? 0 : 0.01), 0.15 + (dairy ? 0 : 0.025), 0.15, BONE.NECK, BONE.HEAD, 0.5),
  ];
  out.push(tube(neck, { seg, sub }));
  // dewlap: a loose fold of skin from the throat to the brisket (a blade, bigger on the steer)
  const dw = dairy ? 0.7 : 1;
  if (lod.detail < 2) out.push(blob([0, Y(0.97), 0.95], [0.035 * dw, 0.1 * dw + 0.02, 0.34], { seg: Math.max(6, seg - 6), rings: 3, col: [1, 1, 1], coat: 1, region: REGION.BODY, skin: sk(R, BONE.NECK, 0.5), tilt: 0.62, flat: true }));
  // --- head: a broad forehead, a deep jaw, a wide flat muzzle, built along its own axis from the poll, then pitched down
  const hs = f.brow, H = (z: number, cy: number, w: number, h: number, dn: number, pw = 2.5): Ring => ({ p: [0, cy, z], w: w * hs, h, dn, pw, skin: sk(BONE.HEAD), coat: 1, region: REGION.HEAD, col: [1, 1, 1] });
  const headRows: Ring[] = [
    H(-0.07, 0.0, 0.092, 0.085, 0.09), H(0.02, 0.0, 0.128, 0.098, 0.12), H(0.10, -0.012, 0.13, 0.09, 0.155), H(0.19, -0.03, 0.123, 0.084, 0.15),
    H(0.265, -0.05, 0.124, 0.08, 0.135, 2.7), H(0.325, -0.066, 0.13, 0.08, 0.118, 3.3), H(0.358, -0.072, 0.134, 0.078, 0.11, 3.8),
  ];
  const head = tube(lod.detail > 1 ? headRows.filter((_, i) => i % 2 === 0 || i === 6) : headRows, { seg, sub: Math.min(sub, 2), capStart: true, capEnd: true, up: [0, 1, 0] });
  const hbl = (c: V3, r: V3, o: { col?: V3; region?: number; tilt?: number; seg?: number } = {}) =>
    lod.detail < 2 && append(head, blob(c, r, { seg: o.seg ?? Math.max(6, seg - 6), rings: 3, col: o.col ?? [1, 1, 1], coat: 1, region: o.region ?? REGION.HEAD, skin: sk(BONE.HEAD), flat: true, tilt: o.tilt ?? 0 }));
  hbl([0, -0.07, 0.372], [0.134 * hs, 0.082, 0.04], { region: REGION.NOSE });                      // the muzzle pad: wide, flat-fronted (pale / pink / dark by breed)
  hbl([0, -0.135, 0.345], [0.09 * hs, 0.03, 0.05]);                                                // the lower lip and chin
  for (const sx of [-1, 1]) {
    hbl([sx * 0.112 * hs, 0.052, 0.07], [0.02, 0.01, 0.042], { tilt: 0.0 });                         // a soft brow over each eye (level, not a frown)
  }
  hbl([0, 0.086, -0.03], [0.09, 0.045, 0.065]);                                                      // the poll
  append(head, nostrils([0, -0.062, 0.4], 0.062 * hs, 0.03, sk(BONE.HEAD), lod, 0.05));          // big wet nostrils
  for (const sx of [-1, 1]) {
    append(head, eye(sx, [0.128 * hs, 0.03, 0.075], 0.0185, sk(BONE.HEAD), lod));
    // ear: a broad leaf held out to the side (face to the front, tip a little down), hairy outside and dark pink inside with a tuft at the root
    const bone = sx > 0 ? BONE.EAR_L : BONE.EAR_R;
    const E = (x: number, y: number, z: number, w: number, h: number, a = 1): Ring => ({ p: [sx * x, y, z], w: h, h: w, skin: sk(BONE.HEAD, bone, a > 0.99 ? 1 : a), coat: 1, region: REGION.EAR, col: [1, 1, 1] });
    const EI = (x: number, y: number, z: number, w: number, h: number, a = 1): Ring => ({ p: [sx * x, y, z], w: h, h: w, skin: sk(BONE.HEAD, bone, a > 0.99 ? 1 : a), coat: 0, region: REGION.FLESH, col: [0.42, 0.24, 0.21] });
    if (lod.detail < 2) {
      append(head, tube([E(0.09, 0.082, -0.032, 0.012, 0.03, 0.4), E(0.15, 0.078, -0.04, 0.01, 0.052), E(0.215, 0.066, -0.05, 0.009, 0.06), E(0.275, 0.04, -0.062, 0.008, 0.05), E(0.318, 0.012, -0.07, 0.006, 0.028), E(0.334, -0.004, -0.074, 0.003, 0.008)],
        { seg: Math.max(6, seg - 5), sub: 1, up: [0, 0, 1], flat: true }));
      if (lod.detail < 1) append(head, tube([EI(0.12, 0.08, -0.024, 0.003, 0.024, 0.4), EI(0.17, 0.076, -0.03, 0.003, 0.042), EI(0.22, 0.064, -0.04, 0.003, 0.05), EI(0.272, 0.04, -0.052, 0.003, 0.04), EI(0.305, 0.016, -0.06, 0.002, 0.02)],
        { seg: 6, sub: 1, up: [0, 0, 1], flat: true }));
    }
    if (!dairy) {   // horn buds (a beef calf's): short cream stubs curving forward and up
      append(head, tube([
        { p: [sx * 0.07, 0.098, -0.045], w: 0.026, h: 0.026, skin: sk(BONE.HEAD), col: [0.86, 0.82, 0.7], region: REGION.HORN },
        { p: [sx * 0.085, 0.13, -0.045], w: 0.019, h: 0.019, skin: sk(BONE.HEAD), col: [0.8, 0.76, 0.64], region: REGION.HORN },
        { p: [sx * 0.092, 0.15, -0.035], w: 0.006, h: 0.006, skin: sk(BONE.HEAD), col: [0.7, 0.66, 0.55], region: REGION.HORN },
      ], { seg: 6, sub: 1, up: [0, 0, 1], flat: true }));
    }
  }
  out.push(place(head, -0.74, [0, Y(POLL.y), POLL.z]));
  // --- tail: from the tailhead down behind the thighs to a switch at the hocks
  const T = (y: number, z: number, w: number, b: number, b2 = b, wt = 0): Ring => ({ p: [0, Y(y), z], w, h: w, skin: sk(b, b2, wt), coat: 1, region: REGION.TAIL, col: [0.95, 0.95, 0.95], pw: 2 });
  out.push(tube([T(1.30, -0.90, 0.06, BONE.TAIL), T(1.29, -0.97, 0.045, BONE.TAIL), T(1.24, -1.04, 0.034, BONE.TAIL), T(1.05, -1.09, 0.026, BONE.TAIL), T(0.80, -1.09, 0.022, BONE.TAIL, BONE.TAIL2, 0.5), T(0.60, -1.08, 0.022, BONE.TAIL2), T(0.46, -1.08, 0.05, BONE.TAIL2), T(0.34, -1.08, 0.048, BONE.TAIL2), T(0.26, -1.08, 0.02, BONE.TAIL2)],
    { seg: Math.max(6, seg - 6), sub: Math.min(sub, 2), up: [0, 0, 1], capEnd: true }));
  // --- udder (four quarters, a rear lobe) and teats
  if (dairy) {
    const ud = (x: number, y: number, z: number, r: V3) => out.push(blob([x, Y(y), z], r, { seg: Math.max(6, seg - 4), rings: 4, col: [0.92, 0.72, 0.68], region: REGION.UDDER, coat: 0, skin: sk(R), flat: true }));
    ud(0, 0.74, -0.58, [0.17, 0.14, 0.2]);                            // the body of the udder, between the hind legs
    if (lod.detail < 2) ud(0, 0.67, -0.72, [0.155, 0.13, 0.12]);                          // the rear lobe
    if (lod.detail < 2) ud(0, 0.72, -0.44, [0.12, 0.1, 0.09]);                            // the fore udder attachment
    if (lod.detail < 2) for (const [x, z] of [[0.065, -0.49], [-0.065, -0.49], [0.07, -0.69], [-0.07, -0.69]]) {
      out.push(tube([{ p: [x, Y(0.6), z], w: 0.026, h: 0.026, skin: sk(R), col: [0.88, 0.62, 0.6], region: REGION.FLESH }, { p: [x, Y(0.5), z], w: 0.02, h: 0.02, skin: sk(R), col: [0.8, 0.52, 0.5], region: REGION.FLESH }],
        { seg: 6, up: [0, 0, 1], capEnd: true, flat: true }));
    }
  } else if (lod.detail < 2) {   // a steer's sheath, and its scrotum, small
    out.push(blob([0, Y(0.6), -0.4], [0.05, 0.07, 0.11], { seg: Math.max(6, seg - 4), rings: 3, col: [1, 1, 1], coat: 1, region: REGION.BODY, skin: sk(R), flat: true }));
  }
  // --- legs. Rows: [y, z, half-width, half-depth, skin]
  const fore = (b: number): LimbRow[] => [
    [Y(1.08), FORE_Z, 0.085 * wd, 0.14, sk(b)], [Y(0.95), FORE_Z - 0.01, 0.115 * wd, 0.155, sk(b)], [Y(0.78), FORE_Z - 0.01, 0.095 * wd, 0.12, sk(b, b + 1, 0.5)],
    [Y(0.62), FORE_Z, 0.07, 0.085, sk(b + 1)], [Y(0.50), FORE_Z + 0.015, 0.062, 0.07, sk(b + 1, b + 2, 0.5)], [Y(0.32), FORE_Z + 0.02, 0.038, 0.044, sk(b + 2)],
    [Y(0.15), FORE_Z + 0.03, 0.05, 0.055, sk(b + 2, b + 3, 0.5)], [Y(0.095), FORE_Z + 0.055, 0.038, 0.042, sk(b + 3)], [Y(0.06), FORE_Z + 0.075, 0.044, 0.048, sk(b + 3)],
  ];
  const m = f.muscle, gm = dairy ? 1 : 1.18;    // beef carries a heavier gaskin
  const hind = (b: number): LimbRow[] => [
    [Y(1.12), -0.66, 0.095 * m, 0.15 * m, sk(b)], [Y(1.0), -0.62, 0.15 * m, 0.24 * m, sk(b)], [Y(0.84), -0.66, 0.115 * gm, 0.16 * gm, sk(b, b + 1, 0.5)],
    [Y(0.68), -0.78, 0.08 * gm, 0.12 * gm, sk(b + 1)], [Y(0.52), -0.89, 0.058, 0.095, sk(b + 1, b + 2, 0.5)], [Y(0.33), -0.87, 0.038, 0.048, sk(b + 2)],
    [Y(0.15), -0.85, 0.05, 0.056, sk(b + 2, b + 3, 0.5)], [Y(0.095), -0.83, 0.038, 0.042, sk(b + 3)], [Y(0.06), -0.81, 0.044, 0.048, sk(b + 3)],
  ];
  const hoofCol: V3 = [0.13, 0.11, 0.10];
  for (const [sx, bF, bH] of [[1, FL, HL], [-1, FR, HR]] as const) {
    out.push(limb(sx, 0.17 * wd, fore(bF), lod, { coatFrom: 5, cap: lod.detail > 0, sub: 1 }));
    out.push(limb(sx, 0.2 * wd, hind(bH), lod, { coatFrom: 5, cap: lod.detail > 0, sub: 1 }));
    if (lod.detail < 1) {
      out.push(clovenHoof(sx * 0.17 * wd, FORE_Z + 0.055, 0.055, { seg, skin: sk(bF + 3), col: hoofCol }));
      out.push(clovenHoof(sx * 0.2 * wd, HIND_Z + 0.015, 0.055, { seg, skin: sk(bH + 3), col: hoofCol }));
    }
  }
  return toGeometry(out);
}

function skeleton(f: Frame): Array<BoneAnim | undefined> {
  const Y = (v: number) => v * f.s, b: Array<BoneAnim | undefined> = [];
  b[BONE.ROOT] = { pivot: [0, Y(0.9), 0], parent: -1 };
  b[BONE.NECK] = { pivot: [0, Y(NECKP.y), NECKP.z], parent: 0, graze: f.graze[0], idle: 0.02, idleFreq: 0.5, idlePh: 0.3, swing: 0.025, off: 1.2 };
  b[BONE.HEAD] = { pivot: [0, Y(POLL.y), POLL.z], parent: BONE.NECK, graze: f.graze[1], idle: 0.04, idleFreq: 0.8, idlePh: 1.0, bob: 0.1, swing: -0.02, off: 1.2 };
  b[BONE.TAIL] = { pivot: [0, Y(1.36), -0.98], parent: 0, axis: 1, idle: 0.1, idleFreq: 1.1, idlePh: 0.5, swing: 0.05 };
  b[BONE.TAIL2] = { pivot: [0, Y(0.85), -1.09], parent: BONE.TAIL, axis: 1, idle: 0.16, idleFreq: 1.7, idlePh: 0.9 };
  b[BONE.EAR_L] = { pivot: [0.1, Y(POLL.y) + 0.08, POLL.z - 0.03], parent: BONE.HEAD, axis: 1, idle: 0.3, idleFreq: 0.37, idlePh: 2.3, pulse: true };
  b[BONE.EAR_R] = { pivot: [-0.1, Y(POLL.y) + 0.08, POLL.z - 0.03], parent: BONE.HEAD, axis: 1, idle: 0.3, idleFreq: 0.29, idlePh: 5.1, pulse: true };
  const wd = f.wide;
  const fp = (x: number): [V3, V3, V3, V3] => [[x, Y(1.05), FORE_Z], [x, Y(0.78), FORE_Z - 0.01], [x, Y(0.50), FORE_Z + 0.015], [x, Y(0.15), FORE_Z + 0.03]];
  const hp = (x: number): [V3, V3, V3, V3] => [[x, Y(1.22), -0.66], [x, Y(0.84), -0.66], [x, Y(0.52), -0.89], [x, Y(0.15), -0.85]];
  // a walking cow moves its legs in near-diagonal pairs (hind left with fore right, a beat apart)
  for (const [sx, bf, bh, of, oh] of [[1, BONE.FL, BONE.HL, CATTLE_OFF.FL, CATTLE_OFF.HL], [-1, BONE.FR, BONE.HR, CATTLE_OFF.FR, CATTLE_OFF.HR]] as const) {
    legBones(b, { base: bf, pivots: fp(0.17 * wd), swing: 0.3, flex: [0, 0, -0.5, 0.25], foot: -0.1, off: of, sx });
    legBones(b, { base: bh, pivots: hp(0.2 * wd), swing: 0.28, flex: [0, -0.16, 0.3, -0.14], foot: -0.08, off: oh, sx });
  }
  return b;
}
/** Near-diagonal pairs: hind left + fore right, then hind right + fore left, the fore a little behind its diagonal hind. */
const CATTLE_OFF = { HL: 0, FR: 0.3 * Math.PI, HR: Math.PI, FL: 1.3 * Math.PI } as const;

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
  id, build: lod => buildCattle(f, lod), withers: 1.42 * f.s, length: 2.0, stride: 1.2,
  graze: { neck: f.graze[0], head: f.graze[1] },
  spec: { bones: skeleton(f), breeds, root: { bob: 0.01, pitch: 0.006, hop: false, cy: 0.9, cz: 0 }, grazeFreq: 7, key: id },
});
export const COW_DAIRY = (): AnimalModel => make('cow', DAIRY, HOLSTEIN);
export const COW_BEEF = (): AnimalModel => make('steer', BEEF, BEEF_BREEDS);
