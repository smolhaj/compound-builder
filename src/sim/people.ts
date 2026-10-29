/**
 * The people layer's entry points (mind.ts, skills.ts), so the engine and
 * the fight code each call one thing. Pure.
 *
 * Hooks for other systems:
 *  - `practice(s, pid, skill, hours)`       skills.ts: any task awards practice
 *  - `teach(s, teacher, learner, skill, h)` skills.ts: mentoring time
 *  - `shock(s, pid, kind, amount)`          mind.ts: any other traumatic event
 *  - `peopleAfterFight(s, battle)`          battle.ts: the mind's toll and the shooting practice a real fight is
 */
import type { Battle } from './battleTypes';
import { afterFight, mindDay } from './mind';
import { practice, skillsDay } from './skills';
import type { GameState } from './state';

export { practice, teach } from './skills';
export { shock } from './mind';

/** Once a day, at midnight after eating: the mind (strain, grief, breakdowns), then practice and rust. Returns log lines. */
export function peopleDay(s: GameState): string[] {
  return [...mindDay(s), ...skillsDay(s)];
}

/** After a fight (battle.ts, rescue.ts): the mind's toll, and shooting practice for those who fired. */
export function peopleAfterFight(s: GameState, b: Battle): void {
  afterFight(s, b);
  const pidOf = new Map(b.units.filter(u => u.personId).map(u => [u.id, u.personId!]));
  const shots = new Map<string, number>();
  for (const e of b.events) if (e.kind === 'shot' && pidOf.has(e.from)) shots.set(pidOf.get(e.from)!, (shots.get(pidOf.get(e.from)!) ?? 0) + 1);
  for (const [pid, n] of shots) practice(s, pid, 'shooting', Math.min(8, 1.5 + n * 0.2));
  // someone had to steady the others
  const lead = [...pidOf.values()].map(id => s.people.find(p => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p && !p.kid).sort((a, b2) => b2.skills.negotiator - a.skills.negotiator)[0];
  if (lead) practice(s, lead.id, 'leadership', 1);
}
