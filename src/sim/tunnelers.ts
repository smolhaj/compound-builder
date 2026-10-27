/**
 * Tunnelers (user: "there should be some sort of defense to prevent invaders
 * from digging underneath the barriers / boundaries / walls / fences").
 * Decided: RARE, ORGANIZED crews that dig under a wall over days, so there is
 * a warning window (a dog barks at the ground, a sensor trips, a watcher sees
 * fresh spoil). Without a counter they come up INSIDE the wall. Pure and
 * seeded (tested).
 *
 * Counters (all four):
 *   skirt     deep footings / a buried steel skirt: built into the concrete and
 *             steel wall tiers, an add-on for cheaper fences (perimeter.addSkirt)
 *   sensors   buried ground sensors (need power), or a trained watcher listening
 *   ditch     a ditch or moat outside the wall: the water table floods tunnels
 *   dogs      dogs and the watch rotation (gear.dogCount)
 *
 * When diggers are found the player picks: send the party to the dig site
 * (an ambush at the breakout, the battle sim with the crew caught flat-footed;
 * the party is away and the line thin for a day), flood or collapse the
 * tunnel, or ignore it.
 */
import { mulberry32 } from './rng';
import { dogCount, powered } from './gear';
import { armed } from './armory';
import { enclosure, nearest } from './enclosure';
import { PERIMETER, hasSkirt, runFinished, wallLength, type PerimeterRun, type Pt } from './perimeter';
import { applyBattle, planBattle, type RaiderTemper } from './battle';
import { recordBattle } from './rescue';
import { raiderTemper, type Encounter, type Outcome, type Stance } from './encounters';
import { isFinished } from './construction';
import { dayIndex, type GameState } from './state';

export type Counter = 'sensors' | 'dogs' | 'watch' | 'tower';

export interface Dig {
  id: string;
  /** The wall run being dug under, and where they mean to come up (just inside it). */
  run: string;
  at: Pt;
  startDay: number;
  /** Days of digging in all (can grow if they have to go deeper). */
  days: number;
  size: number;
  temper: RaiderTemper;
  detectedDay: number | null;
  by: Counter | null;
  /** The dig has been checked against the skirt / the water table (once each). */
  skirtChecked: boolean;
  floodChecked: boolean;
  /** The warning card has been shown. */
  warned: boolean;
  /** The player chose to leave them to it. */
  ignored: boolean;
  /** The tunnel runs into an underground passage (it is revealed when they surface). */
  passage: string | null;
}

export interface DigState {
  active: Dig | null;
  /** The party sent to a breakout point: away (the line thin) on this day. */
  party: { ids: string[]; day: number } | null;
  /** The player's pick of who goes to a dig site (gate card); empty = automatic. */
  partyPick?: string[];
  /** Tallies. */
  started: number;
  turnedBySkirt: number;
  flooded: number;
  ambushed: number;
  surfaced: number;
}

export const newDigs = (): DigState => ({ active: null, party: null, started: 0, turnedBySkirt: 0, flooded: 0, ambushed: 0, surfaced: 0 });

// ── what the place has against digging ────────────────────────────────────

/** How near a ditch must be to a dig to flood it (≈ 7 m). */
export const DITCH_REACH = 1.2;
/** The share of a skirt that turns a crew round when they reach it. */
export const SKIRT_STOPS = 0.92;
/** Water table in the ground: the share of tunnels near a ditch that flood (a creek on the place raises it). */
export const FLOOD_BASE = 0.55, FLOOD_CREEK = 0.2;

export interface DigDefense {
  skirt: boolean;
  /** Sets of ground sensors, and whether they have power. */
  sensors: number;
  sensorsPowered: boolean;
  /** Share of the wall the sensors cover (a set covers about 120 m). */
  coverage: number;
  dogs: number;
  /** Adults on the watch who can listen at the wall. */
  watchers: number;
  tower: boolean;
  ditch: boolean;
}

/** Length of wall the family has round the yards and the line, in metres. */
export function wallMetres(s: GameState): number {
  let m = 0;
  for (const r of s.perimeter) if (runFinished(r) && PERIMETER[r.kind].blocks.people >= 0.5 && PERIMETER[r.kind].height > 0 && !PERIMETER[r.kind].walkway) m += wallLength(r) * 6;
  return m;
}

export function ditchNear(s: GameState, at: Pt): boolean {
  return s.perimeter.some(r => r.kind === 'ditch' && runFinished(r) && r.pts.length > 1 && nearest(r.pts, at[0], at[1]).d <= DITCH_REACH);
}

