/**
 * Rabbit (a meat rabbit: arched back, big haunches, long ears, scut), hen and rooster (feathered body with wings, neck, head with beak,
 * comb and wattles, scaly yellow legs with four toes, tail feathers). Metres, forward +z, left +x.
 */
import { BONE, REGION, append, blob, newMesh, skin, toGeometry, tube, type Lod, type Mesh, type Ring, type V3 } from './animalKit';
import type { BoneAnim, Breed } from './animalMaterial';
import { HOP_OFF, WALK_OFF, bodyRings, eye, headRings, legBones, limb, nostrils, place, strand, type AnimalModel, type LimbRow } from './animalParts';

const sk = skin;
const c3 = (a: number, b: number, c: number): V3 => [a, b, c];

// ---------------------------------------------------------------- rabbit
const RAB_FORE = (b: number): LimbRow[] => [
  [0.15, 0.13, 0.03, 0.045, sk(b)], [0.10, 0.125, 0.024, 0.03, sk(b, b + 1, 0.5)], [0.06, 0.13, 0.016, 0.02, sk(b + 1, b + 2, 0.5)], [0.03, 0.135, 0.014, 0.016, sk(b + 2)],
  [0.012, 0.145, 0.016, 0.026, sk(b + 2, b + 3, 0.5)], [0.006, 0.16, 0.014, 0.03, sk(b + 3)], [0.004, 0.17, 0.014, 0.03, sk(b + 3)],
];
const RAB_HIND = (b: number): LimbRow[] => [
  [0.16, -0.12, 0.05, 0.075, sk(b)], [0.125, -0.07, 0.04, 0.055, sk(b, b + 1, 0.5)], [0.09, -0.125, 0.027, 0.04, sk(b + 1)],
  [0.05, -0.19, 0.018, 0.03, sk(b + 1, b + 2, 0.5)], [0.025, -0.15, 0.015, 0.03, sk(b + 2)], [0.012, -0.10, 0.015, 0.025, sk(b + 2, b + 3, 0.5)], [0.008, -0.075, 0.015, 0.025, sk(b + 3)], [0.005, -0.06, 0.015, 0.03, sk(b + 3)],
];
function buildRabbit(lod: Lod) {
  const out: Mesh[] = [], { seg, sub } = lod;
  out.push(tube(bodyRings([[0.21, 0.17, 0.07, 0.04, 2.1], [0.13, 0.205, 0.055, 0.07, 2.2], [0.0, 0.235, 0.06, 0.085, 2.3], [-0.13, 0.265, 0.07, 0.093, 2.3], [-0.23, 0.235, 0.09, 0.08, 2.2], [-0.29, 0.17, 0.11, 0.045, 2.0]]), { seg, sub, capStart: true, capEnd: true }));
  out.push(tube([
    { p: [0, 0.16, 0.14], w: 0.055, h: 0.06, dn: 0.07, skin: sk(BONE.ROOT), coat: 1, col: [1, 1, 1] },
    { p: [0, 0.19, 0.21], w: 0.045, h: 0.05, dn: 0.055, skin: sk(BONE.ROOT, BONE.NECK, 0.5), coat: 1, col: [1, 1, 1] },
    { p: [0, 0.195, 0.26], w: 0.04, h: 0.045, dn: 0.05, skin: sk(BONE.NECK, BONE.HEAD, 0.5), coat: 1, col: [1, 1, 1] },
  ], { seg, sub }));
  const head = tube(headRings([[-0.02, 0, 0.04, 0.047, 0.05], [0.035, 0, 0.049, 0.054, 0.054], [0.075, -0.008, 0.042, 0.047, 0.042], [0.105, -0.018, 0.031, 0.035, 0.03], [0.122, -0.025, 0.024, 0.027, 0.022]], BONE.HEAD), { seg, sub, capStart: true, capEnd: true });
  append(head, blob([0, -0.03, 0.125], [0.02, 0.015, 0.01], { seg: Math.max(6, seg - 4), rings: 3, col: [1, 1, 1], coat: 1, region: REGION.NOSE, skin: sk(BONE.HEAD), flat: true }));
  append(head, nostrils([0, -0.029, 0.133], 0.006, 0.0035, sk(BONE.HEAD), lod));
  append(head, eye(-1, [0.04, 0.022, 0.05], 0.0095, sk(BONE.HEAD), lod)); append(head, eye(1, [0.04, 0.022, 0.05], 0.0095, sk(BONE.HEAD), lod));
  for (const sx of [-1, 1]) {
    const b = sx > 0 ? BONE.EAR_L : BONE.EAR_R;
    append(head, tube([
      { p: [sx * 0.02, 0.035, -0.005], w: 0.007, h: 0.014, skin: sk(BONE.HEAD, b, 0.3), coat: 1, region: REGION.EAR, col: [1, 1, 1] },
      { p: [sx * 0.035, 0.09, -0.015], w: 0.0055, h: 0.021, skin: sk(b), coat: 1, region: REGION.EAR, col: [1, 1, 1] },
      { p: [sx * 0.05, 0.15, -0.03], w: 0.005, h: 0.02, skin: sk(b), coat: 1, region: REGION.EAR, col: [0.9, 0.9, 0.9] },
      { p: [sx * 0.058, 0.2, -0.045], w: 0.002, h: 0.006, skin: sk(b), coat: 1, region: REGION.EAR, col: [0.85, 0.85, 0.85] },
    ], { seg: 6, sub: 1, up: [0, 0, 1], flat: true }));
  }
  out.push(place(head, -0.12, [0, 0.19, 0.26]));
  out.push(blob([0, 0.17, -0.3], [0.04, 0.04, 0.04], { seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.BODY, skin: sk(BONE.TAIL), flat: true }));
  for (const [sx, bF, bH] of [[1, BONE.FL, BONE.HL], [-1, BONE.FR, BONE.HR]] as const) {
    out.push(limb(sx, 0.05, RAB_FORE(bF), lod, { coatFrom: 3 }));
    out.push(limb(sx, 0.075, RAB_HIND(bH), lod, { coatFrom: 4 }));
    out.push(blob([sx * 0.07, 0.15, -0.13], [0.052, 0.085, 0.095], { seg, rings: 5, col: [1, 1, 1], coat: 1, region: REGION.BODY, skin: sk(bH), flat: true }));
  }
  const g = toGeometry(out);
  g.scale(1, 1, RZ);
  return g;
}
const RZ = 0.82;
function rabbitBones(): Array<BoneAnim | undefined> {
  const b: Array<BoneAnim | undefined> = [];
  b[BONE.ROOT] = { pivot: [0, 0.12, 0], parent: -1 };
  b[BONE.NECK] = { pivot: [0, 0.17, 0.15], parent: 0, graze: -0.5, idle: 0.03, idleFreq: 0.6, idlePh: 0.3 };
  b[BONE.HEAD] = { pivot: [0, 0.19, 0.26], parent: BONE.NECK, graze: -0.5, idle: 0.07, idleFreq: 1.1, idlePh: 1.0, bob: 0.25 };
  b[BONE.TAIL] = { pivot: [0, 0.17, -0.28], parent: 0, axis: 1, idle: 0.1, idleFreq: 1.5, idlePh: 0.5 };
  b[BONE.EAR_L] = { pivot: [0.02, 0.22, 0.26 - 0.01], parent: BONE.HEAD, axis: 1, idle: 0.25, idleFreq: 0.5, idlePh: 2.3, pulse: true };
  b[BONE.EAR_R] = { pivot: [-0.02, 0.22, 0.26 - 0.01], parent: BONE.HEAD, axis: 1, idle: 0.25, idleFreq: 0.43, idlePh: 5.1, pulse: true };
  for (const [sx, bf, bh, of, oh] of [[1, BONE.FL, BONE.HL, HOP_OFF.FL, HOP_OFF.HL], [-1, BONE.FR, BONE.HR, HOP_OFF.FR, HOP_OFF.HR]] as const) {
    legBones(b, { base: bf, pivots: [[0.05, 0.15, 0.13], [0.05, 0.10, 0.125], [0.05, 0.06, 0.13], [0.05, 0.012, 0.145]], swing: 0.6, flex: [0, 0, -0.6, 0.3], foot: -0.2, off: of, sx });
    legBones(b, { base: bh, pivots: [[0.075, 0.20, -0.12], [0.075, 0.13, -0.05], [0.075, 0.05, -0.19], [0.075, 0.012, -0.10]], swing: 0.7, flex: [0, -0.5, 0.8, -0.3], foot: -0.2, off: oh, sx });
  }
  for (const x of b) if (x) x.pivot = [x.pivot[0], x.pivot[1], x.pivot[2] * RZ];
  return b;
}
const rb = (name: string, o: Partial<Breed> & { base: V3 }): Breed => ({ name, style: 0, fur: 0.5, furFreq: 90, ...o });
export const RABBIT_MODEL = (): AnimalModel => ({
  id: 'rabbit', build: buildRabbit, withers: 0.26, length: 0.42, stride: 0.35, graze: { neck: -0.5, head: -0.5 },
  spec: {
    bones: rabbitBones(), root: { bob: 0.05, pitch: 0.25, hop: true, cy: 0.15, cz: 0 }, grazeFreq: 6, key: 'rabbit',
    breeds: [
      rb('New Zealand White', { base: c3(0.93, 0.92, 0.9), nose: c3(0.85, 0.6, 0.6) }),
      rb('Californian', { base: c3(0.92, 0.91, 0.89), face: c3(0.2, 0.15, 0.12), faceMix: 0.9, leg: c3(0.2, 0.15, 0.12), legMix: 0.95, nose: c3(0.15, 0.1, 0.09) }),
      rb('Agouti', { base: c3(0.42, 0.3, 0.2), style: 6, patch: c3(0.2, 0.14, 0.1), cover: 0.45, scale: 10, belly: c3(0.85, 0.8, 0.72), bellyMix: 0.8, bellyY: 0.1, nose: c3(0.3, 0.2, 0.18), size: 0.95 }),
      rb('Black', { base: c3(0.07, 0.065, 0.065), face: c3(0.07, 0.06, 0.06), faceMix: 0.2, nose: c3(0.1, 0.07, 0.07), size: 0.95 }),
    ],
  },
});

