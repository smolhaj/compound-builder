/**
 * Corridors: the tunnel-bridge (#107), the slope tunnel and the rock tunnel (#124) as ways people, dogs and vehicles actually use, not only as
 * choke geometry (docs/DECISIONS.md, "Tunnel use"). Pure (tested).
 *
 *  What counts    a finished run of a kind with `vehicleWay` that has not been dropped or collapsed. A dropped tunnel-bridge is a plan again (sim/terrainFx
 *                 `dropBridge`); a collapsed one (a sapper's charge, `collapseCorridor`) still stands but its mouth is choked with rubble until a contractor clears it.
 *  Doors          a steel door in each portal: open by day (the traffic), locked from dusk to dawn and the moment the alarm goes (the watch good enough to call
 *                 a raid, `DOOR_ALARM_DETECTION`). The family and its dogs have keys: a locked door costs them a few seconds. A crew is held per `doorDelay`.
 *  Time           people walk it at the pace of a loaded walker, vehicles at tunnel speed, so a 236 m bore is about three game minutes on foot and half a
 *                 minute by car. The sim reads these for the delivery's lead time, the weekend arrival and the response time.
 *  Sides          which of the two ends a place is nearest to, and so which vehicles a dropped bridge strands (`strandedVehicles`).
 */
import type { GameState } from './state';
import { hourOf } from './state';
import { PERIMETER, runFinished, wallLength, type PerimeterKind, type PerimeterRun, type Pt } from './perimeter';
import { DOOR_ALARM_DETECTION, DOOR_DELAY, DOOR_OPEN_DELAY, doorsLocked } from './terrainFx';
import { log } from './economy';
import { mulberry32 } from './rng';
import { bridgeDown } from './roadFx';
import { chronicle } from './lineage';
import { dropBridge } from './terrainFx';
import { towerPosts } from './towers';
import { powered } from './gear';
import { wallMetres } from './tunnelers';

/** World units per metre. */
export const U_PER_M = 1 / 6;
/** Walking pace through a tunnel (m/s): an adult with a pack, 1.35 m/s. */
export const WALK_MPS = 1.35;
/** Driving pace through a tunnel (m/s): 25 km/h, one lane, a steel door at each end. */
export const DRIVE_MPS = 7;
/** Seconds a keyholder spends at a locked door (the card reader and the bolts), and at an open one. */
export const KEY_S = 4;
/** Dusk to dawn, as the battle model counts it (sim/battle.ts). */
export const isNightHour = (hr: number): boolean => hr < 6 || hr >= 20;

export interface Corridor {
  id: string;
  kind: PerimeterKind;
  /** The two portals: the first and last points of the run. */
  a: Pt;
  b: Pt;
  /** The centre line (portal to portal). */
  pts: Pt[];
  lenU: number;
  lenM: number;
  /** Rock tunnels run under the hill; tunnel-bridges stand on trusses over a gap. */
  bore: boolean;
  /** Collapsed by a charge: the corridor is choked with rubble and carries nobody until it is cleared. */
  collapsed: boolean;
}

/** The corridor a run is, or null (not a corridor kind, not standing, dropped). A collapsed one is returned with `collapsed` set. */
export function corridorOf(r: PerimeterRun): Corridor | null {
  if (!PERIMETER[r.kind].vehicleWay || !runFinished(r) || r.dropped || r.pts.length < 2) return null;
  const lenU = wallLength(r);
  return {
    id: r.id, kind: r.kind, a: r.pts[0], b: r.pts[r.pts.length - 1], pts: r.pts, lenU, lenM: Math.round(lenU / U_PER_M),
    bore: !!PERIMETER[r.kind].bore, collapsed: !!r.collapsed,
  };
}

/** Every standing corridor of the place. `usable` leaves out the collapsed ones. */
export function standingCorridors(s: Pick<GameState, 'perimeter'>, usable = false): Corridor[] {
  const out: Corridor[] = [];
  for (const r of s.perimeter) { const c = corridorOf(r); if (c && !(usable && c.collapsed)) out.push(c); }
  return out;
}

// ── time ──

export const walkSeconds = (lenM: number): number => lenM / WALK_MPS;
export const driveSeconds = (lenM: number): number => lenM / DRIVE_MPS;

