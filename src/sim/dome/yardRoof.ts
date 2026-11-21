/**
 * The arcology's plant yard roof (owner, 2026-11-21): retractable leaves on rails, built of the dome's own armor and glazing. Three states: `closed` (sealed, the default),
 * `vent` (leaves slid partway, a gasketed gap, the yard breathes) and `open` (leaves parked, the yard open to the sky). The yard stands OUTSIDE the dome's envelope and is entered
 * only from inside through its own service airlock, so venting the yard never opens the dome. Pure (tested in yardRoof.test.ts).
 *
 * Interlocks: the roof may open only while the yard's service airlock is closed and locked, the dome is not in lockdown, and no hazard is on (fallout, ash, smoke, flood, storm,
 * heat or ice). If any of those comes true while it is open, it closes by itself.
 */
export type RoofState = 'closed' | 'vent' | 'open';
export const ROOF_STATES: readonly RoofState[] = ['closed', 'vent', 'open'];

export interface RoofCtx {
  /** The dome is sealed in lockdown. */
  lockdown: boolean;
  /** Fallout, ash or smoke in the outside air (0..1, sim/dome/live.ts `outsideDirt`). */
  dirt: number;
  /** A flood, storm, heat or ice disaster is on (see `roofHazard`). */
  hazard: boolean;
  /** The yard's service airlock to the dome interior is closed and locked (always true today: nobody works the yard in play). */
  serviceLocked: boolean;
}

/** Why the roof may not leave `closed` right now (null: it may). */
export function roofRefusal(ctx: RoofCtx): string | null {
  if (ctx.lockdown) return 'The dome is sealed in lockdown: the plant yard roof stays shut.';
  if (ctx.dirt > 0) return 'Fallout, ash or smoke is in the air: the plant yard roof stays shut.';
  if (ctx.hazard) return 'A flood, storm, heat or ice hazard is on: the plant yard roof stays shut.';
  if (!ctx.serviceLocked) return 'The plant yard service airlock is not closed and locked.';
  return null;
}

/** The roof as it stands: what the player asked for, forced shut while any interlock holds. */
export function effectiveRoof(want: RoofState | undefined, ctx: RoofCtx): RoofState {
  const w = want ?? 'closed';
  return w !== 'closed' && roofRefusal(ctx) ? 'closed' : w;
}

const HAZARD = /flood|storm|hurricane|tornado|tsunami|heat|ice_age|blizzard|quake|solar_flare|asteroid/i;
/** Is a disaster kind one that shuts the roof (a flood, storm, extreme heat or ice, a quake)? Fallout, ash and smoke come through `dirt`. */
export const roofHazard = (kind: string | null | undefined): boolean => !!kind && HAZARD.test(kind);

/** How far each half-leaf slides out from the center seam, as a share of the yard's width: closed 0, vent a gasketed gap, open parked over the end bays. */
export const ROOF_SLIDE: Record<RoofState, number> = { closed: 0, vent: 0.1, open: 0.28 };
