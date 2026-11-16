import type { GameState } from '../state';
import type { FeltSpec, WorldMark } from './types';

/** FL2 owns this file: the marks for the active kind today (a pure function of the state and the day since the hit). Capped by tier there. */
export function feltMarks(s: GameState, day: number, spec: FeltSpec): WorldMark[] {
  return spec.marks?.(s, day) ?? [];
}
