/**
 * The seven regions (GDS §10, decided with the user: pick the region, then
 * the land you want within it). Each region changes what the land costs,
 * what the water and timber are like, the growing season, the winter, the
 * game in the woods and which disasters are likely. Pure data.
 *
 * Land prices are 2025 rural, homestead-grade raw land with road access,
 * per acre for a 40 (USDA NASS land values and land-broker guides: a 5-acre
 * lot near town runs about three times the per-acre price of a 40, a big
 * parcel less). Frost dates are typical for the region's homestead country.
 */
import type { DisasterKind } from './disaster';

export type RegionId = 'mountain_west' | 'appalachia' | 'desert' | 'north_woods' | 'plains' | 'pnw' | 'upper_midwest';
export type Game = 'deer' | 'elk' | 'moose' | 'turkey' | 'javelina' | 'antelope' | 'rabbit' | 'grouse' | 'waterfowl' | 'trout' | 'bass' | 'catfish' | 'salmon' | 'panfish';

export interface RegionDef {
  id: RegionId;
  name: string;
  where: string;
  blurb: string;
  /** $ per acre for a 40 of homestead-grade land. */
  perAcre: number;
  /** Odds the listing has the creek / a spring. */
  creekOdds: number;
  springOdds: number;
  /** Depth to groundwater (m), [min, max]. */
  gwDepth: [number, number];
  /** Odds of hard, iron and arsenic water (the rest is good). */
  gwBad: { hard: number; iron: number; arsenic: number };
  /** Timber against the usual (1), [min, max]. */
  timber: [number, number];
  /** Odds of thin and of deep soil (the rest is fair). */
  soil: { thin: number; deep: number };
  /** Last spring frost and first fall frost (day of year). */
  frost: [number, number];
  /** Winter: how much heating it takes (Mountain West = 1). */
  cold: number;
  /** Rain and snowmelt, mm a year. */
  rainMm: number;
  /** What's in the woods and the water. */
  game: Game[];
  /** How likely each disaster is here, against the usual (1). */
  odds: Partial<Record<DisasterKind, number>>;
  /** World terrain and look (engine region kind). */
  terrain: 'mountain' | 'appalachia' | 'desert' | 'north_woods' | 'plains' | 'pnw' | 'upper_midwest';
}

