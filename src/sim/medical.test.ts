import { describe, expect, it } from 'vitest';
import { newGame, dayIndex, type GameState } from './state';
import { CLASSIC } from './site';
import { freshNeeds } from './needs';
import type { Person } from './family';
import { birthRisk, careFor, casesOf, courses, duePregnancies, medicalDay, medicalOf, medReport, setPolicy, setQuarantine, startCase, startPregnancy, takeCourse, afterBirth } from './medical';
import { bodyDay, RX_SHELF } from './body';
import { lineageDay } from './lineage';
import { migrate } from './save/migrations';
import { SAVE_VERSION } from './state';
import { step } from './engine';
import { suggestions } from './guidance';

const game = (seed = 3): GameState => { const g = newGame(seed, 105, 2027, { site: CLASSIC }); g.disaster.tracks.law = 0; g.disaster.tracks.medical = 0; g.disaster.tracks.stores = 0; g.disaster.tracks.banks = 0; g.stock.meds = 0; return g; };
const addPerson = (g: GameState, p: Partial<Person> & { id: string }): Person => {
  const base = g.people[0];
  const q: Person = { ...structuredClone(base), first: p.id, kid: false, age: 35, ...p, skills: { ...structuredClone(base.skills), medic: 0, ...(p.skills ?? {}) } };
  delete q.partner; delete q.parents; delete q.conditions; delete q.job;
  g.people.push(q); g.personState.push({ id: q.id, task: 'idle', target: null, needs: freshNeeds(), fatigue: 0 });
  return q;
};
const days = (g: GameState, n: number) => { const out: string[] = []; for (let i = 0; i < n; i++) { g.clock.t += 1; out.push(...medicalDay(g)); } return out; };
const hurt = (g: GameState, i = 0) => g.personState[i].needs;
const noMedics = (g: GameState) => { for (const p of g.people) p.skills.medic = 0; };

describe('wounds, infection and antibiotics', () => {
  it('a fight wound is adopted into the chain and heals when dressed and kept clean', () => {
    const g = game(); g.stock.meds = 2; g.people[1].skills.medic = 3;
    hurt(g).hurt.push({ what: 'shot in the leg', sev: 40, trauma: true });
    medicalDay(g);
    const c = casesOf(g, g.people[0].id)[0];
    expect(c.med!.kind).toBe('wound');
    days(g, 25);
    expect(hurt(g).hurt.filter(h => h.med?.kind === 'wound').length).toBe(0);
    expect(g.stock.meds).toBeLessThan(2);
  });

  it('neglected wounds go bad far more often; an infection needs antibiotics, and they cure it', () => {
    let bad = 0, good = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const a = game(seed); noMedics(a);
      hurt(a).hurt.push({ what: 'gash', sev: 30, trauma: true });
      days(a, 12);
      if (casesOf(a, a.people[0].id).some(h => h.med!.kind === 'infection') || a.personState[0].needs.died != null) bad++;
      const b = game(seed); b.stock.meds = 3; b.people[1].skills.medic = 4;
      hurt(b).hurt.push({ what: 'gash', sev: 30, trauma: true });
      days(b, 12);
      if (casesOf(b, b.people[0].id).some(h => h.med!.kind === 'infection')) good++;
    }
    expect(bad).toBeGreaterThan(good + 5);
    // a course clears one
    const g = game(); g.stock.antibiotics = 2; setPolicy(g, 'all');
    startCase(g, g.people[0].id, 'infection', 60, { care: 'infected' } as never, 'infected wound');
    days(g, 9);
    expect(casesOf(g, g.people[0].id).length).toBe(0);
    expect(g.stock.antibiotics).toBe(1);
  });

  it('untreated blood poisoning kills across seeds; on Cozy it does not', () => {
    let dead = 0, deadCozy = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const g = game(seed); noMedics(g); startCase(g, g.people[0].id, 'infection', 80, {}, 'infected wound'); days(g, 30);
      if (g.personState[0].needs.died != null) dead++;
      const c = game(seed); c.disaster.difficulty = 'cozy'; noMedics(c); startCase(c, c.people[0].id, 'infection', 80, {}, 'infected wound'); days(c, 30);
      if (c.personState[0].needs.died != null) deadCozy++;
    }
    expect(dead).toBeGreaterThan(3);
    expect(deadCozy).toBe(0);
  });

  it('the policy decides who gets a course: serious cases only keeps them for when it counts', () => {
    const g = game(); g.stock.antibiotics = 3;
    const young = g.people[0];
    startCase(g, young.id, 'infection', 30, {}, 'infection');
    medicalDay(g);
    expect(g.stock.antibiotics).toBe(3);       // not serious enough
    setPolicy(g, 'all'); g.clock.t += 1; medicalDay(g);
    expect(g.stock.antibiotics).toBe(2);
    expect(courses(g)).toBe(2);
    g.stock.meds = 0.8; expect(courses(g)).toBe(4);
    expect(takeCourse(g)).toBe(true);
  });
});

