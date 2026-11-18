/**
 * What a dome does for the garden, the greenhouse, the aquaponics bay and the barnyard under it (owner decision 2 of 2026-11-18): a held climate
 * is frost-free, hail-free and steady, so beds grow out of season, fish keep warm and animals are not heat- or cold-stressed.
 *
 * Read-only and light on imports on purpose (the farm modules call it): it reads the dome gauges the live step wrote (`indoorF`, `powered`), never
 * the live module itself. All pure of rendering. Tested in `dome/atmosphere.test.ts`.
 */
import type { GameState, Structure } from '../state';
import { isFinished } from '../construction';
import { DOME_KINDS, TIER, shellFt, tierOfKind, tierRank } from './tiers';
import { comfortAt } from './climate';

/** Days the garden's season stretches at each end under a powered, frost-free dome: a full 60 when the air is held at 50 F or more, 30 when it is only held above freezing (cold-hardy greens). */
export const DOME_SEASON_DAYS = 60;
/** The yield multiplier at full comfort (a field or bed in a held climate: no hail, no frost, no heat stop), and with the shell alone (powered off). */
export const DOME_YIELD = { held: 0.12, shell: 0.04 } as const;
/** Cuts to the animals' sickness at full comfort, and the extra when the dome cooks or freezes the barn (stress 1). */
export const DOME_STOCK = { sickCut: 0.4, stressAdd: 0.6 } as const;
/** Animal-unit weights of the buildings that house stock. */
export const STOCK_WEIGHT: Record<string, number> = { barn: 3, barnyard: 6, sheep_barn: 4.5, chicken_coop: 1 };

export interface Cover { id: string; indoorF: number; powered: boolean; comfort: number; frostFree: boolean }

/** The state of a dome as the gauges last left it (the dome's own entry, or the legacy single `dome` for the biggest). */
function gauge(s: GameState, id: string): { indoorF: number; powered: boolean } | null {
  const g = s.domes?.[id] ?? (s.dome && (!s.dome.id || s.dome.id === id) ? s.dome : undefined);
  return g ? { indoorF: g.indoorF, powered: g.powered } : null;
}

/** The finished dome whose shell holds the point (the smallest one if shells nest), with its climate right now. */
export function coverAt(s: GameState, x: number, z: number): Cover | null {
  let best: { st: Structure; r: number } | null = null;
  for (const st of s.structures) {
    if (!DOME_KINDS.includes(st.kind) || !isFinished(st)) continue;
    const tier = tierOfKind(st.kind)!, r = shellFt(tier, TIER[tier].cells) / 2 / 20;
    if (Math.hypot(x - st.x, z - st.z) <= r && (!best || r < best.r)) best = { st, r };
  }
  if (!best) return null;
  const tier = tierOfKind(best.st.kind)!, g = gauge(s, best.st.id);
  // an earthen dome is a hut, not a conservatory: no growing under it
  if (tierRank(tier) < tierRank('geodesic')) return null;
  const powered = !!g?.powered, f = g?.indoorF ?? 55;
  return { id: best.st.id, indoorF: f, powered, comfort: powered ? comfortAt(f) : comfortAt(f) * 0.4, frostFree: powered && f >= 33 };
}

/** A bed, field, house or bay's yield multiplier (1 outside any dome). */
export function domeYieldK(s: GameState, st: Pick<Structure, 'x' | 'z'>): number {
  const c = coverAt(s, st.x, st.z);
  if (!c) return 1;
  return 1 + (c.powered ? DOME_YIELD.held * c.comfort : DOME_YIELD.shell);
}

/** A bed's season window, stretched when it grows in a frost-free dome. */
export function domeSeason(s: GameState, st: Pick<Structure, 'x' | 'z'>, g0: number, g1: number): [number, number] {
  const c = coverAt(s, st.x, st.z);
  if (!c?.frostFree) return [g0, g1];
  const x = c.indoorF >= 50 ? DOME_SEASON_DAYS : DOME_SEASON_DAYS / 2;
  return [g0 - x, g1 + x];
}

/** Is this greenhouse or bay inside a powered dome that holds it frost-free (so it needs no heater of its own)? */
export function underHeldDome(s: GameState, st: Pick<Structure, 'x' | 'z'>): boolean { return !!coverAt(s, st.x, st.z)?.frostFree; }

/** Water temperature help: an aquaponics bay under a powered dome sees the dome's air, not the winter's. Null outside. */
export function domeAirF(s: GameState, st: Pick<Structure, 'x' | 'z'>): number | null {
  const c = coverAt(s, st.x, st.z);
  return c && c.powered ? c.indoorF : null;
}

/** The share of the herd's housing (by animal-unit weight) that stands under a dome, and its mean comfort 0..1. */
export function stockCover(s: GameState): { share: number; comfort: number; stress: number } {
  let all = 0, under = 0, comfort = 0;
  for (const st of s.structures) {
    const w = STOCK_WEIGHT[st.kind];
    if (!w || !isFinished(st)) continue;
    all += w;
    const c = coverAt(s, st.x, st.z);
    if (c) { under += w; comfort += w * c.comfort; }
  }
  if (all <= 0 || under <= 0) return { share: 0, comfort: 0, stress: 0 };
  const mean = comfort / under;
  return { share: under / all, comfort: mean, stress: 1 - mean };
}

/** Multiplier on new cases of animal sickness: down to 1 - 0.4 at full cover and comfort, up to 1 + 0.6 when a covered barn is cooking or freezing. */
export function domeSickK(s: GameState): number {
  const c = stockCover(s);
  if (c.share <= 0) return 1;
  return 1 - c.share * (DOME_STOCK.sickCut * c.comfort - DOME_STOCK.stressAdd * c.stress * 0.5);
}
