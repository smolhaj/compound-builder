/**
 * Native wildlife on the land (decided with the user: the land should support the animals native to
 * its region in reasonable numbers for the parcel; overhunting thins them and they come back slowly;
 * predators are both a danger and a resource, and a safely closed property line keeps them out).
 * Pure (tested). The 3D animals (game/wildlife) draw whatever this says is there.
 *
 *  Species      a list per region (WILD_BY_REGION): deer, elk, moose, antelope, javelina, turkeys,
 *               rabbits, squirrels, grouse, waterfowl; bears, cougars, wolves and coyotes where they live.
 *  How many     `capacity` = animals per 40 acres × the acres you own × how well the place suits the
 *               species (timber, open ground, water; creek and spring) + a few that wander in from the
 *               neighbors' land on a small place. 5 acres: two deer; 80 acres: a herd of sixteen.
 *  Hunting      the class bars in wildfood.ts (`abundance`) are the sim's truth: the count is capacity ×
 *               the bar. A kill takes one animal's share of the bar (so one deer is half the deer on
 *               5 acres), and the herd refills slowly, faster on a small place with a long edge.
 *  Predators    bears, cougars, wolves, coyotes: there when the region has them and the land is big
 *               enough. If the property line holds them (enclosure(…, 'predators'), PREDATOR_BLOCK), they
 *               stay outside the wall; otherwise they come for what is careless (food smells, an open
 *               coop, stock in the open, kids out at dusk, no dog), unless somebody with a rifle is at
 *               home: then a good shot fills the freezer.
 *  Lights       animals walking by at night trip a basic motion sensor (lights.ts); an AI module tells them from people.
 */
import { calendarOf, dayIndex, hourOf, type GameState } from './state';
import type { RegionId } from './regions';
import { ACRES_PER_UNIT2 } from './land';
import { enclosure, ownedRects, type Against } from './enclosure';
import { huntingRifle } from './armory';
import { addFoodKcal } from './pantry';
import { mulberry32 } from './rng';
import { floodTowerIds } from './towers';
import { basicSensors, lightList, raiseAnimalAlert } from './lights';
import { PERIMETER, runFinished } from './perimeter';
import { ANIMALS } from './livestock';
import { isFinished } from './construction';

export type SpeciesId = 'deer' | 'elk' | 'moose' | 'antelope' | 'javelina' | 'turkey' | 'rabbit' | 'squirrel' | 'grouse' | 'waterfowl'
  | 'bear' | 'cougar' | 'wolf' | 'coyote';
export type WildKind = 'hoofed' | 'bird' | 'small' | 'predator';

export interface Species {
  id: SpeciesId;
  name: string;
  kind: WildKind;
  /** Animals per 40 acres where the habitat suits them perfectly (a predator: territories, so under one). */
  per40: number;
  /** What habitat they want: shares of timber, open ground and water (sum 1). */
  hab: { timber: number; open: number; water: number };
  /** Herd / flock size on screen. */
  group: [number, number];
  /** Body length and shoulder height, world units (1 ≈ 6 m; a person 0.28). */
  len: number;
  h: number;
  /** Fresh-meat baskets (2,000 kcal) a kill brings home. */
  meat: number;
  /** When they move about: dawn/dusk, by day, or by night. */
  active: 'crepuscular' | 'day' | 'night';
  /** How close a person gets before it bolts (world units; a predator holds its ground longer). */
  fear: number;
}

