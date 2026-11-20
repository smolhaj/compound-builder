import { describe, it, expect } from 'vitest';
import { DOME_TIERS, TIER, FRAME_SPANS, DOME_KIND, cellsOfKind } from './tiers';
import { BLUEPRINTS } from '../blueprints';
import { DIG_PHASES, STAGE_SPLIT, STRATA, digState, digVolumes, hasUtilities, pitDepthFt, pitProfile, pitShape, skirtParams, strataAt, strataBreaks, utilityRuns, digLabel } from './dig';
import { domeCost } from './cost';

const cells = (t: (typeof DOME_TIERS)[number]) => cellsOfKind(DOME_KIND[t]) ?? TIER[t].cells;
/** Every (stage, f) of a build, in order, as a list of states. */
const walk = (t: (typeof DOME_TIERS)[number], n = 40) => { const out = []; for (let s = 0; s < 5; s++) for (let i = 0; i <= n; i++) out.push({ s, f: i / n, st: digState(t, s, i / n) }); return out; };

describe('dome dig stages', () => {
  it('the stage shares sum to one and the blueprints keep the same total hours', () => {
    for (const t of DOME_TIERS) {
      expect(STAGE_SPLIT[t].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      const bp = BLUEPRINTS[DOME_KIND[t]], total = bp.stages.reduce((a, s) => a + s.hours, 0), want = domeCost(t, undefined, { vehiclePort: true }).hours;
      expect(Math.abs(total - want)).toBeLessThanOrEqual(5);
    }
  });
  it('every tier has five stages with names, and the dig stages say crater and skirt', () => {
    for (const t of DOME_TIERS) {
      const names = BLUEPRINTS[DOME_KIND[t]].stages.map(s => s.name);
      expect(names).toHaveLength(5);
      if (t !== 'earthen') { expect(names[0]).toMatch(/crater/i); expect(names[1]).toMatch(/utilities/i); expect(names[1]).toMatch(/skirt/i); expect(names[2]).toMatch(/backfill/i); }
    }
  });
  it('pit depth is never negative, rises through the dig, holds, then falls to nothing', () => {
    for (const t of DOME_TIERS) {
      let prev = 0, phase = 0;   // 0 digging, 1 held, 2 filling
      for (const { s, f } of walk(t)) {
        const d = pitDepthFt(t, s, f);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(TIER[t].skirtFt + 1e-9);
        if (phase === 0) { if (d < prev - 1e-9) phase = 2; else if (s >= 1 && Math.abs(d - TIER[t].skirtFt) < 1e-9) phase = 1; }
        if (phase === 1 && d < TIER[t].skirtFt - 1e-9) phase = 2;
        if (phase === 0) expect(d).toBeGreaterThanOrEqual(prev - 1e-9);
        if (phase === 2) expect(d).toBeLessThanOrEqual(prev + 1e-9);
        prev = d;
      }
      expect(pitDepthFt(t, 5, 0)).toBe(0);
      expect(pitDepthFt(t, 4, 1)).toBe(0);
    }
  });
  it('the pit is exactly the tier skirt depth while the skirt is formed and poured', () => {
    for (const t of DOME_TIERS) for (const f of [0, 0.3, 0.6, 0.99]) expect(pitDepthFt(t, 1, f)).toBeCloseTo(TIER[t].skirtFt, 9);
    expect([4, 20, 30, 60]).toEqual(DOME_TIERS.map(t => TIER[t].skirtFt));
  });
  it('an unsupplied stage has not moved', () => {
    expect(digState('glass', 0, 0.9, false).depthFt).toBe(0);
    expect(digState('glass', 1, 0.9, false).poured).toBe(0);
  });
  it('utilities go in before the skirt is poured, and the skirt before the backfill', () => {
    for (const t of DOME_TIERS) for (const { st } of walk(t)) {
      if (hasUtilities(t)) { if (st.rebar > 0 || st.poured > 0) expect(st.utilities).toBe(1); }
      if (st.filled > 0) { expect(st.poured).toBe(1); expect(st.rebar).toBe(1); }
      if (st.poured > 0) expect(st.dug).toBe(1);
      if (st.utilities > 0) expect(st.dug).toBe(1);
    }
    expect(hasUtilities('earthen')).toBe(false);
  });
  it('the phases come in order and the labels exist', () => {
    for (const t of DOME_TIERS) {
      let at = 0;
      for (const { st } of walk(t)) { const i = DIG_PHASES.indexOf(st.phase); expect(i).toBeGreaterThanOrEqual(at); at = i; expect(digLabel(t, st).length).toBeGreaterThan(3); }
      expect(digState(t, 5, 0).phase).toBe('done');
    }
    expect(digState('arcology', 0, 0.05).phase).toBe('layout');
    expect(digState('arcology', 0, 0.5).phase).toBe('excavation');
  });
  it('progress shows the staked dome as layout only, and every other stage monotone in each quantity', () => {
    const st = digState('arcology', 0, 0.02);
    expect(st.depthFt).toBe(0); expect(st.open).toBe(false);
    for (const t of DOME_TIERS) {
      let p = { dug: 0, utilities: 0, rebar: 0, poured: 0, stem: 0, filled: 0 };
      for (const { st: x } of walk(t)) { for (const k of Object.keys(p) as Array<keyof typeof p>) { expect(x[k]).toBeGreaterThanOrEqual(p[k] - 1e-9); } p = { dug: x.dug, utilities: x.utilities, rebar: x.rebar, poured: x.poured, stem: x.stem, filled: x.filled }; }
    }
  });
});

describe('dome pit shape', () => {
  it('benches step down to the skirt depth and the rim is outside the work floor', () => {
    for (const t of DOME_TIERS) {
      const s = pitShape(t, cells(t));
      expect(s.rTop).toBeGreaterThan(s.rWork); expect(s.rWork).toBeGreaterThan(s.rSkirt); expect(s.rSkirt).toBeGreaterThan(s.R);
      const p = pitProfile(s, s.depthU);
      expect(p[0]).toEqual([s.rTop, 0]);
      const last = p[p.length - 1];
      expect(last[1]).toBeCloseTo(s.depthU, 9); expect(last[0]).toBeCloseTo(s.rWork, 9);
      for (let i = 1; i < p.length; i++) { expect(p[i][1]).toBeGreaterThanOrEqual(p[i - 1][1] - 1e-12); expect(p[i][0]).toBeLessThanOrEqual(p[i - 1][0] + 1e-12); }
    }
  });
  it('a shallow pit is the top of the final one and the volume only grows with depth', () => {
    const s = pitShape('arcology', 36);
    let prev = -1;
    for (let k = 0; k <= 20; k++) { const v = digVolumes('arcology', 36, TIER.arcology.skirtFt * k / 20).done; expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
    const half = pitProfile(s, s.depthU / 2);
    expect(half[0][0]).toBe(s.rTop);
    expect(digVolumes('arcology', 36, 0).done).toBe(0);
    expect(digVolumes('arcology', 36, 60).total).toBeGreaterThan(100_000);   // a 700 ft wide, 60 ft deep crater is a lot of dirt
    expect(digVolumes('earthen', 2, 4).total).toBeGreaterThan(5);
  });
  it('strata are contiguous and in order', () => {
    for (let i = 1; i < STRATA.length; i++) expect(STRATA[i].fromFt).toBe(STRATA[i - 1].toFt);
    expect(strataAt(1).id).toBe('topsoil'); expect(strataAt(10).id).toBe('clay'); expect(strataAt(30).id).toBe('gravel'); expect(strataAt(50).id).toBe('rock');
    expect(strataBreaks(0, 20)).toEqual([3, 16]);
  });
});

describe('skirt and utilities', () => {
  it('skirt geometry matches the tier depth and thickness', () => {
    for (const t of DOME_TIERS) {
      const k = skirtParams(t, cells(t));
      expect(k.depthU * 20).toBeCloseTo(TIER[t].skirtFt, 9);
      expect(k.rOut).toBeGreaterThan(k.rIn);
      expect(k.thickU).toBeGreaterThanOrEqual(TIER[t].skirtThickFt / 20 - 1e-9);
      expect(k.rIn).toBeGreaterThan(0);
    }
  });
  it('one sleeve per span of the reference frame, runs reach through the skirt, the plant lines lie on the pit floor', () => {
    for (const t of DOME_TIERS) {
      const runs = utilityRuns(t, cells(t));
      if (t === 'earthen') { expect(runs).toHaveLength(0); continue; }
      const s = pitShape(t, cells(t));
      expect(runs.filter(r => r.kind === 'sleeve')).toHaveLength(FRAME_SPANS[t]);
      for (const r of runs) { expect(r.r1).toBeGreaterThan(r.r0); expect(r.y).toBeGreaterThan(0); if (r.kind === 'sleeve') { expect(r.r0).toBeLessThan(s.R); expect(r.r1).toBeGreaterThan(s.rSkirt); } else expect(r.r1).toBeLessThan(s.rTop); }
      for (const k of ['power', 'water', 'sewer', 'data'] as const) expect(runs.some(r => r.kind === k)).toBe(true);
    }
  });
});
