/**
 * Life on the county road (docs/DECISIONS.md, "Life on the county road"): the traffic that passes the place, and how it follows the
 * collapse clock. Pure, seeded, no state: every party is a function of (seed, slot index, context), every stalled car a function of
 * (seed, index, context). The renderer (game/RoadTraffic.ts) only plays what this module says; nothing here is saved or read back by
 * the sim, except that the parties that STAND FOR a real encounter (`partyForEncounter`) are built from the real encounter, so what
 * walks up the road is what arrives at the gate: the same heads, the same vehicles.
 *
 *  - Peace: occasional cars, pickups, vans, a delivery truck or a semi, motorcycles, a cyclist, tractors in farm country, a school bus
 *    on weekday mornings and afternoons. Density by hour (commute peaks, quiet nights), day of the week and region.
 *  - Warning signs: busier (people fleeing, stocking up), convoys for the kinds that have them (military, hazmat).
 *  - The hit: a sharp drop, to each disaster's own floor; then it follows the real service tracks (fuel, deliveries, law).
 *  - Aftermath: stalled cars where the disaster kills vehicles, the odd survivor driving, wanderers on foot (packs, carts, families,
 *    lone scavengers) and cosmetic roving crews. Cosmetic parties NEVER become encounters (the encounter generator is not told).
 */
import { mulberry32 } from './rng';
import type { RegionId } from './regions';
import type { DisasterKind, Phase } from './disaster';

/** One slot of the spawn clock, in world seconds (real seconds x the speed factor, capped at 4). */
export const SLOT = 3;
/** The stretch of road the world plays, either side of the gate (units; 1 unit is about 6 m). */
export const WINDOW = 120;

export type MemberKind =
  | 'sedan' | 'pickup' | 'suv' | 'van' | 'bus' | 'semi' | 'flatbed' | 'tractor' | 'motorcycle' | 'bicycle'
  | 'military' | 'raider' | 'rv' | 'walker' | 'cart';
export type PartyClass = 'traffic' | 'bus' | 'farm' | 'cycle' | 'convoy' | 'hazmat' | 'wanderers' | 'raiders' | 'refugees' | 'encounter';

export interface Member {
  kind: MemberKind;
  /** Metres behind the lead, in world units (the lead is 0). */
  gap: number;
  /** Sideways from the party's lane (units). */
  lat: number;
  /** 0-1: picks the paint / the clothes. */
  tint: number;
  /** People shown standing in the bed or riding on it (a crew in a pickup), over and above the driver. */
  riders: number;
  /** A load on the vehicle (a rig towing, bags on a cart, a pack). */
  loaded: boolean;
}

export interface RoadParty {
  id: string;
  cls: PartyClass;
  /** +1 northbound (z rising), -1 southbound. */
  dir: 1 | -1;
  /** World units a second. */
  speed: number;
  members: Member[];
  /** Headlights on when it is dark (running dark otherwise: a crew with something to hide). */
  lights: boolean;
  /** Set for a party that stands for a real encounter. */
  encounter?: string;
  /** Heads in the party, driver included. */
  heads: number;
}

export interface Tracks { fuel: number; law: number; grid: number; deliveries: number }

export interface TrafficCtx {
  seed: number;
  region: RegionId;
  /** Hour of day, 0-24. */
  hour: number;
  /** 0 Sunday ... 6 Saturday. */
  dow: number;
  /** 0-11. */
  month: number;
  phase: Phase;
  kind: DisasterKind | null;
  variant: string;
  /** Days since the hit (negative before it). */
  sinceHit: number;
  /** 0 to 1 through the warning signs. */
  tension: number;
  tracks: Tracks;
}

// ─────────────────────────────────────────────────────────────────────────
// The collapse curve
// ─────────────────────────────────────────────────────────────────────────

