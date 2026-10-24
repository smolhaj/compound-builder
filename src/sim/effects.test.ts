import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { DISASTERS, newDisaster, SURPRISE_POOL, type DisasterKind } from './disaster';
import { climate, effectsDay, wellYield } from './effects';
import { resolve } from './encounters';
import { postureOf, whoComes } from './encounters';
import { mulberry32 } from './rng';

const run = (kind: DisasterKind, variant?: string, seed = 1) => newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind, variant });
const at = (g: GameState, days: number) => { g.clock.t = g.disaster.hitAt + days; return g; };
const built = (g: GameState, id: string, kind: string): Structure => { const st: Structure = { id, kind, x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };

describe('all sixteen disasters', () => {
  it('every one has a ruleset; Surprise rolls only the grounded ones', () => {
    const all: DisasterKind[] = ['grid_down', 'financial', 'lawless', 'drought', 'pandemic', 'nuclear', 'solar_flare', 'wildfire', 'ash_winter', 'cyberattack', 'zombies', 'invasion', 'civil_war', 'bioweapon', 'asteroid', 'unknown'];
    for (const k of all) expect(DISASTERS[k], k).toBeDefined();
    expect(SURPRISE_POOL.every(k => !DISASTERS[k]!.pulpy)).toBe(true);
    for (let s = 1; s < 40; s++) expect(DISASTERS[newDisaster(s, 'surprise').kind!]!.pulpy).toBe(false);
  });

  it('drought: the hand-dug well fails first, the drilled well holds on; the garden needs stored water', () => {
    const g = at(run('drought'), 60);
    expect(wellYield(g, 'well_hand')).toBe(0);
    expect(wellYield(g, 'well_drilled')).toBeGreaterThan(0.5);
    expect(climate(g).grow).toBeLessThan(0.5);
    g.utilities.storedL = 8000;
    expect(climate(g).grow).toBeGreaterThan(0.5);
  });

  it('ash winter and an impact winter cut the growing season for years', () => {
    expect(climate(at(run('ash_winter'), 100)).grow).toBeLessThan(0.3);
    expect(climate(at(run('ash_winter'), 800)).grow).toBe(1);
    expect(climate(at(run('asteroid'), 400)).grow).toBeLessThan(0.15);
  });

  it('ash brings down long low roofs: they go back to the roofing stage', () => {
    let fell = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const g = at(run('ash_winter', undefined, seed), 5);
      built(g, 'w', 'workshop');
      effectsDay(g);
      if (g.structures[0].finishedAt === null) fell++;
    }
    expect(fell).toBeGreaterThan(2);
  });

  it('wildfire: buildings deep in the timber burn; cleared ground saves them', () => {
    let thick = 0, clear = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const a = at(run('wildfire', undefined, seed), 0.1), b = at(run('wildfire', undefined, seed), 0.1);
      built(a, 'c', 'timber_cabin'); built(b, 'c', 'timber_cabin');
      a.disaster.fuel = { c: 14 }; b.disaster.fuel = { c: 0 };
      effectsDay(a); effectsDay(b);
      if (a.structures[0].finishedAt === null) thick++;
      if (b.structures[0].finishedAt === null) clear++;
    }
    expect(thick).toBeGreaterThan(clear + 10);
  });

  it('pandemic: taking people in can bring it home', () => {
    let sick = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = at(run('bioweapon', undefined, seed), 20);
      g.gate.pending = { id: 'x', kind: 'arrival', day: 1, title: '', dossier: [], size: 1, armed: false, strength: 0, people: [], stances: ['take_in'] };
      resolve(g, 'take_in');
      if (g.personState.some(ps => ps.needs.hurt.some(h => h.what === 'fever'))) sick++;
    }
    expect(sick).toBeGreaterThan(8);
  });

  it('zombies bring hordes; the unknown event takes neighbors', () => {
    const z = at(run('zombies'), 20);
    z.disaster.tracks = { ...z.disaster.tracks, law: 0 };
    const r = mulberry32(3), p = postureOf(z);
    let hordes = 0;
    for (let i = 0; i < 500; i++) if (whoComes(z, p, r) === 'horde') hordes++;
    expect(hordes).toBeGreaterThan(100);
    const u = at(run('unknown'), 0.2);
    effectsDay(u);
    expect(u.neighbors.some(n => n.status === 'gone')).toBe(true);
  });
});
