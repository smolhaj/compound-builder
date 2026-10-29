/**
 * What the ground does (docs/DECISIONS.md, "Terrain has mechanics"): small,
 * documented effects of the lot's relief on systems that already exist. Each
 * number is here, in one place, so the balance is one read:
 *
 *  - Solar: a panel on a south-facing slope gets more sun, on a north face
 *    less: 1 ± 0.8 × slope, capped ±25 % (a 10 % slope is ±8 %).
 *  - Floods: a flood or a wash takes what stands in the creek's bottom (a
 *    house in the floodplain too), and spares a cellar, garden or well set
 *    6 m or more above the water line.
 *  - Mud: in the spring thaw (days 60–150) and while a storm is on, building
 *    on a floodplain or wet flat goes 15 % slower.
 *  - Gravity feed: a reservoir 7 m or more above the houses pushes water down
 *    by its own weight: the well pump runs 60 % less (it only tops up the
 *    reservoir).
 *  - Raids: a crew comes by the cheapest way in. The road side is easy (its
 *    cost counts ×0.75); a lane that is more than 15 % cheaper than the road's
 *    pulls the crew round to it; a lane over a cliff or a ford costs what it
 *    costs. Hold the choke on that lane and it does not matter.
 *  - The ground's share of the defense (`terrainDefense`): hard lanes, a held
 *    choke and towers on real high ground. It is one input to the shared
 *    defensive-strength figure, never a second scaling system.
 * Pure.
 */
import { calendarOf, type GameState, type Structure } from './state';
import { bestLane, floodplainAt, hasHillside, localSun, riseAboveCreek, slopeTunnelProblem, spanProblem, type Choke, type Lane } from './terrain';
import { campOf, groundOf, lanesOf, sitesOf, terrainOf } from './terrainState';
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { highShare, isTower } from './towers';
import { PERIMETER, runFinished, runBill, SALVAGE, type PerimeterKind, type Pt } from './perimeter';
import { log } from './economy';
import { DRAIN, cutSlopeAt, nearDrain, undrained, drainLineFor } from './drainage';

export const FX = {
  /** Solar: sun gain per unit of slope, and the cap. */
  SUN_K: 0.8, SUN_CAP: 0.25,
  /** Flood: how far above the creek's water (units, 1 = 6 m) a low structure is spared. */
  SAFE_RISE: 1.0,
  /** Mud: slower work, and the days it is mud season. */
  MUD_SLOW: 0.85, MUD_FROM: 60, MUD_TO: 150,
  /** Gravity feed: head over the houses (m) and how much it cuts the pump's draw. */
  GRAVITY_M: 7, GRAVITY_CUT: 0.6,
  /** Raids: the road lane's cost counts this much (it is the easy way), and how much cheaper a lane must be to draw the crew off it. */
  ROAD_EASE: 0.75, LANE_MARGIN: 0.85,
  /** The ground's share of the defense (0-1) counts as up to this many defense points in the shared strength (sim/adaptive.ts `terrain`; the scale runs 40 = nothing to 100 = full). */
  DEFENSE_POINTS: 15,
} as const;

/** Sun on a structure's ground relative to level: 0.75–1.25, 1 on the level (or with no ground known). */
export function sunFactor(s: GameState, st: Pick<Structure, 'x' | 'z'>): number {
  const g = groundOf(s);
  if (!g) return 1;
  const f = localSun(g, st.x, st.z);
  return Math.max(1 - FX.SUN_CAP, Math.min(1 + FX.SUN_CAP, 1 + (f - 1)));
}

const LOW_KINDS = ['root_cellar', 'garden', 'field', 'outhouse', 'well_hand'];

/** Which structures a flood can take: the creek's bottom, never the high ground. `lowKinds` are the kinds that are always at risk in the bottom. */
export function floodCandidates(s: GameState, fin: readonly Structure[], lowKinds: readonly string[] = LOW_KINDS): Structure[] {
  const g = groundOf(s);
  if (!g || !g.creek || !s.site.creek) return fin.filter(st => lowKinds.includes(st.kind));   // no creek through the place (a desert wash): the old rule
  return fin.filter(st => {
    const rise = riseAboveCreek(g, st.x, st.z);
    if (lowKinds.includes(st.kind)) return rise !== null && rise < FX.SAFE_RISE;   // beyond 84 m of the creek, or up on the bench, the water does not reach it
    return !st.kind.startsWith('bunker_') && floodplainAt(g, st.x, st.z);          // a house in the floodplain floods too
  });
}

