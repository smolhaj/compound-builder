/**
 * Materials: what the family buys, stockpiles and builds with. Abstract
 * bulk units a pickup / flatbed load is counted in. Prices are 2025 rural
 * retail (lumber yard, farm store, contractor quotes), rounded: a bundle of
 * about 50 boards and sheets ~$650, ready-mix ~$190 a yard, a cased 200 ft
 * well ~$11,000, a steel blast door ~$14,000.
 */
export type MaterialId = 'lumber' | 'logs' | 'firewood' | 'fieldstone' | 'concrete' | 'roofing' | 'hardware' | 'wire' | 'seedlings' | 'container'
  | 'pipe' | 'cable' | 'fixtures' | 'pump' | 'drilling' | 'solar_panel' | 'battery' | 'inverter' | 'generator' | 'fuel' | 'tank' | 'septic_tank'
  | 'rebar' | 'membrane' | 'excavator' | 'blast_door' | 'nbc_filter' | 'spoil' | 'culvert' | 'egress_hatch'
  | 'lead_sheet' | 'faraday_mesh' | 'blast_valve' | 'filter_set'
  | 'fresh' | 'frozen' | 'canned' | 'staples' | 'meds' | 'seed' | 'lids' | 'plow' | 'stabilizer' | 'traps' | 'hygiene' | 'gun_safe' | 'gun_cleaning' | 'fishing_gear' | 'snares' | 'smoker' | 'goat' | 'pig' | 'steer' | 'rabbit' | 'hay' | 'feed' | 'water_jugs' | 'ibc_tote' | 'water_trailer' | 'water_filter' | 'ro_system' | 'softener' | 'greywater'
  | 'plate_carrier' | 'ifak' | 'nvg' | 'thermal' | 'radios' | 'cameras' | 'thermal_cam' | 'driveway_alarm' | 'floodlights' | 'blackout_curtains' | 'gen_baffles' | 'gen_vault' | 'tripwire' | 'dog' | 'puppy' | 'kibble' | 'dogbed' | 'doghouse' | 'steel_door' | 'window_bars' | 'sandbags' | 'safe_room' | 'sw_radio' | 'ham_rig' | 'helmet' | 'soft_armor'
  | 'grenades' | 'rpg_launcher' | 'rpg_rounds' | 'suppressor'
  | 'mines' | 'greenhouse_kit' | 'fruit_trees' | 'ground_sensor' | 'passage_hatch'
  | 'gun_mount' | 'turret_head' | 'ai_sensor_module'
  | 'tent' | 'sleeping_bag';

