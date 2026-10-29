/**
 * Mental health (people depth; GDS "grief, depression and someone breaking
 * down"). Each person carries more than the day's morale. Pure; once a day
 * plus event hooks.
 *
 *  Strain      what the days weigh and what lifts it, as points you can read
 *              off the Family tab. The strain moves toward "weights / resilience
 *              minus helps": fast up, slowly down. Weights are hunger, pain,
 *              sickness in the house, poor sleep, overwork, danger (a fight,
 *              the warning signs, the first weeks after the hit, the shelter),
 *              isolation and grief. Helps are a real rest day, faith and
 *              community, a gathering, cards and music and books from the
 *              Shop, work that means something (their best skill; an elder
 *              passing a trade on), a dog, a close partner, a roof, someone
 *              who leads well. Kids soak up the grown-ups' strain and settle
 *              with school, bedtime and a parent near.
 *  Trauma      a raid, a wound, killing someone, an execution, captivity:
 *              nightmares (20+), poor sleep (35+), jumpiness (50+). Fades over
 *              months with safety and support; another fight sets it back.
 *              Killing carries more for a household that holds to its
 *              principles (the gate's humanity track); a hardened one feels it
 *              less and is harder on itself and on the kids.
 *  Low mood    isolation, winter, grief and strain that does not let up.
 *              Withdrawn at 40, depressed at 65.
 *  Breakdown   strain past ~85 on top of trauma, grief, low mood or burnout,
 *              for a few days, with real consequences by kind:
 *                irritable   words with someone close; both do less
 *                withdrawn   stays in; no work, no watch
 *                panic       freezes at the alarm, goes to the shelter in a raid
 *                burnout     quits the chores until rested
 *                reckless    takes risks: more falls and hunting accidents
 *              A break lets some of it go; recovery follows.
 *
 * Reads: grief.ts (the losses, shared with daily life), pets.ts (dogs),
 * gatherings (the last one held), housing (sleep), daily (the roster).
 * Writes: morale (needs.ts via `mindMorale`), the work rate (`Needs.coping`),
 * the fitness of a duty (`mindFit`), the fight (`fightNerves`).
 *
 * Anchors: most people exposed to trauma recover; about 1 in 5 develop lasting
 * symptoms. Acute grief typically eases over 6 to 12 months. Children's
 * distress tracks their caregivers'. Seasonal low mood is common.
 */
import { beltMorale } from './weekender';
import type { Battle } from './battleTypes';
import { backgroundOf, type Person } from './family';
import { mulberry32 } from './rng';
import { calendarOf, dayIndex, type GameState } from './state';
import { DUTY, dailyOf, workHours, type Duty } from './daily';
import { griefPoints, lossesOf } from './grief';
import { dogEffects } from './pets';
import { sleepEffects } from './housing';
import { bestLevel, levelFor, PRACTICED } from './skills';
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { tension } from './disaster';

export type TraumaKind = 'raid' | 'wounded' | 'killed' | 'execution' | 'captivity' | 'witness' | 'disaster';
export type BreakKind = 'irritable' | 'withdrawn' | 'panic' | 'burnout' | 'reckless';
export const BREAK_NAME: Record<BreakKind, string> = { irritable: 'short-tempered', withdrawn: 'withdrawn', panic: 'panicking', burnout: 'burned out', reckless: 'taking risks' };
export interface Break { kind: BreakKind; day: number; until: number }
export interface Psyche {
  /** 0–100: the strain of the days. */
  stress: number;
  trauma: number;
  /** Low mood. */
  low: number;
  /** Raiders they killed (moral weight). */
  kills: number;
  what?: TraumaKind;
  since?: number;
  broke?: Break;
  /** Day the last break ended (a cool-off before the next). */
  rested?: number;
  /** Day of the last line in the log about them. */
  said?: number;
  /** Today's reading: what weighs and what helps (points; the Family tab). */
  weighs?: Array<[string, number]>;
  helps?: Array<[string, number]>;
  /** Hardened by what was done at the gate: counted once. */
  better?: number;
}
export interface Rift { a: string; b: string; day: number; until: number; over: string }
export interface MindState {
  psyche: Record<string, Psyche>;
  day: number;
  rift: Rift | null;
  /** Day of the last fight at the place. */
  lastFight: number;
  /** The collapse has been felt (once). */
  hit?: boolean;
  /** The player's rest day: the day index it covers (the household takes it easy). */
  restDay?: number;
}
export const newMind = (): MindState => ({ psyche: {}, day: -1, rift: null, lastFight: -999 });
export function mindOf(s: GameState): MindState {
  s.mind ??= newMind();
  return s.mind;
}
export function psyOf(s: GameState, pid: string): Psyche {
  const M = mindOf(s);
  let ps = M.psyche[pid];
  if (!ps) {
    ps = { stress: 10, trauma: 0, low: 5, kills: 0 };
    // someone taken in after the collapse comes with what they have been through
    const p = s.people.find(x => x.id === pid);
    if (p && !p.kin && s.disaster.kind && s.clock.t >= s.disaster.hitAt) { ps.stress = 35; ps.trauma = 20; ps.low = 20; }
    M.psyche[pid] = ps;
  }
  return ps;
}

