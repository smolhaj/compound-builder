import { describe, expect, it } from 'vitest';
import { follow, gradeDelta, oasisFactors } from '../../engine/world/post/oasisGrade';
import { compoundPolygons, edgeDistance, insideness, rectRing, samplePoint } from './compoundRegion';
import { lanternLevel, lanternPlan, MAX_LANTERNS } from './lanternPlan';
import type { PerimeterRun } from '../../sim/perimeter';

const run = (over: Partial<PerimeterRun> & { pts: PerimeterRun['pts'] }): PerimeterRun => ({ id: 'r1', kind: 'stone_wall', gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0, ...over });
const sq = (a: number): PerimeterRun['pts'] => [[-a, -a], [a, -a], [a, a], [-a, a], [-a, -a]];

describe('oasisFactors', () => {
  it('is entirely off in peacetime, wherever the camera is', () => {
    for (const inside of [0, 0.5, 1]) {
      const f = oasisFactors({ collapse: 0, safety: 1, inside });
      expect(f.warm).toBe(0);
      expect(f.ruin).toBe(0);
    }
  });
  it('is warm inside a held compound and ruined outside once the world has fallen', () => {
    const inn = oasisFactors({ collapse: 0.9, safety: 1, inside: 1 });
    const out = oasisFactors({ collapse: 0.9, safety: 1, inside: 0 });
    expect(inn.warm).toBeGreaterThan(0.95);
    expect(inn.ruin).toBeLessThan(0.05);
    expect(out.ruin).toBeGreaterThan(0.95);
    expect(out.warm).toBe(0);
  });
  it('a breach (low safety) dims the warmth inside and lets the ruin in', () => {
    const ok = oasisFactors({ collapse: 0.9, safety: 1, inside: 1 });
    const hit = oasisFactors({ collapse: 0.9, safety: 0.2, inside: 1 });
    expect(hit.warm).toBeLessThan(ok.warm * 0.3);
    expect(hit.ruin).toBeGreaterThan(0.6);
  });
  it('warm + ruin always equals the presence, and moves smoothly with every input', () => {
    let prev = oasisFactors({ collapse: 0.6, safety: 1, inside: 0 });
    for (let k = 1; k <= 100; k++) {
      const f = oasisFactors({ collapse: 0.6, safety: 1, inside: k / 100 });
      expect(f.warm + f.ruin).toBeCloseTo(f.presence, 9);
      expect(Math.abs(f.warm - prev.warm)).toBeLessThan(0.03);
      prev = f;
    }
  });
});

describe('gradeDelta', () => {
  it('is neutral with no collapse', () => {
    const d = gradeDelta(oasisFactors({ collapse: 0, safety: 1, inside: 1 }), 1, 0);
    expect(d.cast).toEqual([1, 1, 1]);
    expect(d.satMul).toBe(1); expect(d.warmAdd).toBe(0); expect(d.fogFire).toBe(0); expect(d.horizonFire).toBe(0); expect(d.fogDensityMul).toBe(1); expect(d.lift).toEqual([0, 0, 0]); expect(d.nightKeep).toBe(1);
  });
  it('warms inside (more red than blue) and cools outside (more blue than red), and fires show at night only', () => {
    const w = gradeDelta(oasisFactors({ collapse: 0.9, safety: 1, inside: 1 }), 1, 0);
    const r = gradeDelta(oasisFactors({ collapse: 0.9, safety: 1, inside: 0 }), 1, 0);
    expect(w.cast[0]).toBeGreaterThan(w.cast[2]);
    expect(r.cast[2]).toBeGreaterThan(r.cast[0]);
    expect(r.satMul).toBeLessThan(0.8);
    expect(w.shadowTint).toBeLessThan(0.6);
    const day = gradeDelta(oasisFactors({ collapse: 0.9, safety: 1, inside: 0 }), 0, 0);
    expect(day.horizonFire).toBe(0);
    expect(r.horizonFire).toBeGreaterThan(0.6);
  });
  it('follow moves toward a target without overshoot', () => {
    let v = 0;
    for (let i = 0; i < 20; i++) { const n = follow(v, 1, 0.1, 1); expect(n).toBeGreaterThanOrEqual(v); expect(n).toBeLessThanOrEqual(1); v = n; }
    expect(follow(0.3, 0.9, 0, 1)).toBe(0.3);
  });
});

