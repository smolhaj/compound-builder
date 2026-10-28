/**
 * Blueprints: how each kit piece is built — its construction stages, the
 * labour each takes (person-hours at a competent builder's pace) and the
 * materials each consumes when work on it starts (GDS §2.2: people build it
 * over time; scaffold → frame → clad).
 */
import type { Stock } from './materials';

export type StageId = 'site' | 'foundation' | 'frame' | 'roof' | 'finish';

export interface StageDef {
  id: StageId;
  name: string;
  /** Person-hours at work rate 1. */
  hours: number;
  materials: Partial<Stock>;
  /** What finishing the stage adds to the stockpile (the spoil a dig turns up). */
  yields?: Partial<Stock>;
}

export interface Blueprint {
  kind: string;
  stages: StageDef[];
}

/** 6 × 9 m timber cabin, insulated and finished: ≈ 1,400 person-hours (owner-builders report 1,200–1,600); ≈ $47k of materials. */
export const CABIN_BLUEPRINT: Blueprint = {
  kind: 'timber_cabin',
  stages: [
    { id: 'site', name: 'Stake out & level the pad', hours: 40, materials: {} },
    { id: 'foundation', name: 'Fieldstone foundation', hours: 120, materials: { fieldstone: 10 } },
    { id: 'frame', name: 'Timber frame and subfloor', hours: 500, materials: { lumber: 24 } },
    { id: 'roof', name: 'Rafters, sheathing and metal roof', hours: 240, materials: { lumber: 8, roofing: 12 } },
    { id: 'finish', name: 'Siding, insulation, doors, windows and interior', hours: 500, materials: { lumber: 8, hardware: 14 } },
  ],
};

/** Pit privy: a day or two's work. */
export const OUTHOUSE_BLUEPRINT: Blueprint = {
  kind: 'outhouse',
  stages: [
    { id: 'site', name: 'Pick the spot (downhill, away from water)', hours: 4, materials: {} },
    { id: 'foundation', name: 'Dig the pit, set the stone sill', hours: 20, materials: { fieldstone: 1 } },
    { id: 'frame', name: 'Frame and seat', hours: 14, materials: { lumber: 1 } },
    { id: 'roof', name: 'Roof', hours: 5, materials: { roofing: 1 } },
    { id: 'finish', name: 'Siding and door', hours: 10, materials: { lumber: 1 } },
  ],
};

/** 9 × 12 m steel shop on a slab: ≈ 1,000 person-hours; ≈ $54k of materials. */
export const WORKSHOP_BLUEPRINT: Blueprint = {
  kind: 'workshop',
  stages: [
    { id: 'site', name: 'Stake out & grade the pad', hours: 40, materials: {} },
    { id: 'foundation', name: 'Pour the slab', hours: 100, materials: { concrete: 18 } },
    { id: 'frame', name: 'Post and girt frame', hours: 350, materials: { lumber: 22 } },
    { id: 'roof', name: 'Trusses and roof', hours: 200, materials: { lumber: 8, roofing: 18 } },
    { id: 'finish', name: 'Steel siding, bay door, benches', hours: 310, materials: { roofing: 18, hardware: 8 } },
  ],
};

/** Earth-bermed stone cellar: most of the work is digging. */
export const ROOT_CELLAR_BLUEPRINT: Blueprint = {
  kind: 'root_cellar',
  stages: [
    { id: 'site', name: 'Stake out', hours: 12, materials: {} },
    { id: 'foundation', name: 'Dig into the slope, footings', hours: 180, materials: { concrete: 8 } },
    { id: 'frame', name: 'Stone walls and vault beams', hours: 160, materials: { fieldstone: 14, lumber: 4 } },
    { id: 'roof', name: 'Waterproof and berm the earth back over', hours: 90, materials: { roofing: 2, membrane: 2 } },
    { id: 'finish', name: 'Door, vent, shelves and bins', hours: 60, materials: { lumber: 2, hardware: 2 } },
  ],
};

