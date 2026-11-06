/**
 * Water works: the moat (a dug ditch filled from the creek or a pond) and the covered timber bridge over it or over a creek
 * (docs/DECISIONS.md, "Moat and covered bridge"). Pure (tested).
 *
 *  Fill        a finished moat is fed by a leat from a creek within `FEED_REACH` of its line (full, in `FILL_DAYS.creek` days) or from a pond
 *              (0.9, slower); with neither it holds only rain and seep (0.35). In a hard freeze it is ice: a man crosses it with a plank.
 *  Battle      a crew coming across the moat is held `CROSS_S` x level before the first of them is over and is hurt wading it (cold shock, a
 *              fall, a rifle lost). Where a covered bridge crosses that moat they go by the bridge instead: they walk to it, and at its plank
 *              gate (held like a tunnel door: sim/terrainFx `doorDelay`) come single file under the roof, no wading. A gap left in the ditch for the drive
 *              is a causeway: the same walk and the file, no gate.
 *  Digging     a filled moat floods a tunnel dug within `DITCH_REACH` of it, as a ditch does (sim/tunnelers.ts).
 *  Rule        everything here only adds time or hurt to a crew; a lot with a moat is never easier to raid than the same lot without it.
 */
import type { GameState } from './state';
import { runFinished, wallLength, type PerimeterRun, type Pt } from './perimeter';
import { groundOf } from './terrainState';
import { regionFor } from './climate';
import { calendarOf } from './state';
import { doorDelay } from './terrainFx';
import { nearest } from './enclosure';
import { isFinished } from './construction';
import { lengthText } from './units';

export const WATER = {
  /** A leat can bring water from this far (world units; 14 = 84 m). */
  FEED_REACH: 14,
  /** Days to fill after the last spade, by source. */
  FILL_DAYS: { creek: 5, pond: 12, rain: 30 },
  /** Highest level by source (0-1). */
  CAP: { creek: 1, pond: 0.9, rain: 0.35 },
  /** Seconds a crew is held at a full moat before the first are across, with no bridge. */
  CROSS_S: 14,
  /** Per raider at the water each second: the chance he goes under (cold shock, a fall), and how hurt (hp). */
  WADE_P: 0.05, HAZ_MIN: 15, HAZ_MAX: 45,
  /** Thin ice carries a man: the hold falls to this share and the hurt rises (it breaks under some). */
  ICE_HOLD: 0.3, ICE_HAZ: 1.4,
  /** A bridge: the crew files across, seconds lost on the deck; and the walk to it along the moat (m/s). */
  FUNNEL_S: 4, WALK_MPS: 3.6, DETOUR_CAP_S: 30,
  /** Longest and shortest a timber bridge spans (metres), and the water it needs under it. */
  BRIDGE_MIN_M: 6, BRIDGE_MAX_M: 40,
} as const;

export type FeedSource = 'creek' | 'pond' | 'rain';

export interface MoatState {
  run: PerimeterRun;
  source: FeedSource;
  /** 0-1, how full. */
  level: number;
  frozen: boolean;
}

const segX = (a: Pt, b: Pt, c: Pt, d: Pt): boolean => {
  const o = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};
const polyX = (pts: readonly Pt[], a: Pt, b: Pt): Pt | null => {
  for (let i = 1; i < pts.length; i++) if (segX(pts[i - 1], pts[i], a, b)) return [(pts[i - 1][0] + pts[i][0]) / 2, (pts[i - 1][1] + pts[i][1]) / 2];
  return null;
};

/** The point `d` along a polyline. */
function pointAt(pts: readonly Pt[], d: number): Pt {
  let left = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az);
    if (left <= l || i === pts.length - 1) { const t = l > 0 ? Math.min(1, left / l) : 0; return [ax + (bx - ax) * t, az + (bz - az) * t]; }
    left -= l;
  }
  return pts[0];
}

/** The day's mean air temperature (F) from the region's July high and January low. */
export function airF(s: GameState): number {
  const r = regionFor(s.site), mid = (r.julyHighF + r.janLowF) / 2, amp = (r.julyHighF - r.janLowF) / 2;
  return mid + amp * Math.cos(2 * Math.PI * (calendarOf(s.clock).doy - 197) / 365);
}

