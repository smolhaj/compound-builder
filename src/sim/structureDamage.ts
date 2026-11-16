/**
 * Structure damage for the physical shocks (WP6; docs/scenarios/README.md "Shared model for physical shocks"). Pure: no GameState writes.
 *
 * Owner principle: a disaster damages buildings in proportion to how they were built and where they stand, and money buys the difference.
 * A roll is `hazard(intensity) x resistance(style, site, stage)` (lower resistance is better) and lands on a damage state:
 *
 *   0 sound        nothing
 *   1 minor        a repair job (hardware kit, 1 to 3 person-days); no stage is lost
 *   2 major        the building is knocked back to its roof, frame or interior stage (30 to 60% of the blueprint's materials)
 *   3 destroyed    clear the wreck and rebuild from the footing
 *
 * Repair: by hand it costs person-days; hired crews have a lead time of `3 x (1 + 8 x affected share)` days after a regional event
 * (money buys speed: a premium jumps the queue); see `repairQuote` and `physical.ts`, which writes the state.
 *
 * The first half of this file is the WP0 API (profile / quality / fraction / plan), kept for its callers and tests; the second half is
 * the state model every WP6 kind rolls with.
 */
import type { Structure } from './state';

export type Hazard = 'quake' | 'flood' | 'blast' | 'ash_load' | 'wind' | 'fire' | 'emp';
export type DamageState = 'none' | 'cosmetic' | 'major' | 'destroyed';
/** The shared four-state model. */
export type DamageLevel = 0 | 1 | 2 | 3;

export interface BuildProfile {
  /** 0 timber / light frame, 1 masonry, 2 reinforced stone or concrete, 3 steel or earth-sheltered. */
  material: 0 | 1 | 2 | 3;
  /** 0..1: footings and foundation (poured and keyed = 1, none = 0). */
  footings: number;
  /** 0..1: roof framing and cover against load and wind. */
  roof: number;
  /** 0..1: fitted hardening (shutters, bracing, ties, shelter). */
  hardening: number;
  /** 0..1: how steep or soft the ground is under it (worse = more). */
  slope: number;
  /** 0..1: the owner's wealth (money buys a better build and a faster repair). */
  wealth: number;
}

