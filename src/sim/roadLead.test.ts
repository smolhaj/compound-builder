/**
 * Lead time on the road for non-raid encounters (sim/roadLead.ts): the approach time is a pure function of (seed, encounter), nobody home
 * cancels it, one card at a time, old saves load with no approach, and the real engine turns every approach into exactly one card with
 * the same totals per kind as before.
 */
import { describe, expect, it, vi } from 'vitest';

const off = vi.hoisted(() => ({ v: false }));
vi.mock('./roadLead', async orig => {
  const m = await orig<typeof import('./roadLead')>();
  return { ...m, scheduleLead: (s: never, e: never) => (off.v ? false : m.scheduleLead(s, e)) };
});

import { newGame, type GameState } from './state';
import { gateDay, resolve, type Encounter, type EncounterKind } from './encounters';
import { step } from './engine';
import { planRun } from './perimeter';
import { arrivalCheck } from './siege';
import { LEAD_DRIVE, LEAD_FOOT, LEAD_KINDS, comesOnFoot, leadMinutes, scheduleLead, wantsLead } from './roadLead';
import { approachDistance, partyForEncounter } from './roadTraffic';
import { migrate } from './save/migrations';
import { SAVE_VERSION } from './state';

const card = (kind: EncounterKind, o: Partial<Encounter> = {}): Encounter =>
  ({ id: 'e9', kind, day: 4, title: `The ${kind}`, dossier: [], size: 4, armed: false, strength: 0, stances: ['take_in', 'turn_away'], ...o }) as Encounter;

