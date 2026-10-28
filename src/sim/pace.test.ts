import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { planStructure } from './construction';
import { eta, paceOf, slowHint, totalHoursLeft, weeksUntil } from './pace';

const fresh = () => { const g = newGame(5); g.structures = []; g.perimeter = []; return g; };

describe('the family pace', () => {
  it('counts a working adult every day and an employed one on weekends only', () => {
    const g = fresh();
    const adult = g.people.findIndex(p => !p.kid && !p.elder);
    g.personState.forEach(ps => { ps.employed = false; });
    const free = paceOf(g);
    g.people[adult].job = { title: 'Clerk', wage: 120 } as never;
    g.personState[adult].employed = true;
    const busy = paceOf(g);
    expect(busy.perWeek).toBeLessThan(free.perWeek);
    expect(busy.employed).toEqual([g.people[adult].first]);
    expect(free.employed).toEqual([]);
  });

  it('adds the queue in order and says how long it takes', () => {
    const g = fresh();
    g.personState.forEach(ps => { ps.employed = false; });
    const a = planStructure(g, 'outhouse', 0, 0, 0), b = planStructure(g, 'timber_cabin', 5, 0, 0);
    expect(totalHoursLeft(g)).toBeGreaterThan(0);
    const wa = weeksUntil(g, a.id)!, wb = weeksUntil(g, b.id)!;
    expect(wb).toBeGreaterThan(wa);
  });

  it('suggests quitting a job or a crew when the work will take long', () => {
    const g = fresh();
    const i = g.people.findIndex(p => !p.kid && !p.elder);
    g.people[i].job = { title: 'Clerk', wage: 120 } as never;
    g.personState[i].employed = true;
    expect(slowHint(g, 2)).toBeNull();
    const h = slowHint(g, 20)!;
    expect(h).toMatch(/quitting the job/);
    expect(h).toMatch(/crew/);
  });

  it('reads weeks as words', () => {
    expect(eta(0.05)).toBe('a day or so');
    expect(eta(1)).toBe('about a week');
    expect(eta(4)).toBe('about 4 weeks');
    expect(eta(26)).toBe('about 6 months');
    expect(eta(null)).toMatch(/no one/);
  });
});
