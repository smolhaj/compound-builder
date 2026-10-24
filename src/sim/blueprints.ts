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

/** 6 × 9 m timber cabin: ≈ 340 person-hours — two adults ≈ 3 weeks. */
export const CABIN_BLUEPRINT: Blueprint = {
  kind: 'timber_cabin',
  stages: [
    { id: 'site', name: 'Stake out & level the pad', hours: 24, materials: {} },
    { id: 'foundation', name: 'Fieldstone foundation', hours: 40, materials: { fieldstone: 6 } },
    { id: 'frame', name: 'Timber frame', hours: 120, materials: { lumber: 16 } },
    { id: 'roof', name: 'Roof', hours: 60, materials: { lumber: 4, roofing: 8 } },
    { id: 'finish', name: 'Siding, doors & windows', hours: 100, materials: { lumber: 4, hardware: 3 } },
  ],
};

/** Pit privy: a day or two's work. */
export const OUTHOUSE_BLUEPRINT: Blueprint = {
  kind: 'outhouse',
  stages: [
    { id: 'site', name: 'Pick the spot (downhill, away from water)', hours: 2, materials: {} },
    { id: 'foundation', name: 'Dig the pit, set the stone sill', hours: 12, materials: { fieldstone: 1 } },
    { id: 'frame', name: 'Frame and seat', hours: 8, materials: { lumber: 2 } },
    { id: 'roof', name: 'Roof', hours: 3, materials: { roofing: 1 } },
    { id: 'finish', name: 'Siding and door', hours: 6, materials: { lumber: 1 } },
  ],
};

/** 9 × 12 m steel shop on a slab: ≈ 420 person-hours. */
export const WORKSHOP_BLUEPRINT: Blueprint = {
  kind: 'workshop',
  stages: [
    { id: 'site', name: 'Stake out & grade the pad', hours: 24, materials: {} },
    { id: 'foundation', name: 'Pour the slab', hours: 50, materials: { concrete: 12 } },
    { id: 'frame', name: 'Post and girt frame', hours: 140, materials: { lumber: 20 } },
    { id: 'roof', name: 'Trusses and roof', hours: 80, materials: { lumber: 6, roofing: 14 } },
    { id: 'finish', name: 'Steel siding, bay door, benches', hours: 120, materials: { roofing: 10, hardware: 4, lumber: 4 } },
  ],
};

/** Earth-bermed stone cellar: most of the work is digging. */
export const ROOT_CELLAR_BLUEPRINT: Blueprint = {
  kind: 'root_cellar',
  stages: [
    { id: 'site', name: 'Stake out', hours: 8, materials: {} },
    { id: 'foundation', name: 'Dig into the slope, footings', hours: 90, materials: { concrete: 3 } },
    { id: 'frame', name: 'Stone walls and vault beams', hours: 80, materials: { fieldstone: 10, lumber: 4 } },
    { id: 'roof', name: 'Waterproof and berm the earth back over', hours: 50, materials: { roofing: 2 } },
    { id: 'finish', name: 'Door, vent, shelves and bins', hours: 30, materials: { lumber: 3, hardware: 1 } },
  ],
};

export const COOP_BLUEPRINT: Blueprint = {
  kind: 'chicken_coop',
  stages: [
    { id: 'site', name: 'Stake out', hours: 3, materials: {} },
    { id: 'foundation', name: 'Piers and run posts', hours: 10, materials: { fieldstone: 1 } },
    { id: 'frame', name: 'Coop frame, roosts, nest boxes', hours: 24, materials: { lumber: 4 } },
    { id: 'roof', name: 'Roof', hours: 6, materials: { roofing: 2 } },
    { id: 'finish', name: 'Siding, wire run, ramp', hours: 18, materials: { lumber: 1, hardware: 2 } },
  ],
};

export const GARDEN_BLUEPRINT: Blueprint = {
  kind: 'garden',
  stages: [
    { id: 'site', name: 'Lay out the beds', hours: 4, materials: {} },
    { id: 'foundation', name: 'Break sod and double-dig', hours: 30, materials: {} },
    { id: 'frame', name: 'Build the raised beds', hours: 20, materials: { lumber: 5 } },
    { id: 'roof', name: 'Deer fence and gate', hours: 20, materials: { lumber: 3, hardware: 1 } },
    { id: 'finish', name: 'Compost, soil and planting', hours: 14, materials: { hardware: 1 } },
  ],
};

/** 9 × 15 m log house from your own timber: ≈ 800 person-hours (a season for two). */
export const LOG_HOUSE_BLUEPRINT: Blueprint = {
  kind: 'log_house',
  stages: [
    { id: 'site', name: 'Stake out & level the pad', hours: 32, materials: {} },
    { id: 'foundation', name: 'Stone foundation and footings', hours: 80, materials: { fieldstone: 14, concrete: 4 } },
    { id: 'frame', name: 'Raise the log walls', hours: 320, materials: { logs: 40, lumber: 6 } },
    { id: 'roof', name: 'Ridge beam, rafters and roof', hours: 130, materials: { lumber: 10, roofing: 18 } },
    { id: 'finish', name: 'Glass gable, floors, stairs, kitchen & bath', hours: 240, materials: { lumber: 12, hardware: 8 } },
  ],
};

// ── Water & power (docs/DECISIONS.md: only through costed infrastructure) ──
const bp = (kind: string, stages: Array<[StageId, string, number, Partial<Stock>]>): Blueprint => ({ kind, stages: stages.map(([id, name, hours, materials]) => ({ id, name, hours, materials })) });