export const REGIONS: Record<RegionId, RegionDef> = {
  mountain_west: {
    id: 'mountain_west', name: 'Mountain West', where: 'Idaho, Montana, Wyoming, Utah',
    blurb: 'Dry benches under the range, ponderosa and fir in the draws, long cold winters and a short season.',
    perAcre: 3500, creekOdds: 0.4, springOdds: 0.2, gwDepth: [8, 110], gwBad: { hard: 0.25, iron: 0.08, arsenic: 0.06 },
    timber: [0.3, 1.4], soil: { thin: 0.35, deep: 0.15 }, frost: [140, 263], cold: 1, rainMm: 400,
    game: ['elk', 'deer', 'antelope', 'grouse', 'rabbit', 'trout'],
    odds: { wildfire: 2, drought: 1.5, ash_winter: 1.5, nuclear: 1.3 },
    terrain: 'mountain',
  },
  appalachia: {
    id: 'appalachia', name: 'Appalachia', where: 'Tennessee, Kentucky, West Virginia, western North Carolina',
    blurb: 'Steep wooded hollows, a creek in every bottom, springs in the hillsides. Mild winters, wet, and a long season.',
    perAcre: 4500, creekOdds: 0.75, springOdds: 0.45, gwDepth: [6, 70], gwBad: { hard: 0.2, iron: 0.2, arsenic: 0.02 },
    timber: [1, 1.5], soil: { thin: 0.4, deep: 0.1 }, frost: [110, 293], cold: 0.6, rainMm: 1250,
    game: ['deer', 'turkey', 'grouse', 'rabbit', 'trout', 'bass'],
    odds: { grid_down: 1.4, financial: 1.2, pandemic: 1, wildfire: 0.6, drought: 0.6 },
    terrain: 'appalachia',
  },
  desert: {
    id: 'desert', name: 'Desert Southwest', where: 'Arizona, New Mexico',
    blurb: 'Cheap land, big sky, mesas and dry washes. Water is everything: deep wells, rare springs, flash floods.',
    perAcre: 1500, creekOdds: 0.1, springOdds: 0.08, gwDepth: [60, 240], gwBad: { hard: 0.45, iron: 0.05, arsenic: 0.15 },
    timber: [0.05, 0.4], soil: { thin: 0.6, deep: 0.05 }, frost: [80, 310], cold: 0.35, rainMm: 280,
    game: ['javelina', 'deer', 'rabbit', 'antelope'],
    odds: { drought: 2.5, wildfire: 1.3, grid_down: 1.2, pandemic: 0.8 },
    terrain: 'desert',
  },
  north_woods: {
    id: 'north_woods', name: 'North Woods', where: 'Maine, northern Minnesota',
    blurb: 'Thick spruce and fir, lakes and bogs, moose. Cheap land and bitter winters; a short season and a lot of firewood.',
    perAcre: 2200, creekOdds: 0.55, springOdds: 0.25, gwDepth: [5, 60], gwBad: { hard: 0.1, iron: 0.3, arsenic: 0.1 },
    timber: [1.2, 1.6], soil: { thin: 0.5, deep: 0.1 }, frost: [152, 253], cold: 1.5, rainMm: 1000,
    game: ['moose', 'deer', 'grouse', 'rabbit', 'waterfowl', 'trout', 'panfish'],
    odds: { grid_down: 1.3, pandemic: 1, wildfire: 0.7, drought: 0.5 },
    terrain: 'north_woods',
  },
  plains: {
    id: 'plains', name: 'Great Plains', where: 'Kansas, Nebraska, the Dakotas',
    blurb: 'Open grass to the horizon, a creek lined with cottonwoods, deep soil. Hard winters, hail and tornado country.',
    perAcre: 2800, creekOdds: 0.35, springOdds: 0.1, gwDepth: [10, 90], gwBad: { hard: 0.4, iron: 0.05, arsenic: 0.05 },
    timber: [0.05, 0.4], soil: { thin: 0.1, deep: 0.5 }, frost: [121, 278], cold: 1.1, rainMm: 650,
    game: ['deer', 'antelope', 'turkey', 'rabbit', 'waterfowl', 'catfish'],
    odds: { drought: 1.6, grid_down: 1.2, financial: 1, wildfire: 0.8 },
    terrain: 'plains',
  },
  pnw: {
    id: 'pnw', name: 'Pacific Northwest', where: 'western Oregon and Washington',
    blurb: 'Big firs and cedars, ferns, rain all winter. Dear land, mild winters, salmon in the rivers, and the Cascadia fault.',
    perAcre: 7500, creekOdds: 0.6, springOdds: 0.35, gwDepth: [6, 80], gwBad: { hard: 0.05, iron: 0.15, arsenic: 0.05 },
    timber: [1.2, 1.6], soil: { thin: 0.2, deep: 0.3 }, frost: [105, 298], cold: 0.5, rainMm: 1500,
    game: ['elk', 'deer', 'grouse', 'rabbit', 'salmon', 'trout'],
    odds: { wildfire: 1.4, ash_winter: 1.2, grid_down: 1.1, drought: 0.6 },
    terrain: 'pnw',
  },
  upper_midwest: {
    id: 'upper_midwest', name: 'Upper Midwest', where: 'Wisconsin, Michigan',
    blurb: 'Rolling farm country, hardwood woodlots, kettle lakes. Good soil and water, cold snowy winters.',
    perAcre: 5000, creekOdds: 0.45, springOdds: 0.2, gwDepth: [6, 60], gwBad: { hard: 0.35, iron: 0.2, arsenic: 0.04 },
    timber: [0.5, 1.2], soil: { thin: 0.15, deep: 0.35 }, frost: [135, 273], cold: 1.25, rainMm: 850,
    game: ['deer', 'turkey', 'grouse', 'rabbit', 'waterfowl', 'bass', 'panfish'],
    odds: { grid_down: 1.3, financial: 1.1, drought: 0.8, wildfire: 0.6 },
    terrain: 'upper_midwest',
  },
};
export const REGION_IDS = Object.keys(REGIONS) as RegionId[];

/** The regions whose world (terrain, trees, look) is built and playable. */
export const PLAYABLE: ReadonlySet<RegionId> = new Set(['mountain_west']);

/** Price per acre against a 40, by lot size (small lots near town run dearer per acre). */
export const SIZE_FACTOR: Record<5 | 20 | 40 | 80, number> = { 5: 3.2, 20: 1.4, 40: 1, 80: 0.85 };

/** The garden's season and the field harvest, from the frost dates. */
export function seasons(r: RegionDef): { garden: [number, number]; harvest: [number, number]; crops: [number, number] } {
  const [last, first] = r.frost;
  return {
    garden: [last + 20, first + 32],          // hardy greens and roots run on past the first frost
    harvest: [first - 38, first + 27],         // potatoes and beans dug, wheat in, around the first frost
    crops: [last - 5, first + 37],             // what stands in the fields (the view)
  };
}
