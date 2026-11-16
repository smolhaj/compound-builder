import { describe, it, expect } from 'vitest';
import { mulberry32 } from './rng';
import {
  ALLIANCE_LEAN, CHECKPOINT, FRONT, cadenceDays, cashMultiplier, decreePrice, dipTo, draftable, draftPrice, informantFraction, isInformant, maxTier, newFront, papersOdds, quotaOf, REQ,
  requisitionDue, requisitionShare, reprisal, rollHolder, rollTierClock, searchChance, shortWeightCaught, sniperDayChance, stepFront, tierAt, tollOn, warPrice,
} from './occupation';

describe('the front line', () => {
  it('holds 85% of weeks and flips 15%, with 3-7 contested days', () => {
    const r = mulberry32(5); let flips = 0, weeks = 0; const f = newFront('alliance', 0);
    for (let d = 1; d < 7 * 400; d++) { const was = f.contested, st = stepFront(f, d, r); if (st === 'contest') { flips++; expect(f.contested).toBeGreaterThanOrEqual(3); expect(f.contested).toBeLessThanOrEqual(7); } if (d % 7 === 0 && was === 0) weeks++; }
    expect(flips / weeks).toBeGreaterThan(0.1); expect(flips / weeks).toBeLessThan(0.2);
  });
  it('changes hands only when the contest ends', () => {
    const f = newFront('compact', 0); f.lastRoll = -7;
    const r = () => 0.99;   // always flips
    expect(stepFront(f, 0, r)).toBe('contest');
    expect(f.holder).toBe('compact');
    let got = 'none'; for (let i = 0; i < 8 && got !== 'flipped'; i++) got = stepFront(f, 1 + i, r);
    expect(got).toBe('flipped'); expect(f.holder).toBe('alliance');
  });
  it('the partition variant almost never moves', () => {
    const r = mulberry32(2); let flips = 0; const f = newFront('alliance', 0);
    for (let d = 1; d < 2000; d++) if (stepFront(f, d, r, FRONT.STAY_PARTITION) === 'contest') flips++;
    expect(flips).toBeLessThan(15);
  });
  it('regions lean: the plains hold the Alliance, the Pacific Northwest the Compact', () => {
    let a = 0, b = 0;
    for (let i = 0; i < 400; i++) { const r = mulberry32(i); if (rollHolder(r, 'plains') === 'alliance') a++; if (rollHolder(mulberry32(i), 'pnw') === 'alliance') b++; }
    expect(a).toBeGreaterThan(300); expect(b).toBeLessThan(100); expect(Object.keys(ALLIANCE_LEAN).length).toBe(11);
  });
  it('dipTo only pulls down', () => { expect(dipTo(1, 0.1)).toBeCloseTo(0.1); expect(dipTo(0.05, 0.1)).toBe(1); });
});

describe('the occupation tiers', () => {
  it('tier 2 at day 60-90 and tier 3 at 150-240, capped by difficulty', () => {
    for (let i = 0; i < 50; i++) { const c = rollTierClock(mulberry32(i)); expect(c.t2).toBeGreaterThanOrEqual(60); expect(c.t2).toBeLessThanOrEqual(90); expect(c.t3).toBeGreaterThanOrEqual(150); expect(c.t3).toBeLessThanOrEqual(240); }
    const c = { t2: 75, t3: 200 };
    expect([tierAt(0, c, 3), tierAt(80, c, 3), tierAt(250, c, 3)]).toEqual([1, 2, 3]);
    expect(tierAt(250, c, 1)).toBe(1); expect(tierAt(250, c, 2)).toBe(2);
  });
  it('Cozy stays at tier 1, Standard reaches 3 only if nobody is coming, Hardcore always, soft never', () => {
    expect(maxTier('cozy', 'occupation', 'never')).toBe(1);
    expect(maxTier('standard', 'occupation', 'full')).toBe(2); expect(maxTier('standard', 'occupation', 'never')).toBe(3);
    expect(maxTier('hardcore', 'occupation', 'full')).toBe(3); expect(maxTier('hardcore', 'soft', 'never')).toBe(2);
  });
});