/** Where a moat's water comes from: a creek or pond within the leat's reach of its line, else rain. */
export function moatSource(s: GameState, run: Pick<PerimeterRun, 'pts'>): FeedSource {
  const g = groundOf(s);
  if (g?.creek) {
    const c = g.creek;
    for (let i = 1; i < run.pts.length; i++) {
      const [ax, az] = run.pts[i - 1], [bx, bz] = run.pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1));
      for (let k = 0; k <= n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n; if (Math.abs(z - c.zAt(x)) - c.halfWidth <= WATER.FEED_REACH) return 'creek'; }
    }
  }
  const ponds = s.structures.filter(st => st.kind === 'pond' && !st.unplaced && isFinished(st));
  if (ponds.some(p => nearest(run.pts, p.x, p.z).d <= WATER.FEED_REACH)) return 'pond';
  return 'rain';
}

/** How full a finished moat is today, and whether it is ice. Null for a run that is not a standing moat. */
export function moatState(s: GameState, run: PerimeterRun): MoatState | null {
  if (run.kind !== 'moat' || !runFinished(run) || run.pts.length < 2) return null;
  const source = moatSource(s, run);
  const level = Math.min(1, Math.max(0, (s.clock.t - (run.finishedAt ?? 0)) / WATER.FILL_DAYS[source])) * WATER.CAP[source];
  const frozen = airF(s) <= (source === 'creek' ? 14 : 24);
  return { run, source, level, frozen };
}

export const moatStates = (s: GameState): MoatState[] => s.perimeter.map(r => moatState(s, r)).filter((m): m is MoatState => !!m);

export interface BridgeInfo { run: PerimeterRun; over: 'moat' | 'creek' | null; moat?: string; mid: Pt; lenM: number }

/** What a covered bridge crosses: a moat (its line crosses the deck) or the creek (the deck spans the channel). */
export function bridgeOver(s: GameState, pts: readonly Pt[], moats: readonly PerimeterRun[] = s.perimeter.filter(r => r.kind === 'moat' && r.pts.length > 1)): { over: 'moat' | 'creek' | null; moat?: string } {
  if (pts.length < 2) return { over: null };
  const a = pts[0], b = pts[pts.length - 1];
  for (const m of moats) if (polyX(m.pts, a, b)) return { over: 'moat', moat: m.id };
  const c = groundOf(s)?.creek;
  if (c) {
    const side = (p: Pt) => Math.sign(p[1] - c.zAt(p[0]));
    if (side(a) !== side(b) && side(a) !== 0 && side(b) !== 0) return { over: 'creek' };
  }
  return { over: null };
}

/** Why a covered bridge cannot be laid from the first to the last point (null = it can). */
export function bridgeProblem(s: GameState, pts: readonly Pt[]): string | null {
  if (pts.length < 2) return null;
  const a = pts[0], b = pts[pts.length - 1], lenM = Math.hypot(b[0] - a[0], b[1] - a[1]) * 6;
  if (lenM < WATER.BRIDGE_MIN_M) return `too short: a bridge spans at least ${lengthText(WATER.BRIDGE_MIN_M)} of water`;
  if (lenM > WATER.BRIDGE_MAX_M) return `too long: ${lengthText(lenM)} is more than a timber truss spans (${lengthText(WATER.BRIDGE_MAX_M)} at the most)`;
  if (!bridgeOver(s, pts).over) return 'nothing to cross: lay the bridge right across your moat (lay the moat first) or across the creek, bank to bank';
  return null;
}

/** Build-menu grey-out for the bridge: nothing on the land to cross yet. */
export function bridgeOff(s: GameState): string | null {
  if (s.perimeter.some(r => r.kind === 'moat' && r.pts.length > 1)) return null;
  return groundOf(s)?.creek ? null : 'no creek on this land and no moat laid yet: a covered bridge needs water to cross';
}

