/**
 * "Who should do what": for the duties the place needs hours of right now,
 * the people who suit each best (skill, health, age, tiredness, state of
 * mind: the same `fitness` the planner uses), with the reason in words.
 * Pure; the roster window draws it and a button can set a standing
 * assignment (`setFocus`).
 */
import { choreRates, dutyWants, DUTY, fitness, SKILL, type Duty } from './daily';
import { levelFor, rusting, SKILL_NAME } from './skills';
import { breakOf } from './mind';
import type { Person } from './family';
import type { GameState } from './state';

export interface Suitor { p: Person; fit: number; level: number | null; why: string }
export interface DutyAdvice { duty: Duty; hours: number; best: Suitor[] }

/** Why this person suits (or does not suit) a duty, in a few words. */
export function suitWhy(s: GameState, p: Person, duty: Duty): string {
  const k = SKILL[duty], bits: string[] = [];
  if (k) {
    const v = Math.floor(levelFor(s, p, k));
    bits.push(`${SKILL_NAME[k].toLowerCase()} ${v}${rusting(s, p.id, k) ? ' (rusty)' : ''}`);
  }
  if (p.elder) bits.push('elder');
  else if (p.kid) bits.push(`age ${p.age}`);
  const b = breakOf(s, p.id);
  if (b) bits.push('not coping');
  return bits.join(', ');
}

/** The duties that want hours today and the best two people for each (biggest need first). */
export function whoShouldDo(s: GameState, n = 6): DutyAdvice[] {
  const wants = dutyWants(s, choreRates(s)).filter(([d]) => DUTY[d].work).sort((a, b) => b[1] - a[1]).slice(0, n);
  return wants.map(([duty, hours]) => {
    const cands = s.people.map((p, i) => ({ p, i, fit: fitness(s, i, duty) })).filter(x => x.fit > 0.05 && (!x.p.kid || x.p.age >= 12));
    cands.sort((a, b) => b.fit - a.fit);
    return { duty, hours, best: cands.slice(0, 2).map(c => ({ p: c.p, fit: c.fit, level: SKILL[duty] ? levelFor(s, c.p, SKILL[duty]!) : null, why: suitWhy(s, c.p, duty) })) };
  }).filter(a => a.best.length > 0);
}
