import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from '../state';
import { BLUEPRINTS } from '../blueprints';
import type { Battle } from '../battleTypes';
import { applyRaidDamage } from '../raidDamage';
import { DOME_KIND, type DomeTier } from './tiers';
import { domeOf, ownState, stateOf } from './live';
import { plantJobs, unitsOf } from './plantLive';
import { SIEGE_ORDER, SIEGE_ORDER_OPEN, pickUnits, plantFires, plantTargetOdds, reachable, strikePlant, unitsFor, yardBreachOdds, yardCover, type TargetCtx } from './plantStrike';
import { plantUnits, PLANT_KINDS } from './plantUnits';
import { yardGeometry } from './plantYard';
import { WALL_RESIST, ramOdds, blastOdds } from '../breachMeans';

const T0: TargetCtx = { organized: true, sealed: false, impervious: false, overrun: false, anyReachable: true, cover: 0 };

describe('which way a crew goes: the plant or not', () => {
  it('nothing reachable, nothing happens', () => { expect(plantTargetOdds({ ...T0, anyReachable: false })).toBe(0); });
  it('an organized crew goes for it more than a rabble, a sealed dome more than an open one, a shell nobody can open more than one that can be cut', () => {
    expect(plantTargetOdds(T0)).toBeGreaterThan(plantTargetOdds({ ...T0, organized: false }));
    expect(plantTargetOdds({ ...T0, sealed: true })).toBeGreaterThan(plantTargetOdds(T0));
    expect(plantTargetOdds({ ...T0, impervious: true })).toBeGreaterThan(plantTargetOdds(T0));
    expect(plantTargetOdds({ ...T0, overrun: true })).toBeLessThan(plantTargetOdds(T0));
  });
  it('is bounded, and towers and guards only ever put a crew off', () => {
    let last = 2;
    for (const cover of [0, 0.1, 0.3, 0.6, 1]) { const p = plantTargetOdds({ ...T0, sealed: true, impervious: true, cover }); expect(p).toBeLessThanOrEqual(last); expect(p).toBeLessThanOrEqual(0.85); expect(p).toBeGreaterThanOrEqual(0); last = p; }
  });
  it('the order of the siege: the substation first, the scrubbers next when sealed, the chillers next when open', () => {
    expect(SIEGE_ORDER[0]).toBe('substation'); expect(SIEGE_ORDER[1]).toBe('air'); expect(SIEGE_ORDER_OPEN[1]).toBe('chiller');
    const u = plantUnits('arcology', { filtering: 'closed', loop: 'recycle', spares: [] });
    const all = { yardBreached: true, shellOpened: true, airlockForced: true };
    expect(pickUnits(u, 2, true, all).map(x => x.kind)).toEqual(['substation', 'air']);
    expect(pickUnits(u, 2, false, all).map(x => x.kind)).toEqual(['substation', 'chiller']);
    expect(unitsFor(3)).toBe(1); expect(unitsFor(7)).toBe(2); expect(unitsFor(30)).toBe(3);
  });
  it('a unit is reachable only through what the crew opened', () => {
    const none = { yardBreached: false, shellOpened: false, airlockForced: false };
    for (const k of PLANT_KINDS) for (const place of ['yard', 'gallery', 'inside'] as const) expect(reachable(place, k, none)).toBe(false);
    expect(reachable('yard', 'chiller', { ...none, yardBreached: true })).toBe(true);
    expect(reachable('yard', 'substation', { ...none, airlockForced: true })).toBe(true);   // forcing an airlock opens the passage to the yard
    expect(reachable('yard', 'chiller', { ...none, shellOpened: true })).toBe(false);          // a hole in the glass is not the passage
    expect(reachable('gallery', 'air', { ...none, shellOpened: true })).toBe(false);
    expect(reachable('gallery', 'air', { ...none, airlockForced: true })).toBe(true);
    expect(reachable('inside', 'air', { ...none, shellOpened: true })).toBe(true);
  });
  it('a dome with nothing in reach is left alone, however organized the crew', () => {
    const u = plantUnits('arcology', { filtering: 'closed', loop: 'recycle', spares: [] });
    expect(pickUnits(u, 3, true, { yardBreached: false, shellOpened: false, airlockForced: false })).toEqual([]);
  });
});

