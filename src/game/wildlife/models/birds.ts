/**
 * The wild birds: turkey (tom with a beard, a snood and spurs; hen), ruffed grouse, mallard (drake with a green head, white collar, chestnut breast;
 * mottled hen) and Canada goose. Metres, forward +z, left +x, ground y = 0, instance scale 1/6 (SCALE v2). A tom turkey stands about 1 m with his head
 * up and weighs 8 kg; a hen is 0.7 m; a grouse 0.4 m long; a mallard 0.55 m long; a goose 0.9 m long with a neck that makes it 0.9 m tall.
 * Anatomy: a lofted body with the breast forward and low, a slim S-curved neck, a small head with the species' bill, folded wings with the
 * primaries crossing over the tail, jointed legs with a knee hidden in the feathers, an ankle, scaled shanks and four toes (webbed for the water birds).
 * Plumage is painted in the shader (barring, speckle, accents for the head, breast and rump); a tom's beard and snood are REGION.ADORN.
 */
import { BONE, REGION, append, blob, newMesh, skin, toGeometry, tube, type Lod, type Mesh, type Ring, type V3 } from '../../livestock/animalKit';
import type { BoneAnim, Breed } from '../../livestock/animalMaterial';
import { WALK_OFF, eye, legBones, place, spike, type AnimalModel } from '../../livestock/animalParts';

const sk = skin;
const c3 = (a: number, b: number, c: number): V3 => [a, b, c];
const RED: V3 = [0.62, 0.06, 0.05], SKINBLUE: V3 = [0.42, 0.5, 0.62], PINK: V3 = [0.55, 0.38, 0.34], ORANGE: V3 = [0.9, 0.45, 0.08], YEL: V3 = [0.86, 0.64, 0.14];

interface Row { z: number; y: number; w: number; h: number; dn?: number }
const ringOf = (r: Row, b: ReturnType<typeof sk>, region: number = REGION.BODY, pw = 2.2): Ring => ({ p: [0, r.y, r.z], w: r.w, h: r.h, dn: r.dn ?? r.h, pw, skin: b, coat: 1, region, col: [1, 1, 1] });

/** A neck through (y, z, radius) points, skinned from the body up to the head. */
function neckTube(pts: Array<[number, number, number]>, lod: Lod, o: { region?: number; coat?: number; col?: (i: number) => V3 } = {}): Mesh {
  const n = pts.length;
  return tube(pts.map(([y, z, r], i) => ({ p: [0, y, z] as V3, w: r, h: r * 1.05, skin: i === 0 ? sk(BONE.ROOT) : i === n - 1 ? sk(BONE.NECK, BONE.HEAD, 0.5) : i === 1 ? sk(BONE.ROOT, BONE.NECK, 0.5) : sk(BONE.NECK), coat: o.coat ?? 1, region: o.region ?? REGION.BODY, col: o.col ? o.col(i) : [1, 1, 1] as V3 })), { seg: Math.max(6, lod.seg - 3), sub: lod.sub });
}

/** A bill: a tapered tube along +z in the head frame with a flat or a deep section, a hooked tip if `hook`. */
function bill(len: number, w: number, h: number, col: V3, lod: Lod, o: { at?: V3; hook?: number; tip?: V3; flat?: boolean } = {}): Mesh {
  const at = o.at ?? [0, 0, 0], hk = o.hook ?? 0;
  const rs: Ring[] = [0, 0.35, 0.75, 1].map((t, i) => ({
    p: [at[0], at[1] - hk * t * t * len * 0.35, at[2] + t * len] as V3,
    w: w * [1, 0.95, 0.88, 0.5][i], h: h * [1, 0.85, 0.6, 0.25][i], dn: h * [0.8, 0.6, 0.45, 0.2][i], skin: sk(BONE.HEAD), coat: 0, region: REGION.BEAK, col: i === 3 && o.tip ? o.tip : col, pw: o.flat ? 3 : 2.2,
  }));
  return tube(rs, { seg: Math.max(6, lod.seg - 5), sub: 1, up: [0, 1, 0], capEnd: true, flat: true });
}