interface Profile {
  /** Extra traffic at the end of the warning, as a share of normal (fleeing, stocking up). */
  warnBoost: number;
  /** Share of normal in the first day or two after the hit. */
  hit: number;
  /** Where traffic settles when the tracks never come back. */
  floor: number;
  /** How many people are on the road on foot, 1 = a hard collapse. */
  walk: number;
  /** Vehicles dead on the road at the most, and the days it takes. */
  stall: number; stallDays: number;
  /** Convoys: before the hit (military / hazmat), and for how many days after. */
  early: 'military' | 'hazmat' | null; earlyDays: number;
  /** Roving crews (cosmetic), 1 = as lawless as it gets. */
  raiders: number;
  /** Days nobody goes out (fallout, contagion). */
  indoors: number;
  /** Surviving vehicles run without lights. */
  dark: boolean;
}

const P = (warnBoost: number, hit: number, floor: number, walk: number, stall: number, stallDays: number, early: Profile['early'], earlyDays: number, raiders: number, indoors = 0, dark = false): Profile =>
  ({ warnBoost, hit, floor, walk, stall, stallDays, early, earlyDays, raiders, indoors, dark });

export const PROFILE: Partial<Record<DisasterKind, Profile>> = {
  grid_down: P(0.5, 0.25, 0.08, 1.0, 3, 6, null, 0, 1),
  nuclear: P(0.4, 0.03, 0.02, 0.12, 2, 2, 'military', 6, 0.3, 14),
  lawless: P(0.2, 0.5, 0.2, 1.0, 0, 1, null, 0, 1.5),
  financial: P(0.3, 0.6, 0.15, 1.3, 0, 1, null, 0, 0.8),
  drought: P(0.2, 0.8, 0.3, 1.2, 0, 1, null, 0, 0.7),
  pandemic: P(0.1, 0.2, 0.12, 0.5, 0, 1, 'hazmat', 12, 0.4, 10),
  solar_flare: P(0, 0.02, 0.01, 1.2, 6, 1, null, 0, 1, 0, true),
  wildfire: P(1.2, 0.1, 0.3, 0.6, 1, 2, null, 0, 0.4),
  ash_winter: P(0.5, 0.1, 0.03, 0.2, 2, 3, null, 0, 0.5),
  cyberattack: P(0.3, 0.4, 0.15, 1.2, 1, 3, null, 0, 0.8),
  zombies: P(0.6, 0.1, 0.03, 0.15, 3, 3, 'military', 4, 0.2),
  invasion: P(0.6, 0.1, 0.05, 0.35, 2, 3, 'military', 15, 0.5),
  civil_war: P(0.4, 0.15, 0.08, 0.8, 1, 3, 'military', 10, 1.2),
  bioweapon: P(0, 0.1, 0.06, 0.3, 1, 3, 'hazmat', 14, 0.3, 14),
  asteroid: P(0.8, 0.02, 0.01, 0.1, 2, 2, null, 0, 0.1),
  unknown: P(0.3, 0.05, 0.02, 0.3, 3, 2, null, 0, 0.3),
};

/** The grid-down variants differ in how many cars die on the road: an ice storm strands a few, a dead grid with no fuel pumps strands more. */
const STALL_SCALE: Record<string, number> = { ice_storm: 0.4, substation: 1, cyber: 1, cascade: 1.2 };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Rural counties see a car every little while; the east and the old industrial counties more. */
export const REGION_TRAFFIC: Record<RegionId, number> = {
  mountain_west: 0.7, appalachia: 0.8, desert: 0.5, north_woods: 0.55, plains: 0.75, pnw: 0.9, upper_midwest: 0.95,
  new_england: 1.4, ozarks: 0.85, hill_country: 1.05, rust_belt: 1.5,
};
/** Regions where a tractor on the road is part of the day. */
export const FARM_REGIONS: ReadonlySet<RegionId> = new Set<RegionId>(['plains', 'upper_midwest', 'ozarks', 'rust_belt', 'hill_country']);

/** A vehicle per world second, mid-day on a weekday, region factor 1 (one every 20 s). */
const BASE = 1 / 20;

