import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, type GameState } from './state';
import { migrate } from './save/migrations';
import { step } from './engine';
import { DEFAULT_FORTRESS, layFortress, planFortress } from './fortress';
import type { Pt } from './perimeter';
import { BLUEPRINTS } from './blueprints';
import { canChoose, catchChance, gatesUsed, lookOdds, vetArrival, vetAttention, vetLine, VET } from './gateVetting';
import { watchDetection } from './daily';
import { resolve } from './encounters';
import type { Encounter } from './encounters';

function ringed(rings: number): GameState {
  const g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.structures.push({ id: 'h', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 });
  g.people.forEach(p => { p.kid = false; });
  layFortress(g, planFortress(g, { roadGate: [g.site.home.x1, 30] as Pt }, { ...DEFAULT_FORTRESS, rings, passage: false }));
  for (const r of g.perimeter) { r.finishedAt = 0; r.done = r.hours; }
  for (const st of g.structures) st.stage = BLUEPRINTS[st.kind].stages.length;
  return g;
}

describe('per-ring gate vetting', () => {
  it('the choice only exists with two or more rings holding; with one ring only the outer gate is a gate', () => {
    const one = ringed(1), three = ringed(3);
    expect(canChoose(one)).toBe(false);
    expect(canChoose(three)).toBe(true);
    expect(vetLine(one, 'both')).toBeNull();
    expect(gatesUsed(one, 'inner')).toEqual([]);
    expect(gatesUsed(one, 'both')).toEqual(['outer']);
    expect(gatesUsed(three, 'both')).toEqual(['outer', 'inner']);
    expect(gatesUsed(three, 'none')).toEqual([]);
  });
  it('both gates catch more than either; the inner look is the sharper; a good medic and talker help; nothing is caught with no vetting', () => {
    const g = ringed(3);
    for (const sec of ['sick', 'thief', 'scout'] as const) {
      const o = catchChance(g, 'outer', sec), i = catchChance(g, 'inner', sec), b = catchChance(g, 'both', sec);
      expect(catchChance(g, 'none', sec)).toBe(0);
      expect(i).toBeGreaterThan(o);
      expect(b).toBeGreaterThan(i);
      expect(b).toBeLessThanOrEqual(1);
    }
    expect(catchChance(g, 'both', 'solid')).toBe(0);
    expect(catchChance(g, 'both', 'lazy')).toBe(0);
    const before = lookOdds(g, 'sick').outer;
    g.people[0].skills.medic = 9;
    expect(lookOdds(g, 'sick').outer).toBeGreaterThan(before);
  });
  it('a bad one caught is never admitted; the looks cost guard-hours and attention that day only', () => {
    const g = ringed(3);
    const r0 = vetArrival(g, 'sick', () => 0, 'both');
    expect(r0.caught).toBe('outer');
    expect(r0.hours).toBe(VET.HOURS);
    expect(g.gate.vetBusy?.n).toBe(1);
    const miss = vetArrival(g, 'sick', () => 0.999, 'both');
    expect(miss.caught).toBeNull();
    expect(miss.hours).toBe(2 * VET.HOURS);
    expect(g.gate.vetBusy?.n).toBe(3);
    expect(vetAttention(g)).toBe(3 * VET.ATTENTION);
    g.clock.t += 1;
    expect(vetAttention(g)).toBe(0);
    expect(vetArrival(g, 'sick', () => 0, 'none')).toMatchObject({ caught: null, hours: 0 });
  });
  it('the watch sees less on the day the guards are at the gate, never less than nothing', () => {
    const g = ringed(3);
    const base = watchDetection(g);
    vetArrival(g, 'solid', () => 0.9, 'both');
    expect(watchDetection(g)).toBeLessThanOrEqual(base);
    expect(watchDetection(g)).toBeGreaterThanOrEqual(0);
  });
  it('a thief caught at the inner gate has had the outer ring; at the outer gate he has had nothing; a scout warns the place', () => {
    const a = ringed(3), b = ringed(3);
    a.stock.canned = 100; b.stock.canned = 100; a.stock.fuel = 40; b.stock.fuel = 40;
    vetArrival(a, 'thief', () => 0, 'outer');
    expect(a.stock.canned).toBe(100);
    const inner = vetArrival(b, 'thief', () => 0, 'inner');
    expect(inner.caught).toBe('inner');
    expect(b.stock.canned).toBeLessThan(100);
    expect(inner.lines.join(' ')).toMatch(/outer ring/);
    const c = ringed(3);
    vetArrival(c, 'scout', () => 0, 'outer');
    expect(c.gate.forewarned).toBe(true);
  });
  it('the gate card: a fever caught at the gate turns them back instead of taking them in', () => {
    const g = ringed(3);
    g.gate.vet = 'both';
    const e = { id: 'e1', kind: 'arrival', day: 5, title: 'x', dossier: ['x'], size: 1, armed: false, strength: 0, secret: 'sick', stances: ['take_in', 'turn_away'], people: [{ ...g.people[0], id: 'new1', kid: false }], brings: {} } as unknown as Encounter;
    g.gate.pending = e;
    const n = g.people.length;
    // (the seeded roll may miss; find a day it catches)
    let caught = false;
    for (let d = 1; d < 40 && !caught; d++) {
      const h = structuredClone(g); h.gate.pending = { ...e, day: d } as Encounter;
      const o = resolve(h, 'take_in');
      if (o.title === 'Turned back at the gate') { caught = true; expect(h.people.length).toBe(n); expect(h.gate.turnedAway).toBe(g.gate.turnedAway + 1); }
    }
    expect(caught).toBe(true);
  });
  it('save v78: an old save gets no vetting and still runs', () => {
    const old = JSON.parse(JSON.stringify(newGame(2))) as Record<string, unknown>;
    old.version = 77; delete (old.gate as Record<string, unknown>).vet;
    const m = migrate(old);
    expect(m.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(78);
    expect(m.gate.vet).toBe('none');
    expect(() => step(structuredClone(m), 3)).not.toThrow();
  });
});
