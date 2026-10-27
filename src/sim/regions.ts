/**
 * The seven regions (GDS §10, decided with the user: pick the region, then
 * the land you want within it). Each region changes what the land costs,
 * what the water and timber are like, the growing season, the winter, the
 * game in the woods and which disasters are likely. Pure data.
 *
 * Land prices are 2025 rural, homestead-grade raw land with road access,
 * per acre for a 40 (USDA NASS land values and land-broker guides: a 5-acre
 * lot near town runs about three times the per-acre price of a 40, a big
 * parcel less). Frost dates are typical for the region's homestead country;
 * each region's world (terrain, trees, farms, fences, roads) is in
 * game/region/regionWorld.ts.
 */
import type { DisasterKind } from './disaster';

export type RegionId = 'mountain_west' | 'appalachia' | 'desert' | 'north_woods' | 'plains' | 'pnw' | 'upper_midwest'
  | 'new_england' | 'ozarks' | 'hill_country' | 'rust_belt';
export type Game = 'deer' | 'elk' | 'moose' | 'turkey' | 'javelina' | 'antelope' | 'rabbit' | 'grouse' | 'waterfowl' | 'trout' | 'bass' | 'catfish' | 'salmon' | 'panfish';

/**
 * Severe weather the region gets (sim/weatherThreats.ts): the chance a day,
 * in that storm's season, that one is warned of. Kinds a region leaves out
 * never come there.
 */
export type StormKind = 'blizzard' | 'tornado' | 'derecho' | 'hail' | 'heat_wave' | 'flood' | 'lightning_fire'
  | 'ice_storm' | 'hurricane_remnants' | 'flash_flood' | 'windstorm';

/** What comes with a listing that has a house on it: the shares of each kind (sim/site.ts rollImprovements). */
export interface HouseMix { farmhouse: number; trailer: number; timber_cabin: number; log_house: number }

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
  /** Last spring frost and first fall frost (day of year, the median: half of years are later / earlier). */
  frost: [number, number];
  /** USDA plant hardiness zone (2023 map) of the region's homestead country. */
  zone: string;
  /** Winter: how much heating it takes (Mountain West = 1; heating degree days against ~7,500 °F-days). */
  cold: number;
  /** Rain and snowmelt, mm a year. */
  rainMm: number;
  /** Snowfall, cm a year (NOAA 1991–2020 normals of the region's towns). */
  snowCm: number;
  /** Mean July high and January low, °F (NOAA normals). */
  julyHighF: number;
  janLowF: number;
  /** What's in the woods and the water. */
  game: Game[];
  /** How likely each disaster is here, against the usual (1). */
  odds: Partial<Record<DisasterKind, number>>;
  /** Severe weather: chance a day in its season (weatherThreats.ts has the seasons). */
  storms: Partial<Record<StormKind, number>>;
  /** Houses that come with improved listings. */
  houses: HouseMix;
  /** World terrain and look (engine region kind). */
  terrain: 'mountain' | 'appalachia' | 'desert' | 'north_woods' | 'plains' | 'pnw' | 'upper_midwest' | 'new_england' | 'ozarks' | 'hill_country' | 'rust_belt';
  /** Miles to town against the usual (1): the Rust Belt edge is close in, the north woods far out. */
  townScale?: number;
}

/*
 * Sources, from knowledge (2025):
 *  - land: USDA NASS "Land Values 2025 Summary" (pasture / woodland by
 *    state) and rural land-broker asking prices for 20–80 acre homestead
 *    tracts; a 40 with road access, not cropland in a farm sale.
 *  - frost / zone: NOAA 1991–2020 freeze-date normals (50 % probability,
 *    32 °F) and the 2023 USDA hardiness map for representative towns:
 *    Salmon ID / Sheridan WY; Boone NC / Morehead KY; Snowflake AZ /
 *    Deming NM (high desert, ~5,000 ft); Ely MN / Presque Isle ME;
 *    Hays KS / Broken Bow NE; Chehalis WA / Sweet Home OR; Wausau WI /
 *    Cadillac MI; Montpelier VT / Farmington ME; West Plains MO /
 *    Harrison AR; Fredericksburg TX / Llano TX; Youngstown OH / New
 *    Castle PA. (Ely MN / Marquette MI for the North Woods.)
 *  - storms: NOAA Storm Events per county per year, spread over the season:
 *    a 0.003 daily chance over a 100-day season is about one in three years.
 */
