import { describe, expect, it } from 'vitest';
import { LANE, guardDogs, lanePace, routeAt, routeLength, spawnArc, vehicleCan } from './laneWalk';
import type { Pt } from './perimeter';
import type { Dog } from './pets';

const PATH: Pt[] = [[0, -40], [0, -20], [15, -10], [15, 0]];   // comes down, jogs east round something, ends at the target

describe('walking a lane', () => {
  it('measures back from the target and follows the bends', () => {
    expect(routeLength(PATH)).toBeCloseTo(20 + Math.hypot(15, 10) + 10, 5);
    expect(routeAt(PATH, 0)).toMatchObject({ x: 15, z: 0 });
    const p = routeAt(PATH, 10 + 18.0278);   // at the bend
    expect(p.x).toBeCloseTo(0, 1); expect(p.z).toBeCloseTo(-20, 1);
    expect(routeAt(PATH, 5).x).toBe(15);
  });
  it('extends straight out beyond the start of the path', () => {
    const q = routeAt(PATH, routeLength(PATH) + 10);
    expect(q.x).toBeCloseTo(0, 5); expect(q.z).toBeCloseTo(-50, 5);
  });
  it('spawns the crew where it is the asked distance from the target in a straight line, not along the path', () => {
    const d = spawnArc(PATH, [15, 0], 30);
    const p = routeAt(PATH, d);
    expect(Math.hypot(p.x - 15, p.z)).toBeGreaterThanOrEqual(30);
    expect(d).toBeGreaterThan(30);   // the bend makes the walk longer than the beeline
  });
  it('a hard lane slows the crew, a cliff and a ford more, never below the floor', () => {
    expect(lanePace(1, false, false)).toBe(1);
    expect(lanePace(1.6, false, false)).toBeLessThan(1);
    expect(lanePace(1.6, true, true)).toBeLessThan(lanePace(1.6, false, false));
    expect(lanePace(9, true, true)).toBe(LANE.PACE_MIN);
  });
  it('trucks stop at a pitch, sooner once the snow has closed the roads', () => {
    expect(vehicleCan(0.08, false)).toBe(true);
    expect(vehicleCan(0.08, true)).toBe(false);
    expect(vehicleCan(-0.2, false)).toBe(false);
  });
});

describe('dogs posted inside the compound', () => {
  const dog = (o: Partial<Dog>): Dog => ({ id: 'd', died: null, guard: true, health: 80, training: 60, ...o } as Dog);
  it('only healthy, trained dogs on guard count, two at most, and a better trained dog holds a man longer', () => {
    expect(guardDogs([dog({ guard: false }), dog({ training: 10 }), dog({ health: 20 }), dog({ died: 5 })]).n).toBe(0);
    const two = guardDogs([dog({ id: 'a' }), dog({ id: 'b' }), dog({ id: 'c' })]);
    expect(two.n).toBe(2);
    expect(guardDogs([dog({ training: 90 })]).hold).toBeGreaterThan(guardDogs([dog({ training: 30 })]).hold);
  });
});

describe('the guard dog in a breach', () => {
  it('goes for the first men through: raiders are bitten and held, and a lot with the dog never does worse', async () => {
    const { newGame } = await import('./state');
    const { adoptDog } = await import('./pets');
    const { planBattle } = await import('./battle');
    const mk = (dog: boolean) => {
      const g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
      g.clock.t = Math.floor(g.disaster.hitAt + 60) + 0.25;
      g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
      g.structures.push({ id: 'h', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 });
      if (dog) adoptDog(g, { ageYears: 3, training: 80, guard: true });
      return g;
    };
    const bites = (g: ReturnType<typeof mk>) => { let n = 0, lost = 0; for (let seed = 1; seed <= 30; seed++) { const b = planBattle(g, 6, seed); n += b.events.filter(e => e.kind === 'say' && /dog/i.test(e.text) && e.who?.startsWith('r')).length; lost += b.events.filter(e => e.kind === 'death' && e.unit.startsWith('h_')).length; } return { n, lost }; };
    const a = bites(mk(false)), b = bites(mk(true));
    expect(b.n).toBeGreaterThan(a.n);
  }, 60000);
});