/** Is the ground at a structure mud right now (spring thaw or a storm, on the floodplain)? */
export function muddy(s: GameState, st: Pick<Structure, 'x' | 'z'>, storm = false): boolean {
  const { doy } = calendarOf(s.clock);
  if (!storm && (doy < FX.MUD_FROM || doy > FX.MUD_TO)) return false;
  if (cutSlopeAt(s, st.x, st.z)) return true;   // the runoff of the cut it is built into (sim/drainage.ts)
  if (!s.site.creek) return false;   // the creek is on a neighbor's land: no floodplain here
  const g = groundOf(s);
  return !!g && floodplainAt(g, st.x, st.z);
}
/** How fast work goes on the ground at a structure: 1, or the mud slowdown, which a finished drainage channel near the site mostly takes away. */
export function mudFactor(s: GameState, st: Pick<Structure, 'x' | 'z'>, storm = false): number {
  if (!muddy(s, st, storm)) return 1;
  return nearDrain(s, st.x, st.z) ? 1 - (1 - FX.MUD_SLOW) * (1 - DRAIN.MUD_CUT) : FX.MUD_SLOW;
}

/** Head (m) of the best finished reservoir over the houses, 0 if none. */
export function gravityHeadM(s: GameState): number {
  const g = groundOf(s);
  if (!g) return 0;
  const fin = s.structures.filter(isFinished);
  const res = fin.filter(st => st.kind === 'reservoir');
  if (!res.length) return 0;
  const homes = fin.filter(st => isHome(st.kind));
  const base = homes.length ? homes.reduce((a, st) => a + g.h(st.x, st.z), 0) / homes.length : g.h(...campOf(s));
  return Math.max(0, ...res.map(r => (g.h(r.x, r.z) - base) * 6));
}
/** Multiplier on the well pump's draw: 1, or 0.4 with a reservoir at gravity head. */
export const pumpDrawFactor = (s: GameState): number => (gravityHeadM(s) >= FX.GRAVITY_M ? 1 - FX.GRAVITY_CUT : 1);

/** The way a raid comes from (radians, 0 = east, π/2 = the road side to the south), or null to take the road. */
export function raidAngle(s: GameState, rnd: () => number): { ang: number; lane: Lane; via?: string } | null {
  const lanes = lanesOf(s);
  if (lanes.length < 4) return null;
  const road = lanes.reduce((a, l) => (Math.abs(l.ang - Math.PI / 2) < Math.abs(a.ang - Math.PI / 2) ? l : a), lanes[0]);
  const best = bestLane(lanes, { ang: Math.PI / 2, bonus: FX.ROAD_EASE });
  // the road side is a lane over a standing tunnel-bridge: they come to its door whatever the margins
  if (!best || (best === road && !best.via)) return null;
  if (!best.via && best.cost > road.cost * FX.ROAD_EASE * FX.LANE_MARGIN) return null;
  // by a tunnel-bridge they gather at its outer door, so they come from the door's direction
  const c = campOf(s), toDoor = best.via && best.choke ? Math.atan2(best.choke.at[1] - c[1], best.choke.at[0] - c[0]) : null;
  return { ang: (toDoor ?? best.ang) + (rnd() - 0.5) * (toDoor !== null ? 0.12 : 0.5), lane: best, ...(best.via ? { via: best.via } : {}) };
}

/** Is the choke of the easiest lane held (a finished tower or wall within 4 units of it)? */
export function chokeHeld(s: GameState, choke: Choke): boolean {
  const near = (x: number, z: number) => Math.hypot(x - choke.at[0], z - choke.at[1]) <= 4;
  if (s.structures.some(st => isFinished(st) && isTower(st.kind) && near(st.x, st.z))) return true;
  return s.perimeter.some(r => runFinished(r) && r.pts.some(p => near(p[0], p[1])) && r.kind !== 'water_pipe' && r.kind !== 'power_cable');
}

export interface TerrainDefense { score: number; lines: string[]; lane: Lane | null; held: boolean; highShare: number }