export const SPECIES: Record<SpeciesId, Species> = {
  deer:      { id: 'deer', name: 'White-tailed & mule deer', kind: 'hoofed', per40: 8, hab: { timber: 0.5, open: 0.3, water: 0.2 }, group: [1, 4], len: 0.27, h: 0.17, meat: 20, active: 'crepuscular', fear: 2.2 },
  elk:       { id: 'elk', name: 'Elk', kind: 'hoofed', per40: 5, hab: { timber: 0.4, open: 0.5, water: 0.1 }, group: [2, 6], len: 0.38, h: 0.24, meat: 60, active: 'crepuscular', fear: 2.6 },
  moose:     { id: 'moose', name: 'Moose', kind: 'hoofed', per40: 1.2, hab: { timber: 0.4, open: 0.1, water: 0.5 }, group: [1, 1], len: 0.42, h: 0.31, meat: 90, active: 'crepuscular', fear: 1.2 },
  antelope:  { id: 'antelope', name: 'Pronghorn', kind: 'hoofed', per40: 7, hab: { timber: 0.05, open: 0.9, water: 0.05 }, group: [3, 8], len: 0.22, h: 0.15, meat: 14, active: 'day', fear: 3 },
  javelina:  { id: 'javelina', name: 'Javelina', kind: 'hoofed', per40: 6, hab: { timber: 0.3, open: 0.6, water: 0.1 }, group: [3, 7], len: 0.16, h: 0.09, meat: 8, active: 'crepuscular', fear: 1.3 },
  turkey:    { id: 'turkey', name: 'Wild turkeys', kind: 'bird', per40: 8, hab: { timber: 0.5, open: 0.4, water: 0.1 }, group: [3, 9], len: 0.1, h: 0.13, meat: 3, active: 'day', fear: 1.6 },
  rabbit:    { id: 'rabbit', name: 'Cottontails & jackrabbits', kind: 'small', per40: 12, hab: { timber: 0.3, open: 0.6, water: 0.1 }, group: [1, 2], len: 0.07, h: 0.045, meat: 1, active: 'crepuscular', fear: 0.9 },
  squirrel:  { id: 'squirrel', name: 'Squirrels', kind: 'small', per40: 10, hab: { timber: 0.9, open: 0.05, water: 0.05 }, group: [1, 1], len: 0.06, h: 0.035, meat: 0.5, active: 'day', fear: 0.8 },
  grouse:    { id: 'grouse', name: 'Grouse', kind: 'bird', per40: 5, hab: { timber: 0.7, open: 0.2, water: 0.1 }, group: [1, 3], len: 0.06, h: 0.07, meat: 1, active: 'crepuscular', fear: 0.9 },
  waterfowl: { id: 'waterfowl', name: 'Ducks & geese', kind: 'bird', per40: 6, hab: { timber: 0, open: 0.1, water: 0.9 }, group: [2, 6], len: 0.09, h: 0.06, meat: 2, active: 'day', fear: 1.4 },
  bear:      { id: 'bear', name: 'Black bears', kind: 'predator', per40: 0.35, hab: { timber: 0.8, open: 0.1, water: 0.1 }, group: [1, 1], len: 0.3, h: 0.15, meat: 40, active: 'night', fear: 0.9 },
  cougar:    { id: 'cougar', name: 'Cougars', kind: 'predator', per40: 0.22, hab: { timber: 0.6, open: 0.3, water: 0.1 }, group: [1, 1], len: 0.26, h: 0.12, meat: 14, active: 'night', fear: 1.5 },
  wolf:      { id: 'wolf', name: 'Wolves', kind: 'predator', per40: 0.3, hab: { timber: 0.5, open: 0.4, water: 0.1 }, group: [1, 3], len: 0.2, h: 0.115, meat: 8, active: 'night', fear: 1.6 },
  coyote:    { id: 'coyote', name: 'Coyotes', kind: 'predator', per40: 0.9, hab: { timber: 0.2, open: 0.7, water: 0.1 }, group: [1, 2], len: 0.17, h: 0.105, meat: 2, active: 'night', fear: 1.8 },
};

/** The region's wildlife (alongside regions.ts `game`, which is what is worth hunting and fishing). */
export const WILD_BY_REGION: Record<RegionId, SpeciesId[]> = {
  mountain_west: ['deer', 'elk', 'antelope', 'grouse', 'rabbit', 'squirrel', 'bear', 'cougar', 'wolf', 'coyote'],
  appalachia: ['deer', 'turkey', 'grouse', 'rabbit', 'squirrel', 'bear', 'coyote'],
  desert: ['javelina', 'deer', 'antelope', 'rabbit', 'cougar', 'coyote'],
  north_woods: ['moose', 'deer', 'grouse', 'rabbit', 'squirrel', 'waterfowl', 'bear', 'wolf', 'coyote'],
  plains: ['deer', 'antelope', 'turkey', 'rabbit', 'waterfowl', 'coyote'],
  pnw: ['elk', 'deer', 'grouse', 'rabbit', 'squirrel', 'waterfowl', 'bear', 'cougar', 'coyote'],
  upper_midwest: ['deer', 'turkey', 'grouse', 'rabbit', 'squirrel', 'waterfowl', 'coyote'],
  new_england: ['deer', 'moose', 'turkey', 'grouse', 'rabbit', 'squirrel', 'bear', 'coyote'],
  ozarks: ['deer', 'turkey', 'rabbit', 'squirrel', 'bear', 'coyote'],
  hill_country: ['deer', 'turkey', 'javelina', 'rabbit', 'squirrel', 'coyote'],
  rust_belt: ['deer', 'turkey', 'grouse', 'rabbit', 'squirrel', 'waterfowl', 'coyote'],
};
export const isPredator = (sp: SpeciesId) => SPECIES[sp].kind === 'predator';
export const regionWildlife = (region: RegionId): SpeciesId[] => WILD_BY_REGION[region];

