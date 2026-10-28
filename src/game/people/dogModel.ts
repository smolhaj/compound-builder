/**
 * The dog's body as rounded blobs (ellipsoids) and tapered bones (limbs, neck,
 * tail), posed from a few key parameters (pure geometry; no GL). Real dog
 * proportions at SCALE v2: shoulder height 0.13 (about 0.46 of a 0.28 person),
 * body 1.5 x that long, a deep barrel chest tapering to a tucked waist, a
 * wedge head with a distinct muzzle, nose, eyes and breed ears, legs with
 * elbow / knee / hock bends and paws, a thick tail with a curve, a two-tone
 * coat (saddle, belly, chest, muzzle, socks) by breed.
 *
 * Poses: stand, sit, lie (blended by weights), a diagonal trot on top of a
 * stand, alert (head up), idle breathing, an ear flick and a tail that wags.
 * Everything is in "dog space": x right, y up, z forward (the nose), metres
 * of the game's world units; the renderer places it with one matrix.
 */
import type { Breed } from '../../sim/pets';
import { COATS } from '../../sim/pets';

export type V3 = [number, number, number];
export interface Blob { c: V3; r: V3; rot: V3; col: number }
export interface Bone { a: V3; b: V3; r: number; col: number }
export interface DogShape { blobs: Blob[]; bones: Bone[] }

type V2 = [number, number];      // [y, z]: the dog's side view

// ── colors ──
const mix = (a: number, b: number, t: number): number => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};
const lum = (c: number) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
const lighten = (c: number, t: number) => mix(c, 0xfff4e0, t);
const darken = (c: number, t: number) => mix(c, 0x0c0806, t);

export type EarKind = 'prick' | 'drop' | 'fold';
export interface Look {
  main: number; light: number; dark: number; nose: number; eye: number;
  ear: EarKind; earLen: number;
  size: number;            // overall
  chest: number;           // barrel depth
  width: number;           // body / head breadth
  muzzle: number;          // muzzle length
  head: number;            // head size
  tail: 'otter' | 'sabre' | 'plume' | 'curl';
  saddle: boolean; mask: boolean; socks: boolean; blaze: boolean; ruff: boolean; tip: boolean; patch: boolean;
}

/** What a breed and coat look like. */
export function lookOf(breed: Breed, tone: number): Look {
  const c = COATS[breed][tone % 3];
  const base: Look = {
    main: c.body, light: lighten(c.body, 0.35), dark: darken(c.body, 0.35), nose: 0x15110f, eye: 0x1a1008, ear: 'drop', earLen: 1, size: 1, chest: 1, width: 1, muzzle: 1, head: 1, tail: 'otter',
    saddle: false, mask: false, socks: false, blaze: false, ruff: false, tip: false, patch: false,
  };
  switch (breed) {
    case 'lab': return { ...base, light: lighten(c.body, 0.18), dark: darken(c.body, 0.22), ear: 'drop', earLen: 0.95, size: 1.05, chest: 1.05, width: 1.14, muzzle: 0.9, head: 1.08, tail: 'otter' };
    case 'shepherd': {
      const tanFirst = lum(c.body) > lum(c.trim);
      return { ...base, main: tanFirst ? c.body : c.trim, dark: tanFirst ? c.trim : c.body, light: lighten(tanFirst ? c.body : c.trim, 0.3), ear: 'prick', earLen: 1.25, size: 1.07, chest: 1.1, muzzle: 1.05, tail: 'sabre', saddle: true, mask: true };
    }
    case 'hound': return { ...base, main: c.body, light: c.trim, dark: darken(c.body, 0.4), ear: 'drop', earLen: 1.55, size: 1.0, chest: 1.12, width: 0.92, muzzle: 1.08, tail: 'plume', socks: true, tip: true, blaze: true, patch: false };
    case 'collie': return { ...base, main: c.body, light: c.trim, dark: darken(c.body, 0.3), ear: 'prick', earLen: 1.0, size: 0.98, chest: 0.98, width: 0.9, muzzle: 1.22, head: 0.96, tail: 'plume', socks: true, ruff: true, blaze: true, tip: true };
    case 'terrier': return { ...base, main: c.body, light: c.trim, dark: darken(c.body, 0.3), ear: 'fold', earLen: 0.9, size: 0.78, chest: 0.95, width: 0.92, muzzle: 0.92, head: 1.0, tail: 'curl', socks: true };
    case 'mutt': return { ...base, main: c.body, light: c.trim, dark: darken(c.body, 0.4), ear: 'fold', earLen: 1.15, size: 0.94, tail: 'curl', socks: true, patch: true };
  }
}

