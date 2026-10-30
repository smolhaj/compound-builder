/**
 * Wildlife on the way in (docs/DECISIONS.md, "Roads follow the land"): deer and elk cross a country road at dusk and dawn, and a vehicle
 * that meets one is hurt. Where the road crosses a draw it can cross *under* it, and that is the crossing: a culvert is a passage for the
 * small animals, an arch culvert for deer, a bridge, a ford or a low-water slab for everything, and a rock bore lets them go over the top.
 * Animals that have a way under the road are fewer on it, so a road with crossings is safer; each one is drawn with its warning signs
 * (game/region/roadWorks.ts). The chance is small, per trip, and read by the one place that rolls the road's trouble
 * (sim/vehicles.ts `roadTrouble`). Pure (tested). A place with no lot (no planned road) keeps the plain chance.
 */
import type { RegionId } from './regions';
import type { RoadPlan, RoadStructure, StructureKind } from './roadPlan';
import { SPECIES, WILD_BY_REGION } from './wildlife';

export const STRIKE = {
  /** The chance a trip meets a deer per km on a region with `DEER_REF` hoofed animals per 40 acres and no crossings. */
  PER_KM: 0.0006, DEER_REF: 8,
  /** How much of it a crossing takes away, by what fits under it; and the most all of them can. */
  RELIEF: { small: 0.03, deer: 0.14, all: 0.2 } as const, RELIEF_CAP: 0.55,
  /** The warning signs on the approaches (drawn at every crossing deer use). */
  SIGNS: 0.06,
  /** The most a trip can come to. */
  CAP: 0.2,
  /** The damage to the vehicle (condition 0-1). */
  DAMAGE: 0.06,
} as const;

export type Fits = 'small' | 'deer' | 'all';
export interface WildCrossing { kind: StructureKind; fits: Fits; x: number; z: number; s: number; rot: number }

const FITS: Partial<Record<StructureKind, Fits>> = { culvert: 'small', arch_culvert: 'deer', bridge1: 'all', bridge: 'all', ford: 'all', low_water: 'all', tunnel: 'all' };

/** Where animals can cross under (or over) the planned road. */
export function wildlifeCrossings(plan: Pick<RoadPlan, 'structures'>): WildCrossing[] {
  return plan.structures.flatMap((x: RoadStructure) => { const fits = FITS[x.kind]; return fits ? [{ kind: x.kind, fits, x: x.x, z: x.z, s: (x.s0 + x.s1) / 2, rot: x.rot }] : []; });
}
/** The crossings deer and elk use (the signs stand at these). */
export const deerCrossings = (plan: Pick<RoadPlan, 'structures'>): WildCrossing[] => wildlifeCrossings(plan).filter(c => c.fits !== 'small');

/** Hoofed animals per 40 acres the region holds when the habitat suits them (the road's exposure). */
export const hoofedPer40 = (region: RegionId): number => WILD_BY_REGION[region].reduce((a, id) => a + (SPECIES[id].kind === 'hoofed' ? SPECIES[id].per40 : 0), 0);

/** The share of the strike chance the crossings take away (0 to RELIEF_CAP). */
export function crossingRelief(plan: Pick<RoadPlan, 'structures'> | null): number {
  if (!plan) return 0;
  const cs = wildlifeCrossings(plan);
  let r = 0;
  for (const c of cs) r += STRIKE.RELIEF[c.fits];
  if (cs.some(c => c.fits !== 'small')) r += STRIKE.SIGNS;
  return Math.min(STRIKE.RELIEF_CAP, r);
}

/** The chance a run of `km` on this road meets a deer. */
export function strikeChance(region: RegionId, km: number, plan: Pick<RoadPlan, 'structures'> | null): number {
  const density = Math.min(1.6, hoofedPer40(region) / STRIKE.DEER_REF);
  return Math.min(STRIKE.CAP, STRIKE.PER_KM * Math.max(0, km) * density * (1 - crossingRelief(plan)));
}

/** Words for the Land card. */
export function crossingLine(plan: Pick<RoadPlan, 'structures'>): string | null {
  const cs = wildlifeCrossings(plan);
  if (!cs.length) return null;
  const n = (f: Fits) => cs.filter(c => c.fits === f).length;
  const bits: string[] = [];
  if (n('all')) bits.push(`${n('all')} for everything (under a bridge or over a ford)`);
  if (n('deer')) bits.push(`${n('deer')} arch culvert${n('deer') === 1 ? '' : 's'} for deer`);
  if (n('small')) bits.push(`${n('small')} pipe culvert${n('small') === 1 ? '' : 's'} for the small animals`);
  return `Wildlife crossings on the road: ${bits.join(', ')}. Signs stand at the ones deer use; ${Math.round(crossingRelief(plan) * 100)} % fewer animals on the road.`;
}
