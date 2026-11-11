/**
 * Passers-by on the county road (docs/DECISIONS.md, "Road warning and passers-by"). Pure, seeded.
 *
 * The ambient traffic of sim/roadTraffic.ts used to be scenery. Once the world has ended its busy classes (survivors driving, people on
 * foot, roving crews, convoys) are decided here, a day at a time, from the same collapse curve, and each one is a real event at the gate:
 *
 *  Noticing   a pass notices the place by what it gives away on the road: lights after dark, smoke, noise, a party (sim/opsec.ts). People
 *             on foot who see a lamp turn up the drive (a real card); a roving crew that sees one marks the place and comes back sooner
 *             (`mark`, read by `gateDay`); a convoy that sees a lot may come for a requisition.
 *  Seeing     the family sees the pass if the road is watched (sim/roadWarn.ts): a line in the log, and it can be hailed.
 *  Trading    a hailed or stopped party offers a swap across the property line, with the gate shut (`hail`): accept, haggle, decline, or a
 *             handout. A swap can be a ruse (they were looking the place over).
 *  Blocks     a barrier or a manned checkpoint at the drive filters the traffic: it costs word on the road (and the good-neighbor record),
 *             and risk (an armed crew turned back may shoot or come back angry). A checkpoint also sends travelers to a trading stop.
 *  Rumors     what passed is what the radio and the fence talk about, true (what went by) and false (what it was taken for).
 *
 * Nothing here changes a raid's odds directly: a mark only brings a crew sooner and a little bigger through the existing roll.
 */
import { mulberry32 } from './rng';
import { dayIndex, hourOf, type GameState } from './state';
import { log } from './economy';
import { SLOT, monthOfDoy, spawnFor, trafficLevel, weekdayOf, type PartyClass, type RoadParty, type TrafficCtx, type TrafficLevel } from './roadTraffic';
import { tension } from './disaster';
import { calendarOf } from './state';
import { exposureParts, type ExposureSource } from './opsec';
import { sightUnits } from './roadWarn';
import { CALIBERS } from './armory';
import { barterOf, barterPrices, have, move, valueOf, type Good, type Lot } from './barter';
import { nobodyHome } from './orphans';
import { canGo } from './rescue';
import { makeThreat, type Encounter, type EncounterKind } from './encounters';
import { pluralize } from './words';
import { blockManned, postNeed } from './roadPost';

// ─────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────

/** The classes of the ambient traffic that are real events once the world has ended (the rest stays scenery: buses, farm, cyclists). */
export const REAL_CLASSES: ReadonlySet<PartyClass> = new Set<PartyClass>(['traffic', 'wanderers', 'refugees', 'raiders', 'convoy']);

export interface Pass {
  id: string;
  /** Game time it is abreast of the gate. */
  at: number;
  party: RoadParty;
  /** Resolved (`at` has come). */
  done?: true;
  /** The family saw it go by. */
  seen?: true;
  /** What became of it. */
  fate?: 'noticed' | 'stopped' | 'blocked' | 'turned' | 'traded' | 'went_on';
}
export interface Hail {
  id: string;
  pass: string;
  /** Closes at this time if unanswered. */
  until: number;
  party: RoadParty;
  by: 'them' | 'us' | 'block';
  text: string;
  /** What they give, what they want. */
  offer: Lot[];
  want: Lot[];
  /** They are looking the place over. */
  shady: boolean;
  haggled?: boolean;
  /** Handouts allowed (people on foot). */
  begging: boolean;
}
export type BlockKind = 'barrier' | 'checkpoint';
export type BlockPolicy = 'turn_back' | 'inspect';
/** `crew`: the named adults on the line in the day (sim/roadPost.ts). */
export interface RoadBlock { kind: BlockKind; policy: BlockPolicy; since: number; turned: number; passed: number; crew: string[] }
export interface Mark { kind: 'looters' | 'gang' | 'requisition'; size: number; until: number; line: string }
export interface Recent { day: number; cls: PartyClass; heads: number; seen: boolean; id: string }
export interface RoadLife {
  day: number;
  passes: Pass[];
  hail: Hail | null;
  block: RoadBlock | null;
  mark: Mark | null;
  /** -100 .. 100: what the road says of the place (fair dealing up, turning people back down). */
  word: number;
  recent: Recent[];
  prep?: import('./roadWarn').Prep;
  tally: { passed: number; seen: number; noticed: number; stopped: number; traded: number; turned: number; marked: number };
}

export function freshRoad(): RoadLife {
  return { day: -1, passes: [], hail: null, block: null, mark: null, word: 0, recent: [], tally: { passed: 0, seen: 0, noticed: 0, stopped: 0, traded: 0, turned: 0, marked: 0 } };
}
export const roadOf = (s: GameState): RoadLife => (s.road ??= freshRoad());