/** Which of wildfood's class bars a species draws on (predators have their own bookkeeping). */
export const classOf = (sp: SpeciesId): 'big' | 'small' | null => SPECIES[sp].kind === 'hoofed' ? 'big' : SPECIES[sp].kind === 'predator' ? null : 'small';

export interface Wildlife {
  /** Predators taken off the land, by species (fractional: a new animal moves into the territory over about a year). */
  gone: Partial<Record<SpeciesId, number>>;
  /** Day of the last sighting line (so the ticker is not a nature documentary). */
  lastSight: number;
  /** Day of the last night the lights logged an animal. */
  lastLightLog: number;
  /** Hour index of the last night roll for the lights. */
  lastHour: number;
  /** The hens are off the lay until this day (a coop raid). */
  henLossUntil: number;
  /** Lifetime counts: encounters, predators shot. */
  encounters: number;
  shot: number;
}
export const newWildlife = (): Wildlife => ({ gone: {}, lastSight: -9, lastLightLog: -9, lastHour: -1, henLossUntil: -1, encounters: 0, shot: 0 });
export const wildlifeOf = (s: GameState): Wildlife => (s.wildlife ??= newWildlife());

// ── how many ──

/** Acres the family owns (the home place and any bought parcels). */
export const ownedAcres = (s: GameState): number => ownedRects(s).reduce((a, r) => a + (r.x1 - r.x0) * (r.z1 - r.z0), 0) * ACRES_PER_UNIT2;

export interface Habitat { timber: number; open: number; water: number }
/** What the place offers: timber (0.2–1.5), open ground (the rest), water (a creek, a spring). */
export function habitat(s: GameState): Habitat {
  const timber = Math.max(0.2, Math.min(1.5, s.site.timber));
  return { timber, open: Math.max(0.2, Math.min(1.4, 1.8 - timber)), water: s.site.creek ? 1 : s.site.spring ? 0.5 : 0.15 };
}
/** How well the place suits a species (≈ 0.2–1.5). */
export function suitability(s: GameState, sp: SpeciesId): number {
  const h = habitat(s), w = SPECIES[sp].hab;
  return w.timber * h.timber + w.open * h.open + w.water * h.water;
}

/** Wanderers from the neighbors' land: a small place still sees a few. */
const EDGE = 0.6;
/** What the land carries before anyone hunts it (fractional). */
export function capacity(s: GameState, sp: SpeciesId): number {
  const sd = SPECIES[sp];
  if (!WILD_BY_REGION[s.site.region].includes(sp)) return 0;
  const base = sd.per40 * ownedAcres(s) / 40 * suitability(s, sp);
  return sd.kind === 'predator' ? base : base + (sd.per40 >= 5 ? EDGE : sd.per40 >= 1 ? EDGE * 0.4 : 0);
}

/** A stable 0–1 per (run, species): rounding fractions up or down the same way every time. */
function unit(seed: number, sp: string, salt = 0): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < sp.length; i++) h = Math.imul(h ^ sp.charCodeAt(i), 2654435761) >>> 0;
  h = Math.imul(h ^ (salt + 0x85ebca6b), 2246822519) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489917) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const roundBy = (s: GameState, sp: SpeciesId, x: number): number => Math.floor(x) + (x - Math.floor(x) > unit(s.seed, sp) ? 1 : 0);

/** How much of the herd is left: the class bar (hunting, ash winter), or for predators one minus what was taken. */
export function remaining(s: GameState, sp: SpeciesId): number {
  const c = classOf(sp);
  return c ? s.wild.abundance[c] : 1;
}

/** How many of a species live on the place now (what the 3D world draws, before the time of day). */
export function count(s: GameState, sp: SpeciesId): number {
  const cap = capacity(s, sp);
  if (cap <= 0) return 0;
  if (isPredator(sp)) return Math.max(0, roundBy(s, sp, cap) - Math.ceil(wildlifeOf(s).gone[sp] ?? 0));
  return roundBy(s, sp, cap * remaining(s, sp));
}

