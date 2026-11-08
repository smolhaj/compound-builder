import { describe, expect, it } from 'vitest';
import { BOLLARD, GATE_BASE, MEANS_DIFF, WALL_RESIST, blastOdds, chooseHow, countersOf, crewMeans, ramOdds, wallTarget, truckSeconds } from './breachMeans';
import { PERIMETER, type PerimeterRun } from './perimeter';
import { mulberry32 } from './rng';
import { newGame } from './state';

const none = { bollards: false, gateBarrier: 0, vehicleBlocked: 0 };
const run = (kind: string, pts: Array<[number, number]>, gates: PerimeterRun['gates'] = []): PerimeterRun => ({ id: `r-${kind}`, kind: kind as PerimeterRun['kind'], pts, gates, done: 10, hours: 10, supplied: true, finishedAt: 0 });
const box = (half: number, kind: string, gates: PerimeterRun['gates'] = []) => run(kind, [[-half, -half], [half, -half], [half, half], [-half, half], [-half, -half]], gates);

describe('what a crew brings', () => {
  it('refugees and hordes bring nothing; a gang often a truck; Hardcore more than Standard more than Cozy', () => {
    const tally = (kind: Parameters<typeof crewMeans>[0]['kind'], difficulty: 'cozy' | 'standard' | 'hardcore') => { let t = 0, c = 0; const r = mulberry32(5); for (let i = 0; i < 3000; i++) { const m = crewMeans({ kind, men: 8, organized: true, armed: true, late: 0.6, difficulty }, r); t += m.truck ? 1 : 0; c += m.satchels; } return [t / 3000, c / 3000]; };
    expect(tally('refugees', 'hardcore')).toEqual([0, 0]); expect(tally('horde', 'hardcore')).toEqual([0, 0]);
    const [cz, st, hc] = (['cozy', 'standard', 'hardcore'] as const).map(d => tally('gang', d)[0]);
    expect(cz).toBeLessThan(st); expect(st).toBeLessThan(hc); expect(st).toBeGreaterThan(0.2);
  });
  it('an unarmed or tiny crew brings no truck and no charge', () => {
    expect(crewMeans({ kind: 'gang', men: 8, organized: true, armed: false, late: 1, difficulty: 'hardcore' }, () => 0)).toEqual({ truck: false, satchels: 0 });
    expect(crewMeans({ kind: 'gang', men: 2, organized: true, armed: true, late: 1, difficulty: 'hardcore' }, () => 0)).toEqual({ truck: false, satchels: 0 });
  });
});

describe('odds against a wall', () => {
  const diff = 'hardcore' as const;
  it('the wall kind matters: chain-link yields to a truck, a container wall or concrete mostly does not, a ditch stops it dead', () => {
    const o = (k: string) => ramOdds({ wallKind: k, gate: false, difficulty: diff, ...none });
    expect(o('chain_link')).toBeGreaterThan(0.7); expect(o('container_wall')).toBeLessThan(0.35); expect(o('concrete_wall')).toBeLessThan(o('container_wall')); expect(o('ditch')).toBe(0); expect(o('moat')).toBe(0);
    expect(o('chain_link')).toBeGreaterThan(o('log_palisade'));
  });
  it('a gate is weaker than the wall round it; the reinforced gate (motor cage, double gate) hardens it', () => {
    const wall = ramOdds({ wallKind: 'container_wall', gate: false, difficulty: diff, ...none }), gate = ramOdds({ wallKind: 'container_wall', gate: true, difficulty: diff, ...none });
    expect(gate).toBeGreaterThan(wall);
    const hard = ramOdds({ wallKind: 'container_wall', gate: true, difficulty: diff, ...none, gateBarrier: 9 });
    expect(hard).toBeLessThan(gate); expect(hard).toBeGreaterThan(0);
  });
  it('bollards turn most of a ram at the gate and some at the wall, and do nothing to a charge', () => {
    const base = ramOdds({ wallKind: 'chain_link', gate: true, difficulty: diff, ...none }), withB = ramOdds({ wallKind: 'chain_link', gate: true, difficulty: diff, ...none, bollards: true });
    expect(withB / base).toBeCloseTo(BOLLARD.gate, 5);
    expect(blastOdds({ wallKind: 'chain_link', gate: true, difficulty: diff, gateBarrier: 0 })).toBeGreaterThan(0.5);
  });
  it('every counter only ever lowers the odds (property)', () => {
    const r = mulberry32(3);
    for (let i = 0; i < 400; i++) {
      const kinds = Object.keys(WALL_RESIST), kind = kinds[Math.floor(r() * kinds.length)], gate = r() < 0.5, d = (['cozy', 'standard', 'hardcore'] as const)[i % 3];
      const base = { wallKind: kind, gate, difficulty: d, bollards: false, gateBarrier: 0, vehicleBlocked: 0 };
      const p0 = ramOdds(base);
      for (const more of [{ bollards: true }, { gateBarrier: 3 }, { gateBarrier: 9 }, { vehicleBlocked: 0.5 }, { vehicleBlocked: 1 }]) expect(ramOdds({ ...base, ...more })).toBeLessThanOrEqual(p0 + 1e-12);
      expect(blastOdds({ ...base, gateBarrier: 9 })).toBeLessThanOrEqual(blastOdds(base) + 1e-12);
    }
  });
  it('Standard stays forgiving: the same attempt is worth less than on Hardcore, and Cozy less again', () => {
    const o = (d: 'cozy' | 'standard' | 'hardcore') => ramOdds({ wallKind: 'log_palisade', gate: false, difficulty: d, ...none });
    expect(o('cozy')).toBeLessThan(o('standard')); expect(o('standard')).toBeLessThan(o('hardcore')); expect(MEANS_DIFF.standard.odds).toBeLessThan(1);
  });
  it('odds are probabilities', () => {
    for (const k of Object.keys(WALL_RESIST)) for (const gate of [false, true]) { const p = ramOdds({ wallKind: k, gate, difficulty: 'hardcore', ...none }); expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(0.95); }
    expect(GATE_BASE.ram).toBeLessThan(1);
  });
  it('a crew takes the best of what it has, and climbs when nothing is worth trying', () => {
    expect(chooseHow({ truck: true, satchels: 0 }, 0.6, 0.5)).toBe('ram');
    expect(chooseHow({ truck: true, satchels: 1 }, 0, 0.5)).toBe('charge');
    expect(chooseHow({ truck: true, satchels: 0 }, 0, 0.5)).toBe('climb');
    expect(chooseHow({ truck: false, satchels: 0 }, 0.9, 0.9)).toBe('climb');
  });
});

