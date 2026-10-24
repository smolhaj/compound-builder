import { describe, expect, it } from 'vitest';
import { newGame, type Structure } from './state';
import { addHardenWork, hardenCost, hardenProblem, nextHardenJob, orderHarden, orderHardenAll, protectionOf, tierOf } from './hardening';
import { step } from './engine';
import { billCost } from './materials';
import { migrate } from './save/migrations';

const room = (id: string, kind: string, finished = true): Structure => ({ id, kind, x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: false, finishedAt: finished ? 0 : null });

describe('bunker hardening', () => {
  it('only built bunker rooms, one tier at a time, up to 3', () => {
    const s = newGame(1);
    const dorm = room('s1', 'bunker_dorm'), cabin = room('s2', 'timber_cabin'), wip = room('s3', 'bunker_stores', false);
    s.structures.push(dorm, cabin, wip);
    expect(hardenProblem(s, cabin, 'fallout')).toMatch(/only bunker/);
    expect(hardenProblem(s, wip, 'fallout')).toMatch(/not built/);
    const j = orderHarden(s, dorm, 'fallout')!;
    expect(j.tier).toBe(1);
    expect(hardenProblem(s, dorm, 'fallout')).toMatch(/already/);
    dorm.hardening = { fallout: 3 };
    s.hardenJobs = [];
    expect(hardenProblem(s, dorm, 'fallout')).toMatch(/fully/);
  });

  it('each tier protects more and costs steeply more', () => {
    const st = room('s1', 'bunker_dorm');
    const base = protectionOf(st);
    st.hardening = { fallout: 2, faraday: 2, nbc: 2, blast: 2 };
    const p = protectionOf(st);
    expect(p.pf).toBeGreaterThan(base.pf * 10);
    expect(p.empSurvive).toBeGreaterThan(0.9);
    expect(p.filter).toBe('gas');
    expect(p.psi).toBeGreaterThan(base.psi);
    for (const id of ['fallout', 'faraday', 'nbc', 'blast'] as const) {
      const c = [1, 2, 3].map(t => billCost(hardenCost('bunker_dorm', id, t as 1 | 2 | 3).materials));
      expect(c[1]).toBeGreaterThan(c[0]);
      expect(c[2]).toBeGreaterThan(c[1]);
    }
    // small rooms take less
    expect(hardenCost('bunker_corridor', 'blast', 3).hours).toBeLessThan(hardenCost('bunker_dorm', 'blast', 3).hours);
  });

  it('waits for materials, takes them when work starts, fits the tier when done', () => {
    const s = newGame(1);
    const dorm = room('s1', 'bunker_dorm');
    s.structures.push(dorm);
    const j = orderHarden(s, dorm, 'faraday')!;
    expect(nextHardenJob(s)).toBeNull();
    s.stock.faraday_mesh = 4; s.stock.cable = 1;
    expect(nextHardenJob(s)).toBe(j);
    addHardenWork(s, j, 10);
    expect(s.stock.faraday_mesh).toBe(0);
    addHardenWork(s, j, 100);
    expect(tierOf(dorm, 'faraday')).toBe(1);
    expect(j.finishedAt).not.toBeNull();
  });

  it('the family works on it in their work hours', () => {
    let s = newGame(3);
    const dorm = room('s1', 'bunker_dorm');
    s.structures.push(dorm);
    s.stock.filter_set = 2; s.stock.hardware = 1;
    orderHarden(s, dorm, 'nbc');
    s = step(s, 5);
    expect(tierOf(s.structures[0], 'nbc')).toBe(1);
  });

  it('whole-bunker shortcut orders every room', () => {
    const s = newGame(1);
    s.structures.push(room('s1', 'bunker_dorm'), room('s2', 'bunker_hatch'), room('s3', 'timber_cabin'));
    expect(orderHardenAll(s, 'blast', 1)).toBe(2);
  });

  it('old saves migrate', () => {
    const s = newGame(1) as unknown as Record<string, unknown>;
    const old = { ...s, version: 7, stock: { ...(s.stock as object) } } as Record<string, unknown>;
    delete old.hardenJobs;
    delete (old.stock as Record<string, unknown>).lead_sheet;
    const m = migrate(JSON.parse(JSON.stringify(old)));
    expect(m.hardenJobs).toEqual([]);
    expect(m.stock.lead_sheet).toBe(0);
  });
});
