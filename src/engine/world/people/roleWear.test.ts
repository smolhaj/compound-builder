import { describe, expect, it } from 'vitest';
import { BUILD, GEAR, HAIR, HEADWEAR, stridePhase, FIG_SCALE } from './figureKit';
import { climateOfCold, dressForTask, looksFor, roleOfPerson, seedOf, wearForRole, type Role } from './roleWear';

describe('looksFor', () => {
  it('is deterministic per seed and varies across seeds', () => {
    expect(looksFor(seedOf('p3'), { age: 30 })).toEqual(looksFor(seedOf('p3'), { age: 30 }));
    const skins = new Set<number>(), hairs = new Set<number>(), styles = new Set<number>();
    for (let i = 0; i < 200; i++) { const l = looksFor(seedOf('p' + i), { age: 30, female: i % 2 === 0 }); skins.add(l.skin); hairs.add(l.hair); styles.add(l.hairStyle); }
    expect(skins.size).toBeGreaterThanOrEqual(8);
    expect(hairs.size).toBeGreaterThanOrEqual(8);
    expect(styles.size).toBeGreaterThanOrEqual(5);
  });
  it('gives kids a child build and no beard, elders gray hair and a stoop', () => {
    for (let i = 0; i < 40; i++) {
      const k = looksFor(i * 77, { kid: true, age: 8 });
      expect(k.build).toBe(BUILD.CHILD); expect(k.beard).toBe(0);
      const e = looksFor(i * 91, { elder: true, age: 74 });
      expect(e.build).toBe(BUILD.ELDER);
      expect([0x9a9590, 0xc8c4bc, 0xb0aaa2, 0x6e6a66, 0xe2ded8]).toContain(e.hair);
    }
  });
});

describe('wearForRole', () => {
  const roles: Role[] = ['adult', 'teen', 'child', 'elder', 'farmer', 'builder', 'cook', 'medic', 'guard', 'neighbor', 'trader', 'scavenger', 'militia', 'tactical'];
  it('is deterministic and every role makes a valid outfit in every season', () => {
    for (const role of roles) for (const season of ['summer', 'fall', 'winter', 'spring'] as const) {
      const a = wearForRole(42, role, { season }), b = wearForRole(42, role, { season });
      expect(a).toEqual(b);
      expect(a.skin).toBeGreaterThan(0);
      expect(a.coat).toBeGreaterThanOrEqual(0); expect(a.coat).toBeLessThanOrEqual(3);
      expect((a.gear ?? 0) & ~1023).toBe(0);
    }
  });
  it('arms defenders and raiders, aprons the cook, boots the farmer, covers up in winter', () => {
    expect(wearForRole(1, 'guard', { season: 'fall' }).gear! & (GEAR.VEST | GEAR.RADIO | GEAR.SLING)).toBe(GEAR.VEST | GEAR.RADIO | GEAR.SLING);
    expect(wearForRole(1, 'tactical', { season: 'fall' }).gear! & GEAR.PLATE).toBe(GEAR.PLATE);
    expect(wearForRole(1, 'tactical', { season: 'fall' }).headwear).toBe(HEADWEAR.HELMET);
    expect(wearForRole(1, 'cook', { season: 'fall' }).gear! & GEAR.APRON).toBe(GEAR.APRON);
    expect(wearForRole(1, 'farmer', { season: 'fall' }).gear! & GEAR.BOOTS).toBe(GEAR.BOOTS);
    let coats = 0, shorts = 0;
    for (let i = 0; i < 60; i++) { if (wearForRole(i, 'adult', { season: 'winter', climate: 'cold' }).coat > 0) coats++; if (wearForRole(i, 'adult', { season: 'summer', climate: 'hot' }).shorts) shorts++; }
    expect(coats).toBe(60); expect(shorts).toBeGreaterThan(10);
  });
  it('child style hair never gives a beard and builds stay in range', () => {
    for (let i = 0; i < 50; i++) { const w = wearForRole(i, 'child', { season: 'fall' }); expect(w.build).toBe(BUILD.CHILD); expect(w.beard).toBe(0); expect(Object.values(HAIR)).toContain(w.hairStyle); }
  });
});

describe('dressForTask', () => {
  const base = wearForRole(5, 'adult', { season: 'summer' });
  it('puts on what the job needs and returns the same object when nothing changes', () => {
    expect(dressForTask(base, 'kitchen', { season: 'summer' }).gear! & GEAR.APRON).toBe(GEAR.APRON);
    expect(dressForTask(base, 'wood', { season: 'summer' }).gear! & GEAR.GLOVES).toBe(GEAR.GLOVES);
    expect(dressForTask(base, 'watch', { season: 'summer', armed: true }).gear! & GEAR.SLING).toBe(GEAR.SLING);
    expect(dressForTask(base, 'watch', { season: 'summer', armed: false }).gear! & GEAR.SLING).toBe(0);
    expect(dressForTask(base, 'sleep', { season: 'summer' })).toBe(base);
    expect(dressForTask(base, 'kitchen', { season: 'summer', kid: true })).toBe(base);
  });
});

describe('roles and strides', () => {
  it('maps people to roles', () => {
    expect(roleOfPerson({ kid: true, age: 6 })).toBe('child');
    expect(roleOfPerson({ kid: true, age: 15 })).toBe('teen');
    expect(roleOfPerson({ kid: false, age: 70 })).toBe('elder');
    expect(roleOfPerson({ kid: false, age: 30, guard: true })).toBe('guard');
    expect(climateOfCold(0.9)).toBe('cold');
  });
  it('a stride covers the chord the legs span (the planted foot does not slide)', () => {
    const amp = 0.5, scale = 1;
    const chord = 2 * 0.265 * FIG_SCALE * scale * Math.sin(amp);
    expect(stridePhase(chord, scale, amp)).toBeCloseTo(Math.PI, 5);
    expect(stridePhase(chord * 2, scale, amp)).toBeCloseTo(2 * Math.PI, 5);
    expect(stridePhase(chord, 0.6, amp)).toBeGreaterThan(Math.PI);
  });
});
