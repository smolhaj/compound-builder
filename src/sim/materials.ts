/**
 * Materials: what the family buys, stockpiles and builds with. Abstract
 * bulk units a pickup / flatbed load is counted in. Prices are 2020s rural
 * Mountain West retail (lumber yard / farm store), rounded.
 */
export type MaterialId = 'lumber' | 'logs' | 'firewood' | 'fieldstone' | 'concrete' | 'roofing' | 'hardware' | 'wire' | 'seedlings' | 'container'
  | 'pipe' | 'cable' | 'fixtures' | 'pump' | 'drilling' | 'solar_panel' | 'battery' | 'inverter' | 'generator' | 'fuel' | 'tank' | 'septic_tank';

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
  pipe: { id: 'pipe', name: 'PEX pipe & fittings', unit: '30 m coil + fittings', price: 95 },
  cable: { id: 'cable', name: 'Electrical cable', unit: '30 m direct-burial + conduit', price: 140 },
  fixtures: { id: 'fixtures', name: 'Plumbing fixtures', unit: 'sink, shower, water heater, toilet set', price: 1650 },
  pump: { id: 'pump', name: 'Well pump & pressure tank', unit: 'submersible pump kit', price: 1300 },
  drilling: { id: 'drilling', name: 'Well drilling', unit: 'contractor, ~60 m bore', price: 9500 },
  solar_panel: { id: 'solar_panel', name: 'Solar panels', unit: '400 W panel', price: 240 },
  battery: { id: 'battery', name: 'Batteries', unit: '5 kWh LiFePO4 pack', price: 1700 },
  inverter: { id: 'inverter', name: 'Inverter / charger', unit: '6 kW off-grid', price: 1900 },
  generator: { id: 'generator', name: 'Generator', unit: '7 kW gas, electric start', price: 2600 },
  fuel: { id: 'fuel', name: 'Fuel', unit: '20 L jerry can', price: 26 },
  tank: { id: 'tank', name: 'Water tank', unit: '10,000 L poly tank', price: 2400 },
  septic_tank: { id: 'septic_tank', name: 'Septic tank', unit: '4,000 L concrete tank + leach pipe', price: 2100 },
};

export const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[];

export type Stock = Record<MaterialId, number>;

export function emptyStock(): Stock {
  return { lumber: 0, logs: 0, firewood: 0, fieldstone: 0, concrete: 0, roofing: 0, hardware: 0, wire: 0, seedlings: 0, container: 0, pipe: 0, cable: 0, fixtures: 0, pump: 0, drilling: 0, solar_panel: 0, battery: 0, inverter: 0, generator: 0, fuel: 0, tank: 0, septic_tank: 0 };
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
