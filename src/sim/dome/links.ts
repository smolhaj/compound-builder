/**
 * Dome links (docs/DOME_LINKS.md, owner request 2026-11-19): when a property has more than one dome, people travel between them through an
 * UNDERGROUND tunnel, an ABOVE-GROUND enclosed walkway, or BOTH (two separate links, each with its own cost and effect), instead of crossing open ground.
 *
 * A link is a small saved record (`DomeLink`) over a real run (an underground passage or a covered walkway), so the wall, ring, route, tunneler and
 * corridor models read it as they read any run. What this file adds:
 *   - the link airlock: a dedicated airlock on each dome shell (`role: 'link'`), separate from the person airlocks and the plant's service airlock;
 *   - the quote and the order (cost in US dollars and feet, hours, permits, depth, slope and water rules, min and max distance);
 *   - weather and wear on a walkway, collapse and clearing, repair;
 *   - the tunneler's reach (`tunnelReach`): a tunnel deeper than a crew can dig stays safe, a shallow one does not;
 *   - travel time (walk, plus an airlock cycle at each sealed end), redundancy, shared ring and watch, the shared feeder between two plants.
 * Everything marked PROPOSED in docs/DECISIONS.md is a tunable in `LINK`. Pure (tested in links.test.ts).
 */
import { PERIMETER, planRun, runBill, runLength, runFinished, type Pt } from '../perimeter';
import { billUsd } from './cost';
import { FT_PER_UNIT, domesOf, domeFrom, type Airlock, type Dome } from './standing';
import { airlockAt } from './standing';
import { digStops, domeRouteProblem, skirtOf } from './crossing';
import { DIG_DEPTH_FT, SKIRT_MARGIN_FT } from './siting';
import { AIRLOCK_CYCLE_S } from './siege';
import { yardGeometry, hasYard } from './plantYard';
import { MATERIALS } from '../materials';
import { groundOf } from '../terrainState';
import { bridgeOver } from '../waterWorks';
import { offLotProblem } from '../land';
import { stormNow } from '../raidConditions';
import { log } from '../economy';
import { chronicle } from '../lineage';
import { mulberry32 } from '../rng';
import { dayIndex, type GameState, type Structure } from '../state';
import { isFinished } from '../construction';
import { pluralize } from '../words';
import { towersBuilt } from '../towers';
import { yardRings, yardAt } from '../compounds';
import { WALK_MPS, DRIVE_MPS } from '../corridors';
import { type DomeLink, type LinkEnd, type LinkKind, type DownWhy, linksOf, linkRun, linkState, linkOpen, runKindOf, linkName, linkGroups, groupOf, linksBetween } from './linkGraph';

export * from './linkGraph';

/** Every tunable of the feature. PROPOSED numbers are marked in the DECISIONS row of 2026-11-19. */
export const LINK = {
  /** Shortest and longest line, shell to shell (feet): room for two airlock sleeves; the walkway is a steel span, the tunnel a bored lining. */
  MIN_GAP_FT: 30, MAX_WALK_FT: 1_200, MAX_TUNNEL_FT: 2_400,
  /** Walkway slope: up to GENTLE the walk sits on graded ground; up to MAX it rides on piers with a ramp; steeper is refused. */
  GENTLE: 0.04, MAX_SLOPE: 0.12, PIER_SPAN_FT: 30, PIER_USD: 6_500,
  /** Tunnel depth to the crown (feet): the least practical, and the step the card offers. */
  MIN_DEPTH_FT: 8, DEPTH_STEP_FT: 2,
  /** A tunnel under the creek must be this deep (feet) so the bed does not leak into it. */
  CREEK_DEPTH_FT: 20,
  /** Fit-out per foot beyond the run's own materials: walkway glazing, ribs and lights; tunnel lighting, cable, vent and pipe, and shoring that grows with depth. */
  WALK_USD_FT: 72, TUNNEL_USD_FT: 25, SHORE_USD_FT_PER_FT: 2.6,
  /** A link airlock sleeve through a dome's footing (a dome end), and a plain door or hatch at a building or yard end. */
  SLEEVE_FRAC: 0.6, DOOR_USD: 6_500,
  /** Extra work: a tunnel takes longer the deeper it goes (per foot of depth); each airlock is a day's work. */
  DEPTH_HOURS: 0.025, AIRLOCK_HOURS: 24,
  /** Wear per day (walkway in weather, tunnel in damp). */
  WEAR_WALK: 0.0009, WEAR_TUNNEL: 0.0002,
  /** What a repair costs, a share of the fit-out, and the days it takes; a collapse costs more and takes longer. */
  REPAIR_FRAC: 0.18, REPAIR_DAYS: 5, CLEAR_FRAC: 0.4, CLEAR_DAYS: 9,
  /** One plant backs up another through the feeder: a share of the partner's whole capacity that lifts the weaker (PROPOSED). */
  FEEDER_K: 0.5,
  /** A person's walk through a link: the lining slows nobody; a vehicle uses a tunnel only. */
  MIN_AIRLOCK_GAP: 0.3,
} as const;

