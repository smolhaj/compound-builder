/**
 * The four-legged hunters and the dogs: a digitigrade canid builder (wolf, coyote and every dog breed: deep narrow chest, tucked waist, legs with the
 * elbow tight to the ribs, the wrist and the hock, small oval paws, ears of the breed, a tail of the breed), the cougar (long, low, heavy
 * hind legs, a long tail, a round head) and the black bear (plantigrade: heavy shoulders and a hump, flat feet with claws, small round ears).
 * Metres, forward +z, left +x, ground y = 0, instance scale 1/6. A wolf is 0.8 m at the shoulder, a coyote 0.6, a cougar 0.7, a black bear 0.95.
 */
import { BONE, REGION, append, blob, skin, tube, type Lod, type Mesh, type Ring, type V3 } from '../../livestock/animalKit';
import type { Breed } from '../../livestock/animalMaterial';
import { nostrils, paw, strand, type AnimalModel, type HeadRow, type LimbRow } from '../../livestock/animalParts';
import { quadBones, quadModel, type NeckRow, type Quad } from '../../livestock/animalQuad';
import { ear, headPoint } from './hoofed';

const sk = skin;
const c3 = (a: number, b: number, c: number): V3 => [a, b, c];
/** sRGB hex to the linear triple the coat shader takes. */
export const hexLin = (h: number): V3 => [(h >> 16) & 255, (h >> 8) & 255, h & 255].map(v => Math.pow(v / 255, 2.2)) as V3;

/** A hanging flap (a drop ear): down from the crown along the cheek, `len` long, `wd` wide. */
function flap(sx: number, b: number, at: V3, len: number, wd: number, lod: Lod, o: { sweep?: number; fold?: boolean; col?: V3 } = {}): Mesh {
  const sw = o.sweep ?? 0.25, col = o.col ?? [1, 1, 1];
  const pts: Array<[number, number, number, number]> = o.fold
    ? [[0.0, 0.0, 0.0, 0.3], [0.3, 0.3, 0.0, 0.85], [0.55, 0.45, 0.25, 1], [0.7, 0.4, 0.5, 0.85], [0.78, 0.28, 0.7, 0.3]]   // stands, then folds forward over itself
    : [[0.0, 0.0, 0.0, 0.4], [-0.25, 0.25, 0.0, 0.9], [-0.6, 0.35, -0.02, 1], [-0.9, 0.42, 0.0, 0.75], [-1, 0.45, 0.02, 0.2]];
  const rs: Ring[] = pts.map(([dy, dx, dz, w], i) => ({ p: [at[0] + sx * dx * len * sw * 0.55, at[1] + dy * len, at[2] + dz * len] as V3, w: wd * w, h: 0.0045, skin: i === 0 ? sk(BONE.HEAD, b, 0.35) : sk(b), coat: 1, region: REGION.EAR, col }));
  return tube(rs, { seg: Math.max(6, Math.round(lod.seg * 0.5)), sub: lod.sub > 1 ? 2 : 1, up: [1, 0, 0], flat: true, capEnd: true });
}

