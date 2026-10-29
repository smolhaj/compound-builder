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

/** An outdoor wood-fired bread oven: a stone base, a cob dome, a flue and a little roof over the working side. */
export const WOOD_OVEN_BLUEPRINT: Blueprint = {
  kind: 'wood_oven',
  stages: [
    { id: 'site', name: 'Stake out', hours: 2, materials: {} },
    { id: 'foundation', name: 'Footing and stone base', hours: 16, materials: { fieldstone: 2, concrete: 1 } },
    { id: 'frame', name: 'Firebrick floor and cob dome', hours: 30, materials: { fieldstone: 1, concrete: 1 } },
    { id: 'roof', name: 'Flue and a roof over the working side', hours: 8, materials: { lumber: 1, roofing: 1 } },
    { id: 'finish', name: 'Lime wash, door and peel', hours: 4, materials: {} },
  ],
};

/** Four hives on stands behind an electric bear fence. */
export const APIARY_BLUEPRINT: Blueprint = {
  kind: 'apiary',
  stages: [
    { id: 'site', name: 'Pick a sunny, sheltered spot and stake it', hours: 2, materials: {} },
    { id: 'foundation', name: 'Gravel pad and hive stands', hours: 8, materials: { fieldstone: 1 } },
    { id: 'frame', name: 'Build the hive bodies and frames', hours: 14, materials: { lumber: 2 } },
    { id: 'roof', name: 'Bear fence and charger', hours: 10, materials: { wire: 2, hardware: 1 } },
    { id: 'finish', name: 'Windbreak, water dish, a strip of flowers', hours: 4, materials: { seedlings: 1 } },
  ],
};

/** A sugar house with an evaporator arch, a sap tank and a woodshed, at the edge of the maples. */
export const SUGAR_SHACK_BLUEPRINT: Blueprint = {
  kind: 'sugar_shack',
  stages: [
    { id: 'site', name: 'Stake out beside the maples', hours: 3, materials: {} },
    { id: 'foundation', name: 'Footing and the firebox pad', hours: 22, materials: { concrete: 2, fieldstone: 2 } },
    { id: 'frame', name: 'Post-and-beam sugar house', hours: 60, materials: { lumber: 8 } },
    { id: 'roof', name: 'Roof with a steam cupola', hours: 26, materials: { roofing: 6, lumber: 2 } },
    { id: 'finish', name: 'Evaporator arch, pans, tank and woodshed', hours: 34, materials: { hardware: 3 } },
  ],
};

