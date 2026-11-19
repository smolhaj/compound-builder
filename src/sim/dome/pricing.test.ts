import { describe, expect, it } from 'vitest';
import { DOME_KIND, DOME_TIERS, TIER, kindOfCells, sizesOf } from './tiers';
import { PERMIT_FEE } from '../paperwork';
import { domeCost } from './cost';
import { domeCostSummary } from './costSummary';
import { DOME_PRICING, EARTH_RATES, PERMIT_SHARE, earthwork, runningCost, spanFactor } from './pricing';
import { GRADING } from './grading';
import { FUNDS_RANGE } from '../startFunds';
import { BLUEPRINTS, totalBill, totalHours } from '../blueprints';
import { billUsd } from './cost';
import { MATERIALS } from '../materials';
import { KIT } from '../../game/buildkit/kit';

describe('dome pricing (docs/design/dome_pricing.md)', () => {
  it('the itemized lines add up to the bill', () => {
    for (const t of DOME_TIERS) for (const c of sizesOf(t).filter((_, i, a) => i === 0 || i === a.length - 1 || a[i] === TIER[t].cells)) {
      const s = domeCostSummary(t, c);
      expect(s.lines.reduce((a, l) => a + l.usd, 0)).toBe(domeCost(t, c).totalUsd);
      expect(s.grandUsd).toBe(s.totalUsd);
    }
  });
  it('a bigger dome of a tier never costs less, and a higher tier costs more at the same footprint', () => {
    for (const t of DOME_TIERS) { let prev = 0; for (const c of sizesOf(t)) { const u = domeCost(t, c).totalUsd; expect(u).toBeGreaterThanOrEqual(prev); prev = u; } }
    expect(domeCost('arcology', 24).totalUsd).toBeGreaterThan(domeCost('glass', 24).totalUsd);
    expect(domeCost('glass', 12).totalUsd).toBeGreaterThan(domeCost('geodesic', 12).totalUsd);
  });
  it('is prohibitive: eight figures for a family glass dome, nine for a big one, ten for the arcology', () => {
    expect(domeCost('glass', TIER.glass.minCells).totalUsd).toBeGreaterThanOrEqual(10_000_000);
    expect(domeCost('glass', TIER.glass.cells).totalUsd).toBeLessThan(100_000_000);
    expect(domeCost('glass', TIER.glass.maxCells).totalUsd).toBeGreaterThanOrEqual(90_000_000);
    expect(domeCost('arcology', TIER.arcology.minCells).totalUsd).toBeGreaterThanOrEqual(100_000_000);
    const a = domeCost('arcology').totalUsd;
    expect(a).toBeGreaterThanOrEqual(500_000_000); expect(a).toBeLessThanOrEqual(2_000_000_000);
  });
  it('no ordinary start can pay for a glass or arcology dome; a wealthy start can raise a small geodesic one', () => {
    const richest = FUNDS_RANGE.independent[1];
    expect(domeCost('glass', TIER.glass.minCells).totalUsd).toBeGreaterThan(richest * 5);
    expect(TIER.glass.gateUsd).toBeGreaterThan(richest);
    expect(domeCost('geodesic', 4).totalUsd).toBeLessThan(richest);
    expect(domeCost('earthen').totalUsd).toBeLessThan(FUNDS_RANGE.weekend[0] / 4);
  });
  it('the crater is in the bill, with rock and dewatering only where the ground makes them', () => {
    expect(earthwork('earthen', 2).usd).toBe(0);
    const g = earthwork('geodesic', 7), gl = earthwork('glass', 15), ar = earthwork('arcology', 36);
    expect(g.rockCy).toBe(0); expect(g.wells).toBe(0);                   // 20 ft: above the rock and the water table
    expect(gl.rockCy).toBe(0); expect(gl.wells).toBeGreaterThan(0);      // 30 ft: two feet into the water
    expect(ar.rockCy).toBeGreaterThan(0); expect(ar.wells).toBeGreaterThan(gl.wells); expect(ar.faceSf).toBeGreaterThan(gl.faceSf);
    expect(earthwork('arcology', 36, { waterFt: 200 }).wells).toBe(0);   // a dry site
    expect(earthwork('arcology', 36).usd).toBeGreaterThan(earthwork('arcology', 36, { waterFt: 200 }).usd);
    expect(domeCost('arcology').earthwork.usd).toBe(ar.usd);
    expect(ar.pitCy).toBeGreaterThan(100_000);
  });
  it('the dig uses the grading rates, and the work goods are priced from them', () => {
    expect(GRADING.cutUsdCy).toBe(EARTH_RATES.cutUsdCy); expect(GRADING.fillUsdCy).toBe(EARTH_RATES.fillUsdCy); expect(GRADING.haulUsdCy).toBe(EARTH_RATES.haulUsdCy);
    const P = DOME_PRICING, per100 = 100 * (EARTH_RATES.cutUsdCy + EARTH_RATES.fillUsdCy * P.backfillShare + EARTH_RATES.haulUsdCy * P.haulOffShare);
    expect(Math.abs((MATERIALS.dome_dig.price ?? 0) - per100)).toBeLessThan(100);
    expect(MATERIALS.dome_rock.price).toBe(100 * P.rockPremiumUsdCy);
    expect(MATERIALS.dome_shoring.price).toBe(100 * P.shoreUsdSf);
    expect(MATERIALS.dome_dewater.price).toBe(P.wellMonthUsd);
    expect(MATERIALS.dome_skirtwork.price).toBe(P.skirtWorkUsdCy);
  });
  it('a wider shell has a heavier frame', () => {
    expect(spanFactor('glass', TIER.glass.cells)).toBe(1); expect(spanFactor('arcology', TIER.arcology.cells)).toBe(1);
    expect(spanFactor('glass', TIER.glass.maxCells)).toBeGreaterThan(1); expect(spanFactor('glass', TIER.glass.minCells)).toBeLessThan(1); expect(spanFactor('geodesic', 12)).toBe(1);
  });
  it('the running cost: power, upkeep, insurance and staff, all growing with the dome', () => {
    const a = domeCostSummary('glass', 15).running, b = domeCostSummary('glass', 24).running;
    expect(a.powerUsd).toBeGreaterThan(0); expect(a.staffUsd).toBe(2 * 95_000); expect(b.totalUsd).toBeGreaterThan(a.totalUsd);
    expect(runningCost('arcology', 7000, 1e9).totalUsd).toBeGreaterThan(20_000_000);
    expect(domeCostSummary('earthen').running.totalUsd).toBeLessThan(5000);
  });
  it('a bunker room is not cheaper to build than a house, a square foot for a square foot (materials and a crew at $60 an hour)', () => {
    const psf = (k: string) => { const sf = KIT[k].cellsX * KIT[k].cellsZ * 100; return (billUsd(totalBill(BLUEPRINTS[k]) as never) + totalHours(BLUEPRINTS[k]) * 60) / sf; };
    const house = Math.min(psf('cottage'), psf('farmhouse'), psf('stone_house'), psf('timber_frame'));
    for (const r of ['bunker_dorm', 'bunker_galley', 'bunker_stores', 'bunker_medical', 'bunker_plant']) expect(psf(r)).toBeGreaterThan(house);
    // the cheap first bunker is still a basic family shelter: $50,000 to $150,000 with a door and a filter
    const c = billUsd(totalBill(BLUEPRINTS.bunker_container) as never); expect(c).toBeGreaterThan(50_000); expect(c).toBeLessThan(150_000);
  });
  it('the equipment spares sit in real-world bands', () => {
    const s = domeCostSummary('arcology', 36).options;
    const chiller = s.find(o => o.id === 'spare_chiller')!.usd, sub = s.find(o => o.id === 'spare_sub')!.usd;
    expect(chiller).toBeGreaterThan(1_000_000); expect(chiller).toBeLessThan(6_000_000);   // a few 500-ton chillers at $200,000 to $400,000 each, with towers and piping
    expect(sub).toBeGreaterThan(2_000_000); expect(sub).toBeLessThan(8_000_000);            // a 5 to 20 MVA substation
  });
  it('the permit grows with the job: about 1 percent of the build price, never under the old flat fee', () => {
    for (const t of ['geodesic', 'glass', 'arcology'] as const) {
      let last = 0;
      for (let c = TIER[t].minCells; c <= TIER[t].maxCells; c++) {
        const k = domeCost(t, c), build = k.materialsUsd + k.laborUsd;
        expect(k.permitUsd).toBeGreaterThanOrEqual(TIER[t].permitFee); expect(k.permitUsd).toBeGreaterThanOrEqual(last);
        expect(k.permitUsd).toBeGreaterThanOrEqual(Math.round(build * PERMIT_SHARE / 1000) * 1000); last = k.permitUsd;
      }
    }
    // 100 ft glass ($13.6M) now pays its floor of $350k; the 240 ft one ($97M) about $970k; a 600 ft arcology about $39M against the old flat $15M
    expect(domeCost('glass', 10).permitUsd).toBe(TIER.glass.permitFee);   // the smallest glass dome sits on the floor
    expect(domeCost('glass', 24).permitUsd).toBeGreaterThan(domeCost('glass', 10).permitUsd * 2);
    expect(domeCost('arcology', 60).permitUsd).toBeGreaterThan(2 * TIER.arcology.permitFee);
    expect(domeCost('earthen').permitUsd).toBe(0);
  });
  it('the county quote follows the sized dome (the placing card reads PERMIT_FEE)', () => {
    expect(PERMIT_FEE[kindOfCells('glass', 24)]).toBe(domeCost('glass', 24).permitUsd);
    expect(PERMIT_FEE[kindOfCells('glass', 24)]).toBeGreaterThan(PERMIT_FEE[kindOfCells('glass', 10)]);
    expect(PERMIT_FEE[DOME_KIND.arcology]).toBe(domeCost('arcology').permitUsd);
  });
});
