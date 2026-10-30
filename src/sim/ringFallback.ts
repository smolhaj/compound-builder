/**
 * Falling back ring by ring (docs/DECISIONS.md, "Defenders fall back ring by ring"). The manned rings of
 * sim/rings.ts used to be one flat number of seconds at the line. Now a raid meets them one at a time:
 *
 *  - `ringRadii`: the manned inner rings round the home, outermost first (radius, wall kind), for the battle;
 *  - the battle (`planBattle`) holds the outer line, and when the crew breaks it the defenders fall back to
 *    the next ring: the wounded are carried in to the sickbay (the shelter), the posts move, the crew has to
 *    take the next wall under fire. Only the innermost ring breaking is a breach of the house;
 *  - `lossesByRing`: who was hurt or killed while each ring was the line;
 *  - `exposure`: what stood outside the ring that held: animals in their barns and yards, stores in the
 *    sheds and cellars out there (a raid that fell back and then held loses only those, never the whole camp);
 *  - `vetting`: strangers on probation sleep in the outer ring until they are trusted, so a thief reaches
 *    only what stands there (the gate card says so).
 * Pure (tested).
 */
import type { GameState } from './state';
import type { PerimeterKind, Pt } from './perimeter';
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { enclosure } from './enclosure';
import { RING, ringsAround, ringsHolding } from './rings';
import type { BattleEvent, BattleUnit } from './battleTypes';

export interface RingLine { r: number; kind: PerimeterKind }

const meanR = (pts: readonly Pt[], c: Pt): number => pts.reduce((a, p) => a + Math.hypot(p[0] - c[0], p[1] - c[1]), 0) / Math.max(1, pts.length);

/** Is the property line closed (it is then the outermost ring)? */
const lineClosed = (s: GameState): boolean => { const e = enclosure(s); return e.openShare === 0 && e.creekOpen === 0; };

/**
 * The manned inner rings round `c`, outermost first, that lie inside the line at `lineR`. A raid meets them in this order. Rings nobody can
 * man (`ringsHolding`) are not counted: the innermost go unmanned first.
 */
export function ringRadii(s: GameState, c: { x: number; z: number }, lineR: number): RingLine[] {
  const around = ringsAround(s, [c.x, c.z]).map(r => ({ r: meanR(r.pts, [c.x, c.z]), kind: r.kind })).sort((a, b) => b.r - a.r);
  const inner = lineClosed(s) ? around : around.slice(1);
  const manned = Math.max(0, ringsHolding(s) - 1);
  const out: RingLine[] = [];
  for (const x of inner) {
    if (x.r >= lineR - 1 || x.r <= 2.4) continue;
    if (out.length && out[out.length - 1].r - x.r < 0.8) continue;
    out.push(x);
  }
  return out.slice(0, manned);
}

/** Seconds the crew spends at each inner ring before it gives (a sally port never shortens it; its worth is the sortie). */
export function ringDelay(_s: GameState, inner: number): number {
  if (inner <= 0) return 0;
  return RING.DELAY;
}

export interface RingLoss { ring: number; wounded: number; dead: number }

/** Who was hurt and who died while each ring was the line: ring 0 is the outer line, ring k the k-th fall-back. */
export function lossesByRing(events: readonly BattleEvent[], units: readonly BattleUnit[], falls: ReadonlyArray<number>): RingLoss[] {
  const home = new Set(units.filter(u => u.side === 'home').map(u => u.id));
  const out: RingLoss[] = Array.from({ length: falls.length + 1 }, (_, ring) => ({ ring, wounded: 0, dead: 0 }));
  const ringAt = (t: number) => { let k = 0; while (k < falls.length && t >= falls[k]) k++; return k; };
  for (const e of events) {
    if (e.kind === 'wound' && !e.stopped && home.has(e.unit)) out[ringAt(e.t)].wounded++;
    else if (e.kind === 'death' && home.has(e.unit)) out[ringAt(e.t)].dead++;
  }
  return out;
}

/** The structures with animals in them, and with the stores in them. */
export const ANIMAL_KINDS: readonly string[] = ['barn', 'sheep_barn', 'barnyard', 'chicken_coop'];
export const STORE_KINDS: readonly string[] = ['root_cellar', 'bunker_stores', 'workshop'];

/** How many nested finished rings (the closed property line counted) a point is inside: 0 is outside everything. */
export function depthAt(s: GameState, p: Pt): number {
  return ringsAround(s, p).length + (lineClosed(s) ? 1 : 0);
}

/**
 * What stood outside the ring that held, after `fell` fall-backs (0 = the outer line held): the share of the animal housing and of the store
 * buildings that sat outside the ring the crew reached. 0 with no rings.
 */
export function exposure(s: GameState, fell: number): { animals: number; stores: number } {
  if (fell <= 0) return { animals: 0, stores: 0 };
  const fin = s.structures.filter(isFinished);
  const share = (kinds: readonly string[]) => {
    const list = fin.filter(st => kinds.includes(st.kind));
    if (!list.length) return 0;
    return list.filter(st => depthAt(s, [st.x, st.z]) <= fell).length / list.length;
  };
  return { animals: share(ANIMAL_KINDS), stores: share(STORE_KINDS) };
}

/** Share of the animals a crew that reached the outer ring drives off or butchers (a night's work, not the whole herd). */
export const OUTSIDE_TAKE = 0.35;

export interface Vetting { rings: number; /** The share of the camp's stores a thief on probation can reach (1 = all). */ reach: number; line: string | null }

/**
 * Strangers on probation are put up in the outermost ring; they come inside the inner rings when trusted. With two or more manned rings a thief
 * reaches only the stores in the outer ring (the share of store buildings out there, at least a fifth: the shelves in the house are the camp's).
 */
export function vetting(s: GameState): Vetting {
  const rings = ringsHolding(s);
  if (rings < 2) return { rings, reach: 1, line: null };
  const homes = s.structures.filter(st => isHome(st.kind) && isFinished(st));
  const stores = s.structures.filter(st => isFinished(st) && STORE_KINDS.includes(st.kind));
  const inner = stores.filter(st => depthAt(s, [st.x, st.z]) >= 2).length;
  const outerShare = stores.length ? 1 - inner / stores.length : (homes.length ? 0.5 : 1);
  const reach = Math.max(0.2, Math.min(1, outerShare));
  return { rings, reach, line: `You hold ${rings} rings: strangers on probation sleep in the outer ring and are searched at its gate. A thief among them could reach about ${Math.round(reach * 100)} % of your stores.` };
}
