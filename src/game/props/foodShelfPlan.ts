/**
 * Food on the shelves (pure; game/props/FoodShelfRenderer draws it). The
 * pantry (sim/pantry.ts) decides how many of each prop: a sealed bucket of
 * rice is one bucket, a case of 24 cans a row of six, a case of quarts
 * twelve jars. The storerooms' shelf boards and pallets (food slots the
 * builders mark, buildkit/interior.ts `foodSlot`) are filled in order, the
 * mix kept when the stores outgrow the shelves. Sizes in meters.
 */
import { FOOD, type FoodItemId, type PropKind } from '../../sim/pantry';

export type ShelfProp = PropKind;
export const SHELF_PROPS: readonly ShelfProp[] = ['bucket', 'can10', 'mylar', 'sack', 'bag', 'jug', 'jar', 'honey', 'case', 'can', 'pack', 'crate'];

/** Footprint along the board × depth × height (m), how high it stacks, where it can go. */
export const PROP_SIZE: Record<ShelfProp, { w: number; d: number; h: number; stack: number; on: 'floor' | 'shelf' | 'any' | 'freezer' }> = {
  bucket: { w: 0.31, d: 0.31, h: 0.39, stack: 2, on: 'floor' },        // 5-gal food-grade bucket with a gamma lid
  sack: { w: 0.44, d: 0.3, h: 0.14, stack: 5, on: 'any' },            // 50 lb woven sack laid flat
  bag: { w: 0.36, d: 0.23, h: 0.11, stack: 3, on: 'any' },            // 25 lb paper sack
  can10: { w: 0.16, d: 0.16, h: 0.18, stack: 1, on: 'shelf' },        // #10 can (6 ¼ × 7 in)
  mylar: { w: 0.2, d: 0.08, h: 0.28, stack: 1, on: 'shelf' },         // a stood-up pouch
  jug: { w: 0.16, d: 0.12, h: 0.29, stack: 1, on: 'shelf' },          // gallon jug
  honey: { w: 0.16, d: 0.12, h: 0.27, stack: 1, on: 'shelf' },
  jar: { w: 0.095, d: 0.095, h: 0.18, stack: 1, on: 'shelf' },        // quart jar
  case: { w: 0.4, d: 0.27, h: 0.25, stack: 2, on: 'any' },            // cardboard case
  can: { w: 0.085, d: 0.085, h: 0.115, stack: 1, on: 'shelf' },       // 15 oz can
  pack: { w: 0.24, d: 0.16, h: 0.08, stack: 4, on: 'freezer' },      // a butcher-paper package in the chest freezer
  crate: { w: 0.5, d: 0.36, h: 0.3, stack: 3, on: 'any' },            // a slatted bin of potatoes, apples or roots
};

/** A board or a pallet a builder marked (m): its length, depth, the clear height above it, floor or shelf. */
export interface SlotSpec { len: number; dep: number; clear: number; floor: boolean; freezer?: boolean }

/** What the pantry wants shown: a prop, its tint, how many. */
export interface PropWant { prop: ShelfProp; color: number; n: number; id: FoodItemId }

/** One prop placed: slot index, position on the slot (x along from its center, z from its center toward the front, y up from the board), its tint. */
export interface PropPlace { slot: number; prop: ShelfProp; color: number; x: number; z: number; y: number; id: FoodItemId }

/**
 * How many props the pantry wants, by item (`units` real units of each):
 * the item's props a unit, rounded, at least one while there is a fifth of
 * a unit's worth left.
 */
export function propsWanted(items: ReadonlyArray<{ id: FoodItemId; units: number }>): PropWant[] {
  const out: PropWant[] = [];
  for (const { id, units } of items) {
    const it = FOOD[id];
    if (!(units > 0)) continue;
    const raw = units * it.props;
    const n = raw >= 0.2 ? Math.max(1, Math.round(raw)) : 0;
    if (n > 0) out.push({ prop: it.prop, color: it.color, n, id });
  }
  return out;
}

const fits = (p: ShelfProp, s: SlotSpec) => {
  const z = PROP_SIZE[p];
  if ((z.on === 'freezer') !== !!s.freezer) return false;
  return (z.on === 'any' || z.on === 'freezer' || (z.on === 'floor') === s.floor) && z.h <= s.clear && z.w <= s.len && z.d <= s.dep;
};

