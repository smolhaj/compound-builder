import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { apiaryOf, apiaryReport, beesDay, flightDays, flow, harvestHoney, pollination, stockApiary, stockProblem, winterNeed, HIVES } from './bees';
import { mapleDay, mapleOf, sapSeason, setTaps, tapsOut, woodsTaps, hasMaples, expectedSyrup } from './maple';
import { butcher, butcherProblem, carrying, dairyDay, herdDay, herdOf, pastureAcres, sheltered, stocking, cowInMilk } from './herd';
import { livestockDay, feedDemand, newLivestock } from './livestock';
import { foodUnits } from './pantry';
import { CLASSIC } from './site';
import type { RegionId } from './regions';

const built = (g: GameState, id: string, kind: string): Structure => {
  const st: Structure = { id, kind, x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: -3000 };
  g.structures.push(st);
  return st;
};
const day = (g: GameState, doy: number) => { g.clock.startDoy = doy; g.clock.t = 0.3; };
const st = (g: GameState) => g.stock as unknown as Record<string, number>;

describe('bees', () => {
  it('a colony goes in only in spring, into a finished apiary, up to four', () => {
    const g = newGame(3); built(g, 'a', 'apiary');
    st(g).bee_nuc = 5;
    day(g, 20);
    expect(stockProblem(g, 'a')).toMatch(/spring/);
    day(g, flightDays(g)[0] + 5);
    for (let i = 0; i < HIVES; i++) expect(stockApiary(g, 'a')).toBeNull();
    expect(stockProblem(g, 'a')).toMatch(/holds/);
    expect(apiaryOf(g, 'a').colonies).toBe(HIVES);
    expect(stockProblem(g, 'nope')).toMatch(/not finished/);
  });

  it('nectar fills the winter stores first, then the surplus; honey and wax come out of the hives', () => {
    const g = newGame(3); built(g, 'a', 'apiary'); built(g, 'g', 'garden'); built(g, 'o', 'orchard');
    const p = apiaryOf(g, 'a'); p.colonies = 2; p.strength = 0.9; p.stores = 20;
    st(g).hive_supplies = 2;
    const [a] = flightDays(g);
    for (let d = a; d < 260; d++) { day(g, d); beesDay(g); }
    expect(p.stores).toBeGreaterThanOrEqual(winterNeed(g) * 0.95);
    expect(p.honeyYear + p.surplus).toBeGreaterThan(20);
    expect(foodUnits(g, 'honey')).toBeGreaterThan(0);
    expect(st(g).beeswax).toBeGreaterThan(0);
    expect(p.treated).toBeGreaterThan(0);
  });

  it('untreated mites kill the colonies over the winter; a clean, fed colony usually lives', () => {
    const lived = (mites: number, stores: number) => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const g = newGame(seed); built(g, 'a', 'apiary');
        const p = apiaryOf(g, 'a'); p.colonies = 4; p.mites = mites; p.stores = stores; p.strength = 0.8;
        day(g, flightDays(g)[0] - 5); beesDay(g); n += p.colonies;
      }
      return n / 40;
    };
    expect(lived(0.1, 70)).toBeGreaterThan(lived(0.9, 70) + 1);
    expect(lived(0.1, 70)).toBeGreaterThan(lived(0.1, 5));
  });

  it('pollination: bees raise the garden and the orchard, no bees means the usual crop', () => {
    const g = newGame(3); built(g, 'a', 'apiary'); built(g, 'g', 'garden'); built(g, 'o', 'orchard');
    day(g, 170);
    expect(pollination(g)).toEqual({ garden: 1, orchard: 1 });
    apiaryOf(g, 'a').colonies = 2; apiaryOf(g, 'a').strength = 0.7;
    const p = pollination(g);
    expect(p.garden).toBeGreaterThan(1.05); expect(p.orchard).toBeGreaterThan(1.1);
    day(g, 20);
    expect(pollination(g).orchard).toBe(1);
  });

  it('harvest leaves nothing unless there is surplus; the report says what is wrong', () => {
    const g = newGame(3); built(g, 'a', 'apiary');
    const p = apiaryOf(g, 'a'); p.colonies = 1;
    expect(harvestHoney(g, 'a')).toMatch(/only/);
    p.surplus = 40;
    expect(harvestHoney(g, 'a')).toBeNull();
    expect(p.surplus).toBe(0);
    p.mites = 0.7;
    expect(apiaryReport(g, 'a').notes.join(' ')).toMatch(/mite/);
    expect(flow(g, 175)).toBeGreaterThan(flow(g, 100));
  });
});

