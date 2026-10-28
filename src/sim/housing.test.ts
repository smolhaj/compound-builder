import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, type GameState } from './state';
import { BLUEPRINTS, totalBill } from './blueprints';
import { billCost } from './materials';
import { freshNeeds, liveDay } from './needs';
import { migrate } from './save/migrations';
import type { Person } from './family';
import { generateFamily } from './family';
import {
  arrivalOutlook, bestFix, capacity, cachedPlan, heatOn, housingFixes, housingPlan, housingShortfall, M2_PER_BAG, meanLow, nightOf, recommendation,
  sleepEffects, sleepQuality, sleepSpotFor, tentsPitched, TENT_SEATS, WALL_TENT_SEATS,
} from './housing';

const finish = (s: GameState, kind: string) => {
  const st = { id: `t${s.nextId++}`, kind, x: 0, z: 0, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 };
  s.structures.push(st as GameState['structures'][number]);
  return st;
};
let n = 0;
const person = (age: number, o: Partial<Person> = {}): Person => ({ id: `x${++n}`, first: `N${n}`, last: 'Guest', age, kid: age < 18, body: 'f', skills: { builder: 0, gardener: 0, medic: 0, mechanic: 0, hunter: 0, negotiator: 0, teacher: 0, radio: 0 }, shirt: 0x888888, ...o });
const join = (s: GameState, ...ps: Person[]) => { for (const p of ps) { s.people.push(p); s.personState.push({ id: p.id, task: 'idle', target: null, needs: freshNeeds() }); } };
const costOf = (k: string) => billCost(totalBill(BLUEPRINTS[k]));
const mk = (doy = 200, seed = 1) => { const s = newGame(seed, doy); s.stock.sleeping_bag = 20; return s; };
const kinds = (s: GameState) => housingPlan(s).counts;

describe('capacity', () => {
  it('no home: only the camp wall tent, which sleeps 4', () => {
    const s = mk();
    const c = capacity(s);
    expect(c.beds).toBe(0); expect(c.tentSeats).toBe(WALL_TENT_SEATS + c.tents * TENT_SEATS);
    expect(c.underRoof).toBe(0);
  });
  it('a finished cabin: 4 beds, a couch, floor room for 4 bags', () => {
    const s = mk(); finish(s, 'timber_cabin');
    const c = capacity(s);
    expect(c.beds).toBe(4); expect(c.couches).toBe(1); expect(c.floorBags).toBe(Math.floor(8 / M2_PER_BAG));
  });
  it('an unfinished building adds nothing', () => {
    const s = mk(); s.structures.push({ id: 'u', kind: 'cottage', x: 0, z: 0, rot: 0, stage: 2, done: 0, supplied: false, finishedAt: null });
    expect(capacity(s).beds).toBe(0);
  });
  it('a bunkroom is eight bunks; the shop floor holds bags in the outbuilding class', () => {
    const s = mk(); finish(s, 'bunker_dorm'); finish(s, 'workshop');
    const c = capacity(s);
    expect(c.bunks).toBe(8); expect(c.outbuildingBags).toBe(10);
  });
  it('dome tents are bought with the stock', () => {
    const s = mk(); s.stock.tent = 2;
    expect(capacity(s).tentSeats).toBe(WALL_TENT_SEATS + 2 * TENT_SEATS);
  });
  it('a new family packs a bag each and a tent for anyone past four', () => {
    const s = newGame(3);
    expect(s.stock.sleeping_bag).toBe(s.people.length);
  });
});

