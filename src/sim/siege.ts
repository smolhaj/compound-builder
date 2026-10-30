/**
 * The raid cutscene's structure and clock (the user: "raiders/invaders should
 * have their own cutscene whenever they come. like if it's 2:15AM and invaders
 * are there, the time pauses until you hit 'watch' … real time still elapses,
 * but you're unable to build anything during that duration. architect how long
 * the battles/invasion attempts will last, but it should be realistic").
 *
 * Pure and seeded. This module decides
 *  - WHEN a raid arrives (an hour of the day by kind: gangs in the small hours,
 *    requisition teams in daylight), so the "Watch" prompt can say 2:15 AM;
 *  - HOW LONG it lasts: most raids are one scene of 2-8 minutes (a standoff, a
 *    rush, a retreat); an organized crew at night may run a SIEGE of 2-5 scenes
 *    (probing the line, harassing fire, fires set), with 10-90 minutes of game
 *    time skipped between scenes;
 *  - HOW THE CLOCK MOVES: the game clock advances by exactly the siege's length
 *    (gaps + scene lead-ins + the fights + the tails), once, when the cutscene
 *    commits (`commitDays`). While it plays, a virtual clock reads off the same
 *    timeline (`locate`), so the sim never double counts a minute.
 *
 * A scene is   lead-in (the approach or the standoff, time-lapsed)
 *            + the fight (played second for second, 1 playback s = 1 game s)
 *            + a tail (the lull, the raiders drawing off, the watch counting heads).
 */
import type { Battle, BattleEvent, BattleUnit } from './battleTypes';
import { planBattle, type RaiderTemper } from './battle';
import { ORGANIZED, type Encounter, type EncounterKind, type Stance } from './encounters';
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { mulberry32 } from './rng';
import { dayIndex, hourOf, type GameState } from './state';

// ─────────────────────────────────────────────────────────────────────────
// Which encounters are raids, and when they come
// ─────────────────────────────────────────────────────────────────────────

/** Kinds that arrive as an attack and get the cutscene (not traders, neighbors, refugees, a trial's end or a break-in). */
const RAID_KINDS: ReadonlySet<EncounterKind> = new Set(['looters', 'gang', 'militia', 'patrol', 'requisition', 'horde']);

/** Anything that plays as a cutscene: a raid, or a night break-in (a short single scene in the house). */
export function hasCutscene(e: Pick<Encounter, 'kind' | 'strength' | 'stances'> | null | undefined): boolean {
  return !!e && (e.kind === 'break_in' || isRaid(e));
}

/** An encounter that plays as a raid: an armed (or dead) crew at the gate that can be fought. */
export function isRaid(e: Pick<Encounter, 'kind' | 'strength' | 'stances'> | null | undefined): boolean {
  return !!e && RAID_KINDS.has(e.kind) && e.strength > 0 && e.stances.includes('defend');
}

/** Windows of the day [from, to) in hours, with weights, by kind. */
const WINDOWS: Record<string, Array<[number, number, number]>> = {
  looters: [[18, 22, 4], [9, 17, 3.5], [1, 4.5, 2.5]],
  gang: [[0, 5, 6], [20, 24, 2.5], [5, 7, 1.5]],
  militia: [[5, 8, 3], [9, 17, 5], [19, 23, 1.5]],
  patrol: [[8, 17, 8], [5, 8, 1.5], [20, 24, 0.5]],
  requisition: [[8, 17, 9], [17, 19, 1]],
  horde: [[0, 24, 1]],
  break_in: [[1.5, 3.5, 1]],
};

/** The hour of day (0-24, quarter hours) a raid of this kind arrives. Deterministic in the seed. */
export function arrivalHour(kind: EncounterKind, seed: number): number {
  const r = mulberry32(seed * 6271 + 13);
  const w = WINDOWS[kind] ?? WINDOWS.looters;
  let u = r() * w.reduce((a, x) => a + x[2], 0);
  let win = w[0];
  for (const x of w) { if (u < x[2]) { win = x; break; } u -= x[2]; }
  const h = win[0] + r() * (win[1] - win[0]);
  return Math.min(23.75, Math.floor(h * 4) / 4);
}