export type Goer = 'family' | 'vehicle' | 'crew';

export interface Crossing {
  /** Game seconds from the outer door to the inner door, doors included. */
  seconds: number;
  /** Both doors locked (night or the alarm)? */
  locked: boolean;
  /** Seconds lost at the two doors. */
  doorS: number;
  /** False when the corridor is collapsed: nobody gets through. */
  open: boolean;
}

/**
 * What it costs to go through. The family and its vehicles have keys (a locked door is `KEY_S` each end, an open one nothing); a crew is held
 * `doorDelay` at the outer door and, locked, has to be let through the inner one too (they breach it: the same again).
 */
export function crossing(c: Pick<Corridor, 'lenM' | 'collapsed'>, who: Goer, night: boolean, detection: number): Crossing {
  const locked = doorsLocked(night, detection);
  const move = who === 'vehicle' ? driveSeconds(c.lenM) : walkSeconds(c.lenM);
  const doorS = who === 'crew' ? (locked ? DOOR_DELAY * 2 : DOOR_OPEN_DELAY) : locked ? KEY_S * 2 : 0;
  return { seconds: Math.round(move + doorS), locked, doorS, open: !c.collapsed };
}

/** Game minutes a trip through the corridor takes (family on foot or in a vehicle). */
export function crossingMinutes(c: Pick<Corridor, 'lenM' | 'collapsed'>, who: Goer, hour: number, detection = 0): number {
  return Math.round(crossing(c, who, isNightHour(hour), detection).seconds / 6) / 10;
}

/**
 * Game minutes the place's tunnels add to a trip between the gate and the compound: every standing corridor the way in has to pass through counts once.
 * `through` says whether a corridor lies on the way (the world knows the ground; the sim takes the Defense tab's reading: every corridor of a bore or
 * a span counts for a vehicle, since they are the only way over). Returns 0 with no corridor.
 */
export function wayInMinutes(s: GameState, who: Goer = 'vehicle'): number {
  const hr = hourOf(s.clock.t);
  let m = 0;
  for (const c of standingCorridors(s, true)) m += crossingMinutes(c, who, hr, 0);
  return Math.round(m * 10) / 10;
}

/**
 * What the tunnels add to the response factor (sim/slope.ts `responseFactor`, which multiplies the deputy's, the ambulance's and the fire crew's time):
 * each standing corridor is its drive-through plus, from dusk to dawn, the wait at a locked door for the family to let them in (`RESPONDER_WAIT_MIN`);
 * a fallen one leaves the last stretch on foot from the portal (+2).
 */
export const RESPONDER_WAIT_MIN = 2;
export function tunnelResponse(s: GameState): number {
  const cs = standingCorridors(s);
  if (!cs.length) return 0;
  const locked = locksNow(s);
  let k = 0;
  for (const c of cs) k += c.collapsed ? 2 : (driveSeconds(c.lenM) / 60 + (locked ? RESPONDER_WAIT_MIN : 0)) / 12;
  return Math.round(k * 100) / 100;
}

/** Is there a corridor the way in is blocked at (collapsed and not yet cleared)? */
export const wayInBlocked = (s: Pick<GameState, 'perimeter'>): Corridor | null => standingCorridors(s).find(c => c.collapsed) ?? null;

// ── sides ──

/** 0 when (x, z) is nearer to portal a than to portal b, else 1. */
export function endNearest(c: Pick<Corridor, 'a' | 'b'>, x: number, z: number): 0 | 1 {
  return Math.hypot(x - c.a[0], z - c.a[1]) <= Math.hypot(x - c.b[0], z - c.b[1]) ? 0 : 1;
}

/** Which side of the corridor holds the way in (the end nearer the county road), 0 or 1. `road` is a point on the road side (the gate / the camp). */
export const outerEnd = (c: Pick<Corridor, 'a' | 'b'>, road: Pt): 0 | 1 => endNearest(c, road[0], road[1]);

// ── collapse ──

/** m³ of rock and concrete a collapsed portal puts in the way, per unit length of the first stretch it brings down (about 30 m). */
export const RUBBLE_M3 = 640;
/** What clearing a collapse costs: a contractor with an excavator and a loader, $ per m³ hauled out, and the days it takes. */
export const CLEAR_USD_PER_M3 = 38;
export const CLEAR_DAYS = 9;

