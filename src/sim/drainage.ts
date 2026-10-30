/**
 * Drainage channels (docs/DECISIONS.md, "Drainage channels"): a stone-lined swale with a perforated pipe and a grating at each end, laid above a building
 * that is cut into a slope, or along the foot of a wall on the downhill side. In the thaw and in a storm the water that runs off a cut slope (a pad graded
 * at 12 % or more: `Structure.grade`, sim/slope.ts) turns the ground to mud and slows the work on it (the terrain mud rule in sim/terrainFx.ts); a finished
 * channel within `REACH` of the site takes `MUD_CUT` of that away. The price is in the one table (`PERIMETER.drain_channel`: pipe and concrete, a
 * few hours' work per 6 m); the line is a utility-class run (Build: Pipes & cables), so a gate never lands on it. Pure (tested).
 */
import { PERIMETER, runFinished, type PerimeterRun, type Pt } from './perimeter';
import { gradeAt } from './slope';
import { siteLot } from './lotListing';
import type { GameState, Structure } from './state';
import { wallHoldsAt } from './retaining';

export const DRAIN = {
  /** A pad graded at this rise over run or more sheds water onto itself (the retaining-wall band of sim/slope.ts). */
  RUNOFF_GRADE: 0.12,
  /** A channel this close (units, 6 m) to a site drains it. */
  REACH: 3,
  /** The share of the mud slowdown a drained site loses. */
  MUD_CUT: 0.7,
  /** The channel the card plans: half its length (units) along the contour, and how far above the building it runs. */
  HALF_LEN: 4.5, ABOVE: 2.4,
} as const;

export const DRAIN_KIND = 'drain_channel';

/** The finished channels. */
export const drains = (s: GameState): PerimeterRun[] => s.perimeter.filter(r => r.kind === DRAIN_KIND && runFinished(r) && r.pts.length > 1);

const distToSeg = (px: number, pz: number, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)) : 0;
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t));
};

/** Is a finished channel within `REACH` of the point? */
export function nearDrain(s: GameState, x: number, z: number): boolean {
  for (const r of drains(s)) for (let i = 1; i < r.pts.length; i++) if (distToSeg(x, z, r.pts[i - 1], r.pts[i]) <= DRAIN.REACH) return true;
  return false;
}

/** Is the ground at (x, z) a cut slope: a pad graded at `RUNOFF_GRADE` or more (0 on a place with no lot)? */
export const cutSlopeAt = (s: GameState, x: number, z: number): boolean => gradeAt(s.site, x, z) >= DRAIN.RUNOFF_GRADE;

/** The surface buildings (finished or staked) standing on a cut slope. */
export function cutSites(s: GameState): Structure[] {
  return s.structures.filter(st => !st.unplaced && !st.kind.startsWith('bunker_') && !st.kind.startsWith('escape') && (st.grade ?? 0) >= DRAIN.RUNOFF_GRADE);
}

/** The cut-slope buildings with no channel near them and no finished retaining wall holding the slope (sim/retaining.ts). */
export const undrained = (s: GameState): Structure[] => cutSites(s).filter(st => !nearDrain(s, st.x, st.z) && !wallHoldsAt(s, st.x, st.z));

/** The line of a channel above a building on a slope: along the contour, `ABOVE` up the hill, or null on level ground / with no lot. */
export function drainLineFor(s: GameState, st: Pick<Structure, 'x' | 'z'>): [Pt, Pt] | null {
  const lot = siteLot(s.site);
  if (!lot) return null;
  const f = lot.field, e = 0.5;
  const gx = (f.h(st.x + e, st.z) - f.h(st.x - e, st.z)) / (2 * e), gz = (f.h(st.x, st.z + e) - f.h(st.x, st.z - e)) / (2 * e), g = Math.hypot(gx, gz);
  if (g < 0.02) return null;
  const ux = gx / g, uz = gz / g, px = -uz, pz = ux;      // u = uphill, p = along the contour
  const cx = st.x + ux * DRAIN.ABOVE, cz = st.z + uz * DRAIN.ABOVE;
  return [[cx - px * DRAIN.HALF_LEN, cz - pz * DRAIN.HALF_LEN], [cx + px * DRAIN.HALF_LEN, cz + pz * DRAIN.HALF_LEN]];
}

/** Plain lines for the Defense tab's ground section: what the channels do and what still sheds water. */
export function drainageLines(s: GameState): string[] {
  const cut = cutSites(s), open = undrained(s), d = drains(s);
  if (!cut.length && !d.length) return [];
  const out: string[] = [];
  if (cut.length) out.push(open.length ? `${open.length} of ${cut.length} building${cut.length > 1 ? 's' : ''} cut into a slope have nothing to turn the runoff: the work on them bogs down in the thaw and in storms (a drainage channel above each takes ${Math.round(DRAIN.MUD_CUT * 100)} % of that away).` : `All ${cut.length} building${cut.length > 1 ? 's' : ''} cut into a slope are drained.`);
  if (d.length) out.push(`${d.length} drainage channel${d.length > 1 ? 's' : ''} standing (${PERIMETER[DRAIN_KIND].name.toLowerCase()}).`);
  return out;
}
