/**
 * How the way in is built, by region (docs/DECISIONS.md, "Roads follow the
 * land"): the design grade, the curve radii, whether the country allows a
 * bore through a spur, which crossing the creek gets, and the one price table
 * every road structure is quoted from (sim/improvements.ts re-exports the two
 * old constants from here, so there is still one table).
 *
 * Real references behind the numbers (US low-volume and private roads):
 *  - AASHTO Guidelines for Geometric Design of Very Low-Volume Local Roads:
 *    gravel to 8-10 % comfortable, 12-14 % the practical limit for a loaded
 *    truck, grade eased to 4-5 % on a switchback landing.
 *  - IFC 2021 App. D / NFPA 1 (fire access): 12 % typical county limit, 15 %
 *    with approval; inside turning radius 28 ft min (we use 12 m, a pickup and
 *    trailer); USFS Road Preconstruction Handbook for logging spurs (single
 *    lane, 8-10 % sustained, pitches to 15-18 %, 50 ft hairpin radius).
 *  - Cattle guards (Texas gates) on open-range gates in the West; low-water
 *    crossings (slab with vent pipes, "dips") in the Ozarks, the Hill Country,
 *    Appalachian hollows and the desert; corrugated-metal culverts 18-48 in on
 *    small creeks everywhere; one-lane steel / timber bridges 12-14 ft wide on
 *    rural township roads.
 *  - Section-line roads on the Plains survey grid (1 mile), with right-angle
 *    jogs at correction lines; hollow roads that follow the creek (Appalachia);
 *    logging-road spurs with culverts (Pacific Northwest); stone-walled lanes
 *    that bend round old field boundaries (New England).
 * Pure data.
 */
import type { RegionId } from './regions';

/** 1 world unit = 6 m. */
export const UNIT_M = 6;
export const M_TO_FT = 3.281;

export type CrossingPref = 'culvert' | 'low_water' | 'bridge';

export interface RoadStyle {
  region: RegionId;
  /** The grade the road holds without a surcharge, the most a loaded truck is asked to climb (priced beyond the design grade), and the engineer's limit (the road is priced as a heavy build). Fractions. */
  gradeDesign: number; gradeMax: number; gradeHard: number;
  /** Inside radius of a curve and of a hairpin, m. */
  radiusM: number; hairpinM: number;
  /** 0 = ruler-straight, 1 = winds with the land: sets the turn penalty and how much the road wanders on level ground. */
  curviness: number;
  /** 0-1: a hollow road keeps to the creek (Appalachia 1). */
  follows: number;
  /** Plains: the road runs only along the survey grid (right-angle jogs). */
  grid: boolean;
  /** A short bore through a spur is allowed (the rock holds it: Mountain West, Appalachia, Pacific Northwest, New England). */
  tunnels: boolean;
  /** The creek crossing the country builds: small creeks get a culvert, `low_water` where it is the habit, a bridge when the span is wide. */
  crossing: CrossingPref;
  /** Widest channel (m) a culvert (or a ford / low-water slab, for those regions) is used for; wider spans take a bridge. */
  culvertMaxM: number; lowWaterMaxM: number;
  /** A cattle guard at the gate (open range). */
  cattleGuard: boolean;
  /** Guardrail on the drop side: steel W-beam, timber / log, or none. */
  guardrail: 'steel' | 'timber' | 'none';
  /** A dry-stack wall along the lane (New England). */
  laneWall: boolean;
  /** What the road is called in the text. */
  noun: string;
  /** One line of why (the card reads it). */
  why: string;
}

const S = (o: Omit<RoadStyle, 'region'>, region: RegionId): RoadStyle => ({ region, ...o });

