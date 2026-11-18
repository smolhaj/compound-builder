/**
 * Where a tunnel meets a dome (owner decision 7 and the 2026-11-17 raids dispatch): tunnels, the escape route and the linked-compound corridors
 * cross the shell only through an airlock, and a crew that digs cannot go under the buried skirt. Pure (tested in siege.test.ts).
 *
 *  crossing   a corridor drawn across a dome's shell must pass through an airlock: `crossingProblem` says why not (with the nearest airlock and how
 *             far off), `throughAirlock` lays the line through the chosen airlock (the way the tool snaps it), `crossesAt` finds where the line meets
 *             the shell.
 *  skirt      `digStops` is the share of dig attempts the buried skirt turns round, by the skirt's depth against how deep the crew can dig; a crew that
 *             has learned a defended place digs deeper (`DIG_DEEPER`), so a shallow skirt is only partial cover and a deep one stays total.
 *  turned     a crew that hits the skirt works along it toward the nearest airlock or gate (`turnedTo`), because that is the only way left.
 */
import { DIG_DEPTH_FT, SKIRT_MARGIN_FT } from './siting';
import { TIER, type DomeTier } from './tiers';
import { FT_PER_UNIT, domesOf, type Airlock, type Dome } from './standing';
import type { GameState } from '../state';

export type Pt = [number, number];

/** How far from an airlock's axis a corridor may meet the shell and still be taken through it (world units): the vestibule's own width and a little more. */
export const AIRLOCK_REACH = 1.2;

/** Corridor kinds that go through a dome's skirt at an airlock (the way people walk): the rest (pipes and cables) pass in sealed sleeves. */
export const CROSSING_KINDS: readonly string[] = ['escape_tunnel', 'underground_passage', 'covered_walkway', 'slope_tunnel', 'rock_tunnel', 'tunnel_bridge'];

/** Where the polyline first crosses the shell circle, or null (a line wholly inside or wholly outside). `inward` is true when it goes from outside to in. */
export function crossesAt(d: Pick<Dome, 'x' | 'z' | 'r'>, pts: readonly Pt[]): { x: number; z: number; segment: number; inward: boolean } | null {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az;
    const fx = ax - d.x, fz = az - d.z;
    const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - d.r * d.r;
    if (A < 1e-12) continue;
    const inA = C < 0, inB = (bx - d.x) ** 2 + (bz - d.z) ** 2 < d.r * d.r;
    if (inA === inB) {
      // both ends on one side: a chord can still cut a corner of the circle
      const disc = B * B - 4 * A * C;
      if (!inA && disc > 0) {
        const t = (-B - Math.sqrt(disc)) / (2 * A);
        if (t > 0 && t < 1) return { x: ax + dx * t, z: az + dz * t, segment: i - 1, inward: true };
      }
      continue;
    }
    const disc = Math.max(0, B * B - 4 * A * C), t = inA ? (-B + Math.sqrt(disc)) / (2 * A) : (-B - Math.sqrt(disc)) / (2 * A);
    return { x: ax + dx * t, z: az + dz * t, segment: i - 1, inward: !inA };
  }
  return null;
}