export interface PopLine { sp: SpeciesId; name: string; count: number; cap: number; predator: boolean }
/** The Supplies tab's list: each species, how many are about and how many the land can carry. */
export function populations(s: GameState): PopLine[] {
  return WILD_BY_REGION[s.site.region].map(sp => ({ sp, name: SPECIES[sp].name, count: count(s, sp), cap: Math.round(capacity(s, sp) * 10) / 10, predator: isPredator(sp) }));
}

/** What the class bar loses per animal taken: one animal's share of the class, never under the old flat rate. */
export function killShare(s: GameState, cls: 'big' | 'small'): number {
  const cap = WILD_BY_REGION[s.site.region].filter(sp => classOf(sp) === cls).reduce((a, sp) => a + capacity(s, sp), 0);
  return Math.min(0.6, Math.max(cls === 'big' ? 0.02 : 0.004, 1 / Math.max(2, cap)));
}
/** Recovery a day: slow, and quicker on a small place where neighbors' animals wander in along a long edge. */
export function recoveryPerDay(s: GameState, cls: 'big' | 'small'): number {
  const edge = 0.6 + Math.min(4, 20 / Math.max(5, ownedAcres(s)));
  return (cls === 'small' ? 0.0008 : 0.0003) * edge;
}
/** How many big game / small game animals the land holds now (the hunt's odds follow it). */
export function gameCount(s: GameState, cls: 'big' | 'small'): number {
  return WILD_BY_REGION[s.site.region].filter(sp => classOf(sp) === cls && sp !== 'waterfowl').reduce((a, sp) => a + count(s, sp), 0);
}

// ── the property line against animals ──

export interface Proof {
  /** The whole line holds them out (every stretch, the gates shut, the creek barred). */
  closed: boolean;
  openShare: number;
  creekOpen: number;
  gaps: Array<[number, number]>;
  /** Plain words for the Defense tab: where it fails. */
  why: string;
  /** What is built on the line, the weakest-link name. */
  weakest: string | null;
}
export function proof(s: GameState, who: Against = 'predators'): Proof {
  const e = enclosure(s, s.clock.t, who);
  const closed = e.openShare === 0 && e.creekOpen === 0;
  const bits: string[] = [];
  if (e.openShare > 0) bits.push(`${Math.round(e.openShare * 100)}% of the line stops nothing${who === 'predators' ? ' that has teeth' : ''}`);
  if (e.creekOpen > 0) bits.push(`the creek is open at ${e.creekOpen} crossing${e.creekOpen > 1 ? 's' : ''}`);
  if (s.gate.pending && s.perimeter.some(r => runFinished(r) && r.gates.length)) bits.push('a gate is standing open');
  const kinds = new Set(s.perimeter.filter(r => runFinished(r) && e.onLine.has(r.id)).map(r => r.kind));
  const weak = [...kinds].filter(k => PERIMETER[k].blocks.animals > 0).sort((a, b) => PERIMETER[a].blocks.animals - PERIMETER[b].blocks.animals)[0];
  return { closed, openShare: e.openShare, creekOpen: e.creekOpen, gaps: e.gaps as Array<[number, number]>, why: closed ? 'every stretch of the line holds, the creek is barred' : bits.join('; ') || 'no wall on the line yet', weakest: weak ? PERIMETER[weak].name : null };
}

/** Where the predators are: kept out by the line (they prowl outside it), or free to come in. */
export const predatorsKeptOut = (s: GameState): boolean => predatorSpecies(s).length === 0 || proof(s, 'predators').closed;
/** Predators that live in this region and on this place (their count is at least one). */
export const predatorSpecies = (s: GameState): SpeciesId[] => WILD_BY_REGION[s.site.region].filter(sp => isPredator(sp) && count(s, sp) > 0);

// ── what is drawn ──

export interface Critter {
  id: string;
  sp: SpeciesId;
  /** The nth animal of its species (stable). */
  i: number;
  /** Which herd / flock (animals of a group stay together). */
  group: number;
  /** 'in' and 'out': penned inside the wall or kept outside it; 'free': goes where it likes. */
  side: 'free' | 'in' | 'out';
  /** A buck, bull or tom (antlers, the fan). */
  male: boolean;
}