/** Folded wings: a flattened ellipsoid along each flank, the primaries running back over the tail. */
function wings(cy: number, z: number, hw: number, len: number, hgt: number, lod: Lod, tilt = -0.1): Mesh {
  const out = newMesh();
  for (const sx of [-1, 1]) append(out, blob([sx * hw, cy, z], [hw * 0.28, hgt, len], { seg: Math.max(6, lod.seg - 4), rings: 5, col: [1, 1, 1], coat: 1, region: REGION.BODY, skin: sk(BONE.ROOT), tilt, yaw: sx * 0.05, flat: true }));
  return out;
}

/** A leg: feathered thigh, drumstick, scaled shank, toes. `webbed` makes the front toes a web. */
function leg(sx: number, b: number, x: number, y0: number, p: { thigh: number; knee: [number, number]; ankle: [number, number]; shank: number; toe: number; col: V3; web?: boolean; fw?: number }, lod: Lod): Mesh[] {
  const out: Mesh[] = [];
  const R = (y: number, z: number, w: number, h: number, s: ReturnType<typeof sk>, feather: boolean): Ring => ({ p: [sx * x, y, z], w, h, skin: s, coat: feather ? 1 : 0, col: feather ? [1, 1, 1] : p.col, region: feather ? REGION.BODY : REGION.FLESH });
  const t = p.thigh, [ky, kz] = p.knee, [ay, az] = p.ankle;
  out.push(tube([R(y0, 0.02, t, t * 1.35, sk(b), true), R(ky, kz, t * 0.8, t * 1.05, sk(b, b + 1, 0.5), true), R(ky - (ky - ay) * 0.4, (kz + az) / 2, t * 0.5, t * 0.62, sk(b + 1), true), R(ay + 0.02, az, p.shank, p.shank * 1.1, sk(b + 1, b + 2, 0.5), false), R(0.022, az + 0.01, p.shank * 0.85, p.shank * 0.95, sk(b + 2), false)], { seg: Math.max(5, lod.seg - 6), sub: lod.sub, up: [0, 0, 1], flat: true }));
  if (lod.detail < 2) {
    const toes: Array<[number, number]> = [[-0.4, 1], [0, 1.1], [0.4, 1], [Math.PI, 0.5]];
    for (const [ang, ln] of toes) {
      const dz = Math.cos(ang), dx = Math.sin(ang), L = p.toe * ln;
      out.push(spike([[sx * x, 0.022, az + 0.01, p.shank * 0.8], [sx * x + dx * L * 0.5, 0.012, az + 0.01 + dz * L * 0.5, p.shank * 0.6], [sx * x + dx * L, 0.004, az + 0.01 + dz * L, p.shank * 0.35]], sk(b + 3), lod, { region: REGION.FLESH, col: p.col, seg: 4 }));
    }
    if (p.web) {
      const fw = p.fw ?? 0.05;
      out.push(blob([sx * x, 0.006, az + 0.01 + p.toe * 0.55], [fw, 0.004, p.toe * 0.6], { seg: 6, rings: 3, col: p.col, region: REGION.FLESH, skin: sk(b + 3), flat: true }));
    }
  }
  return out;
}

/** The standard bird skeleton: the body is the root; the neck and head swing for a walking bob and dip to peck; the legs are four bones each. */
function birdBones(o: { neck: V3; head: V3; tail: V3; rootY: number; hip: [number, number]; legs: { hipY: number; kneeY: number; kneeZ: number; ankleY: number; ankleZ: number; toeY: number; toeZ: number; x: number }; bob?: number; peck: { neck: number; head: number } }): Array<BoneAnim | undefined> {
  const b: Array<BoneAnim | undefined> = [];
  b[BONE.ROOT] = { pivot: [0, o.rootY, 0], parent: -1 };
  b[BONE.NECK] = { pivot: o.neck, parent: 0, swing: 0.16, off: 0.7, graze: o.peck.neck, idle: 0.04, idleFreq: 0.7, idlePh: 0.3, bob: 0.2, alert: 0.2 };
  b[BONE.HEAD] = { pivot: o.head, parent: BONE.NECK, swing: -0.1, off: 0.7, graze: o.peck.head, idle: 0.12, idleFreq: 1.4, idlePh: 1.0, bob: 0.5, pulse: true, alert: 0.15 };
  b[BONE.TAIL] = { pivot: o.tail, parent: 0, idle: 0.05, idleFreq: 1.1, idlePh: 0.5, swing: 0.05 };
  const L = o.legs;
  for (const [sx, bh, oh] of [[1, BONE.HL, WALK_OFF.HL], [-1, BONE.HR, WALK_OFF.HR]] as const) {
    legBones(b, { base: bh, pivots: [[L.x, L.hipY, 0.02], [L.x, L.kneeY, L.kneeZ], [L.x, L.ankleY, L.ankleZ], [L.x, L.toeY, L.toeZ]], swing: 0.5, flex: [0, -0.7, 1.0, -0.45], foot: -0.1, off: oh, sx });
  }
  return b;
}

