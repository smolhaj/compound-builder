import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { CANNER_CASES, CANNED_YIELD, daysOfFood, FIELD_KCAL, fieldHarvest, KCAL, liveDay, produce, workFactor } from './needs';

const built = (g: GameState, id: string, kind: string): Structure => {
  const st: Structure = { id, kind, x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 };
  g.structures.push(st);
  return st;
};
const noStores = (g: GameState) => { g.disaster.tracks = { ...g.disaster.tracks, stores: 0, banks: 0 }; };

describe('food and needs', () => {
  it('while the stores are open the family eats from them; after, from the pantry: fresh first, then canned and staples side by side', () => {
    const g = newGame(1);
    g.stock.canned = 4; g.stock.staples = 1; g.stock.fresh = 3;
    liveDay(g, 0.5);
    expect(g.stock.canned).toBe(4);
    noStores(g);
    const r = liveDay(g, 0.5);
    expect(r.kinds[0]).toBe('fresh');
    // the rest from canned and staples in proportion to the calories of each on hand (24,000 vs 80,000)
    const fromCanned = (4 - g.stock.canned) * KCAL.canned, fromStaples = (1 - g.stock.staples) * KCAL.staples;
    expect(fromCanned / fromStaples).toBeCloseTo(24000 / 80000, 5);
    expect(r.kinds).toEqual(['fresh', 'canned', 'staples']);
    expect(r.ateKcal).toBeCloseTo(r.needKcal);
  });

  it('fresh food spoils, slower in a root cellar; the freezer thaws without power', () => {
    const a = newGame(1), b = newGame(1);
    noStores(a); noStores(b);
    a.stock.fresh = 100; b.stock.fresh = 100;
    built(b, 'c', 'root_cellar');
    a.stock.frozen = 10;
    a.people.length = 0; b.people.length = 0;  // nobody eating: just the spoiling
    liveDay(a, 0.5); liveDay(b, 0.5);
    expect(a.stock.fresh).toBeLessThan(b.stock.fresh);
    expect(a.stock.frozen).toBeLessThan(8);
  });

  it('the coop lays all year; the garden only in season', () => {
    const g = newGame(1, 20);
    built(g, 'k', 'chicken_coop'); built(g, 'g', 'garden');
    const winter = produce(g);
    const s = newGame(1, 230);
    built(s, 'k', 'chicken_coop'); built(s, 'g', 'garden');
    expect(winter).toBeGreaterThan(100);
    expect(produce(s)).toBeGreaterThan(winter + 1500);
  });

  it('going hungry costs health and morale, and with them work; Cozy never lets anyone die', () => {
    const g = newGame(1);
    noStores(g);
    for (let d = 0; d < 60; d++) liveDay(g, 0.5);
    const n = g.personState[0].needs;
    expect(n.hunger).toBeGreaterThan(15000);
    expect(n.health).toBeLessThan(80);
    expect(n.morale).toBeLessThan(50);
    expect(workFactor(n)).toBeLessThan(1);
    const c = newGame(2);
    c.disaster.difficulty = 'cozy';
    noStores(c);
    for (let d = 0; d < 400; d++) liveDay(c, 0.5);
    expect(c.personState.every(ps => ps.needs.died == null)).toBe(true);
    const h = newGame(3);
    noStores(h);
    for (let d = 0; d < 400; d++) liveDay(h, 0.5);
    expect(h.personState.some(ps => ps.needs.died != null)).toBe(true);
  });

  it('wounds heal faster with a medic, medical supplies and a medical bay', () => {
    const slow = newGame(1), fast = newGame(1);
    for (const g of [slow, fast]) g.personState[0].needs.hurt = [{ what: 'a deep cut', sev: 60 }];
    fast.stock.meds = 3; built(fast, 'm', 'bunker_medical');
    for (let d = 0; d < 5; d++) { liveDay(slow, 0.5); liveDay(fast, 0.5); }
    const sev = (g: GameState) => g.personState[0].needs.hurt[0]?.sev ?? 0;
    expect(sev(fast)).toBeLessThan(sev(slow) - 15);
    expect(fast.stock.meds).toBeLessThan(3);
  });

  it('days of food counts what is put by', () => {
    const g = newGame(1);
    g.stock.canned = 0; g.stock.staples = 1;
    expect(daysOfFood(g)).toBeCloseTo(KCAL.staples / (2 * 2400 + 2 * 1700));
  });

  it('a field plot brings in the fall harvest: wheat and beans keep dry, potatoes go in fresh', () => {
    const g = newGame(1, 250);
    noStores(g);
    built(g, 'f', 'field');
    g.people.length = 0; g.personState.length = 0;
    const kcal = fieldHarvest(g);
    expect(kcal).toBeGreaterThan(5000);
    const st0 = g.stock.staples;
    liveDay(g, 0.5);
    expect(g.stock.staples - st0).toBeCloseTo(kcal * 0.4 / KCAL.staples);
    // the season's total is in the hundreds of thousands of kcal
    expect(kcal * 65).toBeGreaterThan(FIELD_KCAL * 0.5);
    expect(fieldHarvest(newGame(1, 120))).toBe(0);
  });

  it('surplus fresh food is canned in the home kitchen, two canner loads a day, if there are lids', () => {
    const g = newGame(1, 250);
    noStores(g);
    built(g, 'h', 'timber_cabin');
    g.stock.fresh = 200; g.stock.canned = 0; g.stock.lids = 0;
    liveDay(g, 0.5);
    expect(g.stock.canned).toBe(0);                        // no lids
    g.stock.lids = 24;
    liveDay(g, 0.5);
    expect(g.stock.canned).toBeCloseTo(CANNER_CASES * CANNED_YIELD);
    expect(g.stock.lids).toBe(24 - CANNER_CASES);
  });

  it('a fight wound heals with treatment, barely without, and can go bad', () => {
    const run = (treated: boolean) => {
      const g = newGame(5);
      g.stock.staples = 50; g.stock.meds = treated ? 10 : 0;
      g.people.forEach(p => { p.skills.medic = 0; });
      g.personState[0].needs.hurt.push({ what: 'shot in the leg', sev: 40, trauma: true });
      for (let d = 0; d < 30; d++) { g.clock.t = d; liveDay(g, (d * 0.6180339) % 1); }
      return g.personState[0].needs;
    };
    const t = run(true), u = run(false);
    expect(t.hurt.filter(h => h.trauma).reduce((a, h) => a + h.sev, 0)).toBeLessThan(5);
    expect(u.hurt.filter(h => h.trauma).reduce((a, h) => a + h.sev, 0)).toBeGreaterThan(25);
    expect(u.health).toBeLessThan(t.health);
  });

  it('a bad fight wound puts you on your back', () => {
    const g = newGame(5);
    const n = g.personState[0].needs;
    n.hurt.push({ what: 'shot in the body', sev: 70, trauma: true });
    expect(workFactor(n)).toBeLessThanOrEqual(0.1);
  });
});

describe('who tends the garden', () => {
  it('only the living on the place count: a dead or taken gardener grows nothing', async () => {
    const { bestGardener } = await import('./needs');
    const g = newGame(3);
    g.people.forEach((p, i) => { p.skills.gardener = i === 0 ? 9 : 1; });
    expect(bestGardener(g)).toBe(9);
    g.personState[0].needs.died = 5;
    expect(bestGardener(g)).toBe(1);
    g.personState[0].needs.died = null; g.personState[0].needs.taken = true;
    expect(bestGardener(g)).toBe(1);
  });
});
