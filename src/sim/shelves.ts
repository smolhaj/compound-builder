/**
 * The Shop's shelves: every raw material the family can buy, grouped the
 * way they are used (Building, Fencing, Bunker, Water, Power, Food, ...).
 * The Supplies tab no longer has its own long dropdown: everything is
 * bought here. A material may sit on more than one shelf (wire is both
 * fencing and building). Pure (tested).
 */
import type { MaterialId } from './materials';
import { HARDEN_GOODS, KIT_GOODS, WATCH_GOODS } from './gear';

export type ShelfTab = 'build' | 'fencing' | 'bunker' | 'water' | 'power' | 'food' | 'household' | 'fuel' | 'defense';

export const SHELF_TABS: ReadonlyArray<[ShelfTab, string]> = [
  ['build', 'Building'], ['fencing', 'Fencing'], ['bunker', 'Bunker'], ['water', 'Water'], ['power', 'Power'], ['food', 'Food & farm'], ['household', 'Medical & household'], ['fuel', 'Fuel & hire'], ['defense', 'Kit & security'],
];

export const SHELVES: Record<ShelfTab, MaterialId[]> = {
  build: ['lumber', 'fieldstone', 'concrete', 'roofing', 'hardware', 'wire', 'seedlings', 'greenhouse_kit', 'fruit_trees'],
  fencing: ['wire', 'hardware', 'lumber', 'seedlings', 'container', 'rebar', 'concrete', 'cable'],
  bunker: ['rebar', 'membrane', 'container', 'blast_door', 'blast_valve', 'nbc_filter', 'filter_set', 'culvert', 'egress_hatch', 'lead_sheet', 'faraday_mesh'],
  water: ['water_jugs', 'ibc_tote', 'water_trailer', 'water_filter', 'ro_system', 'softener', 'greywater', 'pipe', 'fixtures', 'pump', 'drilling', 'tank', 'septic_tank'],
  power: ['solar_panel', 'battery', 'inverter', 'generator', 'cable'],
  food: ['seed', 'lids', 'fishing_gear', 'snares', 'smoker', 'goat', 'pig', 'steer', 'rabbit', 'hay', 'feed'],
  household: ['meds', 'hygiene', 'traps', 'tent', 'sleeping_bag', 'kibble', 'dogbed', 'doghouse'],
  fuel: ['fuel', 'stabilizer', 'firewood', 'excavator', 'plow', 'gun_safe', 'gun_cleaning'],
  defense: [...KIT_GOODS, ...WATCH_GOODS, ...HARDEN_GOODS],
};

/** Shelves that hold something the plans still lack, with how many materials. */
export function shelvesNeeding(need: Partial<Record<MaterialId, number>>): Partial<Record<ShelfTab, number>> {
  const out: Partial<Record<ShelfTab, number>> = {};
  for (const [tab] of SHELF_TABS) {
    const n = SHELVES[tab].filter(m => (need[m] ?? 0) > 0).length;
    if (n) out[tab] = n;
  }
  return out;
}