export const REGIONS: Record<RegionId, RegionDef> = {
  mountain_west: {
    id: 'mountain_west', name: 'Mountain West', where: 'Idaho, Montana, Wyoming, Utah',
    blurb: 'Dry benches under the range, ponderosa and fir in the draws, long cold winters and a short season.',
    perAcre: 3500, creekOdds: 0.4, springOdds: 0.2, gwDepth: [8, 110], gwBad: { hard: 0.25, iron: 0.08, arsenic: 0.06 },
    timber: [0.3, 1.4], soil: { thin: 0.35, deep: 0.15 }, frost: [140, 263], zone: '4b–5b', cold: 1, rainMm: 400,
    snowCm: 140, julyHighF: 86, janLowF: 12,
    game: ['elk', 'deer', 'antelope', 'grouse', 'rabbit', 'trout'],
    odds: { wildfire: 2, drought: 1.5, ash_winter: 1.5, nuclear: 1.3 },
    // monsoon hail and dry lightning in July–August; spring snowmelt floods on the creek
    storms: { blizzard: 0.01, hail: 0.003, heat_wave: 0.003, flood: 0.0015 * 400 / 700, lightning_fire: 0.006 },
    houses: { farmhouse: 0.45, trailer: 0.35, timber_cabin: 0.13, log_house: 0.07 },
    terrain: 'mountain',
  },
  appalachia: {
    id: 'appalachia', name: 'Appalachia', where: 'Tennessee, Kentucky, West Virginia, western North Carolina',
    blurb: 'Steep wooded hollows, a creek in every bottom, springs in the hillsides. Mild winters, wet, and a long season.',
    // TN / KY / WV woodland and pasture $2,500–5,500 an acre; mountain NC dearer
    perAcre: 4500, creekOdds: 0.75, springOdds: 0.45,
    // drilled wells in the folded sandstone / shale run 30–90 m; iron and sulfur are common, arsenic rare
    gwDepth: [10, 90], gwBad: { hard: 0.2, iron: 0.25, arsenic: 0.02 },
    timber: [1, 1.5], soil: { thin: 0.45, deep: 0.08 }, frost: [110, 293], zone: '6a–7a', cold: 0.6, rainMm: 1250,
    snowCm: 45, julyHighF: 85, janLowF: 25,
    game: ['deer', 'turkey', 'grouse', 'rabbit', 'trout', 'bass'],
    odds: { grid_down: 1.4, financial: 1.2, pandemic: 1, wildfire: 0.6, drought: 0.6 },
    // hollows flash-flood (spring rains, and the remnants of Gulf hurricanes in
    // Aug–Oct: Helene 2024); ice storms glaze the ridges most winters; fall woods fires
    storms: { hail: 0.001, heat_wave: 0.004, flood: 0.0027, hurricane_remnants: 0.004, ice_storm: 0.003, tornado: 0.0004, lightning_fire: 0.001 },
    // old frame farmhouses and single-wides up the hollows; a few log homes
    houses: { farmhouse: 0.45, trailer: 0.4, timber_cabin: 0.07, log_house: 0.08 },
    terrain: 'appalachia',
  },
  desert: {
    id: 'desert', name: 'Desert Southwest', where: 'Arizona, New Mexico',
    blurb: 'Cheap land, big sky, mesas and dry washes. Water is everything: deep wells, rare springs, flash floods.',
    // high-desert ranchettes (Concho, St. Johns, Deming): $600–2,500 an acre
    perAcre: 1500, creekOdds: 0.1, springOdds: 0.08, gwDepth: [60, 240], gwBad: { hard: 0.45, iron: 0.05, arsenic: 0.15 },
    // pinyon–juniper at ~5,000 ft: cold nights, 20 °F January lows, a long hot summer
    timber: [0.05, 0.4], soil: { thin: 0.6, deep: 0.05 }, frost: [110, 296], zone: '7a–8a', cold: 0.6, rainMm: 280,
    snowCm: 25, julyHighF: 92, janLowF: 20,
    game: ['javelina', 'deer', 'rabbit', 'antelope'],
    odds: { drought: 2.5, wildfire: 1.3, grid_down: 1.2, pandemic: 0.8 },
    // July–September monsoon: flash floods down the washes, dry lightning, hail; June heat
    storms: { hail: 0.001, heat_wave: 0.008, flash_flood: 0.004, lightning_fire: 0.0039 },
    // manufactured homes on most improved desert parcels
    houses: { farmhouse: 0.15, trailer: 0.65, timber_cabin: 0.12, log_house: 0.08 },
    terrain: 'desert',
  },
  north_woods: {
    id: 'north_woods', name: 'North Woods', where: 'northern Minnesota, the Upper Peninsula',
    blurb: 'Thick spruce and fir, birch, lakes and bogs, moose. Cheap land and bitter winters; a short season and a lot of firewood.',
    // northern MN / UP woodland $1,200–3,000 an acre
    perAcre: 2000, creekOdds: 0.55, springOdds: 0.25, gwDepth: [5, 60], gwBad: { hard: 0.1, iron: 0.3, arsenic: 0.1 },
    // Ely MN / Marquette MI: ~9,500 heating degree days
    timber: [1.2, 1.6], soil: { thin: 0.5, deep: 0.1 }, frost: [152, 253], zone: '3b–4a', cold: 1.3, rainMm: 850,
    snowCm: 220, julyHighF: 77, janLowF: -6,
    game: ['moose', 'deer', 'grouse', 'rabbit', 'waterfowl', 'trout', 'panfish'],
    odds: { grid_down: 1.3, pandemic: 1, wildfire: 0.7, drought: 0.5 },
    // Alberta clippers and lake-effect snow; the 1999 Boundary Waters derecho; a rare ice storm
    storms: { blizzard: 0.014, ice_storm: 0.001, derecho: 0.0008, hail: 0.001, heat_wave: 0.002, flood: 0.0021, lightning_fire: 0.001 },
    // hunting camps and log homes in the woods
    houses: { farmhouse: 0.3, trailer: 0.25, timber_cabin: 0.25, log_house: 0.2 },
    terrain: 'north_woods', townScale: 1.3,
  },
  plains: {
    id: 'plains', name: 'Great Plains', where: 'Kansas, Nebraska, the Dakotas',
    blurb: 'Open grass to the horizon, a creek lined with cottonwoods, deep soil. Hard winters, hail and tornado country.',
    // KS / NE pasture $1,500–2,500, dryland crop ground $2,500–4,500 an acre
    perAcre: 2800, creekOdds: 0.35, springOdds: 0.1, gwDepth: [10, 90], gwBad: { hard: 0.4, iron: 0.05, arsenic: 0.05 },
    timber: [0.05, 0.4], soil: { thin: 0.1, deep: 0.5 }, frost: [121, 278], zone: '5b–6a', cold: 0.95, rainMm: 650,
    snowCm: 60, julyHighF: 92, janLowF: 16,
    game: ['deer', 'antelope', 'turkey', 'rabbit', 'waterfowl', 'catfish'],
    odds: { drought: 1.6, grid_down: 1.2, financial: 1, wildfire: 0.8 },
    // Tornado Alley; the hail capital of the US; blizzards on the open grass; wind-driven grass fires
    storms: { blizzard: 0.011, tornado: 0.0018, derecho: 0.0012, hail: 0.006, heat_wave: 0.008, flood: 0.0014, ice_storm: 0.002, lightning_fire: 0.001 },
    houses: { farmhouse: 0.6, trailer: 0.3, timber_cabin: 0.06, log_house: 0.04 },
    terrain: 'plains',
  },
  pnw: {
    id: 'pnw', name: 'Pacific Northwest', where: 'western Oregon and Washington',
    blurb: 'Big firs and cedars, ferns, rain all winter. Dear land, mild winters, salmon in the rivers, and the Cascadia fault.',
    // Cascade / Coast Range foothill acreage $5,000–12,000 an acre
    perAcre: 7500, creekOdds: 0.6, springOdds: 0.35, gwDepth: [6, 80], gwBad: { hard: 0.05, iron: 0.15, arsenic: 0.05 },
    timber: [1.2, 1.6], soil: { thin: 0.2, deep: 0.3 }, frost: [105, 298], zone: '8a–8b', cold: 0.6, rainMm: 1500,
    snowCm: 20, julyHighF: 80, janLowF: 34,
    game: ['elk', 'deer', 'grouse', 'rabbit', 'salmon', 'trout'],
    odds: { wildfire: 1.4, ash_winter: 1.2, grid_down: 1.1, drought: 0.6 },
    // atmospheric-river floods and windstorms Nov–Feb (Columbus Day 1962, Hanukkah Eve 2006);
    // east-wind fires in a dry September (Labor Day 2020); the 2021 heat dome
    storms: { flood: 0.003, windstorm: 0.002, ice_storm: 0.0015, heat_wave: 0.002, lightning_fire: 0.0015, hail: 0.0005 },
    houses: { farmhouse: 0.4, trailer: 0.3, timber_cabin: 0.18, log_house: 0.12 },
    terrain: 'pnw',
  },
  upper_midwest: {
    id: 'upper_midwest', name: 'Upper Midwest', where: 'Wisconsin, Michigan',
    blurb: 'Rolling farm country, hardwood woodlots, kettle lakes. Good soil and water, cold snowy winters.',
    // WI / MI farm real estate ~$5,500–6,500, north-country woods ~$3,000
    perAcre: 5000, creekOdds: 0.45, springOdds: 0.2, gwDepth: [6, 60], gwBad: { hard: 0.35, iron: 0.2, arsenic: 0.04 },
    timber: [0.5, 1.2], soil: { thin: 0.15, deep: 0.35 }, frost: [135, 273], zone: '4b–5a', cold: 1.1, rainMm: 850,
    snowCm: 130, julyHighF: 80, janLowF: 5,
    game: ['deer', 'turkey', 'grouse', 'rabbit', 'waterfowl', 'bass', 'panfish'],
    odds: { grid_down: 1.3, financial: 1.1, drought: 0.8, wildfire: 0.6 },
    // lake-effect snow and clippers; summer derechos and tornadoes; spring flooding
    storms: { blizzard: 0.0125, tornado: 0.0012, derecho: 0.0008, hail: 0.004, heat_wave: 0.003, flood: 0.0018, ice_storm: 0.002 },
    houses: { farmhouse: 0.6, trailer: 0.25, timber_cabin: 0.08, log_house: 0.07 },
    terrain: 'upper_midwest',
  },
  new_england: {
    id: 'new_england', name: 'New England', where: 'Vermont, New Hampshire, western Maine',
    blurb: 'Stony hill farms gone back to woods, stone walls through the sugarbush, brooks and old capes. Snowy winters, mud season, and dear land.',
    // VT / NH woodland and old hill farms $3,500–8,000 an acre (Act 250 country)
    perAcre: 5500, creekOdds: 0.55, springOdds: 0.35,
    // drilled wells in granite / schist bedrock average 75–150 m; 10–20 % of NH / ME bedrock wells run over the arsenic limit
    gwDepth: [20, 150], gwBad: { hard: 0.1, iron: 0.2, arsenic: 0.18 },
    // glacial till: stones in every field ("the second crop is rocks")
    timber: [0.9, 1.5], soil: { thin: 0.55, deep: 0.05 }, frost: [140, 265], zone: '4b–5a', cold: 1.1, rainMm: 1100,
    snowCm: 220, julyHighF: 80, janLowF: 6,
    game: ['deer', 'moose', 'turkey', 'grouse', 'rabbit', 'trout', 'bass'],
    odds: { grid_down: 1.3, financial: 1, wildfire: 0.4, drought: 0.6 },
    // nor'easters; the 1998 ice storm; Irene (2011) flooding every valley in Vermont; spring floods
    storms: { blizzard: 0.012, ice_storm: 0.002, hurricane_remnants: 0.002, flood: 0.0025, hail: 0.001, heat_wave: 0.002 },
    // old capes and connected farmhouses; camps in the woods
    houses: { farmhouse: 0.55, trailer: 0.2, timber_cabin: 0.15, log_house: 0.1 },
    terrain: 'new_england',
  },
  ozarks: {
    id: 'ozarks', name: 'Ozarks', where: 'southern Missouri, northern Arkansas',
    blurb: 'Oak-and-pine ridges, clear spring-fed rivers, chert in the fields and caves under them. Cheap land, few codes, ice storms and tornadoes.',
    // MO / AR timber and pasture $2,000–4,000 an acre
    perAcre: 3000, creekOdds: 0.5, springOdds: 0.45,
    // karst: deep wells (100–200 m) into the Ozark aquifer, hard water, surface pollution reaches it fast
    gwDepth: [25, 180], gwBad: { hard: 0.5, iron: 0.05, arsenic: 0.01 },
    timber: [0.7, 1.4], soil: { thin: 0.6, deep: 0.05 }, frost: [102, 298], zone: '6b–7a', cold: 0.6, rainMm: 1150,
    snowCm: 30, julyHighF: 90, janLowF: 24,
    game: ['deer', 'turkey', 'rabbit', 'trout', 'bass', 'catfish'],
    odds: { financial: 1.2, grid_down: 1.2, drought: 0.9, wildfire: 0.8 },
    // the 2009 ice storm; Joplin (2011) and spring tornadoes; flash floods down the hollows; hail and summer heat
    storms: { ice_storm: 0.003, tornado: 0.0012, derecho: 0.0006, flood: 0.003, hail: 0.003, heat_wave: 0.005, lightning_fire: 0.0008 },
    houses: { farmhouse: 0.35, trailer: 0.45, timber_cabin: 0.1, log_house: 0.1 },
    terrain: 'ozarks', townScale: 1.1,
  },
  hill_country: {
    id: 'hill_country', name: 'Texas Hill Country', where: 'the Edwards Plateau west of Austin',
    blurb: 'Limestone hills, live oak and cedar, spring-fed rivers lined with cypress. Long hot summers, a short mild winter, drought and flash floods.',
    // Llano / Mason / Kerr ranch land $5,000–9,000 an acre; dearer toward Austin
    perAcre: 7000, creekOdds: 0.3, springOdds: 0.25,
    // Trinity / Edwards aquifer wells 100–250 m, very hard limestone water
    gwDepth: [60, 250], gwBad: { hard: 0.7, iron: 0.03, arsenic: 0.03 },
    timber: [0.4, 1.1], soil: { thin: 0.7, deep: 0.05 }, frost: [84, 322], zone: '8a', cold: 0.3, rainMm: 800,
    snowCm: 3, julyHighF: 94, janLowF: 35,
    game: ['deer', 'turkey', 'javelina', 'rabbit', 'bass', 'catfish'],
    odds: { drought: 2, grid_down: 1.4, wildfire: 1.3, financial: 1 },
    // "Flash Flood Alley" (the Guadalupe, July 2025); hail; 100 °F summers; cedar fires; Winter Storm Uri (Feb 2021)
    storms: { flash_flood: 0.004, hail: 0.003, heat_wave: 0.009, lightning_fire: 0.002, ice_storm: 0.0008, tornado: 0.0005 },
    // limestone ranch houses, manufactured homes on the smaller tracts
    houses: { farmhouse: 0.35, trailer: 0.4, timber_cabin: 0.15, log_house: 0.1 },
    terrain: 'hill_country',
  },
  rust_belt: {
    id: 'rust_belt', name: 'Rust Belt edge', where: 'eastern Ohio, western Pennsylvania',
    blurb: 'Rolling woodlots and old dairy farms on the edge of a mill town: close to stores and jobs, cheap old houses, and a lot of neighbors.',
    // OH / PA farm and woodland on a town's edge $4,500–7,000 an acre
    perAcre: 5500, creekOdds: 0.4, springOdds: 0.2,
    // shale and sandstone wells 20–60 m; iron and sulfur common
    gwDepth: [10, 60], gwBad: { hard: 0.45, iron: 0.3, arsenic: 0.03 },
    timber: [0.4, 1.1], soil: { thin: 0.25, deep: 0.2 }, frost: [125, 283], zone: '6a', cold: 0.85, rainMm: 950,
    snowCm: 140, julyHighF: 82, janLowF: 18,
    game: ['deer', 'turkey', 'rabbit', 'grouse', 'waterfowl', 'bass', 'panfish'],
    odds: { financial: 1.4, grid_down: 1.2, lawless: 1.2, pandemic: 1.1, drought: 0.7, wildfire: 0.3 },
    // lake-effect snow; the 2012 derecho; Ivan's remnants (2004); ice storms; spring floods
    storms: { blizzard: 0.008, ice_storm: 0.002, derecho: 0.0008, tornado: 0.0006, hail: 0.002, heat_wave: 0.003, flood: 0.002, hurricane_remnants: 0.001 },
    // old farmhouses and modular homes
    houses: { farmhouse: 0.6, trailer: 0.25, timber_cabin: 0.08, log_house: 0.07 },
    terrain: 'rust_belt', townScale: 0.45,
  },
};
export const REGION_IDS = Object.keys(REGIONS) as RegionId[];

/** The regions whose world (terrain, trees, look) is built and playable. */
export const PLAYABLE: ReadonlySet<RegionId> = new Set(REGION_IDS);

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