// ---------------------------------------------------------------- the canid
interface Canid {
  id: string; k: number;
  /** Chest depth, body width, leg length, neck, skull width, muzzle length (1 = a wolf's). */
  chest?: number; width?: number; legK?: number; neckK?: number; skullW?: number; muzzle?: number; head?: number;
  /** Withers over rump: raises the front (a shepherd's slope). */
  slope?: number;
  /** Body length factor (a cat is long and low). */
  stretch?: number;
  ear: { kind: 'prick' | 'drop' | 'fold' | 'semi'; len: number; wd: number };
  tail: { kind: 'bush' | 'sabre' | 'otter' | 'plume' | 'curl' | 'ring' | 'long'; len?: number; thick?: number };
  ruff?: number;
  breeds: Breed[];
  /** The tail tip, the paws, the blaze, the collar: colours painted with accents (see each breed). */
  tipAcc?: boolean; blaze?: boolean; collar?: boolean; mask?: boolean;
  pets?: boolean;
  withers: number; length: number; stride: number;
  paws?: number;
  /** Limb thickness factor (default 1.3: a wolf's legs are not sticks). */
  limbW?: number;
}
function canid(o: Canid): Quad {
  const k = o.k, hs = (o.head ?? 1) * 1.3, ch = o.chest ?? 1, wd = o.width ?? 1, lk = o.legK ?? 1, nk = (o.neckK ?? 1) * 1.4, sw = o.skullW ?? 1, mz = o.muzzle ?? 1, sl = o.slope ?? 0;
  // wolf base proportions, scaled: legs by lk (the body rides on them), the chest by ch
  const lift = (lk - 1) * 0.36, st = o.stretch ?? 1;
  const Y = (y: number): number => (y + lift) * k, Z = (z: number): number => z * k * st;
  const body = ([[0.46, 0.62, 0.38, 0.075], [0.36, 0.8 + sl, 0.8 - 0.52 * ch, 0.11], [0.12, 0.78 + sl * 0.5, 0.8 - 0.52 * ch, 0.12], [-0.14, 0.74, 0.42, 0.102], [-0.36, 0.75 - sl * 0.4, 0.45, 0.105], [-0.5, 0.7, 0.48, 0.072]] as Array<[number, number, number, number]>)
    .map(([z, t, b, hw]) => [Z(z), Y(t), Y(b), hw * k * wd, 2.2] as [number, number, number, number, number]);
  const neck: NeckRow[] = [{ y: 0.72 + sl, z: 0.36, w: 0.085, h: 0.12, dn: 0.12 }, { y: 0.77 + sl, z: 0.5, w: 0.066, h: 0.095, dn: 0.095 }, { y: 0.79 + sl, z: 0.6, w: 0.052, h: 0.07, dn: 0.07 }].map(n => ({ y: Y(n.y), z: Z(n.z), w: n.w * k * nk * wd, h: n.h * k * nk, dn: n.dn * k * nk }));
  const hz = (z: number): number => (z > 0.1 ? 0.1 + (z - 0.1) * mz : z);
  const mw = 1.3, LW = o.limbW ?? 1.3;
  const head: HeadRow[] = ([[-0.05, 0, 0.05 * sw, 0.062, 0.062], [0.03, 0, 0.06 * sw, 0.067, 0.064], [0.1, -0.012, 0.045 * sw, 0.05, 0.048], [0.17, -0.024, 0.032 * sw * mw, 0.036, 0.035], [0.22, -0.03, 0.026 * sw * mw, 0.028, 0.026]] as HeadRow[])
      .map(([z, cy, w, h, dn]) => [hz(z) * k, cy * k * hs, w * k * hs, h * k * hs, dn * k * hs] as HeadRow);
  const headAt: V3 = c3(0, Y(0.78 + sl), Z(0.6)), HP = -0.16;
  const fx = 0.062 * k * wd, hx = 0.066 * k * wd;
  const fore = (b: number): LimbRow[] => ([
    [0.66, 0.35, 0.04, 0.06, sk(b)], [0.57, 0.35, 0.048, 0.072, sk(b, b + 1, 0.2)], [0.4, 0.24, 0.036, 0.05, sk(b, b + 1, 0.6)], [0.28, 0.265, 0.03, 0.04, sk(b + 1)],
    [0.17, 0.295, 0.024, 0.03, sk(b + 1, b + 2, 0.5)], [0.09, 0.315, 0.0205, 0.026, sk(b + 2, b + 3, 0.5)], [0.04, 0.325, 0.021, 0.027, sk(b + 3)],
  ] as Array<[number, number, number, number, ReturnType<typeof sk>]>).map(([y, z, w, h, s]) => [Y(y + (y > 0.1 ? 0 : 0)) - (y < 0.1 ? lift * k : 0), Z(z), w * k * LW, h * k * LW, s] as LimbRow);
  const hind = (b: number): LimbRow[] => ([
    [0.72, -0.35, 0.055, 0.085, sk(b)], [0.62, -0.34, 0.07, 0.115, sk(b)], [0.5, -0.26, 0.055, 0.09, sk(b, b + 1, 0.3)], [0.43, -0.19, 0.04, 0.06, sk(b, b + 1, 0.6)], [0.34, -0.3, 0.03, 0.045, sk(b + 1)],
    [0.24, -0.4, 0.026, 0.036, sk(b + 1, b + 2, 0.5)], [0.12, -0.37, 0.02, 0.025, sk(b + 2)], [0.05, -0.34, 0.02, 0.028, sk(b + 2, b + 3, 0.5)], [0.025, -0.33, 0.021, 0.028, sk(b + 3)],
  ] as Array<[number, number, number, number, ReturnType<typeof sk>]>).map(([y, z, w, h, s]) => [Y(y) - (y < 0.1 ? lift * k : 0), Z(z), w * k * LW, h * k * LW, s] as LimbRow);
  const fl = fore(0), hl = hind(0);
  const pawW = 0.034 * k * (o.paws ?? 1), pawL = 0.1 * k * (o.paws ?? 1);
  const earBone = (sx: number) => (sx > 0 ? BONE.EAR_L : BONE.EAR_R);
  const e = o.ear;
  const tailRoot = c3(0, Y(0.7), Z(-0.5));
  return {
    id: o.id, body, neck, head, headAt, headPitch: HP, eye: [0.047 * sw * k * hs, 0.028 * k * hs, 0.1 * k * (0.8 + 0.2 * mz), 0.0092 * k * hs],
    fore, hind, foreX: fx, hindX: hx, coatFrom: 3,
    foot: (sx, b, isHind, lod) => [paw(sx * (isHind ? hx : fx), isHind ? Z(-0.375) : Z(0.31), { r: pawW, len: pawL, toes: 4, skin: sk(b), claw: 0.012 * k, coat: 1, region: REGION.LEG }, lod)],
    headExtras: (h, lod) => {
      const m = (v: number): number => v * k;
      // muzzle: the pale / dark mask, nose, the lip line is the shape of the rings
      const zN = hz(0.22) * k;
      append(h, blob([0, m(-0.03) * (o.head ?? 1), zN - m(0.04)], [m(0.028) * sw, m(0.026), m(0.05) * Math.max(0.7, mz)], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.ACC1, skin: sk(BONE.HEAD), flat: true }));
      append(h, blob([0, m(-0.03) * (o.head ?? 1), zN + m(0.003)], [m(0.0185) * sw, m(0.014), m(0.012)], { seg: lod.seg, rings: 4, col: [0.04, 0.035, 0.035], region: REGION.NOSE, skin: sk(BONE.HEAD), flat: true }));
      if (o.blaze && lod.detail < 2) append(h, blob([0, m(0.052), zN - m(0.14)], [m(0.012), m(0.012), m(0.07)], { seg: 6, rings: 3, col: [1, 1, 1], coat: 1, region: REGION.ACC2, skin: sk(BONE.HEAD), flat: true }));
      if (lod.detail < 2) for (const sx of [-1, 1]) {
        append(h, blob([sx * m(0.03) * sw, m(-0.05), m(0.1)], [m(0.01), m(0.016), m(0.03)], { seg: 5, rings: 3, col: [1, 1, 1], coat: 1, region: REGION.ACC1, skin: sk(BONE.HEAD), flat: true }));    // the cheek / lip
      }
      for (const sx of [-1, 1]) {
        const at: V3 = e.kind === 'prick' ? [sx * m(0.034) * sw, m(0.052) * hs, m(-0.035)] : [sx * m(0.047) * sw * hs, m(0.045) * hs, m(-0.03) * hs];
        if (e.kind === 'prick') append(h, ear(sx, earBone(sx), [Math.abs(at[0]), at[1], at[2]], m(e.len), m(e.wd), 0.28, lod, { back: 0.05 }));
        else if (e.kind === 'drop') append(h, flap(sx, earBone(sx), [at[0], at[1], at[2]], m(e.len), m(e.wd), lod, { sweep: 0.5 }));
        else if (e.kind === 'fold') append(h, flap(sx, earBone(sx), [at[0], at[1], at[2]], m(e.len), m(e.wd), lod, { fold: true, sweep: 0.5 }));
        else {
          // semi-erect: stands, the tip tipped forward
          const col: V3 = [1, 1, 1], pts: Array<[number, number, number, number]> = [[0.0, 0, 0, 0.3], [0.012, 0.4, -0.01, 0.9], [0.03, 0.75, 0.02, 1], [0.042, 0.95, 0.07, 0.6], [0.046, 0.85, 0.12, 0.15]];
          append(h, tube(pts.map(([dx, dy, dz, w], i) => ({ p: [at[0] + sx * dx * k, at[1] + dy * m(e.len), at[2] + dz * m(e.len)] as V3, w: m(e.wd) * w, h: 0.004, skin: i === 0 ? sk(BONE.HEAD, earBone(sx), 0.35) : sk(earBone(sx)), coat: 1, region: REGION.EAR, col })), { seg: 6, sub: 1, up: [0, 0, 1], flat: true, capEnd: true }));
        }
      }
    },
    tail: lod => {
      const t = o.tail, len = (t.len ?? 0.4) * k, th = (t.thick ?? 1) * k;
      const R = (p: V3, r: number, region: number): Ring => ({ p, w: r, h: r, skin: sk(BONE.TAIL, BONE.TAIL2, 0.7), coat: 1, region, col: [1, 1, 1] });
      const r0 = tailRoot, pts: Array<[V3, number]> = [];
      const bush = t.kind === 'bush' || t.kind === 'plume' || t.kind === 'sabre';
      const dirs: Record<string, Array<[number, number]>> = {
        bush: [[0, 0], [-0.25, -0.35], [-0.35, -0.72], [-0.3, -1]], sabre: [[0, 0], [-0.4, -0.3], [-0.75, -0.55], [-1, -0.7]], plume: [[0, 0], [-0.35, 0.18], [-0.65, 0.45], [-0.6, 0.8]],
        otter: [[0, 0], [-0.3, -0.2], [-0.62, -0.42], [-0.95, -0.5]], long: [[0, 0], [-0.1, -0.28], [-0.3, -0.58], [-0.65, -0.7], [-0.95, -0.52]], curl: [[0, 0], [-0.2, 0.3], [-0.1, 0.65], [0.15, 0.85]], ring: [[0, 0], [-0.3, 0.3], [-0.2, 0.7], [0.15, 0.7]],
      };
      const prof = bush ? [0.5, 1.0, 0.95, 0.55] : t.kind === 'otter' ? [1, 1, 0.75, 0.3] : t.kind === 'long' ? [0.9, 0.85, 0.8, 0.72, 0.5] : [0.6, 0.62, 0.5, 0.2];
      dirs[t.kind].forEach(([dz, dy], i) => pts.push([[0, r0[1] + dy * len, r0[2] + dz * len], th * 0.055 * prof[i]]));
      const main = tube(pts.map(([p, r], i) => R(p, r, i === pts.length - 1 && o.tipAcc ? REGION.ACC3 : REGION.TAIL)), { seg: Math.max(6, lod.seg - 4), sub: lod.sub, up: [1, 0, 0], capEnd: true, flat: true });
      return main;
    },
    extras: (out, lod) => {
      // the ruff of fur at the throat and shoulders, the chest
      if (o.ruff && lod.detail < 2) out.push(blob([0, Y(0.64 + sl), Z(0.42)], [o.ruff * 0.085 * k * wd, o.ruff * 0.12 * k, o.ruff * 0.1 * k], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: o.collar ? REGION.ACC1 : REGION.BODY, skin: sk(BONE.ROOT, BONE.NECK, 0.5), flat: true }));
      if (lod.detail < 2) out.push(blob([0, Y(0.55), Z(0.42)], [0.06 * k * wd, 0.08 * k * ch, 0.08 * k], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.ACC1, skin: sk(BONE.ROOT), flat: true }));                // the pale chest
    },
    bones: (() => {
      const pv = (rows: LimbRow[], idx: number[], x: number): V3[] => idx.map(i => c3(x, rows[i][0], rows[i][1]));
      const b = quadBones(
        { fore: pv(fl, [1, 2, 4, 5], fx) as [V3, V3, V3, V3], hind: pv(hl, [1, 3, 5, 7], hx) as [V3, V3, V3, V3], swing: [0.45, 0.42], flexF: [0, 0.3, -0.5, 0.25], flexH: [0, -0.35, 0.6, -0.25], foot: -0.15 },
        { neck: c3(0, Y(0.74 + sl), Z(0.4)), head: headAt, tail: tailRoot, tailBob: 0.08, earAt: headPoint(headAt, HP, c3(0.034 * k * sw, 0.052 * k, -0.035 * k)), rootY: Y(0.6), earFlick: 0.4, tailLen: 0.1 * k,
          graze: o.pets ? { neck: -0.35, head: -0.3, bob: 0.06 } : { neck: -1.45, head: 0.2, bob: 0.06 }, alert: { neck: 0.3, head: 0.18, ear: 0.0, tail: -0.5 }, gallop: false, trot: true, wag: [0.55, 10] });
      if (o.pets) dogPose(b, k);
      return b;
    })(),
    breeds: o.breeds, withers: o.withers, length: o.length, stride: o.stride, graze: { neck: -1.45, head: 0.2 },
    root: { bob: 0.01 * k, pitch: 0.03, cy: Y(0.6), cz: o.pets ? Z(-0.3) : 0, grazePitch: o.pets ? 0.55 : -0.12 }, rootPose: { alertPitch: 0.04, lieDrop: 0.3 * k, sitDrop: o.pets ? 0.2 * k : 0 }, extra: true,
  };
}
export { canid, flap };
export type { Canid };

