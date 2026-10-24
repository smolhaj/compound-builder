import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { generateNeighbors, gateDay, postureOf, raiderTemper, resolve, whoComes, type EncounterKind } from './encounters';
import { planRun, canEnter } from './perimeter';
import { mulberry32 } from './rng';

/** A game a few days after a grid-down hit, with the law gone. */
function afterHit(seed = 1): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = g.disaster.hitAt + 20;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  g.stock.canned = 20; g.stock.fuel = 10; g.stock.meds = 3;
  return g;
}
const wall = (g: GameState) => {
  const r = planRun(g, 'container_wall', [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]);
  r.done = r.hours; r.supplied = true; r.finishedAt = 0;
};

describe('neighbors and the gate', () => {
  it('4–6 named neighbor households, deterministic', () => {
    for (let s = 1; s < 20; s++) {
      const n = generateNeighbors(s);
      expect(n.length).toBeGreaterThanOrEqual(4);
      expect(n.length).toBeLessThanOrEqual(6);
      expect(new Set(n.map(x => x.name)).size).toBe(n.length);
    }
    expect(generateNeighbors(3)).toEqual(generateNeighbors(3));
  });

  it('nobody comes in peacetime; after the hit, people do', () => {
    const g = newGame(1, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    for (let d = 0; d < 30; d++) { g.clock.t = d + 0.1; expect(gateDay(g)).toBeNull(); }
    const h = afterHit();
    let seen = 0;
    for (let d = 0; d < 120 && seen < 3; d++) { h.clock.t += 1; if (gateDay(h)) { seen++; resolve(h, h.gate.pending!.stances[0]); } }
    expect(seen).toBe(3);
  });

  it('threat matrix: a fortress look puts off looters and draws organized gangs', () => {
    const count = (fortress: number) => {
      const g = afterHit();
      const p = { ...postureOf(g), fortress, visibility: 60 };
      const r = mulberry32(5);
      const tally: Partial<Record<EncounterKind, number>> = {};
      for (let i = 0; i < 4000; i++) { const k = whoComes(g, p, r); tally[k] = (tally[k] ?? 0) + 1; }
      return tally;
    };
    const open = count(0), fort = count(100);
    expect(fort.looters!).toBeLessThan(open.looters! * 0.5);
    expect(fort.gang!).toBeGreaterThan(open.gang! * 1.5);
  });

  it('taking people in grows the family and raises humanity; turning them away lowers it', () => {
    const g = afterHit(2);
    g.gate.pending = null;
    let arrival = null;
    for (let d = 0; d < 400 && !arrival; d++) { g.clock.t += 1; const e = gateDay(g); if (e?.kind === 'arrival') arrival = e; else if (e) resolve(g, e.stances[0]); }
    expect(arrival).not.toBeNull();
    const n = g.people.length, h = g.gate.humanity;
    resolve(g, 'take_in');
    expect(g.people.length).toBe(n + arrival!.size);
    expect(g.personState.length).toBe(g.people.length);
    expect(g.gate.humanity).toBeGreaterThan(h);
    expect(g.gate.tookIn).toBe(arrival!.size);
  });

  it('walls and fighters hold the line more often than an open place does', () => {
    const run = (walled: boolean) => {
      let held = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const g = afterHit(seed);
        if (walled) wall(g);
        g.gate.pending = { id: 'x', kind: 'looters', day: Math.floor(g.clock.t), title: 'Looters', dossier: [], size: 4, armed: true, strength: 40, wants: { canned: 3 }, stances: ['defend'] };
        if (resolve(g, 'defend').tone === 'good') held++;
      }
      return held;
    };
    expect(run(true)).toBeGreaterThan(run(false));
  });

  it('hiding in a bunker keeps the family safe even when they find the place', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = afterHit(seed);
      g.structures.push({ id: 'b', kind: 'bunker_hatch', x: 5, z: 5, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
      g.gate.pending = { id: 'x', kind: 'gang', day: 1, title: 'Gang', dossier: [], size: 8, armed: true, strength: 96, wants: { canned: 8 }, stances: ['hide'] };
      resolve(g, 'hide');
      expect(g.personState.every(ps => ps.needs.hurt.length === 0)).toBe(true);
    }
  });

  it('the escape tunnel is never a way in, whatever happens at the gate', () => {
    const g = afterHit();
    const t = planRun(g, 'escape_tunnel', [[5, 5], [30, 5]]);
    expect(canEnter(t, 'outside')).toBe(false);
    expect(canEnter(t, 'inside')).toBe(true);
  });
  it('the longer and more permanent the collapse, the more ruthless the crews', () => {
    const count = (fate: 'full' | 'never', days: number) => {
      const g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
      g.disaster.fate = fate; g.clock.t = g.disaster.hitAt + days;
      const r = mulberry32(9); let savage = 0;
      for (let i = 0; i < 2000; i++) if (raiderTemper(g, 'gang', r) === 'savage') savage++;
      return savage / 2000;
    };
    expect(count('full', 30)).toBeLessThan(0.12);
    expect(count('never', 500)).toBeGreaterThan(0.3);
  });
});
