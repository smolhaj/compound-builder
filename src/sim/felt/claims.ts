/**
 * Checkable claims (docs/FELT_LAYER.md section 5.3). Every felt radio line asserts a fact about the world; the fact is a small JSON `Claim`
 * (so it saves with the `Heard` entry) and `evalClaim` reads it off the live sim. A false line is false because its claim evaluates false
 * today, and scouting (sim/rumors.ts `scoutDay`) resolves "confirmed" or "false" by evaluating the claim again on the day the scout is back.
 * Pure: reads the state, never writes it.
 */
import { canOrder, TRACKS, TRACK_NAME, type Track } from '../disaster';
import { prices } from '../economy';
import type { RumorKind } from '../radio';
import { dayIndex, type GameState } from '../state';
import { ashDepth, ashOptsOf } from '../ashState';
import { domesOf, stateOf } from '../dome/live';

/** The services' bands, shared by the feed and the radio: out (under a quarter, the line `canOrder` uses), patchy, working. */
export const OUT_BELOW = 0.25, WORKING_FROM = 0.65;

export type ClaimId =
  | 'svc_out' | 'svc_up' | 'law_low' | 'neighbor_away' | 'neighbors_away' | 'price_ge' | 'ordering' | 'relief_none' | 'relief_partial' | 'relief_here'
  | 'city_open' | 'no_deliveries' | 'requisition' | 'creek_unsafe' | 'alert_lifted' | 'kind_active'
  /** Kind talk (radioKinds.ts): a service under n percent, n or more days since the hit, ash n inches deep, n percent of the county sick. */
  | 'track_lt' | 'days_ge' | 'ash_ge' | 'sick_ge'
  /** A finished dome stands on the place; one is sealed (sim/dome/live.ts). */
  | 'dome_stands' | 'dome_sealed';
/** `a` is a track, a neighbor id or a kind; `n` a count, a percent or a price level. */
export interface Claim { id: ClaimId; a?: string; n?: number }

/** Kinds that foul the creek (so "the creek is poisoned" is true there and only a false rumor elsewhere). */
const FOUL_WATER = new Set(['nuclear', 'bioweapon', 'reactor_meltdown', 'supervolcano', 'asteroid']);

const level = (s: GameState, t: Track): number => s.disaster.tracks[t] ?? 1;
const since = (s: GameState): number => s.clock.t - s.disaster.hitAt;
export const awayCount = (s: GameState): number => s.neighbors.filter(n => n.status === 'left' || n.status === 'gone').length;

/** The track that is worst off (lowest level), among those under `below`; ties go to the order of TRACKS. */
export function worstTrack(s: GameState, below = OUT_BELOW): Track | null {
  let best: Track | null = null;
  for (const t of TRACKS) if (level(s, t) < below && (best === null || level(s, t) < level(s, best))) best = t;
  return best;
}
/** A track that has come back (its own day passed and it is working again), if any. */
export function recoveredTrack(s: GameState): Track | null {
  const d = s.disaster, sn = since(s);
  for (const t of TRACKS) { const b = d.back[t]; if (b !== undefined && b < sn && level(s, t) >= WORKING_FROM) return t; }
  return null;
}

/** The share of the county sick today (percent), read from the outbreak's saved waves; 0 when there is no outbreak. Never creates state. */
export function sickPercent(s: GameState): number {
  const o = s.disaster.fx?.outbreak as { waves?: Array<{ peak: number; width: number; prev: number }> } | undefined;
  if (!o?.waves) return 0;
  const day = Math.max(0, Math.floor(since(s)));
  let p = 0;
  for (const w of o.waves) p = Math.max(p, w.prev * Math.exp(-(((day - w.peak) / w.width) ** 2)));
  return Math.round(p * 1000) / 10;
}

/** Is the claim true in this world today? */
export function evalClaim(s: GameState, c: Claim): boolean {
  const d = s.disaster;
  switch (c.id) {
    case 'svc_out': return level(s, c.a as Track) < OUT_BELOW;
    case 'svc_up': return level(s, c.a as Track) >= WORKING_FROM;
    case 'law_low': return level(s, 'law') < 0.4;
    case 'neighbor_away': { const n = s.neighbors.find(x => x.id === c.a); return !!n && (n.status === 'left' || n.status === 'gone'); }
    case 'neighbors_away': return awayCount(s) >= (c.n ?? 1);
    case 'price_ge': return prices(s) >= (c.n ?? 1);
    case 'ordering': return canOrder(d, s.clock.t) === (c.a !== 'closed');
    case 'relief_none': return d.fate === 'never' && since(s) >= 20;
    case 'relief_partial': return d.fate === 'partial' && since(s) >= 30;
    case 'relief_here': { const day = dayIndex(s.clock.t); return !!s.road?.recent.some(x => x.cls === 'convoy' && x.seen && x.day >= day - 7); }
    case 'city_open': return level(s, 'stores') >= WORKING_FROM && level(s, 'deliveries') >= WORKING_FROM;
    case 'no_deliveries': return level(s, 'deliveries') < OUT_BELOW;
    case 'requisition': return s.road?.mark?.kind === 'requisition';
    case 'creek_unsafe': return !!d.kind && FOUL_WATER.has(d.kind);
    case 'alert_lifted': return TRACKS.every(t => level(s, t) >= 0.8);
    case 'kind_active': return d.kind === c.a && s.clock.t >= d.hitAt;
    case 'track_lt': return level(s, c.a as Track) < (c.n ?? 50) / 100;
    case 'days_ge': return since(s) >= (c.n ?? 0);
    case 'ash_ge': { const o = ashOptsOf(d.kind); return !!o && ashDepth(s, o) >= (c.n ?? 1); }
    case 'sick_ge': return sickPercent(s) >= (c.n ?? 1);
    case 'dome_stands': return domesOf(s).length > 0;
    case 'dome_sealed': return domesOf(s).some(d => stateOf(s, d).lockdown);
  }
}

/** The word a scouted rumor of this claim goes under (sim/rumors.ts has a line for each when it is found false). */
export function claimRumorKind(c: Claim): RumorKind {
  switch (c.id) {
    case 'relief_none': case 'relief_partial': case 'relief_here': return 'relief';
    case 'city_open': return 'city';
    case 'requisition': return 'checkpoint';
    case 'creek_unsafe': return 'poison';
    default: return 'service';
  }
}

/** A short plain name for the claim's subject, for the log ("Grid power"). */
export const claimTrackName = (c: Claim): string => c.a && c.a in TRACK_NAME ? TRACK_NAME[c.a as Track] : '';