/** The dig depth a plain crew cannot reach: the deepest plain dig plus the margin the skirt rule uses. */
export const SAFE_PLAIN_FT = DIG_DEPTH_FT[1] + SKIRT_MARGIN_FT;

// ── reading the world ──

export interface Node { type: LinkEnd['type']; id: string; x: number; z: number; r: number; dome?: Dome; st?: Structure }

/** A dome or a finished building or a yard ring, by id (the end of a link), or null. */
export function nodeOf(s: GameState, id: string): Node | null {
  const d = domesOf(s).find(x => x.id === id);
  if (d) return { type: 'dome', id, x: d.x, z: d.z, r: d.r, dome: d, st: d.structure };
  const st = s.structures.find(x => x.id === id);
  if (st && isFinished(st)) return { type: 'building', id, x: st.x, z: st.z, r: 0.9, st };
  const ring = yardRings(s).find(x => x.id === id);
  if (ring) { const c = centroid(ring.pts); return { type: 'yard', id, x: c[0], z: c[1], r: 0.2 }; }
  return null;
}
const centroid = (pts: readonly Pt[]): Pt => { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; };

/** World angle (from +z toward +x) from a to b. */
const angleTo = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.atan2(b.x - a.x, b.z - a.z);
const angDiff = (a: number, b: number): number => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };

/** The angles the dome's shell is already spoken for: person airlocks, the plant's service airlock, and other links. */
export function takenAngles(d: Dome): number[] {
  const out = d.airlocks.map(a => a.angle);
  if (hasYard(d.tier)) { const y = yardGeometry(d.tier, d.r, d.structure.rot); if (y) out.push(y.phi); }
  return out;
}

/** A free angle on the shell as near as possible to `want`: never within MIN_AIRLOCK_GAP radians of a person airlock, the service airlock or another link's. */
export function freeAngle(d: Dome, want: number): number {
  const taken = takenAngles(d), ok = (a: number): boolean => taken.every(t => angDiff(a, t) >= LINK.MIN_AIRLOCK_GAP);
  if (ok(want)) return want;
  for (let k = 1; k <= 64; k++) for (const sgn of [1, -1]) { const a = want + sgn * k * 0.05; if (ok(a)) return a; }
  return want;
}

/** The end of a link on a node, facing `toward`: the point the line leaves it, and (domes) the angle of the link airlock. */
export function endFor(n: Node, toward: { x: number; z: number }): { end: LinkEnd; inner: Pt[] } {
  if (n.dome) {
    const a = freeAngle(n.dome, angleTo(n, toward)), al = airlockAt(n.dome.tier, n.x, n.z, n.dome.r, a, 99);
    return { end: { type: 'dome', id: n.id, x: al.outX, z: al.outZ, angle: a }, inner: [[al.inX, al.inZ], [al.x, al.z]] };
  }
  const a = angleTo(n, toward), p: Pt = [n.x + Math.sin(a) * n.r, n.z + Math.cos(a) * n.r];
  return { end: { type: n.type, id: n.id, x: p[0], z: p[1] }, inner: [] };
}

