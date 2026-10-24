/**
 * The underground layer (GDS §2.2): bunker rooms dug in below the yard.
 * Pure rules (tested):
 *
 *  • A bunker starts at an entrance (a hatch shaft or a stairwell); every
 *    other room must share a wall (at least one build cell) with a room
 *    already planned, so the bunker grows room by room.
 *  • All rooms of one bunker share one floor level, the datum: the ground
 *    at its first entrance less DEPTH (≈ 4.8 m).
 *  • Each room needs earth over its roof slab (MIN_COVER) but can't be
 *    dug deeper than MAX_COVER below the ground.
 *  • Rooms go under the yard, gardens, even houses, but not under the
 *    creek, wells, tanks or the septic field (the deep surface pieces).
 *  • Rooms that share a wall get a doorway through it, at the middle of
 *    the shared length.
 */
import { CELL, footprint, KIT, placementProblem, rotQ, type KitPieceDef, type Placed, type PlaceProblem, type SiteQuery } from './kit';

/** Floor of a bunker below the ground at its entrance (world units; ≈ 4.8 m). */
export const DEPTH = 0.8;
/** Top of a room's roof slab above its floor (2.5 m clear + 0.3 m slab). */
export const ROOF_TOP = 0.47;
/** Earth needed over the roof slab (≈ 0.9 m), and the most that can be dug (≈ 6 m). */
export const MIN_COVER = 0.15;
export const MAX_COVER = 1.0;

export type Level = 'surface' | 'underground' | 'both';

/** Which level a piece occupies: entrances reach both; wells, tanks and septic fields go deep. */
export function levelOf(def: KitPieceDef): Level {
  return def.level ?? 'surface';
}

export function isUnderground(def: KitPieceDef): boolean {
  return levelOf(def) !== 'surface' && def.category === 'bunker';
}

export function isEntry(def: KitPieceDef): boolean {
  return def.category === 'bunker' && levelOf(def) === 'both';
}

type Rect = { x0: number; z0: number; x1: number; z1: number };

/** Two rects touching along an edge: which side of `a` and the shared interval (world), or null. */
export function sharedEdge(a: Rect, b: Rect, eps = 1e-6): { side: 'x0' | 'x1' | 'z0' | 'z1'; from: number; to: number } | null {
  const ovZ = [Math.max(a.z0, b.z0), Math.min(a.z1, b.z1)] as const;
  const ovX = [Math.max(a.x0, b.x0), Math.min(a.x1, b.x1)] as const;
  if (Math.abs(a.x1 - b.x0) < eps && ovZ[1] - ovZ[0] > eps) return { side: 'x1', from: ovZ[0], to: ovZ[1] };
  if (Math.abs(a.x0 - b.x1) < eps && ovZ[1] - ovZ[0] > eps) return { side: 'x0', from: ovZ[0], to: ovZ[1] };
  if (Math.abs(a.z1 - b.z0) < eps && ovX[1] - ovX[0] > eps) return { side: 'z1', from: ovX[0], to: ovX[1] };
  if (Math.abs(a.z0 - b.z1) < eps && ovX[1] - ovX[0] > eps) return { side: 'z0', from: ovX[0], to: ovX[1] };
  return null;
}

const rectOf = (p: Placed) => footprint(KIT[p.kind], p.x, p.z, p.rot, false);

/** Rooms that connect to `r` (share at least one cell of wall). */
function neighbours(r: Rect, placed: readonly Placed[], skip?: string): Placed[] {
  return placed.filter(p => p.id !== skip && KIT[p.kind] && isUnderground(KIT[p.kind]) && (() => {
    const e = sharedEdge(r, rectOf(p));
    return e !== null && e.to - e.from >= CELL - 1e-6;
  })());
}

const idNum = (id: string) => Number(id.replace(/\D/g, '')) || 0;

/**
 * Bunkers: each underground piece's bunker root (its first entrance by
 * plan order). Pieces not joined to any entrance map to null.
 */