export interface MaterialDef {
  id: MaterialId;
  name: string;
  /** What one unit is. */
  unit: string;
  /** Price per unit when bought (null = can't be bought). */
  price: number | null;
}

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  lumber: { id: 'lumber', name: 'Lumber', unit: 'bundle (≈ 50 boards)', price: 650 },
  logs: { id: 'logs', name: 'Logs', unit: 'log', price: null },
  firewood: { id: 'firewood', name: 'Firewood', unit: 'rick (⅓ cord), seasoned, delivered', price: 110 },
  fieldstone: { id: 'fieldstone', name: 'Fieldstone', unit: 'pallet', price: 300 },
  concrete: { id: 'concrete', name: 'Concrete', unit: 'cubic yard (ready-mix)', price: 190 },
  roofing: { id: 'roofing', name: 'Metal roofing', unit: 'bundle of sheets', price: 450 },
  hardware: { id: 'hardware', name: 'Doors, windows & hardware', unit: 'kit: a door or a couple of windows, hinges, locks, fasteners', price: 900 },
  wire: { id: 'wire', name: 'Fence wire', unit: 'roll (400 m barbed / 100 m woven)', price: 140 },
  greenhouse_kit: { id: 'greenhouse_kit', name: 'Greenhouse kit', unit: '12 × 24 ft aluminum-frame greenhouse, twin-wall polycarbonate, door, vents, benches', price: 4500 },
  fruit_trees: { id: 'fruit_trees', name: 'Fruit trees', unit: 'a bare-root semi-dwarf apple, peach or pear tree', price: 40 },
  seedlings: { id: 'seedlings', name: 'Hedge whips', unit: 'bundle of 25 bare-root', price: 75 },
  container: { id: 'container', name: 'Shipping container', unit: '40 ft used, delivered', price: 4800 },
  pipe: { id: 'pipe', name: 'PEX pipe & fittings', unit: '30 m coil + fittings', price: 150 },
  cable: { id: 'cable', name: 'Electrical cable', unit: '30 m direct-burial + conduit', price: 380 },
  fixtures: { id: 'fixtures', name: 'Plumbing fixtures', unit: 'sink, shower, water heater, toilet set', price: 2500 },
  pump: { id: 'pump', name: 'Well pump & pressure tank', unit: 'submersible pump kit', price: 2000 },
  drilling: { id: 'drilling', name: 'Well drilling', unit: 'contractor, ~60 m (200 ft) bore, cased', price: 11000 },
  solar_panel: { id: 'solar_panel', name: 'Solar panels', unit: '400 W panel', price: 260 },
  battery: { id: 'battery', name: 'Batteries', unit: '5 kWh LiFePO4 pack', price: 1900 },
  inverter: { id: 'inverter', name: 'Inverter / charger', unit: '6 kW off-grid', price: 2400 },
  generator: { id: 'generator', name: 'Generator', unit: '7 kW gas, electric start', price: 1300 },
  fuel: { id: 'fuel', name: 'Fuel', unit: '20 L jerry can', price: 22 },
  tank: { id: 'tank', name: 'Water tank', unit: '10,000 L poly tank', price: 3000 },
  septic_tank: { id: 'septic_tank', name: 'Septic tank', unit: '4,000 L concrete tank + leach pipe', price: 2400 },
  rebar: { id: 'rebar', name: 'Rebar', unit: 'bundle (20 × 6 m #4 bars, ties)', price: 240 },
  membrane: { id: 'membrane', name: 'Waterproofing membrane', unit: 'roll (≈ 20 m²)', price: 400 },
  excavator: { id: 'excavator', name: 'Excavator hire', unit: 'day (mini-excavator, delivered)', price: 650 },
  blast_door: { id: 'blast_door', name: 'Blast door', unit: 'steel blast door and frame', price: 14000 },
  nbc_filter: { id: 'nbc_filter', name: 'NBC air filter', unit: 'filtration unit, hand crank, blast valves', price: 9500 },
  spoil: { id: 'spoil', name: 'Spoil (dug earth)', unit: 'm³', price: null },
  culvert: { id: 'culvert', name: 'Tunnel vault', unit: '6 m of poured arch: forms, rebar, concrete', price: 3600 },
  egress_hatch: { id: 'egress_hatch', name: 'Egress hatch', unit: 'steel lid, collar, inside drop-bolts, ladder', price: 4500 },
  lead_sheet: { id: 'lead_sheet', name: 'Lead sheet', unit: '1 × 2 m sheet, 6 mm (≈ 135 kg)', price: 650 },
  faraday_mesh: { id: 'faraday_mesh', name: 'Faraday mesh', unit: 'roll of welded copper-clad mesh + bonding strap', price: 420 },
  blast_valve: { id: 'blast_valve', name: 'Blast valve', unit: 'spring-loaded vent valve', price: 2200 },
  fresh: { id: 'fresh', name: 'Fresh food', unit: 'basket (≈ 2,000 kcal: eggs, greens, roots)', price: null },
  frozen: { id: 'frozen', name: 'Freezer meat', unit: '5 kg (≈ 10,000 kcal)', price: 70 },
  canned: { id: 'canned', name: 'Canned food', unit: 'case of 12 (≈ 6,000 kcal)', price: 38 },
  staples: { id: 'staples', name: 'Bulk staples', unit: 'rice, beans, flour, oil (≈ 80,000 kcal, 25 kg)', price: 85 },
  meds: { id: 'meds', name: 'Medical supplies', unit: 'kit: dressings, antibiotics, painkillers', price: 160 },
  seed: { id: 'seed', name: 'Field seed', unit: 'a season for a quarter acre: seed potatoes, dry beans, seed wheat', price: 200 },
  stabilizer: { id: 'stabilizer', name: 'Fuel stabilizer', unit: 'a bottle: keeps ten cans of gas good for two years', price: 15 },
  hygiene: { id: 'hygiene', name: 'Hygiene supplies', unit: 'a person-month: soap, toilet paper, toothpaste, shampoo, pads', price: 25 },
  plate_carrier: { id: 'plate_carrier', name: 'Plate carrier', unit: 'a carrier with a pair of level III plates', price: 600 },
  helmet: { id: 'helmet', name: 'Ballistic helmet', unit: 'a level IIIA helmet (stops pistol rounds and fragments, not a rifle)', price: 450 },
  soft_armor: { id: 'soft_armor', name: 'Soft body armor', unit: 'a level IIIA vest: stops pistol rounds and buckshot, not a rifle', price: 400 },
  ifak: { id: 'ifak', name: 'IFAK', unit: 'individual first-aid kit: tourniquet, chest seal, pressure dressing', price: 90 },
  nvg: { id: 'nvg', name: 'Night vision', unit: 'gen 3 monocular and a head mount', price: 3500 },
  thermal: { id: 'thermal', name: 'Thermal monocular', unit: 'handheld thermal: people and deer in the dark', price: 2200 },
  radios: { id: 'radios', name: 'GMRS radios', unit: 'a pair of handheld radios with chargers', price: 150 },
  sw_radio: { id: 'sw_radio', name: 'Emergency radio', unit: 'hand-crank AM/FM/shortwave receiver with a solar panel', price: 60 },
  ham_rig: { id: 'ham_rig', name: 'Ham radio (HF)', unit: 'HF transceiver, wire antenna and tuner (needs power and someone who knows radio)', price: 1200 },
  cameras: { id: 'cameras', name: 'Security cameras', unit: '4 IR night-vision cameras and a recorder (needs power)', price: 450 },
  thermal_cam: { id: 'thermal_cam', name: 'Thermal camera', unit: 'a fixed thermal security camera on the drive (needs power)', price: 2800 },
  driveway_alarm: { id: 'driveway_alarm', name: 'Driveway alarm', unit: 'wireless motion sensors along the drive, a base unit in the house', price: 150 },
  floodlights: { id: 'floodlights', name: 'Motion floodlights', unit: 'a set of motion floodlights for the yard (needs power)', price: 220 },
  gen_baffles: { id: 'gen_baffles', name: 'Generator baffles', unit: 'an insulated, vented enclosure and exhaust muffler for the generator shed: about half the noise and light', price: 900 },
  gen_vault: { id: 'gen_vault', name: 'Generator vault', unit: 'a buried, lined generator room with an exhaust silencer and a baffled intake: the generator is not heard or seen from the road', price: 6500 },
  blackout_curtains: { id: 'blackout_curtains', name: 'Blackout curtains', unit: 'heavy light-blocking curtains and tracks for one house: the room stays lit, the window stays dark', price: 140 },
  ground_sensor: { id: 'ground_sensor', name: 'Ground sensors', unit: 'a string of buried geophones along about 120 m of wall and a base unit: hears digging days out (needs power)', price: 1400 },
  passage_hatch: { id: 'passage_hatch', name: 'Passage hatch', unit: 'steel blast hatch, collar and locks from both sides (one for each end of an underground passage)', price: 3800 },
  ai_sensor_module: { id: 'ai_sensor_module', name: 'AI sensor module', unit: 'a chip and lens for one floodlight: tells people from animals, so the light comes on for people only (needs the light powered; fit it in Defense)', price: 180 },
  tripwire: { id: 'tripwire', name: 'Tripwire alarms', unit: 'tripwire noisemakers for the trails into the place', price: 60 },
  dog: { id: 'dog', name: 'Dog (trained adult)', unit: 'a named, trained adult dog: a family pet who also barks at strangers. It must be fed, watered, walked and doctored, and it will grieve and be grieved', price: 600 },
  puppy: { id: 'puppy', name: 'Puppy', unit: 'a named puppy: needs vaccines, training and a lot of time, and grows into a better guard and a closer friend', price: 250 },
  kibble: { id: 'kibble', name: 'Dog food', unit: '18 kg bag of kibble (≈ 63,000 kcal: two months for one dog)', price: 45 },
  dogbed: { id: 'dogbed', name: 'Dog bed', unit: 'a cheap bed or a folded blanket for a dog kept outside or with no home yet (inside a furnished home dogs use the beds, sofa and rugs)', price: 20 },
  doghouse: { id: 'doghouse', name: 'Doghouse', unit: 'an insulated doghouse for a dog kept outside in the cold', price: 140 },
  steel_door: { id: 'steel_door', name: 'Steel entry door', unit: 'a steel door in a steel frame, installed', price: 1200 },
  window_bars: { id: 'window_bars', name: 'Window bars', unit: 'security bars for the house windows', price: 900 },
  sandbags: { id: 'sandbags', name: 'Sandbags', unit: '100 bags (fill them with your own dirt) for a fighting position', price: 300 },
  safe_room: { id: 'safe_room', name: 'Safe room', unit: 'a reinforced interior room: steel door, lined walls, supplies shelf', price: 8500 },
  // for the watch towers' top tiers (sim/towers.ts)
  gun_mount: { id: 'gun_mount', name: 'Ring mount & machine gun', unit: 'a pintle ring on a pedestal with a registered belt-fed 7.62 machine gun and a feed tray', price: 9500 },
  turret_head: { id: 'turret_head', name: 'Remote turret head', unit: 'a gyro-stabilised remote weapon station: gun cradle, servos, optics and a controller (needs power and cameras)', price: 26000 },
  // somewhere to sleep when there are more people than beds (sim/housing.ts)
  tent: { id: 'tent', name: 'Dome tent', unit: '4-person dome tent with a rain fly and a footprint: sleeps 3 (fine in mild weather, miserable in a storm or a freeze)', price: 180 },
  sleeping_bag: { id: 'sleeping_bag', name: 'Sleeping bag', unit: '20°F bag and a foam pad: for the floor, a couch or a tent', price: 70 },
  // Black market only (sim/blackMarket.ts): price null, so the catalog never sells them.
  grenades: { id: 'grenades', name: 'Hand grenades', unit: 'grenade', price: null },
  rpg_launcher: { id: 'rpg_launcher', name: 'RPG-type launcher', unit: 'launcher tube', price: null },
  rpg_rounds: { id: 'rpg_rounds', name: 'Launcher rounds', unit: 'round', price: null },
  suppressor: { id: 'suppressor', name: 'Suppressor (unregistered)', unit: 'can', price: null },
  mines: { id: 'mines', name: 'Improvised mines (after the collapse only)', unit: 'a buried charge on a pressure switch, rigged on the place (see battle.rigMines)', price: null },
  water_jugs: { id: 'water_jugs', name: 'Drinking water', unit: 'a 5-gallon jug (19 L), sealed', price: 9 },
  ibc_tote: { id: 'ibc_tote', name: 'IBC tote', unit: '1,000 L food-grade tote on a pallet: more storage', price: 180 },
  water_trailer: { id: 'water_trailer', name: 'Water trailer', unit: 'a 1,000 L tank on a utility trailer: haul from the standpipe or the creek', price: 2800 },
  water_filter: { id: 'water_filter', name: 'Gravity water filter', unit: 'ceramic gravity filter, about a year of cartridges for a family', price: 350 },
  ro_system: { id: 'ro_system', name: 'Reverse osmosis', unit: 'under-sink reverse osmosis for drinking water (takes out arsenic)', price: 1200 },
  softener: { id: 'softener', name: 'Water softener', unit: 'for hard water: saves the pump and the pipes', price: 900 },
  greywater: { id: 'greywater', name: 'Greywater system', unit: 'diverter, surge tank and mulch basins: sink and shower water to the garden', price: 900 },
  fishing_gear: { id: 'fishing_gear', name: 'Fishing gear', unit: 'rods, reels, tackle box, waders', price: 120 },
  snares: { id: 'snares', name: 'Snares', unit: 'a dozen wire snares for rabbits and grouse', price: 40 },
  goat: { id: 'goat', name: 'Dairy goat', unit: 'a bred doe in milk: about 2 quarts a day (hay and a little grain)', price: 350 },
  pig: { id: 'pig', name: 'Feeder pig', unit: 'a weaned feeder pig: to the butcher in November (bagged feed)', price: 150 },
  steer: { id: 'steer', name: 'Beef steer', unit: 'a weaned steer calf: beef after a summer on grass (hay in winter)', price: 1800 },
  rabbit: { id: 'rabbit', name: 'Meat rabbit', unit: 'a meat rabbit for the hutch: a buck and two does make a colony', price: 35 },
  hay: { id: 'hay', name: 'Hay', unit: 'a 50 lb small square bale (cheapest bought at the fall cutting)', price: 12 },
  feed: { id: 'feed', name: 'Livestock feed', unit: 'a 50 lb bag of pellets and grain for pigs, goats, rabbits', price: 20 },
  smoker: { id: 'smoker', name: 'Smoker', unit: 'a smokehouse kit and curing salt: jerky that keeps without a freezer', price: 300 },
  gun_safe: { id: 'gun_safe', name: 'Gun safe', unit: '24-gun fire-rated safe, bolted down', price: 1800 },
  gun_cleaning: { id: 'gun_cleaning', name: 'Gun cleaning kit', unit: 'rods, brushes, solvent, oil, patches: about a year', price: 60 },
  traps: { id: 'traps', name: 'Traps & bait stations', unit: 'snap traps, bait stations and bait: about two months', price: 35 },
  plow: { id: 'plow', name: 'Plow blade', unit: 'a snowplow blade for the truck (keep the drive open)', price: 3500 },
  lids: { id: 'lids', name: 'Canning lids', unit: 'sleeve of 12 lids (one case of quarts put up; the jars come back, the lids don\'t)', price: 6 },
  filter_set: { id: 'filter_set', name: 'HEPA filter set', unit: 'HEPA cartridges + hand-crank blower', price: 1100 },
};