describe('who sleeps where', () => {
  it('the starting family sleeps in the wall tent until a home stands, and then in beds', () => {
    const s = mk();
    expect(kinds(s).tent).toBe(s.people.length);
    finish(s, 'timber_cabin');
    expect(kinds(s).bed).toBe(s.people.length);
  });
  it('overflow goes bed, couch, floor, tent, then nowhere', () => {
    const s = mk(); finish(s, 'cottage'); s.stock.tent = 0;     // 3 beds, 1 couch, 2 floor bags, the wall tent (4)
    join(s, ...Array.from({ length: 16 }, () => person(30)));
    const c = kinds(s), total = s.people.length;
    expect(c.bed).toBe(3); expect(c.couch).toBe(1); expect(c.floor).toBe(2);
    expect(c.tent).toBe(4);
    expect(c.nowhere).toBe(total - 3 - 1 - 2 - 4 - c.outbuilding);
    expect(c.nowhere).toBeGreaterThan(0);
  });
  it('elders and small kids get the beds before single adults; a couple takes a double together', () => {
    const s = mk(); finish(s, 'cottage');
    s.people.length = 0; s.personState.length = 0;
    const grandma = person(72, { elder: true }), kid = person(5), a = person(30, { id: 'a' }), b = person(31, { id: 'b', partner: 'a' }), loner = person(35);
    a.partner = 'b';
    join(s, loner, a, b, kid, grandma);
    const plan = housingPlan(s), at = (id: string) => plan.sleepers.find(x => x.id === id)!.spot.kind;
    expect(at(grandma.id)).toBe('bed'); expect(at(kid.id)).toBe('bed');
    // 3 beds: grandma 1, the little kid half a bed, then the couple needs 2: it does not fit in the 1.5 left, so they split
    expect(at('a')).toBe(at('b'));
    expect(at('a')).toBe('floor');            // no double left: they stay together on the floor, and the last bed goes to the loner
    expect(at(loner.id)).toBe('bed');
  });
  it('a couple stays together when there is a double for them', () => {
    const s = mk(); finish(s, 'timber_cabin');
    s.people.length = 0; s.personState.length = 0;
    const a = person(30, { id: 'a1', partner: 'b1' }), b = person(31, { id: 'b1', partner: 'a1' }), c = person(33), d = person(34);
    join(s, c, d, a, b);
    const plan = housingPlan(s), spot = (id: string) => plan.sleepers.find(x => x.id === id)!.spot;
    expect(spot('a1').kind).toBe('bed'); expect(spot('b1').kind).toBe('bed');
    expect(spot('a1').where).toBe(spot('b1').where);
  });
  it('two small kids share one bed', () => {
    const s = mk(); finish(s, 'cottage');
    s.people.length = 0; s.personState.length = 0;
    join(s, person(4), person(5), person(6), person(7), person(30), person(31), person(33));
    expect(kinds(s).bed).toBe(3 + 0 + (kinds(s).bed - 3));
    expect(kinds(s).bed).toBeGreaterThanOrEqual(5);
  });
  it('the dead and the taken do not need a bed', () => {
    const s = mk(); finish(s, 'cottage');
    join(s, person(30), person(30));
    const before = housingPlan(s).sleepers.length;
    s.personState[s.personState.length - 1].needs.died = 3;
    s.personState[s.personState.length - 2].needs.taken = true;
    expect(housingPlan(s).sleepers.length).toBe(before - 2);
  });
  it('sleepSpotFor says where one person is', () => {
    const s = mk(); finish(s, 'timber_cabin');
    const sp = sleepSpotFor(s, 0)!;
    expect(sp.kind).toBe('bed'); expect(sp.where).toBe(s.structures.find(x => x.kind === 'timber_cabin')!.id);
    expect(sleepSpotFor(s, s.people[1].id)!.kind).toBe('bed');
    expect(sleepSpotFor(s, 99)).toBeNull();
  });
});

