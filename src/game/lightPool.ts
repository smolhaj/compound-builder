/**
 * Point-light budget (pure). three.js runs every point light in the scene through every lit fragment, however
 * far it is, so a compound with eighteen lamp-lit buildings pays for eighteen lights on every pixel of grass
 * and wall. Each building's room light reaches only a few world units, so only the lights that can matter
 * (near the camera, and bright) stay on, a fixed number per quality tier. The count stays constant while the
 * set of buildings is unchanged (a changing light count recompiles every lit material).
 */
export type LightTier = 'high' | 'medium' | 'low';

/** How many building lights may be on at once. */
export const LIGHT_BUDGET: Record<LightTier, number> = { high: 12, medium: 8, low: 4 };

/** A light that is already on keeps its slot unless a rival is this much better (no flicker as the camera moves). */
export const LIGHT_KEEP_BONUS = 1.35;

export interface LightCandidate {
  id: string;
  /** Current intensity (0 = dark). */
  intensity: number;
  /** Distance from the camera (world units). */
  dist: number;
  /** On in the last pick. */
  was: boolean;
  /** Extra weight (0..1 to demote lights that cannot be seen from here, e.g. a bunker seen from above ground). */
  weight?: number;
}

/** Importance of a light to the picture: bright and near wins. */
export function lightScore(c: LightCandidate): number {
  const d = c.dist / 10;
  return (c.intensity + 0.02) * (c.weight ?? 1) / (1 + d * d) * (c.was ? LIGHT_KEEP_BONUS : 1);
}

/** The ids of the lights to keep on: the `budget` best, or all of them when there are no more than that. */
export function pickLights(cands: readonly LightCandidate[], budget: number): Set<string> {
  if (cands.length <= budget) return new Set(cands.map(c => c.id));
  return new Set(cands.map(c => ({ id: c.id, s: lightScore(c) })).sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1)).slice(0, Math.max(0, budget)).map(x => x.id));
}
