/** The whole engine over a hard stretch of the collapse with newcomers: taking in more than the table can feed hurts, and the readout is a usable guide. */
import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { step } from './engine';
import { resolve } from './encounters';
import { carryOf, newcomersOf } from './newcomers';

/** A family with a pantry and no fields, three weeks before the hit, and a policy at every gate. */
function season(seed: number, policy: 'everyone' | 'careful', days = 200): GameState {
  let g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = Math.floor(g.disaster.hitAt) - 2 + 0.3;
  g.stock.canned = 200; g.stock.staples = 12; g.stock.fuel = 10; g.stock.meds = 4; g.stock.firewood = 20;
  for (let d = 0; d < days; d++) {
    g = step(g, 1);
    for (let k = 0; k < 4 && g.gate.pending; k++) {
      const e = g.gate.pending;
      const c = carryOf(g, e.people ?? []);
      const take = policy === 'everyone' || (c.levelWith !== 'over' && c.daysWith > 60);
      resolve(g, e.kind === 'arrival' || e.kind === 'shelter' ? (take ? 'take_in' : 'turn_away') : e.stances.includes('hide') ? 'hide' : e.stances[0]);
    }
    g.gate.card = null;
  }
  return g;
}
const unhappy = (g: GameState) => newcomersOf(g).departed.filter(d => /short of food|unhappy/.test(d.why)).length;

describe('a stretch of the collapse with newcomers (engine)', () => {
  it('taking everyone in drives people out and wears the table down; the careful readout keeps more of the family fed', () => {
    let leftEveryone = 0, leftCareful = 0, humEveryone = 0, humCareful = 0, canEveryone = 0, canCareful = 0;
    for (const seed of [1, 3, 5]) {
      const a = season(seed, 'everyone'), b = season(seed, 'careful');
      leftEveryone += unhappy(a); leftCareful += unhappy(b);
      humEveryone += a.gate.humanity; humCareful += b.gate.humanity;
      canEveryone += a.stock.canned + a.stock.staples * 13; canCareful += b.stock.canned + b.stock.staples * 13;
      // nobody who left is counted among the dead
      expect(a.personState.filter(p => p.needs.left && p.needs.taken).length).toBe(0);
      // everyone who came has a bond
      for (const p of a.people.filter(p => p.origin)) expect(newcomersOf(a).bonds[p.id]).toBeTruthy();
    }
    expect(leftEveryone).toBeGreaterThan(leftCareful);   // unhappy and short-of-food departures
    expect(humCareful).toBeLessThan(humEveryone);        // saying no has a price too
    expect(canCareful).toBeGreaterThan(canEveryone);     // and the stores last
  }, 120_000);
});
