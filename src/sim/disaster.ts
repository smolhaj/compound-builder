/**
 * The collapse clock (GDS §4, decided with the user): one engine for every
 * disaster. A run is peacetime → warning signs → impact → survival. After
 * the impact, the outside world's services (the tracks) fail and recover on
 * curves the disaster sets (1 = normal, 0 = gone). A disaster can chain into
 * an aftermath, whose tracks combine with its own (the worse one wins).
 * Pure and deterministic from the seed.
 */
import { pickPeaceNews, seasonOf } from './newsPool';
import type { RegionId } from './regions';
import { mulberry32 as rng } from './rng';
import { rollImpact } from './impactZone';
import { WINTER_KINDS, isSlowKind } from './slowClimate';

/** "Never" (Free build until triggered); JSON-safe, unlike Infinity. */
export const NEVER = 1e9;

export type Track = 'grid' | 'fuel' | 'stores' | 'deliveries' | 'medical' | 'law' | 'phone' | 'banks';
export const TRACKS: Track[] = ['grid', 'fuel', 'stores', 'deliveries', 'medical', 'law', 'phone', 'banks'];
export const TRACK_NAME: Record<Track, string> = {
  grid: 'Grid power', fuel: 'Fuel stations', stores: 'Grocery stores', deliveries: 'Deliveries', medical: 'Hospital & pharmacy', law: 'Police & 911', phone: 'Phone & internet', banks: 'Banks & cash',
};

export type DisasterKind = 'grid_down' | 'financial' | 'lawless' | 'drought' | 'pandemic' | 'nuclear' | 'solar_flare' | 'wildfire' | 'ash_winter' | 'cyberattack'
  | 'zombies' | 'invasion' | 'civil_war' | 'bioweapon' | 'asteroid' | 'unknown'
  // the owner-chosen scenarios (WP0 placeholders; each has its own module in sim/disasters/ and a place in the Surprise pool since WP10)
  | 'emp' | 'mega_quake' | 'crop_blight' | 'dam_flood' | 'supervolcano'
  // WP7: the herd and the flock (docs/scenarios/livestock_plague.md)
  | 'livestock_plague'
  // WP10: the seven planned kinds (docs/scenarios/<kind>.md), each with a collapse clock and a per-kind module in sim/disasters/
  | 'satellite_loss' | 'oil_shock' | 'reactor_meltdown' | 'global_famine' | 'water_war' | 'cult_takeover' | 'mass_exodus'
  // the slow climate kinds (docs/design/climate_disasters.md, owner-approved 2026-11-19): years, not days; the era waits for the curve (sim/slowClimate.ts)
  | 'runaway_heat' | 'ice_age';
import { unscripted } from './godMode';
export type Mode = 'surprise' | 'scenario' | 'sandbox' | 'god';
/** GDS difficulty presets: Cozy (long warning, gentle raids), Standard, Hardcore (little warning, harsh raids, permadeath). */
export type { Difficulty } from './difficulty';
import { DIFFICULTY, type Difficulty } from './difficulty';
export type PeaceLength = 'random' | 'short' | 'medium' | 'long';
export type Phase = 'peace' | 'warning' | 'impact' | 'survival' | 'over';

/** How a track fails after the hit (days after it) and comes back. */
export interface TrackCurve {
  /** Days after the hit when it starts failing, and days to reach its floor. */
  at: number; fall: number;
  /** Level it falls to. */
  floor: number;
  /** Days after the hit it starts to come back ([min, max], rolled per run); null = not within the run. */
  back: [number, number] | null;
  /** Days to come back fully. */
  ramp: number;
}

export interface Variant { id: string; name: string; weight: number; curves: Partial<Record<Track, TrackCurve>> }

export interface DisasterDef {
  kind: DisasterKind;
  name: string;
  pulpy: boolean;
  /** Days of warning signs before the hit ([min, max]). */
  warn: [number, number];
  variants: Variant[];
  /** Headlines by stage of the warning (early, middle, last days), {cause} replaced with the variant's name. */
  hints: [string[], string[], string[]];
  /** The day it hits. */
  hit: string[];
  /** Likely follow-ons: kind, chance, days after the hit. */
  chain: Array<{ kind: DisasterKind; p: number; after: [number, number] }>;
  /** Words a hint may carry as `{name}`, rolled from the run (so a headline never contradicts the roll: asteroid zone). Pure of the state. */
  fill?: (o: { seed: number; region: RegionId; difficulty: Difficulty }) => Record<string, string>;
}

const C = (at: number, fall: number, floor: number, back: [number, number] | null, ramp = 7): TrackCurve => ({ at, fall, floor, back, ramp });

