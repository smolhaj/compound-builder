/** Throttle for repeating warning lines (pure; the state is `s.nagged`, made lazily, so no save bump). */
import type { GameState } from './state';

/**
 * Let a repeating warning through at most once every `days` days per subject (`key`: "vet:<dog id>", "behind:animals").
 * True when the line may be logged now. Stale keys are dropped as it goes.
 */
export function logGate(s: GameState, key: string, days: number): boolean {
  const nag = (s.nagged ??= {});
  const last = nag[key];
  if (last !== undefined && s.clock.t - last < days && s.clock.t >= last) return false;
  nag[key] = s.clock.t;
  const keys = Object.keys(nag);
  if (keys.length > 200) for (const k of keys) if (s.clock.t - nag[k] > 60) delete nag[k];
  return true;
}
