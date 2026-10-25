import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { planRun } from './perimeter';
import { applyBattle, planBattle } from './battle';
import { afterFight, canMourn, fightNerves, gathering, griefTotal, holdMemorial, mindDay, mindMorale, mindOf, mindWork, moodText, psyOf, shock } from './mind';
import { liveDay } from './needs';
import { migrate } from './save/migrations';

function afterHit(seed = 1): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.25;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0, medical: 0 };
  g.stock.canned = 40; g.stock.meds = 3;
  g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  return g;
}
function fortify(g: GameState): GameState {
  const r = planRun(g, 'container_wall', [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]]);
  r.done = r.hours; r.supplied = true; r.finishedAt = 0;
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) {
    g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id });
    g.armory.skill[p.id] = 5;
  }
  g.armory.ammo['556'] = 3000;
  return g;
}
const days = (g: GameState, n: number) => { for (let d = 0; d < n; d++) { g.clock.t += 1; mindDay(g); } };
const kill = (g: GameState, i: number) => { g.personState[i].needs.died = Math.floor(g.clock.t); g.personState[i].needs.health = 0; };

describe('trauma and the next fight', () => {
  it('a traumatized civilian freezes longer at the alarm and holds a post less', () => {
    const g = afterHit(2);
    const p = g.people.find(x => !x.kid)!;
    expect(fightNerves(g, p)).toEqual({ freeze: 0, hold: 1 });
    psyOf(g, p.id).trauma = 70; psyOf(g, p.id).stress = 70;
    const n = fightNerves(g, p);
    expect(n.freeze).toBeGreaterThan(3);
    expect(n.hold).toBeLessThan(0.8);
  });

  it('in the battle, the shaken get their first shot off later', () => {
    const firstShot = (b: ReturnType<typeof planBattle>) => {
      const alarm = b.events.find(e => e.kind === 'alarm')!.t;
      const shots = b.events.filter(e => e.kind === 'shot' && e.from.startsWith('h_'));
      return shots.length ? shots[0].t - alarm : 300;
    };
    let calm = 0, shaken = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const a = fortify(afterHit(seed)), b = fortify(afterHit(seed));
      for (const p of b.people) { psyOf(b, p.id).trauma = 80; psyOf(b, p.id).stress = 80; }
      calm += firstShot(planBattle(a, 6, seed));
      shaken += firstShot(planBattle(b, 6, seed));
    }
    expect(shaken).toBeGreaterThan(calm + 20);
  });

  it('a fight leaves trauma; the wounded and those who killed carry more; kids in the shelter are frightened too', () => {
    const g = fortify(afterHit(5));
    const b = planBattle(g, 6, 5);
    applyBattle(g, b);
    const adults = g.people.filter(p => !p.kid);
    for (const p of g.people) if (g.personState.find(x => x.id === p.id)!.needs.died == null) expect(psyOf(g, p.id).trauma).toBeGreaterThan(5);
    expect(Math.max(...adults.map(p => psyOf(g, p.id).trauma))).toBeGreaterThanOrEqual(14);
    expect(mindOf(g).lastFight).toBe(Math.floor(g.clock.t + 0.25));
  });

  it('trauma fades with time and safety; recovery is faster with a dog, music and someone to talk to', () => {
    const base = afterHit(4), helped = afterHit(4);
    helped.stock.dog = 1; helped.stock.pastimes = 1;
    for (const g of [base, helped]) { const p = g.people[0]; shock(g, p.id, 'raid', 50); g.clock.t += 15; mindOf(g).lastFight = -999; }
    days(base, 60); days(helped, 60);
    const t0 = psyOf(base, base.people[0].id).trauma, t1 = psyOf(helped, helped.people[0].id).trauma;
    expect(t0).toBeLessThan(50);
    expect(t1).toBeLessThan(t0);
  });
});

