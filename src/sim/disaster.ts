/**
 * The collapse clock (GDS §4, decided with the user): one engine for every
 * disaster. A run is peacetime → warning signs → impact → survival. After
 * the impact, the outside world's services (the tracks) fail and recover on
 * curves the disaster sets (1 = normal, 0 = gone). A disaster can chain into
 * an aftermath, whose tracks combine with its own (the worse one wins).
 * Pure and deterministic from the seed.
 */
import { mulberry32 as rng } from './rng';

/** "Never" (Free build until triggered); JSON-safe, unlike Infinity. */
export const NEVER = 1e9;

export type Track = 'grid' | 'fuel' | 'stores' | 'deliveries' | 'medical' | 'law' | 'phone' | 'banks';
export const TRACKS: Track[] = ['grid', 'fuel', 'stores', 'deliveries', 'medical', 'law', 'phone', 'banks'];
export const TRACK_NAME: Record<Track, string> = {
  grid: 'Grid power', fuel: 'Fuel stations', stores: 'Grocery stores', deliveries: 'Deliveries', medical: 'Hospital & pharmacy', law: 'Police & 911', phone: 'Phone & internet', banks: 'Banks & cash',
};

export type DisasterKind = 'grid_down' | 'financial' | 'lawless' | 'drought' | 'pandemic' | 'nuclear' | 'solar_flare' | 'wildfire' | 'ash_winter' | 'cyberattack'
  | 'zombies' | 'invasion' | 'civil_war' | 'bioweapon' | 'asteroid' | 'unknown';
export type Mode = 'surprise' | 'scenario' | 'sandbox';
/** GDS difficulty presets: Cozy (long warning, gentle raids), Standard, Hardcore (little warning, harsh raids, permadeath). */
export type Difficulty = 'cozy' | 'standard' | 'hardcore';
const WARN_SCALE: Record<Difficulty, number> = { cozy: 1.6, standard: 1, hardcore: 0.4 };
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
}

const C = (at: number, fall: number, floor: number, back: [number, number] | null, ramp = 7): TrackCurve => ({ at, fall, floor, back, ramp });

