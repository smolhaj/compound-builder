/**
 * What a defender is made of: who they love, what they have been through, how steady they are (user answer: "defender panic, heroics and last words
 * must be tied to personality and history; expose the needed fields on units for the scene"). Pure. sim/battle.ts reads it for every person who
 * takes part in a fight and puts a compact `traits` block on their `BattleUnit`, so the scene can draw a frozen green hand or a veteran stepping in
 * front of a child from the same numbers the sim used.
 *
 *   courage   freezes  a green or traumatized person (no service, no fights, trauma or strain high): stands frozen when someone falls
 *             steady   most people
 *             heroic   a veteran, or someone who has been through it and kept their head: covers others, drags the wounded
 *   history   short tags the words are built from: veteran, first_fight, lost_before (named), survivor, born_here, guard, elder, shot_before
 *   kin       who they would die for (partner, children, parents, siblings), by name, with the unit id when that person is in the fight
 */
import type { GameState } from './state';
import type { Person } from './family';
import { backgroundOf } from './family';
import { griefFor } from './mind';
import { skillOf } from './armory';

export type Courage = 'freezes' | 'steady' | 'heroic';
export interface KinRef { id: string; name: string; rel: 'partner' | 'child' | 'parent' | 'sibling' | 'kin' | 'friend' | 'rival'; /** The unit id when that person is in this fight. */ unit?: string }
export interface DefenderTraits {
  trauma: number;
  stress: number;
  grief: number;
  /** 0-10: shooting skill and what the practice of a real fight adds. */
  experience: number;
  veteran: boolean;
  firstFight: boolean;
  courage: Courage;
  kin: KinRef[];
  history: string[];
}

/** The raids this place has been through (held or lost): what "green" means for a household. */
export const fightsBefore = (s: Pick<GameState, 'gate'>): number => (s.gate.raidsHeld ?? 0) + (s.gate.raidsLost ?? 0);

/** Read-only: nothing here writes to the game (the battle plan is played many times on the same state). */
export function traitsOf(s: GameState, p: Person, unitOf: (pid: string) => string | undefined = () => undefined): DefenderTraits {
  const ps = s.mind?.psyche[p.id], bg = backgroundOf(p);
  const trauma = ps?.trauma ?? 0, stress = ps?.stress ?? 0, kills = ps?.kills ?? 0;
  const veteran = bg !== null || !!p.guard;
  const fights = fightsBefore(s);
  const firstFight = fights === 0 && kills === 0 && !veteran;
  const experience = Math.max(0, Math.min(10, skillOf(s, p.id) + (veteran ? 2 : 0) + Math.min(2, kills) + Math.min(2, Math.floor(fights / 3))));
  const grief = s.losses ? griefFor(s, p) : 0;   // (griefFor makes the ledger when there is none: read it only when it exists)
  const kin: KinRef[] = [];
  const add = (q: Person | undefined, rel: KinRef['rel']) => { if (q && q.id !== p.id && !kin.some(k => k.id === q.id)) kin.push({ id: q.id, name: q.first, rel, unit: unitOf(q.id) }); };
  const find = (id?: string) => s.people.find(q => q.id === id);
  add(find(p.partner), 'partner');
  for (const q of s.people) if (q.parents?.includes(p.id)) add(q, 'child');
  for (const id of p.parents ?? []) add(find(id), 'parent');
  for (const q of s.people) if (q.id !== p.id && q.parents?.some(x => p.parents?.includes(x))) add(q, 'sibling');
  const history: string[] = [];
  if (bg) history.push(bg === 'military' ? 'veteran' : 'police');
  if (p.guard) history.push('guard');
  if (firstFight) history.push('first_fight');
  if (kills > 0) history.push('shot_before');
  if (p.bornHere) history.push('born_here');
  if (p.elder) history.push('elder');
  if ((s.losses ?? []).some(l => l.id !== p.id)) history.push('lost_before');
  if (trauma >= 40) history.push('shaken');
  if (s.disaster.kind && s.clock.t - s.disaster.hitAt > 200) history.push('survivor');
  // courage: strain and trauma against service and practice
  const nerve = experience * 5 + (veteran ? 18 : 0) + (kills ? 6 : 0) - trauma * 0.6 - Math.max(0, stress - 50) * 0.4 + (firstFight ? -12 : 0);
  const courage: Courage = nerve >= 52 ? 'heroic' : nerve < 14 || (trauma >= 55 && !veteran) ? 'freezes' : 'steady';
  return { trauma, stress, grief, experience, veteran, firstFight, courage, kin, history };
}

