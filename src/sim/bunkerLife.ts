/**
 * Life in the bunker (pure, nothing stored: derived from the structures, the
 * stock and the day's trouble). Three things the art reads:
 *
 *  The control room (`bunker_comms`) has a wall of screens. What they show is
 *  the gear the family actually owns (`securityFeeds`): cameras (4 IR units),
 *  a thermal camera on the drive, driveway sensors, ground sensors, a radio.
 *  No cameras = dark panels; no power = dark panels; nothing built to look
 *  at = "no feed".
 *  The Watch duty station: with a finished control room and powered cameras the
 *  first watcher at night sits at the console (`consoleManned`); the screens
 *  watch more of the line than one pair of eyes (daily.watchDetection x1.15).
 *  The floor hatch (`bunker_floorhatch`) stands open while people go down:
 *  fallout shelter days, a hostile crew at the gate, a tornado or derecho on
 *  the way (`bunkerAlert`, `hatchOpen`).
 *
 * Reads: gear.ts (powered), construction.ts, weatherThreats.ts, nuclear.ts,
 * encounters.ts (the crew at the gate), radio.ts (what the set can hear).
 */
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { powered } from './gear';
import { radioSet, type RadioSet } from './radio';
import { isNuclear, SHELTER_DAYS } from './nuclear';
import { weatherOf, type WeatherKind } from './weatherThreats';
import { dayIndex, type GameState } from './state';
import { watchNow } from './daily';

const have = (s: GameState, kind: string | ((k: string) => boolean)): boolean =>
  s.structures.some(st => isFinished(st) && (typeof kind === 'string' ? st.kind === kind : kind(st.kind)));
const n = (s: GameState, m: string): number => Math.floor((s.stock as Record<string, number>)[m] ?? 0);

/** A finished control room (the comms room with the wall of screens). */
export const hasControlRoom = (s: GameState): boolean => have(s, 'bunker_comms');

/** Cameras the family owns: 4 IR cameras a unit, a fixed thermal camera on the drive. */
export const cameraCount = (s: GameState): { ir: number; thermal: number } => ({ ir: n(s, 'cameras') * 4, thermal: n(s, 'thermal_cam') });

/** Is the console staffed-capable: a control room, power, and at least one camera to watch. */
export function consoleManned(s: GameState): boolean {
  const c = cameraCount(s);
  return hasControlRoom(s) && powered(s) && (c.ir > 0 || c.thermal > 0);
}

/** How much more the line is watched with a man at the screens (daily.watchDetection). */
export const CONSOLE_EYES = 1.15;

// ── The feeds ────────────────────────────────────────────────────────────

export type CamId = 'house' | 'gardens' | 'solar' | 'gate';
export type FeedState = 'live' | 'dark' | 'nosignal' | 'noview';
export interface CamFeed {
  id: CamId;
  label: string;
  state: FeedState;
  /** Grey-green night-vision look (an IR camera, or night). */
  ir: boolean;
  /** The drive's thermal camera (white-hot figures). */
  thermal: boolean;
  /** A driveway sensor tripped: someone is at the gate. */
  motion: boolean;
  /** People in view (the hands working there right now: only the gate and the house are read from the sim). */
  people: number;
}
export interface RadarBlip { /** 0 = north, clockwise, radians. */ bearing: number; /** 0..1 of the ring. */ range: number; kind: 'crew' | 'dig' | 'neighbor' }
export interface Feeds {
  cams: CamFeed[];
  radar: { on: boolean; blips: RadarBlip[]; /** Ground sensors fitted: the radar shows digging. */ seismic: boolean };
  weather: { on: boolean; line: string; warn: boolean; storm: WeatherKind | null };
  news: { set: RadioSet; lines: string[]; on: boolean };
  /** The corkboard: what the room's map shows (structure kinds and the wall's finished length). */
  powered: boolean;
  /** Changes when anything a screen draws changes (coarse: the clock's quarter-hours are the painter's, not here). */
  key: string;
}

const COMPASS: Record<'north' | 'south' | 'east' | 'west', number> = { north: 0, east: Math.PI / 2, south: Math.PI, west: -Math.PI / 2 };
const HOSTILE = new Set(['looters', 'gang', 'militia', 'horde', 'patrol', 'requisition', 'break_in', 'ransom']);

const hash = (str: string): number => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };

