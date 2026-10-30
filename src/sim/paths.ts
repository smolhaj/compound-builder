/**
 * Paths: where the family actually walks, and what the ground looks and
 * feels like where they do (docs/DECISIONS.md, "Lived-in compound").
 *
 * Nothing here moves anybody: the sim has no positions. What it has is who
 * lives on the place and what stands on it, which is enough to say how many
 * trips a day go door to door (the house to the well, the privy, the garden,
 * the coop and the barn, the shop, the drive). Those trips, over the days
 * the buildings have both stood, wear the ground:
 *
 *   desire   a trampled line in the grass (a few trips a day, a few weeks)
 *   dirt     a bare, packed track (dozens of trips a day over a season)
 *
 * and the family lays something down where it matters, which is the one
 * saved piece of state (`GameState.paths`, save v58): gravel, stepping
 * stones, duckboards across the wet ground, and poured concrete between the
 * main buildings. A laid walk is cleared of snow and does not go to mud; a
 * worn track does. Walking on a path is a little quicker and mud off it a
 * little slower (`walkFactor`; a small effect, 0.8-1.12, drawn by the people
 * renderer only: the sim moves nobody).
 *
 * This file is the pure model: roles, the daily trips, wear, surfaces, the
 * speed factor, the bill and laying. The routing (grid search around the
 * buildings, creek and trees) is `pathRoute.ts`; the world turns both into
 * ribbons (game/paths).
 */
import { CELL, KIT, rotQ } from '../game/buildkit/kit';
import { structureAge } from '../game/atmosphere/aging';
import { log } from './economy';
import { MATERIALS, hasAll, shortfall, billText, type MaterialId, type Stock } from './materials';
import { isFinished } from './construction';
import { seasons } from './regions';
import { calendarOf, type GameState, type Structure } from './state';
import { regionFor } from './climate';

export type LaidKind = 'gravel' | 'stones' | 'boards' | 'paved';
export type PathSurface = 'desire' | 'dirt' | LaidKind;
export const LAID_KINDS: readonly LaidKind[] = ['gravel', 'stones', 'boards', 'paved'];

export interface LaidPath {
  /** The two ends (node ids: a structure id, 'camp', 'yard', 'gate', 'creek'), either order. */
  a: string;
  b: string;
  kind: LaidKind;
  /** Game day it was laid. */
  at: number;
}
export interface PathsState { laid: LaidPath[] }
export const newPaths = (): PathsState => ({ laid: [] });
export const pathsOf = (s: GameState): PathsState => (s.paths ??= newPaths());

/** One key for an edge, whichever way round. */
export const edgeKey = (a: string, b: string): string => (a < b ? `${a}~${b}` : `${b}~${a}`);

export const LAID_NAME: Record<LaidKind, string> = { gravel: 'Gravel walk', stones: 'Stepping stones', boards: 'Duckboards', paved: 'Poured concrete walk' };
export const LAID_BLURB: Record<LaidKind, string> = {
  gravel: 'A crowned bed of crushed rock: dry underfoot in any weather, cleared of snow with a shovel, the cheapest real path.',
  stones: 'Flat fieldstones set in the turf, a stride apart: no mud on them, a country look, slow to lay and cheap.',
  boards: 'Duckboards: planks on stringers over wet ground. The answer to the stretch that turns to soup every spring.',
  paved: 'A poured slab between the main buildings (house, shop, garage, barn): the best surface there is, and a wheelbarrow rolls on it.',
};

// ── Roles: what each stop is for ──

export type Role = 'home' | 'guest' | 'water' | 'privy' | 'garden' | 'field' | 'orchard' | 'greenhouse' | 'bank' | 'coop' | 'barn' | 'work' | 'power' | 'store' | 'tower' | 'hatch' | 'camp' | 'yard' | 'gate' | 'creek' | 'other';