/** The end of a link on a node, from the state (a yard's end sits on its wall). */
export function endForState(s: GameState, n: Node, toward: { x: number; z: number }): { end: LinkEnd; inner: Pt[] } {
  if (n.type === 'yard') {
    const ring = yardRings(s).find(x => x.id === n.id);
    if (ring) { const p = closestOn(ring.pts, toward); return { end: { type: 'yard', id: n.id, x: p[0], z: p[1] }, inner: [] }; }
  }
  return endFor(n, toward);
}
function closestOn(pts: readonly Pt[], q: { x: number; z: number }): Pt {
  let best: Pt = pts[0], bd = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((q.x - ax) * dx + (q.z - az) * dz) / l2)) : 0, p: Pt = [ax + dx * t, az + dz * t], d = Math.hypot(q.x - p[0], q.z - p[1]);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

// ── depth and the dig ──

/** The shallowest skirt of the two ends caps the tunnel's depth (the crown stays above the footing): a non-dome end counts as a 20 ft footing. */
export function depthCapFt(a: Node, b: Node): number {
  const f = (n: Node): number => (n.dome ? skirtOf(n.dome.tier) : 20);
  return Math.min(f(a), f(b));
}
/** The depths the card offers (feet): from the least practical up to the cap, never below the cap itself when the cap is shallow. */
export function depthChoices(cap: number): number[] {
  const lo = Math.min(cap, LINK.MIN_DEPTH_FT), out: number[] = [];
  for (let d = lo; d <= cap; d += LINK.DEPTH_STEP_FT) out.push(d);
  if (out[out.length - 1] !== cap) out.push(cap);
  return out;
}
/** Share of dig attempts that reach a tunnel at this depth (0-1): the skirt rule turned round. Never rises with depth, never falls as the crew learns (property tests). */
export function tunnelReach(depthFt: number, adapt = 0): number {
  const r = 1 - digStops(depthFt, adapt);
  return r < 0.01 ? 0 : r;
}
/** Plain words for the card: how a tunnel at this depth fares against a crew that digs. */
export function depthWord(depthFt: number): string {
  const plain = tunnelReach(depthFt, 0), learned = tunnelReach(depthFt, 1);
  if (learned === 0) return 'deeper than any crew can dig';
  if (plain === 0) return 'out of reach of a plain crew; a crew that has learned this place can still dig to it';
  return 'a plain crew can dig to it';
}

// ── the quote ──

export interface LinkQuote {
  problem: string | null;
  kind: LinkKind;
  a: Node | null; b: Node | null;
  ends: [LinkEnd, LinkEnd] | null;
  pts: Pt[];
  /** Line length shell to shell, feet. */
  lenFt: number;
  depthFt?: number;
  /** Materials from the stockpile (the run's own bill), their price in dollars, the fit-out the contractor does, and the lot. */
  bill: ReturnType<typeof runBill>;
  materialsUsd: number;
  fitUsd: number;
  fitLines: Array<{ label: string; usd: number }>;
  totalUsd: number;
  hours: number;
  /** Piers a walkway needs on a slope. */
  piers: number;
}

const EMPTY = (kind: LinkKind, problem: string): LinkQuote => ({ problem, kind, a: null, b: null, ends: null, pts: [], lenFt: 0, bill: {}, materialsUsd: 0, fitUsd: 0, fitLines: [], totalUsd: 0, hours: 0, piers: 0 });

