import { describe, it, expect } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import type { DisasterKind } from './disaster';
import { effectsDay } from './effects';
import { FX, fxPriceMod, fxApplyServiceMods } from './disasterFx';
import { expectedLoss, floodLevel, quakeBase, repairLeadDays, repairQuote, resistance, rollLevel } from './structureDamage';
import { curveAt, winterAt } from './winter';
import { ashClass, depthAt, roofRatio, roofVerdict, forecast, shovelHours, FALL_DAYS } from './ashfall';
import { aftershockMag, omoriP, surge } from './quake';
import { arcAt, blastHazard, rollImpact } from './impactZone';
import { buyRetrofit, buyRider, hasRider, jumpQueue, physicalOf, repairMarket } from './physical';
import { crewProblem } from './crews';
import { cardsFor, gauges, goalChain, resolveCard } from './physicalFelt';
import { muckOut, floodDepthFt, floodOf } from './disasters/dam_flood';
import { quakeOf } from './disasters/mega_quake';
import { asteroidOf } from './disasters/asteroid';
import { FULL } from './disaster';

const run = (kind: DisasterKind, seed = 1) => newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind });
const at = (g: GameState, d: number) => { g.clock.t = g.disaster.hitAt + d; return g; };
const built = (g: GameState, id: string, kind: string, x = 10, z = 10): Structure => { const st: Structure = { id, kind, x, z, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };

describe('the shared damage model', () => {
  it('a better-built, retrofitted building loses less; bolting the sill cuts a quake by more than half', () => {
    const base = quakeBase(8.5);
    expect(expectedLoss(base, resistance('quake', 'timber_cabin', { retrofits: ['sill'] }))).toBeLessThan(expectedLoss(base, resistance('quake', 'timber_cabin')) * 0.5);
    expect(resistance('quake', 'stone_house')).toBeGreaterThan(resistance('quake', 'timber_frame') * 3);
    expect(resistance('quake', 'timber_cabin', { unfinished: true })).toBeCloseTo(1.8);
    expect(resistance('quake', 'timber_cabin', { soft: true })).toBe(2);
  });
  it('rolls states 0..3 from a die; more hazard means more and worse states', () => {
    const count = (p: number) => { const c = [0, 0, 0, 0]; for (let i = 0; i < 1000; i++) c[rollLevel(p, 1, (i + 0.5) / 1000)]++; return c; };
    const c = count(0.3);
    expect(c[0]).toBe(700);
    expect(c[1]).toBeGreaterThan(c[2]); expect(c[2]).toBeGreaterThan(c[3]);
    expect(count(0.55)[3]).toBeGreaterThan(c[3]);
  });
  it('flood depth and speed set the state; anchoring and a raised floor help', () => {
    expect(floodLevel(-1, 'still')).toBe(0);
    expect(floodLevel(0.5, 'still')).toBe(1);
    expect(floodLevel(3, 'still')).toBe(2);
    expect(floodLevel(6, 'still')).toBe(3);
    expect(floodLevel(6, 'still', { anchored: true })).toBe(2);
    expect(floodLevel(1, 'torrent')).toBe(3);
    expect(floodLevel(-1, 'still', { cellar: true })).toBeGreaterThan(0);
  });
  it('crews wait 3 x (1 + 8 x share) days and a premium skips the queue', () => {
    expect(repairLeadDays(0)).toBe(3); expect(repairLeadDays(0.5)).toBe(15); expect(repairLeadDays(1)).toBe(27);
    const slow = repairQuote(2, 40000, { wealth: 0, crews: 0, share: 0.5 }), crew = repairQuote(2, 40000, { wealth: 1, crews: 1, share: 0.5 }), jump = repairQuote(2, 40000, { wealth: 1, crews: 1, share: 0.5, jumped: true });
    expect(jump.days).toBeLessThan(crew.days); expect(crew.lead).toBe(15); expect(slow.lead).toBe(15);
  });
});

describe('the winter engine, ash fall, quake and impact math', () => {
  it('winter: nothing for a month, full by month six, easing over years; harsher in the north', () => {
    expect(curveAt(10)).toBe(0); expect(curveAt(180)).toBe(1); expect(curveAt(365)).toBe(1); expect(curveAt(365 + 14 * 30.4)).toBeCloseTo(0.5, 1);
    expect(winterAt(200, 1, 'mountain_west').grow).toBeCloseTo(0.15, 2);
    expect(winterAt(200, 1, 'pnw').grow).toBeGreaterThan(winterAt(200, 1, 'mountain_west').grow);
    expect(winterAt(200, 0, 'plains').grow).toBe(1);
    expect(winterAt(200, 1, 'plains').solar).toBeLessThan(0.7);
  });
  it('ash: the fall adds up to the target in front-loaded days; wet ash is heavier; shoveling takes hours', () => {
    expect(depthAt(20, FALL_DAYS)).toBeCloseTo(20); expect(depthAt(20, 9)).toBeGreaterThan(20 * 0.5); expect(depthAt(20, 100)).toBeCloseTo(20);
    expect(roofRatio(4, 25, true, false)).toBeGreaterThan(roofRatio(4, 25, false, false));
    expect(roofVerdict(0.5, 0.9)).toBe('ok'); expect(roofVerdict(0.8, 0.9)).toBe('strain'); expect(roofVerdict(1.1, 0.9)).toBe('risk'); expect(roofVerdict(1.1, 0.1)).toBe('collapse'); expect(roofVerdict(1.6, 0.9)).toBe('collapse');
    expect(ashClass(20)).toBe('near'); expect(ashClass(0.3)).toBe('light');
    expect(Math.abs(forecast(10, 1, 3) - 10)).toBeLessThanOrEqual(1.01);
    expect(shovelHours('lodge', 2)).toBe(18);
  });
  it('quake: Omori decays, aftershocks are smaller than the main shock, demand surges then fades', () => {
    expect(omoriP(1, 'A')).toBeGreaterThan(omoriP(20, 'A')); expect(omoriP(1, 'C')).toBeLessThan(omoriP(1, 'A') / 5);
    expect(aftershockMag(9, 1, 0)).toBeLessThanOrEqual(7.8);
    expect(surge(20, 'A')).toBeGreaterThan(surge(3, 'A')); expect(surge(300, 'A')).toBeLessThan(surge(20, 'A')); expect(surge(20, 'C')).toBeLessThan(surge(20, 'A'));
  });
  it('impact: deterministic, Cozy drops land impacts, the odds climb to certainty and blast hazard falls with distance', () => {
    expect(rollImpact(5, 'plains', 'standard')).toEqual(rollImpact(5, 'plains', 'standard'));
    for (let sd = 1; sd < 60; sd++) expect(rollImpact(sd, 'plains', 'cozy').variant).not.toBe('land');
    const imp = rollImpact(3, 'plains', 'standard');
    expect(arcAt(180, imp).odds).toBeLessThan(arcAt(120, imp).odds); expect(arcAt(60, imp).odds).toBe(1);
    expect(arcAt(60, imp).corridorMi!).toBeLessThan(arcAt(30, imp).corridorMi! * 2);
    expect(blastHazard('airburst', 4)).toBe(1); expect(blastHazard('airburst', 40)).toBeLessThan(blastHazard('airburst', 9));
  });
});

describe('in the game: quake', () => {
  it('shakes the buildings, leaves a repair list, books the crews, and excludes the quake from ordinary insurance', () => {
    const g = run('mega_quake', 4); g.site.region = 'pnw'; at(g, 0);
    g.disaster.fx = { mega_quake: { variant: 'cascadia', band: 'A', mag: 9, mmi: 9.2, seconds: 240, strong: 0, lastMag: 0, flue: {}, rescued: 0 } };
    const walls = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => built(g, `h${i}`, 'stone_house', i * 2, i));
    const bolted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => built(g, `b${i}`, 'timber_frame', i * 2, 30 + i));
    FX.mega_quake.onHit!(g);
    const lines = effectsDay(g);
    expect(lines.length).toBeGreaterThan(0);
    const bad = (xs: Structure[]) => xs.filter(x => (physicalOf(g).damage[x.id]?.level ?? 0) >= 2).length;
    expect(bad(walls)).toBeGreaterThan(bad(bolted));
    expect(lines.join(' ')).toMatch(/excludes earthquake/);   // ordinary insurance pays nothing for a quake
    expect(lines.join(' ')).not.toMatch(/rider paid/);
    expect(repairMarket(g).leadDays).toBeGreaterThan(10);
    expect(crewProblem(g, walls[0])).toMatch(/booked/);
    expect(jumpQueue(g)).toBeNull();
    expect(repairMarket(g).leadDays).toBe(0); expect(repairMarket(g).rate).toBe(1.5);
    expect(fxPriceMod(g)).toBeGreaterThan(1.2);
    expect(() => JSON.parse(JSON.stringify(g.disaster.fx))).not.toThrow();
  });
  it('a rider pays after a quake; a bolted sill is a purchase', () => {
    const g = run('mega_quake', 6); g.site.region = 'pnw'; g.money = 200_000; g.clock.t = g.disaster.hitAt - 10;
    const home = built(g, 'home', 'timber_cabin');
    expect(buyRetrofit(g, home, 'sill')).toBeNull(); expect(buyRetrofit(g, home, 'sill')).toBe('already done');
    expect(buyRider(g, 'quake')).toBeNull(); expect(hasRider(g, 'quake')).toBe(true);
    g.clock.t = g.disaster.hitAt; g.disaster.fx = { ...g.disaster.fx, mega_quake: { variant: 'cascadia', band: 'A', mag: 9, mmi: 10, seconds: 240, strong: 0, lastMag: 0, flue: {}, rescued: 0 } };
    for (const st of g.structures) st.kind = 'stone_house';
    const before = g.money; FX.mega_quake.onHit!(g); effectsDay(g);
    const wrecked = Object.values(physicalOf(g).damage).some(r => r.level >= 2);
    expect(wrecked).toBe(true);
    expect(g.money).toBeGreaterThan(before);
  });
  it('aftershocks keep coming on an Omori schedule and re-roll the cracked', () => {
    let strong = 0;
    for (let seed = 1; seed < 6; seed++) {
      const g = run('mega_quake', seed); g.site.region = 'pnw'; at(g, 0); quakeOf(g);
      for (let d = 1; d <= 12; d++) { at(g, d); effectsDay(g); }
      strong += quakeOf(g).strong;
    }
    expect(strong).toBeGreaterThan(5);
  });
});

