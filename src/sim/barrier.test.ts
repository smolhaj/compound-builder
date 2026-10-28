import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { planRun, PERIMETER, PERIMETER_ORDER, UPGRADE_NEXT, type PerimeterKind } from './perimeter';
import { postureOf } from './encounters';

/** A closed ring of 100 units of one kind, finished, round the compound. */
function ring(kind: PerimeterKind, units = 100) {
  const g = newGame(5, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  const h = g.site.home, c = [(h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2], q = units / 8;
  const r = planRun(g, kind, [[c[0] - q, c[1] - q], [c[0] + q, c[1] - q], [c[0] + q, c[1] + q], [c[0] - q, c[1] + q], [c[0] - q, c[1] - q]]);
  r.done = r.hours; r.supplied = true; r.finishedAt = g.clock.t - 9999;
  return g;
}

describe('the barrier reads the wall tier', () => {
  it('every step up the upgrade chain raises the ring\'s barrier, whatever tiers the table has', () => {
    const chain: PerimeterKind[] = [];
    for (let k: PerimeterKind | undefined = 'split_rail'; k; k = UPGRADE_NEXT[k]) chain.push(k);
    expect(chain.length).toBeGreaterThan(4);
    let last = -1;
    for (const k of chain) {
      const b = postureOf(ring(k)).barrier;
      // (an electrified wall with no power is only a steel wall: sim/perimeter peopleBlock)
      if (k === 'electric_steel') expect(b).toBeGreaterThanOrEqual(last); else expect(b).toBeGreaterThan(last);
      last = b;
    }
  });

  it('a closed ring holds as well as its people-block rating, and a short one only in proportion', () => {
    for (const k of ['woven_wire', 'chain_link', 'steel_wall'] as PerimeterKind[]) {
      expect(postureOf(ring(k, 100)).barrier).toBeCloseTo(PERIMETER[k].blocks.people * 100, 5);
      expect(postureOf(ring(k, 20)).barrier).toBeCloseTo(PERIMETER[k].blocks.people * 50, 5);
    }
    expect(PERIMETER_ORDER.length).toBeGreaterThan(0);
  });
});
