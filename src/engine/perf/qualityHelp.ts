/**
 * What each graphics quality tier does, in words (pure). The View box's tooltip and the player manual read this one table, so they
 * cannot disagree. The numbers behind the tiers live in `scripts/perfBudget.json`.
 */
import type { Tier } from './qualityAuto';

export const QUALITY_TIERS: ReadonlyArray<{ id: Tier; name: string; what: string }> = [
  { id: 'low', name: 'Low', what: 'No shadows or post-processing. The cheapest look, for weak or software-rendered graphics.' },
  { id: 'medium', name: 'Medium', what: 'Soft shadows. The game starts here on most devices.' },
  { id: 'high', name: 'High', what: 'Adds ambient occlusion and a sharper pixel ratio. You turn it on yourself; the game never starts on it alone.' },
];

/** The View box's tooltip for the quality menu. */
export const QUALITY_TITLE = `Graphics quality (${QUALITY_TIERS.map(t => `${t.name}: ${t.what.split('. ')[0].replace(/\.$/, '').toLowerCase()}`).join('; ')})`;
