import type { GameState } from '../state';
import type { FxCtx } from '../disasterFx';
import type { FeltSpec } from './types';

/** FL5 owns this file (docs/FELT_LAYER.md section 10). A stub today: the daily dispatcher (daily.ts) already calls it, so FL5 edits only this file. Returns log lines. */
export function feltGoals(_s: GameState, _ctx: FxCtx, _spec: FeltSpec): string[] {
  return [];
}
