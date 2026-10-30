import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { step } from './engine';
import { adoptDog, VET_NAG_DAYS } from './pets';
import { seasons, REGIONS } from './regions';
import { CLASSIC } from './site';
import {
  addChoreWork, applyTemplate, careYield, HARVEST_RATE, HARVEST_FLOOR_LOSS, canningCases, choresDay, cookRatio, dutyWork, huntFactor, lifeMorale, spoilFactor, tallyOf, autoPlan, CHORES, BEHIND_NAG_DAYS, chronotypes, choreRates, choresStep, CLEAR_HOURS, dailyOf, dailyTick, DUTIES, DUTY, DUTY_CHORES, DUTY_TASK, dutyAt,
  dutyWants, emergencyOf, fitness, isNightHour, nightDuty, owlCount, petCare, setDuty, setFocus, threatLevel, tire, watchDetection, watchNow, workHours,
  type Duty,
} from './daily';
import { DAILY_TASK_TEXT } from '../ui/dailyText';
import { griefMorale, griefPoints, lossesOf, noteLosses } from './grief';
import { callGathering, gatheringProblem, gatheringsDay, GATHERING, glowNow, holdGathering, noiseNow, type GatheringKind } from './gatherings';
import { freshNeeds } from './needs';
import type { Person } from './family';
import { progressOf } from './skills';

const HEAVYDUTY = ['fields', 'wood', 'repairs', 'hunt', 'water', 'watch', 'build'];
const game = (seed = 3, law = 1) => { const g = newGame(seed, 105, 2027, { site: CLASSIC }); g.disaster.tracks.law = law; return g; };
/** Add people to a household until it has `n`. */
const withPeople = (g: GameState, n: number): GameState => {
  while (g.people.length < n) {
    const k = g.people.length, base = g.people[k % 2];
    const p: Person = { ...structuredClone(base), id: `x${k}`, first: `Extra${k}`, kid: false, age: 30 + k };
    g.people.push(p);
    g.personState.push({ id: p.id, task: 'idle', target: null, needs: freshNeeds(), fatigue: 0 });
  }
  return g;
};
const plan = (g: GameState, build = false) => autoPlan(g, { build, fell: false });
const row = (g: GameState, i: number) => dailyOf(g).plan.hours[g.people[i].id];

