import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../buildkit/materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));
import { countByProp, planShelves, PROP_SIZE, propsWanted, type SlotSpec } from './foodShelfPlan';
import { buildLayers, KIT } from '../buildkit/buildings';
import type { FoodSlot } from '../buildkit/shell';
import { M } from '../buildkit/interior';

/** A storeroom's worth: 40 shelf boards and two pallets. */
const room: SlotSpec[] = [
  { len: 1.2, dep: 1.0, clear: 0.85, floor: true }, { len: 1.2, dep: 1.0, clear: 0.85, floor: true },
  ...Array.from({ length: 40 }, () => ({ len: 0.92, dep: 0.43, clear: 0.33, floor: false })),
];

describe('food on the shelves', () => {
  it('the props scale with the quantity in the pantry', () => {
    expect(propsWanted([{ id: 'rice_bucket', units: 10 }])).toMatchObject([{ prop: 'bucket', n: 10 }]);
    expect(propsWanted([{ id: 'canned_veg', units: 2 }])).toMatchObject([{ prop: 'can', n: 12 }]);
    expect(propsWanted([{ id: 'home_canned', units: 1.5 }])).toMatchObject([{ prop: 'jar', n: 18 }]);
    expect(propsWanted([{ id: 'rice_bucket', units: 0.1 }])).toEqual([]);           // the last scrapings: nothing to show
    expect(propsWanted([{ id: 'freezer_meat', units: 5 }])).toMatchObject([{ prop: 'pack', n: 15 }]);   // packages, for the freezer
    const many = countByProp(planShelves(propsWanted([{ id: 'rice_bucket', units: 20 }, { id: 'canned_meat', units: 8 }]), room));
    const few = countByProp(planShelves(propsWanted([{ id: 'rice_bucket', units: 3 }, { id: 'canned_meat', units: 1 }]), room));
    expect(many).toEqual({ bucket: 20, can: 48 });
    expect(few).toEqual({ bucket: 3, can: 6 });
  });

  it('buckets go on the pallets (two high), cans and jars on the boards; nothing overhangs a slot', () => {
    const places = planShelves(propsWanted([{ id: 'rice_bucket', units: 12 }, { id: 'milk_powder', units: 20 }, { id: 'home_canned', units: 3 }, { id: 'flour', units: 4 }]), room);
    for (const p of places) {
      const s = room[p.slot], z = PROP_SIZE[p.prop];
      if (p.prop === 'bucket') expect(s.floor).toBe(true);
      if (p.prop === 'jar' || p.prop === 'can10') expect(s.floor).toBe(false);
      expect(Math.abs(p.x) + z.w / 2).toBeLessThanOrEqual(s.len / 2 + 1e-6);
      expect(Math.abs(p.z) + z.d / 2).toBeLessThanOrEqual(s.dep / 2 + 1e-6);
      expect(p.y + z.h).toBeLessThanOrEqual(s.clear + 1e-6);
    }
    expect(Math.max(...places.filter(p => p.prop === 'bucket').map(p => p.y))).toBeGreaterThan(0.3);
  });

  it('more food than shelf: the shelves are full and every item still shows', () => {
    const wants = propsWanted([{ id: 'rice_bucket', units: 200 }, { id: 'beans_bucket', units: 200 }, { id: 'canned_soup', units: 300 }, { id: 'honey', units: 2 }]);
    const c = countByProp(planShelves(wants, room));
    expect(c.bucket).toBeLessThanOrEqual(36);        // 2 pallets × 3 × 3 × 2
    expect(c.bucket).toBeGreaterThan(25);
    expect(c.honey).toBeGreaterThanOrEqual(1);
    const ids = new Set(planShelves(wants, room).map(p => p.id));
    expect(ids).toEqual(new Set(['rice_bucket', 'beans_bucket', 'canned_soup', 'honey']));
  });

  it('the storeroom and the root cellar mark their shelves and pallets as food slots', () => {
    const stores = buildLayers(KIT.bunker_stores).userData.foodSlots as FoodSlot[];
    expect(stores.filter(s => s.floor).length).toBe(2);
    expect(stores.filter(s => !s.floor).length).toBeGreaterThanOrEqual(30);
    for (const s of stores) {
      expect(s.len / M).toBeGreaterThan(0.8);
      expect(Math.abs(s.u[1])).toBeLessThan(1e-6);           // level boards
      expect(s.clear / M).toBeGreaterThan(0.2);
      expect(s.clear / M).toBeLessThan(1.2);
    }
    const cellar = buildLayers(KIT.root_cellar).userData.foodSlots as FoodSlot[];
    expect(cellar.filter(s => !s.floor).length).toBeGreaterThanOrEqual(16);
    expect(cellar.some(s => s.floor)).toBe(true);
    // and the slots aren't drawn as geometry
    expect(buildLayers(KIT.bunker_stores).children.some(m => m.name.includes('food_slot'))).toBe(false);
  });
});

describe('the house pantry and the freezer', () => {
  it('the house holds two to three weeks in use; the rest is in the storeroom and cellar', async () => {
    const { splitInUse } = await import('./foodShelfPlan');
    const { FOOD } = await import('../../sim/pantry');
    const items = [{ id: 'rice_bucket' as const, units: 20 }, { id: 'canned_veg' as const, units: 30 }, { id: 'salt' as const, units: 3 }, { id: 'freezer_meat' as const, units: 4 }];
    const need = 9000;
    const { house, store } = splitInUse(items, need, true);
    const kcal = (l: typeof house) => l.reduce((a, i) => a + i.units * FOOD[i.id].kcal, 0);
    expect(kcal(house) / need).toBeCloseTo(18, 5);
    expect(house.find(i => i.id === 'salt')?.units).toBe(1);
    expect(house.some(i => i.id === 'freezer_meat')).toBe(false);
    expect(kcal(house) + kcal(store)).toBeCloseTo(kcal(items), 3);
    // nearly out: the house keeps what's left, the storeroom is empty first
    const low = splitInUse([{ id: 'rice_bucket', units: 1 }], need, true);
    expect(low.store).toEqual([]);
    // no storeroom or cellar: it's all in the house
    expect(splitInUse(items, need, false).store).toEqual([]);
  });

  it('frozen food goes in the chest freezer, and only there; packages scale with the stock', () => {
    const slots: SlotSpec[] = [...room, { len: 0.98, dep: 0.53, clear: 0.7, floor: false, freezer: true }];
    const few = planShelves(propsWanted([{ id: 'freezer_meat', units: 2 }, { id: 'canned_veg', units: 1 }]), slots);
    const many = planShelves(propsWanted([{ id: 'freezer_meat', units: 12 }, { id: 'canned_veg', units: 1 }]), slots);
    expect(countByProp(few).pack).toBe(6);
    expect(countByProp(many).pack).toBe(36);
    for (const p of many) expect(p.prop === 'pack').toBe(p.slot === slots.length - 1);
    const cellar = buildLayers(KIT.root_cellar).userData.foodSlots as FoodSlot[];
    expect(cellar.filter(s => s.freezer).length).toBe(1);
  });
});
