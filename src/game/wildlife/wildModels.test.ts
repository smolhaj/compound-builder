import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LODS, BONE, LEG_BONES, triCount } from '../livestock/animalKit';
import { boneAngle, posePoint } from '../livestock/animalPose';
import { UNIT } from '../livestock/LivestockRenderer';
import { WILD_MODEL_IDS, wildModelOf, type WildModelId } from './wildModels';
import { SPECIES, type SpeciesId } from '../../sim/wildlife';
import { STRIDE_M, phaseAdvance, type Beast } from './wildlifeAI';
import { adornOf, coatOf, drawPlan, isWinter, modelOfSpecies } from './wildlifeLook';
import { antlerGrowth } from './models/hoofed';
import { BREEDS } from '../../sim/pets';
import { dogModelId } from './models/dogs';

const PERSON = 0.28;
/** Triangle ceilings per level (near High, near Medium, mid, far), animal by animal: a ceiling, not a target. */
const BUDGET = [5600, 3800, 2000, 1400];
const QUADS: WildModelId[] = ['deer', 'elk', 'moose', 'pronghorn', 'javelina', 'bear', 'cougar', 'wolf', 'coyote', 'rabbit', 'squirrel', ...BREEDS.map(b => dogModelId(b) as WildModelId)];
/** The muzzle: the front-most vertex of the head that is not an ear, a horn or an antler. */
function muzzle(g: THREE.BufferGeometry): [number, number, number] {
  const pos = g.attributes.position, sk = g.attributes.aSkin, mk = g.attributes.aMark;
  let best = -1, bz = -Infinity;
  for (let i = 0; i < pos.count; i++) { const r = mk.getY(i); if (sk.getX(i) === BONE.HEAD && sk.getZ(i) === 0 && r !== 4 && r !== 12 && r !== 17 && r !== 15 && pos.getZ(i) > bz) { bz = pos.getZ(i); best = i; } }
  return [pos.getX(best), pos.getY(best), pos.getZ(best)];
}
const st = (o: object) => ({ phase: 0, gait: 0, graze: 0, seed: 0.3, time: 0, ...o });

describe('wildlife and dog models', () => {
  for (const id of WILD_MODEL_IDS) {
    const m = wildModelOf(id);
    it(`${id}: triangle budget per LOD, attributes, determinism`, () => {
      LODS.forEach((lod, i) => {
        const g = m.build(lod);
        expect(triCount(g), `${id} lod ${i}`).toBeLessThanOrEqual(BUDGET[i]);
        expect(triCount(g)).toBeGreaterThan(60);
        for (const a of ['position', 'normal', 'color', 'aSkin', 'aMark']) expect(g.attributes[a], a).toBeDefined();
        const sk = g.attributes.aSkin as THREE.BufferAttribute;
        for (let v = 0; v < sk.count; v++) {
          expect(sk.getX(v)).toBeLessThan(26); expect(sk.getY(v)).toBeLessThan(26);
          expect(m.spec.bones[sk.getX(v)] ?? m.spec.bones[BONE.ROOT], `bone ${sk.getX(v)} defined`).toBeDefined();
        }
        for (const v of g.attributes.position.array) expect(Number.isFinite(v)).toBe(true);
        for (const v of g.attributes.normal.array) expect(Number.isFinite(v)).toBe(true);
      });
      const a = m.build(LODS[1]).attributes.position.array, b = wildModelOf(id).build(LODS[1]).attributes.position.array;
      expect(Array.from(a)).toEqual(Array.from(b));
      expect(m.spec.extra).toBe(true);
    });
    it(`${id}: stands on the ground at its stated height, 2 to 4 coats`, () => {
      const g = m.build(LODS[1]);
      g.computeBoundingBox();
      const bb = g.boundingBox!;
      expect(bb.min.y).toBeGreaterThan(-0.03);
      expect(bb.min.y).toBeLessThan(0.03);
      // the highest point (back, head, antlers, a bird's head up) is within a believable range of the stated height
      expect(bb.max.y).toBeGreaterThan(m.withers * 0.85);
      expect(bb.max.y).toBeLessThan(m.withers * 2.4);
      expect(m.spec.breeds.length).toBeGreaterThanOrEqual(2);
      expect(m.spec.breeds.length).toBeLessThanOrEqual(4);
    });
    it(`${id}: joint angles stay within range`, () => {
      for (const b of m.spec.bones) {
        if (!b) continue;
        expect(Math.abs(b.swing ?? 0)).toBeLessThanOrEqual(0.8);
        expect(Math.abs(b.flex ?? 0)).toBeLessThanOrEqual(1.25);
        expect(Math.abs(b.graze ?? 0)).toBeLessThanOrEqual(2.1);
        expect(Math.abs(b.lie ?? 0)).toBeLessThanOrEqual(2.1);
        expect(Math.abs(b.alert ?? 0)).toBeLessThanOrEqual(1.3);
      }
      // the posed angle of every bone over a whole gait cycle, walking, running, alert
      for (let b = 0; b < 26; b++) for (let k = 0; k < 40; k++) for (const gait of [1, 1.25]) {
        const a = boneAngle(m.spec, b, st({ phase: (k / 40) * Math.PI * 2, gait, alert: 1, wag: 1, time: k }));
        expect(Math.abs(a)).toBeLessThan(2.2);
      }
    });
  }
});

