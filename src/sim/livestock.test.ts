import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { butcher, ensureLivestock, feedDemand, lactation, livestockDay, pasture, winterHay } from './livestock';
import { foodUnits } from './pantry';
import { layRate, eggsToday } from './poultry';
import { healthDay } from './livestockHealth';
import { mulberry32 } from './rng';

const farm = (doy: number, seed = 7) => { const g = newGame(seed, doy, 2027); g.stock.fresh = 0; g.stock.frozen = 0; return g; };
const run = (g: GameState, days: number, freezer = true) => { let k = 0; const t0 = g.clock.t; for (let d = 0; d < days; d++) { g.clock.t = t0 + d; k += livestockDay(g, freezer); } return k; };
const built = (g: GameState, id: string, kind: string): Structure => { const st: Structure = { id, kind, x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };
/** After the collapse: no stud service or vet, no neighbor lending a buck. */
const alone = (g: GameState) => { g.disaster.tracks = { ...g.disaster.tracks, deliveries: 0, stores: 0, law: 0 }; for (const n of g.neighbors) n.disposition = 0; };

describe('livestock', () => {
  it('no animals: nothing happens', () => {
    const g = farm(150);
    expect(run(g, 30)).toBe(0);
    expect(g.livestock).toBeUndefined();
  });

  it('a lactation peaks in the first months, dries off before the next birth and tails off unbred', () => {
    expect(lactation(30, Infinity)).toBeGreaterThan(0.85);
    expect(lactation(120, Infinity)).toBe(1);
    expect(lactation(250, 50)).toBe(0);                 // dried off two months before kidding
    expect(lactation(400, Infinity)).toBeGreaterThan(0);
    expect(lactation(400, Infinity)).toBeLessThan(0.4);
    expect(lactation(520, Infinity)).toBe(0);
  });

  it('fed goats give milk; unbred, the does milk through the winter and are dry by the next summer', () => {
    const g = farm(150);
    g.stock.goat = 2; g.stock.hay = 300; g.stock.feed = 60;
    expect(run(g, 10)).toBeGreaterThan(20_000);
    expect(g.stock.fresh).toBeGreaterThan(5);
    // no buck and nobody to lend one: no kids, and by the next February the milk is gone
    const w = farm(150);
    alone(w);
    w.stock.goat = 2; w.stock.hay = 2000; w.stock.feed = 400;
    run(w, 290);
    expect(w.log.some(l => /No buck/.test(l.text))).toBe(true);
    const winter = run(w, 10);
    expect(winter).toBeLessThan(20_000 * 0.6);
    run(w, 140);
    expect(run(w, 10)).toBeLessThan(500);
    expect(w.livestock!.young.length).toBe(0);
  });

  it('a buck breeds the does in the fall: kids in the spring, fresh milk, the bucklings to the butcher in the fall', () => {
    const g = farm(230);
    alone(g);
    g.stock.goat = 3; g.stock.goat_buck = 1; g.stock.hay = 3000; g.stock.feed = 600;
    run(g, 120);
    expect(g.livestock!.preg.goat).toBeTruthy();
    run(g, 160);
    const kids = g.livestock!.young.filter(y => y.kind === 'kid').reduce((a, y) => a + y.n, 0);
    expect(kids).toBeGreaterThanOrEqual(3);
    expect(kids).toBeLessThanOrEqual(9);
    expect(g.livestock!.fresh.goat).toBeGreaterThan(140);
    // the fall after: kids to the butcher, doelings into the herd (up to four does)
    run(g, 230);
    expect(g.livestock!.young.filter(y => y.kind === 'kid').length).toBe(0);
    expect(g.stock.goat).toBeGreaterThanOrEqual(3);
    expect(g.stock.goat).toBeLessThanOrEqual(4);
  });

  it('pigs go to the butcher in November: pork in the freezer, lard in crocks', () => {
    const g = farm(290);
    g.stock.pig = 2; g.stock.feed = 50;
    const k = run(g, 30);
    expect(k).toBeGreaterThan(300_000);
    expect(g.stock.pig).toBe(0);
    expect(g.stock.frozen).toBeGreaterThan(20);
    expect(foodUnits(g, 'lard')).toBeGreaterThan(4);
    expect(g.farm.work.used.butchering ?? 0).toBeGreaterThan(0);
  });

  it('a sow and a boar: a litter of piglets, weaned, to the butcher at six months', () => {
    const g = farm(100);
    g.stock.sow = 1; g.stock.boar = 1; g.stock.feed = 1500;
    g.livestock = undefined;
    run(g, 75);           // a bought gilt farrows ≈ 60 days after she comes
    const litter = g.livestock!.young.filter(y => y.kind === 'piglet').reduce((a, y) => a + y.n, 0);
    expect(litter).toBeGreaterThanOrEqual(5);
    expect(litter).toBeLessThanOrEqual(12);
    const k = run(g, 200);
    expect(k).toBeGreaterThan(400_000);
  });

  it('a milk cow: gallons of milk; butter from the cream and cheese with a kit', () => {
    const g = farm(150);
    g.stock.cow = 1; g.stock.hay = 500; g.stock.feed = 100; g.stock.cheese_kit = 1;
    const k = run(g, 20);
    expect(k / 20).toBeGreaterThan(5000);
    expect(foodUnits(g, 'butter')).toBeGreaterThan(5);
    expect(foodUnits(g, 'cheese')).toBeGreaterThan(0);
    expect(g.livestock!.dairy.butterYear).toBeGreaterThan(5);
  });

  it('rabbits breed: fryers and a growing colony', () => {
    const g = farm(100);
    g.stock.rabbit = 3; g.stock.feed = 20; g.stock.hardware_cloth = 1;
    const k = run(g, 130);
    expect(g.stock.rabbit).toBeGreaterThan(3);
    expect(k).toBeGreaterThan(0);
  });

  it('without feed they lose condition and die', () => {
    const g = farm(20);
    g.stock.steer = 1; g.stock.goat = 1;
    expect(feedDemand(g).hay).toBeGreaterThan(0);
    run(g, 60);
    expect(g.stock.steer).toBe(0);
    expect(g.stock.goat).toBe(0);
  });

  it('winter hay scales with the herd and the winter; an overstocked pasture eats hay in summer', () => {
    const g = farm(250);
    g.stock.steer = 1;
    const one = winterHay(g);
    expect(one).toBeGreaterThan(50);
    g.stock.steer = 2;
    expect(winterHay(g)).toBeGreaterThanOrEqual(one * 2 - 1);
    const s = farm(180);
    s.stock.goat = 1;
    const light = feedDemand(s).hay;
    s.stock.cow = Math.ceil(pasture(s).carries * 3);
    expect(feedDemand(s).hay / (s.stock.cow * 30 / 50 + 5 / 50)).toBeGreaterThan(light / (5 / 50) * 2);
  });

  it('the family cuts its own hay in early summer when the winter\'s hay isn\'t in', () => {
    const g = farm(180);
    g.stock.goat = 2; g.stock.feed = 100;
    run(g, 30);
    expect(g.stock.hay).toBeGreaterThan(20);
    expect(g.farm.work.day).toBeGreaterThan(0);
  });

  it('short of bags, a well-stocked pantry feeds the pigs its own grain', () => {
    const g = farm(150);
    g.stock.pig = 1; g.stock.feed = 0;
    g.pantry.items.home_dry = { q: 20, age: 0 };
    g.stock.staples = 20 * 77_500 / 80_000;
    run(g, 20);
    expect(g.livestock!.condition.pig).toBeGreaterThan(0.9);
    expect(foodUnits(g, 'home_dry')).toBeLessThan(20);
  });

  it('butchering a doe now: meat by the method the place has', () => {
    const g = farm(150);
    g.stock.goat = 2; g.stock.smoker = 1;
    ensureLivestock(g);
    const k = butcher(g, 'goat');
    expect(k).toBeGreaterThan(10_000);
    expect(g.stock.goat).toBe(1);
    expect(foodUnits(g, 'smoked_meat')).toBeGreaterThan(0);   // no freezer power: smoked
  });
});

describe('hens', () => {
  it('lay by day length: most in spring and summer, little in midwinter, a dip at the molt', () => {
    expect(layRate(170)).toBeGreaterThan(0.75);
    expect(layRate(355)).toBeLessThan(0.35);
    expect(layRate(300)).toBeLessThan(layRate(250) * 0.5);
    const g = farm(170), w = farm(355);
    built(g, 'c', 'chicken_coop'); built(w, 'c', 'chicken_coop');
    expect(eggsToday(g)).toBeGreaterThan(eggsToday(w) * 2);
  });

  it('a box of chicks: pullets laying in five months, cockerels to the pot', () => {
    const g = farm(100);
    built(g, 'c', 'chicken_coop');
    g.stock.feed = 200; g.stock.chicks = 1;
    run(g, 5);
    const h0 = g.livestock!.hens.n;
    run(g, 160);
    expect(g.livestock!.hens.n).toBeGreaterThan(h0);
    expect(g.livestock!.hens.roosters).toBe(1);
  });
});

describe('predators and sickness', () => {
  /** A year of raids on a coop of hens: unprotected, then proofed with a dog (summed over seeds). */
  const lost = (proof: boolean, dog: boolean) => {
    let n = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = farm(1, seed);
      built(g, 'c', 'chicken_coop');
      g.stock.feed = 500; g.stock.dog = dog ? 1 : 0; g.stock.hardware_cloth = proof ? 1 : 0;
      for (let d = 0; d < 365; d++) { g.clock.t = d; livestockDay(g, true); }
      n += g.livestock!.lost.predators;
    }
    return n / 12;
  };
  it('an unproofed coop loses hens to foxes, raccoons and hawks; proofing and a dog all but stop it', () => {
    const open = lost(false, false), safe = lost(true, true);
    expect(open).toBeGreaterThan(1.5);
    expect(open).toBeLessThan(10);
    expect(safe).toBeLessThan(open * 0.25);
  });

  it('the vet kit saves most sick animals', () => {
    let withKit = 0, without = 0;
    for (let seed = 1; seed <= 300; seed++) {
      for (const kit of [true, false]) {
        const g = farm(150, seed);
        alone(g);
        g.stock.goat = 1; g.stock.vet_kit = kit ? 1 : 0;
        const l = ensureLivestock(g);
        l.sick.push({ a: 'goat', what: 'pneumonia', day: 0, n: 1 });
        g.clock.t = 8;
        healthDay(g, l, mulberry32(seed));
        if (g.stock.goat === 1) { if (kit) withKit++; else without++; }
      }
    }
    expect(withKit / 300).toBeGreaterThan(0.75);
    expect(without / 300).toBeLessThan(0.65);
  });
});
