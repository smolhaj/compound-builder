import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { BLUEPRINTS } from './blueprints';
import { freshNeeds } from './needs';
import { migrate } from './save/migrations';
import { SAVE_VERSION } from './state';
import type { Person } from './family';
import { housingPlan, sleepEffects, SEPARATE_DWELLINGS } from './housing';
import { setQuarantine, startCase } from './medical';
import { autoHomes, contactFactor, crowdingFx, householdsOf, moveHousehold, pointAlong, quartersOf, raidDelta, residentsOfStructure, setRole, Q } from './quarters';
import { HOME_BEDS } from './blueprints';

const finish = (s: GameState, kind: string, x = 0, z = 0) => {
  const st = { id: `t${s.nextId++}`, kind, x, z, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 };
  s.structures.push(st as GameState['structures'][number]);
  return st;
};
let n = 0;
const person = (age: number, o: Partial<Person> = {}): Person => ({ id: `q${++n}`, first: `Q${n}`, last: 'Guest', age, kid: age < 18, body: 'f', skills: { builder: 0, gardener: 0, medic: 0, mechanic: 0, hunter: 0, negotiator: 0, teacher: 0, radio: 0 }, shirt: 0, ...o });
const join = (s: GameState, ...ps: Person[]) => { for (const p of ps) { s.people.push(p); s.personState.push({ id: p.id, task: 'idle', target: null, needs: freshNeeds() }); } };
const mk = () => { const s = newGame(5, 200); s.stock.sleeping_bag = 30; return s; };
const wherePerson = (s: GameState, id: string) => housingPlan(s).sleepers.find(x => x.id === id)!.spot.where;

describe('households', () => {
  it('the founding family is one household; a joining party is another', () => {
    const s = mk();
    const a = person(30, { origin: { kind: 'neighbor', from: 'n1', since: 3 } }), b = person(8, { kid: true, origin: { kind: 'neighbor', from: 'n1', since: 3 } });
    const hh = householdsOf([...s.people, a, b]);
    expect(hh.length).toBe(2);
    expect(hh.find(h => h.members.includes(a))!.members).toContain(b);
    expect(hh.find(h => h.members.includes(s.people[0]))!.members.length).toBe(s.people.length);
  });
  it('an elder couple who came to live here are a household apart from the family', () => {
    const s = mk();
    const g1 = person(70, { elder: true, rel: { role: 'grandfather', of: s.people[0].id } }), g2 = person(68, { elder: true, rel: { role: 'grandmother', of: s.people[0].id } });
    g1.partner = g2.id; g2.partner = g1.id;
    expect(householdsOf([...s.people, g1, g2]).length).toBe(2);
  });
});

describe('auto-assign', () => {
  const homes = [{ id: 'big', kind: 'log_house', beds: 6 }, { id: 'gh', kind: 'guest_house', beds: 2 }];
  it('keeps a household whole in one building and sends elders to a separate dwelling', () => {
    const s = mk();
    const e = person(72, { elder: true, rel: { role: 'grandmother', of: s.people[0].id } });
    const m = autoHomes([...s.people, e], homes, SEPARATE_DWELLINGS);
    expect(m.get(e.id)).toBe('gh');
    for (const p of s.people) expect(m.get(p.id)).toBe('big');
  });
  it('a household no single home holds is left to the bed-by-bed plan', () => {
    const party = [1, 2, 3].map(() => person(30, { origin: { kind: 'stranger', since: 1 } }));
    const m = autoHomes(party, [{ id: 'gh', kind: 'guest_house', beds: 2 }], SEPARATE_DWELLINGS);
    expect(m.size).toBe(0);
  });
  it('respects a chosen home and counts its beds', () => {
    const s = mk();
    const p = person(30, { home: 'big' });
    const m = autoHomes([p, ...s.people], [{ id: 'big', kind: 'log_house', beds: 6 }, { id: 'b2', kind: 'cottage', beds: 3 }], SEPARATE_DWELLINGS);
    expect(m.has(p.id)).toBe(false);
    for (const q of s.people) expect(m.get(q.id)).toBe('big');   // five beds still hold the four of them
  });
});

