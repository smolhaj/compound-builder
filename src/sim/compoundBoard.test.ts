import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { planStructure } from './construction';
import { planRun } from './perimeter';
import { hireGuard } from './guards';
import { triggerDisaster } from './disaster';
import { boardCache, BOARD, compoundBoard } from './compoundBoard';

const fresh = (): GameState => { const g = newGame(11); g.structures = []; g.perimeter = []; g.site = { ...g.site, gwDepth: 5 }; return g; };
const done = (g: GameState, kind: string, x = 0, z = 0) => { const st = planStructure(g, kind, x, z, 0)!; st.finishedAt = 0; st.stage = 99; return st; };
const midGame = (): GameState => {
  const g = fresh();
  done(g, 'timber_cabin', 0, 0); done(g, 'well_hand', 6, 0); done(g, 'solar_array', 0, 6); done(g, 'garden', 6, 6);
  g.money = 60000;
  for (let i = 0; i < 2; i++) hireGuard(g);
  const r = planRun(g, 'barbed_wire', [[-10, -10], [10, -10], [10, 10]]); r.done = r.hours; r.supplied = true; r.finishedAt = 0;
  return g;
};

describe('the compound board', () => {
  it('a fresh start says what is missing, with a fix on each row and nothing about threats', () => {
    const b = compoundBoard(fresh());
    expect(b.vitals.map(v => v.id)).toEqual(['power', 'water', 'food', 'defense', 'morale']);
    expect(b.operational.total).toBe(5);
    expect(b.operational.done).toBeLessThan(5);
    expect(b.vitals.find(v => v.id === 'water')!.fix?.act).toEqual({ type: 'stake', kind: 'well_hand' });
    expect(b.vitals.find(v => v.id === 'power')!.value.length).toBeGreaterThan(0);
    expect(b.threats).toEqual([]);
    expect(b.allClear).toBe(false);
    // the shelter item has no row, so it comes up under decisions
    expect(b.decisions.some(d => d.id === 'op:shelter')).toBe(true);
  });

  it('every jump is an act the HUD can run and every row opens a tab', () => {
    for (const g of [fresh(), midGame()]) {
      const b = compoundBoard(g);
      const acts = [...b.vitals.flatMap(v => [v.open, v.fix?.act]), ...[...b.gaps, ...b.threats, ...b.decisions].map(i => i.act?.act)].filter(Boolean);
      for (const a of acts) expect(['open', 'select', 'stake', 'shop', 'order']).toContain(a!.type);
      for (const v of b.vitals) expect(v.open.type).toBe('open');
    }
  });

  it('mid-game with a roof, a well, solar, a garden, guards and a wall reads better and lists real defense gaps', () => {
    const g = midGame();
    const b = compoundBoard(g);
    expect(b.operational.done).toBeGreaterThanOrEqual(4);
    expect(b.vitals.find(v => v.id === 'water')!.fix).toBeUndefined();
    expect(b.vitals.find(v => v.id === 'food')!.value).toContain('put by');
    expect(b.vitals.find(v => v.id === 'defense')!.value).toMatch(/of 100/);
    expect(b.gaps.length).toBeGreaterThan(0);
    expect(b.gaps.length).toBeLessThanOrEqual(BOARD.gaps);
    // red gaps sort before amber ones
    const tones = b.gaps.map(x => (x.tone === 'bad' ? 0 : 1));
    expect([...tones].sort()).toEqual(tones);
    expect(compoundBoard(fresh()).operational.done).toBeLessThan(b.operational.done);
  });

  it('a crisis shows up: warning of a disaster, hurt people, a bad mood, dry taps, a card at the gate', () => {
    const g = midGame();
    triggerDisaster(g.disaster, g.clock.t, 'grid_down', g.seed, 10);
    g.clock.t += 0.01;
    g.personState[0].needs.health = 20;
    g.personState.forEach(p => { p.needs.morale = Math.min(p.needs.morale, 30); });
    g.gate.pending = { id: 'e1', kind: 'arrivals', day: 0, title: 'A family on the road', dossier: [], size: 3, armed: false, strength: 10 } as unknown as NonNullable<GameState['gate']['pending']>;
    g.utilities.report.shortL = 40;
    const b = compoundBoard(g);
    expect(b.threats.map(t => t.id)).toEqual(expect.arrayContaining(['disaster', 'hurt']));
    expect(b.threats.length).toBeLessThanOrEqual(BOARD.threats);
    expect(b.vitals.find(v => v.id === 'water')).toMatchObject({ tone: 'bad', value: 'ran short yesterday' });
    expect(b.vitals.find(v => v.id === 'morale')!.tone).toBe('bad');
    expect(b.decisions.some(d => d.id === 'gate')).toBe(true);
    expect(b.allClear).toBe(false);
  });

  it('changes nothing it reads (the first call may create the empty lazy defaults the sim makes anyway)', () => {
    const g = midGame();
    compoundBoard(g);
    const before = JSON.stringify(g);
    compoundBoard(g);
    expect(JSON.stringify(g)).toBe(before);
  });

  it('is deterministic and the cache holds the answer until the day or a named thing changes', () => {
    const g = midGame();
    expect(JSON.stringify(compoundBoard(g))).toBe(JSON.stringify(compoundBoard(g)));
    const get = boardCache();
    const a = get(g);
    expect(get(g)).toBe(a);
    g.clock.t += 0.2;   // the same day
    expect(get(g)).toBe(a);
    g.clock.t += 1;
    expect(get(g)).not.toBe(a);
    const b = get(g);
    g.gate.pending = {} as NonNullable<GameState['gate']['pending']>;
    expect(get(g)).not.toBe(b);
  });

  it('costs little: a few milliseconds on a built-up place', () => {
    const g = midGame();
    for (let i = 0; i < 20; i++) done(g, 'cottage', 20 + i * 4, 20);
    compoundBoard(g);   // warm
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) compoundBoard(g);
    const per = (performance.now() - t0) / 20;
    console.log(`compoundBoard: ${per.toFixed(2)} ms per call`);
    expect(per).toBeLessThan(40);
  });
});
