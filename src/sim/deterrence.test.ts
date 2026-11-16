import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { postureOf, fightOdds, hideFoundChance, type Encounter } from './encounters';
import { deterrence, turnBackChance, nerveK, lootPoints, lootK, deterLine } from './deterrence';
import { hireGuard } from './guards';
import { planBattle } from './battle';
import { emptyStock } from './materials';
import { isFinished } from './construction';

const game = (): GameState => {
  const g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.money = 3_000_000; g.stock = emptyStock();
  g.structures.push({ id: 'h1', kind: 'timber_cabin', x: 10, z: 10, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never);
  return g;
};
const crew = (kind: Encounter['kind'] = 'looters', size = 6): Encounter => ({ id: 'e1', kind, day: 100, title: 't', dossier: [], size, armed: true, strength: 50, stances: ['defend'], temper: 'desperate' });

describe('first-contact deterrence', () => {
  it('rises with each thing a family pays for', () => {
    const g = game();
    const d0 = deterrence(g, postureOf(g)).score;
    for (let i = 0; i < 3; i++) expect(hireGuard(g)).toBeNull();
    const d1 = deterrence(g, postureOf(g)).score;
    expect(d1).toBeGreaterThan(d0 + 0.15);
    g.stock.cameras = 2; g.stock.thermal_cam = 1; g.utilities.lit = [g.structures[0].id];
    const d2 = deterrence(g, postureOf(g)).score;
    expect(d2).toBeGreaterThan(d1);
    expect(deterrence(g, postureOf(g)).lines.join()).toMatch(/guard/);
  });
  it('turns back opportunists much more than savage crews or hordes, never an angry one, and is capped', () => {
    const lo = turnBackChance(0.8, crew('looters')), gang = turnBackChance(0.8, crew('gang')), horde = turnBackChance(0.8, crew('horde'));
    expect(lo).toBeGreaterThan(gang); expect(gang).toBeGreaterThan(horde);
    expect(turnBackChance(0.8, { ...crew('looters'), temper: 'savage' })).toBeLessThan(lo / 2);
    expect(turnBackChance(0.8, crew('looters'), true)).toBe(0);
    expect(turnBackChance(0.9, crew('refugees', 2))).toBeLessThanOrEqual(0.7);
    expect(turnBackChance(0, crew())).toBe(0);
  });
  it('raiders break after fewer losses (nerve) and the gate odds rise with spending', () => {
    expect(nerveK(0)).toBe(1); expect(nerveK(0.9)).toBeLessThan(0.6);
    const g = game();
    const base = fightOdds(g, crew('gang', 7), 12);
    for (let i = 0; i < 3; i++) hireGuard(g);
    g.stock.cameras = 2; g.utilities.lit = [g.structures[0].id];
    const rich = fightOdds({ ...g, clock: { ...g.clock, ticks: g.clock.ticks + 1 } } as GameState, { ...crew('gang', 7), id: 'e2' }, 12);
    expect(rich.deter!).toBeGreaterThan(base.deter!);
    expect(rich.win).toBeGreaterThan(base.win);
    expect(rich.loseSomeone).toBeLessThanOrEqual(base.loseSomeone);
  });
  it('the battle ends sooner on average with deterrence', () => {
    const g = game();
    let a = 0, b = 0;
    for (let i = 0; i < 12; i++) {
      const x = planBattle(g, 6, 900 + i, { temper: 'desperate', organized: false, armed: true });
      const y = planBattle(g, 6, 900 + i, { temper: 'desperate', organized: false, armed: true, deter: 0.9 });
      a += x.events.filter(e => e.kind === 'death' && e.unit.startsWith('r')).length; b += y.events.filter(e => e.kind === 'death' && e.unit.startsWith('r')).length;
    }
    expect(b).toBeLessThanOrEqual(a);
  });
  it('words: nothing said for a bare place', () => {
    const g = game();
    expect(deterLine(deterrence(g, postureOf(g)), 0)).toBe('');
  });
});

describe('a hide is worse the more there is to find', () => {
  it('a stocked, built-up place is easier to find than a bare one', () => {
    const g = game();
    const e = crew('looters');
    const bare = hideFoundChance(g, e);
    g.stock.canned = 4000; g.stock.staples = 4000;
    for (let i = 0; i < 12; i++) g.structures.push({ id: 's' + i, kind: 'barn', x: 20 + i, z: 20, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never);
    expect(g.structures.filter(isFinished).length).toBeGreaterThan(8);
    expect(lootPoints(g)).toBeGreaterThan(5);
    expect(lootK(g)).toBeGreaterThan(1);
    expect(hideFoundChance(g, e)).toBeGreaterThan(bare + 0.05);
  });
  it('Hardcore keeps its old hiding (owner rule)', () => {
    const g = game(); g.disaster.difficulty = 'hardcore';
    const e = crew('looters');
    const bare = hideFoundChance(g, e);
    g.stock.canned = 4000; g.stock.staples = 4000;
    expect(hideFoundChance(g, e)).toBe(bare);
  });
});