export const ROAD_STYLE: Record<RegionId, RoadStyle> = {
  mountain_west: S({ gradeDesign: 0.08, gradeMax: 0.12, gradeHard: 0.17, radiusM: 15, hairpinM: 12, curviness: 0.7, follows: 0.1, grid: false, tunnels: true, crossing: 'bridge', culvertMaxM: 3, lowWaterMaxM: 0, cattleGuard: true, guardrail: 'steel', laneWall: false, noun: 'ranch road', why: 'Switchbacks and cut-and-fill benches up the range front; a cattle guard at the gate; steel guardrail on the drop side.' }, 'mountain_west'),
  appalachia: S({ gradeDesign: 0.09, gradeMax: 0.14, gradeHard: 0.2, radiusM: 12, hairpinM: 10, curviness: 1, follows: 1, grid: false, tunnels: true, crossing: 'low_water', culvertMaxM: 2.5, lowWaterMaxM: 12, cattleGuard: false, guardrail: 'timber', laneWall: false, noun: 'hollow road', why: 'A hollow road that follows the creek with many bends and a low-water crossing; steep pitches up the spur.' }, 'appalachia'),
  desert: S({ gradeDesign: 0.06, gradeMax: 0.1, gradeHard: 0.15, radiusM: 18, hairpinM: 15, curviness: 0.35, follows: 0, grid: false, tunnels: false, crossing: 'low_water', culvertMaxM: 2.5, lowWaterMaxM: 14, cattleGuard: true, guardrail: 'none', laneWall: false, noun: 'caliche road', why: 'Washes cross the road in dips (a ford, no bridge); a cattle guard at the gate; gentle bends round the arroyo heads.' }, 'desert'),
  north_woods: S({ gradeDesign: 0.06, gradeMax: 0.1, gradeHard: 0.15, radiusM: 18, hairpinM: 15, curviness: 0.5, follows: 0, grid: false, tunnels: false, crossing: 'culvert', culvertMaxM: 3.5, lowWaterMaxM: 0, cattleGuard: false, guardrail: 'none', laneWall: false, noun: 'gravel lane', why: 'Gravel with gentle curves round the bog and the glacial swells; culverts on the drains.' }, 'north_woods'),
  plains: S({ gradeDesign: 0.04, gradeMax: 0.06, gradeHard: 0.1, radiusM: 25, hairpinM: 20, curviness: 0, follows: 0, grid: true, tunnels: false, crossing: 'culvert', culvertMaxM: 3.5, lowWaterMaxM: 0, cattleGuard: true, guardrail: 'none', laneWall: false, noun: 'section-line road', why: 'Straight as the survey grid, with right-angle jogs where the draw or the section line forces one; a culvert over the draw.' }, 'plains'),
  pnw: S({ gradeDesign: 0.08, gradeMax: 0.12, gradeHard: 0.18, radiusM: 12, hairpinM: 10, curviness: 0.85, follows: 0.35, grid: false, tunnels: true, crossing: 'culvert', culvertMaxM: 4.5, lowWaterMaxM: 0, cattleGuard: false, guardrail: 'timber', laneWall: false, noun: 'logging spur', why: 'A logging-road spur with big culverts at every draw and a log guardrail; winds round the stumps and the ridges.' }, 'pnw'),
  upper_midwest: S({ gradeDesign: 0.06, gradeMax: 0.1, gradeHard: 0.15, radiusM: 18, hairpinM: 15, curviness: 0.45, follows: 0, grid: false, tunnels: false, crossing: 'culvert', culvertMaxM: 3.5, lowWaterMaxM: 0, cattleGuard: false, guardrail: 'none', laneWall: false, noun: 'town road', why: 'Gravel with gentle curves round the moraine swells and the woodlot; culverts on the drains.' }, 'upper_midwest'),
  new_england: S({ gradeDesign: 0.08, gradeMax: 0.12, gradeHard: 0.17, radiusM: 12, hairpinM: 10, curviness: 0.9, follows: 0.3, grid: false, tunnels: true, crossing: 'culvert', culvertMaxM: 3, lowWaterMaxM: 0, cattleGuard: false, guardrail: 'none', laneWall: true, noun: 'farm lane', why: 'A stone-walled lane that curves round the old field boundaries and ledge; stone culverts under it.' }, 'new_england'),
  ozarks: S({ gradeDesign: 0.09, gradeMax: 0.14, gradeHard: 0.2, radiusM: 12, hairpinM: 10, curviness: 0.8, follows: 0.5, grid: false, tunnels: false, crossing: 'low_water', culvertMaxM: 2.5, lowWaterMaxM: 12, cattleGuard: false, guardrail: 'timber', laneWall: false, noun: 'ridge road', why: 'A chunk-rock ridge road that winds down to the hollow and fords the creek on a low-water slab.' }, 'ozarks'),
  hill_country: S({ gradeDesign: 0.07, gradeMax: 0.12, gradeHard: 0.17, radiusM: 15, hairpinM: 12, curviness: 0.5, follows: 0.2, grid: false, tunnels: false, crossing: 'low_water', culvertMaxM: 3, lowWaterMaxM: 14, cattleGuard: true, guardrail: 'none', laneWall: false, noun: 'ranch road', why: 'Caliche over limestone with low-water crossings on the dry creeks; a cattle guard at the gate.' }, 'hill_country'),
  rust_belt: S({ gradeDesign: 0.08, gradeMax: 0.12, gradeHard: 0.17, radiusM: 15, hairpinM: 12, curviness: 0.6, follows: 0.2, grid: false, tunnels: false, crossing: 'culvert', culvertMaxM: 3.5, lowWaterMaxM: 0, cattleGuard: false, guardrail: 'steel', laneWall: false, noun: 'township road', why: 'A township-road spur that curves down to the ravine and crosses it on a one-lane bridge.' }, 'rust_belt'),
};

