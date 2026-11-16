import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../state';
import { triggerDisaster, type DisasterKind } from '../disaster';
import { mulberry32 } from '../rng';
import { FELT_KINDS, feltSpec } from './registry';
import { ensureFelt, feltCardPending, feltOf } from './state';
import type { DecisionCard, FeltKind, FeltPhase } from './types';
import { answerCard, cardsFor, eligibleCards, feltCards, optionProblem, timeoutDays, PHASE_BUDGET } from './cards';
import { feltDaily } from './daily';
import { THEME } from './cardLibrary';
import { decisionOpen } from '../clockResume';

const ctx = (s: GameState) => ({ day: 0, r: mulberry32(1), once: () => true, ...{ s } });
/** A run `days` after the hit of `kind` (planned kinds are set by hand), with some neighbors home, a hurt person and money. */
function at(kind: FeltKind, days: number, money = 5000, seed = 7): GameState {
  const g = newGame(seed);
  triggerDisaster(g.disaster, g.clock.t, 'grid_down', g.seed, 0);
  g.disaster.kind = kind as DisasterKind;
  g.clock.t = g.disaster.hitAt + days;
  g.money = money;
  for (const n of g.neighbors) n.status = 'home';
  g.personState[0].needs.health = 60;
  return g;
}
const PHASE_DAY: Array<[FeltPhase, number]> = [['hit', 6], ['month', 20], ['season', 60], ['year', 130]];