describe('compoundRegion', () => {
  it('finds closed finished tall rings and skips open, unfinished and low fences', () => {
    expect(compoundPolygons([run({ pts: sq(10) })]).length).toBe(1);
    expect(compoundPolygons([run({ pts: sq(10), finishedAt: null })]).length).toBe(0);
    expect(compoundPolygons([run({ pts: sq(10).slice(0, 4) })]).length).toBe(0);
    expect(compoundPolygons([run({ pts: sq(10), kind: 'split_rail' })]).length).toBe(0);
    expect(compoundPolygons([run({ pts: sq(10), dropped: true })]).length).toBe(0);
  });
  it('insideness is 1 deep inside, 0 far outside, 0.5 on the wall, monotonic across it', () => {
    const polys = compoundPolygons([run({ pts: sq(10) })]);
    expect(insideness(polys, 0, 0)).toBe(1);
    expect(insideness(polys, 30, 0)).toBe(0);
    expect(insideness(polys, 10, 0)).toBeCloseTo(0.5, 1);
    let prev = -1;
    for (let x = 16; x >= 0; x -= 0.5) { const v = insideness(polys, x, 0); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
    expect(insideness([], 0, 0)).toBe(0);
  });
  it('edgeDistance and rectRing', () => {
    expect(edgeDistance(rectRing({ x0: 0, z0: 0, x1: 4, z1: 4 }), 2, 1)).toBeCloseTo(1);
  });
  it('samples under the camera at eye level and under the target from high above', () => {
    const e = samplePoint({ x: 20, y: 1, z: 0 }, { x: 0, z: 0 }, 0);
    expect(e.x).toBe(20);
    const a = samplePoint({ x: 20, y: 40, z: 0 }, { x: 0, z: 0 }, 0);
    expect(a.x).toBe(0);
  });
});

describe('lanterns', () => {
  it('hang by each gate, over it, and along a closed ring, none on open or unfinished runs', () => {
    const ring = run({ pts: sq(12), gates: [{ at: 12, w: 2 }] });
    const plan = lanternPlan([ring]);
    expect(plan.filter(l => l.gate).length).toBe(1);
    expect(plan.length).toBeGreaterThan(8);
    expect(plan.length).toBeLessThanOrEqual(MAX_LANTERNS);
    for (const l of plan) { expect(Number.isFinite(l.x + l.z + l.y)).toBe(true); expect(Math.hypot(l.ox, l.oz)).toBeCloseTo(1, 5); }
    expect(lanternPlan([run({ pts: sq(12), finishedAt: null })])).toEqual([]);
    expect(lanternPlan([run({ pts: [[0, 0], [20, 0]] })])).toEqual([]);
  });
  it('the outward vector points away from the middle of the ring', () => {
    const plan = lanternPlan([run({ pts: sq(12) })]);
    for (const l of plan) expect(l.x * l.ox + l.z * l.oz).toBeGreaterThan(0);
  });
  it('is lit from dusk, dark by day and never under a blackout', () => {
    expect(lanternLevel(12, false)).toBe(0);
    expect(lanternLevel(23, false)).toBe(1);
    expect(lanternLevel(23, true)).toBe(0);
    expect(lanternLevel(18.7, false)).toBeGreaterThan(0.5);   // dusk: lit as the sun goes
    expect(lanternLevel(6.5, false)).toBeLessThan(0.1);        // dawn: out
    expect(lanternLevel(3, false)).toBe(1);
  });
});