/** Hold a freshly rolled raid until its hour (it arrives at `incoming.at`, in game days). Returns false if it is due now (leave it pending). */
export function scheduleArrival(s: GameState, e: Encounter): boolean {
  const day = dayIndex(s.clock.t);
  const at = (day - 0.25) + arrivalHour(e.kind, s.seed * 31 + e.day) / 24;
  if (at <= s.clock.t + 1e-9) return false;
  s.gate.pending = null;
  s.gate.incoming = { e, at };
  return true;
}

/** Each sub-step: when the hour comes, the raid is at the gate. Returns the encounter that just arrived, or null. */
export function arrivalCheck(s: GameState): Encounter | null {
  const inc = s.gate.incoming;
  if (!inc || s.clock.t < inc.at - 1e-9 || s.gate.pending) return null;
  s.gate.pending = inc.e;
  s.gate.incoming = null;
  return inc.e;
}

// ─────────────────────────────────────────────────────────────────────────
// Time words
// ─────────────────────────────────────────────────────────────────────────

/** "2:15 AM" from an hour of day (fractional hours). */
export function clockLabel(hour: number): string {
  const m = Math.round(((hour % 24) + 24) % 24 * 60) % (24 * 60);
  const h24 = Math.floor(m / 60), mm = m % 60;
  return `${h24 % 12 === 0 ? 12 : h24 % 12}:${String(mm).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/** "40 minutes later", "an hour and 10 minutes later". */
export function gapLabel(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `${min} minutes later`;
  const h = Math.floor(min / 60), m = min % 60;
  return `${h === 1 ? 'An hour' : `${h} hours`}${m ? ` and ${m} minutes` : ''} later`;
}

/** Night is when it is dark enough to need lamps: 8 PM to 6 AM (the same line battle.ts draws). */
export const isNight = (hour: number) => hour < 6 || hour >= 20;

// ─────────────────────────────────────────────────────────────────────────
// The plan: scenes and their lengths
// ─────────────────────────────────────────────────────────────────────────

export type SceneKind = 'gate' | 'probe' | 'harass' | 'fires' | 'assault';

export interface Scene {
  index: number;
  kind: SceneKind;
  label: string;
  /** Game seconds skipped (the clock runs through them) between the end of the last scene and the start of this one; 0 for the first. */
  gap: number;
  /** Game seconds of approach / standoff, time-lapsed in playback. */
  lead: number;
  /** Game seconds of the fight itself, played 1:1. */
  fight: number;
  /** Game seconds of the lull after, time-lapsed. */
  tail: number;
}

export interface SiegePlan {
  scenes: Scene[];
  /** What kind of encounter this is (captions differ for a break-in). */
  crew: EncounterKind;
  /** The hour of day the raid arrived. */
  startHour: number;
  night: boolean;
  /** Game seconds from arrival to the end of the last scene. */
  totalGame: number;
  /** Playback seconds if nothing is skipped (gaps shown as a 3-second card each). */
  totalReal: number;
}

export interface SiegeInput {
  kind: EncounterKind;
  size: number;
  temper: RaiderTemper;
  hour: number;
  seed: number;
  /** Whether the stance led to a fight (the planned battle exists). */
  fought: boolean;
  /** The planned battle's length in seconds (its `duration`), if fought. */
  fightSeconds: number | null;
  /** Hunted for the family in the dark (organized crews with a taste for it); default from kind. */
  organized?: boolean;
}

/** How long a scene's lead-in, fight and tail take in the playback (real seconds). */
export function playbackLengths(sc: Scene): { lead: number; fight: number; tail: number } {
  return {
    lead: sc.lead > 0 ? Math.min(9, Math.max(3, sc.lead / 22)) : 0,
    fight: sc.fight,
    tail: sc.tail > 0 ? Math.min(6, Math.max(2, sc.tail / 18)) : 0,
  };
}
/** The card shown over a skipped gap, in playback seconds. */
export const GAP_CARD_SECONDS = 3;

const sceneGame = (sc: Pick<Scene, 'lead' | 'fight' | 'tail'>) => sc.lead + sc.fight + sc.tail;
export const sceneGameSeconds = sceneGame;

const SCENE_LABEL: Record<SceneKind, string> = {
  gate: 'At the gate', probe: 'Probing the line', harass: 'Harassing fire', fires: 'Fires in the dark', assault: 'The assault',
};

/** Chance an organized crew settles in for a night siege instead of one rush. */
function siegeChance(kind: EncounterKind, size: number, night: boolean, temper: RaiderTemper): number {
  if (size < 4) return 0;
  const base = kind === 'gang' ? 0.7 : kind === 'militia' ? 0.4 : kind === 'patrol' || kind === 'requisition' ? 0.2 : kind === 'looters' ? 0.08 : 0;
  const t = temper === 'savage' ? 1.15 : temper === 'hard' ? 1.05 : 1;
  return Math.min(0.9, (night ? base : base * 0.18) * t);
}

/**
 * The scenes of a raid. A peaceful stance (hide, parley, a warning that worked) is one scene at the
 * gate. A fight is one scene of 2-8 minutes, or, for an organized crew mostly at night, a siege of
 * 2-5 scenes whose last is the assault the battle sim fought, with 10-90 minutes between them.
 */
export function planSiege(inp: SiegeInput): SiegePlan {
  const r = mulberry32(inp.seed * 9173 + inp.size * 31 + 7);
  const night = isNight(inp.hour);
  const organized = inp.organized ?? ORGANIZED.has(inp.kind);
  const rabble = !organized && inp.size < 5;
  const leadOf = () => (rabble ? 25 + r() * 80 : organized ? 110 + r() * 190 : 55 + r() * 130);
  const tailOf = () => 35 + r() * 85;
  const scenes: Scene[] = [];
  const mk = (kind: SceneKind, fight: number, gap: number): Scene => {
    const house = inp.kind === 'break_in';
    let lead = house ? 40 + r() * 50 : leadOf(), tail = house ? 40 + r() * 50 : tailOf();
    // a scene is never under two minutes whole, and (the fight aside) never over eight (a break-in: four)
    const total0 = lead + fight + tail, cap = house ? 240 : 480;
    if (total0 < 120) lead += 120 - total0;
    else if (total0 > cap) { const cut = Math.min(total0 - cap, lead + tail - 40); const k = (lead + tail - cut) / (lead + tail); lead *= k; tail *= k; }
    return { index: scenes.length, kind, label: SCENE_LABEL[kind], gap: Math.round(gap), lead: Math.round(lead), fight: Math.round(fight), tail: Math.round(tail) };
  };
  const finalFight = Math.max(20, Math.round(inp.fightSeconds ?? 45 + r() * 60));
  const siege = inp.fought && r() < siegeChance(inp.kind, inp.size, night, inp.temper);
  if (!siege) {
    scenes.push(mk(inp.fought ? 'assault' : 'gate', finalFight, 0));
  } else {
    const n = night
      ? Math.min(5, 2 + Math.floor(r() * (inp.size >= 12 ? 4 : inp.size >= 6 ? 3 : 2)))
      : 2;
    const pool: SceneKind[] = night && organized ? ['probe', 'harass', 'fires', 'harass', 'probe'] : ['probe', 'harass', 'probe'];
    // probe first, then a mix; every kind at most twice
    for (let i = 0; i < n - 1; i++) {
      const kind: SceneKind = i === 0 ? 'probe' : pool[(1 + Math.floor(r() * (pool.length - 1))) % pool.length];
      const gap = i === 0 ? 0 : (10 + r() * 80) * 60;
      scenes.push(mk(kind, 18 + r() * 52, gap));
    }
    scenes.push(mk('assault', finalFight, (10 + r() * 80) * 60));
    // the whole night fits in seven hours: shrink gaps (never under ten minutes) until it does
    const span = () => scenes.reduce((a, sc) => a + sc.gap + sceneGame(sc), 0);
    const cap = 7 * 3600;
    if (span() > cap) {
      const gaps = scenes.reduce((a, sc) => a + sc.gap, 0), fixed = span() - gaps;
      const k = Math.max(0, (cap - fixed) / Math.max(1, gaps));
      for (const sc of scenes) if (sc.gap > 0) sc.gap = Math.max(600, Math.round(sc.gap * k));
    }
  }
  return finishPlan(inp.kind, inp.hour, scenes);
}

/** Totals for a list of scenes (also used to splice a plan after a mid-siege change of stance). */
export function finishPlan(crew: EncounterKind, startHour: number, list: Scene[]): SiegePlan {
  const scenes = list.map((sc, i) => ({ ...sc, index: i, gap: i === 0 ? 0 : sc.gap }));
  const totalGame = scenes.reduce((a, sc) => a + sc.gap + sceneGame(sc), 0);
  const totalReal = scenes.reduce((a, sc) => { const p = playbackLengths(sc); return a + (sc.gap > 0 ? GAP_CARD_SECONDS : 0) + p.lead + p.fight + p.tail; }, 0);
  return { scenes, crew, startHour, night: isNight(startHour), totalGame, totalReal };
}

/**
 * What a night under siege does to the family: lost sleep (hours owed, wears off 3 a day) and
 * morale. Scales with the scenes and how long it ran; a single short scene costs a little.
 */
export function siegeStrain(plan: SiegePlan): { sleep: number; morale: number } {
  const hours = plan.totalGame / 3600, extra = plan.scenes.length - 1;
  const asleep = plan.night ? 1 : 0.35;
  return { sleep: Math.round(Math.min(8, (0.6 + hours * 0.9 + extra * 0.4) * asleep) * 10) / 10, morale: Math.round(Math.min(16, 1 + extra * 2.5 + hours * 1.6)) };
}

// ─────────────────────────────────────────────────────────────────────────
// The clock: one timeline, read two ways
// ─────────────────────────────────────────────────────────────────────────

export type SegmentKind = 'gap' | 'lead' | 'fight' | 'tail';
export interface Segment {
  kind: SegmentKind;
  scene: number;
  /** Game seconds since the arrival at the start of the segment, and how many it spans. */
  game0: number;
  gameLen: number;
  /** Playback seconds at the start, and how long. */
  real0: number;
  realLen: number;
}

/** Every stretch of the siege in order, with its game and playback extents. */
export function segments(plan: SiegePlan): Segment[] {
  const out: Segment[] = [];
  let g = 0, p = 0;
  const push = (kind: SegmentKind, scene: number, gameLen: number, realLen: number) => {
    if (gameLen <= 0 && realLen <= 0) return;
    out.push({ kind, scene, game0: g, gameLen, real0: p, realLen });
    g += gameLen; p += realLen;
  };
  for (const sc of plan.scenes) {
    const pl = playbackLengths(sc);
    if (sc.gap > 0) push('gap', sc.index, sc.gap, GAP_CARD_SECONDS);
    push('lead', sc.index, sc.lead, pl.lead);
    push('fight', sc.index, sc.fight, pl.fight);
    push('tail', sc.index, sc.tail, pl.tail);
  }
  return out;
}

export interface Located {
  segment: Segment;
  /** 0-1 through the segment. */
  f: number;
  /** Game seconds since the arrival. */
  game: number;
  done: boolean;
}

/** Where playback second `real` sits on the timeline, and what the game clock reads there. */
export function locate(plan: SiegePlan, real: number): Located {
  const segs = segments(plan);
  const last = segs[segs.length - 1];
  if (real >= last.real0 + last.realLen) return { segment: last, f: 1, game: plan.totalGame, done: true };
  const seg = segs.find(sg => real < sg.real0 + sg.realLen) ?? last;
  const f = seg.realLen > 0 ? Math.max(0, Math.min(1, (real - seg.real0) / seg.realLen)) : 1;
  return { segment: seg, f, game: seg.game0 + seg.gameLen * f, done: false };
}

/** Playback second at which a scene starts (its gap card, if any, first), and the second at which it ends. */
export function sceneWindow(plan: SiegePlan, scene: number): { start: number; end: number } {
  const segs = segments(plan).filter(sg => sg.scene === scene);
  return { start: segs[0].real0, end: segs[segs.length - 1].real0 + segs[segs.length - 1].realLen };
}

/** Game days to put on the clock when the cutscene commits: exactly the siege's length, once. */
export function commitDays(plan: SiegePlan): number {
  return plan.totalGame / 86_400;
}

/** The hour of day on the clock, `game` seconds after the arrival. */
export const hourAfter = (plan: SiegePlan, game: number) => (plan.startHour + game / 3600) % 24;

// ─────────────────────────────────────────────────────────────────────────
// What you see and hear
// ─────────────────────────────────────────────────────────────────────────

const pickOf = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length];

/** One line for the Watch prompt: what you can see and hear from the porch. */
export function promptNarration(s: GameState, e: Pick<Encounter, 'kind' | 'size' | 'id'>, hour: number): string {
  const r = mulberry32(s.seed * 41 + e.size * 3 + e.id.length);
  const night = isNight(hour);
  const dog = (s.stock.dog ?? 0) >= 1;
  const few = e.size <= 3, many = e.size >= 8;
  if (e.kind === 'horde') return night
    ? pickOf(r, ['A low moaning from the road, and the dog will not stop. Something is dragging itself up the drive.', 'Shapes on the county road in the dark, too many, too slow. The sound carries.'])
    : pickOf(r, ['A shuffling crowd on the county road, drawn up the drive by the noise.', 'Dozens of them, in the heat shimmer, coming up the road.']);
  if (e.kind === 'break_in') return pickOf(r, [
    dog ? 'The dog is going crazy downstairs, and then a crash of glass.' : 'A floorboard, downstairs. Somebody is in the kitchen, trying not to be heard.',
    'Footsteps in the hall, a drawer pulled out. The lights are off and the bedroom door is shut.',
  ]);
  if (night) {
    const lines = [
      dog ? 'The dog is at the window, hackles up. Headlights, off the county road and slowing at the mailbox.' : 'Headlights sweep the ceiling. An engine idling at the end of the drive.',
      few ? 'A single truck, lights off, rolling up the gravel with the window down.' : many ? 'A line of headlights at the end of the road, and engines. More than one truck.' : 'Two vehicles at the end of the drive. Doors, low voices.',
      dog ? 'Barking at the dark end of the drive, then a shout from the road: "Hey! Anybody home?"' : 'A shout from the road in the dark: "Hey! We know somebody\'s in there!"',
    ];
    return pickOf(r, lines);
  }
  const lines = [
    few ? 'A pickup turns in at the mailbox and rolls up the drive, slowly, men watching the house.' : 'Trucks at the mailbox. Men getting out, spreading along the fence line.',
    dog ? 'The dog is barking at something by the gate. Dust on the county road, and a truck coming up the drive.' : 'Dust on the county road, and a vehicle turning into the drive.',
    'Somebody at the gate shouting for whoever lives here to come out where he can see them.',
  ];
  return pickOf(r, lines);
}

/** Captions for the time-lapsed lead-in and tail of a scene. */
export function sceneCaption(plan: SiegePlan, scene: Scene, part: 'lead' | 'tail' | 'gap', seed: number): string {
  const r = mulberry32(seed * 53 + scene.index * 7 + (part === 'lead' ? 1 : part === 'tail' ? 2 : 3));
  const night = isNight(hourAfter(plan, 0));
  if (part === 'gap') return gapLabel(scene.gap);
  if (plan.crew === 'break_in') return part === 'lead' ? pickOf(r, ['A step on the stairs. A beam of light under the door.', 'Glass crunches in the kitchen. Then silence. Then a drawer.']) : pickOf(r, ['The back door bangs. A car starts on the county road.', 'Quiet. Then the first thing you hear is your own heart.']);
  if (part === 'lead') {
    switch (scene.kind) {
      case 'gate': return pickOf(r, ['They stand at the gate and look at the house.', 'Boots on the gravel. Someone walks the fence line and tries the latch.']);
      case 'probe': return pickOf(r, night
        ? ['Two shapes at the edge of the field, low, testing the line.', 'Something moves along the far fence and goes still.']
        : ['A man walks the road ditch with binoculars, slowly.', 'They send a pair to look at the fence and see who answers.']);
      case 'harass': return pickOf(r, ['Single shots out of the dark, none of them aimed. Nobody sleeps.', 'A voice from the treeline, calling out names, daring someone to come out.']);
      case 'fires': return pickOf(r, ['Orange light behind the barn. They are burning something to make the watch look the wrong way.', 'A fire in the ditch, then another. Smoke lies across the drive.']);
      default: return pickOf(r, night
        ? ['They stop talking. Engines cut, one by one. The dark gets very quiet.', 'The dogs of the whole valley have gone silent. Then movement along the treeline.']
        : ['They have stopped talking. Men fan out along the fence, rifles up.', 'A whistle from the road, and the crew moves all at once.']);
    }
  }
  return pickOf(r, scene.kind === 'assault'
    ? ['The shooting stops. Ringing ears, powder smoke, someone counting heads.', 'Quiet, and then somebody starts to cry. Nobody moves from their post yet.']
    : ['They draw back out of sight. Nobody on the wall relaxes.', 'The shooting stops. The watch changes. Someone counts what is left of the ammunition.']);
}

// ─────────────────────────────────────────────────────────────────────────
// The scenes' battles (what the world plays)
// ─────────────────────────────────────────────────────────────────────────

/** Home and the road side of the place (the same geometry battle.ts uses). */
function stage(s: GameState, seed: number) {
  const r = mulberry32(seed * 2654435 + 977);
  const fin = s.structures.filter(isFinished);
  const home = fin.find(st => isHome(st.kind)) ?? fin[0] ?? { x: 0, z: 0 };
  const ang = Math.PI / 2 + (r() - 0.5) * 0.8;
  const ax = Math.cos(ang), az = Math.sin(ang), lx = -az, lz = ax;
  return { C: { x: home.x, z: home.z }, at: (d: number, lat: number) => ({ x: home.x + ax * d + lx * lat, z: home.z + az * d + lz * lat }) };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A short fight that costs nothing: a pair of scouts testing the line, harassing fire, or fires lit
 * to draw the watch off. It is a real `planBattle` (so the family answers as they would) with the
 * blood taken out: hits become near misses, nobody is wounded or dies, and the rounds spent are
 * the only cost (applied by the caller from `spent`).
 */
export function probeBattle(s: GameState, kind: SceneKind, size: number, seed: number): Battle & { spent: PlannedSpent } {
  const n = kind === 'probe' ? 2 : kind === 'fires' ? 2 : Math.min(4, Math.max(2, Math.round(size / 3)));
  // the seed whose fight the family wins fastest with fewest rounds
  let best: ReturnType<typeof planBattle> | null = null;
  for (let i = 0; i < 6; i++) {
    const b = planBattle(structuredClone(s), n, seed * 17 + i * 101, { armed: true, organized: false, grenades: 0, rockets: 0 });
    if (!best || (b.result === 'repelled' || b.result === 'fled' ? b.duration : 1e9) < best.duration) best = b;
  }
  const b = best!;
  const keep = new Set(['alarm', 'lights', 'move', 'shot', 'say', 'cover', 'reload', 'flee', 'snag', 'door', 'fallback', 'carry']);
  const events: BattleEvent[] = b.events
    .filter(e => keep.has(e.kind))
    .map(e => (e.kind === 'shot' ? { ...e, hit: false } : e))
    .slice(0)
    .filter(e => e.t < 70);
  const end = Math.max(25, Math.min(70, ...[events.length ? events[events.length - 1].t + 3 : 25]));
  // raiders break off at the end: a flee for each
  for (const u of b.units) if (u.side === 'raider') events.push({ t: r2(end - 3), kind: 'flee', unit: u.id });
  events.push({ t: end, kind: 'end', result: 'fled' });
  events.sort((a, c) => a.t - c.t);
  const spent: PlannedSpent = {};
  for (const [cal, k] of Object.entries(b.spent) as Array<[string, number]>) spent[cal] = Math.round(k * (end / Math.max(1, b.duration)));
  return { night: b.night, units: b.units, events, duration: end, spent };
}
export type PlannedSpent = Record<string, number>;

/**
 * The scene for a stance that wasn't a fight (hide, parley, a warning that worked, a trade for
 * peace): the crew comes up to the gate, says its piece, and goes, or goes through the place.
 * `tone` is the outcome card's: good = they leave, mixed = they leave with something, bad = they
 * go through the house.
 */
export function gateScene(s: GameState, e: Pick<Encounter, 'size' | 'kind' | 'id'>, stance: Stance, tone: 'good' | 'mixed' | 'bad', seed: number): Battle {
  const r = mulberry32(seed * 7717 + 3);
  const { C, at } = stage(s, seed);
  const n = Math.max(2, Math.min(8, e.size));
  const night = isNight(hourOf(s.clock.t));
  const units: BattleUnit[] = [];
  const ev: BattleEvent[] = [];
  const say = (t: number, text: string, who?: string) => ev.push({ t: r2(t), kind: 'say', text, ...(who ? { who } : {}) });
  const adults = s.people.filter((p, i) => !p.kid && s.personState[i]?.needs.died == null);
  const hiding = stance === 'hide';
  const faces = hiding ? [] : adults.slice(0, 2);
  const wall = at(4.5, 0);
  faces.forEach((p, i) => {
    const x = r2(wall.x + (i - 0.5) * 1.6), z = r2(wall.z);
    units.push({ id: `h_${p.id}`, side: 'home', personId: p.id, x: r2(C.x + (i - 0.5)), z: r2(C.z + 0.5), post: 'open' });
    ev.push({ t: 1 + i, kind: 'move', unit: `h_${p.id}`, x, z });
  });
  const start = 34;
  for (let i = 0; i < n; i++) {
    const p = at(start + r() * 4, (r() - 0.5) * 7);
    units.push({ id: `r${i}`, side: 'raider', x: r2(p.x), z: r2(p.z), post: 'open' });
  }
  ev.push({ t: 0, kind: 'alarm', what: (s.stock.dog ?? 0) >= 1 ? 'dog' : 'watch' });
  if (night) ev.push({ t: 2, kind: 'lights' });
  // the approach to the gate in two bounds
  for (let i = 0; i < n; i++) {
    const a = at(12 + r() * 3, (i - (n - 1) / 2) * 1.4), b = at(6 + r() * 2, (i - (n - 1) / 2) * 1.1);
    ev.push({ t: r2(4 + r() * 2), kind: 'move', unit: `r${i}`, x: r2(a.x), z: r2(a.z) });
    ev.push({ t: r2(14 + r() * 3), kind: 'move', unit: `r${i}`, x: r2(b.x), z: r2(b.z) });
  }
  if (hiding) {
    say(16, pickOf(r, ['Anybody here? The lights were on an hour ago.', 'Check the house. Somebody lives here.', 'Look at the garden. Somebody has been working this ground.']), 'r0');
    if (tone === 'bad') {
      say(24, pickOf(r, ['Shop first. Grab the cans, all of it, and whatever fuel there is.', 'Load the truck. Get everything with a label on it.']), 'r0');
      for (let i = 0; i < n; i++) { const p = at(1.2 + (i % 3) * 0.6, (i - (n - 1) / 2) * 0.8); ev.push({ t: r2(28 + r() * 8), kind: 'move', unit: `r${i}`, x: r2(p.x), z: r2(p.z) }); }
      for (let i = 0; i < n; i++) { const p = at(start, (i - 3) * 1.8); ev.push({ t: r2(52 + r() * 8), kind: 'move', unit: `r${i}`, x: r2(p.x), z: r2(p.z) }); }
    } else {
      say(26, pickOf(r, ['Nobody. Empty. Let\'s go.', 'Nothing here. Back in the truck.']), 'r0');
      for (let i = 0; i < n; i++) { const p = at(start, (i - 3) * 1.8); ev.push({ t: r2(30 + r() * 6), kind: 'move', unit: `r${i}`, x: r2(p.x), z: r2(p.z) }); }
    }
  } else {
    const who = faces[0] ? `h_${faces[0].id}` : undefined;
    const line = stance === 'warn' ? 'This is private property. Turn around.' : stance === 'trade' ? 'We can make a trade. Nobody has to get hurt.' : stance === 'parley' ? 'Say what you came to say. From there.' : 'Stay where you are.';
    say(18, line, who);
    say(21, tone === 'bad' ? 'Open the gate or we take it.' : pickOf(r, ['We\'re not looking for trouble. Just what you can spare.', 'Easy. We can talk about this.']), 'r0');
    say(27, tone === 'good' ? pickOf(r, ['Forget it. Not worth it. Come on.', 'They\'re ready for us. Back to the truck.']) : 'Put it by the gate and we go. Slowly.', 'r0');
    for (let i = 0; i < n; i++) { const p = at(start, (i - 3) * 1.8); ev.push({ t: r2(32 + r() * 6), kind: 'move', unit: `r${i}`, x: r2(p.x), z: r2(p.z) }); }
  }
  const duration = 64;
  ev.push({ t: duration, kind: 'end', result: tone === 'bad' ? 'breached' : 'fled' });
  ev.sort((a, c) => a.t - c.t);
  return { night, units, events: ev, duration };
}

/**
 * A break-in that isn't a fight (shouting, or hiding on the phone with dispatch): the intruders are
 * in the house, go through it, and go out to the road. `tone` good = they run, bad = they take things.
 */
export function breakInScene(s: GameState, e: Pick<Encounter, 'size'>, stance: Stance, tone: 'good' | 'mixed' | 'bad', seed: number): Battle {
  const r = mulberry32(seed * 6113 + 5);
  const { C, at } = stage(s, seed);
  const n = Math.max(1, Math.min(3, e.size));
  const units: BattleUnit[] = [];
  const ev: BattleEvent[] = [];
  const say = (t: number, text: string, who?: string) => ev.push({ t: r2(t), kind: 'say', text, ...(who ? { who } : {}) });
  for (let i = 0; i < n; i++) { const p = at(2.2 + r(), (i - (n - 1) / 2) * 1.2); units.push({ id: `r${i}`, side: 'raider', x: r2(p.x), z: r2(p.z), post: 'open' }); }
  ev.push({ t: 0, kind: 'alarm', what: (s.stock.dog ?? 0) >= 1 ? 'dog' : 'watch' });
  if (stance === 'shout') {
    ev.push({ t: 2, kind: 'lights' });
    say(3, 'Every light on! The sheriff is on the way!');
    say(6, 'Shit — go, go, GO!', 'r0');
  } else {
    say(5, 'Quiet. Check the kitchen. Look for the guns.', 'r0');
    say(18, 'Take the laptop. Tools in the shop. Come on.', 'r0');
  }
  for (let i = 0; i < n; i++) {
    const door = at(0.5 + i * 0.4, (i - 1) * 0.7), out = at(36, (i - 1) * 2);
    ev.push({ t: r2(stance === 'shout' ? 3 + r() : 8 + r() * 4), kind: 'move', unit: `r${i}`, x: r2(door.x), z: r2(door.z) });
    ev.push({ t: r2(stance === 'shout' ? 8 + r() * 2 : tone === 'bad' ? 24 + r() * 6 : 16 + r() * 4), kind: 'move', unit: `r${i}`, x: r2(out.x), z: r2(out.z) });
  }
  void C;
  const duration = stance === 'shout' ? 30 : 46;
  ev.push({ t: duration, kind: 'end', result: tone === 'bad' ? 'breached' : 'fled' });
  ev.sort((a, c) => a.t - c.t);
  return { night: true, units, events: ev, duration };
}