const bb = (name: string, o: Partial<Breed> & { base: V3 }): Breed => ({ name, style: 0, fur: 1.0, furFreq: 80, nose: c3(0.5, 0.1, 0.1), acc1Mix: 0.9, acc2Mix: 0.9, acc3Mix: 0.9, ...o });
const bird = (id: string, build: (lod: Lod) => Mesh[], bones: Array<BoneAnim | undefined>, breeds: Breed[], m: { withers: number; length: number; stride: number; peck: { neck: number; head: number }; cy: number; cz: number; grazePitch: number; adorn?: V3; bob?: number }): AnimalModel => ({
  id, build: lod => toGeometry(build(lod)), withers: m.withers, length: m.length, stride: m.stride, graze: m.peck,
  spec: { bones, breeds, root: { bob: m.bob ?? 0.008, pitch: 0.05, hop: false, cy: m.cy, cz: m.cz, grazePitch: m.grazePitch }, grazeFreq: 9, key: id, extra: true, adorn: m.adorn },
});

// ---------------------------------------------------------------- wild turkey
const TURKEY_BODY: Row[] = [{ z: 0.32, y: 0.55, w: 0.08, h: 0.1 }, { z: 0.22, y: 0.58, w: 0.14, h: 0.17 }, { z: 0.06, y: 0.6, w: 0.17, h: 0.2 }, { z: -0.12, y: 0.6, w: 0.16, h: 0.19 }, { z: -0.28, y: 0.56, w: 0.11, h: 0.14 }, { z: -0.36, y: 0.52, w: 0.06, h: 0.08 }];
const TNECK: Array<[number, number, number]> = [[0.68, 0.22, 0.06], [0.76, 0.27, 0.045], [0.85, 0.31, 0.032], [0.93, 0.33, 0.025], [0.98, 0.34, 0.023]];
const TH = c3(0, 0.99, 0.34);
function buildTurkey(lod: Lod): Mesh[] {
  const out: Mesh[] = [], { seg, sub } = lod;
  out.push(tube(TURKEY_BODY.map(r => ringOf(r, sk(BONE.ROOT))), { seg, sub, capStart: true, capEnd: true }));
  out.push(wings(0.6, -0.02, 0.17, 0.26, 0.15, lod));
  out.push(neckTube(TNECK, lod, { coat: 0, col: i => (i < 2 ? [0.2, 0.14, 0.1] : i < 4 ? [0.5, 0.2, 0.2] : SKINBLUE) }));
  // head: a small bare head, the bill, eyes, wattle, snood, caruncles (red)
  const head = newMesh();
  append(head, blob([0, 0, 0.012], [0.026, 0.03, 0.04], { seg: Math.max(6, seg - 4), rings: 5, col: SKINBLUE, coat: 0, region: REGION.FLESH, skin: sk(BONE.HEAD), tilt: 0.05 }));
  append(head, bill(0.045, 0.012, 0.012, [0.62, 0.55, 0.45], lod, { at: [0, -0.004, 0.034], hook: 0.4 }));
  if (lod.detail < 2) {
    append(head, eye(-1, [0.02, 0.008, 0.016], 0.0055, sk(BONE.HEAD), lod)); append(head, eye(1, [0.02, 0.008, 0.016], 0.0055, sk(BONE.HEAD), lod));
    append(head, blob([0, -0.03, 0.022], [0.007, 0.032, 0.012], { seg: 6, rings: 3, col: RED, coat: 0, region: REGION.FLESH, skin: sk(BONE.HEAD), flat: true }));       // the wattle
    append(head, blob([0, -0.012, 0.05], [0.004, 0.02, 0.006], { seg: 5, rings: 3, col: RED, coat: 0, region: REGION.ADORN, skin: sk(BONE.HEAD), flat: true }));         // the snood
  }
  out.push(place(head, 0, TH));
  // the fan of tail feathers, half spread, rising from the rump
  for (let i = 0; i < 9; i++) {
    const f = (i / 8) * 2 - 1, a = f * 0.75, len = 0.34 - Math.abs(f) * 0.05;
    const P = (t: number): V3 => [Math.sin(a) * len * t * 0.55, 0.5 + 0.1 * t + Math.cos(a) * len * t * 0.28 - t * t * 0.05, -0.32 - Math.cos(a * 0.6) * len * t * 0.9];
    out.push(tube([0, 0.4, 0.75, 1].map((t, j) => ({ p: P(t), w: [0.018, 0.034, 0.034, 0.016][j], h: 0.003, skin: sk(BONE.TAIL), coat: 1, region: REGION.TAIL, col: [1, 1, 1] as V3 })), { seg: 4, sub: lod.sub > 1 ? 2 : 1, up: [1, 0, 0], flat: true, capEnd: true }));
  }
  // legs: strong, scaled grey-pink shanks, a spur on a tom
  for (const [sx, b] of [[1, BONE.HL], [-1, BONE.HR]] as const) out.push(...leg(sx, b, 0.07, 0.5, { thigh: 0.05, knee: [0.32, 0.1], ankle: [0.2, -0.01], shank: 0.014, toe: 0.12, col: PINK }, lod));
  // beard: a tuft of coarse bristles hanging from the breast (tom only: REGION.ADORN)
  out.push(tube([[0.58, 0.3, 0.012], [0.5, 0.33, 0.012], [0.4, 0.35, 0.01], [0.33, 0.35, 0.004]].map(([y, z, r]) => ({ p: [0, y, z] as V3, w: r, h: r, skin: sk(BONE.ROOT), coat: 0, region: REGION.ADORN, col: [0.1, 0.07, 0.05] as V3 })), { seg: 5, sub: 1, up: [1, 0, 0], capEnd: true, flat: true }));
  return out;
}
const TURKEY_BONES = birdBones({ neck: c3(0, 0.7, 0.24), head: TH, tail: c3(0, 0.52, -0.3), rootY: 0.55, hip: [0, 0.5], legs: { hipY: 0.5, kneeY: 0.32, kneeZ: 0.1, ankleY: 0.2, ankleZ: -0.01, toeY: 0.03, toeZ: 0.0, x: 0.07 }, peck: { neck: -0.9, head: -0.5 } });
export const TURKEY_MODEL = (): AnimalModel => bird('turkey', buildTurkey, TURKEY_BONES, [
  bb('Tom', { base: c3(0.13, 0.085, 0.045), style: 2, patch: c3(0.5, 0.34, 0.14), cover: 0.35, scale: 34, leg: PINK, legMix: 0, fur: 1.2, furFreq: 70 }),
  bb('Hen', { base: c3(0.17, 0.11, 0.07), style: 2, patch: c3(0.42, 0.3, 0.17), cover: 0.4, scale: 40, fur: 1.2, furFreq: 70, size: 0.72 }),
  bb('Tom (dark)', { base: c3(0.08, 0.06, 0.04), style: 2, patch: c3(0.36, 0.25, 0.1), cover: 0.3, scale: 34, fur: 1.2, furFreq: 70, size: 0.97 }),
  bb('Hen (pale)', { base: c3(0.24, 0.17, 0.1), style: 2, patch: c3(0.5, 0.38, 0.24), cover: 0.4, scale: 40, fur: 1.2, furFreq: 70, size: 0.7 }),
], { withers: 1.0, length: 1.0, stride: 0.55, peck: { neck: -0.9, head: -0.5 }, cy: 0.04, cz: 0.04, grazePitch: -0.4, adorn: c3(0, 0.55, 0.3) });