export const DISASTERS: Partial<Record<DisasterKind, DisasterDef>> = {
  grid_down: {
    kind: 'grid_down', name: 'Grid-down', pulpy: false, warn: [10, 40],
    variants: [
      { id: 'ice_storm', name: 'an ice storm', weight: 3, curves: { grid: C(0, 0, 0, [7, 30]), fuel: C(0, 0, 0.1, [8, 32]), stores: C(1, 3, 0.1, [10, 35]), deliveries: C(0, 1, 0, [10, 35]), medical: C(4, 4, 0.3, [10, 35]), law: C(14, 16, 0.4, [12, 34]), phone: C(1, 1, 0.1, [8, 30]), banks: C(0, 1, 0.2, [8, 31]) } },
      { id: 'substation', name: 'a coordinated substation attack', weight: 2, curves: { grid: C(0, 0, 0, [30, 120]), fuel: C(0, 0, 0.05, [32, 125]), stores: C(1, 3, 0.05, [35, 130]), deliveries: C(0, 1, 0, [35, 130]), medical: C(4, 6, 0.2, [35, 130]), law: C(14, 30, 0.15, [40, 140], 21), phone: C(1, 1, 0.1, [31, 122]), banks: C(0, 1, 0, [33, 125]) } },
      { id: 'transformer_shortage', name: 'cooked transformers that cannot be replaced for years', weight: 1, curves: { grid: C(0, 0, 0, [180, 730], 120), fuel: C(0, 0, 0.05, [200, 740], 90), stores: C(1, 4, 0.05, [210, 750], 90), deliveries: C(0, 1, 0, [210, 750], 90), medical: C(4, 10, 0.1, [210, 750]), law: C(10, 20, 0.2, [240, 760]), phone: C(0, 3, 0, [200, 740], 60), banks: C(2, 6, 0.1, [200, 740], 60) } },
      { id: 'cyber', name: 'a cyberattack on the grid', weight: 2, curves: { grid: C(0, 0, 0.1, [14, 90], 30), fuel: C(0, 0, 0.1, [16, 92], 20), stores: C(1, 3, 0.1, [18, 95]), deliveries: C(0, 2, 0, [18, 95]), medical: C(4, 6, 0.3, [18, 95]), law: C(14, 20, 0.3, [20, 100], 21), phone: C(0, 1, 0.2, [15, 91]), banks: C(0, 0, 0, [20, 100], 14) } },
      { id: 'cascade', name: 'a cascading failure of the old grid', weight: 1, curves: { grid: C(0, 0, 0, [60, 365], 45), fuel: C(0, 0, 0.05, [62, 368]), stores: C(1, 3, 0.05, [65, 370]), deliveries: C(0, 1, 0, [65, 370]), medical: C(4, 10, 0.15, [65, 370]), law: C(14, 40, 0.1, [70, 380], 30), phone: C(1, 2, 0.05, [61, 366]), banks: C(0, 1, 0, [64, 370]) } },
    ],
    hints: [
      ['Utility warns of strain on aging transformers as demand hits a record.', 'Regulator report: the regional grid has "no margin left" this winter.', 'Scattered outages across the county; crews blame old equipment.'],
      ['Rolling blackouts ordered in two neighboring states.', 'Generator and propane sales triple at the farm store.', 'FBI bulletin warns utilities of threats to substations.'],
      ['Grid operator declares an energy emergency.', 'Gas stations report long lines; some pumps are bagged.', 'Weather service: a severe storm system is building.'],
    ],
    hit: ['The lights go out across the region: {cause}.'],
    chain: [{ kind: 'lawless', p: 0.35, after: [21, 45] }],
  },
  nuclear: {
    kind: 'nuclear', name: 'Nuclear war', pulpy: false, warn: [14, 60],
    variants: [
      { id: 'distant', name: 'strikes on the missile fields', weight: 5, curves: { grid: C(0, 0, 0, [180, 720], 60), fuel: C(0, 0, 0, [200, 730], 60), stores: C(0, 2, 0, [200, 730], 60), deliveries: C(0, 0, 0, [200, 730], 60), medical: C(0, 1, 0.1, [200, 730], 60), law: C(3, 14, 0.1, [220, 760], 60), phone: C(0, 0, 0, [190, 730], 60), banks: C(0, 0, 0, null) } },
      { id: 'nearby', name: 'a strike on the nearby base', weight: 2, curves: { grid: C(0, 0, 0, null), fuel: C(0, 0, 0, null), stores: C(0, 1, 0, null), deliveries: C(0, 0, 0, null), medical: C(0, 0, 0, null), law: C(1, 7, 0.05, null), phone: C(0, 0, 0, null), banks: C(0, 0, 0, null) } },
      { id: 'exchange', name: 'a full exchange', weight: 1, curves: { grid: C(0, 0, 0, null), fuel: C(0, 0, 0, null), stores: C(0, 1, 0, null), deliveries: C(0, 0, 0, null), medical: C(0, 0, 0, null), law: C(1, 5, 0, null), phone: C(0, 0, 0, null), banks: C(0, 0, 0, null) } },
    ],
    hints: [
      ['Talks collapse; both sides recall ambassadors.', 'Markets slide on war fears; gold hits a record.', 'Military convoys seen on the county road heading north.'],
      ['DEFCON raised; embassies told to evacuate staff families.', 'Jets overhead at all hours; the base is on lockdown.', 'Neighbors say the Hendersons left for her sister\'s in Idaho.'],
      ['Emergency session at the UN breaks up without a vote.', 'Potassium iodide sold out statewide.', 'Gas lines at every station in town; some pumps empty.'],
    ],
    hit: ['EMERGENCY ALERT: BALLISTIC MISSILE THREAT INBOUND. SEEK IMMEDIATE SHELTER. THIS IS NOT A DRILL.'],
    chain: [{ kind: 'lawless', p: 0.6, after: [10, 30] }],
  },
  lawless: {
    kind: 'lawless', name: 'End of the rule of law', pulpy: false, warn: [7, 20],
    variants: [
      { id: 'walkout', name: 'the walkout of the county\'s police', weight: 3, curves: { law: C(0, 10, 0, [180, 540], 60), stores: C(0, 5, 0.1, [150, 500]), deliveries: C(0, 3, 0.1, [150, 500]), banks: C(0, 3, 0.1, [150, 500]), fuel: C(2, 20, 0.4, [120, 420]), medical: C(5, 30, 0.6, [200, 500]) } },
      { id: 'blackout_of_order', name: 'a blackout of order', weight: 2, curves: { law: C(0, 2, 0, [20, 60], 14), stores: C(0, 2, 0.1, [25, 70]), deliveries: C(0, 2, 0, [25, 70]), grid: C(0, 1, 0.2, [10, 45]), phone: C(0, 1, 0.3, [10, 40]) } },
      { id: 'drift', name: 'a slow drift into no law', weight: 1, curves: { law: C(0, 30, 0.02, null), banks: C(0, 10, 0.05, null), stores: C(10, 60, 0.2, null), grid: C(40, 90, 0.4, null), phone: C(60, 90, 0.4, null) } },
      // the single variant before WP3 (saves made then carry this id; never rolled for a new run): same curves as the walkout
      { id: 'collapse', name: 'the collapse of order', weight: 0, curves: { law: C(0, 10, 0, [180, 540], 60), stores: C(0, 5, 0.1, [150, 500]), deliveries: C(0, 3, 0.1, [150, 500]), banks: C(0, 3, 0.1, [150, 500]) } },
    ],
    hints: [['Police union warns of unpaid overtime.', 'Break-ins up sharply in town.', 'Sheriff asks residents to "be patient".'], ['Looting reported in the city.', 'Deputies stop answering calls past the county line.', 'Pawn shop out of guns and ammo.'], ['Sheriff\'s office closed "until further notice".', 'A gang is working the farms east of town.', 'Neighbors set up a roadblock at the bridge.']],
    hit: ['Nobody is coming: the sheriff\'s office has shut its doors.'],
    chain: [],
  },
  financial: {
    kind: 'financial', name: 'Financial collapse', pulpy: false, warn: [30, 90],
    variants: [
      { id: 'bank_holiday', name: 'a bank shutdown that never ends', weight: 3, curves: { banks: C(0, 1, 0.05, [90, 300], 60), stores: C(3, 20, 0.3, [60, 200], 60), deliveries: C(5, 25, 0.4, [60, 200], 60), fuel: C(10, 30, 0.4, [60, 220], 60), medical: C(20, 40, 0.4, [90, 300], 60), law: C(20, 40, 0.35, [100, 330], 60) } },
      { id: 'hyperinflation', name: 'hyperinflation', weight: 2, curves: { banks: C(0, 20, 0, [200, 500], 90), stores: C(10, 40, 0.25, [150, 450], 90), deliveries: C(10, 40, 0.3, [150, 450], 90), fuel: C(15, 30, 0.3, [150, 450], 90), medical: C(20, 50, 0.3, [150, 450], 90), law: C(30, 60, 0.3, [150, 450], 90), grid: C(60, 60, 0.5, [150, 450], 60) } },
      { id: 'sovereign_default', name: 'a default on the national debt', weight: 1, curves: { banks: C(0, 5, 0.3, [60, 200], 60), law: C(10, 40, 0.4, [90, 300], 60), medical: C(15, 40, 0.5, [90, 300], 60), deliveries: C(10, 40, 0.5, [90, 300], 60), stores: C(10, 40, 0.5, [60, 250], 60), fuel: C(10, 30, 0.5, [90, 300], 60), grid: C(60, 60, 0.7, [150, 400], 60), phone: C(60, 60, 0.8, [150, 400], 60) } },
      { id: 'bail_in', name: 'a banking crisis ended by a bail-in of large deposits', weight: 2, curves: { banks: C(0, 1, 0.1, [45, 150], 30), stores: C(5, 20, 0.5, [40, 150], 30), deliveries: C(5, 20, 0.5, [40, 150], 30), fuel: C(10, 30, 0.6, [60, 180], 30), medical: C(20, 40, 0.5, [90, 250], 60), law: C(20, 40, 0.5, [90, 250], 60) } },
    ],
    hints: [['Two regional banks fail in a week; lines outside a branch in the city.', 'Groceries up 4% again this month.', 'The mill in town lays off a shift.'], ['"Temporary" withdrawal limits at every bank.', 'Gold hits a record; the pawn shop is buying.', 'Eggs and formula rationed at the store.'], ['ATMs read "temporarily unavailable".', 'The governor asks for calm.', 'Neighbors are swapping eggs for diesel.', 'Treasury auction fails to find buyers; the dollar slides.', 'Officials float "a deposit levy to stabilize the system".']],
    hit: ['The banks don\'t open: accounts frozen "until further notice".'],
    chain: [{ kind: 'lawless', p: 0.5, after: [45, 120] }],
  },
  drought: {
    kind: 'drought', name: 'Drought', pulpy: false, warn: [90, 200],
    variants: [
      { id: 'megadrought', name: 'a megadrought', weight: 1, curves: { stores: C(30, 90, 0.6, [400, 800], 120), deliveries: C(60, 90, 0.7, null), law: C(120, 120, 0.6, [500, 900], 90) } },
    ],
    hints: [['Snowpack 40% of normal.', 'Hay prices double at the sale barn.', 'Burn ban in effect county-wide.'], ['The well driller is booked out six months.', 'Ranchers selling their herds early.', 'The creek is lower than anyone remembers.'], ['A neighbor\'s well is sucking air.', 'Reservoir at dead pool; irrigation called off.', 'The county starts trucking water to the subdivisions.']],
    hit: ['The creek has stopped running. Wells across the county are failing.'],
    chain: [{ kind: 'wildfire', p: 0.35, after: [60, 200] }],
  },
  pandemic: {
    kind: 'pandemic', name: 'Pandemic', pulpy: false, warn: [30, 60],
    variants: [
      { id: 'wave', name: 'the pandemic', weight: 3, curves: { medical: C(0, 14, 0.1, [200, 420], 60), stores: C(3, 14, 0.4, [60, 200], 30), deliveries: C(5, 20, 0.5, [60, 200], 30), law: C(30, 60, 0.6, [120, 300], 30), banks: C(10, 30, 0.7, [60, 200], 30), fuel: C(10, 30, 0.6, [60, 200], 30) } },
      { id: 'flu_1918', name: 'a 1918-type influenza', weight: 2, curves: { medical: C(0, 10, 0.05, [240, 500], 90), stores: C(3, 14, 0.35, [90, 260], 45), deliveries: C(5, 20, 0.4, [90, 260], 45), law: C(25, 50, 0.45, [150, 330], 45), banks: C(10, 30, 0.6, [90, 260], 45), fuel: C(10, 30, 0.5, [90, 260], 45), grid: C(120, 90, 0.8, [240, 420], 90) } },
      { id: 'high_fatality', name: 'a high-fatality plague', weight: 1, curves: { medical: C(0, 7, 0, [300, 600], 120), stores: C(5, 20, 0.2, [150, 400], 60), deliveries: C(7, 25, 0.25, [150, 400], 60), law: C(20, 45, 0.25, [180, 420], 60), banks: C(10, 30, 0.4, [150, 400], 60), fuel: C(12, 40, 0.3, [150, 400], 60), grid: C(90, 120, 0.5, [300, 600], 120), phone: C(150, 120, 0.7, [400, 700], 90) } },
    ],
    hints: [['A cluster of "atypical pneumonia" overseas.', 'Airports begin screening.', 'Masks sold out online.'], ['First case in the state.', 'The hospital restricts visitors.', 'A neighbor\'s daughter, a nurse: "it\'s bad in the ER."'], ['Schools close statewide.', 'Toilet paper gone from every shelf.', 'Stay-at-home order expected tonight.']],
    hit: ['Stay-at-home order: the hospitals are full and the county is locking down.'],
    chain: [{ kind: 'lawless', p: 0.2, after: [60, 150] }],
  },
  solar_flare: {
    kind: 'solar_flare', name: 'Solar flare (Carrington event)', pulpy: false, warn: [1, 3],
    variants: [
      { id: 'g4', name: 'a strong (G4) geomagnetic storm', weight: 3, curves: { grid: C(0, 0, 0.1, [10, 60], 20), phone: C(0, 2, 0.2, [3, 30], 10), fuel: C(0, 2, 0.3, [12, 62], 20), stores: C(3, 5, 0.3, [14, 65], 20), deliveries: C(2, 4, 0.3, [14, 65], 20), medical: C(6, 8, 0.5, [14, 65], 20), banks: C(1, 3, 0.2, [5, 40], 10), law: C(35, 30, 0.6, [20, 70], 20) } },
      { id: 'near_miss', name: 'an aurora storm that missed the grid', weight: 1, curves: { phone: C(0, 1, 0.7, [1, 3], 1) } },
      { id: 'carrington', name: 'a Carrington-class solar storm', weight: 3, curves: { grid: C(0, 0, 0, [240, 730], 90), phone: C(0, 1, 0.1, [60, 240], 60), fuel: C(0, 1, 0.1, [250, 740], 60), stores: C(2, 4, 0.1, [250, 740], 60), deliveries: C(0, 2, 0.05, [250, 740], 60), medical: C(5, 10, 0.2, [250, 740], 60), banks: C(0, 1, 0.05, [250, 740], 60), law: C(20, 40, 0.15, [260, 760], 60) } },
    ],
    hints: [['Space weather service: an X-class flare.', 'Aurora forecast as far south as Texas.'], ['A coronal mass ejection is on its way: 18–36 hours.', 'The grid operator asks people to unplug what they can.'], ['The northern lights are bright red, straight overhead.', 'Radio full of static.']],
    hit: ['The aurora fills the sky; transformers across the continent are burning. The grid is gone.'],
    chain: [{ kind: 'lawless', p: 0.45, after: [21, 60] }],
  },
  wildfire: {
    kind: 'wildfire', name: 'Wildfire', pulpy: false, warn: [2, 6],
    variants: [
      { id: 'front', name: 'the fire front', weight: 1, curves: { grid: C(0, 0, 0, [10, 40], 10), phone: C(0, 1, 0.3, [5, 20], 5), deliveries: C(0, 1, 0.2, [10, 30], 10), stores: C(0, 2, 0.4, [10, 30], 10), fuel: C(0, 1, 0.3, [10, 30], 10) } },
    ],
    hints: [['Red flag warning: critical fire weather.', 'A smoke column over the range to the west.'], ['Ash falling in town; the sky is orange at noon.', 'The co-op cuts power to the lines in the hills ("public safety shutoff").'], ['Evacuation level GO for the valley.', 'The scanner says it jumped the highway.']],
    hit: ['The fire front comes over the bench in the night.'],
    chain: [],
  },
  ash_winter: {
    kind: 'ash_winter', name: 'Supervolcano / ash winter', pulpy: false, warn: [7, 30],
    variants: [
      { id: 'yellowstone', name: 'the Yellowstone eruption', weight: 1, curves: { grid: C(0, 2, 0.1, [60, 300], 60), fuel: C(0, 3, 0.1, [90, 400], 60), stores: C(1, 7, 0.1, [120, 500], 60), deliveries: C(0, 3, 0, [120, 500], 60), medical: C(3, 14, 0.3, [120, 500], 60), phone: C(1, 5, 0.3, [30, 200], 30), banks: C(10, 30, 0.3, [120, 500], 60), law: C(20, 60, 0.2, [150, 550], 60) } },
    ],
    hints: [['A swarm of earthquakes under Yellowstone.', 'The park closes its roads "for safety".'], ['The ground at Norris has risen three feet.', 'USGS raises the alert level to WARNING.'], ['Steam and ash from the caldera; flights grounded.', 'Ash forecast for the whole Mountain West.']],
    hit: ['Yellowstone erupts. Gray ash is falling like snow and the sun is a dim disc.'],
    chain: [{ kind: 'lawless', p: 0.4, after: [30, 90] }],
  },
  cyberattack: {
    kind: 'cyberattack', name: 'Cyberattack on infrastructure', pulpy: false, warn: [5, 20],
    variants: [
      { id: 'payments_and_pipeline', name: 'a payments and pipeline attack', weight: 3, curves: { grid: C(0, 0, 0.8, [7, 30], 10), fuel: C(0, 3, 0.3, [7, 45], 20), stores: C(2, 6, 0.5, [10, 50], 20), deliveries: C(1, 5, 0.5, [10, 50], 20), medical: C(3, 6, 0.7, [10, 50], 20), law: C(20, 30, 0.7, [20, 60], 20), phone: C(0, 2, 0.5, [5, 30], 10), banks: C(0, 0, 0, [10, 60], 20) } },
      { id: 'grid_and_water', name: 'an attack on the grid and the water plants', weight: 2, curves: { grid: C(0, 0, 0.1, [14, 120], 30), fuel: C(0, 2, 0.1, [16, 125], 30), stores: C(1, 4, 0.2, [20, 130], 30), deliveries: C(0, 2, 0.2, [20, 130], 30), medical: C(3, 8, 0.25, [20, 130], 30), law: C(10, 25, 0.4, [30, 140], 30), phone: C(0, 2, 0.3, [10, 100], 30), banks: C(0, 0, 0, [14, 120], 30) } },
      { id: 'wiper', name: 'a wiper that bricked the controllers', weight: 1, curves: { grid: C(0, 0, 0.9, null, 30), fuel: C(0, 0, 0.8, [7, 30], 20), stores: C(2, 5, 0.5, [20, 90], 30), deliveries: C(0, 2, 0.3, [20, 90], 30), medical: C(1, 4, 0.6, [20, 90], 30), phone: C(0, 1, 0.7, [5, 40], 20), banks: C(0, 0, 0, [20, 100], 30) } },
      { id: 'rolling', name: 'a coordinated cyberattack', weight: 6, curves: { grid: C(0, 0, 0.3, [10, 60], 40), banks: C(0, 0, 0, [14, 90], 30), phone: C(0, 1, 0.3, [7, 45], 20), fuel: C(0, 1, 0.3, [10, 60], 30), deliveries: C(1, 5, 0.3, [15, 70], 30), stores: C(2, 6, 0.3, [15, 70], 30), medical: C(2, 7, 0.5, [15, 70], 30), law: C(14, 30, 0.5, [30, 100], 30) } },
    ],
    hints: [['A ransomware attack shuts a pipeline for a week.', 'Bank apps down "for maintenance" in three states.'], ['The water utility in the city reports "anomalies".', 'Gas stations can\'t take cards.'], ['The power flickers off and on across the region.', 'Phones show "No Service" for an hour.']],
    hit: ['Everything digital stops at once: the grid, the banks, the phones. A cyberattack.'],
    chain: [{ kind: 'lawless', p: 0.25, after: [20, 60] }],
  },
  zombies: {
    kind: 'zombies', name: 'Zombies', pulpy: true, warn: [5, 15],
    variants: [{ id: 'outbreak', name: 'the outbreak', weight: 3, curves: { law: C(3, 10, 0, null), medical: C(2, 7, 0, null), stores: C(3, 7, 0, null), deliveries: C(2, 5, 0, null), grid: C(14, 30, 0, null), fuel: C(5, 15, 0, null), banks: C(5, 10, 0, null), phone: C(10, 30, 0, null) } },
      { id: 'everyone_turns', name: 'the sleeper plague', weight: 2, curves: { law: C(3, 10, 0, null), medical: C(1, 5, 0, null), stores: C(3, 7, 0, null), deliveries: C(2, 5, 0, null), grid: C(10, 25, 0, null), fuel: C(5, 15, 0, null), banks: C(5, 10, 0, null), phone: C(10, 30, 0, null) } },
      { id: 'rage', name: 'the rage', weight: 1, curves: { law: C(2, 7, 0.05, [60, 120]), medical: C(2, 7, 0, [90, 200]), stores: C(2, 6, 0.1, [40, 100]), deliveries: C(2, 5, 0.1, [50, 120]), grid: C(10, 20, 0.1, [40, 90]), fuel: C(5, 15, 0.05, [60, 140]), banks: C(5, 10, 0.1, [60, 140]), phone: C(10, 30, 0.1, [60, 140]) } }],
    hints: [['Riot at a hospital in the city: patients "attacking staff".', 'A strange rabies-like illness in the news.'], ['The National Guard is in the city. Footage is being taken down.', 'Neighbors say the interstate is closed east of here.'], ['The city has gone quiet on the radio.', 'Something is walking up the county road.']],
    hit: ['They\'re here. The dead are walking out of town.'],
    chain: [],
  },
  invasion: {
    kind: 'invasion', name: 'Invasion', pulpy: true, warn: [10, 40],
    variants: [
      { id: 'occupation', name: 'the occupation', weight: 3, curves: { law: C(0, 5, 0.2, null), grid: C(0, 2, 0.2, null), phone: C(0, 0, 0, null), banks: C(0, 2, 0, null), fuel: C(0, 5, 0.1, null), stores: C(2, 10, 0.2, null), deliveries: C(0, 3, 0.1, null), medical: C(2, 10, 0.3, null) } },
      { id: 'soft', name: 'a friendlier occupation', weight: 1, curves: { law: C(0, 5, 0.3, null), grid: C(0, 2, 0.2, [30, 60], 14), phone: C(0, 0, 0, null), banks: C(0, 2, 0.1, null), fuel: C(0, 5, 0.2, null), stores: C(2, 10, 0.3, null), deliveries: C(0, 3, 0.2, null), medical: C(2, 10, 0.4, null) } },
      { id: 'contested', name: 'an occupation with a moving front', weight: 1, curves: { law: C(0, 5, 0.2, null), grid: C(0, 2, 0.2, null), phone: C(0, 0, 0, null), banks: C(0, 2, 0, null), fuel: C(0, 5, 0.1, null), stores: C(2, 10, 0.2, null), deliveries: C(0, 3, 0.1, null), medical: C(2, 10, 0.3, null) } },
      { id: 'pacific', name: 'a Chinese occupation (Pacific side)', weight: 0, curves: { law: C(0, 5, 0.2, null), grid: C(0, 2, 0.2, null), phone: C(0, 0, 0, null), banks: C(0, 2, 0, null), fuel: C(0, 5, 0.1, null), stores: C(2, 10, 0.2, null), deliveries: C(0, 3, 0.1, null), medical: C(2, 10, 0.3, null) } },
      { id: 'northern', name: 'a Russian occupation (northern front)', weight: 0, curves: { law: C(0, 5, 0.2, null), grid: C(0, 2, 0.2, null), phone: C(0, 0, 0, null), banks: C(0, 2, 0, null), fuel: C(0, 5, 0.1, null), stores: C(2, 10, 0.2, null), deliveries: C(0, 3, 0.1, null), medical: C(2, 10, 0.3, null) } },
      { id: 'axis_coalition', name: 'a coalition occupation (an axis of three states)', weight: 0, curves: { law: C(0, 5, 0.2, null), grid: C(0, 2, 0.2, null), phone: C(0, 0, 0, null), banks: C(0, 2, 0, null), fuel: C(0, 5, 0.1, null), stores: C(2, 10, 0.2, null), deliveries: C(0, 3, 0.1, null), medical: C(2, 10, 0.3, null) } },
    ],
    hints: [['Satellites over the Pacific go dark.', 'Carrier groups recalled; the President addresses the nation.'], ['Paratroopers reported near the missile fields.', 'Martial law declared in three states.'], ['Columns of vehicles on the interstate, not ours.', 'Radio stations off the air one by one.']],
    hit: ['Foreign troops are in the valley. Checkpoints on every road.'],
    chain: [],
  },
  civil_war: {
    kind: 'civil_war', name: 'Civil war', pulpy: true, warn: [20, 60],
    variants: [
      { id: 'factions', name: 'the war between the Cascade Compact and the Plains Alliance', weight: 3, curves: { law: C(0, 20, 0.1, null), grid: C(10, 30, 0.3, null), fuel: C(0, 20, 0.2, null), banks: C(0, 10, 0.1, null), stores: C(5, 30, 0.3, null), deliveries: C(5, 30, 0.2, null), medical: C(10, 40, 0.3, null), phone: C(5, 20, 0.4, null) } },
      { id: 'uprising', name: 'a sudden uprising between the Compact and the Alliance', weight: 1, curves: { law: C(0, 10, 0.2, [300, 700], 60), grid: C(5, 20, 0.5, [200, 500]), fuel: C(0, 20, 0.2, null), banks: C(0, 10, 0.1, null), stores: C(5, 30, 0.3, null), deliveries: C(5, 30, 0.2, null), medical: C(10, 40, 0.3, null), phone: C(5, 20, 0.4, null) } },
      { id: 'partition', name: 'a slow partition of the country', weight: 1, curves: { law: C(0, 20, 0.1, null), grid: C(10, 30, 0.3, null), fuel: C(0, 20, 0.2, null), banks: C(20, 60, 0.4, [300, 900]), stores: C(5, 30, 0.3, null), deliveries: C(5, 30, 0.2, null), medical: C(10, 40, 0.3, null), phone: C(5, 20, 0.4, null) } },
    ],
    hints: [['The Cascade Compact refuses federal orders.', 'Protests become armed standoffs in two capitals.'], ['The Plains Alliance seizes a federal depot.', 'Checkpoints on the state line.'], ['Fighting around Billings; the interstate is cut.', 'Militia recruiters at the feed store.']],
    hit: ['The war reaches the valley: the Plains Alliance holds the town, the Compact the passes.'],
    chain: [],
  },
  bioweapon: {
    kind: 'bioweapon', name: 'Engineered bioweapon', pulpy: true, warn: [7, 20],
    variants: [{ id: 'release', name: 'the release', weight: 3, curves: { medical: C(0, 5, 0, null), stores: C(1, 5, 0.05, null), deliveries: C(1, 5, 0, null), law: C(7, 20, 0.05, null), grid: C(20, 60, 0.2, null), fuel: C(5, 20, 0.05, null), banks: C(5, 15, 0, null), phone: C(30, 90, 0.2, null) } },
      { id: 'hemorrhagic', name: 'a hemorrhagic fever', weight: 2, curves: { medical: C(0, 4, 0, null), stores: C(1, 5, 0.05, null), deliveries: C(1, 5, 0, null), law: C(5, 15, 0.05, null), grid: C(15, 50, 0.2, null), fuel: C(5, 20, 0.05, null), banks: C(5, 15, 0, null), phone: C(25, 80, 0.2, null) } },
      { id: 'smallpox_like', name: 'a smallpox-like virus', weight: 1, curves: { medical: C(0, 8, 0.05, [200, 500], 90), stores: C(3, 10, 0.2, [150, 450], 60), deliveries: C(3, 10, 0.2, [150, 450], 60), law: C(10, 30, 0.3, [200, 500], 60), grid: C(30, 60, 0.4, [250, 500], 90), banks: C(7, 20, 0.2, [150, 450], 60) } }],
    hints: [['An outbreak in three cities at once.', 'Officials won\'t say where it started.'], ['Hospitals in the city overwhelmed in days.', 'The CDC tells everyone to stay home.'], ['Bodies in the streets in the city footage.', 'Roadblocks on the highway into the county.']],
    hit: ['It\'s here. Anyone from outside could be carrying it.'],
    chain: [],
  },
  asteroid: {
    kind: 'asteroid', name: 'Asteroid impact', pulpy: true, warn: [90, 200],
    fill: o => { const i = rollImpact(o.seed, o.region, o.difficulty); return { where: i.variant === 'airburst' ? `an airburst over ${i.zone}` : i.variant === 'comet' ? `along ${i.zone}` : `in ${i.zone}` }; },
    variants: [{ id: 'impact', name: 'the impact', weight: 1, curves: { grid: C(0, 0, 0, null), fuel: C(0, 2, 0, null), stores: C(0, 3, 0, null), deliveries: C(0, 1, 0, null), medical: C(0, 3, 0.1, null), law: C(2, 20, 0.05, null), phone: C(0, 0, 0, null), banks: C(0, 0, 0, null) } }],
    hints: [['Astronomers: a 1-in-50 chance of impact next year.', 'The odds firm up: 1 in 3.'], ['Confirmed: the impact point is {where}.', 'Seed and canned goods rationed nationwide.'], ['It\'s visible at night now, a smudge brighter every week.', 'Churches full; the roads west are jammed.']],
    hit: ['A second sunrise in the east, then the sky goes dark for good.'],
    chain: [],
  },
  unknown: {
    kind: 'unknown', name: 'The unknown event', pulpy: true, warn: [3, 10],
    variants: [{ id: 'lights', name: 'the lights in the sky', weight: 1, curves: { grid: C(0, 0, 0, null), phone: C(0, 0, 0, null), banks: C(0, 0, 0, null), fuel: C(0, 1, 0, null), stores: C(0, 2, 0.1, null), deliveries: C(0, 0, 0, null), medical: C(0, 2, 0.1, null), law: C(0, 5, 0, null) } }],
    hints: [['Lights over the range, three nights running.', 'Every compass in the county points west.'], ['Cattle standing in rings in the fields.', 'Radios pick up a tone at 3 a.m.'], ['The sky hums.', 'The Hendersons\' truck is in their drive, doors open, nobody home.']],
    hit: ['A white light, and then silence. Half the valley is simply gone.'],
    chain: [],
  },
  // ── placeholders for the owner-chosen scenarios (WP0): minimal curves on the collapse clock, selectable; their packages add the teeth ──
  emp: {
    kind: 'emp', name: 'High-altitude EMP', pulpy: false, warn: [1, 3],
    variants: [{ id: 'flash', name: 'a high-altitude burst (continental)', weight: 3, curves: { grid: C(0, 0, 0, null), phone: C(0, 0, 0, null), banks: C(0, 0, 0, null), fuel: C(0, 1, 0, null), deliveries: C(0, 1, 0, null), stores: C(0, 2, 0.05, null), medical: C(0, 2, 0.1, null), law: C(3, 20, 0.1, null) } },
      { id: 'local_burst', name: 'a high-altitude burst over one region', weight: 2, curves: { grid: C(0, 0, 0.1, [60, 365], 60), fuel: C(0, 0, 0.1, [90, 400], 60), stores: C(1, 4, 0.15, [90, 400], 60), deliveries: C(0, 2, 0.1, [90, 400], 60), medical: C(1, 6, 0.15, [120, 400], 60), law: C(7, 20, 0.3, [150, 450], 60), phone: C(0, 0, 0, [120, 400], 60), banks: C(0, 0, 0, [120, 400], 60) } }],
    hints: [['Officials warn of a possible high-altitude test over the Pacific.'], ['A strange light on the horizon at dawn, then nothing on the radio.'], ['The grid has been flickering for an hour.']],
    hit: ['One bright flash at dawn, and every modern machine in the valley is dead.'],
    chain: [],
  },
  mega_quake: {
    kind: 'mega_quake', name: 'Mega-earthquake', pulpy: false, warn: [4, 30],
    variants: [{ id: 'm9', name: 'a magnitude-9 earthquake', weight: 1, curves: { grid: C(0, 0, 0.2, [20, 120], 60), fuel: C(0, 1, 0.2, [20, 120], 60), deliveries: C(0, 0, 0.1, [30, 150], 60), medical: C(0, 1, 0.3, [20, 90], 40), phone: C(0, 0, 0.2, [10, 60], 30), law: C(0, 2, 0.5, [10, 60], 30), stores: C(0, 2, 0.4, [20, 100], 40), banks: C(0, 0, 0.3, [14, 60], 30) } }],
    hints: [['A swarm of small quakes under the fault, four days running.', 'Seismologists: "nothing unusual", then a magnitude 5 rattles the dishes.'], ['Wells in the valley go cloudy overnight.', 'Slow-slip tremor is reported along the fault; the state asks people to check their kits.'], ['Dogs will not settle; the animals are restless.', 'A foreshock shakes the county awake at 3 a.m.']],
    hit: ['The ground rolls for four minutes. Chimneys are down across the county and the road is cracked.'],
    chain: [],
  },
  crop_blight: {
    kind: 'crop_blight', name: 'Crop blight and pest plague', pulpy: false, warn: [30, 90],
    variants: [{ id: 'late_blight', name: 'a potato late blight that spreads to everything wet', weight: 2, curves: { stores: C(20, 100, 0.5, [200, 420], 150), deliveries: C(30, 100, 0.55, [200, 420], 100), law: C(90, 100, 0.75, [300, 600], 150) } },
      { id: 'locusts', name: 'a locust plague', weight: 1, curves: { stores: C(10, 60, 0.35, [150, 330], 120), deliveries: C(15, 60, 0.45, [150, 330], 100), law: C(60, 90, 0.7, [250, 500], 120) } },
      { id: 'rust', name: 'a wheat rust and locust year', weight: 3, curves: { stores: C(20, 120, 0.4, [240, 500], 180), deliveries: C(30, 120, 0.5, [240, 500], 120), law: C(90, 120, 0.7, [300, 600], 150) } }],
    hints: [['Farm extension agents report a new rust strain on wheat.'], ['Grain prices double at the elevator.'], ['Locusts are in the next county; fields are being stripped.']],
    hit: ['The harvest has failed across the county. The shelves will thin all year.'],
    chain: [],
  },
  dam_flood: {
    kind: 'dam_flood', name: 'Dam failure and great flood', pulpy: false, warn: [1, 2],
    variants: [{ id: 'breach', name: 'a failed upstream dam', weight: 1, curves: { grid: C(0, 0, 0.3, [7, 40], 20), fuel: C(0, 1, 0.4, [10, 40], 20), deliveries: C(0, 1, 0.2, [20, 90], 40), phone: C(0, 0, 0.4, [5, 30], 14), law: C(0, 1, 0.6, [5, 30], 14), medical: C(0, 1, 0.5, [7, 30], 14), stores: C(0, 2, 0.5, [10, 50], 20) } }],
    hints: [['The county warns of seepage at the upstream dam.'], ['Engineers are at the dam; the road is closed.'], ['Sirens in the river bottoms: leave now.']],
    hit: ['The dam has gone. A wall of water is coming down the valley.'],
    chain: [],
  },
  supervolcano: {
    kind: 'supervolcano', name: 'Supervolcano', pulpy: false, warn: [7, 30],
    variants: [{ id: 'caldera', name: 'a caldera eruption', weight: 1, curves: { grid: C(1, 5, 0.1, null), fuel: C(2, 10, 0.1, null), stores: C(5, 20, 0.1, null), deliveries: C(3, 10, 0.05, null), medical: C(5, 20, 0.2, null), law: C(14, 40, 0.1, null), phone: C(3, 10, 0.2, null), banks: C(3, 10, 0.05, null) } }],
    hints: [['Earthquake swarms and ground lifting reported at the caldera.'], ['The park is evacuated; flights are rerouted.'], ['The sky to the east has gone a dull orange.']],
    hit: ['The mountain has erupted. Ash is falling out of a dark sky.'],
    chain: [],
  },
  livestock_plague: {
    kind: 'livestock_plague', name: 'Livestock plague', pulpy: false, warn: [14, 60],
    variants: [
      { id: 'hpai', name: 'avian influenza', weight: 4, curves: { stores: C(7, 45, 0.7, [90, 300], 90), deliveries: C(10, 45, 0.8, [90, 300], 90), medical: C(60, 90, 0.9, [200, 500], 90) } },
      { id: 'fmd', name: 'foot-and-mouth disease', weight: 3, curves: { stores: C(10, 60, 0.6, [150, 420], 90), deliveries: C(10, 60, 0.7, [150, 420], 90), law: C(30, 60, 0.85, [200, 500], 90) } },
      { id: 'asf', name: 'African swine fever', weight: 2, curves: { stores: C(15, 60, 0.75, [180, 450], 90), deliveries: C(15, 60, 0.8, [180, 450], 90) } },
      { id: 'mixed_zoonotic', name: 'an avian flu that crosses to cattle and people', weight: 1, curves: { stores: C(7, 45, 0.7, [90, 300], 90), deliveries: C(10, 45, 0.8, [90, 300], 90), medical: C(100, 120, 0.7, [300, 600], 90) } },
      { id: 'bse_like', name: 'a feed-borne prion disease', weight: 1, curves: { stores: C(30, 120, 0.7, [400, 800], 120), deliveries: C(30, 120, 0.75, [400, 800], 120) } },
    ],
    hints: [['Dead wild geese found at the reservoir.', 'Egg prices are up 40% since Monday.'], ['State veterinarian bans all livestock movement for 30 days.', 'Quarantine zone declared around a dairy in the next county.'], ['Mandatory cull of infected premises and of the 3-mile ring around them.', 'A column of black smoke to the north: they are burning stock.']],
    hit: ['A case is confirmed within three miles. Every barn in the county is a suspect.'],
    chain: [],
  },
  // ── WP10: the seven kinds from docs/scenarios (collapse clocks from each doc's section 10; the teeth are in sim/disasters/<kind>.ts) ──
  satellite_loss: {
    kind: 'satellite_loss', name: 'Satellite and GPS loss', pulpy: false, warn: [3, 30],
    variants: [
      { id: 'kessler', name: 'a debris cascade that took out low orbit', weight: 2, curves: { grid: C(7, 40, 0.6, [365, 1500], 120), fuel: C(3, 25, 0.4, [200, 1000], 90), stores: C(5, 35, 0.35, [200, 1000], 90), deliveries: C(1, 14, 0.25, [200, 1000], 90), medical: C(14, 60, 0.6, [300, 1200], 90), law: C(60, 120, 0.8, [400, 1200], 90), phone: C(0, 3, 0.4, [180, 900], 90), banks: C(1, 10, 0.35, [180, 900], 90) } },
      { id: 'gps_only', name: 'a loss of GPS and the timing signal', weight: 1, curves: { grid: C(5, 20, 0.7, [30, 180], 30), fuel: C(3, 15, 0.5, [30, 200], 30), stores: C(5, 20, 0.6, [40, 220], 30), deliveries: C(1, 10, 0.4, [40, 220], 30), phone: C(0, 2, 0.6, [20, 150], 30), banks: C(1, 5, 0.5, [20, 150], 30) } },
      { id: 'asat_war', name: 'an anti-satellite war', weight: 1, curves: { grid: C(3, 30, 0.45, [365, 1500], 120), fuel: C(2, 20, 0.35, [200, 1000], 90), stores: C(4, 30, 0.3, [200, 1000], 90), deliveries: C(1, 12, 0.2, [200, 1000], 90), medical: C(10, 50, 0.5, [300, 1200], 90), law: C(20, 90, 0.5, [400, 1200], 90), phone: C(0, 2, 0.25, [180, 900], 90), banks: C(1, 8, 0.3, [180, 900], 90) } },
    ],
    hints: [
      ['Station crew shelters in the return capsule after a debris warning.', 'Reports of GPS jamming and spoofing near two conflict zones.', 'A pilot neighbor mentions "GPS integrity warnings" on her last flight.'],
      ['Phone map apps drift; the tractor\'s auto-steer wanders across the field.', 'Satellite TV and internet blip out for an hour; the forecast says "data unavailable".', 'Airlines cancel flights for "technical issues" at air traffic control.'],
      ['Government advises households to keep a paper map and a compass.', 'Card readers at the farm store fail twice in a day.', 'The satellite dish at the Hendersons\' is dead.'],
    ],
    hit: ['Nothing breaks and the lights stay on, but every phone says "No Service" and the sky has gone quiet: the satellites are gone.'],
    chain: [{ kind: 'lawless', p: 0.1, after: [90, 240] }, { kind: 'financial', p: 0.25, after: [30, 120] }],
  },
  oil_shock: {
    kind: 'oil_shock', name: 'Oil and fuel shock', pulpy: false, warn: [14, 90],
    variants: [
      { id: 'hormuz', name: 'a closed strait that stopped a fifth of the world\'s oil', weight: 2, curves: { fuel: C(0, 7, 0.15, [180, 720], 90), deliveries: C(3, 20, 0.3, [200, 740], 90), stores: C(7, 40, 0.4, [220, 760], 90), medical: C(30, 60, 0.6, [240, 780], 60), law: C(60, 90, 0.7, [260, 800], 60), banks: C(30, 60, 0.7, [240, 780], 60) } },
      { id: 'pipeline_cut', name: 'a pipeline cut', weight: 3, curves: { fuel: C(0, 3, 0.25, [14, 60], 20), deliveries: C(2, 10, 0.5, [20, 70], 20), stores: C(5, 15, 0.6, [25, 75], 14) } },
      { id: 'gulf_refineries', name: 'a storm and a freeze at the Gulf refineries', weight: 2, curves: { fuel: C(0, 5, 0.3, [21, 90], 30), deliveries: C(3, 12, 0.5, [30, 100], 30), stores: C(7, 20, 0.6, [35, 110], 30) } },
      { id: 'embargo_long', name: 'a long embargo, worse than 1973', weight: 1, curves: { fuel: C(0, 10, 0.2, [300, 900], 120), deliveries: C(5, 40, 0.35, [320, 920], 120), stores: C(10, 60, 0.45, [340, 940], 120), grid: C(90, 180, 0.8, [400, 900], 90), medical: C(60, 90, 0.6, [340, 940], 90), law: C(90, 120, 0.7, [360, 960], 90), banks: C(60, 90, 0.7, [340, 940], 90) } },
    ],
    hints: [
      ['A tanker attack in the strait; insurance rates for tankers spike.', 'Crude and pump prices are up 40% in a month.', 'Government talks about the Strategic Petroleum Reserve and "voluntary conservation".'],
      ['Gas lines at the nearest town; a station is "out of regular".', 'The farm store runs out of fuel stabilizer and jerry cans.', 'A neighbor puts a lock on his farm tank.'],
      ['Speed limits cut to 55 to save fuel; rationing plans circulate.', 'Diesel is rationed to farm trucks only; school buses run half routes.', 'Neighbors are filling drums at night.'],
    ],
    hit: ['The pumps are empty. {cause}: the trucks are parking and the price of everything that rides on a truck is climbing.'],
    chain: [{ kind: 'financial', p: 0.35, after: [60, 180] }, { kind: 'lawless', p: 0.15, after: [90, 200] }],
  },
  reactor_meltdown: {
    kind: 'reactor_meltdown', name: 'Reactor meltdown', pulpy: false, warn: [1, 14],
    variants: [
      { id: 'meltdown_regional', name: 'a meltdown at the regional plant', weight: 3, curves: { stores: C(2, 5, 0.7, [14, 60], 14), deliveries: C(2, 8, 0.7, [14, 60], 14), medical: C(1, 5, 0.75, [30, 120], 30), law: C(3, 10, 0.85, [20, 90], 20), grid: C(0, 1, 0.85, [10, 60], 20), fuel: C(1, 4, 0.85, [14, 60], 20), phone: C(0, 1, 0.9, [7, 30], 10) } },
      { id: 'meltdown_pair', name: 'meltdowns at two plants', weight: 1, curves: { stores: C(2, 6, 0.55, [30, 120], 30), deliveries: C(2, 8, 0.6, [30, 120], 30), medical: C(1, 6, 0.6, [60, 180], 30), law: C(3, 10, 0.75, [30, 120], 30), grid: C(0, 2, 0.7, [20, 90], 30), fuel: C(1, 5, 0.7, [30, 120], 30), phone: C(0, 1, 0.85, [10, 40], 10) } },
      { id: 'dirty_bomb', name: 'a dirty bomb in the nearest town', weight: 2, curves: { stores: C(1, 3, 0.85, [7, 30], 10), deliveries: C(1, 4, 0.85, [7, 30], 10), medical: C(0, 2, 0.85, [14, 60], 20), law: C(1, 5, 0.85, [10, 40], 20), phone: C(0, 1, 0.9, [3, 14], 5) } },
      { id: 'spent_pool_fire', name: 'a spent-fuel pool fire after the diesel ran out', weight: 1, curves: { stores: C(2, 8, 0.45, [90, 400], 60), deliveries: C(2, 10, 0.5, [90, 400], 60), medical: C(1, 8, 0.5, [120, 500], 60), law: C(3, 14, 0.65, [90, 400], 60), grid: C(0, 3, 0.55, [60, 300], 60), fuel: C(1, 6, 0.6, [90, 400], 60), phone: C(0, 2, 0.75, [30, 150], 30) } },
    ],
    hints: [
      ['The plant declares an unusual event; "no release of radioactivity".', 'Sirens are tested at the plant\'s zone.', 'Offsite power to the plant is lost; the emergency diesels are running.'],
      ['The plant escalates to a site area emergency.', 'School buses stage on the highway; potassium iodide is handed out in the 10-mile zone.', 'Neighbors near the plant are leaving.'],
      ['A general emergency is declared; the winds are out of the {wind}.', 'The state orders evacuation of the nearest townships.', 'Your meter ticks over its background count.'],
    ],
    hit: ['The core has melted: {cause}. A plume is moving downwind.'],
    chain: [{ kind: 'financial', p: 0.2, after: [60, 180] }, { kind: 'mass_exodus', p: 0.2, after: [1, 6] }],
    fill: o => ({ wind: ['northwest', 'west', 'southwest', 'south', 'southeast', 'east', 'northeast', 'north'][Math.floor(rng(o.seed * 6911 + 3)() * 8)] }),
  },
  global_famine: {
    kind: 'global_famine', name: 'Global famine', pulpy: false, warn: [60, 180],
    variants: [
      { id: 'breadbasket', name: 'a failure of the world\'s breadbaskets', weight: 3, curves: { stores: C(0, 30, 0.1, [300, 700], 120), deliveries: C(5, 40, 0.25, [300, 700], 120), banks: C(30, 60, 0.5, [250, 600], 90), fuel: C(20, 60, 0.5, [300, 700], 90), medical: C(30, 90, 0.4, [300, 700], 90), law: C(20, 90, 0.3, [300, 800], 90), grid: C(180, 90, 0.7, [400, 900], 90) } },
      { id: 'export_ban', name: 'export bans on grain', weight: 1, curves: { stores: C(0, 15, 0.3, [150, 400], 90), deliveries: C(5, 20, 0.45, [150, 400], 60), banks: C(20, 40, 0.7, [150, 400], 60), law: C(30, 60, 0.6, [200, 450], 60) } },
      { id: 'monoculture_blight', name: 'a blight in the one crop the world leaned on', weight: 1, curves: { stores: C(5, 40, 0.25, [250, 600], 120), deliveries: C(5, 40, 0.4, [250, 600], 90), medical: C(40, 90, 0.6, [300, 700], 90), law: C(40, 90, 0.5, [300, 700], 90) } },
    ],
    hints: [
      ['A wheat belt drought and a rice blast in the same season.', 'Export bans announced by three grain exporters.', 'The FAO food price index hits a record.'],
      ['The grocery store limits rice and flour; a loaf is up 60%.', 'Farm-store seed sells out in a day.', 'Church food banks double their line.'],
      ['The county announces a rationing plan and talks of "grain reserves".', 'Flour is behind the counter and sold by the pound.', 'Neighbors are planting every yard.'],
    ],
    hit: ['The grain has run out: the shelves empty and the county rations bread.'],
    chain: [{ kind: 'lawless', p: 0.3, after: [60, 160] }, { kind: 'mass_exodus', p: 0.25, after: [30, 90] }, { kind: 'pandemic', p: 0.1, after: [90, 220] }],
  },
  water_war: {
    kind: 'water_war', name: 'Water war', pulpy: false, warn: [60, 180],
    variants: [
      { id: 'dead_pool', name: 'a river compact that broke when the reservoir hit dead pool', weight: 3, curves: { grid: C(30, 60, 0.6, [200, 600], 90), stores: C(20, 60, 0.5, [200, 600], 90), deliveries: C(10, 40, 0.5, [200, 600], 90), medical: C(20, 60, 0.5, [250, 600], 90), law: C(20, 80, 0.4, [300, 700], 90), fuel: C(30, 60, 0.6, [250, 600], 90) } },
      { id: 'aquifer_collapse', name: 'the collapse of the aquifer', weight: 2, curves: { stores: C(30, 90, 0.6, [300, 900], 120), deliveries: C(30, 90, 0.7, [300, 900], 90), medical: C(40, 90, 0.7, [300, 900], 90), law: C(60, 90, 0.6, [300, 900], 90) } },
      { id: 'contamination', name: 'a poisoned water supply', weight: 1, curves: { medical: C(0, 14, 0.5, [30, 120], 30), stores: C(3, 14, 0.7, [30, 120], 30), law: C(10, 30, 0.8, [60, 150], 30) } },
    ],
    hints: [
      ['The reservoir is at a record low; the water board limits lawn watering.', 'A lawsuit between two counties over the river.', 'Snowpack is a third of normal.'],
      ['The irrigation district announces cuts by seniority.', 'A neighbor\'s well goes dry.', 'Tanker trucks on the county road with armed escorts.'],
      ['The first fence is cut at the ditch.', 'The co-op meeting turns angry and a rider is sent to check headgates.', 'Water theft arrests on the front page.'],
    ],
    hit: ['The water is rationed and the river is closed to new diversions: {cause}.'],
    chain: [{ kind: 'mass_exodus', p: 0.25, after: [30, 90] }, { kind: 'lawless', p: 0.2, after: [60, 150] }, { kind: 'global_famine', p: 0.1, after: [90, 200] }],
  },
  cult_takeover: {
    kind: 'cult_takeover', name: 'Cult takeover', pulpy: false, warn: [10, 40],
    variants: [
      { id: 'gathering', name: 'a movement called the Gathering that took the council', weight: 3, curves: { law: C(0, 20, 0.5, null), stores: C(10, 40, 0.6, [200, 500], 90), deliveries: C(5, 40, 0.5, [200, 500], 90), medical: C(5, 30, 0.6, [200, 500], 90), banks: C(20, 40, 0.4, [300, 700], 90), fuel: C(10, 30, 0.5, [200, 500], 90) } },
      { id: 'zealot', name: 'a zealous order that raids unbelievers', weight: 2, curves: { law: C(0, 10, 0.3, null), stores: C(5, 30, 0.5, [300, 700], 90), deliveries: C(5, 30, 0.4, [300, 700], 90), medical: C(3, 20, 0.5, [300, 700], 90), banks: C(10, 30, 0.3, [300, 700], 90), fuel: C(5, 20, 0.4, [300, 700], 90) } },
      { id: 'prophet_date', name: 'a prophet with a date', weight: 1, curves: { law: C(0, 20, 0.5, [150, 400], 60), stores: C(10, 40, 0.6, [150, 400], 60), deliveries: C(5, 40, 0.5, [150, 400], 60), medical: C(5, 30, 0.6, [150, 400], 60), banks: C(20, 40, 0.5, [200, 500], 60) } },
    ],
    hints: [
      ['A charismatic preacher gathers a crowd at the fairgrounds; free food for those who sign.', 'A new church opens in the old feed store.', 'Neighbors begin giving away their possessions.'],
      ['The Covenant\'s flag appears in windows along the county road.', 'A bus of new voters arrives at the county clerk\'s office.', 'The sheriff "retires"; his deputy is a member.'],
      ['The community meeting is packed with strangers.', 'The council votes to hand the food bank to the Gathering.', 'Two teenagers from the next road are missing.'],
    ],
    hit: ['The council has voted: the Order now runs the valley and sets "the tithe".'],
    chain: [{ kind: 'lawless', p: 0.3, after: [90, 220] }, { kind: 'mass_exodus', p: 0.2, after: [60, 150] }],
  },
  mass_exodus: {
    kind: 'mass_exodus', name: 'Mass exodus and martial law', pulpy: false, warn: [5, 30],
    variants: [
      { id: 'evacuation', name: 'an evacuation of the cities onto the county road', weight: 3, curves: { law: C(3, 10, 0.5, [60, 200], 30), grid: C(5, 20, 0.6, [30, 120], 30), fuel: C(0, 2, 0.05, [20, 90], 30), stores: C(2, 8, 0.15, [30, 120], 30), deliveries: C(0, 3, 0.3, [30, 120], 30), medical: C(2, 10, 0.3, [30, 120], 30), phone: C(0, 3, 0.4, [20, 90], 20), banks: C(10, 20, 0.7, [40, 160], 30) } },
      { id: 'fleeing_front', name: 'a flight from a war front', weight: 1, curves: { law: C(3, 10, 0.3, [90, 300], 30), grid: C(5, 20, 0.5, [60, 200], 30), fuel: C(0, 2, 0.05, [40, 150], 30), stores: C(2, 8, 0.15, [60, 200], 30), deliveries: C(0, 3, 0.25, [60, 200], 30), medical: C(2, 10, 0.3, [60, 200], 30), phone: C(0, 3, 0.4, [30, 120], 20), banks: C(10, 20, 0.5, [60, 200], 30) } },
      { id: 'quarantine_flight', name: 'a flight from a plague, sorted at checkpoints', weight: 1, curves: { law: C(3, 10, 0.4, [60, 200], 30), grid: C(5, 20, 0.6, [30, 120], 30), fuel: C(0, 2, 0.05, [30, 120], 30), stores: C(2, 8, 0.2, [40, 140], 30), deliveries: C(0, 3, 0.25, [40, 140], 30), medical: C(1, 8, 0.2, [60, 200], 30), phone: C(0, 3, 0.4, [20, 90], 20), banks: C(10, 20, 0.6, [50, 160], 30) } },
    ],
    hints: [
      ['A chemical spill threatens the city; officials call for "voluntary evacuation".', 'Traffic counts on the county road are up 40% on last week.', 'The governor declares a state of emergency.'],
      ['"Shelter in place" becomes "evacuate"; gas lines at every exit.', 'National Guard trucks are parked at the school.', 'A state trooper roadblock at the exit ramp.'],
      ['Cars, bumper to bumper, headed away from the city.', 'Neighbors are cutting fences to take shortcuts.', 'The Guard says martial law takes effect at midnight.'],
    ],
    hit: ['The road is full: {cause}, and the state has declared martial law with a curfew at 8 p.m.'],
    chain: [{ kind: 'lawless', p: 0.25, after: [45, 120] }, { kind: 'global_famine', p: 0.2, after: [60, 150] }, { kind: 'pandemic', p: 0.1, after: [20, 80] }],
  },
  // ── the slow climate kinds (docs/design/climate_disasters.md sections 1 and 2): a long ramp over years; nothing comes back inside a run ──
  runaway_heat: {
    kind: 'runaway_heat', name: 'Runaway heat', pulpy: false, warn: [120, 360],
    variants: [
      { id: 'dry_furnace', name: 'a dry furnace: the summers keep climbing and the air stays parched', weight: 2, curves: { grid: C(120, 600, 0.15, null), fuel: C(180, 500, 0.2, null), stores: C(150, 500, 0.15, null), deliveries: C(150, 500, 0.2, null), medical: C(200, 500, 0.3, null), law: C(300, 400, 0.3, null), phone: C(300, 500, 0.4, null), banks: C(200, 400, 0.2, null) } },
      { id: 'humid_furnace', name: 'a humid furnace: heat and wet air that the body cannot shed', weight: 1, curves: { grid: C(90, 600, 0.1, null), fuel: C(180, 500, 0.2, null), stores: C(150, 500, 0.15, null), deliveries: C(150, 500, 0.2, null), medical: C(150, 500, 0.25, null), law: C(300, 400, 0.3, null), phone: C(300, 500, 0.4, null), banks: C(200, 400, 0.2, null) } },
    ],
    hints: [
      ['Record heat dome over the interior; the weather service says "once in a thousand years" for the third time.', 'Dead lawns and a county burn ban in June. The farm store is out of window units.', 'City cooling centers are full, and the hospital counts heat deaths for the week.'],
      ['The utility asks everyone to run no appliances between 3 and 8 p.m.; brownouts on the afternoons.', 'Neighbors are buying generators and shade cloth. Hens are panting in the coop.', 'A wet-bulb alert: the weather service says to stay out of the sun until dark.'],
      ['Rolling blackouts every afternoon. The asphalt softens on the county road.', 'The grain elevator is half the usual price of wheat, because nobody is sure of the harvest.', 'People up the road say they are leaving for the north before the next summer.'],
    ],
    hit: ['The heat does not break: {cause}. The afternoons are not safe to work in and the grid is failing on the hot days.'],
    chain: [{ kind: 'mass_exodus', p: 0.4, after: [30, 120] }, { kind: 'water_war', p: 0.35, after: [60, 240] }, { kind: 'global_famine', p: 0.3, after: [90, 300] }, { kind: 'wildfire', p: 0.4, after: [5, 60] }, { kind: 'lawless', p: 0.3, after: [120, 360] }],
  },
  ice_age: {
    kind: 'ice_age', name: 'Ice age', pulpy: false, warn: [90, 300],
    variants: [
      { id: 'dimmed_sun', name: 'a dimmed sun: the cold comes everywhere at once', weight: 2, curves: { grid: C(30, 200, 0.2, null), fuel: C(30, 300, 0.2, null), stores: C(60, 300, 0.2, null), deliveries: C(30, 300, 0.2, null), medical: C(60, 300, 0.4, null), law: C(200, 300, 0.4, null), phone: C(100, 400, 0.4, null), banks: C(100, 300, 0.2, null) } },
      { id: 'ocean_shutdown', name: 'an ocean current shutdown: the north freezes first and hardest', weight: 1, curves: { grid: C(30, 200, 0.25, null), fuel: C(30, 300, 0.25, null), stores: C(60, 300, 0.25, null), deliveries: C(30, 300, 0.25, null), medical: C(60, 300, 0.4, null), law: C(200, 300, 0.4, null), phone: C(100, 400, 0.4, null), banks: C(100, 300, 0.2, null) } },
    ],
    hints: [
      ['A cold, wet year without a summer: frost in July and snow on the high ridges in August.', 'Strange red sunsets, and the weather service cannot say why the sun looks dim.', 'Grain exports halted by three countries; flour is up a quarter.'],
      ['Early snow, and it is not melting. The county orders the plow trucks out in October.', 'The farm store is out of wood stoves, stovepipe and diesel anti-gel.', 'Neighbors are splitting every tree on the place and stacking cordwood to the eaves.'],
      ['Rivers are freezing in October. The weather service says the cold "has no end date".', 'Gas stations are limiting diesel; the trucks cannot run in the cold without treated fuel.', 'People are leaving for the south, in cars loaded to the roof.'],
    ],
    hit: ['The cold does not let go: {cause}. The snow stays on the ground and the growing season is gone.'],
    chain: [{ kind: 'global_famine', p: 0.45, after: [60, 240] }, { kind: 'mass_exodus', p: 0.35, after: [30, 120] }, { kind: 'lawless', p: 0.3, after: [90, 300] }],
  },
};