/** Slope of the ground along a line: the steepest rise over a 30 ft stretch, and the number of those stretches steeper than GENTLE. */
export function slopeAlong(s: GameState, pts: readonly Pt[]): { max: number; steep: number } {
  const g = groundOf(s);
  if (!g || pts.length < 2) return { max: 0, steep: 0 };
  const step = LINK.PIER_SPAN_FT / FT_PER_UNIT;
  let max = 0, steep = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const x0 = ax + (bx - ax) * k / n, z0 = az + (bz - az) * k / n, x1 = ax + (bx - ax) * (k + 1) / n, z1 = az + (bz - az) * (k + 1) / n;
      const sl = Math.abs(g.h(x1, z1) - g.h(x0, z0)) / Math.max(1e-6, Math.hypot(x1 - x0, z1 - z0));
      if (sl > max) max = sl;
      if (sl > LINK.GENTLE) steep++;
    }
  }
  return { max, steep };
}

/** Does the line cross open water (the creek, or a moat)? */
export const crossesWater = (s: GameState, pts: readonly Pt[]): 'creek' | 'moat' | null => bridgeOver(s, pts).over;

const money = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;

/** Quote a link of `kind` between two nodes at `depthFt` (tunnels). Never mutates. */
export function quoteLink(s: GameState, aId: string, bId: string, kind: LinkKind, depthFt?: number): LinkQuote {
  const a = nodeOf(s, aId), b = nodeOf(s, bId);
  if (!a || !b) return EMPTY(kind, 'Both ends must be finished: a dome, a building or a walled yard.');
  if (a.id === b.id) return EMPTY(kind, 'A link joins two different places.');
  if (!a.dome && !b.dome) return EMPTY(kind, 'At least one end of a dome link is a dome. (Walls and buildings link by the ordinary walkway and passage tools.)');
  const ea = endForState(s, a, b), eb = endForState(s, b, a);
  const ends: [LinkEnd, LinkEnd] = [ea.end, eb.end];
  const pts: Pt[] = [...ea.inner, [ea.end.x, ea.end.z], [eb.end.x, eb.end.z], ...[...eb.inner].reverse()];
  const lenFt = Math.round(runLength([[ea.end.x, ea.end.z], [eb.end.x, eb.end.z]]) * FT_PER_UNIT);
  const cap = depthCapFt(a, b), depth = kind === 'tunnel' ? Math.max(Math.min(LINK.MIN_DEPTH_FT, cap), Math.min(cap, depthFt ?? cap)) : undefined;
  const base: LinkQuote = { ...EMPTY(kind, null as unknown as string), a, b, ends, pts, lenFt, depthFt: depth, problem: null };
  const fail = (m: string): LinkQuote => ({ ...base, problem: m });
  if (linksBetween(s, aId, bId, false).some(l => l.kind === kind)) return fail(`These two are already joined by ${kind === 'tunnel' ? 'a tunnel' : 'a walkway'}. Build the other kind for redundancy.`);
  if (lenFt < LINK.MIN_GAP_FT) return fail(`Too close: the shells are ${lenFt} ft apart and a link needs at least ${LINK.MIN_GAP_FT} ft for its two airlocks. Walk it.`);
  const max = kind === 'tunnel' ? LINK.MAX_TUNNEL_FT : LINK.MAX_WALK_FT;
  if (lenFt > max) return fail(`Too far: ${lenFt.toLocaleString('en-US')} ft is more than ${kind === 'tunnel' ? 'a tunnel' : 'a steel walkway'} runs (${max.toLocaleString('en-US')} ft at the most).`);
  const off = offLotProblem(s, pts); if (off) return fail(off);
  // another dome in the way: the line may meet a shell only at its own link airlock
  for (const d of domesOf(s, true)) {
    if (d.id === a.id || d.id === b.id) continue;
    const why = domeRouteProblem({ structures: [d.structure] }, 'underground_passage', pts);
    if (why) return fail(`The line runs through another dome. Route it round, or link through that one.`);
  }
  const water = crossesWater(s, [pts[0], pts[pts.length - 1]]);
  let piers = 0;
  if (kind === 'walkway') {
    if (water) return fail(`A walkway cannot cross ${water === 'creek' ? 'the creek' : 'the moat'} without a bridge. Lay a covered bridge there first, or link by tunnel.`);
    const sl = slopeAlong(s, [[ea.end.x, ea.end.z], [eb.end.x, eb.end.z]]);
    if (sl.max > LINK.MAX_SLOPE) return fail(`Too steep for a walkway: the ground climbs ${Math.round(sl.max * 100)} percent along this line and ${Math.round(LINK.MAX_SLOPE * 100)} is the most a walkway rides on piers. Link by tunnel.`);
    piers = sl.steep;
  } else {
    if (water && (depth ?? 0) < LINK.CREEK_DEPTH_FT && cap >= LINK.CREEK_DEPTH_FT) return fail(`A tunnel under ${water === 'creek' ? 'the creek' : 'the moat'} must be ${LINK.CREEK_DEPTH_FT} ft deep so the bed stays above it.`);
    if (water && cap < LINK.CREEK_DEPTH_FT) return fail(`A tunnel under ${water === 'creek' ? 'the creek' : 'the moat'} must be ${LINK.CREEK_DEPTH_FT} ft deep, and the footing of one of these domes stops at ${cap} ft. Link by walkway over a bridge instead.`);
  }
  const rk = runKindOf(kind), lenU = runLength([[ea.end.x, ea.end.z], [eb.end.x, eb.end.z]]);
  const bill = runBill(rk, lenU), materialsUsd = billUsd(bill);
  const lines: Array<{ label: string; usd: number }> = [];
  const sleeve = (n: Node): number => (n.dome ? Math.round((MATERIALS.dome_airlock.price ?? 0) * LINK.SLEEVE_FRAC / 100) * 100 : LINK.DOOR_USD);
  lines.push({ label: kind === 'tunnel' ? 'Link airlock sleeves through the footings' : 'Airlock doors on the shells', usd: sleeve(a) + sleeve(b) });
  if (kind === 'tunnel') {
    lines.push({ label: 'Lighting, cable, vent and pipe', usd: Math.round(lenFt * LINK.TUNNEL_USD_FT) });
    lines.push({ label: `Shoring and lining to ${depth} ft`, usd: Math.round(lenFt * LINK.SHORE_USD_FT_PER_FT * (depth ?? 0)) });
  } else {
    lines.push({ label: 'Glazing, steel ribs and lights', usd: Math.round(lenFt * LINK.WALK_USD_FT) });
    if (piers) lines.push({ label: `${pluralize(piers, 'pier')} on the slope`, usd: piers * LINK.PIER_USD });
  }
  const fitUsd = lines.reduce((x, l) => x + l.usd, 0);
  const hours = Math.round(PERIMETER[rk].hours * lenU * (kind === 'tunnel' ? 1 + LINK.DEPTH_HOURS * (depth ?? 0) : 1) + LINK.AIRLOCK_HOURS * 2);
  return { ...base, bill, materialsUsd, fitUsd, fitLines: lines, totalUsd: materialsUsd + fitUsd, hours, piers };
}

