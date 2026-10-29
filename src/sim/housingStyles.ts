/**
 * Housing styles (docs/DECISIONS.md "Housing styles"): the lodge, a stone house, a timber-frame house, a shipping-container
 * house and an adobe / rammed-earth house, next to the cabin and the log house. Pure data and rules; the geometry is in
 * game/buildkit/housingStyles*.ts, the blueprints in sim/blueprints.ts.
 *
 * What a style changes, all through the systems that already exist:
 *   - the bill and the hours: its own blueprint, priced from the one table of 2025 materials (sim/materials.ts);
 *     where the material is local it is cheaper (stone gathered off the land, sawn timbers from your own woods) and where
 *     it is hauled in dearer (`mat` below, stamped on the structure when it is staked: sim/construction.ts `stampStyle`);
 *   - where it can go: logs need timber on the land, adobe a dry climate, the lodge a slope for its walkout basement;
 *   - heating: the stove's demand follows the main home's envelope and thermal mass (sim/heating.ts `demandNow`);
 *   - wildfire: stone, earth and steel shed embers that burn a wooden house, and a finished one that does burn keeps its walls
 *     (sim/effects.ts, sim/construction.ts `burnStructure`);
 *   - a raid: the cover its walls give the people behind them (sim/battle.ts: the share of hits that still land);
 *   - fallout: the protection factor of the best room in it (sim/nuclear.ts `bestShelter`);
 *   - the cellar: the lodge's stone basement is a cold room like the root cellar (sim/storage.ts, pantry, kitchen, herd);
 *   - upkeep and weathering: each style's materials weather by their wear class (game/atmosphere/weathering.ts).
 */
import type { Blueprint } from './blueprints';
import type { MaterialId } from './materials';
import { REGIONS, type RegionId } from './regions';
import type { Site } from './site';
import type { GameState, Structure } from './state';
import { siteLot } from './lotListing';

/** How the place stands to a style's material: sawn / gathered on the land, hauled in, or (earth walls) a wet climate. */
export type MatFit = 'local' | 'hauled' | 'wet';