export const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[];

export type Stock = Record<MaterialId, number>;

export function emptyStock(): Stock {
  // every material at zero (new goods need no edit here)
  return Object.fromEntries(MATERIAL_IDS.map(k => [k, 0])) as Stock;
}

/** Cost of a bill of materials at retail (unbuyable items count 0). */
export function billCost(bill: Partial<Stock>): number {
  let c = 0;
  for (const [id, n] of Object.entries(bill) as Array<[MaterialId, number]>) c += (MATERIALS[id].price ?? 0) * n;
  return c;
}

/** Does `stock` cover `bill`? */
export function hasAll(stock: Stock, bill: Partial<Stock>): boolean {
  for (const id in bill) if (!(stock[id as MaterialId] >= (bill[id as MaterialId] as number))) return false;
  return true;
}

/** What is still missing from `stock` to cover `bill`. */
export function shortfall(stock: Stock, bill: Partial<Stock>): Partial<Stock> {
  const out: Partial<Stock> = {};
  for (const [id, n] of Object.entries(bill) as Array<[MaterialId, number]>) if (stock[id] < n) out[id] = n - stock[id];
  return out;
}

/** A quantity for people to read: whole numbers from 10 up, one decimal to 1, two below; null when it rounds to nothing. */
export function qtyText(n: number): string | null {
  if (n < 0.005) return null;
  if (n >= 10) return String(Math.round(n));
  if (n >= 1) return String(Math.round(n * 10) / 10);
  return (Math.round(n * 100) / 100).toString();
}

/** "3 lumber, 0.5 field seed": a bill or shortfall as text, skipping what rounds to zero. */
export function billText(bill: Partial<Stock>): string {
  return (Object.entries(bill) as Array<[MaterialId, number]>)
    .map(([k, n]) => { const q = qtyText(n); return q === null ? null : `${q} ${MATERIALS[k].name.toLowerCase()}`; })
    .filter(Boolean).join(', ');
}

/** "Waiting for ..." for a shortfall; a sliver that rounds to nothing still says so. */
export const waitingFor = (miss: Partial<Stock>): string => `Waiting for ${billText(miss) || 'a little more material'}`;