const hash = (t: string) => { let h = 2166136261; for (const c of t) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
const person = (s: GameState, pid: string) => s.people.find(p => p.id === pid);
const stateOf = (s: GameState, pid: string) => s.personState.find(x => x.id === pid);
const needsOf = (s: GameState, pid: string) => stateOf(s, pid)?.needs;
const here = (s: GameState, p: Person) => { const n = needsOf(s, p.id); return !!n && n.died == null && !n.taken && !n.left; };
const clamp = (v: number) => Math.max(0, Math.min(100, v));
const afterHit = (s: GameState) => !!s.disaster.kind && s.clock.t >= s.disaster.hitAt;

/** A faith they keep (about 45 % of adults; kids mostly follow a parent). Seeded by the person. */
export function faithOf(s: GameState, p: Person): boolean {
  if (p.kid && p.parents?.length) {
    const par = p.parents.map(id => person(s, id)).filter((x): x is Person => !!x);
    if (par.length) return par.some(q => faithOf(s, q)) ? hash(p.id + p.first) % 10 < 8 : hash(p.id + p.first) % 10 < 1;
  }
  return hash(p.first + p.last + p.id + 'faith') % 100 < 45;
}

/** How close two people are (0.3 someone taken in … 1 a partner, parent or child). */
export function closeness(a: Person, b: Person): number {
  if (a.partner === b.id || b.partner === a.id) return 1;
  if (a.parents?.includes(b.id) || b.parents?.includes(a.id)) return 1;
  if (a.parents && b.parents && a.parents.some(x => b.parents!.includes(x))) return 0.8;
  if (a.last === b.last && a.kin !== false && b.kin !== false) {
    if (a.kid && b.kid) return 0.8;
    if (a.kid !== b.kid && !a.elder && !b.elder) return 1;
    return 0.7;
  }
  if (a.kin && b.kin) return 0.6;
  return 0.3;
}

/** How well they bear it (0.7–1.4): temperament, a service background, faith, a household that has someone good at leading; the very young and the very old are more fragile. */
export function resilienceOf(s: GameState, p: Person): number {
  const trait = 0.9 + (hash(p.id + p.first + 'nerve') % 21) / 100;           // 0.90–1.10
  const age = p.kid ? (p.age < 6 ? 0.85 : p.age < 12 ? 0.92 : 1) : p.elder ? 0.95 : 1;
  const vet = backgroundOf(p) ? 1.15 : 1;
  const lead = 1 + Math.min(0.12, 0.02 * Math.max(0, bestLevel(s, 'leadership') - 2));
  return trait * age * vet * lead * (faithOf(s, p) ? 1.05 : 1);
}

/** How hard a blow lands: kids take fear in faster, those who served steadier, earlier trauma sensitizes. */
function susceptibility(s: GameState, p: Person): number {
  const ps = psyOf(s, p.id);
  const base = p.kid ? (p.age < 6 ? 1.1 : 1.35) : backgroundOf(p) ? 0.7 : p.elder ? 0.9 : 1;
  return base * (1 + ps.trauma / 200);
}

/** A traumatic event for one person (`amount` is about the trauma points for an average adult). */
export function shock(s: GameState, pid: string, kind: TraumaKind, amount: number): void {
  const p = person(s, pid);
  if (!p || !here(s, p)) return;
  const ps = psyOf(s, pid), k = susceptibility(s, p);
  ps.trauma = clamp(ps.trauma + amount * k);
  ps.stress = clamp(ps.stress + amount * 0.9 * k);
  ps.what = kind; ps.since = dayIndex(s.clock.t);
}

/** The gate's humanity track (0–100, 70 to start), or the default. */
const humanityOf = (s: GameState): number => s.gate?.humanity ?? 70;
/** How much killing weighs on this household: more where principles are held, less where they have hardened. */
export const killWeight = (s: GameState): number => 0.6 + humanityOf(s) / 100;
/** A household that has hardened (cruelty at the gate): numb, short-fused, hard on the kids. */
export const hardened = (s: GameState): boolean => humanityOf(s) < 30;

/**
 * After a fight (battle.ts applyBattle, a rescue raid's camp fight): everyone
 * who was there is shaken, the wounded more, those who killed someone carry
 * that, and seeing one of their own die is its own blow. The weight of a
 * killing scales with the household's humanity (a decent household, in a
 * fight they had to take, still feels it).
 */
export function afterFight(s: GameState, b: Battle): void {
  const M = mindOf(s);
  M.lastFight = dayIndex(s.clock.t);
  const pidOf = new Map(b.units.filter(u => u.personId).map(u => [u.id, u.personId!]));
  const endEv = b.events.find(e => e.kind === 'end');
  const lost = endEv && endEv.kind === 'end' && (endEv.result === 'breached' || endEv.result === 'overrun');
  const night = (b as { night?: boolean }).night;
  const homeDead = b.events.filter(e => e.kind === 'death' && pidOf.has(e.unit)).length;
  const executed = b.events.some(e => e.kind === 'death' && e.executed && pidOf.has(e.unit));
  const kills = new Map<string, number>();
  const lastHit = new Map<string, string>();
  for (const e of b.events) {
    if (e.kind === 'shot' && e.hit) lastHit.set(e.to, e.from);
    else if (e.kind === 'death' && !pidOf.has(e.unit)) { const by = lastHit.get(e.unit); if (by && pidOf.has(by)) kills.set(by, (kills.get(by) ?? 0) + 1); }
  }
  const w = killWeight(s);
  for (const [unit, pid] of pidOf) {
    const p = person(s, pid);
    if (!p || !here(s, p)) continue;
    let amt = 12 + (lost ? 12 : 0) + (night ? 4 : 0) + homeDead * 10 + (executed ? 15 : 0);
    let kind: TraumaKind = homeDead ? 'witness' : 'raid';
    const wounds = b.events.filter(e => e.kind === 'wound' && e.unit === unit && !e.stopped);
    if (wounds.length) { amt += 10 + Math.max(...wounds.map(x => (x.kind === 'wound' ? x.sev : 0))) / 4; kind = 'wounded'; }
    const k = kills.get(unit) ?? 0;
    if (k) {
      const ps = psyOf(s, pid);
      amt += ((ps.kills ? 6 : 14) + 3 * (k - 1)) * w;
      ps.kills = (ps.kills ?? 0) + k;
      kind = 'killed';
    }
    shock(s, pid, kind, amt);
  }
  // those in the house who did not fight (the kids in the shelter) heard it all
  const fought = new Set(pidOf.values());
  for (const p of s.people) if (here(s, p) && !fought.has(p.id)) shock(s, p.id, 'raid', p.kid ? 9 : 6);
}

/** An execution on the place (aftermath.ts "finish them"): the adults who did it or stood by, the kids who heard. */
export function afterExecution(s: GameState, n: number): void {
  for (const p of s.people) if (here(s, p)) shock(s, p.id, 'execution', ((p.kid ? 12 : 20) + 3 * Math.min(4, n - 1)) * (hardened(s) ? 0.6 : 1));
}
/** Left the wounded to die on the drive (aftermath.ts "leave them"): it stays with some people. */
export function afterLeaving(s: GameState): void {
  for (const p of s.people) if (here(s, p) && !p.kid) shock(s, p.id, 'witness', 5);
}
/** Treated the wounded raiders and let them go (aftermath.ts): the household is still who it was. */
export function afterMercy(s: GameState): void {
  for (const p of s.people) if (here(s, p) && !p.kid) { const ps = psyOf(s, p.id); ps.stress = clamp(ps.stress - 3); ps.trauma = clamp(ps.trauma - 3); }
}
/** The collapse itself: the day the lights go out (nuclear and the plague years hit hardest). */
export function afterDisaster(s: GameState): void {
  const k = s.disaster.kind;
  const amt = k === 'nuclear' ? 16 : k === 'zombies' || k === 'pandemic' ? 12 : k === 'solar_flare' || k === 'grid_down' ? 6 : 8;
  for (const p of s.people) if (here(s, p)) shock(s, p.id, 'disaster', amt);
}
/** Home from captivity (rescue.ts bringHome): the one who was held, after `days`; the others' wait ends in relief. */
export function homeFromCaptivity(s: GameState, pid: string, days: number): void {
  const p = person(s, pid);
  const ps = psyOf(s, pid);
  ps.trauma = clamp(ps.trauma + Math.min(65, 25 + days) * (p?.kid ? 1.1 : 1));
  ps.stress = clamp(Math.max(ps.stress, 60));
  ps.what = 'captivity'; ps.since = dayIndex(s.clock.t);
  for (const q of s.people) if (q.id !== pid && here(s, q)) { const qs = psyOf(s, q.id); qs.stress = clamp(qs.stress - 20); qs.low = clamp(qs.low - 10); }
}

// ── what it does ──

/** Trauma symptoms by level. */
export const nightmares = (ps: Psyche) => ps.trauma >= 20;
export const insomnia = (ps: Psyche) => ps.trauma >= 35 || ps.stress >= 75;
export const hypervigilant = (ps: Psyche) => ps.trauma >= 50;
const breaking = (s: GameState, ps: Psyche): Break | null => (ps.broke && ps.broke.until > dayIndex(s.clock.t) ? ps.broke : null);
/** The breakdown a person is in now, or null. */
export const breakOf = (s: GameState, pid: string): Break | null => { const ps = s.mind?.psyche[pid]; return ps ? breaking(s, ps) : null; };

/** Morale points off the target (zero or negative); nothing until the strain is real, so ordinary days read as before. */
export function mindMorale(s: GameState, pid: string): number {
  const ps = s.mind?.psyche[pid];
  if (!ps) return 0;
  const R = s.mind!.rift, rift = R && (R.a === pid || R.b === pid) ? 5 : 0;
  const b = breaking(s, ps) ? 6 : 0;
  const m = Math.max(0, ps.stress - 25) * 0.14 + Math.max(0, ps.low - 15) * 0.15 + Math.max(0, ps.trauma - 10) * 0.06 + rift + b;
  return m > 0 ? -Math.min(35, m) : 0;
}
/** The work rate from the state of mind (1 = as they would be): written to `Needs.coping` each day and read by `workFactor`. */
export function mindWork(s: GameState, pid: string): number {
  const ps = s.mind?.psyche[pid];
  if (!ps) return 1;
  const b = breaking(s, ps);
  if (b) return b.kind === 'withdrawn' ? 0.2 : b.kind === 'burnout' ? 0.25 : b.kind === 'panic' ? 0.5 : b.kind === 'irritable' ? 0.8 : 0.9;
  let f = ps.low >= 65 ? 0.8 : ps.low >= 40 ? 0.92 : 1;
  if (insomnia(ps)) f *= 0.93;
  if (ps.stress >= 70) f *= 0.92;
  const R = s.mind!.rift;
  if (R && (R.a === pid || R.b === pid)) f *= 0.93;
  return Math.max(0.2, f);
}
/**
 * In the next fight (battle.ts): extra seconds frozen at the alarm, and
 * whether they can hold a post at all. Those who served are steadier, not immune.
 */
export function fightNerves(s: GameState, p: Person): { freeze: number; shelter: boolean } {
  const ps = s.mind?.psyche[p.id];
  if (!ps) return { freeze: 0, shelter: false };
  const vet = backgroundOf(p) !== null;
  const freeze = (ps.trauma / 100) * (vet ? 1.5 : 4) + Math.max(0, ps.stress - 40) / 60 * (vet ? 0.4 : 1.2);
  return { freeze, shelter: breaking(s, ps)?.kind === 'panic' };
}
/** The roster's view of a person: 1 = fine, 0 = should not be given this duty now. */
export function mindFit(s: GameState, pid: string, duty: Duty): number {
  const ps = s.mind?.psyche[pid];
  if (!ps) return 1;
  const b = breaking(s, ps);
  if (!b) return duty === 'watch' && hypervigilant(ps) && ps.stress > 70 ? 0.6 : 1;
  if (duty === 'sleep' || duty === 'meal' || duty === 'leisure') return 1;
  if (b.kind === 'withdrawn' || b.kind === 'burnout') return 0;
  if (b.kind === 'panic') return duty === 'watch' || duty === 'hunt' ? 0 : 0.6;
  if (b.kind === 'reckless') return duty === 'watch' ? 1.2 : 1;
  return 0.9;
}
/** A person on a break who stays in: what they do with the hours instead of work (the chores that cannot wait still get done by others). */
export function mindStaysIn(s: GameState, pid: string): boolean {
  const b = breakOf(s, pid);
  return !!b && (b.kind === 'withdrawn' || b.kind === 'burnout');
}
/** A rest day in force (the player's): the household does only what cannot wait. */
export const resting = (s: GameState): boolean => s.mind?.restDay === dayIndex(s.clock.t);
/** The player takes a rest day: from now until midnight only the animals, the kitchen, the dogs, the watch and the sick are tended. Costs a day of the backlog. */
export function takeRestDay(s: GameState): string | null {
  const M = mindOf(s), day = dayIndex(s.clock.t);
  if (M.restDay === day) return 'The household is already taking it easy today.';
  M.restDay = day;
  return null;
}
/** The duties that do not wait for a rest day. */
export const ESSENTIAL: ReadonlySet<Duty> = new Set<Duty>(['sleep', 'meal', 'leisure', 'school', 'livestock', 'kitchen', 'pets', 'watch', 'medic']);

/** A word for the Family tab: how they are. */
export function moodText(s: GameState, p: Person): string {
  const ps = s.mind?.psyche[p.id];
  if (!ps) return '';
  const out: string[] = [];
  const b = breaking(s, ps);
  if (b) out.push(BREAK_NAME[b.kind]);
  const g = griefFor(s, p);
  if (g >= 12) out.push('grieving');
  if (hypervigilant(ps)) out.push(p.kid ? 'frightened, jumpy' : b?.kind === 'panic' ? 'jumpy' : 'on edge');
  else if (insomnia(ps)) out.push('not sleeping');
  else if (nightmares(ps)) out.push('bad dreams');
  if (ps.low >= 65) out.push('depressed'); else if (ps.low >= 40 && b?.kind !== 'withdrawn') out.push('low, quiet');
  if (!b) { if (ps.stress >= 70) out.push('badly strained'); else if (ps.stress >= 50) out.push('strained'); }
  const R = s.mind?.rift;
  if (R && (R.a === p.id || R.b === p.id)) out.push(`not speaking to ${person(s, R.a === p.id ? R.b : R.a)?.first ?? 'someone'}`);
  return out.join(', ');
}

/** Grief points for one person: each loss in the household (grief.ts) weighted by how close they were. */
export function griefFor(s: GameState, p: Person): number {
  let sum = 0;
  for (const l of lossesOf(s)) {
    if (l.id === p.id) continue;
    const lost = person(s, l.id);
    if (!lost) continue;
    const n = needsOf(s, l.id);
    if (n?.left) continue;
    sum += griefPoints(l.mourned, s.clock.t - l.at) * closeness(p, lost);
  }
  // a child taken is a loss nobody has closed
  for (const q of s.people) { const n = needsOf(s, q.id); if (n?.taken && n.died != null && !lossesOf(s).some(l => l.id === q.id)) sum += 14 * closeness(p, q); }
  return Math.min(30, sum);
}

// ── the day's reading ──

export interface Reading { weighs: Array<[string, number]>; helps: Array<[string, number]>; target: number }

/** What weighs on a person today and what lifts it, and where the strain is heading. */
export function reading(s: GameState, p: Person, sleeping: ReturnType<typeof sleepEffects> = sleepEffects(s)): Reading {
  const M = mindOf(s), day = dayIndex(s.clock.t), ps = psyOf(s, p.id);
  const n = needsOf(s, p.id)!, st = stateOf(s, p.id)!;
  const living = s.people.filter(q => here(s, q));
  const row = dailyOf(s).plan.hours[p.id] ?? [];
  const weighs: Array<[string, number]> = [], helps: Array<[string, number]> = [];
  const w = (label: string, v: number) => { if (v > 0.4) weighs.push([label, Math.round(v * 10) / 10]); };
  const h = (label: string, v: number) => { if (v > 0.4) helps.push([label, Math.round(v * 10) / 10]); };
  const after = afterHit(s), sinceHit = after ? s.clock.t - s.disaster.hitAt : 0;
  w('hunger', n.hunger > 15000 ? 35 : n.hunger > 5000 ? 18 : n.hunger > 1500 ? 7 : 0);
  const worst = n.hurt.reduce((a, x) => Math.max(a, x.sev), 0);
  w('pain and illness', worst >= 40 ? 12 : worst >= 20 ? 6 : 0);
  const others = living.filter(q => q !== p && (needsOf(s, q.id)!.health < 50 || needsOf(s, q.id)!.hurt.some(x => x.sev >= 40))).length;
  w('someone in the house is sick', Math.min(10, 3 * others));
  const fat = st.fatigue ?? 0;
  w('not sleeping enough', (fat > 80 ? 14 : fat > 60 ? 7 : 0) + Math.min(8, (n.tired ?? 0) * 1.5));
  const wh = row.length ? workHours(row) : 0;
  w('overwork', p.kid ? 0 : wh >= 12 ? 12 : wh >= 10 ? 6 : 0);
  w('tight months in town', beltMorale(s, p.id) > 0 ? 1.5 : 0);
  const sinceFight = day - M.lastFight;
  w('the last fight', sinceFight < 14 ? 16 * (1 - sinceFight / 14) : 0);
  const threat = dailyOf(s).plan.threat;
  w('living under threat', threat >= 2 ? 6 : threat >= 1 && after ? 2 : 0);
  if (s.disaster.kind && !after && s.clock.t >= s.disaster.warnAt) w('the news', Math.min(8, tension(s.disaster, s.clock.t) * 8));
  w('the first weeks after it all went', after && sinceHit < 40 ? 10 * (1 - sinceHit / 40) : 0);
  const friends = s.neighbors.filter(x => x.status === 'home' && x.disposition > 20).length;
  w('isolation', after && sinceHit > 60 ? 8 + (friends === 0 ? 6 : 0) + (living.length <= 2 ? 8 : 0) : 0);
  const gr = griefFor(s, p);
  w('grief', Math.min(24, gr * 0.9));
  const sl = sleeping.get(s.people.indexOf(p));
  w('a bad place to sleep', sl ? Math.min(8, Math.max(0, -sl.morale) * 0.8 + sl.harm * 2) : 0);
  if (p.kid) {
    const grown = living.filter(q => !q.kid && closeness(p, q) >= 0.7);
    if (grown.length) w('picking up the grown-ups\' strain', 0.35 * Math.max(0, grown.reduce((a, q) => a + psyOf(s, q.id).stress, 0) / grown.length - 15));
    const sch = row.filter(d => d === 'school').length;
    if (p.age >= 6 && p.age < 15 && !sch && after && s.disaster.tracks.stores < 0.5) w('no school, no routine', 3);
    if (hardened(s)) w('the way things are done now', 4);
  }
  if (p.elder && !row.some(d => d === 'mentor' || d === 'teach') && wh < 2 && after) w('feeling no use to anyone', 3);
  // helps
  const leisure = row.filter(d => d === 'leisure').length + (resting(s) ? 3 : 0);
  h('a real rest', leisure >= 6 ? 6 : leisure >= 3 ? 3 : 0);
  const faith = faithOf(s, p);
  h('faith', faith ? 3 : 0);
  const soc = dailyOf(s).social, lastGather = Math.max(0, ...Object.values(soc.last).map(x => x ?? 0));
  h('a gathering lately', lastGather > 0 && s.clock.t - lastGather < 8 ? 4 : 0);
  h('friends nearby', friends >= 2 ? 2 : 0);
  const free = leisure >= 2;
  const heads = Math.max(1, living.length);
  const games = (s.stock.games ?? 0) >= Math.ceil(heads / 4), music = (s.stock.instrument ?? 0) >= 1, books = (s.stock.novels ?? 0) >= 1;
  h('cards and games', free && games ? (p.kid ? 4 : 3) : 0);
  h('music', free && music ? 2 : 0);
  h('something to read', free && books && !(p.kid && p.age < 7) ? (p.kid ? 1 : 2) : 0);
  // meaning: work in what they are best at; an elder passing a trade on
  const top = PRACTICED.filter(k => k !== 'shooting').map(k => [k, levelFor(s, p, k)] as const).sort((a, b) => b[1] - a[1])[0];
  const meaningful = top && top[1] >= 4 && row.some(d => d !== 'sleep' && d !== 'meal' && d !== 'leisure' && DUTY[d].work);
  h('work that means something', !p.kid && meaningful ? 3 : 0);
  h('passing a trade on', row.filter(d => d === 'mentor').length >= 2 ? 5 : 0);
  if (p.kid) h('school, bedtime and a parent near', (row.filter(d => d === 'school' || d === 'mentor').length >= 2 ? 3 : 0) + (row.filter(d => d === 'sleep').length >= 9 ? 2 : 0) + (living.some(q => !q.kid && closeness(p, q) >= 1) ? 2 : 0));
  h('a dog', dogEffects(s, p.id).morale > 0 ? (p.kid ? 3 : 2) : 0);
  const mate = p.partner ? person(s, p.partner) : undefined;
  h('someone close', mate && here(s, mate) ? 2 : living.some(q => q !== p && closeness(p, q) >= 0.8) ? 1.5 : 0);
  h('a roof of their own', s.structures.some(x => isFinished(x) && isHome(x.kind)) ? 2 : 0);
  const lead = bestLevel(s, 'leadership');
  h('someone steady in charge', lead >= 4 ? Math.min(4, lead - 2) : 0);
  const res = resilienceOf(s, p);
  const wsum = weighs.reduce((a, x) => a + x[1], 0), hsum = helps.reduce((a, x) => a + x[1], 0);
  void ps;
  const target = Math.max(0, wsum / res - hsum);
  weighs.sort((a, b) => b[1] - a[1]); helps.sort((a, b) => b[1] - a[1]);
  return { weighs, helps, target: Math.min(100, target) };
}

const LINES = {
  griefDeath: (p: string) => [`${p} set out a mug at breakfast for someone who is not coming, then put it back.`, `${p} walked up the hill after supper and stayed until dark.`, `${p} said a name at the table and everyone went quiet.`],
  griefKid: (p: string) => [`${p} asked when they are coming back.`, `${p} drew a picture and pinned it by the bed.`],
  nightmare: (p: string) => [`${p} woke the house in the night.`, `${p} was up at three checking the locks again.`],
  vigil: (p: string) => [`${p} won't sit with their back to the door since the fight.`, `A branch cracked in the woods and ${p} was on the floor before anyone else moved.`],
  killed: (p: string) => [`${p} keeps going back over the night of the fight. "He was somebody's son."`, `${p} doesn't talk about the drive. Works until dark instead.`],
  sleep: (p: string) => [`${p} hasn't slept a full night in a week.`, `${p} is grey with tiredness.`],
  kidFear: (p: string, age: number) => age < 9 ? [`${p} won't sleep without the lamp on.`, `${p} asks every night if the bad men are coming back.`] : [`${p} has stopped talking much and spends hours with the animals.`, `${p} jumps at every sound on the road.`],
  low: (p: string) => [`${p} sat on the porch most of the afternoon. Says it's nothing.`, `${p} skipped supper again.`, `${p} has gone quiet. Does the work, says little.`],
  stressed: (p: string) => [`${p} is short with everyone today.`, `${p} lay awake doing the sums on the food again.`],
  better: (p: string) => [`${p} laughed at supper for the first time in a long while.`, `${p} slept through the night.`, `${p} was singing in the garden this morning.`],
};
const pickL = (r: () => number, xs: string[]) => xs[Math.floor(r() * xs.length)];

/** The breakdown, in a line. */
function breakLine(p: Person, kind: BreakKind, close: Person | undefined): string {
  const q = close ? close.first : null;
  switch (kind) {
    case 'irritable': return `${p.first} snapped at everyone over nothing and slammed out of the kitchen.${q ? ` ${q} let it go.` : ''}`;
    case 'withdrawn': return p.kid ? `${p.first} went quiet and wouldn't come out of the room.` : `${p.first} couldn't face the day and stayed in.${q ? ` ${q} brought up some tea and sat a while.` : ''} It had been building for weeks.`;
    case 'panic': return `${p.first} had a bad night: shaking, heart pounding, certain someone was at the door.${q ? ` ${q} sat with ${p.kid ? 'them' : 'them'} until it passed.` : ''}`;
    case 'burnout': return `${p.first} put down the tools and said they were done for a while. They have not stopped in weeks.`;
    case 'reckless': return `${p.first} has gone out on the roof in the wind and taken the long way home through the dark woods. Nobody can talk them out of it.`;
  }
}

/** Once a day (the midnight hook after eating): strain, trauma, low mood, grief, breakdowns, conflict, a line about someone. Returns log lines. */
export function mindDay(s: GameState): string[] {
  const M = mindOf(s), day = dayIndex(s.clock.t);
  if (M.day === day) return [];
  M.day = day;
  const out: string[] = [];
  const r = mulberry32(s.seed * 6007 + day * 41 + 19);
  const living = s.people.filter(p => here(s, p));
  const after = afterHit(s);
  const { doy } = calendarOf(s.clock);
  const winter = doy > 310 || doy < 50;
  // the day the lights go out
  if (after && !M.hit && s.clock.t - s.disaster.hitAt < 3) { M.hit = true; afterDisaster(s); }
  const sleeping = sleepEffects(s);
  for (const p of living) {
    const ps = psyOf(s, p.id), n = needsOf(s, p.id)!, res = resilienceOf(s, p);
    const rd = reading(s, p, sleeping);
    ps.weighs = rd.weighs; ps.helps = rd.helps;
    const help = rd.helps.reduce((a, x) => a + x[1], 0);
    // strain: it sets in fast and eases more slowly, faster with support
    ps.stress = clamp(ps.stress + (rd.target - ps.stress) * (rd.target > ps.stress ? 0.15 : Math.min(0.3, 0.05 + 0.01 * help)));
    // trauma fades with safety and support, not while the fights keep coming
    const fresh = ps.since != null && day - ps.since < 10;
    ps.trauma = clamp(ps.trauma - (fresh ? 0.05 : 0.14) * (1 + help / 10) * res * (p.kid ? 1.2 : 1));
    // low mood: slow (weeks); lifted by the same things that help everything
    const gr = griefFor(s, p);
    const sinceHit = after ? s.clock.t - s.disaster.hitAt : 0;
    const lowTarget = 4 + Math.max(0, ps.stress - 45) * 0.6 + Math.min(26, gr * 0.5) + (winter && after ? 6 : 0) + (after && sinceHit > 120 && living.length <= 2 ? 10 : 0) + (n.hurt.some(x => x.sev >= 30) ? 8 : 0) - help * 0.5;
    ps.low = clamp(ps.low + (Math.max(0, lowTarget) - ps.low) * 0.03);
    // a break ends: some of it is let go
    if (ps.broke && ps.broke.until <= day) {
      const kind = ps.broke.kind;
      ps.rested = day; ps.stress = clamp(ps.stress - 30); delete ps.broke;
      if (kind === 'burnout') ps.stress = clamp(ps.stress - 10);
      if (!p.kid && r() < 0.6) out.push(`${p.first} is up and about again, quieter than before but themselves.`);
    }
    // a breakdown: it had been building
    const cool = ps.rested != null && day - ps.rested < 40;
    const vulnerable = ps.stress > 85 || (ps.stress > 78 && (ps.trauma > 50 || ps.low > 60 || gr > 20));
    if (!ps.broke && !cool && vulnerable && r() < (backgroundOf(p) ? 0.03 : 0.06) * (hardened(s) ? 1.4 : 1)) {
      const fat = stateOf(s, p.id)?.fatigue ?? 0, row = dailyOf(s).plan.hours[p.id] ?? [];
      const overworked = fat > 70 || (row.length > 0 && workHours(row) >= 12);
      const kind: BreakKind = ps.trauma >= 55 && day - M.lastFight < 40 ? 'panic'
        : ps.kills > 0 && ps.trauma >= 40 && (hardened(s) || r() < 0.3) ? 'reckless'
        : overworked && !p.kid ? 'burnout'
        : ps.low >= 55 || gr >= 20 ? 'withdrawn'
        : 'irritable';
      const len = (p.kid ? 2 : 3) + Math.floor(r() * 4);
      ps.broke = { kind, day, until: day + len };
      ps.said = day;
      const close = living.filter(x => x !== p && !x.kid).sort((a, b) => closeness(p, b) - closeness(p, a))[0];
      out.push(breakLine(p, kind, close));
      if (kind === 'irritable' && close && !M.rift) M.rift = { a: p.id, b: close.id, day, until: day + len + 2, over: 'something small that was not about anything' };
    }
  }
  // consequences while a break lasts
  for (const p of living) {
    const ps = psyOf(s, p.id), b = breaking(s, ps);
    if (!b) continue;
    const n = needsOf(s, p.id)!;
    if (b.kind === 'reckless' && r() < 0.05 && n.hurt.length < 3 && !n.hurt.some(x => x.what === 'a fall taking a risk')) {
      n.hurt.push({ what: 'a fall taking a risk', sev: 14 + Math.floor(r() * 18) });
      out.push(`${p.first} took a fall doing something foolish and is limping.`);
    }
    if (b.kind === 'panic') n.tired = Math.min(8, (n.tired ?? 0) + 1);
  }
  // conflict: two adults both near the end of their rope
  if (M.rift && day >= M.rift.until) {
    const a = person(s, M.rift.a), b = person(s, M.rift.b);
    if (a && b && here(s, a) && here(s, b)) out.push(`${a.first} and ${b.first} made it up, out by the woodpile.`);
    M.rift = null;
  }
  if (!M.rift) {
    const strained = living.filter(p => !p.kid && psyOf(s, p.id).stress > 55);
    if (strained.length >= 2 && r() < 0.03 * (1 + (needsOf(s, strained[0].id)!.hunger > 5000 ? 1 : 0) + (hardened(s) ? 1 : 0))) {
      const a = strained[0], b = strained[1 + Math.floor(r() * (strained.length - 1))];
      const over = pickL(r, ['the rationing', 'who stands the night watch', 'the kids', 'whether to take in strangers', 'the last of the fuel', 'something small that was not about anything']);
      M.rift = { a: a.id, b: b.id, day, until: day + 4 + Math.floor(r() * 7), over };
      out.push(`${a.first} and ${b.first} had words over ${over}. Nobody said much at supper.`);
    }
  }
  // a line about how someone is: one a day at most, each person not more than once a week
  const candidates = living.filter(p => (psyOf(s, p.id).said ?? -99) < day - 6);
  for (const p of candidates.sort(() => r() - 0.5)) {
    const ps = psyOf(s, p.id), g = griefFor(s, p);
    let line: string | null = null;
    if (g > 14 && r() < 0.5) line = pickL(r, p.kid && p.age < 12 ? LINES.griefKid(p.first) : LINES.griefDeath(p.first));
    else if (p.kid && (ps.trauma > 25 || ps.stress > 55) && r() < 0.5) line = pickL(r, LINES.kidFear(p.first, p.age));
    else if (ps.what === 'killed' && ps.trauma > 30 && r() < 0.35) line = pickL(r, LINES.killed(p.first));
    else if (hypervigilant(ps) && r() < 0.4) line = pickL(r, LINES.vigil(p.first));
    else if (nightmares(ps) && r() < 0.35) line = pickL(r, insomnia(ps) && r() < 0.5 ? LINES.sleep(p.first) : LINES.nightmare(p.first));
    else if (ps.low >= 45 && r() < 0.35) line = pickL(r, LINES.low(p.first));
    else if (ps.stress >= 65 && r() < 0.25) line = pickL(r, LINES.stressed(p.first));
    else if ((ps.better ?? -999) < day - 45 && ps.trauma < 18 && ps.since != null && day - ps.since > 30 && r() < 0.2) { line = pickL(r, LINES.better(p.first)); ps.better = day; }
    if (line) { out.push(line); ps.said = day; break; }
  }
  // the work rate for tomorrow, written where workFactor reads it
  for (const p of living) { const n = needsOf(s, p.id)!; const f = mindWork(s, p.id); if (f < 0.999) n.coping = Math.round(f * 100) / 100; else delete n.coping; }
  return out;
}

/** A short summary of the household for the briefing: how many are struggling and who most. */
export interface MoodSummary { struggling: Array<{ p: Person; why: string; kind: 'break' | 'strain' | 'grief' | 'trauma' }>; breaking: number; calm: number }
export function moodSummary(s: GameState): MoodSummary {
  const day = dayIndex(s.clock.t);
  const rows: MoodSummary['struggling'] = [];
  let calm = 0;
  for (const p of s.people) {
    if (!here(s, p)) continue;
    const ps = s.mind?.psyche[p.id];
    if (!ps) { calm++; continue; }
    const b = breaking(s, ps);
    if (b) rows.push({ p, why: BREAK_NAME[b.kind], kind: 'break' });
    else if (ps.stress >= 60) rows.push({ p, why: 'badly strained', kind: 'strain' });
    else if (griefFor(s, p) >= 15) rows.push({ p, why: 'grieving', kind: 'grief' });
    else if (ps.trauma >= 40) rows.push({ p, why: 'still shaken', kind: 'trauma' });
    else calm++;
  }
  void day;
  return { struggling: rows.sort((a, b) => (a.kind === 'break' ? 0 : 1) - (b.kind === 'break' ? 0 : 1)), breaking: rows.filter(x => x.kind === 'break').length, calm };
}