const cb = (name: string, o: Partial<Breed> & { base: V3 }): Breed => ({ name, style: 0, fur: 0.6, furFreq: 55, nose: c3(0.04, 0.035, 0.035), acc1Mix: 0.9, acc2Mix: 0.9, acc3Mix: 0.9, ...o });

/** A pet sits (`graze`: the haunches fold, the front stays upright), lies (`lie`: elbows and hocks down) and looks up (`alert`). Wildlife leaves these at zero. */
function dogPose(b: Array<import('../../livestock/animalMaterial').BoneAnim | undefined>, k: number): void {
  void k;
  const set = (i: number, f: Partial<import('../../livestock/animalMaterial').BoneAnim>) => { if (b[i]) Object.assign(b[i]!, f); };
  for (const [hb, fb] of [[BONE.HL, BONE.FL], [BONE.HR, BONE.FR]] as const) {
    set(hb, { graze: 1.2, lie: 1.15 }); set(hb + 1, { graze: -2.0, lie: -2.0 }); set(hb + 2, { graze: 1.2, lie: 1.35 }); set(hb + 3, { graze: 0.1, lie: 0.1 });
    set(fb, { graze: -0.55, lie: -0.95 }); set(fb + 1, { lie: 1.95 }); set(fb + 2, { lie: -0.5 }); set(fb + 3, { lie: 0.25 });
  }
  set(BONE.NECK, { graze: -0.35, lie: -0.1 }); set(BONE.HEAD, { lie: 0.1 });
  if (b[BONE.TAIL]) { b[BONE.TAIL]!.graze = 0.2; b[BONE.TAIL]!.lie = 0.3; }
}

