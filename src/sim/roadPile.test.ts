import { describe, expect, it } from 'vitest';
import { step } from './engine';
import { listings, ANY_WISH } from './site';
import { placeAll } from './fuzz/passiveBot';
import { plansNeedLines } from './guidance';
import { placeOrder } from './economy';
import { newGame, type GameState } from './state';
import { planStructure, blockedReason } from './construction';
import { emptyStock } from './materials';
import { addCarryWork, atTheRoad, deliverOrders } from './economy';
import { roadWait, stuckProject, waiters } from './stalls';
import { suggestions } from './guidance';

/** QA early playtest: a family-only outhouse on a steep lot waited 30 days for 9 fieldstone with $695k, because the truck left the whole 37-unit pile at the road (no drive). */
const noDrive = (): GameState => {
  const g = newGame(5); g.structures = []; g.perimeter = []; g.hardenJobs = []; g.utilities.fittings = []; g.stock = emptyStock(); g.orders = [];
  g.site.improvements = { ...g.site.improvements, drive: false }; g.money = 600_000; g.roadside = [];
  return g;
};

describe('a load left at the road comes in a unit at a time', () => {
  it('releases whole units as they are carried, so a small need is not stuck behind the whole pile', () => {
    const g = noDrive();
    g.roadside.push({ lines: [{ material: 'fieldstone', qty: 37 }], hours: 74, done: 0 });
    addCarryWork(g, 19);   // 9.5 units' worth of hands
    expect(g.stock.fieldstone).toBe(9);
    expect(g.roadside[0].lines[0].qty).toBe(28);
    expect(g.roadside[0].hours - g.roadside[0].done).toBeCloseTo(56 - 1, 5);
    addCarryWork(g, 1000);
    expect(g.stock.fieldstone).toBe(37);
    expect(g.roadside).toHaveLength(0);
  });
  it('a pile that is carried in whole still lands whole (fractions, food and multi-line piles are untouched)', () => {
    const g = noDrive();
    g.roadside.push({ lines: [{ material: 'lumber', qty: 2.5 }], hours: 3.75, done: 0 });
    addCarryWork(g, 100);
    expect(g.stock.lumber).toBeCloseTo(2.5, 5);
  });
});

describe('the wait says it is at the road and a card says what to do', () => {
  const setup = () => {
    const g = noDrive(), st = planStructure(g, 'outhouse', 0, 0, 0);
    st.stage = 1;
    g.orders.push({ id: 'o1', lines: [{ material: 'fieldstone', qty: 30 }], cost: 0, placedAt: 0, dueAt: 0, status: 'ordered' });
    deliverOrders(g);
    return { g, st };
  };
  it('names the road in the block reason and offers the drive, with the project in the title', () => {
    const { g, st } = setup();
    expect(g.roadside.length).toBeGreaterThan(0);
    const miss = waiters(g)[0];
    expect(atTheRoad(g, 'fieldstone')).toBe(true);
    expect(blockedReason(g, st)).toMatch(/at the road/);
    g.stalls = { [miss.key]: { since: g.clock.t - 4 } };
    expect(stuckProject(g)).toBeNull();   // nothing to order: it is already here
    expect(roadWait(g)?.label).toBeTruthy();
    const card = suggestions(g, 40).find(x => x.id === 'road_pile');
    expect(card?.title).toMatch(/at the road/);
    expect(card?.acts?.[0].act).toEqual({ type: 'hookup', what: 'drive' });
  });
});

describe('family-only start on a lot with no drive (real sim)', () => {
  it('the first building gets its stone within two weeks and no project waits on road stone for long', () => {
    for (const seed of [2, 3, 6, 10]) {
      const lots = listings(seed, 'mountain_west', { ...ANY_WISH, built: 'raw' }, 6, 800_000);
      let g = newGame(seed, undefined, undefined, { site: lots[seed % lots.length], lifestyle: 'fulltime', mode: 'surprise', peace: 'random', kind: null, difficulty: 'standard', dayJobs: true, grid: true } as never);
      placeAll(g);
      placeOrder(g, plansNeedLines(g));
      let worst = 0;
      for (let d = 0; d < 30; d += 1) {
        g = step(g, 1);
        for (const w of waiters(g)) if (w.home || w.label.includes('outhouse')) worst = Math.max(worst, g.clock.t - (g.stalls?.[w.key]?.since ?? g.clock.t));
      }
      const out = g.structures.find(x => x.kind === 'outhouse');
      expect(worst, `seed ${seed}`).toBeLessThan(14);
      expect(out?.stage ?? 0, `seed ${seed} outhouse`).toBeGreaterThanOrEqual(1);
    }
  }, 120_000);
});

describe('a wait that breaks for a moment is the same wait', () => {
  it('keeps the mark for two days when a unit arrived and was used by a neighbor project', async () => {
    const { noteStalls } = await import('./stalls');
    const g = noDrive(); planStructure(g, 'outhouse', 0, 0, 0).stage = 1;
    g.clock.t = 10; noteStalls(g);
    const key = Object.keys(g.stalls ?? {}).find(k => k.startsWith('s:'))!;
    g.stock.fieldstone = 5; g.clock.t = 11; noteStalls(g);   // supplied for the moment
    expect(g.stalls?.[key]).toBeDefined();
    g.stock.fieldstone = 0; g.clock.t = 12; noteStalls(g);
    expect(g.stalls?.[key].since).toBe(10);
    g.stock.fieldstone = 5; g.clock.t = 13; noteStalls(g); g.clock.t = 16; noteStalls(g);
    expect(g.stalls?.[key]).toBeUndefined();   // gone for good once it has been fed for more than two days
  });
});
