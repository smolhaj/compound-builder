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
};

/** Grounded disasters a Surprise run may roll (only ones with a ruleset; the rest are added as they are built). */
export const SURPRISE_POOL: DisasterKind[] = ['grid_down', 'nuclear'];

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
  /** The levels as of the last daily update. */
  tracks: Record<Track, number>;
  /** Headlines for the ticker (newest last). */
  news: Array<{ t: number; text: string; tone: 0 | 1 | 2 | 3 }>;
  /** Day index of the last update. */
  day: number;
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
export function newDisaster(seed: number, mode: Mode, peace: PeaceLength = 'random', kind: DisasterKind | null = null, variant?: string, difficulty: Difficulty = 'standard'): DisasterState {
  const r = rng(seed * 7919 + 13);
  const k: DisasterKind | null = mode === 'sandbox' ? null : kind ?? SURPRISE_POOL[Math.floor(r() * SURPRISE_POOL.length)];
  const def = k ? DISASTERS[k] : undefined;
  const v = def ? (variant && def.variants.some(x => x.id === variant) ? variant : pick(def.variants, r()).id) : '';
  const len = mode === 'sandbox' ? NEVER : peace === 'random' || mode === 'surprise' ? Math.round(3 * 365 + r() * 3 * 365) : PEACE_DAYS[peace];
  const warn = def ? Math.max(1, Math.round(roll(r, def.warn) * WARN_SCALE[difficulty])) : 0;
  return {
    mode, difficulty, peace, kind: k, variant: v, phase: 'peace',
    warnAt: len - warn, hitAt: len,
    back: def ? rollBack(def, v, r) : {},
    chained: [], tracks: { ...FULL }, news: [], day: -1,
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
  d.back = rollBack(def, d.variant, r);
  d.chained = [];
  d.phase = warnDays > 0 ? 'warning' : 'peace';
}

/** One track's level `days` after the hit. */
export function curveLevel(c: TrackCurve | undefined, back: number | undefined, days: number): number {
  if (!c || days < c.at) return 1;
  const fell = c.fall <= 0 ? 1 : Math.min(1, (days - c.at) / c.fall);
  let lv = 1 - (1 - c.floor) * fell;
  if (back !== undefined && days > back) lv = Math.min(1, lv + (1 - lv) * Math.min(1, (days - back) / Math.max(1, c.ramp)));
  return lv;
}

function levelsOf(kind: DisasterKind, variant: string, back: Partial<Record<Track, number>>, days: number): Record<Track, number> {
  const def = DISASTERS[kind], v = def?.variants.find(x => x.id === variant);
  const out = { ...FULL };
  if (!v || days < 0) return out;
  for (const t of TRACKS) out[t] = curveLevel(v.curves[t], back[t], days);
  return out;
}

/** All tracks at game day t (the main disaster and its follow-ons; the worse wins). */
export function tracksAt(d: DisasterState, t: number): Record<Track, number> {
  if (!d.kind) return { ...FULL };
  const out = levelsOf(d.kind, d.variant, d.back, t - d.hitAt);
  for (const c of d.chained) {
    const lv = levelsOf(c.kind, c.variant, c.back, t - c.hitAt);
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

/** Can the yard still deliver? (Orders fail once deliveries are mostly gone.) */
export function canOrder(d: DisasterState, t: number): boolean {
  return tracksAt(d, t).deliveries > 0.25;
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
      d.chained.push({ kind: c.kind, variant: v.id, hitAt: d.hitAt + roll(r, c.after), back: rollBack(cd, v.id, r) });
    }
  } else if (d.phase === 'impact' && t >= d.hitAt + 3) d.phase = 'survival';
  // chained follow-ons announce themselves when they hit
  for (const c of d.chained) if (day === Math.floor(c.hitAt + 0.25)) { const cd = DISASTERS[c.kind]; if (cd) { const line = cd.hit[0]; say(line, 3); out.push(line); } }
  // headlines
  if (d.phase === 'warning' && def) {
    const w = tension(d, t), stage = w < 0.4 ? 0 : w < 0.8 ? 1 : 2;
    if (r() < 0.35 + 0.5 * w) say(def.hints[stage][Math.floor(r() * def.hints[stage].length)].replace('{cause}', cause), (stage + 1) as 1 | 2 | 3);
  } else if (d.phase === 'peace' && r() < 0.25) say(PEACE_NEWS[Math.floor(r() * PEACE_NEWS.length)], 0);
  d.tracks = tracksAt(d, t);
  return out;
}
