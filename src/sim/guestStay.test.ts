import { describe, expect, it } from 'vitest';
import { newGame, dayIndex, type GameState } from './state';
import { step } from './engine';
import { resolve } from './encounters';
import { requestShelter, newcomersOf, homeGoodwill } from './newcomers';
import { lifeOf } from './neighborLife';
import { mulberry32 } from './rng';

/** The real engine, a household sheltered under the roof for its promised days. The farm is pinned standing or burned (random neighbor events must not decide the test). */
function sheltered(why: 'sick' | 'fire', farm: 'standing' | 'burned') {
  let g: GameState = newGame(1, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g = step(g, g.disaster.hitAt - g.clock.t + 20);
  g.disaster.tracks = { ...g.disaster.tracks, law: 1 };   // no raids to muddy the card queue
  g.gate.next = 1e9; g.gate.pending = null; g.gate.incoming = null; g.gate.card = null;
  g.stock.canned = 400; g.stock.staples = 200;
  const a = g.neighbors.find(n => n.status === 'home' && n.members > 0)!;
  a.disposition = 40;
  newcomersOf(g).lastAny = undefined;
  expect(requestShelter(g, a, why, mulberry32(4))).toBeTruthy();
  resolve(g, 'take_in');
  lifeOf(g, a).farm = farm;
  const party = newcomersOf(g).guests[a.id];
  return { g, nid: a.id, ids: [...party.ids], until: party.until, from: party.from };
}
const pinned = (g: GameState, nid: string, farm: 'standing' | 'burned') => { g.gate.next = 1e9; g.gate.incoming = null; lifeOf(g, g.neighbors.find(n => n.id === nid)!).farm = farm; };
const bond = (g: GameState, nid: string) => g.neighbors.find(n => n.id === nid)!.disposition;

describe('shelter guests (real engine)', () => {
  it('a household with a farm to go back to leaves at guestUntil, the log says so, and goodwill is added', () => {
    const s = sheltered('sick', 'standing');
    let g = s.g;
    expect(s.until - s.from).toBe(14);
    const before = bond(g, s.nid);
    let left = -1;
    for (let i = 0; i < 40 && left < 0; i++) {
      pinned(g, s.nid, 'standing');
      if (dayIndex(g.clock.t) < s.until - 1) expect(newcomersOf(g).guests[s.nid]).toBeTruthy();
      g = step(g, 1);
      if (!newcomersOf(g).guests[s.nid]) left = dayIndex(g.clock.t);
    }
    expect(left).toBeGreaterThanOrEqual(s.until);
    expect(left).toBeLessThanOrEqual(s.until + 1);
    expect(g.log.some(l => /went home/.test(JSON.stringify(l)))).toBe(true);
    expect(g.personState.filter(ps => s.ids.includes(ps.id)).every(ps => ps.needs.left)).toBe(true);
    expect(bond(g, s.nid) - before).toBeGreaterThanOrEqual(homeGoodwill('sick') - 1);
  });

  it('a 45-day fire stay with the farm burned does not strand them silently: on the day the card asks them to stay, and an answer ends it', () => {
    const s = sheltered('fire', 'burned');
    let g = s.g;
    expect(s.until - s.from).toBe(45);
    for (let i = 0; i < 60 && !g.gate.pending; i++) { pinned(g, s.nid, 'burned'); g = step(g, 1); }
    expect(g.gate.pending?.shelter?.settle).toBe(true);
    expect(dayIndex(g.clock.t)).toBeGreaterThanOrEqual(s.until);
    // left unanswered the card holds them (and waits for the player); declining sends them on, with no bond line for going home
    const out = resolve(g, 'turn_away');
    expect(out.title).toBe('The gate stays shut');
    expect(newcomersOf(g).guests[s.nid]).toBeUndefined();
    expect(g.personState.filter(ps => s.ids.includes(ps.id)).every(ps => ps.needs.left)).toBe(true);
  });
});
