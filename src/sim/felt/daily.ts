/**
 * The felt layer's daily dispatcher: one call from effectsDay, after fxDaily (docs/FELT_LAYER.md section 4.1). It does nothing for a kind whose
 * spec is still a stub, and it never makes `fx.felt` itself (the steps do, on first use), so a stub run leaves the save untouched.
 * The steps live in their own files so each package edits only its own: marks (FL2), feed + radio (FL3), cards (FL4), goals (FL5).
 */
import type { GameState } from '../state';
import type { FxCtx } from '../disasterFx';
import { feltSpec } from './registry';
import { feltCards } from './cards';
import { feltFeed } from './feed';
import { feltGoals } from './goals';
import { feltRadio } from './feltRadio';

export function feltDaily(s: GameState, ctx: FxCtx): string[] {
  if (s.clock.t < s.disaster.hitAt) return [];
  const spec = feltSpec(s.disaster.kind);
  if (!spec) return [];
  return [...feltFeed(s, ctx, spec), ...feltRadio(s, ctx, spec), ...feltCards(s, ctx, spec), ...feltGoals(s, ctx, spec)];
}
