/**
 * The word for the light the raid cutscene is drawn in, read off the same day-phase weights the sky and the light rig use
 * (engine/world/sky/dayPhase.ts), so the overlay never says "Night" over a bright dawn. Pure.
 */
import { phaseWeights } from '../../engine/world/sky/dayPhase';

export type LightLabel = 'Night' | 'Dawn' | 'Day' | 'Dusk';

/** Dawn / Dusk while the golden (twilight) weight is a third or more, Night while the night weight is at least half, otherwise Day. */
export function lightLabel(hour: number): LightLabel {
  const h = ((hour % 24) + 24) % 24;
  const p = phaseWeights(h);
  if (p.golden >= 0.3) return h < 12 ? 'Dawn' : 'Dusk';
  if (p.night >= 0.5) return 'Night';
  return 'Day';
}