describe('breaching the hardened yard uses the wall model', () => {
  const A = { truck: true, satchels: 1, difficulty: 'standard' as const, cover: 0 };
  it('no truck and no charge: a concrete wall holds', () => { expect(yardBreachOdds({ ...A, truck: false, satchels: 0 })).toBe(0); });
  it('more means help the crew, and every counter only helps the yard (bollards, a reinforced gate, an anti-vehicle ditch, towers and guards)', () => {
    expect(yardBreachOdds({ ...A, satchels: 2 })).toBeGreaterThan(yardBreachOdds(A));
    expect(yardBreachOdds(A)).toBeGreaterThan(yardBreachOdds({ ...A, truck: false, satchels: 0 }));
    expect(yardBreachOdds({ ...A, bollards: true })).toBeLessThanOrEqual(yardBreachOdds(A));
    expect(yardBreachOdds({ ...A, vehicleBlocked: 0.8 })).toBeLessThanOrEqual(yardBreachOdds(A));
    let last = 1; for (const cover of [0, 0.2, 0.4, 0.6, 0.9]) { const p = yardBreachOdds({ ...A, cover }); expect(p).toBeLessThanOrEqual(last); last = p; }
    for (const d of ['cozy', 'standard', 'hardcore'] as const) { expect(yardBreachOdds({ ...A, difficulty: d })).toBeLessThanOrEqual(0.95); }
  });
  it('there is no gate weak point: the odds are the wall-only odds, lower than the same crew at a gate', () => {
    const wallOnly = yardBreachOdds(A), atGate = 1 - (1 - ramOdds({ wallKind: 'concrete_wall', gate: true, difficulty: 'standard', bollards: false, gateBarrier: 3, vehicleBlocked: 0 })) * (1 - blastOdds({ wallKind: 'concrete_wall', gate: true, difficulty: 'standard', gateBarrier: 3 }));
    expect(wallOnly).toBeLessThan(atGate);
    expect(wallOnly).toBeCloseTo(1 - (1 - ramOdds({ wallKind: 'concrete_wall', gate: false, difficulty: 'standard', bollards: false, gateBarrier: 0, vehicleBlocked: 0 })) * (1 - blastOdds({ wallKind: 'concrete_wall', gate: false, difficulty: 'standard', gateBarrier: 0 })), 6);
  });
  it('the yard wall is the poured-concrete wall of the ordinary table: harder than the fences', () => {
    expect(WALL_RESIST.concrete_wall.ram).toBeLessThan(WALL_RESIST.chain_link.ram);
    expect(yardBreachOdds({ ...A, truck: true, satchels: 0 })).toBeLessThan(0.6);
  });
});

// ── an integration: a crew in a glass dome's compound ──