/** The ground's share of the defense, 0–1, with plain-language lines. 0 where nothing is known. */
export function terrainDefense(s: GameState): TerrainDefense {
  const lanes = lanesOf(s);
  const best = lanes.length ? bestLane(lanes, { ang: Math.PI / 2, bonus: FX.ROAD_EASE }) : null;
  const lines: string[] = [];
  const towers = s.structures.filter(st => isFinished(st) && isTower(st.kind));
  const hs = towers.length ? towers.reduce((a, st) => a + highShare(st), 0) / towers.length : 0;
  if (!best) return { score: 0, lines, lane: null, held: false, highShare: hs };
  const hard = Math.max(0, Math.min(1, (best.hardness - 1) / 0.6));
  const held = !!best.choke && chokeHeld(s, best.choke);
  if (hard > 0.15) lines.push(`The easiest way in is ${best.hardness.toFixed(1)}× slower than open ground${best.fords ? ' (it fords the creek)' : ''}${best.cliff ? ' (it has a cliff to climb)' : ''}.`);
  else lines.push('The ground is open all round: nothing slows a crew.');
  if (best.via) lines.push(`The easiest way in is your tunnel-bridge: a crew comes to its outer steel door and is held there ${DOOR_DELAY} s (in view of your towers and deck) before it can act. The doors lock by themselves at night and when the alarm goes; by day, unwarned, they stand open and hold a crew only ${DOOR_OPEN_DELAY} s. Drop it and they must ford and climb the gorge.`);
  else if (best.choke) lines.push(held ? `The easiest way in narrows to ${Math.round(best.choke.width * 6)} m and you hold it.` : `The easiest way in narrows to ${Math.round(best.choke.width * 6)} m at one place: a wall or tower there would matter.`);
  if (towers.length) lines.push(hs > 0.3 ? `Your towers stand on real high ground (${Math.round(hs * 100)} % of the full advantage).` : 'Your towers stand on the level: a hill would add range.');
  return { score: Math.max(0, Math.min(1, 0.5 * hard + 0.3 * hs + 0.2 * (held ? 1 : 0))), lines, lane: best, held, highShare: hs };
}

/** A card for the Next-step list that reads the ground (the guidance turns it into a Suggestion). Suggest, never impose. */
export interface TerrainCard { id: string; title: string; why: string; urgency: number; mode: 'high' | 'lanes' | 'water'; /** For the gorge card: the span it invites. */ span?: { a: Pt; b: Pt; lengthM: number }; /** For the drainage card: the channel above the worst undrained cut. */ drain?: { a: Pt; b: Pt; count: number } }

/**
 * At most one card, and only once the family has a roof and is thinking about
 * defending or watering the place: a ridge that suits a terraced keep, a gorge
 * that is a natural choke point, the narrow way in, a bench for a gravity
 * reservoir. The player confirms by looking (the overlay) and building; the
 * Build menu greys out what the land does not suit with the reason.
 */
export function terrainCards(s: GameState): TerrainCard[] {
  const homes = s.structures.filter(st => isHome(st.kind) && isFinished(st));
  if (!homes.length) return [];
  const thinking = s.perimeter.length > 0 || s.structures.some(st => isTower(st.kind)) || homes.length >= 1 && s.clock.t > 60;
  if (!thinking) return [];
  const sites = sitesOf(s);
  const out: TerrainCard[] = [];
  const keep = sites.find(c => c.kind === 'keep_ridge' && c.score >= 0.5);
  if (keep && !s.structures.some(st => st.kind === 'keep')) out.push({ id: 'land_keep', title: 'This ridge suits a terraced keep', why: keep.reason, urgency: 24, mode: 'high' });
  const gorge = sites.find(c => c.kind === 'gorge');
  if (gorge) out.push({ id: 'land_gorge', title: 'The gorge is a natural choke point', why: gorge.reason, urgency: 26, mode: 'lanes', ...(gorge.span && !s.perimeter.some(r => PERIMETER[r.kind].span) ? { span: gorge.span } : {}) });
  const choke = sites.find(c => c.kind === 'choke');
  if (choke && !gorge) out.push({ id: 'land_choke', title: 'The way in narrows', why: choke.reason, urgency: 23, mode: 'lanes' });
  const res = sites.find(c => c.kind === 'reservoir');
  if (res && !s.structures.some(st => st.kind === 'reservoir') && s.structures.some(st => st.kind === 'well_drilled' && isFinished(st))) out.push({ id: 'land_reservoir', title: 'A bench above the camp for a reservoir', why: res.reason, urgency: 21, mode: 'water' });
  // a building cut into a slope with nothing to turn the runoff: the thaw and the storms bog it down (sim/drainage.ts)
  const wet = undrained(s).sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0));
  const line = wet.length ? drainLineFor(s, wet[0]) : null;
  if (wet.length && line && !s.perimeter.some(r => r.kind === 'drain_channel' && !runFinished(r))) {
    out.push({ id: 'land_drain', title: `${wet.length} cut slope${wet.length > 1 ? 's' : ''} with no drainage`, why: `The ${wet.length > 1 ? 'buildings' : 'building'} cut into the hill ${wet.length > 1 ? 'shed' : 'sheds'} water onto the pad: in the thaw and in storms the work bogs down. A channel along the contour above it takes most of that away.`, urgency: wet.some(isFinished) ? 25 : 21, mode: 'water', drain: { a: line[0], b: line[1], count: wet.length } });
  }
  return out.sort((a, b) => b.urgency - a.urgency).slice(0, 1);
}