export function bunkerRoots(placed: readonly Placed[]): Map<string, string | null> {
  const ug = placed.filter(p => KIT[p.kind] && isUnderground(KIT[p.kind]));
  const parent = new Map(ug.map(p => [p.id, p.id]));
  const find = (id: string): string => { let r = id; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(id, r); return r; };
  for (const p of ug) for (const q of neighbours(rectOf(p), ug, p.id)) {
    const a = find(p.id), b = find(q.id);
    if (a !== b) parent.set(a, b);
  }
  const rootEntry = new Map<string, string>();
  for (const p of [...ug].sort((a, b) => idNum(a.id) - idNum(b.id))) {
    if (!isEntry(KIT[p.kind])) continue;
    const r = find(p.id);
    if (!rootEntry.has(r)) rootEntry.set(r, p.id);
  }
  return new Map(ug.map(p => [p.id, rootEntry.get(find(p.id)) ?? null]));
}

/** Floor level of the bunker an entrance at (x, z) starts. */
export const entryDatum = (groundAt: (x: number, z: number) => number, x: number, z: number) => groundAt(x, z) - DEPTH;

/** Floor level (world y) of each underground piece, by its bunker's entrance. Unjoined pieces are missing. */
export function datums(placed: readonly Placed[], groundAt: (x: number, z: number) => number): Map<string, number> {
  const roots = bunkerRoots(placed);
  const out = new Map<string, number>();
  for (const [id, root] of roots) {
    if (!root) continue;
    const e = placed.find(p => p.id === root)!;
    out.set(id, entryDatum(groundAt, e.x, e.z));
  }
  return out;
}

export type Side = 'front' | 'back' | 'left' | 'right';

/**
 * Doorways of an underground piece, by local side, at the local coordinate
 * along that wall (x for front / back, z for left / right): the middle of
 * the length it shares with each neighbour.
 */
export function doorsOf(p: Placed, placed: readonly Placed[]): Partial<Record<Side, number>> {
  const r = rectOf(p), out: Partial<Record<Side, number>> = {};
  const q = ((p.rot % 4) + 4) % 4;
  for (const n of neighbours(r, placed, p.id)) {
    const e = sharedEdge(r, rectOf(n))!;
    const mid = (e.from + e.to) / 2;
    // the world point at the middle of the shared edge, back into the piece's local frame
    const wx = e.side === 'x0' ? r.x0 : e.side === 'x1' ? r.x1 : mid;
    const wz = e.side === 'z0' ? r.z0 : e.side === 'z1' ? r.z1 : mid;
    const [lx, lz] = rotQ(wx - p.x, wz - p.z, (4 - q) % 4);
    const def = KIT[p.kind], hx = def.cellsX * CELL / 2, hz = def.cellsZ * CELL / 2;
    if (Math.abs(lz - hz) < 1e-4) out.front = lx;
    else if (Math.abs(lz + hz) < 1e-4) out.back = lx;
    else if (Math.abs(lx + hx) < 1e-4) out.left = lz;
    else if (Math.abs(lx - hx) < 1e-4) out.right = lz;
  }
  return out;
}

export type UndergroundProblem = 'not_connected' | 'thin_cover' | 'too_deep';

/** Floor level a piece would have here: its neighbours' bunker, or (an entrance) a new one; null if it can't join. */
export function previewDatum(def: KitPieceDef, x: number, z: number, rot: number, height: (x: number, z: number) => number, placed: readonly Placed[]): number | null {
  const near = neighbours(footprint(def, x, z, rot, false), placed);
  if (near.length) {
    const ds = datums(placed, height);
    for (const n of near) { const d = ds.get(n.id); if (d !== undefined) return d; }
  }
  return isEntry(def) ? entryDatum(height, x, z) : null;
}

/**
 * Underground rules for a piece about to be placed (null = fine): joined
 * to a bunker (or an entrance), with enough earth over it and not too deep.
 * `height` is the natural ground.
 */
