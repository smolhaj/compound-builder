/**
 * The felt layer's saved state: `disaster.fx.felt` (docs/FELT_LAYER.md section 4.2). Optional and JSON-safe, in the same bag the kind hooks use
 * (save v98), so there is no save bump: an old save with no `fx.felt` loads as is and the helpers below make it on first use.
 */
import type { GameState } from '../state';
import type { FeltPhase, FeltSnap } from './types';

export interface FeltState {
  /** Yesterday's look at the numbers, for the feed's diff. */
  snap?: FeltSnap;
  cards: {
    /** Card id -> the option taken. */
    done: Record<string, string>;
    /** The card on screen now (the clock is held while it is up). */
    pending?: { id: string; since: number };
    /** How many cards each phase has shown (the per-phase budget). */
    perPhase: Partial<Record<FeltPhase, number>>;
    /** Game day the last card came up. */
    last: number;
  };
  goals: { done: string[]; chain: string };
  marks?: { sig: string };
}

export const emptyFelt = (): FeltState => ({ cards: { done: {}, perPhase: {}, last: -1 }, goals: { done: [], chain: '' } });

/** The felt state if there is any (never creates it). */
export const feltOf = (s: Pick<GameState, 'disaster'>): FeltState | undefined => s.disaster?.fx?.felt as FeltState | undefined;

/** The felt state, made on first use (mutates `s`; only call from a sim step that owns the draft). */
export function ensureFelt(s: Pick<GameState, 'disaster'>): FeltState {
  const d = s.disaster;
  d.fx ??= {};
  return (d.fx.felt ??= emptyFelt()) as FeltState;
}

/** A felt decision card is waiting for an answer: `decisionOpen` holds the clock while this is true. */
export const feltCardPending = (s: Pick<GameState, 'disaster'>): boolean => !!feltOf(s)?.cards?.pending;

/** Which phase of the disaster a game day (a clock `t`) falls in. */
export function feltPhase(s: Pick<GameState, 'disaster' | 'clock'>): FeltPhase | null {
  const d = s.disaster;
  if (!d.kind || s.clock.t < d.warnAt) return null;
  if (s.clock.t < d.hitAt) return 'warning';
  const day = s.clock.t - d.hitAt;
  return day < 8 ? 'hit' : day < 36 ? 'month' : day < 121 ? 'season' : 'year';
}

/** Whole days since the hit (negative while the warning runs). */
export const feltDay = (s: Pick<GameState, 'disaster' | 'clock'>): number => Math.floor(s.clock.t - s.disaster.hitAt);

/**
 * The hit moment is up: the day card for this hit is waiting, it has not been played yet, the player has not turned it off, and the kind has
 * a hit sequence. A kind with no `hit` (every stub today) never shows one, so the day card is unchanged.
 */
export function hitMomentUp(dayCard: number | null, shownFor: number, skip: boolean, hasHit: boolean): boolean {
  return dayCard !== null && hasHit && !skip && shownFor !== dayCard;
}