// ---------------------------------------------------------------- wolf and coyote
const WOLF = canid({
  id: 'wolf', k: 1, chest: 0.95, legK: 1.1, muzzle: 0.95, skullW: 1.25, ear: { kind: 'prick', len: 0.085, wd: 0.05 }, tail: { kind: 'bush', len: 0.42, thick: 1.15 }, ruff: 1, tipAcc: true, paws: 1.15,
  withers: 0.8, length: 1.15, stride: 1.5,
  breeds: [
    cb('Gray wolf', { base: c3(0.46, 0.43, 0.38), style: 7, dorsal: 0.62, patch: c3(0.2, 0.18, 0.16), cover: 0.5, belt: [0.0, 0.3], face: c3(0.5, 0.46, 0.4), faceMix: 0.5, leg: c3(0.5, 0.42, 0.32), legMix: 0.35, belly: c3(0.75, 0.72, 0.66), bellyMix: 0.8, bellyY: 0.5, acc1: c3(0.72, 0.68, 0.6), acc1Mix: 0.8, acc3: c3(0.08, 0.07, 0.07), fur: 1.0, furFreq: 45 }),
    cb('Timber wolf', { base: c3(0.4, 0.34, 0.27), style: 7, dorsal: 0.62, patch: c3(0.17, 0.14, 0.11), cover: 0.55, belt: [0.0, 0.3], face: c3(0.45, 0.38, 0.3), faceMix: 0.5, leg: c3(0.46, 0.36, 0.26), legMix: 0.35, belly: c3(0.7, 0.64, 0.55), bellyMix: 0.8, bellyY: 0.5, acc1: c3(0.66, 0.6, 0.5), acc1Mix: 0.8, acc3: c3(0.08, 0.07, 0.06), fur: 1.0, furFreq: 45 }),
    cb('Black wolf', { base: c3(0.1, 0.095, 0.09), face: c3(0.1, 0.095, 0.09), faceMix: 0.3, belly: c3(0.14, 0.13, 0.12), bellyMix: 0.3, bellyY: 0.5, acc1: c3(0.2, 0.18, 0.16), acc1Mix: 0.6, acc3: c3(0.05, 0.05, 0.05), fur: 1.0, furFreq: 45 }),
    cb('White wolf', { base: c3(0.78, 0.76, 0.72), face: c3(0.8, 0.78, 0.74), faceMix: 0.3, belly: c3(0.85, 0.83, 0.8), bellyMix: 0.5, bellyY: 0.5, acc1: c3(0.82, 0.8, 0.76), acc1Mix: 0.8, acc3: c3(0.4, 0.38, 0.35), fur: 1.0, furFreq: 45, size: 0.97 }),
  ],
});
export const WOLF_MODEL = (): AnimalModel => quadModel(WOLF);