export const COOP_BLUEPRINT: Blueprint = {
  kind: 'chicken_coop',
  stages: [
    { id: 'site', name: 'Stake out', hours: 3, materials: {} },
    { id: 'foundation', name: 'Piers and run posts', hours: 16, materials: { fieldstone: 1 } },
    { id: 'frame', name: 'Coop frame, roosts, nest boxes', hours: 40, materials: { lumber: 2 } },
    { id: 'roof', name: 'Roof', hours: 10, materials: { roofing: 1 } },
    { id: 'finish', name: 'Siding, wire run, ramp', hours: 30, materials: { wire: 2, hardware: 1 } },
  ],
};

export const GARDEN_BLUEPRINT: Blueprint = {
  kind: 'garden',
  stages: [
    { id: 'site', name: 'Lay out the beds', hours: 6, materials: {} },
    { id: 'foundation', name: 'Break sod and double-dig', hours: 50, materials: {} },
    { id: 'frame', name: 'Build the raised beds', hours: 40, materials: { lumber: 3 } },
    { id: 'roof', name: 'Deer fence and gate', hours: 30, materials: { lumber: 1, wire: 2, hardware: 1 } },
    { id: 'finish', name: 'Compost, soil and planting', hours: 24, materials: {} },
  ],
};

/** A 12 × 24 ft hobby greenhouse kit on a gravel bed and a concrete curb: ≈ 60 person-hours, ≈ $5,600 of materials. */
export const GREENHOUSE_BLUEPRINT: Blueprint = {
  kind: 'greenhouse',
  stages: [
    { id: 'site', name: 'Square and level the bed (long side to the south)', hours: 4, materials: {} },
    { id: 'foundation', name: 'Gravel bed and a concrete curb, anchors set', hours: 16, materials: { concrete: 2, fieldstone: 1 } },
    { id: 'frame', name: 'Bolt up the aluminum frame', hours: 18, materials: { greenhouse_kit: 1 } },
    { id: 'roof', name: 'Ridge, rafters and roof panels', hours: 10, materials: {} },
    { id: 'finish', name: 'Wall panels, door, vents and the benches', hours: 12, materials: { lumber: 1 } },
  ],
};

/** Twelve bare-root fruit trees on a grid, staked and guarded: ≈ 30 person-hours, ≈ $620. */
export const ORCHARD_BLUEPRINT: Blueprint = {
  kind: 'orchard',
  stages: [
    { id: 'site', name: 'Stake the rows (4 m apart)', hours: 3, materials: {} },
    { id: 'foundation', name: 'Strip the sod, dig the planting holes', hours: 12, materials: {} },
    { id: 'frame', name: 'Plant the trees', hours: 8, materials: { fruit_trees: 12 } },
    { id: 'roof', name: 'Stakes and trunk guards', hours: 4, materials: { wire: 1 } },
    { id: 'finish', name: 'Mulch rings and the first watering', hours: 3, materials: {} },
  ],
};

/** A quarter-acre field plot: potatoes, dry beans and wheat, plowed by a neighbor's tractor or by hand. */
export const FIELD_BLUEPRINT: Blueprint = {
  kind: 'field',
  stages: [
    { id: 'site', name: 'Stake the corners', hours: 3, materials: {} },
    { id: 'foundation', name: 'Plow, pick rock and harrow (rented tiller)', hours: 60, materials: {} },
    { id: 'frame', name: 'Plant potatoes, beans and wheat', hours: 50, materials: { seed: 1 } },
    { id: 'roof', name: 'Deer fence and gate', hours: 60, materials: { lumber: 3, wire: 2, hardware: 1 } },
    { id: 'finish', name: 'Hill the potatoes, set the drying racks', hours: 30, materials: { lumber: 1 } },
  ],
};