/** Pack `wants` into the slots in order (columns along each board, back to front, bottom up). Returns the places and how many of each want went in. */
function pack(wants: readonly PropWant[], slots: readonly SlotSpec[]): { places: PropPlace[]; got: number[] } {
  const used = slots.map(() => 0);          // length used along each slot
  const places: PropPlace[] = [];
  const got = wants.map(() => 0);
  // floor props first onto the floor, then shelf props onto shelves, then the 'any' ones wherever there's room
  const order = wants.map((w, i) => ({ w, i })).sort((a, b) => rank(a.w.prop) - rank(b.w.prop));
  for (const { w, i } of order) {
    const z = PROP_SIZE[w.prop];
    let left = w.n;
    for (let si = 0; si < slots.length && left > 0; si++) {
      const s = slots[si];
      if (!fits(w.prop, s)) continue;
      const rows = Math.max(1, Math.floor(s.dep / z.d)), stack = Math.max(1, Math.min(z.stack, Math.floor(s.clear / z.h)));
      while (left > 0 && used[si] + z.w <= s.len + 1e-6) {
        const x0 = -s.len / 2 + used[si] + z.w / 2;
        const inCol = Math.min(left, rows * stack);
        for (let k = 0; k < inCol; k++) {
          // fill the front row first (what you see), then back; stack up when a layer is full
          const layer = Math.floor(k / rows), row = k % rows;
          places.push({ slot: si, prop: w.prop, color: w.color, id: w.id, x: x0, z: s.dep / 2 - z.d / 2 - row * z.d, y: layer * z.h });
        }
        left -= inCol; got[i] += inCol;
        used[si] += z.w + 0.01;
      }
    }
  }
  return { places, got };
}
const rank = (p: ShelfProp) => PROP_SIZE[p].on === 'floor' ? 0 : PROP_SIZE[p].on === 'shelf' ? 1 : 2;

/**
 * Lay the wanted props out on the slots. When there's more food than shelf,
 * every item is cut back by the same share so the mix still shows (the
 * shelves look full, never empty of one thing because another came first).
 */
export function planShelves(wants: readonly PropWant[], slots: readonly SlotSpec[]): PropPlace[] {
  // a share per kind of place (pallets, boards, either): what overflows the pallets doesn't thin out the cans
  const scale: Record<string, number> = { floor: 1, shelf: 1, any: 1, freezer: 1 };
  let best: PropPlace[] = [];
  for (let it = 0; it < 8; it++) {
    const scaled = wants.map(w => ({ ...w, n: Math.max(w.n > 0 ? 1 : 0, Math.floor(w.n * scale[PROP_SIZE[w.prop].on])) }));
    const { places, got } = pack(scaled, slots);
    best = places;
    let done = true;
    for (const on of ['floor', 'shelf', 'any', 'freezer'] as const) {
      const idx = scaled.map((_, i) => i).filter(i => PROP_SIZE[scaled[i].prop].on === on);
      const want = idx.reduce((a, i) => a + scaled[i].n, 0), have = idx.reduce((a, i) => a + got[i], 0);
      if (have < want) { done = false; scale[on] *= Math.max(0.2, have / Math.max(1, want)) * 0.97; }
    }
    if (done) break;
  }
  return best;
}

/**
 * The house pantry holds what's in use: about `days` of eating, taken
 * evenly across the items (a bag of salt and a can of coffee on the
 * counter); the rest is down in the storeroom and the cellar, and the
 * freezer packages stay in the freezer. As the stores drain the house
 * share stays topped up until there's less than that left, so the
 * storeroom empties first. With no storeroom or cellar everything is in
 * the house.
 */
export function splitInUse(items: ReadonlyArray<{ id: FoodItemId; units: number }>, needKcal: number, stores: boolean, days = 18): { house: Array<{ id: FoodItemId; units: number }>; store: Array<{ id: FoodItemId; units: number }> } {
  if (!stores) return { house: items.map(i => ({ ...i })), store: [] };
  const total = items.reduce((a, i) => a + (FOOD[i.id].prop === 'pack' ? 0 : i.units * FOOD[i.id].kcal), 0);
  const f = total > 0 ? Math.min(1, needKcal * days / total) : 0;
  const house: Array<{ id: FoodItemId; units: number }> = [], store: Array<{ id: FoodItemId; units: number }> = [];
  for (const i of items) {
    const it = FOOD[i.id];
    const h = it.prop === 'pack' ? 0 : it.kcal > 0 ? i.units * f : Math.min(i.units, 1);
    if (h > 0) house.push({ id: i.id, units: h });
    if (i.units - h > 1e-9) store.push({ id: i.id, units: i.units - h });
  }
  return { house, store };
}

/** Prop counts by kind (tests, the QA hook). */
export function countByProp(places: readonly PropPlace[]): Partial<Record<ShelfProp, number>> {
  const out: Partial<Record<ShelfProp, number>> = {};
  for (const p of places) out[p.prop] = (out[p.prop] ?? 0) + 1;
  return out;
}