export const UTILITY_BLUEPRINTS: Blueprint[] = [
  bp('well_hand', [['site', 'Witch the spot, stake it', 2, {}], ['foundation', 'Dig the well by hand (≈ 7 m)', 70, {}], ['frame', 'Stone the shaft', 24, { fieldstone: 3 }], ['roof', 'Well-house roof', 6, { lumber: 1, roofing: 1 }], ['finish', 'Hand pump and cover', 5, { hardware: 1 }]]),
  bp('well_drilled', [['site', 'Stake the bore', 2, {}], ['foundation', 'Drill the well (contractor, ≈ 60 m)', 8, { drilling: 1 }], ['frame', 'Pump-house frame', 16, { lumber: 2 }], ['roof', 'Roof', 4, { roofing: 1 }], ['finish', 'Pump, pressure tank and controls', 12, { pump: 1, hardware: 1 }]]),
  bp('cistern', [['site', 'Stake it out', 2, {}], ['foundation', 'Level a gravel pad', 10, { concrete: 1 }], ['frame', 'Set the tank', 6, { tank: 1 }], ['roof', 'Gutters and downspouts', 10, { pipe: 1, hardware: 1 }], ['finish', 'First-flush filter and overflow', 6, { hardware: 1 }]]),
  bp('water_tower', [['site', 'Stake it out', 4, {}], ['foundation', 'Footings', 24, { concrete: 3 }], ['frame', 'Timber stand', 60, { lumber: 8 }], ['roof', 'Hoist the tank', 16, { tank: 1 }], ['finish', 'Plumbing, ladder and the lookout deck', 20, { pipe: 2, lumber: 2 }]]),
  bp('solar_array', [['site', 'Stake the rows (facing south)', 4, {}], ['foundation', 'Post footings', 16, { concrete: 2 }], ['frame', 'Racking', 24, { lumber: 2, hardware: 1 }], ['roof', 'Mount 12 panels', 16, { solar_panel: 12 }], ['finish', 'Combiner box and conduit', 8, { cable: 1, hardware: 1 }]]),
  bp('battery_shed', [['site', 'Stake it out', 2, {}], ['foundation', 'Slab', 10, { concrete: 1 }], ['frame', 'Frame and insulate', 20, { lumber: 3 }], ['roof', 'Roof', 6, { roofing: 1 }], ['finish', 'Batteries, inverter, charge controller', 16, { battery: 4, inverter: 1, cable: 1 }]]),
  bp('generator_shed', [['site', 'Stake it out', 2, {}], ['foundation', 'Slab', 8, { concrete: 1 }], ['frame', 'Lean-to frame', 12, { lumber: 2 }], ['roof', 'Roof', 4, { roofing: 1 }], ['finish', 'Generator, transfer switch, fuel rack', 8, { generator: 1, hardware: 1, fuel: 4 }]]),
  bp('septic', [['site', 'Perc test and stake the field', 6, {}], ['foundation', 'Dig the tank hole and leach trenches', 60, {}], ['frame', 'Set the tank', 8, { septic_tank: 1 }], ['roof', 'Leach pipe in gravel', 20, { pipe: 3, concrete: 2 }], ['finish', 'Backfill, vent and lids', 10, {}]]),
];

// ── Underground: dug with a hired excavator; the net earth dug out becomes spoil for berms ──
type Fit = Partial<Stock>;
/** A poured room: dig + slab, walls, roof slab + waterproofing + backfill, fit-out. `spoil` m³ net. */
const vaultBp = (kind: string, spoil: number, conc: [number, number, number], rebar: [number, number, number], dig: number, walls: number, roof: number, fitHours: number, fit: Fit, fitName = 'Vents, doors, wiring and the fit-out'): Blueprint => ({
  kind,
  stages: [
    { id: 'site', name: 'Stake out the dig', hours: 6, materials: {} },
    { id: 'foundation', name: 'Dig out (hired excavator), gravel bed, floor slab', hours: dig, materials: { excavator: Math.max(1, Math.round(spoil / 90)), concrete: conc[0], rebar: rebar[0] }, yields: { spoil } },
    { id: 'frame', name: 'Form, tie the rebar and pour the walls', hours: walls, materials: { concrete: conc[1], rebar: rebar[1], lumber: Math.ceil(conc[1] / 4) } },
    { id: 'roof', name: 'Pour the roof slab, waterproof, backfill', hours: roof, materials: { concrete: conc[2], rebar: rebar[2], membrane: Math.max(1, Math.round(spoil / 60)), excavator: 1 } },
    { id: 'finish', name: fitName, hours: fitHours, materials: fit },
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

export const BLUEPRINTS: Record<string, Blueprint> = Object.fromEntries(
  [CABIN_BLUEPRINT, OUTHOUSE_BLUEPRINT, WORKSHOP_BLUEPRINT, ROOT_CELLAR_BLUEPRINT, COOP_BLUEPRINT, GARDEN_BLUEPRINT, LOG_HOUSE_BLUEPRINT, ...UTILITY_BLUEPRINTS, ...BUNKER_BLUEPRINTS].map(b => [b.kind, b]));

/** Total bill of materials for a blueprint. */
export function totalBill(bp: Blueprint): Partial<Stock> {
  const out: Partial<Stock> = {};
  for (const s of bp.stages) for (const [k, v] of Object.entries(s.materials) as Array<[keyof Stock, number]>) out[k] = (out[k] ?? 0) + v;
  return out;
}

export function totalHours(bp: Blueprint): number {
  return bp.stages.reduce((a, s) => a + s.hours, 0);
}
