import { describe, expect, it } from 'vitest';
import { MAX_FIRES, fireHands, firePower, setAllHands, startFires, tickRaidFires } from './raidFire';
import { newGame, type GameState } from './state';

const withBarn = (): GameState => { const g = newGame(4); g.structures.push({ id: 'barn1', kind: 'barn', x: 10, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 }, { id: 'coop1', kind: 'chicken_coop', x: 13, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 }); return g; };

describe('a fire a raid set', () => {
  it('starts only on a finished structure, once, and says so', () => {
    const g = withBarn();
    expect(startFires(g, [{ structure: 'barn1', x: 10, z: 0 }, { structure: 'barn1', x: 10, z: 0 }, { structure: 'nope', x: 0, z: 0 }]).length).toBe(1);
    expect(g.raidFires!.length).toBe(1);
  });
  it('is fought: able hands and water put a small fire out; with nobody it burns down and leaves a scar to clear', () => {
    const g = withBarn(); startFires(g, [{ structure: 'barn1', x: 10, z: 0 }]);
    expect(fireHands(g)).toBeGreaterThan(0);
    const out: string[] = []; for (let h = 0; h < 30 && g.raidFires?.length; h++) out.push(...tickRaidFires(g));
    expect(g.raidFires).toBeUndefined();
    const b = withBarn(); startFires(b, [{ structure: 'barn1', x: 10, z: 0 }]);
    b.personState.forEach(ps => { ps.task = 'away'; });
    const lines: string[] = []; for (let h = 0; h < 30 && b.raidFires?.length; h++) lines.push(...tickRaidFires(b));
    expect(lines.join(' ')).toMatch(/burned to the ground/);
    expect(b.raidDamage?.some(d => d.kind === 'burn')).toBe(true);
    expect(b.raidFires).toBeUndefined();
  });
  it('spreads to a wooden neighbor when nobody fights it', () => {
    let jumped = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = withBarn(); g.seed = seed; startFires(g, [{ structure: 'barn1', x: 10, z: 0 }]); g.personState.forEach(ps => { ps.task = 'away'; });
      for (let h = 0; h < 8 && g.raidFires?.length; h++) { g.clock.ticks = h * 4; if (tickRaidFires(g).some(l => /jumped/.test(l))) { jumped++; break; } }
    }
    expect(jumped).toBeGreaterThan(0);
  });
  it('all hands is stronger than the usual share', () => { const g = withBarn(); expect(firePower(g, true)).toBeGreaterThan(firePower(g, false)); startFires(g, [{ structure: 'barn1', x: 10, z: 0 }]); setAllHands(g, true); expect(g.raidFires![0].allHands).toBe(true); });
  it('the state is bounded: never more than MAX_FIRES, and a fire cannot burn forever', () => {
    const g = newGame(5);
    for (let i = 0; i < 20; i++) g.structures.push({ id: `s${i}`, kind: 'chicken_coop', x: i, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    startFires(g, g.structures.filter(s => s.id.startsWith('s')).map(s => ({ structure: s.id, x: s.x, z: s.z })));
    expect(g.raidFires!.length).toBeLessThanOrEqual(MAX_FIRES);
    g.personState.forEach(ps => { ps.task = 'away'; });
    for (let h = 0; h < 200; h++) { g.clock.ticks = h * 4; tickRaidFires(g); expect((g.raidFires ?? []).length).toBeLessThanOrEqual(MAX_FIRES); }
  });
  it('an old save without fires ticks to nothing', () => { expect(tickRaidFires(newGame(1))).toEqual([]); });
});
