/**
 * The new-game screen's mode, difficulty and peace-length choices as plain data (shared by the setup screen and the player manual,
 * so the two cannot say different things). Pure.
 */
import type { Difficulty, Mode, PeaceLength } from './disaster';

export const MODES: Array<[Mode, string, string]> = [
  ['surprise', 'Surprise', '3 to 6 years of peace; you don\'t know what is coming. Watch the news, the prices, the neighbors.'],
  ['scenario', 'Scenario', 'You pick the disaster and the time to prepare.'],
  ['sandbox', 'Free build', 'Nothing happens until you say so. Trigger any disaster from the side panel.'],
  ['god', 'God Mode', 'Free build with unlimited money. Marked as a sandbox run: the report card is not graded.'],
];
export const DIFFS: Array<[Difficulty, string, string]> = [['cozy', 'Cozy', 'Long warning, gentle raids, nobody dies for good'], ['standard', 'Standard', 'The intended game'], ['hardcore', 'Hardcore', 'Little warning, bigger raids, permadeath, slow recovery']];
/** What the one-line summary leaves out. */
export const DIFF_MORE: Partial<Record<Difficulty, string>> = { hardcore: 'Raiders adapt: after the first year, crews bring more people and better weapons against a well-defended place, and the first winter is hard.' };
export const PEACE: Array<[Exclude<PeaceLength, 'random'>, string]> = [['short', '18 months'], ['medium', '3 years'], ['long', '5 years']];
