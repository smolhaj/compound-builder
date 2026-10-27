/**
 * Walled yards and what links them (user: three houses deep in a forest, each
 * in its own walled yard, joined by fenced steel walkways; "the walkway could
 * also be underground"). Pure (tested).
 *
 *  - A yard is a finished closed ring of wall that is not the property line.
 *    Each stays its own ring in the Defense tab's "The houses" check.
 *  - A covered walkway is an enclosed steel walk drawn between two yards. It
 *    counts as wall (enclosure / ring checks read it like any people-blocking
 *    run) and lets the party cross between houses under cover. Its pendant
 *    lights need power: without it the walk is dark at night.
 *  - An underground passage is hidden and two-way. Its two ends are hatches
 *    with blast doors, locked by default. A hatch that comes up inside a yard
 *    is not a way in; one that comes up outside every wall is, if raiders find
 *    it (rare while the passage is hidden, far likelier once it is revealed)
 *    and get through the door. The escape tunnel is never a way in
 *    (perimeter.canEnter); the passage is, which is why its hatches are
 *    modelled as the guarded weak points.
 */
import { enclosure, nearest } from './enclosure';
import { PERIMETER, fenceLive, runFinished, type PerimeterRun, type Pt } from './perimeter';
import type { GameState } from './state';

/** Point in a closed polyline (ray casting). */
export function insideRing(pts: readonly Pt[], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** How near a walkway's end must be to a yard's wall to be joined to it (≈ 5 m). */
export const JOIN_REACH = 0.9;

/** Finished closed rings of wall round a compound (not the property line itself). */
export function yardRings(s: GameState, onLine: ReadonlySet<string> = enclosure(s).onLine): PerimeterRun[] {
  return s.perimeter.filter(r => runFinished(r) && PERIMETER[r.kind].blocks.people >= 0.5 && r.pts.length > 3
    && Math.hypot(r.pts[0][0] - r.pts.at(-1)![0], r.pts[0][1] - r.pts.at(-1)![1]) < 0.6 && !onLine.has(r.id));
}

/** The yard (ring id) a point is in or against, else null. */
export function yardAt(rings: readonly PerimeterRun[], p: Pt): string | null {
  let best: { id: string; d: number } | null = null;
  for (const r of rings) {
    if (insideRing(r.pts, p[0], p[1])) return r.id;
    const d = nearest(r.pts, p[0], p[1]).d;
    if (d <= JOIN_REACH && (!best || d < best.d)) best = { id: r.id, d };
  }
  return best?.id ?? null;
}

export interface Link {
  runId: string;
  kind: 'walkway' | 'passage';
  /** The yards at the two ends (ring ids), or null where an end is not in one. */
  a: string | null;
  b: string | null;
  /** Walkway only: the pendant lights have power. */
  lit: boolean;
}

/** Every finished walkway and passage, and the yards it joins. */
export function links(s: GameState, rings: readonly PerimeterRun[] = yardRings(s)): Link[] {
  const out: Link[] = [];
  for (const r of s.perimeter) {
    const d = PERIMETER[r.kind];
    if (!runFinished(r) || r.pts.length < 2 || !(d.walkway || d.twoWay)) continue;
    out.push({ runId: r.id, kind: d.walkway ? 'walkway' : 'passage', a: yardAt(rings, r.pts[0]), b: yardAt(rings, r.pts.at(-1)!), lit: d.walkway ? fenceLive(s) : true });
  }
  return out;
}

/** Groups of yards joined (directly or through others) by a walkway or a passage. */
export function linkedGroups(rings: readonly PerimeterRun[], ls: readonly Link[]): string[][] {
  const parent = new Map<string, string>(rings.map(r => [r.id, r.id]));
  const find = (x: string): string => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  for (const l of ls) if (l.a && l.b && l.a !== l.b) parent.set(find(l.a), find(l.b));
  const groups = new Map<string, string[]>();
  for (const r of rings) { const k = find(r.id); groups.set(k, [...(groups.get(k) ?? []), r.id]); }
  return [...groups.values()];
}

/** Can the party get from one yard to another without going outside the walls? */
export function coveredRoute(s: GameState, ringA: string, ringB: string): boolean {
  if (ringA === ringB) return true;
  const rings = yardRings(s);
  return linkedGroups(rings, links(s, rings)).some(g => g.includes(ringA) && g.includes(ringB));
}

/** A trip between two points: exposed (outside the walls for part of it) unless both are in the same yard or the yards are joined. */
export function tripExposed(s: GameState, from: Pt, to: Pt): boolean {
  const rings = yardRings(s);
  const a = yardAt(rings, from), b = yardAt(rings, to);
  if (a && a === b) return false;
  if (!a || !b) return true;
  return !coveredRoute(s, a, b);
}

// ── hatches ───────────────────────────────────────────────────────────────

export interface Hatch {
  runId: string;
  end: 0 | 1;
  at: Pt;
  /** The yard it comes up in, or null: out in the open. */
  yard: string | null;
  /** Comes up outside every wall: a way in if found. */
  exposed: boolean;
  /** Its blast door is bolted. */
  locked: boolean;
}

export function hatches(s: GameState, rings: readonly PerimeterRun[] = yardRings(s)): Hatch[] {
  const out: Hatch[] = [];
  for (const r of s.perimeter) {
    if (!runFinished(r) || !PERIMETER[r.kind].twoWay || r.pts.length < 2) continue;
    ([0, 1] as const).forEach(end => {
      const at = end === 0 ? r.pts[0] : r.pts[r.pts.length - 1];
      const yard = yardAt(rings, at);
      out.push({ runId: r.id, end, at, yard, exposed: yard === null, locked: !r.unlocked });
    });
  }
  return out;
}

/** Bolt or unbolt a passage's blast doors. */
export function setPassageLocked(s: GameState, id: string, locked: boolean): void {
  const r = s.perimeter.find(x => x.id === id);
  if (r && PERIMETER[r.kind].twoWay) r.unlocked = !locked;
}

/** Chance a crew stumbles on a hidden hatch, once, in a raid. A revealed passage (a dig broke into it) is far easier. */
export const HATCH_FOUND = 0.08, HATCH_FOUND_REVEALED = 0.5;
/** Chance a locked blast door holds against ordinary raiders / a crew with explosives. */
export const DOOR_HOLDS = 0.97, DOOR_HOLDS_BLASTED = 0.6;

/**
 * Does a crew get in by a passage's hatch? Only an exposed hatch is a way in
 * at all, and only if found. Draws from `r` only when there is one (so a
 * place without a passage plays out exactly as before). Returns the run, or null.
 */
export function passageEntry(s: GameState, r: () => number, organized: boolean): { runId: string; forced: boolean } | null {
  for (const h of hatches(s)) {
    if (!h.exposed) continue;
    const run = s.perimeter.find(x => x.id === h.runId)!;
    if (r() >= (run.revealed ? HATCH_FOUND_REVEALED : HATCH_FOUND)) continue;
    if (!h.locked) return { runId: h.runId, forced: false };
    if (r() >= (organized ? DOOR_HOLDS_BLASTED : DOOR_HOLDS)) return { runId: h.runId, forced: true };
  }
  return null;
}

/** An alarm or a raid starts: every passage's blast doors bolt themselves (the player can unbolt them again from the Defense tab). */
export function boltPassages(s: GameState): void {
  for (const r of s.perimeter) if (PERIMETER[r.kind].twoWay) r.unlocked = false;
}

/** A doorway in a yard wall where a walkway meets it: wide enough for the walk's frame (≈ 2.3 m). */
export const DOORWAY_W = 0.38;

/**
 * Where a covered walkway's end meets a yard's ring of wall, cut a doorway
 * (a gate) in that wall so people can walk through from yard to yard. The
 * walkway is enclosed, so the doorway is part of the closed ring (a gate in a
 * ring still counts as wall for the ring check), not a gap in the defense
 * score. Adds the gate to the ring run; returns the rings opened.
 */
export function openDoorways(s: GameState, walk: PerimeterRun): string[] {
  const opened: string[] = [];
  const rings = s.perimeter.filter(r => r.id !== walk.id && PERIMETER[r.kind].blocks.people >= 0.5 && r.pts.length > 3 && !PERIMETER[r.kind].walkway
    && Math.hypot(r.pts[0][0] - r.pts.at(-1)![0], r.pts[0][1] - r.pts.at(-1)![1]) < 0.6);
  for (const end of [walk.pts[0], walk.pts[walk.pts.length - 1]]) {
    let best: { r: PerimeterRun; s: number; d: number } | null = null;
    for (const r of rings) { const n = nearest(r.pts, end[0], end[1]); if (n.d <= JOIN_REACH && (!best || n.d < best.d)) best = { r, s: n.s, d: n.d }; }
    if (!best) continue;
    const L = best.r.pts.reduce((a, p, i) => a + (i ? Math.hypot(p[0] - best!.r.pts[i - 1][0], p[1] - best!.r.pts[i - 1][1]) : 0), 0);
    const at = Math.min(L - DOORWAY_W / 2, Math.max(DOORWAY_W / 2, best.s));
    if (best.r.gates.some(g => Math.abs(g.at - at) < (g.w + DOORWAY_W) / 2)) continue;
    best.r.gates.push({ at, w: DOORWAY_W });
    // a wall already finished is cut through: its hours and bill are unchanged (a few panels fewer); the opening is framed by the walkway
    opened.push(best.r.id);
  }
  return opened;
}
