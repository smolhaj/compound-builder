/**
 * Warning on the county road (docs/DECISIONS.md, "Road warning and passers-by"). Pure.
 *
 * A non-raid visitor held in `gate.incoming` (sim/roadLead.ts) is on the road for 30 to 180 game minutes before the card. Whether the
 * family KNOWS it is coming, and for how long, depends on how much of that road they can see:
 *
 *   eyes      someone about the yard (half as far in the dark, less in fog)
 *   watch     a posted watcher (the daily roster's `watch` duty, sim/daily.ts `watchDetection`)
 *   tower     the best tower or the patrol deck (sim/towers.ts)
 *   cameras   powered cameras and a thermal camera
 *   net       the neighbors' road-watch chat (sim/watch.ts)
 *   sightline how clear the line from the buildings to the road is (the world measures it; 1 when nothing does)
 *
 * Their sum, in road units (the road shows `WINDOW` of them either side of the gate; 1 unit is about 6 m), is the share of the approach
 * the family can see: `warnMinutes = lead x units / WINDOW`, in quarter hours. Below one quarter hour there is no warning: the card is
 * the first the family knows (the old behavior). With a warning the family gets a short window to prepare:
 *
 *   greeter   an adult walks down to the drive to meet them: they are read before the card (detection +`GREETER_DETECTION`)
 *   gate      the gate is shut and manned: barrier +`READY_BARRIER`, a rifle behind it (fighters +`READY_FIGHTERS`)
 *
 * Raids keep their own clock (sim/siege.ts) and are not touched.
 */
import type { GameState } from './state';
import { WINDOW, partyForEncounter } from './roadTraffic';
import { leadMinutes } from './roadLead';
import { watchDetection } from './daily';
import { towerPosts, towerReach } from './towers';
import { walkwayWatch } from './walkway';
import { communityPosture } from './watch';
import { powered } from './gear';
import { fogSightK } from './fogFx';
import { hourOf } from './state';
import { log } from './economy';
import { canGo } from './rescue';
import { freshRoad } from './roadPassers';

export const SEE = {
  /** Someone about the place: units of road, by day and in the dark. */
  EYES_DAY: 8, EYES_NIGHT: 4,
  /** Units per detection point of the posted watch (0-20 points). */
  PER_WATCH_POINT: 3,
  /** A tower: base, plus per unit of its reach (sim/towers.ts `towerReach`). */
  TOWER_BASE: 30, TOWER_PER_REACH: 6,
  /** Cameras and a thermal camera (they need power); capped together. */
  CAMERA: 22, THERMAL: 20, CAMERA_CAP: 40,
  /** The neighbors' road-watch chat. */
  NET: 18,
} as const;

/** The prepared answers' effects on the posture while their card is up. */
export const GREETER_DETECTION = 8;
export const READY_BARRIER = 10;
export const READY_FIGHTERS = 1;

export type PrepKind = 'greeter' | 'gate';
export interface Prep { eid: string; kind: PrepKind; pid?: string; at: number }

export interface SightPart { id: 'eyes' | 'watch' | 'tower' | 'cameras' | 'net'; label: string; units: number }

/** The world's measure of how clear the line from the buildings to the road is (0.6 buried in trees ... 1.4 open); null: not measured. */
let sightProbe: (() => number) | null = null;
export const setRoadSightProbe = (f: (() => number) | null): void => { sightProbe = f; };
export const roadSightK = (): number => { const k = sightProbe?.(); return typeof k === 'number' && Number.isFinite(k) ? Math.max(0.5, Math.min(1.5, k)) : 1; };

const night = (s: GameState): boolean => { const h = hourOf(s.clock.t); return h >= 20 || h < 6; };

/** Where the road is seen from, in units of road. */
export function sightParts(s: GameState): SightPart[] {
  const dark = night(s), kEye = fogSightK(s, 'eye'), out: SightPart[] = [];
  out.push({ id: 'eyes', label: 'Someone about the yard', units: (dark ? SEE.EYES_NIGHT : SEE.EYES_DAY) * kEye });
  const wd = watchDetection(s);
  if (wd > 0) out.push({ id: 'watch', label: 'A watcher on duty', units: SEE.PER_WATCH_POINT * wd * kEye });
  const deck = walkwayWatch(s);
  if (towerPosts(s).length || deck.view > 0) {
    const lit = s.structures.some(st => st.kind === 'watchtower_flood') && powered(s);
    out.push({ id: 'tower', label: 'A tower', units: (SEE.TOWER_BASE + SEE.TOWER_PER_REACH * towerReach(s, dark, lit)) * kEye });
  }
  const cam = powered(s) ? Math.min(SEE.CAMERA_CAP, (Math.floor(s.stock.cameras ?? 0) > 0 ? SEE.CAMERA * fogSightK(s, 'camera') : 0) + (Math.floor(s.stock.thermal_cam ?? 0) > 0 ? SEE.THERMAL * fogSightK(s, 'thermal') : 0)) : 0;
  if (cam > 0) out.push({ id: 'cameras', label: 'Cameras', units: cam });
  if (communityPosture(s).detection > 0) out.push({ id: 'net', label: 'The neighbors\' road watch', units: SEE.NET });
  return out;
}

/** Units of the road the family can see now (0 .. WINDOW). */
export function sightUnits(s: GameState): number {
  const sum = sightParts(s).reduce((a, p) => a + p.units, 0);
  return Math.max(0, Math.min(WINDOW, sum * roadSightK()));
}