const BY_KIND: Record<string, Role> = {
  timber_cabin: 'home', log_house: 'home', farmhouse: 'home', trailer: 'home', cottage: 'guest',
  lodge: 'home', lodge_solar: 'home', stone_house: 'home', timber_frame: 'home', container_house: 'home', adobe_house: 'home',
  outhouse: 'privy', septic: 'other',
  well_hand: 'water', well_drilled: 'water', cistern: 'water', water_tower: 'water', filtration_shed: 'water',
  garden: 'garden', field: 'field', orchard: 'orchard', greenhouse: 'greenhouse', chicken_coop: 'coop', barn: 'barn', root_cellar: 'store', wood_oven: 'work', forge: 'work', apiary: 'garden', sugar_shack: 'work', barnyard: 'barn',
  workshop: 'work', metal_garage: 'work', garage_solar: 'work', gate_garage: 'gate',
  battery_shed: 'power', generator_shed: 'power', solar_array: 'power',
  // the self-sufficient interior: the production greenhouse, the grove, the farm-scale power, the water bodies (a bench on the bank), the sheep barn, the yard of bays
  greenhouse_heated: 'greenhouse', orchard_grove: 'orchard', solar_farm: 'power', micro_hydro: 'power', boat_dock: 'bank', marina: 'bank', polytunnel: 'greenhouse', high_tunnel: 'greenhouse', aquaponics: 'greenhouse', wind_turbine: 'power', battery_bank: 'power', pond: 'bank', reservoir: 'bank', sheep_barn: 'barn', equipment_yard: 'work',
  // the extended family's houses
  guest_house: 'guest', moms_house: 'guest',
  bunker_hatch: 'hatch', bunker_stairs: 'hatch',
};

/** What a kit piece is for. Unknown kinds (new pieces) fall back to their category; towers by name. */
export function roleOf(kind: string): Role {
  const r = BY_KIND[kind];
  if (r) return r;
  if (kind.includes('tower') || kind.includes('lookout')) return 'tower';
  const c = KIT[kind]?.category;
  if (c === 'bunker') return 'other';
  if (c === 'home') return 'guest';
  if (c === 'food') return 'garden';
  if (c === 'work') return 'work';
  if (c === 'water') return 'water';
  if (c === 'power') return 'power';
  return 'other';
}

/** Roles that people walk to every day (a path is worth laying; the rest wear a track and no more). */
export const MAIN_ROLES: readonly Role[] = ['home', 'guest', 'work', 'barn', 'gate'];

/** A stop on the place: where people go (its door, or the circle round the camp). */
export interface PathNode {
  id: string;
  kind: string;
  role: Role;
  /** Where the structure stands (center), and the spot at its door a path ends at. */
  x: number; z: number;
  ax: number; az: number;
  /** Game day it came into use (negative: before the game began, what came with the land). */
  since: number;
  /** A node with no door: the path ends on a circle of this radius round (x, z) toward the other end (the camp). */
  ring?: number;
  /** Never worn past a faint track and never laid (the bunker hatch: a trail to it would give it away). */
  hidden?: boolean;
}

/** The spot at the door of a placed structure (the door side is +z, rotated by the quarter turns). */
export function doorOf(st: { kind: string; x: number; z: number; rot: number }): [number, number] {
  const def = KIT[st.kind];
  if (!def) return [st.x, st.z];
  const hd = def.cellsZ * CELL / 2, out = Math.max(def.porch, 0) + 0.08;
  const [dx, dz] = rotQ(0, hd + out, st.rot);
  return [st.x + dx, st.z + dz];
}

/** The day a structure came into use: finished, or (what came with the land) years before the game began. */
export function structureSince(s: GameState, st: Structure): number | null {
  if (!isFinished(st)) return null;
  if (st.pre) {
    const cal = calendarOf(s.clock), imp = s.site.improvements;
    const builtYear = st.kind === 'barn' ? imp.barn?.built ?? null : imp.house?.built ?? null;
    const yrs = structureAge({ finishedAt: 0, t: 0, pre: true, builtYear, nowYear: cal.year, startYear: s.clock.startYear });
    return -Math.max(365, yrs * 365);
  }
  return st.finishedAt ?? 0;
}

/** Where the world has put the extras the sim does not know. */
export interface PathExtras {
  camp?: { x: number; z: number } | null;
  /** Where deliveries unload (the drive's end). */
  yard?: { x: number; z: number } | null;
  /** The compound's vehicle gate, when it is not the drive's own. */
  gate?: { x: number; z: number } | null;
  /** A spot on the creek bank near the house (the landing). */
  creek?: { x: number; z: number } | null;
}

