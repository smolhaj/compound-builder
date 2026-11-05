import { afterEach, describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import { planBattle } from './battle';
import { planRun, type Pt } from './perimeter';
import { BLUEPRINTS } from './blueprints';
import { postureOf, whoComes, type EncounterKind } from './encounters';
import { mulberry32 } from './rng';
import { hireGuard } from './guards';
import { breakInRate } from './breakins';
import { defenders } from './pact';
import { REP, burglarK, closedLook, goodRecord, hardness, labelOf, opportunistK, reputation, reputationDay } from './reputation';

afterEach(() => setGroundOverride(null));
const N = 150;

function lot(seed = 3): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.site = { ...g.site, creek: false };
  g.structures.push({ id: 'h', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 } as Structure);
  for (const st of g.structures) st.stage = BLUEPRINTS[st.kind].stages.length;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 5; }
  g.armory.ammo['556'] = 3000;
  g.money = 500_000;
  g.clock.t = Math.floor(g.disaster.hitAt + 60) + 0.8;
  return g;
}
const walls = (g: GameState, kind: 'stone_wall' | 'container_wall' = 'stone_wall'): void => { const r = planRun(g, kind, [[20, 20], [40, 20], [40, 40], [20, 40], [20, 20]] as Pt[]); r.finishedAt = 0; r.done = r.hours; r.supplied = true; };
const peaceHire = (g: GameState, n: number): void => { const t = g.disaster.tracks; g.disaster.tracks = { ...t, law: 1, banks: 1 }; for (let i = 0; i < n; i++) hireGuard(g); g.disaster.tracks = t; };

describe('hardness and its drivers', () => {
  it('a bare lot is an open place; walls, the word that it shoots back, guards and signs each add, and the drivers sum to the score', () => {
    const g = lot(); const base = hardness(g, postureOf(g));
    expect(base.hard).toBeLessThan(0.05); expect(labelOf(base.hard)).toBe('An open place');
    walls(g); const w = hardness(g, postureOf(g)); expect(w.hard).toBeGreaterThan(base.hard);
    g.gate.respect = 0.8; const r = hardness(g, postureOf(g)); expect(r.hard).toBeGreaterThan(w.hard);
    peaceHire(g, 2); const gu = hardness(g, postureOf(g)); expect(gu.hard).toBeGreaterThan(r.hard);
    expect(gu.drivers.reduce((a, d) => a + d.points, 0) / 100).toBeCloseTo(gu.hard, 5);
    expect(hardness(g, { fortress: 100, signs: 5 }).hard).toBeGreaterThan(0.6);
  });
  it('adding any defensive element never lowers hardness', () => {
    const adds: Array<(g: GameState) => void> = [g => walls(g), g => walls(g, 'container_wall'), g => { g.gate.respect = 0.5; }, g => peaceHire(g, 1), g => peaceHire(g, 3), g => { g.stock.floodlights = 3; g.stock.window_bars = 1; g.stock.sandbags = 3; }];
    for (const add of adds) { const a = lot(), b = lot(); add(b); expect(hardness(b, postureOf(b)).hard).toBeGreaterThanOrEqual(hardness(a, postureOf(a)).hard); }
  });
  it('the effects are bounded: never an increase, at most 35 % fewer looters and 30 % fewer burglaries', () => {
    for (const h of [0, 0.2, 0.5, 1]) { expect(opportunistK(h)).toBeLessThanOrEqual(1); expect(opportunistK(h)).toBeGreaterThanOrEqual(1 - REP.LOOT); expect(burglarK(h)).toBeLessThanOrEqual(1); expect(burglarK(h)).toBeGreaterThanOrEqual(1 - REP.BREAKIN); }
  });
});

describe('who it puts off: opportunists, not organized crews', () => {
  const mix = (g: GameState, p: { fortress: number; visibility: number }): Record<string, number> => {
    const out: Record<string, number> = {}; const post = { ...postureOf(g), ...p };
    for (let i = 0; i < 6000; i++) { const k: EncounterKind = whoComes(g, post, mulberry32(i * 7 + 1)); out[k] = (out[k] ?? 0) + 1; }
    return out;
  };
  it('a hard-looking place gets fewer looters than the same posture with no name; gangs are not reduced by the name', () => {
    const post = { fortress: 90, visibility: 40 };
    const a = lot(), b = lot(); b.gate.respect = 1; peaceHire(b, 2);   // (respect also trims both weights by the old rule; compare gangs against that rule, not against nothing)
    const c = lot(); c.gate.respect = 1;                                // the same word, no guards: the name differs only by the guards
    const ma = mix(a, post), mb = mix(b, post), mc = mix(c, post);
    expect(mb.looters).toBeLessThan(mc.looters);                        // guards add to the name: fewer looters
    expect((mb.gang ?? 0)).toBeGreaterThanOrEqual((mc.gang ?? 0) * 0.9);   // not fewer gangs because of it (only sampling noise)
    expect(mb.looters + (mb.gang ?? 0)).toBeLessThanOrEqual(ma.looters + (ma.gang ?? 0) + 200);
  });
  it('a hard-looking place is a worse bet for a peacetime burglar', () => {
    const a = lot(), b = lot(); for (const g of [a, b]) g.disaster.tracks = { ...g.disaster.tracks, law: 1, banks: 1, stores: 1 };
    walls(b); b.gate.respect = 1; peaceHire(b, 2);
    expect(breakInRate(b)).toBeLessThan(breakInRate(a));
  });
});