/**
 * A charge brings a portal down (a sapper's breach on the raid; or the family blows its own tunnel). The corridor stays standing but is choked.
 * Null on success, else why not. A tunnel-bridge is dropped instead (`dropBridge`: it falls into the gorge), so a collapse is for a bore or a slope tunnel.
 */
export function collapseCorridor(s: GameState, id: string, why: 'sappers' | 'own' = 'sappers'): string | null {
  const r = s.perimeter.find(x => x.id === id);
  if (!r) return 'no such tunnel';
  const c = corridorOf(r);
  if (!c) return 'it is not standing';
  if (c.collapsed) return 'it is already down';
  if (r.kind === 'tunnel_bridge') return 'a tunnel-bridge is dropped, not collapsed';
  r.collapsed = { at: s.clock.t, rubbleM3: RUBBLE_M3, clearsAt: null };
  const out = strandAway(s);
  chronicle(s, 'threat', why === 'sappers'
    ? `Raiders brought the ${PERIMETER[r.kind].name.toLowerCase()} down at the portal${out ? `, and ${out === 1 ? 'a vehicle was' : `${out} vehicles were`} cut off outside` : ''}.`
    : `We brought the ${PERIMETER[r.kind].name.toLowerCase()} down ourselves.`);
  log(s, why === 'sappers'
    ? `Raiders set a charge in the ${PERIMETER[r.kind].name.toLowerCase()} and brought the portal down. It is choked with rubble: nothing crosses until a contractor clears it ($${clearQuote(r).usd.toLocaleString('en-US')}, about ${CLEAR_DAYS} days).`
    : `The ${PERIMETER[r.kind].name.toLowerCase()} is down on your own charge. Nothing crosses until a contractor clears it.`);
  return null;
}

/** Vehicles out on a run when the way is lost cannot come home: they wait at the outer end (`Vehicle.stranded`, drawn there) until it is open. Returns how many. */
export function strandAway(s: Pick<GameState, 'vehicles'>): number {
  let n = 0;
  for (const v of s.vehicles ?? []) if (v.away && !v.stranded) { v.stranded = true; n++; }
  return n;
}

/** What clearing a collapse costs and takes. */
export function clearQuote(r: Pick<PerimeterRun, 'collapsed'>): { usd: number; days: number } {
  const m3 = r.collapsed?.rubbleM3 ?? 0;
  return { usd: Math.round(m3 * CLEAR_USD_PER_M3 / 100) * 100, days: CLEAR_DAYS };
}

/** Order the clearing (the money goes, the contractor comes). Null on success, else why not. */
export function clearCollapse(s: GameState, id: string): string | null {
  const r = s.perimeter.find(x => x.id === id);
  if (!r || !r.collapsed) return 'it is not down';
  if (r.collapsed.clearsAt !== null) return 'a contractor is already clearing it';
  const q = clearQuote(r);
  if (s.money < q.usd) return 'not enough money';
  s.money -= q.usd;
  r.collapsed.clearsAt = s.clock.t + q.days;
  s.stock.spoil += Math.round(r.collapsed.rubbleM3 * 0.6);
  log(s, `A contractor is clearing the fall in the ${PERIMETER[r.kind].name.toLowerCase()} ($${q.usd.toLocaleString('en-US')}, about ${q.days} days).`);
  return null;
}

/**
 * Why vehicles cannot get between the road and the compound right now, or null: the bridge on the way in is down (sim/roadFx), a tunnel-bridge
 * has been dropped, or a tunnel is choked with rubble. Anything with wheels is cut off on its side; people walk (a collapsed bore leaves them the face to climb).
 */
export function wayCut(s: GameState): string | null {
  if (bridgeDown(s)) return 'the bridge on the way in is down';
  const r = s.perimeter.find(x => PERIMETER[x.kind].vehicleWay && (x.dropped || x.collapsed));
  if (r) return r.collapsed ? `the ${PERIMETER[r.kind].name.toLowerCase()} is choked with rubble` : `the ${PERIMETER[r.kind].name.toLowerCase()} is down`;
  return null;
}