/** What the screens show right now (a pure function of the state; the painter turns it into pixels). */
export function securityFeeds(s: GameState): Feeds {
  const c = cameraCount(s), pw = powered(s);
  const home = have(s, k => isHome(k));
  const garden = have(s, k => ['garden', 'greenhouse', 'greenhouse_heated', 'field', 'orchard', 'orchard_grove', 'orchard_terraced'].includes(k));
  const solar = have(s, k => ['solar_array', 'solar_farm', 'garage_solar', 'lodge_solar'].includes(k));
  const someone = !!s.gate.pending;
  const sensor = n(s, 'driveway_alarm') > 0;
  const state = (needsIr: boolean, subject: boolean): FeedState =>
    !pw && (c.ir > 0 || c.thermal > 0) ? 'dark' : needsIr ? (c.ir > 0 ? (subject ? 'live' : 'noview') : 'nosignal') : (c.ir > 0 || c.thermal > 0 ? 'live' : 'nosignal');
  const h = (s.clock.t % 1) * 24, night = h >= 20 || h < 6;
  const people = (st: (t: string) => boolean) => s.personState.filter(ps => ps.needs.died == null && st(ps.task)).length;
  const cams: CamFeed[] = [
    { id: 'house', label: 'HOUSE', state: state(true, home), ir: night, thermal: false, motion: false, people: people(t => t === 'chores' || t === 'leisure') },
    { id: 'gardens', label: 'GARDENS', state: state(true, garden), ir: night, thermal: false, motion: false, people: 0 },
    { id: 'solar', label: 'SOLAR', state: state(true, solar), ir: night, thermal: false, motion: false, people: 0 },
    { id: 'gate', label: 'GATE', state: state(false, true), ir: night || c.ir === 0, thermal: c.thermal > 0, motion: sensor && someone, people: someone ? Math.min(6, s.gate.pending!.size) : 0 },
  ];
  const blips: RadarBlip[] = [];
  const e = s.gate.pending;
  if (e && pw) {
    const dir = e.neighbor ? s.neighbors.find(x => x.id === e.neighbor)?.dir : undefined;
    const base = dir ? COMPASS[dir] : hash(e.id) * Math.PI * 2;
    const k = Math.min(7, Math.max(1, e.size));
    for (let i = 0; i < k; i++) blips.push({ bearing: base + (hash(e.id + i) - 0.5) * 0.35, range: 0.55 + hash(e.id + 'r' + i) * 0.3, kind: HOSTILE.has(e.kind) ? 'crew' : 'neighbor' });
  }
  const seismic = n(s, 'ground_sensor') > 0 && pw;
  const dig = s.digs?.active;
  if (seismic && dig) blips.push({ bearing: hash(dig.id) * Math.PI * 2, range: 0.3 + hash('d') * 0.25, kind: 'dig' });
  const w = weatherOf(s), now = dayIndex(s.clock.t), a = w.active;
  const warn = !!a && now < a.at, on = !!a && now >= a.at && now <= a.until;
  const set = radioSet(s);
  const lines = set === 'none' && !pw ? [] : s.log.slice(-4).map(l => l.text);
  const f: Feeds = {
    cams,
    radar: { on: pw && hasControlRoom(s), blips, seismic },
    weather: { on: pw, line: a && (warn || on) ? `${warn ? 'WARNING' : 'ACTIVE'}: ${a.kind.toUpperCase()}` : 'NO WARNINGS', warn: warn || on, storm: a && (warn || on) ? a.kind : null },
    news: { set, lines, on: pw && set !== 'none' },
    powered: pw,
    key: '',
  };
  f.key = JSON.stringify([cams.map(x => [x.state, x.ir, x.thermal, x.motion, x.people]), blips.map(b => [Math.round(b.bearing * 10), b.kind]), f.weather, f.news.set, lines, pw, seismic]);
  return f;
}

// ── The hatch ────────────────────────────────────────────────────────────

export type BunkerAlert = 'none' | 'fallout' | 'raid' | 'storm';

/** Why the family is going down (or about to): the fallout shelter days, a hostile crew at the gate, a tornado / derecho on its way. */
export function bunkerAlert(s: GameState): BunkerAlert {
  if (isNuclear(s) && s.clock.t < s.disaster.hitAt + SHELTER_DAYS) return 'fallout';
  const e = s.gate.pending;
  if (e && HOSTILE.has(e.kind)) return 'raid';
  const a = weatherOf(s).active, now = dayIndex(s.clock.t);
  if (a && (a.kind === 'tornado' || a.kind === 'derecho') && now >= a.at - 0 && now <= a.until) return 'storm';
  return 'none';
}

/** The floor hatch stands open while people go down: an alert with someone alive to take shelter. */
export const hatchOpen = (s: GameState): boolean => bunkerAlert(s) !== 'none' && s.personState.some(ps => ps.needs.died == null);

// ── Who is down there ────────────────────────────────────────────────────

export interface Occupant { id: string; role: 'console' | 'seat' | 'bed' }

/**
 * Who is in the bunker right now, and what they are doing (the art puts them in the rooms' seats, beds and at the console):
 * the watcher at the control room's screens, and everyone sheltering through the fallout days (asleep in the bunks at night,
 * sitting about the galley and the bunkroom by day). Nothing is stored.
 */
export function bunkerOccupants(s: GameState): Occupant[] {
  const out: Occupant[] = [];
  const cons = new Set(watchNow(s).filter(w => w.post === 'console').map(w => w.id));
  for (const ps of s.personState) {
    if (ps.needs.died != null) continue;
    if (cons.has(ps.id)) out.push({ id: ps.id, role: 'console' });
    else if (ps.task === 'shelter') out.push({ id: ps.id, role: 'seat' });
    else if (ps.task === 'sleep' && isNuclear(s) && s.clock.t < s.disaster.hitAt + SHELTER_DAYS) out.push({ id: ps.id, role: 'bed' });
  }
  return out;
}
