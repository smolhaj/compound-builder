import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { gateDay } from './encounters';
import { nobodyHome } from './orphans';
import { resolve } from './encounters';
import { mastheadOf, MASTHEADS, tallyDay } from './report';
import { slowHint, paceOf } from './pace';
import { REGION_IDS } from './regions';
import { step } from './engine';

function awayGame() {
  const g = newGame(7, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = g.disaster.hitAt + 40;
  const kid = g.people.find(p => p.kid) ?? g.people[0];
  for (const ps of g.personState) ps.needs.died = 1;
  g.lineage.wards = [{ person: kid, by: g.neighbors[0].id, since: 1 }];
  return g;
}

describe('nobody home (line alive, children fostered)', () => {
  it('is true only with wards and no living roster', () => {
    const g = newGame(7, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    expect(nobodyHome(g)).toBe(false);
    expect(nobodyHome(awayGame())).toBe(true);
  });
  it('queues no gate cards for a year of days', () => {
    const g = awayGame();
    for (let i = 0; i < 365; i++) { g.clock.t += 1; expect(gateDay(g)).toBeNull(); }
    expect(g.gate.pending).toBeNull();
  });
  it('queues no card of any kind (kin, neighbors asking to join) through four game years of the real engine', () => {
    let g = awayGame();
    g.clock.t = g.disaster.hitAt + 40;
    for (let i = 0; i < 4 * 365 / 5; i++) {
      g = step(g, 5);
      if (!nobodyHome(g)) break;
      expect(g.gate.pending?.kind ?? null).toBeNull();
      expect(g.gate.card).toBeNull();
    }
  });
  it('taking in a stranger is refused', () => {
    const g = awayGame();
    g.gate.pending = { id: 'e1', kind: 'arrival', day: 1, title: 'x', dossier: [], size: 1, armed: false, strength: 0 } as never;
    const o = resolve(g, 'take_in');
    expect(o.title).toBe('Nobody home');
    expect(g.gate.tookIn).toBe(0);
  });
});

describe('a real wipe is still a wipe', () => {
  it('everyone dead and nobody fostered ends the run; with a ward away it does not', () => {
    const g = newGame(7, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    g.clock.t = g.disaster.hitAt + 40;
    for (const ps of g.personState) ps.needs.died = 1;
    expect(nobodyHome(g)).toBe(false);
    expect(tallyDay(g)?.kind).toBe('wipe');
    const f = awayGame();
    expect(tallyDay(f)).toBeNull();
    expect(f.ending).toBeFalsy();
  });
});

describe('polish', () => {
  it('every region has its own masthead, and only the Rust Belt keeps the Valley Courier', () => {
    for (const id of REGION_IDS) expect(MASTHEADS[id]).toBeTruthy();
    expect(new Set(REGION_IDS.map(mastheadOf)).size).toBe(REGION_IDS.length);
    expect(mastheadOf(undefined)).toBe('The Valley Courier');
  });
  it('the slow-going hint leads with the key point and stays short', () => {
    const g = newGame(3, 105, 2027, {});
    const h = slowHint(g, 30, { ...paceOf(g), employed: ['Luis'], siteDays: undefined }, 6)!;
    expect(h).toMatch(/^Slow going: Luis works in town/);
    expect(h.length).toBeLessThan(150);
  });
});
