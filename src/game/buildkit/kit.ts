/**
 * Build kit — the pieces the player places (GDS §2.2 "kits plus
 * customisation"; modular foundation → walls → roof, each with a material).
 * Pure data + placement rules; geometry lives in cabinGeometry.ts.
 *
 * Grid: structures snap to a 3 m sub-grid (docs/DECISIONS.md) = 0.5 world
 * units. Footprints are in cells; `rot` turns in quarter turns.
 */
import type { KitMaterialId } from './materials';

/** World units per build cell (3 m). */
export const CELL = 0.5;

export interface KitPieceDef {
  id: string;
  name: string;
  /** Footprint in cells, before rotation (x across the gable, z along the ridge). */
  cellsX: number;
  cellsZ: number;
  /** Extra clearance (cells) in front of the door side (+z) — porch and steps. */
  frontCells: number;
  /** Materials per part (the player will choose later). */
  parts: { foundation: KitMaterialId; walls: KitMaterialId; roof: KitMaterialId };
  /** Steepest ground (rise / run) under the footprint before it needs a bigger pad. */
  maxSlope: number;
  /** Build-menu group and one-line description. */
  category: 'home' | 'work' | 'food' | 'sanitation' | 'water' | 'power' | 'bunker' | 'defense';
  blurb: string;
  /** Floor height above the pad (walking height inside) and porch depth in front of the +z wall (world units). */
  floorY: number;
  porch: number;
  /** A stair or a ramp: it joins two levels along its length (local z); the ground must climb at least `min` and at most `max` (world units) from one end to the other, and it takes no pad of its own. */
  climbs?: { min: number; max: number };
  /** A pier: it must reach from dry land out over the water (and stands on the water, not on a graded pad). */
  waterside?: boolean;
  /** People it sleeps (0 = not a home). */
  sleeps: number;
  /** Interior lamp position (local, above the floor), or null for no lamplight. */
  light: [number, number, number] | null;
  /**
   * Level it occupies (underground.ts): bunker rooms are underground (they
   * don't clash with what stands above them); entrances, wells, cellars and
   * septic fields reach both. Default surface.
   */
  level?: 'surface' | 'underground' | 'both';
  /** People it shelters in an emergency (bunker rooms). */
  shelters?: number;
  /** Floodlights on a mast: a hard white lamp over the approach at night, with power (towers.ts tier 4+). */
  floodlit?: boolean;
  /**
   * A walkout basement (the lodge): the ground must fall toward the back (local −z) by at least this much (rise over run between the
   * front and back halves of the footprint), so the basement's back wall stands out of the hill and its front is cut into it.
   */
  walkoutFall?: number;
}

export const TIMBER_CABIN: KitPieceDef = {
  id: 'timber_cabin', name: 'Timber cabin', category: 'home',
  blurb: '6 × 9 m one-room cabin with a bedroom and a kids\' loft, wood stove, porch.',
  cellsX: 2,   // 6 m
  cellsZ: 3,   // 9 m
  frontCells: 1,
  parts: { foundation: 'fieldstone', walls: 'timber_lap', roof: 'metal_roof' },
  maxSlope: 0.35, floorY: 0.09, porch: 0.42, sleeps: 4, light: [-0.2, 0.32, -0.05],
};

/** A flight of stone steps between two terraces (3 m wide, 6 m long: climbs 0.45 m to 3.6 m at up to 31 degrees). Set along the slope with R. */
export const TERRACE_STAIR: KitPieceDef = {
  id: 'terrace_stair', name: 'Stone stair', category: 'work',
  blurb: 'A flight of dry-laid fieldstone steps with cheek walls and a pipe handrail, set along the slope between two terraces. Turn it with R until it runs up the hill; it climbs from 0.5 m to 3.6 m.',
  cellsX: 1, cellsZ: 2, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'fieldstone', roof: 'steel' },
  maxSlope: 3, floorY: 0, porch: 0, sleeps: 0, light: null, climbs: { min: 0.075, max: 0.6 },
};

/** A gravel ramp between two terraces (3 m wide, 12 m long: climbs up to 1.2 m): for the cart, the wheelbarrow and the wheelchair. */
export const TERRACE_RAMP: KitPieceDef = {
  id: 'terrace_ramp', name: 'Terrace ramp', category: 'work',
  blurb: 'A packed-gravel ramp in timber curbs with a rail, set along the slope between two terraces: a 1:10 grade for the garden cart, the wheelbarrow, a wheelchair and the tractor trailer. Climbs up to 1.2 m over 12 m.',
  cellsX: 1, cellsZ: 4, frontCells: 0,
  parts: { foundation: 'gravel', walls: 'wood_dark', roof: 'steel' },
  maxSlope: 3, floorY: 0, porch: 0, sleeps: 0, light: null, climbs: { min: 0.05, max: 0.2 },
};

export const TERRACE_ORDER: readonly string[] = ['terrace_stair', 'terrace_ramp'];

export const OUTHOUSE: KitPieceDef = {
  id: 'outhouse', name: 'Outhouse', category: 'sanitation',
  blurb: 'Pit privy with a crescent-moon door. Keep it downhill and well away from the water.',
  cellsX: 1, cellsZ: 1, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.45, floorY: 0.03, porch: 0, sleeps: 0, light: null,
};

export const WORKSHOP: KitPieceDef = {
  id: 'workshop', name: 'Workshop & garage', category: 'work',
  blurb: '9 × 12 m steel-sided shop on a slab: a vehicle bay, workbench, tool wall, forge corner.',
  cellsX: 3, cellsZ: 4, frontCells: 1,
  parts: { foundation: 'concrete', walls: 'metal_siding', roof: 'metal_roof' },
  maxSlope: 0.25, floorY: 0.03, porch: 0, sleeps: 0, light: [0, 0.4, 0],
};

export const ROOT_CELLAR: KitPieceDef = {
  id: 'root_cellar', name: 'Root cellar', category: 'food',
  blurb: 'Earth-bermed stone vault: cool, dark and steady for potatoes, roots, crocks and canning jars.',
  cellsX: 2, cellsZ: 2, frontCells: 1,
  parts: { foundation: 'fieldstone', walls: 'fieldstone', roof: 'earth' },
  maxSlope: 0.5, floorY: 0.02, porch: 0, sleeps: 0, light: [0, 0.25, -0.1], level: 'both',
};