/** Tunables. */
export const PASS = {
  /** Chance a pass notices the place: base plus per give-away point, times the class's eyes. */
  NOTICE_BASE: 0.03, NOTICE_PER_POINT: 0.016, NOTICE_CAP: 0.75,
  /** A noticed party on foot that comes up the drive; a survivor driving that stops to deal. */
  FOOT_TURNS_UP: 0.6, DRIVER_STOPS: 0.45,
  /** A hailed party's willingness to stop. */
  HAIL_FOOT: 0.85, HAIL_DRIVER: 0.55,
  /** A trade offer that is a ruse. */
  SHADY: 0.12,
  /** How long a hail stands (days), and how long a pass can be hailed after it goes by. */
  HAIL_OPEN: 0.06, HAILABLE: 0.05,
  /** A mark lasts this many days; a crew marked comes within 1..this many days. */
  MARK_DAYS: 9, MARK_SOON: 3,
  /** Risk at a block of an armed crew: a shot at the crew on the line, and the crew coming back angry. */
  SHOT: 0.22, ANGRY: 0.45,
  /** Costs. */
  BARRIER_LUMBER: 3, CHECKPOINT_LUMBER: 6, CHECKPOINT_HARDWARE: 2, CREW_FATIGUE: 3,
  WORD_TURN: -2, WORD_FAIR: 0.5, WORD_TRADE: 1, WORD_GIFT: 2,
} as const;

// ─────────────────────────────────────────────────────────────────────────
// The day's passes
// ─────────────────────────────────────────────────────────────────────────

export function trafficCtx(s: GameState, hour: number): TrafficCtx {
  const d = s.disaster, cal = calendarOf(s.clock);
  return {
    seed: s.seed, region: s.site.region, hour, dow: weekdayOf(s.clock.startDoy, s.clock.startYear, dayIndex(s.clock.t)), month: monthOfDoy(cal.doy),
    phase: d.phase, kind: d.kind, variant: d.variant, sinceHit: d.kind ? s.clock.t - d.hitAt : -999, tension: d.kind ? tension(d, s.clock.t) : 0,
    tracks: { fuel: d.tracks.fuel, law: d.tracks.law, grid: d.tracks.grid, deliveries: d.tracks.deliveries },
  };
}

/** Is the world past the hit (the busy classes are real events)? */
export const afterHit = (s: GameState): boolean => !!s.disaster.kind && s.disaster.phase !== 'peace' && s.disaster.phase !== 'warning' && s.clock.t >= s.disaster.hitAt;

/** True while the renderer should leave the real classes to the sim. */
export const simHandles = (c: Pick<TrafficCtx, 'kind' | 'phase' | 'sinceHit'>): boolean => c.kind !== null && c.phase !== 'peace' && c.phase !== 'warning' && c.sinceHit >= 0;

/** A game hour at 1x lasts 2.5 world seconds: one slot is `SLOT` of them. */
const HOUR_SLOTS = 2.5 / SLOT;

/** The hour's rates, scaled to one game hour, only the classes that are real events. */
export function hourLevel(l: TrafficLevel): TrafficLevel {
  const k = HOUR_SLOTS;
  return { ...l, motor: l.motor * k, wanderers: l.wanderers * k, raiders: l.raiders * k, convoy: l.convoy * k, bus: 0, farm: 0, cycle: 0 };
}

/** Everything that passes on this day (deterministic in the seed and the world's state at the day change). */
export function passesOfDay(s: GameState, day: number): Pass[] {
  const out: Pass[] = [];
  for (let h = 0; h < 24; h++) {
    const c = trafficCtx(s, h);
    const level = hourLevel(trafficLevel(c));
    const party = spawnFor(c, 100000 + day * 32 + h, level);
    if (!party || !REAL_CLASSES.has(party.cls)) continue;
    const frac = mulberry32(s.seed * 4001 + day * 53 + h)();
    out.push({ id: `p${day}.${h}`, at: day - 0.25 + (h + frac) / 24, party: { ...party, id: `p${day}.${h}` } });
  }
  return out;
}

/** Once a day: today's passes go on the schedule; old ones and old talk fall away. */
export function roadDay(s: GameState): void {
  const r = roadOf(s), day = dayIndex(s.clock.t);
  if (r.day === day) return;
  r.day = day;
  r.passes = r.passes.filter(p => p.at > s.clock.t - 1.2);
  r.recent = r.recent.filter(x => x.day > day - 5);
  if (!afterHit(s)) return;
  const have = new Set(r.passes.map(p => p.id));
  for (const p of passesOfDay(s, day)) if (!have.has(p.id) && p.at >= s.clock.t - 0.01) r.passes.push(p);
  // one day's worth of an unanswered offer is stale
  if (r.mark && r.mark.until < day) r.mark = null;
}

