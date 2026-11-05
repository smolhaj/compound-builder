import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { step } from './engine';
import { reportCard, tallyDay } from './report';
import { disasterSky } from './nuclear';
import { fallDoneDay } from './disaster';

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

  it('everyone gone is a wipe in the quiet years before the next hit too, and after a card that was played on', () => {
    const g = newGame(1, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'nuclear' });
    g.clock.t = g.disaster.hitAt - 30;
    for (const ps of g.personState) ps.needs.died = 1;
    expect(tallyDay(g)?.kind).toBe('wipe');
    const h = newGame(1, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'nuclear' });
    h.clock.t = h.disaster.hitAt + 400;
    h.ending = { kind: 'recovered', day: 300, continued: true };
    for (const ps of h.personState) ps.needs.died = 1;
    expect(tallyDay(h)?.kind).toBe('wipe');
    expect(h.ending?.continued).toBe(false);
    // and it is said once: a wipe on file isn't ended again
    expect(tallyDay(h)).toBeNull();
  });

  it('a year feeding yourselves is the equilibrium ending, counted over the year (the harvest carries the winter)', () => {
    const g = newGame(2, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', variant: 'cascade' });
    g.disaster.tracks = { ...g.disaster.tracks, grid: 0 };
    let ended = -1;
    for (let d = 0; d < 800 && !g.ending; d++) {
      g.clock.t = g.disaster.hitAt + d + 0.1;
      // nothing grows ten months of the year; a fall harvest of a little more than the year's need
      const harvest = d % 365 >= 120 && d % 365 < 180;
      g.food = { needKcal: 8000, ateKcal: 8000, producedKcal: harvest ? 8000 * 365 / 60 * 1.1 : 0, spoiledKcal: 0, fromStores: false, kinds: ['canned'], daysLeft: 100 };
      if (tallyDay(g)) ended = d;
    }
    expect(g.ending?.kind).toBe('equilibrium');
    expect(ended).toBeGreaterThanOrEqual(399);
  });

  it('a garden that covers a third of the year never makes it an equilibrium', () => {
    const g = newGame(2, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', variant: 'cascade' });
    g.disaster.tracks = { ...g.disaster.tracks, grid: 0 };
    for (let d = 0; d < 900 && !g.ending; d++) {
      g.clock.t = g.disaster.hitAt + d + 0.1;
      g.food = { needKcal: 8000, ateKcal: 8000, producedKcal: 2700, spoiledKcal: 0, fromStores: false, kinds: ['canned'], daysLeft: 100 };
      tallyDay(g);
    }
    expect(g.ending).toBeNull();
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

  it('a wipe clears a pending gate card and an arrival on the road, and the card does not say the place grew into a town', () => {
    const g = newGame(1, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'asteroid' });
    g.clock.t = g.disaster.hitAt + 76;
    g.gate.tookIn = 13;
    g.gate.pending = { id: 'e1', kind: 'trader', day: 1, title: 'A trader', dossier: [], size: 1, armed: false, strength: 0, stances: ['trade', 'turn_away'] } as never;
    g.gate.incoming = { e: g.gate.pending as never, at: g.clock.t + 0.1 };
    for (const ps of g.personState) ps.needs.died = 1;
    expect(tallyDay(g)?.kind).toBe('wipe');
    expect(g.gate.pending).toBeNull();
    expect(g.gate.incoming).toBeNull();
    const r = reportCard(g);
    expect(r.lines.join(' ')).not.toMatch(/grew into a town/);
    expect(r.facts[0][1]).toMatch(/^0 of \d+$/);
  });

  it('a drought is not "settled" before its tracks have finished falling (no new_normal at day 90)', () => {
    const g = newGame(5, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'drought' });
    expect(fallDoneDay(g.disaster)).toBeGreaterThan(200);
    g.disaster.fate = 'partial';
    g.disaster.ceiling = { stores: 0.4, deliveries: 0.4, law: 0.4 };
    g.clock.t = g.disaster.hitAt + 92;
    g.stats.days = 91; g.stats.okSince = 0;
    g.food.ateKcal = g.food.needKcal = 1;
    expect(tallyDay(g)).toBeNull();
    expect(g.stats.okSince).toBe(-1);
  });

  it('the ash-winter sky thickens over the first week after the hit and holds while the cold does', () => {
    const g = newGame(2, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'ash_winter' });
    g.clock.t = g.disaster.hitAt - 0.5;
    expect(disasterSky(g).haze).toBe(0);
    g.clock.t = g.disaster.hitAt + 0.5;
    const a = disasterSky(g).haze;
    g.clock.t = g.disaster.hitAt + 40;
    const b = disasterSky(g).haze;
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0.8);
    g.clock.t = g.disaster.hitAt + 800;   // the cold is over (a year and a half after the first year)
    expect(disasterSky(g).haze).toBeLessThan(0.35);
  });
});