describe('requisition, search and reprisal', () => {
  it('every 14 days (7 on Hardcore), first at day 14', () => {
    expect(cadenceDays('standard')).toBe(14); expect(cadenceDays('hardcore')).toBe(7);
    expect(requisitionDue(13, -1, 'standard')).toBe(false); expect(requisitionDue(14, -1, 'standard')).toBe(true);
    expect(requisitionDue(20, 10, 'standard')).toBe(false); expect(requisitionDue(24, 10, 'standard')).toBe(true); expect(requisitionDue(18, 10, 'hardcore')).toBe(true);
  });
  it('a war asks 10-20%, an occupation 10-25%, Cozy halves it', () => {
    expect(requisitionShare('civil_war', 1, 'standard', 0)).toBeCloseTo(0.1); expect(requisitionShare('civil_war', 1, 'standard', 1)).toBeCloseTo(0.2);
    expect(requisitionShare('invasion', 1, 'standard', 1)).toBeCloseTo(0.2); expect(requisitionShare('invasion', 3, 'standard', 1)).toBeCloseTo(0.3);
    expect(requisitionShare('civil_war', 1, 'cozy', 1)).toBeCloseTo(0.1);
  });
  it('the quota takes a share of what is visible', () => { expect(quotaOf({ canned: 20, staples: 3, fuel: 0 }, 0.25)).toEqual({ canned: 5 }); });
  it('search finds a cache 0.1, 0.35 with an informant, less behind a false wall', () => {
    expect(searchChance(false, 0)).toBeCloseTo(0.1); expect(searchChance(true, 0)).toBeCloseTo(0.35); expect(searchChance(true, 1)).toBeCloseTo(0.175);
    expect(shortWeightCaught(true, 3)).toBeGreaterThan(shortWeightCaught(false, 1));
    expect(REQ.SHORT_WEIGHT).toBe(0.6);
  });
  it('a reprisal needs an ambush within 3 miles and p 0.3', () => {
    expect(reprisal(5, 3, () => 0).hostages).toBe(0);
    expect(reprisal(2, 1, () => 0.9).hostages).toBe(0);
    expect(reprisal(2, 1, () => 0.1).hostages).toBeGreaterThanOrEqual(3);
    expect(reprisal(2, 3, () => 0.1).burn).toBe(true);
  });
});

describe('the draft', () => {
  const man = { age: 30, kid: false, male: true }, woman = { age: 30, kid: false, male: false };
  it('the war takes men 18-45; women only when nobody is coming and the war is old; Cozy has no draft', () => {
    const o = { kind: 'civil_war' as const, difficulty: 'standard' as const, fate: 'partial' as const, day: 200 };
    expect(draftable(man, o)).toBe(true); expect(draftable({ ...man, age: 46 }, o)).toBe(false); expect(draftable({ ...man, age: 17 }, o)).toBe(false); expect(draftable(woman, o)).toBe(false);
    expect(draftable(woman, { ...o, fate: 'never' })).toBe(true); expect(draftable(woman, { ...o, fate: 'never', day: 50 })).toBe(false);
    expect(draftable(man, { ...o, difficulty: 'cozy' })).toBe(false);
  });
  it('forced labor takes any adult 18-35', () => {
    const o = { kind: 'invasion' as const, difficulty: 'standard' as const, fate: 'never' as const, day: 200 };
    expect(draftable(woman, o)).toBe(true); expect(draftable({ ...man, age: 36 }, o)).toBe(false);
  });
  it('a way out costs 2-4 oz of silver or $2,000 early', () => { const p = draftPrice('civil_war', 10, 0.5); expect(p.silver).toBeGreaterThanOrEqual(2); expect(p.silver).toBeLessThanOrEqual(4); expect(p.usd).toBe(2000); expect(draftPrice('civil_war', 90, 0).usd).toBeGreaterThan(2000); });
});

describe('checkpoints, snipers, informants, money', () => {
  it('a toll is 5% of the load, at least 1', () => { expect(tollOn(100)).toBe(5); expect(tollOn(3)).toBe(1); });
  it('a held pass always works; no papers is a gamble that worsens by tier', () => {
    expect(papersOdds({ pass: true, homeCounty: false, tier: 3 })).toBe(1);
    expect(papersOdds({ pass: false, homeCounty: true, tier: 1 })).toBeGreaterThan(papersOdds({ pass: false, homeCounty: true, tier: 3 }));
    expect(CHECKPOINT.FORGED_OK).toBe(0.6);
  });
  it('the sniper: 0.02 an hour outdoors, cover cuts it', () => {
    expect(sniperDayChance(1, 0)).toBeCloseTo(0.02); expect(sniperDayChance(6, 0)).toBeGreaterThan(0.1); expect(sniperDayChance(6, 0.9)).toBeLessThan(0.03); expect(sniperDayChance(0, 0)).toBe(0);
  });
  it('1 in 8 neighbors inform, 1 in 5 in tier 3, stable per household', () => {
    expect(informantFraction(1, false)).toBeCloseTo(0.125); expect(informantFraction(3, false)).toBeCloseTo(0.2);
    let n = 0; for (let i = 0; i < 2000; i++) if (isInformant(7, `n${i}`, 0.125)) n++;
    expect(n / 2000).toBeGreaterThan(0.1); expect(n / 2000).toBeLessThan(0.15);
    expect(isInformant(7, 'n3', 0.2)).toBe(isInformant(7, 'n3', 0.2));
  });
  it('the decree halves the dollar at day 10 and quarters it at day 60; prices follow', () => {
    expect([cashMultiplier(5), cashMultiplier(30), cashMultiplier(70)]).toEqual([1, 0.5, 0.25]);
    expect(decreePrice(5)).toBe(1); expect(decreePrice(30)).toBeGreaterThan(1); expect(decreePrice(70)).toBeGreaterThan(decreePrice(30));
    expect(warPrice(30, true)).toBeGreaterThan(warPrice(30, false)); expect(warPrice(0, false)).toBe(1);
  });
});
