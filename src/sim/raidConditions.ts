/**
 * What the air and the yard do to a fight (coordinator decision 4). Pure.
 *
 *   weather   a storm on the place (sim/weatherThreats.ts): snow, ice and wind spoil the aim, rain and wind cover the sound of a crew coming up.
 *   smoke     a post wrecked or a building burning while the fight goes on: every shot through it is worse (`SMOKE_ACC`) for as long as it burns.
 *   flares    a hand-launched illumination flare (the shop good `flares`): it turns a dark yard into a lit one for `FLARE.secs`, for both sides.
 *   animals   livestock in the yard: bawling and barking give the watch a few more units of warning (`animalNoise`).
 */
import type { StormKind } from './regions';
import { dayIndex, type GameState } from './state';
import { ANIMALS } from './livestock';

export interface StormFx { acc: number; detect: number; line: string }
/** Accuracy and warning multipliers by storm. */
export const STORM_FX: Record<StormKind, StormFx> = {
  blizzard: { acc: 0.75, detect: 0.7, line: 'The blizzard' },
  ice_storm: { acc: 0.88, detect: 0.85, line: 'The ice' },
  hurricane_remnants: { acc: 0.82, detect: 0.75, line: 'The wind and rain' },
  windstorm: { acc: 0.92, detect: 0.8, line: 'The wind' },
  derecho: { acc: 0.8, detect: 0.7, line: 'The wind' },
  tornado: { acc: 0.7, detect: 0.6, line: 'The storm' },
  hail: { acc: 0.88, detect: 0.9, line: 'The hail' },
  flood: { acc: 0.95, detect: 0.9, line: 'The rain' },
  flash_flood: { acc: 0.95, detect: 0.9, line: 'The rain' },
  heat_wave: { acc: 1, detect: 1, line: '' },
  lightning_fire: { acc: 0.92, detect: 1, line: 'The smoke' },
};
/** Rounds through smoke. */
export const SMOKE_ACC = 0.88;
/** A flare lights the yard for this many seconds. */
export const FLARE = { secs: 30 } as const;

/** The storm on the place today, or null. */
export function stormNow(s: Pick<GameState, 'weather' | 'clock'>): StormKind | null {
  const a = s.weather?.active;
  if (!a) return null;
  const day = dayIndex(s.clock.t);
  return day >= a.at && day <= a.until ? a.kind : null;
}

export interface Env {
  storm: StormKind | null;
  /** Multiplier on every shot's chance to hit, and on how far out the watch notices a crew. */
  acc: number;
  detect: number;
  /** Extra units of warning from the livestock in the yard. */
  animalNoise: number;
  /** Flares the family has. */
  flares: number;
  /** One line for the scene's caption (empty: a plain night or day). */
  line: string;
}

export function envOf(s: Pick<GameState, 'weather' | 'clock' | 'stock'>): Env {
  const storm = stormNow(s), fx = storm ? STORM_FX[storm] : null;
  const animals = ANIMALS.reduce((a, k) => a + Math.floor(s.stock[k] ?? 0), 0);
  return { storm, acc: fx?.acc ?? 1, detect: fx?.detect ?? 1, animalNoise: Math.min(6, animals * 0.4), flares: Math.floor(s.stock.flares ?? 0), line: fx?.line ? `${fx.line} is on the place tonight.` : '' };
}