/** How much of the population is out and about at an hour (0–1): the rest are bedded down or in cover. */
export function activity(sp: SpeciesId, hour: number): number {
  const a = SPECIES[sp].active, dawn = hour >= 5 && hour < 9.5, dusk = hour >= 16.5 && hour < 21, day = hour >= 9.5 && hour < 16.5;
  if (a === 'day') return day ? 0.9 : dawn || dusk ? 0.55 : 0.02;
  if (a === 'night') return day ? 0.12 : dawn || dusk ? 0.5 : 0.8;
  return dawn || dusk ? 0.95 : day ? 0.4 : 0.12;
}

/** The animals to draw now: every living animal whose slot is out at this hour. `fences`: also work out who the wall keeps in or out. */
export function wildlifeView(s: GameState, hour: number, fences = true): Critter[] {
  const out: Critter[] = [];
  const keptPred = fences && predatorSpecies(s).length > 0 && proof(s, 'predators').closed;
  const hoofedShut = fences && proof(s, 'hoofed').closed && s.perimeter.some(r => runFinished(r));
  for (const sp of WILD_BY_REGION[s.site.region]) {
    const n = count(s, sp), sd = SPECIES[sp], act = activity(sp, hour);
    const gsz = Math.max(1, Math.round((sd.group[0] + sd.group[1]) / 2));
    for (let i = 0; i < n; i++) {
      if (unit(s.seed, sp, 100 + i) >= act) continue;
      const side: Critter['side'] = sd.kind === 'predator' ? (keptPred ? 'out' : 'free') : sd.kind === 'hoofed' && hoofedShut ? (i % 6 === 5 ? 'out' : 'in') : 'free';
      out.push({ id: `${sp}${i}`, sp, i, group: Math.floor(i / gsz), side, male: unit(s.seed, sp, 200 + i) < 0.45 });
    }
  }
  return out;
}

// ── lights: animals at night ──

/** Is it night (the hours the sensors are on duty)? */
const isNight = (h: number) => h >= 20 || h < 5.5;

/**
 * Every quarter-hour: once an hour at night, the animals on the place may walk past the sensors. Returns
 * the lines to log. A basic sensor light comes on for it (power, and the road sees it); an AI one does not.
 */
export function wildlifeNight(s: GameState): string[] {
  const w = wildlifeOf(s), h = hourOf(s.clock.t);
  if (!isNight(h)) return [];
  const hourIdx = Math.floor(s.clock.t * 24 + 6);
  if (hourIdx === w.lastHour) return [];
  w.lastHour = hourIdx;
  // nothing to trip without a light that could come on
  const ids = lightList(s, floodTowerIds(s)).map(l => l.id);
  if (ids.length === 0) return [];
  const day = dayIndex(s.clock.t);
  const kept = predatorSpecies(s).length > 0 && proof(s, 'predators').closed;
  let active = 0, loudest: SpeciesId | null = null, best = 0;
  for (const sp of WILD_BY_REGION[s.site.region]) {
    const sd = SPECIES[sp];
    if (sd.kind === 'predator' && kept) continue;
    const near = count(s, sp) * (sd.kind === 'hoofed' ? 0.45 : sd.kind === 'predator' ? 0.7 : sd.kind === 'bird' ? 0.02 : 0.2) * (sd.active === 'night' ? 1.4 : sd.active === 'crepuscular' ? 1 : 0.1);
    active += near;
    if (near > best) { best = near; loudest = sp; }
  }
  if (active <= 0 || !loudest) return [];
  const r = mulberry32(s.seed * 4517 + hourIdx * 31 + 7);
  if (r() >= 1 - Math.exp(-0.05 * active)) return [];
  // a pass of the sensors: a person's light would come on anyway; only basic ones are fooled
  const fooled = basicSensors(s, ids);
  raiseAnimalAlert(s, day);
  if (fooled > 0) {
    // the lights burn the battery for the length of the hold (≈ 0.2 kWh a light)
    if (!s.utilities.grid && s.utilities.batteryKwh > 0) s.utilities.batteryKwh = Math.max(0, s.utilities.batteryKwh - 0.2 * fooled);
    if (w.lastLightLog !== day) {
      w.lastLightLog = day;
      return [`The motion light came on in the night: just ${one(loudest)} walking by. An AI sensor module would ignore animals.`];
    }
  }
  return [];
}

// ── predators ──

const BASE_P: Record<'bear' | 'cougar' | 'wolf' | 'coyote', number> = { bear: 0.006, cougar: 0.004, wolf: 0.005, coyote: 0.015 };

