import { describe, expect, it } from 'vitest';
import { HARSH, KIND, MAX_QUESTIONS, QUESTIONS, askOdds, askProblem, interrogate } from './interrogation';
import { newGame, type GameState } from './state';
import type { Prisoner } from './aftermath';

const withPrisoner = (seed = 1, o: Partial<Prisoner> = {}): { g: GameState; id: string } => {
  const g = newGame(seed); g.gate.humanity = 60;
  (g.gate.prisoners ??= []).push({ id: 'pr1', name: 'Dale', since: 0, sev: 10, talked: false, trust: 30, ...o });
  return { g, id: 'pr1' };
};

describe('questioning a prisoner', () => {
  it('kind talks less but is true; harsh talks more and half of it is a lie', () => {
    const p = { trust: 30, sev: 10 };
    expect(askOdds(p, 'harsh', 'hard').speaks).toBeGreaterThan(askOdds(p, 'kind', 'hard').speaks);
    expect(askOdds(p, 'kind', 'hard').truth).toBeGreaterThan(askOdds(p, 'harsh', 'hard').truth);
    expect(askOdds({ trust: 80, sev: 0 }, 'kind', 'hard').speaks).toBeGreaterThan(askOdds({ trust: 0, sev: 0 }, 'kind', 'hard').speaks);
    expect(askOdds(p, 'kind', 'desperate').speaks).toBeGreaterThan(askOdds(p, 'kind', 'savage').speaks);
    for (const a of ['kind', 'harsh'] as const) for (const t of [0, 100]) { const o = askOdds({ trust: t, sev: 100 }, a, 'desperate'); expect(o.speaks).toBeLessThanOrEqual(0.92); expect(o.speaks).toBeGreaterThanOrEqual(0.05); }
  });
  it('kind costs nothing and earns trust and humanity; harsh costs humanity, trust and the household\'s nerves', () => {
    const a = withPrisoner(1), h0 = a.g.gate.humanity; interrogate(a.g, a.id, 'stash', 'kind');
    expect(a.g.gate.humanity).toBe(h0 + KIND.humanity); expect(a.g.gate.prisoners![0].trust).toBeGreaterThan(30);
    const b = withPrisoner(1), m0 = b.g.personState[0].needs.morale; interrogate(b.g, b.id, 'stash', 'harsh');
    expect(b.g.gate.humanity).toBe(h0 + HARSH.humanity); expect(b.g.gate.prisoners![0].trust).toBeLessThan(30); expect(b.g.personState[0].needs.morale).toBeLessThan(m0);
  });
  it('each question once, three at most; a man hurt too badly says nothing you could believe', () => {
    const { g, id } = withPrisoner(2);
    interrogate(g, id, 'next_crew', 'kind');
    expect(interrogate(g, id, 'next_crew', 'kind').refused).toMatch(/already/);
    interrogate(g, id, 'stash', 'kind'); interrogate(g, id, 'who_sent', 'kind');
    expect(g.gate.prisoners![0].asked!.length).toBe(MAX_QUESTIONS);
    const h = withPrisoner(3, { hurtTwice: true }); expect(askProblem(h.g.gate.prisoners![0], 'stash')).toMatch(/hurt/);
    expect(interrogate(g, 'nobody', 'stash', 'kind').refused).toBe('no such prisoner');
  });
  it('what he says changes the game: a true next-crew warns the gate, a true stash brings food and rounds, a lie costs a night or a can of fuel; over many men, harsh gets more answers and kind gets more truth', () => {
    const t = { spoke: { kind: 0, harsh: 0 }, true: { kind: 0, harsh: 0 }, n: 300, warned: 0, cache: 0, wasted: 0 };
    for (let seed = 1; seed <= t.n; seed++) for (const approach of ['kind', 'harsh'] as const) {
      const { g, id } = withPrisoner(seed, { trust: 40 }); g.stock.fuel = 3; const canned = g.stock.canned, fuel = g.stock.fuel;
      const q = QUESTIONS[seed % 3], res = interrogate(g, id, q, approach);
      if (g.gate.prisoners![0].talked) t.spoke[approach]++;
      if (res.ok) t.true[approach]++;
      if (q === 'next_crew' && res.ok) { expect(g.gate.forewarned).toBe(true); t.warned++; }
      if (q === 'stash' && res.ok) { expect(g.stock.canned).toBeGreaterThan(canned); t.cache++; }
      if (q === 'stash' && g.gate.prisoners![0].talked && !res.ok) { expect(g.stock.fuel).toBe(fuel - 1); t.wasted++; }
    }
    expect(t.spoke.harsh).toBeGreaterThan(t.spoke.kind); expect(t.true.kind / Math.max(1, t.spoke.kind)).toBeGreaterThan(t.true.harsh / Math.max(1, t.spoke.harsh));
    expect(t.warned).toBeGreaterThan(5); expect(t.cache).toBeGreaterThan(5); expect(t.wasted).toBeGreaterThan(0);
  });
});