/** Once a day: a fall being cleared is finished when its days are up; vehicles cut off outside go home when the way is open again. */
export function corridorDay(s: GameState): void {
  for (const r of s.perimeter) {
    if (r.collapsed && r.collapsed.clearsAt !== null && s.clock.t >= r.collapsed.clearsAt) {
      delete r.collapsed;
      log(s, `The ${PERIMETER[r.kind].name.toLowerCase()} is clear again.`);
    }
  }
  if (!wayCut(s)) {
    const back = (s.vehicles ?? []).filter(v => v.stranded);
    for (const v of back) { delete v.stranded; delete v.away; }
    if (back.length) log(s, `The way in is open again: ${back.length === 1 ? 'the vehicle that was cut off outside drives' : `the ${back.length} vehicles that were cut off outside drive`} home.`);
  }
}

/** Chance a breaching crew brings a portal down, per charge they carried (a grenade 1, a rocket 2), and its cap. */
export const SAPPER_P_PER_CHARGE = 0.1, SAPPER_P_CAP = 0.55;
/** A tunnel-bridge is a span of concrete over a gorge, not a portal in rock: sappers drop it less readily than a bore's mouth is choked. */
export const SAPPER_BRIDGE_K = 0.6;
/** What each counter takes off the chance (multipliers, all 1 or less, so a counter never makes a collapse likelier). */
export const GUARD = {
  /** A blast door deep in a bore's portal (a steel door is the baseline). */
  deepDoor: 0.6,
  /** Listening posts (powered ground sensors) hear a charge being set: up to this much off at full coverage of the wall. */
  listening: 0.3,
  /** Each manned tower or guard post with eyes on a portal (within `GUARD.reach` tiles), at most `GUARD.towers` of them. */
  tower: 0.85, towers: 3, reach: 14,
} as const;

export interface CollapseGuard {
  /** Multiplier on the sappers' chance (1 = nothing in the way). */
  factor: number;
  /** The counters that are working, in words (the Defense tab's line and the log). */
  parts: string[];
}

/** What stands between a sapper crew and a portal: the door, the ears underground and the eyes on it. Pure. */
export function collapseGuard(s: GameState, r: PerimeterRun): CollapseGuard {
  let factor = 1;
  const parts: string[] = [];
  if (PERIMETER[r.kind].bore) { factor *= GUARD.deepDoor; parts.push('a blast door set deep in the portal'); }
  const sets = Math.floor(s.stock.ground_sensor ?? 0);
  if (sets > 0 && powered(s)) {
    const cover = Math.min(1, sets * 120 / Math.max(120, wallMetres(s)));
    if (cover > 0) { factor *= 1 - GUARD.listening * cover; parts.push(`listening posts (${Math.round(cover * 100)} % of the wall)`); }
  }
  const ends: Pt[] = r.pts.length ? [r.pts[0], r.pts[r.pts.length - 1]] : [];
  const guards = towerPosts(s).filter(tp => ends.some(e => Math.hypot(tp.st.x - e[0], tp.st.z - e[1]) <= GUARD.reach)).length;
  if (guards > 0) { factor *= GUARD.tower ** Math.min(GUARD.towers, guards); parts.push(`${Math.min(GUARD.towers, guards)} guard post${guards > 1 ? 's' : ''} watching the portal`); }
  return { factor: Math.round(factor * 1000) / 1000, parts };
}

/** The chance a crew with `charges` brings `id` down on `result`, after the counters (0 when it cannot be). */
export function sapperChance(s: GameState, id: string, charges: number, result: 'breached' | 'overrun'): number {
  const r = s.perimeter.find(x => x.id === id);
  if (!r || !corridorOf(r) || charges <= 0) return 0;
  const raw = Math.min(SAPPER_P_CAP, charges * SAPPER_P_PER_CHARGE * (result === 'overrun' ? 1.3 : 1)) * (r.kind === 'tunnel_bridge' ? SAPPER_BRIDGE_K : 1);
  return raw * collapseGuard(s, r).factor;
}

/**
 * A crew that got in by a tunnel: with explosives they blow the portal behind them (the doors were the way in; now the way out for the next crew is rock).
 * A rock or slope tunnel is choked with rubble; a tunnel-bridge is dropped into the gorge. Returns the log lines. `rnd` is injectable for tests; the default is seeded from the game.
 */
