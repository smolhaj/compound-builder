/**
 * The felt checklist scaffold (docs/FELT_LAYER.md section 8). FL0 records what each kind passes today and fails if a kind LOSES an item.
 * Enforcement is off: add a kind to FELT_ENFORCE when its content package lands and it must then pass every item (the way
 * disasterTeeth.ts raises ENFORCE_MIN). FL6 adds the played-state checks.
 */
import { describe, expect, it } from 'vitest';
import { FELT_KINDS } from './registry';
import { FELT_ITEMS, PLAYED_ITEMS, feltChecks, feltPassing, matrixText, playedPassing, titleCounts, type FeltItem, type PlayedItem } from './checklist';
import { playKind } from './played';
import type { FeltKind } from './types';

/** Kinds that must pass every item (empty until the content packages land; FL12 fills it). */
export const FELT_ENFORCE: FeltKind[] = [];

/** What each kind passes today (the teeth item mirrors disasterTeeth's columnsOf >= 4). Raise, never lower. */
const BASELINE: Partial<Record<FeltKind, FeltItem[]>> = { grid_down: ['teeth', 'radio', 'cards', 'goals'], financial: ['teeth', 'radio', 'cards', 'goals'], lawless: ['teeth', 'radio', 'cards'], drought: ['teeth', 'radio', 'cards'], pandemic: ['teeth', 'radio', 'cards'], nuclear: ['teeth', 'radio', 'cards'], solar_flare: ['teeth', 'radio', 'cards', 'goals'], wildfire: ['radio', 'cards'], ash_winter: ['teeth', 'radio', 'cards'], cyberattack: ['teeth', 'radio', 'cards', 'goals'], zombies: ['teeth', 'radio', 'cards'], invasion: ['teeth', 'radio', 'cards'], civil_war: ['teeth', 'radio', 'cards'], bioweapon: ['teeth', 'radio', 'cards'], asteroid: ['teeth', 'radio', 'cards'], unknown: ['radio', 'cards'], emp: ['teeth', 'radio', 'cards', 'goals'], mega_quake: ['teeth', 'radio', 'cards'], crop_blight: ['teeth', 'radio', 'cards'], dam_flood: ['teeth', 'radio', 'cards'], supervolcano: ['teeth', 'radio', 'cards'], livestock_plague: ['teeth', 'radio', 'cards'], satellite_loss: ['radio', 'cards'], oil_shock: ['radio', 'cards'], reactor_meltdown: ['radio', 'cards'], global_famine: ['radio', 'cards'], water_war: ['radio', 'cards'], cult_takeover: ['radio', 'cards'], mass_exodus: ['radio', 'cards'], runaway_heat: ['radio', 'cards'], ice_age: ['radio', 'cards'] };

describe('felt checklist', () => {
  it('never loses an item the baseline records, and the baseline is exact today', () => {
    for (const k of FELT_KINDS) expect(feltPassing(k), k).toEqual(FELT_ITEMS.filter(i => i === 'radio' /* FL3: the generic radio set fills every kind (felt/radioLines.ts) */ || i === 'teeth' /* WP10: every kind covers four columns (disasterTeeth ENFORCE_MIN) */ || (BASELINE[k] ?? []).includes(i)));
  });
  it('enforces every item for the kinds in FELT_ENFORCE', () => {
    for (const k of FELT_ENFORCE) expect(FELT_ITEMS.filter(i => !feltChecks(k)[i]), k).toEqual([]);
  });
  it('prints the matrix (kind x item) for the PR', () => {
    const rows = FELT_KINDS.map(k => `${k.padEnd(17)} ${FELT_ITEMS.map(i => feltChecks(k)[i] ? i[0] : '.').join('')}`);
    expect(rows.length).toBe(FELT_KINDS.length);
  });
  // FL6: the played-state items (30 days of the real sim). Raise, never lower, like BASELINE; FELT_ENFORCE is not touched.
  describe('played state', () => {
    const logs = FELT_KINDS.map(k => playKind(k, 30));
    const titles = titleCounts(logs);
    it('records what each kind passes in play, and the baseline is exact', () => {
      for (const p of logs) expect(playedPassing(p, titles), p.kind).toEqual(PLAYED_ITEMS.filter(i => !(PLAYED_FAILS[p.kind] ?? []).includes(i) && !UNTRIGGERABLE.includes(p.kind)));
    });
    it('every kind with a definition can be triggered; none are left waiting for WP10', () => {
      for (const p of logs) expect(p.triggerable, p.kind).toBe(!UNTRIGGERABLE.includes(p.kind));
    });
    it('prints the matrix (kind x item) for the PR', () => {
      const text = matrixText(logs);
      expect(text.split('\n').length).toBe(FELT_KINDS.length + 2);
      if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FELT_MATRIX) console.log(text);
    });
  });
});

/** Kinds with a felt spec but no DisasterDef (none since WP10); they cannot be played, so they fail every played item. */
const UNTRIGGERABLE: FeltKind[] = [];
/** The played items a kind still fails today (none for the radio: every kind hears 5 or more distinct lines in 30 days). */
const PLAYED_FAILS: Partial<Record<FeltKind, PlayedItem[]>> = {};
