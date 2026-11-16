/** When a signature goal chain is on the card (no imports beyond types, so guidance.ts can ask without a module cycle). */
import type { GameState } from '../state';

/** Days after the hit the chain stays on the card (the first two weeks; the biology kinds, whose chains run for months, stay through the month phase). */
export const CHAIN_DAYS = 14;
export const FX_CHAIN_DAYS = 36;
/** The five kinds whose chain content lives in their `KindFx.goal` hook (WP4+7), routed through the felt chain. */
export const FX_CHAIN_KINDS: readonly string[] = ['pandemic', 'bioweapon', 'zombies', 'livestock_plague', 'crop_blight'];
export const isFxChain = (kind: string): boolean => FX_CHAIN_KINDS.includes(kind);

/** True from the first warning day to the end of the window; every kind has a chain. */
export function chainWindowOpen(s: Pick<GameState, 'disaster' | 'clock'>): boolean {
  const d = s.disaster, t = s.clock.t;
  return !!d.kind && t >= d.warnAt && t < d.hitAt + (isFxChain(d.kind) ? FX_CHAIN_DAYS : CHAIN_DAYS);
}