/** 9 × 15 m log house from your own timber: ≈ 3,200 person-hours (two years of weekends for two, or a crew); ≈ $80k of bought materials. */
export const LOG_HOUSE_BLUEPRINT: Blueprint = {
  kind: 'log_house',
  stages: [
    { id: 'site', name: 'Stake out & level the pad', hours: 60, materials: {} },
    { id: 'foundation', name: 'Stone foundation and footings', hours: 300, materials: { fieldstone: 20, concrete: 10 } },
    { id: 'frame', name: 'Raise the log walls', hours: 1300, materials: { logs: 40, lumber: 10 } },
    { id: 'roof', name: 'Ridge beam, rafters and roof', hours: 500, materials: { lumber: 16, roofing: 24 } },
    { id: 'finish', name: 'Glass gable, floors, stairs, kitchen & bath', hours: 1040, materials: { lumber: 24, hardware: 30 } },
  ],
};

/** What came with the land (sim/improvements.ts): an old farmhouse, a manufactured home, a barn. Not in the build menu (the barn is). */
export const FARMHOUSE_BLUEPRINT: Blueprint = {
  kind: 'farmhouse',
  stages: [
    { id: 'site', name: 'Stake out', hours: 60, materials: {} },
    { id: 'foundation', name: 'Basement and footings', hours: 400, materials: { concrete: 30 } },
    { id: 'frame', name: 'Two-storey frame', hours: 1400, materials: { lumber: 60 } },
    { id: 'roof', name: 'Roof', hours: 400, materials: { lumber: 12, roofing: 20 } },
    { id: 'finish', name: 'Siding, kitchen, baths, finish', hours: 1600, materials: { lumber: 30, hardware: 30, fixtures: 2, cable: 6 } },
  ],
};
export const TRAILER_BLUEPRINT: Blueprint = {
  kind: 'trailer',
  stages: [
    { id: 'site', name: 'Grade the pad', hours: 20, materials: {} },
    { id: 'foundation', name: 'Piers and tie-downs', hours: 40, materials: { concrete: 4, hardware: 2 } },
    { id: 'frame', name: 'Set the home (dealer)', hours: 16, materials: {} },
    { id: 'roof', name: 'Seal the marriage line', hours: 16, materials: { roofing: 1 } },
    { id: 'finish', name: 'Skirting, steps, hookups', hours: 40, materials: { lumber: 4, hardware: 2 } },
  ],
};
/** 12 × 18 m pole barn with a hay loft: ≈ 900 person-hours; ≈ $36k of materials. */
export const BARN_BLUEPRINT: Blueprint = {
  kind: 'barn',
  stages: [
    { id: 'site', name: 'Stake out & grade the pad', hours: 40, materials: {} },
    { id: 'foundation', name: 'Set the poles in concrete', hours: 120, materials: { concrete: 12 } },
    { id: 'frame', name: 'Girts, trusses and the loft floor', hours: 380, materials: { lumber: 30 } },
    { id: 'roof', name: 'Metal roof', hours: 180, materials: { roofing: 22, hardware: 4 } },
    { id: 'finish', name: 'Board siding, big doors, stalls', hours: 180, materials: { lumber: 10, hardware: 6 } },
  ],
};
/** 6 × 8 m grandparents' cottage: ≈ 900 person-hours; ≈ $44k of materials (≈ $85k with a contractor). */
export const COTTAGE_BLUEPRINT: Blueprint = {
  kind: 'cottage',
  stages: [
    { id: 'site', name: 'Stake out & level the pad', hours: 30, materials: {} },
    { id: 'foundation', name: 'Footings and a stem wall', hours: 80, materials: { concrete: 8 } },
    { id: 'frame', name: 'Floor, stud walls and sheathing', hours: 330, materials: { lumber: 20 } },
    { id: 'roof', name: 'Rafters and metal roof', hours: 160, materials: { lumber: 5, roofing: 8 } },
    { id: 'finish', name: 'Lap siding, porch, windows, kitchen and bath', hours: 300, materials: { lumber: 7, hardware: 13, fixtures: 2, cable: 3 } },
  ],
};
/** 9 × 12 m steel pole building kit on a slab: ≈ 250 person-hours; ≈ $28k. */
const garageStages = (solar: boolean): StageDef[] => [
  { id: 'site', name: 'Stake out & grade the pad', hours: 20, materials: {} },
  { id: 'foundation', name: 'Pour the slab, set the posts', hours: 50, materials: { concrete: 16 } },
  { id: 'frame', name: 'Steel posts, girts and trusses (kit)', hours: 90, materials: { lumber: 8, hardware: 2 } },
  { id: 'roof', name: 'Corrugated roof and purlins', hours: 50, materials: { roofing: 12 } },
  { id: 'finish', name: solar ? 'Wall panels, two roll-up doors, 20 panels on the roof' : 'Wall panels and two roll-up doors', hours: solar ? 80 : 40, materials: solar ? { roofing: 12, hardware: 4, solar_panel: 20, inverter: 1, cable: 2 } : { roofing: 12, hardware: 4 } },
];
export const METAL_GARAGE_BLUEPRINT: Blueprint = { kind: 'metal_garage', stages: garageStages(false) };
export const GARAGE_SOLAR_BLUEPRINT: Blueprint = { kind: 'garage_solar', stages: garageStages(true) };

