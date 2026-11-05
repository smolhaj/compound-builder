/**
 * Household bonds: a light relationship layer on the people the game already has. Friends, rivals, mentors
 * (and the couples the family tree already knows) come out of three things the sim already tracks: the hours two
 * people spend on the same duty (the daily roster), the dangers they share (a fight, a carry to the sickbay, a
 * child waiting below while a defender is hit) and the quarrels the mind layer already stages (sim/mind.ts `Rift`).
 *
 * Small on purpose:
 *  - One pass a day at midnight (`bondsDay`), over the pairs who shared hours (grouped by hour and duty, groups
 *    capped), not every pair every tick; at most `BONDS.maxPairs` pairs are kept.
 *  - Every number is in `BONDS`. Deterministic: a pair's temperament match is a hash of the run's seed and the two ids.
 *  - Effects are small and never hurt the defense: a friend or a mentor lifts the strain a little (`bondHelp`, read by
 *    `reading()` in sim/mind.ts, so the fight nerves can only get steadier), the roster leans toward putting friends
 *    on the same chore and rivals on different ones (a few percent on a close call), and nothing in battle,
 *    posture or the gate reads a bond. Rivals cost nothing but the pairing: no stress, no morale.
 *  - Memorable moments (a friendship grown over a winter, a mentor taking a youth on, a defender hit while a child
 *    hid, a wounded one carried in under fire) go to the chronicle, at most `momentsPerYear` a year.
 *  - Optional state (`GameState.bonds`, made lazily): an old save simply has none and plays as before.
 */
import { chronicle } from './lineage';
import { log } from './economy';
import { calendarOf, dayIndex, type GameState } from './state';
import type { Battle } from './battleTypes';
import type { Duty } from './daily';
import type { Person } from './family';

export type BondTag = 'friend' | 'rival' | 'mentor' | 'couple';

/** All the tunable numbers. */
export const BONDS = {
  /** Warm points per shared hour at a perfect match (and strife per shared hour at a perfect clash). */
  perHour: 0.3, strifePerHour: 0.25,
  /** Strife builds at this fraction of the rate unless one of the two is strained. */
  strifeCalm: 0.3, strainAt: 45,
  /** The most a pair can gain in a day. */
  dayCap: 3,
  /** Shared hours in a day before it counts at all. */
  minShared: 2,
  /** What fades each day the pair did not share hours. */
  warmDecay: 0.12, strifeDecay: 0.4,
  /** Thresholds with a little hysteresis (a bond is made at `At` and lost below `Keep`). */
  friendAt: 45, friendKeep: 25, rivalAt: 40, rivalKeep: 15,
  /** Hours side by side at the mentoring duty before a mentor bond is made. */
  mentorHours: 10, mentorCap: 500,
  /** Shared danger, in warm points. */
  fightWarm: 5, carryWarm: 10, aidWarm: 8, savedWarm: 12,
  /** A quarrel (mind.ts Rift), in strife points. */
  riftStrife: 12,
  /** Strain points a friend or a mentor lifts (the couple's is already counted as "someone close"), and the most it can be. */
  helpEach: 0.5, helpCap: 1.5,
  /** Roster: the nudge on a candidate's score when a friend (or mentor) already has the duty (+) or a rival does (-). */
  pairNudge: 0.05,
  /** Bounds: people in one hour-and-duty group, pairs kept, chronicle lines a year, one fight's fighters considered. */
  groupCap: 12, maxPairs: 80, momentsPerYear: 6, fightersCap: 8,
} as const;

export interface Bond {
  /** 0 to 100: how well they get on, from time together and danger shared. */
  warm: number;
  /** 0 to 100: how they grate, from time together when they do not suit, and quarrels. */
  strife: number;
  /** Hours side by side at the mentoring duty. */
  mentor: number;
  /** The one who teaches, once a mentor bond is made. */
  guide?: string;
  /** What the pair is to each other now (a couple is read from the family tree and is not stored). */
  tag?: Exclude<BondTag, 'couple'>;
  /** The day the pair first shared hours. */
  since: number;
}
export interface Bonds {
  day: number;
  pairs: Record<string, Bond>;
  /** Chronicle lines written this year. */
  said: { year: number; n: number };
}
export const newBonds = (): Bonds => ({ day: -1, pairs: {}, said: { year: 0, n: 0 } });
/** The household's bonds (lazily made, so old saves and hand-built test states work). */
export const bondsOf = (s: GameState): Bonds => (s.bonds ??= newBonds());

const hash = (t: string) => { let h = 2166136261; for (const c of t) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number) => Math.max(0, Math.min(100, v));
const person = (s: GameState, id: string): Person | undefined => s.people.find(p => p.id === id);