describe('the neighbors', () => {
  const withNeighbors = (disp: number[]): GameState => { const g = lot(); g.neighbors = g.neighbors.slice(0, disp.length); g.neighbors.forEach((n, i) => { n.disposition = disp[i]; n.status = 'home'; n.members = 3; }); return g; };
  const run = (g: GameState, look: number, days: number) => { for (let i = 0; i < days; i++) reputationDay(g, { fortress: look }); };
  it('a fortress look cools a neighbor who does not know you yet, to a floor, and never an ally', () => {
    const g = withNeighbors([0, 10, 40, 80]);
    run(g, 100, 3 * 365);
    expect(g.neighbors[0].disposition).toBeLessThan(0); expect(g.neighbors[0].disposition).toBeGreaterThanOrEqual(REP.COOL_FLOOR - 1e-9);
    expect(g.neighbors[2].disposition).toBe(40); expect(g.neighbors[3].disposition).toBe(80);   // allies keep their help
  });
  it('an open look does not cool anyone', () => {
    const g = withNeighbors([0, 10]); run(g, 40, 365);
    expect(g.neighbors.map(n => n.disposition)).toEqual([0, 10]);
  });
  it('a good-neighbor record warms them, less behind a fortress; a bad one does not', () => {
    const mk = (took: number, away: number, hum: number) => { const g = withNeighbors([0, 30]); g.gate.tookIn = took; g.gate.turnedAway = away; g.gate.humanity = hum; return g; };
    const good = mk(8, 0, 100), bad = mk(0, 8, 20), plain = mk(0, 0, 70);
    expect(goodRecord(good)).toBeGreaterThan(0.3); expect(goodRecord(bad)).toBeLessThan(-0.3); expect(Math.abs(goodRecord(plain))).toBeLessThan(0.05);
    run(good, 20, 200); run(bad, 20, 200);
    expect(good.neighbors[0].disposition).toBeGreaterThan(5); expect(good.neighbors[1].disposition).toBeGreaterThan(30);
    expect(bad.neighbors[1].disposition).toBeLessThanOrEqual(30);
    const open = mk(8, 0, 100), closed = mk(8, 0, 100); run(open, 20, 100); run(closed, 100, 100);
    expect(closed.neighbors[1].disposition).toBeLessThan(open.neighbors[1].disposition);   // slower behind a high wall, but a good record outweighs the cooling
    expect(closed.neighbors[1].disposition).toBeGreaterThan(30);
  });
  it('goodwill is capped, and neighbors who left are untouched', () => {
    const g = withNeighbors([68, 10]); g.neighbors[1].status = 'left'; g.gate.tookIn = 9; g.gate.humanity = 100;
    run(g, 0, 400); expect(g.neighbors[0].disposition).toBeLessThanOrEqual(REP.WARM_CAP); expect(g.neighbors[1].disposition).toBe(10);
  });
  it('the readout names what the road and the neighbors say, with its drivers and the effects', () => {
    const g = lot(); walls(g); g.gate.respect = 0.6; g.gate.tookIn = 5; g.gate.humanity = 95;
    const r = reputation(g, postureOf(g));
    expect(r.drivers.length).toBe(4); expect(r.lines.some(l => /Opportunists/.test(l))).toBe(true); expect(r.neighbors).toMatch(/good neighbors/);
    expect(closedLook({ fortress: 40 })).toBe(0); expect(closedLook({ fortress: 100 })).toBe(1);
  });
});

describe('a raid is never easier, and the allies are never fewer, because of the name (crews of 6 and 10)', () => {
  const rate = (g: GameState, crew: number): number => { let n = 0; for (let seed = 1; seed <= N; seed++) { const r = planBattle(g, crew, seed).result; if (r === 'breached' || r === 'overrun') n++; } return n / N; };
  const notWorse = (without: number, withEl: number) => { const sd = Math.sqrt((without * (1 - without) + withEl * (1 - withEl)) / N); expect(withEl).toBeLessThanOrEqual(without + 2 * sd + 1e-9); };
  for (const crew of [6, 10]) it(`a year of the fortress look on the neighbors, and the name (crew of ${crew})`, () => {
    const a = lot(), b = lot(); walls(a); walls(b); b.gate.respect = 1;
    for (const g of [a, b]) { g.neighbors.forEach((n, i) => { n.status = 'home'; n.members = 3; n.radio = true; n.disposition = i % 2 ? 40 : 5; }); }
    for (let d = 0; d < 365; d++) reputationDay(b, postureOf(b));
    expect(defenders(b).length).toBeGreaterThanOrEqual(defenders(a).length);
    notWorse(rate(a, crew), rate(b, crew));
  }, 120000);
});