const HOUR_CURVE: Array<[number, number]> = [[0, 0.07], [4.5, 0.05], [6, 0.35], [7.5, 1], [9, 0.8], [11, 0.6], [13, 0.62], [15, 0.8], [17, 1], [18.5, 0.6], [21, 0.25], [24, 0.07]];
export function hourCurve(h: number): number {
  const x = ((h % 24) + 24) % 24;
  for (let i = 1; i < HOUR_CURVE.length; i++) if (x <= HOUR_CURVE[i][0]) { const [a, va] = HOUR_CURVE[i - 1], [b, vb] = HOUR_CURVE[i]; return lerp(va, vb, (x - a) / (b - a)); }
  return HOUR_CURVE[HOUR_CURVE.length - 1][1];
}
const dayOnly = (h: number) => (h >= 8 && h <= 17.5 ? 1 : h >= 6.5 && h <= 19 ? 0.5 : 0.04);
export const dowFactor = (dow: number) => (dow === 0 ? 0.6 : dow === 6 ? 0.78 : dow === 5 ? 1.1 : 1);

/** School bus runs: weekday mornings and afternoons in the school months (June to August nothing). */
export function busWindow(hour: number, dow: number, month: number): boolean {
  if (dow === 0 || dow === 6 || (month >= 5 && month <= 7)) return false;
  return (hour >= 6.4 && hour <= 8.2) || (hour >= 14.5 && hour <= 16.4);
}

export interface TrafficLevel {
  /** Rates per world second. */
  motor: number; bus: number; farm: number; cycle: number; convoy: number; wanderers: number; raiders: number;
  /** The convoy's kind this phase: military or hazmat. */
  convoyKind: 'military' | 'hazmat';
  /** Vehicles dead on the road. */
  stalled: number;
  /** Do moving vehicles run their lights at night. */
  lightsOk: boolean;
  /** Share of normal traffic (before the hour of day): the collapse curve, 1 = life as normal. */
  share: number;
}

const profileOf = (k: DisasterKind | null): Profile | null => (k ? PROFILE[k] ?? null : null);

/** How much of the world's services remain (0 = nothing, 1 = all): fuel first, then the stores and the law. */
const recovery = (t: Tracks) => clamp01(0.5 * t.fuel + 0.3 * t.deliveries + 0.2 * t.law);

/** The collapse curve: the rates for this moment. */
export function trafficLevel(c: TrafficCtx): TrafficLevel {
  const p = profileOf(c.kind);
  const rec = recovery(c.tracks);
  const farm = FARM_REGIONS.has(c.region);
  const day = dowFactor(c.dow) * REGION_TRAFFIC[c.region];
  let share = 0.3 + 0.7 * clamp01(c.tracks.fuel);     // a thinned world (a baseline below 1) has thinner roads even in "peace"
  let hourK = hourCurve(c.hour);
  let stalled = 0, convoy = 0, wanderers = 0, raiders = 0, cycleK = 1;
  let convoyKind: 'military' | 'hazmat' = p?.early ?? 'military';
  const afterHit = p !== null && c.kind !== null && c.phase !== 'peace' && c.phase !== 'warning' && c.sinceHit >= 0;
  if (p && c.phase === 'warning') {
    const w = smooth(c.tension);
    share *= 1 + p.warnBoost * w;
    hourK = lerp(hourK, Math.max(hourK, 0.5), w * Math.min(1, p.warnBoost));   // people on the road at odd hours
    if (p.early && c.tension > 0.5) convoy = (1 / 80) * smooth((c.tension - 0.5) / 0.5);
    if ((c.kind === 'financial' || c.kind === 'drought' || c.kind === 'cyberattack' || c.kind === 'lawless') && c.tension > 0.4) wanderers = (1 / 700) * w;
    cycleK = 1 + 2 * w;
  } else if (afterHit && p) {
    const d = c.sinceHit;
    const shock = d < 1.5 ? p.hit : lerp(p.hit, 1, smooth((d - 1.5) / 6));
    const longRun = p.floor + (0.9 - p.floor) * rec * rec;
    share *= Math.min(shock, longRun);
    hourK = lerp(hourK, dayOnly(c.hour), (1 - rec) * 0.8);
    const stallScale = c.kind === 'grid_down' ? (STALL_SCALE[c.variant] ?? 1) : 1;
    const towed = c.tracks.grid > 0.5 && c.tracks.fuel > 0.5;
    stalled = towed ? 0 : Math.round(Math.min(MAX_STALLED, p.stall * stallScale) * smooth(d / Math.max(0.5, p.stallDays)));
    const indoors = d < p.indoors ? 0.1 : 1;
    const months = d / 30;
    const decay = Math.max(0.3, 1 / (1 + months / 6));          // the desperate die, move on or settle: fewer each season
    wanderers = (1 / 260) * p.walk * decay * indoors * (0.35 + 0.65 * (1 - rec));
    raiders = (1 / 900) * p.raiders * decay * indoors * (1 - clamp01(c.tracks.law)) * smooth((d - 6) / 20);
    if (p.early) { convoy = (1 / 70) * Math.exp(-d / Math.max(1, p.earlyDays)) * (d < 4 * p.earlyDays ? 1 : 0); convoyKind = p.early; }
    cycleK = p.walk * (0.3 + 2 * (1 - rec));
  }
  const lightsOk = !(afterHit && p?.dark === true && !(c.tracks.grid > 0.5 && c.tracks.fuel > 0.5));
  const motor = BASE * day * hourK * share;
  const dayish = day * dowFactor(c.dow) > 0 ? 1 : 0;
  const warnNoBus = c.phase === 'warning' && c.tension > 0.75;
  const schoolOn = (c.phase === 'peace' || c.phase === 'warning') && !warnNoBus && busWindow(c.hour, c.dow, c.month);
  const warm = c.month >= 3 && c.month <= 9;
  const dayHours = c.hour >= 6.5 && c.hour <= 19 ? 1 : 0;
  return {
    motor,
    bus: schoolOn ? 1 / 50 : 0,
    farm: farm && dayHours && c.month >= 3 && c.month <= 10 && !afterHit ? BASE * 0.18 * REGION_TRAFFIC[c.region] * share : farm && dayHours && afterHit && rec > 0.5 ? BASE * 0.1 : 0,
    cycle: dayHours * dayish * (warm ? 1 : 0.2) * (1 / 110) * cycleK * (c.sinceHit > 0 && c.sinceHit < 2 && afterHit ? 0.1 : 1) * (dowFactor(c.dow) > 0.9 ? 1 : 1.3),
    convoy, wanderers: wanderers * dayOnly(c.hour), raiders: raiders * (c.hour > 18 || c.hour < 7 ? 1.2 : 0.8), convoyKind, stalled, lightsOk, share,
  };
}

