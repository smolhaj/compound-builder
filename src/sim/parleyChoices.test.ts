import { describe, expect, it } from 'vitest';
import { SHOOT_ENVOY_HUMANITY, asksPassage, bluffOdds, refusedAngry, shootEnvoy, type BluffCtx } from './parleyChoices';
import { mulberry32 } from './rng';

const ctx = (o: Partial<BluffCtx> = {}): BluffCtx => ({ negotiator: 3, fortress: 40, fighters: 2, armed: true, kind: 'militia', temper: 'hard', talk: 1, ...o });
const rate = (f: (r: () => number) => boolean, N = 4000) => { const r = mulberry32(9); let n = 0; for (let i = 0; i < N; i++) if (f(r)) n++; return n / N; };

describe('the bluff', () => {
  it('a good talker and a place that looks hard make a crew back off; a poor one on an open place does not', () => {
    expect(bluffOdds(ctx({ negotiator: 9, fortress: 80, fighters: 4 }))).toBeGreaterThan(bluffOdds(ctx({ negotiator: 0, fortress: 5, fighters: 0, armed: false })) + 0.3);
    expect(bluffOdds(ctx({ negotiator: 6 }))).toBeGreaterThan(bluffOdds(ctx({ negotiator: 1 })));
    expect(bluffOdds(ctx({ fortress: 90 }))).toBeGreaterThan(bluffOdds(ctx({ fortress: 10 })));
  });
  it('gangs are prouder than militia, hungry men do not back off for talk, a savage crew never does, Hardcore talks less', () => {
    expect(bluffOdds(ctx({ kind: 'gang' }))).toBeLessThan(bluffOdds(ctx({ kind: 'militia' })));
    expect(bluffOdds(ctx({ temper: 'desperate' }))).toBeLessThan(bluffOdds(ctx({ temper: 'hard' })));
    expect(bluffOdds(ctx({ temper: 'savage' }))).toBe(0);
    expect(bluffOdds(ctx({ talk: 0.85 }))).toBeLessThan(bluffOdds(ctx({ talk: 1.12 })));
  });
  it('is a probability', () => { for (const n of [0, 5, 10]) for (const f of [0, 50, 100]) { const p = bluffOdds(ctx({ negotiator: n, fortress: f, fighters: 6 })); expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(0.8); } });
});
describe('shooting the envoy', () => {
  it('a gang or a savage crew is always enraged and never runs; a disciplined or desperate crew sometimes runs; most of the rest are enraged', () => {
    expect(rate(r => shootEnvoy({ kind: 'gang', temper: 'hard', fortress: 50 }, r).flees)).toBe(0);
    expect(rate(r => shootEnvoy({ kind: 'looters', temper: 'savage', fortress: 50 }, r).enraged)).toBe(1);
    const mil = rate(r => shootEnvoy({ kind: 'militia', temper: 'hard', fortress: 50 }, r).flees), des = rate(r => shootEnvoy({ kind: 'looters', temper: 'desperate', fortress: 50 }, r).flees);
    expect(mil).toBeGreaterThan(0.05); expect(des).toBeGreaterThan(mil);
    expect(rate(r => shootEnvoy({ kind: 'militia', temper: 'hard', fortress: 50 }, r).enraged)).toBeGreaterThan(0.6);
  });
  it('it costs humanity', () => { expect(SHOOT_ENVOY_HUMANITY).toBeGreaterThanOrEqual(5); });
});
describe('refusing', () => { it('a crew that was refused is angrier about half the time, more when it is hard', () => { expect(rate(r => refusedAngry('hard', r))).toBeGreaterThan(rate(r => refusedAngry('desperate', r))); expect(rate(r => refusedAngry('savage', r))).toBeLessThan(0.7); }); });
describe('passage', () => { it('only the disciplined ask for it', () => { expect(asksPassage('militia')).toBe(true); expect(asksPassage('patrol')).toBe(true); expect(asksPassage('gang')).toBe(false); expect(asksPassage('looters')).toBe(false); }); });
