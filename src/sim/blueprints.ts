/**
 * Blueprints: how each kit piece is built — its construction stages, the
 * labour each takes (person-hours at a competent builder's pace) and the
 * materials each consumes when work on it starts (GDS §2.2: people build it
 * over time; scaffold → frame → clad).
 */
import type { Stock } from './materials';

export type StageId = 'site' | 'foundation' | 'frame' | 'roof' | 'finish';

export interface StageDef {
  id: StageId;
  name: string;
  /** Person-hours at work rate 1. */
  hours: number;
  materials: Partial<Stock>;
}

export interface Blueprint {
  kind: string;
  stages: StageDef[];
}

/** 6 × 9 m timber cabin: ≈ 340 person-hours — two adults ≈ 3 weeks. */
export const CABIN_BLUEPRINT: Blueprint = {
  kind: 'timber_cabin',
  stages: [
    { id: 'site', name: 'Stake out & level the pad', hours: 24, materials: {} },
    { id: 'foundation', name: 'Fieldstone foundation', hours: 40, materials: { fieldstone: 6 } },
    { id: 'frame', name: 'Timber frame', hours: 120, materials: { lumber: 16 } },
    { id: 'roof', name: 'Roof', hours: 60, materials: { lumber: 4, roofing: 8 } },
    { id: 'finish', name: 'Siding, doors & windows', hours: 100, materials: { lumber: 4, hardware: 3 } },
  ],
};

export const BLUEPRINTS: Record<string, Blueprint> = { [CABIN_BLUEPRINT.kind]: CABIN_BLUEPRINT };

/** Total bill of materials for a blueprint. */
export function totalBill(bp: Blueprint): Partial<Stock> {
  const out: Partial<Stock> = {};
  for (const s of bp.stages) for (const [k, v] of Object.entries(s.materials) as Array<[keyof Stock, number]>) out[k] = (out[k] ?? 0) + v;
  return out;
}

export function totalHours(bp: Blueprint): number {
  return bp.stages.reduce((a, s) => a + s.hours, 0);
}
