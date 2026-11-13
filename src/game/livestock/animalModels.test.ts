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

/** The vertices of a region (aMark.y) or bone (aSkin.x), in the rest pose. */
function verts(id: ModelId, pick: (bone: number, region: number) => boolean, li = 0): Array<[number, number, number]> {
  const g = modelOf(id).build(LODS[li]), pos = g.attributes.position, sk = g.attributes.aSkin, mk = g.attributes.aMark, out: Array<[number, number, number]> = [];
  for (let i = 0; i < pos.count; i++) if (pick(sk.getX(i), mk.getY(i))) out.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  return out;
}
const ext = (v: Array<[number, number, number]>, k: 0 | 1 | 2): [number, number] => [Math.min(...v.map(p => p[k])), Math.max(...v.map(p => p[k]))];

describe('round 2: cattle anatomy (owner: the heads were long, tapered, horse-like, low, with plate ears)', () => {
  const head = (id: ModelId) => verts(id, (b, r) => b === BONE.HEAD && r !== 4 && r !== 10 && r !== 12);
  for (const id of ['cow', 'steer'] as ModelId[]) {
    it(`${id}: a head carried level with the back, short and broad rather than a long taper`, () => {
      const m = modelOf(id), h = head(id), [y0, y1] = ext(h, 1), [z0, z1] = ext(h, 2), [x0, x1] = ext(h, 0);
      expect(y1, 'poll height').toBeGreaterThan(m.withers * 0.88);     // the poll is near back height (it hung at 0.75 before)
      expect(z1 - z0, 'head length (m)').toBeLessThan(0.55);              // 0.47 m of face along the axis, pitched down: never a 0.7 m horse head
      expect(z1 - z0, 'head length (m)').toBeGreaterThan(0.3);
      // a broad muzzle: the front fifth of the head is at least 17 cm across
      const front = h.filter(p => p[2] > z1 - (z1 - z0) * 0.18), [fx0, fx1] = ext(front, 0);
      expect(fx1 - fx0, 'muzzle width').toBeGreaterThan(0.17);
      expect(x1 - x0, 'forehead width').toBeGreaterThan(0.22);
      expect(y1 - y0).toBeGreaterThan(0.25);
    });
    it(`${id}: ears are held out to the sides (not flat plates on the head), and the legs are straight under the barrel`, () => {
      const ears = verts(id, (_b, r) => r === 4), [ex0, ex1] = ext(ears, 0);
      expect(ex1 - ex0, 'ear span').toBeGreaterThan(0.55);
      const hind = verts(id, b => b >= BONE.HL && b < BONE.HL + 4, 1).filter(p => p[1] < modelOf(id).withers * 0.42);
      const [hz0, hz1] = ext(hind, 2);
      expect(hz1 - hz0, 'hind leg fore-aft extent from the hock down (a straight hock, not a sickle)').toBeLessThan(0.36);
    });
  }
  it('the steer has horn buds and the dairy cow has an udder with four teats; the steer is heavier in the neck and gaskin', () => {
    expect(verts('steer', (_b, r) => r === 12).length).toBeGreaterThan(10);
    expect(verts('cow', (_b, r) => r === 12).length).toBe(0);
    expect(verts('cow', (_b, r) => r === 5).length).toBeGreaterThan(50);
    const neck = (id: ModelId) => ext(verts(id, b => b === BONE.NECK, 1), 0);
    expect(neck('steer')[1] - neck('steer')[0]).toBeGreaterThan(neck('cow')[1] - neck('cow')[0]);
  });
});

describe('round 2: small stock', () => {
  it('a goat carries horns that sweep back (the tip is behind the base) and a beard under the chin', () => {
    const horns = verts('goat', (_b, r) => r === 12, 1), [z0, z1] = ext(horns, 2), [y0, y1] = ext(horns, 1);
    expect(z1 - z0).toBeGreaterThan(0.1);
    expect(y1 - y0).toBeGreaterThan(0.08);
    const beard = verts('goat', (b, r) => b === BONE.HEAD && r === 1, 1);
    expect(beard.length).toBeGreaterThan(0);
  });
  it('a sheep has a thick short neck, a wool coat flagged for the clumpy-fleece shader, and a short tail', () => {
    const m = modelOf('sheep');
    expect(m.spec.breeds.every(b => (b.wool ?? 0) > 0)).toBe(true);
    const neck = ext(verts('sheep', b => b === BONE.NECK, 1), 0);
    expect(neck[1] - neck[0]).toBeGreaterThan(0.25);
    const tail = verts('sheep', b => b === BONE.TAIL || b === BONE.TAIL2, 1), [ty0, ty1] = ext(tail, 1);
    expect(ty1 - ty0).toBeLessThan(0.3);
  });
  it('a hen folds layered wing feathers, fans its tail wide and wears a hackle; the breeds carry the feather shader', () => {
    const wingA = verts('hen', (b, r) => b === BONE.ROOT && r === 0, 0).length, wingB = verts('hen', (b, r) => b === BONE.ROOT && r === 0, 1).length;
    expect(wingA).toBeGreaterThan(wingB);
    const tail = verts('hen', b => b === BONE.TAIL, 1), [tx0, tx1] = ext(tail, 0);
    expect(tx1 - tx0, 'tail fan width').toBeGreaterThan(0.1);
    expect(modelOf('hen').spec.breeds.every(b => (b.feather ?? 0) > 0)).toBe(true);
    const rooster = verts('rooster', b => b === BONE.TAIL, 1), [rx0, rx1] = ext(rooster, 0);
    expect(rx1 - rx0).toBeGreaterThan(0.12);
  });
});

describe('round 2: gait', () => {
  it('the walk is in near-diagonal pairs with a gentle hock flex', () => {
    for (const id of ['cow', 'steer', 'sheep', 'goat'] as ModelId[]) {
      const o = (b: number) => modelOf(id).spec.bones[b]!.off!;
      // fore right a short beat after hind left; fore left a short beat after hind right (a quarter turn or less, not the old lateral sequence)
      const lag = (f: number, h: number) => ((o(f) - o(h)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      expect(lag(BONE.FR, BONE.HL), id).toBeLessThan(Math.PI * 0.45);
      expect(lag(BONE.FL, BONE.HR), id).toBeLessThan(Math.PI * 0.45);
      const hock = modelOf(id).spec.bones[BONE.HL + 2]!.flex!;
      expect(Math.abs(hock), `${id} hock flex`).toBeLessThanOrEqual(0.4);
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