describe('maple', () => {
  const at = (region: RegionId): GameState => { const g = newGame(4); g.site = { ...CLASSIC, region, acres: 40, timber: 1.2 }; return g; };
  it('only some regions have sugar maples; the woods set the taps, the gear and the arch cap them', () => {
    expect(hasMaples(at('desert'))).toBe(false);
    const g = at('new_england');
    expect(hasMaples(g)).toBe(true);
    expect(woodsTaps(g)).toBeGreaterThan(300);
    expect(tapsOut(g)).toBe(0);
    st(g).maple_taps = 2;
    expect(tapsOut(g)).toBe(40);       // 50 by the sets, 40 by the steam pan
    built(g, 'sh', 'sugar_shack'); st(g).maple_taps = 8;
    expect(tapsOut(g)).toBe(150);
    setTaps(g, 100);
    expect(tapsOut(g)).toBe(100);
    expect(expectedSyrup(g, 100)).toBeGreaterThan(15);
  });
  it('a season boils sap down 40 to 1 into the pantry, on firewood', () => {
    const g = at('new_england'); built(g, 'sh', 'sugar_shack'); st(g).maple_taps = 4; st(g).firewood = 30;
    const [a, b] = sapSeason(g);
    for (let d = a; d <= b + 4; d++) { day(g, d); mapleDay(g); }
    const m = mapleOf(g);
    expect(m.gathered).toBeGreaterThan(100);
    expect(foodUnits(g, 'maple_syrup')).toBeCloseTo(m.syrup, 3);
    expect(m.syrup).toBeGreaterThan(m.gathered / 40 * 0.8);
    expect(st(g).firewood).toBeLessThan(30);
  });
  it('no wood, no boil: the sap sours', () => {
    const g = at('new_england'); st(g).maple_taps = 4; st(g).firewood = 0; g.upkeep.green = [];
    const [a, b] = sapSeason(g);
    for (let d = a; d <= b + 4; d++) { day(g, d); mapleDay(g); }
    expect(mapleOf(g).gathered).toBeGreaterThan(100);
    expect(mapleOf(g).syrup).toBeLessThan(mapleOf(g).gathered / 40 * 0.5);
  });
});

describe('the herd', () => {
  it('the cow gives milk but the two months before calving; the family drinks, the cream is churned, a kit presses cheese', () => {
    expect(cowInMilk(100)).toBe(true); expect(cowInMilk(40)).toBe(false);
    const g = newGame(5); g.disaster.tracks = { ...g.disaster.tracks, stores: 0 };
    const fresh0 = g.stock.fresh;
    dairyDay(g, 7000, true, 1);
    expect(foodUnits(g, 'butter')).toBeGreaterThan(0);
    expect(foodUnits(g, 'cheese')).toBe(0);                    // no kit
    st(g).cheese_kit = 1;
    dairyDay(g, 7000, true, 1);
    expect(foodUnits(g, 'cheese')).toBeGreaterThan(0);
    expect(g.stock.fresh).toBeGreaterThan(fresh0);
    // goats alone and no kit: all on the table, as before
    const h = newGame(5);
    const before = h.stock.fresh;
    dairyDay(h, 2600, false, 1);
    expect(h.stock.fresh - before).toBeCloseTo(2600 / 2000);
    expect(foodUnits(h, 'butter') + foodUnits(h, 'cheese')).toBe(0);
  });

  it('goats kid in spring, a cow calves, and the herd is capped', () => {
    const g = newGame(6); st(g).goat = 4; st(g).cow = 1;
    const l = (g.livestock = newLivestock());
    day(g, 80); herdDay(g, l);
    expect(st(g).goat).toBeGreaterThan(4);
    expect(herdOf(g).meatKids).toBeGreaterThan(0);
    day(g, 85); herdDay(g, l);
    expect(herdOf(g).born).toBeGreaterThan(2);
    expect(st(g).goat).toBeLessThanOrEqual(14);
  });

  it('animals fall sick; a vet kit or the vet brings them through, luck mostly does not', () => {
    const run = (kit: boolean) => {
      let sickDays = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const g = newGame(seed); st(g).goat = 6; g.livestock = newLivestock(); st(g).vet_kit = kit ? 50 : 0; g.money = 0;
        for (let d = 0; d < 400; d++) { g.clock.t = d; herdDay(g, g.livestock); sickDays += herdOf(g).sick.goat ?? 0; }
      }
      return sickDays;
    };
    expect(run(true)).toBeLessThan(run(false));
  });

  it('pasture carries so many animal units; over it the animals need more hay', () => {
    const g = newGame(7); g.site = { ...CLASSIC, acres: 20, timber: 0.5 };
    expect(pastureAcres(g)).toBeGreaterThan(2);
    expect(carrying(g)).toBeGreaterThan(0.2);
    st(g).steer = 1; day(g, 200);
    const low = feedDemand(g).hay;
    st(g).steer = 6;
    expect(stocking(g)).toBeGreaterThan(1);
    expect(feedDemand(g).hay / 6).toBeGreaterThan(low);
  });

  it('a barnyard roofs the herd and thins the sickness', () => {
    const g = newGame(7); st(g).cow = 2; st(g).goat = 4;
    expect(sheltered(g)).toBe(0);
    built(g, 'b', 'barnyard');
    expect(sheltered(g)).toBe(1);
  });

  it('butchering by hand: meat up, lard from pigs, never the milk cow', () => {
    const g = newGame(8); st(g).pig = 2; st(g).cow = 1; st(g).smoker = 1; g.clock.startDoy = 330; g.clock.t = 0;
    g.livestock = newLivestock();
    expect(butcherProblem(g, 'cow', 1)).toMatch(/milk cow/);
    expect(butcher(g, 'pig', 3)).toMatch(/not 3/);
    expect(butcher(g, 'pig', 1)).toBeNull();
    expect(st(g).pig).toBe(1);
    expect(foodUnits(g, 'lard')).toBeGreaterThan(0);
    expect(foodUnits(g, 'smoked_meat')).toBeGreaterThan(0);
  });

  it('livestockDay milks the cow and feeds her', () => {
    const g = newGame(9); st(g).cow = 1; st(g).hay = 500; st(g).feed = 50; day(g, 150);
    const kcal = livestockDay(g, false);
    expect(kcal).toBeGreaterThan(4000);
    expect(g.livestock!.condition.cow).toBeGreaterThan(0.9);
  });
});
