import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { CLASSIC } from './site';
import { freshNeeds } from './needs';
import type { Person } from './family';
import { dailyOf, baseRow, type Duty } from './daily';
import { fightNerves, mindMorale, psyOf, reading } from './mind';
import { BONDS, bondHelp, bondTag, bondsAfterFight, bondsDay, bondsOf, closeRows, compat, pairKey, pairNudge } from './bonds';
import type { Battle } from './battleTypes';

const game = (seed = 3): GameState => { const g = newGame(seed, 105, 2027, { site: CLASSIC }); g.disaster.tracks.law = 1; return g; };
const addPerson = (g: GameState, p: Partial<Person> & { id: string }): Person => {
  const base = g.people[0];
  const q: Person = { ...structuredClone(base), first: p.id, kid: false, age: 35, job: undefined, ...p, skills: { ...structuredClone(base.skills), ...(p.skills ?? {}) } };
  delete q.partner; delete q.parents; delete q.conditions; delete q.kin; delete q.rel;
  g.people.push(q); g.personState.push({ id: q.id, task: 'idle', target: null, needs: freshNeeds(), fatigue: 0 });
  return q;
};
/** Everyone on the same duty all day (the strongest togetherness), sleeping at night. */
const together = (g: GameState, duty: Duty = 'garden') => {
  const plan = dailyOf(g).plan;
  for (const p of g.people) { const row = baseRow(p); for (let h = 8; h < 17; h++) row[h] = duty; plan.hours[p.id] = row; }
};
const run = (g: GameState, n: number) => { const out: string[] = []; for (let i = 0; i < n; i++) { g.clock.t += 1; out.push(...bondsDay(g)); } return out; };
/** A seed where two joiners 'x' and 'y' suit (or clash) strongly. */
const seedWhere = (ok: (c: number) => boolean): number => { for (let s = 1; s < 400; s++) if (ok(compat(s, 'x', 'y'))) return s; throw new Error('no seed'); };