/**
 * Disasters a Surprise run may roll (WP10): every kind. The ten grounded kinds are the usual; every other kind is rare at its base weight
 * (SURPRISE_BASE) and the region scales it (a quake in the Pacific Northwest, a flood in a river valley). The pulpy six stay the rarest.
 */
export const SURPRISE_POOL: DisasterKind[] = ['grid_down', 'nuclear', 'financial', 'lawless', 'drought', 'pandemic', 'solar_flare', 'wildfire', 'ash_winter', 'cyberattack', 'invasion', 'civil_war', 'bioweapon', 'zombies', 'asteroid', 'unknown',
  'emp', 'mega_quake', 'crop_blight', 'dam_flood', 'supervolcano', 'livestock_plague', 'satellite_loss', 'oil_shock', 'reactor_meltdown', 'global_famine', 'water_war', 'cult_takeover', 'mass_exodus', 'runaway_heat', 'ice_age'];
/** Base weight of a pool kind before the region's odds (1 = the usual; the rest are rare). */
export const SURPRISE_BASE: Partial<Record<DisasterKind, number>> = {
  invasion: 0.2, civil_war: 0.2, bioweapon: 0.08, zombies: 0.04, asteroid: 0.04, unknown: 0.04,
  emp: 0.1, mega_quake: 0.25, crop_blight: 0.4, dam_flood: 0.3, supervolcano: 0.05, livestock_plague: 0.4,
  satellite_loss: 0.12, oil_shock: 0.4, reactor_meltdown: 0.15, global_famine: 0.15, water_war: 0.25, cult_takeover: 0.08, mass_exodus: 0.25,
  runaway_heat: 0.15, ice_age: 0.12,
};
/** A pool kind's weight in a region: its base weight times the region's odds. */
export const surpriseWeight = (k: DisasterKind, odds: Partial<Record<DisasterKind, number>> = {}): number => (SURPRISE_BASE[k] ?? 1) * (odds[k] ?? 1);
/** The Surprise roll, weighted by how likely each disaster is in the region (1 = the usual). */
export function surpriseKind(u: number, odds: Partial<Record<DisasterKind, number>> = {}, skip: (k: DisasterKind) => boolean = () => false): DisasterKind {
  const pool = SURPRISE_POOL.filter(k => !skip(k));
  const w = pool.map(k => surpriseWeight(k, odds)), tot = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < w.length; i++) { acc += w[i] / tot; if (u < acc) return pool[i]; }
  return pool[pool.length - 1];
}