export interface HousingStyle {
  kind: string;
  /** The blueprint and look it shares (`lodge_solar` is a lodge). */
  base: string;
  name: string;
  /** What the walls are, for the menu card. */
  walls: string;
  /** People it sleeps (matches the kit's `sleeps`). */
  beds: number;
  /** Heating demand against a cabin's 1.0: the envelope, the thermal mass, the volume. */
  heat(cold: number): number;
  /** Ember ignition against a wooden house's 1.0 in a wildfire, and whether the walls stand when it burns anyway. */
  ember: number;
  keepsWalls: boolean;
  /** The share of a raid's hits that still land on a person behind these walls, against a cabin's 1.0 (lower is better). */
  cover: number;
  /** Fallout protection factor of its best room (a wood frame house is about 3, a basement 20 to 40). */
  pf: number;
  /** Bin room for roots in its cellar (kcal): only a house with a real basement has one. */
  cellarKcal: number;
  /** Dry goods shelf room (kcal), the pantry (sim/storage.ts). */
  pantry: number;
  /** The county's permit fee (sim/paperwork.ts). */
  permit: number;
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export const HOUSING_STYLES: Record<string, HousingStyle> = {
  lodge: {
    kind: 'lodge', base: 'lodge', name: 'Lodge', walls: 'log walls on a stone-faced walkout basement', beds: 10,
    // 540 m² under the roof and a wall of glass in the gable: more to heat than any other house, but the earth-sheltered basement and 30 cm logs hold heat
    heat: cold => 1.35 - 0.05 * clamp(cold - 0.6, 0, 1),
    ember: 0.85, keepsWalls: false, cover: 0.9, pf: 25, cellarKcal: 1_500_000, pantry: 5_000_000, permit: 6000,
  },
  lodge_solar: {
    kind: 'lodge_solar', base: 'lodge', name: 'Lodge with a solar roof', walls: 'log walls on a stone-faced walkout basement, panels on the south roof', beds: 10,
    heat: cold => 1.35 - 0.05 * clamp(cold - 0.6, 0, 1),
    ember: 0.85, keepsWalls: false, cover: 0.9, pf: 25, cellarKcal: 1_500_000, pantry: 5_000_000, permit: 7000,
  },
  stone_house: {
    kind: 'stone_house', base: 'stone_house', name: 'Stone house', walls: '45 cm fieldstone walls, a slate-grey metal roof', beds: 6,
    // thermal mass evens out the day and night, and a stone house is slow to chill
    heat: () => 0.85,
    ember: 0.25, keepsWalls: true, cover: 0.7, pf: 10, cellarKcal: 0, pantry: 3_000_000, permit: 4000,
  },
  timber_frame: {
    kind: 'timber_frame', base: 'timber_frame', name: 'Timber-frame house', walls: 'pegged post-and-beam frame, insulated panel walls', beds: 6,
    // structural insulated panels between the posts: the tightest, best-insulated wall in the kit
    heat: () => 0.7,
    ember: 0.8, keepsWalls: false, cover: 1.1, pf: 3, cellarKcal: 0, pantry: 3_000_000, permit: 4000,
  },
  container_house: {
    kind: 'container_house', base: 'container_house', name: 'Container house', walls: 'three 40 ft shipping containers, spray-foamed inside', beds: 4,
    // steel conducts: a cold bridge at every rib and a cold corner, even with spray foam
    heat: () => 1.1,
    ember: 0.3, keepsWalls: true, cover: 0.8, pf: 2, cellarKcal: 0, pantry: 1_400_000, permit: 2500,
  },
  adobe_house: {
    kind: 'adobe_house', base: 'adobe_house', name: 'Adobe house', walls: '45 cm rammed earth, a viga ceiling', beds: 4,
    // mass swings with the day: very good where the nights are cold and the days warm, merely fair in a long hard winter
    heat: cold => 0.65 + 0.5 * clamp(cold - 0.6, 0, 1),
    ember: 0.2, keepsWalls: true, cover: 0.7, pf: 12, cellarKcal: 0, pantry: 2_000_000, permit: 3000,
  },
};

export const STYLE_KINDS: readonly string[] = Object.keys(HOUSING_STYLES);
export const isStyleHome = (kind: string): boolean => kind in HOUSING_STYLES;
export const styleOf = (kind: string): HousingStyle | undefined => HOUSING_STYLES[kind];
/** The housing menu's order: the showcase first. */
export const STYLE_ORDER: readonly string[] = ['lodge', 'lodge_solar', 'stone_house', 'timber_frame', 'container_house', 'adobe_house'];

// ── where the materials are ──

/** Regions with rock at the surface: stone is gathered off the land (the rest has it hauled from a quarry). */
const ROCKY: ReadonlySet<RegionId> = new Set<RegionId>(['mountain_west', 'appalachia', 'desert', 'new_england', 'ozarks', 'hill_country', 'north_woods', 'pnw']);
/** Rain a year (mm) an unstabilised earth wall stands up to; past `RAIN_MAX` even a cement-stabilised wall is not worth it. */
export const DRY_MM = 520, RAIN_MAX = 800;
/** Standing timber (against the usual 1.0) that a lodge needs on the land: about 90 saw logs. */
export const LODGE_TIMBER = 0.5;

export interface StyleFit {
  /** Why it cannot be built on this land (null = it can). */
  off: string | null;
  /** The region note on the menu card. */
  note: string;
  /** What the price and hours follow (null = the plain bill). */
  mat: MatFit | null;
}

/** How a style suits a place: what is local, what has to be hauled, and what the land rules out. Pure. */
export function fitOf(site: Pick<Site, 'region' | 'timber' | 'lot' | 'home'>, kind: string): StyleFit {
  const R = REGIONS[site.region];
  const base = HOUSING_STYLES[kind]?.base ?? kind;
  switch (base) {
    case 'lodge': {
      const woods = site.timber >= LODGE_TIMBER;
      const lot = siteLot(site);
      const level = lot ? lot.stats.padFrac > 0.97 && lot.stats.meanSlopePct < 4 : false;
      return {
        off: !woods ? `not enough standing timber on this land for a lodge (it takes about 90 saw logs; ${R.name} woods here run ${site.timber.toFixed(1)} against the usual 1.0)`
          : level ? 'this land is level: a walkout basement needs a slope to be cut into' : null,
        note: woods ? `logs from your own timber (about 90 saw logs) · built on a slope: the walkout basement is cut into the hill` : `${R.name}: too little timber for the logs`,
        mat: null,
      };
    }
    case 'stone_house': {
      const rocky = ROCKY.has(site.region);
      return { off: null, mat: rocky ? 'local' : 'hauled', note: rocky ? `${R.name} has rock at the surface: stone gathered off the land, cheaper but slow` : `no rock here: fieldstone is hauled from a quarry, about a third dearer` };
    }
    case 'timber_frame': {
      const woods = site.timber >= 0.9;
      return { off: null, mat: woods ? 'local' : null, note: woods ? 'your own sawn timbers: milled on site, cheaper but slower' : 'timbers and panels bought in (glulam beams, insulated panels)' };
    }
    case 'container_house':
      return { off: null, mat: null, note: R.rainMm > 1000 ? `${R.name} is wet: the steel rusts, keep the paint up` : R.julyHighF >= 90 ? 'hot country: needs a shade roof and heavy insulation' : 'used 40 ft containers, delivered: the quickest house in the kit' };
    case 'adobe_house': {
      if (R.rainMm > RAIN_MAX) return { off: `${R.rainMm} mm of rain a year would wash an earth wall: adobe is for dry country (under ${RAIN_MAX} mm)`, note: 'earth walls need a dry climate', mat: 'wet' };
      if (R.rainMm > DRY_MM) return { off: null, mat: 'wet', note: `${R.rainMm} mm of rain a year: the rammed earth needs extra cement and deep eaves` };
      return { off: null, mat: 'local', note: `dry country: the walls are rammed from the earth you dig for the footings` };
    }
    default:
      return { off: null, mat: null, note: '' };
  }
}

/** The adjustments to a style's bill and hours for how local its material is (multipliers on the named materials and on every stage's hours). */
const MAT_ADJUST: Partial<Record<string, Partial<Record<MatFit, { mats: Partial<Record<MaterialId, number>>; hours: number }>>>> = {
  stone_house: { local: { mats: { fieldstone: 0.55 }, hours: 1.1 }, hauled: { mats: { fieldstone: 1.35 }, hours: 1 } },
  timber_frame: { local: { mats: { lumber: 0.85 }, hours: 1.12 } },
  adobe_house: { wet: { mats: { concrete: 1.5 }, hours: 1.15 } },
};

const styledCache = new Map<string, Blueprint>();
/** A blueprint with a style's local-material adjustments applied (cached; the plain one if there are none). */
export function styledBlueprint(bp: Blueprint, mat: MatFit | null | undefined): Blueprint {
  const adj = mat ? MAT_ADJUST[HOUSING_STYLES[bp.kind]?.base ?? bp.kind]?.[mat] : undefined;
  if (!adj) return bp;
  const key = `${bp.kind}:${mat}`;
  let out = styledCache.get(key);
  if (!out) {
    out = {
      ...bp,
      stages: bp.stages.map(st => ({
        ...st,
        hours: Math.round(st.hours * adj.hours),
        materials: Object.fromEntries(Object.entries(st.materials).map(([m, n]) => [m, Math.max(1, Math.round((n as number) * (adj.mats[m as MaterialId] ?? 1)))])) as Blueprint['stages'][number]['materials'],
      })),
    };
    styledCache.set(key, out);
  }
  return out;
}

/** Stamp what the site's materials are on a newly staked structure (so the bill and the hours stay what the plan said). */
export function stampStyle(s: Pick<GameState, 'site'>, st: Structure): void {
  if (!isStyleHome(st.kind)) return;
  const f = fitOf(s.site, st.kind);
  if (f.mat) st.mat = f.mat; else delete st.mat;
}

/** Why a style cannot go on this land (null = fine): the build menu greys it with this. */
export function styleOff(site: Pick<Site, 'region' | 'timber' | 'lot' | 'home'>, kind: string): string | null {
  return isStyleHome(kind) ? fitOf(site, kind).off : null;
}

// ── what a style does to the systems ──

/** Beds of the homes outside the styles (so the main home can be one of them). */
const PLAIN_BEDS: Record<string, number> = { timber_cabin: 4, log_house: 6, farmhouse: 6, trailer: 4 };

/** The main home: the finished home with the most beds (the family's stove heats it). Hot (the stove asks every step): no allocation. */
export function mainHome(s: Pick<GameState, 'structures'>): Structure | undefined {
  let best: Structure | undefined, beds = -1;
  for (const st of s.structures) {
    if (st.finishedAt === null || st.unplaced) continue;
    const b = HOUSING_STYLES[st.kind]?.beds ?? PLAIN_BEDS[st.kind] ?? -1;
    if (b > beds) { beds = b; best = st; }
  }
  return best;
}

/** Heating demand against a cabin's 1.0, for the main home's style (1 for any house outside the styles). */
export function heatFactor(s: Pick<GameState, 'structures' | 'site'>): number {
  const h = mainHome(s);
  const st = h && HOUSING_STYLES[h.kind];
  return st ? st.heat(REGIONS[s.site.region].cold) : 1;
}

/** Ember ignition in a wildfire against a wooden building's 1.0. */
export const emberFactor = (kind: string): number => HOUSING_STYLES[kind]?.ember ?? 1;
/** Do the walls stand when it burns anyway (it loses its roof and its finish, not its walls)? */
export const keepsWalls = (kind: string): boolean => HOUSING_STYLES[kind]?.keepsWalls ?? false;
/** The multiplier on a building's cover in a raid (1 for a cabin). */
export const coverFactor = (kind: string): number => HOUSING_STYLES[kind]?.cover ?? 1;
/** The fallout protection factor of a style (0 = not a style: ask the old table). */
export const stylePF = (kind: string): number => HOUSING_STYLES[kind]?.pf ?? 0;
/** Does this kind have a cellar (a real basement)? */
export const hasBasement = (kind: string): boolean => (HOUSING_STYLES[kind]?.cellarKcal ?? 0) > 0;
export const cellarKcalOf = (kind: string): number => HOUSING_STYLES[kind]?.cellarKcal ?? 0;
/** The finished houses with a real basement (the lodge): each is a cold cellar beside the root cellar. */
export const cellarHouses = (s: Pick<GameState, 'structures'>): Structure[] => s.structures.filter(st => st.finishedAt !== null && !st.unplaced && st.kind in HOUSING_STYLES && hasBasement(st.kind));
export const pantryOf = (kind: string): number | undefined => HOUSING_STYLES[kind]?.pantry;

/** One line for the card: what the style does, in plain words. */
export function styleFacts(kind: string, cold = 1): string[] {
  const st = HOUSING_STYLES[kind];
  if (!st) return [];
  const heat = st.heat(cold);
  const out = [`${st.beds} beds`, heat <= 0.8 ? `burns ${Math.round((1 - heat) * 100)}% less wood than a cabin` : heat >= 1.15 ? `burns ${Math.round((heat - 1) * 100)}% more wood than a cabin` : 'heats like a cabin'];
  out.push(st.ember <= 0.35 ? 'sheds wildfire embers' : st.ember < 1 ? 'a little fire-resistant' : 'burns like any wood house');
  out.push(st.cover <= 0.75 ? 'thick walls stop rifle rounds' : st.cover < 1 ? 'solid walls, decent cover' : st.cover > 1 ? 'thin walls: little cover' : 'wall cover like a cabin');
  if (st.cellarKcal > 0) out.push('stone basement is a cold cellar');
  return out;
}