/** How well two people suit, -1 to 1: fixed by the run's seed and the two ids, so a pair always has the same chemistry. */
export function compat(seed: number, a: string, b: string): number {
  return (hash(`${seed}:${pairKey(a, b)}:chem`) % 2001) / 1000 - 1;
}

/** Blood kin or a couple: the family tree already says what they are to each other. */
const blood = (a: Person, b: Person): boolean => a.partner === b.id || b.partner === a.id || !!a.parents?.includes(b.id) || !!b.parents?.includes(a.id) || !!(a.parents && b.parents && a.parents.some(x => b.parents!.includes(x)));

const here = (s: GameState, id: string): boolean => { const n = s.personState.find(x => x.id === id)?.needs; return !!n && n.died == null && !n.taken && !n.left; };

/** What two people are to each other: a couple (from the tree), else the stored tag, else nothing. */
export function bondTag(s: GameState, aId: string, bId: string): BondTag | null {
  const a = person(s, aId), b = person(s, bId);
  if (a && b && (a.partner === bId || b.partner === aId)) return 'couple';
  return s.bonds?.pairs[pairKey(aId, bId)]?.tag ?? null;
}

/** Strain points off for a person with friends or a mentor/pupil in the house (0 to `helpCap`; never negative). */
export function bondHelp(s: GameState, pid: string): number {
  const B = s.bonds;
  if (!B) return 0;
  let n = 0;
  for (const k in B.pairs) {
    const t = B.pairs[k].tag;
    if ((t === 'friend' || t === 'mentor') && (k.startsWith(pid + '|') || k.endsWith('|' + pid))) {
      const other = k.startsWith(pid + '|') ? k.slice(pid.length + 1) : k.slice(0, k.length - pid.length - 1);
      if (here(s, other)) n++;
    }
  }
  return Math.min(BONDS.helpCap, n * BONDS.helpEach);
}

/** The roster's lean: a small plus when a friend or mentor already holds the duty, a small minus for a rival (a state with no bonds is not nudged at all). */
export function pairNudge(s: GameState, pid: string, holders: Iterable<string>): number {
  const B = s.bonds;
  if (!B) return 0;
  let v = 0;
  for (const h of holders) {
    if (h === pid) continue;
    const t = B.pairs[pairKey(pid, h)]?.tag;
    if (t === 'friend' || t === 'mentor') v += BONDS.pairNudge;
    else if (t === 'rival') v -= BONDS.pairNudge;
  }
  return Math.max(-2 * BONDS.pairNudge, Math.min(2 * BONDS.pairNudge, v));
}

/** One memorable line, if the year's allowance is not spent. */
function moment(s: GameState, text: string, logIt = true): boolean {
  const B = bondsOf(s), year = calendarOf(s.clock).year;
  if (B.said.year !== year) B.said = { year, n: 0 };
  if (B.said.n >= BONDS.momentsPerYear) return false;
  B.said.n++;
  chronicle(s, 'bond', text);
  if (logIt) log(s, text);
  return true;
}

const get = (B: Bonds, a: string, b: string, day: number): Bond => (B.pairs[pairKey(a, b)] ??= { warm: 0, strife: 0, mentor: 0, since: day });

/** Add to a pair's warm side (a shared danger). */
function warm(s: GameState, a: string, b: string, v: number): void {
  const B = bondsOf(s), day = dayIndex(s.clock.t);
  const p = get(B, a, b, day);
  p.warm = r2(clamp(p.warm + v));
  retag(s, a, b, p, day);
}

function retag(s: GameState, a: string, b: string, bond: Bond, day: number): void {
  const A = person(s, a), Bp = person(s, b);
  if (!A || !Bp) return;
  const apart = blood(A, Bp);   // family is not "friends"
  const was = bond.tag;
  const next: Bond['tag'] | undefined =
    bond.mentor >= BONDS.mentorHours && bond.guide ? 'mentor'
    : !apart && (bond.strife >= BONDS.rivalAt || (was === 'rival' && bond.strife >= BONDS.rivalKeep)) ? 'rival'
    : !apart && (bond.warm >= BONDS.friendAt || (was === 'friend' && bond.warm >= BONDS.friendKeep)) ? 'friend'
    : undefined;
  if (next === was) return;
  if (next) bond.tag = next; else delete bond.tag;
  if (!next) return;
  const { doy } = calendarOf(s.clock), winter = doy > 310 || doy < 50;
  if (next === 'friend') moment(s, winter && day - bond.since >= 40 ? `${A.first} and ${Bp.first} have grown close over the long winter.` : `${A.first} and ${Bp.first} have become friends.`);
  else if (next === 'rival') moment(s, `${A.first} and ${Bp.first} have fallen out; they keep to opposite ends of the work now.`);
  else if (next === 'mentor') { const g = person(s, bond.guide!), pu = g === A ? Bp : A; if (g) moment(s, `${g.first} has taken ${pu.first} under their wing, showing them the trade.`); }
}