/** Every stop on the place: finished structures, the camp, the yard, the gate, the creek landing. */
export function pathNodes(s: GameState, ex: PathExtras = {}): PathNode[] {
  const out: PathNode[] = [];
  for (const st of s.structures) {
    if (st.unplaced) continue;
    const role = roleOf(st.kind), def = KIT[st.kind];
    if (!def) continue;
    const since = structureSince(s, st);
    if (since === null) continue;
    // below-ground rooms have no surface door; a hatch's headhouse does
    if (def.level === 'underground') continue;
    const [ax, az] = doorOf(st);
    out.push({ id: st.id, kind: st.kind, role, x: st.x, z: st.z, ax, az, since, ...(role === 'hatch' ? { hidden: true } : {}) });
  }
  if (ex.camp) out.push({ id: 'camp', kind: 'camp', role: 'camp', x: ex.camp.x, z: ex.camp.z, ax: ex.camp.x, az: ex.camp.z, since: 0, ring: 1.3 });
  if (ex.yard) out.push({ id: 'yard', kind: 'yard', role: 'yard', x: ex.yard.x, z: ex.yard.z, ax: ex.yard.x, az: ex.yard.z, since: 0, ring: 1.05 });
  if (ex.gate) out.push({ id: 'gate', kind: 'gate', role: 'gate', x: ex.gate.x, z: ex.gate.z, ax: ex.gate.x, az: ex.gate.z, since: 0 });
  if (ex.creek) out.push({ id: 'creek', kind: 'creek', role: 'creek', x: ex.creek.x, z: ex.creek.z, ax: ex.creek.x, az: ex.creek.z, since: 0 });
  return out;
}

// ── Who walks, and how often ──

/** The household as the trips see it. */
export interface Household {
  people: number;
  adults: number;
  kids: number;
  /** Adults with a job in town (a drive out and back each day). */
  commuters: number;
  animals: number;
  dogs: number;
  vehicles: number;
  /** Crops in the ground (the garden and the fields are walked every day), else a trip or two. */
  growing: boolean;
  /** A flush toilet in the house (septic + plumbing): the privy is mostly unused. */
  plumbed: boolean;
}

export function householdOf(s: GameState): Household {
  const alive = s.people.filter((_, i) => s.personState[i]?.needs?.died == null);
  const adults = alive.filter(p => !p.kid).length;
  const doy = calendarOf(s.clock).doy, [c0, c1] = seasons(regionFor(s.site)).crops;
  const homeBuilt = s.structures.some(st => isFinished(st) && ['septic'].includes(st.kind));
  const heads = (['goat', 'pig', 'steer', 'rabbit', 'sheep'] as const).reduce((a, k) => a + Math.floor(s.stock[k] ?? 0), 0);
  return {
    people: alive.length, adults, kids: alive.length - adults,
    commuters: alive.filter(p => !p.kid && p.job).length,
    animals: heads, dogs: s.dogs?.length ?? 0, vehicles: s.vehicles?.length ?? 0,
    growing: doy >= c0 && doy < c1, plumbed: homeBuilt,
  };
}

/** Trips a day between the hub (the main house, or the camp before there is one) and a stop of this role. */
export function tripsToHub(role: Role, h: Household): number {
  const crop = h.growing ? 1 : 0.25;
  switch (role) {
    case 'home': return 0;
    case 'guest': return 2.5 + h.people * 0.2;
    case 'water': return Math.max(1, h.people * (h.plumbed ? 0.3 : 1.2));
    case 'privy': return h.people * (h.plumbed ? 0.4 : 2.4);
    case 'garden': return (0.6 + h.adults * 0.9) * crop;
    case 'field': return (0.4 + h.adults * 0.5) * crop;
    case 'orchard': return 0.5 * crop;
    case 'greenhouse': return (1 + h.adults * 0.5) * Math.max(crop, 0.6);
    case 'bank': return 0.5 + h.kids * 0.25;
    case 'coop': return 2.2;
    case 'barn': return 1.5 + h.animals * 0.35;
    case 'work': return 0.6 + h.adults * 0.6;
    case 'power': return 0.4;
    case 'store': return 1.8;
    case 'tower': return 0.7;
    case 'hatch': return 0.1;
    case 'camp': return 2;
    case 'yard': return 1 + (h.vehicles > 0 ? 1 : 0);
    case 'gate': return 1 + h.commuters * 1.5 + (h.vehicles > 0 ? 1 : 0);
    case 'creek': return 0.8 + h.kids * 0.3;
    case 'other': return 0.5;
  }
}

