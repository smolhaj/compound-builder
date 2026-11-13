import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LODS, BONE, LEG_BONES, triCount } from './animalKit';
import { MODEL_IDS, modelFor, modelOf, type ModelId } from './animalModels';
import { boneAngle, posePoint } from './animalPose';
import { UNIT, lodTier } from './LivestockRenderer';

const PERSON = 0.28;
/** Triangle budgets per LOD (near High, near Medium, mid, far), animal by animal, a ceiling not a target. */
const BUDGET = [4500, 3000, 1500, 900];

describe('animal models', () => {
  for (const id of MODEL_IDS) {
    const m = modelOf(id);
    it(`${id}: triangle budget per LOD, attributes, determinism`, () => {
      LODS.forEach((lod, i) => {
        const g = m.build(lod);
        expect(triCount(g)).toBeLessThanOrEqual(BUDGET[i]);
        expect(triCount(g)).toBeGreaterThan(40);
        for (const a of ['position', 'normal', 'color', 'aSkin', 'aMark']) expect(g.attributes[a], a).toBeDefined();
        const sk = g.attributes.aSkin as THREE.BufferAttribute;
        for (let v = 0; v < sk.count; v++) {
          expect(sk.getX(v)).toBeLessThan(26); expect(sk.getY(v)).toBeLessThan(26);
          expect(m.spec.bones[sk.getX(v)] ?? m.spec.bones[BONE.ROOT], `bone ${sk.getX(v)} defined`).toBeDefined();
        }
        for (const v of g.attributes.position.array) expect(Number.isFinite(v)).toBe(true);
      });
      const a = m.build(LODS[1]).attributes.position.array, b = modelOf(id).build(LODS[1]).attributes.position.array;
      expect(Array.from(a)).toEqual(Array.from(b));
    });
    it(`${id}: stands on the ground at its stated height`, () => {
      const g = m.build(LODS[1]);
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      expect(bb.min.y).toBeGreaterThan(-0.03);
      expect(bb.min.y).toBeLessThan(0.03);
      // the highest point (back, or head and tail for birds) is within 60 % of the stated withers height
      expect(bb.max.y).toBeGreaterThan(m.withers * 0.85);
      expect(bb.max.y).toBeLessThan(m.withers * 1.6);
    });
    it(`${id}: joint angles stay within range`, () => {
      for (const b of m.spec.bones) {
        if (!b) continue;
        expect(Math.abs(b.swing ?? 0)).toBeLessThanOrEqual(0.8);
        expect(Math.abs(b.flex ?? 0)).toBeLessThanOrEqual(1.25);
        expect(Math.abs(b.graze ?? 0)).toBeLessThanOrEqual(1.3);
      }
      // the posed angle of every bone over a whole gait cycle
      for (let b = 0; b < 26; b++) for (let k = 0; k < 40; k++) {
        const a = boneAngle(m.spec, b, { phase: (k / 40) * Math.PI * 2, gait: 1, graze: 0, seed: 0.3, time: k });
        expect(Math.abs(a)).toBeLessThan(1.6);
      }
    });
  }
});

describe('scale (SCALE v2: a person is 0.28)', () => {
  it('a dairy cow is about hip to waist high on a person', () => {
    const cow = modelOf('cow').withers * UNIT;
    expect(cow / PERSON).toBeGreaterThan(0.78);
    expect(cow / PERSON).toBeLessThan(0.9);
    expect(modelOf('steer').withers * UNIT).toBeLessThan(cow);
  });
  it('the others follow real proportions', () => {
    const h = (id: ModelId) => modelOf(id).withers * UNIT;
    expect(h('sheep')).toBeGreaterThan(0.11); expect(h('sheep')).toBeLessThan(0.15);
    expect(h('goat')).toBeGreaterThan(0.11); expect(h('goat')).toBeLessThan(0.16);
    expect(h('pig')).toBeGreaterThan(0.11); expect(h('pig')).toBeLessThan(0.16);
    expect(h('hen')).toBeGreaterThan(0.05); expect(h('hen')).toBeLessThan(0.075);
    expect(h('rooster')).toBeGreaterThan(h('hen'));
    expect(h('rabbit')).toBeLessThan(0.05);
  });
  it('the four legs of every quadruped carry a lateral-sequence walk', () => {
    for (const id of ['cow', 'steer', 'sheep', 'goat', 'pig'] as ModelId[]) {
      const offs = LEG_BONES.map(b => modelOf(id).spec.bones[b]!.off!);
      expect(new Set(offs.map(o => o.toFixed(2))).size).toBe(4);
    }
  });
});