/** Game minutes of warning for a party whose approach takes `lead` minutes (quarter hours; 0 under 15). */
export function warnFrom(lead: number, units: number): number {
  const w = Math.floor(lead * Math.min(1, Math.max(0, units) / WINDOW) / 15) * 15;
  return w >= 15 ? Math.min(lead, w) : 0;
}

/** Minutes of warning the family has of this held visitor now. */
export const warnMinutes = (s: GameState): number => {
  const inc = s.gate.incoming;
  return inc && inc.from !== undefined ? warnFrom(leadMinutes(inc.e, s.seed), sightUnits(s)) : 0;
};

/** "a pickup with three in the bed", "five on foot with a handcart": what the watcher sees coming. */
export function describeParty(s: GameState, e: Parameters<typeof partyForEncounter>[0]): string {
  const p = partyForEncounter(e, s.seed), lead = p.members[0]?.kind;
  const heads = p.heads;
  const people = heads === 1 ? 'one person' : `${heads} people`;
  const cart = p.members.some(m => m.kind === 'cart');
  if (lead === 'walker' || lead === 'cart') return `${people} on foot${cart ? ' with a handcart' : ''}`;
  if (lead === 'bicycle') return `${people} on bicycles`;
  const vehicle = lead === 'flatbed' ? 'a truck with a trailer' : lead === 'rv' ? 'a camper' : lead === 'pickup' ? 'a pickup' : lead === 'van' ? 'a van' : 'a car';
  const walkers = p.members.filter(m => m.kind === 'walker').length;
  return walkers > 0 ? `${vehicle} and ${walkers} on foot` : `${vehicle}, ${people}`;
}

/** Each sub-step: the held visitor comes into view. Returns the line logged, or null. */
export function roadWarnStep(s: GameState): string | null {
  const road = s.road, inc = s.gate.incoming;
  // a prepared answer lasts only as long as the visitor it was for
  if (road?.prep && !(inc?.e.id === road.prep.eid || s.gate.pending?.id === road.prep.eid)) delete road.prep;
  if (!inc || inc.from === undefined || inc.seen !== undefined) return null;
  const lead = leadMinutes(inc.e, s.seed), w = warnFrom(lead, sightUnits(s));
  if (w < 15 || s.clock.t < inc.at - w / 1440 - 1e-9) return null;
  inc.seen = s.clock.t;
  const best = sightParts(s).sort((a, b) => b.units - a.units)[0];
  const by = best ? ({ eyes: 'Somebody in the yard sees', watch: 'The watch sees', tower: 'From the tower: ', cameras: 'On the camera:', net: 'The neighbors\' chat says there is' } as const)[best.id] : 'Somebody sees';
  const mins = Math.max(15, Math.round((inc.at - s.clock.t) * 1440 / 15) * 15);
  const line = `${by} ${describeParty(s, inc.e)} on the county road, headed this way. About ${mins >= 60 ? `${Math.round(mins / 6) / 10} hours` : `${mins} minutes`} out.`;
  log(s, line);
  return line;
}

// ── preparing ──

/** Why the family can't prepare now (null: it can). */
export function prepProblem(s: GameState, kind: PrepKind): string | null {
  const inc = s.gate.incoming;
  if (!inc || inc.from === undefined || inc.seen === undefined) return 'nobody is coming that you have seen';
  if (s.road?.prep) return 'already prepared';
  if (kind === 'greeter' && !greeterCandidate(s)) return 'nobody free to walk down to the drive';
  if (kind === 'gate' && adultsHome(s).length < 1) return 'nobody free to man the gate';
  return null;
}

const adultsHome = (s: GameState) => s.people.filter(p => !p.kid && canGo(s, p));

/** The best talker among the adults who can go (ties: the first). */
export function greeterCandidate(s: GameState) {
  return adultsHome(s).sort((a, b) => (b.skills.negotiator ?? 0) - (a.skills.negotiator ?? 0))[0] ?? null;
}

export function prepare(s: GameState, kind: PrepKind): string | null {
  const why = prepProblem(s, kind);
  if (why) return why;
  const inc = s.gate.incoming!;
  const who = kind === 'greeter' ? greeterCandidate(s)! : adultsHome(s)[0];
  s.road ??= freshRoad();
  s.road.prep = { eid: inc.e.id, kind, pid: who.id, at: s.clock.t };
  const ps = s.personState.find(x => x.id === who.id);
  if (ps) ps.fatigue = Math.min(100, (ps.fatigue ?? 0) + 2);
  log(s, kind === 'greeter' ? `${who.first} walked down to meet them at the drive.` : `${who.first} shut the gate and took a rifle to the post behind it.`);
  return null;
}

/** What the prepared answer adds to the posture while its card is up (zero otherwise). */
export function prepPosture(s: GameState): { detection: number; barrier: number; fighters: number } {
  const pr = s.road?.prep, e = s.gate.pending;
  if (!pr || !e || pr.eid !== e.id) return { detection: 0, barrier: 0, fighters: 0 };
  return pr.kind === 'greeter' ? { detection: GREETER_DETECTION, barrier: 0, fighters: 0 } : { detection: 0, barrier: READY_BARRIER, fighters: READY_FIGHTERS };
}

/** A card with a prepared answer reads one line more. */
export function prepLine(s: GameState, eid: string): string | null {
  const pr = s.road?.prep;
  if (!pr || pr.eid !== eid) return null;
  const p = s.people.find(x => x.id === pr.pid);
  return pr.kind === 'greeter' ? `${p?.first ?? 'Someone'} met them at the drive first, and had a good look at them.` : `${p?.first ?? 'Someone'} has the gate shut and a rifle behind it.`;
}

