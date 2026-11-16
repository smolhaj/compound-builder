/**
 * Structure damage for disasters (WP0 stub; WP6 owns the real numbers). Pure: no GameState writes.
 *
 * Owner principle: a disaster damages buildings in proportion to how they were built, and money buys the difference. Damage is scaled by
 * build quality (material, footings, roof, hardening, slope) and by the owner's wealth (a rich owner has built better and repairs faster:
 * crews and materials are bought, not waited for). Poor owners get the same hazard and a worse outcome.
 *
 * API for kind modules (sim/disasters/<kind>.ts structureDamage hook):
 *   buildProfile(structure, wealth)   -> BuildProfile   (what the building is made of and how well)
 *   buildQuality(profile)             -> 0..1           (1 = engineered, 0 = no footings, bare frame)
 *   damageFraction(hazard, q, power)  -> 0..1           (share of the building lost; 1 = total)
 *   damageState(fraction)             -> 'none' | 'cosmetic' | 'major' | 'destroyed'
 *   repairPlan(fraction, cost, wealth, crews) -> { cost, days }   (money and crews shorten the wait)
 */
import type { Structure } from './state';

export type Hazard = 'quake' | 'flood' | 'blast' | 'ash_load' | 'wind' | 'fire' | 'emp';
export type DamageState = 'none' | 'cosmetic' | 'major' | 'destroyed';

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

/** How strongly each hazard bites each material (before quality); WP6 tunes. */
const MATERIAL_EXPOSURE: Record<Hazard, [number, number, number, number]> = {
  quake: [0.35, 0.8, 0.45, 0.2], flood: [0.6, 0.45, 0.3, 0.25], blast: [0.9, 0.8, 0.5, 0.3], ash_load: [0.7, 0.5, 0.3, 0.2],
  wind: [0.7, 0.4, 0.25, 0.15], fire: [0.9, 0.35, 0.2, 0.1], emp: [0, 0, 0, 0],
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Placeholder reading of a structure: WP6 reads real material / foundation / roof stages. Hardening tiers and a lost roof are real today. */
export function buildProfile(st: Structure, wealth: number): BuildProfile {
  const tiers = Object.values(st.hardening ?? {}).reduce((a, t) => a + (t as number), 0);
  return { material: 0, footings: st.stage > 1 ? 0.5 : 0, roof: st.roofLost ? 0 : 0.5, hardening: clamp01(tiers / 6), slope: 0, wealth: clamp01(wealth) };
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

/**
 * What a repair costs and how long it takes. `cost` is the full price of the work; money and crews buy time back: a rich owner with a
 * hired crew finishes in days, a poor one with one pair of hands in weeks.
 */
export function repairPlan(fraction: number, fullCost: number, wealth: number, crews: number): { cost: number; days: number } {
  const cost = Math.round(fullCost * fraction);
  const handDays = Math.max(0, fraction) * 30;
  const speed = 1 + 2 * clamp01(wealth) + 1.5 * Math.max(0, crews);
  return { cost, days: fraction <= 0 ? 0 : Math.max(1, Math.ceil(handDays / speed)) };
}
