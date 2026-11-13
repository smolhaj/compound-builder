/**
 * Fire risk (GDS §2.4 "Fire: spacing, firebreaks, roofing material, water
 * access"; §6 fire overlay). The chance a building burns when a fire front
 * passes is the one formula the wildfire effect already used (sim/effects.ts),
 * moved here so the Fire overlay shows the same number before the fire.
 * Fuel is the count of trees within ~24 m (the world measures it). Pure (tested).
 */
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { emberFactor } from './housingStyles';
import { emberK } from './houseHardening';
import type { GameState } from './state';

/** Chance one building burns in a fire front: fuel near it, what it is made of, and its ember hardening. */
export function burnChance(near: number, ember: number, homeK = 1): number {
  return Math.min(0.85, 0.05 + near * 0.06) * ember * homeK;
}

export type FireBand = 'low' | 'moderate' | 'high';
export const bandOf = (p: number): FireBand => (p < 0.15 ? 'low' : p < 0.4 ? 'moderate' : 'high');
export const BAND_TIP: Record<FireBand, string> = { low: 'Cleared ground or fire-safe walls: likely to come through', moderate: 'Some fuel close in: cut the trees nearest it', high: 'Trees hard against it: clear a firebreak or it burns' };

export interface FireMark { id: string; x: number; z: number; near: number; p: number; band: FireBand }

/** Every finished building (bunkers and cellars are underground and skipped) with its burn chance. */
export function fireMarks(s: GameState, fuel: Record<string, number>): FireMark[] {
  const out: FireMark[] = [];
  for (const st of s.structures.filter(isFinished)) {
    if (st.kind.startsWith('bunker_') || st.kind === 'root_cellar') continue;
    const near = fuel[st.id] ?? 6;
    const p = burnChance(near, emberFactor(st.kind), isHome(st.kind) ? emberK(s) : 1);
    out.push({ id: st.id, x: st.x, z: st.z, near, p, band: bandOf(p) });
  }
  return out;
}

/**
 * What the Fire overlay says when it has nothing (or nothing worrying) to draw: no ring appears until a building is finished, and a ring is
 * green when the place is safe, so an all-green or empty map should be explained rather than look like the overlay is off. Null when there is
 * a ring to read.
 */
export function fireOverlayNote(marks: readonly FireMark[], finishedBuildings: number): string | null {
  if (finishedBuildings === 0) return 'Nothing to mark yet: every finished building gets a ring here, and a house under construction gets none.';
  if (marks.length === 0) return 'Only underground rooms stand so far: bunkers and cellars cannot burn, so no ring is drawn.';
  if (marks.every(m => m.band === 'low')) return 'All rings are green: every building is in cleared ground or has fire-safe walls. Nothing needs a firebreak.';
  return null;
}