/** Trips a day between two stops that are not the hub (the animals' water, the harvest to the house, the truck to the shop). */
export function tripsBetween(a: Role, b: Role, h: Household): number {
  const pair = (x: Role, y: Role) => (a === x && b === y) || (a === y && b === x);
  if (pair('water', 'garden')) return 1.4 * (h.growing ? 1 : 0.3);
  if (pair('water', 'coop')) return 1.2;
  if (pair('water', 'barn')) return 1 + h.animals * 0.3;
  if (pair('barn', 'coop')) return 1.2;
  if (pair('coop', 'garden')) return 0.8;
  if (pair('garden', 'greenhouse')) return 1.6;
  if (pair('bank', 'garden')) return 0.6 * (h.growing ? 1 : 0.2);
  if (pair('barn', 'field')) return 0.8 * (h.growing ? 1 : 0.2);
  if (pair('work', 'gate') || pair('work', 'yard')) return 1 + (h.vehicles > 0 ? 1.5 : 0);
  if (pair('work', 'barn')) return 0.9;
  if (pair('power', 'work')) return 0.3;
  if (pair('garden', 'privy')) return 0;
  return 0;
}

// ── Wear and surfaces ──

/** Trips (cumulative) at which a track is about two-thirds worn. */
export const WEAR_TRIPS = 700;
/** Most a hidden stop's track ever wears (it never shows as a beaten path). */
export const HIDDEN_WEAR = 0.3;

/** 0-1 wear from the trips a day over the days both ends have stood. */
export function wearOf(tripsPerDay: number, days: number): number {
  const cum = Math.max(0, tripsPerDay) * Math.max(0, days);
  return 1 - Math.exp(-cum / WEAR_TRIPS);
}

/** What the unlaid ground looks like at this wear: nothing yet, a trampled line, a bare track. */
export function surfaceOfWear(w: number): 'none' | 'desire' | 'dirt' {
  return w < 0.12 ? 'none' : w < 0.5 ? 'desire' : 'dirt';
}

/** Is this the sort of walk that is not cleared by a shovel and goes to mud (an earth track), or a laid one? */
export const isLaid = (s: PathSurface): s is LaidKind => s !== 'desire' && s !== 'dirt';

export const PATH_WIDTH: Record<PathSurface, number> = { desire: 0.11, dirt: 0.16, gravel: 0.22, stones: 0.18, boards: 0.17, paved: 0.26 };

// ── Walking on it ──

export interface Underfoot { mud: number; snow: number; rain: number }

const ON_PATH: Record<PathSurface, { base: number; mud: number; snow: number }> = {
  desire: { base: 1.02, mud: 0.12, snow: 0.08 },
  dirt: { base: 1.05, mud: 0.1, snow: 0.08 },
  gravel: { base: 1.07, mud: 0.02, snow: 0.02 },
  stones: { base: 1.04, mud: 0.04, snow: 0.03 },
  boards: { base: 1.07, mud: 0, snow: 0.04 },
  paved: { base: 1.1, mud: 0, snow: 0.01 },
};

/**
 * How fast a walker goes on this surface relative to dry open ground (1): a
 * little quicker on a path, a little slower in mud or snow off one. Small on
 * purpose (0.8-1.12): a flavor, never a way to win. null = off any path.
 */