/**
 * How the world comes out of it (decided with the user: "it's not a given
 * that the world recovers, each playthrough is random … should vary based on
 * what the disaster is"). Rolled per run, hidden from the player:
 *   full     services come all the way back (on the variant's curves);
 *   partial  they come back late and only part way, and stay there (a thinner
 *            world: power some hours, the store open some days);
 *   never    nobody is coming.
 * Odds by disaster [full, partial, never]; variants that never come back
 * (a strike on the nearby base, the pulpy ones) stay that way.
 */
export type Fate = 'full' | 'partial' | 'never';
export const FATE_ODDS: Partial<Record<DisasterKind, [number, number, number]>> = {
  wildfire: [0.92, 0.07, 0.01], grid_down: [0.68, 0.24, 0.08], cyberattack: [0.65, 0.27, 0.08], pandemic: [0.62, 0.3, 0.08],
  lawless: [0.45, 0.38, 0.17], financial: [0.4, 0.42, 0.18], drought: [0.35, 0.45, 0.2], solar_flare: [0.3, 0.42, 0.28],
  ash_winter: [0.2, 0.45, 0.35], nuclear: [0.12, 0.43, 0.45],
  // WP0 placeholders and the WP10 kinds
  emp: [0.1, 0.3, 0.6], mega_quake: [0.55, 0.35, 0.1], crop_blight: [0.5, 0.35, 0.15], dam_flood: [0.8, 0.17, 0.03], supervolcano: [0.05, 0.3, 0.65], livestock_plague: [0.55, 0.35, 0.1],
  satellite_loss: [0.25, 0.4, 0.35], oil_shock: [0.6, 0.3, 0.1], reactor_meltdown: [0.55, 0.35, 0.1], global_famine: [0.35, 0.4, 0.25], water_war: [0.3, 0.45, 0.25], cult_takeover: [0.3, 0.45, 0.25], mass_exodus: [0.55, 0.35, 0.1],
  // the slow climate kinds: nothing mends inside a run (design doc 1.1 and 2.1)
  runaway_heat: [0.02, 0.18, 0.8], ice_age: [0.05, 0.25, 0.7],
};
/**
 * Per-variant fate odds (override the kind's): a bank holiday mends sooner than a default; an ice storm is over by spring and a
 * transformer shortage is not. Keyed `kind/variant`; a variant without an entry uses its kind's odds.
 */