export function digDefense(s: GameState, run: Pick<PerimeterRun, 'kind' | 'skirtAt' | 'finishedAt'>, at: Pt): DigDefense {
  const sets = Math.floor(s.stock.ground_sensor ?? 0);
  const adults = s.people.filter((p, i) => !p.kid && s.personState[i]?.needs.died == null && !isAwayNow(s, p.id));
  return {
    skirt: hasSkirt(run, s.clock.t),
    sensors: sets, sensorsPowered: powered(s) && sets > 0,
    coverage: sets > 0 ? Math.min(1, sets * 120 / Math.max(120, wallMetres(s))) : 0,
    dogs: Math.min(2, dogCount(s)),
    watchers: adults.filter(p => p.skills.hunter >= 3).length,
    tower: s.structures.some(st => isFinished(st) && st.kind.includes('tower')),
    ditch: ditchNear(s, at),
  };
}

/** The party away at a breakout counts as off the line (rescue.isAway has the same rule). */
function isAwayNow(s: GameState, pid: string): boolean {
  const p = s.digs?.party;
  return !!p && p.day === dayIndex(s.clock.t) && p.ids.includes(pid);
}

/** Each counter's chance to notice a dig on a given day. */
export function detectChances(d: DigDefense, hunter = 0): Record<Counter, number> {
  return {
    sensors: d.sensorsPowered ? 0.35 * d.coverage : 0,
    dogs: d.dogs * 0.1,
    watch: Math.min(0.3, d.watchers * (0.04 + 0.01 * hunter)),
    tower: d.tower ? 0.06 : 0,
  };
}
export const combine = (c: Record<Counter, number>): number => 1 - (1 - c.sensors) * (1 - c.dogs) * (1 - c.watch) * (1 - c.tower);

/** Chance the water table floods a tunnel dug here (0 without a ditch). */
export function floodChance(s: GameState, d: Pick<DigDefense, 'ditch'>): number {
  return d.ditch ? Math.min(0.95, FLOOD_BASE + (s.site.creek ? FLOOD_CREEK : 0)) : 0;
}

/** Chance that a crew of this temper-free sort has already been warned for `days` of a dig of `total` (for the Defense tab: odds of notice over the whole dig). */
export function noticeOverDig(per: number, days: number): number { return 1 - Math.pow(1 - per, Math.max(1, days)); }

// ── when they come ────────────────────────────────────────────────────────

/** Daily chance a crew starts a dig. Rare; organized crews, later in the collapse; only where there is a wall worth going under. */
export function digChancePerDay(s: GameState): number {
  const d = s.disaster;
  if (!d.kind || s.clock.t < d.hitAt + 1) return 0;
  if (d.tracks.law >= 0.6) return 0;
  const walls = s.perimeter.filter(isTarget);
  // how strong the wall they would have to go under is: the property line, or the best wall round a yard
  const strength = Math.max(enclosure(s).barrier, ...walls.map(w => PERIMETER[w.kind].blocks.people * 100));
  if (!walls.length || strength < 35) return 0;
  const late = Math.max(0, Math.min(1, (s.clock.t - d.hitAt - 120) / 360));
  if (late <= 0) return 0;
  const hard = d.difficulty === 'hardcore' ? 1.5 : d.difficulty === 'cozy' ? 0.4 : 1;
  return 0.0012 * late * (0.4 + strength / 100) * hard * (1 - 0.5 * (s.gate.respect ?? 0));
}

const isTarget = (r: PerimeterRun): boolean => {
  const d = PERIMETER[r.kind];
  return runFinished(r) && r.pts.length > 1 && d.blocks.people >= 0.6 && d.height > 0 && !d.walkway;
};

/** A point along a run, `u` (0–1) of the way. */
function along(pts: readonly Pt[], u: number): Pt {
  let tot = 0;
  for (let i = 1; i < pts.length; i++) tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let want = tot * u;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (want <= l || i === pts.length - 1) { const k = l > 0 ? Math.min(1, want / l) : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]; }
    want -= l;
  }
  return pts[0];
}

