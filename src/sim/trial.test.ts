import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { gateDay, resolve, type Encounter } from './encounters';
import { campNeed, TRIAL_DAYS, trialCamps, trialDay, type Character } from './trial';
import type { Person } from './family';

function afterHit(seed = 1): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.5;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  g.stock.canned = 40; g.stock.staples = 10; g.stock.fuel = 10; g.stock.meds = 4;
  g.gate.next = 1e9;   // no other visitors in these tests
  return g;
}
const adult = (id: string, first: string): Person => ({ id, first, last: 'Holt', age: 34, kid: false, body: 'm', skills: { builder: 2, gardener: 1, medic: 1, mechanic: 6, hunter: 2, negotiator: 1, teacher: 0, radio: 0 }, shirt: 0x334455 });
function arrive(g: GameState): Encounter {
  const e: Encounter = { id: 'a1', kind: 'arrival', day: Math.floor(g.clock.t), title: 'Two brothers at the gate', dossier: [], size: 2, armed: false, strength: 0, people: [adult('pa', 'Walt'), adult('pb', 'Tomas')], brings: { canned: 2 }, stances: ['take_in', 'trial', 'trade', 'turn_away'] };
  g.gate.pending = e;
  return e;
}
/** Days of the trial, answering nothing else. */
const live = (g: GameState, days: number) => { for (let d = 0; d < days; d++) { g.clock.t += 1; gateDay(g); if (g.gate.pending?.kind === 'trial_end') return; } };

describe('a month\'s trial: a camp outside the wall', () => {
  it('they camp outside, are not family, and eat from the stores', () => {
    const g = afterHit();
    const n = g.people.length;
    arrive(g);
    resolve(g, 'trial');
    expect(g.people.length).toBe(n);
    expect(g.personState.length).toBe(n);
    expect(trialCamps(g)).toHaveLength(1);
    const c = trialCamps(g)[0];
    c.character = 'solid';
    const kcal = () => g.stock.canned * 6000 + g.stock.staples * 80000 + g.stock.fresh * 2000 + g.stock.frozen * 10000;
    const before = kcal();
    trialDay(g);
    expect(before - kcal()).toBeCloseTo(campNeed(c), 0);
    expect(c.worked).toBeGreaterThan(0);
    expect(g.stock.canned).toBeLessThan(40 + 2);   // what they brought stays theirs till they're in
  });

  it('at the end of the month a card asks: take them in or send them on', () => {
    for (const choice of ['take_in', 'turn_away'] as const) {
      const g = afterHit(2);
      const n = g.people.length;
      arrive(g); resolve(g, 'trial');
      trialCamps(g)[0].character = 'gem';
      live(g, TRIAL_DAYS + 2);
      const e = g.gate.pending!;
      expect(e.kind).toBe('trial_end');
      expect(e.stances).toEqual(['take_in', 'turn_away']);
      expect(e.dossier.join(' ')).toMatch(/turns out to be a fair hand/);
      resolve(g, choice);
      expect(trialCamps(g)).toHaveLength(0);
      expect(g.people.length).toBe(choice === 'take_in' ? n + 2 : n);
      expect(g.personState.length).toBe(g.people.length);
    }
  });

  it('what the month shows: some turn out better, some talked themselves up, some steal and run', () => {
    const run = (character: Character, seed: number) => {
      const g = afterHit(seed);
      arrive(g); resolve(g, 'trial');
      trialCamps(g)[0].character = character;
      const canned = g.stock.canned;
      live(g, TRIAL_DAYS + 2);
      return { g, canned, camp: trialCamps(g)[0], pending: g.gate.pending };
    };
    // a thief is gone before the month is out (most of the time) and the shelves are lighter
    let stole = 0;
    for (let seed = 1; seed <= 10; seed++) { const r = run('thief', seed); if (!r.camp && r.pending?.kind !== 'trial_end') stole++; }
    expect(stole).toBeGreaterThanOrEqual(6);
    // a lazy one's skill comes down to what it really is
    const lazy = run('lazy', 3);
    expect(lazy.pending?.kind).toBe('trial_end');
    expect(Math.min(...lazy.pending!.people!.map(p => p.skills.mechanic))).toBeLessThan(6);
    expect(lazy.pending!.dossier.join(' ')).toMatch(/as little as they can/);
  });

  it('a trial is no longer the same as taking them in (round 3 Q8)', () => {
    const a = afterHit(4), b = afterHit(4);
    arrive(a); arrive(b);
    resolve(a, 'take_in'); resolve(b, 'trial');
    expect(a.people.length).toBe(b.people.length + 2);
    expect(a.gate.tookIn).toBe(2);
    expect(b.gate.tookIn).toBe(0);
  });
});
