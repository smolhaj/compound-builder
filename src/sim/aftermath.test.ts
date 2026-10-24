import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { canJoin, joinPrisoner, leaveAftermath, prisonersDay, releasePrisoner, resolveAftermath } from './aftermath';
import { applyBattle, planBattle } from './battle';
import { planRun } from './perimeter';
import { migrate } from './save/migrations';

function after(seed = 1): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.25;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  g.stock.meds = 3; g.stock.staples = 2; g.stock.canned = 10;
  return g;
}
const days = (g: GameState, n: number) => { for (let i = 0; i < n; i++) { g.clock.t += 1; prisonersDay(g); } };

describe('after the shooting', () => {
  it('a won fight leaves the downed raiders on the drive, and a decision waiting', () => {
    let waiting = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = after(seed);
      g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
      const r = planRun(g, 'container_wall', [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]]); r.done = r.hours; r.supplied = true; r.finishedAt = 0;
      for (const [i, p] of g.people.entries()) if (!p.kid) g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id });
      g.armory.ammo['556'] = 1000;
      const b = planBattle(g, 6, seed);
      applyBattle(g, b);
      if (b.result === 'repelled' || b.result === 'fled') {
        if ((b.leftBehind?.wounded ?? 0) + (b.leftBehind?.dead ?? 0) > 0) { expect(g.gate.aftermath).toBeTruthy(); waiting++; }
      } else expect(g.gate.aftermath ?? null).toBeNull();
    }
    expect(waiting).toBeGreaterThan(0);
  });

  it('patching them up costs dressings and raises humanity; finishing them costs a lot of it and the family\'s morale', () => {
    const a = after(); leaveAftermath(a, 2, 1);
    const h0 = a.gate.humanity, meds0 = a.stock.meds;
    resolveAftermath(a, 'treat_release');
    expect(a.gate.humanity).toBeGreaterThan(h0);
    expect(a.stock.meds).toBe(meds0 - 2);
    expect(a.gate.aftermath).toBeNull();
    const b = after(); leaveAftermath(b, 2, 0);
    const m0 = b.personState[0].needs.morale;
    resolveAftermath(b, 'finish');
    expect(b.gate.humanity).toBeLessThan(h0 - 15);
    expect(b.personState[0].needs.morale).toBeLessThan(m0 - 10);
    expect(b.gate.executed).toBe(2);
    const c = after(); leaveAftermath(c, 1, 0); resolveAftermath(c, 'leave');
    expect(c.gate.humanity).toBeLessThan(h0);
    expect(c.gate.humanity).toBeGreaterThan(b.gate.humanity);
  });

  it('prisoners eat, may talk, may slip away; one who comes round can join the family', () => {
    let talked = 0, escaped = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = after(seed); g.gate.humanity = 80; leaveAftermath(g, 2, 0); resolveAftermath(g, 'hold');
      expect(g.gate.prisoners).toHaveLength(2);
      days(g, 60);
      expect(g.stock.staples).toBeLessThan(2);
      talked += g.gate.prisoners!.filter(p => p.talked).length + (g.log.some(l => l.text.includes('told you')) ? 1 : 0);
      escaped += 2 - g.gate.prisoners!.length;
      const p = g.gate.prisoners![0];
      if (p && canJoin(g, p)) { const n0 = g.people.length; expect(joinPrisoner(g, p.id)).toBeNull(); expect(g.people.length).toBe(n0 + 1); }
    }
    expect(talked).toBeGreaterThan(0);
    expect(escaped).toBeGreaterThan(0);
    const g = after(); leaveAftermath(g, 1, 0); resolveAftermath(g, 'hold');
    expect(joinPrisoner(g, g.gate.prisoners![0].id)).toBe('not yet');
    expect(releasePrisoner(g, g.gate.prisoners![0].id)).toBeNull();
    expect(g.gate.prisoners).toHaveLength(0);
  });

  it('save v33: old saves get no prisoners and no decision waiting', () => {
    const g = newGame(2) as unknown as Record<string, unknown>;
    const gate = { ...(g.gate as Record<string, unknown>) }; delete gate.aftermath; delete gate.prisoners;
    const s = migrate({ ...g, version: 32, gate });
    expect(s.gate.prisoners).toEqual([]);
    expect(s.gate.aftermath).toBeNull();
  });
});
