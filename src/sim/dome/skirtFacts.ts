/**
 * What the skirt cutaway (ui/DomeSkirtCutaway.tsx) and its info card say about each tier, read off the pure dome model: the skirt's depth and thickness,
 * and the share of dig attempts it turns back against a plain crew and a crew that has learned the place. Pure (tested in ui/DomeSkirtCutaway.test.tsx).
 */
import { TIER, type DomeTier } from './tiers';
import { DIG_DEPTH_FT, SKIRT_MARGIN_FT } from './siting';
import { DIG_DEEPER, digStops } from './crossing';

/** Everything the page says about a tier, read off the model. */
export function skirtFacts(tier: DomeTier) {
  const t = TIER[tier];
  return {
    tier, name: t.name, depth: t.skirtFt, thick: t.skirtThickFt, airlocks: Math.max(1, t.airlocks), doorOnly: t.airlocks === 0,
    plain: digStops(t.skirtFt, 0), learned: digStops(t.skirtFt, 1), half: digStops(t.skirtFt, 0.5),
  };
}
export const SKIRT_NUMBERS = {
  digLo: DIG_DEPTH_FT[0], digHi: DIG_DEPTH_FT[1], deeper: DIG_DEEPER, margin: SKIRT_MARGIN_FT,
  learnedLo: DIG_DEPTH_FT[0] + DIG_DEEPER, learnedHi: DIG_DEPTH_FT[1] + DIG_DEEPER,
  coverPlain: DIG_DEPTH_FT[1] + SKIRT_MARGIN_FT, coverLearned: DIG_DEPTH_FT[1] + DIG_DEEPER + SKIRT_MARGIN_FT,
};
