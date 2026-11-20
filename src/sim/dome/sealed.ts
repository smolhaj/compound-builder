/**
 * A dome that holds against everything a crew can bring: no ram, no satchel, nothing works the shell (the arcology; `SHELL_ODDS` and `AIRLOCK_DOOR` are 0).
 * A raid on it is shown as raiders stuck outside to no avail and the household watching, not as a firefight: nobody on the home side fires, is hit or takes
 * cover, there are no orders to give, and only the dome's own voices are used (sim/dome/domeBeats.ts). Pure.
 */
import type { GameState } from '../state';
import { isHome } from '../blueprints';
import { isFinished } from '../construction';
import { SHELL_ODDS, AIRLOCK_DOOR } from './siege';
import { domesOf } from './standing';
import type { DomeTier } from './tiers';

export const isSealedTier = (tier: DomeTier): boolean => SHELL_ODDS[tier].ram === 0 && SHELL_ODDS[tier].blast === 0 && (AIRLOCK_DOOR[tier]?.ram ?? 1) === 0 && (AIRLOCK_DOOR[tier]?.blast ?? 1) === 0;

/** Does the home stand under a dome that cannot be breached? */
export function homeUnderSealedDome(g: Pick<GameState, 'structures'> & Partial<Pick<GameState, 'raidDamage' | 'domeLinks'>>): boolean {
  const fin = g.structures.filter(isFinished), h = fin.find(st => isHome(st.kind)) ?? fin[0];
  if (!h) return false;
  const d = domesOf(g).find(dm => Math.hypot(h.x - dm.x, h.z - dm.z) < dm.r);
  return !!d && isSealedTier(d.tier);
}