const COY = canid({
  id: 'coyote', k: 0.76, chest: 0.9, legK: 1.04, muzzle: 1.0, skullW: 1.1, ear: { kind: 'prick', len: 0.1, wd: 0.05 }, tail: { kind: 'bush', len: 0.5, thick: 0.95 }, ruff: 0.8, tipAcc: true, paws: 0.9,
  withers: 0.62, length: 0.9, stride: 1.2,
  breeds: [
    cb('Coyote', { base: c3(0.58, 0.46, 0.32), style: 7, dorsal: 0.45, patch: c3(0.3, 0.24, 0.18), cover: 0.45, belt: [0.0, 0.3], face: c3(0.62, 0.48, 0.32), faceMix: 0.5, leg: c3(0.62, 0.4, 0.22), legMix: 0.75, belly: c3(0.88, 0.84, 0.76), bellyMix: 0.9, bellyY: 0.5, acc1: c3(0.9, 0.87, 0.8), acc1Mix: 0.85, acc3: c3(0.07, 0.06, 0.06), fur: 1.0, furFreq: 50 }),
    cb('Coyote (gray)', { base: c3(0.5, 0.45, 0.38), style: 7, dorsal: 0.45, patch: c3(0.24, 0.21, 0.18), cover: 0.45, belt: [0.0, 0.3], face: c3(0.55, 0.45, 0.34), faceMix: 0.5, leg: c3(0.55, 0.4, 0.26), legMix: 0.7, belly: c3(0.84, 0.8, 0.72), bellyMix: 0.9, bellyY: 0.5, acc1: c3(0.88, 0.85, 0.78), acc1Mix: 0.85, acc3: c3(0.07, 0.06, 0.06), fur: 1.0, furFreq: 50, size: 0.97 }),
    cb('Coyote (winter)', { base: c3(0.55, 0.5, 0.42), style: 8, patch: c3(0.3, 0.27, 0.22), cover: 0.4, scale: 12, face: c3(0.6, 0.52, 0.4), faceMix: 0.5, leg: c3(0.55, 0.42, 0.3), legMix: 0.6, belly: c3(0.86, 0.83, 0.76), bellyMix: 0.9, bellyY: 0.5, acc1: c3(0.9, 0.87, 0.8), acc1Mix: 0.85, acc3: c3(0.07, 0.06, 0.06), fur: 1.2, furFreq: 45, size: 1.03 }),
  ],
});
export const COYOTE_MODEL = (): AnimalModel => quadModel(COY);