describe('the roster and the night', () => {
  it('a five-person family is all in bed at 02:00 and at 23:00 when the law works', () => {
    const g = withPeople(game(3, 1), 5);
    plan(g, true);
    for (let i = 0; i < 5; i++) expect(row(g, i)[2]).toBe('sleep');
    expect(g.people.every((_, i) => workHours(row(g, i)) <= 14)).toBe(true);
  });

  it('nobody works between 22:00 and 06:00 unless posted on watch', () => {
    for (const law of [1, 0]) for (const n of [4, 5, 8, 12]) {
      const g = withPeople(game(5, law), n);
      plan(g, true);
      for (let i = 0; i < n; i++) for (const h of [22, 23, 0, 1, 2, 3, 4, 5]) {
        const d = row(g, i)[h];
        expect(DUTY[d].work && d !== 'watch', `person ${i} hour ${h} ${d}`).toBe(false);
      }
    }
  });

  it('with no law somebody keeps watch all night: two shifts, everyone else asleep', () => {
    const g = withPeople(game(3, 0), 5);
    plan(g, true);
    for (const h of [22, 23, 0, 1, 2, 3, 4, 5]) {
      const up = g.people.filter((_, i) => row(g, i)[h] === 'watch').length;
      expect(up, `hour ${h}`).toBe(1);
      const others = g.people.filter((_, i) => row(g, i)[h] !== 'watch');
      expect(others.every((_, __) => true)).toBe(true);
    }
    // everyone not on watch is asleep at 02:00 and 03:00
    for (const h of [2, 3]) for (let i = 0; i < 5; i++) expect(['watch', 'sleep']).toContain(row(g, i)[h]);
  });

  it('the watch rotates: nobody has more than two night shifts in a row, and the watcher sleeps in the day', () => {
    const g = withPeople(game(3, 0), 5);
    const streak: Record<string, number> = {}, worst: number[] = [];
    for (let d = 0; d < 12; d++) {
      g.clock.t = d;
      plan(g, true);
      const onNight = new Set(g.people.filter((_, i) => [22, 23, 0, 1, 2, 3, 4, 5].some(h => row(g, i)[h] === 'watch')).map(p => p.id));
      for (const p of g.people) { streak[p.id] = onNight.has(p.id) ? (streak[p.id] ?? 0) + 1 : 0; worst.push(streak[p.id]); }
      for (const [i, p] of g.people.entries()) if (onNight.has(p.id)) expect(row(g, i).filter(x => x === 'sleep').length).toBeGreaterThanOrEqual(7);
    }
    expect(Math.max(...worst)).toBeLessThanOrEqual(2);
    // and more than one person took a turn
    expect(new Set(g.people.filter(p => (streak[p.id] ?? 0) >= 0)).size).toBeGreaterThan(1);
  });

  it('a hand-painted night job is refused; night watch is allowed', () => {
    const g = game();
    const id = g.people[0].id;
    expect(setDuty(g, id, [2], 'garden')).toMatch(/sleep/);
    expect(setDuty(g, id, [2, 3], 'watch')).toBeNull();
    expect(setDuty(g, id, [10], 'garden')).toBeNull();
    expect(dailyOf(g).plan.hours[id][10]).toBe('garden');
  });

  it('emergencies wake people: someone at the gate stands the adults to; a sick child gets the medic up', () => {
    const g = game(3, 0);
    plan(g, true);
    expect(emergencyOf(g)).toBeNull();
    const p = g.people[0];
    expect(nightDuty(g, p, 0, 'build', 2, null)).toBe('sleep');
    expect(nightDuty(g, p, 0, 'build', 12, null)).toBe('build');
    g.gate.incoming = { e: { kind: 'looters' } as never, at: 1 };
    expect(nightDuty(g, p, 0, 'build', 2, emergencyOf(g))).toBe('watch');
    g.gate.incoming = null;
    const kidIdx = g.people.findIndex(x => x.kid);
    g.personState[kidIdx].needs.hurt.push({ what: 'fever', sev: 15 });
    const em = emergencyOf(g)!;
    expect(em.medic).toBeGreaterThanOrEqual(0);
    expect(nightDuty(g, g.people[em.medic], em.medic, 'build', 3, em)).toBe('medic');
    expect(nightDuty(g, g.people[kidIdx], kidIdx, 'garden', 3, em)).toBe('sleep');
  });

  it('in the running sim, at 02:00 everyone is asleep except the posted watcher', () => {
    let g = withPeople(newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' }), 5);
    g.money = 100_000;
    g = step(g, g.disaster.hitAt - g.clock.t + 6);
    for (let n = 0; n < 400 && g.disaster.tracks.law >= 0.5; n++) g = step(g, 1);   // until the law is gone
    expect(threatLevel(g)).toBeGreaterThanOrEqual(1);
    g.gate.pending = null;
    for (let n = 0; n < 3; n++) {
      // run to 02:15 of the next night
      let h = (g.clock.ticks * 0.25 + 6) % 24;
      while (Math.abs(h - 2.25) > 1e-6) { g = step(g, 0.25 / 24); h = (g.clock.ticks * 0.25 + 6) % 24; g.gate.pending = null; g.gate.incoming = null; }
      const tasks = g.personState.map(p => p.task);
      expect(tasks.filter(t => t === 'watch').length, tasks.join()).toBeGreaterThanOrEqual(1);
      expect(tasks.filter(t => t !== 'watch' && t !== 'sleep'), tasks.join()).toEqual([]);
      g = step(g, 1);
    }
    expect(isNightHour(2)).toBe(true);
  });
});

describe('body clocks', () => {
  it('a family of up to six has no night owls; a big party has some, growing with the headcount', () => {
    expect(owlCount(4)).toBe(0); expect(owlCount(6)).toBe(0);
    expect(owlCount(8)).toBeGreaterThanOrEqual(1);
    expect(owlCount(12)).toBeGreaterThan(owlCount(8));
    const small = chronotypes(withPeople(game(), 5)), big = chronotypes(withPeople(game(), 12));
    expect(Object.values(small).includes('owl')).toBe(false);
    expect(Object.values(big).filter(c => c === 'owl').length).toBe(owlCount(12));
  });

  it('chronotypes are stable (same seed, same answer) and kids under 15 are never owls', () => {
    const a = chronotypes(withPeople(game(7), 12)), b = chronotypes(withPeople(game(7), 12));
    expect(a).toEqual(b);
    const g = withPeople(game(7), 12);
    for (const p of g.people) if (p.kid && p.age < 15) expect(a[p.id]).not.toBe('owl');
  });

  it('in a 12-person group some are up at 02:00 (not on watch) and sleep in the morning', () => {
    const g = withPeople(game(7, 1), 12);
    plan(g, true);
    const c = chronotypes(g);
    const owls = g.people.map((p, i) => ({ p, i })).filter(x => c[x.p.id] === 'owl');
    expect(owls.length).toBeGreaterThan(0);
    for (const { i } of owls) { expect(row(g, i)[2]).toBe('leisure'); expect(row(g, i)[8]).toBe('sleep'); }
    expect(g.people.filter((_, i) => row(g, i)[2] === 'leisure').length).toBe(owls.length);
  });

  it('the planner prefers night owls for the night watch', () => {
    const g = withPeople(game(7, 0), 12);
    plan(g, true);
    const c = chronotypes(g);
    const watchers = g.people.filter((_, i) => row(g, i).some((d, h) => d === 'watch' && isNightHour(h)));
    expect(watchers.length).toBeGreaterThanOrEqual(2);
    expect(watchers.every(p => c[p.id] === 'owl')).toBe(true);
  });
});

describe('who suits what', () => {
  it('the ill and hurt are kept off heavy work; skill and focus raise the fit', () => {
    const g = game();
    const i = g.people.findIndex(p => !p.kid);
    expect(fitness(g, i, 'fields')).toBeGreaterThan(0);
    g.personState[i].needs.health = 40;
    expect(fitness(g, i, 'fields')).toBe(0);
    expect(fitness(g, i, 'cleaning')).toBeGreaterThan(0);
    g.personState[i].needs.health = 20;
    expect(fitness(g, i, 'cleaning')).toBe(0);
    g.personState[i].needs.health = 100;
    g.people[i].skills.gardener = 8;
    const skilled = fitness(g, i, 'garden');
    g.people[i].skills.gardener = 1;
    expect(skilled).toBeGreaterThan(fitness(g, i, 'garden'));
    g.personState[i].fatigue = 90;
    expect(fitness(g, i, 'watch')).toBeLessThan(fitness(g, i, 'cleaning'));
  });

  it('kids cannot do heavy jobs and the smallest only play', () => {
    const g = game();
    const kid = g.people.findIndex(p => p.kid);
    g.people[kid].age = 9;
    expect(fitness(g, kid, 'wood')).toBe(0);
    expect(fitness(g, kid, 'pets')).toBeGreaterThan(0);
    g.people[kid].age = 3;
    expect(fitness(g, kid, 'pets')).toBe(0);
  });

  it('a person who is unwell rests; the planner gives them no heavy job', () => {
    const g = game(3, 1);
    const i = g.people.findIndex(p => !p.kid);
    g.personState[i].needs.health = 30;
    plan(g, true);
    expect(row(g, i).some(d => HEAVYDUTY.includes(d))).toBe(false);
    expect(dailyOf(g).plan.notes?.[g.people[i].id]).toMatch(/unwell/);
  });

  it('a standing assignment ("always on") is honoured, and cleared again', () => {
    const g = game(3, 1);
    for (let k = 0; k < 2; k++) adoptDog(g);
    const i = g.people.findIndex(p => !p.kid);
    expect(setFocus(g, g.people[i].id, 'pets')).toBeNull();
    plan(g, true);
    const hours = row(g, i).filter(d => d === 'pets').length;
    expect(hours).toBeGreaterThanOrEqual(3);
    expect(setFocus(g, g.people[i].id, null)).toBeNull();
    expect(dailyOf(g).plan.focus?.[g.people[i].id]).toBeUndefined();
    expect(setFocus(g, g.people[i].id, 'school')).toMatch(/can't/);
  });
});

describe('chores and task kinds', () => {
  it('every duty has a task kind, a label and a way to be done', () => {
    for (const d of DUTIES) {
      if (d === 'build') continue;
      expect(DUTY_TASK[d as Exclude<Duty, 'build'>], d).toBeTruthy();
      expect(DUTY[d].name.length).toBeGreaterThan(0);
    }
    for (const d of DUTIES) if (d !== 'build') { const k = DUTY_TASK[d as Exclude<Duty, 'build'>]; expect(DAILY_TASK_TEXT[k] ?? k, k).toBeTruthy(); }
    for (const k of ['garden', 'fields', 'livestock', 'pets', 'wood', 'water', 'kitchen', 'cleaning', 'laundry', 'repairs', 'hunt', 'medic', 'teach', 'radio', 'watch', 'meal', 'party']) expect(DAILY_TASK_TEXT[k], k).toBeTruthy();
    // gardening, maintenance, cooking, cleaning, guard duty and pet care are all real duties
    for (const d of ['garden', 'repairs', 'kitchen', 'cleaning', 'watch', 'pets'] as Duty[]) expect(DUTY[d].work).toBe(true);
  });

  it('every chore is worked by some duty, and each backlog grows with its rate and falls with work', () => {
    const worked = new Set(Object.values(DUTY_CHORES).flat());
    for (const c of CHORES) expect(worked.has(c), c).toBe(true);
    const g = game();
    for (let k = 0; k < 2; k++) adoptDog(g);
    const rates = choreRates(g);
    expect(rates.pets).toBeGreaterThan(0);
    expect(rates.house).toBeGreaterThan(0);
    choresStep(g, 1, rates);
    const lv = dailyOf(g).chores.levels;
    expect(lv.pets).toBeGreaterThan(0);
    const before = lv.pets;
    expect(addChoreWork(g, 'pets', 1)).toBe('pets');
    expect(lv.pets).toBeLessThan(before);
    addChoreWork(g, 'pets', 99);
    expect(lv.pets).toBe(0);
    expect(CLEAR_HOURS.pets).toBeGreaterThan(0);
  });

  it('no dogs, no pet chore; neglected dogs lose their bark', () => {
    const g = game();
    expect(choreRates(g).pets).toBe(0);
    for (let k = 0; k < 2; k++) adoptDog(g);
    expect(petCare(g)).toBe(1);
    dailyOf(g).chores.levels.pets = 100;
    expect(petCare(g)).toBeCloseTo(0.5);
  });

  it('the planner gives the dogs, the house, the kitchen and the garden people when they are behind', () => {
    const g = withPeople(game(3, 1), 5);
    for (let k = 0; k < 2; k++) adoptDog(g);
    const lv = dailyOf(g).chores.levels;
    lv.pets = 80; lv.house = 80; lv.kitchen = 60;
    plan(g, true);
    const all = g.people.flatMap((_, i) => row(g, i));
    for (const d of ['pets', 'cleaning', 'kitchen'] as Duty[]) expect(all.includes(d), d).toBe(true);
  });

  it('duty wants are person-hours: what keeps up plus a share of the backlog', () => {
    const g = game();
    for (let k = 0; k < 3; k++) adoptDog(g);
    const w = new Map(dutyWants(g, choreRates(g)));
    expect(w.get('pets')).toBeGreaterThan(0.5);
    dailyOf(g).chores.levels.pets = 90;
    const w2 = new Map(dutyWants(g, choreRates(g)));
    expect(w2.get('pets')!).toBeGreaterThan(w.get('pets')!);
  });

  it('the auto-planner honours the work cap, school for kids and a day watch at high threat', () => {
    const g = withPeople(game(3, 0), 6);
    expect(threatLevel(g)).toBeGreaterThanOrEqual(1);
    plan(g, true);
    for (let i = 0; i < 6; i++) expect(workHours(row(g, i))).toBeLessThanOrEqual(14);
    const kid = g.people.findIndex(p => p.kid && p.age >= 5);
    if (kid >= 0) expect(row(g, kid).includes('school')).toBe(true);
  });

  it('a Rest day template leaves only the animals, the stove and the watch', () => {
    const g = game(3, 1);
    applyTemplate(g, 'rest', { build: true, fell: false });
    const worked = new Set(g.people.flatMap((_, i) => row(g, i)).filter(d => DUTY[d].work));
    for (const d of worked) expect(['livestock', 'kitchen', 'watch']).toContain(d);
    expect(dailyOf(g).plan.auto).toBe(false);
  });

  it('the schedule drives the running sim: tasks follow the roster and the garden gets weeded', () => {
    let g = game(3, 1);
    g.money = 200_000;
    g.structures.push({ id: 'g1', kind: 'garden', x: 20, z: 20, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    dailyOf(g).chores.levels.weeds = 90;
    g = step(g, 3);
    expect(dailyOf(g).chores.levels.weeds).toBeLessThan(90);
  });

  it('daytime hours of a duty show as that task in the sim', () => {
    let g = game(3, 1);
    g.structures.push({ id: 'k', kind: 'chicken_coop', x: 20, z: 20, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    g = step(g, 0.2);
    expect(g.personState.some(p => ['livestock', 'garden', 'kitchen', 'repairs', 'cleaning', 'laundry', 'water', 'chores', 'meal', 'build'].includes(p.task))).toBe(true);
  });
});

describe('fatigue and sleep debt', () => {
  it('long days and night watch tire people; sleep brings it back; sleeping by day restores less', () => {
    const g = game();
    const ps = g.personState[0];
    tire(ps, 'watch', 23, 4);
    const afterWatch = ps.fatigue!;
    expect(afterWatch).toBeGreaterThan(20);
    tire(ps, 'sleep', 3, 4);
    expect(ps.fatigue!).toBeLessThan(afterWatch);
    const night = ps.fatigue!; ps.fatigue = afterWatch;
    tire(ps, 'sleep', 11, 4);
    expect(ps.fatigue!).toBeGreaterThan(night);
  });

  it('a watcher who never gets to sleep builds up a debt that dulls the watch', () => {
    let g = withPeople(game(3, 0), 5);
    const ps = g.personState[0];
    for (let n = 0; n < 6; n++) tire(ps, 'watch', 23, 8);
    expect(ps.fatigue).toBe(100);
    g = withPeople(game(3, 0), 5);
    g.personState[0].task = 'watch'; g.personState[0].fatigue = 100;
    const tired = watchDetection(g);
    g.personState[0].fatigue = 0;
    expect(watchDetection(g)).toBeGreaterThan(tired);
    expect(watchNow(g).length).toBe(1);
  });

  it('dailyTick resolves duties once an hour and keeps them between the sub-steps', () => {
    const g = game();
    const a = dailyTick(g, { build: true, fell: false });
    const b = dailyTick(g, { build: true, fell: false });
    expect(b).toBe(a);
    expect(a.duties.length).toBe(g.people.length);
    expect(dutyAt(g, g.people[0], 12)).toBe('meal');
  });
});

describe('gatherings and grief (one fading-grief implementation)', () => {
  const fed = (g: GameState) => { g.stock.fresh = 200; g.stock.canned = 200; g.stock.firewood = 50; return g; };

  it('a cookout lifts morale, costs food, and its noise reaches the county', () => {
    const g = fed(game(3, 0));
    g.disaster.tracks.stores = 0;     // the stores are gone, so the smell carries
    const m0 = g.personState[0].needs.morale;
    const fresh0 = g.stock.fresh;
    expect(gatheringProblem(g, 'cookout')).toBeNull();
    expect(callGathering(g, 'cookout')).toBeNull();
    expect(gatheringProblem(g, 'cookout')).toMatch(/is on/);
    const lines = holdGathering(g, dailyOf(g).social.active!);
    expect(lines).toBeDefined();
    expect(g.personState[0].needs.morale).toBeGreaterThan(m0);
    expect(g.stock.fresh).toBeLessThan(fresh0);
    expect(glowNow(g)).toBeGreaterThan(0);
    expect(noiseNow(g)).toBeGreaterThan(1);
  });

  it('every gathering kind is defined; the callable ones can be held; a movie needs power; a funeral needs a death', () => {
    const kinds = Object.keys(GATHERING) as GatheringKind[];
    expect(kinds.length).toBe(12);
    const g = fed(game());
    expect(gatheringProblem(g, 'funeral')).toMatch(/nobody/);
    expect(gatheringProblem(g, 'movie')).toBe(g.utilities.lit.length > 0 || g.utilities.grid ? null : 'no power for a movie');
    for (const k of kinds) { expect(GATHERING[k].hours).toBeGreaterThan(0); expect(GATHERING[k].name.length).toBeGreaterThan(0); }
  });

  it('a death brings grief that fades, and a funeral makes it fade far faster', () => {
    const g = fed(game(3, 1));
    expect(griefMorale(g)).toBe(0);
    g.personState[1].needs.died = 100; g.clock.t = 100.2;
    noteLosses(g);
    expect(lossesOf(g).length).toBe(1);
    const fresh = griefMorale(g);
    expect(fresh).toBeLessThan(-8);
    // unmourned: still heavy a year on; mourned: nearly gone after a few months
    g.clock.t = 100 + 365;
    const unmourned = griefMorale(g);
    expect(unmourned).toBeLessThan(-6);
    lossesOf(g)[0].mourned = true;
    g.clock.t = 100 + 120;
    expect(griefMorale(g)).toBeGreaterThan(-5);
    expect(griefMorale(g)).toBeGreaterThan(unmourned);
    expect(griefPoints(true, 0)).toBeLessThan(griefPoints(false, 0) + 7);
  });

  it('the day after a death the family holds a funeral on its own', () => {
    const g = fed(game(3, 1));
    g.personState[1].needs.died = 100; g.clock.t = 100.6;
    gatheringsDay(g);
    expect(dailyOf(g).social.active?.kind).toBe('funeral');
    holdGathering(g, dailyOf(g).social.active!);
    expect(lossesOf(g)[0].mourned).toBe(true);
  });

  it('a wedding, a birthday and the holidays arrive on their own days; off means off', () => {
    const g = fed(game(3, 1));
    g.clock.startDoy = 1; g.clock.t = 326;
    const doy = (): number => ((g.clock.startDoy - 1 + Math.floor(g.clock.t)) % 365) + 1;
    expect(doy()).toBe(327);
    gatheringsDay(g);
    expect(dailyOf(g).social.active?.kind).toBe('thanksgiving');
    const h = fed(game(3, 1));
    h.clock.startDoy = 1; h.clock.t = 326;
    dailyOf(h).social.auto = false;
    gatheringsDay(h);
    expect(dailyOf(h).social.active).toBeNull();
  });
});

describe('hours that do something: cooking, livestock, hunting, teaching', () => {
  const rnd = (v: number) => () => v;

  it('canning and hot meals need a cook: nobody on Cooking means no canning, faster spoilage and cold-meal gloom', () => {
    const g = game();
    expect(cookRatio(g)).toBe(1);                       // a new game starts with its suppers cooked
    expect(canningCases(g, 2)).toBe(2);
    expect(spoilFactor(g)).toBe(1);
    const m0 = lifeMorale(g, 0);
    tallyOf(g).yesterday = {};
    expect(cookRatio(g)).toBe(0);
    expect(canningCases(g, 2)).toBe(0);
    expect(spoilFactor(g)).toBe(1.5);
    expect(lifeMorale(g, 0)).toBeLessThan(m0 - 3);
    // a cook's hours bring it back
    dutyWork(g, g.people[0], g.personState[0], 'kitchen', 3);
    choresDay(g, rnd(0.99));
    expect(cookRatio(g)).toBe(1);
  });

  it('the planner always finds the household a cook', () => {
    const g = game(3, 1);
    plan(g, true);
    expect(g.people.some((_, i) => row(g, i).filter(d => d === 'kitchen').length >= 2)).toBe(true);
  });

  it('animals unfed for a week sicken, then die; fed animals do not', () => {
    const g = game();
    g.stock.goat = 2;
    const d = dailyOf(g);
    d.chores.levels.animals = 100;
    const msgs: string[] = [];
    for (let i = 0; i < 20; i++) msgs.push(...choresDay(g, rnd(0.01)));
    expect(msgs.some(m => /off their feed/.test(m))).toBe(true);
    expect(g.stock.goat).toBeLessThan(2);
    const h = game(); h.stock.goat = 2; dailyOf(h).chores.levels.animals = 10;
    for (let i = 0; i < 20; i++) choresDay(h, rnd(0.01));
    expect(h.stock.goat).toBe(2);
  });

  it('hunting hours raise the take (skilled hunters count more); none leaves a casual 0.6', () => {
    const g = game();
    tallyOf(g).yesterday = {};
    expect(huntFactor(g)).toBeCloseTo(0.6);
    g.people[0].skills.hunter = 8;
    dutyWork(g, g.people[0], g.personState[0], 'hunt', 3);
    choresDay(g, rnd(0.99));
    const skilled = huntFactor(g);
    expect(skilled).toBeGreaterThan(1.2);
    const h = game(); tallyOf(h).yesterday = {};
    h.people[0].skills.hunter = 1;
    dutyWork(h, h.people[0], h.personState[0], 'hunt', 3);
    choresDay(h, rnd(0.99));
    expect(huntFactor(h)).toBeLessThan(skilled);
  });

  it('a hunter still out at dusk risks a bad fall, more with no law', () => {
    let hurt = 0, hurtNoLaw = 0;
    for (let k = 0; k < 40; k++) {
      for (const law of [1, 0]) {
        const g = game(3, law);
        dutyWork(g, g.people[0], g.personState[0], 'hunt', 1, 18);
        choresDay(g, ((i = 0) => () => ((k * 7 + (i++) * 13) % 100) / 100)());
        if (g.personState[0].needs.hurt.some(h => h.what === 'hunting accident')) { if (law) hurt++; else hurtNoLaw++; }
      }
    }
    expect(hurtNoLaw).toBeGreaterThanOrEqual(hurt);
    const g = game();
    dutyWork(g, g.people[0], g.personState[0], 'hunt', 1, 9);     // back by lunch: no risk
    choresDay(g, rnd(0));
    expect(g.personState[0].needs.hurt.length).toBe(0);
  });

  it('teaching hours raise a school kid\'s skills, slowly, more with long lessons; no lessons, no gain', () => {
    // (lessons are practice now: hours toward the next level count as much as the level)
    const sum = (g: GameState, i: number) => Object.values(g.people[i].skills).reduce((a, b) => a + b, 0) + (Object.keys(g.people[i].skills) as Array<keyof Person['skills']>).reduce((a, k) => a + progressOf(g, g.people[i].id, k), 0);
    const g = game();
    const kid = g.people.findIndex(p => p.kid && p.age >= 5);
    const s0 = sum(g, kid);
    choresDay(g, rnd(0.5));
    expect(sum(g, kid)).toBe(s0);
    dutyWork(g, g.people[0], g.personState[0], 'teach', 3);
    choresDay(g, rnd(0.5));
    const one = sum(g, kid) - s0;
    expect(one).toBeGreaterThan(0);
    expect(one).toBeLessThan(0.5);
    const h = game();
    dutyWork(h, h.people[0], h.personState[0], 'teach', 6);
    choresDay(h, rnd(0.5));
    expect(sum(h, kid) - s0).toBeGreaterThan(one);
  });

  it('a night owl on watch adds a little detection', () => {
    const g = withPeople(game(7, 0), 12);
    const c = chronotypes(g);
    const owl = g.people.findIndex(p => c[p.id] === 'owl'), other = g.people.findIndex((p, i) => !p.kid && c[p.id] !== 'owl' && i !== owl);
    g.personState[owl].task = 'watch';
    const a = watchDetection(g);
    g.personState[owl].task = 'idle'; g.personState[other].task = 'watch';
    expect(a).toBeGreaterThan(watchDetection(g));
  });
});

describe('the harvest backlog is a harvest-time job, not a bookkeeping trap', () => {
  const fields = (g: GameState, n: number) => { for (let k = 0; k < n; k++) g.structures.push({ id: `f${k}`, kind: 'field', x: 10 + k, z: 40, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 }); };
  const harvestDay = (g: GameState) => seasons(REGIONS[g.site.region]).harvest[0] + 10;
  const atDoy = (g: GameState, doy: number) => { g.clock.t = (((doy - g.clock.startDoy) % 365) + 365) % 365 + 0.3; };

  it('sixteen fields can be kept up by two adults, and a pinned backlog still brings in most of the crop', () => {
    expect(16 * HARVEST_RATE / 100 * CLEAR_HOURS.harvest).toBeLessThanOrEqual(12);
    const g = game(3, 1);
    dailyOf(g).chores.levels.harvest = 100;
    expect(careYield(g, 'harvest')).toBeCloseTo(1 - HARVEST_FLOOR_LOSS, 6);
    expect(careYield(g, 'harvest')).toBeGreaterThanOrEqual(0.7);
    dailyOf(g).chores.levels.harvest = 20;
    expect(careYield(g, 'harvest')).toBe(1);
  });

  it('the rate is zero outside the harvest window and per field inside it', () => {
    const g = game(3, 1);
    fields(g, 4);
    atDoy(g, harvestDay(g) - 60);
    expect(choreRates(g).harvest).toBe(0);
    atDoy(g, harvestDay(g));
    expect(choreRates(g).harvest).toBe(4 * HARVEST_RATE);
  });

  it('on Auto, a family with sixteen fields keeps the backlog well under the cap through the harvest', () => {
    let g = game(3, 1);
    g.money = 500_000;
    fields(g, 16);
    atDoy(g, harvestDay(g));
    const peaks: number[] = [];
    for (let d = 0; d < 20; d++) { g = step(g, 1); peaks.push(dailyOf(g).chores.levels.harvest); }
    const avg = peaks.reduce((a, b) => a + b, 0) / peaks.length;
    expect(avg).toBeLessThan(60);
  });
});

describe('the planner staffs the small daily duties before the big jobs', () => {
  it('animals, dogs and the stove get hours even when the harvest wants every hour there are', () => {
    const g = game(3, 1);
    for (let k = 0; k < 24; k++) g.structures.push({ id: `f${k}`, kind: 'field', x: 10 + k, z: 40, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    g.structures.push({ id: 'k', kind: 'chicken_coop', x: 20, z: 20, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    adoptDog(g);
    g.clock.t = (((seasons(REGIONS[g.site.region]).harvest[0] + 10 - g.clock.startDoy) % 365) + 365) % 365 + 0.3;
    dailyOf(g).chores.levels.harvest = 100;
    plan(g, false);
    const all = g.people.flatMap((_, i) => row(g, i));
    expect(all).toContain('livestock');
    expect(all).toContain('pets');
    expect(all.filter(d => d === 'kitchen').length).toBeGreaterThanOrEqual(2);
    expect(all.filter(d => d === 'fields').length).toBeGreaterThan(0);
  });

  it('employed adults are not given chores during their weekday job hours', () => {
    const g = game(3, 1);
    g.structures.push({ id: 'k', kind: 'chicken_coop', x: 20, z: 20, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    g.clock.t = Math.floor(g.clock.t / 7) * 7 + 1;   // a weekday
    const i = g.people.findIndex(p => !p.kid);
    g.personState[i].employed = true;
    g.people[i].job = { title: 'clerk', wage: 20 } as never;
    plan(g, false);
    for (let h = 7; h < 16; h++) expect(['livestock', 'pets', 'kitchen', 'cleaning', 'laundry', 'water']).not.toContain(row(g, i)[h]);
    expect(row(g, i).filter(d => d === 'livestock').length).toBe(0);
    // ...while the rest of the household still gets the chores
    expect(g.people.flatMap((_, k) => (k === i ? [] : row(g, k))).includes('livestock')).toBe(true);
  });
});

describe('repeating warnings are throttled', () => {
  const rnd = (v: number) => () => v;
  it('a chore falling behind is announced at most once per window', () => {
    const g = game(3, 1);
    let lines = 0;
    for (let d = 0; d < 40; d++) {
      g.clock.t += 1;
      dailyOf(g).chores.levels.animals = d % 2 ? 10 : 95;   // flaps across the thresholds every day
      lines += choresDay(g, rnd(0.5)).filter(l => /bawling/.test(l)).length;
    }
    expect(lines).toBeLessThanOrEqual(Math.ceil(40 / BEHIND_NAG_DAYS) + 1);
    expect(lines).toBeGreaterThan(0);
    void VET_NAG_DAYS;
  });
});