/** The most vehicles dead on the stretch of road the world plays. */
export const MAX_STALLED = 7;

// ─────────────────────────────────────────────────────────────────────────
// Parties
// ─────────────────────────────────────────────────────────────────────────

const hash = (a: number, b: number, c = 0): number => mulberry32((Math.imul(a | 0, 2654435761) ^ Math.imul(b | 0, 40503) ^ Math.imul(c | 0, 69069)) >>> 0)();
const rngOf = (a: number, b: number, c = 0) => mulberry32((Math.imul(a | 0, 2654435761) ^ Math.imul(b | 0, 40503) ^ Math.imul(c | 0, 69069) ^ 0x9e3779b9) >>> 0);

/** Lane centre: right-hand traffic (northbound keeps to the west side's far lane: sign matches the delivery truck's lanes). */
export const LANE = 0.17;

/** Typical speed of each kind (world units a second at 1x). */
export const SPEED: Record<MemberKind, number> = {
  sedan: 5, pickup: 4.8, suv: 4.9, van: 4.6, bus: 3.8, semi: 4.2, flatbed: 4, tractor: 1.3, motorcycle: 6.1, bicycle: 0.95, military: 3.6, raider: 4.4, rv: 3.4, walker: 0.45, cart: 0.4,
};
/** Length of each kind along the road (units), for the following distance. */
export const LENGTH: Record<MemberKind, number> = {
  sedan: 0.75, pickup: 0.9, suv: 0.8, van: 0.85, bus: 2, semi: 3, flatbed: 1.3, tractor: 0.8, motorcycle: 0.37, bicycle: 0.28, military: 1.4, raider: 0.9, rv: 1.5, walker: 0.1, cart: 0.3,
};

const mem = (kind: MemberKind, gap: number, lat: number, tint: number, riders = 0, loaded = false): Member => ({ kind, gap, lat, tint, riders, loaded });
const lanes = (dir: 1 | -1) => -dir * LANE;    // northbound keeps west of centre