/** Why the link cannot be ordered now (the quote's problem, or money). Null: it can. */
export function linkProblem(s: GameState, aId: string, bId: string, kind: LinkKind, depthFt?: number): string | null {
  const q = quoteLink(s, aId, bId, kind, depthFt);
  if (q.problem) return q.problem;
  if (s.money < q.fitUsd) return `The fit-out is ${money(q.fitUsd)} and the account holds ${money(s.money)}.`;
  return null;
}

/** Order a link: the fit-out is paid now, the run is laid out and the family (or a crew) builds it like any other run. Null on success, else why not. */
export function orderLink(s: GameState, aId: string, bId: string, kind: LinkKind, depthFt?: number): string | null {
  const why = linkProblem(s, aId, bId, kind, depthFt);
  if (why) return why;
  const q = quoteLink(s, aId, bId, kind, depthFt);
  s.money -= q.fitUsd;
  const run = planRun(s, runKindOf(kind), q.pts.map(p => [p[0], p[1]] as Pt), [], 0, true);
  run.hours = q.hours;
  const link: DomeLink = { id: `lk${s.nextId++}`, kind, ends: q.ends!, runId: run.id, depthFt: q.depthFt, lenFt: q.lenFt, orderedAt: s.clock.t, feeUsd: q.fitUsd, wear: 0 };
  (s.domeLinks ??= []).push(link);
  log(s, `Ordered ${kind === 'tunnel' ? `an underground tunnel ${q.depthFt} ft down` : 'an enclosed walkway'}, ${q.lenFt.toLocaleString('en-US')} ft, ${nodeLabel(s, aId)} to ${nodeLabel(s, bId)}: ${money(q.fitUsd)} for the fit-out now, ${money(q.materialsUsd)} of materials from the stockpile, about ${q.hours.toLocaleString('en-US')} hours of work.`);
  return null;
}

