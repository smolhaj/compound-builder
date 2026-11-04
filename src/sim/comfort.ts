/**
 * Comfort and beauty (GDS §2.4: "gardens, views, porches, a fire pit, a kids'
 * play area and good light all raise morale ... it's mechanical too"). A
 * lived-in, green place lifts everyone a little each day, as one of the
 * "helps" in sim/mind.ts. What counts today: grown things (garden, orchard,
 * greenhouse), a pond, and somewhere for the kids with a home to play at. The
 * porch, fire pit and view are drawn but not yet counted (docs/GDS_AUDIT.md,
 * Q7). Capped at COMFORT_MAX strain points. Pure (tested).
 */
import { isFinished } from './construction';
import { isHome } from './blueprints';
import type { GameState } from './state';

export const COMFORT_MAX = 4;
const GREEN = ['garden', 'orchard', 'greenhouse'];

export interface ComfortFacts { green: number; pond: boolean; home: boolean; kid: boolean }

/** Strain points of relief for one person. */
export function comfortOf(f: ComfortFacts): number {
  if (!f.home) return 0;   // no roof, no place to enjoy it
  const green = Math.min(2.5, 1.25 * f.green);
  return Math.min(COMFORT_MAX, green + (f.pond ? 1 : 0) + (f.kid ? 1 : 0) * (green > 0 ? 1 : 0.5));
}

export function comfortFacts(s: GameState, kid: boolean): ComfortFacts {
  const fin = s.structures.filter(isFinished);
  return { green: new Set(fin.filter(x => GREEN.includes(x.kind)).map(x => x.kind)).size, pond: fin.some(x => x.kind === 'pond'), home: fin.some(x => isHome(x.kind)), kid };
}
export const comfortPoints = (s: GameState, kid: boolean): number => comfortOf(comfortFacts(s, kid));
