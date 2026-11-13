/**
 * The small game: the wild rabbit (cottontail and jackrabbit: arched back, big haunches, long ears with dark tips, a white puff of a tail, a hopping
 * gait with the fore pair and the hind pair together) and the gray squirrel (hunched, big hind feet, a bushy tail carried in an S over the back).
 * Metres, forward +z, left +x, ground y = 0, instance scale 1/6 (SCALE v2): a cottontail is 0.4 m long and 0.15 m at the shoulder; a squirrel 0.25 m
 * plus a 0.22 m tail. Built on animalQuad like the larger animals.
 */
import { BONE, REGION, append, blob, skin, type V3 } from '../../livestock/animalKit';
import type { Breed } from '../../livestock/animalMaterial';
import { nostrils, paw, strand, type AnimalModel, type LimbRow } from '../../livestock/animalParts';
import { quadBones, quadModel, type Quad } from '../../livestock/animalQuad';
import { ear, headPoint } from './hoofed';

const sk = skin;
const c3 = (a: number, b: number, c: number): V3 => [a, b, c];

// ---------------------------------------------------------------- rabbit
const RAB_FORE = (b: number): LimbRow[] => [
  [0.17, 0.12, 0.026, 0.04, sk(b)], [0.12, 0.125, 0.024, 0.032, sk(b, b + 1, 0.5)], [0.07, 0.135, 0.016, 0.02, sk(b + 1, b + 2, 0.5)], [0.03, 0.145, 0.014, 0.018, sk(b + 2)], [0.012, 0.155, 0.014, 0.022, sk(b + 3)],
];
const RAB_HIND = (b: number): LimbRow[] => [
  [0.2, -0.13, 0.04, 0.07, sk(b)], [0.15, -0.08, 0.04, 0.06, sk(b, b + 1, 0.5)], [0.1, -0.13, 0.026, 0.04, sk(b + 1)], [0.05, -0.2, 0.017, 0.03, sk(b + 1, b + 2, 0.5)], [0.03, -0.15, 0.015, 0.03, sk(b + 2)], [0.012, -0.1, 0.015, 0.025, sk(b + 3)],
];
const RH = c3(0, 0.215, 0.255), RP = -0.1;
const rb = (name: string, o: Partial<Breed> & { base: V3 }): Breed => ({ name, style: 0, fur: 0.6, furFreq: 90, nose: c3(0.2, 0.12, 0.11), acc1Mix: 0.95, acc3Mix: 0.9, ...o });
const RABBIT: Quad = {
  id: 'rabbit',
  body: [[0.21, 0.19, 0.08, 0.04, 2.1], [0.13, 0.24, 0.07, 0.07, 2.2], [0.0, 0.27, 0.07, 0.085, 2.3], [-0.12, 0.3, 0.075, 0.095, 2.3], [-0.22, 0.27, 0.09, 0.085, 2.2], [-0.28, 0.2, 0.11, 0.045, 2.0]],
  neck: [{ y: 0.19, z: 0.16, w: 0.055, h: 0.065, dn: 0.07 }, { y: 0.2, z: 0.21, w: 0.047, h: 0.052, dn: 0.052 }, { y: 0.215, z: 0.245, w: 0.04, h: 0.045, dn: 0.045 }],
  head: [[-0.02, 0, 0.04, 0.047, 0.05], [0.035, 0, 0.049, 0.054, 0.054], [0.075, -0.008, 0.042, 0.047, 0.042], [0.105, -0.018, 0.031, 0.035, 0.03], [0.122, -0.025, 0.024, 0.027, 0.022]],
  headAt: RH, headPitch: RP, eye: [0.043, 0.024, 0.052, 0.0105],
  fore: RAB_FORE, hind: RAB_HIND, foreX: 0.045, hindX: 0.08, coatFrom: 3,
  foot: (sx, b, hind, lod) => [paw(sx * (hind ? 0.08 : 0.045), hind ? -0.07 : 0.15, { r: hind ? 0.018 : 0.012, len: hind ? 0.095 : 0.045, toes: 3, skin: sk(b), coat: 1, region: REGION.LEG, claw: 0 }, lod)],
  headExtras: (h, lod) => {
    append(h, blob([0, -0.03, 0.118], [0.021, 0.017, 0.012], { seg: Math.max(6, lod.seg - 4), rings: 3, col: [1, 1, 1], coat: 1, region: REGION.NOSE, skin: sk(BONE.HEAD), flat: true }));
    append(h, nostrils([0, -0.03, 0.127], 0.006, 0.0035, sk(BONE.HEAD), lod));
    for (const sx of [-1, 1]) append(h, ear(sx, sx > 0 ? BONE.EAR_L : BONE.EAR_R, [sx * 0.025, 0.04, -0.01], 0.14, 0.042, 0.22, lod, { back: 0.12 }));
  },
  tail: lod => { void lod; return { pos: [], nor: [], col: [], skn: [], mark: [], idx: [] }; },
  extras: (out, lod) => {
    out.push(blob([0, 0.2, -0.3], [0.04, 0.04, 0.04], { seg: lod.seg, rings: 4, col: [1, 1, 1], coat: 1, region: REGION.ACC1, skin: sk(BONE.TAIL), flat: true }));       // the white scut
    if (lod.detail < 2) for (const sx of [-1, 1]) out.push(blob([sx * 0.07, 0.15, -0.13], [0.05, 0.08, 0.09], { seg: lod.seg, rings: 5, col: [1, 1, 1], coat: 1, region: REGION.BODY, skin: sk(sx > 0 ? BONE.HL : BONE.HR), flat: true }));   // the haunch
  },
  bones: (() => {
    const b = quadBones(
      { fore: [c3(0.045, 0.17, 0.12), c3(0.045, 0.12, 0.125), c3(0.045, 0.07, 0.135), c3(0.045, 0.03, 0.145)], hind: [c3(0.08, 0.2, -0.13), c3(0.08, 0.15, -0.08), c3(0.08, 0.05, -0.2), c3(0.08, 0.03, -0.15)], swing: [0.6, 0.7], flexF: [0, 0, -0.6, 0.3], flexH: [0, -0.5, 0.8, -0.3], foot: -0.2 },
      { neck: c3(0, 0.19, 0.16), head: RH, tail: c3(0, 0.2, -0.28), tailBob: 0.1, earAt: headPoint(RH, RP, c3(0.025, 0.04, -0.01)), rootY: 0.18, earFlick: 0.25, tailLen: 0.03, graze: { neck: -0.7, head: -0.05, bob: 0.25 }, alert: { neck: 0.3, head: 0.25, ear: 0.0, tail: 0 }, hop: true });
    return b;
  })(),
  breeds: [
    rb('Cottontail', { base: c3(0.4, 0.3, 0.2), style: 8, patch: c3(0.16, 0.12, 0.09), cover: 0.45, scale: 16, belly: c3(0.85, 0.8, 0.72), bellyMix: 0.85, bellyY: 0.09, face: c3(0.38, 0.28, 0.19), faceMix: 0.5, acc1: c3(0.94, 0.92, 0.88), acc3: c3(0.06, 0.05, 0.05), size: 0.92 }),
    rb('Cottontail (gray)', { base: c3(0.36, 0.33, 0.28), style: 8, patch: c3(0.15, 0.13, 0.11), cover: 0.45, scale: 16, belly: c3(0.85, 0.82, 0.76), bellyMix: 0.85, bellyY: 0.09, acc1: c3(0.94, 0.92, 0.88), acc3: c3(0.06, 0.05, 0.05), size: 0.9 }),
    rb('Jackrabbit', { base: c3(0.52, 0.4, 0.26), style: 8, patch: c3(0.18, 0.14, 0.1), cover: 0.45, scale: 16, belly: c3(0.88, 0.85, 0.78), bellyMix: 0.85, bellyY: 0.09, leg: c3(0.55, 0.42, 0.28), legMix: 0.4, acc1: c3(0.3, 0.26, 0.2), acc1Mix: 0.5, acc3: c3(0.06, 0.05, 0.05), size: 1.2 }),
    rb('Jackrabbit (pale)', { base: c3(0.6, 0.5, 0.34), style: 8, patch: c3(0.22, 0.17, 0.12), cover: 0.45, scale: 16, belly: c3(0.9, 0.87, 0.8), bellyMix: 0.85, bellyY: 0.09, acc1: c3(0.4, 0.34, 0.26), acc1Mix: 0.5, acc3: c3(0.06, 0.05, 0.05), size: 1.15 }),
  ],
  withers: 0.3, length: 0.52, stride: 0.45, graze: { neck: -0.7, head: -0.05 }, root: { bob: 0.06, pitch: 0.25, cy: 0.17, hop: true }, rootPose: { alertPitch: 0.04 }, extra: true,
};
export const RABBIT_WILD_MODEL = (): AnimalModel => quadModel(RABBIT);