describe('proportions (SCALE v2: a person is 0.28, a unit is 6 m)', () => {
  const h = (id: WildModelId) => wildModelOf(id).withers * UNIT;
  it('hoofed animals are the right height against a person', () => {
    expect(h('deer') / PERSON).toBeGreaterThan(0.5); expect(h('deer') / PERSON).toBeLessThan(0.62);      // a deer's shoulder is about 0.9 m on a 1.7 m person
    expect(h('elk')).toBeGreaterThan(h('deer')); expect(h('moose')).toBeGreaterThan(h('elk'));
    expect(h('moose') / PERSON).toBeGreaterThan(0.95); expect(h('moose') / PERSON).toBeLessThan(1.25);      // a bull moose stands at a man's eye
    expect(h('pronghorn')).toBeLessThan(h('elk')); expect(h('javelina') / PERSON).toBeLessThan(0.35);
  });
  it('predators and dogs follow their real sizes', () => {
    expect(h('bear') / PERSON).toBeGreaterThan(0.5); expect(h('bear') / PERSON).toBeLessThan(0.65);
    expect(h('wolf')).toBeGreaterThan(h('coyote'));
    expect(h('cougar')).toBeLessThan(h('wolf') * 1.05);
    for (const b of BREEDS) { const d = h(dogModelId(b) as WildModelId); expect(d, b).toBeGreaterThan(0.06); expect(d, b).toBeLessThan(0.115); }
    expect(h('dog_terrier' as WildModelId)).toBeLessThan(h('dog_lab' as WildModelId));
    expect(h('dog_lab' as WildModelId) / PERSON).toBeGreaterThan(0.3);
  });
  it('birds and small game', () => {
    expect(h('turkey') / PERSON).toBeGreaterThan(0.5); expect(h('turkey') / PERSON).toBeLessThan(0.65);
    expect(h('goose')).toBeGreaterThan(h('duck')); expect(h('duck')).toBeGreaterThan(h('grouse') * 0.9);
    expect(h('rabbit') / PERSON).toBeLessThan(0.25); expect(h('squirrel')).toBeLessThan(h('rabbit'));
  });
  it('the model stride matches the AI table (the feet do not slide)', () => {
    const pairs: Array<[SpeciesId, WildModelId]> = [['deer', 'deer'], ['elk', 'elk'], ['moose', 'moose'], ['antelope', 'pronghorn'], ['javelina', 'javelina'], ['bear', 'bear'], ['cougar', 'cougar'], ['wolf', 'wolf'], ['coyote', 'coyote'],
      ['turkey', 'turkey'], ['grouse', 'grouse'], ['rabbit', 'rabbit'], ['squirrel', 'squirrel'], ['waterfowl', 'duck']];
    for (const [sp, id] of pairs) expect(Math.abs(wildModelOf(id).stride - STRIDE_M[sp]) / STRIDE_M[sp], sp).toBeLessThan(0.45);
    // one stride walked is one cycle
    expect(phaseAdvance('deer', 1.2 / 6, false)).toBeCloseTo(Math.PI * 2, 6);
    expect(phaseAdvance('deer', 1.2 / 6, true)).toBeLessThan(Math.PI * 2 * 0.5);
  });
  it('every species has a model and the sim sizes agree within reason', () => {
    for (const sp of Object.keys(SPECIES) as SpeciesId[]) {
      const id = modelOfSpecies(sp, 0.2) as WildModelId, m = wildModelOf(id);
      const sd = SPECIES[sp];
      // the sim's shoulder height (world units) is within a factor of 1.5 of the model's
      const ratio = (m.withers * UNIT) / sd.h;
      expect(ratio, sp).toBeGreaterThan(0.55); expect(ratio, sp).toBeLessThan(1.6);
    }
  });
});

