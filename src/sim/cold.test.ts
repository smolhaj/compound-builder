import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { freshNeeds } from './needs';
import { coldDay, outdoorLowC, shelterTonight, type Shelter } from './cold';
import type { Person } from './family';
import type { RegionId } from './regions';

const adult: Person = { id: 'a', first: 'Ann', last: 'Doe', age: 35, kid: false } as Person;
const baby: Person = { id: 'b', first: 'Bo', last: 'Doe', age: 1, kid: true } as Person;
const elder: Person = { id: 'c', first: 'Cal', last: 'Doe', age: 78, kid: false } as Person;

const built = (g: GameState, id: string, kind: string): Structure => {
  const st: Structure = { id, kind, x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 };
  g.structures.push(st);
  return st;
};
/** Mid-January after the collapse (no stores, no grid), out of firewood since yesterday. */
function winter(region: RegionId, home: string | null, firewood = false): GameState {
  const g = newGame(1, 15);
  g.site = { ...g.site, region };
  g.disaster.tracks = { ...g.disaster.tracks, grid: 0, stores: 0, deliveries: 0, banks: 0 };
  if (home) built(g, 'h', home);
  g.heat.warned = firewood ? -10 : 0;
  g.clock.t = 1;
  return g;
}
/** Days `p` lasts in that shelter, resting and fed (+0.6 health a day); Infinity if they get through `limit` days. */
function lasts(p: Person, sh: Shelter, bag = false, limit = 120): number {
  const n = freshNeeds();
  const s = { ...sh, bag: new Set(bag ? [0] : []) };
  for (let d = 1; d <= limit; d++) {
    n.health = Math.min(100, n.health + 0.6 + coldDay(p, 0, n, s, []));
    if (n.health <= 0) return d;
  }
  return Infinity;
}

describe('the cold', () => {
  it('January nights by region: North Woods bitter, the Pacific Northwest hardly freezing', () => {
    expect(outdoorLowC(winter('north_woods', null))).toBeLessThan(-15);
    expect(outdoorLowC(winter('mountain_west', null))).toBeLessThan(-10);
    expect(outdoorLowC(winter('pnw', null))).toBeGreaterThan(0);
  });

  it('a heated house (one room and the stove) is fine for everyone, babies and the old too', () => {
    const sh = shelterTonight(winter('north_woods', 'timber_cabin', true), []);
    expect(sh.heated).toBe(true);
    expect(lasts(baby, sh)).toBe(Infinity);
    expect(lasts(elder, sh)).toBe(Infinity);
  });

  it('an unheated cabin in a North Woods January: hypothermia within days, the baby and the elderly first, all dead within weeks', () => {
    const out: string[] = [];
    const g = winter('north_woods', 'timber_cabin');
    const sh = shelterTonight(g, out);
    expect(sh.heated).toBe(false);
    expect(sh.c).toBeLessThan(0);
    expect(out.some(l => l.startsWith('No heat'))).toBe(true);
    const a = lasts(adult, sh), b = lasts(baby, sh), e = lasts(elder, sh);
    expect(b).toBeLessThan(a);
    expect(e).toBeLessThan(a);
    expect(b).toBeGreaterThan(3);      // not instantly lethal
    expect(a).toBeLessThan(60);
    const n = freshNeeds();
    for (let d = 0; d < 6; d++) coldDay(elder, 0, n, sh, []);
    expect(n.hurt.some(h => h.what.startsWith('hypothermia'))).toBe(true);
  });

  it('sleeping bags make an unheated house survivable for a healthy adult; the frailest get them first', () => {
    const g = winter('north_woods', 'timber_cabin');
    const sh = shelterTonight(g, []);
    expect(lasts(adult, sh, true)).toBeGreaterThan(90);
    g.stock.sleeping_bags = 1;
    const last = g.people.length - 1;
    g.people[last] = { ...g.people[last], age: 1 };   // a baby in the house gets the one bag
    const withBag = shelterTonight(g, []);
    expect(withBag.bag.has(last)).toBe(true);
    expect(withBag.bag.size).toBe(1);
  });

  it('the bunker holds the ground\'s steady temperature: cold but not freezing', () => {
    const g = winter('north_woods', 'timber_cabin');
    built(g, 'b', 'bunker_dorm');
    const sh = shelterTonight(g, []);
    expect(sh.where).toBe('the bunker');
    expect(sh.c).toBeGreaterThan(5);
    expect(lasts(elder, sh)).toBe(Infinity);
  });

  it('a log house holds more warmth than a trailer; the Appalachian winter is milder than the Upper Midwest\'s', () => {
    expect(shelterTonight(winter('mountain_west', 'log_house'), []).c).toBeGreaterThan(shelterTonight(winter('mountain_west', 'trailer'), []).c);
    expect(lasts(elder, shelterTonight(winter('appalachia', 'log_house'), []))).toBeGreaterThan(lasts(elder, shelterTonight(winter('upper_midwest', 'log_house'), [])));
  });

  it('while the town works nobody freezes: propane heaters, or the warming center when broke', () => {
    const g = winter('north_woods', 'trailer');
    g.disaster.tracks = { ...g.disaster.tracks, stores: 1, deliveries: 1, banks: 1 };
    g.money = 1000;
    const sh = shelterTonight(g, []);
    expect(sh.heated).toBe(true);
    expect(g.money).toBeLessThan(1000);
  });

  it('a cold spell is said once, not every night', () => {
    const g = winter('mountain_west', 'timber_cabin');
    const out: string[] = [];
    shelterTonight(g, out);
    g.clock.t = 2; g.heat.warned = 1;
    shelterTonight(g, out);
    expect(out.filter(l => l.startsWith('No heat')).length).toBe(1);
  });

  it('a summer night costs nothing', () => {
    const g = newGame(1, 196);
    g.disaster.tracks = { ...g.disaster.tracks, grid: 0, stores: 0, deliveries: 0, banks: 0 };
    const sh = shelterTonight(g, []);
    const n = freshNeeds();
    expect(coldDay(elder, 0, n, sh, [])).toBe(0);
    expect(n.morale).toBe(70);
  });
});
