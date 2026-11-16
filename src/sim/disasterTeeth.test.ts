/**
 * The teeth test (docs/DISASTER_TEETH.md). Each kind is felt in up to nine columns: economy, supplies, encounters, NPCs, atmosphere,
 * infrastructure, buildings, medical, media. A column counts when the kind defines the hook mapped to it (disasterFx.HOOK_COLUMN) or lists
 * the column in `legacy` (behavior that predates the seam).
 *
 * WP0 records the baseline below and fails if any kind LOSES coverage. As each work package lands, raise BASELINE for its kinds; when all
 * packages are in (WP10), set ENFORCE_MIN to 4 and every kind must cover at least four columns, so none can regress to a re-skin.
 */
import { describe, it, expect } from 'vitest';
import { FX, FX_COLUMNS, columnsOf, type FxColumn } from './disasterFx';
import { type DisasterKind } from './disaster';

/** Kinds that must reach ENFORCE_MIN columns (0 until the packages land; WP10 sets 4). */
export const ENFORCE_MIN = 0;

/** Baseline coverage at WP0 (hook columns plus legacy notes), from the audit matrix. Raise, never lower. */
const BASELINE: Record<DisasterKind, FxColumn[]> = {
  grid_down: ['media'],
  nuclear: ['economy', 'supplies', 'npcs', 'atmosphere', 'infrastructure', 'medical', 'media'],
  lawless: ['economy', 'encounters', 'npcs', 'atmosphere', 'infrastructure', 'media'],
  financial: ['economy'],
  drought: ['supplies', 'encounters', 'npcs', 'infrastructure'],
  pandemic: ['economy', 'encounters', 'npcs', 'atmosphere', 'infrastructure', 'medical', 'media'],
  solar_flare: ['economy'],
  wildfire: ['npcs', 'atmosphere', 'buildings'],
  ash_winter: ['economy', 'supplies', 'npcs', 'atmosphere', 'buildings'],
  cyberattack: ['economy'],
  zombies: ['economy', 'encounters', 'npcs', 'atmosphere', 'medical', 'media'],
  bioweapon: ['economy', 'supplies', 'encounters', 'npcs', 'atmosphere', 'infrastructure', 'medical', 'media'],
  invasion: ['economy', 'encounters', 'npcs', 'atmosphere', 'infrastructure', 'media'],
  civil_war: ['economy', 'encounters', 'npcs', 'atmosphere', 'infrastructure', 'media'],
  asteroid: ['economy', 'supplies', 'atmosphere'],
  unknown: ['encounters', 'npcs'],
  emp: [], mega_quake: [], dam_flood: [], supervolcano: [],
  crop_blight: ['economy', 'supplies', 'encounters', 'npcs', 'atmosphere', 'media'],
  livestock_plague: ['economy', 'encounters', 'atmosphere', 'medical', 'media'],
};

describe('disaster teeth', () => {
  const kinds = Object.keys(FX) as DisasterKind[];

  it('records each kind\'s coverage and never loses any of the baseline', () => {
    for (const k of kinds) {
      const got = columnsOf(k);
      for (const c of BASELINE[k]) expect(got, `${k} lost ${c}`).toContain(c);
    }
  });

  it('the baseline table is exact today (so a new hook must be recorded here)', () => {
    for (const k of kinds) expect(columnsOf(k), k).toEqual(FX_COLUMNS.filter(c => BASELINE[k].includes(c)));
  });

  it('enforces the minimum once the packages have landed', () => {
    const thin = kinds.filter(k => columnsOf(k).length < ENFORCE_MIN);
    expect(thin, `kinds under ${ENFORCE_MIN} columns`).toEqual([]);
  });

  it('prints the matrix (kind x column) for the PR', () => {
    const rows = kinds.map(k => `${k.padEnd(13)} ${columnsOf(k).length} ${FX_COLUMNS.map(c => columnsOf(k).includes(c) ? c[0] : '.').join('')}`);
    expect(rows.length).toBe(kinds.length);
  });
});