// ─────────────────────────────────────────────────────────────────────────
// What the place gives away
// ─────────────────────────────────────────────────────────────────────────

const GIVE: ExposureSource[] = ['lights', 'smoke', 'chimney', 'noise', 'gatherings', 'structures'];
const GIVE_NAME: Partial<Record<ExposureSource, string>> = { lights: 'the lights', smoke: 'the smoke', chimney: 'the chimney smoke', noise: 'the noise', gatherings: 'the party', structures: 'the place' };

/** Points of what shows from the road right now, and the biggest give-away. `structures` count a third (a roof is not a lamp). */
export function roadGiveAway(s: GameState): { points: number; top: ExposureSource | null } {
  const p = exposureParts(s);
  let points = 0, top: ExposureSource | null = null, best = 0;
  for (const k of GIVE) { const v = Math.max(0, p[k]) * (k === 'structures' ? 0.34 : 1); points += v; if (v > best) { best = v; top = k; } }
  return { points, top };
}

/** How sharp the class's eyes are for a lamp on the road (people walking in the dark look for one; a convoy has somewhere to be). */
export const NOTICE_K: Partial<Record<PartyClass, number>> = { wanderers: 1.4, refugees: 1.4, raiders: 1.2, traffic: 0.8, convoy: 0.3 };

export function noticeChance(s: GameState, cls: PartyClass): number {
  const { points } = roadGiveAway(s);
  const word = roadOf(s).word;
  // a place with a fair name draws people on foot a little more; one with a hard name, a little less
  const wk = cls === 'wanderers' || cls === 'refugees' ? 1 + word / 250 : 1;
  return Math.max(0, Math.min(PASS.NOTICE_CAP, (PASS.NOTICE_BASE + PASS.NOTICE_PER_POINT * points) * (NOTICE_K[cls] ?? 0.5) * wk));
}

// ─────────────────────────────────────────────────────────────────────────
// Describing
// ─────────────────────────────────────────────────────────────────────────

