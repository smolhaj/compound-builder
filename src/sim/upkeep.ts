/**
 * Seasons and upkeep (decided with the user: "Seasons & upkeep"). The slow,
 * ordinary wear of a year on the place. Pure.
 *
 *  Seasoning   wood you fell is green: it seasons about nine months in the
 *              pile before it burns well. Burning green takes half again as
 *              much wood and lays down three times the creosote. Seasoned
 *              firewood can be bought (about $330 a cord delivered).
 *  Creosote    every rick burned coats the flue; a dirty one can catch. A
 *              chimney fire mostly cracks the liner, sometimes takes the roof.
 *              Sweep it (a sweep while town works, or yourselves with a brush).
 *  Frozen pipes  a plumbed house with no fire on a hard-freeze night: the
 *              pipes burst and the plumbing needs fixing.
 *  Snow        a long drive drifts shut in a cold winter: deliveries wait a
 *              few days unless there's a plow blade on the truck.
 *  Mud season  in the thaw the county posts weight limits on its gravel
 *              roads: heavy loads (ready-mix, tanks, a container, the
 *              excavator, the drill rig) wait until the road firms up.
 */
import { calendarOf, type GameState } from './state';
import { REGIONS } from './regions';
import { isFinished, knockBack } from './construction';
import { isHome } from './blueprints';
import type { MaterialId } from './materials';
import type { Fix } from './improvements';
import { insuranceClaim } from './paperwork';
import { mulberry32 } from './rng';

/** Days green wood takes to season. */
export const SEASON_DAYS = 270;
/** Creosote laid down per rick burned (seasoned / green); a chimney is "dirty" past 25. */
export const CREOSOTE: { seasoned: number; green: number } = { seasoned: 1, green: 3 };
export const DIRTY = 25;
export const SWEEP_USD = 250;

export interface Upkeep {
  /** Green wood seasoning in the pile (ricks, day cut). */
  green: Array<{ ricks: number; at: number }>;
  /** Creosote in the flue (ricks' worth). */
  creosote: number;
}
export const newUpkeep = (): Upkeep => ({ green: [], creosote: 0 });

export const greenRicks = (s: GameState) => s.upkeep.green.reduce((a, g) => a + g.ricks, 0);

/** Fell a tree: its firewood goes on the seasoning pile. */
export function stackGreen(s: GameState, ricks: number): void {
  if (ricks > 0) s.upkeep.green.push({ ricks, at: s.clock.t });
}

/** Burn one rick for the stove: seasoned if there is any, else green (more of it, dirtier). Returns false if there's none. */
export function burnRick(s: GameState): boolean {
  if (s.stock.firewood >= 1) { s.stock.firewood--; s.upkeep.creosote += CREOSOTE.seasoned; return true; }
  // green wood: half again as much for the same heat
  const need = 1.5;
  if (greenRicks(s) < need) return false;
  let left = need;
  for (const g of s.upkeep.green) { const take = Math.min(g.ricks, left); g.ricks -= take; left -= take; if (left <= 0) break; }
  s.upkeep.green = s.upkeep.green.filter(g => g.ricks > 1e-6);
  s.upkeep.creosote += CREOSOTE.green;
  return true;
}

export type ChimneyState = 'clean' | 'building up' | 'dirty';
export const chimneyState = (s: GameState): ChimneyState => s.upkeep.creosote < DIRTY * 0.5 ? 'clean' : s.upkeep.creosote < DIRTY ? 'building up' : 'dirty';

/** Sweep the chimney: a sweep while town works ($250), otherwise the family with a brush and rods. */
export function sweepChimney(s: GameState): string {
  const pro = s.disaster.tracks.stores >= 0.5 && s.disaster.tracks.banks >= 0.5;
  if (pro) s.money -= SWEEP_USD;
  s.upkeep.creosote = 0;
  return pro ? `The chimney sweep came out: $${SWEEP_USD}, and the flue is clean.` : 'Swept the chimney ourselves with the brush and rods.';
}

