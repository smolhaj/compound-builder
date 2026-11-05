import { describe, expect, it } from 'vitest';
import { newGame } from '../../sim/state';
import { adoptDog } from '../../sim/pets';
import { dogGoal, type DogCtx } from './dogGoals';
import { innerPost, type RingForPost } from './guardPost';

const square = (c: number, r: number): [number, number][] => [[c - r, c - r], [c + r, c - r], [c + r, c + r], [c - r, c + r], [c - r, c - r]];
const rings: RingForPost[] = [
  { pts: square(30, 20), gates: [{ at: 5 }] },       // the property line: a gate on the south side at x = 20 + 5 = 15
  { pts: square(30, 6), gates: [{ at: 6 }] },        // the inner ring round the house
];

describe('the inner post', () => {
  it('stands just inside the gate of the innermost ring, facing it', () => {
    const p = innerPost(rings, [30, 30], [10, 10]);
    expect(p.ring).toBe(1);
    // inside the inner ring (radius 6 box), not on the outer line
    expect(Math.abs(p.x - 30)).toBeLessThan(6);
    expect(Math.abs(p.z - 30)).toBeLessThan(6);
    const gate = { x: 30 - 6 + 6, z: 24 };       // 6 along the south side from its first corner
    expect(Math.hypot(p.x - gate.x, p.z - gate.z)).toBeLessThan(1);
    expect(Math.hypot(Math.sin(p.face) - (gate.x - p.x) / Math.hypot(gate.x - p.x, gate.z - p.z), Math.cos(p.face) - (gate.z - p.z) / Math.hypot(gate.x - p.x, gate.z - p.z))).toBeLessThan(0.01);
  });
  it('with no inner ring it is by the house on the gate side', () => {
    const p = innerPost([rings[0]], [30, 30], [60, 30]);
    expect(p.ring).toBe(0);        // (the property line alone is the outer gate's own post)
    const q = innerPost([], [30, 30], [60, 30]);
    expect(q.ring).toBe(0);
    expect(q.x).toBeGreaterThan(30);
    expect(Math.abs(q.z - 30)).toBeLessThan(0.01);
  });
});

describe('guard dogs use it', () => {
  const ctx = (over: Partial<DogCtx> = {}): DogCtx => ({
    home: { x: 30, z: 30, rot: 0, w: 4, d: 3 }, camp: { x: 25, z: 25 }, gate: { x: 67, z: 30 }, yard: { x: 50, z: 30 }, atGate: false,
    person: () => null, inner: { x: 30, z: 25, face: 0 }, ...over,
  });
  it('the first guard keeps the gate, the second stands inside, and in a raid both fall back to the inner post', () => {
    const g = newGame(1), a = adoptDog(g, { ageYears: 3, guard: true }), b = adoptDog(g, { ageYears: 3, guard: true });
    const g0 = dogGoal(a, 0, 12, 0, ctx(), 0.5), g1 = dogGoal(b, 1, 12, 0, ctx(), 0.5);
    expect(Math.hypot(g0.x - 67, g0.z - 30)).toBeLessThan(2);
    expect(Math.hypot(g1.x - 30, g1.z - 25)).toBeLessThan(0.3);
    const r0 = dogGoal(a, 0, 12, 0, ctx({ raided: true }), 0.5), r1 = dogGoal(b, 1, 12, 0, ctx({ raided: true }), 0.5);
    expect(Math.hypot(r0.x - 30, r0.z - 25)).toBeLessThan(0.5);
    expect(Math.hypot(r1.x - 30, r1.z - 25)).toBeLessThan(0.5);
    expect(r0.stance).toBe('bark');
  });
  it('without an inner post everything is as before', () => {
    const g = newGame(1), b = adoptDog(g, { ageYears: 3, guard: true });
    const r = dogGoal(b, 1, 12, 0, ctx({ inner: undefined }), 0.5);
    expect(Math.hypot(r.x - 67, r.z - 30)).toBeLessThan(2);
  });
});