// ---------------------------------------------------------------- cougar
const CAT = canid({
  id: 'cougar', k: 0.9, chest: 0.9, legK: 0.78, stretch: 1.12, muzzle: 0.6, skullW: 1.2, head: 1.25, neckK: 1.2, width: 1.1, limbW: 1.75,
  ear: { kind: 'prick', len: 0.045, wd: 0.04 }, tail: { kind: 'long', len: 0.55, thick: 0.95 }, tipAcc: true, paws: 1.2, collar: false,
  withers: 0.72, length: 1.25, stride: 1.4,
  breeds: [
    cb('Cougar', { base: c3(0.62, 0.45, 0.28), face: c3(0.6, 0.44, 0.28), faceMix: 0.4, leg: c3(0.58, 0.42, 0.26), legMix: 0.5, belly: c3(0.88, 0.8, 0.66), bellyMix: 0.9, bellyY: 0.42, acc1: c3(0.9, 0.84, 0.72), acc1Mix: 0.9, acc3: c3(0.07, 0.06, 0.05), fur: 0.5, furFreq: 70 }),
    cb('Cougar (tawny)', { base: c3(0.55, 0.41, 0.29), face: c3(0.52, 0.4, 0.28), faceMix: 0.4, leg: c3(0.5, 0.38, 0.26), legMix: 0.5, belly: c3(0.84, 0.77, 0.64), bellyMix: 0.9, bellyY: 0.42, acc1: c3(0.88, 0.82, 0.7), acc1Mix: 0.9, acc3: c3(0.08, 0.07, 0.06), fur: 0.5, furFreq: 70, size: 0.96 }),
  ],
});
export const COUGAR_MODEL = (): AnimalModel => quadModel(CAT);