describe('grief', () => {
  it('a death in the family brings grief, deepest for those closest; it shows in morale and work', () => {
    const g = afterHit(3);
    const kid = g.people.findIndex(p => p.kid);
    kill(g, kid);
    mindDay(g);
    const parent = g.people.find(p => !p.kid)!;
    const gp = psyOf(g, parent.id);
    expect(gp.grief[0].for).toBe(g.people[kid].id);
    expect(gp.grief[0].sev).toBeGreaterThan(70);
    expect(mindMorale(g, parent.id)).toBeGreaterThan(20);
    expect(mindWork(g, parent.id)).toBeLessThan(1);
    expect(moodText(g, parent)).toContain(`grieving ${g.people[kid].first}`);
  });

  it('grief eases faster with a memorial', () => {
    const run = (memorial: boolean) => {
      const g = afterHit(6);
      kill(g, 0);
      mindDay(g);
      if (memorial) { expect(canMourn(g).map(p => p.id)).toContain(g.people[0].id); expect(holdMemorial(g, g.people[0].id)).toBeNull(); }
      days(g, 90);
      return griefTotal(psyOf(g, g.people[1].id));
    };
    const without = run(false), withIt = run(true);
    expect(withIt).toBeLessThan(without - 15);
  });

  it('a child taken is its own grief: it eases far less than a death while they are missing', () => {
    const run = (taken: boolean) => {
      const g = afterHit(8);
      const kid = g.people.findIndex(p => p.kid);
      g.personState[kid].needs.died = Math.floor(g.clock.t); g.personState[kid].needs.taken = taken;
      mindDay(g);
      days(g, 90);
      const parent = g.people.find(p => !p.kid)!;
      return { left: psyOf(g, parent.id).grief[0]?.sev ?? 0, mood: moodText(g, parent) };
    };
    const t = run(true), d = run(false);
    expect(t.left).toBeGreaterThan(d.left + 10);
    expect(t.mood).toContain('missing');
  });

  it('the dead are buried within days, and a gathering is a hook other systems can call', () => {
    const g = afterHit(9);
    kill(g, 1);
    mindDay(g); g.clock.t += 1;
    const lines = mindDay(g);
    expect(lines.some(l => l.includes('buried'))).toBe(true);
    const p = g.people[0], s0 = psyOf(g, p.id).stress;
    expect(gathering(g, 'party')).toMatch(/evening/);
    expect(psyOf(g, p.id).stress).toBeLessThan(s0);
  });
});

describe('strain, kids, isolation, conflict', () => {
  it('long isolation in a small household after the collapse wears into low mood', () => {
    const g = afterHit(10);
    g.clock.t = g.disaster.hitAt + 90;
    for (const nb of g.neighbors) nb.disposition = -50;
    for (let i = 2; i < g.personState.length; i++) kill(g, i);
    mindOf(g).seenDead = g.people.map(p => p.id);   // (not about grief here)
    days(g, 200);
    expect(psyOf(g, g.people[0].id).low).toBeGreaterThan(30);
  });

  it('kids pick up the adults\' strain', () => {
    const g = afterHit(11);
    for (const p of g.people.filter(x => !x.kid)) psyOf(g, p.id).stress = 90;
    const kid = g.people.find(p => p.kid)!;
    const k0 = psyOf(g, kid.id).stress;
    for (let d = 0; d < 10; d++) { for (const p of g.people.filter(x => !x.kid)) psyOf(g, p.id).stress = 90; g.clock.t += 1; mindDay(g); }
    expect(psyOf(g, kid.id).stress).toBeGreaterThan(k0);
  });

  it('it shows in the log, and in the morale target (needs.ts)', () => {
    const g = afterHit(12);
    for (const p of g.people) shock(g, p.id, 'raid', 60);
    g.clock.t += 15;
    const lines: string[] = [];
    for (let d = 0; d < 40; d++) { g.clock.t += 1; lines.push(...mindDay(g)); }
    expect(lines.length).toBeGreaterThan(2);
    const calm = afterHit(12);
    for (let d = 0; d < 30; d++) { calm.clock.t += 1; g.clock.t += 1; liveDay(calm, 0.5); liveDay(g, 0.5); }
    expect(g.personState[0].needs.morale).toBeLessThan(calm.personState[0].needs.morale);
  });
});

describe('save', () => {
  it('a v39 save migrates to v46 with past losses already grieved', () => {
    const g = afterHit(13);
    kill(g, 1);
    const raw = JSON.parse(JSON.stringify(g)) as Record<string, unknown>;
    delete raw.mind; delete raw.medical; delete raw.learning;
    raw.version = 39;
    const m = migrate(raw);
    expect(m.version).toBe(46);
    expect(m.mind!.seenDead).toContain(g.people[1].id);
    mindDay(m);
    expect(psyOf(m, m.people[0].id).grief.length).toBe(0);
    expect(m.medical!.cases).toEqual([]);
    expect(m.learning!.xp).toEqual({});
  });
});

describe('afterFight is safe on a battle with nobody from the family in it', () => {
  it('does nothing harmful', () => {
    const g = afterHit(14);
    afterFight(g, { units: [], events: [], duration: 0, night: false } as unknown as Parameters<typeof afterFight>[1]);
    expect(mindOf(g).lastFight).toBeGreaterThan(0);
  });
});