describe('broken bones, burns, frostbite, teeth', () => {
  it('a fracture waits for a splint and someone who can set it (after three days it is strapped up with what there was); set, it knits and the person is off heavy work meanwhile', () => {
    const g = game(); noMedics(g);
    startCase(g, g.people[0].id, 'fracture', 45, { bone: 'arm' }, 'broken arm');
    days(g, 2);
    expect(hurt(g).hurt[0].med!.set).toBeUndefined();
    expect(hurt(g).hurt[0].sev).toBeGreaterThanOrEqual(40);
    days(g, 2);
    expect(hurt(g).hurt[0].med!.set).toBe('bad');          // strapped up with what there was
    const h = game(); h.people[1].skills.medic = 4; h.stock.splints = 1;
    startCase(h, h.people[0].id, 'fracture', 45, { bone: 'arm' }, 'broken arm');
    days(h, 1);
    expect(hurt(h).hurt[0].med!.set).toBe('good');
    expect(h.stock.splints).toBe(0);
    days(h, 20);
    expect(hurt(h).hurt[0].sev).toBeLessThan(45);
    days(h, 40);
    expect(hurt(h).hurt.length).toBe(0);
  });

  it('a badly set bone or a broken hip can leave something lasting, and it slows the work', () => {
    let lasting = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const g = game(seed); g.people[1].skills.medic = 2; g.stock.lumber = 1;
      startCase(g, g.people[0].id, 'fracture', 55, { bone: 'leg' }, 'broken leg');
      days(g, 90);
      if ((g.medical?.lasting[g.people[0].id] ?? []).length) { lasting++; expect(g.personState[0].needs.lasting).toBeLessThan(1); }
    }
    expect(lasting).toBeGreaterThan(2);
  });

  it('a toothache left a week becomes an abscess; a dental kit or antibiotics end it', () => {
    const g = game(); g.stock.dental_kit = 1;
    hurt(g).hurt.push({ what: 'toothache', sev: 25 });
    days(g, 40);
    expect(hurt(g).hurt.length).toBe(0);
    expect(g.stock.dental_kit).toBe(0);
    const h = game(); noMedics(h);
    hurt(h).hurt.push({ what: 'toothache', sev: 25 });
    days(h, 12);
    expect(hurt(h).hurt[0].what).toBe('tooth abscess');
  });

  it('frostbite on a cold watch is real, and warming it up matters', () => {
    const g = game(); g.clock.startDoy = 1; g.personState[0].task = 'watch';
    let got = false;
    for (let i = 0; i < 600 && !got; i++) { g.clock.t += 1; g.personState[0].task = 'watch'; medicalDay(g); got = casesOf(g, g.people[0].id).some(h => h.med!.kind === 'frostbite') || (g.medical?.lasting[g.people[0].id]?.length ?? 0) > 0; }
    expect(got).toBe(true);
  });
});

describe('water, flu and quarantine', () => {
  it('dysentery in the old and the little kills without fluids, rarely with salts', () => {
    let dry = 0, wet = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const g = game(seed); noMedics(g); const e = addPerson(g, { id: 'el', age: 78, elder: true });
      g.disaster.tracks.stores = 1; startCase(g, e.id, 'dysentery', 70, {}, 'dysentery'); days(g, 14);
      if (g.personState[g.people.indexOf(e)].needs.died != null) dry++;
      const h = game(seed); noMedics(h); h.stock.ors = 3; const e2 = addPerson(h, { id: 'el', age: 78, elder: true });
      h.disaster.tracks.stores = 1; startCase(h, e2.id, 'dysentery', 70, {}, 'dysentery'); days(h, 14);
      if (h.personState[h.people.indexOf(e2)].needs.died != null) wet++;
    }
    expect(dry).toBeGreaterThan(wet + 2);
  });

  it('quarantine slows the flu through a house', () => {
    let free = 0, kept = 0;
    for (let seed = 1; seed <= 25; seed++) {
      for (const q of [false, true]) {
        const g = game(seed); g.disaster.tracks.stores = 1;
        for (let k = 0; k < 4; k++) addPerson(g, { id: 'x' + k });
        startCase(g, g.people[0].id, 'flu', 40, {}, 'flu');
        medicalOf(g).epidemic = { kind: 'flu', since: 0, quarantine: false, asked: false, cases: 1 };
        if (q) setQuarantine(g, true);
        days(g, 6);
        const n = g.personState.filter(ps => ps.needs.hurt.some(h => h.med?.kind === 'flu')).length;
        if (q) kept += n; else free += n;
      }
    }
    expect(free).toBeGreaterThan(kept);
  });

  it('an epidemic asks for a decision on the next-step card, and answering it stops the question', () => {
    const g = game();
    startCase(g, g.people[1].id, 'flu', 40, {}, 'flu');
    medicalDay(g);
    const s = suggestions(g).find(x => x.id === 'epidemic');
    expect(s?.acts?.map(a => a.label)).toContain('Keep the sick apart');
    setQuarantine(g, true);
    expect(suggestions(g).find(x => x.id === 'epidemic')).toBeUndefined();
  });
});