/** Start a dig: they choose a wall without a skirt or a ditch by it (a scouting crew looks). Returns null if there is nothing worth digging under. */
export function startDig(s: GameState, r: () => number, day: number): Dig | null {
  const runs = s.perimeter.filter(isTarget);
  if (!runs.length) return null;
  const cand = runs.map(run => {
    const at = along(run.pts, 0.15 + 0.7 * r());
    return { run, at, w: (hasSkirt(run, s.clock.t) ? 0.15 : 1) * (ditchNear(s, at) ? 0.5 : 1) * Math.max(0.3, wallLength(run)) };
  });
  let x = r() * cand.reduce((a, c) => a + c.w, 0), pickd = cand[0];
  for (const c of cand) { x -= c.w; if (x <= 0) { pickd = c; break; } }
  const size = 4 + Math.floor(r() * 5);
  const passage = s.perimeter.find(p => PERIMETER[p.kind].twoWay && runFinished(p) && p.pts.length > 1 && nearest(p.pts, pickd.at[0], pickd.at[1]).d <= 0.8);
  return {
    id: `d${s.nextId++}`, run: pickd.run.id, at: [pickd.at[0], pickd.at[1]], startDay: day, days: 6 + Math.floor(r() * 8), size,
    temper: raiderTemper(s, 'gang', r), detectedDay: null, by: null, skirtChecked: false, floodChecked: false, warned: false, ignored: false, passage: passage?.id ?? null,
  };
}

/** The wall's compass side, for a line of text. */
export function sideOf(s: GameState, at: Pt): string {
  const h = s.site.home, cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2, dx = at[0] - cx, dz = at[1] - cz;
  return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'east' : 'west') : (dz > 0 ? 'south' : 'north');
}

const SIGN: Record<Counter, string[]> = {
  sensors: ['The ground sensors are picking up a steady scrape and thud under the {side} wall, twenty feet down the line, not an animal.', 'The geophone base unit lights up on the {side} wall: rhythmic digging, several people.'],
  dogs: ['The dog won\'t leave the {side} wall. Nose to the ground, whining, hackles up.', 'The dogs are digging at the {side} wall and howling at the earth.'],
  watch: ['Whoever had the watch put an ear to the ground at the {side} wall: picks and shovels, a long way down.', 'Fresh spoil, piled and spread thin under leaves, ten yards beyond the {side} wall. Somebody is digging.'],
  tower: ['From the tower: a pale line of fresh dirt out in the trees past the {side} wall, and a tarp over something.'],
};

/** The pending card when a dig is found (the warning window). */
export function warningEncounter(s: GameState, d: Dig, day: number, r: () => number): Encounter {
  const left = Math.max(0, d.days - (day - d.startDay));
  const def = digDefense(s, s.perimeter.find(x => x.id === d.run) ?? { kind: 'barbed_wire', finishedAt: 0 }, d.at);
  const stances: Stance[] = [];
  const party = ambushParty(s);
  if (party.length) stances.push('ambush');
  if (def.ditch) stances.push('flood');
  if ((s.stock.excavator ?? 0) >= 1) stances.push('collapse');
  stances.push('ignore');
  const sign = (SIGN[d.by ?? 'watch'][Math.floor(r() * SIGN[d.by ?? 'watch'].length) % SIGN[d.by ?? 'watch'].length]).replace('{side}', sideOf(s, d.at));
  return {
    id: `e${s.nextId++}`, kind: 'tunnelers', day, title: `Someone is digging under the ${sideOf(s, d.at)} wall`,
    dossier: [sign, `About ${d.size} of them, by the spoil. They are ${left <= 1 ? 'almost through' : `${left} days from coming up`}${party.length ? ', and you have time to be waiting where they surface' : ''}.`, 'Organized crews dig under a wall when they can\'t get over it. Where they come up is inside it.'],
    size: d.size, armed: true, strength: 0, temper: d.temper, stances,
    dig: { phase: 'warning', id: d.id, lead: left, by: d.by ?? undefined },
  };
}

/** Who goes to the dig site: the armed fighters (one adult stays home if there are three or more). */
export function ambushParty(s: GameState, everyone = false): string[] {
  if (!armed(s)) return [];
  const here = s.people.filter((p, i) => !p.kid && s.personState[i]?.needs.died == null && s.personState[i]?.task !== 'gone' && !isAwayNow(s, p.id));
  const go = here.length >= 3 && !everyone ? here.slice(0, here.length - 1) : here;
  return go.map(p => p.id);
}

/** Who goes: the player's pick (from the gate card) among those able, else the automatic party. */
export function chosenParty(s: GameState): string[] {
  const able = ambushParty(s, true), pick = s.digs?.partyPick;
  const chosen = pick ? able.filter(id => pick.includes(id)) : [];
  return chosen.length ? chosen : ambushParty(s);
}