describe('poses reach where they should', () => {
  it('a grazing hoofed animal and a predator put the muzzle near the grass', () => {
    for (const id of ['deer', 'elk', 'moose', 'pronghorn', 'javelina', 'bear', 'wolf', 'coyote', 'cougar', 'rabbit', 'squirrel'] as WildModelId[]) {
      const m = wildModelOf(id), g = m.build(LODS[1]);
      const tip = muzzle(g);
      const stand = posePoint(m.spec, tip, BONE.HEAD, st({ time: 0.01 })), down = posePoint(m.spec, tip, BONE.HEAD, st({ graze: 1, time: 0.01 }));
      const hunter = ['bear', 'wolf', 'coyote', 'cougar'].includes(id);
      expect(down[1], id).toBeLessThan(stand[1] - m.withers * (hunter ? 0.1 : 0.1));
      expect(down[1], `${id} muzzle height grazing`).toBeLessThan(m.withers * (hunter ? 0.7 : 0.3));
      expect(down[1], `${id} muzzle not underground`).toBeGreaterThan(-0.08);
    }
  });
  it('alert raises the head', () => {
    for (const id of ['deer', 'elk', 'bear', 'wolf', 'dog_lab'] as WildModelId[]) {
      const m = wildModelOf(id), g = m.build(LODS[1]);
      const tip = muzzle(g);
      const a = posePoint(m.spec, tip, BONE.HEAD, st({ time: 0.01 })), b = posePoint(m.spec, tip, BONE.HEAD, st({ alert: 1, time: 0.01 }));
      expect(b[1], id).toBeGreaterThan(a[1] + m.withers * 0.02);
    }
  });
  it('a walking foot lifts and a standing foot does not (four-legged models)', () => {
    for (const id of QUADS) {
      const m = wildModelOf(id), foot = m.spec.bones[BONE.FL + 3]!;
      const p: [number, number, number] = [foot.pivot[0], 0.01, foot.pivot[2] + 0.02];
      let hi = -1, lo = 9;
      for (let k = 0; k < 48; k++) { const y = posePoint(m.spec, p, BONE.FL + 3, st({ phase: (k / 48) * Math.PI * 2, gait: 1, time: 0.01 }))[1]; hi = Math.max(hi, y); lo = Math.min(lo, y); }
      expect(hi, id).toBeGreaterThan(m.withers * 0.04);
      expect(lo, id).toBeGreaterThan(-m.withers * 0.15);
      const still = posePoint(m.spec, p, BONE.FL + 3, st({ time: 0.01 }));
      expect(Math.abs(still[1] - 0.01), id).toBeLessThan(0.02);
    }
  });
  it('the four legs carry a lateral-sequence walk, and a gallop or a trot above gait 1', () => {
    for (const id of QUADS.filter(q => !['rabbit', 'squirrel'].includes(q))) {
      const m = wildModelOf(id), offs = LEG_BONES.map(b => m.spec.bones[b]!.off!);
      expect(new Set(offs.map(o => o.toFixed(2))).size, id).toBe(4);
      expect(m.spec.bones[BONE.FL]!.offRun, id).toBeDefined();
    }
    // a hopper moves its pairs together
    const r = wildModelOf('rabbit');
    expect(r.spec.bones[BONE.FL]!.off).toBeCloseTo(r.spec.bones[BONE.FR]!.off!, 6);
  });
  it('a dog sits with the haunches down and lies lower still', () => {
    for (const b of BREEDS) {
      const m = wildModelOf(dogModelId(b)), rump = m.build(LODS[1]);
      let top = -1, tz = Infinity;
      const pos = rump.attributes.position, sk = rump.attributes.aSkin;
      for (let i = 0; i < pos.count; i++) if (sk.getX(i) === BONE.ROOT && pos.getZ(i) < tz && pos.getY(i) > 0.1) { tz = pos.getZ(i); top = i; }
      const p: [number, number, number] = [pos.getX(top), pos.getY(top), pos.getZ(top)];
      const y0 = posePoint(m.spec, p, BONE.ROOT, st({ time: 0.01 }))[1], ys = posePoint(m.spec, p, BONE.ROOT, st({ graze: 1, time: 0.01 }))[1], yl = posePoint(m.spec, p, BONE.ROOT, st({ lie: 1, time: 0.01 }))[1];
      expect(ys, b).toBeLessThan(y0 - m.withers * 0.1);
      expect(yl, b).toBeLessThan(y0 - m.withers * 0.2);
    }
  });
});