export const WOOD_OVEN: KitPieceDef = {
  id: 'wood_oven', name: 'Wood-fired oven', category: 'food',
  blurb: 'A cob dome on a stone base with a little roof: bread, roasts and pies without the house stove. Burns a little wood on bake days.',
  cellsX: 1, cellsZ: 1, frontCells: 1,
  parts: { foundation: 'fieldstone', walls: 'whitewash', roof: 'metal_roof' },
  maxSlope: 0.3, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

export const APIARY: KitPieceDef = {
  id: 'apiary', name: 'Apiary', category: 'food',
  blurb: 'Four hives behind an electric bear fence: honey, wax, and a better garden and orchard. Bees come in spring from the Shop.',
  cellsX: 2, cellsZ: 2, frontCells: 1,
  parts: { foundation: 'fieldstone', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.3, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

export const SUGAR_SHACK: KitPieceDef = {
  id: 'sugar_shack', name: 'Sugar shack & bush', category: 'food',
  blurb: 'An evaporator house at the edge of the maples, a sap tank and a woodshed. Late-winter syrup where the woods have sugar maples.',
  cellsX: 3, cellsZ: 3, frontCells: 0,
  parts: { foundation: 'concrete', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.5, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

export const BARNYARD: KitPieceDef = {
  id: 'barnyard', name: 'Barnyard', category: 'food',
  blurb: 'A loafing shed, a fenced yard, troughs and a hay rack: a roof and a place for a cow, goats and pigs. Fewer sick animals, and manure for the fields.',
  cellsX: 4, cellsZ: 3, frontCells: 0,
  parts: { foundation: 'concrete', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.3, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

export const CHICKEN_COOP: KitPieceDef = {
  id: 'chicken_coop', name: 'Chicken coop & run', category: 'food',
  blurb: 'Raised coop with roosts and nest boxes, a covered wire run for a dozen hens.',
  cellsX: 2, cellsZ: 2, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.4, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

export const GARDEN: KitPieceDef = {
  id: 'garden', name: 'Kitchen garden', category: 'food',
  blurb: 'Six raised beds inside a deer fence, compost bins and a rain barrel.',
  cellsX: 3, cellsZ: 3, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.3, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

export const FIELD: KitPieceDef = {
  id: 'field', name: 'Field plot', category: 'food',
  blurb: 'A quarter acre in potatoes, dry beans and wheat inside a deer fence: the calories a garden can\'t grow.',
  cellsX: 10, cellsZ: 10, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.25, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

export const GREENHOUSE: KitPieceDef = {
  id: 'greenhouse', name: 'Greenhouse', category: 'food',
  blurb: '12 × 24 ft aluminum and polycarbonate greenhouse with benches of seedling trays: the garden six weeks earlier and later, greens all winter.',
  cellsX: 2, cellsZ: 3, frontCells: 0,
  parts: { foundation: 'concrete', walls: 'glass', roof: 'glass' },
  maxSlope: 0.2, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

export const ORCHARD: KitPieceDef = {
  id: 'orchard', name: 'Orchard', category: 'food',
  blurb: 'Twelve trees in four rows: apple, pear, cherry and plum. First plums in the third year, apples and cherries in the fourth, pears in the fifth; a full crop of about 1,350 lb by year 7 to 10. Blossom in spring (frost takes it in a cold hollow), bees help, prune in winter, water the young trees.',
  cellsX: 5, cellsZ: 5, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.35, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

/** The production greenhouse (sim/greenhouse.ts): eight times the glass of the hobby kit, heated through the winter. */
export const GREENHOUSE_HEATED: KitPieceDef = {
  id: 'greenhouse_heated', name: 'Heated greenhouse', category: 'food',
  blurb: '9 × 24 m glass production house with a heater: fresh greens and tomatoes through the winter (≈ 4,200 kcal a day), the garden ten weeks longer. Heated by the compound\'s power (up to ≈ 34 kWh a day in January) or a wood boiler.',
  cellsX: 3, cellsZ: 8, frontCells: 1,
  parts: { foundation: 'concrete', walls: 'glass', roof: 'glass' },
  maxSlope: 0.12, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

/** The dock (sim/waterfront.ts): a timber pier with two slips. */
export const BOAT_DOCK: KitPieceDef = {
  id: 'boat_dock', name: 'Boat dock', category: 'work',
  blurb: 'A 3 × 15 m timber pier on piles, two slips and a ladder, running from the bank out over a lake or a river. Keep a jon boat or a skiff at it: lake fish at three times the creek\'s rate, a way off the place by water. It is also a landing for anyone with a boat, and the lake skims over in winter: haul the boats out first.',
  cellsX: 1, cellsZ: 5, frontCells: 0,
  parts: { foundation: 'wood_dark', walls: 'wood_mid', roof: 'wood_mid' },
  maxSlope: 9, floorY: 0.0, porch: 0, sleeps: 0, light: null, waterside: true,
};
/** The marina: a T-head pier with six slips, a fuel dock, a boat shed and a bubbler that keeps the ice off the boats. */
export const MARINA: KitPieceDef = {
  id: 'marina', name: 'Marina', category: 'work',
  blurb: 'A 4.5 × 21 m pier with a T-head, six slips, a fuel pump and a boat shed with a bubbler that keeps the ice off the hulls all winter (it runs on power). The way to keep a fleet on the water, and the biggest landing on the shore.',
  cellsX: 2, cellsZ: 7, frontCells: 0,
  parts: { foundation: 'wood_dark', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 9, floorY: 0.0, porch: 0, sleeps: 0, light: [0, 0.5, -0.3], waterside: true,
};
/** The polytunnel (sim/tunnels.ts): hoops and one skin of film, the cheap way to a longer season. */
export const POLYTUNNEL: KitPieceDef = {
  id: 'polytunnel', name: 'Polytunnel', category: 'food',
  blurb: '6 × 12 m hoop house with one skin of poly: the garden three weeks earlier and later and cold-hardy greens through the winter (250 kcal a day), for a fraction of glass. The film lasts four years; wind and snow tear it. Drip line from the pond.',
  cellsX: 2, cellsZ: 4, frontCells: 0,
  parts: { foundation: 'wood_dark', walls: 'polycarb', roof: 'polycarb' },
  maxSlope: 0.15, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};
/** The high tunnel: nine metres of gothic frame with roll-up sides. */
export const HIGH_TUNNEL: KitPieceDef = {
  id: 'high_tunnel', name: 'High tunnel', category: 'food',
  blurb: '9 × 30 m gothic frame with roll-up sides and a double door: the garden five weeks earlier and later and 520 kcal a day of winter greens, unheated. Sheds snow badly (knock it off), tears in a gale on a windy spot, and breeds whitefly and mould in damp air. Four-year film.',
  cellsX: 3, cellsZ: 10, frontCells: 0,
  parts: { foundation: 'concrete', walls: 'polycarb', roof: 'polycarb' },
  maxSlope: 0.1, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};
/** The aquaponics bay (sim/aquaponics.ts). */
export const AQUAPONICS: KitPieceDef = {
  id: 'aquaponics', name: 'Aquaponics bay', category: 'food',
  blurb: 'A glazed 6 × 12 m bay with four 1,000 L tilapia tanks feeding 20 m² of media beds: fish (about 450 g in six months) and greens all year (≈ 420 kcal a day) on pellets and power. The heater and the air pump must never stop: a blackout in warm water is a fish kill. Wire it.',
  cellsX: 2, cellsZ: 4, frontCells: 1,
  parts: { foundation: 'concrete', walls: 'glass', roof: 'glass' },
  maxSlope: 0.08, floorY: 0.0, porch: 0, sleeps: 0, light: [0, 0.6, 0],
};

/** Forty-eight trees: the orchard at farm scale. */
export const ORCHARD_GROVE: KitPieceDef = {
  id: 'orchard_grove', name: 'Orchard grove', category: 'food',
  blurb: 'Forty-eight trees in eight rows: apple, pear, cherry and plum, four plots of the orchard. Prune it in winter, hens help with the pests, bees set the blossom; a full crop of about 5,400 lb by year 7 to 10.',
  cellsX: 8, cellsZ: 6, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.3, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

/** The private pond: the dug basin, the berm and the fish fence. */
export const POND: KitPieceDef = {
  id: 'pond', name: 'Pond', category: 'food',
  blurb: 'A dug, lined pond for trout and crayfish, 18 × 18 m with a spillway, a dock and a fish fence. Holds 300,000 L for the garden and the fire (not drinking water). Wire it for an aerator.',
  cellsX: 6, cellsZ: 6, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.1, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

/** A lined freshwater reservoir. */
export const RESERVOIR: KitPieceDef = {
  id: 'reservoir', name: 'Reservoir', category: 'water',
  blurb: 'A lined 15 × 12 m reservoir with a concrete edge, an intake and a pump pad: 400,000 L of stored water, drinkable once you filter it (filtration shed or a filter). No fish.',
  cellsX: 5, cellsZ: 4, frontCells: 0,
  parts: { foundation: 'concrete', walls: 'concrete', roof: 'metal_roof' },
  maxSlope: 0.1, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

/** The sheep barn (livestock.ts): a roof for a flock of 30 in winter and a paddock. */
export const SHEEP_BARN: KitPieceDef = {
  id: 'sheep_barn', name: 'Sheep barn', category: 'food',
  blurb: '9 × 12 m open-front sheep barn with pens, hay racks, a lambing pen and a paddock: shelter for 30 sheep in winter. The family barn shelters 12.',
  cellsX: 3, cellsZ: 4, frontCells: 2,
  parts: { foundation: 'fieldstone', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.25, floorY: 0.03, porch: 0, sleeps: 0, light: [0, 0.3, 0],
};

/** The equipment yard (sim/farm.ts slot API): bays for the tractor and its implements. */
export const EQUIPMENT_YARD: KitPieceDef = {
  id: 'equipment_yard', name: 'Equipment yard', category: 'work',
  blurb: '12 × 12 m fenced gravel yard with six marked bays, a fuel tank, a hitch rail and a wash pad: the place for the tractor and its implements.',
  cellsX: 4, cellsZ: 4, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'metal_siding', roof: 'metal_roof' },
  maxSlope: 0.15, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

export const LOG_HOUSE: KitPieceDef = {
  id: 'log_house', name: 'Log house', category: 'home',
  blurb: '9 × 15 m house of your own logs: great room with a glass gable and stone fireplace, bath, three bedrooms.',
  cellsX: 3, cellsZ: 5, frontCells: 1,
  parts: { foundation: 'fieldstone', walls: 'log_wall', roof: 'metal_roof' },
  maxSlope: 0.3, floorY: 0.1, porch: 0.45, sleeps: 6, light: [0, 0.34, 0],
};

/**
 * The lodge (sim/housingStyles.ts): 12 × 15 m log lodge on a stone-faced walkout basement, a wraparound deck all round (1.5 m, inside the
 * footprint) and a glass gable. 15 × 18 m with the deck; floorY is the basement's height (3 m): the pad is the basement floor. Slope only.
 */
export const LODGE: KitPieceDef = {
  id: 'lodge', name: 'Lodge', category: 'home',
  blurb: 'A 12 × 15 m log lodge on a stone-faced walkout basement: two storeys under a green standing-seam roof, a wraparound deck on stone piers, a glass gable and a stone chimney. The basement (cellar, storage, mechanical room) is cut into the slope; its walkout side faces downhill.',
  cellsX: 5, cellsZ: 6, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'log_wall', roof: 'metal_roof_green' },
  maxSlope: 0.45, floorY: 0.5, porch: 0, sleeps: 10, light: [0, 0.55, 0], walkoutFall: 0.07,
};
/** The lodge with 25 × 400 W panels on its south roof slope (≈ 10 kW). */
export const LODGE_SOLAR: KitPieceDef = {
  ...LODGE, id: 'lodge_solar', name: 'Lodge with a solar roof',
  blurb: 'The same lodge with 25 × 400 W panels on its south roof slope: about 10 kW, 36 kWh on a summer day. Wire it to a battery shed beside it.',
};
/** The stone house: 9 × 12 m, two storeys of 45 cm fieldstone walls. */
export const STONE_HOUSE: KitPieceDef = {
  id: 'stone_house', name: 'Stone house', category: 'home',
  blurb: 'A two-storey 9 × 12 m house of 45 cm fieldstone walls under a slate-grey metal roof: warm in winter, cool in summer, slow to burn and hard to shoot through. Stone is slow to lay.',
  cellsX: 3, cellsZ: 4, frontCells: 1,
  parts: { foundation: 'fieldstone', walls: 'fieldstone', roof: 'metal_roof_grey' },
  maxSlope: 0.3, floorY: 0.12, porch: 0.3, sleeps: 6, light: [0, 0.4, 0],
};
/** The timber-frame house: 9 × 12 m, two storeys of pegged posts and beams with insulated panel walls. */
export const TIMBER_FRAME_HOUSE: KitPieceDef = {
  id: 'timber_frame', name: 'Timber-frame house', category: 'home',
  blurb: 'A two-storey 9 × 12 m post-and-beam house: pegged timbers showing outside, plaster-faced insulated panels between them, a glass gable. The best-insulated wall in the kit.',
  cellsX: 3, cellsZ: 4, frontCells: 1,
  parts: { foundation: 'concrete', walls: 'plaster', roof: 'metal_roof_green' },
  maxSlope: 0.3, floorY: 0.1, porch: 0.3, sleeps: 6, light: [0, 0.4, 0],
};
/** The container house: three 40 ft containers, two below and one across the top. */
export const CONTAINER_HOUSE: KitPieceDef = {
  id: 'container_house', name: 'Container house', category: 'home',
  blurb: 'Three 40 ft shipping containers: two side by side below, one across the top, cut for big glass, spray-foamed, with a deck and stair. The quickest house in the kit; steel is tough and cold.',
  cellsX: 2, cellsZ: 5, frontCells: 1,
  parts: { foundation: 'concrete', walls: 'container_rust', roof: 'metal_roof_grey' },
  maxSlope: 0.25, floorY: 0.1, porch: 0.3, sleeps: 4, light: [0, 0.3, 0],
};
/** The adobe house: 9 × 12 m, one storey, 45 cm rammed earth with vigas and a covered portal. */
export const ADOBE_HOUSE: KitPieceDef = {
  id: 'adobe_house', name: 'Adobe house', category: 'home',
  blurb: 'A one-storey 9 × 12 m rammed-earth house, 45 cm walls, log vigas, deep-set windows, a covered portal and a corner fireplace. Dry country only; the walls are rammed from the earth you dig for the footings.',
  cellsX: 3, cellsZ: 4, frontCells: 1,
  parts: { foundation: 'concrete', walls: 'adobe', roof: 'metal_roof_grey' },
  maxSlope: 0.2, floorY: 0.08, porch: 0.34, sleeps: 4, light: [0, 0.3, 0],
};

/** What comes with improved land (sim/improvements.ts); the barn is also in the build menu. */
export const FARMHOUSE: KitPieceDef = {
  id: 'farmhouse', name: 'Old farmhouse', category: 'home',
  blurb: 'A two-storey 9 × 12 m farmhouse from the last century: front porch, kitchen and parlor, bedrooms up, a basement.',
  cellsX: 3, cellsZ: 4, frontCells: 1,
  parts: { foundation: 'concrete', walls: 'timber_lap', roof: 'metal_roof' },
  maxSlope: 0.3, floorY: 0.12, porch: 0.4, sleeps: 6, light: [0, 0.32, 0],
};
export const TRAILER: KitPieceDef = {
  id: 'trailer', name: 'Manufactured home', category: 'home',
  blurb: 'A 1990s manufactured home on piers: kitchen, living room, two bedrooms and a bath.',
  cellsX: 2, cellsZ: 6, frontCells: 0,
  parts: { foundation: 'concrete', walls: 'metal_siding', roof: 'metal_roof' },
  maxSlope: 0.3, floorY: 0.13, porch: 0, sleeps: 4, light: [0, 0.3, 0],
};
export const BARN: KitPieceDef = {
  id: 'barn', name: 'Barn', category: 'work',
  blurb: '12 × 18 m board-and-batten barn: big doors at both ends, stalls for stock, a hay loft under a steep metal roof.',
  cellsX: 4, cellsZ: 6, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.25, floorY: 0.03, porch: 0, sleeps: 0, light: [0, 0.4, 0],
};

/** A grandparents' / guest cottage: 6 × 8 m on a 2 × 3-cell lot (the porch takes the front cell). */
export const COTTAGE: KitPieceDef = {
  id: 'cottage', name: 'Cottage', category: 'home',
  blurb: 'A one-storey 6 × 8 m cottage for the grandparents or a family taken in: lap siding, metal roof, a small porch. Sleeps 3.',
  cellsX: 2, cellsZ: 3, frontCells: 1,
  parts: { foundation: 'concrete', walls: 'timber_lap', roof: 'metal_roof' },
  maxSlope: 0.3, floorY: 0.08, porch: 0.28, sleeps: 3, light: [0, 0.3, -0.1],
};
/** A small guest house for a relative: 6 × 5 m on a 2 × 2-cell lot. Keeps visiting family happy with a front door of their own. */
export const GUEST_HOUSE: KitPieceDef = {
  id: 'guest_house', name: 'Guest house', category: 'home',
  blurb: 'A small one-storey 6 × 5 m guest house with a porch, a bath and a kitchenette. Sleeps 2: a relative with a front door of their own is a happier relative.',
  cellsX: 2, cellsZ: 2, frontCells: 1,
  parts: { foundation: 'concrete', walls: 'timber_lap', roof: 'metal_roof' },
  maxSlope: 0.3, floorY: 0.08, porch: 0.28, sleeps: 2, light: [0, 0.3, -0.1],
};
/** A house for Mom, the in-laws or the grandparents: 9 × 8 m, step-free, two bedrooms. */
export const MOMS_HOUSE: KitPieceDef = {
  id: 'moms_house', name: 'Mom\u2019s house', category: 'home',
  blurb: 'A one-level 9 × 8 m house for Mom, the in-laws or the grandparents: ramp, covered porch, two bedrooms, a full kitchen. Sleeps 4. Old people keep their independence and their dignity.',
  cellsX: 3, cellsZ: 3, frontCells: 1,
  parts: { foundation: 'concrete', walls: 'timber_lap', roof: 'metal_roof' },
  maxSlope: 0.25, floorY: 0.08, porch: 0.28, sleeps: 4, light: [0, 0.3, -0.1],
};
export const METAL_GARAGE: KitPieceDef = {
  id: 'metal_garage', name: 'Metal garage', category: 'work',
  blurb: '9 × 12 m steel pole building on a slab: corrugated walls and roof, two roll-up doors for the trucks.',
  cellsX: 3, cellsZ: 4, frontCells: 1,
  parts: { foundation: 'concrete', walls: 'metal_siding', roof: 'metal_roof' },
  maxSlope: 0.25, floorY: 0.03, porch: 0, sleeps: 0, light: [0, 0.4, 0],
};
export const GARAGE_SOLAR: KitPieceDef = {
  ...METAL_GARAGE, id: 'garage_solar', name: 'Metal garage with solar roof', category: 'power',
  blurb: 'The same 9 × 12 m steel garage with 20 × 400 W panels on its south roof: ≈ 8 kW, about 29 kWh a summer day.',
};

const DEEP = new Set(['well_hand', 'well_drilled', 'septic']);
const util = (id: string, name: string, category: 'water' | 'power' | 'sanitation', cx: number, cz: number, blurb: string, light: [number, number, number] | null = null): KitPieceDef => ({
  id, name, category, blurb, cellsX: cx, cellsZ: cz, frontCells: 0, parts: { foundation: 'concrete', walls: 'board_batten', roof: 'metal_roof' }, maxSlope: 0.35, floorY: 0.02, porch: 0, sleeps: 0, light,
  level: DEEP.has(id) ? 'both' : 'surface',
});
export const UTILITY_KIT: KitPieceDef[] = [
  util('well_hand', 'Hand-dug well', 'water', 1, 1, 'A stone-lined well with a hand pump. ≈ 900 L a day, carried by bucket: no pressure, no plumbing.'),
  util('well_drilled', 'Drilled well & pump house', 'water', 1, 1, 'A 60 m bore (contractor) with a submersible pump and pressure tank: running water, but the pump needs power.', [0, 0.25, 0]),
  util('cistern', 'Rain cistern', 'water', 1, 1, '10,000 L tank fed by the gutters of every roof on its water line. Storage for dry spells.'),
  util('water_tower', 'Water tower', 'water', 1, 1, 'A 4,000 L tank on a timber stand: gravity pressure with no pump, and a lookout deck.'),
  util('solar_array', 'Solar array', 'power', 3, 2, '12 × 400 W panels on ground racks: ≈ 12 kWh a summer day, 6 in December.'),
  util('battery_shed', 'Battery & inverter shed', 'power', 1, 1, '20 kWh of batteries, an inverter and charge controller: power through the night.', [0, 0.28, 0]),
  util('generator_shed', 'Generator shed', 'power', 1, 1, 'A 7 kW generator and fuel rack. Backup for dark weeks; burns ≈ 0.45 L a kWh.', [0, 0.28, 0]),
  util('filtration_shed', 'Water filtration shed', 'water', 1, 1, 'A 1.8 × 2.4 m shed by the pressure tank: sediment and carbon filters and a UV lamp. Well, rain and creek water treated for the house.', [0, 0.25, 0]),
  util('solar_farm', 'Solar farm (20 kW)', 'power', 4, 6, '50 × 400 W panels in five rows on steel racks with three inverters: 20 kW, ≈ 72 kWh on a summer day and 40 in December. Stand a battery container beside it.'),
  util('battery_bank', 'Battery container (60 kWh)', 'power', 2, 1, 'Twelve 5 kWh racks, an inverter and air conditioning in a 20 ft container. Put it beside the array: equipment standing together shares a bus.', [0, 0.28, 0]),
  util('micro_hydro', 'Micro-hydro plant (3 kW)', 'power', 2, 2, 'A turbine house on the creek bank fed by 100 m of buried penstock from an intake weir upstream. Up to 3 kW day and night (14-36 kWh a day on a few metres of fall), most in the spring runoff, least in the August low and under winter ice. Needs the creek to fall 2.5 m or more over the pipe, a water right ($1,800 permit) and a clear intake screen.', [0, 0.28, 0]),
  util('wind_turbine', 'Wind turbine (5 kW)', 'power', 1, 1, 'A 5 kW three-blade turbine on an 18 m guyed tilt-up tower. Output follows the wind your ground gives it: ridges and open benches pay, hollows and timber do not. It furls in a gale (and a derecho may take the tail), ices in freezing fog, can be heard from the road and seen for kilometers.'),
  util('septic', 'Septic system', 'sanitation', 2, 2, 'Septic tank and leach field. Lets plumbed houses have flush toilets.'),
];

// ── Watch towers: the upgrade chain (sim/towers.ts; sizes match its `cells`) ──
const tower = (id: string, name: string, cx: number, blurb: string, over: Partial<KitPieceDef> = {}): KitPieceDef => ({
  id, name, category: 'defense', blurb, cellsX: cx, cellsZ: cx, frontCells: 0,
  parts: { foundation: 'concrete', walls: 'concrete', roof: 'metal_roof' }, maxSlope: 0.6, floorY: 0.02, porch: 0, sleeps: 0, light: null, ...over,
});
export const TOWER_KIT: KitPieceDef[] = [
  tower('rise_lookout', 'Rise & lookout', 2, 'A mound of earth with a sandbagged nest and a plank roof on top: one rifle and a pair of eyes above the grass. Cheap; a small view bonus. Build it on a natural rise if you have one.', { parts: { foundation: 'fieldstone', walls: 'timber_lap', roof: 'metal_roof' } }),
  tower('watchtower_wood', 'Wooden watchtower', 1, 'A 6 m timber tower with a roofed cab.', { parts: { foundation: 'concrete', walls: 'board_batten', roof: 'metal_roof' } }),
  tower('watchtower_octagon', 'Octagonal timber tower', 1, 'An eight-sided timber tower on a stone course with a roofed cab.', { parts: { foundation: 'concrete', walls: 'board_batten', roof: 'metal_roof' } }),
  tower('watchtower_hex', 'Hexagonal concrete tower', 1, 'A six-sided poured shaft with a steel cab and firing slits.'),
  tower('watchtower_concrete', 'Concrete & steel tower', 1, 'A poured shaft with a steel cab and firing slits.'),
  tower('watchtower_flood', 'Tower with floodlights', 1, 'The concrete tower with a light mast (needs power at night).', { floodlit: true, light: [0, 1.4, 0] }),
  tower('watchtower_mount', 'Tower with a mounted gun', 1, 'An armored cab with a ring-mounted machine gun.', { floodlit: true, light: [0, 1.5, 0] }),
  tower('watchtower_turret', 'Tower with an automated turret', 1, 'The armored tower with a remote turret on the roof.', { floodlit: true, light: [0, 1.6, 0] }),
];
/** The gatehouse garage (sim/garage.ts): built into the wall at the gate; a steel gate through the middle, two bays of two parking slots, a roof deck. */
export const GATE_GARAGE_KIT: KitPieceDef = {
  id: 'gate_garage', name: 'Gatehouse garage', category: 'defense',
  blurb: 'A vehicle garage built into the wall at the gate: stacked containers, a steel drive-through gate in the middle, two bays with room for four vehicles, and a roof deck that is a guard post. It fills the gap in the wall, so it holds the line (18 × 9 m). Place it across the gate gap, or use Fortify my ring.',
  cellsX: 6, cellsZ: 3, frontCells: 1,
  parts: { foundation: 'concrete', walls: 'container_blue', roof: 'metal_roof' }, maxSlope: 0.35, floorY: 0.03, porch: 0, sleeps: 0, light: [0, 0.4, 0.1],
};
/** The motor court (sim/motorCourt.ts): a black-bar-fenced gravel forecourt in front of the gate with six marked bays; the fleet parks here before the open yard. */
export const MOTOR_COURT_KIT: KitPieceDef = {
  id: 'motor_court', name: 'Motor court', category: 'defense',
  blurb: 'A gravel forecourt in front of the gatehouse garage, 18 × 12 m, fenced on three sides in black steel bars with a double drive gate, six marked bays and light poles. The fleet parks here before it parks in the open: a vehicle behind the bars is much harder to drive off. Built outside the gate, back to the wall.',
  cellsX: 6, cellsZ: 4, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'metal_siding', roof: 'metal_roof' },
  maxSlope: 0.15, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};
/** Defense menu: only the first tier is built from scratch; the rest are upgrades from the Defense tab. */
export const TOWER_ORDER: readonly string[] = ['rise_lookout'];
/** The gatehouse garage joins the Defense menu beside the first tower. */
export const GATEHOUSE_ORDER: readonly string[] = ['gate_garage', 'motor_court'];

// ── Underground (GDS §2.2; underground.ts) ──
const room = (id: string, name: string, cx: number, cz: number, blurb: string, shelters = 0, level: 'underground' | 'both' = 'underground'): KitPieceDef => ({
  id, name, category: 'bunker', blurb, cellsX: cx, cellsZ: cz, frontCells: 0,
  parts: { foundation: 'concrete', walls: 'concrete', roof: 'concrete' },
  maxSlope: level === 'both' ? 0.3 : 9, floorY: 0, porch: 0, sleeps: 0, light: [0, 0.24, 0], level, shelters,
});
export const BUNKER_KIT: KitPieceDef[] = [
  room('bunker_hatch', 'Bunker hatch', 1, 1, 'The way down: a steel hatch in a concrete collar, a ladder down a 5 m shaft, a blast door at the bottom. Easy to hide under a woodpile.', 0, 'both'),
  room('bunker_floorhatch', 'Floor hatch', 1, 1, 'A hatch in the floor of a house, hidden under a rug: an insulated lid over a switchback stair down to the bunker, lit warm. Opens when the family goes down. Build it inside a house.', 0, 'both'),
  room('bunker_stairs', 'Bunker stairwell', 1, 3, 'A stair down from a little headhouse on the surface to a blast door 5 m below. Carries stores and the old and young.', 0, 'both'),
  room('bunker_corridor', 'Tunnel', 1, 2, 'A 3 × 6 m concrete passage between rooms.'),
  room('bunker_container', 'Buried container', 1, 4, 'A 40 ft shipping container in a gravel bed, braced and waterproofed: the cheap first bunker. Bunks, a table, a pantry.', 4),
  room('bunker_dorm', 'Bunkroom', 2, 2, 'Bunks for eight, lockers, a rug and the family pictures: somewhere to sleep through a bad week.', 8),
  room('bunker_galley', 'Galley', 2, 2, 'Kitchen counter, two-burner stove, a table for eight and shelves of food.', 2),
  room('bunker_stores', 'Storeroom', 2, 2, 'Rows of shelving: cans, rice and beans in buckets, water drums, medicine, seed.', 0),
  room('bunker_plant', 'Plant room', 2, 2, 'Air: an NBC filter and blast valves. Power: a battery bank and a vented generator. Water: a 2,000 L tank.', 0),
  room('bunker_medical', 'Medical bay', 2, 2, 'An exam table, a cot, a sink, cabinets of supplies and an oxygen bottle.', 1),
  room('bunker_comms', 'Control room & armory', 1, 2, 'A desk under a wall of screens (camera feeds, radar, weather, the radio net), a laptop, a cot and a rifle rack, the site plan on a corkboard, a gun safe and ammunition. The night watch sits here when there are cameras and power.', 1),
];
/** Underground menu order. */
export const BUNKER_ORDER: readonly string[] = BUNKER_KIT.map(d => d.id);

export const KIT: Record<string, KitPieceDef> = Object.fromEntries([BOAT_DOCK, MARINA, POLYTUNNEL, HIGH_TUNNEL, AQUAPONICS, LODGE, LODGE_SOLAR, STONE_HOUSE, TIMBER_FRAME_HOUSE, CONTAINER_HOUSE, ADOBE_HOUSE, APIARY, SUGAR_SHACK, BARNYARD, WOOD_OVEN, GATE_GARAGE_KIT, MOTOR_COURT_KIT, TIMBER_CABIN, LOG_HOUSE, FARMHOUSE, TRAILER, BARN, COTTAGE, GUEST_HOUSE, MOMS_HOUSE, METAL_GARAGE, GARAGE_SOLAR, OUTHOUSE, WORKSHOP, ROOT_CELLAR, CHICKEN_COOP, GARDEN, FIELD, GREENHOUSE, GREENHOUSE_HEATED, ORCHARD, ORCHARD_GROVE, POND, RESERVOIR, SHEEP_BARN, EQUIPMENT_YARD, TERRACE_STAIR, TERRACE_RAMP, ...UTILITY_KIT, ...BUNKER_KIT, ...TOWER_KIT].map(d => [d.id, d]));
/** Build-menu order. */
export const KIT_ORDER: readonly string[] = ['timber_cabin', 'log_house', 'lodge', 'lodge_solar', 'stone_house', 'timber_frame', 'container_house', 'adobe_house', 'cottage', 'guest_house', 'moms_house', 'outhouse', 'garden', 'greenhouse', 'polytunnel', 'high_tunnel', 'greenhouse_heated', 'aquaponics', 'orchard', 'orchard_grove', 'field', 'chicken_coop', 'sheep_barn', 'pond', 'root_cellar', 'wood_oven', 'apiary', 'sugar_shack', 'barnyard', 'workshop', 'metal_garage', 'barn', 'equipment_yard', 'boat_dock', 'marina'];
/** Water & power menu order. */
export const UTILITY_ORDER: readonly string[] = ['well_hand', 'well_drilled', 'cistern', 'water_tower', 'filtration_shed', 'septic', 'solar_array', 'solar_farm', 'garage_solar', 'battery_shed', 'battery_bank', 'generator_shed', 'micro_hydro', 'wind_turbine', 'reservoir'];

/** A placed structure (the game state record). */
export interface Placed {
  id: string;
  kind: string;
  /** Center of the footprint (world units). */
  x: number;
  z: number;
  /** Quarter turns (0..3); 0 = door side facing +z. */
  rot: number;
}

/** Footprint rect (world) of a piece at a center, including the front clearance. */
export function footprint(def: KitPieceDef, x: number, z: number, rot: number, withFront = true): { x0: number; z0: number; x1: number; z1: number } {
  const q = ((rot % 4) + 4) % 4;
  const hx = def.cellsX * CELL / 2, hz = def.cellsZ * CELL / 2;
  const f = withFront ? def.frontCells * CELL : 0;
  // local rect: x ∈ [-hx, hx], z ∈ [-hz, hz + f]; rotate by q quarter turns
  const corners: Array<[number, number]> = [[-hx, -hz], [hx, -hz], [-hx, hz + f], [hx, hz + f]];
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [lx, lz] of corners) {
    const [wx, wz] = rotQ(lx, lz, q);
    x0 = Math.min(x0, x + wx); x1 = Math.max(x1, x + wx);
    z0 = Math.min(z0, z + wz); z1 = Math.max(z1, z + wz);
  }
  return { x0, z0, x1, z1 };
}

/** Rotate a local offset by q quarter turns (counter-clockwise seen from above, +x → −z). */
export function rotQ(lx: number, lz: number, q: number): [number, number] {
  switch (((q % 4) + 4) % 4) {
    case 0: return [lx, lz];
    case 1: return [lz, -lx];
    case 2: return [-lx, -lz];
    default: return [-lz, lx];
  }
}

/**
 * Snap a cursor point to the build grid so the footprint's cell edges sit on
 * grid lines (odd-sized footprints center on a cell, even ones on a line).
 */
export function snapCenter(def: KitPieceDef, x: number, z: number, rot: number): [number, number] {
  const odd = (n: number) => n % 2 === 1;
  const q = ((rot % 4) + 4) % 4;
  const nx = q % 2 === 0 ? def.cellsX : def.cellsZ;
  const nz = q % 2 === 0 ? def.cellsZ : def.cellsX;
  const s = (v: number, isOdd: boolean) => isOdd ? (Math.floor(v / CELL) + 0.5) * CELL : Math.round(v / CELL) * CELL;
  return [s(x, odd(nx)), s(z, odd(nz))];
}

/**
 * How a stair or ramp at (x, z) meets the ground: `rise` is the height of the +z end over the -z end of its local frame (world units; a stair
 * built from it climbs toward the higher end), `cross` the sideways fall across its width (rise over run), `low` the ground at the lower end.
 */
export function climbOf(def: KitPieceDef, x: number, z: number, rot: number, height: (x: number, z: number) => number): { rise: number; cross: number; low: number } {
  const hx = def.cellsX * CELL / 2, hz = def.cellsZ * CELL / 2, N = 4;
  const at = (lx: number, lz: number): number => { const [wx, wz] = rotQ(lx, lz, rot); return height(x + wx, z + wz); };
  let a = 0, b = 0, left = 0, right = 0;
  for (let i = 0; i <= N; i++) {
    const lx = -hx + 2 * hx * i / N;
    a += at(lx, -hz) / (N + 1); b += at(lx, hz) / (N + 1);
  }
  for (let j = 0; j <= N; j++) { const lz = -hz + 2 * hz * j / N; left += at(-hx, lz) / (N + 1); right += at(hx, lz) / (N + 1); }
  return { rise: b - a, cross: Math.abs(right - left) / (2 * hx), low: Math.min(a, b) };
}

export interface SiteQuery {
  /** Natural ground height. */
  height(x: number, z: number): number;
  /** Inside the player's parcel. */
  owned(x: number, z: number): boolean;
  /** Water (creek channel) at (x, z). */
  water(x: number, z: number): boolean;
  /** Something already there that isn't a kit piece (the camp). */
  blocked?(x: number, z: number): boolean;
  /** Pieces that need a particular kind of ground (a creek bank with fall, a shore): why this one cannot go at (x, z), or null. */
  rule?(kind: string, x: number, z: number): PlaceProblem | null;
}

export type PlaceProblem = 'cross_slope' | 'needs_house' | 'needs_slope' | 'no_climb' | 'no_creek' | 'no_head' | 'no_water' | 'not_connected' | 'not_on_bank' | 'not_shore' | 'off_parcel' | 'overlaps' | 'pad_clash' | 'thin_cover' | 'too_deep' | 'too_much_climb' | 'too_steep' | 'water';

const levelOf = (d: KitPieceDef) => d.level ?? 'surface';
/** Do pieces at these levels compete for the same ground? (Bunker rooms go under the yard and houses.) */
const levelsMeet = (a: KitPieceDef, b: KitPieceDef) => levelOf(a) === 'both' || levelOf(b) === 'both' || levelOf(a) === levelOf(b);

/** Why a piece can't go here (null = it can). Underground pieces also need underground.ts's rules. */
export function placementProblem(def: KitPieceDef, x: number, z: number, rot: number, site: SiteQuery, placed: readonly Placed[]): PlaceProblem | null {
  const below = levelOf(def) === 'underground';
  const r = footprint(def, x, z, rot, !below);
  const N = 4;
  const hs: number[][] = [];
  let wet = 0, dry = 0;
  for (let i = 0; i <= N; i++) {
    const row: number[] = [];
    for (let j = 0; j <= N; j++) {
      const px = r.x0 + (r.x1 - r.x0) * i / N, pz = r.z0 + (r.z1 - r.z0) * j / N;
      if (!site.owned(px, pz)) return 'off_parcel';
      if (def.waterside) { if (site.water(px, pz)) wet++; else dry++; }
      else if (site.water(px, pz)) return 'water';
      if (!below && site.blocked?.(px, pz)) return 'overlaps';
      row.push(site.height(px, pz));
    }
    hs.push(row);
  }
  // steepest grade across the footprint along either axis
  let grade = 0;
  for (let j = 0; j <= N; j++) grade = Math.max(grade, Math.abs(hs[N][j] - hs[0][j]) / (r.x1 - r.x0));
  for (let i = 0; i <= N; i++) grade = Math.max(grade, Math.abs(hs[i][N] - hs[i][0]) / (r.z1 - r.z0));
  // (a floor hatch stands on its house's graded pad, whatever the natural ground does)
  const isFloorHatch = def.id === 'bunker_floorhatch';
  if (grade > def.maxSlope && !isFloorHatch) return 'too_steep';
  if (def.climbs) {
    const c = climbOf(def, x, z, rot, site.height);
    if (c.cross > 0.4) return 'cross_slope';
    if (Math.abs(c.rise) < def.climbs.min) return 'no_climb';
    if (Math.abs(c.rise) > def.climbs.max) return 'too_much_climb';
  }
  // a pier reaches from the bank out over the water: both must be under it (its grade is the bank's and the bed's, not a pad's)
  if (def.waterside) {
    if (wet < 3 || dry < 3) return 'not_shore';
    // it must run out from the bank, not along it: one end on dry land, the other over the water
    const h = def.cellsZ * CELL / 2 - 0.1, [ax, az] = rotQ(0, h, rot), [bx, bz] = rotQ(0, -h, rot);
    if (site.water(x + ax, z + az) === site.water(x + bx, z + bz)) return 'not_shore';
  }
  if (grade > def.maxSlope && !isFloorHatch && !def.waterside) return 'too_steep';
  // a walkout basement stands out of the hill: the ground must fall toward the back of the footprint (local -z)
  if (def.walkoutFall) {
    const q = ((rot % 4) + 4) % 4, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    let front = 0, back = 0, nf = 0, nb = 0;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const [, lz] = rotQ(r.x0 + (r.x1 - r.x0) * i / N - cx, r.z0 + (r.z1 - r.z0) * j / N - cz, -q);
      if (lz > 1e-6) { front += hs[i][j]; nf++; } else if (lz < -1e-6) { back += hs[i][j]; nb++; }
    }
    const run = (def.cellsZ * CELL) / 2;                  // front and back halves' centers stand half a depth apart
    if (nf && nb && (front / nf - back / nb) / run < def.walkoutFall) return 'needs_slope';
  }
  // a floor hatch is built inside a house: the house it stands in is not in its way
  const host = def.id === 'bunker_floorhatch' ? floorHatchHost(x, z, placed) : null;
  if (def.id === 'bunker_floorhatch' && !host) return 'needs_house';
  for (const p of placed) {
    if (host && p.id === host.id) continue;
    const od = KIT[p.kind];
    if (!levelsMeet(def, od)) continue;
    const o = footprint(od, p.x, p.z, p.rot, levelOf(od) !== 'underground');
    if (r.x0 < o.x1 && r.x1 > o.x0 && r.z0 < o.z1 && r.z1 > o.z0) return 'overlaps';
  }
  return site.rule?.(def.id, x, z) ?? null;
}

export const PROBLEM_TEXT: Record<PlaceProblem, string> = {
  off_parcel: 'Outside your land',
  water: 'In the creek',
  too_steep: 'Too steep — find flatter ground',
  overlaps: 'Overlaps another building',
  not_connected: 'Start a bunker at a hatch or stairwell, then add rooms wall to wall',
  thin_cover: 'Too little earth over it — the ground is too low here',
  too_deep: 'Too deep below the ground here to dig',
  needs_house: 'A floor hatch goes inside a house, well in from the walls',
  no_climb: 'Nothing to climb here: a stair or ramp goes where the ground steps up between two terraces (turn it with R to run along the slope)',
  too_much_climb: 'The ground climbs too much along it: a stair takes up to 3.6 m, a ramp 1.2 m. Terrace the slope or switch back',
  cross_slope: 'The ground falls away sideways across it: turn it (R) to run up the hill, not across',
  pad_clash: 'Its graded pad would cut into a neighbour\'s pad at another level',
  no_water: 'Your land has no lake or river wide enough for a dock',
  not_shore: 'A dock runs from dry land out over the water: put one end on the bank and the other in the lake (R turns it)',
  no_creek: 'No creek runs through your land: a turbine needs falling water',
  not_on_bank: 'Put the turbine house on the creek bank, within about 80 m of the water',
  no_head: 'The creek does not fall far enough here: it needs 2.5 m of drop over the penstock (try further downstream)',
  needs_slope: 'The lodge needs a slope that falls away behind it: turn it (R) so the walkout side, the back with the big deck, faces downhill',
};

/** The enclosed building a floor hatch at (x, z) sits in: a home or workshop whose body holds the hatch's whole cell, with a wall's thickness to spare. */
export function floorHatchHost(x: number, z: number, placed: readonly Placed[]): Placed | null {
  const half = CELL / 2 + 0.06;
  for (const p of placed) {
    const d = KIT[p.kind];
    if (!d || (d.category !== 'home' && d.category !== 'work') || d.floorY < 0.02) continue;
    const r = footprint(d, p.x, p.z, p.rot, false);
    // (a lodge's wraparound deck is part of its footprint, but the hatch goes inside the body)
    if (d.walkoutFall) { r.x0 += 0.25; r.x1 -= 0.25; r.z0 += 0.25; r.z1 -= 0.25; }
    if (x - half >= r.x0 && x + half <= r.x1 && z - half >= r.z0 && z + half <= r.z1) return p;
  }
  return null;
}