/** The crew that comes up inside the wall: a few of them. */
export function insideEncounter(s: GameState, d: Dig, day: number, warned: boolean): Encounter {
  const size = Math.max(2, Math.min(d.size, 3 + Math.floor(d.size / 3)));
  return {
    id: `e${s.nextId++}`, kind: 'tunnelers', day, title: warned ? 'They have come up inside the wall' : 'Somebody is in the yard',
    dossier: [warned ? `The tunnel you were told about has opened. ${size} of them, up out of a hole behind the ${sideOf(s, d.at)} wall.` : `A hole opens in the yard behind the ${sideOf(s, d.at)} wall and ${size} armed men climb out of it, past the wall that was supposed to stop them.`,
      'Nothing between them and the house but the family.'],
    size, armed: true, strength: size * 12, temper: d.temper, wants: { canned: 8, staples: 1, fuel: 4, meds: 1 }, stances: ['defend', 'hide'],
    dig: { phase: 'inside', id: d.id, lead: 0 },
  };
}

// ── the days ──────────────────────────────────────────────────────────────

/** Once a day: maybe a crew starts digging; a dig goes on, is found, turns back, floods or comes up. Returns log lines. */
export function digDay(s: GameState): string[] {
  const lines: string[] = [];
  const day = dayIndex(s.clock.t);
  const ds = (s.digs ??= newDigs());
  if (ds.party && ds.party.day < day) ds.party = null;
  const r = mulberry32(s.seed * 4409 + day * 17 + 3);
  let d = ds.active;
  if (!d) {
    if (r() < digChancePerDay(s)) { d = ds.active = startDig(s, r, day); if (d) ds.started++; }
    return lines;   // (a new dig has no effect on its first day)
  }
  const run = s.perimeter.find(x => x.id === d!.run);
  if (!run || !runFinished(run)) { ds.active = null; return lines; }   // the wall they meant to go under is gone
  const age = day - d.startDay;
  const def = digDefense(s, run, d.at);
  // the skirt: they reach it about halfway and most turn round
  if (!d.skirtChecked && age >= Math.floor(d.days * 0.4)) {
    d.skirtChecked = true;
    if (def.skirt) {
      if (r() < SKIRT_STOPS) { ds.turnedBySkirt++; ds.active = null; lines.push(`Scratches and a fresh hole against the buried skirt under the ${sideOf(s, d.at)} wall: somebody dug down to it, found steel and concrete, and gave up.`); return lines; }
      d.days = Math.round(d.days * 1.5);
    }
  }
  // the water table: a tunnel near a ditch fills
  if (!d.floodChecked && age >= Math.floor(d.days * 0.6)) {
    d.floodChecked = true;
    if (r() < floodChance(s, def)) { ds.flooded++; ds.active = null; lines.push(`Water standing in a caved-in hole beyond the ${sideOf(s, d.at)} ditch: whoever was digging toward the wall hit the water table and it came in on them.`); return lines; }
  }
  // notice
  if (d.detectedDay === null) {
    const hunter = Math.max(0, ...s.people.filter((p, i) => !p.kid && s.personState[i]?.needs.died == null).map(p => p.skills.hunter));
    const c = detectChances(def, hunter), p = combine(c);
    if (p > 0 && r() < p) {
      d.detectedDay = day;
      const tot = c.sensors + c.dogs + c.watch + c.tower;
      let x = r() * tot;
      d.by = (['sensors', 'dogs', 'watch', 'tower'] as Counter[]).find(k => { x -= c[k]; return x <= 0; }) ?? 'watch';
    }
  }
  // the card (held back a day if another encounter is waiting)
  if (d.detectedDay !== null && !d.ignored && !d.warned && !s.gate.pending) {
    d.warned = true;
    s.gate.pending = warningEncounter(s, d, day, r);
    lines.push(s.gate.pending.title + '.');
    return lines;
  }
  // up
  if (age >= d.days && !s.gate.pending) {
    ds.surfaced++;
    const warned = d.detectedDay !== null;
    if (d.passage) { const p = s.perimeter.find(x => x.id === d.passage); if (p) { p.revealed = true; lines.push('The tunnel ran into the underground passage. It is no longer a secret.'); } }
    s.gate.pending = insideEncounter(s, d, day, warned);
    ds.active = null;
    lines.push(s.gate.pending.title + '.');
  }
  return lines;
}

// ── what the player chooses ───────────────────────────────────────────────

const take = (s: GameState, k: 'excavator', n: number) => { s.stock[k] = Math.max(0, s.stock[k] - n); };

