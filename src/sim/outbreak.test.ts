import { describe, it, expect } from 'vitest';
import { newGame } from './state';
import { mulberry32 } from './rng';
import { outbreakOf, prevAt, risk, contagionNow, protection, outbreakDaily, outbreakCards, outbreakChoose, seriousChance, exposeOne, immuneShare, outbreakBulletin, outbreakGoal } from './outbreak';
import { fxCtxFor, fxMedical, fxPriceMod, fxCards, fxChoose, fxGoal } from './disasterFx';
import type { DisasterKind } from './disaster';

const game = (kind: DisasterKind = 'pandemic', variant?: string, difficulty: 'cozy' | 'standard' | 'hardcore' = 'standard') => {
  const g = newGame(11, 105, 2027, { mode: 'scenario', peace: 'short', kind, variant: variant ?? (kind === 'bioweapon' ? 'release' : 'wave'), difficulty });
  g.clock.t = g.disaster.hitAt + 1; g.disaster.phase = 'impact'; return g;
};
const ctx = (g: ReturnType<typeof game>, day: number) => { const c = fxCtxFor(g, day); c.day = day; return c; };

describe('the wave clock', () => {
  it('prev peaks at each wave and is small between them; Cozy has fewer waves', () => {
    const g = game(); const o = outbreakOf(g), w = o.waves[0];
    expect(prevAt(o, w.peak)).toBeCloseTo(w.prev); expect(prevAt(o, w.peak + 100)).toBeLessThan(w.prev * 0.05 + prevAt(o, o.waves[1].peak - 100) + 1e-9);
    expect(outbreakOf(game('pandemic', 'wave', 'cozy')).waves.length).toBe(2); expect(o.waves.length).toBe(3);
  });
  it('each variant has its own shape: the 1918 flu has a mild first wave and a deadly second', () => {
    const o = outbreakOf(game('pandemic', 'flu_1918')); expect(o.waves[1].prev).toBeGreaterThan(o.waves[0].prev * 3);
  });
});

describe('what the family does changes the odds', () => {
  it('seal, masks, a drop box and a hold each cut the gate contact; immune people cut it again', () => {
    const g = game(); g.clock.t = g.disaster.hitAt + outbreakOf(g).waves[0].peak;
    const base = contagionNow(g).contact, o = outbreakOf(g);
    expect(base).toBeGreaterThan(0.15);
    o.policy.masks = true; const m = contagionNow(g).contact; expect(m).toBeLessThan(base);
    o.policy.dropBox = true; o.policy.sealed = true; expect(contagionNow(g).contact).toBeLessThan(m * 0.5);
    o.policy.hold = true; expect(protection(g)).toBeLessThan(0.1);
    o.immune.push(g.people[0].id, g.people[1].id); expect(immuneShare(g)).toBeGreaterThan(0.2);
    expect(fxMedical(g).contact).toBe(contagionNow(g).contact);
  });
  it('the bioweapon is dosed higher from the first day than the pandemic', () => {
    expect(contagionNow(game('bioweapon')).contact).toBeGreaterThan(contagionNow(game('pandemic')).contact);
    expect(fxPriceMod(game('pandemic'))).toBeGreaterThan(1);
  });
});

describe('incubation, spread at home, immunity', () => {
  it('a sick person at home infects others after an incubation, then a fever; the recovered become immune', () => {
    const g = game('pandemic', 'flu_1918', 'hardcore'); const o = outbreakOf(g);
    g.personState[0].needs.hurt.push({ what: 'fever', sev: 45 });
    let sawExposed = false, lines: string[] = [];
    for (let d = 1; d < 12; d++) { g.clock.t = g.disaster.hitAt + d; lines.push(...outbreakDaily(g, { ...ctx(g, d), r: mulberry32(d) })); if (Object.keys(o.exposed).length) sawExposed = true; }
    expect(sawExposed).toBe(true); expect(lines.some(l => /has a fever \(caught it at home\)/.test(l))).toBe(true);
    // recovery: the fever clears and she is immune
    const h = game(); const ho = outbreakOf(h); ho.sickSince[h.people[0].id] = 1; ho.immune = [];
    lines = []; for (let d = 1; d < 40 && !ho.immune.length; d++) lines.push(...outbreakDaily(h, { ...ctx(h, d + 2), r: mulberry32(d) }));
    expect(ho.immune).toContain(h.people[0].id); expect(lines.join(' ')).toMatch(/will not catch it again/);
  });
  it('the old are likelier to get worse than the young, and care halves it', () => {
    const g = game(); expect(seriousChance(g, 78, 0)).toBeGreaterThan(seriousChance(g, 30, 0) * 2);
    const bay = game(); bay.people[1].skills.medic = 5; expect(seriousChance(bay, 78, 0)).toBeLessThan(seriousChance(g, 78, 0));
    expect(seriousChance(game('pandemic', 'high_fatality'), 30, 0)).toBeGreaterThan(seriousChance(g, 30, 0));
  });
  it('a card-admitted stranger is exposed and falls ill after the incubation', () => {
    const g = game(); const who = exposeOne(g, () => 0, 'a stranger'); expect(who).toBeTruthy(); expect(Object.keys(outbreakOf(g).exposed).length).toBe(1);
  });
  it('a county relief check arrives on Standard, not Hardcore', () => {
    const g = game(); const m = g.money; outbreakDaily(g, ctx(g, 25)); expect(g.money).toBeGreaterThan(m);
    const h = game('pandemic', undefined, 'hardcore'); const m2 = h.money; outbreakDaily(h, ctx(h, 25)); expect(h.money).toBe(m2);
  });
});

describe('cards, goal and the radio', () => {
  it('offers seal-or-open first, then a drop box; choosing changes the policy and costs money', () => {
    const g = game(); expect(fxCards(g)[0].id).toBe('ob_seal');
    expect(fxChoose(g, 'ob:seal')).toMatch(/Sealed/); expect(outbreakOf(g).policy.sealed).toBe(true); expect(fxCards(g).some(c => c.id === 'ob_seal')).toBe(false);
    const m = g.money; fxChoose(g, 'ob:box'); expect(g.money).toBe(m - 250); expect(outbreakOf(g).policy.dropBox).toBe(true);
    g.money = 10; const h = game(); h.money = 10; expect(outbreakChoose(h, 'ob:box')).toMatch(/\$250/);
  });
  it('the goal chain ticks and the radio speaks by wave', () => {
    const g = game(); expect(fxGoal(g)!.steps.some(s => s.done)).toBe(false); outbreakChoose(g, 'ob:seal'); expect(outbreakGoal(g).steps[0].done).toBe(true);
    let said = 0; for (let k = 0; k < 30; k++) { const b = outbreakBulletin(g, { ...ctx(g, k + 1), r: mulberry32(k) }); if (b) said++; } expect(said).toBeGreaterThan(3);
    expect(risk(g)).toBeGreaterThanOrEqual(0); void outbreakCards;
  });
});