export const VARIANT_FATE: Record<string, [number, number, number]> = {
  'grid_down/ice_storm': [0.85, 0.12, 0.03], 'grid_down/substation': [0.6, 0.3, 0.1], 'grid_down/transformer_shortage': [0.2, 0.5, 0.3], 'grid_down/cascade': [0.4, 0.4, 0.2],
  'financial/bank_holiday': [0.45, 0.4, 0.15], 'financial/hyperinflation': [0.3, 0.45, 0.25], 'financial/sovereign_default': [0.4, 0.4, 0.2], 'financial/bail_in': [0.5, 0.4, 0.1],
  'pandemic/high_fatality': [0.4, 0.4, 0.2], 'solar_flare/near_miss': [1, 0, 0], 'solar_flare/g4': [0.55, 0.35, 0.1], 'solar_flare/carrington': [0.2, 0.4, 0.4],
  'oil_shock/hormuz': [0.35, 0.45, 0.2], 'oil_shock/pipeline_cut': [0.85, 0.12, 0.03], 'oil_shock/gulf_refineries': [0.8, 0.17, 0.03], 'oil_shock/embargo_long': [0.3, 0.45, 0.25],
  'reactor_meltdown/spent_pool_fire': [0.1, 0.4, 0.5], 'reactor_meltdown/dirty_bomb': [0.75, 0.2, 0.05],
  'global_famine/export_ban': [0.6, 0.3, 0.1], 'water_war/contamination': [0.7, 0.25, 0.05], 'satellite_loss/gps_only': [0.6, 0.3, 0.1],
  'mass_exodus/fleeing_front': [0.3, 0.4, 0.3], 'crop_blight/locusts': [0.65, 0.28, 0.07], 'livestock_plague/hpai': [0.65, 0.28, 0.07], 'livestock_plague/bse_like': [0.3, 0.4, 0.3],
  'runaway_heat/humid_furnace': [0.01, 0.14, 0.85], 'ice_age/ocean_shutdown': [0.08, 0.3, 0.62],
};
/** The fate odds for a kind (and variant). */
export const fateOdds = (kind: DisasterKind, variant?: string): [number, number, number] => (variant && VARIANT_FATE[`${kind}/${variant}`]) || FATE_ODDS[kind] || [0, 0, 1];
export function rollFate(kind: DisasterKind, u: number, variant?: string): Fate {
  const [f, p] = fateOdds(kind, variant);
  return u < f ? 'full' : u < f + p ? 'partial' : 'never';
}
/** A partial recovery: each service settles somewhere between a third and four fifths of what it was. */
function rollCeiling(r: () => number): Partial<Record<Track, number>> {
  const out: Partial<Record<Track, number>> = {};
  for (const k of TRACKS) out[k] = Math.round((0.35 + 0.45 * r()) * 100) / 100;
  return out;
}
/** Apply the fate to rolled return days: late for a partial recovery, none for never. */
function fateBack(back: Partial<Record<Track, number>>, fate: Fate, difficulty: Difficulty = 'standard'): Partial<Record<Track, number>> {
  if (fate === 'never') return {};
  // the difficulty's recovery factor: Hardcore waits longer for the world to come back, Cozy less
  const k = DIFFICULTY[difficulty].recovery * (fate === 'partial' ? 1.5 : 1);
  return k === 1 ? back : Object.fromEntries(Object.entries(back).map(([t, v]) => [t, Math.round((v as number) * k)]));
}