// ── pose key frames (side view [y, z]) ──
interface Key { S: V2; R: V2; head: V2; hp: number; ff: V2; hf: V2; fx: number; hx: number; ho: V2 }
const STAND: Key = { S: [0.104, 0.05], R: [0.104, -0.07], head: [0.14, 0.118], hp: 0.1, ff: [0.0055, 0.034], hf: [0.0055, -0.078], fx: 0.02, hx: 0.023, ho: [0.024, -0.008] };
const SIT: Key = { S: [0.108, 0.03], R: [0.04, -0.082], head: [0.164, 0.074], hp: 0.05, ff: [0.0055, 0.024], hf: [0.0055, -0.03], fx: 0.02, hx: 0.036, ho: [0.006, -0.034] };
const LIE: Key = { S: [0.07, 0.06], R: [0.04, -0.066], head: [0.1, 0.122], hp: 0.24, ff: [0.0055, 0.15], hf: [0.0055, -0.05], fx: 0.022, hx: 0.03, ho: [0.006, -0.026] };

export interface PoseState {
  /** 0..1 weights (lie wins over sit). */
  lie: number; sit: number; up: number;
  /** Trotting: gait phase (rad) and stride (0 = standing). */
  phase: number; moving: boolean;
  /** Seconds, for breathing / ear flick / wag. */
  t: number;
  /** Tail: 1 happy wag, 0 low. */
  happy: number;
  /** Head bob when barking (rad). */
  bark: number;
  /** A per-dog seed 0..1. */
  seed: number;
}

const rotX = (y: number, z: number, a: number): V2 => [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];

/** Two-bone IK in the side view: where the middle joint goes. `fwd` true: it bends toward +z (knees), false toward -z (elbows). */
function ik(p0: V2, t: V2, l1: number, l2: number, fwd: boolean): V2 {
  const dy = t[0] - p0[0], dz = t[1] - p0[1];
  let d = Math.hypot(dy, dz) || 1e-6;
  const dmax = l1 + l2 - 1e-4, dmin = Math.abs(l1 - l2) + 1e-4;
  d = Math.max(dmin, Math.min(dmax, d));
  const uy = dy / (Math.hypot(dy, dz) || 1e-6), uz = dz / (Math.hypot(dy, dz) || 1e-6);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const c1: V2 = [p0[0] + uy * a - uz * h, p0[1] + uz * a + uy * h], c2: V2 = [p0[0] + uy * a + uz * h, p0[1] + uz * a - uy * h];
  return fwd ? (c1[1] > c2[1] ? c1 : c2) : (c1[1] < c2[1] ? c1 : c2);
}

const L = { arm: 0.04, fore: 0.044, thigh: 0.04, shin: 0.042, meta: 0.036 };

