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
import { classSlots, COURSES, drillable, drillDay, drilledOf } from './courses';

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
  const base = wants.map(([duty, hours]) => {
    const cands = s.people.map((p, i) => ({ p, i, fit: fitness(s, i, duty) })).filter(x => x.fit > 0.05 && (!x.p.kid || x.p.age >= 12));
    cands.sort((a, b) => b.fit - a.fit);
    return { duty, hours, best: cands.slice(0, 2).map(c => ({ p: c.p, fit: c.fit, level: SKILL[duty] ? levelFor(s, c.p, SKILL[duty]!) : null, why: suitWhy(s, c.p, duty) })) };
  }).filter(a => a.best.length > 0);
  // classes and drills (sim/courses.ts) are not chores: the student and the teacher, and who is called to the range
  const extra: DutyAdvice[] = [];
  const slots = classSlots(s);
  if (slots.length) {
    const best: Suitor[] = [];
    for (const { e, teacher } of slots.slice(0, 2)) {
      const st = s.people.find(p => p.id === e.pid), def = COURSES[e.course];
      if (st) best.push({ p: st, fit: 1, level: levelFor(s, st, def.skill), why: `studying ${def.name.toLowerCase()}, ${Math.round(100 * e.done / def.hours)} % of the way` });
      const t = teacher ? s.people.find(p => p.id === teacher) : null;
      if (t) best.push({ p: t, fit: 1, level: levelFor(s, t, def.skill), why: `teaching ${st?.first ?? 'the course'}` });
    }
    extra.push({ duty: 'study', hours: 2 * slots.length, best: best.slice(0, 4) });
  }
  if (drillDay(s)) {
    const call = s.people.filter(p => drillable(s, p)).sort((a, b) => drilledOf(s, a.id) - drilledOf(s, b.id)).slice(0, 2);
    if (call.length) extra.push({ duty: 'drill', hours: call.length, best: call.map(p => ({ p, fit: 1, level: levelFor(s, p, 'shooting'), why: `shooting ${Math.floor(levelFor(s, p, 'shooting'))}, ${Math.round(100 * drilledOf(s, p.id))} % ready at the alarm` })) });
  }
  return [...base, ...extra];
}