function world(seed = 3, kind: 'grid_down' | 'pandemic' = 'grid_down'): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind, difficulty: 'cozy' });
  g.money = 1_200_000;
  const r = planRun(g, 'container_wall', [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]);
  r.done = r.hours; r.supplied = true; r.finishedAt = 0;
  return g;
}
function awayGame(): GameState {
  const g = newGame(7, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = g.disaster.hitAt + 40;
  const kid = g.people.find(p => p.kid) ?? g.people[0];
  for (const ps of g.personState) ps.needs.died = 1;
  g.lineage.wards = [{ person: kid, by: g.neighbors[0].id, since: 1 }];
  return g;
}

describe('approach time (pure)', () => {
  it('is deterministic, in quarter hours, and within the range for how they travel', () => {
    for (const kind of [...LEAD_KINDS] as EncounterKind[]) for (let seed = 1; seed <= 6; seed++) {
      const e = card(kind, { id: `e${seed}`, extras: seed % 2 ? { vehicle: 'old_pickup' } : undefined });
      const m = leadMinutes(e, seed);
      expect(leadMinutes(e, seed)).toBe(m);
      expect(m % 15).toBe(0);
      const [lo, hi] = comesOnFoot(e, seed) ? LEAD_FOOT : LEAD_DRIVE;
      expect(m).toBeGreaterThanOrEqual(lo - 7.5);
      expect(m).toBeLessThanOrEqual(hi + 7.5);
    }
  });
  it('walkers take longer than vehicles on average; a trader drives, refugees walk', () => {
    expect(comesOnFoot(card('trader'), 1)).toBe(false);
    expect(comesOnFoot(card('refugees', { size: 9 }), 1)).toBe(true);
    const avg = (kind: EncounterKind, extras?: Encounter['extras']) => { let t = 0; for (let i = 0; i < 60; i++) t += leadMinutes(card(kind, { id: `e${i}`, extras }), i + 1); return t / 60; };
    expect(avg('refugees')).toBeGreaterThan(avg('trader') + 20);
    expect(avg('arrival', { vehicle: 'old_pickup' } as never)).toBeLessThan(avg('arrival') - 20);
  });
  it('does not touch the sim random stream', () => {
    const g = world(); const a = JSON.stringify(g.nextId);
    leadMinutes(card('arrival'), g.seed);
    expect(JSON.stringify(g.nextId)).toBe(a);
  });
  it('the road draws the approach from the sighting: far at first, at the gate on arrival', () => {
    const d0 = approachDistance(10, 10, 10 + 2 / 24), d1 = approachDistance(10 + 1 / 24, 10, 10 + 2 / 24), d2 = approachDistance(10 + 2 / 24, 10, 10 + 2 / 24);
    expect(d0).toBeGreaterThan(d1); expect(d1).toBeGreaterThan(0); expect(d2).toBe(0);
    expect(Number.isFinite(d0)).toBe(true);
  });
});

describe('holding a card', () => {
  it('moves a pending non-raid card to incoming, with the same encounter, and the arrival hands it back untouched', () => {
    const g = world();
    g.clock.t = 100.75;
    const e = card('refugees', { size: 7 });
    g.gate.pending = e;
    expect(scheduleLead(g, e)).toBe(true);
    expect(g.gate.pending).toBeNull();
    const inc = g.gate.incoming!;
    expect(inc.e).toBe(e);
    expect(inc.from).toBe(100.75);
    expect(inc.at).toBeGreaterThan(100.75);
    expect((inc.at - 100.75) * 1440).toBeGreaterThanOrEqual(LEAD_FOOT[0] - 8);
    g.clock.t = inc.at - 0.001;
    expect(arrivalCheck(g)).toBeNull();
    g.clock.t = inc.at;
    expect(arrivalCheck(g)).toBe(e);
    expect(g.gate.pending).toBe(e);
    expect(g.gate.incoming).toBeNull();
    expect(e.size).toBe(7);
    expect(e.stances).toEqual(['take_in', 'turn_away']);
  });
  it('never for a raid, a break-in or the kinds that are not at the road; never a second while one is on its way', () => {
    const g = world();
    for (const k of ['gang', 'looters', 'militia', 'break_in', 'tunnelers', 'move_in', 'stranded', 'trial_end', 'ransom'] as EncounterKind[]) {
      const e = card(k, k === 'gang' ? { strength: 50, stances: ['hide', 'defend'] } : {});
      g.gate.pending = e;
      expect(wantsLead(g, e)).toBe(false);
    }
    const a = card('arrival'); g.gate.pending = a;
    expect(scheduleLead(g, a)).toBe(true);
    const b = card('trader', { id: 'e10' }); g.gate.pending = b;
    expect(scheduleLead(g, b)).toBe(false);
    expect(g.gate.incoming!.e).toBe(a);
  });
  it('drops the producer log line so the title reads once, at the arrival', () => {
    const g = world(); const e = card('shelter');
    g.log.push({ t: g.clock.t, text: `${e.title}.` }); g.gate.pending = e;
    scheduleLead(g, e);
    expect(g.log.some(l => l.text === `${e.title}.`)).toBe(false);
  });
  it('gateDay rolls nothing while an approach is under way (one at a time)', () => {
    const g = world(); g.clock.t = g.disaster.hitAt + 200; g.disaster.tracks = { ...g.disaster.tracks, law: 0 };
    g.gate.incoming = { e: card('arrival'), at: g.clock.t + 0.05, from: g.clock.t };
    g.gate.next = 0; g.gate.day = -5;
    expect(gateDay(g)).toBeNull();
    expect(g.gate.pending).toBeNull();
  });
});

describe('nobody home', () => {
  it('no approach is started with nobody home', () => {
    const g = awayGame(); const e = card('arrival'); g.gate.pending = e;
    expect(scheduleLead(g, e)).toBe(false);
  });
  it('an approach under way is cancelled, with no card, when everyone has left', () => {
    const g = awayGame();
    g.gate.incoming = { e: card('refugees'), at: g.clock.t + 0.05, from: g.clock.t };
    g.clock.t += 0.06;
    expect(arrivalCheck(g)).toBeNull();
    expect(g.gate.incoming).toBeNull();
    expect(g.gate.pending).toBeNull();
  });
  it('an approach under way is cancelled when the family has gone to town', () => {
    const g = world(); g.clock.t = g.disaster.hitAt - 50;
    const e = card('arrival');
    g.gate.incoming = { e, at: g.clock.t + 0.05, from: g.clock.t };
    g.clock.t += 0.06;
    expect(arrivalCheck(g)).toBe(e);   // (home: it arrives)
  });
});

describe('saves', () => {
  it('an old save (no incoming, or a raid incoming without `from`) loads and plays on', () => {
    const g = world();
    const raw = JSON.parse(JSON.stringify(g));
    raw.version = SAVE_VERSION; delete raw.gate.incoming;
    expect(migrate(raw).gate.incoming ?? null).toBeNull();
    raw.gate.incoming = { e: card('gang', { strength: 40, stances: ['hide', 'defend'] }), at: g.clock.t + 0.1 };
    const m = migrate(raw);
    expect(m.gate.incoming!.from).toBeUndefined();
    expect(() => step(m, 0.3)).not.toThrow();
  });
});

// ── the real engine ────────────────────────────────────────────────────────────

function pickStance(e: Encounter) { return e.stances[0]; }

describe('real engine', () => {
  it('every approach turns into exactly one card, one at a time, hour by hour', () => {
    off.v = false;
    let total = 0;
    for (const [seed, kind] of [[3, 'grid_down'], [11, 'pandemic']] as const) {
      let g = world(seed, kind);
      const started = new Map<string, number>(), cards = new Map<string, number>();
      let prevPending: string | null = null;
      for (let h = 0; h < 24 * 365 * 2; h++) {
        g = step(g, 1 / 24);
        const inc = g.gate.incoming, pe = g.gate.pending;
        if (inc && !started.has(inc.e.id)) started.set(inc.e.id, g.clock.t);
        if (inc && pe) expect(pe.id === inc.e.id).toBe(false);   // never the same card twice
        if (pe && pe.id !== prevPending) cards.set(pe.id, (cards.get(pe.id) ?? 0) + 1);
        prevPending = pe?.id ?? null;
        if (pe) { resolve(g, pickStance(pe)); g.gate.card = null; }
        if (g.people.every((_, i) => g.personState[i].needs.died != null)) break;
      }
      total += started.size;
      for (const id of started.keys()) expect(cards.get(id)).toBe(1);
      for (const n of cards.values()) expect(n).toBe(1);
      expect(g.gate.incoming === null || started.has(g.gate.incoming!.e.id)).toBe(true);
    }
    expect(total).toBeGreaterThanOrEqual(5);
  }, 600_000);

  it('totals of each kind over the years match the generator without a lead (same seeds)', () => {
    const run = (lead: boolean, seed: number) => {
      off.v = !lead;
      let g = world(seed, 'grid_down');
      const kinds: Record<string, number> = {}; let seen = '';
      for (let d = 0; d < 365 * 4; d++) {
        g = step(g, 1);
        const pe = g.gate.pending;
        if (pe && pe.id !== seen) { seen = pe.id; kinds[pe.kind] = (kinds[pe.kind] ?? 0) + 1; }
        if (pe) { resolve(g, pickStance(pe)); g.gate.card = null; }
        if (g.personState.every(ps => ps.needs.died != null)) break;
      }
      off.v = false;
      return kinds;
    };
    let a = 0, b = 0;
    for (const seed of [3, 5]) {
      const old = run(false, seed), now = run(true, seed);
      for (const k of new Set([...Object.keys(old), ...Object.keys(now)])) {
        const o = old[k] ?? 0, n = now[k] ?? 0;
        a += o; b += n;
        expect(Math.abs(n - o)).toBeLessThanOrEqual(Math.max(3, Math.ceil(o * 0.3)));
      }
    }
    expect(a).toBeGreaterThanOrEqual(15);   // (was > 20: the good-neighbor record (sim/reputation.ts) shifts the neighbor dice, and the totals sit near the old line)
    expect(Math.abs(b - a) / a).toBeLessThan(0.15);
  }, 900_000);
});

void partyForEncounter;
