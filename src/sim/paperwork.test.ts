import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { step } from './engine';
import { blockedReason, planStructure } from './construction';
import { applyForPermit, assessed, permitFee, premium, reviewDays, yearlyTax } from './paperwork';
import { CLASSIC, listings } from './site';

const fresh = (doy = 105) => { const g = newGame(2, doy, 2027, { site: listings(2)[2] }); g.money = 500_000; return g; };

describe('the paperwork', () => {
  it('closing costs come off at purchase', () => {
    const site = listings(4)[1];
    const g = newGame(4, 105, 2027, { site });
    expect(g.money).toBe(g.startFunds!.budget - Math.round(site.price * 1.03));
  });

  it('a permit costs a fee and holds work until the county has reviewed it; small things need none', () => {
    let g = fresh();
    const cabin = planStructure(g, 'timber_cabin', 30, 30, 0);
    const m = g.money;
    applyForPermit(g, cabin);
    expect(g.money).toBe(m - permitFee(g, 'timber_cabin'));
    expect(blockedReason(g, cabin)).toMatch(/permit/);
    const coop = planStructure(g, 'chicken_coop', 40, 30, 0);
    applyForPermit(g, coop);
    expect(coop.permit).toBeUndefined();
    g = step(g, reviewDays(g, 'timber_cabin') + 1);
    const c2 = g.structures.find(x => x.id === cabin.id)!;
    expect(c2.permit).toBe('ok');
    expect(blockedReason(g, c2) ?? '').not.toMatch(/permit/);
  });

  it('build without one and the inspector may come by: a fine, a stop-work order, the permit at double', () => {
    let caught = 0;
    for (let seed = 1; seed <= 30; seed++) {
      let g = newGame(seed, 105, 2027, { site: { ...CLASSIC, region: 'pnw' } });
      g.money = 500_000; g.paper.permits = false;
      const st = planStructure(g, 'workshop', 30, 30, 0);
      applyForPermit(g, st);
      expect(st.permit).toBe('none');
      st.stage = 2;             // well under way
      g = step(g, 200);
      if (g.paper.fines > 0) caught++;
    }
    expect(caught).toBeGreaterThan(5);
    expect(caught).toBeLessThan(30);
  });

  it('property tax on land and buildings, billed in halves; the ag rate with two fields; insurance once there\'s a home', () => {
    const g = fresh();
    const bare = yearlyTax(g);
    expect(bare).toBeGreaterThan(500);
    g.structures.push({ id: 'h', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    expect(yearlyTax(g)).toBeGreaterThan(bare);
    expect(premium(g)).toBeGreaterThan(1200);
    const land = assessed(g).land;
    for (const id of ['f1', 'f2']) g.structures.push({ id, kind: 'field', x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    expect(assessed(g).land).toBeCloseTo(land * 0.4);
    // the bill comes due on May 1 (day 121)
    let h = fresh(119);
    h.paper.insured = false;
    const before = h.money;
    h = step(h, 3);
    expect(before - h.money).toBeGreaterThan(yearlyTax(h) / 2 - 1);
  });

  it('while the county is gone the tax piles up as back taxes, billed when it comes back', () => {
    let g = fresh(119);
    g.disaster.kind = 'financial'; g.disaster.variant = 'bank_holiday'; g.disaster.hitAt = 0; g.disaster.warnAt = 0;
    g.disaster.back = { banks: 5, law: 5 }; g.disaster.fate = 'full'; g.disaster.ceiling = {};
    g = step(g, 3);
    expect(g.paper.backTax).toBeGreaterThan(0);
    g = step(g, 400);
    expect(g.paper.backTax).toBe(0);
  });
});