describe('moving a household in the plan', () => {
  it('Move puts the whole household in the chosen building; Auto gives it back', () => {
    const s = mk();
    const big = finish(s, 'log_house'), cot = finish(s, 'cottage');
    const fam = s.people.slice(0, 3);
    const hh = householdsOf(s.people);
    expect(moveHousehold(s, hh[0].id, cot.id, HOME_BEDS)).toBeNull();
    expect(fam.every(p => p.home === cot.id)).toBe(true);
    const placed = s.people.filter(p => wherePerson(s, p.id) === cot.id).length;
    expect(placed).toBeGreaterThanOrEqual(1);
    expect(moveHousehold(s, hh[0].id, null, HOME_BEDS)).toBeNull();
    expect(s.people.every(p => p.home === undefined)).toBe(true);
    expect(s.people.every(p => wherePerson(s, p.id) === big.id || wherePerson(s, p.id) === cot.id)).toBe(true);
    expect(moveHousehold(s, 'nobody', cot.id, HOME_BEDS)).toBe('no such household');
    expect(moveHousehold(s, hh[0].id, 'zzz', HOME_BEDS)).toBe('that is not a home');
  });
  it('lists who lives in a building', () => {
    const s = mk();
    const big = finish(s, 'log_house');
    const pl = housingPlan(s);
    const list = residentsOfStructure(s.people, pl.sleepers.map(x => ({ id: x.id, where: x.spot.where, kind: x.spot.kind })), big.id);
    expect(list.length).toBe(1);
  });
});

describe('privacy and crowding', () => {
  it('an ordinary household in its own house costs nothing', () => {
    const s = mk(); finish(s, 'log_house');
    expect(sleepEffects(s).size).toBeGreaterThan(0);
    const base = housingPlan(s).sleepers.map(x => x.morale);
    const eff = [...sleepEffects(s).entries()].map(([i, v]) => [i, v.morale] as const);
    eff.forEach(([i, m]) => expect(m).toBeCloseTo(housingPlan(s).sleepers.find(x => x.index === i)!.morale));
    expect(base.length).toBe(s.people.length);
  });
  it('sharing a room with another household costs morale and sleep, capped', () => {
    const a = person(30), b = person(32);
    const fx = crowdingFx([{ id: a.id, where: 'h', kind: 'couch' }, { id: b.id, where: 'h', kind: 'floor' }], [a, b], new Map([['h', 1]]));
    expect(fx.get(a.id)!.morale).toBeLessThan(0);
    expect(fx.get(a.id)!.morale).toBeGreaterThanOrEqual(-Q.moraleCap);
    expect(fx.get(a.id)!.tired).toBeGreaterThan(0);
    expect(fx.get(a.id)!.tired).toBeLessThanOrEqual(Q.tiredCap);
  });
  it('a family sharing its own house is not penalised; small kids are never', () => {
    const p = person(35), k = person(5, { kid: true, parents: [p.id] }), other = person(40);
    const fx = crowdingFx([{ id: p.id, where: 'h', kind: 'bed' }, { id: k.id, where: 'h', kind: 'bed' }], [p, k, other], new Map([['h', 4]]));
    expect(fx.size).toBe(0);
    const fx2 = crowdingFx([{ id: p.id, where: 'h', kind: 'bed' }, { id: k.id, where: 'h', kind: 'couch' }, { id: other.id, where: 'h', kind: 'bed' }], [p, k, other], new Map([['h', 4]]));
    expect(fx2.has(k.id)).toBe(false);
    expect(fx2.get(p.id)!.morale).toBe(Q.shareRoof);
  });
  it('overcrowding adds a capped penalty', () => {
    const ps = [1, 2, 3, 4, 5, 6].map(() => person(30));
    const fx = crowdingFx(ps.map(p => ({ id: p.id, where: 'h', kind: 'floor' })), ps, new Map([['h', 1]]));
    expect(fx.get(ps[0].id)!.morale).toBe(Q.shareRoom - Q.crowdCap);
    const tight = crowdingFx(ps.map(p => ({ id: p.id, where: 'h', kind: 'floor' })), ps, new Map([['h', 5]]));
    expect(tight.get(ps[0].id)!.morale).toBeGreaterThan(Q.shareRoom - Q.crowdCap);
  });
  it('a lodger in the family house is felt in the plan', () => {
    const s = mk(); finish(s, 'log_house');
    const lodger = person(30, { origin: { kind: 'stranger', since: 1 } });
    join(s, lodger);
    expect(sleepEffects(s).get(s.people.indexOf(lodger))!.morale).toBe(housingPlan(s).sleepers.find(x => x.id === lodger.id)!.morale + Q.shareRoof);
  });
});

