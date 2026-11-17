import { describe, expect, it } from 'vitest';
import { DISASTERS, TRACKS, TRACK_NAME, tracksAt, triggerDisaster, type DisasterKind } from '../disaster';
import { newGame, type GameState } from '../state';
import { doFirst, isDayAct, whatChanged } from './hitCard';

function hit(kind: DisasterKind, seed = 7): GameState {
  const g = newGame(seed);
  triggerDisaster(g.disaster, 100, kind, seed, 14);
  g.disaster.phase = 'impact';
  g.clock.t = g.disaster.hitAt;
  g.disaster.tracks = tracksAt(g.disaster, g.clock.t);
  return g;
}

describe('hit card', () => {
  for (const kind of Object.keys(DISASTERS) as DisasterKind[]) {
    it(`${kind}: names every track under half at day 3, at most 3 first steps, every act has a handler`, () => {
      const g = hit(kind);
      const tr = tracksAt(g.disaster, g.disaster.hitAt + 3);
      const c = whatChanged(g);
      for (const k of TRACKS) if (tr[k] < 0.5) expect(c.lost.some(l => l.startsWith(TRACK_NAME[k])), k).toBe(true);
      expect(c.lost.length).toBe(TRACKS.filter(k => tr[k] < 0.5).length);
      expect(c.market.length).toBeGreaterThanOrEqual(2);
      expect(c.stays.length).toBeGreaterThanOrEqual(3);
      const first = doFirst(g);
      expect(first.length).toBeLessThanOrEqual(3);
      for (const f of first) { expect(f.label.length).toBeGreaterThan(0); expect(isDayAct(f.act)).toBe(true); expect(f.act, `${kind}: ${f.label} has a button`).toBeTruthy(); }
    });
  }
  it('a short pantry puts the pantry first', () => {
    const g = hit('financial');
    for (const k of Object.keys(g.stock)) if (k.startsWith('food') || ['rice', 'beans', 'flour'].includes(k)) (g.stock as Record<string, number>)[k] = 0;
    expect(doFirst(g).length).toBeLessThanOrEqual(3);
  });
});
