/**
 * Save migrations. Every change to GameState's fields bumps SAVE_VERSION and
 * adds a step here that upgrades the previous version's JSON (CLAUDE.md
 * rule 5). Pure — tested in migrations.test.ts.
 */
import { SAVE_VERSION, type GameState } from '../state';
import { emptyUtilities } from '../utilities';

type Raw = Record<string, unknown> & { version?: number };

/** version n → n + 1 upgraders. */
const STEPS: Record<number, (s: Raw) => Raw> = {
  // 1 → 2: felling jobs, firewood stock and the stove's burn (M2 step 5)
  1: s => ({
    ...s, version: 2,
    stock: { firewood: 0, ...(s.stock as object) },
    forestry: { jobs: [], cleared: [] },
    heat: { burned: 0, warned: -1 },
  }),
  // 2 → 3: concrete joins the stockpile (workshop slab, cellar, log house footings)
  2: s => ({ ...s, version: 3, stock: { concrete: 0, ...(s.stock as object) } }),
  // 3 → 4: the perimeter (fences, hedges, walls) and its materials
  3: s => ({ ...s, version: 4, perimeter: [], stock: { wire: 0, seedlings: 0, container: 0, ...(s.stock as object) } }),
  // 4 → 5: water and power (utilities state, their materials)
  4: s => ({ ...s, version: 5, utilities: emptyUtilities(), stock: { pipe: 0, cable: 0, fixtures: 0, pump: 0, drilling: 0, solar_panel: 0, battery: 0, inverter: 0, generator: 0, fuel: 0, tank: 0, septic_tank: 0, ...(s.stock as object) } }),
};

export class SaveVersionError extends Error {}

/** Upgrade a parsed save to the current version (throws on unknown / newer saves). */
export function migrate(raw: unknown): GameState {
  if (!raw || typeof raw !== 'object') throw new SaveVersionError('Not a save file');
  let s = raw as Raw;
  const v = s.version;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new SaveVersionError('Save has no version');
  if (v > SAVE_VERSION) throw new SaveVersionError(`Save is from a newer version (${v} > ${SAVE_VERSION})`);
  while ((s.version as number) < SAVE_VERSION) {
    const up = STEPS[s.version as number];
    if (!up) throw new SaveVersionError(`No migration from version ${s.version}`);
    s = up(s);
  }
  for (const k of ['seed', 'clock', 'money', 'stock', 'orders', 'people', 'personState', 'structures', 'forestry', 'heat', 'perimeter', 'utilities', 'log', 'nextId'] as const) {
    if (!(k in s)) throw new SaveVersionError(`Save is missing "${k}"`);
  }
  return s as unknown as GameState;
}

/** JSON export (pretty, with a header the importer checks). */
export function exportJson(s: GameState): string {
  return JSON.stringify({ game: 'compound-builder', ...s }, null, 1);
}

export function importJson(text: string): GameState {
  const raw = JSON.parse(text) as Raw;
  if (raw.game !== 'compound-builder') throw new SaveVersionError('Not a Compound Builder save');
  delete raw.game;
  return migrate(raw);
}
