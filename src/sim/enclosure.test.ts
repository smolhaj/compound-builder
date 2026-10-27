import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import type { PerimeterKind, PerimeterRun, Pt } from './perimeter';
import { CREEK_OPEN_CAP, enclosure, ownedRects, ringPoints } from './enclosure';
import { postureOf } from './encounters';

let n = 0;
const run = (kind: PerimeterKind, pts: Pt[], gates: PerimeterRun['gates'] = []): PerimeterRun => ({ id: `t${n++}`, kind, pts, gates, done: 1, hours: 1, supplied: true, finishedAt: 0 });
/** A closed loop of one kind round the home rectangle. */
const loop = (s: GameState, kind: PerimeterKind, gates: PerimeterRun['gates'] = []) => {
  const h = s.site.home;
  return run(kind, [[h.x0, h.z0], [h.x1, h.z0], [h.x1, h.z1], [h.x0, h.z1], [h.x0, h.z0]], gates);
};
const game = (creek: boolean) => { const g = newGame(7); g.site = { ...g.site, creek }; return g; };

describe('enclosure', () => {
  it('has no hold with nothing built, and the ring is the home rectangle', () => {
    const g = game(false);
    const e = enclosure(g);
    expect(e.barrier).toBe(0);
    expect(e.openShare).toBe(1);
    const h = g.site.home;
    expect(e.length).toBeGreaterThanOrEqual(Math.floor(2 * ((h.x1 - h.x0) + (h.z1 - h.z0))) - 4);
  });

  it('a closed wall round the whole line holds as hard as the wall does', () => {
    const g = game(false);
    g.perimeter.push(loop(g, 'log_palisade'));
    const e = enclosure(g);
    expect(e.openShare).toBe(0);
    expect(e.barrier).toBeGreaterThan(80);
    g.perimeter = [loop(g, 'barbed_wire')];
    expect(enclosure(g).barrier).toBeLessThan(40);
  });

  it('a gap in the line costs far more than the length it takes', () => {
    const g = game(false);
    const h = g.site.home, full = loop(g, 'log_palisade');
    g.perimeter.push(full);
    const closed = enclosure(g).barrier;
    // the same wall with the whole north side missing
    g.perimeter = [run('log_palisade', [[h.x1, h.z0], [h.x1, h.z1], [h.x0, h.z1], [h.x0, h.z0]])];
    const gapped = enclosure(g);
    expect(gapped.openShare).toBeGreaterThan(0.2);
    expect(gapped.barrier).toBeLessThan(closed * 0.45);
    expect(gapped.gaps.length).toBeGreaterThan(0);
  });

  it('a gate holds less than the fence it hangs in', () => {
    const g = game(false);
    g.perimeter.push(loop(g, 'woven_wire'));
    const solid = enclosure(g).barrier;
    g.perimeter = [loop(g, 'woven_wire', [{ at: 20, w: 3 }, { at: 80, w: 3 }])];
    expect(enclosure(g).barrier).toBeLessThan(solid);
  });

  it('a creek through the place is the way in until it is barred at both crossings', () => {
    const g = game(true);
    g.perimeter.push(loop(g, 'log_palisade'));
    const h = g.site.home, midZ = (h.z0 + h.z1) / 2;
    expect(enclosure(g).creekOpen).toBe(2);
    expect(enclosure(g).barrier).toBeLessThanOrEqual(CREEK_OPEN_CAP);
    g.perimeter.push(run('creek_bars', [[h.x0 + 1, midZ - 3], [h.x0 + 1, midZ + 3]]));
    expect(enclosure(g).creekOpen).toBe(1);
    expect(enclosure(g).barrier).toBeLessThanOrEqual(CREEK_OPEN_CAP);
    g.perimeter.push(run('creek_bars', [[h.x1 - 1, midZ - 3], [h.x1 - 1, midZ + 3]]));
    const sealed = enclosure(g);
    expect(sealed.creekOpen).toBe(0);
    expect(sealed.barrier).toBeGreaterThan(80);
  });

  it('a creek off the place needs no bars', () => {
    const g = game(false);
    g.perimeter.push(loop(g, 'log_palisade'));
    expect(enclosure(g).creekOpen).toBe(0);
  });

  it('an unfinished run holds nothing, and the posture reads the closed line', () => {
    const g = game(true);
    const r = loop(g, 'log_palisade');
    r.finishedAt = null; r.done = 0.2;
    g.perimeter.push(r);
    expect(enclosure(g).barrier).toBe(0);
    const before = postureOf(g).barrier;
    g.perimeter = [loop(g, 'log_palisade')];
    const h = g.site.home, midZ = (h.z0 + h.z1) / 2;
    const open = postureOf(g).barrier;
    g.perimeter.push(run('creek_bars', [[h.x0 + 1, midZ - 3], [h.x0 + 1, midZ + 3]]), run('creek_bars', [[h.x1 - 1, midZ - 3], [h.x1 - 1, midZ + 3]]));
    const sealed = postureOf(g).barrier;
    expect(before).toBeLessThan(5);                  // nothing finished yet
    expect(open).toBeLessThanOrEqual(CREEK_OPEN_CAP);   // a wall all round, but the creek is open
    expect(sealed).toBeGreaterThan(80);
  });

  it('bought land joins the ring and the shared edge needs no wall', () => {
    const rects = [{ x0: 0, z0: 0, x1: 10, z1: 10 }, { x0: 10, z0: 0, x1: 20, z1: 10 }];
    const pts = ringPoints(rects);
    expect(pts.some(([x, z]) => Math.abs(x - 10) < 0.02 && z > 0.5 && z < 9.5)).toBe(false);
    expect(pts.length).toBeGreaterThanOrEqual(58);
    expect(ownedRects(game(false))[0]).toEqual(game(false).site.home);
  });
});