// ---------------------------------------------------------------- ruffed grouse
const GROUSE_BODY: Row[] = [{ z: 0.17, y: 0.17, w: 0.045, h: 0.055 }, { z: 0.1, y: 0.18, w: 0.075, h: 0.085 }, { z: 0.0, y: 0.19, w: 0.085, h: 0.09 }, { z: -0.1, y: 0.19, w: 0.075, h: 0.08 }, { z: -0.17, y: 0.17, w: 0.045, h: 0.05 }];
const GH = c3(0, 0.325, 0.15);
function buildGrouse(lod: Lod): Mesh[] {
  const out: Mesh[] = [], { seg, sub } = lod;
  out.push(tube(GROUSE_BODY.map(r => ringOf(r, sk(BONE.ROOT))), { seg, sub, capStart: true, capEnd: true }));
  out.push(wings(0.2, -0.02, 0.083, 0.11, 0.07, lod));
  out.push(neckTube([[0.24, 0.11, 0.04], [0.28, 0.13, 0.032], [0.31, 0.145, 0.026], [0.325, 0.15, 0.022]], lod));
  // the ruff: a dark collar of feathers on the sides of the neck
  if (lod.detail < 2) out.push(blob([0, 0.27, 0.12], [0.06, 0.04, 0.035], { seg: Math.max(6, seg - 3), rings: 4, col: [1, 1, 1], coat: 1, region: REGION.ACC3, skin: sk(BONE.ROOT, BONE.NECK, 0.5), flat: true }));
  const head = newMesh();
  append(head, blob([0, 0, 0.008], [0.016, 0.02, 0.026], { seg: Math.max(6, seg - 4), rings: 4, col: [1, 1, 1], coat: 1, region: REGION.HEAD, skin: sk(BONE.HEAD), tilt: 0.05 }));
  append(head, bill(0.022, 0.007, 0.007, [0.35, 0.3, 0.25], lod, { at: [0, -0.004, 0.026], hook: 0.4 }));
  if (lod.detail < 2) {
    append(head, eye(-1, [0.0135, 0.006, 0.011], 0.0045, sk(BONE.HEAD), lod)); append(head, eye(1, [0.0135, 0.006, 0.011], 0.0045, sk(BONE.HEAD), lod));
    append(head, blob([0, 0.022, -0.002], [0.005, 0.016, 0.014], { seg: 5, rings: 3, col: [1, 1, 1], coat: 1, region: REGION.HEAD, skin: sk(BONE.HEAD), flat: true, tilt: -0.5 }));        // the crest
  }
  out.push(place(head, 0, GH));
  // fan tail with a dark subterminal band (painted by the bars)
  for (let i = 0; i < 7; i++) {
    const f = (i / 6) * 2 - 1, a = f * 0.5, len = 0.15 - Math.abs(f) * 0.015;
    const P = (t: number): V3 => [Math.sin(a) * len * t * 0.5, 0.19 + 0.04 * t, -0.15 - Math.cos(a * 0.5) * len * t * 0.95];
    out.push(tube([0, 0.4, 0.75, 1].map((t, j) => ({ p: P(t), w: [0.012, 0.022, 0.022, 0.014][j], h: 0.0025, skin: sk(BONE.TAIL), coat: 1, region: REGION.TAIL, col: [1, 1, 1] as V3 })), { seg: 4, sub: 1, up: [1, 0, 0], flat: true, capEnd: true }));
  }
  for (const [sx, b] of [[1, BONE.HL], [-1, BONE.HR]] as const) out.push(...leg(sx, b, 0.04, 0.17, { thigh: 0.026, knee: [0.1, 0.05], ankle: [0.07, 0.0], shank: 0.007, toe: 0.045, col: [0.5, 0.4, 0.3] }, lod));
  return out;
}
const GROUSE_BONES = birdBones({ neck: c3(0, 0.24, 0.11), head: GH, tail: c3(0, 0.19, -0.15), rootY: 0.19, hip: [0, 0.17], legs: { hipY: 0.17, kneeY: 0.1, kneeZ: 0.05, ankleY: 0.07, ankleZ: 0, toeY: 0.015, toeZ: 0.0, x: 0.04 }, peck: { neck: -0.9, head: -0.5 } });
export const GROUSE_MODEL = (): AnimalModel => bird('grouse', buildGrouse, GROUSE_BONES, [
  bb('Ruffed grouse', { base: c3(0.28, 0.17, 0.08), style: 2, patch: c3(0.09, 0.07, 0.05), cover: 0.45, scale: 55, face: c3(0.3, 0.2, 0.1), faceMix: 0.3, belly: c3(0.7, 0.62, 0.5), bellyMix: 0.7, bellyY: 0.12, acc3: c3(0.04, 0.035, 0.03), acc3Mix: 0.9, fur: 1.2, furFreq: 100 }),
  bb('Ruffed grouse (grey)', { base: c3(0.3, 0.26, 0.2), style: 2, patch: c3(0.1, 0.085, 0.07), cover: 0.45, scale: 55, belly: c3(0.72, 0.68, 0.6), bellyMix: 0.7, bellyY: 0.12, acc3: c3(0.04, 0.035, 0.03), acc3Mix: 0.9, fur: 1.2, furFreq: 100, size: 0.96 }),
], { withers: 0.33, length: 0.4, stride: 0.22, peck: { neck: -0.9, head: -0.5 }, cy: 0.02, cz: 0.02, grazePitch: -0.45 });