export function undergroundProblem(def: KitPieceDef, x: number, z: number, rot: number, height: (x: number, z: number) => number, placed: readonly Placed[]): UndergroundProblem | null {
  if (!isUnderground(def)) return null;
  const r = footprint(def, x, z, rot, false);
  const near = neighbours(r, placed);
  const datum = previewDatum(def, x, z, rot, height, placed);
  if (datum === null) return 'not_connected';
  // an entrance's own shaft or stair is its cover; check the rooms
  if (isEntry(def) && !near.length) return null;
  const N = Math.max(2, Math.round(Math.max(r.x1 - r.x0, r.z1 - r.z0) / CELL) * 2);
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const cover = height(r.x0 + (r.x1 - r.x0) * i / N, r.z0 + (r.z1 - r.z0) * j / N) - datum - ROOF_TOP;
    if (cover < MIN_COVER) return 'thin_cover';
    if (cover > MAX_COVER) return 'too_deep';
  }
  return null;
}

/** Every placement rule, surface and underground (null = it can go here). */
export function siteProblem(def: KitPieceDef, x: number, z: number, rot: number, site: SiteQuery, placed: readonly Placed[]): PlaceProblem | null {
  return placementProblem(def, x, z, rot, site, placed) ?? undergroundProblem(def, x, z, rot, site.height, placed);
}

// ─────────────────────────────────────────────────────────────────────────
// Escape tunnel (an egress-only way out of a bunker)
// ─────────────────────────────────────────────────────────────────────────

type Pt = [number, number];

/** The four walls of a placed piece in world coordinates, by local side. */
function walls(p: Placed): Array<{ side: Side; a: Pt; b: Pt }> {
  const def = KIT[p.kind], hx = def.cellsX * CELL / 2, hz = def.cellsZ * CELL / 2;
  const w = (lx: number, lz: number): Pt => { const [x, z] = rotQ(lx, lz, p.rot); return [p.x + x, p.z + z]; };
  return [
    { side: 'front', a: w(-hx, hz), b: w(hx, hz) }, { side: 'back', a: w(-hx, -hz), b: w(hx, -hz) },
    { side: 'left', a: w(-hx, -hz), b: w(-hx, hz) }, { side: 'right', a: w(hx, -hz), b: w(hx, hz) },
  ];
}

/**
 * Where a tunnel leaves a bunker room clicked at (x, z): the middle of the
 * nearest build cell on the nearest wall that has no doorway yet. Null if the
 * click isn't in a bunker room or every wall already has one.
 */
export function tunnelStart(x: number, z: number, placed: readonly Placed[], tunnelStarts: readonly Pt[] = []): { room: Placed; side: Side; pt: Pt } | null {
  const room = placed.find(p => KIT[p.kind] && isUnderground(KIT[p.kind]) && (() => { const r = rectOf(p); return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1; })());
  if (!room) return null;
  const used = { ...doorsOf(room, placed), ...tunnelDoorsOf(room, tunnelStarts) };
  let best: { side: Side; pt: Pt; d: number } | null = null;
  for (const { side, a, b } of walls(room)) {
    if (used[side] !== undefined) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.round(len / CELL);
    const t = Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / (len * len)));
    const k = Math.min(n - 1, Math.floor(t * n)), u = (k + 0.5) / n;
    const pt: Pt = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    const d = Math.hypot(pt[0] - x, pt[1] - z);
    if (!best || d < best.d) best = { side, pt, d };
  }
  return best ? { room, side: best.side, pt: best.pt } : null;
}

/** Doorways tunnels open in a room: tunnels whose first point lies on one of its walls (local position along it). */
export function tunnelDoorsOf(p: Placed, starts: readonly Pt[]): Partial<Record<Side, number>> {
  const out: Partial<Record<Side, number>> = {};
  const def = KIT[p.kind], hx = def.cellsX * CELL / 2, hz = def.cellsZ * CELL / 2;
  const q = ((p.rot % 4) + 4) % 4;
  for (const [x, z] of starts) {
    const [lx, lz] = rotQ(x - p.x, z - p.z, (4 - q) % 4);
    const on = (v: number, h: number) => Math.abs(Math.abs(v) - h) < 0.02;
    if (on(lz, hz) && Math.abs(lx) < hx) out[lz > 0 ? 'front' : 'back'] = lx;
    else if (on(lx, hx) && Math.abs(lz) < hz) out[lx > 0 ? 'right' : 'left'] = lz;
  }
  return out;
}