export function nodeLabel(s: GameState, id: string): string {
  const st = s.structures.find(x => x.id === id);
  if (st) return `${st.kind.replace(/^dome_/, '').replace(/_\d+$/, '').replace(/_/g, ' ')} ${st.kind.startsWith('dome_') ? 'dome' : ''} ${id}`.replace(/\s+/g, ' ').trim();
  return `yard ${id}`;
}

// ── stages (the dome dig's pattern) ──

export type LinkStage = 'planned' | 'excavate' | 'lining' | 'backfill' | 'foundations' | 'frame' | 'glazing' | 'open';
/** Which stage a link is at, from its run's work done: tunnel: excavate the trench, lay the lining, backfill; walkway: foundations, frame, glazing. */
export function stageOf(s: GameState, l: DomeLink): LinkStage {
  const r = linkRun(s, l);
  if (!r) return 'planned';
  if (runFinished(r)) return 'open';
  const u = r.hours > 0 ? r.done / r.hours : 0;
  if (l.kind === 'tunnel') return u <= 0 && !r.supplied ? 'planned' : u < 0.4 ? 'excavate' : u < 0.8 ? 'lining' : 'backfill';
  return u <= 0 && !r.supplied ? 'planned' : u < 0.3 ? 'foundations' : u < 0.75 ? 'frame' : 'glazing';
}
export const STAGE_WORD: Record<LinkStage, string> = {
  planned: 'planned, waiting for materials', excavate: 'excavating the trench', lining: 'laying the lining', backfill: 'backfilling', foundations: 'pouring footings', frame: 'raising the frame', glazing: 'glazing', open: 'open',
};
export const progressOf = (s: GameState, l: DomeLink): number => { const r = linkRun(s, l); return r && r.hours > 0 ? Math.min(1, r.done / r.hours) : 0; };

// ── weather, wear, collapse, repair ──

/** Daily chance a storm wrecks a walkway (before wear): snow load, wind, hail, fire. A tunnel only floods in a flood. (PROPOSED.) */
export const WALK_STORM: Partial<Record<string, { p: number; why: DownWhy }>> = {
  blizzard: { p: 0.012, why: 'snow' }, ice_storm: { p: 0.012, why: 'snow' }, tornado: { p: 0.06, why: 'storm' }, derecho: { p: 0.03, why: 'storm' }, windstorm: { p: 0.02, why: 'storm' },
  hail: { p: 0.01, why: 'storm' }, lightning_fire: { p: 0.03, why: 'fire' }, heat_wave: { p: 0.004, why: 'storm' }, hurricane_remnants: { p: 0.03, why: 'storm' },
};
/** Chance a storm of this kind downs a link of this kind and wear today: rises with wear, never falls (property test). */
export function stormDownChance(kind: LinkKind, storm: string | null, wear: number): number {
  if (!storm) return 0;
  if (kind === 'tunnel') return storm === 'flood' || storm === 'flash_flood' ? 0.01 * (0.5 + wear) : 0;
  const t = WALK_STORM[storm];
  return t ? Math.min(0.9, t.p * (0.5 + Math.max(0, Math.min(1, wear)))) : 0;
}

