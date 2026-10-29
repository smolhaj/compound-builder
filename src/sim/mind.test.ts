import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { CLASSIC } from './site';
import { freshNeeds } from './needs';
import type { Person } from './family';
import { dailyOf, fitness, resolveDuty, choreRates } from './daily';
import { afterExecution, afterFight, afterMercy, breakOf, fightNerves, griefFor, hardened, mindDay, mindFit, mindMorale, mindOf, mindWork, moodSummary, psyOf, reading, resilienceOf, shock, takeRestDay } from './mind';
import { workFactor } from './needs';
import { step } from './engine';
import type { Battle } from './battleTypes';
import { lossesOf, noteLosses } from './grief';

const game = (seed = 3): GameState => { const g = newGame(seed, 105, 2027, { site: CLASSIC }); g.disaster.tracks.law = 1; return g; };
const addPerson = (g: GameState, p: Partial<Person> & { id: string }): Person => {
  const base = g.people[0];
  const q: Person = { ...structuredClone(base), first: p.id, kid: false, age: 35, job: undefined, ...p, skills: { ...structuredClone(base.skills), ...(p.skills ?? {}) } };
  delete q.partner; delete q.parents; delete q.conditions;
  g.people.push(q); g.personState.push({ id: q.id, task: 'idle', target: null, needs: freshNeeds(), fatigue: 0 });
  return q;
};
/** Run the mind's day n times at successive days. */
const days = (g: GameState, n: number) => { const lines: string[] = []; for (let i = 0; i < n; i++) { g.clock.t += 1; lines.push(...mindDay(g)); } return lines; };
const afterTheHit = (g: GameState) => { g.disaster.kind = 'grid_down'; g.disaster.hitAt = -100; g.disaster.warnAt = -200; };

