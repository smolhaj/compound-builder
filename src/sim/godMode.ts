/**
 * God Mode (GDS front matter: "choose and trigger events, unlimited money,
 * sandbox; flagged as sandbox"). It is Free build plus a bottomless checking
 * account, and the run is marked so the report card does not grade it.
 * Pure (tested).
 */
import type { GameState } from './state';

export const GOD_FUNDS = 50_000_000;

/** Modes where nothing happens until the player says so (Free build and God Mode). */
export const unscripted = (mode: string): boolean => mode === 'sandbox' || mode === 'god';
export const isGod = (s: Pick<GameState, 'disaster'>): boolean => s.disaster.mode === 'god';

/** Keep checking topped up. Returns true when it changed. */
export function topUp(s: GameState): boolean {
  if (!isGod(s) || s.money >= GOD_FUNDS) return false;
  s.money = GOD_FUNDS;
  return true;
}
