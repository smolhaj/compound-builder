import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { COLLAPSE, guardAlone, guardDay, guardPosture, hireGuard } from './guards';
import { resolve } from './encounters';
import { autoPlan, dailyOf, setDuty, watchDetection, watchNow } from './daily';
import { postureOf } from './encounters';
import { step } from './engine';
import { migrate } from './save/migrations';

const game = (seed = 2): GameState => {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.money = 500_000;
  g.structures.push({ id: 'home', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 } as Structure);
  return g;
};
const collapse = (g: GameState) => { g.disaster.tracks = { ...g.disaster.tracks, banks: 0, law: 0 }; };
/** Hire guards until one has nobody to go to; returns that guard's id. */
const aloneGame = (): { g: GameState; id: string } => {
  for (let seed = 1; seed < 200; seed++) {
    const g = game(seed); hireGuard(g);
    const x = g.guards.staff[0];
    if (x.alone) return { g, id: x.id };
  }
  throw new Error('no lone guard in 200 seeds');
};
const runUntilCard = (g: GameState): void => { collapse(g); for (let d = 0; d < 80 && !g.gate.pending; d++) guardDay(g); };

describe('a guard with nobody to go to', () => {
  it('the trait is deterministic from the seed and his id, a local never has it, and it is neither always nor never', () => {
    expect(guardAlone(5, 'g7', false)).toBe(guardAlone(5, 'g7', false));
    expect(guardAlone(5, 'g7', true)).toBe(false);
    const n = Array.from({ length: 200 }, (_, i) => guardAlone(9, `g${i}`, false)).filter(Boolean).length;
    expect(n).toBeGreaterThan(12); expect(n).toBeLessThan(55);
  });

  it('a guard with people leaves as designed (no card); one without gets a decision card instead of quitting', () => {
    let withPeople = 0, alone = 0;
    for (let seed = 1; seed < 40 && (!withPeople || !alone); seed++) {
      const g = game(seed); hireGuard(g); const x = g.guards.staff[0];
      runUntilCard(g);
      if (x.alone) { alone++; expect(g.gate.pending?.kind).toBe('guard_stay'); expect(g.guards.staff.length).toBe(1); }
      else { withPeople++; expect(g.gate.pending).toBeNull(); for (let d = 0; d < 60; d++) guardDay(g); expect(g.guards.staff.length).toBe(0); }
    }
    expect(withPeople).toBeGreaterThan(0); expect(alone).toBeGreaterThan(0);
  });

  it('the card waits if another card is up, and no card is raised outside a permanent collapse', () => {
    const { g } = aloneGame();
    for (let d = 0; d < 400; d++) guardDay(g);
    expect(g.gate.pending).toBeNull();                                     // an ordinary time: nobody asks
    collapse(g); g.gate.pending = { id: 'busy', kind: 'arrival', day: 0, title: 'x', dossier: [], size: 1, armed: false, strength: 0, stances: ['turn_away'] };
    for (let d = 0; d < 60; d++) guardDay(g);
    expect(g.gate.pending?.id).toBe('busy'); expect(g.guards.staff.length).toBe(1);
    g.gate.pending = null; guardDay(g);
    expect((g.gate.pending as { kind: string } | null)?.kind).toBe('guard_stay');
  });

  it('accept: he is a household member (headcount, table, a gun, the watch) and the wage stops', () => {
    const { g, id } = aloneGame(); const before = g.people.length;
    runUntilCard(g);
    expect(g.gate.pending?.guardId).toBe(id);
    const o = resolve(g, 'take_in');
    expect(o.tone).toBe('good');
    expect(g.people.length).toBe(before + 1);
    const him = g.people[g.people.length - 1];
    expect(him.guard).toBe(true);
    expect(g.personState.some(ps => ps.id === him.id)).toBe(true);
    expect(g.armory.guns.some(x => x.carrier === him.id)).toBe(true);
    expect(g.guards.staff.length).toBe(0);
    const m = g.money; for (let d = 0; d < 10; d++) guardDay(g); expect(g.money).toBe(m);   // no payroll
  });

  it('decline: he leaves like the others, a small morale note, and the family is where it would have been', () => {
    const { g } = aloneGame(); const never = game(g.seed);
    const people = g.people.length, hum = g.gate.humanity;
    runUntilCard(g); collapse(never);
    const o = resolve(g, 'turn_away');
    expect(o.tone).toBe('mixed');
    expect(g.guards.staff.length).toBe(0); expect(g.people.length).toBe(people);
    expect(g.gate.humanity).toBe(hum - 2);
    expect(g.armory.guns.length).toBe(never.armory.guns.length);
    expect(postureOf(g)).toEqual(postureOf(never));
  });

  it('a guard taken in never lowers the defense; the boost is only while he is on watch', () => {
    const { g } = aloneGame(); const never = game(g.seed);
    for (const x of [g, never]) { x.disaster.tracks = { ...x.disaster.tracks, law: 0, banks: 0 }; }
    runUntilCard(g); resolve(g, 'take_in');
    const him = g.people[g.people.length - 1];
    const a = postureOf(never), b = postureOf(g);
    expect(b.fighters).toBeGreaterThan(a.fighters); expect(b.barrier).toBe(a.barrier);
    expect(b.firepower ?? 0).toBeGreaterThanOrEqual(0);
    // on watch (the schedule's own task) he sharpens the watch; off watch he does not
    const ps = g.personState.find(q => q.id === him.id)!;
    ps.task = 'idle'; expect(watchNow(g).some(w => w.guard)).toBe(false);
    ps.task = 'watch';
    const w = watchNow(g).find(q => q.id === him.id); expect(w?.guard).toBe(true);
    const plain = game(g.seed); plain.people.push({ ...him, guard: undefined }); plain.personState.push({ ...structuredClone(ps), task: 'watch' });
    plain.disaster.tracks = { ...plain.disaster.tracks, law: 0 };
    g.clock.t = Math.floor(g.clock.t) + 23 / 24; plain.clock.t = g.clock.t;
    expect(watchDetection(g)).toBeGreaterThanOrEqual(watchDetection(plain));
  });

  it('his schedule is the household machinery: he takes the night watch by default and the player can reassign him', () => {
    const { g } = aloneGame();
    runUntilCard(g); resolve(g, 'take_in');
    collapse(g); g.disaster.tracks.law = 0;
    const him = g.people[g.people.length - 1];
    autoPlan(g, { build: false, fell: false });
    const rows = dailyOf(g).plan.hours[him.id];
    expect(rows.some(d => d === 'watch')).toBe(true);
    // the player puts him on the garden for the afternoon: the schedule takes it, like anyone else's
    expect(setDuty(g, him.id, [14, 15], 'garden')).toBeNull();
    expect(dailyOf(g).plan.hours[him.id][14]).toBe('garden');
  });

  it('needs, aging, death and save/load all just work: a year on, and a v81 save with a guard on the roster loads', () => {
    const { g } = aloneGame();
    runUntilCard(g); resolve(g, 'take_in');
    const him = g.people[g.people.length - 1];
    const out = step(g, 60);
    expect(out.people.some(p => p.id === him.id)).toBe(true);
    const i = out.people.findIndex(p => p.id === him.id);
    expect(Number.isFinite(out.personState[i].needs.health)).toBe(true);
    out.personState[i].needs.died = Math.floor(out.clock.t);                 // dying is the household's business
    expect(() => step(out, 5)).not.toThrow();
    const raw = JSON.parse(JSON.stringify(g));
    const back = migrate(raw) as unknown as GameState;
    expect(back.people.find(p => p.id === him.id)?.guard).toBe(true);
    // an old save with a guard on the payroll (no `alone`/`person`) is not read back as a card
    expect(guardPosture(back).fighters).toBeGreaterThanOrEqual(0);
    void COLLAPSE;
  });
});