export function describePass(p: RoadParty): string {
  const lead = p.members[0]?.kind, heads = p.heads;
  const dark = !p.lights && p.cls !== 'wanderers' && p.cls !== 'refugees';
  switch (p.cls) {
    case 'raiders': return `a pickup with ${pluralize(Math.max(2, heads - 1), 'man', 'men')} in the bed${dark ? ', running dark' : ''}`;
    case 'convoy': return lead === 'military' || p.members.some(m => m.kind === 'military') ? 'army trucks in a line' : 'a convoy of white vans and trucks';
    case 'wanderers': case 'refugees': return heads === 1 ? 'one person on foot' : `${heads} on foot${p.members.some(m => m.kind === 'cart') ? ' with a handcart' : ''}`;
    default: return lead === 'semi' ? 'a rig' : lead === 'motorcycle' ? 'a motorcycle' : `a ${lead === 'pickup' ? 'pickup' : lead === 'van' ? 'van' : lead === 'suv' ? 'SUV' : 'car'}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Resolving a pass
// ─────────────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const hashStr = (str: string): number => { let h = 7; for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0; return h; };
const homeAdults = (s: GameState) => s.people.filter(p => !p.kid && canGo(s, p));

/** Put a mark on the place: a crew saw it, and means to come. Returns the mark. */
function markPlace(s: GameState, kind: Mark['kind'], heads: number, line: string, r: () => number): Mark {
  const road = roadOf(s), day = dayIndex(s.clock.t);
  const size = clamp(heads, 2, 12);
  road.mark = { kind, size, until: day + PASS.MARK_DAYS, line };
  road.tally.marked++;
  const soon = day + 1 + Math.floor(r() * PASS.MARK_SOON);
  s.gate.next = s.gate.next < 0 ? soon : Math.min(s.gate.next, soon);
  return road.mark;
}

/** Make a gate card out of a pass that turned up the drive. Null: the gate is busy or nobody is home. */
function cardFor(s: GameState, pass: Pass, r: () => number): Encounter | null {
  if (s.gate.pending || s.gate.incoming || nobodyHome(s)) return null;
  const heads = pass.party.heads, kind: EncounterKind = heads >= 5 ? 'refugees' : 'arrival';
  const e = makeThreat(kind, r, `e${s.nextId++}`, dayIndex(s.clock.t), s);
  if (kind === 'refugees' && e.size !== heads) {
    const was = e.size;
    e.size = Math.max(5, heads); e.strength = Math.round(e.strength * e.size / Math.max(1, was));
    e.dossier = e.dossier.map((l, i) => (i === 0 ? l.replace(String(was), String(e.size)) : l));
  }
  return e;
}

function wound(s: GameState, r: () => number, what: string): string {
  const crew = homeAdults(s);
  if (!crew.length) return '';
  const p = crew[Math.floor(r() * crew.length)], ps = s.personState.find(x => x.id === p.id);
  if (!ps) return '';
  ps.needs.hurt.push({ what, sev: 10 + Math.floor(r() * 14) });
  ps.needs.health = Math.max(s.disaster.difficulty === 'cozy' ? 5 : 1, ps.needs.health - 6);
  return `${p.first} was hit: ${what}.`;
}

/** Is the block staffed now: the named crew, on their feet, in the day's hours (sim/roadPost.ts). */
const manned = (s: GameState, b: RoadBlock): boolean => { void b; return blockManned(s, hourOf(s.clock.t), pid => { const p = s.people.find(x => x.id === pid); return !!p && canGo(s, p); }); };

/** Name the crew: the best talkers among the adults on their feet (nobody who is already the greeter). */
function nameCrew(s: GameState, kind: BlockKind): string[] {
  const greeter = s.road?.prep?.pid;
  return homeAdults(s).filter(p => p.id !== greeter).sort((a, b) => (b.skills.negotiator ?? 0) - (a.skills.negotiator ?? 0)).slice(0, postNeed(kind)).map(p => p.id);
}

/** Each morning: a crew member who is hurt, away or gone is replaced from the adults on their feet; short-handed, the pole stays down. */
export function postDay(s: GameState): void {
  const b = s.road?.block;
  if (!b) return;
  const ok = (pid: string) => { const p = s.people.find(x => x.id === pid); return !!p && canGo(s, p); };
  const keep = (b.crew ?? []).filter(ok);
  if (keep.length === (b.crew ?? []).length && keep.length >= postNeed(b.kind)) return;
  const fill = homeAdults(s).filter(p => !keep.includes(p.id) && p.id !== s.road?.prep?.pid).sort((a, c) => (c.skills.negotiator ?? 0) - (a.skills.negotiator ?? 0));
  const crew = [...keep, ...fill.map(p => p.id)].slice(0, postNeed(b.kind));
  const changed = crew.join() !== (b.crew ?? []).join();
  b.crew = crew;
  if (crew.length < postNeed(b.kind)) log(s, `Nobody to man the ${b.kind === 'checkpoint' ? 'checkpoint' : 'roadblock'} today: the pole stays down.`);
  else if (changed) log(s, `${crew.map(id => s.people.find(p => p.id === id)?.first ?? 'Someone').join(' and ')} took over the ${b.kind === 'checkpoint' ? 'checkpoint' : 'roadblock'}.`);
}

function tireCrew(s: GameState, b: RoadBlock): void {
  for (const id of b.crew ?? []) { const ps = s.personState.find(x => x.id === id); if (ps) ps.fatigue = Math.min(100, (ps.fatigue ?? 0) + PASS.CREW_FATIGUE); }
}

/** A block stops a pass. Returns true when the block dealt with it. */
function atBlock(s: GameState, pass: Pass, b: RoadBlock, r: () => number): boolean {
  const road = roadOf(s), cls = pass.party.cls, heads = pass.party.heads;
  const crewed = manned(s, b);
  // a convoy is not stopped by anything of ours; a checkpoint may be stopped by it
  if (cls === 'convoy') {
    if (b.kind === 'checkpoint' && crewed && s.gate.government === 'hindrance' && r() < 0.35) markPlace(s, 'requisition', 5, 'A convoy stopped at the roadblock on the county road and a man wrote the place down.', r);
    return true;
  }
  // a bare barrier with nobody behind it slows a vehicle: half turn round; people on foot walk round it
  if (!crewed) { if (cls === 'traffic' && r() < 0.5) { pass.fate = 'blocked'; return true; } return false; }
  tireCrew(s, b);
  const say = pass.seen || r() < 0.5;
  if (cls === 'raiders') {
    const turned = b.policy === 'turn_back' || b.kind === 'barrier';
    pass.fate = 'turned'; b.turned++; road.tally.turned++;
    s.gate.respect = Math.min(1, (s.gate.respect ?? 0) + 0.06);
    let line = `A pickup with armed men came up to the ${b.kind === 'checkpoint' ? 'checkpoint' : 'barrier'} and was ${turned ? 'turned back' : 'looked over and sent on'}.`;
    if (r() < PASS.SHOT * (b.policy === 'inspect' ? 1.3 : 1)) line += ` ${wound(s, r, 'shot at the roadblock') || 'Shots were fired.'}`;
    if (r() < PASS.ANGRY) { markPlace(s, heads >= 6 ? 'gang' : 'looters', heads, `The crew that was turned back at your roadblock has come back, angrier and with more men.`, r); line += ' They will be back.'; }
    log(s, line);
    return true;
  }
  if (cls === 'wanderers' || cls === 'refugees') {
    if (b.policy === 'turn_back') {
      pass.fate = 'turned'; b.turned++; road.tally.turned++;
      s.gate.turnedAway = (s.gate.turnedAway ?? 0) + 1;
      s.gate.humanity = Math.max(0, s.gate.humanity - Math.min(2, 0.4 * heads));
      road.word = clamp(road.word + PASS.WORD_TURN, -100, 100);
      if (say) log(s, `${describePass(pass.party)} came to the ${b.kind === 'checkpoint' ? 'checkpoint' : 'barrier'} and were turned back down the road.`);
    } else {
      pass.fate = 'went_on'; b.passed++;
      road.word = clamp(road.word + PASS.WORD_FAIR, -100, 100);
      if (say) log(s, `${describePass(pass.party)} were asked their business at the checkpoint and let through.`);
    }
    return true;
  }
  // survivors driving: a barrier turns them round; a checkpoint stops them to talk (and to trade)
  if (b.policy === 'inspect' && b.kind === 'checkpoint') {
    if (r() < 0.3 + 0.15 * (road.word > 0 ? 1 : 0)) { openHail(s, pass, 'block', r); b.passed++; return true; }
    pass.fate = 'went_on'; b.passed++; road.word = clamp(road.word + PASS.WORD_FAIR, -100, 100);
    return true;
  }
  pass.fate = 'turned'; b.turned++; road.tally.turned++;
  road.word = clamp(road.word - 1, -100, 100);
  if (say) log(s, `${describePass(pass.party)} came up to the roadblock and turned around.`);
  return true;
}

/** Each sub-step: passes that have come abreast of the gate are resolved. */
export function passStep(s: GameState): void {
  const road = s.road;
  if (!road) return;
  // an unanswered hail goes by
  if (road.hail && s.clock.t > road.hail.until) { log(s, `The ${road.hail.by === 'us' ? 'people you waved down' : 'party at the line'} gave up waiting and went on.`); road.hail = null; }
  let guard = 0;
  for (const p of road.passes) {
    if (p.done || p.at > s.clock.t + 1e-9) continue;
    if (guard++ >= 4) break;
    p.done = true;
    road.tally.passed++;
    resolvePass(s, p);
  }
}

function resolvePass(s: GameState, pass: Pass): void {
  const road = roadOf(s), cls = pass.party.cls;
  const r = mulberry32(s.seed * 7121 + hashStr(pass.id));
  const day = dayIndex(s.clock.t);
  const eyes = sightUnits(s);
  const seen = !nobodyHome(s) && r() < Math.min(0.95, 0.1 + eyes / 60);
  if (seen) { pass.seen = true; road.tally.seen++; }
  road.recent.push({ day, cls, heads: pass.party.heads, seen, id: pass.id });
  if (road.recent.length > 30) road.recent.splice(0, road.recent.length - 30);
  if (road.block && atBlock(s, pass, road.block, r)) return;
  if (pass.fate === 'blocked') return;
  const noticed = r() < noticeChance(s, cls);
  if (!noticed) {
    pass.fate = 'went_on';
    if (seen && cls === 'raiders') log(s, `${cap(describePass(pass.party))} went by on the county road. They did not slow.`);
    else if (seen && cls !== 'traffic') log(s, `${cap(describePass(pass.party))} went by on the county road.`);
    return;
  }
  pass.fate = 'noticed'; road.tally.noticed++;
  const top = roadGiveAway(s).top, why = top ? GIVE_NAME[top] ?? 'the place' : 'the place';
  if (cls === 'wanderers' || cls === 'refugees') {
    if (r() < PASS.FOOT_TURNS_UP) {
      const e = cardFor(s, pass, r);
      if (e) {
        s.gate.pending = e; pass.fate = 'stopped'; road.tally.stopped++;
        log(s, `${cap(describePass(pass.party))} saw ${why} from the road and turned up the drive.`);
        return;
      }
    }
    pass.fate = 'went_on';
    if (seen) log(s, `${cap(describePass(pass.party))} slowed at your drive, looked, and went on.`);
    return;
  }
  if (cls === 'raiders') {
    const m = markPlace(s, pass.party.heads >= 6 ? 'gang' : 'looters', pass.party.heads, `The crew that slowed at your drive a few days ago has come back. They saw ${why} from the road and counted the windows.`, r);
    void m;
    if (seen) log(s, `${cap(describePass(pass.party))} slowed at your drive and looked the place over. They will remember it.`);
    return;
  }
  if (cls === 'convoy') {
    if (s.gate.government === 'hindrance' && roadGiveAway(s).points >= 15 && r() < 0.4) markPlace(s, 'requisition', 5, 'The convoy that went by on the county road wrote the place down. They have come back with a clipboard.', r);
    return;
  }
  // a survivor driving, who saw a light and has something to swap
  if (r() < PASS.DRIVER_STOPS) { openHail(s, pass, 'them', r); }
  else pass.fate = 'went_on';
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// ─────────────────────────────────────────────────────────────────────────
// Trading at the property line
// ─────────────────────────────────────────────────────────────────────────

const OFFER_FOOT: Array<[Good, [number, number]]> = [['seed', [2, 5]], ['hygiene', [2, 5]], ['firewood', [4, 10]], ['canned', [3, 6]]];
const OFFER_DRIVE: Array<[Good, [number, number]]> = [['fuel', [2, 6]], ['meds', [1, 3]], ['staples', [2, 5]], ['hygiene', [2, 6]]];
const WANT: Good[] = ['canned', 'staples', 'fresh', 'fuel', 'meds', 'firewood', 'hygiene'];

/** A swap the party proposes: roughly fair by today's barter prices, in what they have and what they lack. */
export function makeOffer(s: GameState, party: RoadParty, r: () => number): { offer: Lot[]; want: Lot[] } {
  const prices = barterPrices(s), onFoot = party.cls === 'wanderers' || party.cls === 'refugees';
  const table = onFoot ? OFFER_FOOT : OFFER_DRIVE;
  const [good, [lo, hi]] = table[Math.floor(r() * table.length)];
  const qty = lo + Math.floor(r() * (hi - lo + 1)) + (party.heads > 3 ? 1 : 0);
  const offer: Lot[] = [{ good, qty }];
  if (!onFoot && r() < 0.35) { const cal = CALIBERS[Math.floor(r() * CALIBERS.length)]; offer.push({ good: `ammo:${cal}`, qty: 10 + Math.floor(r() * 20) }); }
  const wants = WANT.filter(g => g !== good), wg = wants[Math.floor(r() * wants.length)];
  const target = valueOf(prices, offer) * (0.85 + 0.3 * r());
  const wq = Math.max(1, Math.round(target / Math.max(0.01, prices[wg])));
  return { offer, want: [{ good: wg, qty: wq }] };
}

const lotText = (l: Lot): string => `${l.qty} ${l.good.startsWith('ammo:') ? `rounds of ${l.good.slice(5)}` : l.good.replace(/_/g, ' ')}`;
export const lotsText = (ls: readonly Lot[]): string => ls.map(lotText).join(' and ');

function openHail(s: GameState, pass: Pass, by: Hail['by'], r: () => number): boolean {
  const road = roadOf(s);
  if (road.hail || s.gate.pending || nobodyHome(s)) { pass.fate = 'went_on'; return false; }
  const { offer, want } = makeOffer(s, pass.party, r);
  const onFoot = pass.party.cls === 'wanderers' || pass.party.cls === 'refugees';
  const shady = r() < PASS.SHADY * (onFoot ? 0.7 : 1);
  const who = describePass(pass.party);
  const text = by === 'us' ? `${cap(who)} stopped at the line when you called. They will swap ${lotsText(offer)} for ${lotsText(want)}.` : by === 'block' ? `${cap(who)} stopped at the checkpoint and asked if you would swap ${lotsText(offer)} for ${lotsText(want)}.` : `${cap(who)} pulled up at the drive, saw you at the fence, and called out: ${lotsText(offer)} for ${lotsText(want)}?`;
  road.hail = { id: `h${s.nextId++}`, pass: pass.id, until: s.clock.t + PASS.HAIL_OPEN, party: pass.party, by, text, offer, want, shady, begging: onFoot };
  pass.fate = 'stopped'; road.tally.stopped++;
  log(s, text);
  return true;
}

/** Passes the family can wave down now: seen, just gone by, real people, and nothing else going on at the line. */
export function hailable(s: GameState): Pass[] {
  const road = s.road;
  if (!road || road.hail || s.gate.pending || nobodyHome(s)) return [];
  return road.passes.filter(p => p.done && p.seen && (p.fate === 'went_on' || p.fate === 'noticed') && ['traffic', 'wanderers', 'refugees'].includes(p.party.cls) && s.clock.t - p.at <= PASS.HAILABLE && s.clock.t >= p.at);
}

export function hailPass(s: GameState, id: string): string | null {
  const pass = hailable(s).find(p => p.id === id);
  if (!pass) return 'they are gone';
  const r = mulberry32(s.seed * 7129 + hashStr(pass.id) * 3);
  const onFoot = pass.party.cls !== 'traffic';
  if (r() >= (onFoot ? PASS.HAIL_FOOT : PASS.HAIL_DRIVER) * (1 + roadOf(s).word / 400)) { pass.fate = 'went_on'; log(s, `You waved at ${describePass(pass.party)}. They did not stop.`); return null; }
  return openHail(s, pass, 'us', r) ? null : 'not now';
}

export type HailAnswer = 'accept' | 'haggle' | 'decline' | 'gift';

export function answerHail(s: GameState, how: HailAnswer): string | null {
  const road = roadOf(s), h = road.hail;
  if (!h) return 'nobody at the line';
  const r = mulberry32(s.seed * 7151 + hashStr(h.id));
  const pass = road.passes.find(p => p.id === h.pass);
  if (how === 'decline') { road.hail = null; if (pass) pass.fate = 'went_on'; log(s, 'You shook your head. They went on.'); return null; }
  if (how === 'gift') {
    if (!h.begging) return 'they are not asking for a handout';
    const n = Math.min(3, Math.floor(s.stock.canned));
    if (n <= 0) return 'nothing to spare';
    s.stock.canned -= n;
    road.word = clamp(road.word + PASS.WORD_GIFT, -100, 100);
    s.gate.humanity = Math.min(100, s.gate.humanity + 0.5);
    road.hail = null; if (pass) pass.fate = 'traded';
    log(s, `You passed ${n} cans over the fence. They thanked you and went on.`);
    return null;
  }
  if (how === 'haggle') {
    if (h.haggled) return 'already pushed';
    const skill = Math.max(0, ...homeAdults(s).map(p => p.skills.negotiator ?? 0));
    h.haggled = true;
    if (r() < clamp(0.35 + 0.08 * skill, 0, 0.9)) {
      h.want = h.want.map(l => ({ ...l, qty: Math.max(1, Math.floor(l.qty * 0.8)) }));
      log(s, `They gave a little: now ${lotsText(h.offer)} for ${lotsText(h.want)}.`);
    } else {
      road.hail = null; if (pass) pass.fate = 'went_on';
      log(s, 'They shrugged, said it was a fair price, and walked off.');
    }
    return null;
  }
  // accept
  for (const l of h.want) if (have(s, l.good) < l.qty) return `you do not have ${lotText(l)}`;
  for (const l of h.want) move(s, l.good, -l.qty);
  for (const l of h.offer) move(s, l.good, l.qty);
  barterOf(s).trades++;
  road.tally.traded++;
  road.word = clamp(road.word + PASS.WORD_TRADE, -100, 100);
  road.hail = null; if (pass) pass.fate = 'traded';
  log(s, `Swapped across the fence: you gave ${lotsText(h.want)} and got ${lotsText(h.offer)}.`);
  if (h.shady) {
    const rr = mulberry32(s.seed * 7159 + hashStr(h.id));
    markPlace(s, h.party.heads >= 4 ? 'gang' : 'looters', h.party.heads + 2, 'The man who traded across your fence came back with friends. He had counted the doors.', rr);
    if (rr() < 0.5) log(s, 'One of them looked past you at the house a little too long.');
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Roadblocks and checkpoints
// ─────────────────────────────────────────────────────────────────────────

export function blockProblem(s: GameState, kind: BlockKind): string | null {
  const road = roadOf(s);
  if (road.block) return 'there is a block already';
  if (nobodyHome(s)) return 'nobody home to man it';
  if (homeAdults(s).length < (kind === 'checkpoint' ? 2 : 1)) return kind === 'checkpoint' ? 'a checkpoint needs two adults on their feet' : 'nobody free';
  if (s.stock.lumber < (kind === 'barrier' ? PASS.BARRIER_LUMBER : PASS.CHECKPOINT_LUMBER)) return `needs ${kind === 'barrier' ? PASS.BARRIER_LUMBER : PASS.CHECKPOINT_LUMBER} lumber`;
  if (kind === 'checkpoint' && s.stock.hardware < PASS.CHECKPOINT_HARDWARE) return `needs ${PASS.CHECKPOINT_HARDWARE} hardware (hinges, chain, a sign)`;
  return null;
}

export function buildBlock(s: GameState, kind: BlockKind): string | null {
  const why = blockProblem(s, kind);
  if (why) return why;
  s.stock.lumber -= kind === 'barrier' ? PASS.BARRIER_LUMBER : PASS.CHECKPOINT_LUMBER;
  if (kind === 'checkpoint') s.stock.hardware -= PASS.CHECKPOINT_HARDWARE;
  roadOf(s).block = { kind, policy: kind === 'checkpoint' ? 'inspect' : 'turn_back', since: s.clock.t, turned: 0, passed: 0, crew: nameCrew(s, kind) };
  const names = roadOf(s).block!.crew.map(id => s.people.find(p => p.id === id)?.first ?? 'Someone').join(' and ');
  log(s, kind === 'barrier' ? `Sawhorses and a chain across the county road at the drive. ${names} will stand by them from 8 AM to 5 PM; outside those hours they only slow a vehicle.` : `A checkpoint at the drive: a pole across the road and a sign. ${names} will man it from 8 AM to 5 PM.`);
  return null;
}

export function setBlockPolicy(s: GameState, policy: BlockPolicy): string | null {
  const b = s.road?.block;
  if (!b) return 'no block';
  if (b.kind === 'barrier' && policy === 'inspect') return 'a bare barrier cannot inspect';
  b.policy = policy;
  return null;
}

export function removeBlock(s: GameState): string | null {
  const road = s.road;
  if (!road?.block) return 'no block';
  road.block = null;
  log(s, 'The barrier came off the county road.');
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Marks and the gate roll; rumors
// ─────────────────────────────────────────────────────────────────────────

/** The crew a mark names, if it still stands (does not consume it). */
export function markKind(s: GameState, day: number): Mark | null {
  const m = s.road?.mark;
  return m && m.until >= day ? m : null;
}
export function takeMark(s: GameState): void { if (s.road) s.road.mark = null; }

export interface PasserRumor { text: string; tone: 0 | 1 | 2 | 3; kind: 'raiders' | 'checkpoint' | 'travelers'; truth: boolean; warn?: boolean }

/**
 * What the radio or the fence talk says of the road, from what actually passed in the last few days. True with the set's reliability
 * (`truth`); otherwise the passing is taken for something else. `r` is a stream of its own: nothing else's rolls move.
 */
export function passerRumor(s: GameState, src: string, truth: number): PasserRumor | null {
  const road = s.road;
  if (!road) return null;
  const day = dayIndex(s.clock.t), r = mulberry32(s.seed * 7177 + day * 19 + 3);
  const live = road.recent.filter(x => x.day >= day - 3);
  if (!live.length && !road.block) return null;
  if (r() > 0.4) return null;
  if (road.block && (!live.length || r() < 0.3)) {
    return r() < truth ? { text: `${src} somebody is turning cars back at a barrier on the county road.`, tone: 1, kind: 'checkpoint', truth: true } : { text: `${src} the county has put a checkpoint on your road and is taking everything that rolls through.`, tone: 1, kind: 'checkpoint', truth: false };
  }
  const x = live[Math.floor(r() * live.length)];
  const real = r() < truth;
  switch (x.cls) {
    case 'raiders':
      return real ? { text: `${src} a pickup full of armed men was running dark on the county road ${live.length > 1 ? 'again ' : ''}a couple of nights back.`, tone: 2, kind: 'raiders', truth: true, warn: true }
        : { text: `${src} a gang of thirty came up the county road last night and stripped two farms.`, tone: 2, kind: 'raiders', truth: false };
    case 'convoy':
      return real ? { text: `${src} an army convoy went down the county road yesterday, headed for the city.`, tone: 0, kind: 'checkpoint', truth: true }
        : { text: `${src} the army is taking guns and food at checkpoints on the county roads.`, tone: 1, kind: 'checkpoint', truth: false };
    case 'wanderers': case 'refugees':
      return real ? { text: `${src} ${x.heads === 1 ? 'a man' : `about ${x.heads} people`} on foot, hungry, working up the valley.`, tone: 1, kind: 'travelers', truth: true }
        : { text: `${src} a column of two hundred refugees is walking out of the city up this valley.`, tone: 2, kind: 'travelers', truth: false };
    default:
      return real ? { text: `${src} a few vehicles still get through on the county road, mostly in daylight.`, tone: 0, kind: 'travelers', truth: true }
        : { text: `${src} the highway is open again and fuel is coming through on Thursday.`, tone: 1, kind: 'checkpoint', truth: false };
  }
}

/** For the HUD: where the road stands. */
export function roadSummary(s: GameState): { word: string; give: string; lines: string[] } {
  const road = roadOf(s), g = roadGiveAway(s);
  const w = road.word;
  const word = w >= 15 ? 'Fair dealers' : w <= -15 ? 'Hard on strangers' : 'Not much said';
  const give = g.points < 4 ? 'Nothing shows from the road' : `${g.top ? cap(GIVE_NAME[g.top] ?? 'the place') : 'The place'} shows (${Math.round(g.points)})`;
  const lines: string[] = [];
  if (road.tally.passed) lines.push(`${pluralize(road.tally.passed, 'party', 'parties')} passed; you saw ${road.tally.seen}, ${road.tally.noticed} noticed the place.`);
  if (road.mark) lines.push('Somebody has marked the place.');
  return { word, give, lines };
}