describe('generic cards', () => {
  it('every kind has at least two real cards in the hit, month and season phases, with different trade-offs', () => {
    for (const k of FELT_KINDS) for (const [ph, d] of PHASE_DAY.slice(0, 3)) {
      const g = at(k, d);
      const cs = cardsFor(k, feltSpec(k)).filter(c => c.phase === ph && c.when(g));
      expect(cs.length, `${k} ${ph}`).toBeGreaterThanOrEqual(2);
    }
  });
  it('every kind has a card in the year phase and a theme', () => {
    for (const k of FELT_KINDS) { expect(THEME[k], k).toBeTruthy(); expect(cardsFor(k, feltSpec(k)).some(c => c.phase === 'year' && c.when(at(k, 130))), k).toBe(true); }
  });
  it('card ids are unique per kind', () => { for (const k of FELT_KINDS) { const ids = cardsFor(k).map(c => c.id); expect(new Set(ids).size).toBe(ids.length); } });
  it('options: 2 to 4, fallback exists and can always be taken, odds in range, no pair is a dominated copy', () => {
    for (const k of FELT_KINDS) for (const c of cardsFor(k)) {
      expect(c.options.length).toBeGreaterThanOrEqual(2); expect(c.options.length).toBeLessThanOrEqual(4);
      const g = at(k, 130, 0); // poor, no money: the fallback must still work
      const fb = c.options.find(o => o.id === c.fallback);
      expect(fb, c.id).toBeTruthy();
      expect(fb!.cost(g).money ?? 0, c.id).toBe(0);
      for (const o of c.options) { const p = o.odds?.(g)?.p; if (p !== undefined) { expect(p).toBeGreaterThan(0); expect(p).toBeLessThan(1); } }
      // each pair differs on at least two of: cost, risk, what it does to relationships and morale
      const sig = (o: typeof c.options[number]) => {
        const g2 = structuredClone(at(k, 130, 9e6)), before = { h: g2.gate.humanity, d: g2.neighbors.map(n => n.disposition), r: g2.gate.respect ?? 0, nx: g2.gate.next };
        const lines = o.apply(g2, () => 0.99);
        return { cost: JSON.stringify(o.cost(g2)), risk: o.odds ? 1 : 0, rel: JSON.stringify([g2.gate.humanity - before.h, g2.neighbors.map((n, i) => n.disposition - before.d[i]), (g2.gate.respect ?? 0) - before.r, g2.gate.next - before.nx]), n: lines.length };
      };
      for (let i = 0; i < c.options.length; i++) for (let j = i + 1; j < c.options.length; j++) {
        const a = sig(c.options[i]), b = sig(c.options[j]);
        const diff = (a.cost !== b.cost ? 1 : 0) + (a.risk !== b.risk || !!(c.options[i].odds && Math.abs(c.options[i].odds!(g).p - c.options[j].odds!(g).p) > 0.02) ? 1 : 0) + (a.rel !== b.rel ? 1 : 0);
        expect(diff, `${c.id}: ${c.options[i].id} vs ${c.options[j].id}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
  it('rich households can pay for speed; poor ones are told why not and keep a free option', () => {
    for (const k of ['grid_down', 'pandemic', 'mega_quake', 'lawless', 'drought', 'nuclear', 'financial', 'unknown'] as FeltKind[]) {
      const c = cardsFor(k)[0], rich = at(k, 1, 9e6), poor = at(k, 1, 0);
      const pay = c.options.find(o => (o.cost(rich).money ?? 0) > 0);
      if (pay) { expect(optionProblem(rich, pay)).toBeNull(); expect(optionProblem(poor, pay)).toMatch(/costs/i); }
      expect(c.options.some(o => !optionProblem(poor, o) && !(o.cost(poor).money))).toBe(true);
    }
  });
});

describe('scheduling', () => {
  it('one card at a time, spaced, within the phase budget, never twice', () => {
    const g = at('grid_down', 0);
    g.disaster.fx = undefined;
    const seen: string[] = [];
    for (let d = 0; d < 8; d++) {
      g.clock.t = g.disaster.hitAt + d;
      feltCards(g, ctx(g), feltSpec('grid_down')!);
      const p = feltOf(g)?.cards.pending;
      if (p) { seen.push(p.id); expect(answerCard(g, p.id, cardsFor('grid_down', feltSpec('grid_down')).find(c => c.id === p.id)!.fallback)).toHaveProperty('lines'); }
    }
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen.length).toBeLessThanOrEqual(PHASE_BUDGET);
    expect(new Set(seen).size).toBe(seen.length);
  });
  it('holds the clock while pending and stays pending until answered', () => {
    const g = at('pandemic', 0);
    feltCards(g, ctx(g), feltSpec('pandemic')!);
    expect(feltCardPending(g)).toBe(true);
    expect(decisionOpen(g, null)).toBe(true);
    const id = feltOf(g)!.cards.pending!.id;
    feltCards(g, ctx(g), feltSpec('pandemic')!);
    expect(feltOf(g)!.cards.pending!.id).toBe(id);
  });
  it('does not raise a card over a gate decision', () => {
    const g = at('lawless', 0);
    g.gate.card = { title: 'x', text: 'y', tone: 'good', lines: [] };
    expect(feltCards(g, ctx(g), feltSpec('lawless')!)).toEqual([]);
    expect(feltOf(g)).toBeUndefined();
  });
  it('a stub run with no eligible card leaves the save untouched', () => {
    const g = at('grid_down', 0); g.clock.t = g.disaster.hitAt - 5;
    feltDaily(g, ctx(g));
    expect(feltOf(g)).toBeUndefined();
  });
  it('a card left too long takes its safe fallback and says so; Cozy waits longer than Hardcore', () => {
    const g = at('grid_down', 0);
    feltCards(g, ctx(g), feltSpec('grid_down')!);
    const p = feltOf(g)!.cards.pending!, c = cardsFor('grid_down', feltSpec('grid_down')).find(x => x.id === p.id)!;
    const cozy = structuredClone(g), hard = structuredClone(g);
    cozy.disaster.difficulty = 'cozy'; hard.disaster.difficulty = 'hardcore';
    expect(timeoutDays(cozy, c)).toBeGreaterThan(timeoutDays(hard, c));
    g.clock.t += timeoutDays(g, c);
    const lines = feltCards(g, ctx(g), feltSpec('grid_down')!);
    expect(lines[0]).toMatch(/did not decide/i);
    expect(feltCardPending(g)).toBe(false);
    expect(feltOf(g)!.cards.done[c.id]).toBe(c.fallback);
  });
  it('is cheap: 365 simulated days cost well under 5 ms a day', () => {
    const g = at('grid_down', 0), t0 = performance.now();
    for (let d = 0; d < 365; d++) { g.clock.t = g.disaster.hitAt + d; feltCards(g, ctx(g), feltSpec('grid_down')!); const p = feltOf(g)?.cards.pending; if (p) answerCard(g, p.id, cardsFor('grid_down', feltSpec('grid_down')).find(c => c.id === p.id)!.fallback); }
    expect((performance.now() - t0) / 365).toBeLessThan(5);
  });
});

describe('answering changes real state', () => {
  const take = (g: GameState, optId: string) => {
    feltCards(g, ctx(g), feltSpec(g.disaster.kind)!);
    const p = feltOf(g)!.cards.pending!;
    return { p, res: answerCard(g, p.id, optId) };
  };
  it('paying charges money and gains stock; doing it by hand charges hours', () => {
    const g = at('grid_down', 0, 5000), m = g.money, b = g.stock.batteries ?? 0;
    const { res } = take(g, 'buy');
    expect(res).toHaveProperty('lines');
    expect(g.money).toBe(m - 450);
    expect(g.stock.batteries ?? 0).toBeGreaterThan(b - 3);
    const h = at('grid_down', 0, 5000); const f0 = h.personState[0].fatigue ?? 0;
    take(h, 'wrap');
    expect(h.personState.some(ps => (ps.fatigue ?? 0) > f0)).toBe(true);
  });
  it('an unaffordable option is refused and the card stays up', () => {
    const g = at('grid_down', 0, 10);
    const { p, res } = take(g, 'buy');
    expect(res).toHaveProperty('why');
    expect(feltOf(g)!.cards.pending!.id).toBe(p.id);
  });
  it('relationship and humanity choices move the tracks', () => {
    const g = at('grid_down', 2, 5000); g.gate.humanity = 50;
    const first = g.neighbors[0].disposition;
    feltCards(g, ctx(g), feltSpec('grid_down')!);   // signature first
    answerCard(g, feltOf(g)!.cards.pending!.id, 'rest');
    g.clock.t += 2; ensureFelt(g);
    feltCards(g, ctx(g), feltSpec('grid_down')!);   // first night
    answerCard(g, feltOf(g)!.cards.pending!.id, 'hold');
    g.clock.t += 2;
    feltCards(g, ctx(g), feltSpec('grid_down')!);   // the neighbor at the fence
    const p = feltOf(g)!.cards.pending!;
    expect(p.id).toMatch(/neighbor/);
    answerCard(g, p.id, 'refuse');
    expect(g.gate.humanity).toBeLessThan(50);
    expect(Math.min(...g.neighbors.map(n => n.disposition))).toBeLessThanOrEqual(first);
  });
  it('is deterministic for a seed, JSON-safe and survives a save round trip', () => {
    const run = () => { const g = at('mega_quake', 0, 5000); feltCards(g, ctx(g), feltSpec('mega_quake')!); const lines = answerCard(g, feltOf(g)!.cards.pending!.id, 'diy'); return { g, lines }; };
    const a = run(), b = run();
    expect(a.lines).toEqual(b.lines);
    const back = JSON.parse(JSON.stringify(a.g.disaster)) as GameState['disaster'];
    expect(feltOf({ disaster: back })).toEqual(feltOf(a.g));
    structuredClone(a.g);
  });
  it('Cozy makes the bad branch less likely than Hardcore', () => {
    const c = cardsFor('grid_down', feltSpec('grid_down')).find(x => x.id.endsWith('first_night'))!, o = c.options.find(x => x.id === 'scavenge')!;
    const cozy = at('grid_down', 2), hard = at('grid_down', 2);
    cozy.disaster.difficulty = 'cozy'; hard.disaster.difficulty = 'hardcore';
    expect(o.odds!(cozy).p).toBeGreaterThan(o.odds!(hard).p);
  });
  it('eligibility reads the state: no neighbors home, no neighbor card', () => {
    const g = at('grid_down', 4); for (const n of g.neighbors) n.status = 'gone';
    expect(eligibleCards(g, feltSpec('grid_down')).some(c => /neighbor/.test(c.id))).toBe(false);
  });
});

export type { DecisionCard };