export interface Attractants { smell: boolean; coop: boolean; stock: boolean; kids: boolean; dog: number; shooter: boolean; fruit: boolean }
/** What makes the place worth a visit (and what protects it). */
export function attractants(s: GameState): Attractants {
  const n = (k: string) => Math.floor((s.stock as unknown as Record<string, number>)[k] ?? 0);
  const fin = s.structures.filter(isFinished);
  const doy = calendarOf(s.clock).doy;
  const alive = (i: number) => s.personState[i]?.needs.died == null;
  return {
    smell: s.stock.fresh >= 1 || (s.stock.smoker >= 1 && s.stock.fresh > 0.2),
    coop: fin.some(st => st.kind === 'chicken_coop'),
    stock: ANIMALS.some(a => n(a) >= 1),
    kids: s.people.some((p, i) => p.kid && alive(i)),
    dog: Math.min(2, n('dog')),
    shooter: huntingRifle(s) && s.people.some((p, i) => !p.kid && alive(i) && p.skills.hunter >= 1),
    fruit: fin.some(st => st.kind === 'orchard') && doy >= 215 && doy <= 300,
  };
}

/** The daily chance a species of predator comes to the place (0 when the line holds them out). */
export function predatorRisk(s: GameState, sp: SpeciesId, closed = proof(s, 'predators').closed): number {
  if (!isPredator(sp) || count(s, sp) <= 0) return 0;
  if (closed) return 0;
  const a = attractants(s), k = sp as keyof typeof BASE_P;
  let m = 1;
  if (a.smell) m *= k === 'bear' ? 2.4 : 1.3;
  if (a.fruit && k === 'bear') m *= 1.8;
  if (a.coop) m *= k === 'coyote' ? 2.2 : 1.2;
  if (a.stock) m *= k === 'bear' ? 1 : 1.8;
  if (a.kids) m *= 1.1;
  m *= a.dog === 0 ? 1 : a.dog === 1 ? 0.65 : 0.5;
  // after the collapse the woods are hungry and so are they
  if (s.disaster.kind && s.clock.t >= s.disaster.hitAt && s.disaster.tracks.stores < 0.5) m *= 1.4;
  return Math.min(0.5, BASE_P[k] * count(s, sp) * m);
}

type Target = 'stock' | 'hens' | 'dog' | 'kid' | 'scraps';
/**
 * A kid caught outside by a bear or cougar. Cozy and Standard: badly hurt but pulled away. Hardcore (permadeath,
 * the user's choice): the child is killed. Returns the child's first name and whether they died.
 */
export function hurtKid(s: GameState, sev: number, what: string): { name: string; died: boolean } | null {
  const kids = s.people.filter((p, i) => p.kid && s.personState[i]?.needs.died == null);
  if (!kids.length) return null;
  const kid = kids[0], ps = s.personState.find(x => x.id === kid.id)!;
  if (s.disaster.difficulty === 'hardcore') {
    ps.needs.died = Math.floor(s.clock.t);
    ps.needs.health = 0;
    return { name: kid.first, died: true };
  }
  ps.needs.hurt.push({ what, sev, trauma: true });
  ps.needs.health = Math.max(s.disaster.difficulty === 'cozy' ? 5 : 1, ps.needs.health - sev * 0.4);
  return { name: kid.first, died: false };
}

const a_an = (w: string) => /^[aeiou]/i.test(w) ? 'an' : 'a';
/** "a deer", "an elk", "a pronghorn": one animal of the species, with its article. */
function one(sp: SpeciesId): string { const n = sp === 'antelope' ? 'pronghorn' : sp === 'waterfowl' ? 'duck' : sp; return `${a_an(n)} ${n}`; }

/**
 * Once a day: sightings, and predators that come to a careless place. Returns the ticker lines.
 * A good shot on a predator brings its meat home (the freezer, a smoker, or eaten fresh).
 */