/** The ground's share of the defense in the shared strength's own unit: defense-equivalent points (0 to `FX.DEFENSE_POINTS`). */
export const terrainPoints = (s: GameState): number => Math.round(terrainDefense(s).score * FX.DEFENSE_POINTS * 10) / 10;

// ── tunnel-bridges and slope tunnels ──

/** Seconds a crew coming by a tunnel-bridge spends at its steel door before it can act (the family sees them on the deck and the towers). */
export const DOOR_DELAY = 8;
/** By day the doors stand open for the traffic: a crew that comes unannounced walks in and is only slowed this long (s). */
export const DOOR_OPEN_DELAY = 2;
/** The watch (detection score, 0 to 100) from which a raid is called before it reaches the outer door, and the doors lock on the alarm. */
export const DOOR_ALARM_DETECTION = 45;

/** The bridge doors lock on their own at night (dusk to dawn) and the moment the alarm goes; by day, with nobody warned, they stand open. */
export const doorsLocked = (night: boolean, detection: number): boolean => night || detection >= DOOR_ALARM_DETECTION;
/** Seconds a crew is held at the outer door: the full lock, or the open-door walk-in. */
export const doorDelay = (night: boolean, detection: number): number => doorsLocked(night, detection) ? DOOR_DELAY : DOOR_OPEN_DELAY;

/** Why a run of this kind can't be laid along `pts` on this ground (null = it can). Only the span kinds have a rule. */
export function routeProblem(s: GameState, kind: PerimeterKind, pts: readonly Pt[]): string | null {
  const d = PERIMETER[kind];
  if (!d.span && kind !== 'slope_tunnel') return null;
  const g = groundOf(s);
  if (!g || pts.length < 2) return null;
  if (d.span) return spanProblem(g, pts[0], pts[pts.length - 1]);
  return slopeTunnelProblem(g, pts);
}

/** Build-menu grey-out: why this kind does not suit the land at all (null = it can go somewhere here). */
export function terrainOff(s: GameState, kind: PerimeterKind): string | null {
  if (kind === 'tunnel_bridge') return sitesOf(s).some(c => c.kind === 'gorge') ? null : 'no gorge, ravine or deep creek bed on this land to span: a tunnel-bridge needs real low ground';
  if (kind === 'slope_tunnel') { const t = terrainOf(s); return t && hasHillside(t, s.site.home) ? null : 'no hillside steep enough (20 % or more) on this land: a slope tunnel needs a slope to go down'; }
  return null;
}

/** The span a gorge on the lot invites (rim to rim), or null. */
export function gorgeSpan(s: GameState): { a: Pt; b: Pt; lengthM: number; depthM: number } | null {
  const g = sitesOf(s).find(c => c.kind === 'gorge');
  return g?.span ? { a: g.span.a, b: g.span.b, lengthM: g.span.lengthM, depthM: g.span.depthM } : null;
}

/** Drop a standing tunnel-bridge or slope tunnel: it comes down and is a plan again until rebuilt (the salvage half-steel comes back). Null on success, else why not. */
export function dropBridge(s: GameState, id: string): string | null {
  const r = s.perimeter.find(x => x.id === id);
  if (!r) return 'no such tunnel';
  if (!PERIMETER[r.kind].vehicleWay) return 'only a tunnel-bridge or slope tunnel can be dropped';
  if (!runFinished(r)) return 'it is not standing';
  for (const [k, q] of Object.entries(runBill(r.kind, r.hours / PERIMETER[r.kind].hours)) as Array<[keyof typeof s.stock, number]>) if (k !== 'blast_door') s.stock[k] += Math.floor(q * SALVAGE * 0.5);
  r.finishedAt = null; r.done = 0; r.supplied = false; r.dropped = true;
  log(s, `The ${PERIMETER[r.kind].name.toLowerCase()} is down. Nothing crosses there until it is rebuilt, and a crew has to ford and climb.`);
  return null;
}