// ---------------------------------------------------------------- mallard
const DUCK_BODY: Row[] = [{ z: 0.22, y: 0.17, w: 0.05, h: 0.06 }, { z: 0.14, y: 0.185, w: 0.085, h: 0.09 }, { z: 0.0, y: 0.185, w: 0.1, h: 0.095 }, { z: -0.14, y: 0.18, w: 0.085, h: 0.085 }, { z: -0.25, y: 0.17, w: 0.045, h: 0.055 }, { z: -0.29, y: 0.185, w: 0.025, h: 0.03 }];
const DH = c3(0, 0.34, 0.25);
function buildDuck(lod: Lod): Mesh[] {
  const out: Mesh[] = [], { seg, sub } = lod;
  // breast chestnut / head green / rump black: the body's three zones are accents 1 and 3, the head's is accent 2
  out.push(tube(DUCK_BODY.map((r, i) => ringOf(r, sk(BONE.ROOT), i <= 1 ? REGION.ACC1 : i >= 4 ? REGION.ACC3 : REGION.BODY)), { seg, sub, capStart: true, capEnd: true }));
  out.push(wings(0.2, -0.03, 0.1, 0.17, 0.075, lod, -0.02));
  // the wing's blue speculum shows as a flash at the trailing edge
  if (lod.detail < 2) for (const sx of [-1, 1]) out.push(blob([sx * 0.105, 0.2, -0.12], [0.006, 0.03, 0.05], { seg: 5, rings: 3, col: [0.1, 0.22, 0.55], coat: 0, region: REGION.FLESH, skin: sk(BONE.ROOT), flat: true }));
  out.push(neckTube([[0.22, 0.17, 0.05], [0.28, 0.2, 0.036], [0.32, 0.23, 0.03], [0.34, 0.25, 0.028]], lod, { region: REGION.ACC2 }));
  // the white collar
  if (lod.detail < 2) out.push(blob([0, 0.245, 0.185], [0.04, 0.013, 0.04], { seg: Math.max(6, seg - 3), rings: 3, col: [1, 1, 1], coat: 0, region: REGION.TEETH, skin: sk(BONE.ROOT, BONE.NECK, 0.5), flat: true }));
  const head = newMesh();
  append(head, blob([0, 0, 0.012], [0.026, 0.027, 0.04], { seg: Math.max(6, seg - 3), rings: 5, col: [1, 1, 1], coat: 1, region: REGION.ACC2, skin: sk(BONE.HEAD) }));
  append(head, bill(0.06, 0.017, 0.0085, YEL, lod, { at: [0, -0.005, 0.04], flat: true, tip: [0.15, 0.13, 0.08] }));
  if (lod.detail < 2) { append(head, eye(-1, [0.0215, 0.009, 0.018], 0.0055, sk(BONE.HEAD), lod)); append(head, eye(1, [0.0215, 0.009, 0.018], 0.0055, sk(BONE.HEAD), lod)); }
  out.push(place(head, 0, DH));
  // a short tail with the drake's curl
  out.push(tube([[0.18, -0.26, 0.022], [0.2, -0.31, 0.02], [0.215, -0.34, 0.012]].map(([y, z, w]) => ({ p: [0, y, z] as V3, w, h: 0.006, skin: sk(BONE.TAIL), coat: 1, region: REGION.ACC3, col: [1, 1, 1] as V3 })), { seg: 5, sub: 1, up: [1, 0, 0], flat: true, capEnd: true }));
  for (const [sx, b] of [[1, BONE.HL], [-1, BONE.HR]] as const) out.push(...leg(sx, b, 0.045, 0.1, { thigh: 0.03, knee: [0.07, 0.05], ankle: [0.045, -0.02], shank: 0.008, toe: 0.06, col: ORANGE, web: true, fw: 0.03 }, lod));
  return out;
}
const DUCK_BONES = birdBones({ neck: c3(0, 0.24, 0.17), head: DH, tail: c3(0, 0.18, -0.25), rootY: 0.18, hip: [0, 0.1], legs: { hipY: 0.1, kneeY: 0.07, kneeZ: 0.05, ankleY: 0.045, ankleZ: -0.02, toeY: 0.01, toeZ: 0.0, x: 0.045 }, peck: { neck: -0.7, head: -0.6 } });
export const DUCK_MODEL = (): AnimalModel => bird('duck', buildDuck, DUCK_BONES, [
  bb('Mallard drake', { base: c3(0.4, 0.38, 0.35), style: 6, patch: c3(0.3, 0.28, 0.26), cover: 0.3, scale: 60, acc1: c3(0.32, 0.12, 0.06), acc1Mix: 0.95, acc2: c3(0.02, 0.2, 0.1), acc2Mix: 0.97, acc3: c3(0.03, 0.03, 0.035), acc3Mix: 0.95, belly: c3(0.6, 0.58, 0.54), bellyMix: 0.7, bellyY: 0.11, fur: 0.8, furFreq: 120 }),
  bb('Mallard hen', { base: c3(0.26, 0.19, 0.12), style: 6, patch: c3(0.09, 0.065, 0.045), cover: 0.55, scale: 45, acc1: c3(0.27, 0.2, 0.12), acc1Mix: 0.95, acc2: c3(0.25, 0.18, 0.11), acc2Mix: 0.95, acc3: c3(0.2, 0.14, 0.09), acc3Mix: 0.95, belly: c3(0.34, 0.26, 0.17), bellyMix: 0.5, bellyY: 0.11, fur: 0.8, furFreq: 120, size: 0.95 }),
  bb('Mallard drake (eclipse)', { base: c3(0.3, 0.24, 0.17), style: 6, patch: c3(0.12, 0.09, 0.06), cover: 0.45, scale: 50, acc1: c3(0.3, 0.2, 0.12), acc1Mix: 0.95, acc2: c3(0.2, 0.16, 0.1), acc2Mix: 0.95, acc3: c3(0.08, 0.07, 0.06), acc3Mix: 0.95, fur: 0.8, furFreq: 120 }),
], { withers: 0.36, length: 0.58, stride: 0.3, peck: { neck: -0.7, head: -0.6 }, cy: 0.03, cz: 0.03, grazePitch: -0.4 });

