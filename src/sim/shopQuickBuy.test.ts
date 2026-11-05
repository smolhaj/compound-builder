import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { MATERIALS, type MaterialId } from './materials';
import { SHELVES, SHELF_TABS } from './shelves';
import { placeOrder, orderCost, prices } from './economy';
import { foodLine } from './economy';
import { livingReserve } from './spendGuard';
import { FOOD, type FoodItemId } from './pantry';
import { dailyNeed, foodDaysCovered, foodRecommended, headroom, maxOwned, ownedOf, PRESETS, planPreset, planQuickBuy, recommendedTotal, RULES, ruleOf, shortfall, tabIds, householdOf, ownedLabel } from './shopQuickBuy';

const game = (money = 2_000_000): GameState => { const g = newGame(2, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' }); g.money = money; return g; };
const built = (g: GameState, kind: string): void => { g.structures.push({ id: 'b' + kind, kind, x: 10, z: 10, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 } as Structure); };
type Cart = Partial<Record<MaterialId, number>>;
type FCart = Partial<Record<FoodItemId, number>>;
const lines = (add: Cart, food: FCart) => [
  ...(Object.entries(add) as Array<[MaterialId, number]>).map(([material, qty]) => ({ material, qty })),
  ...(Object.entries(food) as Array<[FoodItemId, number]>).map(([id, n]) => foodLine(id, n)),
];


describe('shop quick-buy: kinds and caps', () => {
  it('every ruled good exists, is for sale and sits on a shelf', () => {
    const onShelf = new Set(Object.values(SHELVES).flat());
    for (const id of Object.keys(RULES) as MaterialId[]) { expect(MATERIALS[id], id).toBeTruthy(); expect(onShelf.has(id), id).toBe(true); }
  });
  it('singles cap at 1 counting stock, orders and installed structures', () => {
    const g = game(); const hh = householdOf(g);
    expect(maxOwned('clinic_suite', hh)).toBe(1);
    expect(headroom(g, 'clinic_suite')).toBe(1);
    g.stock.clinic_suite = 1;
    expect(headroom(g, 'clinic_suite')).toBe(0);
    expect(ownedLabel(g, 'clinic_suite')).toEqual({ owned: true, text: 'Owned' });
    g.stock.radio_mast = 0; g.money = 1e6;
    expect(placeOrder(g, [{ material: 'radio_mast', qty: 1 }])).toBeTruthy();
    expect(ownedOf(g, 'radio_mast')).toBe(1);               // on order counts
    expect(headroom(g, 'radio_mast')).toBe(0);
    expect(headroom(g, 'drilling')).toBe(1);
    built(g, 'well_drilled');
    expect(ownedOf(g, 'drilling')).toBe(1);                 // the well the drilling became
    expect(headroom(g, 'drilling')).toBe(0);
    expect(headroom(g, 'generator')).toBe(1); built(g, 'generator_shed'); expect(headroom(g, 'generator')).toBe(0);
  });
  it('the cart counts toward the cap', () => {
    const g = game();
    expect(headroom(g, 'gun_safe', 1)).toBe(0);
    expect(shortfall(g, 'gun_safe', 1)).toBe(0);
  });
  it('per-person goods cap at the need minus what is had', () => {
    const g = game(); const hh = householdOf(g); const n = hh.people;
    expect(n).toBeGreaterThan(0);
    expect(maxOwned('sleeping_bag', hh)).toBe(n);
    g.stock.sleeping_bag = n - 1;
    expect(headroom(g, 'sleeping_bag')).toBe(1);
    expect(headroom(g, 'sleeping_bag', 1)).toBe(0);
    g.stock.sleeping_bag = n + 3;
    expect(headroom(g, 'sleeping_bag')).toBe(0);
    expect(maxOwned('radios', hh)).toBe(Math.ceil(hh.fighters / 2));
    expect(maxOwned('tent', hh)).toBe(Math.ceil(hh.people / 3));
    expect(maxOwned('cameras', hh)).toBe(2);
  });
  it('stacks have no cap, and a recommended stock that grows with the family and the horizon', () => {
    const g = game(); const hh = householdOf(g);
    expect(maxOwned('meds', hh)).toBe(Infinity);
    expect(recommendedTotal(g, 'hygiene', 30, hh)).toBe(hh.people);
    expect(recommendedTotal(g, 'hygiene', 90, hh)).toBe(hh.people * 3);
    expect(recommendedTotal(g, 'water_jugs', 90, hh)).toBe(recommendedTotal(g, 'water_jugs', 30, hh));   // fixed: not scaled
    expect(recommendedTotal(g, 'lumber', 30, hh)).toBe(0);      // a building input has no recommendation
    g.stock.hygiene = hh.people;
    expect(shortfall(g, 'hygiene', 0, 30, hh)).toBe(0);
    expect(shortfall(g, 'hygiene', 0, 90, hh)).toBe(hh.people * 2);
    expect(ruleOf('lumber').kind).toBe('stack');
  });
  it('tabIds has no duplicates', () => { for (const [t] of SHELF_TABS) expect(new Set(tabIds(t)).size).toBe(tabIds(t).length); });
});

describe('shop quick-buy: add everything I am missing', () => {
  const all = (tab: Parameters<typeof tabIds>[0]) => tabIds(tab);

  it('never exceeds a single, a per-person count or a cap, on any tab', () => {
    const g = game(); const hh = householdOf(g);
    for (const [tab] of SHELF_TABS) {
      const p = planQuickBuy(g, {}, {}, { ids: all(tab), stayInBudget: false });
      for (const [id, q] of Object.entries(p.add) as Array<[MaterialId, number]>) {
        expect(q, id).toBeGreaterThan(0);
        expect(ownedOf(g, id) + q, `${tab}/${id}`).toBeLessThanOrEqual(maxOwned(id, hh));
      }
    }
  });
  it('adds nothing for what is owned, and skips alternatives with a reason', () => {
    const g = game(); g.stock.clinic_suite = 1; g.stock.gate_house = 1;
    const p = planQuickBuy(g, {}, {}, { ids: all('household'), stayInBudget: false });
    expect(p.add.clinic_suite).toBeUndefined();
    const k = planQuickBuy(g, {}, {}, { ids: all('defense'), stayInBudget: false });
    expect(k.add.gate_house).toBeUndefined();
    expect(k.add.turret_head).toBeUndefined();
    expect(k.skipped.find(x => x.id === 'turret_head')?.reason).toMatch(/weapon system/);
    expect(k.skipped.find(x => x.id === 'dog')?.reason).toMatch(/family member/);
    expect(k.add.soft_armor).toBeUndefined();
  });
  it('is idempotent: pressing twice adds nothing new (cart counted)', () => {
    const g = game();
    for (const [tab] of SHELF_TABS) {
      const a = planQuickBuy(g, {}, {}, { ids: all(tab), stayInBudget: false });
      const b = planQuickBuy(g, a.add, a.food, { ids: all(tab), stayInBudget: false });
      expect(Object.keys(b.add), tab).toEqual([]);
    }
    const pa = planQuickBuy(g, {}, {}, { ids: all('food'), stayInBudget: false, foodDays: 30 });
    const pb = planQuickBuy(g, pa.add, pa.food, { ids: all('food'), stayInBudget: false, foodDays: 30 });
    expect(Object.keys(pb.food)).toEqual([]);
  });
  it('is idempotent after the order is placed and while it is on the way', () => {
    const g = game();
    const a = planQuickBuy(g, {}, {}, { ids: all('defense'), stayInBudget: true });
    expect(Object.keys(a.add).length).toBeGreaterThan(0);
    expect(placeOrder(g, lines(a.add, a.food))).toBeTruthy();
    const b = planQuickBuy(g, {}, {}, { ids: all('defense'), stayInBudget: true });
    expect(Object.keys(b.add)).toEqual([]);
  });
  it('a pantry preset tops up only the shortfall in days, and is idempotent', () => {
    const g = game(); const need = dailyNeed(g);
    const p30 = PRESETS.find(p => p.id === 'pantry30')!, p90 = PRESETS.find(p => p.id === 'pantry90')!;
    const a = planPreset(g, p30, {}, {}, false);
    expect(Object.keys(a.food).length).toBeGreaterThan(0);
    expect(foodDaysCovered(g, a.food)).toBeGreaterThanOrEqual(29);
    expect(foodDaysCovered(g, a.food)).toBeLessThan(40 + (foodDaysCovered(g, {})));
    const again = planPreset(g, p30, a.add, a.food, false);
    expect(Object.keys(again.food)).toEqual([]);
    const b = planPreset(g, p90, a.add, a.food, false);                 // 90 on top of 30 adds the missing 60, not 90
    const full = planPreset(g, p90, {}, {}, false);
    const kcal = (f: FCart) => Object.entries(f).reduce((x, [id, n]) => x + FOOD[id as FoodItemId].kcal * (n ?? 0), 0);
    expect(kcal(b.food)).toBeLessThan(kcal(full.food));
    expect(need).toBeGreaterThan(0);
  });
});

describe('shop quick-buy: budget and gates', () => {
  it('stay-within-budget keeps the living reserve; the order total is under funds minus reserve', () => {
    const g = game(60_000);
    const p = planQuickBuy(g, {}, {}, { ids: tabIds('defense'), stayInBudget: true });
    const cost = orderCost(lines(p.add, p.food), prices(g));
    expect(cost).toBeLessThanOrEqual(g.money - livingReserve(g.money));
    expect(p.orderTotal).toBe(cost);
    expect(p.left).toBe(g.money - cost);
    expect(p.skipped.some(x => /reserve|afford|fit/.test(x.reason))).toBe(true);   // the gate house etc. did not fit
  });
  it('with the budget off it spends up to the money, never past it', () => {
    const g = game(60_000);
    const on = planQuickBuy(g, {}, {}, { ids: tabIds('defense'), stayInBudget: true });
    const off = planQuickBuy(g, {}, {}, { ids: tabIds('defense'), stayInBudget: false });
    expect(off.orderTotal).toBeLessThanOrEqual(g.money);
    expect(off.orderTotal).toBeGreaterThanOrEqual(on.orderTotal);
  });
  it('essentials come first when the money is short', () => {
    const g = game(4_000);
    const p = planQuickBuy(g, {}, {}, { ids: tabIds('defense'), stayInBudget: false });
    expect(p.add.ifak ?? 0).toBeGreaterThan(0);
    expect(p.add.gate_house).toBeUndefined();
    expect(p.orderTotal).toBeLessThanOrEqual(4_000);
  });
  it('broke: adds nothing and says why', () => {
    const g = game(50);
    const p = planQuickBuy(g, {}, {}, { ids: tabIds('household'), stayInBudget: false });
    expect(Object.keys(p.add)).toEqual([]);
    expect(p.skipped.length).toBeGreaterThan(0);
  });
  it('no deliveries: nothing is added, every good is skipped for it', () => {
    const g = game(); g.disaster.tracks.deliveries = 0;
    const p = planQuickBuy(g, {}, {}, { ids: tabIds('household'), stayInBudget: false });
    expect(Object.keys(p.add)).toEqual([]);
    expect(p.skipped.every(x => /delivering/.test(x.reason))).toBe(true);
  });
  it('a good that is not for sale is skipped with a reason', () => {
    const g = game();
    const p = planQuickBuy(g, {}, {}, { ids: ['logs' as MaterialId], stayInBudget: false });
    expect(p.skipped[0]?.reason).toBe('not for sale');
  });
  it('toys are skipped when there are no children', () => {
    const g = game(); g.people = g.people.filter(x => !x.kid); g.personState = g.personState.slice(0, g.people.length);
    const p = planQuickBuy(g, {}, {}, { ids: ['toys', 'picture_books'], stayInBudget: false });
    expect(p.add.toys).toBeUndefined();
    expect(p.skipped.map(x => x.reason)).toEqual(['no children in the house', 'no children in the house']);
  });
  it('each preset is within budget by default and never duplicates', () => {
    const g = game(150_000);
    for (const pr of PRESETS) {
      const a = planPreset(g, pr, {}, {}, true);
      expect(a.orderTotal, pr.id).toBeLessThanOrEqual(g.money - livingReserve(g.money));
      const b = planPreset(g, pr, a.add, a.food, true);
      expect(Object.keys(b.add), pr.id).toEqual([]);
      expect(Object.keys(b.food), pr.id).toEqual([]);
      const hh = householdOf(g);
      for (const [id, q] of Object.entries(a.add) as Array<[MaterialId, number]>) expect(ownedOf(g, id) + q).toBeLessThanOrEqual(maxOwned(id, hh));
    }
  });
});

describe('shop quick-buy: per-card food fill', () => {
  it('only pantry basics have a recommended stock, scaled to the family', () => {
    const g = game(); const need = dailyNeed(g);
    expect(foodRecommended('rice_bag', need, 30)).toBeGreaterThan(0);
    expect(foodRecommended('rice_bag', need, 90)).toBeGreaterThan(foodRecommended('rice_bag', need, 30));
    expect(foodRecommended('freeze_dried', need, 30)).toBe(0);
    expect(foodRecommended('rice_bag', 0, 30)).toBe(0);
  });
});

describe('shop quick-buy: pressing "everything" after buying things by hand', () => {
  it('a family that already owns a tent, a safe and the radios is not offered a second', () => {
    const g = game();
    const hh = householdOf(g);
    g.stock.gun_safe = 1; g.stock.tent = Math.ceil(hh.people / 3); g.stock.radios = Math.ceil(hh.fighters / 2); g.stock.sleeping_bag = hh.people;
    const p = planQuickBuy(g, {}, {}, { ids: [...tabIds('fuel'), ...tabIds('household'), ...tabIds('defense')], stayInBudget: false });
    expect(p.add.gun_safe).toBeUndefined();
    expect(p.add.tent).toBeUndefined();
    expect(p.add.radios).toBeUndefined();
    expect(p.add.sleeping_bag).toBeUndefined();
  });
});