/** Once a day: green wood seasons, a dirty flue may catch, pipes freeze in a cold house. */
export function upkeepDay(s: GameState, demand: number, warm: boolean): string[] {
  const out: string[] = [];
  const day = Math.floor(s.clock.t + 0.25);
  const r = mulberry32(s.seed * 8191 + day * 11 + 3);
  // seasoning
  const ready = s.upkeep.green.filter(g => s.clock.t - g.at >= SEASON_DAYS);
  if (ready.length) {
    const n = ready.reduce((a, g) => a + g.ricks, 0);
    s.stock.firewood += Math.floor(n);
    const frac = n - Math.floor(n);
    s.upkeep.green = s.upkeep.green.filter(g => !ready.includes(g));
    if (frac > 1e-6) s.upkeep.green.push({ ricks: frac, at: s.clock.t - SEASON_DAYS - 1 });
    if (n >= 1) out.push(`${Math.floor(n)} rick${n >= 2 ? 's' : ''} of firewood seasoned and ready to burn.`);
  }
  const homes = s.structures.filter(x => isFinished(x) && isHome(x.kind));
  // chimney fire: only when the stove is going hard and the flue is dirty
  if (demand > 0.3 && warm && s.upkeep.creosote > DIRTY && homes.length && r() < (s.upkeep.creosote - DIRTY) * 0.002 * demand) {
    s.upkeep.creosote = 0;
    if (r() < 0.3) {
      const h = homes[0];
      knockBack(s, h, 3);
      out.push(`Chimney fire! It got into the roof of the ${h.kind.replace(/_/g, ' ')}: the roof has to be rebuilt.`);
      const paid = insuranceClaim(s, h, 0.35);
      if (paid) out.push(paid);
    } else {
      s.money -= s.disaster.tracks.stores >= 0.5 ? 1800 : 0;
      out.push(s.disaster.tracks.stores >= 0.5 ? 'Chimney fire: it roared and burned out, and cracked the flue liner ($1,800 to reline).' : 'Chimney fire: it roared and burned out. The flue is cracked; we patched it with what we had.');
    }
  }
  // frozen pipes: a plumbed house with no fire on a hard-freeze night
  if (!warm && demand > 0.6) {
    for (const h of homes) {
      const plumbed = s.utilities.fittings.find(f => f.building === h.id && f.kind === 'plumb' && f.finishedAt !== null);
      if (!plumbed || r() > 0.25) continue;
      s.utilities.fittings = s.utilities.fittings.filter(f => f !== plumbed);
      const fix: Fix = { part: 'plumbing', cond: 'fair', done: 0, hours: 20, supplied: false };
      (h.fixes ??= []).push(fix);
      out.push(`The pipes froze and burst in the ${h.kind.replace(/_/g, ' ')}: no running water until they're fixed.`);
    }
  }
  return out;
}

/** Heavy loads the county keeps off its gravel roads in the thaw. */
const HEAVY: readonly MaterialId[] = ['concrete', 'tank', 'container', 'septic_tank', 'excavator', 'drilling'];

/** Extra days on a delivery for snow on the drive and mud-season weight limits. */
export function weatherDelay(s: GameState, materials: readonly MaterialId[]): { days: number; why: string | null } {
  const R = REGIONS[s.site.region], { doy } = calendarOf(s.clock);
  const winter = doy >= 335 || doy <= 60;
  // mud season: from about three weeks before the last frost until a couple of weeks after
  const [last] = R.frost;
  if (R.cold >= 0.9 && doy >= last - 20 && doy <= last + 14 && materials.some(m => HEAVY.includes(m)))
    return { days: last + 15 - doy, why: 'mud season: the county road has weight limits until it firms up' };
  if (winter && R.cold >= 0.9 && s.site.improvements.driveFt > 250 && s.stock.plow < 1)
    return { days: 2 + Math.floor(R.cold * 2), why: 'snow on the drive: the truck waits for it to be cleared' };
  return { days: 0, why: null };
}
