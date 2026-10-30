import { describe, expect, it } from 'vitest';
import { STOP_TAG, buildReach, doorId, doorOf, hopsBetween, linkOf, lengthOf, routeLinked, type Link, type Wp } from './linkRoute';
import type { Pt } from '../../sim/pathRoute';

/** A world 40 x 20 cut by a rock face at x = 20 (4 wide), and a second cut at x = 34 with a gap (a gate) at z 8-10. */
const hard = (x: number, z: number): boolean => (x > 18 && x < 22) || (x > 33.9 && x < 34.1 && !(z > 8 && z < 10));
const box = { x0: 0, z0: 0, x1: 40, z1: 20 };
const straight = (a: Pt, b: Pt): Pt[] => { void a; void b; return []; };
const bore = (): Link => linkOf('t', [[17.6, 5], [22.4, 5]], s => 1 + s * 0.15)!;

describe('buildReach', () => {
  const r = buildReach(box, hard);
  it('labels the ground either side of the face as different pieces', () => {
    expect(r.comp(5, 5)).toBeGreaterThanOrEqual(0);
    expect(r.comp(5, 5)).not.toBe(r.comp(28, 5));
    expect(r.comp(5, 5)).toBe(r.comp(10, 15));
  });
  it('does not leak through a thin wall, and does through its gate', () => {
    expect(r.comp(28, 5)).toBe(r.comp(28, 15));     // same side
    expect(r.comp(30, 9)).toBe(r.comp(38, 9));      // through the gate in the thin wall at x = 34
    const shut = buildReach(box, (x, z) => hard(x, z) || (x > 33.9 && x < 34.1));
    expect(shut.comp(30, 9)).not.toBe(shut.comp(38, 9));   // shut, the 0.2-thick wall still parts them
  });
  it('a blocked spot takes the piece of the nearest free ground', () => {
    expect(r.comp(20, 5)).toBeGreaterThanOrEqual(-1);
    expect(r.comp(18.5, 5)).toBe(r.comp(17, 5));
  });
});

describe('linkOf', () => {
  it('has deck heights along the centre line, doors at both ends and mouths outside', () => {
    const l = bore();
    expect(l.lenU).toBeCloseTo(4.8, 3);
    expect(l.deck[0][2]).toBeCloseTo(1 + 0.1 * 0.15, 3);
    expect(l.deck[l.deck.length - 1][2]).toBeGreaterThan(l.deck[0][2]);
    expect(l.mouth[0][0]).toBeLessThan(17.6);
    expect(l.mouth[1][0]).toBeGreaterThan(22.4);
  });
  it('rejects a degenerate run', () => { expect(linkOf('x', [[1, 1]], () => 0)).toBeNull(); expect(linkOf('x', [[1, 1], [1.1, 1]], () => 0)).toBeNull(); });
});

describe('door tags', () => {
  it('round-trip', () => { for (const i of [0, 1, 5]) for (const e of [0, 1] as const) expect(doorOf(doorId(i, e))).toEqual({ link: i, end: e }); });
});

describe('routeLinked', () => {
  const reach = buildReach(box, hard);
  const world = { reach, links: [bore()], ordinary: straight };
  it('is null on the same piece of ground', () => { expect(routeLinked([5, 5], [10, 15], world)).toBeNull(); });
  it('goes through the tunnel to the other side, with the deck height and the doors on the way', () => {
    const r = routeLinked([5, 5], [28, 12], world) as Wp[];
    expect(r).not.toBeNull();
    const deck = r.filter(p => p[2] !== undefined);
    expect(deck.length).toBeGreaterThanOrEqual(2);
    expect(r[r.length - 1].slice(0, 2)).toEqual([28, 12]);
    const doors = r.filter(p => p[3]);
    expect(doors.map(p => doorOf(p[3]!).end)).toEqual([0, 1]);
    // x only ever increases along the way (no doubling back)
    for (let i = 1; i < r.length; i++) expect(r[i][0]).toBeGreaterThanOrEqual(r[i - 1][0] - 1e-9);
  });
  it('comes back the other way reversed', () => {
    const r = routeLinked([28, 12], [5, 5], world) as Wp[];
    const doors = r.filter(p => p[3]);
    expect(doors.map(p => doorOf(p[3]!).end)).toEqual([1, 0]);
    const ys = r.filter(p => p[2] !== undefined).map(p => p[2] as number);
    expect(ys[0]).toBeGreaterThan(ys[ys.length - 1]);
  });
  it('a collapsed corridor: the walk ends at its mouth, tagged STOP (they wait for the contractor); no corridor at all is null', () => {
    const r = routeLinked([5, 5], [28, 12], { ...world, links: [{ ...bore(), blocked: true }] }) as Wp[];
    expect(r).not.toBeNull();
    expect(r[r.length - 1][3]).toBe(STOP_TAG);
    expect(r[r.length - 1][0]).toBeLessThan(17.6);
    expect(r.some(p => p[2] !== undefined)).toBe(false);                 // never onto the deck
  });
  it('is null with no link', () => { expect(routeLinked([5, 5], [28, 12], { ...world, links: [] })).toBeNull(); });
  it('chains two corridors', () => {
    const wall2 = (x: number, z: number) => hard(x, z) || (x > 33 && x < 35);
    const reach2 = buildReach(box, wall2);
    const l2 = linkOf('u', [[32.6, 5], [35.4, 5]], () => 3)!;
    const r = routeLinked([5, 5], [38, 5], { reach: reach2, links: [bore(), l2], ordinary: straight }) as Wp[];
    expect(r.filter(p => p[3]).length).toBe(4);
  });
  it('the walk through is about its length', () => {
    const r = routeLinked([5, 5], [28, 5], world) as Wp[];
    expect(lengthOf([5, 5], r)).toBeGreaterThan(22);
    expect(lengthOf([5, 5], r)).toBeLessThan(25);
  });
});

describe('hopsBetween', () => {
  it('is empty on the same piece and null with no way', () => {
    expect(hopsBetween([], [], 1, 1)).toEqual([]);
    expect(hopsBetween([], [], 1, 2)).toBeNull();
  });
});