// ---------------------------------------------------------------- birds
const YEL: V3 = [0.86, 0.66, 0.16], RED: V3 = [0.72, 0.09, 0.08], BEAK: V3 = [0.9, 0.7, 0.25];
function buildBird(rooster: boolean, lod: Lod) {
  const out: Mesh[] = [], { seg, sub } = lod, k = rooster ? 1 : 1;
  const hy = rooster ? 0.06 : 0, ny = rooster ? 0.05 : 0;   // a rooster stands taller in the neck and breast
  // body: breast forward, rump up and back
  out.push(tube([
    { p: [0, 0.235 + hy * 0.4, 0.17], w: 0.052, h: 0.062, dn: 0.07, pw: 2.1, skin: sk(BONE.ROOT), coat: 1, col: [1, 1, 1] },
    { p: [0, 0.25 + hy * 0.5, 0.10], w: 0.082, h: 0.095, dn: 0.1, pw: 2.2, skin: sk(BONE.ROOT), coat: 1, col: [1, 1, 1] },
    { p: [0, 0.28, 0.0], w: 0.092, h: 0.1, dn: 0.1, pw: 2.2, skin: sk(BONE.ROOT), coat: 1, col: [1, 1, 1] },
    { p: [0, 0.295, -0.1], w: 0.08, h: 0.085, dn: 0.08, pw: 2.2, skin: sk(BONE.ROOT), coat: 1, col: [1, 1, 1] },
    { p: [0, 0.32, -0.17], w: 0.052, h: 0.06, dn: 0.05, pw: 2.1, skin: sk(BONE.ROOT), coat: 1, col: [1, 1, 1] },
  ], { seg, sub, capStart: true, capEnd: true }));
  // wings folded on the sides: three layers of overlapping feathers (coverts, secondaries, primaries), each laid a little further out
  if (lod.detail < 1) {
    const rowsW: Array<{ n: number; y: number; z0: number; dz: number; len: number; w: number; out: number; shade: number }> = [
      { n: 5, y: 0.262, z0: 0.05, dz: -0.03, len: 0.15, w: 0.0105, out: 0.0, shade: 0.8 },       // primaries, longest and lowest
      { n: 5, y: 0.292, z0: 0.07, dz: -0.028, len: 0.115, w: 0.0115, out: 0.003, shade: 0.9 },   // secondaries
      { n: 6, y: 0.322, z0: 0.085, dz: -0.022, len: 0.07, w: 0.0105, out: 0.006, shade: 1.0 },   // coverts, short and on top
    ];
    // the body's half-width along z (breast to rump), so each feather lies on the surface
    const bw = (z: number): number => (z > 0.1 ? 0.082 - (z - 0.1) * 0.43 : z > 0 ? 0.092 - (0.1 - z) * 0.1 : z > -0.1 ? 0.092 - (-z) * 0.12 : 0.08 - (-z - 0.1) * 0.4);
    for (const sx of [-1, 1]) for (const r of rowsW) for (let i = 0; i < r.n; i += lod.sub > 2 ? 1 : 2) {
      const z = r.z0 + r.dz * i, y = r.y - (r.len > 0.1 ? 0 : 0.004 * (i % 2));
      const P = (t: number): V3 => { const zz = z - r.len * t; return [sx * (bw(zz) + 0.004 + r.out), y - 0.012 * t - (r.len > 0.1 ? 0.012 * t : 0), zz]; };
      const c = r.shade * (0.96 + 0.04 * ((i * 7) % 3 === 0 ? 1 : 0));
      const rs: Ring[] = [[0, 0.5], [0.45, 1], [0.85, 0.7], [1, 0.25]].map(([t, wk]) => ({ p: P(t), w: r.w * wk, h: 0.0028, skin: sk(BONE.ROOT), coat: 1, region: REGION.BODY, col: [c, c, c] as V3 }));
      out.push(tube(rs, { seg: 4, sub: 1, up: [1, 0, 0], flat: true, capEnd: true }));
    }
  } else for (const sx of [-1, 1]) out.push(blob([sx * 0.082, 0.285, -0.03], [0.024, 0.07, 0.115], { seg: Math.max(6, seg - 4), rings: 5, col: [0.95, 0.95, 0.95], coat: 1, region: REGION.BODY, skin: sk(BONE.ROOT), tilt: -0.12, yaw: sx * 0.03, flat: true }));
  // neck
  out.push(tube([
    { p: [0, 0.3, 0.13], w: 0.045, h: 0.05, dn: 0.05, skin: sk(BONE.ROOT), coat: 1, col: [1, 1, 1] },
    { p: [0, 0.34 + ny * 0.5, 0.15], w: rooster ? 0.044 : 0.04, h: rooster ? 0.05 : 0.046, skin: sk(BONE.ROOT, BONE.NECK, 0.5), coat: 1, col: [1, 1, 1] },
    { p: [0, 0.385 + ny, 0.17], w: rooster ? 0.036 : 0.032, h: rooster ? 0.04 : 0.036, skin: sk(BONE.NECK), coat: 1, col: [1, 1, 1] },
    { p: [0, 0.42 + ny, 0.185], w: 0.022, h: 0.026, skin: sk(BONE.NECK, BONE.HEAD, 0.5), coat: 1, col: [1, 1, 1] },
  ], { seg: Math.max(6, seg - 2), sub }));
  // head (local frame at the top of the neck) with beak, comb, wattles, eyes
  const head = newMesh();
  append(head, blob([0, 0, 0.012], [0.019, 0.024, 0.033], { seg: Math.max(6, seg - 4), rings: 5, col: [1, 1, 1], coat: 1, region: REGION.HEAD, skin: sk(BONE.HEAD), tilt: 0.1 }));
  append(head, tube([
    { p: [0, -0.003, 0.038], w: 0.012, h: 0.009, dn: 0.006, skin: sk(BONE.HEAD), col: BEAK, region: REGION.BEAK },
    { p: [0, -0.007, 0.056], w: 0.007, h: 0.006, dn: 0.004, skin: sk(BONE.HEAD), col: [0.82, 0.62, 0.2], region: REGION.BEAK },
    { p: [0, -0.012, 0.068], w: 0.002, h: 0.002, skin: sk(BONE.HEAD), col: [0.7, 0.5, 0.15], region: REGION.BEAK },
  ], { seg: 6, sub: 1, up: [0, 1, 0], flat: true }));
  if (lod.detail < 2) {
    const ch = rooster ? 0.046 : 0.026;
    const pts: Array<[number, number]> = rooster ? [[-0.018, 0.002], [-0.01, 0.026], [-0.002, 0.012], [0.006, 0.034], [0.014, 0.014], [0.022, 0.03], [0.03, 0.008], [0.036, 0.002]] : [[-0.012, 0.002], [-0.004, 0.015], [0.004, 0.008], [0.012, 0.016], [0.02, 0.004]];
    append(head, tube(pts.map(([z, h]) => ({ p: [0, 0.022 + h * 0.3, z] as V3, w: rooster ? 0.006 : 0.004, h: Math.max(0.002, h * (ch / 0.03)), dn: 0.002, skin: sk(BONE.HEAD), col: RED, region: REGION.FLESH })), { seg: 6, sub: 1, up: [0, 1, 0], capStart: true, capEnd: true, flat: true }));
    for (const sx of [-1, 1]) {
      append(head, blob([sx * 0.006, -0.026, 0.042], [rooster ? 0.008 : 0.006, rooster ? 0.03 : 0.018, 0.008], { seg: 6, rings: 3, col: RED, region: REGION.FLESH, skin: sk(BONE.HEAD), flat: true }));
      append(head, blob([sx * 0.019, 0.004, 0.026], [0.0045, 0.0085, 0.0085], { seg: 6, rings: 3, col: [0.92, 0.55, 0.08], region: REGION.EYE, skin: sk(BONE.HEAD), flat: true }));
      append(head, blob([sx * 0.021, 0.004, 0.028], [0.0028, 0.005, 0.005], { seg: 5, rings: 2, col: [0.03, 0.02, 0.02], region: REGION.EYE, skin: sk(BONE.HEAD), flat: true }));
      append(head, blob([sx * 0.018, -0.012, 0.012], [0.004, 0.009, 0.007], { seg: 5, rings: 3, col: rooster ? [0.9, 0.9, 0.9] : [0.85, 0.82, 0.8], region: REGION.FLESH, skin: sk(BONE.HEAD), flat: true }));   // earlobe
    }
  }
  for (let i = 0; i < head.pos.length; i++) head.pos[i] *= rooster ? 1.22 : 1.3;
  out.push(place(head, 0, [0, 0.43 + ny, 0.19]));
  // tail feathers: a full fan of flat blades rising up and back (shorter ones tucked in front, longer behind); a rooster's are long arching sickles
  const blades = rooster ? 7 : 8;
  for (let i = 0; i < blades; i++) {
    const f = (i / (blades - 1)) * 2 - 1, sx = f * 0.03, mid = 1 - Math.abs(f);
    const len = rooster ? 0.2 + mid * mid * 0.36 : 0.1 + mid * 0.075;
    const up = 0.85, w = rooster ? 0.03 : 0.03;
    // a rooster's are sickles: each leaves the rump rising steeply, then bends over and falls in a long arc (the middle ones longest and most curled)
    const a0 = 1.3 - Math.abs(f) * 0.25, kap = 1.9 + mid * 0.7;
    const P = (t: number): V3 => rooster
      ? [sx * (1 + t * 1.6), 0.31 + len * (Math.cos(a0 - kap * t) - Math.cos(a0)) / kap, -0.17 - len * (Math.sin(a0) - Math.sin(a0 - kap * t)) / kap]
      : [sx * (1 + t * 2.4), 0.31 + up * len * t * 0.9 - Math.abs(f) * t * 0.03, -0.17 - len * t * 0.85];
    const ts = rooster ? [0, 0.34, 0.7, 1] : [0, 0.3, 0.65, 1];
    const wk = rooster ? [0.45, 1.1, 0.95, 0.12] : [0.5, 1, 0.8, 0.1];
    const rs: Ring[] = ts.map((t, j) => ({ p: P(t), h: 0.0035, w: Math.max(0.003, w * wk[j]), skin: sk(BONE.TAIL), coat: 1, region: REGION.TAIL, col: [0.95 - Math.abs(f) * 0.08, 0.95 - Math.abs(f) * 0.08, 0.95 - Math.abs(f) * 0.08] as V3 }));
    out.push(tube(rs, { seg: lod.detail ? 6 : 4, sub: Math.min(lod.sub, 2), up: [1, 0, 0], flat: true, capEnd: true }));
  }
  if (lod.detail < 1) {
    // hackle: a ruff of long narrow feathers lying back and down over the neck and shoulders (a rooster's are long and glossy)
    const nh = (rooster ? 10 : 8) / (lod.sub > 2 ? 1 : 2);
    for (let i = 0; i < nh; i++) {
      const a = (i / nh) * Math.PI * 2, rr = rooster ? 0.046 : 0.04, ln = rooster ? 0.075 : 0.042;
      out.push(blob([Math.sin(a) * rr, 0.35 + ny * 0.5 + Math.cos(a) * 0.012, 0.12 + Math.cos(a) * rr * 0.55 + 0.02], [rooster ? 0.0075 : 0.009, 0.0045, ln], { seg: 5, rings: 3, col: [rooster ? 1.05 : 0.95, rooster ? 1.05 : 0.95, rooster ? 1.05 : 0.95], coat: 1, region: REGION.BODY, skin: sk(BONE.NECK), tilt: -0.75 - (i % 2) * 0.12, yaw: Math.PI + Math.sin(a) * 0.5, flat: true }));
    }
  }
  // legs: feathered thigh, drumstick, yellow scaly shank, four toes
  for (const [sx, b] of [[1, BONE.HL], [-1, BONE.HR]] as const) {
    const x = sx * 0.05, sc = rooster ? 1.15 : 1;
    const R = (y: number, z: number, w: number, h: number, s: ReturnType<typeof sk>, feather: boolean): Ring => ({ p: [x, y * sc, z], w: w * sc, h: h * sc, skin: s, coat: feather ? 1 : 0, col: feather ? [1, 1, 1] : YEL, region: feather ? REGION.BODY : REGION.FLESH });
    out.push(tube([
      R(0.235, 0.01, 0.03, 0.042, sk(b), true), R(0.18, 0.045, 0.028, 0.037, sk(b, b + 1, 0.5), true), R(0.14, 0.02, 0.021, 0.027, sk(b + 1), true),
      R(0.1, -0.003, 0.0135, 0.016, sk(b + 1, b + 2, 0.5), false), R(0.055, 0.0, 0.0085, 0.0095, sk(b + 2), false), R(0.015, 0.006, 0.0095, 0.01, sk(b + 2, b + 3, 0.5), false),
    ], { seg: Math.max(6, seg - 4), sub, up: [0, 0, 1], flat: true }));
    if (lod.detail < 2) {
      for (const [ang, ln] of [[-0.45, 0.048], [0, 0.058], [0.45, 0.048], [Math.PI, 0.03]] as const) {
        const dz = Math.cos(ang), dx = Math.sin(ang);
        out.push(strand([[x, 0.014 * sc, 0.006, 0.0075], [x + dx * ln * 0.5 * sc, 0.008 * sc, 0.006 + dz * ln * 0.5 * sc, 0.0055], [x + dx * ln * sc, 0.003 * sc, 0.006 + dz * ln * sc, 0.003]], sk(b + 3), lod, { x, region: REGION.FLESH, col: YEL, coat: 0, up: [0, 1, 0] }));
      }
      if (rooster) out.push(strand([[x + sx * 0.008, 0.07 * sc, -0.01, 0.006], [x + sx * 0.014, 0.065 * sc, -0.028, 0.002]], sk(b + 2), lod, { region: REGION.HORN, col: [0.6, 0.5, 0.35], coat: 0, up: [0, 1, 0] }));
    }
  }
  const g = toGeometry(out);
  g.scale(rooster ? 1.22 * k : 1, rooster ? 1.22 * k : 1, rooster ? 1.22 * k : 1);
  return g;
}
function birdBones(rooster: boolean): Array<BoneAnim | undefined> {
  const s = rooster ? 1.22 : 1, ny = rooster ? 0.05 : 0, P = (x: number, y: number, z: number): V3 => [x * s, y * s, z * s];
  const b: Array<BoneAnim | undefined> = [];
  b[BONE.ROOT] = { pivot: P(0, 0.27, 0), parent: -1 };
  b[BONE.NECK] = { pivot: P(0, 0.31, 0.13), parent: 0, swing: 0.16, off: 0.7, graze: -0.9, idle: 0.04, idleFreq: 0.7, idlePh: 0.3, bob: 0.2 };
  b[BONE.HEAD] = { pivot: P(0, 0.42 + ny, 0.185), parent: BONE.NECK, swing: -0.1, off: 0.7, graze: -0.55, idle: 0.12, idleFreq: 1.4, idlePh: 1.0, bob: 0.5, pulse: true };
  b[BONE.TAIL] = { pivot: P(0, 0.31, -0.17), parent: 0, idle: 0.05, idleFreq: 1.1, idlePh: 0.5, swing: 0.05 };
  for (const [sx, bh, oh] of [[1, BONE.HL, WALK_OFF.HL], [-1, BONE.HR, WALK_OFF.HR]] as const) {
    legBones(b, { base: bh, pivots: [P(0.05, 0.235, 0.01), P(0.05, 0.18, 0.045), P(0.05, 0.1, -0.003), P(0.05, 0.015, 0.006)], swing: 0.55, flex: [0, -0.7, 1.0, -0.45], foot: -0.1, off: oh, sx });
  }
  return b;
}
const hb = (name: string, o: Partial<Breed> & { base: V3 }): Breed => ({ name, style: 0, fur: 0.5, furFreq: 80, feather: 1, nose: c3(0.5, 0.1, 0.1), ...o });
export const HEN_MODEL = (): AnimalModel => ({
  id: 'hen', build: lod => buildBird(false, lod), withers: 0.34, length: 0.5, stride: 0.34, graze: { neck: -0.9, head: -0.55 },
  spec: {
    bones: birdBones(false), root: { bob: 0.008, pitch: 0.05, hop: false, cy: 0.03, cz: 0.03, grazePitch: -0.5 }, grazeFreq: 11, key: 'hen',
    breeds: [
      hb('Rhode Island Red', { base: c3(0.5, 0.2, 0.09), style: 0, leg: c3(0.05, 0.05, 0.04), legMix: 0.8, belly: c3(0.55, 0.26, 0.12), bellyMix: 0.3, bellyY: 0.2 }),
      hb('Leghorn', { base: c3(0.95, 0.94, 0.9), leg: c3(0.95, 0.94, 0.9), legMix: 0 }),
      hb('Barred Rock', { base: c3(0.86, 0.86, 0.84), style: 2, patch: c3(0.18, 0.18, 0.2), cover: 0.6, scale: 52, feather: 1, leg: c3(0.3, 0.3, 0.3), legMix: 0.7 }),
      hb('Speckled Sussex', { base: c3(0.45, 0.2, 0.1), style: 4, patch: c3(0.93, 0.92, 0.88), cover: 0.4, scale: 45, leg: c3(0.2, 0.1, 0.06), legMix: 0.6, size: 0.97 }),
    ],
  },
});
export const ROOSTER_MODEL = (): AnimalModel => ({
  id: 'rooster', build: lod => buildBird(true, lod), withers: 0.44, length: 0.64, stride: 0.42, graze: { neck: -0.9, head: -0.55 },
  spec: {
    bones: birdBones(true), root: { bob: 0.01, pitch: 0.04, hop: false, cy: 0.04, cz: 0.04, grazePitch: -0.5 }, grazeFreq: 11, key: 'rooster',
    breeds: [
      hb('Rhode Island Red', { base: c3(0.55, 0.19, 0.07), style: 5, patch: c3(0.78, 0.32, 0.08), belt: [-0.03, 0.12], leg: c3(0.04, 0.12, 0.08), legMix: 0.95 }),
      hb('Leghorn', { base: c3(0.96, 0.95, 0.92), leg: c3(0.92, 0.9, 0.85), legMix: 0.9 }),
      hb('Barred Rock', { base: c3(0.84, 0.84, 0.82), style: 2, patch: c3(0.18, 0.18, 0.2), cover: 0.6, scale: 52, feather: 1, leg: c3(0.14, 0.14, 0.15), legMix: 0.9 }),
      hb('Game', { base: c3(0.86, 0.46, 0.08), style: 5, patch: c3(0.55, 0.12, 0.06), belt: [-0.04, 0.14], leg: c3(0.05, 0.28, 0.22), legMix: 0.95, size: 1.02 }),
    ],
  },
});
