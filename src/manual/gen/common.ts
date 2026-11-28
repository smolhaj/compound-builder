import { newGame, type GameState } from '../../sim/state';

export const usd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;
export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
export const words = (id: string): string => id.replace(/_/g, ' ');

let base: GameState | null = null;
/** One baseline run (fixed seed, Standard) for numbers the game derives from a state: prices and bills at the start of a game. Never mutated. */
export function baseline(): GameState {
  if (!base) base = newGame(1);
  return base;
}