/** How strongly each hazard bites each material (before quality). */
const MATERIAL_EXPOSURE: Record<Hazard, [number, number, number, number]> = {
  quake: [0.35, 0.8, 0.45, 0.2], flood: [0.6, 0.45, 0.3, 0.25], blast: [0.9, 0.8, 0.5, 0.3], ash_load: [0.7, 0.5, 0.3, 0.2],
  wind: [0.7, 0.4, 0.25, 0.15], fire: [0.9, 0.35, 0.2, 0.1], emp: [0, 0, 0, 0],
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Material class by kind: stone and adobe walls are masonry, containers and steel sheds are steel, buried boxes ride it out. */
function materialOf(kind: string): 0 | 1 | 2 | 3 {
  if (kind.startsWith('bunker_') || kind === 'root_cellar') return 3;
  if (kind === 'stone_house' || kind === 'adobe_house' || kind === 'watchtower_concrete') return 1;
  if (kind === 'container_house' || kind === 'workshop' || kind === 'metal_garage' || kind === 'container_stack') return 3;
  return 0;
}

/** Reads a structure: material by kind, footings by how far it was built and what the foundation is, a lost roof, tiers of hardening, the grade under it. */
export function buildProfile(st: Structure, wealth: number): BuildProfile {
  const tiers = Object.values(st.hardening ?? {}).reduce((a, t) => a + (t as number), 0);
  return {
    material: materialOf(st.kind), footings: st.stage > 1 ? (st.kind === 'workshop' || st.kind === 'metal_garage' ? 0.9 : 0.55) : 0,
    roof: st.roofLost ? 0 : 0.5, hardening: clamp01(tiers / 6), slope: clamp01(Math.abs(st.grade ?? 0) * 2), wealth: clamp01(wealth),
  };
}

/** 0..1: how well it is built (wealth lifts it a little: rich owners built better). */
export function buildQuality(p: BuildProfile): number {
  return clamp01(0.3 * p.footings + 0.25 * p.roof + 0.25 * p.hardening + 0.1 * (p.material / 3) + 0.1 * p.wealth - 0.15 * p.slope);
}

/** Share of the building lost to `power` (0..1) of a hazard; deterministic (the caller adds dice). Better build means less. */
export function damageFraction(h: Hazard, q: number, power: number, p?: Pick<BuildProfile, 'material'>): number {
  const exposure = MATERIAL_EXPOSURE[h][p?.material ?? 0];
  return clamp01(power * exposure * (1.2 - q));
}

export function damageState(f: number): DamageState {
  return f < 0.05 ? 'none' : f < 0.25 ? 'cosmetic' : f < 0.7 ? 'major' : 'destroyed';
}

/** The old plan (cost and days of work by hand or with crews); kept for its callers. `repairQuote` adds the lead time. */
export function repairPlan(fraction: number, fullCost: number, wealth: number, crews: number): { cost: number; days: number } {
  const cost = Math.round(fullCost * fraction);
  const handDays = Math.max(0, fraction) * 30;
  const speed = 1 + 2 * clamp01(wealth) + 1.5 * Math.max(0, crews);
  return { cost, days: fraction <= 0 ? 0 : Math.max(1, Math.ceil(handDays / speed)) };
}

// ── the four-state model ─────────────────────────────────────────────────────────────────────────────────────────────

export const LEVEL_NAME: Record<DamageLevel, string> = { 0: 'sound', 1: 'cracked', 2: 'badly damaged', 3: 'destroyed' };

/** Share of the building's value a state loses (for repair cost and insurance). */
export const LOST_SHARE: Record<DamageLevel, number> = { 0: 0, 1: 0.08, 2: 0.45, 3: 1 };

/** The owner's wealth 0..1 from cash: $5k is nothing, $30k a little, $1M a lot. */
export function wealthFrom(money: number): number {
  return clamp01((Math.log10(Math.max(1000, money)) - 3.7) / 2.8);
}

/** Seismic multiplier by kind (README table; 1 = a wood frame on a fieldstone footing, unbolted). Lower is better. */
export const SEISMIC_K: Record<string, number> = {
  timber_cabin: 1.0, log_house: 0.5, lodge: 1.2, lodge_plinth: 0.55, lodge_solar: 1.2, stone_house: 2.2, timber_frame: 0.5, container_house: 0.7, adobe_house: 2.2,
  cottage: 1.0, guest_house: 1.0, moms_house: 1.0, farmhouse: 1.3, trailer: 1.6, modular_home: 1.3, travel_trailer: 0.5, rv_camper: 0.5, stilted_house: 1.4, cabin_village: 1.0,
  barn: 0.9, sheep_barn: 0.9, workshop: 0.7, metal_garage: 0.7, garage_solar: 0.8, chicken_coop: 0.6, greenhouse: 0.8, greenhouse_heated: 0.8, polytunnel: 0.4, high_tunnel: 0.4,
  outhouse: 0.6, forge: 1.0, wood_oven: 1.6, well_hand: 0.5, well_drilled: 0.7, cistern: 1.5, water_tower: 1.8, filtration_shed: 0.9, solar_array: 0.5, battery_shed: 0.8, generator_shed: 0.8,
  root_cellar: 0.4, watchtower_wood: 1.1, watchtower_octagon: 1.1, watchtower_concrete: 0.9, watchtower_hex: 1.1, watchtower_flood: 1.1, watchtower_mount: 1.2, watchtower_turret: 1.2,
};
export const seismicK = (kind: string): number => kind.startsWith('bunker_') ? 0.2 : SEISMIC_K[kind] ?? 1;

/** Site and fitted-retrofit inputs to a resistance. */
export interface ResistCtx {
  /** Fitted retrofits on this structure ('sill' bolts the frame to the footing, 'rafters' braces the roof, 'anchor' ties it down against water). */
  retrofits?: readonly string[];
  /** Rise over run under the footprint (Structure.grade). */
  grade?: number;
  /** On soft alluvial ground in the creek bottom (liquefaction). */
  soft?: boolean;
  /** Still going up: the frame or roof stage with the walls unbraced. */
  unfinished?: boolean;
  /** Tiers of blast hardening on a bunker. */
  blast?: number;
}

/** Resistance multiplier for the hazards that are not depth-driven: lower is better. */
export function resistance(h: 'quake' | 'blast' | 'wind', kind: string, c: ResistCtx = {}): number {
  const has = (r: string) => (c.retrofits ?? []).includes(r);
  let k = 1;
  if (h === 'quake') {
    k = seismicK(kind) * (has('sill') ? 0.4 : 1) * (c.soft ? 2 : 1) * (Math.abs(c.grade ?? 0) > 0.25 ? 1.5 : 1) * (c.unfinished ? 1.8 : 1);
  } else if (h === 'blast') {
    const sheltered = kind.startsWith('bunker_') || kind === 'root_cellar';
    const low = ['stone_house', 'adobe_house', 'container_house', 'workshop', 'metal_garage', 'log_house'].includes(kind);
    const tall = kind.startsWith('watchtower_') || kind === 'water_tower' || kind === 'wind_turbine';
    k = sheltered ? 0.2 : low ? 0.5 : tall ? 1.5 : 1;
    k *= (has('rafters') ? 0.6 : 1) * (1 - 0.1 * Math.min(3, c.blast ?? 0));
  } else {
    k = (has('rafters') ? 0.6 : 1) * (kind.startsWith('bunker_') || kind === 'root_cellar' ? 0.2 : kind === 'polytunnel' || kind === 'high_tunnel' ? 1.8 : 1) * (c.unfinished ? 1.5 : 1);
  }
  return k;
}

/** Chance of any damage from a shaking intensity (MMI, fractional): README "MMI VI 0.03, VII 0.10, VIII 0.30, IX 0.55". */
export function quakeBase(mmi: number): number {
  const pts: Array<[number, number]> = [[4, 0], [5, 0.008], [6, 0.03], [7, 0.1], [8, 0.3], [9, 0.55], [10, 0.8]];
  const m = clamp(mmi, 4, 10);
  for (let i = 1; i < pts.length; i++) if (m <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (m - x0) / (x1 - x0); }
  return 0.8;
}

/**
 * Roll a state from a base hazard and a resistance with one die `u` (0..1). A roll lands on state >= 1 with p = base x resistance (capped); the
 * rest of the die then splits roughly 55 / 35 / 10 across states 1 to 3 at base 0.3, shifting toward 3 as the chance rises.
 */
export function rollLevel(base: number, resist: number, u: number): DamageLevel {
  const p = clamp(base * resist, 0, 0.97);
  if (u >= p) return 0;
  const v = u / p;
  const s3 = clamp(0.1 + 0.5 * (p - 0.3), 0.03, 0.6), s2 = 0.35;
  return v < s3 ? 3 : v < s3 + s2 ? 2 : 1;
}

/** Expected share of the value lost at a base and resistance (for tests and previews): the mean of LOST_SHARE under the roll. */
export function expectedLoss(base: number, resist: number): number {
  const p = clamp(base * resist, 0, 0.97), s3 = clamp(0.1 + 0.5 * (p - 0.3), 0.03, 0.6), s2 = 0.35, s1 = 1 - s3 - s2;
  return p * (s3 * LOST_SHARE[3] + s2 * LOST_SHARE[2] + s1 * LOST_SHARE[1]);
}

/**
 * A flood's state from the depth of water above the floor (ft), how fast it moves, and what the building does about it. Depth above the floor
 * is net of a raised foundation; an anchored building does not float (and takes moving water a step milder).
 */
export type Flow = 'still' | 'moving' | 'torrent';
export function floodLevel(depthFt: number, flow: Flow, o: { anchored?: boolean; cellar?: boolean } = {}): DamageLevel {
  let d = depthFt;
  if (o.cellar && d > -2) d += 4;   // a cellar or bunker fills before the house does
  if (d <= 0) return 0;
  let lv: DamageLevel = d <= 1 ? 1 : d <= 4 ? 2 : 3;
  if (d > 4 && !o.anchored) lv = 3;
  if (d > 4 && o.anchored) lv = 2;
  if (flow === 'moving' && lv < 3 && d > 1) lv = (lv + (o.anchored ? 0 : 1)) as DamageLevel;
  if (flow === 'torrent') lv = o.anchored && d <= 4 ? 2 : 3;
  return clamp(lv, 0, 3) as DamageLevel;
}

/** Days before a hired crew can start after a regional event: `3 x (1 + 8 x affected share)` (README). */
export const repairLeadDays = (share: number): number => Math.round(3 * (1 + 8 * clamp01(share)) * 10) / 10;

/** Crew-market surge: x1.3 for the first 60 days after the hit, x1.5 while a premium is paid to jump the queue, x1 after. */
export function crewSurge(daysSinceHit: number, jumped: boolean): number {
  return jumped ? 1.5 : daysSinceHit >= 0 && daysSinceHit < 60 ? 1.3 : 1;
}

/**
 * What repairing `level` costs and how long it takes. `fullCost` is the building's materials at list; the crews' labor is on top at
 * the market. By hand: person-days; with a crew: the lead time first, then the work. Money buys speed (a premium skips the queue).
 */
export function repairQuote(level: DamageLevel, fullCost: number, o: { wealth: number; crews: number; share: number; jumped?: boolean; surge?: number }): { cost: number; days: number; lead: number; handDays: number } {
  if (level === 0) return { cost: 0, days: 0, lead: 0, handDays: 0 };
  const cost = Math.round(fullCost * LOST_SHARE[level]);
  const handDays = { 1: 2, 2: 28, 3: 90 }[level];
  const crewDays = Math.max(1, Math.ceil(handDays / (4 * 1.1)));
  const lead = o.jumped ? 0 : repairLeadDays(o.share);
  const hired = o.crews > 0;
  const days = hired ? Math.ceil(lead + crewDays / Math.max(1, o.crews)) : Math.ceil(handDays / (1 + clamp01(o.wealth)));
  return { cost: Math.round(cost * (hired ? (o.surge ?? 1) : 1)), days, lead, handDays };
}