function weighted<T>(r: () => number, list: Array<[T, number]>): T {
  const tot = list.reduce((a, x) => a + x[1], 0);
  let u = r() * tot;
  for (const [v, w] of list) { u -= w; if (u <= 0) return v; }
  return list[list.length - 1][0];
}

function trafficParty(r: () => number, c: TrafficCtx, id: string, dir: 1 | -1, level: TrafficLevel): RoadParty {
  const night = c.hour < 5.5 || c.hour > 21;
  const hard = c.phase !== 'peace' && c.phase !== 'warning';
  const fleeing = c.phase === 'warning' && c.tension > 0.35;
  const kind = weighted<MemberKind>(r, [
    ['sedan', 34], ['pickup', 26], ['suv', 14], ['van', 7], ['semi', night ? 8 : 4], ['flatbed', 2], ['motorcycle', c.month >= 3 && c.month <= 9 && !night && !hard ? 4 : 0.3], ['rv', c.month >= 4 && c.month <= 9 && !hard ? 1.5 : 0],
  ]);
  const members: Member[] = [mem(kind, 0, lanes(dir), r(), 0, fleeing && kind !== 'semi' && kind !== 'motorcycle' ? r() < 0.7 : kind === 'semi' || kind === 'flatbed' || (kind === 'van' && r() < 0.6))];
  const speed = SPEED[kind] * (0.9 + 0.2 * r());
  let cls: PartyClass = 'traffic';
  // fleeing families come in twos and threes, loaded to the roof
  if (fleeing && kind !== 'semi' && kind !== 'motorcycle' && r() < 0.25 + 0.3 * c.tension) { members.push(mem(weighted<MemberKind>(r, [['sedan', 3], ['pickup', 3], ['suv', 3]]), 1.3 + 0.5 * r(), lanes(dir), r(), 0, true)); cls = 'traffic'; }
  // the odd survivor after the hit drives alone, carefully, with its headlights as they are
  void level;
  return { id, cls, dir, speed, members, lights: true, heads: members.length };
}

function convoyParty(r: () => number, id: string, dir: 1 | -1, kind: 'military' | 'hazmat'): RoadParty {
  const n = 2 + Math.floor(r() * 3);
  const members: Member[] = [];
  for (let i = 0; i < n; i++) members.push(mem(kind === 'hazmat' ? (i === 0 ? 'suv' : i === n - 1 ? 'van' : 'military') : (i === 0 ? 'suv' : 'military'), i * 1.9, lanes(dir), kind === 'hazmat' ? 0.95 : 0.5, 0, i > 0));
  return { id, cls: kind === 'hazmat' ? 'hazmat' : 'convoy', dir, speed: 3.7, members, lights: true, heads: n * 2 };
}

/** Wanderers on foot: a lone scavenger, a pair with packs, a family with a handcart, a column. */
function wanderParty(r: () => number, id: string, dir: 1 | -1): RoadParty {
  const roll = r();
  const members: Member[] = [];
  const side = dir * 0.42;   // they keep to the verge
  if (roll < 0.34) members.push(mem('walker', 0, side, r(), 0, true));
  else if (roll < 0.62) { const n = 2 + Math.floor(r() * 2); for (let i = 0; i < n; i++) members.push(mem('walker', i * 0.22, side + (i % 2) * 0.08, r(), 0, i !== 1)); }
  else if (roll < 0.9) { members.push(mem('cart', 0, side, r(), 0, true)); const n = 2 + Math.floor(r() * 3); for (let i = 0; i < n; i++) members.push(mem('walker', 0.2 + i * 0.2, side + (i % 2 ? 0.1 : -0.06), r(), 0, i % 2 === 0)); }
  else { const n = 5 + Math.floor(r() * 5); for (let i = 0; i < n; i++) members.push(mem('walker', i * 0.25, side + (i % 3 - 1) * 0.08, r(), 0, i % 3 !== 1)); if (r() < 0.5) members.push(mem('cart', 1, side, r(), 0, true)); }
  const heads = members.filter(m => m.kind === 'walker').length;
  return { id, cls: heads >= 5 ? 'refugees' : 'wanderers', dir, speed: SPEED.walker * (0.85 + 0.3 * r()), members, lights: false, heads };
}