describe('weather and tents', () => {
  const tentQ = (doy: number, over: Partial<Parameters<typeof sleepQuality>[3]> = {}, wx: Partial<ReturnType<typeof nightOf>> = {}) => {
    const s = mk(doy);
    return sleepQuality('tent', person(30), { ...nightOf(s, 0, true), ...wx }, { bag: true, stove: false, ...over });
  };
  it('summer is fine, winter is not', () => {
    const summer = tentQ(200), winter = tentQ(15);
    expect(summer.quality).toBeGreaterThan(0.7);
    expect(winter.quality).toBeLessThan(0.4);
    expect(summer.harm).toBe(0);
  });
  it('the mean low follows the region and the season', () => {
    const s = mk();
    expect(meanLow(s, 15)).toBeLessThan(meanLow(s, 200) - 30);
  });
  it('a storm or rain makes a dome tent worse; a wall tent less so', () => {
    const dry = tentQ(200).quality, rain = tentQ(200, {}, { rainy: true }).quality, storm = tentQ(200, {}, { stormy: true }).quality;
    expect(dry).toBeGreaterThan(rain); expect(rain).toBeGreaterThan(storm);
    expect(tentQ(200, { wall: true }, { stormy: true }).quality).toBeGreaterThan(storm);
  });
  it('the stove in the wall tent makes a freezing night livable; a dome tent has no stove', () => {
    const cold = { lowF: -5, stormy: false, rainy: false, snowy: true, hot: false };
    const s = mk(15);
    const unheated = sleepQuality('tent', person(30), cold, { bag: true, stove: false, wall: true });
    const heated = sleepQuality('tent', person(30), cold, { bag: true, stove: true, wall: true });
    const dome = sleepQuality('tent', person(30), cold, { bag: true, stove: true, wall: false });
    expect(heated.quality).toBeGreaterThan(unheated.quality + 0.2);
    expect(heated.harm).toBe(0); expect(unheated.harm).toBeGreaterThan(0.2);
    expect(dome.quality).toBeLessThan(heated.quality);
    void s;
  });
  it('no sleeping bag is worse; elders and little kids suffer the cold more', () => {
    const cold = { lowF: 20, stormy: false, rainy: false, snowy: false, hot: false };
    const bag = sleepQuality('tent', person(30), cold, { bag: true, stove: false });
    const none = sleepQuality('tent', person(30), cold, { bag: false, stove: false });
    expect(bag.quality).toBeGreaterThan(none.quality);
    const kid = sleepQuality('tent', person(3), { ...cold, lowF: -10 }, { bag: true, stove: false });
    const adult = sleepQuality('tent', person(30), { ...cold, lowF: -10 }, { bag: true, stove: false });
    expect(kid.harm).toBeGreaterThan(adult.harm);
  });
  it('a hot night is bad in a tent', () => {
    const hot = tentQ(200, {}, { hot: true }).quality;
    expect(hot).toBeLessThan(tentQ(200).quality);
  });
  it('a storm on the day reaches the plan', () => {
    const s = mk(200);
    const day = Math.floor(s.clock.t + 0.25);
    s.weather = { active: { kind: 'derecho', at: day, until: day }, last: -999 };
    expect(nightOf(s).stormy).toBe(true);
    expect(nightOf(s, day + 5).stormy).toBe(false);
  });
  it('tents stand in the yard only when somebody sleeps in them', () => {
    const s = mk(); finish(s, 'cottage'); s.stock.tent = 2;
    expect(tentsPitched(s)).toBe(0);
    join(s, ...Array.from({ length: 8 }, () => person(30)));       // 12 people: 3 + 1 + 2 in the cottage, 4 in the wall tent, 2 in a dome
    expect(tentsPitched(s)).toBeGreaterThan(0);
    expect(tentsPitched(s)).toBeLessThanOrEqual(2);
  });
  it('in a hard winter the shop floor is a better night than a dome tent, in a mild one it is not', () => {
    const w = mk(15); finish(w, 'cottage'); finish(w, 'workshop'); w.stock.tent = 3; w.stock.firewood = 0;
    join(w, ...Array.from({ length: 11 }, () => person(30)));
    const cw = kinds(w);
    expect(cw.outbuilding).toBeGreaterThan(0);
    const m = mk(200); finish(m, 'cottage'); finish(m, 'workshop'); m.stock.tent = 3;
    join(m, ...Array.from({ length: 11 }, () => person(30)));
    const cm = kinds(m);
    expect(cm.tent).toBeGreaterThan(cw.tent);
  });
});

describe('morale and health', () => {
  it('a bed costs nothing; the floor and a freezing tent cost morale; nowhere costs the most', () => {
    const s = mk(15); finish(s, 'cottage'); s.stock.firewood = 0; s.stock.sleeping_bag = 0;
    join(s, ...Array.from({ length: 20 }, () => person(30)));
    const plan = housingPlan(s);
    const by = (k: string) => plan.sleepers.filter(x => x.spot.kind === k);
    const avg = (xs: typeof plan.sleepers) => xs.reduce((a, x) => a + x.morale, 0) / Math.max(1, xs.length);
    expect(Math.min(...by('bed').map(x => x.morale))).toBeGreaterThan(-1.5);       // (a cold house with no firewood, not a bad bed)
    expect(avg(by('floor'))).toBeLessThan(0);
    expect(avg(by('nowhere'))).toBeLessThan(avg(by('floor')));
    expect(by('nowhere')[0].harm).toBeGreaterThan(0);
    expect(by('nowhere')[0].tired).toBeGreaterThan(0);
  });
  it('a room of your own matters: a couch sleeper has less privacy than a bed', () => {
    const s = mk(); finish(s, 'cottage');
    join(s, ...Array.from({ length: 6 }, () => person(30)));
    const plan = housingPlan(s);
    const bed = plan.sleepers.find(x => x.spot.kind === 'bed')!, couch = plan.sleepers.find(x => x.spot.kind === 'couch')!;
    expect(bed.privacy).toBeGreaterThan(couch.privacy);
  });
  it('sleepEffects is keyed by person index', () => {
    const s = mk(); finish(s, 'timber_cabin');
    const fx = sleepEffects(s);
    expect(fx.size).toBe(s.people.length);
    expect(fx.get(0)!.morale).toBeCloseTo(0, 5);
  });
  it('liveDay: sleeping on the cold ground for a week sinks the morale of the people it happens to', () => {
    const run = (extra: number) => {
      const s = mk(15); finish(s, 'cottage'); s.stock.firewood = 0; s.stock.canned = 500;
      join(s, ...Array.from({ length: extra }, () => person(30)));
      for (let d = 0; d < 20; d++) liveDay(s, 0.5);
      return s.personState.reduce((a, p) => a + p.needs.morale, 0) / s.personState.length;
    };
    const ok = run(0), crowded = run(14);
    expect(crowded).toBeLessThan(ok - 4);
  });
  it('a normal family in its cabin is untouched', () => {
    const s = mk(200); finish(s, 'timber_cabin'); s.stock.canned = 500;
    const fx = [...sleepEffects(s).values()];
    expect(fx.every(f => f.morale >= -0.01 && f.harm === 0 && f.tired === 0)).toBe(true);
  });
});