/** One price table (USD, 2025 rural contractor). `improvements.ts` re-exports `perFt` and `culvert` as DRIVE_PER_FT and CULVERT. */
export const ROAD_PRICE = {
  /** Gravel drive, per foot of road, on easy ground. */
  perFt: 20,
  /** One corrugated-metal culvert with headwalls (up to ~3 m of channel). */
  culvert: 1_200,
  /** A big arch culvert / multi-pipe on a wide draw (PNW). */
  archCulvert: 9_000,
  /** A gravel-armoured dip across a small wash (a ford). */
  ford: 1_500,
  /** Low-water slab with vent pipes: a base plus per foot of channel. */
  lowWaterBase: 3_000, lowWaterPerFt: 300,
  /** One-lane bridge (steel stringers, timber deck): abutments plus per foot of span. */
  bridgeBase: 8_000, bridgePerFt: 2_200,
  /** A heavier two-lane bridge on a wide channel. */
  bridgeBigBase: 15_000, bridgeBigPerFt: 4_200,
  /** Rock bore (single lane, drill-and-blast with rock bolts and shotcrete): both stone portals together, and the bore per foot. */
  tunnelPortal: 60_000, tunnelPerFt: 4_000,
  /** Cattle guard (rail grid over a pit). */
  cattleGuard: 2_500,
  /** Dry-stack retaining wall, per foot of wall per metre of height. */
  wallPerFtM: 55,
  /** Guardrail per foot (steel W-beam; log / timber rail is 0.6 of it). */
  guardrailPerFt: 28,
  /** Earthwork, per cubic metre moved (cut and fill, hauled short). */
  earthM3: 11,
  /** A heavier base and ditching on a grade past the design grade: per foot, per percentage point over. */
  gradeSurchargePerFtPct: 0.9,
  /** Engineer's survey and drawings when the road is past the hard limit. */
  engineer: 6_000,
} as const;

/** Days of work each structure adds to the contractor's schedule. */
export const ROAD_DAYS = { culvert: 1, archCulvert: 5, ford: 1, low_water: 4, bridge1: 18, bridge: 30, tunnel: 75, cattle_guard: 1, wall100ft: 2 } as const;
