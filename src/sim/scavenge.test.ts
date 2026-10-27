import { describe, expect, it } from 'vitest';
import { newGame, dayIndex, type GameState } from './state';
import { chooseHaul, dailyLoss, ensurePlaces, freshGas, HALF_LIFE, pickedOver, resolveRun, riskOf, runProblem, scavengeDay, scavengeOf, startRun, crowd } from './scavenge';
import { isAway } from './rescue';
import { postureOf } from './encounters';

function afterHit(seed = 1, days = 30): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = g.disaster.hitAt + days;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0, fuel: 0, medical: 0 };
  return g;
}
const adults = (g: GameState) => g.people.filter(p => !p.kid).map(p => p.id);

describe('scavenging: places and depletion', () => {
  it('nothing to scavenge before the hit or while the stores are open', () => {
    const g = newGame(1);
    expect(runProblem(g, 'pl_pharmacy', adults(g), 'foot')).toMatch(/stores/);
  });
  it('makes the town places, the interstate and an empty farm the day it opens', () => {
    const g = afterHit();
    const pl = ensurePlaces(g);
    expect(pl.map(p => p.kind)).toEqual(['hardware', 'pharmacy', 'gas', 'school', 'interstate', 'farm']);
    expect(pl.every(p => pickedOver(p) === 0)).toBe(true);
  });
  it('each place thins on its own clock: the pharmacy in weeks, a farm over a year', () => {
    expect(1 - Math.pow(1 - dailyLoss('pharmacy', 0), HALF_LIFE.pharmacy)).toBeCloseTo(0.5, 2);
    expect(dailyLoss('pharmacy', 0)).toBeGreaterThan(dailyLoss('farm', 0) * 5);
    // fewer people left to look in the later years
    expect(dailyLoss('school', 1000)).toBeLessThan(dailyLoss('school', 0) * 0.5);
    const g = afterHit(1, 0);
    ensurePlaces(g);
    for (let d = 0; d < 60; d++) { g.clock.t += 1; scavengeDay(g); }
    const by = Object.fromEntries(scavengeOf(g).places.map(p => [p.kind, pickedOver(p)]));
    expect(by.pharmacy).toBeGreaterThan(0.6);
    expect(by.farm).toBeLessThan(0.3);
    expect(by.pharmacy).toBeGreaterThan(by.school);
  });
  it('a neighbor\'s empty farm becomes a place once they leave', () => {
    const g = afterHit();
    g.neighbors[0].status = 'left';
    const pl = ensurePlaces(g);
    expect(pl.some(p => p.neighbor === g.neighbors[0].id)).toBe(true);
  });
  it('stale gas: good for four months, mostly varnish after two years', () => {
    expect(freshGas(60)).toBe(1);
    expect(freshGas(400)).toBeLessThan(0.7);
    expect(freshGas(800)).toBe(0.25);
  });
  it('the crowd at the places peaks in the first months and thins after', () => {
    expect(crowd(5)).toBeLessThan(crowd(40));
    expect(crowd(700)).toBeLessThan(crowd(60) * 0.5);
  });
});

describe('scavenging: a run', () => {
  it('the team is away while out; they come back with loot taken out of the place', () => {
    const g = afterHit(3, 10);
    ensurePlaces(g);
    const team = adults(g).slice(0, 2);
    expect(startRun(g, 'pl_hardware', team, 'foot', 'avoid')).toBeNull();
    expect(isAway(g, team[0])).toBe(true);
    expect(postureOf(g).fighters).toBeLessThan(g.people.filter(p => !p.kid).length);
    const run = scavengeOf(g).run!;
    expect(run.back).toBeGreaterThan(run.left);
    const p = scavengeOf(g).places.find(x => x.id === 'pl_hardware')!;
    const before = pickedOver(p);
    g.clock.t = run.back + 0.5;
    scavengeDay(g);
    expect(scavengeOf(g).run).toBeNull();
    expect(isAway(g, team[0])).toBe(false);
    expect(pickedOver(p)).toBeGreaterThan(before);
    expect(scavengeOf(g).runs).toBe(1);
  });
  it('the haul takes the best value for the weight first and stops at the pack', () => {
    const h = chooseHaul({ staples: 4, meds: 5, 'ammo:9mm': 100 }, 25);
    expect(h.meds).toBe(5);
    expect(h['ammo:9mm']).toBe(100);
    expect(h.staples ?? 0).toBe(0);
  });
  it('a stripped place gives little; a fresh one gives plenty', () => {
    const fresh = afterHit(5, 10), stripped = afterHit(5, 10);
    for (const g of [fresh, stripped]) ensurePlaces(g);
    for (const k of Object.keys(scavengeOf(stripped).places[1].left)) (scavengeOf(stripped).places[1].left as Record<string, number>)[k] = 0;
    const team = adults(fresh).slice(0, 2);
    const run = { place: 'pl_pharmacy', team, mode: 'foot' as const, roe: 'avoid' as const, left: dayIndex(fresh.clock.t), back: dayIndex(fresh.clock.t) + 1 };
    // no people about: law back
    fresh.disaster.tracks.law = 1; stripped.disaster.tracks.law = 1;
    const a = resolveRun(fresh, run), b = resolveRun(stripped, run);
    expect(a.value).toBeGreaterThan(b.value);
    expect(b.value).toBe(0);
  });
  it('risk: town places crowded early, fallout after a nuclear war', () => {
    const g = afterHit(1, 40);
    const pl = ensurePlaces(g);
    expect(riskOf(g, pl[1]).people).toBeGreaterThan(riskOf(g, pl[5]).people);
    const n = newGame(2, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'nuclear', variant: 'nearby' });
    n.clock.t = n.disaster.hitAt + 20;
    n.disaster.tracks.stores = 0;
    expect(riskOf(n, ensurePlaces(n)[0]).fallout).toBeGreaterThan(0);
  });
  it('runs are deterministic', () => {
    const mk = () => { const g = afterHit(9, 50); ensurePlaces(g); return g; };
    const a = mk(), b = mk();
    const run = { place: 'pl_gas', team: adults(a).slice(0, 2), mode: 'foot' as const, roe: 'talk' as const, left: dayIndex(a.clock.t), back: dayIndex(a.clock.t) + 2 };
    expect(resolveRun(a, run)).toEqual(resolveRun(b, run));
  });
  it('some runs go wrong across seeds: wounds, fights, nails', () => {
    let hurt = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = afterHit(seed, 60);
      ensurePlaces(g);
      const team = adults(g).slice(0, 2);
      resolveRun(g, { place: 'pl_gas', team, mode: 'foot', roe: 'talk', left: dayIndex(g.clock.t), back: dayIndex(g.clock.t) + 2 });
      if (team.some(id => g.personState.find(x => x.id === id)!.needs.hurt.length)) hurt++;
    }
    expect(hurt).toBeGreaterThan(2);
    expect(hurt).toBeLessThan(36);
  });
});

describe('world life in the engine', () => {
  it('a v38 save gets the scavenging, market and neighbor-life fields', async () => {
    const { migrate } = await import('./save/migrations');
    const { SAVE_VERSION } = await import('./state');
    const old = structuredClone(newGame(4)) as unknown as Record<string, unknown>;
    old.version = 38; delete old.scavenge; delete old.market; delete old.locals;
    const up = migrate(old);
    expect(up.version).toBe(SAVE_VERSION);
    expect(up.scavenge?.places).toEqual([]);
    expect(up.market?.rep).toBe(0);
    expect(up.locals?.pact).toEqual([]);
  });
});
