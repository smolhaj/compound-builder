/**
 * The graded pad (and retaining wall) a placed structure gets: the decision HomesteadWorld.addStructure makes, pulled out so the headless scene audit
 * (src/sim/sceneAudit.ts) grades a compound the way the world does and not by a copy that can drift. Pure: it reads the natural ground and the pads
 * already graded, and returns the pad rectangle, its level and skirt, the wall plan (or null) and the stair/ramp it climbs (or null).
 */
import { CELL, climbOf, footprint, type KitPieceDef, type Placed } from './kit';
import { isEntry, isUnderground } from './underground';
import { WALLLESS, planPad, type Natural, type PadPlan, type Rect } from '../../sim/retainPlan';
import { YARD_SITE, yardPadHalf } from './yardSite';
import type { Pad } from '../parcel/parcelTerrain';

/** A drive or the county road within this margin (u) of a walled pad leaves it with the old gentle skirt: no retaining wall may stand across a way in. */
export const RW_ACCESS_MARGIN = 0.5;

export interface SitePadCtx {
  /** Natural ground (no pads, no road bed). */
  natural: Natural;
  /** The ground as it stands now (earlier pads and the road bed in it). */
  seen: Natural;
  /** Mean natural height over a rect (ParcelTerrain.padHeight). */
  padHeight(x0: number, z0: number, x1: number, z1: number): number;
  /** The lot archetype ground (only a lot gets retaining walls). */
  isLot: boolean;
  /** The county road or the driveway within `m` of the rect. */
  touchesAccess(r: Rect, m: number): boolean;
  /** Where the water level is for a pier (lake, else creek at x). */
  waterLevel(x: number): number;
  /** The rects of the surface buildings already standing (their wall's rect, else their footprint with its porch). */
  near: readonly Rect[];
}

export interface SitePad {
  pad: Pad | null;
  wall: PadPlan | null;
  /** The level the building stands on (pad level, pier on the water, stair's low end). */
  y: number;
  climb: ReturnType<typeof climbOf> | null;
}

export function sitePad(def: KitPieceDef, p: Placed, ctx: SitePadCtx): SitePad {
  const r = footprint(def, p.x, p.z, p.rot);
  const below = isUnderground(def);
  let y = ctx.padHeight(r.x0, r.z0, r.x1, r.z1);
  // a pier stands on the water, not on a pad (the lake bed or the bank would be graded up to it)
  if (def.waterside) y = ctx.waterLevel(p.x) + 0.02;
  // a house on piles: the floor clears the highest ground under it (the piles run down to the low side); no pad is graded, no wall is built
  if (def.stilts) { let hi = -Infinity; for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) hi = Math.max(hi, ctx.natural(r.x0 + (r.x1 - r.x0) * i / 4, r.z0 + (r.z1 - r.z0) * j / 4)); y = hi + 0.03; }
  // bunker rooms take no pad (the yard above stays as it is); an entrance's hatch or headhouse gets a small one
  let pad: Pad | null = (!below || (isEntry(def) && p.kind !== 'bunker_floorhatch')) && !def.waterside && !def.stilts ? { x0: r.x0 - 0.05, z0: r.z0 - 0.05, x1: r.x1 + 0.05, z1: r.z1 + 0.05, y, skirt: below ? 0.4 : p.kind === 'vehicle_yard' ? YARD_SITE.skirt : 0.9 } : null;
  // a yard turned to a diagonal drive is graded on a pad between its own size and the box round it (game/buildkit/yardSite), so the road's bed is left alone
  if (pad && p.kind === 'vehicle_yard' && !Number.isInteger(p.rot)) { const hp = yardPadHalf(p.rot, def.cellsX * CELL / 2) + 0.05; pad = { ...pad, x0: p.x - hp, z0: p.z - hp, x1: p.x + hp, z1: p.z + hp }; }
  // a pad cut into a slope is held by a dry-stack wall (sim/retainPlan): a flat apron round the building on the walled sides, the terrain eased only over the wall
  let wall: PadPlan | null = null;
  if (!below && pad && ctx.isLot && !WALLLESS.test(p.kind)) {
    // the ground as it is now (earlier pads and the road bed included), so a wall never floats over or sinks into what they graded
    wall = planPad(r, ctx.natural, ctx.near, ctx.seen);
    // a drive or the county road crossing the pad leaves it with the old gentle skirt: no wall may stand across a way in
    if (wall.runs.length && ctx.touchesAccess(wall.rect, RW_ACCESS_MARGIN)) wall = null;
    if (wall && wall.runs.length) pad = { x0: wall.rect.x0, z0: wall.rect.z0, x1: wall.rect.x1, z1: wall.rect.z1, y: wall.y, skirt: wall.skirt };
    else wall = null;
  }
  // a stair or a ramp takes no pad: it stands on the hill from its low end and rises with it (game/buildkit/terraceProps.ts)
  const climb = def.climbs ? climbOf(def, p.x, p.z, p.rot, ctx.natural) : null;
  if (climb) { pad = null; wall = null; y = climb.low; }
  return { pad, wall, y, climb };
}