export interface Chained { kind: DisasterKind; variant: string; hitAt: number; back: Partial<Record<Track, number>> }

export interface DisasterState {
  mode: Mode;
  difficulty: Difficulty;
  peace: PeaceLength;
  /** The main disaster (hidden from the player in Surprise until it hits); null in Free build until triggered. */
  kind: DisasterKind | null;
  variant: string;
  phase: Phase;
  /** Game day the warning signs start, and the day it hits (NEVER in Free build until triggered). */
  warnAt: number;
  hitAt: number;
  /** Rolled day each track starts coming back (days after the hit). */
  back: Partial<Record<Track, number>>;
  /** Follow-ons. */
  chained: Chained[];
  /** How the world comes out of it (hidden), and where each service settles in a partial recovery. */
  fate: Fate;
  ceiling: Partial<Record<Track, number>>;
  /** The levels as of the last daily update. */
  tracks: Record<Track, number>;
  /** Headlines for the ticker (newest last). */
  news: Array<{ t: number; text: string; tone: 0 | 1 | 2 | 3 }>;
  /** Day index of the last update. */
  day: number;
  /** One-time effects already applied (effects.ts). */
  done?: string[];
  /** Wildfire: trees close round each building, measured by the world when the fire weather starts. */
  fuel?: Record<string, number>;
  /** The long game: where earlier eras left the world (services never get above this; it mends slowly if anything is left). */
  baseline?: Partial<Record<Track, number>>;
  /** Per-kind state for sim/disasters/<kind>.ts hooks (save v98): optional, JSON-safe, keyed by kind, made on first use. */
  fx?: Record<string, unknown>;
}