describe('household bonds', () => {
  it('friends form from shared hours between people who suit, and write a moment', () => {
    const g = game(seedWhere(c => c > 0.8));
    addPerson(g, { id: 'x' }); addPerson(g, { id: 'y' });
    together(g);
    const lines = run(g, 90);
    expect(bondTag(g, 'x', 'y')).toBe('friend');
    expect(lines.some(l => l.includes('x and y'))).toBe(true);
    expect(g.lineage.chronicle.some(e => e.kind === 'bond' && e.text.includes('x and y'))).toBe(true);
  });

  it('people who clash and are strained become rivals; calm ones take far longer', () => {
    const seed = seedWhere(c => c < -0.8);
    const strained = game(seed), calm = game(seed);
    for (const g of [strained, calm]) { addPerson(g, { id: 'x' }); addPerson(g, { id: 'y' }); together(g); }
    psyOf(strained, 'x').stress = 70;
    run(strained, 40); run(calm, 40);
    expect(bondTag(strained, 'x', 'y')).toBe('rival');
    expect(bondTag(calm, 'x', 'y')).toBeNull();
  });

  it('a mentor bond comes from hours side by side at the mentoring duty; a couple is read from the family tree', () => {
    const g = game();
    const elder = addPerson(g, { id: 'x', age: 60 }), kid = addPerson(g, { id: 'y', age: 12, kid: true });
    const plan = dailyOf(g).plan;
    for (const p of g.people) plan.hours[p.id] = baseRow(p);
    for (const p of [elder, kid]) for (const h of [14, 15]) plan.hours[p.id][h] = 'mentor';
    run(g, 8);
    expect(bondTag(g, 'x', 'y')).toBe('mentor');
    expect(bondsOf(g).pairs[pairKey('x', 'y')].guide).toBe('x');
    const [a, b] = g.people.filter(p => p.partner).slice(0, 2);
    if (a && b) expect(bondTag(g, a.id, b.id)).toBe('couple');
    expect(closeRows(g).some(r => r.tag === 'couple')).toBe(g.people.some(p => p.partner));
  });

  it('is deterministic: the same run gives the same bonds, byte for byte', () => {
    const make = () => { const g = game(9); addPerson(g, { id: 'x' }); addPerson(g, { id: 'y' }); addPerson(g, { id: 'z', age: 14, kid: true }); together(g); run(g, 120); return JSON.stringify({ b: g.bonds, c: g.lineage.chronicle }); };
    expect(make()).toBe(make());
    expect(make()).not.toBe('undefined');
  });

  it('stays in bounds: values 0-100, pairs capped, memory trimmed, the dead forgotten', () => {
    const g = game(5);
    for (let i = 0; i < 30; i++) addPerson(g, { id: `p${i}` });
    together(g);
    run(g, 200);
    const B = bondsOf(g);
    expect(Object.keys(B.pairs).length).toBeLessThanOrEqual(BONDS.maxPairs);
    for (const k in B.pairs) { const p = B.pairs[k]; expect(p.warm).toBeGreaterThanOrEqual(0); expect(p.warm).toBeLessThanOrEqual(100); expect(p.strife).toBeGreaterThanOrEqual(0); expect(p.strife).toBeLessThanOrEqual(100); expect(p.mentor).toBeGreaterThanOrEqual(0); }
    expect(B.said.n).toBeLessThanOrEqual(BONDS.momentsPerYear);
    // one dies: every pair with them goes
    const some = Object.keys(B.pairs)[0]?.split('|')[0];
    if (some) { g.personState.find(x => x.id === some)!.needs.died = g.clock.t; run(g, 1); expect(Object.keys(bondsOf(g).pairs).some(k => k.split('|').includes(some))).toBe(false); }
  });

  it('bonds never make the household worse off: strain and fight nerves can only improve, rivals cost nothing', () => {
    for (const seed of [2, 7, 11, 19]) {
      const g = game(seed); addPerson(g, { id: 'x' }); addPerson(g, { id: 'y' }); addPerson(g, { id: 'z' });
      together(g);
      const base = JSON.parse(JSON.stringify(g)) as GameState;   // the same house, no bonds
      const B = bondsOf(g);
      B.pairs[pairKey('x', 'y')] = { warm: 80, strife: 0, mentor: 0, tag: 'friend', since: 0 };
      B.pairs[pairKey('x', 'z')] = { warm: 0, strife: 90, mentor: 0, tag: 'rival', since: 0 };
      for (const id of ['x', 'y', 'z']) { const p = g.people.find(q => q.id === id)!, q = base.people.find(w => w.id === id)!; psyOf(g, id).stress = psyOf(base, id).stress = 60; psyOf(g, id).trauma = psyOf(base, id).trauma = 30;
        expect(reading(g, p).target).toBeLessThanOrEqual(reading(base, q).target + 1e-9);
        expect(fightNerves(g, p).freeze).toBeLessThanOrEqual(fightNerves(base, q).freeze + 1e-9);
        expect(mindMorale(g, id)).toBeGreaterThanOrEqual(mindMorale(base, id));
        expect(bondHelp(g, id)).toBeGreaterThanOrEqual(0); expect(bondHelp(g, id)).toBeLessThanOrEqual(BONDS.helpCap); }
      // the rival's side of it: no help, no penalty
      expect(bondHelp(g, 'z')).toBe(0);
      expect(reading(g, g.people.find(q => q.id === 'z')!).target).toBe(reading(base, base.people.find(q => q.id === 'z')!).target);
    }
  });

  it('the roster leans a few percent and no more; with no bonds it does not lean at all', () => {
    const g = game();
    expect(pairNudge(g, 'x', ['y'])).toBe(0);
    const B = bondsOf(g);
    B.pairs[pairKey('x', 'y')] = { warm: 80, strife: 0, mentor: 0, tag: 'friend', since: 0 };
    B.pairs[pairKey('x', 'z')] = { warm: 0, strife: 80, mentor: 0, tag: 'rival', since: 0 };
    expect(pairNudge(g, 'x', ['y'])).toBeCloseTo(BONDS.pairNudge);
    expect(pairNudge(g, 'x', ['z'])).toBeCloseTo(-BONDS.pairNudge);
    for (const hs of [['y', 'y2', 'y3'], ['z', 'z2'], ['y', 'z']]) expect(Math.abs(pairNudge(g, 'x', hs))).toBeLessThanOrEqual(2 * BONDS.pairNudge + 1e-9);
  });

  const fight = (events: Battle['events']): Battle => ({ night: true, duration: 20, events, units: [
    { id: 'u1', side: 'home', personId: 'x', x: 0, z: 0 }, { id: 'u2', side: 'home', personId: 'y', x: 1, z: 0 }, { id: 'r1', side: 'raider', x: 9, z: 9 },
  ] });

  it('a fight makes defenders closer; a carry, a hit with a child below and a night of it go in the chronicle', () => {
    const g = game(); addPerson(g, { id: 'x' }); addPerson(g, { id: 'y' }); addPerson(g, { id: 'k', kid: true, age: 3 });
    bondsAfterFight(g, fight([
      { t: 3, kind: 'wound', unit: 'u1', sev: 30 },
      { t: 5, kind: 'carry', unit: 'u1', by: 'u2' },
      { t: 8, kind: 'end', result: 'repelled' },
    ]));
    const p = bondsOf(g).pairs[pairKey('x', 'y')];
    expect(p.warm).toBe(BONDS.fightWarm + BONDS.carryWarm);
    expect(bondsOf(g).pairs[pairKey('x', 'k')].warm).toBe(BONDS.savedWarm);
    const lines = g.lineage.chronicle.filter(e => e.kind === 'bond').map(e => e.text);
    expect(lines.some(l => l.includes('carried x in'))).toBe(true);
    expect(lines.some(l => l.includes('took a round') && l.includes('k waited below'))).toBe(true);
    // a hit that armor stopped is not a bullet taken
    const h = game(); addPerson(h, { id: 'x' }); addPerson(h, { id: 'y' }); addPerson(h, { id: 'k', kid: true, age: 3 });
    bondsAfterFight(h, fight([{ t: 3, kind: 'wound', unit: 'u1', sev: 4, stopped: true }, { t: 8, kind: 'end', result: 'repelled' }]));
    expect(h.lineage.chronicle.some(e => e.kind === 'bond')).toBe(false);
  });

  it('writes at most a few lines a year however many things happen', () => {
    const g = game(); addPerson(g, { id: 'x' }); addPerson(g, { id: 'y' });
    for (let i = 0; i < 20; i++) bondsAfterFight(g, fight([{ t: 5, kind: 'carry', unit: `u${1 + (i % 2)}`, by: `u${2 - (i % 2)}` }]));
    expect(g.lineage.chronicle.filter(e => e.kind === 'bond').length).toBeLessThanOrEqual(BONDS.momentsPerYear);
  });

  it('an old save has no bonds: it loads, plays as before, and the state survives a save round trip', () => {
    const g = game(4);
    expect(g.bonds).toBeUndefined();
    const saved = JSON.parse(JSON.stringify(g)) as GameState;
    delete saved.bonds;
    expect(pairNudge(saved, g.people[0].id, [g.people[1].id])).toBe(0);
    expect(bondHelp(saved, g.people[0].id)).toBe(0);
    expect(closeRows(saved).every(r => r.tag === 'couple')).toBe(true);
    together(saved);
    run(saved, 30);
    const back = JSON.parse(JSON.stringify(saved)) as GameState;
    expect(back.bonds).toEqual(saved.bonds);
  });

  it('the daily pass is cheap: a large household for a year costs milliseconds a day', () => {
    const g = game(6);
    for (let i = 0; i < 40; i++) addPerson(g, { id: `p${i}`, age: 20 + (i % 40) });
    together(g);
    run(g, 5);
    const t0 = performance.now();
    run(g, 365);
    const per = (performance.now() - t0) / 365;
    console.log(`bondsDay: ${per.toFixed(3)} ms per day with ${g.people.length} people`);
    expect(per).toBeLessThan(5);
  });
});
