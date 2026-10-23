/**
 * Materials: what the family buys, stockpiles and builds with. Abstract
 * bulk units a pickup / flatbed load is counted in. Prices are 2020s rural
 * Mountain West retail (lumber yard / farm store), rounded.
 */
export type MaterialId = 'lumber' | 'logs' | 'firewood' | 'fieldstone' | 'concrete' | 'roofing' | 'hardware' | 'wire' | 'seedlings' | 'container';

export interface MaterialDef {
  id: MaterialId;
  name: string;
  /** What one unit is. */
  unit: string;
  /** Price per unit when bought (null = can't be bought). */
  price: number | null;
}

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  lumber: { id: 'lumber', name: 'Lumber', unit: 'bundle (≈ 50 boards)', price: 250 },
  logs: { id: 'logs', name: 'Logs', unit: 'log', price: null },
  firewood: { id: 'firewood', name: 'Firewood', unit: 'rick (⅓ cord)', price: null },
  fieldstone: { id: 'fieldstone', name: 'Fieldstone', unit: 'pallet', price: 120 },
  concrete: { id: 'concrete', name: 'Concrete', unit: 'cubic yard (ready-mix)', price: 165 },
  roofing: { id: 'roofing', name: 'Metal roofing', unit: 'bundle of sheets', price: 180 },
  hardware: { id: 'hardware', name: 'Doors, windows & hardware', unit: 'kit', price: 400 },
  wire: { id: 'wire', name: 'Fence wire', unit: 'roll (400 m barbed / 100 m woven)', price: 110 },
  seedlings: { id: 'seedlings', name: 'Hedge whips', unit: 'bundle of 25 bare-root', price: 55 },
  container: { id: 'container', name: 'Shipping container', unit: '40 ft used, delivered', price: 3800 },
};

export const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[];

export type Stock = Record<MaterialId, number>;

export function emptyStock(): Stock {
  return { lumber: 0, logs: 0, firewood: 0, fieldstone: 0, concrete: 0, roofing: 0, hardware: 0, wire: 0, seedlings: 0, container: 0 };
}

/** Cost of a bill of materials at retail (unbuyable items count 0). */
export function billCost(bill: Partial<Stock>): number {
  let c = 0;
  for (const [id, n] of Object.entries(bill) as Array<[MaterialId, number]>) c += (MATERIALS[id].price ?? 0) * n;
  return c;
}

/** Does `stock` cover `bill`? */
export function hasAll(stock: Stock, bill: Partial<Stock>): boolean {
  return (Object.entries(bill) as Array<[MaterialId, number]>).every(([id, n]) => stock[id] >= n);
}

/** What is still missing from `stock` to cover `bill`. */
export function shortfall(stock: Stock, bill: Partial<Stock>): Partial<Stock> {
  const out: Partial<Stock> = {};
  for (const [id, n] of Object.entries(bill) as Array<[MaterialId, number]>) if (stock[id] < n) out[id] = n - stock[id];
  return out;
}