describe('illness', () => {
  it('a shared room spreads it faster, another building slower', () => {
    const a = { id: 'a', where: 'h', kind: 'bed' }, b = { id: 'b', where: 'h', kind: 'bed' }, c = { id: 'c', where: 'h', kind: 'couch' }, d = { id: 'd', where: 'g', kind: 'bed' };
    expect(contactFactor(a, b)).toBe(1);
    expect(contactFactor(a, c)).toBe(Q.contactSharedRoom);
    expect(contactFactor(a, d)).toBe(Q.contactOtherBuilding);
    expect(contactFactor(undefined, d)).toBe(1);
  });
  it('the sick are housed in the sick bay while the family keeps them apart', () => {
    const s = mk();
    const big = finish(s, 'log_house'), cot = finish(s, 'cottage');
    const sick = s.people[0];
    expect(startCase(s, sick.id, 'flu', 40)).toBe(true);
    s.medical!.epidemic = { kind: 'flu', since: 0, quarantine: false, asked: false, cases: 1 };
    setRole(s, cot.id, 'sickbay');
    expect(wherePerson(s, sick.id)).toBe(big.id);
    setQuarantine(s, true);
    expect(wherePerson(s, sick.id)).toBe(cot.id);
    setQuarantine(s, false);
    expect(wherePerson(s, sick.id)).toBe(big.id);
  });
});

describe('raids', () => {
  const house = { x: 0, z: 0 }, gate = { x: 60, z: 0 };
  it('everybody in the house: no change', () => {
    expect(raidDelta({ at: { x: 3, z: 2 }, role: null, tower: false, house, gate, night: true })).toBe(0);
  });
  it('guards by the gate are up sooner; guards elsewhere only a little, at night', () => {
    const near = raidDelta({ at: { x: 50, z: 5 }, role: 'guards', tower: false, house, gate, night: true });
    expect(near).toBeLessThan(0);
    expect(raidDelta({ at: { x: 3, z: 0 }, role: 'guards', tower: false, house, gate, night: true })).toBe(Q.guardElse);
    expect(raidDelta({ at: { x: 3, z: 0 }, role: 'guards', tower: false, house, gate, night: false })).toBe(0);
  });
  it('far from the house is slower, capped; never faster than by the gate', () => {
    expect(raidDelta({ at: { x: 30, z: 0 }, role: null, tower: false, house, gate, night: true })).toBeGreaterThan(0);
    expect(raidDelta({ at: { x: 500, z: 0 }, role: null, tower: false, house, gate: null, night: true })).toBe(Q.farCap);
  });
  it('finds the point along a line', () => {
    expect(pointAlong([[0, 0], [10, 0], [10, 10]], 15)).toEqual({ x: 10, z: 5 });
  });
});

describe('save', () => {
  it('migrates v75 saves with an empty roles table', () => {
    const old = JSON.parse(JSON.stringify(newGame(2)));
    delete old.quarters; old.version = 75;
    const m = migrate(old);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.quarters).toEqual({ roles: {} });
  });
  it('one building per role', () => {
    const s = mk(); const a = finish(s, 'cottage'), b = finish(s, 'guest_house');
    setRole(s, a.id, 'guards'); setRole(s, b.id, 'guards');
    expect(quartersOf(s).roles).toEqual({ [b.id]: 'guards' });
    setRole(s, b.id, null);
    expect(quartersOf(s).roles).toEqual({});
  });
});