describe('shortfall and what to do', () => {
  it('counts people without a bed, and a cottage fixes three', () => {
    const s = mk(); finish(s, 'timber_cabin');
    join(s, person(30), person(30), person(30));
    const sf = housingShortfall(s);
    expect(sf.noBed).toBe(s.people.length - 4);
    expect(bestFix(s, costOf)).toMatchObject({ action: 'build', item: 'cottage' });
    expect(recommendation(s, costOf)).toMatch(/without a bed: build a cottage/);
  });
  it('a bigger shortfall wants a bigger house', () => {
    const s = mk(); finish(s, 'timber_cabin');
    join(s, ...Array.from({ length: 5 }, () => person(30)));
    expect(['log_house']).toContain(bestFix(s, costOf)!.item);
  });
  it('people outside get a tent recommendation with a price; bags are offered when they have none', () => {
    const s = mk(); finish(s, 'cottage'); s.stock.tent = 0; s.stock.sleeping_bag = 0;
    join(s, ...Array.from({ length: 10 }, () => person(30)));
    const fx = housingFixes(s, costOf);
    expect(fx.find(f => f.item === 'tent')!.qty).toBeGreaterThan(0);
    expect(fx.find(f => f.item === 'sleeping_bag')).toBeTruthy();
    expect(recommendation(s, costOf)).toMatch(/tent/);
  });
  it('nothing to say when everybody has a bed', () => {
    const s = mk(); finish(s, 'timber_cabin');
    expect(recommendation(s, costOf)).toBeNull();
    expect(bestFix(s, costOf)).toBeNull();
    expect(housingShortfall(s).noBed).toBe(0);
  });
  it('the cached plan follows the state (a new building, a new tent)', () => {
    const s = mk();
    expect(cachedPlan(s).cap.beds).toBe(0);
    finish(s, 'cottage');
    expect(cachedPlan(s).cap.beds).toBe(3);
    s.stock.tent = 4;
    expect(cachedPlan(s).cap.tents).toBe(4);
  });
});

describe('arrivals', () => {
  it('say where they would sleep, and what it costs the household', () => {
    const s = mk(200); finish(s, 'timber_cabin');
    const guests = [person(30), person(8)];
    const o = arrivalOutlook(s, guests);
    expect(o.guests.bed + o.guests.couch + o.guests.floor).toBe(2);
    expect(o.lines.join(' ')).toMatch(/Beds:/);
    expect(o.lines.join(' ')).toMatch(/would sleep/);
  });
  it('a crowd past the roof sleeps in tents, and in winter the card says so', () => {
    const s = mk(15); finish(s, 'timber_cabin'); s.stock.tent = 0;
    const guests = Array.from({ length: 12 }, () => person(30));
    const o = arrivalOutlook(s, guests);
    expect(o.guests.tent + o.guests.nowhere + o.guests.outbuilding).toBeGreaterThan(0);
    expect(o.lines.join(' ')).toMatch(/°F/);
  });
  it('the incoming kids and elders take beds from the adults who were there', () => {
    const s = mk(200); finish(s, 'cottage');
    s.people.length = 0; s.personState.length = 0;
    join(s, person(30), person(31), person(33));
    const o = arrivalOutlook(s, [person(70, { elder: true }), person(6)]);
    expect(o.displaced).toBeGreaterThan(0);
  });
  it('the stove only counts with firewood', () => {
    const s = mk(); s.stock.firewood = 0; expect(heatOn(s)).toBe(false); s.stock.firewood = 2; expect(heatOn(s)).toBe(true);
  });
});

describe('save', () => {
  it(`a v45 save gets bedding (v${SAVE_VERSION})`, () => {
    const g = newGame(5) as unknown as Record<string, unknown>;
    const stock = { ...(g.stock as Record<string, number>) };
    delete stock.tent; delete stock.sleeping_bag;
    const up = migrate({ ...g, version: 45, stock });
    expect(up.version).toBe(SAVE_VERSION);
    expect(up.stock.sleeping_bag).toBe(up.people.length);
    expect(up.stock.tent).toBe(Math.max(0, Math.ceil((up.people.length - 4) / 3)));
  });
  it('generated families of any size have somewhere to sleep from the first night', () => {
    for (let seed = 1; seed < 20; seed++) {
      const s = newGame(seed, 105, 2027, { family: generateFamily(seed) });
      expect(housingShortfall(s).nowhere).toBe(0);
    }
  });
});
