import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { bugOut, bugOutPlan, CACHE_DAYS } from './bugout';
import { cacheMiles, rollJourney, routeRisk } from './bugoutRoute';
import { reportCard } from './report';
import { fleetOf } from './vehicles';

const ready = (seed = 1): GameState => { const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' }); g.money = 500_000; return g; };

describe('bug-out route risk', () => {
  it('more miles is more risk, and more of it on foot', () => {
    const g = ready();
    const a = routeRisk(g, 'vehicle', 20, 500, 12).risk, b = routeRisk(g, 'vehicle', 90, 500, 12).risk;
    expect(b).toBeGreaterThan(a);
    expect(routeRisk(g, 'foot', 90, 500, 12).risk).toBeGreaterThan(b);
  });

  it('night is worse in a vehicle, short fuel adds a leg, nowhere to go is risky', () => {
    const g = ready();
    const day = routeRisk(g, 'vehicle', 40, 500, 12), night = routeRisk(g, 'vehicle', 40, 500, 2);
    expect(night.risk).toBeGreaterThan(day.risk);
    const dry = routeRisk(g, 'vehicle', 40, 20, 12);
    expect(dry.legs.some(l => l.id === 'fuel')).toBe(true);
    expect(dry.risk).toBeGreaterThan(day.risk);
    expect(routeRisk(g, 'vehicle', 0, 500, 12).legs.some(l => /Nowhere/.test(l.name))).toBe(true);
  });

  it('no law on the roads makes the miles worse', () => {
    const g = ready(), h = ready();
    h.disaster.tracks.law = 0;
    expect(routeRisk(h, 'vehicle', 60, 500, 12).risk).toBeGreaterThan(routeRisk(g, 'vehicle', 60, 500, 12).risk);
  });

  it('is the same decision on the same day, and the cache is the same distance each time', () => {
    const g = ready();
    expect(rollJourney(g, 0.4)).toEqual(rollJourney(g, 0.4));
    expect(cacheMiles(g)).toBe(cacheMiles(ready()));
    expect(cacheMiles(g)).toBeGreaterThanOrEqual(25); expect(cacheMiles(g)).toBeLessThan(95);
    expect(rollJourney(g, 0).outcome).toBe('clean');
  });
});

describe('bug-out plan: bags, cache and on foot', () => {
  it('a cache is a place to go, with two weeks of food waiting; without it the options are the town house or nowhere', () => {
    const g = ready();
    expect(bugOutPlan(g).options.map(o => o.dest)).toEqual(['open']);
    g.stock.bugout_cache = 1;
    const p = bugOutPlan(g);
    expect(p.options[0].dest).toBe('cache'); expect(p.dest).toBe('cache'); expect(p.cacheDays).toBe(CACHE_DAYS); expect(p.miles).toBe(cacheMiles(g));
    expect(bugOutPlan(g, { dest: 'open' }).dest).toBe('open');
    expect(bugOutPlan(g, { dest: 'town' }).dest).toBe('cache');   // not offered: falls back to the first option
  });

  it('on foot everyone goes, bags carry far more than snatched packs, and it is quick to load', () => {
    const g = ready();
    g.stock.staples = 600; g.stock.canned = 200;
    const car = bugOutPlan(g), foot = bugOutPlan(g, { mode: 'foot' });
    expect(foot.mode).toBe('foot'); expect(foot.going.length).toBe(g.people.length); expect(foot.left.length).toBe(0);
    expect(foot.vehicles.length).toBe(0);
    expect(foot.hours).toBeLessThan(car.hours);
    const bare = foot.carryKg;
    g.stock.bugout_bag = g.people.length;
    const bagged = bugOutPlan(g, { mode: 'foot' });
    expect(bagged.bags).toBe(g.people.length); expect(bagged.carryKg).toBeGreaterThan(bare * 2); expect(bagged.foodDays).toBeGreaterThanOrEqual(foot.foodDays);
    expect(bagged.rangeKm).toBeGreaterThan(0);
  });

  it('on foot works with no running vehicle; a vehicle plan does not', () => {
    const g = ready();
    for (const v of fleetOf(g)) v.fried = true;
    expect(bugOutPlan(g).ok).toBe(false);
    expect(bugOutPlan(g, { mode: 'foot' }).ok).toBe(true);
  });

  it('a dropped bridge shuts the road to vehicles but not to people on foot', () => {
    const g = ready();
    g.roadBridge = { down: true, due: null };
    const lotty = g.site.lot;
    const car = bugOutPlan(g), foot = bugOutPlan(g, { mode: 'foot' });
    if (lotty) { expect(car.ok).toBe(false); expect(car.why).toMatch(/bridge|foot/); }
    expect(foot.ok).toBe(true);
  });

  it('going records the trip: where, the odds, the outcome, the food on arrival, and the report card tells it', () => {
    const g = ready(3);
    g.stock.bugout_cache = 1; g.stock.bugout_bag = 4;
    expect(bugOut(g, { mode: 'foot', dest: 'cache' })).toBeNull();
    const b = g.stats.bugOut!;
    expect(b.mode).toBe('foot'); expect(b.dest).toBe('cache'); expect(b.miles).toBe(cacheMiles(ready(3)));
    expect(b.risk).toBeGreaterThan(0); expect(['clean', 'late', 'robbed', 'lost_one']).toContain(b.outcome);
    expect(b.arrivedFoodDays).toBeGreaterThanOrEqual(CACHE_DAYS);
    const r = reportCard(g);
    expect(r.lines.join(' ')).toMatch(/on foot/);
    expect(r.lines.join(' ')).toMatch(/cache/);
  });

  it('someone lost on the worst roll is recorded as dead, and the rest arrive', () => {
    const g = ready(2);
    g.disaster.tracks.law = 0; g.stock.bugout_cache = 1;
    const n = g.people.length, t0 = g.clock.t;
    let found = false;
    for (let k = 0; k < 400 && !found; k++) {
      g.clock.t = t0 + k;
      if (rollJourney(g, bugOutPlan(g, { mode: 'foot', dest: 'cache' }).route.risk).outcome === 'lost_one') found = true;
    }
    expect(found).toBe(true);
    bugOut(g, { mode: 'foot', dest: 'cache' });
    expect(g.stats.bugOut!.outcome).toBe('lost_one');
    expect(g.stats.bugOut!.lost).toBeTruthy();
    expect(g.personState.filter(p => p.needs.died != null).length).toBe(1);
    expect(g.stats.bugOut!.going).toBe(n - 1);
  });
});