describe('animation reaches where it should', () => {
  const st = (o: object) => ({ phase: 0, gait: 0, graze: 0, seed: 0.3, time: 0, ...o });
  it('a grazing quadruped puts its muzzle on the grass', () => {
    for (const id of ['cow', 'steer', 'sheep', 'goat', 'pig'] as ModelId[]) {
      const m = modelOf(id), g = m.build(LODS[1]), pos = g.attributes.position, sk = g.attributes.aSkin;
      // the muzzle: the front-most vertex of the head bone
      let best = -1, bz = -Infinity;
      for (let i = 0; i < pos.count; i++) if (sk.getX(i) === BONE.HEAD && sk.getZ(i) === 0 && pos.getZ(i) > bz) { bz = pos.getZ(i); best = i; }
      const tip: [number, number, number] = [pos.getX(best), pos.getY(best), pos.getZ(best)];
      const stand = posePoint(m.spec, tip, BONE.HEAD, st({ time: 0.01 })), down = posePoint(m.spec, tip, BONE.HEAD, st({ graze: 1, time: 0.01 }));
      expect(down[1], id).toBeLessThan(stand[1] - m.withers * 0.3);
      expect(down[1], `${id} muzzle height grazing`).toBeLessThan(m.withers * 0.22);
      expect(down[1], `${id} muzzle not underground`).toBeGreaterThan(-0.06);
    }
  });
  it('a walking foot lifts and a standing foot does not', () => {
    for (const id of ['cow', 'sheep', 'pig', 'goat'] as ModelId[]) {
      const m = modelOf(id), foot = m.spec.bones[BONE.FL + 3]!;
      const p: [number, number, number] = [foot.pivot[0], 0.01, foot.pivot[2] + 0.02];
      let hi = -1, lo = 9;
      for (let k = 0; k < 48; k++) { const y = posePoint(m.spec, p, BONE.FL + 3, st({ phase: (k / 48) * Math.PI * 2, gait: 1, time: 0.01 }))[1]; hi = Math.max(hi, y); lo = Math.min(lo, y); }
      expect(hi, id).toBeGreaterThan(0.03);
      expect(lo, id).toBeGreaterThan(-0.09);
      const still = posePoint(m.spec, p, BONE.FL + 3, st({ time: 0.01 }));
      expect(Math.abs(still[1] - 0.01)).toBeLessThan(0.02);
    }
  });
});

describe('level of detail and the herd mapping', () => {
  it('each tier draws a richer near mesh than a far one', () => {
    for (const q of ['high', 'medium', 'low'] as const) {
      const t = lodTier(q);
      expect(t.lods[0].seg * t.lods[0].sub).toBeGreaterThanOrEqual(t.lods[2].seg * t.lods[2].sub);
      expect(t.at[0]).toBeLessThan(t.at[1]);
    }
    expect(lodTier('high').at[0]).toBeGreaterThan(lodTier('low').at[0]);
  });
  it('every kind has a model, and the first hen of a coop is its rooster', () => {
    expect(modelFor('cow', 'cow0')).toBe('cow');
    expect(modelFor('steer', 'steer0')).toBe('steer');
    expect(modelFor('hen', 'hen0')).toBe('rooster');
    expect(modelFor('hen', 'hen3')).toBe('hen');
    for (const id of MODEL_IDS) expect(modelOf(id).spec.breeds.length).toBeGreaterThanOrEqual(2);
  });
});
