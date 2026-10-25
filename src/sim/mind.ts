/**
 * Mental health (decided with the user: "all of these", docs/DECISIONS.md;
 * GDS §10.6 "grief, depression and someone breaking down"). Each person
 * carries more than the day's morale. Pure; once a day plus event hooks.
 *
 *  Stress     the load of the days: hunger, sickness in the family, the
 *             shelter, the dark, a fight. Comes and goes within weeks.
 *  Trauma     what a raid, a wound, killing someone, an execution or
 *             captivity leaves behind: nightmares (20+), poor sleep (35+),
 *             hypervigilance and flashbacks (50+). Fades over months with
 *             safety, routine and support; another fight sets it back. A
 *             shaken civilian freezes longer at the alarm and holds a post
 *             under fire less long (battle.ts). Prior trauma sensitizes.
 *  Grief      for each death in the household, deepest for a partner, a
 *             parent or a child. A child taken is its own, harder kind:
 *             ambiguous loss barely eases while the search goes on; it ends in
 *             relief if they come home, or turns to mourning when the family
 *             stops looking or learns the worst. A burial helps; a memorial
 *             more (the daily-life gatherings call `gathering`).
 *  Low mood   depression from long isolation, winter's short days, grief and
 *             strain that doesn't let up. Withdrawn at 40, depressed at 65.
 *  Kids       take fear in faster, and pick up the adults' stress; they are
 *             resilient with routine and a parent close.
 *  Conflict   two adults both under heavy strain have words: a few days of
 *             cold silence, less done, until they make it up.
 *  Breakdown  stress past 85 on top of trauma, grief or depression: a few
 *             days when someone can't function. It releases some of it.
 *
 * Recovery speeds with time, routine, sleep, work, faith, music and games, a
 * dog, someone to talk to, a funeral or memorial, and the medic's care. It
 * shows in morale (needs.ts), work rate (engine.ts), learning (skills.ts)
 * and in what people say (log lines, a few a week at most, kept plain).
 *
 * Anchors: most people exposed to trauma recover; roughly 1 in 5 develop
 * lasting PTSD symptoms (higher after interpersonal violence). Acute grief
 * typically eases over 6–12 months. Children's distress tracks their
 * caregivers'. Seasonal low mood is common at high latitudes.
 */
import type { Battle } from './battleTypes';
import { backgroundOf, type Person } from './family';
import { mulberry32 } from './rng';
import { calendarOf, dayIndex, type GameState } from './state';

export type GriefKind = 'death' | 'taken';
export interface Grief { for: string; name: string; kind: GriefKind; sev: number; day: number; buried?: boolean; mourned?: boolean }
export type TraumaKind = 'raid' | 'wounded' | 'killed' | 'execution' | 'captivity' | 'witness';
export interface Psyche {
  stress: number;
  trauma: number;
  low: number;
  grief: Grief[];
  /** The last thing that hurt them, and when (day). */
  what?: TraumaKind;
  since?: number;
  /** Raiders they killed (moral injury). */
  kills?: number;
  /** Day of the last line about them in the log. */
  said?: number;
  /** Can't function until this day. */
  breakdown?: number;
  /** Mood-lifting things already noted (once each). */
  better?: number;
}
export interface Rift { a: string; b: string; day: number; until: number; over: string }
export interface MindState {
  psyche: Record<string, Psyche>;
  day: number;
  /** Losses already grieved (dead / taken ids). */
  seenDead: string[];
  seenTaken: string[];
  rift: Rift | null;
  /** Day of the last fight at the place, and of the last gathering (and what). */
  lastFight: number;
  gatherings: Array<{ day: number; kind: GatheringKind; for?: string }>;
}
export const newMind = (): MindState => ({ psyche: {}, day: -1, seenDead: [], seenTaken: [], rift: null, lastFight: -999, gatherings: [] });
export function mindOf(s: GameState): MindState {
  s.mind ??= newMind();
  return s.mind;
}
export function psyOf(s: GameState, pid: string): Psyche {
  const M = mindOf(s);
  let ps = M.psyche[pid];
  if (!ps) {
    ps = { stress: 10, trauma: 0, low: 5, grief: [] };
    // someone taken in after the collapse comes with what they've been through
    const p = s.people.find(x => x.id === pid);
    if (p && !p.kin && s.disaster.hitAt <= s.clock.t && s.disaster.kind) { ps.stress = 35; ps.trauma = 20; ps.low = 20; }
    M.psyche[pid] = ps;
  }
  return ps;
}

