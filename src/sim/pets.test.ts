import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, type GameState } from './state';
import { migrate } from './save/migrations';
import { addFood } from './pantry';
import { gearPosture } from './gear';
import { dogEffects } from './../sim/pets';
import {
  adoptDog, findHomes, hasBed, assignCare, bondOf, careHours, careNow, dogCount, dogsInBattle, dogWatch, killDog, makeDog, petsDay, rehomeDog, setCaretaker, setGuard, stageOf, ageYears,
} from './pets';

/** A game with the stores shut (so the dogs eat from the family's own food), after `days` days. */
function shut(seed = 3): GameState {
  const g = newGame(seed);
  g.disaster.tracks.stores = 0;
  return g;
}
const run = (g: GameState, days: number, fn?: () => void) => { for (let i = 0; i < days; i++) { g.clock.t += 1; petsDay(g); fn?.(); } };

describe('dogs as named pets', () => {
  it('an old save with a bare count of guard dogs becomes named adult dogs', () => {
    const g = newGame(5);
    const raw = JSON.parse(JSON.stringify(g)) as Record<string, unknown>;
    delete raw.dogs; delete raw.petLife;
    raw.version = 42;
    (raw.stock as Record<string, number>).dog = 2;
    delete (raw.stock as Record<string, number>).kibble;
    const up = migrate(raw);
    expect(up.version).toBe(SAVE_VERSION);
    expect(up.dogs).toHaveLength(2);
    expect(up.dogs.every(d => d.name.length > 1 && d.died == null && !d.guard)).toBe(true);
    expect(new Set(up.dogs.map(d => d.name)).size).toBe(2);
    expect(up.stock.dog).toBe(0);
    expect(up.stock.kibble).toBe(0);
    expect(dogCount(up)).toBe(2);
    expect(stageOf(up.dogs[0], Math.floor(up.clock.t))).toBe('adult');
  });

  it('feeding takes real food from the pantry; starving lowers health and, in the end, kills (with grief)', () => {
    const g = shut();
    const d = adoptDog(g, { ageYears: 3 });
    addFood(g, 'rice_bag', 2);
    const before = g.stock.staples;
    run(g, 1);
    expect(g.stock.staples).toBeLessThan(before);
    expect(d.hunger).toBeLessThan(20);
    // no food at all
    const h = shut(4);
    const x = adoptDog(h, { ageYears: 3 });
    for (const k of ['staples', 'canned', 'frozen'] as const) h.stock[k] = 0;
    h.personState.forEach(p => { p.needs.hunger = 9000; });   // nothing to spare for scraps either
    let hp = x.health;
    run(h, 8);
    expect(x.hunger).toBeGreaterThan(90);
    expect(x.health).toBeLessThan(hp);
    hp = x.health;
    run(h, 40);
    expect(x.died).not.toBeNull();
    expect(x.cause).toBe('starved');
    expect(Object.values(h.petLife!.grief).every(v => v > 0)).toBe(true);
    expect(h.petLife!.lost[0].name).toBe(x.name);
  });

  it('kibble is eaten first, and the grocery run covers a dog while the stores are open', () => {
    const g = shut(); const d = adoptDog(g, { ageYears: 3 }); g.stock.kibble = 2; addFood(g, 'rice_bag', 1);
    const rice = g.stock.staples;
    run(g, 5);
    expect(g.stock.kibble).toBeLessThan(2);
    expect(g.stock.staples).toBeCloseTo(rice, 5);
    expect(d.hunger).toBeLessThan(10);
    const o = newGame(3); const e = adoptDog(o, { ageYears: 3 });
    run(o, 5);
    expect(e.hunger).toBeLessThan(10);
  });

  it('neglect (nobody assigned, automatic care off) lowers bond and mood versus a cared-for dog', () => {
    const cared = shut(), lone = shut();
    const a = adoptDog(cared, { ageYears: 3, name: 'Cared' }), b = adoptDog(lone, { ageYears: 3, name: 'Lone' });
    for (const g of [cared, lone]) { addFood(g, 'rice_bag', 4); g.stock.kibble = 4; }
    lone.petLife!.auto = false;
    run(cared, 30); run(lone, 30);
    expect(bondOf(a).v).toBeGreaterThan(bondOf(b).v + 5);
    expect(a.mood).toBeGreaterThan(b.mood + 20);
    expect(b.hunger).toBeGreaterThan(a.hunger);
  });

  it('care is spread over the residents, and a named caretaker does all of the dog\'s chores', () => {
    const g = shut();
    const ds = [adoptDog(g, { ageYears: 3 }), adoptDog(g, { ageYears: 2 }), adoptDog(g, { puppy: true })];
    const plan = assignCare(g);
    expect(plan.tasks.filter(t => t.duty !== 'train').every(t => t.who)).toBe(true);   // (the last chore, training, is what a busy house drops first)
    expect(Object.keys(plan.hoursBy).length).toBeGreaterThanOrEqual(2);
    for (const [id, h] of Object.entries(plan.hoursBy)) expect(h).toBeLessThanOrEqual(g.people.find(p => p.id === id)!.kid ? 0.81 : 1.51);
    expect(plan.hours).toBeCloseTo(careHours(g) - plan.tasks.filter(t => !t.who).reduce((a, t) => a + t.hours, 0), 5);
    // a named caretaker
    const adult = g.people.find(p => !p.kid)!;
    setCaretaker(g, ds[1].id, adult.id);
    const mine = assignCare(g).tasks.filter(t => t.dog === ds[1].id);
    expect(mine.length).toBeGreaterThan(3);
    expect(mine.every(t => t.who === adult.id && t.by === 'caretaker')).toBe(true);
    // with more dogs than there are hours, the last chores (training) go undone
    for (let k = 0; k < 4; k++) adoptDog(g, { ageYears: 3 });
    const crowded = assignCare(g);
    expect(crowded.tasks.some(t => !t.who && t.duty === 'train')).toBe(true);
    expect(crowded.tasks.filter(t => t.duty === 'feed').every(t => t.who)).toBe(true);
    expect(careHours(g)).toBeGreaterThan(careHours(newGame(3)) + 1);
  });

  it('losing a dog is grief that scales with the bond and with kids in the house', () => {
    const g = newGame(7);
    const d = adoptDog(g, { ageYears: 4 });
    const kid = g.people.find(p => p.kid)!, adults = g.people.filter(p => !p.kid);
    d.bonds[kid.id] = 80; d.bonds[adults[0].id] = 80; d.bonds[adults[1].id] = 5;
    killDog(g, d, 'was killed in the fight');
    const gr = g.petLife!.grief;
    expect(gr[kid.id]).toBeGreaterThan(gr[adults[0].id]);       // a child grieves harder
    expect(gr[adults[0].id]).toBeGreaterThan(gr[adults[1].id]); // the one it loved most
    // the same loss without children in the house is lighter for the adults
    const h = newGame(7);
    const e = adoptDog(h, { ageYears: 4 });
    e.bonds[h.people.find(p => !p.kid)!.id] = 80;
    h.personState.forEach((p, i) => { if (h.people[i].kid) p.needs.died = 1; });
    killDog(h, e, 'was killed in the fight');
    expect(h.petLife!.grief[adults[0].id]).toBeLessThan(gr[adults[0].id]);
    // grief is morale, and fades
    expect(dogEffects(g, kid.id).morale).toBeLessThan(-5);
    expect(dogEffects(g, kid.id).stress).toBeGreaterThan(0);
    run(g, 200);
    expect(dogEffects(g, kid.id).morale).toBeGreaterThan(-3);
    // giving a dog away is a loss too
    const k = newGame(8); const f = adoptDog(k); expect(rehomeDog(k, f.id)).toBeNull();
    expect(Object.keys(k.petLife!.grief).length).toBeGreaterThan(0);
    expect(dogCount(k)).toBe(0);
  });

  it('a cared-for dog lifts morale and eases stress; a hungry one weighs', () => {
    const g = newGame(9);
    const p = g.people[0];
    const none = dogEffects(g, p.id);
    expect(none).toEqual({ morale: 0, stress: 0 });
    const d = adoptDog(g, { ageYears: 3 }); d.bonds[p.id] = 70;
    const happy = dogEffects(g, p.id);
    expect(happy.morale).toBeGreaterThan(3);
    expect(happy.stress).toBeLessThan(-2);
    const kid = g.people.find(x => x.kid)!;
    d.bonds[kid.id] = 70;
    expect(dogEffects(g, kid.id).morale).toBeGreaterThan(happy.morale - 1);
    d.hunger = 90;
    expect(dogEffects(g, p.id).morale).toBeLessThan(0);
  });

  it('the dogs still warn and deter: 12 detection and 6 deter each, two at most; a dog kept inside warns but does not stand a post', () => {
    const g = newGame(2);
    adoptDog(g, { ageYears: 3, training: 0, guard: true });
    expect(gearPosture(g, 2).detection).toBe(12);
    expect(gearPosture(g, 2).deter).toBe(6);
    adoptDog(g, { ageYears: 3, training: 0, guard: true }); adoptDog(g, { ageYears: 3, training: 0, guard: true });
    expect(gearPosture(g, 2).detection).toBe(24);
    expect(gearPosture(g, 2).deter).toBe(12);
    for (const d of g.dogs) setGuard(g, d.id, false);
    expect(dogWatch(g)).toMatchObject({ detection: 24, deter: 0, onPost: 0, inside: 2 });
    // training makes a better guard
    g.dogs[0].training = 100; setGuard(g, g.dogs[0].id, true);
    expect(dogWatch(g).detection).toBeGreaterThan(24);
    // a puppy is no guard
    const p = newGame(2); adoptDog(p, { puppy: true });
    expect(gearPosture(p, 2).detection).toBe(0);
  });

  it('on the post a dog can be hurt or killed in a fight, savage crews shoot them first; never when it is inside', () => {
    const fight = (savage: boolean, guard: boolean, seed: number) => {
      const g = newGame(seed); g.clock.t = 100;
      for (let i = 0; i < 6; i++) adoptDog(g, { ageYears: 3, guard });
      const lines = dogsInBattle(g, { homeWounds: 3, homeDeaths: 1, result: 'repelled', savage });
      return { g, lines };
    };
    let rough = 0, savageDead = 0;
    for (let s = 1; s <= 12; s++) { rough += fight(false, true, s).g.dogs.filter(d => d.died != null).length; savageDead += fight(true, true, s).g.dogs.filter(d => d.died != null).length; }
    expect(savageDead).toBeGreaterThan(rough);
    expect(savageDead).toBeGreaterThan(4);
    for (let s = 1; s <= 12; s++) expect(fight(true, false, s).g.dogs.every(d => d.died == null)).toBe(true);
    // deterministic
    expect(fight(true, true, 5).lines).toEqual(fight(true, true, 5).lines);
    // a quiet fight leaves them alone
    const q = newGame(1); adoptDog(q, { ageYears: 3 });
    expect(dogsInBattle(q, { homeWounds: 0, homeDeaths: 0, result: 'repelled', savage: false }).length).toBeLessThanOrEqual(1);
    // a dead dog is grief
    const k = fight(true, true, 1).g;
    if (k.dogs.some(d => d.died != null)) expect(Object.keys(k.petLife!.grief).length).toBeGreaterThan(0);
  });

  it('dogs age, grow and have puppies, deterministically', () => {
    const make = () => {
      const g = shut(11);
      g.stock.kibble = 400;
      const f = adoptDog(g, { ageYears: 2, sex: 'f', name: 'Mama' }), m = adoptDog(g, { ageYears: 2, sex: 'm', name: 'Papa' });
      f.heat = 5; return { g, f, m };
    };
    const a = make(), b = make();
    run(a.g, 160); run(b.g, 160);
    expect(JSON.stringify(a.g.dogs)).toBe(JSON.stringify(b.g.dogs));
    const pups = a.g.dogs.filter(d => ageYears(d, Math.floor(a.g.clock.t)) < 0.5);
    expect(pups.length).toBeGreaterThanOrEqual(1);
    expect(pups.every(p => p.guard === false)).toBe(true);
    expect(stageOf(pups[0], Math.floor(a.g.clock.t))).toBe('puppy');
    // fixed dogs do not
    const c = shut(11); c.stock.kibble = 400;
    const f = adoptDog(c, { ageYears: 2, sex: 'f' }); adoptDog(c, { ageYears: 2, sex: 'm' }); f.heat = 5; f.fixed = true;
    run(c, 160);
    expect(c.dogs).toHaveLength(2);
    // a puppy grows up
    const p = makeDog(a.g, { puppy: true });
    expect(stageOf(p, Math.floor(a.g.clock.t) + 400)).toBe('young');
  });

  it('a dog dies of old age eventually, and buttons work', () => {
    const g = shut(12); g.stock.kibble = 400;
    const d = adoptDog(g, { ageYears: 13.5 });
    run(g, 700);
    expect(d.died).not.toBeNull();
    const h = shut(13); h.stock.kibble = 10;
    const e = adoptDog(h, { ageYears: 3 }); e.mood = 40;
    expect(careNow(h, e.id, 'play')).toBeNull();
    expect(e.play).toBeGreaterThan(50);
    expect(careNow(h, e.id, 'feed')).toBeNull();
    expect(careNow(h, e.id, 'feed')).toMatch(/already/);
  });

  it('every adopted dog starts inside: the player posts it', () => {
    const g = newGame(2); const d = adoptDog(g); const p = adoptDog(g, { puppy: true });
    expect(d.guard).toBe(false); expect(p.guard).toBe(false);
    expect(dogWatch(g)).toMatchObject({ onPost: 0, deter: 0 });
  });

  it('a puppy can be given to the neighbors: goodwill, and still some grief; older dogs cannot', () => {
    const g = newGame(4); g.clock.t = 400;
    const pup = adoptDog(g, { puppy: true }), old = adoptDog(g, { ageYears: 3 });
    pup.bonds[g.people[2].id] = 80;
    const before = g.neighbors.reduce((a, n) => a + n.disposition, 0);
    expect(findHomes(g, old.id)).toMatch(/too old/);
    expect(findHomes(g, pup.id)).toBeNull();
    expect(pup.died).not.toBeNull();
    expect(g.neighbors.reduce((a, n) => a + n.disposition, 0)).toBeGreaterThan(before);
    expect(g.petLife!.grief[g.people[2].id]).toBeGreaterThan(g.petLife!.grief[g.people[0].id]);
  });

  it('a dog without a bed is a little less happy; a blanket counts', () => {
    const run2 = (beds: number) => { const g = shut(6); g.stock.kibble = 50; g.stock.dogbed = beds; const d = adoptDog(g, { ageYears: 3 }); run(g, 20); return { g, d }; };
    const a = run2(0), b = run2(1);
    expect(hasBed(a.g, a.d)).toBe(false); expect(hasBed(b.g, b.d)).toBe(true);
    expect(b.d.mood).toBeGreaterThan(a.d.mood + 2);
  });
});
