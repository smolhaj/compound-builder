import { describe, expect, it } from 'vitest';
import { newGame } from '../../sim/state';
import { adoptDog, setGuard } from '../../sim/pets';
import { dogGoal, postSpot, type DogCtx } from './dogGoals';

const ctx = (over: Partial<DogCtx> = {}): DogCtx => ({
  home: { x: 30, z: 30, rot: 0, w: 4, d: 3 }, camp: { x: 25, z: 25 }, gate: { x: 67, z: 30 }, yard: { x: 50, z: 30 }, atGate: false,
  person: id => (id === 'p1' ? { x: 35, z: 33, rot: 1 } : null), ...over,
});

describe('where the dogs are', () => {
  it('a guard dog stands its post by the gate, alert at night and barking when someone is there', () => {
    const g = newGame(1); const d = adoptDog(g, { ageYears: 3, guard: true });
    const post = postSpot(ctx(), 0);
    const night = dogGoal(d, 0, 23, 0, ctx(), 0.5);
    expect(night.stance).toBe('alert');
    expect(Math.hypot(night.x - post.x, night.z - post.z)).toBeLessThan(0.01);
    expect(Math.hypot(night.x - 67, night.z - 30)).toBeLessThan(2);
    expect(dogGoal(d, 0, 23, 0, ctx({ atGate: true }), 0.5).stance).toBe('bark');
  });
  it('a dog kept inside follows its person by day and sleeps by the house at night', () => {
    const g = newGame(1); const d = adoptDog(g, { ageYears: 3 }); setGuard(g, d.id, false); d.bonds.p1 = 90;
    const day = dogGoal(d, 0, 11, 0, ctx(), 0.5);
    expect(day.follow || day.stance === 'sit').toBe(true);
    expect(Math.hypot(day.x - 35, day.z - 33)).toBeLessThan(0.3);
    const night = dogGoal(d, 0, 23, 0, ctx(), 0.5);
    expect(night.stance).toBe('lie');
    expect(Math.hypot(night.x - 30, night.z - 30)).toBeLessThan(4);
  });
  it('a puppy is never posted', () => {
    const g = newGame(1); const d = adoptDog(g, { puppy: true }); d.guard = true;
    expect(dogGoal(d, 0, 23, 0, ctx(), 0).stance).toBe('lie');
  });
});
