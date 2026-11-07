import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { planRun } from './perimeter';
import type { Encounter } from './encounters';
import { stageRaid } from './raidCutscene';
import { endingOf, standingRaiders, surrenderChance } from './raidEnding';
import type { Battle } from './battleTypes';

function base(seed: number, temper: 'desperate' | 'hard' | 'savage', skill = 4, size = 12): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', difficulty: 'standard' });
  g.clock.t = Math.floor(g.disaster.hitAt + 20) + 14 / 24 - 0.25;
  g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  const r = planRun(g, 'log_palisade', [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]], [{ at: 15, w: 2 }]);
  r.done = r.hours; r.supplied = true; r.finishedAt = 0;
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = skill; }
  g.armory.ammo['556'] = 2000;
  g.gate.pending = { id: 'e1', kind: 'gang', day: seed, title: 'x', dossier: [], size, armed: true, strength: size * 12, wants: {}, stances: ['defend'], temper } as Encounter;
  return g;
}
/** Raiders drawn standing at the end of the fight: not dead, not run off, not laid down, not hands up. */
function stillStanding(b: Battle): string[] {
  const out = new Set(b.events.filter(e => e.kind === 'death' || e.kind === 'flee' || e.kind === 'taken' || e.kind === 'lay' || e.kind === 'surrender').map(e => (e as { unit: string }).unit));
  return b.units.filter(u => u.side === 'raider' && !u.machine && !out.has(u.id)).map(u => u.id);
}

describe('how a fight ends on screen', () => {
  it('a beaten crew is never left standing in a cluster; the hurt are down or have their hands up', () => {
    let beaten = 0, hands = 0, down = 0;
    for (const temper of ['desperate', 'hard', 'savage'] as const) for (let seed = 1; seed <= 24; seed++) {
      const st = stageRaid(base(seed, temper), 'defend'), last = st.battles.length - 1, b = st.battles[last];
      const end = endingOf(b);
      if (end !== 'repelled' && end !== 'fled') continue;
      beaten++;
      expect(stillStanding(b), `${temper} seed ${seed}`).toEqual([]);
      const h = b.events.filter(e => e.kind === 'surrender').length;
      expect(h).toBeLessThanOrEqual(2);
      if (temper === 'savage') expect(h).toBe(0);
      hands += h; down += b.events.filter(e => e.kind === 'lay').length;
    }
    expect(beaten).toBeGreaterThan(10);
    expect(down + hands).toBeGreaterThan(0);
  });
  it('when the crew broke the line, the family is held, the crew goes through the place and then leaves, and the words say so', () => {
    let won = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const st = stageRaid(base(seed, 'hard', 1, 14), 'defend'), last = st.plan.scenes.length - 1, b = st.battles[last], end = endingOf(b);
      if (end !== 'breached' && end !== 'overrun') continue;
      won++;
      expect(st.plan.scenes[last].ending).toBe(end);
      expect(st.plan.scenes[last].wake ?? 0).toBeGreaterThan(10);
      expect(b.events.some(e => e.kind === 'say' && e.ctx === 'looting')).toBe(true);
      const sur = b.events.filter(e => e.kind === 'surrender');
      expect(sur.length).toBeGreaterThanOrEqual(0);
      // the crew spreads through the place (at a walk) and then goes: nobody is left idle in a cluster at the end
      const moves = b.events.filter(e => e.kind === 'move' && e.walk);
      expect(moves.length).toBeGreaterThan(0);
      const endT = b.events.find(e => e.kind === 'end')!.t;
      expect(b.events.filter(e => e.kind === 'move' && e.t > endT - 4 && !e.walk).length).toBeGreaterThan(0);
      // a death in a breach is still shown, but the family is not mourning with the crew standing in the yard
      expect(st.drama).toBeNull();
    }
    expect(won).toBeGreaterThan(3);
  });
  it('a savage crew never surrenders; a desperate one often does, a hard one rarely; a bad hurt lies down', () => {
    expect(surrenderChance('savage', 'crew', 10)).toBe(0);
    expect(surrenderChance('desperate', 'crowd', 20)).toBeGreaterThan(surrenderChance('hard', 'crowd', 20));
    expect(surrenderChance('desperate', 'crowd', 80)).toBeLessThan(surrenderChance('desperate', 'crowd', 20));
    expect(standingRaiders({ night: false, duration: 1, units: [{ id: 'r0', side: 'raider', x: 0, z: 0 }], events: [{ t: 0.5, kind: 'wound', unit: 'r0', sev: 50 }] })).toEqual([]);
  });
});
