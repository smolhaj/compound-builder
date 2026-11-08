/**
 * Mercy by the crew's temper, and what a hiding family can hope for (user decision 4). Pure and seeded; sim/breachFates.ts and sim/battle.ts roll it.
 *
 *   hostile    savage crews, gangs and hordes, and a hard crew of looters: they kill everyone they find and only sometimes keep a captive.
 *   merciful   refugees, desperate crews, and hard militia, patrols and requisition teams (they hold and take, they do not execute): they ALWAYS spare
 *              a child, usually spare an unarmed adult who complies, and NEVER spare a man who is still armed and in the fight.
 *
 * A hiding family is found or not by how long the crew has the house and how long the doors hold: barricaded rooms buy time (`doorSeconds`).
 * Once found, the family is judged the same way as anyone else: hostile crews kill (or take), merciful crews spare.
 *
 * The family answers a surrender, too: each defender decides for himself whether to hold fire (`snapOdds`), by grief, strain, who fell beside him
 * and his own calm. An angry or grieving one may shoot a man with his hands up.
 */
import type { CrewKind, Temper } from './surrender';
import type { GameState } from './state';
import { griefFor } from './mind';
import { backgroundOf } from './family';
import { houseBarrier, hasSafeRoom, hardenedSafeRoom } from './houseHardening';

export type Disposition = 'hostile' | 'merciful';

/** Who the crew is, by temper and kind. */
export function dispositionOf(temper: Temper, kind: CrewKind | undefined): Disposition {
  const k = kind ?? 'other';
  if (temper === 'savage' || k === 'horde' || k === 'gang') return 'hostile';
  if (k === 'refugees' || temper === 'desperate') return 'merciful';
  // hard: looters, tunnelers and the rest are hostile; the disciplined kinds hold and take
  return k === 'militia' || k === 'patrol' || k === 'requisition' ? 'merciful' : 'hostile';
}

/** A person the crew has found (on his feet in the yard, down, or dug out of a room). */
export interface Found {
  kid: boolean;
  age: number;
  /** Still holding a weapon and in the fight. */
  armed: boolean;
  /** Hurt and on the ground. */
  down: boolean;
  /** Hiding (found in a room) rather than standing in the yard. */
  hiding?: boolean;
  /** Will do as told: an unarmed adult usually does; one who fights back does not. */
  complies?: boolean;
}

export type MercyFate = 'spared' | 'killed' | 'wounded' | 'taken' | 'held';

/**
 * The merciful crew's verdict on one person. A child is always spared; an armed man is never spared (he is hurt, killed, or held once disarmed);
 * an unarmed adult who complies is spared nine times in ten, a disobedient one is hurt or held.
 */
export function mercifulVerdict(p: Found, r: () => number): MercyFate {
  if (p.kid) return 'spared';
  if (p.armed) { const u = r(); return u < 0.42 ? 'killed' : u < 0.8 ? 'wounded' : 'held'; }
  if (p.down) return r() < 0.9 ? 'spared' : 'wounded';
  if (p.complies !== false) return r() < 0.88 ? 'spared' : 'held';
  const u = r();
  return u < 0.15 ? 'killed' : u < 0.6 ? 'wounded' : 'held';
}

/** The hostile crew's verdict: kills nearly everyone it finds, and takes a captive now and then (`canTake`: it has room and a use for him). */
export function hostileVerdict(p: Found, canTake: boolean, r: () => number, savage = false): MercyFate {
  const worker = !p.kid && p.age >= 16 && p.age <= 55;
  const u = r();
  // a child: a savage crew takes them (or kills them); any other hostile crew does not carry children off (it kills now and then, mostly holds)
  if (p.kid) return savage ? (canTake && u < 0.55 ? 'taken' : u < 0.9 ? 'killed' : 'held') : u < 0.25 ? 'killed' : u < 0.75 ? 'held' : 'spared';
  if (p.hiding) return canTake && worker && u < 0.22 ? 'taken' : u < 0.22 + 0.62 ? 'killed' : u < 0.95 ? 'wounded' : 'held';
  if (p.down) return u < 0.65 ? 'killed' : canTake && worker && u < 0.8 ? 'taken' : 'wounded';
  return canTake && worker && u < 0.18 ? 'taken' : u < 0.18 + 0.58 ? 'killed' : u < 0.92 ? 'wounded' : 'held';
}

/** Seconds a room or house holds against a crew with the time to work at it. */
export function doorSeconds(s: GameState, o: { barricaded: boolean }): number {
  if (hardenedSafeRoom(s)) return 600;
  let sec = 6 + houseBarrier(s) * 1.1;                 // an interior door, then the steel and the bars
  if (hasSafeRoom(s)) sec += 90;
  if (o.barricaded) sec += 28;                          // furniture against the door, a bed on its end: it buys time
  return sec;
}

/** How a hiding person fares: not found (`hid`), or found and judged. `workSecs` is how long the crew has had the house. */
export function hidingFate(p: Found, crew: { disposition: Disposition; savage?: boolean }, ctx: { workSecs: number; doorSecs: number; canTake: boolean }, r: () => number): 'hid' | MercyFate {
  const hostile = crew.disposition === 'hostile';
  if (ctx.workSecs < ctx.doorSecs * (hostile ? 1 : 1.5)) return 'hid';              // the door held while they were there; a merciful crew does not stay to break it down
  if (r() > (hostile ? 0.82 : 0.55)) return 'hid';                                    // a room they did not search
  const f: Found = { ...p, hiding: true, armed: false, down: false, complies: true };
  return hostile ? hostileVerdict(f, ctx.canTake, r, !!crew.savage) : mercifulVerdict(f, r);
}

/** What weighs on one defender when a man he is aiming at has put his hands up. */
export interface Temperament {
  /** 0-30, `griefFor`: the people he has lost. */
  grief: number;
  /** 0-100. */
  stress: number;
  trauma: number;
  /** Someone of his own fell in this fight (killed or down beside him). */
  kinFell: boolean;
  /** Served: steadier. */
  vet: boolean;
  /** 0-10: the one who talks people down. */
  negotiator: number;
}

/** The chance a defender fires on a man who has surrendered. Calm, practiced people almost never; the angry and the bereaved sometimes. */
export function snapOdds(t: Temperament): number {
  const p = 0.015 + (t.kinFell ? 0.22 : 0) + t.grief / 30 * 0.14 + Math.max(0, t.stress - 50) / 50 * 0.1 + t.trauma / 100 * 0.06 - (t.vet ? 0.04 : 0) - t.negotiator * 0.008;
  return Math.max(0, Math.min(0.6, p));
}

/** The temperament of a person on the place (sim/mind.ts), for `snapOdds`. */
export function temperamentOf(s: GameState, pid: string, kinFell: boolean): Temperament {
  const p = s.people.find(q => q.id === pid);
  if (!p) return { grief: 0, stress: 0, trauma: 0, kinFell, vet: false, negotiator: 0 };
  const ps = s.mind?.psyche[pid] ?? { stress: 0, trauma: 0 };   // (read only: the battle plan never writes to the game it is played on)
  return { grief: griefFor(s, p), stress: ps.stress, trauma: ps.trauma, kinFell, vet: backgroundOf(p) !== null, negotiator: p.skills.negotiator ?? 0 };
}