/** Kinds people live in (a kitchen, a roof over the family). */
export const HOMES: readonly string[] = ['timber_cabin', 'log_house', 'farmhouse', 'trailer', 'cottage'];
export const isHome = (kind: string) => HOMES.includes(kind);
/** People each home kind sleeps (matches the kit's `sleeps`). */
export const HOME_BEDS: Record<string, number> = { timber_cabin: 4, log_house: 6, farmhouse: 6, trailer: 4, cottage: 3 };
/** Beds under a finished roof on the place (shelter for the household and anyone taken in). */
export function homeBeds(s: { structures: ReadonlyArray<{ kind: string; stage: number }> }): number {
  return s.structures.reduce((a, st) => a + (BLUEPRINTS[st.kind] && st.stage >= BLUEPRINTS[st.kind].stages.length ? HOME_BEDS[st.kind] ?? 0 : 0), 0);
}

// ── Water & power (docs/DECISIONS.md: only through costed infrastructure) ──
const bp = (kind: string, stages: Array<[StageId, string, number, Partial<Stock>]>): Blueprint => ({ kind, stages: stages.map(([id, name, hours, materials]) => ({ id, name, hours, materials })) });

export const UTILITY_BLUEPRINTS: Blueprint[] = [
  bp('well_hand', [['site', 'Witch the spot, stake it', 2, {}], ['foundation', 'Dig the well by hand (≈ 7 m)', 120, {}], ['frame', 'Stone the shaft', 50, { fieldstone: 3 }], ['roof', 'Well-house roof', 10, { lumber: 1, roofing: 1 }], ['finish', 'Hand pump and cover', 8, { hardware: 1 }]]),
  bp('well_drilled', [['site', 'Stake the bore', 2, {}], ['foundation', 'Drill the well (contractor, ≈ 60 m)', 8, { drilling: 1 }], ['frame', 'Pump-house frame', 16, { lumber: 2 }], ['roof', 'Roof', 4, { roofing: 1 }], ['finish', 'Pump, pressure tank and controls', 16, { pump: 1, hardware: 1 }]]),
  bp('cistern', [['site', 'Stake it out', 2, {}], ['foundation', 'Level a gravel pad', 10, { concrete: 1 }], ['frame', 'Set the tank', 6, { tank: 1 }], ['roof', 'Gutters and downspouts', 10, { pipe: 1, hardware: 1 }], ['finish', 'First-flush filter and overflow', 6, { hardware: 1 }]]),
  bp('water_tower', [['site', 'Stake it out', 4, {}], ['foundation', 'Footings', 40, { concrete: 3 }], ['frame', 'Timber stand', 140, { lumber: 8 }], ['roof', 'Hoist the tank', 24, { tank: 1 }], ['finish', 'Plumbing, ladder and the lookout deck', 50, { pipe: 2, lumber: 2 }]]),
  bp('filtration_shed', [['site', 'Stake it out by the pressure tank', 1, {}], ['foundation', 'Gravel and a small slab', 4, { concrete: 1 }], ['frame', 'Frame the shed', 6, { lumber: 1 }], ['roof', 'Roof', 3, { roofing: 1 }], ['finish', 'Sediment and carbon filters, UV lamp, plumb it in', 6, { hardware: 2, pipe: 1 }]]),
  bp('solar_array', [['site', 'Stake the rows (facing south)', 4, {}], ['foundation', 'Post footings', 16, { concrete: 2 }], ['frame', 'Racking', 40, { lumber: 2, hardware: 2 }], ['roof', 'Mount 12 panels', 24, { solar_panel: 12 }], ['finish', 'Combiner box and conduit', 16, { cable: 1, hardware: 1 }]]),
  bp('battery_shed', [['site', 'Stake it out', 2, {}], ['foundation', 'Slab', 10, { concrete: 1 }], ['frame', 'Frame and insulate', 20, { lumber: 3 }], ['roof', 'Roof', 6, { roofing: 1 }], ['finish', 'Batteries, inverter, charge controller', 16, { battery: 4, inverter: 1, cable: 1 }]]),
  bp('generator_shed', [['site', 'Stake it out', 2, {}], ['foundation', 'Slab', 8, { concrete: 1 }], ['frame', 'Lean-to frame', 12, { lumber: 2 }], ['roof', 'Roof', 4, { roofing: 1 }], ['finish', 'Generator, transfer switch, fuel rack', 8, { generator: 1, hardware: 1, fuel: 4 }]]),
  bp('septic', [['site', 'Perc test and stake the field', 6, {}], ['foundation', 'Dig the tank hole and leach trenches (hired excavator)', 40, { excavator: 2 }], ['frame', 'Set the tank', 8, { septic_tank: 1 }], ['roof', 'Leach pipe in gravel', 30, { pipe: 3, concrete: 4 }], ['finish', 'Backfill, vent and lids', 16, { excavator: 1 }]]),
];