export function wildlifeDay(s: GameState, freezer = false): string[] {
  const w = wildlifeOf(s), day = dayIndex(s.clock.t), r = mulberry32(s.seed * 7919 + day * 41 + 3);
  const lines: string[] = [];
  const hr = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const season = (() => { const d = calendarOf(s.clock).doy; return d < 80 || d > 355 ? 'winter' : d < 172 ? 'spring' : d < 266 ? 'summer' : 'fall'; })();
  // taken predators are replaced from the neighbors' ranges, slowly
  for (const sp of Object.keys(w.gone) as SpeciesId[]) { w.gone[sp] = Math.max(0, (w.gone[sp] ?? 0) - 1 / 300); if ((w.gone[sp] ?? 0) <= 0) delete w.gone[sp]; }

  const kept = predatorSpecies(s).length > 0 && proof(s, 'predators').closed;
  const a = attractants(s);
  let hadPredator = false;
  for (const sp of predatorSpecies(s)) {
    const sd = SPECIES[sp];
    if (kept) {
      // outside the wall: tracks, a shape at the fence
      if (r() < 0.015 * count(s, sp) && w.lastSight !== day) { w.lastSight = day; lines.push(`${cap1(one(sp))} walked the fence line at dusk and found nothing it could get through.`); }
      continue;
    }
    if (r() >= predatorRisk(s, sp, false)) continue;
    hadPredator = true; w.encounters++;
    // what it is after
    const opts: Array<[Target, number]> = [];
    if (a.stock) opts.push(['stock', sp === 'coyote' ? 0.6 : 1.4]);
    if (a.coop) opts.push(['hens', sp === 'coyote' ? 2 : 0.8]);
    if (a.dog > 0 && sp !== 'bear') opts.push(['dog', sp === 'coyote' ? 0.25 : 0.9]);
    if (a.kids && (sp === 'bear' || sp === 'cougar')) opts.push(['kid', (a.dog > 0 ? 0.15 : 0.5) * (a.smell || sp === 'cougar' ? 1 : 0.5)]);
    if (sp === 'bear' && (a.smell || a.fruit)) opts.push(['scraps', 2.5]);
    const tot = opts.reduce((x, o) => x + o[1], 0);
    let target: Target | null = null;
    if (tot > 0) { let u = r() * tot; for (const [t, wt] of opts) { u -= wt; if (u <= 0) { target = t; break; } } }
    if (!target) { if (w.lastSight !== day) { w.lastSight = day; lines.push(`${cap1(one(sp))} crossed the yard in the night, looked around and went on.`); } continue; }
    // somebody with a rifle at home: a good shot, or at least it is driven off
    const hunter = Math.max(0, ...s.people.filter((p, i) => !p.kid && s.personState[i]?.needs.died == null).map(p => p.skills.hunter));
    if (a.shooter && r() < 0.35 + 0.07 * hunter) {
      huntingRifle(s, true);
      w.gone[sp] = (w.gone[sp] ?? 0) + 1; w.shot++;
      const baskets = sd.meat;
      if (freezer) addFoodKcal(s, 'game_meat', baskets * 2000);
      else if (s.stock.smoker >= 1 && baskets > 4) addFoodKcal(s, 'smoked_meat', baskets * 2000 * 0.8);
      else s.stock.fresh += baskets;
      lines.push(`${cap1(one(sp))} came for ${targetText(target)} and was shot at the edge of the yard. ${baskets >= 8 ? `Meat for weeks${freezer ? ' in the freezer' : s.stock.smoker >= 1 ? ' (smoked into jerky)' : ''}.` : 'Not much meat on a coyote, and the hens are safe.'}`);
      continue;
    }
    if (a.shooter && r() < 0.4) { lines.push(`${cap1(one(sp))} came for ${targetText(target)}; a shot over its head and it was gone.`); continue; }
    switch (target) {
      case 'stock': {
        const heads = ANIMALS.filter(x => (s.stock[x] ?? 0) >= 1);
        const pick = heads[Math.floor(r() * heads.length) % heads.length];
        s.stock[pick] -= 1;
        lines.push(`${cap1(one(sp))} killed ${a_an(pick)} ${pick} in the night. ${a.dog === 0 ? 'No dog to raise the alarm.' : 'The dog woke the house too late.'}`);
        break;
      }
      case 'hens': w.henLossUntil = s.clock.t + 30; lines.push(`${cap1(one(sp))} got into the coop: hens lost, and the rest are off the lay for a month. Shut the coop at dusk, or wall the place in.`); break;
      case 'dog': s.stock.dog = Math.max(0, s.stock.dog - 1); lines.push(`${cap1(one(sp))} took the dog from the yard at night.`); break;
      case 'kid': {
        const who = hurtKid(s, sp === 'bear' ? 38 : 45, `${sp} attack`);
        lines.push(!who ? `${cap1(one(sp))} stalked the yard at dusk.` : who.died ? `${cap1(one(sp))} caught ${who.name} outside at dusk. ${who.name} is dead.` : `${cap1(one(sp))} caught ${who.name} outside at dusk: badly hurt, but pulled away. Keep the kids in at dusk, or close the land.`);
        break;
      }
      case 'scraps': lines.push(`A bear tore into the ${s.stock.fresh >= 1 ? 'food' : 'windfall fruit'} and the scraps. ${a.fruit && !a.smell ? 'Pick up the fruit.' : 'Food smells and open scraps bring it back.'}`); if (s.stock.fresh >= 1) s.stock.fresh = Math.max(0, s.stock.fresh - Math.min(2, s.stock.fresh)); break;
    }
  }

  // sightings of the ordinary animals: now and then, not every day
  if (!hadPredator && w.lastSight < day - 1 && r() < 0.25) {
    const here = WILD_BY_REGION[s.site.region].filter(sp => !isPredator(sp) && count(s, sp) > 0);
    if (here.length) {
      const sp = here[Math.floor(r() * here.length) % here.length], n = count(s, sp), sd = SPECIES[sp];
      w.lastSight = day;
      lines.push(sighting(sp, n, sd, season, r, hr));
    }
  }
  return lines;
}