const PEACE_DAYS: Record<Exclude<PeaceLength, 'random'>, number> = { short: 548, medium: 3 * 365, long: 5 * 365 };
export const FULL: Record<Track, number> = { grid: 1, fuel: 1, stores: 1, deliveries: 1, medical: 1, law: 1, phone: 1, banks: 1 };

function pick<T extends { weight: number }>(list: T[], r: number): T {
  const tot = list.reduce((a, x) => a + x.weight, 0);
  let x = r * tot;
  for (const v of list) { x -= v.weight; if (x <= 0) return v; }
  return list[list.length - 1];
}
const roll = (r: () => number, [a, b]: [number, number]) => Math.round(a + (b - a) * r());

function rollBack(def: DisasterDef, variant: string, r: () => number): Partial<Record<Track, number>> {
  const v = def.variants.find(x => x.id === variant) ?? def.variants[0];
  const out: Partial<Record<Track, number>> = {};
  for (const [t, c] of Object.entries(v.curves) as Array<[Track, TrackCurve]>) if (c.back) out[t] = roll(r, c.back);
  return out;
}

/** Set up the disaster for a new run. */
export function newDisaster(seed: number, mode: Mode, peace: PeaceLength = 'random', kind: DisasterKind | null = null, variant?: string, difficulty: Difficulty = 'standard', odds: Partial<Record<DisasterKind, number>> = {}): DisasterState {
  const r = rng(seed * 7919 + 13);
  // (the slow climate kinds are never rolled for a first Surprise run: a new player meets them in Scenario mode, on purpose)
  const k: DisasterKind | null = unscripted(mode) ? null : kind ?? surpriseKind(r(), odds, isSlowKind);
  const def = k ? DISASTERS[k] : undefined;
  const v = def ? (variant && def.variants.some(x => x.id === variant) ? variant : pick(def.variants, r()).id) : '';
  const len = unscripted(mode) ? NEVER : peace === 'random' || mode === 'surprise' ? Math.round(3 * 365 + r() * 3 * 365) : PEACE_DAYS[peace];
  const warn = def ? Math.max(1, Math.round(roll(r, def.warn) * DIFFICULTY[difficulty].warn)) : 0;
  // the fate on its own stream (the rest of the run's rolls don't move)
  const rf = rng(seed * 6007 + 29);
  const fate = k ? rollFate(k, rf(), v) : 'full';
  return {
    mode, difficulty, peace, kind: k, variant: v, phase: 'peace',
    warnAt: len - warn, hitAt: len,
    back: def ? fateBack(rollBack(def, v, r), fate, difficulty) : {},
    chained: [], fate, ceiling: fate === 'partial' ? rollCeiling(rf) : {}, tracks: { ...FULL }, news: [], day: -1,
  };
}

/** Free build: start a disaster now (after a short warning, or none). */
export function triggerDisaster(d: DisasterState, now: number, kind: DisasterKind, seed: number, warnDays = 0, variant?: string): void {
  const def = DISASTERS[kind];
  if (!def) return;
  const r = rng(seed * 31 + Math.floor(now));
  d.kind = kind;
  d.variant = variant && def.variants.some(x => x.id === variant) ? variant : pick(def.variants, r()).id;
  d.warnAt = now; d.hitAt = now + warnDays;
  const rf = rng(seed * 6007 + 29 + Math.floor(now));
  d.fate = rollFate(kind, rf(), d.variant);
  d.ceiling = d.fate === 'partial' ? rollCeiling(rf) : {};
  d.back = fateBack(rollBack(def, d.variant, r), d.fate, d.difficulty);
  d.chained = [];
  d.phase = warnDays > 0 ? 'warning' : 'peace';
}