export function takeDown(s: GameState, l: DomeLink, why: DownWhy, text?: string): void {
  if (l.down) return;
  const big = why === 'collapse' || why === 'charge';
  l.down = { at: s.clock.t, why, clearsAt: null, repairUsd: Math.round(l.feeUsd * (big ? LINK.CLEAR_FRAC : LINK.REPAIR_FRAC) / 100) * 100 };
  const nm = linkName(l.kind);
  log(s, text ?? `The ${nm} is out of service (${why === 'snow' ? 'snow load' : why}). People cannot cross it until it is repaired: ${money(l.down.repairUsd)}.`);
  chronicle(s, 'threat', `The ${nm} between the domes was lost to ${why === 'snow' ? 'the snow load' : why}.`);
}

/** Order the repair (or the clearing of a collapse). Null on success, else why not. */
export function repairLink(s: GameState, id: string): string | null {
  const l = linksOf(s).find(x => x.id === id);
  if (!l?.down) return 'it is not out of service';
  if (l.down.clearsAt !== null) return 'a contractor is already on it';
  if (s.money < l.down.repairUsd) return `the repair is ${money(l.down.repairUsd)}`;
  s.money -= l.down.repairUsd;
  l.down.clearsAt = s.clock.t + (l.down.why === 'collapse' || l.down.why === 'charge' ? LINK.CLEAR_DAYS : LINK.REPAIR_DAYS);
  log(s, `A contractor is repairing the ${linkName(l.kind)} (${money(l.down.repairUsd)}).`);
  return null;
}

/** Collapse a tunnel on purpose or by a charge: the link is lost, a crew in it with it. The sealed airlock sleeves hold either way. */
export function collapseLink(s: GameState, id: string, why: 'collapse' | 'charge' = 'collapse'): string | null {
  const l = linksOf(s).find(x => x.id === id);
  if (!l) return 'no such link';
  if (l.kind !== 'tunnel') return 'only a tunnel can be brought down on a crew';
  if (l.down) return 'it is already down';
  takeDown(s, l, why, why === 'collapse' ? 'We brought the tunnel down on purpose. Nobody crosses it until a contractor clears it.' : undefined);
  return null;
}

/** Once a day: wear creeps, a storm may wreck a walkway, a finished repair reopens the link. Returns log lines already written. */
export function linkDay(s: GameState): void {
  const ls = linksOf(s);
  if (!ls.length) return;
  const day = dayIndex(s.clock.t), r = mulberry32(s.seed * 6151 + day * 31 + 7), storm = stormNow(s);
  for (const l of ls) {
    if (linkState(s, l) === 'building') continue;
    if (l.down) {
      if (l.down.clearsAt !== null && s.clock.t >= l.down.clearsAt) { delete l.down; l.wear = Math.max(0, l.wear - 0.3); log(s, `The ${linkName(l.kind)} is open again.`); }
      continue;
    }
    l.wear = Math.min(1, l.wear + (l.kind === 'walkway' ? LINK.WEAR_WALK : LINK.WEAR_TUNNEL));
    const p = stormDownChance(l.kind, storm, l.wear);
    if (p > 0 && r() < p) takeDown(s, l, l.kind === 'tunnel' ? 'storm' : WALK_STORM[storm!]?.why ?? 'storm');
  }
}

// ── travel, redundancy, ring, watch, feeder ──

export interface Trip { link: DomeLink; seconds: number; cycles: number }

