import type { GameState } from '../../sim/state';
import { isHome } from '../../sim/blueprints';
import { defenseReport } from '../../sim/defenseReport';
import type { Tone } from './style';

/** The Defense tab's dot: red if a home is exposed after the hit, amber if the line is open before it. */
export function defenseTabAlert(game: GameState): Tone | undefined {
  if (!game.structures.some(st => st.finishedAt !== null && isHome(st.kind))) return undefined;
  const hit = !!game.disaster.kind && game.clock.t >= game.disaster.hitAt;
  if (!hit && game.disaster.phase !== 'warning') return undefined;   // the report is only worked out when it matters
  const d = defenseReport(game);
  if (hit && d.homes.some(h => !h.covered)) return 'bad';
  return d.score < 25 ? 'warn' : undefined;
}

