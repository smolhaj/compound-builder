import { describe, expect, it } from 'vitest';
import { committedCrewWages, foodNudge, livingReserve, spendCheck, spendCheckCommitted, usdShort } from './spendGuard';
import { planStructure } from './construction';
import { crewQuote, hireCrew } from './crews';
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

describe('spend guard counts crew wages already hired', () => {
  it('sums the hours left on every hired crew at the crew rate, and nothing with none hired', () => {
    const g = newGame(7); g.money = 400_000;
    expect(committedCrewWages(g)).toBe(0);
    const a = planStructure(g, 'timber_cabin', 50, 30, 0), b = planStructure(g, 'timber_cabin', 80, 30, 0);
    expect(hireCrew(g, a.id)).toBeNull();
    const one = committedCrewWages(g);
    expect(one).toBeGreaterThan(0);
    expect(Math.abs(one - crewQuote(a).usd)).toBeLessThan(100);
    expect(hireCrew(g, b.id)).toBeNull();
    expect(committedCrewWages(g)).toBeCloseTo(one + crewQuote(b).usd, -3);
  });
  it('a hire that clears the reserve on its own is flagged once earlier hires have claimed the cash', () => {
    const money = 100_000, hire = 20_000;
    expect(spendCheck(money, hire).below).toBe(false);
    expect(spendCheckCommitted(money, hire, 0).below).toBe(false);
    const c = spendCheckCommitted(money, hire, 60_000);
    expect(c).toMatchObject({ after: 20_000, reserve: 25_000, below: true, committed: 60_000 });
  });
  it('is only advice: never negative committed, free spends never flagged', () => {
    expect(spendCheckCommitted(50_000, 1_000, -5).below).toBe(false);
    expect(spendCheckCommitted(50_000, 0, 49_000).below).toBe(false);
  });
  it('the Ark pattern: each quote alone clears the reserve, but later hires prompt once earlier crews are owed', () => {
    const g = newGame(7);
    const sites = [50, 80, 110, 140].map(x => planStructure(g, 'timber_cabin', x, 30, 0));
    const q = crewQuote(sites[0]).usd;
    g.money = Math.round(q * 3.2);
    const alone: boolean[] = [], counted: boolean[] = [];
    for (const st of sites) {
      alone.push(spendCheck(g.money, q).below);
      counted.push(spendCheckCommitted(g.money, q, committedCrewWages(g)).below);
      g.crews.push({ id: 'c' + st.id, target: st.id, hiredAt: 0, hours: 0, paid: 0 });
    }
    expect(alone).toEqual([false, false, false, false]);
    expect(counted[0]).toBe(false);
    expect(counted[3]).toBe(true);
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

describe('staking never takes cash below zero', () => {
  it('refuses a stake whose permit fee is more than the cash, and the ask says so with no go-ahead', async () => {
    const { stakeSpendAsk, permitAffordable } = await import('./spendGuard');
    const g = newGame(7); g.paper.permits = true;
    g.money = 0;
    const a = stakeSpendAsk(g, 'timber_cabin');
    expect(a?.cannot).toMatch(/permit fee/);
    expect(permitAffordable(g, 'timber_cabin').ok).toBe(false);
    g.money = 400_000;
    expect(permitAffordable(g, 'timber_cabin').ok).toBe(true);
    expect(stakeSpendAsk(g, 'timber_cabin')).toBeNull();
  });
  it('the store refuses to stake at $0 and leaves cash at exactly $0; applyForPermit never goes under zero', async () => {
    const { useGameStore } = await import('../store/gameStore');
    const { applyForPermit } = await import('./paperwork');
    const { planStructure } = await import('./construction');
    const g = newGame(7); g.paper.permits = true; g.money = 0;
    useGameStore.setState({ game: g });
    const before = useGameStore.getState().game.structures.length;
    useGameStore.getState().plan('timber_cabin', 30, 30, 0);
    const after = useGameStore.getState().game;
    expect(after.structures.length).toBe(before);
    expect(after.money).toBe(0);
    expect(useGameStore.getState().toolProblem).toMatch(/permit fee/);
    // the backstop
    const h = newGame(7); h.paper.permits = true; h.money = 40;
    const st = planStructure(h, 'timber_cabin', 30, 30, 0);
    applyForPermit(h, st);
    expect(h.money).toBeGreaterThanOrEqual(0);
  });
  it('God Mode keeps its bottomless account (exempt)', async () => {
    const { permitAffordable } = await import('./spendGuard');
    const g = newGame(7, 105, 2027, { mode: 'god' }); g.paper.permits = true; g.money = 0;
    expect(permitAffordable(g, 'timber_cabin').ok).toBe(true);
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
