import { describe, expect, it } from 'vitest';
import { OPENER_DIFF, planOpener, scoutSpotted, weakestApproach, workerAmbush, OUTDOOR_TASKS } from './raidOpeners';
import { mulberry32 } from './rng';

const rate = (f: (r: () => number) => unknown, N = 4000) => { const r = mulberry32(7); let n = 0; for (let i = 0; i < N; i++) if (f(r)) n++; return n / N; };
const crew = (o: Partial<Parameters<typeof planOpener>[0]> = {}) => ({ kind: 'gang' as const, temper: 'hard' as const, size: 8, armed: true, difficulty: 'standard' as const, ...o });

describe('how a raid begins', () => {
  it('refugees, hordes, tunnelers, the unarmed and tiny crews never have an opener', () => {
    for (const kind of ['refugees', 'horde', 'tunnelers'] as const) expect(rate(r => planOpener(crew({ kind }), r))).toBe(0);
    expect(rate(r => planOpener(crew({ armed: false }), r))).toBe(0); expect(rate(r => planOpener(crew({ size: 2 }), r))).toBe(0);
  });
  it('requisition teams and militia mostly send a man under a white flag; gangs scout and ambush and make a diversion', () => {
    const kinds = (kind: Parameters<typeof planOpener>[0]['kind']) => { const r = mulberry32(3), t: Record<string, number> = {}; for (let i = 0; i < 6000; i++) { const o = planOpener(crew({ kind }), r); if (o) t[o.kind] = (t[o.kind] ?? 0) + 1; } return t; };
    const req = kinds('requisition'), gang = kinds('gang');
    expect(req.demand).toBeGreaterThan((req.scouts ?? 0) * 2);
    expect(gang.scouts).toBeGreaterThan(0); expect(gang.worker_ambush).toBeGreaterThan(0); expect(gang.diversion).toBeGreaterThan(0);
  });
  it('Hardcore plans more, Cozy less; a savage crew never waves a flag; a diversion carries its plan', () => {
    const p = (difficulty: 'cozy' | 'standard' | 'hardcore') => rate(r => planOpener(crew({ difficulty }), r));
    expect(p('cozy')).toBeLessThan(p('standard')); expect(p('standard')).toBeLessThan(p('hardcore')); expect(OPENER_DIFF.hardcore).toBeGreaterThan(1);
    expect(rate(r => planOpener(crew({ temper: 'savage', kind: 'requisition' }), r)?.kind === 'demand')).toBe(0);
    const r = mulberry32(5); let d = null; for (let i = 0; i < 3000 && !d; i++) { const o = planOpener(crew(), r); if (o?.kind === 'diversion') d = o; }
    expect(d!.decoy!.share).toBeGreaterThan(0); expect(d!.decoy!.until).toBeGreaterThan(d!.decoy!.delay);
  });
  it('is deterministic', () => { expect(JSON.stringify(planOpener(crew(), mulberry32(11)))).toBe(JSON.stringify(planOpener(crew(), mulberry32(11)))); });
});
describe('scouts', () => {
  it('a better watch spots them more often, and a dark night helps them', () => {
    expect(scoutSpotted(80, false)).toBeGreaterThan(scoutSpotted(30, false)); expect(scoutSpotted(60, true)).toBeLessThan(scoutSpotted(60, false));
    for (const d of [0, 50, 100, 400]) { const p = scoutSpotted(d, false); expect(p).toBeGreaterThanOrEqual(0.05); expect(p).toBeLessThanOrEqual(0.95); }
  });
  it('the crew that was not seen picks the weakest way in', () => {
    expect(weakestApproach([{ ang: 0, score: 0.6 }, { ang: 1, score: 0.2 }, { ang: 2, score: 0.5 }])).toBe(1); expect(weakestApproach([])).toBeNull();
  });
});
describe('the people at work outside', () => {
  const workers = [{ id: 'a', kid: false, age: 40 }, { id: 'b', kid: false, age: 35 }, { id: 'c', kid: true, age: 13 }, { id: 'd', kid: false, age: 50 }];
  it('a good watch gets them in; a poor one loses them; at most three are ever caught', () => {
    const run = (detection: number) => { const r = mulberry32(2); let ran = 0, n = 0; for (let i = 0; i < 2000; i++) { const res = workerAmbush(workers, { detection, hostile: false, night: false }, r); expect(res.length).toBeLessThanOrEqual(3); for (const x of res) { n++; if (x.fate === 'ran') ran++; } } return ran / n; };
    expect(run(90)).toBeGreaterThan(run(10) + 0.3);
  });
  it('a merciful crew hurts and a hostile one keeps one worker and kills another now and then; never more than one taken', () => {
    const r = mulberry32(4); let taken = 0, killed = 0, mercKilled = 0, mercTaken = 0;
    for (let i = 0; i < 3000; i++) {
      const h = workerAmbush(workers, { detection: 20, hostile: true, night: true }, r), m = workerAmbush(workers, { detection: 20, hostile: false, night: true }, r);
      expect(h.filter(x => x.fate === 'taken').length).toBeLessThanOrEqual(1);
      taken += h.filter(x => x.fate === 'taken').length; killed += h.filter(x => x.fate === 'killed').length; mercKilled += m.filter(x => x.fate === 'killed').length; mercTaken += m.filter(x => x.fate === 'taken').length;
    }
    expect(taken).toBeGreaterThan(0); expect(killed).toBeGreaterThan(0); expect(mercKilled).toBe(0); expect(mercTaken).toBe(0);
  });
  it('knows which tasks are outdoors', () => { expect(OUTDOOR_TASKS.has('fields')).toBe(true); expect(OUTDOOR_TASKS.has('sleep')).toBe(false); expect(OUTDOOR_TASKS.has('kitchen')).toBe(false); });
});
