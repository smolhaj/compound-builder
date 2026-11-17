/**
 * A dome is a very visible target but can be well defended (owner decision 4; docs/DOME_COMPOUND.md 8.5). Visibility is how far the place is seen
 * from the county road; attraction is visibility the wall does not answer. Pure (tested); nothing here changes a fight, only who comes.
 */
import type { DomeTier } from './tiers';
import { STOPS } from './protection';

/** Miles it can be seen on flat land: by day, the night glow with the lights on, and the glint of the sun on the skin. */
export const SEEN: Record<DomeTier, { day: number; night: number; glint: number }> = {
  earthen: { day: 0.15, night: 0.1, glint: 0 },
  geodesic: { day: 1.2, night: 2, glint: 0.8 },
  glass: { day: 4.5, night: 3.5, glint: 1.8 },
  arcology: { day: 11, night: 16, glint: 9 },
};

export interface Seen { dayMi: number; nightMi: number; glintMi: number }
/** Opts: night shutters or curtains halve the glow; a tree line or a berm hides some; terrain (ridges) can cut it from outside. */
export function domeVisibility(tier: DomeTier, o: { shades?: boolean; treeCover?: number; ridgeCut?: number } = {}): Seen {
  const v = SEEN[tier], hide = (1 - 0.5 * Math.max(0, Math.min(1, o.treeCover ?? 0))) * (1 - Math.max(0, Math.min(0.8, o.ridgeCut ?? 0)));
  return { dayMi: v.day * hide, nightMi: v.night * (o.shades ? 0.4 : 1) * hide, glintMi: v.glint * hide };
}

/** Points the dome adds to the fortress `look` (sim/stealth.ts reads a 0-100 score): an armored dome looks like a prize and a fortress. */
export const LOOK: Record<DomeTier, number> = { earthen: 0, geodesic: 8, glass: 15, arcology: 35 };

/** 0..1: how much of the dome's visibility is an invitation. The wall and the shell's own armor answer it. */
export function attract(tier: DomeTier, hardness: number, o: Parameters<typeof domeVisibility>[1] = {}): number {
  const v = domeVisibility(tier, o), seen = Math.min(1, Math.max(v.dayMi, v.nightMi, v.glintMi) / 12);
  return seen * (1 - Math.max(0, Math.min(1, hardness)));
}
/** Encounter weight multipliers for looters and gangs: rise with attraction. */
export const looterWeight = (a: number): number => 1 + 0.8 * a;
export const gangWeight = (a: number): number => 1 + 0.5 * a;
/** Armor answers visibility: the share of a rifle crew's fire the shell turns. */
export const answered = (tier: DomeTier): number => STOPS[tier].rifle;