const cap1 = (t: string) => t[0].toUpperCase() + t.slice(1);
const targetText = (t: Target) => t === 'stock' ? 'the stock' : t === 'hens' ? 'the hens' : t === 'dog' ? 'the dog' : t === 'kid' ? 'the kids' : 'the scraps';

function sighting(sp: SpeciesId, n: number, sd: Species, season: string, r: () => number, hr: (a: number, b: number) => number): string {
  const where = ['the north field', 'the creek bank', 'the edge of the timber', 'the back pasture', 'the road end of the place', 'the meadow'][Math.floor(r() * 6)];
  const many = Math.min(n, hr(sd.group[0], sd.group[1]));
  const word = (single: string, plural: string) => many > 1 ? `${many > 5 ? 'A herd of ' : ''}${many} ${plural}` : single;
  switch (sp) {
    case 'deer': return `${word('A doe', 'deer')} grazed ${where} at first light.`;
    case 'elk': return `${word('A bull elk', 'elk')} crossed ${where}${season === 'fall' ? ', bugling in the dark' : ''}.`;
    case 'moose': return `A moose stood in the shallows near ${where}.`;
    case 'antelope': return `${word('A pronghorn', 'pronghorn')} ran the fence line along ${where}.`;
    case 'javelina': return `${word('A javelina', 'javelina')} rooted along ${where}.`;
    case 'turkey': return `${word('A tom turkey', 'wild turkeys')} scratched through ${where}.`;
    case 'rabbit': return `A cottontail froze at the edge of ${where}.`;
    case 'squirrel': return `A squirrel scolded the family from the nearest tree.`;
    case 'grouse': return `A grouse drummed from the timber.`;
    case 'waterfowl': return `${word('A duck', 'ducks')} dropped onto the water ${season === 'winter' ? 'where the ice had opened' : 'near the creek'}.`;
    default: return `${cap1(sd.name.toLowerCase())} on ${where}.`;
  }
}

/** Egg-laying penalty while the hens recover from a raid (needs.ts). */
export const layFactor = (s: GameState): number => s.clock.t < (s.wildlife?.henLossUntil ?? -1) ? 0.4 : 1;

/** A one-line description for the Defense tab: who is out there and whether they can get in. */
export function predatorLine(s: GameState): { ok: boolean; warn: boolean; detail: string } {
  const sp = predatorSpecies(s);
  if (sp.length === 0) return { ok: true, warn: false, detail: 'no large predators live on this land' };
  const names = sp.map(x => SPECIES[x].name.toLowerCase()).join(', ');
  const p = proof(s, 'predators');
  if (p.closed) return { ok: true, warn: false, detail: `yes: ${names} stay outside the wall (the line holds, gates shut, creek barred)` };
  const a = attractants(s);
  const risk = sp.reduce((x, k) => x + predatorRisk(s, k), 0);
  const asks = [a.smell && 'food smells', a.coop && 'an open coop', a.stock && 'stock in the open', a.kids && 'kids out at dusk', a.dog === 0 && 'no dog'].filter(Boolean).join(', ');
  return { ok: false, warn: false, detail: `no: ${names}. ${p.why}.${asks ? ` Careless: ${asks}.` : ''} About ${Math.round(risk * 365)} visits a year.` };
}