/** Every covered bridge that stands (finished), with what it crosses. */
export function standingBridges(s: GameState): BridgeInfo[] {
  const out: BridgeInfo[] = [];
  const moats = s.perimeter.filter(r => r.kind === 'moat' && r.pts.length > 1);
  for (const r of s.perimeter) {
    if (r.kind !== 'covered_bridge' || !runFinished(r) || r.pts.length < 2) continue;
    const o = bridgeOver(s, r.pts, moats), a = r.pts[0], b = r.pts[r.pts.length - 1];
    out.push({ run: r, ...o, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], lenM: Math.round(wallLength(r) * 6) });
  }
  return out;
}

export interface MoatFx {
  /** Seconds before the first of the crew is across (added to the wall's own climb time). */
  holdS: number;
  /** Per raider at the line each second; null when they cross by the bridge (dry). */
  hazard: { p: number; min: number; max: number; what: string } | null;
  bridged: boolean;
  frozen: boolean;
  level: number;
}

/**
 * What the moat does to a crew coming at the camp from the bearing `ang` (radians) from `c`: nothing unless a filled moat lies across that line.
 * With a bridge over it they walk to the bridge and file across its gate.
 */
export function moatFx(s: GameState, c: Pt, ang: number, night: boolean, detection = 0): MoatFx | null {
  const far: Pt = [c[0] + Math.cos(ang) * 60, c[1] + Math.sin(ang) * 60];
  let best: { m: MoatState; at: Pt } | null = null;
  for (const m of moatStates(s)) {
    if (m.level < 0.15) continue;
    const at = polyX(m.run.pts, c, far);
    if (at && (!best || m.level > best.m.level)) best = { m, at };
  }
  if (!best) return null;
  const { m, at } = best;
  // where the line meets the creek the creek itself is the moat: full water, whatever the ditch holds
  const cr = groundOf(s)?.creek;
  const lvl = cr && Math.abs(at[1] - cr.zAt(at[0])) < cr.halfWidth + 2.5 ? 1 : m.level;
  const ice = m.frozen;
  // the ways over it: a bridge (single file, held at its plank gate) or a gap left in the ditch for the drive (a causeway: the walk and the file, no gate)
  const ways: Array<{ at: Pt; hold: number }> = standingBridges(s).filter(b => b.over === 'moat' && b.moat === m.run.id).map(b => ({ at: b.mid, hold: WATER.FUNNEL_S + doorDelay(night, detection) }));
  for (const g of m.run.gates) ways.push({ at: pointAt(m.run.pts, g.at), hold: WATER.FUNNEL_S });
  const way = ways.map(w => ({ ...w, total: Math.min(WATER.DETOUR_CAP_S, Math.hypot(w.at[0] - at[0], w.at[1] - at[1]) * 6 / WATER.WALK_MPS) + w.hold })).sort((x, y) => x.total - y.total)[0];
  if (way) return { holdS: way.total, hazard: null, bridged: true, frozen: ice, level: lvl };
  const k = lvl * (ice ? WATER.ICE_HOLD : 1);
  return { holdS: WATER.CROSS_S * k, hazard: { p: WATER.WADE_P * lvl * (ice ? WATER.ICE_HAZ : 1), min: WATER.HAZ_MIN, max: WATER.HAZ_MAX, what: ice ? 'thin ice' : 'cold water' }, bridged: false, frozen: ice, level: lvl };
}

/** Plain words for the Defense tab: each moat's fill and each bridge's crossing. */
export function waterLines(s: GameState): string[] {
  const out: string[] = [];
  for (const m of moatStates(s)) {
    const src = m.source === 'creek' ? 'fed from the creek' : m.source === 'pond' ? 'fed from the pond' : 'rain and seep only (no creek or pond within reach)';
    out.push(`Moat, ${lengthText(wallLength(m.run) * 6)}: ${Math.round(m.level * 100)}% full, ${src}${m.frozen ? '; frozen, a crew walks it' : ''}.`);
  }
  for (const b of standingBridges(s)) out.push(`Covered bridge over ${b.over === 'moat' ? 'the moat' : b.over === 'creek' ? 'the creek' : 'nothing'}, ${lengthText(b.lenM)}: a crew files over it behind a plank gate.`);
  return out;
}
