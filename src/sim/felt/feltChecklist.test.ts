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
const BASELINE: Partial<Record<FeltKind, FeltItem[]>> = { grid_down: ['teeth', 'radio', 'cards', 'goals'], financial: ['teeth', 'radio', 'cards', 'goals'], lawless: ['teeth', 'radio'], drought: ['teeth', 'radio'], pandemic: ['teeth', 'radio'], nuclear: ['teeth', 'radio'], solar_flare: ['teeth', 'radio', 'cards', 'goals'], wildfire: ['radio'], ash_winter: ['teeth', 'radio'], cyberattack: ['teeth', 'radio', 'cards', 'goals'], zombies: ['teeth', 'radio'], invasion: ['teeth', 'radio'], civil_war: ['teeth', 'radio'], bioweapon: ['teeth', 'radio'], asteroid: ['teeth', 'radio'], unknown: ['radio'], emp: ['teeth', 'radio', 'cards', 'goals'], mega_quake: ['teeth', 'radio'], crop_blight: ['teeth', 'radio'], dam_flood: ['teeth', 'radio'], supervolcano: ['teeth', 'radio'], livestock_plague: ['teeth', 'radio'], satellite_loss: ['radio'], oil_shock: ['radio'], reactor_meltdown: ['radio'], global_famine: ['radio'], water_war: ['radio'], cult_takeover: ['radio'], mass_exodus: ['radio'] };

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
