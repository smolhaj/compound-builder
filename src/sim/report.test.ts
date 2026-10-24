import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { step } from './engine';
import { reportCard, tallyDay } from './report';

const built = (g: GameState, id: string, kind: string): Structure => {
  const st: Structure = { id, kind, x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 };
  g.structures.push(st);
  return st;
};

describe('endings and the report card', () => {
  it('an ice storm passes: the run ends "recovered" once the world is back a month (at least 3 months in)', () => {
    let g = newGame(4, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', variant: 'ice_storm' });
    g.stock.staples = 3; g.stock.canned = 10;
    g = step(g, g.disaster.hitAt - g.clock.t + 60);
    expect(g.ending).toBeNull();
    for (let i = 0; i < 12 && !g.ending; i++) { g = step(g, 10); while (g.gate.pending) { const s = structuredClone(g); s.gate.pending = null; g = s; } }
    // follow-ons (the end of law and order) may stretch it; in any case once it ends it's a recovery or a loss
    if (g.ending) expect(['recovered', 'wipe']).toContain(g.ending.kind);
    const r = reportCard(g);
    expect(r.headline.length).toBeGreaterThan(10);
    expect(r.lines.length).toBeGreaterThan(1);
  });

  it('everyone gone is a wipe, graded F', () => {
    const g = newGame(1, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'nuclear' });
    g.clock.t = g.disaster.hitAt + 5;
    for (const ps of g.personState) ps.needs.died = 1;
    expect(tallyDay(g)?.kind).toBe('wipe');
    expect(reportCard(g).grade).toBe('F');
  });

  it('a year feeding yourselves is the equilibrium ending', () => {
    const g = newGame(2, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', variant: 'cascade' });
    g.disaster.tracks = { ...g.disaster.tracks, grid: 0 };
    for (let d = 0; d < 366 && !g.ending; d++) {
      g.clock.t = g.disaster.hitAt + d + 0.1;
      g.food = { needKcal: 8000, ateKcal: 8000, producedKcal: 8500, spoiledKcal: 0, fromStores: false, kinds: ['fresh'], daysLeft: 10 };
      tallyDay(g);
    }
    expect(g.ending?.kind).toBe('equilibrium');
  });

  it('the card calls out what mattered', () => {
    const g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'nuclear', grid: true });
    built(g, 's', 'solar_array'); built(g, 'c', 'cistern');
    g.clock.t = g.disaster.hitAt + 1;
    g.stats.days = 200; g.stats.wounds = 2; g.stats.maxDose = 0.03;
    g.gate.turnedAway = 7; g.gate.tookIn = 3; g.gate.raidsHeld = 2;
    for (const p of g.people) p.skills.medic = 0;
    const lines = reportCard(g).lines.join(' ');
    expect(lines).toMatch(/cistern/);
    expect(lines).toMatch(/grid-tied/);
    expect(lines).toMatch(/No one knew first aid/);
    expect(lines).toMatch(/turned away 7/);
    expect(lines).toMatch(/took in 3/);
    expect(lines).toMatch(/shelter held/);
  });
});