// ---------------------------------------------------------------- black bear
const BR_FORE = (b: number): LimbRow[] => [
  [0.8, 0.38, 0.08, 0.11, sk(b)], [0.62, 0.36, 0.105, 0.14, sk(b, b + 1, 0.2)], [0.42, 0.3, 0.1, 0.12, sk(b + 1)], [0.26, 0.34, 0.085, 0.1, sk(b + 1)],
  [0.12, 0.37, 0.075, 0.09, sk(b + 1, b + 2, 0.5)], [0.05, 0.385, 0.075, 0.09, sk(b + 3)],
];
const BR_HIND = (b: number): LimbRow[] => [
  [0.8, -0.36, 0.09, 0.14, sk(b)], [0.66, -0.34, 0.115, 0.17, sk(b)], [0.5, -0.25, 0.105, 0.14, sk(b, b + 1, 0.4)], [0.38, -0.2, 0.095, 0.115, sk(b + 1)],
  [0.24, -0.3, 0.08, 0.095, sk(b + 1, b + 2, 0.5)], [0.12, -0.37, 0.072, 0.085, sk(b + 2)], [0.05, -0.36, 0.072, 0.088, sk(b + 3)],
];
const brBreed = (name: string, o: Partial<Breed> & { base: V3 }): Breed => ({ name, style: 0, fur: 1.4, furFreq: 38, nose: c3(0.04, 0.035, 0.035), acc1Mix: 0.95, acc2Mix: 0, acc3Mix: 0, ...o });
const BH = c3(0, 0.82, 0.68);
const BEAR: Quad = {
  id: 'bear',
  body: [[0.55, 0.74, 0.42, 0.12, 2.2], [0.38, 1.1, 0.34, 0.2, 2.2], [0.1, 1.0, 0.3, 0.23, 2.2], [-0.2, 0.88, 0.3, 0.225, 2.2], [-0.42, 0.88, 0.34, 0.2, 2.2], [-0.56, 0.76, 0.4, 0.13, 2.0]],
  neck: [{ y: 0.82, z: 0.42, w: 0.2, h: 0.24, dn: 0.22 }, { y: 0.85, z: 0.56, w: 0.17, h: 0.19, dn: 0.18 }, { y: 0.82, z: 0.66, w: 0.14, h: 0.15, dn: 0.14 }],
  head: [[-0.07, 0, 0.1, 0.105, 0.11], [0.02, 0, 0.11, 0.112, 0.118], [0.08, -0.01, 0.095, 0.095, 0.1], [0.13, -0.035, 0.08, 0.075, 0.075], [0.17, -0.05, 0.075, 0.068, 0.06]],
  headAt: BH, headPitch: -0.25, eye: [0.066, 0.04, 0.085, 0.0095],
  fore: BR_FORE, hind: BR_HIND, foreX: 0.13, hindX: 0.13, coatFrom: 3,
  foot: (sx, b, hind, lod) => [paw(sx * (hind ? 0.15 : 0.14), hind ? -0.37 : 0.37, { r: 0.058, len: hind ? 0.27 : 0.21, toes: 5, skin: sk(b), claw: 0.035, coat: 1, region: REGION.LEG, clawCol: [0.12, 0.1, 0.09] }, lod)],
  headExtras: (h, lod) => {
    append(h, blob([0, -0.045, 0.125], [0.08, 0.065, 0.06], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.ACC1, skin: sk(BONE.HEAD), flat: true }));      // the pale muzzle
    append(h, blob([0, -0.05, 0.172], [0.04, 0.03, 0.02], { seg: lod.seg, rings: 4, col: [0.04, 0.035, 0.035], region: REGION.NOSE, skin: sk(BONE.HEAD), flat: true }));
    append(h, nostrils([0, -0.05, 0.188], 0.015, 0.007, sk(BONE.HEAD), lod));
    for (const sx of [-1, 1]) append(h, ear(sx, sx > 0 ? BONE.EAR_L : BONE.EAR_R, [sx * 0.075, 0.098, -0.04], 0.062, 0.05, 0.5, lod, { back: 0.05 }));
  },
  tail: lod => strand([[0, 0.8, -0.56, 0.035], [0, 0.76, -0.6, 0.03], [0, 0.72, -0.62, 0.012]], sk(BONE.TAIL, BONE.TAIL2, 0.5), lod, { region: REGION.TAIL, up: [1, 0, 0] }),
  extras: (out, lod) => {
    if (lod.detail < 2) out.push(blob([0, 0.62, 0.52], [0.13, 0.17, 0.1], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.ACC2, skin: sk(BONE.ROOT), flat: true }));      // the chest blaze (white on some)
  },
  bones: quadBones(
    { fore: [[0.14, 0.6, 0.36], [0.14, 0.42, 0.3], [0.14, 0.12, 0.37], [0.14, 0.05, 0.385]], hind: [[0.15, 0.66, -0.34], [0.15, 0.38, -0.2], [0.15, 0.12, -0.37], [0.15, 0.05, -0.36]],
      swing: [0.3, 0.3], flexF: [0, 0.2, -0.3, 0.1], flexH: [0, -0.3, 0.4, -0.1], foot: -0.1 },
    { neck: c3(0, 0.84, 0.46), head: BH, tail: c3(0, 0.8, -0.56), tailBob: 0.05, earAt: headPoint(BH, -0.25, c3(0.07, 0.095, -0.04)), rootY: 0.68, earFlick: 0.25, tailLen: 0.05,
      graze: { neck: -1.3, head: 0.15, bob: 0.06 }, alert: { neck: 0.25, head: 0.2, ear: 0.0, tail: -0.3 }, gallop: true }),
  breeds: [
    brBreed('Black bear', { base: c3(0.045, 0.04, 0.038), face: c3(0.05, 0.045, 0.04), faceMix: 0.4, acc1: c3(0.45, 0.33, 0.22), acc2: c3(0.045, 0.04, 0.038) }),
    brBreed('Black bear (blaze)', { base: c3(0.06, 0.052, 0.048), face: c3(0.06, 0.05, 0.045), faceMix: 0.4, acc1: c3(0.5, 0.38, 0.26), acc2: c3(0.8, 0.78, 0.72), acc2Mix: 0.95 }),
    brBreed('Cinnamon bear', { base: c3(0.34, 0.15, 0.06), face: c3(0.3, 0.13, 0.05), faceMix: 0.4, leg: c3(0.26, 0.11, 0.045), legMix: 0.5, acc1: c3(0.55, 0.36, 0.2), acc2: c3(0.34, 0.15, 0.06) }),
    brBreed('Brown bear', { base: c3(0.14, 0.08, 0.05), face: c3(0.13, 0.075, 0.05), faceMix: 0.4, acc1: c3(0.4, 0.28, 0.18), acc2: c3(0.14, 0.08, 0.05), size: 0.97 }),
  ],
  withers: 1.0, length: 1.3, stride: 1.0, graze: { neck: -1.3, head: 0.15 }, root: { bob: 0.012, pitch: 0.025, cy: 0.68, grazePitch: -0.15 }, rootPose: { alertPitch: 0.03 }, extra: true,
};
export const BEAR_MODEL = (): AnimalModel => quadModel(BEAR);