/** A quarrel staged by the mind layer (mind.ts): strife between the two. */
export function bondsRift(s: GameState, a: string, b: string): void {
  const B = bondsOf(s), day = dayIndex(s.clock.t);
  const p = get(B, a, b, day);
  p.strife = r2(clamp(p.strife + BONDS.riftStrife));
  retag(s, a, b, p, day);
}

/**
 * Once a day, at midnight (sim/people.ts): the hours each pair spent on the same duty today make them closer, or
 * grate, depending on how they suit; what was not shared fades. Returns lines for the log (written moments).
 */
export function bondsDay(s: GameState): string[] {
  const B = bondsOf(s), day = dayIndex(s.clock.t);
  if (B.day === day) return [];
  B.day = day;
  const before = s.log.length;
  const plan = s.daily?.plan;
  const living = s.people.filter(p => here(s, p.id));
  const livingIds = new Set(living.map(p => p.id));
  // the departed take their bonds with them (grief is the mind layer's)
  for (const k in B.pairs) { const [a, b] = k.split('|'); if (!livingIds.has(a) || !livingIds.has(b)) delete B.pairs[k]; }
  if (!plan || living.length < 2) return [];
  const rows = new Map<string, Duty[]>();
  for (const p of living) { const r = plan.hours[p.id]; if (r && r.length === 24) rows.set(p.id, r); }
  // shared hours per pair: group the people on each duty hour by duty (bounded groups), count co-presence
  const shared = new Map<string, { n: number; mentor: number }>();
  const ids = living.map(p => p.id).filter(id => rows.has(id));
  for (let h = 6; h < 22; h++) {
    const groups = new Map<Duty, string[]>();
    for (const id of ids) { const d = rows.get(id)![h]; if (d === 'sleep') continue; const g = groups.get(d); if (g) { if (g.length < BONDS.groupCap) g.push(id); } else groups.set(d, [id]); }
    for (const [d, g] of groups) {
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
        const k = pairKey(g[i], g[j]);
        const e = shared.get(k) ?? { n: 0, mentor: 0 };
        e.n++; if (d === 'mentor') e.mentor++;
        shared.set(k, e);
      }
    }
  }
  // the pairs that shared hours grow (or grate); every other stored pair fades
  for (const [k, e] of shared) {
    const [a, b] = k.split('|');
    const A = person(s, a)!, Bp = person(s, b)!;
    if (A.partner === b || Bp.partner === a) continue;   // a couple is read from the tree
    const bond = B.pairs[k];
    if (e.n < BONDS.minShared && !bond) continue;
    const pr = bond ?? get(B, a, b, day);
    if (e.n >= BONDS.minShared && !blood(A, Bp)) {
      const c = compat(s.seed, a, b);
      if (c >= 0) pr.warm = r2(clamp(pr.warm + Math.min(BONDS.dayCap, e.n * BONDS.perHour * c) * (1 - pr.warm / 100)));
      else {
        const strained = (s.mind?.psyche[a]?.stress ?? 0) >= BONDS.strainAt || (s.mind?.psyche[b]?.stress ?? 0) >= BONDS.strainAt;
        pr.strife = r2(clamp(pr.strife + Math.min(BONDS.dayCap, e.n * BONDS.strifePerHour * -c * (strained ? 1 : BONDS.strifeCalm)) * (1 - pr.strife / 100)));
      }
    }
    if (e.mentor > 0) {
      pr.mentor = Math.min(BONDS.mentorCap, r2(pr.mentor + e.mentor));
      if (!pr.guide) { const older = A.kid === Bp.kid ? (A.age >= Bp.age ? A : Bp) : A.kid ? Bp : A; pr.guide = older.id; }
    }
    retag(s, a, b, pr, day);
  }
  for (const k in B.pairs) {
    if (shared.has(k) && shared.get(k)!.n >= BONDS.minShared) continue;
    const pr = B.pairs[k];
    pr.warm = r2(Math.max(0, pr.warm - BONDS.warmDecay));
    pr.strife = r2(Math.max(0, pr.strife - BONDS.strifeDecay));
    const [a, b] = k.split('|');
    retag(s, a, b, pr, day);
  }
  // tidy: forget the faint, keep the strongest `maxPairs`
  for (const k in B.pairs) { const p = B.pairs[k]; if (!p.tag && p.warm < 1 && p.strife < 1 && p.mentor < 1) delete B.pairs[k]; }
  const keys = Object.keys(B.pairs);
  if (keys.length > BONDS.maxPairs) {
    const weight = (k: string) => { const p = B.pairs[k]; return (p.tag ? 1000 : 0) + p.warm + p.strife + p.mentor; };
    keys.sort((x, y) => weight(y) - weight(x) || (x < y ? -1 : 1));
    for (const k of keys.slice(BONDS.maxPairs)) delete B.pairs[k];
  }
  return s.log.slice(before).map(l => l.text);
}