/** A loafing shed, a fenced yard, troughs and a hay rack for the cow, the goats and the pigs. */
export const BARNYARD_BLUEPRINT: Blueprint = {
  kind: 'barnyard',
  stages: [
    { id: 'site', name: 'Stake out the yard', hours: 4, materials: {} },
    { id: 'foundation', name: 'Posts, a concrete slab and the apron', hours: 24, materials: { fieldstone: 2, concrete: 2 } },
    { id: 'frame', name: 'Loafing shed and stalls', hours: 54, materials: { lumber: 12 } },
    { id: 'roof', name: 'Roof and hay mow', hours: 32, materials: { roofing: 10, lumber: 3 } },
    { id: 'finish', name: 'Rail fence, gates, troughs and a hay rack', hours: 42, materials: { wire: 4, hardware: 3, lumber: 4 } },
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

// ── Housing styles (sim/housingStyles.ts): each priced from the one materials table; hours are person-hours for a competent owner-builder ──

/**
 * 12 × 15 m log lodge, two storeys over a stone-faced walkout basement, a wraparound deck and a glass gable (≈ 540 m² in all):
 * ≈ 8,000 person-hours (a crew of four for two years, or the family for five); ≈ $215k of bought materials plus about 90 saw logs from
 * your own timber. Only on a slope: the basement is cut into the hill (sim/slope.ts adds the retaining stone and the cut).
 */
export const LODGE_BLUEPRINT: Blueprint = {
  kind: 'lodge',
  stages: [
    { id: 'site', name: 'Stake out, cut the pad into the slope (hired excavator)', hours: 140, materials: { excavator: 4 } },
    { id: 'foundation', name: 'Footings, poured basement walls and slab, stone facing, waterproofing', hours: 1100, materials: { concrete: 100, rebar: 8, fieldstone: 40, membrane: 6 } },
    { id: 'frame', name: 'Raise the two-storey log walls, floors, stone piers and the deck frame', hours: 3000, materials: { logs: 90, lumber: 45 } },
    { id: 'roof', name: 'Ridge beam, rafters and the standing-seam roof', hours: 1100, materials: { lumber: 30, roofing: 40 } },
    { id: 'finish', name: 'Glass gable, stone chimney, floors, stairs, kitchen, four baths, wraparound deck and rails', hours: 2700, materials: { lumber: 40, hardware: 70, fixtures: 6, cable: 10, pipe: 8, fieldstone: 6 } },
  ],
};
/** The lodge with 25 × 400 W panels on its south roof (≈ 10 kW): the panels and an inverter on top of the lodge's bill. */
export const LODGE_SOLAR_BLUEPRINT: Blueprint = {
  kind: 'lodge_solar',
  stages: LODGE_BLUEPRINT.stages.map(st => st.id === 'finish'
    ? { ...st, name: st.name + ', 25 panels on the south roof', hours: st.hours + 120, materials: { ...st.materials, solar_panel: 25, inverter: 1, cable: (st.materials.cable ?? 0) + 3 } }
    : st),
};
/** 9 × 12 m two-storey fieldstone house, 45 cm walls: ≈ 4,800 person-hours (stone is slow); ≈ $108k of materials. */
export const STONE_HOUSE_BLUEPRINT: Blueprint = {
  kind: 'stone_house',
  stages: [
    { id: 'site', name: 'Stake out & level the pad', hours: 60, materials: {} },
    { id: 'foundation', name: 'Footings and a stone-faced stem wall', hours: 500, materials: { concrete: 30, rebar: 3, fieldstone: 12 } },
    { id: 'frame', name: 'Lay the stone walls, two storeys, and the floor joists', hours: 2300, materials: { fieldstone: 48, concrete: 6, lumber: 24 } },
    { id: 'roof', name: 'Rafters, sheathing and the metal roof', hours: 500, materials: { lumber: 14, roofing: 18 } },
    { id: 'finish', name: 'Windows, doors, floors, stairs, kitchen and baths, the stone chimney', hours: 1440, materials: { lumber: 20, hardware: 40, fixtures: 3, cable: 5, pipe: 4, fieldstone: 4 } },
  ],
};
/** 9 × 12 m two-storey post-and-beam house with insulated panels: ≈ 3,000 person-hours; ≈ $105k of materials. */
export const TIMBER_FRAME_BLUEPRINT: Blueprint = {
  kind: 'timber_frame',
  stages: [
    { id: 'site', name: 'Stake out & level the pad', hours: 50, materials: {} },
    { id: 'foundation', name: 'Footings and a stem wall', hours: 280, materials: { concrete: 22, rebar: 2, fieldstone: 4 } },
    { id: 'frame', name: 'Cut and raise the posts, beams and braces, then the insulated panels', hours: 1250, materials: { lumber: 48 } },
    { id: 'roof', name: 'Panel roof, sheathing and the standing-seam roof', hours: 420, materials: { lumber: 14, roofing: 16 } },
    { id: 'finish', name: 'Siding, windows, doors, floors, stairs, kitchen and baths', hours: 1000, materials: { lumber: 18, hardware: 38, fixtures: 3, cable: 5, pipe: 4 } },
  ],
};
/** Three 40 ft containers (two below, one across the top), cut, welded, foamed and fitted: ≈ 1,500 person-hours; ≈ $65k. */
export const CONTAINER_HOUSE_BLUEPRINT: Blueprint = {
  kind: 'container_house',
  stages: [
    { id: 'site', name: 'Stake out & level the pad', hours: 30, materials: {} },
    { id: 'foundation', name: 'Concrete piers and a steel grade beam', hours: 140, materials: { concrete: 12, rebar: 3 } },
    { id: 'frame', name: 'Crane the containers, weld, cut the openings, frame them out', hours: 380, materials: { container: 3, hardware: 6, lumber: 8 } },
    { id: 'roof', name: 'Insulated roof deck and membrane, shade roof over it', hours: 200, materials: { membrane: 4, roofing: 6, lumber: 4 } },
    { id: 'finish', name: 'Spray foam, glazing, stair, deck, kitchen, bath and the wiring', hours: 750, materials: { lumber: 10, hardware: 22, fixtures: 2, cable: 4, pipe: 3 } },
  ],
};
/**
 * 9 × 12 m single-storey adobe house of rammed earth, 45 cm walls, a viga ceiling and a covered portal: ≈ 2,600 person-hours; ≈ $55k.
 * The footings' borrow pit is where the wall earth comes from (the foundation stage yields the spoil the frame stage rams).
 */
export const ADOBE_HOUSE_BLUEPRINT: Blueprint = {
  kind: 'adobe_house',
  stages: [
    { id: 'site', name: 'Stake out & level the pad', hours: 40, materials: {} },
    { id: 'foundation', name: 'Dig the footings and the borrow pit (hired excavator), pour the stem wall', hours: 260, materials: { excavator: 3, concrete: 8 }, yields: { spoil: 70 } },
    { id: 'frame', name: 'Ram the earth walls in forms, cement-stabilised, and set the vigas', hours: 1100, materials: { spoil: 60, concrete: 6, lumber: 12 } },
    { id: 'roof', name: 'Viga and plank roof, membrane and the metal roof', hours: 360, materials: { lumber: 10, membrane: 6, roofing: 10 } },
    { id: 'finish', name: 'Plaster, deep-set windows, slab floor, portal, kitchen and bath', hours: 840, materials: { concrete: 6, hardware: 24, fixtures: 2, cable: 4, pipe: 3 } },
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
/** 6 × 5 m guest house: two beds, a bath and a kitchenette; ≈ 560 person-hours; ≈ $29k of materials. */
export const GUEST_HOUSE_BLUEPRINT: Blueprint = {
  kind: 'guest_house',
  stages: [
    { id: 'site', name: 'Stake out & level the pad', hours: 20, materials: {} },
    { id: 'foundation', name: 'Footings and a stem wall', hours: 55, materials: { concrete: 5 } },
    { id: 'frame', name: 'Floor, stud walls and sheathing', hours: 200, materials: { lumber: 13 } },
    { id: 'roof', name: 'Rafters and metal roof', hours: 100, materials: { lumber: 3, roofing: 5 } },
    { id: 'finish', name: 'Lap siding, porch, windows, bath and kitchenette', hours: 185, materials: { lumber: 5, hardware: 8, fixtures: 1, cable: 2 } },
  ],
};
/** 9 × 8 m one-level house for Mom, the in-laws or the grandparents: step-free, two bedrooms, a full kitchen; ≈ 1,250 person-hours; ≈ $63k. */
export const MOMS_HOUSE_BLUEPRINT: Blueprint = {
  kind: 'moms_house',
  stages: [
    { id: 'site', name: 'Stake out & level the pad', hours: 40, materials: {} },
    { id: 'foundation', name: 'Footings and a stem wall', hours: 110, materials: { concrete: 11 } },
    { id: 'frame', name: 'Floor, stud walls and sheathing', hours: 470, materials: { lumber: 30 } },
    { id: 'roof', name: 'Rafters and metal roof', hours: 220, materials: { lumber: 7, roofing: 12 } },
    { id: 'finish', name: 'Lap siding, covered porch and ramp, kitchen, bath and grab bars', hours: 410, materials: { lumber: 10, hardware: 18, fixtures: 3, cable: 4 } },
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
export const HOMES: readonly string[] = ['timber_cabin', 'log_house', 'farmhouse', 'trailer', 'cottage', 'guest_house', 'moms_house', 'lodge', 'lodge_solar', 'stone_house', 'timber_frame', 'container_house', 'adobe_house'];
const HOME_SET: ReadonlySet<string> = new Set(HOMES);
export const isHome = (kind: string) => HOME_SET.has(kind);
/** People each home kind sleeps (matches the kit's `sleeps`). */
export const HOME_BEDS: Record<string, number> = { timber_cabin: 4, log_house: 6, farmhouse: 6, trailer: 4, cottage: 3, guest_house: 2, moms_house: 4, lodge: 10, lodge_solar: 10, stone_house: 6, timber_frame: 6, container_house: 4, adobe_house: 4 };
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

// ── Self-sufficiency: bigger food and power tiers, the pond and the yard (docs/DECISIONS.md "Self-sufficient interior") ──
/** A 9 × 24 m production greenhouse (gutter-connected hoops, twin-wall polycarbonate, a heater): ≈ 280 person-hours, ≈ $30,000 of materials. */
export const GREENHOUSE_HEATED_BLUEPRINT: Blueprint = bp('greenhouse_heated', [
  ['site', 'Square and level the bed (ridges run north-south)', 12, {}],
  ['foundation', 'Gravel bed, a concrete curb and the heat-loop trench', 60, { concrete: 10, fieldstone: 2 }],
  ['frame', 'Bolt up the hoops and purlins', 90, { greenhouse_pro_kit: 1 }],
  ['roof', 'Glaze the roof, ridge vents and thermal curtain', 50, {}],
  ['finish', 'Heater, benches, drip lines and the end walls', 70, { hardware: 2, pipe: 2, cable: 1 }],
]);

/** Forty-eight trees on a grid (apple, pear, peach, plum), staked and guarded: ≈ 110 person-hours, ≈ $2,300. */
export const ORCHARD_GROVE_BLUEPRINT: Blueprint = bp('orchard_grove', [
  ['site', 'Stake the rows (4 m apart)', 8, {}],
  ['foundation', 'Strip the sod, dig the planting holes', 40, {}],
  ['frame', 'Plant the trees', 30, { fruit_trees: 48 }],
  ['roof', 'Stakes, trunk guards and the deer fence', 24, { wire: 4, lumber: 1 }],
  ['finish', 'Mulch rings and the first watering', 12, {}],
]);

/** The 20 kW solar farm: 50 × 400 W panels in five rows on ground racks, with three 6 kW inverters. */
export const SOLAR_FARM_BLUEPRINT: Blueprint = bp('solar_farm', [
  ['site', 'Stake the rows (facing south, 4 m apart)', 8, {}],
  ['foundation', 'Post footings for five rows', 50, { concrete: 8 }],
  ['frame', 'Steel racking', 90, { rebar: 2, hardware: 4 }],
  ['roof', 'Mount 50 panels', 80, { solar_panel: 50 }],
  ['finish', 'Combiner boxes, three inverters and the trench', 50, { inverter: 3, cable: 4, hardware: 1 }],
]);

/** The battery container: 60 kWh of lithium racks, an inverter and a fan, in a 20 ft shipping container. */
export const BATTERY_BANK_BLUEPRINT: Blueprint = bp('battery_bank', [
  ['site', 'Stake it out beside the array', 4, {}],
  ['foundation', 'Gravel and a slab', 20, { concrete: 3 }],
  ['frame', 'Set and insulate the container, cut the door', 30, { container: 1, lumber: 2 }],
  ['roof', 'Vents and a sun roof', 10, { roofing: 1 }],
  ['finish', 'Twelve battery racks, the inverter and the breaker panel', 40, { battery: 12, inverter: 1, cable: 2 }],
]);

/** A private trout and crayfish pond: dug with a hired excavator, lined, with a spillway and a standpipe. */
export const POND_BLUEPRINT: Blueprint = {
  kind: 'pond',
  stages: [
    { id: 'site', name: 'Stake the shore and the spillway', hours: 8, materials: {} },
    { id: 'foundation', name: 'Dig the basin (hired excavator, 2 m deep at the standpipe)', hours: 60, materials: { excavator: 6 }, yields: { spoil: 320 } },
    { id: 'frame', name: 'Line the basin and set the standpipe', hours: 40, materials: { membrane: 8, pipe: 2 } },
    { id: 'roof', name: 'Dress the spillway in stone and shape the bank', hours: 30, materials: { fieldstone: 2 } },
    { id: 'finish', name: 'Fill it, plant the margin, set the fish fence', hours: 30, materials: { wire: 2 } },
  ],
};

/** A lined freshwater reservoir: 400,000 L of stored water for the fields and the fire hydrants, no fish. */
export const RESERVOIR_BLUEPRINT: Blueprint = {
  kind: 'reservoir',
  stages: [
    { id: 'site', name: 'Stake the basin and the intake', hours: 6, materials: {} },
    { id: 'foundation', name: 'Dig the basin (hired excavator)', hours: 50, materials: { excavator: 5 }, yields: { spoil: 260 } },
    { id: 'frame', name: 'Line it, pour the concrete edge and the intake', hours: 70, materials: { membrane: 10, concrete: 6 } },
    { id: 'roof', name: 'Overflow, the pump pad and the fence', hours: 30, materials: { pipe: 3, wire: 2, hardware: 1 } },
    { id: 'finish', name: 'Fill it and test the intake screen', hours: 20, materials: { cable: 1 } },
  ],
};

/** A 9 × 12 m sheep barn: open-front stalls, a lambing pen and a hay mow. */
export const SHEEP_BARN_BLUEPRINT: Blueprint = bp('sheep_barn', [
  ['site', 'Stake out and level the pad', 12, {}],
  ['foundation', 'Posts and a gravel floor', 40, { concrete: 3, fieldstone: 2 }],
  ['frame', 'Pole frame and the stall rails', 100, { lumber: 14 }],
  ['roof', 'Trusses and metal roof', 60, { lumber: 4, roofing: 8 }],
  ['finish', 'Gates, lambing pen, hay racks and a water trough', 50, { hardware: 3, wire: 2, lumber: 2 }],
]);

/** The equipment yard: a graded gravel pad with a fence, a fuel tank and parking bays for the tractor and its implements. */
export const EQUIPMENT_YARD_BLUEPRINT: Blueprint = bp('equipment_yard', [
  ['site', 'Stake out and grade the yard', 8, {}],
  ['foundation', 'Crushed rock, compacted', 40, { fieldstone: 8 }],
  ['frame', 'Posts and a pipe-rail fence', 40, { lumber: 2, wire: 2 }],
  ['roof', 'Paint the bays and set the fuel tank', 10, { hardware: 1 }],
  ['finish', 'Hitch rails, a wash pad and a light pole', 16, { cable: 1, hardware: 1 }],
]);

/** The motor court (sim/motorCourt.ts): a graded gravel forecourt, black steel bar fence on three sides with a double gate, six marked bays and light poles. */
export const MOTOR_COURT_BLUEPRINT: Blueprint = bp('motor_court', [
  ['site', 'Stake out and grade the court', 10, {}],
  ['foundation', 'Crushed rock, compacted, and a curb along the wall', 56, { fieldstone: 12, concrete: 3 }],
  ['frame', 'Posts, rails and bars: the black fence on three sides', 70, { rebar: 7, hardware: 2, concrete: 3 }],
  ['roof', 'Hang the drive gate, paint the bays and the stop line', 24, { rebar: 2, hardware: 2 }],
  ['finish', 'Light poles, wiring and the call box', 20, { cable: 2, hardware: 2 }],
]);

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
  vaultBp('bunker_floorhatch', 55, [5, 12, 5], [1, 4, 1], 24, 80, 34, 28, { blast_door: 1, hardware: 4, lumber: 3 }, 'Insulated hatch lid, frame, stairs and lamps'),
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
  bp('watchtower_octagon', [['site', 'Stake out the eight corners', 6, {}], ['foundation', 'Footings and a course of fieldstone', 55, { concrete: 4 }], ['frame', 'Eight timber posts, girts and the deck', 190, { lumber: 13 }], ['roof', 'Eight-sided cab walls and a metal roof', 80, { lumber: 4, roofing: 4 }], ['finish', 'Ladder, trapdoor, rail and firing slots', 50, { lumber: 2, hardware: 3 }]]),
  concreteTower('watchtower_concrete', false, false, false),
  bp('watchtower_hex', [['site', 'Stake out beside the old one', 8, {}], ['foundation', 'Dig and pour the footing', 66, { concrete: 9, rebar: 3 }], ['frame', 'Form and pour the six-sided shaft', 230, { concrete: 16, rebar: 9, lumber: 5 }], ['roof', 'Steel cab, firing slits and roof', 100, { rebar: 4, roofing: 4, hardware: 3 }], ['finish', 'Steel stair, hatch and ladder', 54, { hardware: 4, rebar: 3 }]]),
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
  [CABIN_BLUEPRINT, OUTHOUSE_BLUEPRINT, WORKSHOP_BLUEPRINT, ROOT_CELLAR_BLUEPRINT, WOOD_OVEN_BLUEPRINT, APIARY_BLUEPRINT, SUGAR_SHACK_BLUEPRINT, BARNYARD_BLUEPRINT, COOP_BLUEPRINT, GARDEN_BLUEPRINT, FIELD_BLUEPRINT, GREENHOUSE_BLUEPRINT, ORCHARD_BLUEPRINT, LOG_HOUSE_BLUEPRINT, FARMHOUSE_BLUEPRINT, TRAILER_BLUEPRINT, BARN_BLUEPRINT, COTTAGE_BLUEPRINT, GUEST_HOUSE_BLUEPRINT, MOMS_HOUSE_BLUEPRINT, LODGE_BLUEPRINT, LODGE_SOLAR_BLUEPRINT, STONE_HOUSE_BLUEPRINT, TIMBER_FRAME_BLUEPRINT, CONTAINER_HOUSE_BLUEPRINT, ADOBE_HOUSE_BLUEPRINT, METAL_GARAGE_BLUEPRINT, GARAGE_SOLAR_BLUEPRINT, ...UTILITY_BLUEPRINTS, GREENHOUSE_HEATED_BLUEPRINT, ORCHARD_GROVE_BLUEPRINT, SOLAR_FARM_BLUEPRINT, BATTERY_BANK_BLUEPRINT, POND_BLUEPRINT, RESERVOIR_BLUEPRINT, SHEEP_BARN_BLUEPRINT, EQUIPMENT_YARD_BLUEPRINT, ...BUNKER_BLUEPRINTS, ...TOWER_BLUEPRINTS, GATE_GARAGE_BLUEPRINT, MOTOR_COURT_BLUEPRINT].map(b => [b.kind, b]));

/** Total bill of materials for a blueprint. */
export function totalBill(bp: Blueprint): Partial<Stock> {
  const out: Partial<Stock> = {};
  for (const s of bp.stages) for (const [k, v] of Object.entries(s.materials) as Array<[keyof Stock, number]>) out[k] = (out[k] ?? 0) + v;
  return out;
}

export function totalHours(bp: Blueprint): number {
  return bp.stages.reduce((a, s) => a + s.hours, 0);
}