export const DISASTERS: Partial<Record<DisasterKind, DisasterDef>> = {
  grid_down: {
    kind: 'grid_down', name: 'Grid-down', pulpy: false, warn: [10, 40],
    variants: [
      { id: 'ice_storm', name: 'an ice storm', weight: 3, curves: { grid: C(0, 0, 0, [7, 30]), fuel: C(0, 0, 0.1, [8, 32]), stores: C(1, 3, 0.1, [10, 35]), deliveries: C(0, 1, 0, [10, 35]), medical: C(4, 4, 0.3, [10, 35]), law: C(14, 16, 0.4, [12, 34]), phone: C(1, 1, 0.1, [8, 30]), banks: C(0, 1, 0.2, [8, 31]) } },
      { id: 'substation', name: 'a coordinated substation attack', weight: 2, curves: { grid: C(0, 0, 0, [30, 120]), fuel: C(0, 0, 0.05, [32, 125]), stores: C(1, 3, 0.05, [35, 130]), deliveries: C(0, 1, 0, [35, 130]), medical: C(4, 6, 0.2, [35, 130]), law: C(14, 30, 0.15, [40, 140], 21), phone: C(1, 1, 0.1, [31, 122]), banks: C(0, 1, 0, [33, 125]) } },
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
      ['DEFCON raised; embassies told to evacuate dependants.', 'Jets overhead at all hours; the base is on lockdown.', 'Neighbors say the Hendersons left for her sister\'s in Idaho.'],
      ['Emergency session at the UN breaks up without a vote.', 'Potassium iodide sold out statewide.', 'Gas lines at every station in town; some pumps empty.'],
    ],
    hit: ['EMERGENCY ALERT: BALLISTIC MISSILE THREAT INBOUND. SEEK IMMEDIATE SHELTER. THIS IS NOT A DRILL.'],
    chain: [{ kind: 'lawless', p: 0.6, after: [10, 30] }],
  },
  lawless: {
    kind: 'lawless', name: 'End of the rule of law', pulpy: false, warn: [7, 20],
    variants: [{ id: 'collapse', name: 'the collapse of order', weight: 1, curves: { law: C(0, 10, 0, [180, 540], 60), stores: C(0, 5, 0.1, [150, 500]), deliveries: C(0, 3, 0.1, [150, 500]), banks: C(0, 3, 0.1, [150, 500]) } }],
    hints: [['Police union warns of unpaid overtime.', 'Break-ins up sharply in town.', 'Sheriff asks residents to "be patient".'], ['Looting reported in the city.', 'Deputies stop answering calls past the county line.', 'Pawn shop out of guns and ammo.'], ['Sheriff\'s office closed "until further notice".', 'A gang is working the farms east of town.', 'Neighbors set up a roadblock at the bridge.']],
    hit: ['Nobody is coming: the sheriff\'s office has shut its doors.'],
    chain: [],
  },
  financial: {
    kind: 'financial', name: 'Financial collapse', pulpy: false, warn: [30, 90],
    variants: [
      { id: 'bank_holiday', name: 'a bank holiday that never ends', weight: 3, curves: { banks: C(0, 1, 0.05, [90, 300], 60), stores: C(3, 20, 0.3, [60, 200], 60), deliveries: C(5, 25, 0.4, [60, 200], 60), fuel: C(10, 30, 0.4, [60, 220], 60), medical: C(20, 40, 0.4, [90, 300], 60), law: C(20, 40, 0.35, [100, 330], 60) } },
      { id: 'hyperinflation', name: 'hyperinflation', weight: 2, curves: { banks: C(0, 20, 0, [200, 500], 90), stores: C(10, 40, 0.25, [150, 450], 90), deliveries: C(10, 40, 0.3, [150, 450], 90), fuel: C(15, 30, 0.3, [150, 450], 90), medical: C(20, 50, 0.3, [150, 450], 90), law: C(30, 60, 0.3, [150, 450], 90), grid: C(60, 60, 0.5, [150, 450], 60) } },
    ],
    hints: [['Two regional banks fail in a week; lines outside a branch in the city.', 'Groceries up 4 % again this month.', 'The mill in town lays off a shift.'], ['"Temporary" withdrawal limits at every bank.', 'Gold hits a record; the pawn shop is buying.', 'Eggs and formula rationed at the store.'], ['ATMs read "temporarily unavailable".', 'The governor asks for calm.', 'Neighbors are swapping eggs for diesel.']],
    hit: ['The banks don\'t open: accounts frozen "until further notice".'],
    chain: [{ kind: 'lawless', p: 0.5, after: [45, 120] }],
  },
  drought: {
    kind: 'drought', name: 'Drought', pulpy: false, warn: [90, 200],
    variants: [
      { id: 'megadrought', name: 'a megadrought', weight: 1, curves: { stores: C(30, 90, 0.6, [400, 800], 120), deliveries: C(60, 90, 0.7, null), law: C(120, 120, 0.6, [500, 900], 90) } },
    ],
    hints: [['Snowpack 40 % of normal.', 'Hay prices double at the sale barn.', 'Burn ban in effect county-wide.'], ['The well driller is booked out six months.', 'Ranchers selling their herds early.', 'The creek is lower than anyone remembers.'], ['A neighbor\'s well is sucking air.', 'Reservoir at dead pool; irrigation called off.', 'The county starts trucking water to the subdivisions.']],
    hit: ['The creek has stopped running. Wells across the county are failing.'],
    chain: [{ kind: 'wildfire', p: 0.35, after: [60, 200] }],
  },
  pandemic: {
    kind: 'pandemic', name: 'Pandemic', pulpy: false, warn: [30, 60],
    variants: [
      { id: 'wave', name: 'the pandemic', weight: 1, curves: { medical: C(0, 14, 0.1, [200, 420], 60), stores: C(3, 14, 0.4, [60, 200], 30), deliveries: C(5, 20, 0.5, [60, 200], 30), law: C(30, 60, 0.6, [120, 300], 30), banks: C(10, 30, 0.7, [60, 200], 30), fuel: C(10, 30, 0.6, [60, 200], 30) } },
    ],
    hints: [['A cluster of "atypical pneumonia" overseas.', 'Airports begin screening.', 'Masks sold out online.'], ['First case in the state.', 'The hospital restricts visitors.', 'A neighbor\'s daughter, a nurse: "it\'s bad in the ER."'], ['Schools close statewide.', 'Toilet paper gone from every shelf.', 'Stay-at-home order expected tonight.']],
    hit: ['Stay-at-home order: the hospitals are full and the county is locking down.'],
    chain: [{ kind: 'lawless', p: 0.2, after: [60, 150] }],
  },
  solar_flare: {
    kind: 'solar_flare', name: 'Solar flare (Carrington event)', pulpy: false, warn: [1, 3],
    variants: [
      { id: 'carrington', name: 'a Carrington-class solar storm', weight: 1, curves: { grid: C(0, 0, 0, [240, 730], 90), phone: C(0, 1, 0.1, [60, 240], 60), fuel: C(0, 1, 0.1, [250, 740], 60), stores: C(2, 4, 0.1, [250, 740], 60), deliveries: C(0, 2, 0.05, [250, 740], 60), medical: C(5, 10, 0.2, [250, 740], 60), banks: C(0, 1, 0.05, [250, 740], 60), law: C(20, 40, 0.15, [260, 760], 60) } },
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
    hints: [['A swarm of earthquakes under Yellowstone.', 'The park closes its roads "for safety".'], ['The ground at Norris has risen a meter.', 'USGS raises the alert level to WARNING.'], ['Steam and ash from the caldera; flights grounded.', 'Ash forecast for the whole Mountain West.']],
    hit: ['Yellowstone erupts. Gray ash is falling like snow and the sun is a dim disc.'],
    chain: [{ kind: 'lawless', p: 0.4, after: [30, 90] }],
  },
  cyberattack: {
    kind: 'cyberattack', name: 'Cyberattack on infrastructure', pulpy: false, warn: [5, 20],
    variants: [
      { id: 'rolling', name: 'a coordinated cyberattack', weight: 1, curves: { grid: C(0, 0, 0.3, [10, 60], 40), banks: C(0, 0, 0, [14, 90], 30), phone: C(0, 1, 0.3, [7, 45], 20), fuel: C(0, 1, 0.3, [10, 60], 30), deliveries: C(1, 5, 0.3, [15, 70], 30), stores: C(2, 6, 0.3, [15, 70], 30), medical: C(2, 7, 0.5, [15, 70], 30), law: C(14, 30, 0.5, [30, 100], 30) } },
    ],
    hints: [['A ransomware attack shuts a pipeline for a week.', 'Bank apps down "for maintenance" in three states.'], ['The water utility in the city reports "anomalies".', 'Gas stations can\'t take cards.'], ['The power flickers off and on across the region.', 'Phones show "No Service" for an hour.']],
    hit: ['Everything digital stops at once: the grid, the banks, the phones. A cyberattack.'],
    chain: [{ kind: 'lawless', p: 0.25, after: [20, 60] }],
  },
  zombies: {
    kind: 'zombies', name: 'Zombies', pulpy: true, warn: [5, 15],
    variants: [{ id: 'outbreak', name: 'the outbreak', weight: 1, curves: { law: C(3, 10, 0, null), medical: C(2, 7, 0, null), stores: C(3, 7, 0, null), deliveries: C(2, 5, 0, null), grid: C(14, 30, 0, null), fuel: C(5, 15, 0, null), banks: C(5, 10, 0, null), phone: C(10, 30, 0, null) } }],
    hints: [['Riot at a hospital in the city: patients "attacking staff".', 'A strange rabies-like illness in the news.'], ['The National Guard is in the city. Footage is being taken down.', 'Neighbors say the interstate is closed east of here.'], ['The city has gone quiet on the radio.', 'Something is walking up the county road.']],
    hit: ['They\'re here. The dead are walking out of town.'],
    chain: [],
  },
  invasion: {
    kind: 'invasion', name: 'Invasion', pulpy: true, warn: [10, 40],
    variants: [{ id: 'occupation', name: 'the occupation', weight: 1, curves: { law: C(0, 5, 0.2, null), grid: C(0, 2, 0.2, null), phone: C(0, 0, 0, null), banks: C(0, 2, 0, null), fuel: C(0, 5, 0.1, null), stores: C(2, 10, 0.2, null), deliveries: C(0, 3, 0.1, null), medical: C(2, 10, 0.3, null) } }],
    hints: [['Satellites over the Pacific go dark.', 'Carrier groups recalled; the President addresses the nation.'], ['Paratroopers reported near the missile fields.', 'Martial law declared in three states.'], ['Columns of vehicles on the interstate, not ours.', 'Radio stations off the air one by one.']],
    hit: ['Foreign troops are in the valley. Checkpoints on every road.'],
    chain: [],
  },
  civil_war: {
    kind: 'civil_war', name: 'Civil war', pulpy: true, warn: [20, 60],
    variants: [{ id: 'factions', name: 'the war between the Cascade Compact and the Plains Alliance', weight: 1, curves: { law: C(0, 20, 0.1, null), grid: C(10, 30, 0.3, null), fuel: C(0, 20, 0.2, null), banks: C(0, 10, 0.1, null), stores: C(5, 30, 0.3, null), deliveries: C(5, 30, 0.2, null), medical: C(10, 40, 0.3, null), phone: C(5, 20, 0.4, null) } }],
    hints: [['The Cascade Compact refuses federal orders.', 'Protests become armed standoffs in two capitals.'], ['The Plains Alliance seizes a federal depot.', 'Checkpoints on the state line.'], ['Fighting around Billings; the interstate is cut.', 'Militia recruiters at the feed store.']],
    hit: ['The war reaches the valley: the Plains Alliance holds the town, the Compact the passes.'],
    chain: [],
  },
  bioweapon: {
    kind: 'bioweapon', name: 'Engineered bioweapon', pulpy: true, warn: [7, 20],
    variants: [{ id: 'release', name: 'the release', weight: 1, curves: { medical: C(0, 5, 0, null), stores: C(1, 5, 0.05, null), deliveries: C(1, 5, 0, null), law: C(7, 20, 0.05, null), grid: C(20, 60, 0.2, null), fuel: C(5, 20, 0.05, null), banks: C(5, 15, 0, null), phone: C(30, 90, 0.2, null) } }],
    hints: [['An outbreak in three cities at once.', 'Officials won\'t say where it started.'], ['Hospitals in the city overwhelmed in days.', 'The CDC tells everyone to stay home.'], ['Bodies in the streets in the city footage.', 'Roadblocks on the highway into the county.']],
    hit: ['It\'s here. Anyone from outside could be carrying it.'],
    chain: [],
  },
  asteroid: {
    kind: 'asteroid', name: 'Asteroid impact', pulpy: true, warn: [90, 200],
    variants: [{ id: 'impact', name: 'the impact', weight: 1, curves: { grid: C(0, 0, 0, null), fuel: C(0, 2, 0, null), stores: C(0, 3, 0, null), deliveries: C(0, 1, 0, null), medical: C(0, 3, 0.1, null), law: C(2, 20, 0.05, null), phone: C(0, 0, 0, null), banks: C(0, 0, 0, null) } }],
    hints: [['Astronomers: a 1-in-50 chance of impact next year.', 'The odds firm up: 1 in 3.'], ['Confirmed: impact in the North Atlantic.', 'Seed and canned goods rationed nationwide.'], ['It\'s visible at night now, a smudge brighter every week.', 'Churches full; the roads west are jammed.']],
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
};

/** Grounded disasters a Surprise run may roll (the pulpy ones are unlockables: Scenario and Free build). */
export const SURPRISE_POOL: DisasterKind[] = ['grid_down', 'nuclear', 'financial', 'lawless', 'drought', 'pandemic', 'solar_flare', 'wildfire', 'ash_winter', 'cyberattack'];
/** The Surprise roll, weighted by how likely each disaster is in the region (1 = the usual). */
export function surpriseKind(u: number, odds: Partial<Record<DisasterKind, number>> = {}): DisasterKind {
  const w = SURPRISE_POOL.map(k => odds[k] ?? 1), tot = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < w.length; i++) { acc += w[i] / tot; if (u < acc) return SURPRISE_POOL[i]; }
  return SURPRISE_POOL[SURPRISE_POOL.length - 1];
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
};
export function rollFate(kind: DisasterKind, u: number): Fate {
  const [f, p] = FATE_ODDS[kind] ?? [0, 0, 1];
  return u < f ? 'full' : u < f + p ? 'partial' : 'never';
}
/** A partial recovery: each service settles somewhere between a third and four fifths of what it was. */
function rollCeiling(r: () => number): Partial<Record<Track, number>> {
  const out: Partial<Record<Track, number>> = {};
  for (const k of TRACKS) out[k] = Math.round((0.35 + 0.45 * r()) * 100) / 100;
  return out;
}
/** Apply the fate to rolled return days: late for a partial recovery, none for never. */
function fateBack(back: Partial<Record<Track, number>>, fate: Fate): Partial<Record<Track, number>> {
  if (fate === 'never') return {};
  if (fate === 'partial') return Object.fromEntries(Object.entries(back).map(([k, v]) => [k, Math.round((v as number) * 1.5)]));
  return back;
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
}

const PEACE_DAYS: Record<Exclude<PeaceLength, 'random'>, number> = { short: 365, medium: 3 * 365, long: 5 * 365 };
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
  const k: DisasterKind | null = mode === 'sandbox' ? null : kind ?? surpriseKind(r(), odds);
  const def = k ? DISASTERS[k] : undefined;
  const v = def ? (variant && def.variants.some(x => x.id === variant) ? variant : pick(def.variants, r()).id) : '';
  const len = mode === 'sandbox' ? NEVER : peace === 'random' || mode === 'surprise' ? Math.round(3 * 365 + r() * 3 * 365) : PEACE_DAYS[peace];
  const warn = def ? Math.max(1, Math.round(roll(r, def.warn) * WARN_SCALE[difficulty])) : 0;
  // the fate on its own stream (the rest of the run's rolls don't move)
  const rf = rng(seed * 6007 + 29);
  const fate = k ? rollFate(k, rf()) : 'full';
  return {
    mode, difficulty, peace, kind: k, variant: v, phase: 'peace',
    warnAt: len - warn, hitAt: len,
    back: def ? fateBack(rollBack(def, v, r), fate) : {},
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
  d.fate = rollFate(kind, rf());
  d.ceiling = d.fate === 'partial' ? rollCeiling(rf) : {};
  d.back = fateBack(rollBack(def, d.variant, r), d.fate);
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

/** All tracks at game day t (the main disaster and its follow-ons; the worse wins). */
export function tracksAt(d: DisasterState, t: number): Record<Track, number> {
  if (!d.kind) return { ...FULL };
  const out = levelsOf(d.kind, d.variant, d.back, t - d.hitAt, d.ceiling);
  for (const c of d.chained) {
    const lv = levelsOf(c.kind, c.variant, c.back, t - c.hitAt, d.ceiling);
    for (const k of TRACKS) out[k] = Math.min(out[k], lv[k]);
  }
  return out;
}

/** 0 → 1 through the warning signs (0 before, 1 at the hit). */
export function tension(d: DisasterState, t: number): number {
  if (!d.kind || t < d.warnAt) return 0;
  return Math.min(1, (t - d.warnAt) / Math.max(1, d.hitAt - d.warnAt));
}

/** Prices climb through the warning signs (panic buying), then whatever is left is dear. */
export function priceFactor(d: DisasterState, t: number): number {
  const w = tension(d, t);
  if (t < d.hitAt) return 1 + 0.6 * w * w;
  const tr = tracksAt(d, t);
  return 1.6 + 2.4 * (1 - Math.min(tr.stores, tr.deliveries));
}

/** Can the yard still deliver, and will anyone take your money? (Orders fail once deliveries or the banks are mostly gone.) */
export function canOrder(d: DisasterState, t: number): boolean {
  const tr = tracksAt(d, t);
  return tr.deliveries > 0.25 && tr.banks > 0.25;
}

/** Ordinary local news in peacetime (the ticker is never empty). */
const PEACE_NEWS = [
  'County fair this weekend: pie contest, tractor pull.', 'Hay prices steady; good second cutting expected.', 'School board approves the new bus route.',
  'Elk season opens next month; tags on sale at the courthouse.', 'Road crews patching the county road through August.', 'Farmers market moves to the grange hall for winter.',
  'High school football: the Miners win at home, 21–14.', 'Library book sale Saturday.', 'Fire danger "moderate"; burn permits still issued.',
];

/**
 * Advance the clock once a day: phase changes, track levels, chained
 * follow-ons rolled at the hit, and headlines for the ticker. Returns lines for the log.
 */
export function updateDisaster(d: DisasterState, t: number, seed: number): string[] {
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
      d.chained.push({ kind: c.kind, variant: v.id, hitAt: d.hitAt + roll(r, c.after), back: fateBack(rollBack(cd, v.id, r), d.fate ?? 'full') });
    }
  } else if (d.phase === 'impact' && t >= d.hitAt + 3) d.phase = 'survival';
  // chained follow-ons announce themselves when they hit
  for (const c of d.chained) if (day === Math.floor(c.hitAt + 0.25)) { const cd = DISASTERS[c.kind]; if (cd) { const line = cd.hit[0]; say(line, 3); out.push(line); } }
  // headlines
  if (d.phase === 'warning' && def) {
    const w = tension(d, t), stage = w < 0.4 ? 0 : w < 0.8 ? 1 : 2;
    if (r() < 0.35 + 0.5 * w) say(def.hints[stage][Math.floor(r() * def.hints[stage].length)].replace('{cause}', cause), (stage + 1) as 1 | 2 | 3);
  } else if (d.phase === 'peace' && r() < 0.25) say(PEACE_NEWS[Math.floor(r() * PEACE_NEWS.length)], 0);
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