describe('mental health', () => {
  it('an ordinary comfortable day costs no morale and no work (nothing changes before the strain is real)', () => {
    const g = game();
    days(g, 5);
    for (const p of g.people) { expect(mindMorale(g, p.id)).toBe(0); expect(mindWork(g, p.id)).toBe(1); }
    expect(workFactor(g.personState[0].needs)).toBe(1);
  });

  it('hunger, sickness and a fight raise the strain; rest, games, music and company bring it down', () => {
    const g = game(); afterTheHit(g);
    const a = g.people[0];
    const n = g.personState[0].needs;
    const calm = reading(g, a).target;
    n.hunger = 16000;
    const hungry = reading(g, a).target;
    expect(hungry).toBeGreaterThan(calm + 20);
    expect(reading(g, a).weighs.map(w => w[0])).toContain('hunger');
    n.hunger = 0;
    mindOf(g).lastFight = Math.floor(g.clock.t);
    expect(reading(g, a).target).toBeGreaterThan(calm + 8);
    // helps
    g.stock.games = 1; g.stock.instrument = 1; g.stock.novels = 1;
    const row = dailyOf(g).plan.hours; row[a.id] = Array(24).fill('leisure');
    const helped = reading(g, a);
    expect(helped.helps.map(h => h[0])).toEqual(expect.arrayContaining(['a real rest', 'cards and games', 'music']));
    mindOf(g).lastFight = -999;
    g.stock.games = 0; g.stock.instrument = 0; g.stock.novels = 0; row[a.id] = Array(24).fill('build');
    const bare = reading(g, a).target;
    g.stock.games = 1; g.stock.instrument = 1; g.stock.novels = 1; row[a.id] = [...Array(24).fill('build').map((d, h) => (h < 8 ? 'leisure' : d))];
    expect(reading(g, a).target).toBeLessThan(bare);
  });

  it('a fight shakes everyone; the one who killed carries more, and more in a household that holds to its principles', () => {
    const mk = (humanity: number) => {
      const g = game(); g.gate.humanity = humanity;
      const [a, b] = g.people;
      const units = [{ id: 'h_a', side: 'home', personId: a.id, x: 0, z: 0 }, { id: 'h_b', side: 'home', personId: b.id, x: 0, z: 0 }, { id: 'r1', side: 'raider', x: 5, z: 5 }];
      const events = [{ t: 1, kind: 'shot', from: 'h_a', to: 'r1', hit: true }, { t: 2, kind: 'death', unit: 'r1' }, { t: 9, kind: 'end', result: 'repelled' }];
      afterFight(g, { units, events } as unknown as Battle);
      return g;
    };
    const kind = mk(90), cold = mk(15);
    const [a, b] = kind.people;
    expect(psyOf(kind, a.id).trauma).toBeGreaterThan(psyOf(kind, b.id).trauma);
    expect(psyOf(kind, a.id).kills).toBe(1);
    expect(psyOf(kind, a.id).trauma).toBeGreaterThan(psyOf(cold, a.id).trauma);
    expect(hardened(cold)).toBe(true);
    // the kids who heard it
    const kid = kind.people.find(p => p.kid)!;
    expect(psyOf(kind, kid.id).trauma).toBeGreaterThan(0);
  });

  it('an execution marks the household; treating the wounded and letting them go eases it', () => {
    const g = game();
    const a = g.people[0];
    afterExecution(g, 2);
    const t = psyOf(g, a.id).trauma;
    expect(t).toBeGreaterThan(15);
    afterMercy(g);
    expect(psyOf(g, a.id).trauma).toBeLessThan(t);
  });

  it('grief weighs by how close they were, through the shared ledger', () => {
    const g = game(); afterTheHit(g);
    const [a, b] = g.people;
    const parent = addPerson(g, { id: 'gp', age: 70, elder: true });
    a.parents = [parent.id];
    g.personState[g.people.indexOf(parent)].needs.died = 5;
    noteLosses(g);
    expect(lossesOf(g).length).toBe(1);
    expect(griefFor(g, a)).toBeGreaterThan(griefFor(g, b) + 3);
  });

  it('a person who has had too much breaks: the kind decides the consequence, and it passes', () => {
    const g = game(); afterTheHit(g);
    const a = g.people[0];
    const ps = psyOf(g, a.id);
    ps.stress = 95; ps.low = 70; ps.trauma = 20;
    g.personState[0].needs.hunger = 20000;
    let lines: string[] = [];
    for (let i = 0; i < 60 && !breakOf(g, a.id); i++) lines = days(g, 1);
    const b = breakOf(g, a.id);
    expect(b).not.toBeNull();
    expect(lines.length).toBeGreaterThan(0);
    // withdrawn: cannot be put to work, stays in
    ps.broke = { kind: 'withdrawn', day: Math.floor(g.clock.t), until: Math.floor(g.clock.t) + 4 };
    expect(mindFit(g, a.id, 'garden')).toBe(0);
    expect(mindFit(g, a.id, 'leisure')).toBe(1);
    expect(fitness(g, 0, 'garden')).toBe(0);
    g.personState[0].needs.coping = mindWork(g, a.id);
    expect(workFactor(g.personState[0].needs)).toBeLessThan(0.3);
    expect(resolveDuty(g, a, 10, choreRates(g), true)).toBe('leisure');
    // it passes, and lets some of it go
    g.personState[0].needs.hunger = 0;
    ps.stress = 90;
    days(g, 6);
    expect(breakOf(g, a.id)).toBeNull();
    expect(ps.stress).toBeLessThan(80);
  });

  it('panic: the person goes to the shelter in a raid instead of standing a post, and freezes longer', () => {
    const g = game();
    const a = g.people[0];
    const ps = psyOf(g, a.id);
    const calm = fightNerves(g, a);
    ps.trauma = 70; ps.stress = 80;
    expect(fightNerves(g, a).freeze).toBeGreaterThan(calm.freeze + 1);
    ps.broke = { kind: 'panic', day: 0, until: 99 };
    expect(fightNerves(g, a).shelter).toBe(true);
    expect(mindFit(g, a.id, 'watch')).toBe(0);
  });

  it('a rest day lets the household off everything that can wait', () => {
    const g = game(); afterTheHit(g);
    expect(takeRestDay(g)).toBeNull();
    expect(takeRestDay(g)).not.toBeNull();
    const a = g.people[0];
    expect(resolveDuty(g, a, 10, choreRates(g), true)).toBe('leisure');
    dailyOf(g).plan.hours[a.id] = Array(24).fill('livestock');
    expect(resolveDuty(g, a, 10, choreRates(g), true)).not.toBe('leisure');
  });

  it('kids soak up the grown-ups\' strain; a new neighbor arrives carrying what they have been through', () => {
    const g = game(); afterTheHit(g);
    const kid = g.people.find(p => p.kid)!;
    const base = reading(g, kid).target;
    for (const p of g.people) if (!p.kid) psyOf(g, p.id).stress = 80;
    expect(reading(g, kid).target).toBeGreaterThan(base + 10);
    const n = addPerson(g, { id: 'newc' });
    n.kin = false;
    expect(psyOf(g, n.id).stress).toBeGreaterThan(30);
  });

  it('resilience: a veteran is steadier, a small child more fragile', () => {
    const g = game();
    const vet = addPerson(g, { id: 'vt', job: { title: 'Guard', wage: 1, id: 'soldier' } });
    const civ = addPerson(g, { id: 'cv' });
    const kid = addPerson(g, { id: 'kd', age: 4, kid: true });
    expect(resilienceOf(g, vet)).toBeGreaterThan(resilienceOf(g, civ));
    expect(resilienceOf(g, kid)).toBeLessThan(resilienceOf(g, civ));
  });

  it('a long year of the game leaves a calm, fed household with no breakdowns and the same work rate', () => {
    let g = game(11);
    g = step(g, 200);
    const sum = moodSummary(g);
    expect(sum.breaking).toBe(0);
    for (const p of g.people) expect(mindWork(g, p.id)).toBeGreaterThan(0.9);
  });

  it('shock respects the dead and the gone', () => {
    const g = game();
    const a = g.people[0];
    g.personState[0].needs.died = 3;
    shock(g, a.id, 'raid', 30);
    expect(g.mind?.psyche[a.id]?.trauma ?? 0).toBe(0);
  });
});
