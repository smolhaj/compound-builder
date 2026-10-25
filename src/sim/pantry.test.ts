import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { liveDay } from './needs';
import { shelfDay } from './shelf';
import { deliverOrders, foodLine, placeOrder } from './economy';
import { migrate } from './save/migrations';
import {
  quality, sickness, THAWED_SICK, eatingLine, type FoodItemId,
  addFood, CAT_KCAL, dietDiversity, dietEffects, eatFrom, FOOD, FOOD_CATS, KITS, kitUnits, lifeDays, newPantry, pantryKcal, pantryRows, syncPantry,
} from './pantry';

const noStores = (g: GameState) => { g.disaster.tracks = { ...g.disaster.tracks, stores: 0, banks: 0, deliveries: 0 }; };
const cellar = (g: GameState) => g.structures.push({ id: 'rc', kind: 'root_cellar', x: 5, z: 5, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
/** The breakdown matches the aggregate stocks (to a part in a million). */
const sums = (g: GameState) => {
  for (const cat of FOOD_CATS) expect(pantryKcal(g.pantry, cat)).toBeCloseTo(g.stock[cat] * CAT_KCAL[cat], -1);
};
const fresh = (seed = 1) => { const g = newGame(seed); g.pantry = newPantry(); g.stock.canned = 0; return g; };

describe('the pantry, item by item', () => {
  it('the breakdown always sums to the aggregates: eating, raids, spoilage, purchases, unnamed gifts', () => {
    const g = fresh();
    addFood(g, 'rice_bucket', 10); addFood(g, 'black_beans', 4); addFood(g, 'oil', 6); addFood(g, 'canned_meat', 12); addFood(g, 'freezer_meat', 3);
    sums(g);
    noStores(g);
    for (let d = 0; d < 40; d++) { g.clock.t = d; shelfDay(g); liveDay(g, 0.4); }
    syncPantry(g); sums(g);
    // raiders take a third of the canned and staples (encounters / battle change the aggregates directly)
    g.stock.canned *= 0.66; g.stock.staples -= 1.5;
    syncPantry(g); sums(g);
    // a neighbor's gift with no name on it comes in as the default mix
    g.stock.canned += 3;
    syncPantry(g); sums(g);
    expect(g.pantry.items.canned_veg?.q).toBeGreaterThan(0);
    // spoilage over years (flour and oil go off)
    addFood(g, 'flour', 5);
    for (let d = 40; d < 900; d++) { g.clock.t = d; shelfDay(g); }
    sums(g);
    // a delivered order of named food
    const h = fresh(2);
    expect(placeOrder(h, [foodLine('rice_bucket', 4), foodLine('salt', 2), foodLine('canned_fruit', 3)])).not.toBeNull();
    h.site.improvements.drive = true;
    h.clock.t = 30; deliverOrders(h);
    expect(h.pantry.items.rice_bucket?.q).toBe(4);
    expect(h.pantry.items.salt?.q).toBe(2);
    expect(h.stock.staples).toBeCloseTo(4 * FOOD.rice_bucket.kcal / CAT_KCAL.staples);
    sums(h);
  });

  it('a named order is priced by the item (a sealed bucket of rice $55; salt has no kcal but still sells)', () => {
    const g = fresh();
    const money = g.money;
    placeOrder(g, [foodLine('rice_bucket', 2), foodLine('salt', 1)]);
    expect(money - g.money).toBe(2 * 55 + 10 + 75);
  });

  it('best-by per item: rice in Mylar buckets decades, flour a year, oil less in a warm house, honey forever', () => {
    const g = fresh();
    cellar(g);
    expect(lifeDays(g, 'rice_bucket')).toBe(30 * 365);
    expect(lifeDays(g, 'rice_bag')).toBeLessThan(5 * 365);
    expect(lifeDays(g, 'flour')).toBe(365);
    expect(lifeDays(g, 'honey')).toBe(Infinity);
    const warm = fresh();
    expect(lifeDays(warm, 'oil')).toBeLessThan(lifeDays(g, 'oil'));
    // after the collapse nothing is thrown out for being past date until it's truly gone: flour is still there two years past
    noStores(g);
    g.stock.traps = 100;
    addFood(g, 'rice_bucket', 4); addFood(g, 'flour', 4); addFood(g, 'honey', 4); addFood(g, 'salt', 2);
    for (let d = 0; d < 3 * 365; d++) { g.clock.t = d; shelfDay(g); }
    expect(g.pantry.items.flour?.q).toBeCloseTo(4, 5);
    const row = pantryRows(g, 9000).find(r => r.id === 'flour')!;
    expect(row.tone).toBe('bad');
    expect(row.value).toBeLessThan(0.85);
    // a year later it's rancid past using and goes out
    const lines: string[] = [];
    for (let d = 3 * 365; d < 4 * 365; d++) { g.clock.t = d; lines.push(...shelfDay(g)); }
    expect(g.pantry.items.flour?.q ?? 0).toBeLessThan(1.5);
    expect(g.pantry.items.rice_bucket?.q).toBe(4);
    expect(g.pantry.items.honey?.q).toBe(4);
    expect(g.pantry.items.salt?.q).toBe(2);
    expect(lines.some(l => /rancid/.test(l))).toBe(true);
  });

  it('past its date food declines gradually: calories and value fade over years, never all at once', () => {
    expect(quality('canned_veg', 0)).toBe(1);
    expect(quality('honey', 5000)).toBe(1);
    let prev = 1;
    for (let y = 0.5; y <= 10; y += 0.5) { const q = quality('canned_meat', y * 365); expect(q).toBeLessThan(prev); expect(q).toBeGreaterThan(0.74); prev = q; }
    expect(quality('rice_bucket', 5 * 365)).toBeGreaterThan(0.9);       // sealed grain barely changes
    expect(quality('canned_soup', 3 * 365)).toBeLessThan(0.85);
    expect(quality('oil', 2 * 365)).toBeLessThan(0.75);                  // rancid: mostly quality
  });

  it('sickness odds by item and age: sealed dry goods all but never, old cans low to moderate, home-canned a rare botulism risk, thawed meat a real one', () => {
    for (const id of ['honey', 'salt', 'sugar'] as const) expect(sickness(id, 20 * 365)).toEqual({ sick: 0, bot: 0 });
    expect(sickness('canned_veg', 0).sick).toBe(0);                     // in date: safe
    expect(sickness('rice_bucket', 10 * 365).sick).toBeLessThanOrEqual(0.002);
    const can1 = sickness('canned_veg', 365).sick, can3 = sickness('canned_veg', 3 * 365).sick;
    expect(can3).toBeGreaterThan(can1);
    expect(can3).toBeGreaterThan(sickness('rice_bucket', 3 * 365).sick * 5);
    expect(can3).toBeLessThanOrEqual(0.03);
    const jar = sickness('home_canned', 2 * 365);
    expect(jar.bot).toBeGreaterThan(sickness('home_canned', 0).bot);
    expect(jar.bot).toBeLessThan(0.002);
    expect(sickness('canned_veg', 5 * 365).bot).toBe(0);
    expect(THAWED_SICK).toBeGreaterThan(sickness('canned_veg', 5 * 365).sick * 0.6);
  });

  it('discard rules: bulging cans and failed seals go bit by bit, badly rancid oil goes, sealed buckets never; with the stores open long-expired food is replaced', () => {
    const after = fresh(); noStores(after); after.stock.traps = 100;
    addFood(after, 'canned_veg', 20, 365 * 6); addFood(after, 'home_canned', 20, 365 * 4); addFood(after, 'oil', 10, 365 * 5); addFood(after, 'rice_bucket', 10, 365 * 35);
    const lines: string[] = [];
    for (let d = 0; d < 365; d++) { after.clock.t = d; lines.push(...shelfDay(after)); }
    const q = (id: FoodItemId) => after.pantry.items[id]?.q ?? 0;
    expect(q('canned_veg')).toBeLessThan(20); expect(q('canned_veg')).toBeGreaterThan(10);
    expect(q('home_canned')).toBeLessThan(18);
    expect(q('oil')).toBeLessThan(3);
    expect(q('rice_bucket')).toBe(10);
    expect(lines.some(l => /bulging/.test(l))).toBe(true);
    sums(after);
    // in peacetime: long-expired cans are thrown out and bought fresh, home-canned just goes
    const peace = fresh(); peace.stock.traps = 100;
    addFood(peace, 'canned_veg', 10, 365 * 6); addFood(peace, 'home_canned', 5, 365 * 3);
    const money = peace.money;
    peace.clock.t = 1; shelfDay(peace);
    expect(peace.pantry.items.canned_veg?.q).toBe(10);
    expect(peace.pantry.items.canned_veg!.age).toBeLessThan(2);
    expect(money - peace.money).toBeCloseTo(10 * 26);
    expect(peace.pantry.items.home_canned).toBeUndefined();
    sums(peace);
  });

  it('eating order: in-date food first; once it is gone, old food, and more of it for the same calories', () => {
    const g = fresh(); noStores(g); g.stock.traps = 100;
    addFood(g, 'canned_meat', 10, 365 * 6);      // long past date
    addFood(g, 'rice_bucket', 1);                // in date
    const r = liveDay(g, 0.4);
    expect(g.pantry.items.canned_meat?.q).toBe(10);             // untouched while the rice lasts
    expect(r.ateKcal).toBeCloseTo(r.needKcal);
    // rice gone: the old cans; each kcal of them is worth less, so more is eaten
    delete g.pantry.items.rice_bucket; g.stock.staples = 0;
    const before = g.stock.canned;
    const r2 = liveDay(g, 0.4);
    g.food = r2;
    const eatenNominal = (before - g.stock.canned) * 6000;
    expect(r2.ateKcal).toBeCloseTo(r2.needKcal);
    expect(eatenNominal).toBeGreaterThan(r2.needKcal * 1.15);
    expect(eatingLine(g)).toMatch(/past its date/);
  });

  it('old and thawed food makes people sick: food poisoning passes in days; botulism kills without care', () => {
    // a month of nothing but meat from a dead freezer
    const g = fresh(); noStores(g);
    addFood(g, 'freezer_meat', 400);
    let sick = 0;
    for (let d = 0; d < 30; d++) { g.clock.t = d; liveDay(g, 0.4); sick += g.personState.filter(ps => ps.needs.hurt.some(h => h.what === 'food poisoning')).length; }
    expect(sick).toBeGreaterThan(0);
    // food poisoning: gone in a few days with water
    const f = fresh(); noStores(f); addFood(f, 'rice_bucket', 4);
    f.personState[0].needs.hurt.push({ what: 'food poisoning', sev: 20 });
    for (let d = 0; d < 6; d++) liveDay(f, 0.4);
    expect(f.personState[0].needs.hurt.length).toBe(0);
    // botulism: with no medicine, no medic and no medical bay, health falls fast; with medicine it mends
    const b = fresh(); noStores(b); addFood(b, 'rice_bucket', 4); b.stock.meds = 0;
    b.people.forEach(p => { p.skills.medic = 0; });
    b.personState[0].needs.hurt.push({ what: 'botulism', sev: 80, trauma: true });
    for (let d = 0; d < 20; d++) liveDay(b, 0.4);
    const c = fresh(); noStores(c); addFood(c, 'rice_bucket', 4); c.stock.meds = 20;
    c.personState[0].needs.hurt.push({ what: 'botulism', sev: 80, trauma: true });
    for (let d = 0; d < 20; d++) liveDay(c, 0.4);
    expect(b.personState[0].needs.health).toBeLessThan(c.personState[0].needs.health - 30);
  });

  it('mice get into the sacks, not the sealed buckets', () => {
    const g = fresh();
    addFood(g, 'rice_bucket', 4); addFood(g, 'rice_bag', 4);
    for (let d = 0; d < 365; d++) { g.clock.t = d; shelfDay(g); }
    expect(g.pantry.items.rice_bucket?.q).toBe(4);
    expect(g.pantry.items.rice_bag!.q).toBeLessThan(3.5);
  });

  it('eats what expires soonest first, and keeps sugar and oil to sensible shares', () => {
    const g = fresh();
    cellar(g);
    addFood(g, 'rice_bucket', 4); addFood(g, 'flour', 2, 330); addFood(g, 'sugar', 2); addFood(g, 'oil', 2);
    const ate = Object.fromEntries(eatFrom(g, 'staples', 10000).plate);
    expect(ate.flour).toBeGreaterThan(ate.rice_bucket);
    expect(ate.sugar).toBeLessThanOrEqual(0.08 * 10000 + 1e-6);
    expect(ate.oil).toBeLessThanOrEqual(0.15 * 10000 + 1e-6);
    expect(Object.values(ate).reduce((a, b) => a + b, 0)).toBeCloseTo(10000);
  });

  it('months of rice and beans wear on morale; a varied pantry with coffee and honey does not', () => {
    const run = (stock: (g: GameState) => void) => {
      const g = fresh(3);
      g.stock.traps = 100;
      stock(g);
      noStores(g);
      for (let d = 0; d < 120; d++) { g.clock.t = d; shelfDay(g); liveDay(g, 0.4); }
      return g;
    };
    const plain = run(g => { addFood(g, 'rice_bucket', 8); addFood(g, 'beans_bucket', 8); addFood(g, 'salt', 2); });
    const varied = run(g => {
      for (const id of ['rice_bucket', 'beans_bucket', 'wheat_bucket', 'oats', 'peanut_butter', 'milk_powder', 'freeze_dried'] as const) addFood(g, id, id === 'freeze_dried' || id === 'milk_powder' ? 30 : 3);
      for (const id of ['canned_veg', 'canned_fruit', 'canned_meat', 'canned_soup'] as const) addFood(g, id, 6);
      addFood(g, 'oil', 6); addFood(g, 'honey', 3); addFood(g, 'sugar', 2); addFood(g, 'salt', 2); addFood(g, 'coffee', 10);
    });
    expect(dietDiversity(plain.pantry)).toBeLessThan(2.6);
    expect(dietDiversity(varied.pantry)).toBeGreaterThan(5);
    const m = (g: GameState) => g.personState.filter(p => p.needs.died == null).reduce((a, p) => a + p.needs.morale, 0) / g.personState.length;
    expect(m(varied)).toBeGreaterThan(m(plain) + 8);
    // rice and beans have almost no fat: health is kept off the top
    const e = dietEffects(plain, false);
    expect(e.healthCap).toBeLessThan(100);
    expect(e.notes.some(n => /fat/.test(n.text))).toBe(true);
    expect(dietEffects(varied, false).healthCap).toBe(100);
  });

  it('running out of coffee is a week of headaches for a family with the habit, then it passes; no salt makes it bland', () => {
    const g = fresh();
    addFood(g, 'rice_bucket', 4);
    noStores(g);
    const p = g.pantry;
    g.clock.t = 100;
    p.coffeeDay = 99;                 // they had coffee yesterday: a habit
    const base = (() => { p.noCoffee = 0; return dietEffects(g, false).morale; })();
    p.noCoffee = 1;
    const out = dietEffects(g, false).morale;
    p.noCoffee = 30;
    const later = dietEffects(g, false).morale;
    expect(out).toBeLessThan(later - 3);
    expect(out).toBeLessThanOrEqual(base - 5);
    addFood(g, 'coffee', 1); p.noCoffee = 0;
    expect(dietEffects(g, false).morale).toBeGreaterThan(later);
    p.noSalt = 20;
    expect(dietEffects(g, false).notes.some(n => /salt/.test(n.text))).toBe(true);
    // the stores open: groceries, no effect
    expect(dietEffects(g, true)).toMatchObject({ variety: 3, morale: 0, healthCap: 100 });
  });

  it('a family that never stocked coffee only misses it a little, and not for long', () => {
    const g = fresh();
    addFood(g, 'rice_bucket', 4);
    noStores(g);
    const p = g.pantry;
    expect(p.coffeeDay).toBeUndefined();
    p.noCoffee = 0;
    const base = dietEffects(g, false).morale;
    p.noCoffee = 1;
    expect(dietEffects(g, false).morale).toBe(base - 2);
    p.noCoffee = 20;
    expect(dietEffects(g, false).morale).toBe(base);
    // coffee they bought long ago (more than 90 days since it was on hand) is no habit any more
    g.clock.t = 400; p.coffeeDay = 200; p.noCoffee = 1;
    expect(dietEffects(g, false).morale).toBe(base);
    // and buying coffee starts one
    addFood(g, 'coffee', 1);
    expect(p.coffeeDay).toBe(400);
  });

  it('salt and coffee are used up by the day: a 3 lb can lasts two adults about five weeks', () => {
    const g = fresh();
    addFood(g, 'rice_bucket', 4); addFood(g, 'coffee', 1); addFood(g, 'salt', 1);
    noStores(g);
    const adults = g.people.filter(p => !p.kid).length;
    for (let d = 0; d < 20; d++) liveDay(g, 0.4);
    expect(g.pantry.items.coffee!.q).toBeCloseTo(1 - 20 * adults * 2 / 140, 5);
    expect(g.pantry.noCoffee).toBe(0);
    for (let d = 0; d < 60; d++) liveDay(g, 0.4);
    expect(g.pantry.items.coffee).toBeUndefined();
    expect(g.pantry.noCoffee).toBeGreaterThan(0);
    expect(g.pantry.items.salt!.q).toBeGreaterThan(0.5);   // 25 lb of salt lasts a family over a year
  });

  it('the field harvest, the canner and the smoker put up named food', () => {
    const g = fresh();
    noStores(g);
    g.stock.fresh = 200; g.stock.lids = 10;
    g.structures.push({ id: 'h', kind: 'timber_cabin', x: 5, z: 5, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    liveDay(g, 0.4);
    expect(g.pantry.items.home_canned?.q).toBeGreaterThan(0);
    sums(g);
  });

  it('kits are sized to the household: a year kit covers a year of calories', () => {
    const need = 9000;
    const units = kitUnits(KITS[0], need);
    const kcal = units.reduce((a, [id, n]) => a + n * FOOD[id].kcal, 0);
    expect(kcal / need).toBeGreaterThan(330);
    expect(kcal / need).toBeLessThan(400);
  });

  it('migrates a v38 save: the aggregates split into a default breakdown at their old shelf ages', () => {
    const v = structuredClone(newGame(5)) as unknown as Record<string, unknown>;
    v.version = 38;
    delete v.pantry;
    const stock = v.stock as Record<string, number>;
    stock.staples = 12.5; stock.canned = 30; stock.frozen = 4;
    (v.shelf as { age: Record<string, number> }).age = { staples: 400, canned: 200 };
    const g = migrate(v);
    expect(g.version).toBeGreaterThanOrEqual(39);
    sums(g);
    expect(g.pantry.items.rice_bucket!.age).toBe(400);
    expect(g.pantry.items.canned_meat!.age).toBe(200);
    expect(g.pantry.items.salt!.q).toBeGreaterThanOrEqual(1);
    expect(g.pantry.items.freezer_meat!.q).toBeCloseTo(4);
    // and it plays on: a day later the books still balance
    noStores(g);
    shelfDay(g); liveDay(g, 0.4);
    sums(g);
  });
});