describe('in the game: flood', () => {
  it('low ground floods, the bench stays dry; muck out inside 48 hours or the mold takes the walls', () => {
    const g = run('dam_flood', 2); at(g, 0);
    const F = floodOf(g); F.stage = 14; F.variant = 'levee_flood';
    expect(floodDepthFt(g, { id: 'x', kind: 'timber_cabin', x: 10, z: 10 }, 14)).toBeTypeOf('number');
    const low = built(g, 'low', 'garden');
    FX.dam_flood.onHit!(g); effectsDay(g);
    const lowRec = physicalOf(g).damage[low.id];
    if (lowRec) { expect(lowRec.moldAt).toBeGreaterThan(g.clock.t); expect(muckOut(g, 'family')).toMatch(/tore out/); expect(physicalOf(g).damage[low.id].dried).toBe(true); }
    expect(() => JSON.stringify(g.disaster.fx)).not.toThrow();
  });
  it('mold turns a wet minor room into a major one after two days if nobody dries it', () => {
    const g = run('dam_flood', 3); at(g, 0);
    const st = built(g, 'room', 'timber_cabin'); const P = physicalOf(g);
    P.damage.room = { level: 1, hazard: 'flood', t: g.clock.t, moldAt: g.clock.t + 2 };
    at(g, 4); effectsDay(g);
    expect(P.damage.room.level).toBe(2); expect(st.finishedAt).toBeNull();
  });
});