/** One track's level `days` after the hit. */
export function curveLevel(c: TrackCurve | undefined, back: number | undefined, days: number, ceil = 1): number {
  if (!c || days < c.at) return 1;
  const fell = c.fall <= 0 ? 1 : Math.min(1, (days - c.at) / c.fall);
  let lv = 1 - (1 - c.floor) * fell;
  // coming back: all the way, or (a partial recovery) to where it settles
  const top = Math.max(lv, ceil);
  if (back !== undefined && days > back) lv = Math.min(top, lv + (top - lv) * Math.min(1, (days - back) / Math.max(1, c.ramp)));
  return lv;
}

function levelsOf(kind: DisasterKind, variant: string, back: Partial<Record<Track, number>>, days: number, ceiling: Partial<Record<Track, number>> = {}): Record<Track, number> {
  const def = DISASTERS[kind], v = def?.variants.find(x => x.id === variant);
  const out = { ...FULL };
  if (!v || days < 0) return out;
  for (const t of TRACKS) out[t] = curveLevel(v.curves[t], back[t], days, ceiling[t] ?? 1);
  return out;
}

/** The day (after the hit) the last track of the main disaster has finished falling: before it the world is still getting worse, so it cannot have "settled". */
export function fallDoneDay(d: Pick<DisasterState, 'kind' | 'variant'>): number {
  const v = d.kind ? DISASTERS[d.kind]?.variants.find(x => x.id === d.variant) : undefined;
  return v ? Math.max(0, ...Object.values(v.curves).map(c => (c ? c.at + c.fall : 0))) : 0;
}

/** All tracks at game day t (the main disaster and its follow-ons; the worse wins). */
export function tracksAt(d: DisasterState, t: number): Record<Track, number> {
  if (!d.kind) return { ...FULL };
  const out = levelsOf(d.kind, d.variant, d.back, t - d.hitAt, d.ceiling);
  for (const c of d.chained) {
    const lv = levelsOf(c.kind, c.variant, c.back, t - c.hitAt, d.ceiling);
    for (const k of TRACKS) out[k] = Math.min(out[k], lv[k]);
  }
  if (d.baseline) for (const k of TRACKS) out[k] = Math.min(out[k], d.baseline[k] ?? 1);
  return out;
}

/**
 * The next era (task #34: "varied next era, escalating toward permanent
 * collapse"). Once the world has settled after an era, the next one is
 * rolled: a different disaster, one that still has something to knock down
 * (no grid-down where there is no grid), after a quiet that gets shorter
 * each era, with the odds of the world coming back falling each time. The
 * world starts from where the last era left it.
 */
export function nextEraDisaster(prev: DisasterState, now: number, seed: number, era: number, odds: Partial<Record<DisasterKind, number>> = {}): DisasterState {
  const r = rng(seed * 8191 + era * 131 + 7);
  const base: Partial<Record<Track, number>> = {};
  for (const k of TRACKS) base[k] = Math.round(Math.min(prev.baseline?.[k] ?? 1, prev.tracks[k]) * 100) / 100;
  const allWell = TRACKS.every(k => (base[k] ?? 1) >= 0.97);
  const peaceOnly = { ...prev, kind: null, variant: '', phase: 'peace' as Phase, warnAt: NEVER, hitAt: NEVER, back: {}, chained: [], fate: 'full' as Fate, ceiling: {}, done: [], baseline: allWell ? undefined : base };
  if (unscripted(prev.mode)) return peaceOnly;
  const gone = (k: Track) => (base[k] ?? 1) < 0.3;
  let pool = SURPRISE_POOL.filter(k => k !== prev.kind
    && !(WINTER_KINDS.includes(k) && prev.kind != null && WINTER_KINDS.includes(prev.kind))   // never one winter kind right after another
    && !(gone('grid') && (k === 'grid_down' || k === 'cyberattack' || k === 'solar_flare'))
    && !(gone('banks') && k === 'financial') && !(gone('law') && k === 'lawless')
    && !(gone('fuel') && k === 'oil_shock') && !(gone('phone') && k === 'satellite_loss') && !(gone('grid') && k === 'emp'));
  if (!pool.length) pool = ['drought', 'pandemic', 'wildfire'];
  const w = pool.map(k => surpriseWeight(k, odds)), tot = w.reduce((a, b) => a + b, 0);
  let u = r() * tot, kind = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) { u -= w[i]; if (u <= 0) { kind = pool[i]; break; } }
  const def = DISASTERS[kind]!;
  const v = pick(def.variants, r()).id;
  const n = era - 1;
  const lo = Math.max(0.5, 4 - 0.5 * n), hi = Math.max(1.5, 8 - n);
  const quiet = Math.round(365 * (lo + (hi - lo) * r()));
  const warn = Math.max(1, Math.round(roll(r, def.warn) * DIFFICULTY[prev.difficulty].warn));
  // each era, a little less chance it all comes back
  const [f0, p0] = fateOdds(kind, v);
  const f = f0 * Math.pow(0.8, n), pp = p0 * Math.pow(0.92, n), uf = r();
  const fate: Fate = uf < f ? 'full' : uf < f + pp ? 'partial' : 'never';
  return {
    ...peaceOnly, kind, variant: v, warnAt: now + quiet - warn, hitAt: now + quiet,
    back: fateBack(rollBack(def, v, r), fate, prev.difficulty), fate, ceiling: fate === 'partial' ? rollCeiling(r) : {},
  };
}

/** 0 → 1 through the warning signs (0 before, 1 at the hit). */
export function tension(d: DisasterState, t: number): number {
  if (!d.kind || t < d.warnAt) return 0;
  return Math.min(1, (t - d.warnAt) / Math.max(1, d.hitAt - d.warnAt));
}

/** Prices climb through the warning signs (panic buying), then whatever is left is dear. */
export function priceFactor(d: DisasterState, t: number): number {
  const w = tension(d, t), k = DIFFICULTY[d.difficulty ?? 'standard'].price;
  // (the difficulty stretches how far prices climb above list)
  if (t < d.hitAt) return 1 + 0.6 * w * w * k;
  const tr = tracksAt(d, t);
  return 1 + (0.6 + 2.4 * (1 - Math.min(tr.stores, tr.deliveries))) * k;
}

/** Can the yard still deliver, and will anyone take your money? (Orders fail once deliveries or the banks are mostly gone.) */
export function canOrder(d: DisasterState, t: number): boolean {
  const tr = tracksAt(d, t);
  return tr.deliveries > 0.25 && tr.banks > 0.25;
}

/** The quiet between eras in a world that didn't all come back. */
const THIN_NEWS = [
  'Swap meet at the grange Saturday: bring what you can spare.', 'The co-op runs the power 6 to 10 tonight.', 'Word on the radio: the county road is open as far as the river.',
  'The store has flour this week, one sack a family.', 'School meets in the church basement again this fall.', 'A trader came through with salt and seed potatoes.',
  'The doctor in town sees people Tuesdays, for eggs or labor.', 'Folks are planting the old Miller fields again.',
];

/**
 * Advance the clock once a day: phase changes, track levels, chained
 * follow-ons rolled at the hit, and headlines for the ticker. Returns lines for the log.
 */
export function updateDisaster(d: DisasterState, t: number, seed: number, ctx?: { region: RegionId; doy: number }): string[] {
  // days turn at midnight (game time 0 is 6 a.m.; same as state.dayIndex)
  const day = Math.floor(t + 0.25);
  if (day === d.day) return [];
  d.day = day;
  const out: string[] = [];
  const r = rng(seed * 104729 + day);
  const def = d.kind ? DISASTERS[d.kind] : undefined;
  const cause = def?.variants.find(v => v.id === d.variant)?.name ?? '';
  const say = (text: string, tone: 0 | 1 | 2 | 3) => { d.news.push({ t, text, tone }); if (d.news.length > 40) d.news.splice(0, d.news.length - 40); };
  if (d.phase === 'peace' && def && t >= d.warnAt && t < d.hitAt) d.phase = 'warning';
  if ((d.phase === 'peace' || d.phase === 'warning') && def && t >= d.hitAt) {
    d.phase = 'impact';
    const line = def.hit[Math.floor(r() * def.hit.length)].replace('{cause}', cause);
    say(line, 3); out.push(line);
    // roll the follow-ons now
    for (const c of def.chain) {
      if (r() >= c.p) continue;
      const cd = DISASTERS[c.kind];
      if (!cd) continue;
      const v = pick(cd.variants, r());
      d.chained.push({ kind: c.kind, variant: v.id, hitAt: d.hitAt + roll(r, c.after), back: fateBack(rollBack(cd, v.id, r), d.fate ?? 'full', d.difficulty) });
    }
  } else if (d.phase === 'impact' && t >= d.hitAt + 3) d.phase = 'survival';
  // chained follow-ons announce themselves when they hit
  for (const c of d.chained) if (day === Math.floor(c.hitAt + 0.25)) { const cd = DISASTERS[c.kind]; if (cd) { const line = cd.hit[0]; say(line, 3); out.push(line); } }
  // headlines
  if (d.phase === 'warning' && def) {
    const w = tension(d, t), stage = w < 0.4 ? 0 : w < 0.8 ? 1 : 2;
    if (r() < 0.35 + 0.5 * w) {
      let line = def.hints[stage][Math.floor(r() * def.hints[stage].length)].replace('{cause}', cause);
      // words rolled from the run (a headline never contradicts the roll)
      const vars = def.fill?.({ seed, region: ctx?.region ?? 'mountain_west', difficulty: d.difficulty ?? 'standard' });
      if (vars) for (const [k, v] of Object.entries(vars)) line = line.split(`{${k}}`).join(v);
      say(line, (stage + 1) as 1 | 2 | 3);
    }
  } else if (d.phase === 'peace' && r() < 0.25) {
    const broken = d.baseline && Math.min(d.baseline.stores ?? 1, d.baseline.grid ?? 1) < 0.6;
    const recent = d.news.slice(-30).map(n => n.text);
    const fresh = THIN_NEWS.filter(x => !recent.includes(x));
    say(broken ? (fresh.length ? fresh : THIN_NEWS)[Math.floor(r() * (fresh.length || THIN_NEWS.length))] : pickPeaceNews(r, seasonOf(ctx?.doy ?? 120), ctx?.region ?? 'mountain_west', recent), 0);
  }
  // a thinner world mends a little, if there's anything left to mend
  if (d.phase === 'peace' && d.baseline) for (const k of TRACKS) { const b = d.baseline[k] ?? 1; if (b >= 0.3 && b < 1) d.baseline[k] = Math.min(1, b + 0.00015); }
  // how it's going out there (the fate shows itself only slowly)
  if (def && d.phase === 'survival') {
    const since = day - Math.floor(d.hitAt + 0.25), first = Math.min(...Object.values(d.back).map(Number), Infinity);
    if (d.fate === 'partial' && Number.isFinite(first) && since === first + 20) say('The county says some things are coming back, but "not the way they were".', 1);
    if (d.fate === 'never' && since === 120) say('Still nothing from the state. People are starting to say nobody is coming.', 2);
    if (d.fate === 'never' && since === 365) say('A year on. No trucks, no power, no word. This is how it is now.', 2);
  }
  d.tracks = tracksAt(d, t);
  return out;
}