/**
 * After a fight (sim/people.ts): those who held the line together are a little closer, a wounded defender carried
 * in or helped under fire is closer to whoever did it, and a defender hit while a child hid below is remembered.
 */
export function bondsAfterFight(s: GameState, b: Battle): void {
  const pidOf = new Map(b.units.filter(u => u.personId).map(u => [u.id, u.personId!]));
  const fighters = [...new Set(pidOf.values())].filter(id => here(s, id)).slice(0, BONDS.fightersCap);
  for (let i = 0; i < fighters.length; i++) for (let j = i + 1; j < fighters.length; j++) warm(s, fighters[i], fighters[j], BONDS.fightWarm);
  let said = 0;
  const name = (id: string) => person(s, id)?.first ?? 'Someone';
  const done = new Set<string>();
  for (const e of b.events) {
    if ((e.kind !== 'carry' && e.kind !== 'aid') || !e.by) continue;
    const hurt = pidOf.get(e.unit), by = pidOf.get(e.by);
    if (!hurt || !by || hurt === by || done.has(`${e.kind}:${hurt}`) || !here(s, hurt) || !here(s, by)) continue;
    done.add(`${e.kind}:${hurt}`);
    warm(s, hurt, by, e.kind === 'carry' ? BONDS.carryWarm : BONDS.aidWarm);
    if (said < 2 && moment(s, e.kind === 'carry' ? `${name(by)} carried ${name(hurt)} in to the sickbay under fire.` : `${name(by)} knelt in the open and held ${name(hurt)}'s wound shut until the shooting stopped.`)) said++;
  }
  // a defender hit while a child waited below: the child remembers who held the line
  const kids = s.people.filter(p => p.kid && here(s, p.id) && !fighters.includes(p.id)).sort((a, c) => a.age - c.age || (a.id < c.id ? -1 : 1));
  const hit = b.events.find(e => e.kind === 'wound' && !e.stopped && pidOf.has(e.unit) && here(s, pidOf.get(e.unit)!) && !person(s, pidOf.get(e.unit)!)?.kid);
  if (hit && hit.kind === 'wound' && kids.length) {
    const who = person(s, pidOf.get(hit.unit)!)!, kid = kids[0];
    warm(s, who.id, kid.id, BONDS.savedWarm);
    if (said < 2) moment(s, `${who.first}${who.guard ? ', the guard,' : ''} took a round holding the line while ${kid.first} waited below. ${kid.first} asked after ${who.first} every hour.`);
  }
}

/** Read-only, for the People panel: who is close to whom, strongest first. */
export interface CloseRow { a: Person; b: Person; tag: BondTag; /** mentor pairs: who teaches. */ guide?: Person }
export function closeRows(s: GameState): CloseRow[] {
  const out: CloseRow[] = [];
  const seen = new Set<string>();
  for (const p of s.people) {
    if (!p.partner || !here(s, p.id)) continue;
    const q = person(s, p.partner);
    const k = pairKey(p.id, p.partner);
    if (q && here(s, q.id) && !seen.has(k)) { seen.add(k); out.push({ a: p, b: q, tag: 'couple' }); }
  }
  const B = s.bonds;
  if (B) {
    const rows = Object.entries(B.pairs).filter(([k, v]) => v.tag && !seen.has(k)).sort((x, y) => (y[1].tag === 'rival' ? y[1].strife : y[1].warm + y[1].mentor) - (x[1].tag === 'rival' ? x[1].strife : x[1].warm + x[1].mentor) || (x[0] < y[0] ? -1 : 1));
    for (const [k, v] of rows) {
      const [ai, bi] = k.split('|'), a = person(s, ai), b = person(s, bi);
      if (a && b && here(s, ai) && here(s, bi)) out.push({ a, b, tag: v.tag!, guide: v.guide ? person(s, v.guide) : undefined });
    }
  }
  return out;
}