/** A roving crew (cosmetic): trucks with people in the beds, running dark. It passes; it is not an encounter and nothing is told of it. */
function raiderParty(r: () => number, id: string, dir: 1 | -1): RoadParty {
  const n = 2 + Math.floor(r() * 2);
  const members: Member[] = [];
  let heads = 0;
  for (let i = 0; i < n; i++) { const riders = 1 + Math.floor(r() * 3); heads += riders + 1; members.push(mem('raider', i * 1.7, lanes(dir), r(), riders, false)); }
  return { id, cls: 'raiders', dir, speed: 4.2, members, lights: false, heads };
}

function cyclistParty(r: () => number, id: string, dir: 1 | -1): RoadParty {
  const two = r() < 0.2;
  const members: Member[] = [mem('bicycle', 0, dir * 0.4, r())];
  if (two) members.push(mem('bicycle', 0.4, dir * 0.4, r()));
  return { id, cls: 'cycle', dir, speed: SPEED.bicycle * (0.85 + 0.3 * r()), members, lights: false, heads: members.length };
}

function farmParty(r: () => number, id: string, dir: 1 | -1): RoadParty {
  const members: Member[] = [mem('tractor', 0, dir * 0.33, r(), 0, r() < 0.4)];
  return { id, cls: 'farm', dir, speed: SPEED.tractor * (0.9 + 0.2 * r()), members, lights: true, heads: 1 };
}

function busParty(r: () => number, id: string, dir: 1 | -1): RoadParty {
  return { id, cls: 'bus', dir, speed: SPEED.bus * (0.92 + 0.12 * r()), members: [mem('bus', 0, lanes(dir), 0)], lights: true, heads: 1 };
}

/**
 * The party (if any) that enters the road in this slot. Deterministic in (seed, slot, context). The chance of any party in a slot is
 * 1 - exp(-rate x SLOT); which kind it is is drawn in proportion to the rates.
 */
