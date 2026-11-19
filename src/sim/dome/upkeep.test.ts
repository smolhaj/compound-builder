import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../state';
import { BLUEPRINTS } from '../blueprints';
import { DOME_KIND, DOME_TIERS, TIER, type DomeTier } from './tiers';
import { domeCostSummary } from './costSummary';
import { billUpkeep, installedUsd, stageOf, upkeepCover, upkeepDay, upkeepYear, UPKEEP } from './upkeep';
import { newDomeState, ownState, domeDay, domesOf } from './live';
import { dayIndex } from '../state';

const withDome = (tier: DomeTier, cash: number): GameState => {
  const g = newGame(5); g.money = cash;
  const kind = DOME_KIND[tier];
  g.structures.push({ id: 'd1', kind, x: 0, z: 0, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 });
  return g;
};

describe('upkeep: the yearly bill', () => {
  it('lands on the audit targets (power included): arcology 360 ft about $24M, glass 150 ft about $0.9M, geodesic 60 ft about $42k', () => {
    const tot = (t: DomeTier) => domeCostSummary(t).running.totalUsd;
    expect(tot('arcology')).toBeGreaterThan(22e6); expect(tot('arcology')).toBeLessThan(26e6);
    expect(tot('glass')).toBeGreaterThan(0.8e6); expect(tot('glass')).toBeLessThan(1e6);
    expect(tot('geodesic')).toBeGreaterThan(35e3); expect(tot('geodesic')).toBeLessThan(60e3)   // (the 30 ft skirt of the raid ladder adds about $11k of yearly skirt upkeep: target now about $53k);
  });
  it('is monotone: a bigger dome never costs less, in a tier or across the tiers at their default size', () => {
    for (const t of DOME_TIERS) {
      let last = -1;
      for (let c = TIER[t].minCells; c <= TIER[t].maxCells; c++) { const y = upkeepYear(t, c).totalUsd; expect(y).toBeGreaterThanOrEqual(last); last = y; expect(installedUsd(t, c)).toBeGreaterThan(0); }
    }
    const d = DOME_TIERS.map(t => upkeepYear(t, TIER[t].cells).totalUsd);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThanOrEqual(d[i - 1]);
  });
  it('the three parts add up and staff follow the tier', () => {
    const y = upkeepYear('arcology', 36);
    expect(y.maintenanceUsd + y.insuranceUsd + y.staffUsd).toBe(y.totalUsd);
    expect(y.staff).toBe(12); expect(upkeepYear('earthen', 2).staff).toBe(0);
  });
});

describe('upkeep: the daily charge', () => {
  it('a day accrues a 365th and is paid in full from cash', () => {
    const y = upkeepYear('glass', 15), r = upkeepDay('glass', 15, 0, 1e9);
    expect(r.chargeUsd).toBeCloseTo(y.totalUsd / 365, 5);
    expect(r.paidUsd).toBeCloseTo(r.chargeUsd, 5); expect(r.owedUsd).toBe(0); expect(r.stage).toBe('paid'); expect(r.wear).toBe(0);
  });
  it('a year of days costs the yearly bill, once a day through the live step', () => {
    const g = withDome('glass', 1e9); const y = upkeepYear('glass', 15);
    const start = g.money;
    for (let i = 0; i < 365; i++) { g.clock.t = i; domeDay(g); }
    expect(start - g.money).toBeGreaterThan(y.totalUsd * 0.99); expect(start - g.money).toBeLessThan(y.totalUsd * 1.05);   // (the closed-ecology upkeep is off: no ecology)
    // calling the step once charges one day, not two
    const h = withDome('glass', 1e9); const m0 = h.money; domeDay(h);
    expect(m0 - h.money).toBeCloseTo(y.totalUsd / 365, 0);
  });
  it('an earthen dome has nothing to bill', () => {
    const g = withDome('earthen', 1000);
    const before = g.money; billUpkeep(g, { tier: 'earthen', cells: 2 }, ownState(g, domesOf(g)[0] as never), 'The dome');
    expect(g.money).toBeGreaterThanOrEqual(before - 5);
  });
  it('never takes cash below zero and carries what it cannot pay', () => {
    const r = upkeepDay('glass', 15, 0, 100);
    expect(r.paidUsd).toBe(100); expect(r.owedUsd).toBeGreaterThan(0);
    const g = withDome('glass', 100); const st = newDomeState();
    billUpkeep(g, { tier: 'glass', cells: 15 }, st, 'The dome');
    expect(g.money).toBeGreaterThanOrEqual(0); expect(st.upkeepOwed).toBeGreaterThan(0);
  });
});

describe('upkeep: the failure path', () => {
  const full = (t: DomeTier, c: number) => upkeepYear(t, c).totalUsd / 365;
  it('slips in steps: late, deferred, staff quit, insurance lapsed', () => {
    expect(stageOf(0, 2)).toBe('paid'); expect(stageOf(2, 2)).toBe('late'); expect(stageOf(UPKEEP.wearDays, 2)).toBe('deferred');
    expect(stageOf(UPKEEP.staffQuitDays, 2)).toBe('unstaffed'); expect(stageOf(UPKEEP.staffQuitDays, 0)).toBe('deferred'); expect(stageOf(UPKEEP.insuranceLapseDays, 2)).toBe('uninsured');
  });
  it('wear starts a week behind and doubles with the staff gone', () => {
    const d = full('glass', 15);
    expect(upkeepDay('glass', 15, 3 * d, 0).wear).toBe(0);
    expect(upkeepDay('glass', 15, 8 * d, 0).wear).toBe(UPKEEP.wearPerDay);
    expect(upkeepDay('glass', 15, 15 * d, 0).wear).toBe(2 * UPKEEP.wearPerDay);
  });
  it('a lapsed insurance and quit staff stop accruing, so the debt does not run away', () => {
    const d = full('glass', 15), y = upkeepYear('glass', 15);
    const r = upkeepDay('glass', 15, 40 * d, 0);
    expect(r.chargeUsd).toBeCloseTo(y.maintenanceUsd / 365, 5);
  });
  it('paying catches up and restores everything; the live step wears the filters while behind', () => {
    const g = withDome('glass', 0), st = ownState(g, domesOf(g)[0] as never);
    st.filtering = 'scrubber'; st.filterHealth = 1; st.upkeepOwed = Math.round(10 * full('glass', 15));
    for (let i = 0; i < 5; i++) { g.clock.t = i; domeDay(g); }
    expect(st.filterHealth).toBeLessThan(1);
    g.money = 1e9; g.clock.t = 99; const lines = domeDay(g);
    expect(st.upkeepOwed ?? 0).toBe(0); expect(lines.join(' ')).toMatch(/paid up/);
  });
  it('the cover number for the warning is about a month of the bill', () => {
    expect(upkeepCover('arcology', 36)).toBeGreaterThan(1.5e6);
    expect(dayIndex(0)).toBe(0);
  });
});