// ── Underground: dug with a hired excavator; the net earth dug out becomes spoil for berms ──
type Fit = Partial<Stock>;
/** A poured room: dig + slab, walls, roof slab + waterproofing + backfill, fit-out. `spoil` m³ net. */
const vaultBp = (kind: string, spoil: number, conc: [number, number, number], rebar: [number, number, number], dig: number, walls: number, roof: number, fitHours: number, fit: Fit, fitName = 'Vents, doors, wiring and the fit-out'): Blueprint => ({
  kind,
  stages: [
    { id: 'site', name: 'Stake out the dig', hours: 8, materials: {} },
    { id: 'foundation', name: 'Dig out (hired excavator), gravel bed, floor slab', hours: Math.round(dig * 2.5), materials: { excavator: Math.max(1, Math.round(spoil / 90)), concrete: conc[0], rebar: rebar[0] }, yields: { spoil } },
    { id: 'frame', name: 'Form, tie the rebar and pour the walls', hours: Math.round(walls * 2.5), materials: { concrete: conc[1], rebar: rebar[1], lumber: Math.ceil(conc[1] / 4) } },
    { id: 'roof', name: 'Pour the roof slab, waterproof, backfill', hours: Math.round(roof * 2.5), materials: { concrete: conc[2], rebar: rebar[2], membrane: Math.max(1, Math.round(spoil / 60)), excavator: 1 } },
    { id: 'finish', name: fitName, hours: Math.round(fitHours * 2), materials: fit },
  ],
});
export const BUNKER_BLUEPRINTS: Blueprint[] = [
  vaultBp('bunker_hatch', 45, [4, 10, 4], [1, 3, 1], 20, 70, 30, 24, { blast_door: 1, hardware: 2 }, 'Blast door, hatch lid and the ladder'),
  vaultBp('bunker_stairs', 110, [8, 18, 8], [2, 5, 2], 30, 120, 60, 36, { blast_door: 1, hardware: 2, lumber: 3, roofing: 2 }, 'Blast door, handrail and the headhouse'),
  vaultBp('bunker_corridor', 50, [6, 10, 6], [2, 3, 2], 20, 70, 40, 16, { hardware: 1, cable: 1 }),
  vaultBp('bunker_dorm', 120, [14, 22, 16], [4, 8, 6], 40, 140, 90, 60, { lumber: 10, hardware: 3, cable: 1 }, 'Vents, bunks, lockers, wiring'),
  vaultBp('bunker_galley', 120, [14, 22, 16], [4, 8, 6], 40, 140, 90, 70, { lumber: 6, hardware: 3, fixtures: 1, cable: 1 }, 'Vents, counter, sink, stove, wiring'),
  vaultBp('bunker_stores', 120, [14, 22, 16], [4, 8, 6], 40, 140, 90, 40, { lumber: 8, hardware: 2, cable: 1 }, 'Vents, shelving, wiring'),
  vaultBp('bunker_plant', 120, [14, 22, 16], [4, 8, 6], 40, 140, 90, 80, { nbc_filter: 1, battery: 2, generator: 1, tank: 1, cable: 2, hardware: 2 }, 'NBC filter, batteries, generator, water tank'),
  vaultBp('bunker_medical', 120, [14, 22, 16], [4, 8, 6], 40, 140, 90, 60, { fixtures: 1, lumber: 4, hardware: 3, cable: 1 }, 'Vents, sink, beds, cabinets, wiring'),
  vaultBp('bunker_comms', 50, [6, 10, 6], [2, 3, 2], 20, 70, 40, 40, { hardware: 4, cable: 2, lumber: 2 }, 'Radios, antenna lead, gun safe, wiring'),
  {
    kind: 'bunker_container',
    stages: [
      { id: 'site', name: 'Stake out the trench', hours: 6, materials: {} },
      { id: 'foundation', name: 'Dig the trench (hired excavator), gravel bed', hours: 24, materials: { excavator: 2, concrete: 2 }, yields: { spoil: 140 } },
      { id: 'frame', name: 'Set and brace the container, cut the doorways', hours: 40, materials: { container: 1, lumber: 6, hardware: 2 } },
      { id: 'roof', name: 'Waterproof and backfill (not too deep: a container crushes)', hours: 40, materials: { membrane: 3, excavator: 1 } },
      { id: 'finish', name: 'Bunks, table, shelves, vents', hours: 40, materials: { lumber: 6, hardware: 1 } },
    ],
  },
];