export function spawnFor(c: TrafficCtx, slot: number, level: TrafficLevel = trafficLevel(c)): RoadParty | null {
  const rates: Array<[PartyClass, number]> = [
    ['traffic', level.motor], ['bus', level.bus], ['farm', level.farm], ['cycle', level.cycle], ['convoy', level.convoy], ['wanderers', level.wanderers], ['raiders', level.raiders],
  ];
  const total = rates.reduce((a, x) => a + x[1], 0);
  if (total <= 0) return null;
  if (hash(c.seed, slot, 1) >= 1 - Math.exp(-total * SLOT)) return null;
  let u = hash(c.seed, slot, 2) * total;
  let cls: PartyClass = rates[0][0];
  for (const [k, v] of rates) { u -= v; if (u <= 0) { cls = k; break; } }
  const r = rngOf(c.seed, slot, 3);
  const dir: 1 | -1 = hash(c.seed, slot, 4) < 0.5 ? 1 : -1;
  const id = `a${slot}`;
  switch (cls) {
    case 'bus': return busParty(r, id, dir);
    case 'farm': return farmParty(r, id, dir);
    case 'cycle': return cyclistParty(r, id, dir);
    case 'convoy': return convoyParty(r, id, dir, level.convoyKind);
    case 'wanderers': return wanderParty(r, id, dir);
    case 'raiders': return raiderParty(r, id, dir);
    default: return trafficParty(r, c, id, dir, level);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Stalled vehicles
// ─────────────────────────────────────────────────────────────────────────

export interface StalledCar { id: string; kind: MemberKind; z: number; lat: number; yaw: number; tint: number }

/**
 * Cars that died on the road, `count` of them (see `trafficLevel`). Stratified along the stretch so no two overlap, in a seeded
 * order: car 3 is where it is whether there are 3 cars or 7, so the road only ever gains wrecks. `gateZ` keeps the gate mouth clear.
 */
export function stalledCars(seed: number, count: number, zMin: number, zMax: number, gateZ: number): StalledCar[] {
  const n = Math.max(0, Math.min(MAX_STALLED, count));
  const out: StalledCar[] = [];
  const order = Array.from({ length: MAX_STALLED }, (_, i) => i).sort((a, b) => hash(seed, a, 77) - hash(seed, b, 77));
  const w = (zMax - zMin) / MAX_STALLED;
  for (let i = 0; i < n; i++) {
    const r = rngOf(seed, i, 88);
    let z = zMin + (order[i] + 0.2 + 0.6 * r()) * w;
    if (Math.abs(z - gateZ) < 4) z += z < gateZ ? -4 : 4;
    const kind = weighted<MemberKind>(r, [['sedan', 4], ['pickup', 4], ['suv', 2], ['van', 1.2], ['semi', 0.7]]);
    const side = r() < 0.5 ? -1 : 1;
    const parked = r() < 0.55;   // pulled onto the shoulder, else dead in the lane
    out.push({ id: `s${i}`, kind, z, lat: side * (parked ? 0.42 : LANE), yaw: (side > 0 ? 0 : Math.PI) + (parked ? 0.12 : 0.04) * (r() - 0.5) * 2, tint: r() });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// The real encounter, seen coming
// ─────────────────────────────────────────────────────────────────────────

/** What the sim knows of an encounter that the road can show. */
export interface EncounterLike {
  id: string; kind: string; size: number; armed?: boolean; day?: number;
  extras?: { vehicle?: 'old_pickup' | 'pickup'; rig?: 'travel_trailer' | 'rv_camper'; dogs?: number };
}

/** Most people drawn for any one party (a horde of 50 is drawn as 24). */
export const MAX_SHOWN = 24;

const ON_FOOT: ReadonlySet<string> = new Set(['refugees', 'horde', 'arrival', 'kin', 'shelter', 'neighbor_help', 'move_in', 'stranded', 'trial_end']);

/**
 * The party that stands for this encounter: the same heads and vehicles the gate card names. Looters ride in a pickup; a gang in two
 * or three trucks (about four to a truck); militia in trucks; a requisition team in a Humvee and a guard truck; a patrol in an
 * armoured car and a truck; a trader in a truck with a trailer; refugees and the dead on foot (with carts); strangers on foot, or in
 * the pickup / rig they bring. `heads` is the real `size` (capped for drawing at MAX_SHOWN).
 */
export function partyForEncounter(e: EncounterLike, seed: number): RoadParty {
  const r = rngOf(seed, e.day ?? 0, hashStr(e.id));
  const dir: 1 | -1 = hash(seed, hashStr(e.id), 5) < 0.5 ? 1 : -1;
  const size = Math.max(1, Math.round(e.size));
  const shown = Math.min(size, MAX_SHOWN);
  const members: Member[] = [];
  const lane = lanes(dir);
  const trucks = (kind: MemberKind, per: number, nMax: number, speed: number, lights: boolean, cls: PartyClass): RoadParty => {
    const n = Math.max(1, Math.min(nMax, Math.ceil(shown / per)));
    let left = shown;
    for (let i = 0; i < n; i++) {
      const here = i === n - 1 ? left : Math.min(left - (n - 1 - i), Math.ceil(shown / n));
      left -= here;
      members.push(mem(kind, i * 1.8, lane, r(), Math.max(0, here - 1), false));
    }
    return { id: `e:${e.id}`, cls, dir, speed, members, lights, heads: shown, encounter: e.id };
  };
  switch (e.kind) {
    case 'looters': return trucks('raider', 6, 1, 4.4, true, 'raiders');
    case 'gang': return trucks('raider', 4, 3, 4.4, true, 'raiders');
    case 'militia': return trucks('military', 4, 3, 4, true, 'convoy');
    case 'requisition': { members.push(mem('military', 0, lane, 0.3, 0, false), mem('pickup', 1.7, lane, 0.5, 2, false)); return { id: `e:${e.id}`, cls: 'convoy', dir, speed: 3.8, members, lights: true, heads: Math.min(size, 6), encounter: e.id }; }
    case 'patrol': { members.push(mem('military', 0, lane, 0.2, 1, true), mem('military', 1.8, lane, 0.6, 3, false)); return { id: `e:${e.id}`, cls: 'convoy', dir, speed: 3.6, members, lights: true, heads: Math.min(size, 6), encounter: e.id }; }
    case 'trader': { members.push(mem('flatbed', 0, lane, 0.5, 0, true), mem('cart', 1.5, lane, 0.5, 0, true)); return { id: `e:${e.id}`, cls: 'traffic', dir, speed: 3.4, members, lights: true, heads: 1, encounter: e.id }; }
    default: break;
  }
  if (!ON_FOOT.has(e.kind)) { members.push(mem('sedan', 0, lane, r(), 0, false)); return { id: `e:${e.id}`, cls: 'encounter', dir, speed: 4.2, members, lights: true, heads: Math.min(size, 4), encounter: e.id }; }
  // strangers who bring a vehicle or a rig arrive in it; the rest of the party walks
  const ex = e.extras;
  let walkers = shown;
  if (ex?.vehicle || ex?.rig) {
    members.push(mem(ex.rig ? 'rv' : 'pickup', 0, lane, r(), 0, !!ex.rig));
    const ride = Math.min(shown, ex.rig ? 4 : 3);
    members[0].riders = Math.max(0, ride - 1);
    walkers = shown - ride;
    if (walkers <= 0) return { id: `e:${e.id}`, cls: 'encounter', dir, speed: 3.8, members, lights: true, heads: shown, encounter: e.id };
  }
  const side = dir * 0.42, g0 = members.length ? 2.2 : 0;
  const carts = e.kind === 'refugees' || e.kind === 'horde' ? 0 : size >= 5 ? 1 : 0;
  const cartN = e.kind === 'refugees' ? Math.max(0, Math.floor(walkers / 5)) : carts;
  for (let i = 0; i < cartN; i++) members.push(mem('cart', g0 + i * 0.7, side - 0.1, r(), 0, true));
  for (let i = 0; i < walkers; i++) members.push(mem('walker', g0 + cartN * 0.7 + Math.floor(i / 2) * 0.24, side + (i % 2 ? 0.1 : -0.07), r(), 0, e.kind !== 'horde' && i % 3 !== 1));
  return { id: `e:${e.id}`, cls: e.kind === 'refugees' ? 'refugees' : 'encounter', dir, speed: e.kind === 'horde' ? 0.3 : e.kind === 'refugees' ? 0.4 : 0.45, members, lights: false, heads: shown, encounter: e.id };
}

function hashStr(s: string): number { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; }

/** Kinds of encounter that a raid cutscene plays (so the road party hands over to the battle at the gate). Mirrors sim/siege.ts RAID_KINDS. */
export const RAID_LIKE: ReadonlySet<string> = new Set(['looters', 'gang', 'militia', 'patrol', 'requisition', 'horde']);

/**
 * Where a raid that is on its way is on the road, in units short of the gate (0 = at the gate). The raid was rolled at the day change
 * (`rolledAt`, game days) and arrives at `at`; it covers the last stretch of road in the last `LEAD` days (or all of the time there is
 * when it was rolled later than that), never faster than `MAX_RUSH` units a real second at 1x. Past `at` it stands at the gate.
 */
export const APPROACH = 150;
export const LEAD = 0.4;
export const MAX_RUSH = 8;
export function approachDistance(t: number, rolledAt: number, at: number): number {
  const total = Math.max(1e-6, at - rolledAt);
  const lead = Math.min(total, LEAD);
  const dist = Math.min(APPROACH, MAX_RUSH * 60 * lead);   // 60 real seconds a game day at 1x
  const remaining = at - t;
  if (remaining <= 0) return 0;
  if (remaining > lead) return Infinity;                  // not yet on the stretch the world shows
  return dist * (remaining / lead);
}

/** Day of the week (0 Sunday) from the clock's start-of-game day of the year and year, and the days elapsed. */
export function weekdayOf(startDoy: number, startYear: number, dayIdx: number): number {
  const ms = Date.UTC(startYear, 0, startDoy + dayIdx);
  return new Date(ms).getUTCDay();
}
/** Month 0-11 of a day of the year (non-leap). */
export function monthOfDoy(doy: number): number {
  const cum = [31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
  return cum.findIndex(c => doy <= c);
}
