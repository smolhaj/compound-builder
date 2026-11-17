/**
 * What each dome keeps out (docs/DOME_COMPOUND.md 5.1 and owner decision 4). A dome is a weather, climate and air layer over the family's bunker:
 * it never changes the bunker's own protection factor, it adds a clean zone, a second line and comfort. Pure (tested).
 *
 * Monotone where it matters: the three built tiers (geodesic, glass, arcology) only get stronger up the ladder (property tests). The earthen dome is
 * thick earth on a small span, so it stops bullets better than a film dome but cannot hold a yard.
 */
import type { DomeTier } from './tiers';

export type DomeHazard = 'wind' | 'hail' | 'snow' | 'ash' | 'fire' | 'fallout_pf' | 'emp' | 'blast';

/** What the shell is rated to take. wind: mph; hail: stone diameter, in; snow and ash: lb per sq ft; fire: 0..1 embers shed; pf: fallout protection factor of the shell alone; emp: 0..1 attenuation; blast: psi. */
export const SHELL: Record<DomeTier, Record<DomeHazard, number>> = {
  earthen:  { wind: 200, hail: 99, snow: 90, ash: 90, fire: 1, fallout_pf: 10, emp: 0.4, blast: 20 },
  geodesic: { wind: 110, hail: 1.5, snow: 40, ash: 25, fire: 0.5, fallout_pf: 1.3, emp: 0.05, blast: 0.5 },
  glass:    { wind: 150, hail: 2.5, snow: 60, ash: 45, fire: 0.7, fallout_pf: 1.5, emp: 0.1, blast: 2 },
  arcology: { wind: 300, hail: 8, snow: 250, ash: 200, fire: 1, fallout_pf: 4, emp: 0.9, blast: 25 },
};
export const domeShield = (tier: DomeTier, h: DomeHazard): number => SHELL[tier][h];

/** What was thrown at the shell. */
export type Weapon = 'handgun' | 'rifle' | 'heavy_rifle' | 'rocket' | 'guided_missile' | 'breaching_charge';
export const WEAPONS: readonly Weapon[] = ['handgun', 'rifle', 'heavy_rifle', 'rocket', 'guided_missile', 'breaching_charge'];

/** The share of such hits the shell turns, with no damage that matters. The arcology panels are effectively impervious (owner decision 4). */
export const STOPS: Record<DomeTier, Record<Weapon, number>> = {
  earthen:  { handgun: 0.98, rifle: 0.9, heavy_rifle: 0.7, rocket: 0.3, guided_missile: 0.1, breaching_charge: 0.4 },
  geodesic: { handgun: 0.3, rifle: 0.05, heavy_rifle: 0, rocket: 0, guided_missile: 0, breaching_charge: 0 },
  glass:    { handgun: 0.85, rifle: 0.35, heavy_rifle: 0.1, rocket: 0, guided_missile: 0, breaching_charge: 0.05 },
  arcology: { handgun: 1, rifle: 1, heavy_rifle: 1, rocket: 0.97, guided_missile: 0.9, breaching_charge: 0.95 },
};
export const stopShare = (tier: DomeTier, w: Weapon): number => STOPS[tier][w];
/** Firearms and missiles cannot hurt the shell. */
export const impervious = (tier: DomeTier): boolean => (['handgun', 'rifle', 'heavy_rifle', 'rocket', 'guided_missile'] as Weapon[]).every(w => STOPS[tier][w] >= 0.9);

export interface Outside { windMph?: number; hailIn?: number; snowPsf?: number; ashPsf?: number; embers?: boolean }

/** Which loads outside are past what the shell is rated for (a breach: panels fail first, then the frame). Empty = the shell holds. */
export function breaches(tier: DomeTier, o: Outside, health = 1): DomeHazard[] {
  const f = Math.max(0.2, Math.min(1, health)), out: DomeHazard[] = [];
  if ((o.windMph ?? 0) > SHELL[tier].wind * f) out.push('wind');
  if ((o.hailIn ?? 0) > SHELL[tier].hail * f) out.push('hail');
  if ((o.snowPsf ?? 0) > SHELL[tier].snow * f) out.push('snow');
  if ((o.ashPsf ?? 0) > SHELL[tier].ash * f) out.push('ash');
  if (o.embers && SHELL[tier].fire < 0.6) out.push('fire');
  return out;
}

/**
 * Fallout dose reduction for people inside. The shell alone gives its small factor; the dome never lowers a bunker's, so with a bunker the family
 * takes the larger of the two. What the dome really sells is the clean zone: the floor, soil, garden and cistern under it never get dust.
 */
export function falloutPf(tier: DomeTier, bunkerPf = 1): number { return Math.max(SHELL[tier].fallout_pf, bunkerPf); }

/** The ground under the shell stays clean of fallout while the shell is whole and the vestibule is filtered (the air plant is built). */
export function cleanZone(o: { shellHealth: number; airPlant: boolean; airlockSealed: boolean }): boolean { return o.shellHealth >= 0.5 && o.airPlant && o.airlockSealed; }

/** Seismic multiplier for structureDamage (lower is better; 1 is a wood frame on a fieldstone footing). */
export const SEISMIC: Record<DomeTier, number> = { earthen: 0.3, geodesic: 0.9, glass: 1.1, arcology: 0.6 };