/** The airlock nearest a point, and the distance along the shell to it (world units, straight line). */
export function nearestAirlock(d: Dome, x: number, z: number): { airlock: Airlock; off: number } | null {
  let best: { airlock: Airlock; off: number } | null = null;
  for (const a of d.airlocks) { const off = Math.hypot(a.x - x, a.z - z); if (!best || off < best.off) best = { airlock: a, off }; }
  return best;
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
/** The compass side of the dome a point lies on (the sim's z grows to the south). */
export function sideOfDome(d: Pick<Dome, 'x' | 'z'>, x: number, z: number): string {
  const a = Math.atan2(x - d.x, -(z - d.z));   // 0 = north, clockwise
  return COMPASS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

/**
 * Why a corridor of `kind` cannot be laid along `pts` across this dome (null: it can). Only the people-ways cross, only at an airlock, and a dome
 * with no airlock (the earthen dome's single door) takes a tunnel at that door. A line that starts or ends inside the shell is fine so long as it
 * meets the shell at an airlock.
 */
export function crossingProblem(d: Dome, kind: string, pts: readonly Pt[]): string | null {
  if (!CROSSING_KINDS.includes(kind)) return null;
  const c = crossesAt(d, pts);
  if (!c) return null;
  const n = nearestAirlock(d, c.x, c.z);
  if (!n) return 'This dome has no airlock to cross by.';
  if (n.off <= AIRLOCK_REACH) return null;
  const ft = Math.round(n.off * FT_PER_UNIT / 10) * 10;
  return `A tunnel crosses a dome only through an airlock. This one meets the shell on the ${sideOfDome(d, c.x, c.z)} side, ${ft} ft from the nearest airlock (on the ${sideOfDome(d, n.airlock.x, n.airlock.z)}). Bring it to the airlock.`;
}

/**
 * The same line laid through an airlock: the point where it meets the shell is replaced by the airlock's outer door and its inner door (the chamber
 * between them is the sally port). Returns the points unchanged when the line does not cross the shell or is already inside the reach of an airlock
 * and not worth moving; `airlock` names the one used.
 */
export function throughAirlock(d: Dome, pts: readonly Pt[]): { pts: Pt[]; airlock: Airlock | null } {
  const c = crossesAt(d, pts);
  if (!c) return { pts: pts.map(p => [p[0], p[1]] as Pt), airlock: null };
  const n = nearestAirlock(d, c.x, c.z);
  if (!n) return { pts: pts.map(p => [p[0], p[1]] as Pt), airlock: null };
  const a = n.airlock, out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    out.push([pts[i][0], pts[i][1]]);
    if (i === c.segment) {
      if (c.inward) out.push([a.outX, a.outZ], [a.x, a.z], [a.inX, a.inZ]);
      else out.push([a.inX, a.inZ], [a.x, a.z], [a.outX, a.outZ]);
    }
  }
  return { pts: out, airlock: a };
}

// ── the buried skirt against a dig ──

/** A crew that has learned a defended place digs this much deeper at full adaptation (ft): the skirt's depth is partial cover against them. */
export const DIG_DEEPER = 12;

/**
 * Share of dig attempts at the shell the skirt turns round. The crew's dig depth is spread over `DIG_DEPTH_FT`; a skirt stops a dig when it reaches
 * `SKIRT_MARGIN_FT` below it. `adapt` (0-1) is how far the crews have learned this place: they dig deeper. Never falls as the skirt gets deeper
 * (property test) and never rises as the crew gets better (property test).
 */
export function digStops(skirtFt: number, adapt = 0): number {
  const [lo, hi] = DIG_DEPTH_FT, k = Math.max(0, Math.min(1, adapt)) * DIG_DEEPER;
  return Math.max(0, Math.min(0.995, (skirtFt - SKIRT_MARGIN_FT - (lo + k)) / (hi + k - (lo + k))));
}
export const skirtOf = (tier: DomeTier): number => TIER[tier].skirtFt;
/** The skirt's cover in words for the card and the Defense page. */
export function skirtWord(tier: DomeTier, adapt = 0): string {
  const p = digStops(skirtOf(tier), adapt);
  return p >= 0.99 ? 'no crew digs under it' : p >= 0.5 ? 'most crews that dig are turned back at the skirt' : p > 0 ? 'a deep dig can still get under it' : 'a skirt this shallow does not stop a dig';
}

/** Where a crew that was turned at the skirt goes next: the nearest airlock to where they dug (or null with none). */
export function turnedTo(d: Dome, x: number, z: number): Airlock | null { return nearestAirlock(d, x, z)?.airlock ?? null; }

// ── on the place ──

type Land = Pick<GameState, 'structures'> & Partial<Pick<GameState, 'raidDamage'>>;

/** Why this corridor cannot be laid across the domes on the place (null: it can). Staked domes count too: the footing is poured first. */
export function domeRouteProblem(s: Land, kind: string, pts: readonly Pt[]): string | null {
  if (!CROSSING_KINDS.includes(kind)) return null;
  for (const d of domesOf(s, true)) { const why = crossingProblem(d, kind, pts); if (why) return why; }
  return null;
}

/** The corridor laid through the airlock of each dome it crosses (the line the tool snaps to). Unchanged when it crosses none. */
export function routeThroughDomes(s: Land, kind: string, pts: readonly Pt[]): Pt[] {
  let out: Pt[] = pts.map(p => [p[0], p[1]] as Pt);
  if (!CROSSING_KINDS.includes(kind)) return out;
  for (const d of domesOf(s, true)) out = throughAirlock(d, out).pts;
  return out;
}

/** The airlock a standing corridor meets a dome at, or null (the corridor is not one a dome has an airlock for). */
export function airlockOfCorridor(d: Dome, pts: readonly Pt[]): Airlock | null {
  for (const a of d.airlocks) if (pts.some(p => Math.hypot(p[0] - a.x, p[1] - a.z) < 0.35)) return a;
  return null;
}