// ---------------------------------------------------------------- squirrel
const SQ_FORE = (b: number): LimbRow[] => [
  [0.14, 0.09, 0.02, 0.03, sk(b)], [0.1, 0.1, 0.018, 0.025, sk(b, b + 1, 0.5)], [0.06, 0.12, 0.012, 0.016, sk(b + 1, b + 2, 0.5)], [0.025, 0.13, 0.01, 0.014, sk(b + 2)], [0.01, 0.14, 0.01, 0.016, sk(b + 3)],
];
const SQ_HIND = (b: number): LimbRow[] => [
  [0.15, -0.08, 0.03, 0.05, sk(b)], [0.11, -0.05, 0.028, 0.045, sk(b, b + 1, 0.5)], [0.07, -0.09, 0.016, 0.026, sk(b + 1)], [0.04, -0.13, 0.012, 0.02, sk(b + 1, b + 2, 0.5)], [0.02, -0.09, 0.011, 0.02, sk(b + 2)], [0.008, -0.06, 0.011, 0.02, sk(b + 3)],
];
const SH = c3(0, 0.185, 0.17), SP = -0.1;
const sb = (name: string, o: Partial<Breed> & { base: V3 }): Breed => ({ name, style: 0, fur: 0.7, furFreq: 100, nose: c3(0.2, 0.12, 0.11), acc1Mix: 0.9, acc3Mix: 0.9, ...o });
const SQUIRREL: Quad = {
  id: 'squirrel',
  body: [[0.14, 0.14, 0.06, 0.03, 2.1], [0.08, 0.17, 0.05, 0.045, 2.2], [0.0, 0.2, 0.05, 0.055, 2.3], [-0.08, 0.2, 0.055, 0.058, 2.3], [-0.15, 0.17, 0.07, 0.05, 2.2], [-0.19, 0.13, 0.08, 0.03, 2.0]],
  neck: [{ y: 0.14, z: 0.11, w: 0.035, h: 0.045, dn: 0.045 }, { y: 0.16, z: 0.145, w: 0.032, h: 0.038, dn: 0.038 }, { y: 0.175, z: 0.165, w: 0.03, h: 0.034, dn: 0.034 }],
  head: [[-0.015, 0, 0.03, 0.034, 0.035], [0.02, 0, 0.034, 0.037, 0.036], [0.05, -0.005, 0.026, 0.028, 0.026], [0.07, -0.012, 0.018, 0.02, 0.017], [0.082, -0.016, 0.014, 0.015, 0.012]],
  headAt: SH, headPitch: SP, eye: [0.03, 0.02, 0.035, 0.009],
  fore: SQ_FORE, hind: SQ_HIND, foreX: 0.032, hindX: 0.05, coatFrom: 3,
  foot: (sx, b, hind, lod) => [paw(sx * (hind ? 0.05 : 0.032), hind ? -0.06 : 0.14, { r: hind ? 0.012 : 0.009, len: hind ? 0.06 : 0.03, toes: 4, skin: sk(b), coat: 1, region: REGION.LEG, claw: 0.008 }, lod)],
  headExtras: (h, lod) => {
    append(h, blob([0, -0.02, 0.082], [0.012, 0.01, 0.008], { seg: 6, rings: 3, col: [1, 1, 1], coat: 1, region: REGION.NOSE, skin: sk(BONE.HEAD), flat: true }));
    for (const sx of [-1, 1]) append(h, ear(sx, sx > 0 ? BONE.EAR_L : BONE.EAR_R, [sx * 0.022, 0.032, -0.012], 0.028, 0.014, 0.3, lod, { back: 0.1 }));
  },
  tail: lod => {
    // bushy, an S over the back: up from the rump, a curve forward, the tip nodding
    const pts: Array<[number, number, number, number]> = [[0, 0.15, -0.17, 0.016], [0, 0.2, -0.22, 0.03], [0, 0.27, -0.23, 0.038], [0, 0.33, -0.19, 0.036], [0, 0.35, -0.12, 0.028], [0, 0.34, -0.07, 0.01]];
    return strand(pts, sk(BONE.TAIL, BONE.TAIL2, 0.6), lod, { region: REGION.TAIL, up: [1, 0, 0], coat: 1, flat: false });
  },
  extras: () => undefined,
  bones: quadBones(
    { fore: [c3(0.032, 0.14, 0.09), c3(0.032, 0.1, 0.1), c3(0.032, 0.06, 0.12), c3(0.032, 0.025, 0.13)], hind: [c3(0.05, 0.15, -0.08), c3(0.05, 0.11, -0.05), c3(0.05, 0.04, -0.13), c3(0.05, 0.02, -0.09)], swing: [0.6, 0.7], flexF: [0, 0, -0.6, 0.3], flexH: [0, -0.5, 0.8, -0.3], foot: -0.2 },
    { neck: c3(0, 0.14, 0.11), head: SH, tail: c3(0, 0.15, -0.17), tailBob: 0.15, earAt: headPoint(SH, SP, c3(0.022, 0.032, -0.012)), rootY: 0.14, earFlick: 0.25, tailLen: 0.1, graze: { neck: -1.0, head: 0.0, bob: 0.3 }, alert: { neck: 0.3, head: 0.25, ear: 0, tail: 0.1 }, hop: true }),
  breeds: [
    sb('Gray squirrel', { base: c3(0.32, 0.31, 0.29), style: 8, patch: c3(0.12, 0.11, 0.1), cover: 0.45, scale: 18, belly: c3(0.86, 0.84, 0.8), bellyMix: 0.9, bellyY: 0.1, leg: c3(0.4, 0.36, 0.3), legMix: 0.4, acc1: c3(0.82, 0.8, 0.76), acc1Mix: 0.8, fur: 0.25 }),
    sb('Fox squirrel', { base: c3(0.4, 0.26, 0.12), style: 8, patch: c3(0.15, 0.12, 0.09), cover: 0.45, scale: 18, belly: c3(0.7, 0.45, 0.2), bellyMix: 0.85, bellyY: 0.1, leg: c3(0.5, 0.32, 0.15), legMix: 0.5, acc1: c3(0.75, 0.5, 0.25), acc1Mix: 0.8, fur: 0.25, size: 1.1 }),
  ],
  withers: 0.2, length: 0.3, stride: 0.25, graze: { neck: -1.0, head: 0.0 }, root: { bob: 0.04, pitch: 0.25, cy: 0.14, hop: true }, rootPose: { alertPitch: 0.05 }, extra: true,
};
export const SQUIRREL_MODEL = (): AnimalModel => quadModel(SQUIRREL);
