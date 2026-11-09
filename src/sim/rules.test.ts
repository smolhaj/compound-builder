import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { stageNow } from './settlement';
import { callVote, lean, noteAdmission, rulesOf, ruleLoyalty, ruleMorale, ruleWatch, tally, voteProblem, voters } from './rules';

/** A hamlet: the founding family plus `n` more grown people, `newcomers` of them taken in from outside. */
function hamlet(n = 14, newcomers = 0): GameState {
  const s = newGame(7, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', difficulty: 'standard' });
  const base = s.people.find(p => !p.kid)!, bps = s.personState[s.people.indexOf(base)];
  for (let k = 0; k < n; k++) {
    const p = structuredClone(base); p.id = `x${k}`; p.first = `Pat${k}`; p.kin = false;
    p.origin = k < newcomers ? { kind: 'stranger', since: 0 } : undefined;
    if (!p.origin) p.kin = true;
    s.people.push(p); s.personState.push({ ...structuredClone(bps), id: p.id } as never);
  }
  return s;
}

describe('house rules', () => {
  it('no vote before the hamlet stage', () => {
    const s = newGame(7, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    expect(voteProblem(s, 'rations', 'shared')).toMatch(/not yet a hamlet/);
    expect(callVote(s, 'rations', 'shared')).toBeNull();
    expect(ruleMorale(s, s.people[0].id)).toBe(0);
  });
  it('a hamlet can vote; the result follows the majority and is deterministic', () => {
    const s = hamlet();
    expect(['hamlet', 'walled_village', 'small_town']).toContain(stageNow(s));
    expect(voteProblem(s, 'admission', 'open')).toBeNull();
    const t1 = tally(s, 'admission', 'open'), t2 = tally(s, 'admission', 'open');
    expect(t1).toEqual(t2);
    const r = callVote(s, 'admission', 'open')!;
    expect(r.passed).toBe(r.yes > r.no);
    expect(rulesOf(s).adopted.admission).toBe(r.passed ? 'open' : 'ask');
  });
  it('newcomers favor an open door and kin favor kin-only', () => {
    const s = hamlet(14, 7);
    const newc = s.people.find(p => p.origin)!, kin = s.people.find(p => p.kin && !p.origin)!;
    expect(lean(s, newc, 'admission', 'open')).toBeGreaterThan(lean(s, kin, 'admission', 'open'));
    expect(lean(s, kin, 'admission', 'kin')).toBeGreaterThan(0);
    expect(lean(s, newc, 'admission', 'kin')).toBeLessThan(0);
    const r = callVote(s, 'admission', 'open')!;
    expect(r.yes).toBeGreaterThan(0);
  });
  it('cooldowns: one vote a month, one per rule a season', () => {
    const s = hamlet();
    callVote(s, 'watch', 'rota');
    expect(voteProblem(s, 'rations', 'shared')).toMatch(/voted/);
    s.clock.t += 31;
    expect(voteProblem(s, 'rations', 'shared')).toBeNull();
    expect(voteProblem(s, 'watch', 'volunteers')).toMatch(/lately/);
  });
  it('the rules shift morale, loyalty and the watch; the default changes nothing', () => {
    const s = hamlet(14, 5), id = s.people[0].id;
    expect(ruleMorale(s, id)).toBe(0); expect(ruleLoyalty(s, false)).toBe(0); expect(ruleWatch(s)).toBe(0);
    const R = rulesOf(s);
    R.adopted.watch = 'rota';
    expect(ruleWatch(s)).toBeGreaterThan(0);
    R.adopted.admission = 'kin';
    expect(ruleLoyalty(s, false)).toBeLessThan(0);
    R.adopted.rations = 'shared';
    const kid = s.people.findIndex(p => p.kid);
    if (kid >= 0) expect(ruleMorale(s, s.people[kid].id)).toBeGreaterThan(0);
  });
  it('the losing side is sore for two weeks, then it fades', () => {
    const s = hamlet(14, 7);
    const r = callVote(s, 'admission', 'kin')!;
    const loser = tally(s, 'admission', 'kin').rows.find(x => x.yes !== r.passed)!;
    expect(ruleMorale(s, loser.id)).toBeLessThan(0);
    s.clock.t += 15;
    expect(ruleMorale(s, loser.id)).toBeGreaterThanOrEqual(-1.3);
  });
  it('taking a stranger in against "kin only" breaks the rule; the second time it lapses', () => {
    const s = hamlet();
    rulesOf(s).adopted.admission = 'kin';
    expect(noteAdmission(s, 1, ['stranger'])).toMatch(/goes against/);
    expect(rulesOf(s).adopted.admission).toBe('kin');
    expect(noteAdmission(s, 1, ['stranger'])).toMatch(/second time/);
    expect(rulesOf(s).adopted.admission).toBe('ask');
    expect(noteAdmission(s, 1, ['stranger'])).toBeNull();
  });
  it('voters are the living grown residents', () => {
    const s = hamlet(5);
    const before = voters(s).length;
    s.personState[s.personState.length - 1].needs.died = 3;
    expect(voters(s).length).toBe(before - 1);
  });
});
