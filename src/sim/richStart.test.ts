import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, type GameState } from './state';
import { CLASSIC } from './site';
import { RICH_START, RICH_STARTS, richFunds, isRichStart } from './richStart';
import { compactUsd, richPriceLines } from './richStartCard';
import { award, newLineage } from './lineage';
import { reportCard } from './report';
import { migrate } from './save/migrations';
import { domeCostSummary } from './dome/costSummary';
import { TIER } from './dome/tiers';

const lot = { ...CLASSIC, price: 400_000 };
const start = (rich?: 'founder' | 'magnate'): GameState => newGame(7, 102, 2027, { site: lot, lifestyle: 'independent', rich });

describe('rich starts', () => {
  it('Founder is about $25M and Magnate about $1.5B, less the land and closing like any start', () => {
    const f = start('founder'), m = start('magnate'), n = start();
    expect(f.money).toBeGreaterThan(23_000_000); expect(f.money).toBeLessThan(25_000_000);
    expect(m.money).toBeGreaterThan(1_480_000_000); expect(m.money).toBeLessThan(1_500_000_000);
    expect(n.money).toBeLessThan(2_100_000);   // an ordinary start never passes the independent range
    expect(f.startFunds!.budget).toBe(RICH_START.founder.budget); expect(richFunds('magnate').lines.length).toBe(1);
  });
  it('the cash covers the dome each start is for, at the real price', () => {
    expect(RICH_START.founder.budget).toBeGreaterThan(domeCostSummary('glass', TIER.glass.minCells).totalUsd);   // Founder builds the smallest glass dome, not the usual 150 ft one ($33M)
    expect(RICH_START.founder.budget).toBeLessThan(domeCostSummary('glass').totalUsd);
    expect(RICH_START.founder.budget).toBeGreaterThanOrEqual(TIER.glass.gateUsd);
    expect(RICH_START.magnate.budget).toBeGreaterThan(domeCostSummary('arcology').totalUsd);
    expect(RICH_START.magnate.budget).toBeGreaterThanOrEqual(TIER.arcology.gateUsd);
  });
  it('flags the run and keeps it out of the dynasty score and milestones; an ordinary start is untouched', () => {
    const r = start('founder'), o = start();
    expect(isRichStart(r)).toBe(true); expect(isRichStart(o)).toBe(false); expect(r.lineage.unscored).toBe(true); expect(o.lineage.unscored).toBeUndefined(); expect(o.richStart).toBeUndefined();
    award(r.lineage, 'years', 50); expect(r.lineage.points).toBe(0);
    award(o.lineage, 'years', 50); expect(o.lineage.points).toBe(50);
    const L = newLineage('X'); award(L, 'births', 25); expect(L.points).toBe(25);
  });
  it('the report card is not graded and says so', () => {
    const r = start('magnate'); r.ending = { kind: 'recovered', day: 1 } as never;
    const c = reportCard(r);
    expect(c.grade).not.toMatch(/^[ABCDF]$/); expect(c.lines.join(' ')).toMatch(/rich start/i);
    const o = start(); o.ending = { kind: 'recovered', day: 1 } as never;
    expect(reportCard(o).grade).toMatch(/^[ABCDF]$/);
  });
  it('the card prices come from the pricing module', () => {
    const f = richPriceLines('founder').join(' | '), m = richPriceLines('magnate').join(' | ');
    expect(f).toContain(`about ${compactUsd(domeCostSummary('glass').totalUsd)}, more than this start has`); expect(f).toMatch(/150 ft glass dome/); expect(f).toMatch(/100 ft glass dome costs about \$14M(?!, more)/);
    expect(m).toContain(`about ${compactUsd(domeCostSummary('arcology').totalUsd)}`); expect(m).toMatch(/360 ft arcology/);
    expect(compactUsd(32_900_000)).toBe('$33M'); expect(compactUsd(1_110_000_000)).toBe('$1.1B'); expect(compactUsd(63_000)).toBe('$63k');
    for (const k of RICH_STARTS) expect(richPriceLines(k).length).toBe(RICH_START[k].domes.length);
  });
  it('an old save loads with no rich start and nothing owed', () => {
    const g = newGame(3); const old = JSON.parse(JSON.stringify(g)); old.version = 104;
    const up = migrate(old); expect(up.version).toBe(SAVE_VERSION); expect(up.richStart).toBeUndefined();
  });
});
