/**
 * Engine-level gate queue checks (strategy-sweep QA: "a refugee gate card every 14 days that never clears").
 * A rich, idle, walled family is stepped day by day for years past the hit; every card is read and answered
 * through the real `resolve`. Findings these pin down: one card at a time (never a second while one is up, and
 * none while a raid is on its way to the gate), every card kind has an answer that clears the gate, a card
 * always has a kind and at least one stance, and group sizes stay small.
 */
import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { gateDay, resolve, type Stance } from './encounters';
import { planRun } from './perimeter';
import { step } from './engine';
import type { DisasterKind } from './disaster';

function rich(seed: number, kind: DisasterKind): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind, difficulty: 'cozy' });
  g.money = 1_200_000;
  const r = planRun(g, 'container_wall', [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]);
  r.done = r.hours; r.supplied = true; r.finishedAt = 0;
  return g;
}

interface Tally { cards: number; kinds: Record<string, number>; maxSize: Record<string, number>; replaced: number; noKind: number; noStance: number; stuck: number; uncleared: string[] }

/** Run `days` past the start; leave each card up `wait` days (unanswered) before answering with `pick`. */
function play(g0: GameState, days: number, wait: number, pick: (stances: Stance[], n: number) => Stance): Tally {
  let g = g0, n = 0;
  const t: Tally = { cards: 0, kinds: {}, maxSize: {}, replaced: 0, noKind: 0, noStance: 0, stuck: 0, uncleared: [] };
  let seenId: string | null = null, upSince = 0;
  for (let d = 0; d < days; d++) {
    g = step(g, 1);
    const e = g.gate.pending;
    if (!e) { seenId = null; continue; }
    if (seenId !== e.id) {
      if (seenId) t.replaced++;   // a card was swapped for another before it was answered
      seenId = e.id; upSince = d; t.cards++;
      t.kinds[e.kind] = (t.kinds[e.kind] ?? 0) + 1;
      t.maxSize[e.kind] = Math.max(t.maxSize[e.kind] ?? 0, e.size);
      if (!e.kind) t.noKind++;
      if (!e.stances?.length) t.noStance++;
    }
    if (d - upSince < wait) continue;
    const st = pick(e.stances, n++);
    if (!e.stances.includes(st)) { t.stuck++; continue; }
    resolve(g, st);
    if (g.gate.pending?.id === e.id) t.uncleared.push(`${e.kind}:${st}`);
    g.gate.card = null; seenId = null;
  }
  return t;
}

describe('the gate over years (rich, idle, walled family)', () => {
  const first = (s: Stance[]) => s[0];
  for (const kind of ['pandemic', 'drought', 'grid_down'] as DisasterKind[]) {
    it(`${kind}: one card at a time, every card has a kind and an answer, sizes stay small`, () => {
      const t = play(rich(11, kind), 365 * 5, 3, first);
      expect(t.cards).toBeGreaterThan(5);
      expect(t.replaced).toBe(0);
      expect(t.noKind).toBe(0);
      expect(t.noStance).toBe(0);
      expect(t.uncleared).toEqual([]);
      for (const [k, size] of Object.entries(t.maxSize)) expect(size, k).toBeLessThanOrEqual(30);
    }, 120_000);
  }

  it('cards left unanswered for weeks are never replaced or stacked', () => {
    const t = play(rich(5, 'drought'), 365 * 4, 40, first);
    expect(t.replaced).toBe(0);
    expect(t.stuck).toBe(0);
  }, 120_000);

  it('every stance on every card kind that turns up clears the gate and leaves a result card', () => {
    // the same game, answered with a different stance each time round
    let checked = 0;
    for (let round = 0; round < 3; round++) {
      let g = rich(21 + round, 'pandemic');
      for (let d = 0; d < 365 * 4; d++) {
        g = step(g, 1);
        const e = g.gate.pending;
        if (!e) continue;
        for (const st of e.stances) {
          const h = structuredClone(g);
          resolve(h, st);
          checked++;
          expect(h.gate.pending, `${e.kind}/${st}`).toBeNull();
          expect(h.gate.card ?? h.gate.aftermath ?? h.gate.incoming ?? true, `${e.kind}/${st}`).toBeTruthy();
        }
        resolve(g, e.stances[round % e.stances.length]); g.gate.card = null;
      }
    }
    expect(checked).toBeGreaterThan(20);
  }, 300_000);

  it('gateDay rolls nothing while a card is up or a raid is on its way to the gate', () => {
    const g = rich(3, 'pandemic');
    g.clock.t = g.disaster.hitAt + 200;
    g.disaster.tracks = { ...g.disaster.tracks, law: 0 };
    g.gate.next = 0; g.gate.day = -5;
    g.gate.incoming = { e: { id: 'ex', kind: 'gang', day: 1, title: 'x', dossier: [], size: 3, armed: true, strength: 30, stances: ['hide'] }, at: g.clock.t + 0.5 };
    expect(gateDay(g)).toBeNull();
    expect(g.gate.pending).toBeNull();
    g.gate.incoming = null; g.gate.day = -5;
    g.gate.pending = { id: 'ey', kind: 'trader', day: 1, title: 'y', dossier: [], size: 1, armed: false, strength: 0, stances: ['trade'] };
    expect(gateDay(g)).toBeNull();
    expect(g.gate.pending.id).toBe('ey');
  });
});