/** Seconds a trip through a link takes: the walk (or drive) plus an airlock cycle at each end that is a sealed dome. */
export function tripSeconds(s: GameState, l: DomeLink, who: 'family' | 'vehicle' = 'family', sealed: (domeId: string) => boolean = () => false): { seconds: number; cycles: number } {
  const lenM = l.lenFt * 0.3048, move = who === 'vehicle' ? lenM / DRIVE_MPS : lenM / WALK_MPS;
  let cycles = 0, t = 0;
  for (const e of l.ends) if (e.type === 'dome') {
    const d = domesOf(s).find(x => x.id === e.id);
    // an airlock cycle is the interlock between two doors: it runs whenever the dome is sealed, and once for the sleeve either way
    if (d && sealed(e.id)) { cycles++; t += AIRLOCK_CYCLE_S[d.tier]; }
  }
  return { seconds: Math.round(move / capacityOf(s, l).valueOf() + t), cycles };
}
/** The best open link between two nodes for a trip (the quickest), or null: isolated. */
export function bestLink(s: GameState, a: string, b: string, who: 'family' | 'vehicle' = 'family', sealed?: (id: string) => boolean): Trip | null {
  let best: Trip | null = null;
  for (const l of linksBetween(s, a, b)) {
    if (who === 'vehicle' && l.kind === 'walkway') continue;
    const t = tripSeconds(s, l, who, sealed);
    if (!best || t.seconds < best.seconds) best = { link: l, ...t };
  }
  return best;
}
/** Two places with more than one open link between them have redundancy: if one is cut, the other still carries travel. */
export const redundant = (s: GameState, a: string, b: string): boolean => linksBetween(s, a, b).length >= 2;

/** The domes in the same ring as this one: joined by an open walkway, a tunnel or both (the ring that includes both domes; guards and towers cover all of them). */
export const ringOf = (s: GameState, domeId: string): string[] => groupOf(s, domeId).filter(id => domesOf(s).some(d => d.id === id));

/** Towers in reach of a dome, counting those that stand by any dome in its ring. */
export function towersCovering(s: GameState, domeId: string): number {
  const ring = ringOf(s, domeId).map(id => domesOf(s).find(d => d.id === id)).filter(Boolean) as Dome[];
  return towersBuilt(s).filter(t => ring.some(d => Math.hypot(t.st.x - d.x, t.st.z - d.z) <= d.r + t.def.post.reach)).length;
}

/**
 * The feeder: an open link carries a feeder, so a dome's plant is backed up by its partner's (N+1 across two domes, PROPOSED). Own share `own` (0-1) with
 * the partners' shares `others` becomes own + K x (1 - own) x best partner, never lower than own and never above 1 (property test).
 */
export function supplemented(own: number, others: readonly number[]): number {
  const best = Math.max(0, ...others.map(o => Math.max(0, Math.min(1, o))));
  const o = Math.max(0, Math.min(1, own));
  return Math.min(1, o + LINK.FEEDER_K * (1 - o) * best);
}
/** The dome ids a dome's feeder reaches: open links to another dome. */
export function feederPartners(s: GameState, domeId: string): string[] {
  const out = new Set<string>();
  for (const l of linksOf(s)) if (linkOpen(s, l)) {
    const [x, y] = l.ends;
    if (x.type === 'dome' && y.type === 'dome') { if (x.id === domeId) out.add(y.id); if (y.id === domeId) out.add(x.id); }
  }
  return [...out];
}

/** Is a point (in the open, or in a yard) joined by link to another? Used by the daily-trip exposure check. */
export function linkedPoints(s: GameState, from: Pt, to: Pt): boolean {
  const ds = domesOf(s), under = (p: Pt): string | null => ds.find(d => Math.hypot(p[0] - d.x, p[1] - d.z) < d.r)?.id ?? yardAt(yardRings(s), p);
  const a = under(from), b = under(to);
  return !!a && !!b && a !== b && linkGroups(s).some(g => g.includes(a) && g.includes(b));
}

export { domeFrom, linksOf };
export type { Airlock };