export function walkFactor(surface: PathSurface | null, u: Underfoot): number {
  const mud = clamp01(u.mud), snow = clamp01(u.snow), rain = clamp01(u.rain);
  if (surface === null) return clamp(1 - 0.15 * mud - 0.09 * snow - 0.04 * rain, 0.8, 1);
  const p = ON_PATH[surface];
  return clamp(p.base * (1 - p.mud * mud) * (1 - p.snow * snow) * (1 - 0.02 * rain), 0.8, 1.12);
}

// ── Laying ──

/** Materials per metre of a laid walk. */
const PER_M: Record<LaidKind, Partial<Record<MaterialId, number>>> = {
  gravel: { fieldstone: 0.04 },
  stones: { fieldstone: 0.02 },
  boards: { lumber: 0.05 },
  paved: { concrete: 0.1 },
};

/** The bill for `lenM` metres of a laid walk (rounded up to a quarter, so a short walk still costs something real). */
export function laidBill(kind: LaidKind, lenM: number): Partial<Stock> {
  const bill: Partial<Stock> = {};
  for (const [m, per] of Object.entries(PER_M[kind]) as Array<[MaterialId, number]>) bill[m] = Math.max(0.25, Math.ceil(per * Math.max(0, lenM) * 4) / 4);
  return bill;
}

/** Dollars for a bill at the shop's prices (a rough figure for the menu). */
export function billPrice(bill: Partial<Stock>): number {
  return Math.round((Object.entries(bill) as Array<[MaterialId, number]>).reduce((a, [m, n]) => a + (MATERIALS[m].price ?? 0) * n, 0));
}

/** A planned edge: the two stops, how far (metres of new walk, overlaps with another edge counted once) and what it is now. */
export interface LayEdge { a: string; b: string; lenM: number }

export interface LayPlan { edges: LayEdge[]; lenM: number; bill: Partial<Stock>; cost: number; short: Partial<Stock> }

export function planLay(s: GameState, edges: readonly LayEdge[], kind: LaidKind): LayPlan {
  const lenM = edges.reduce((a, e) => a + e.lenM, 0);
  const bill = edges.length ? laidBill(kind, lenM) : {};
  return { edges: [...edges], lenM, bill, cost: billPrice(bill), short: shortfall(s.stock, bill) };
}

/** Why this walk cannot be laid (null: it can). */
export function layProblem(s: GameState, edges: readonly LayEdge[], kind: LaidKind): string | null {
  if (!edges.length) return 'nothing to lay';
  const plan = planLay(s, edges, kind);
  if (!hasAll(s.stock, plan.bill)) return `Waiting for ${billText(plan.short)}`;
  return null;
}

/** Lay a walk along these edges, using the stock (the family does it in an afternoon; no tracked hours). A walk laid again over an old one replaces it. */
export function layPaths(s: GameState, edges: readonly LayEdge[], kind: LaidKind): string | null {
  const why = layProblem(s, edges, kind);
  if (why) return why;
  const plan = planLay(s, edges, kind);
  for (const [m, n] of Object.entries(plan.bill) as Array<[MaterialId, number]>) s.stock[m] -= n;
  const p = pathsOf(s);
  for (const e of edges) {
    const k = edgeKey(e.a, e.b);
    p.laid = p.laid.filter(l => edgeKey(l.a, l.b) !== k);
    p.laid.push({ a: e.a, b: e.b, kind, at: s.clock.t });
  }
  log(s, `Laid ${Math.round(plan.lenM)} m of ${LAID_NAME[kind].toLowerCase()} (${billText(plan.bill)}).`);
  return null;
}

/** Take a laid walk up again: it goes back to a worn track. */
export function pickUpPath(s: GameState, a: string, b: string): void {
  const k = edgeKey(a, b), p = pathsOf(s);
  p.laid = p.laid.filter(l => edgeKey(l.a, l.b) !== k);
}

/** Can this kind go between these two stops (concrete only between main buildings)? */
export function canLay(kind: LaidKind, a: PathNode, b: PathNode): boolean {
  if (a.hidden || b.hidden) return false;
  if (kind === 'paved') return MAIN_ROLES.includes(a.role) && MAIN_ROLES.includes(b.role);
  return true;
}

function clamp(x: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, x)); }
function clamp01(x: number): number { return clamp(x, 0, 1); }
