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

export type SaveFileResult = { ok: true; state: GameState } | { ok: false; message: string };

/** Parse and migrate the text of a chosen file. Never throws: a bad file gives a one-line message. */
export function readSaveFile(text: string, bytes: number = text.length): SaveFileResult {
  if (bytes > MAX_SAVE_BYTES) return { ok: false, message: 'That file is too big to be a save.' };
  try {
    return { ok: true, state: importJson(text) };
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
