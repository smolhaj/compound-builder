/**
 * The felt checklist scaffold (docs/FELT_LAYER.md section 8). FL0 records what each kind passes today and fails if a kind LOSES an item.
 * Enforcement is off: add a kind to FELT_ENFORCE when its content package lands and it must then pass every item (the way
 * disasterTeeth.ts raises ENFORCE_MIN). FL6 adds the played-state checks.
 */
import { describe, expect, it } from 'vitest';
import { FELT_KINDS } from './registry';
import { FELT_ITEMS, feltChecks, feltPassing, type FeltItem } from './checklist';
import type { FeltKind } from './types';

/** Kinds that must pass every item (empty until the content packages land; FL12 fills it). */
export const FELT_ENFORCE: FeltKind[] = [];

/** What each kind passes today (the teeth item mirrors disasterTeeth's columnsOf >= 4). Raise, never lower. */
const BASELINE: Partial<Record<FeltKind, FeltItem[]>> = { lawless: ['teeth'], drought: ['teeth'], pandemic: ['teeth'], nuclear: ['teeth'], ash_winter: ['teeth'], zombies: ['teeth'], invasion: ['teeth'], civil_war: ['teeth'], bioweapon: ['teeth'], crop_blight: ['teeth'], livestock_plague: ['teeth'] };

describe('felt checklist', () => {
  it('never loses an item the baseline records, and the baseline is exact today', () => {
    for (const k of FELT_KINDS) expect(feltPassing(k), k).toEqual(FELT_ITEMS.filter(i => i === 'radio' /* FL3: the generic radio set fills every kind (felt/radioLines.ts) */ || (BASELINE[k] ?? []).includes(i)));
  });
  it('enforces every item for the kinds in FELT_ENFORCE', () => {
    for (const k of FELT_ENFORCE) expect(FELT_ITEMS.filter(i => !feltChecks(k)[i]), k).toEqual([]);
  });
  it('prints the matrix (kind x item) for the PR', () => {
    const rows = FELT_KINDS.map(k => `${k.padEnd(17)} ${FELT_ITEMS.map(i => feltChecks(k)[i] ? i[0] : '.').join('')}`);
    expect(rows.length).toBe(FELT_KINDS.length);
  });
});
