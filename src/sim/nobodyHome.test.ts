import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { gateDay } from './encounters';
import { nobodyHome } from './orphans';
import { resolve } from './encounters';
import { mastheadOf, MASTHEADS, tallyDay } from './report';
import { slowHint, paceOf } from './pace';
import { REGION_IDS } from './regions';
import { step } from './engine';
import { wipeSummary } from './wipe';
import { arrivalCheck } from './siege';
import type { Encounter } from './encounters';

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
  it('everyone dead ends the run whether or not a ward is away; with one away the ending says the family lives on', () => {
    const g = newGame(7, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    g.clock.t = g.disaster.hitAt + 40;
    for (const ps of g.personState) ps.needs.died = 1;
    expect(nobodyHome(g)).toBe(false);
    expect(tallyDay(g)?.kind).toBe('wipe');
    const f = awayGame();
    expect(tallyDay(f)?.kind).toBe('wipe');
    expect(f.ending?.kind).toBe('wipe');
    expect(wipeSummary(f).elsewhere).toHaveLength(1);
    expect(wipeSummary(g).elsewhere).toHaveLength(0);
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

describe('a scheduled raid when nobody is home', () => {
  it('is dropped at its hour: no cutscene, no card, stores untouched', () => {
    const g = awayGame();
    const e = { id: 'e1', kind: 'gang', day: 1, title: 'Gang', dossier: [], size: 4, armed: true, strength: 40, stances: [] } as unknown as Encounter;
    g.gate.incoming = { e, at: g.clock.t + 0.1 };
    const canned = g.stock.canned;
    g.clock.t += 0.2;
    expect(arrivalCheck(g)).toBeNull();
    expect(g.gate.incoming).toBeNull();
    expect(g.gate.pending).toBeNull();
    expect(g.stock.canned).toBe(canned);
  });
  it('still arrives when someone is home', () => {
    const g = newGame(7, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    const e = { id: 'e1', kind: 'gang', day: 1, title: 'Gang', dossier: [], size: 4, armed: true, strength: 40, stances: [] } as unknown as Encounter;
    g.gate.incoming = { e, at: g.clock.t + 0.1 };
    g.clock.t += 0.2;
    expect(arrivalCheck(g)).toBe(e);
  });
});

describe('the fostered-ward stretch says what is happening', () => {
  it('names the host, the child and the years to 18, and hides suggestions and drills', async () => {
    const { fosterNote } = await import('./orphans');
    const { suggestions, drillsSuggestion } = await import('./guidance');
    const g = awayGame();
    g.lineage.wards![0].person.age = 9;
    const n = fosterNote(g)!;
    expect(n.years).toBe(9);
    expect(n.text).toMatch(/Nobody is home/);
    expect(n.text).toMatch(/about 9 years/);
    expect(n.text).toContain(g.lineage.wards![0].person.first);
    expect(suggestions(g)).toEqual([]);
    expect(drillsSuggestion(g)).toBeNull();
    expect(fosterNote(newGame(7))).toBeNull();
  });
});