describe('the drawn wall is the break point', () => {
  const home = { x: 0, z: 0 };
  it('finds the wall segment the approach crosses, on the real run, not a radius', () => {
    const w = wallTarget([box(15, 'container_wall')], home, { x: 0, z: 1 }, { width: 0.7, preferGate: false });
    expect(w).not.toBeNull(); expect(w!.runId).toBe('r-container_wall'); expect(w!.z).toBeCloseTo(15, 3); expect(Math.abs(w!.x)).toBeLessThan(0.01); expect(w!.dist).toBeCloseTo(15, 2);
    expect(w!.out.z).toBeGreaterThan(0.9);
    const diag = wallTarget([box(15, 'container_wall')], home, { x: Math.SQRT1_2, z: Math.SQRT1_2 }, { width: 0.7, preferGate: false });
    expect(diag!.dist).toBeGreaterThan(20);   // a corner is farther than a face: the old radius was one number for both
  });
  it('a ram goes for the gate in the wall; a charge or a climb takes the wall beside it', () => {
    const r = box(15, 'container_wall', [{ at: 14.5, w: 1.2 }]);   // the gate on the south leg, 14.5 along (the approach crosses at 15)
    const dir = { x: 0, z: -1 };
    const a = wallTarget([{ ...r, pts: [[-15, -15], [15, -15], [15, 15], [-15, 15], [-15, -15]] }], home, dir, { width: 0.7, preferGate: true });
    expect(a!.gate).toBe(true); expect(a!.w).toBeCloseTo(1.2);
    const b = wallTarget([r], home, dir, { width: 0.7, preferGate: false });
    expect(b!.gate).toBe(false);
  });
  it('no solid wall, no target (a ditch alone, an open yard)', () => {
    expect(wallTarget([], home, { x: 0, z: 1 }, { width: 0.7, preferGate: false })).toBeNull();
    expect(wallTarget([box(15, 'ditch')], home, { x: 0, z: 1 }, { width: 0.7, preferGate: false })).toBeNull();
    expect(PERIMETER.ditch.blocks.vehicles).toBe(1);
  });
  it('an anti-vehicle ditch in front of the target blocks the truck; bollards and the gate kit are read from the stock', () => {
    const g = newGame(1);
    g.perimeter = [box(15, 'container_wall'), run('ditch', [[-6, 19], [6, 19]])];
    g.perimeter.forEach(p => { p.finishedAt = 0; p.done = p.hours; });
    const t = wallTarget(g.perimeter, { x: 0, z: 0 }, { x: 0, z: 1 }, { width: 0.7, preferGate: false })!;
    const c = countersOf(g, t, { x: 0, z: 0 }, t.runId);
    expect(c.vehicleBlocked).toBeGreaterThan(0.5);
    g.stock.bollards = 1; g.stock.gate_motor = 1;
    const c2 = countersOf(g, t, { x: 0, z: 0 }, t.runId);
    expect(c2.bollards).toBe(true); expect(c2.gateBarrier).toBe(3);
  });
  it('the truck takes longer from farther out', () => { expect(truckSeconds(40)).toBeGreaterThan(truckSeconds(10)); });
});