describe('childbirth', () => {
  it('risk falls with a medic and a kit and again at a hospital', () => {
    const g = game(); noMedics(g);
    const mother = g.people[0];
    const none = birthRisk(g, mother).baby;
    g.people[1].skills.medic = 6; g.stock.midwife_kit = 1;
    const kit = birthRisk(g, mother).baby;
    g.disaster.tracks.medical = 1; g.disaster.tracks.banks = 1;
    const hosp = birthRisk(g, mother).baby;
    expect(none).toBeGreaterThan(kit); expect(kit).toBeGreaterThan(hosp);
  });

  it('a pregnancy runs nine months, then delivers, with recovery weeks', () => {
    const g = game(5);
    const [a, b] = g.people;
    const mother = a.body === 'f' ? a : b;
    startPregnancy(g, mother, mother === a ? b : a);
    expect(medicalOf(g).pregnancies[mother.id]).toBeTruthy();
    g.clock.t += 100;
    expect(duePregnancies(g).length).toBe(0);
    startPregnancy(g, mother, mother === a ? b : a);
    g.clock.t += 280;
    const before = g.people.length;
    lineageDay(g);
    expect(g.people.length).toBeGreaterThanOrEqual(before);
    expect(medicalOf(g).pregnancies[mother.id]).toBeUndefined();
    afterBirth(g, mother, () => 0.5);
    expect(casesOf(g, mother.id).some(h => h.med!.kind === 'postpartum')).toBe(true);
    void dayIndex;
  });
});

describe('medicines have a shelf life; the medic is the best present', () => {
  it('after two and a half years without a refill, pills work half as well', () => {
    const g = game();
    g.people[0].conditions = ['blood_pressure'];
    g.body.rx[g.people[0].id] = 400; g.body.age = { [g.people[0].id]: RX_SHELF + 1 };
    bodyDay(g);
    expect(g.body.rx[g.people[0].id]).toBe(398);
    g.body.age = { [g.people[0].id]: 10 }; g.body.rx[g.people[0].id] = 400;
    bodyDay(g);
    expect(g.body.rx[g.people[0].id]).toBe(399);
  });

  it('the best able adult tends the sick (a nurse over a carpenter), never the patient', () => {
    const g = game();
    const nurse = addPerson(g, { id: 'nr', skills: { medic: 7 } as Person['skills'] });
    expect(careFor(g, g.people[0].id).medic?.id).toBe(nurse.id);
    expect(careFor(g, nurse.id).medic?.id).not.toBe(nurse.id);
    expect(medReport(g).medic?.id).toBe(nurse.id);
  });

  it('a v63 save gets the medical goods at zero and plays on', () => {
    const old = structuredClone(game(4)) as unknown as Record<string, unknown>;
    old.version = 63; delete old.medical;
    for (const k of ['antibiotics', 'splints', 'ors', 'dental_kit', 'midwife_kit', 'medical_books']) delete (old.stock as Record<string, number>)[k];
    const up = migrate(old);
    expect(up.version).toBe(SAVE_VERSION);
    expect(up.stock.antibiotics).toBe(0);
    expect(() => step(up, 5)).not.toThrow();
  });
});

describe('difficulty scales how deadly it is', () => {
  it('Hardcore kills healthy adults with untreated blood poisoning far more often than Standard; Cozy never', () => {
    const deaths = (diff: 'standard' | 'hardcore' | 'cozy') => {
      let d = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const g = game(seed); g.disaster.difficulty = diff; noMedics(g);
        startCase(g, g.people[0].id, 'infection', 80, {}, 'infected wound'); days(g, 40);
        if (g.personState[0].needs.died != null) d++;
      }
      return d;
    };
    const std = deaths('standard'), hard = deaths('hardcore');
    expect(hard).toBeGreaterThan(std + 5);
    expect(deaths('cozy')).toBe(0);
  });
});