// ---------------------------------------------------------------- Canada goose
const G = 1.55;
const GOOSE_BODY: Row[] = DUCK_BODY.map(r => ({ z: r.z * G, y: r.y * G + 0.02, w: r.w * G, h: r.h * G }));
const GNECK: Array<[number, number, number]> = [[0.33, 0.24, 0.07], [0.42, 0.32, 0.048], [0.56, 0.36, 0.036], [0.68, 0.35, 0.03], [0.74, 0.37, 0.028]];
const GHP = c3(0, 0.755, 0.38);
function buildGoose(lod: Lod): Mesh[] {
  const out: Mesh[] = [], { seg, sub } = lod;
  out.push(tube(GOOSE_BODY.map((r, i) => ringOf(r, sk(BONE.ROOT), i >= 4 ? REGION.ACC3 : REGION.BODY)), { seg, sub, capStart: true, capEnd: true }));
  out.push(wings(0.32, -0.04, 0.16, 0.26, 0.11, lod, -0.02));
  out.push(neckTube(GNECK, lod, { region: REGION.ACC3 }));
  const head = newMesh();
  append(head, blob([0, 0, 0.014], [0.03, 0.032, 0.05], { seg: Math.max(6, seg - 3), rings: 5, col: [1, 1, 1], coat: 1, region: REGION.ACC3, skin: sk(BONE.HEAD) }));
  if (lod.detail < 2) append(head, blob([0, -0.014, 0.012], [0.032, 0.012, 0.03], { seg: 6, rings: 3, col: [1, 1, 1], coat: 1, region: REGION.ACC1, skin: sk(BONE.HEAD), flat: true }));           // the white chin strap
  append(head, bill(0.058, 0.014, 0.011, [0.04, 0.036, 0.035], lod, { at: [0, -0.004, 0.05], flat: true }));
  if (lod.detail < 2) { append(head, eye(-1, [0.025, 0.01, 0.022], 0.0058, sk(BONE.HEAD), lod)); append(head, eye(1, [0.025, 0.01, 0.022], 0.0058, sk(BONE.HEAD), lod)); }
  out.push(place(head, 0, GHP));
  out.push(tube([[0.3, -0.38, 0.04], [0.32, -0.43, 0.036], [0.31, -0.46, 0.02]].map(([y, z, w]) => ({ p: [0, y, z] as V3, w, h: 0.01, skin: sk(BONE.TAIL), coat: 1, region: REGION.ACC3, col: [1, 1, 1] as V3 })), { seg: 5, sub: 1, up: [1, 0, 0], flat: true, capEnd: true }));
  for (const [sx, b] of [[1, BONE.HL], [-1, BONE.HR]] as const) out.push(...leg(sx, b, 0.07, 0.2, { thigh: 0.045, knee: [0.14, 0.07], ankle: [0.1, -0.02], shank: 0.011, toe: 0.09, col: [0.1, 0.09, 0.08], web: true, fw: 0.045 }, lod));
  return out;
}
const GOOSE_BONES = birdBones({ neck: c3(0, 0.38, 0.26), head: GHP, tail: c3(0, 0.3, -0.36), rootY: 0.3, hip: [0, 0.2], legs: { hipY: 0.2, kneeY: 0.14, kneeZ: 0.07, ankleY: 0.1, ankleZ: -0.02, toeY: 0.014, toeZ: 0.0, x: 0.07 }, peck: { neck: -1.1, head: -0.5 } });
export const GOOSE_MODEL = (): AnimalModel => bird('goose', buildGoose, GOOSE_BONES, [
  bb('Canada goose', { base: c3(0.28, 0.22, 0.16), style: 6, patch: c3(0.16, 0.12, 0.08), cover: 0.3, scale: 45, belly: c3(0.7, 0.66, 0.58), bellyMix: 0.8, bellyY: 0.22, acc1: c3(0.92, 0.9, 0.86), acc1Mix: 0.97, acc3: c3(0.03, 0.03, 0.03), acc3Mix: 0.95, fur: 0.8, furFreq: 90 }),
  bb('Canada goose (pale)', { base: c3(0.36, 0.3, 0.22), style: 6, patch: c3(0.2, 0.15, 0.1), cover: 0.3, scale: 45, belly: c3(0.76, 0.72, 0.64), bellyMix: 0.8, bellyY: 0.22, acc1: c3(0.92, 0.9, 0.86), acc1Mix: 0.97, acc3: c3(0.04, 0.04, 0.04), acc3Mix: 0.95, fur: 0.8, furFreq: 90, size: 0.96 }),
], { withers: 0.8, length: 0.9, stride: 0.45, peck: { neck: -1.1, head: -0.5 }, cy: 0.04, cz: 0.04, grazePitch: -0.35 });
