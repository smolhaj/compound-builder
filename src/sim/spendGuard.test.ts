import { describe, expect, it } from 'vitest';
import { foodNudge, livingReserve, spendCheck, usdShort } from './spendGuard';
import { newGame } from './state';
import { suggestions } from './guidance';

const bare = (money: number) => { const g = newGame(7); g.money = money; for (const k of ['staples', 'canned', 'frozen', 'fresh'] as const) g.stock[k] = 0; if (g.pantry) g.pantry = { ...g.pantry, items: {} }; return g; };

describe('spend guard', () => {
  it('keeps 25 % with a $15k floor', () => {
    expect(livingReserve(327_000)).toBe(81_750);
    expect(livingReserve(20_000)).toBe(15_000);
  });
  it('flags a purchase that leaves less than the reserve, never one above it', () => {
    expect(spendCheck(327_000, 141_000)).toMatchObject({ after: 186_000, below: false });
    expect(spendCheck(327_000, 280_000).below).toBe(true);
    expect(spendCheck(327_000, 0).below).toBe(false);
  });
  it('shortens dollars', () => { expect(usdShort(141_200)).toBe('$141k'); expect(usdShort(950)).toBe('$950'); });
  it('nudges to stock food when the pantry is bare and cash is fine', () => {
    const g = bare(300_000);
    const n = foodNudge(g);
    expect(n).not.toBeNull();
    expect(n!.cost).toBeGreaterThan(0);
    expect(suggestions(g, 30).some(x => x.id === 'stock_food')).toBe(true);
  });
  it('stays quiet with food on hand or no cash to spare', () => {
    const g = bare(300_000); g.stock.staples = 400;
    expect(foodNudge(g)).toBeNull();
    expect(foodNudge(bare(3_000))).toBeNull();
  });
});

describe('stake spend ask', () => {
  it('asks before a permit fee that dips under the reserve, even at $0, and not when cash is plentiful', async () => {
    const { stakeSpendAsk, permitSpend } = await import('./spendGuard');
    const g = newGame(7); g.paper.permits = true;
    const kind = 'timber_cabin';
    expect(permitSpend(g, kind)).toBeGreaterThan(0);
    g.money = 0;
    const a = stakeSpendAsk(g, kind);
    expect(a).not.toBeNull();
    expect(a!.check.after).toBeLessThan(0);
    g.money = 400_000;
    expect(stakeSpendAsk(g, kind)).toBeNull();
    g.paper.permits = false;
    g.money = 0;
    expect(stakeSpendAsk(g, kind)).toBeNull();
  });
});

describe('food nudge urgency', () => {
  it('stays under the plow and retaining wall cards until the warning signs are up', async () => {
    const { foodUrgency } = await import('./spendGuard');
    const g = bare(300_000);
    expect(foodUrgency(g, 0)).toBe(54);
    expect(foodUrgency(g, 10)).toBe(52);
    g.disaster.kind = 'grid_down'; g.disaster.warnAt = 10; g.disaster.hitAt = 100; g.clock.t = 50;
    expect(foodUrgency(g, 0)).toBe(63);
    expect(foodUrgency(g, 5)).toBe(60);
    expect(foodUrgency(g, 12)).toBe(52);
    g.clock.t = 5;
    expect(foodUrgency(g, 0)).toBe(54);
  });
});