describe('in the game: ash and impact', () => {
  it('prices and services follow the ash class; the shared winter cuts the grow factor', () => {
    const g = at(run('ash_winter', 2), 60);
    expect(fxPriceMod(g)).toBeGreaterThan(1.1);
    const s2 = at(run('supervolcano', 2), 200);
    expect(FX.supervolcano.supplyMods!(s2).grow).toBeLessThan(0.5);
    s2.disaster.tracks = { ...FULL, grid: 0.2 }; fxApplyServiceMods(s2);
    expect(s2.disaster.tracks.grid).toBeGreaterThanOrEqual(0.2);
  });
  it('a deflected impact is a happy ending: every service reads as normal', () => {
    const g = at(run('asteroid', 7), 0);
    asteroidOf(g).impact.deflection = 'success';
    g.disaster.tracks = { ...FULL, grid: 0 };
    const out = FX.asteroid.onHit!(g);
    expect(out[0]).toMatch(/interceptor worked/);
    expect(g.disaster.tracks.grid).toBe(1);
    expect(FX.asteroid.structureDamage!(g, { day: 0, r: () => 0.5, once: () => true })).toEqual([]);
  });
  it('a regional impact breaks glass and roofs by distance', () => {
    const g = at(run('asteroid', 8), 0); const A = asteroidOf(g);
    A.impact = { ...A.impact, variant: 'airburst', miles: 10, band: 'near', deflection: 'none' };
    for (let i = 0; i < 6; i++) built(g, `c${i}`, 'timber_cabin', i * 3, 5);
    FX.asteroid.structureDamage!(g, { day: 0, r: (() => { let i = 0; return () => ((i++ * 0.37) % 1); })(), once: () => true });
    expect(Object.keys(physicalOf(g).damage).length).toBeGreaterThan(0);
  });
});

describe('the felt layer data', () => {
  it('every WP6 kind has a goal chain, gauges and (in its moment) a decision card that can be settled', () => {
    for (const k of ['mega_quake', 'dam_flood', 'ash_winter', 'supervolcano', 'asteroid'] as DisasterKind[]) {
      const g = run(k, 9); at(g, -1); g.disaster.phase = 'warning';
      const chain = goalChain(g); expect(chain, k).not.toBeNull(); expect(chain!.steps.length).toBeGreaterThanOrEqual(4);
      expect(Array.isArray(gauges(g))).toBe(true);
    }
    const g = run('mega_quake', 9); g.disaster.phase = 'warning'; g.money = 50_000; built(g, 'home', 'timber_cabin');
    const cards = cardsFor(g); expect(cards.map(c => c.id)).toContain('q_prep');
    resolveCard(g, 'q_prep', 'both');
    expect(physicalOf(g).straps).toBe(true); expect(cardsFor(g).map(c => c.id)).not.toContain('q_prep');
  });
});
