/** Pure helpers for the Save / Load control: the export file name and a friendly check of a chosen file. */
import type { GameState } from '../state';
import { importJson, SaveVersionError } from './migrations';

/** Biggest save file we will even try to parse. */
export const MAX_SAVE_BYTES = 50 * 1024 * 1024;

/** e.g. "compound-builder-miller-2026-11-04.json" */
export function saveFileName(s: Pick<GameState, 'lineage'>, date: Date = new Date()): string {
  const fam = String(s.lineage?.family ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'save';
  return `compound-builder-${fam}-${date.toISOString().slice(0, 10)}.json`;
}

export type SaveFileResult = { ok: true; state: GameState; warnings: string[] } | { ok: false; message: string };

/** Sane bounds for an imported save: far wider than any real game reaches, tight enough that nothing downstream overflows. */
export const MONEY_MIN = -100_000_000, MONEY_MAX = 1_000_000_000, STOCK_MAX = 10_000_000, PEOPLE_MAX = 200, STRUCTURES_MAX = 5_000, LOG_MAX = 500;

/** Clamp absurd values in a loaded save (mutates `s`), returning one friendly line per kind of repair. Legit saves pass untouched. */
export function sanitizeState(s: GameState): string[] {
  const out: string[] = [];
  const fix = (what: string) => { if (!out.includes(what)) out.push(what); };
  if (typeof s.money !== 'number' || !Number.isFinite(s.money)) { s.money = 0; fix('the cash on hand was not a number: set to $0'); }
  else if (s.money < MONEY_MIN || s.money > MONEY_MAX) { s.money = Math.min(MONEY_MAX, Math.max(MONEY_MIN, s.money)); fix('the cash on hand was absurd: brought back into range'); }
  if (s.stock && typeof s.stock === 'object') {
    for (const k of Object.keys(s.stock) as Array<keyof typeof s.stock>) {
      const v = s.stock[k] as unknown;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > STOCK_MAX) { (s.stock as Record<string, number>)[k as string] = typeof v === 'number' && Number.isFinite(v) ? Math.min(STOCK_MAX, Math.max(0, v)) : 0; fix('some stores held impossible amounts: brought back into range'); }
    }
  }
  if (!Number.isFinite(s.clock?.t) || s.clock.t < 0) { s.clock = { ...s.clock, t: 0 }; fix('the calendar was broken: reset to day 0'); }
  if (Array.isArray(s.people) && s.people.length > PEOPLE_MAX) {
    s.people.length = PEOPLE_MAX;
    if (Array.isArray(s.personState)) s.personState.length = Math.min(s.personState.length, PEOPLE_MAX);
    fix(`the household was absurdly large: kept the first ${PEOPLE_MAX}`);
  }
  if (Array.isArray(s.structures) && s.structures.length > STRUCTURES_MAX) { s.structures.length = STRUCTURES_MAX; fix(`there were far too many buildings: kept the first ${STRUCTURES_MAX.toLocaleString('en-US')}`); }
  if (Array.isArray(s.log) && s.log.length > LOG_MAX) { s.log = s.log.slice(-LOG_MAX); fix('the log was trimmed'); }
  return out;
}

/** Parse and migrate the text of a chosen file. Never throws: a bad file gives a one-line message. */
export function readSaveFile(text: string, bytes: number = text.length): SaveFileResult {
  if (bytes > MAX_SAVE_BYTES) return { ok: false, message: 'That file is too big to be a save.' };
  try {
    const state = importJson(text);
    const fixed = sanitizeState(state);
    return { ok: true, state, warnings: fixed.length ? [`This save had problems, so some values were corrected: ${fixed.join('; ')}.`] : [] };
  } catch (e) {
    if (e instanceof SaveVersionError) {
      if (/newer version/.test(e.message)) return { ok: false, message: 'That save is from a newer version of the game.' };
      if (/Not a Compound Builder/.test(e.message)) return { ok: false, message: 'That is not a Compound Builder save.' };
      return { ok: false, message: 'That save file is damaged or incomplete.' };
    }
    if (e instanceof SyntaxError) return { ok: false, message: 'That is not a save file (not valid JSON).' };
    return { ok: false, message: 'That save could not be read.' };
  }
}