export function sapperBreach(s: GameState, id: string, charges: number, result: 'breached' | 'overrun', rnd: () => number = mulberry32(s.seed * 977 + Math.floor(s.clock.t) * 13 + 5)): string[] {
  const r = s.perimeter.find(x => x.id === id);
  if (!r) return [];
  const p = sapperChance(s, id, charges, result);
  if (p <= 0) return [];
  const name = PERIMETER[r.kind].name.toLowerCase();
  if (rnd() >= p) return collapseGuard(s, r).parts.length > (PERIMETER[r.kind].bore ? 1 : 0) ? [`Their demolition team had charges for the ${name}, but they were watched and never got them set.`] : [];
  if (r.kind === 'tunnel_bridge') {
    const out = strandAway(s);
    if (dropBridge(s, id) !== null) return [];
    chronicle(s, 'threat', `Raiders dropped the ${name} into the gorge${out ? `; ${out === 1 ? 'a vehicle was' : `${out} vehicles were`} cut off outside` : ''}.`);
    return [`Their demolition team dropped the ${name} behind them. It is a plan again until rebuilt.`];
  }
  return collapseCorridor(s, id, 'sappers') === null ? [`Their demolition team blew the ${name} behind them: it is choked with rubble.`] : [];
}

// ── stranded vehicles ──

/**
 * The vehicles a lost way strands. A dropped tunnel-bridge (or a collapsed tunnel) cuts the compound off from the road: the vehicles parked inside it
 * (`inside`: ids the caller knows to stand beyond the corridor) cannot leave; the ones that are away (out on a run) cannot get home and wait at the
 * outer end. Pure given which vehicles stand inside.
 */
export function strandedVehicles(s: Pick<GameState, 'perimeter' | 'vehicles'>, inside: ReadonlySet<string>): { trapped: string[]; waiting: string[] } {
  const cut = s.perimeter.some(r => PERIMETER[r.kind].vehicleWay && (!!r.dropped || !!r.collapsed));
  if (!cut) return { trapped: [], waiting: [] };
  const vs = s.vehicles ?? [];
  return {
    trapped: vs.filter(v => !v.away && inside.has(v.id)).map(v => v.id),
    waiting: vs.filter(v => v.away).map(v => v.id),
  };
}

export { DOOR_ALARM_DETECTION };

/** Are the steel doors locked right now? Dusk to dawn, and while something is waiting at the gate (the alarm: the watch calls it, `DOOR_ALARM_DETECTION`). */
export function locksNow(s: Pick<GameState, 'clock' | 'gate'>): boolean {
  return doorsLocked(isNightHour(hourOf(s.clock.t)), s.gate.pending ? DOOR_ALARM_DETECTION : 0);
}

/** Words for the Defense tab: how long each tunnel takes to go through, who it holds up, and what is cut off. */
export function corridorLines(s: GameState): string[] {
  const out: string[] = [];
  for (const c of standingCorridors(s)) {
    const name = PERIMETER[c.kind].name.toLowerCase();
    if (c.collapsed) { out.push(`The ${name} is choked with rubble: nothing crosses, on foot or on wheels, until a contractor clears it.`); continue; }
    const f = crossing(c, 'family', false, 0), v = crossing(c, 'vehicle', false, 0);
    out.push(`The ${name} is ${c.lenM} m: about ${(Math.round(f.seconds / 6) / 10).toFixed(1)} minutes on foot, ${Math.round(v.seconds)} seconds by vehicle. The doors stand open by day and lock from dusk to dawn and on the alarm; the family has keys (${KEY_S} s a door), a crew is held ${DOOR_DELAY} s at the outer one.`);
    const gd = collapseGuard(s, s.perimeter.find(r => r.id === c.id)!);
    out.push(`If a crew with explosives gets in this way, each charge has about a ${Math.round(SAPPER_P_PER_CHARGE * (c.kind === 'tunnel_bridge' ? SAPPER_BRIDGE_K : 1) * gd.factor * 1000) / 10} % chance to bring it down${gd.parts.length ? `; held down by ${gd.parts.join(', ')}` : '; nothing watches the portal'}.`);
  }
  const cut = wayCut(s);
  if (cut) out.push(`Cut off: ${cut}. ${(s.vehicles ?? []).filter(v => v.stranded).length ? 'Some vehicles wait outside.' : 'Nothing with wheels crosses.'}`);
  return out;
}