describe('seasons, coats, antlers', () => {
  it('antlers: shed in winter and spring, grown by September, hard through the rut, dropped by the new year', () => {
    expect(antlerGrowth(20)).toBeLessThan(0.01);
    expect(antlerGrowth(80)).toBeLessThan(0.01);
    expect(antlerGrowth(130)).toBeGreaterThan(0.1); expect(antlerGrowth(130)).toBeLessThan(0.5);
    expect(antlerGrowth(180)).toBeGreaterThan(antlerGrowth(130));
    expect(antlerGrowth(265)).toBe(1); expect(antlerGrowth(310)).toBe(1);
    expect(antlerGrowth(350)).toBeLessThan(0.7);
    expect(antlerGrowth(365)).toBeLessThan(0.1);
    for (let d = 1; d < 366; d++) { expect(antlerGrowth(d)).toBeGreaterThan(0); expect(antlerGrowth(d)).toBeLessThanOrEqual(1); }
  });
  it('only bucks, bulls and toms wear them, and a young buck a smaller rack', () => {
    expect(adornOf('deer', false, 0.5, 1)).toBe(0);
    expect(adornOf('deer', true, 0.9, 1)).toBeGreaterThan(adornOf('deer', true, 0.1, 1));
    expect(adornOf('elk', true, 0.5, 1)).toBeGreaterThan(0.5);
    expect(adornOf('bear', true, 0.5, 1)).toBe(0);
    expect(adornOf('turkey', true, 0.5, 0)).toBe(1); expect(adornOf('turkey', false, 0.5, 1)).toBe(0);
  });
  it('the winter coat and the species mapped to a valid coat of their model', () => {
    expect(isWinter(10)).toBe(true); expect(isWinter(180)).toBe(false); expect(isWinter(340)).toBe(true);
    for (const sp of Object.keys(SPECIES) as SpeciesId[]) for (const male of [true, false]) for (const k of [0.05, 0.4, 0.6, 0.8, 0.95]) for (const doy of [15, 100, 200, 330]) for (const region of ['plains', 'appalachia', 'north_woods', 'desert']) {
      const id = modelOfSpecies(sp, k), n = wildModelOf(id).spec.breeds.length, c = coatOf(sp, k, male, region, doy);
      expect(c, `${sp} ${id}`).toBeGreaterThanOrEqual(0); expect(c, `${sp} ${id} coat ${c} of ${n}`).toBeLessThan(n);
    }
    expect(coatOf('deer', 0.5, false, 'appalachia', 200)).toBe(0); expect(coatOf('deer', 0.5, false, 'appalachia', 20)).toBe(1);
    expect(coatOf('turkey', 0.2, true, 'plains', 200)).not.toBe(coatOf('turkey', 0.2, false, 'plains', 200));
  });
  it('the draw plan poses the mood: graze lowers, alert raises, a flee is a run', () => {
    const b = (o: Partial<Beast>): Beast => ({ id: 'a', sp: 'deer', x: 0, z: 0, rot: 0, hx: 0, hz: 0, tx: 0, tz: 0, mood: 'graze', t: 5, phase: 0, vis: 1, want: true, head: 0, v: 0, male: true, side: 'free', group: 0, k: 0.5, ...o });
    expect(drawPlan(b({}), 'plains', 200, 1, 0).graze).toBeGreaterThan(0.9);
    expect(drawPlan(b({ mood: 'alert', head: 1 }), 'plains', 200, 1, 0).alert).toBeGreaterThan(0.9);
    expect(drawPlan(b({ mood: 'flee', head: 1, v: 1.5, gait: 1.25 }), 'plains', 200, 1, 0).gait).toBeGreaterThan(1.1);
    expect(drawPlan(b({ sp: 'waterfowl', v: 0.1, gait: 1 }), 'plains', 200, 1, 1).gait).toBe(0);
    expect(drawPlan(b({ male: true }), 'plains', 200, 1, 0).adorn).toBeGreaterThan(0.5);
    expect(drawPlan(b({ male: false }), 'plains', 200, 1, 0).adorn).toBe(0);
  });
});
