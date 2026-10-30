import { describe, expect, it } from 'vitest';
import { findHairpins } from './roadHairpins';

/** A road built from legs and turns: [length units, total turn rad] pairs, a station every 0.5 unit. */
function road(legs: Array<[number, number]>) {
  const head: number[] = [0], s: number[] = [0];
  let h = 0;
  for (const [len, turn] of legs) {
    const n = Math.max(1, Math.round(len / 0.5));
    for (let i = 0; i < n; i++) { h += turn / n; head.push(h); s.push(s[s.length - 1] + 0.5); }
  }
  return { head, s };
}
const PI = Math.PI;

describe('findHairpins', () => {
  it('finds one 180 degree bend with a straight either side', () => {
    const { head, s } = road([[10, 0], [4, PI], [10, 0]]);
    const h = findHairpins(head, s);
    expect(h).toHaveLength(1);
    expect(h[0].turn).toBeGreaterThan(0);
  });
  it('finds each switchback of a tight stack on its own (left then right with a short leg between)', () => {
    const { head, s } = road([[8, 0], [4, PI], [3, 0], [4, -PI], [3, 0], [4, PI], [8, 0]]);
    const h = findHairpins(head, s);
    expect(h).toHaveLength(3);
    expect(h.map(x => Math.sign(x.turn))).toEqual([1, -1, 1]);
    // apexes in order along the road, none on top of another
    expect(h[0].i).toBeLessThan(h[1].i); expect(h[1].i).toBeLessThan(h[2].i);
  });
  it('does not count a long easy sweep, or an S-bend that cancels', () => {
    expect(findHairpins(...Object.values(road([[8, 0], [40, PI], [8, 0]])) as [number[], number[]])).toHaveLength(0);
    const sb = road([[8, 0], [6, 1.0], [6, -1.0], [8, 0]]);
    expect(findHairpins(sb.head, sb.s)).toHaveLength(0);
  });
  it('bridges a short straight inside one bend (two right-angle corners the same way are one hairpin)', () => {
    const { head, s } = road([[8, 0], [2, PI / 2], [1, 0], [2, PI / 2], [8, 0]]);
    expect(findHairpins(head, s)).toHaveLength(1);
  });
  it('ignores a bend at the very end of the road (the yard turn)', () => {
    const { head, s } = road([[10, 0], [3, PI]]);
    expect(findHairpins(head, s)).toHaveLength(0);
  });
});