/** The chance a defender locks up when someone falls near them: the green and the shaken, and more so when it is their own. */
export function panicOdds(t: Pick<DefenderTraits, 'courage' | 'trauma' | 'firstFight' | 'veteran'>, ctx: { kinFell: boolean; allyFell: boolean }): number {
  if (!ctx.allyFell) return 0;
  const base = t.courage === 'freezes' ? 0.55 : t.courage === 'steady' ? 0.12 : 0.02;
  return Math.min(0.9, base + (ctx.kinFell ? 0.25 : 0) + (t.firstFight ? 0.1 : 0) + t.trauma / 100 * 0.15 - (t.veteran ? 0.05 : 0));
}

/** Seconds a locked-up defender does not shoot. */
export const freezeSecs = (t: Pick<DefenderTraits, 'trauma' | 'veteran'>, r: () => number): number => 3 + r() * 4 + t.trauma / 100 * 3 - (t.veteran ? 1.5 : 0);

/** Whether a defender steps in for someone hurt: a veteran or a steady head, and always for their own. */
export function heroOdds(t: Pick<DefenderTraits, 'courage' | 'veteran'>, kin: boolean): number {
  return (t.courage === 'heroic' ? 0.7 : t.courage === 'steady' ? 0.25 : 0.05) + (kin ? 0.25 : 0) + (t.veteran ? 0.1 : 0);
}

/** The last thing a person says: from who they love and what they have been through. `names` are first names; null: they cannot speak. */
export function lastWords(t: DefenderTraits, ctx: { first: string; lostName?: string }, r: () => number): string | null {
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const partner = t.kin.find(k => k.rel === 'partner'), child = t.kin.find(k => k.rel === 'child'), parent = t.kin.find(k => k.rel === 'parent'), sib = t.kin.find(k => k.rel === 'sibling');
  const pool: string[] = [];
  if (partner) pool.push(`Tell ${partner.name} — tell ${partner.name} I —`, `${partner.name}… I'm sorry. I'm so sorry.`, `Go to ${partner.name}. Don't — don't let ${partner.name} come out.`);
  if (child) pool.push(`Keep ${child.name} down in the cellar. Don't let ${child.name} see.`, `${child.name}… look after ${child.name}. Please.`);
  if (parent && !child) pool.push(`Tell ${parent.name} I tried. I tried.`);
  if (sib) pool.push(`${sib.name}, get down — get DOWN —`);
  if (t.veteran) pool.push('Hold the line. Don\'t stop shooting.', 'Cover the door. Go. GO.', 'Keep your sectors. I\'m fine. Keep your sectors.');
  if (t.history.includes('lost_before') && ctx.lostName) pool.push(`${ctx.lostName}… I'm coming.`, `Not like ${ctx.lostName}. Not this way.`);
  else if (t.history.includes('lost_before')) pool.push('Not again. Not again…');
  if (t.firstFight) pool.push('I didn\'t think it would — it\'s not like —', 'I\'m sorry, I can\'t — I can\'t feel my —');
  if (t.history.includes('born_here')) pool.push('This is my house. This is my house…');
  if (t.history.includes('elder')) pool.push('Well. I had a good long run.', 'Get the young ones out. Go on.');
  if (!pool.length) pool.push(`Tell them I… tell them —`, 'Oh. Oh no.', `Stay down. Stay down, all of you.`);
  void ctx.first;
  return pick(pool);
}