/** Odds the ambush works, from the battle sim (24 tries with other seeds), for the card. */
const AMBUSH_CACHE = new Map<string, { win: number; lost: number }>();
export function ambushOdds(s: GameState, d: { size: number; lead: number; temper?: RaiderTemper }, tries = 16): { win: number; lost: number } {
  const key = `${s.seed}|${s.clock.ticks}|${d.size}|${d.lead}|${d.temper}|${s.armory.guns.length}`;
  const hit = AMBUSH_CACHE.get(key);
  if (hit) return hit;
  let win = 0, lost = 0;
  const { surprise, crew } = ambushShape(d.size, d.lead);
  for (let i = 0; i < tries; i++) {
    const b = planBattle(s, crew, 5_003 + i * 91_009, { armed: true, organized: true, temper: d.temper, ambush: surprise });
    if (b.result === 'repelled' || b.result === 'fled') win++;
    lost += b.events.filter(x => (x.kind === 'death' || x.kind === 'taken') && x.unit.startsWith('h_')).length;
  }
  const o = { win: win / tries, lost: lost / tries };
  if (AMBUSH_CACHE.size > 32) AMBUSH_CACHE.clear();
  AMBUSH_CACHE.set(key, o);
  return o;
}

/** How long the crew is caught flat-footed, and how many of them get up the hole before the party opens fire. */
export function ambushShape(size: number, lead: number): { surprise: number; crew: number } {
  const prep = Math.max(0, Math.min(8, lead));
  return { surprise: Math.min(9, 2 + 1.5 * prep), crew: Math.max(1, Math.round(size * (1 - Math.min(0.4, 0.06 * prep)))) };
}

/** Resolve the warning card. */
export function resolveDigWarning(s: GameState, e: Encounter, stance: Stance, r: () => number): Outcome {
  const g = s.gate, ds = (s.digs ??= newDigs()), day = dayIndex(s.clock.t);
  const d = ds.active && ds.active.id === e.dig?.id ? ds.active : null;
  if (!d) return { title: 'They gave up', text: 'By the time you look, the hole is empty and the dig is abandoned.', tone: 'good', lines: [] };
  if (stance === 'ambush') {
    const party = chosenParty(s);
    const { surprise, crew } = ambushShape(d.size, e.dig?.lead ?? 0);
    const b = planBattle(s, crew, s.seed * 131 + day * 7 + 5, { armed: true, organized: true, temper: d.temper, ambush: surprise });
    g.battle = b;
    const lines = applyBattle(s, b);
    recordBattle(s, b, crew, d.temper);
    ds.ambushed++; ds.active = null;
    ds.party = { ids: party, day: day + 1 }; ds.partyPick = undefined;
    // the line is thin while the party is out: a second crew may be watching
    if (r() < 0.25 && g.next > day + 1) { g.next = day + 1; lines.push('The party is still out at the breakout, and someone is watching the road.'); }
    const won = b.result === 'repelled' || b.result === 'fled';
    if (won) { g.respect = Math.min(1, (g.respect ?? 0) + 0.25); g.next = Math.max(g.next, day + 20); }
    lines.unshift(`${party.length} of the family waited at the breakout point with rifles. The house was thin that night.`);
    return won
      ? { title: 'The ambush held', text: 'The first heads came up out of the hole into rifles. Those behind them turned back down the tunnel.', tone: 'good', lines }
      : { title: 'They broke out anyway', text: b.result === 'overrun' ? 'There were more of them than you could stop at the hole, and the house was empty.' : 'The party could not hold the hole, and the rest got out and into the yard.', tone: 'bad', lines };
  }
  if (stance === 'flood') {
    ds.flooded++; ds.active = null; g.respect = Math.min(1, (g.respect ?? 0) + 0.1);
    return { title: 'Under the water table', text: 'You open the ditch gate and let it drain toward the tunnel. The ground goes soft and then slumps; the digging stops. Nobody comes up.', tone: 'good', lines: ['It will be a long wait before anyone digs there again.'] };
  }
  if (stance === 'collapse') {
    take(s, 'excavator', 1);
    ds.active = null; g.respect = Math.min(1, (g.respect ?? 0) + 0.15);
    return { title: 'The tunnel comes down', text: 'The excavator crowds the spoil pile and drops the roof of the dig onto itself. A few of them get out the far end.', tone: 'mixed', lines: [`Some of the ${d.size} will not be coming back. It sits badly with the family.`] };
  }
  d.ignored = true;
  return { title: 'You let them dig', text: 'There is nothing to be done tonight. They will be through in a few days.', tone: 'mixed', lines: [] };
}

/** The sim's one-line description of digging cover for the Defense tab. */
export function digPhrase(d: DigDefense): string {
  const parts: string[] = [];
  if (d.skirt) parts.push('skirt');
  if (d.sensorsPowered) parts.push('sensors');
  if (d.ditch) parts.push('ditch');
  if (d.dogs) parts.push('dogs');
  if (d.watchers) parts.push('watch');
  return parts.join(', ') || 'nothing';
}