const baseGame = (tier: DomeTier = 'glass'): GameState => {
  const g = newGame(5); g.money = 1e9;
  const kind = DOME_KIND[tier], st: Structure = { id: 'dm', kind, x: 0, z: 0, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 };
  g.structures.push(st, { id: 'h1', kind: 'log_house', x: 0.3, z: 0.3, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as Structure);
  const d = domeOf(g)!, o = ownState(g, d); o.filtering = 'advanced'; o.loop = 'grey';
  return g;
};
const crew = (men: number, truck: boolean, satchels: number, kind = 'gang'): Battle => ({
  night: false, duration: 1, events: [], units: Array.from({ length: men }, (_, i) => ({ id: `r${i}`, side: 'raider', x: 0, z: 0 })) as Battle['units'],
  raid: { crew: kind, breach: { method: 'ram', where: null, t: 0, attempts: [], crewHad: { truck, satchels } }, fires: [] } as unknown as Battle['raid'],
} as Battle);
const always = () => 0;

describe('strikePlant', () => {
  it('a crew with hand tools only cannot get into the yard: nothing is touched', () => {
    const g = baseGame(); const lines = strikePlant(g, crew(8, false, 0), false, always, { opened: false, airlock: false });
    expect(plantJobs(g, 'dm').length).toBe(0); expect(lines.join(' ')).not.toMatch(/broke into/);
  });
  it('a crew with a truck and charges, set on it, breaks in and wrecks the best units: substation first', () => {
    const g = baseGame(); const lines = strikePlant(g, crew(9, true, 3), false, always, { opened: false, airlock: false });
    const jobs = plantJobs(g, 'dm');
    expect(jobs.length).toBeGreaterThan(0); expect(jobs.length).toBeLessThanOrEqual(3);
    expect(jobs.some(j => j.unit === 'substation')).toBe(true);
    for (const j of jobs) { expect(j.kind).toBe('plant'); expect(j.cause).toBe('raid'); }
    expect(lines.join(' ')).toMatch(/plant yard|machinery/);
    // everything stored in yard places only (no shell was opened)
    for (const j of jobs) expect(['chiller', 'substation', 'chiller2', 'substation2']).toContain(j.unit);
  });
  it('an open shell reaches what stands inside it; the gallery needs an airlock forced', () => {
    const g = baseGame('arcology'); const o = ownState(g, domeOf(g)!); o.filtering = 'closed'; o.loop = 'recycle';
    strikePlant(g, crew(9, false, 0), false, always, { opened: true, airlock: false });
    expect(unitsOf(g, domeOf(g)!, stateOf(g, domeOf(g)!)).filter(u => u.cond !== 'ok').every(u => u.kind === 'vents')).toBe(true);
    const g2 = baseGame('arcology'); const o2 = ownState(g2, domeOf(g2)!); o2.filtering = 'closed'; o2.loop = 'recycle';
    strikePlant(g2, crew(9, false, 0), false, always, { opened: false, airlock: true });
    expect(plantJobs(g2, 'dm').length).toBeGreaterThan(0);
  });
  it('a rabble that is not set on it does not go (the draw says no)', () => {
    const g = baseGame(); strikePlant(g, crew(8, true, 2, 'looters'), false, () => 0.99, { opened: false, airlock: false });
    expect(plantJobs(g, 'dm').length).toBe(0);
  });
  it('towers and guards in reach of the yard lower the cover number up, never down', () => {
    const g = baseGame(), y = yardGeometry('glass', domeOf(g)!.r)!;
    const c0 = yardCover(g, y, 0, 0);
    g.structures.push({ id: 'tw', kind: 'watchtower_concrete', x: y.center[0] + 1, z: y.center[1], rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as Structure);
    expect(yardCover(g, y, 0, 0)).toBeGreaterThan(c0);
  });
  it('is wired into the raid damage: a crew that got in can leave plant jobs, and the dome is not the only thing it breaks', () => {
    const g = baseGame(); const b = crew(9, true, 3);
    const lines = applyRaidDamage(g, b, false, always);
    expect(plantJobs(g, 'dm').length).toBeGreaterThan(0);
    expect(lines.length).toBeGreaterThan(0);
  });
  it('a fire in the yard scorches a unit', () => {
    const g = baseGame(), y = yardGeometry('glass', domeOf(g)!.r)!;
    const lines = plantFires(g, [{ x: y.center[0], z: y.center[1] }], always);
    expect(lines.length).toBe(1); expect(plantJobs(g, 'dm')[0].cause).toBe('fire');
    expect(plantFires(baseGame(), [{ x: 90, z: 90 }], always)).toEqual([]);
  });
});
