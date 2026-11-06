import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { BASE_TABS, FIRST_HOUR_DAYS, SEASON_DAYS, inFirstHour, relevantTabs, revealTabs, tabReason, visibleTabs, type RightTab } from './tabReveal';
import { placeOrder } from './economy';
import { buyProblem, priceOf } from './land';
import { planRun } from './perimeter';
import { hireGuard } from './guards';
import { planStructure } from './construction';
import { triggerDisaster } from './disaster';

const fresh = (): GameState => { const g = newGame(7); g.structures = g.structures.filter(x => x.pre); g.perimeter = []; g.orders = []; g.money = 2_000; return g; };

describe('first-hour HUD tab reveal', () => {
  it('starts with Family only, and everything else waits for a reason', () => {
    const g = fresh();
    g.land.parcels.forEach(p => { p.owner = 'someone'; p.forSale = false; });
    const open = revealTabs(new Set(), g);
    expect([...open]).toContain('family');
    for (const t of ['defense', 'chronicle', 'outside', 'utilities'] as RightTab[]) expect(open.has(t)).toBe(false);
  });

  it('Supplies appears with the first order', () => {
    const g = fresh();
    expect(tabReason(g, 'supplies')).toBeNull();
    placeOrder(g, [{ material: 'lumber', qty: 2 }]);
    expect(tabReason(g, 'supplies')).toMatch(/order/);
  });

  it('Land appears when the player can afford a parcel', () => {
    const g = fresh(); g.disaster = { ...g.disaster, kind: null as never };
    g.land.parcels.forEach(p => { p.forSale = true; });
    g.money = 0;
    expect(tabReason(g, 'land')).toBeNull();
    g.money = 1e9;
    expect(tabReason(g, 'land')).toMatch(/afford/);
    const p = g.land.parcels.find(x => buyProblem(g, x) === null)!;
    g.money = priceOf(g, p) * 1.5;   // enough, but it would take most of the account
    expect(g.land.parcels.some(x => buyProblem(g, x) === null && g.money >= priceOf(g, x) * 2)).toBe(false);
    expect(tabReason(g, 'land')).toBeNull();
    g.money = 1e9;
    expect(relevantTabs(g).has('land')).toBe(true);
  });

  it('Defense appears with the first fence, a guard or the warning signs', () => {
    const a = fresh(); a.disaster = { ...a.disaster, kind: null as never };
    expect(tabReason(a, 'defense')).toBeNull();
    const b = fresh(); b.disaster = { ...b.disaster, kind: null as never };
    planRun(b, 'split_rail', [[0, 0], [10, 0]], []);
    expect(tabReason(b, 'defense')).toMatch(/wall or fence/);
    const c = fresh(); c.disaster = { ...c.disaster, kind: null as never }; c.money = 1e6;
    const house = planStructure(c, 'timber_cabin', 0, 0, 0); house.stage = 99; house.finishedAt = 1;
    expect(hireGuard(c)).toBeNull();
    expect(tabReason(c, 'defense')).toMatch(/guard/);
    const d = fresh();
    triggerDisaster(d.disaster, d.clock.t, 'grid_down', d.seed, 14);
    expect(tabReason(d, 'defense')).toMatch(/Warning signs/);
    expect(tabReason(d, 'outside')).toMatch(/Warning signs/);
  });

  it('Years appears after the first season', () => {
    const g = fresh(); g.disaster = { ...g.disaster, kind: null as never };
    expect(tabReason(g, 'chronicle')).toBeNull();
    g.clock.t = SEASON_DAYS + 1;
    expect(tabReason(g, 'chronicle')).toMatch(/season/);
  });

  it('a revealed tab stays revealed (no data loss), and a link can force one', () => {
    const g = fresh();
    const had = new Set<RightTab>(['family', 'defense']);
    const later = revealTabs(had, g);
    expect(later.has('defense')).toBe(true);
    expect(revealTabs(new Set(), g, ['land']).has('land')).toBe(true);
    for (const t of BASE_TABS) expect(revealTabs(new Set(), g).has(t)).toBe(true);
  });

  it('Show all tabs shows every tab, in order', () => {
    expect(visibleTabs(new Set<RightTab>(['family']), true)).toEqual(['family', 'supplies', 'utilities', 'land', 'defense', 'outside', 'chronicle']);
    expect(visibleTabs(new Set<RightTab>(['family', 'land']), false)).toEqual(['family', 'land']);
  });

  it('the first hour ends after the set number of days', () => {
    const g = fresh();
    expect(inFirstHour(g)).toBe(true);
    g.clock.t = FIRST_HOUR_DAYS + 1;
    expect(inFirstHour(g)).toBe(false);
  });
});