/** The dog, posed. */
export function dogShape(look: Look, s: PoseState): DogShape {
  const blobs: Blob[] = [], bones: Bone[] = [];
  const blob = (c: V3, r: V3, col: number, rot: V3 = [0, 0, 0]) => blobs.push({ c, r, rot, col });
  const bone = (a: V3, b: V3, r: number, col: number) => bones.push({ a, b, r, col });
  const lieW = s.lie, sitW = s.sit * (1 - s.lie);
  const k = (f: (x: Key) => number): number => f(STAND) + (f(SIT) - f(STAND)) * sitW + (f(LIE) - f(STAND)) * lieW;
  const k2 = (f: (x: Key) => V2): V2 => [k(x => f(x)[0]), k(x => f(x)[1])];
  let S = k2(x => x.S), R = k2(x => x.R);
  const alert = s.up * (1 - lieW);
  const bob = s.moving ? Math.abs(Math.sin(s.phase)) * 0.004 : 0;
  S = [S[0] + bob + 0.003 * alert, S[1]]; R = [R[0] + bob * 0.8, R[1]];
  let head = k2(x => x.head), hp = k(x => x.hp);
  head = [head[0] + 0.014 * alert, head[1] + 0.004 * alert]; hp = hp - 0.14 * alert + s.bark * 0.8 + (s.moving ? Math.sin(s.phase * 2) * 0.03 : 0);
  const breath = 1 + 0.022 * Math.sin(s.t * 2.3 + s.seed * 6);
  // torso axis
  const ay = S[0] - R[0], az = S[1] - R[1], len = Math.hypot(ay, az), u: V2 = [ay / len, az / len], n: V2 = [u[1], -u[0]];
  const th = Math.atan2(u[0], u[1]);
  const P = (sd: number, t: number): V2 => [R[0] + u[0] * sd + n[0] * t, R[1] + u[1] * sd + n[1] * t];
  const v3 = (x: number, p: V2): V3 => [x, p[0], p[1]];
  const W = look.width, C = look.chest;
  const torsoRot: V3 = [-th, 0, 0];
  // barrel chest, tucked waist, rump; coat marks on top
  blob(v3(0, P(len - 0.004, -0.004)), [0.03 * W, 0.034 * C * breath, 0.056], look.main, torsoRot);
  blob(v3(0, P(len * 0.5, 0.001)), [0.027 * W, 0.03, 0.062], look.main, torsoRot);
  blob(v3(0, P(0.008, 0.0)), [0.028 * W, 0.032, 0.046], look.main, torsoRot);
  blob(v3(0, P(len * 0.55, 0.021)), [0.0205 * W, 0.012, 0.066], look.saddle ? look.dark : mix(look.main, look.dark, 0.18), torsoRot);   // saddle / back
  blob(v3(0, P(len * 0.5, -0.026)), [0.019 * W, 0.009, 0.058], look.light, torsoRot);                                                      // belly
  blob(v3(0, P(len + 0.028, -0.012)), [0.021 * W, 0.024, 0.022], look.light, torsoRot);                                                       // chest
  if (look.ruff) blob(v3(0, P(len + 0.004, -0.004)), [0.032, 0.036, 0.034], look.light, torsoRot);                                              // a collie's ruff
  if (look.patch) blob([0.019 * W, ...P(len * 0.35, 0.012)] as V3, [0.006, 0.02, 0.04], look.dark, torsoRot);                               // a patch on the flank
  // neck, head, muzzle, nose, eyes, ears
  const hv: V2 = rotX(1, 0, hp) as V2;   // (head's up axis in side view)
  void hv;
  const fwdH = (a: number, b: number): V2 => { const r = rotX(a, b, hp); return [head[0] + r[0], head[1] + r[1]]; };
  const neckA = P(len - 0.002, 0.014), neckB = fwdH(-0.006, -0.012);
  bone(v3(0, neckA), v3(0, neckB), 0.0265 * W, look.main);
  const H = look.head;
  blob(v3(0, head), [0.0205 * W * H, 0.0205 * H, 0.0245 * H], look.main, [hp, 0, 0]);                       // skull
  const mz = look.muzzle, mc = fwdH(-0.0075 * H, 0.03 * H * (0.9 + 0.1 * mz));
  blob(v3(0, mc), [0.0112 * W * H, 0.0102 * H, 0.0235 * H * mz], look.mask ? look.dark : look.light, [hp, 0, 0]);   // muzzle
  const nc = fwdH(-0.005 * H, (0.03 + 0.023 * mz) * H);
  blob(v3(0, nc), [0.0075 * H, 0.0062 * H, 0.0058 * H], look.nose, [hp, 0, 0]);                              // nose
  if (look.blaze) { const bc = fwdH(0.008 * H, 0.014 * H); blob(v3(0, bc), [0.0052 * H, 0.012 * H, 0.016 * H], look.light, [hp, 0, 0]); }
  for (const sd of [-1, 1]) {
    const ec = fwdH(0.007 * H, 0.012 * H);
    blob([sd * 0.0112 * W * H, ec[0], ec[1]], [0.0036, 0.0036, 0.0036], look.eye, [hp, 0, 0]);                  // eyes
    const flick = Math.pow(Math.max(0, Math.sin(s.t * 0.7 + s.seed * 31 + (sd > 0 ? 1.7 : 0))), 24) * 0.5;
    if (look.ear === 'prick' || look.ear === 'fold') {
      const ecn = fwdH(0.017 * H, -0.006 * H);
      const h = 0.0185 * look.earLen;
      blob([sd * 0.0125 * W * H, ecn[0] + h * 0.35, ecn[1]], [0.0072, h, 0.0052], look.ear === 'fold' ? mix(look.main, look.dark, 0.3) : (look.mask ? look.dark : mix(look.main, look.dark, 0.5)), [hp - 0.1 - flick, 0, -sd * (0.16 + (look.ear === 'fold' ? 0.5 : 0))]);
    } else {
      const ecn = fwdH(0.006 * H, -0.007 * H), h = 0.0175 * look.earLen;
      blob([sd * 0.0205 * W * H, ecn[0] - h * 0.55, ecn[1]], [0.0042, h, 0.0115], mix(look.main, look.dark, 0.55), [hp, 0, sd * (0.28 - flick)]);
    }
  }
  // tail: three bones that curl by breed; wags sideways when happy
  const root = P(-0.03, 0.022);
  const wag = Math.sin(s.t * (s.happy > 0.5 ? 11 : 3) + s.seed * 5) * (s.happy > 0.5 ? 0.55 : 0.12) * (0.3 + s.happy);
  const TA: Record<Look['tail'], { elev: number; curl: number; r: number; seg: number }> = {
    otter: { elev: -0.25, curl: 0.06, r: 0.0125, seg: 0.027 }, sabre: { elev: -0.5, curl: 0.22, r: 0.012, seg: 0.03 }, plume: { elev: 0.35, curl: 0.38, r: 0.011, seg: 0.03 }, curl: { elev: 0.75, curl: 0.55, r: 0.0085, seg: 0.024 },
  };
  const ta = TA[look.tail];
  let elev = ta.elev + 0.25 * s.happy * (look.tail === 'sabre' || look.tail === 'otter' ? 1 : 0.4) - 0.7 * (s.happy === 0 ? 1 : 0) - 0.5 * lieW + 0.25 * alert + (s.moving ? 0.25 : 0);
  let pos: V3 = [0, root[0], root[1]];
  let yaw = wag;
  const tipCol = (i: number) => (look.tip && i === 2 ? look.light : i === 0 ? look.main : look.main);
  for (let i = 0; i < 3; i++) {
    const dir: V3 = [Math.sin(yaw), Math.sin(elev), -Math.cos(elev) * Math.cos(yaw)];
    const nxt: V3 = [pos[0] + dir[0] * ta.seg, pos[1] + dir[1] * ta.seg, pos[2] + dir[2] * ta.seg];
    bone(pos, nxt, ta.r * (1 - i * 0.2) * (look.tail === 'plume' || look.tail === 'sabre' ? 1.25 : 1), tipCol(i));
    if (i < 2) blob(nxt, [ta.r * (0.95 - i * 0.2) * 1.0, ta.r * (0.95 - i * 0.2), ta.r * (0.95 - i * 0.2)], tipCol(i));
    pos = nxt; elev += ta.curl; yaw *= 0.7;
  }
  // legs: shoulder / hip, elbow / knee, wrist / hock, paw
  const fx = k(x => x.fx), hx = k(x => x.hx), ho = k2(x => x.ho);
  const ff = k2(x => x.ff), hf = k2(x => x.hf);
  const LEGS: Array<{ side: number; front: boolean; par: number }> = [
    { side: -1, front: true, par: 0 }, { side: 1, front: true, par: 1 }, { side: -1, front: false, par: 1 }, { side: 1, front: false, par: 0 },
  ];
  const A = 0.046;
  for (const lg of LEGS) {
    const ph = s.phase + lg.par * Math.PI;
    const stride = s.moving ? A * Math.cos(ph) : 0, lift = s.moving ? Math.max(0, Math.sin(ph)) * 0.028 : 0;
    const x = lg.side * (lg.front ? fx : hx);
    const foot: V2 = lg.front ? [ff[0] + lift, ff[1] + stride] : [hf[0] + lift, hf[1] + stride];
    // lying hind legs fold to the side: pull them out in x
    const col = look.socks ? look.light : look.main;
    if (lg.front) {
      const sh = P(len - 0.018, -0.008), root2: V2 = [sh[0], sh[1]];
      const wrist: V2 = [foot[0] + 0.012, foot[1] - 0.002];
      const el = ik(root2, wrist, L.arm, L.fore, false);
      blob([lg.side * 0.0225 * W, root2[0], root2[1]], [0.0175, 0.025, 0.03], look.main, torsoRot);              // shoulder muscle
      bone([lg.side * 0.0225 * W, root2[0], root2[1]], [x, el[0], el[1]], 0.0148, look.main);
      blob([x, el[0], el[1]], [0.0125, 0.0125, 0.0125], look.main);
      bone([x, el[0], el[1]], [x, wrist[0], wrist[1]], 0.0112, col);
      blob([x, foot[0] + 0.0005, foot[1] + 0.007], [0.0105, 0.0068, 0.0145], col);                                  // paw
    } else {
      const hp0 = P(0.004, -0.006), root2: V2 = [hp0[0], hp0[1]];
      const hock: V2 = [foot[0] + ho[0], foot[1] + ho[1]];
      const kn = ik(root2, hock, L.thigh, L.shin, true);
      blob([lg.side * 0.0225 * W, root2[0], root2[1] + 0.002], [0.026, 0.037, 0.041], look.main, torsoRot);         // thigh
      bone([lg.side * 0.0225 * W, root2[0], root2[1]], [x, kn[0], kn[1]], 0.0225, look.main);
      blob([x, kn[0], kn[1]], [0.0145, 0.0145, 0.0145], look.main);
      bone([x, kn[0], kn[1]], [x, hock[0], hock[1]], 0.0138, look.main);
      blob([x, hock[0], hock[1]], [0.0105, 0.0115, 0.0105], look.main);
      bone([x, hock[0], hock[1]], [x, foot[0] + 0.004, foot[1] + 0.001], 0.0088, col);
      blob([x, foot[0] + 0.0005, foot[1] + 0.007], [0.0105, 0.0068, 0.0145], col);                                  // paw
    }
  }
  return { blobs, bones };
}