// ── Watch towers: the upgrade chain (sim/towers.ts). Each tier is built whole; an upgrade pays the new tier's bill and gets half the old one's back. ──
const concreteTower = (kind: string, mast: boolean, ring: boolean, turret: boolean): Blueprint => bp(kind, [
  ['site', 'Stake out beside the old one', 8, {}],
  ['foundation', 'Dig and pour the footing', ring ? 70 : 60, { concrete: ring ? 10 : 8, rebar: ring ? 4 : 3 }],
  ['frame', 'Form and pour the shaft', ring ? 240 : 200, { concrete: ring ? 18 : 14, rebar: ring ? 10 : 8, lumber: 4 }],
  ['roof', ring ? 'Armored cab, firing slits and roof' : 'Steel cab, firing slits and roof', ring ? 120 : 90, { rebar: ring ? 6 : 4, roofing: 4, hardware: ring ? 4 : 3, ...(mast ? { floodlights: 2 } : {}) }],
  ['finish', turret ? 'Gun ring, ammunition locker, remote turret, cameras and the data line' : ring ? 'Gun ring, ammunition locker, armor plate and the stair' : mast ? 'Light mast, wiring, switch and the stair' : 'Steel stair, hatch door and parapet', turret ? 140 : ring ? 110 : mast ? 90 : 70,
    turret ? { gun_mount: 1, turret_head: 1, cameras: 1, hardware: 4, rebar: 3, cable: 6 } : ring ? { gun_mount: 1, hardware: 4, rebar: 3, cable: 3 } : mast ? { hardware: 4, rebar: 3, cable: 3 } : { hardware: 4, rebar: 3 }],
]);
export const TOWER_BLUEPRINTS: Blueprint[] = [
  bp('rise_lookout', [['site', 'Stake out the rise', 4, {}], ['foundation', 'Pile, tamp and face the earth rise', 30, {}], ['frame', 'Timber nest platform and ladder', 14, { lumber: 2 }], ['roof', 'Sandbag parapet and a plank roof', 10, { sandbags: 1, roofing: 1 }], ['finish', 'Firing slots, a bench, a rope rail', 6, { hardware: 1 }]]),
  bp('watchtower_wood', [['site', 'Stake out beside the old one', 6, {}], ['foundation', 'Footings', 40, { concrete: 3 }], ['frame', 'Timber legs, bracing and the deck', 150, { lumber: 10 }], ['roof', 'Cab walls and a metal roof', 60, { lumber: 3, roofing: 3 }], ['finish', 'Ladder, trapdoor, rail and firing slots', 40, { lumber: 2, hardware: 2 }]]),
  concreteTower('watchtower_concrete', false, false, false),
  concreteTower('watchtower_flood', true, false, false),
  concreteTower('watchtower_mount', true, true, false),
  concreteTower('watchtower_turret', true, true, true),
];