const hash = (t: string) => { let h = 2166136261; for (const c of t) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
const person = (s: GameState, pid: string) => s.people.find(p => p.id === pid);
const needsOf = (s: GameState, pid: string) => s.personState.find(x => x.id === pid)?.needs;
const here = (s: GameState, p: Person) => { const n = needsOf(s, p.id); return !!n && n.died == null && !n.taken; };
const clamp = (v: number) => Math.max(0, Math.min(100, v));
export const griefTotal = (ps: Psyche) => ps.grief.reduce((a, g) => a + g.sev, 0);

/** A faith they keep (about 45 % of adults; kids mostly follow a parent). Seeded by the person. */
export function faithOf(s: GameState, p: Person): boolean {
  if (p.kid && p.parents?.length) { const par = p.parents.map(id => person(s, id)).filter((x): x is Person => !!x); if (par.length) return par.some(q => faithOf(s, q)) ? hash(p.id + p.first) % 10 < 8 : hash(p.id + p.first) % 10 < 1; }
  return hash(p.first + p.last + p.id + 'faith') % 100 < 45;
}

/** How close two people are (0.3 someone taken in … 1 a partner, parent or child). */
export function closeness(a: Person, b: Person): number {
  if (a.partner === b.id || b.partner === a.id) return 1;
  if (a.parents?.includes(b.id) || b.parents?.includes(a.id)) return 1;
  if (a.parents && b.parents && a.parents.some(x => b.parents!.includes(x))) return 0.8;
  if (a.last === b.last && (a.kin !== false) && (b.kin !== false)) {
    // the founding family: the adults are the kids' parents, the kids siblings
    if (a.kid && b.kid) return 0.8;
    if (a.kid !== b.kid && !a.elder && !b.elder) return 1;
    return 0.7;
  }
  if (a.kin && b.kin) return 0.6;
  return 0.3;
}

/** How hard a blow lands: kids take fear in faster, those who served steadier, earlier trauma sensitizes. */
function susceptibility(s: GameState, p: Person): number {
  const ps = psyOf(s, p.id);
  const base = p.kid ? (p.age < 6 ? 1.1 : 1.35) : backgroundOf(p) ? 0.7 : p.elder ? 0.9 : 1;
  return base * (1 + ps.trauma / 200);
}

/** A traumatic event for one person (`amount` ≈ trauma points for an average adult). */
export function shock(s: GameState, pid: string, kind: TraumaKind, amount: number): void {
  const p = person(s, pid);
  if (!p || !here(s, p)) return;
  const ps = psyOf(s, pid), k = susceptibility(s, p);
  ps.trauma = clamp(ps.trauma + amount * k);
  ps.stress = clamp(ps.stress + amount * 0.9 * k);
  ps.what = kind; ps.since = dayIndex(s.clock.t);
}

/**
 * After a fight (battle.ts applyBattle, a rescue raid's camp fight): everyone
 * who was there is shaken, the wounded more, those who killed someone carry
 * that, and seeing one of their own die is its own blow. Those who fought get
 * shooting practice from it. Returns nothing: the log lines come later, in
 * how people are.
 */
export function afterFight(s: GameState, b: Battle, practiceShot?: (pid: string, hours: number) => void): void {
  const M = mindOf(s);
  M.lastFight = dayIndex(s.clock.t);
  const pidOf = new Map(b.units.filter(u => u.personId).map(u => [u.id, u.personId!]));
  const endEv = b.events.find(e => e.kind === 'end');
  const lost = endEv && endEv.kind === 'end' && (endEv.result === 'breached' || endEv.result === 'overrun');
  const night = (b as { night?: boolean }).night;
  const homeDead = b.events.filter(e => e.kind === 'death' && pidOf.has(e.unit)).length;
  const executed = b.events.some(e => e.kind === 'death' && e.executed && pidOf.has(e.unit));
  const shots = new Map<string, number>();
  for (const e of b.events) if (e.kind === 'shot' && pidOf.has(e.from)) shots.set(e.from, (shots.get(e.from) ?? 0) + 1);
  // who killed whom: the last family member to hit a raider before he died
  const kills = new Map<string, number>();
  const lastHit = new Map<string, string>();
  for (const e of b.events) {
    if (e.kind === 'shot' && e.hit) lastHit.set(e.to, e.from);
    else if (e.kind === 'death' && !pidOf.has(e.unit)) { const by = lastHit.get(e.unit); if (by && pidOf.has(by)) kills.set(by, (kills.get(by) ?? 0) + 1); }
  }
  for (const [unit, pid] of pidOf) {
    const p = person(s, pid);
    if (!p || !here(s, p)) continue;
    let amt = 14 + (lost ? 12 : 0) + (night ? 4 : 0) + homeDead * 10 + (executed ? 15 : 0);
    let kind: TraumaKind = homeDead ? 'witness' : 'raid';
    const wounds = b.events.filter(e => e.kind === 'wound' && e.unit === unit && !e.stopped);
    if (wounds.length) { amt += 12 + Math.max(...wounds.map(w => (w.kind === 'wound' ? w.sev : 0))) / 4; kind = 'wounded'; }
    const k = kills.get(unit) ?? 0;
    if (k) {
      const ps = psyOf(s, pid);
      amt += (ps.kills ? 8 : 18) + 4 * (k - 1);
      ps.kills = (ps.kills ?? 0) + k;
      kind = 'killed';
    }
    shock(s, pid, kind, amt);
    const n = shots.get(unit) ?? 0;
    if (n && practiceShot) practiceShot(pid, Math.min(10, 2 + n * 0.3));
  }
  // those in the house who didn't fight (the kids in the shelter) heard it all
  for (const p of s.people) if (here(s, p) && ![...pidOf.values()].includes(p.id)) shock(s, p.id, 'raid', 8);
}

/** An execution on the place (aftermath.ts "finish it"): the adults who did it or stood by, the kids who heard. */
export function afterExecution(s: GameState, n: number): void {
  for (const p of s.people) if (here(s, p)) shock(s, p.id, 'execution', (p.kid ? 12 : 20) + 3 * Math.min(4, n - 1));
}
/** Left the wounded to die on the drive (aftermath.ts "leave them"): it stays with some people. */
export function afterLeaving(s: GameState): void {
  for (const p of s.people) if (here(s, p) && !p.kid) shock(s, p.id, 'witness', 5);
}
/** Home from captivity (rescue.ts bringHome): the one who was held, after `days`. */
export function homeFromCaptivity(s: GameState, pid: string, days: number): void {
  const ps = psyOf(s, pid);
  ps.trauma = clamp(ps.trauma + Math.min(65, 25 + days) * (person(s, pid)?.kid ? 1.1 : 1));
  ps.stress = clamp(Math.max(ps.stress, 60));
  ps.what = 'captivity'; ps.since = dayIndex(s.clock.t);
  // the others: the ambiguous loss ends in relief
  for (const q of s.people) if (q.id !== pid) {
    const qs = mindOf(s).psyche[q.id];
    if (!qs) continue;
    qs.grief = qs.grief.filter(g => g.for !== pid);
    qs.stress = clamp(qs.stress - 20); qs.low = clamp(qs.low - 10);
  }
  mindOf(s).seenTaken = mindOf(s).seenTaken.filter(id => id !== pid);
}

export type GatheringKind = 'funeral' | 'memorial' | 'party' | 'music' | 'prayer' | 'meal';
/**
 * A gathering (the daily-life schedule's parties and funerals call this; the
 * Family tab's "Hold a memorial" too). A funeral or memorial `for` someone
 * eases the grief for them (a memorial doubles how fast it eases from then
 * on); parties, music and shared meals ease stress and low mood; a prayer
 * service helps those who keep a faith. `who`: those there (default: everyone
 * on the place). Returns a line for the log.
 */
export function gathering(s: GameState, kind: GatheringKind, opts: { for?: string; who?: string[] } = {}): string {
  const M = mindOf(s), day = dayIndex(s.clock.t);
  const ids = opts.who ?? s.people.filter(p => here(s, p)).map(p => p.id);
  const lost = opts.for ? person(s, opts.for) : undefined;
  for (const id of ids) {
    const p = person(s, id);
    if (!p || !here(s, p)) continue;
    const ps = psyOf(s, id), faith = faithOf(s, p);
    if ((kind === 'funeral' || kind === 'memorial') && opts.for) {
      for (const g of ps.grief) if (g.for === opts.for) {
        g.sev = Math.max(0, g.sev - (kind === 'memorial' ? 12 : 8) * (faith ? 1.25 : 1));
        if (kind === 'memorial') g.mourned = true; else g.buried = true;
      }
      ps.stress = clamp(ps.stress - 6);
    } else if (kind === 'party') { ps.stress = clamp(ps.stress - 10); ps.low = clamp(ps.low - 8); }
    else if (kind === 'music') { ps.stress = clamp(ps.stress - 5); ps.low = clamp(ps.low - 4); }
    else if (kind === 'prayer') { if (faith) { ps.stress = clamp(ps.stress - 7); ps.low = clamp(ps.low - 4); for (const g of ps.grief) g.sev = Math.max(0, g.sev - 3); } }
    else { ps.stress = clamp(ps.stress - 3); ps.low = clamp(ps.low - 2); }
  }
  M.gatherings.push({ day, kind, ...(opts.for ? { for: opts.for } : {}) });
  if (M.gatherings.length > 20) M.gatherings.splice(0, M.gatherings.length - 20);
  const name = lost?.first ?? 'them';
  return kind === 'memorial' ? `The family held a memorial for ${name}: stories, a song, a marker on the hill.`
    : kind === 'funeral' ? `The family buried ${name} on the hill. Everyone said something.`
    : kind === 'party' ? 'A good evening: music, a real supper, the kids up late.'
    : kind === 'music' ? 'Music after supper.'
    : kind === 'prayer' ? 'A prayer service in the front room.'
    : 'Everyone at the table together for once.';
}
/** Who can be mourned with a memorial now (dead, or taken and given up on / known dead), and not yet. */
export function canMourn(s: GameState): Person[] {
  const done = new Set(mindOf(s).gatherings.filter(g => g.kind === 'memorial').map(g => g.for));
  const closed = (pid: string) => (s.rescue?.captives ?? []).some(c => c.pid === pid && (c.closed === 'given_up' || c.closed === 'dead' || c.known === 'dead'));
  return s.people.filter(p => { const n = needsOf(s, p.id); return n && n.died != null && (!n.taken || closed(p.id)) && !done.has(p.id); });
}
export function holdMemorial(s: GameState, pid: string): string | null {
  if (!canMourn(s).some(p => p.id === pid)) return 'no one to remember there';
  const line = gathering(s, 'memorial', { for: pid });
  s.log.push({ t: s.clock.t, text: line });
  return null;
}

// ── what it does ──

/** Trauma symptoms by level. */
export const nightmares = (ps: Psyche) => ps.trauma >= 20;
export const insomnia = (ps: Psyche) => ps.trauma >= 35 || ps.stress >= 75;
export const hypervigilant = (ps: Psyche) => ps.trauma >= 50;

/** Morale taken off the day's baseline (needs.ts). */
export function mindMorale(s: GameState, pid: string): number {
  const ps = mindOf(s).psyche[pid];
  if (!ps) return 0;
  const R = mindOf(s).rift, rift = R && (R.a === pid || R.b === pid) ? 6 : 0;
  return Math.min(40, ps.stress * 0.12 + Math.min(28, griefTotal(ps) * 0.35) + ps.trauma * 0.08 + ps.low * 0.2 + rift);
}
/** Work rate from the state of mind (engine.ts multiplies it in). */
export function mindWork(s: GameState, pid: string): number {
  const M = mindOf(s), ps = M.psyche[pid];
  if (!ps) return 1;
  if (ps.breakdown != null && ps.breakdown > dayIndex(s.clock.t)) return 0.15;
  let f = ps.low >= 65 ? 0.75 : ps.low >= 40 ? 0.9 : 1;
  const g = griefTotal(ps);
  if (g >= 50) f *= 0.8; else if (g >= 25) f *= 0.92;
  if (insomnia(ps)) f *= 0.9;
  if (M.rift && (M.rift.a === pid || M.rift.b === pid)) f *= 0.92;
  return Math.max(0.15, f);
}
/** Learning rate from the state of mind (skills.ts). */
export function mindLearn(s: GameState, pid: string): number {
  const ps = s.mind?.psyche[pid];
  if (!ps) return 1;
  return Math.max(0.5, 1 - ps.stress / 300 - ps.low / 250 - Math.min(40, griefTotal(ps)) / 200);
}
/**
 * In the next fight (battle.ts): extra seconds frozen at the alarm, and how
 * long they hold a post under fire (1 = as anyone would; 0.6 = leaves it
 * much sooner). Those who served are steadier but not immune.
 */
export function fightNerves(s: GameState, p: Person): { freeze: number; hold: number } {
  const ps = s.mind?.psyche[p.id];
  if (!ps) return { freeze: 0, hold: 1 };
  const vet = backgroundOf(p) !== null;
  const freeze = (ps.trauma / 100) * (vet ? 2 : 5) + Math.max(0, ps.stress - 40) / 60 * (vet ? 0.5 : 1.5);
  const hold = Math.max(0.55, 1 - 0.35 * ps.trauma / 100 - 0.15 * ps.stress / 100);
  return { freeze, hold };
}

/** A word for the Family tab: how they are. */
export function moodText(s: GameState, p: Person): string {
  const ps = s.mind?.psyche[p.id];
  if (!ps) return '';
  const out: string[] = [];
  const day = dayIndex(s.clock.t);
  if (ps.breakdown != null && ps.breakdown > day) out.push('not coping');
  const g = [...ps.grief].sort((a, b) => b.sev - a.sev)[0];
  if (g && g.sev >= 12) out.push(g.kind === 'taken' ? `missing ${g.name}` : `grieving ${g.name}`);
  if (hypervigilant(ps)) out.push(p.kid ? 'frightened, jumpy' : 'on edge, flashbacks');
  else if (insomnia(ps)) out.push('not sleeping');
  else if (nightmares(ps)) out.push('nightmares');
  if (ps.low >= 65) out.push('depressed'); else if (ps.low >= 40) out.push('low, withdrawn');
  if (ps.stress >= 70) out.push('badly strained'); else if (ps.stress >= 50) out.push('stressed');
  const R = s.mind?.rift;
  if (R && (R.a === p.id || R.b === p.id)) out.push(`not speaking to ${person(s, R.a === p.id ? R.b : R.a)?.first ?? 'someone'}`);
  return out.join(', ');
}

// ── once a day ──

/** What helps, today, for one person (1 = time alone heals; more = faster). */
export function recovery(s: GameState, p: Person): number {
  const M = mindOf(s), day = dayIndex(s.clock.t), ps = psyOf(s, p.id);
  const fin = s.structures.filter(x => x.finishedAt != null);
  const home = fin.some(x => ['timber_cabin', 'log_house', 'farmhouse', 'trailer', 'cottage'].includes(x.kind));
  const n = needsOf(s, p.id);
  let r = 1;
  if (home && day - M.lastFight > 14) r += 0.2;                                         // routine, a safe roof
  if (!insomnia(ps)) r += 0.1;                                                          // sleep
  if (s.personState.find(x => x.id === p.id)?.task === 'shelter') r -= 0.2;
  const w = s.learning?.today[p.id], worked = w ? w.build + w.fell + w.fit + w.carry : 0;
  if (worked >= 3 || (s.personState.find(x => x.id === p.id)?.employed)) r += 0.15;    // purpose, a day's work
  if (faithOf(s, p)) r += 0.2;
  if ((s.stock.pastimes ?? 0) >= 1) r += p.kid ? 0.25 : 0.15;                          // the guitar, cards, board games
  if ((s.stock.dog ?? 0) >= 1) r += p.kid ? 0.25 : 0.15;
  // someone to talk to: a partner; for a kid, a parent; anyone close otherwise
  const close = s.people.filter(q => q !== p && here(s, q) && closeness(p, q) >= (p.kid ? 1 : 0.7));
  const mate = p.partner ? person(s, p.partner) : undefined;
  if ((mate && here(s, mate)) || (p.kid && close.some(q => !q.kid))) r += 0.2; else if (close.length) r += 0.1;
  // the medic's care: someone who knows how to sit with a person
  const medic = Math.max(0, ...s.people.filter(q => q !== p && !q.kid && here(s, q)).map(q => q.skills.medic));
  if (medic >= 4) r += 0.03 * medic;
  if (M.gatherings.some(g => day - g.day <= 7)) r += 0.3;
  if (n && n.hunger > 5000) r -= 0.2;
  if (M.rift && (M.rift.a === p.id || M.rift.b === p.id)) r -= 0.2;
  return Math.max(0.3, r);
}

const LINES = {
  griefDeath: (p: string, d: string) => [`${p} set out ${d}'s mug at breakfast, then put it back.`, `${p} walked up to ${d}'s grave after supper and stayed until dark.`, `${p} found one of ${d}'s gloves in the shed and sat with it a while.`, `${p} said ${d}'s name at the table and everyone went quiet.`],
  griefKid: (p: string, d: string) => [`${p} asked when ${d} is coming back.`, `${p} drew a picture of ${d} and pinned it by the bed.`, `${p} has been sleeping in ${d}'s old shirt.`],
  griefTaken: (p: string, d: string) => [`${p} was at the gate again at dusk, watching the road.`, `${p} keeps ${d}'s bed made.`, `${p} listened to the radio until the batteries ran low, for any word of ${d}.`],
  nightmare: (p: string) => [`${p} woke the house shouting in the night.`, `${p} has the same dream about the fight most nights.`, `${p} was up at 3 a.m. checking the locks again.`],
  vigil: (p: string) => [`${p} won't sit with their back to the door since the fight.`, `A branch cracked in the woods and ${p} was on the floor before anyone else moved.`, `${p} walks the fence line twice a night now.`],
  killed: (p: string) => [`${p} keeps going back over the night of the fight. "He was somebody's son."`, `${p} doesn't talk about the man on the drive. Works until dark instead.`],
  sleep: (p: string) => [`${p} hasn't slept a full night in a week.`, `${p} is grey with tiredness: up most nights.`],
  kidFear: (p: string, age: number) => age < 9 ? [`${p} won't sleep without the lamp on.`, `${p} wet the bed again. Nobody made a thing of it.`, `${p} asks every night if the bad men are coming back.`] : [`${p} has stopped talking much. Spends hours out with the animals.`, `${p} jumps at every sound on the road.`, `${p} snapped at everyone and went off to the woods alone.`],
  low: (p: string) => [`${p} sat on the porch most of the afternoon. Says it's nothing.`, `${p} skipped supper again.`, `${p} has gone quiet. Does the work, says little.`],
  stressed: (p: string) => [`${p} is short with everyone today.`, `${p} lay awake doing the sums on the food again.`],
  better: (p: string) => [`${p} laughed at supper for the first time in a long while.`, `${p} slept through the night.`, `${p} was singing in the garden this morning.`],
};
const pickL = (r: () => number, xs: string[]) => xs[Math.floor(r() * xs.length)];

/** Once a day: losses, strain, recovery, conflict, breakdowns, and a line or two about how people are. */
export function mindDay(s: GameState): string[] {
  const M = mindOf(s), day = dayIndex(s.clock.t);
  if (M.day === day) return [];
  M.day = day;
  const out: string[] = [];
  const r = mulberry32(s.seed * 6007 + day * 41 + 19);
  const living = s.people.filter(p => here(s, p));
  // losses: new deaths and new takings, grieved by everyone still here
  for (const lost of s.people) {
    const n = needsOf(s, lost.id);
    if (!n || n.died == null) continue;
    const taken = !!n.taken;
    const captive = (s.rescue?.captives ?? []).filter(c => c.pid === lost.id).pop();
    const nowDead = taken && !!captive && (captive.known === 'dead' || captive.closed === 'dead');
    if (taken && !nowDead) {
      if (M.seenTaken.includes(lost.id)) continue;
      M.seenTaken.push(lost.id);
      for (const p of living) psyOf(s, p.id).grief.push({ for: lost.id, name: lost.first, kind: 'taken', sev: 80 * closeness(p, lost), day });
      continue;
    }
    if (M.seenDead.includes(lost.id)) continue;
    M.seenDead.push(lost.id);
    for (const p of living) {
      const ps = psyOf(s, p.id), old = ps.grief.find(g => g.for === lost.id);
      const sev = Math.min(95, 70 * closeness(p, lost) + (lost.kid && p.kid === false && closeness(p, lost) >= 1 ? 15 : 0));
      if (old) { old.kind = 'death'; old.sev = Math.max(old.sev, sev * 0.8); old.day = day; } else ps.grief.push({ for: lost.id, name: lost.first, kind: 'death', sev, day });
      ps.stress = clamp(ps.stress + 15 * closeness(p, lost));
    }
  }
  // the given up on: they can be mourned now
  for (const c of s.rescue?.captives ?? []) if (c.closed === 'given_up') for (const p of living) for (const g of psyOf(s, p.id).grief) if (g.for === c.pid && g.kind === 'taken') g.kind = 'death';
  const after = s.disaster.kind != null && s.clock.t >= s.disaster.hitAt;
  const sinceHit = after ? s.clock.t - s.disaster.hitAt : 0;
  const { doy } = calendarOf(s.clock);
  const winter = doy > 310 || doy < 50;
  const friends = s.neighbors.filter(nb => nb.status === 'home' && nb.disposition > 20).length;
  // isolation: months cut off, fewer friendly neighbors, a household of one or two
  const isolation = after && sinceHit > 60 ? 15 + Math.max(0, 20 - 5 * friends) + (living.length <= 2 ? 15 : 0) : 0;
  const sick = living.filter(p => { const n = needsOf(s, p.id)!; return n.health < 50 || n.hurt.some(h => h.sev >= 40); }).length;
  for (const p of living) {
    const ps = psyOf(s, p.id), n = needsOf(s, p.id)!;
    const rec = recovery(s, p);
    const faith = faithOf(s, p);
    // strain: what the days put on them; it sets in fast and eases more slowly, faster with support
    let target = (n.hunger > 15000 ? 40 : n.hunger > 5000 ? 20 : 0) + (n.health < 40 ? 15 : 0) + Math.max(0, sick - (n.health < 50 ? 1 : 0)) * 8;
    if (s.personState.find(x => x.id === p.id)?.task === 'shelter') target += 20;
    if (insomnia(ps)) target += 10;
    target += Math.min(25, griefTotal(ps) * 0.3) + ps.trauma * 0.2;
    if (p.kid) {
      // kids pick up the adults' strain
      const grown = living.filter(q => !q.kid && closeness(p, q) >= 0.7);
      if (grown.length) target += 0.6 * grown.reduce((a, q) => a + psyOf(s, q.id).stress, 0) / grown.length;
    }
    target = Math.min(100, target);
    ps.stress = clamp(ps.stress + (target - ps.stress) * (target > ps.stress ? 0.15 : Math.min(0.5, 0.08 * rec)));
    // trauma fades with safety and support, not while the fights keep coming
    const fresh = ps.since != null && day - ps.since < 10;
    ps.trauma = clamp(ps.trauma - (fresh ? 0.05 : 0.15) * rec * (p.kid ? 1.2 : 1));
    // grief: slow; a burial helps a little, a memorial doubles it; a child still missing barely eases
    for (const g of ps.grief) {
      const rate = g.kind === 'taken' ? 0.3 : (g.mourned ? 2 : g.buried ? 1.3 : 1) * (faith ? 1.2 : 1);
      g.sev = Math.max(0, g.sev - 0.25 * rec * rate);
    }
    ps.grief = ps.grief.filter(g => g.sev > 0.5);
    // low mood: isolation, short days, grief, strain, pain; lifted by the same things that help everything (slow: weeks)
    const gT = griefTotal(ps);
    const lowTarget = (5 + isolation + (winter && after ? 10 : 0) + Math.min(30, gT * 0.4) + Math.max(0, ps.stress - 50) * 0.5 + (n.hurt.some(h => h.sev >= 30) ? 10 : 0)) / (0.7 + 0.3 * rec);
    ps.low = clamp(ps.low + (lowTarget - ps.low) * 0.02);
    // a breakdown: it had been building
    if (ps.breakdown != null && ps.breakdown <= day) delete ps.breakdown;
    if (ps.breakdown == null && ps.stress > 85 && (ps.trauma > 50 || gT > 60 || ps.low > 60) && r() < 0.04) {
      ps.breakdown = day + 3 + Math.floor(r() * 4);
      ps.stress = clamp(ps.stress - 30);
      const q = living.filter(x => x !== p && !x.kid).sort((a, b) => closeness(p, b) - closeness(p, a))[0];
      out.push(p.kid ? `${p.first} fell apart crying at supper and couldn't stop. ${q ? `${q.first} held on until it passed.` : ''}`.trim()
        : `${p.first} couldn't face the day and stayed in bed.${q ? ` ${q.first} brought up some tea and sat a while.` : ''} It had been building for weeks.`);
      ps.said = day;
    }
  }
  // conflict: two adults both near the end of their rope
  if (M.rift && day >= M.rift.until) {
    const a = person(s, M.rift.a), b = person(s, M.rift.b);
    if (a && b && here(s, a) && here(s, b)) out.push(`${a.first} and ${b.first} made it up, out by the woodpile.`);
    M.rift = null;
  }
  if (!M.rift) {
    const strained = living.filter(p => !p.kid && psyOf(s, p.id).stress > 55);
    if (strained.length >= 2 && r() < 0.03 * (1 + (needsOf(s, strained[0].id)!.hunger > 5000 ? 1 : 0))) {
      const [a, b] = [strained[0], strained[1 + Math.floor(r() * (strained.length - 1))]];
      const over = pickL(r, ['the rationing', 'who stands the night watch', 'the kids', 'whether to take in strangers', 'the last of the fuel', 'something small that wasn\'t about anything']);
      M.rift = { a: a.id, b: b.id, day, until: day + 4 + Math.floor(r() * 7), over };
      out.push(`${a.first} and ${b.first} had words over ${over}. Nobody said much at supper.`);
    }
  }
  // a line about how someone is: one a day at most, each person not more than once a week
  const candidates = living.filter(p => (psyOf(s, p.id).said ?? -99) < day - 6);
  for (const p of candidates.sort(() => r() - 0.5)) {
    const ps = psyOf(s, p.id), g = [...ps.grief].sort((a, b) => b.sev - a.sev)[0];
    let line: string | null = null;
    if (g && g.sev > 25 && r() < 0.5) line = pickL(r, g.kind === 'taken' ? LINES.griefTaken(p.first, g.name) : p.kid && p.age < 12 ? LINES.griefKid(p.first, g.name) : LINES.griefDeath(p.first, g.name));
    else if (p.kid && (ps.trauma > 25 || ps.stress > 55) && r() < 0.5) line = pickL(r, LINES.kidFear(p.first, p.age));
    else if (ps.what === 'killed' && ps.trauma > 30 && r() < 0.35) line = pickL(r, LINES.killed(p.first));
    else if (hypervigilant(ps) && r() < 0.4) line = pickL(r, LINES.vigil(p.first));
    else if (nightmares(ps) && r() < 0.35) line = pickL(r, insomnia(ps) && r() < 0.5 ? LINES.sleep(p.first) : LINES.nightmare(p.first));
    else if (ps.low >= 45 && r() < 0.35) line = pickL(r, LINES.low(p.first));
    else if (ps.stress >= 65 && r() < 0.25) line = pickL(r, LINES.stressed(p.first));
    else if ((ps.better ?? -999) < day - 45 && ps.trauma < 18 && ps.since != null && day - ps.since > 30 && r() < 0.2) { line = pickL(r, LINES.better(p.first)); ps.better = day; }
    if (line) { out.push(line); ps.said = day; break; }
  }
  // the talking that helps: now and then, two people sit up late over it
  const hurting = living.filter(p => !p.kid && (griefTotal(psyOf(s, p.id)) > 30 || psyOf(s, p.id).trauma > 30));
  if (hurting.length && r() < 0.08) {
    const a = hurting[Math.floor(r() * hurting.length)];
    const b = living.filter(q => q !== a && !q.kid).sort((x, y) => closeness(a, y) - closeness(a, x))[0];
    if (b) {
      const pa = psyOf(s, a.id), g = [...pa.grief].sort((x, y) => y.sev - x.sev)[0];
      pa.stress = clamp(pa.stress - 6); pa.trauma = clamp(pa.trauma - 2); if (g) g.sev = Math.max(0, g.sev - (g.kind === 'taken' ? 1 : 3));
      const pb = psyOf(s, b.id); pb.stress = clamp(pb.stress - 2);
      if (out.length < 2) out.push(g && g.sev > 15 ? `${a.first} and ${b.first} sat up late by the stove, talking about ${g.name}.` : `${b.first} sat with ${a.first} after supper. Mostly listened.`);
    }
  }
  // the dead get buried within a few days, whatever else is going on
  for (const id of M.seenDead) {
    const p = person(s, id);
    if (!p || M.gatherings.some(g => (g.kind === 'funeral' || g.kind === 'memorial') && g.for === id)) continue;
    const died = needsOf(s, id)?.died ?? day;
    if (needsOf(s, id)?.taken || day - died < 1 || day - died > 30) continue;
    out.push(gathering(s, 'funeral', { for: id }));
  }
  return out;
}
