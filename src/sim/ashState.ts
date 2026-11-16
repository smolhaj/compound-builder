/** The ash kinds' state bag and options (pure, no sim imports: utilities.ts reads the solar derate through it, so it must stay out of the disasterFx import cycle). */
import type { GameState } from './state';
import { ashTarget, depthAt } from './ashfall';

export interface AshState {
  target: number;
  /** Depth of ash on each roof when it was last shoveled (inches). */
  base: Record<string, number>;
  /** Depth on the panels when they were last wiped. */
  panels: number;
  chokeTold?: boolean;
  roofs: number;
  left: number;
}
export interface AshOpts { key: 'ash_winter' | 'supervolcano'; scale: number; severity: number; /** The kind's own old climate rule (climate() in effects.ts). */ legacy: boolean; name: string }

/** Ash winter (the Yellowstone eruption). */
export const ASH_WINTER_OPTS: AshOpts = { key: 'ash_winter', scale: 1, severity: 1, legacy: true, name: 'the ash winter' };
/** Supervolcano (a caldera eruption): a bigger fall and a harsher winter. */
export const SUPERVOLCANO_OPTS: AshOpts = { key: 'supervolcano', scale: 1.4, severity: 1.1, legacy: false, name: 'the caldera eruption' };
export const ashOptsOf = (k: string | null): AshOpts | null => (k === 'ash_winter' ? ASH_WINTER_OPTS : k === 'supervolcano' ? SUPERVOLCANO_OPTS : null);

export function ashOf(s: GameState, key: string, scale: number): AshState {
  const fx = (s.disaster.fx ??= {});
  return (fx[key] ??= { target: ashTarget(s.seed, s.site.region, scale), base: {}, panels: 0, roofs: 0, left: 0 }) as AshState;
}
export const ashDepth = (s: GameState, o: AshOpts): number => (s.clock.t < s.disaster.hitAt ? 0 : depthAt(ashOf(s, o.key, o.scale).target, s.clock.t - s.disaster.hitAt));