// ── The gatehouse garage (sim/garage.ts): containers stacked into the wall at the gate, a steel gate through the middle, two bays of two slots ──
export const GATE_GARAGE_BLUEPRINT: Blueprint = bp('gate_garage', [
  ['site', 'Stake out in the gate gap and grade the pad', 16, {}],
  ['foundation', 'Pour the slab and the footings under the walls and the gate', 90, { concrete: 16, rebar: 5 }],
  ['frame', 'Set the containers: two bays, the gate frame between them', 80, { container: 4, rebar: 3 }],
  ['roof', 'Roof deck, parapet and the stairs up', 60, { roofing: 6, rebar: 2 }],
  ['finish', 'Steel gates, two roll-up doors, lights and the vehicle apron', 110, { hardware: 8, roofing: 2, cable: 2 }],
]);

export const BLUEPRINTS: Record<string, Blueprint> = Object.fromEntries(
  [CABIN_BLUEPRINT, OUTHOUSE_BLUEPRINT, WORKSHOP_BLUEPRINT, ROOT_CELLAR_BLUEPRINT, COOP_BLUEPRINT, GARDEN_BLUEPRINT, FIELD_BLUEPRINT, GREENHOUSE_BLUEPRINT, ORCHARD_BLUEPRINT, LOG_HOUSE_BLUEPRINT, FARMHOUSE_BLUEPRINT, TRAILER_BLUEPRINT, BARN_BLUEPRINT, COTTAGE_BLUEPRINT, METAL_GARAGE_BLUEPRINT, GARAGE_SOLAR_BLUEPRINT, ...UTILITY_BLUEPRINTS, ...BUNKER_BLUEPRINTS, ...TOWER_BLUEPRINTS, GATE_GARAGE_BLUEPRINT].map(b => [b.kind, b]));

/** Total bill of materials for a blueprint. */
export function totalBill(bp: Blueprint): Partial<Stock> {
  const out: Partial<Stock> = {};
  for (const s of bp.stages) for (const [k, v] of Object.entries(s.materials) as Array<[keyof Stock, number]>) out[k] = (out[k] ?? 0) + v;
  return out;
}

export function totalHours(bp: Blueprint): number {
  return bp.stages.reduce((a, s) => a + s.hours, 0);
}
