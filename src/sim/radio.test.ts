import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { postureOf } from './encounters';
import { forewarned, radioDay, radioSet, reception } from './radio';

function afterHit(seed: number, fate: 'full' | 'partial' | 'never'): GameState {
  const g = newGame(seed);
  g.disaster.kind = 'grid_down';
  g.disaster.phase = 'survival';
  g.disaster.hitAt = g.clock.t - 5;
  g.disaster.fate = fate;
  g.disaster.back = fate === 'never' ? {} : { grid: 40 };
  return g;
}
function listen(g: GameState, days: number): void {
  for (let i = 0; i < days; i++) { g.clock.t += 1; radioDay(g); }
}

describe('radio and rumors', () => {
  it('is silent before the hit', () => {
    const g = newGame(3);
    g.stock.sw_radio = 1;
    expect(radioDay(g)).toEqual([]);
    expect(g.radio).toBeUndefined();
  });

  it('a ham rig needs power and the radio skill; otherwise it is only a receiver', () => {
    const g = afterHit(4, 'full');
    expect(radioSet(g)).toBe('none');
    g.stock.ham_rig = 1;
    for (const p of g.people) p.skills.radio = 0;
    g.utilities.grid = true; g.disaster.tracks.grid = 1;
    expect(radioSet(g)).toBe('shortwave');
    g.people[0].skills.radio = 6;
    expect(radioSet(g)).toBe('ham');
    g.disaster.tracks.grid = 0; g.utilities.lit = [];
    expect(radioSet(g)).toBe('shortwave');
  });

  it('a radio hears more and truer news than gossip', () => {
    const none = afterHit(5, 'never');
    listen(none, 300);
    const ham = afterHit(5, 'never');
    ham.stock.ham_rig = 1; ham.people[0].skills.radio = 6; ham.utilities.grid = true; ham.disaster.tracks.grid = 1;
    expect(reception(ham).truth).toBeGreaterThan(reception(none).truth);
    listen(ham, 300);
    const n = none.radio!, h = ham.radio!;
    expect(h.truths + h.rumors).toBeGreaterThan(n.truths + n.rumors);
    expect(h.truths / (h.truths + h.rumors)).toBeGreaterThan(n.truths / Math.max(1, n.truths + n.rumors));
    expect(ham.disaster.news.some(x => x.text.includes("Nobody's coming"))).toBe(true);
  });

  it('hints that a service is coming back before it does', () => {
    const g = afterHit(6, 'full');
    g.stock.sw_radio = 1;
    g.clock.t = g.disaster.hitAt + 27;
    listen(g, 12);
    expect(g.disaster.news.some(x => x.text.includes('grid power') && x.text.includes('back'))).toBe(true);
  });

  it('a raider warning puts the watch up at the gate', () => {
    const g = afterHit(7, 'never');
    g.stock.sw_radio = 1;
    g.disaster.tracks.law = 0;
    const d0 = postureOf(g).detection;
    let warned = false;
    for (let i = 0; i < 200 && !warned; i++) { g.clock.t += 1; radioDay(g); warned = forewarned(g) > 0; }
    expect(warned).toBe(true);
    expect(postureOf(g).detection).toBeGreaterThanOrEqual(Math.min(100, d0 + 10));
  });
});
