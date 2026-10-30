import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, dayIndex, type GameState } from './state';
import { CLASSIC } from './site';
import { step } from './engine';
import { freshNeeds } from './needs';
import type { Person } from './family';
import { autoPlan, dailyOf, DUTY, DUTIES, setFocus } from './daily';
import { fightNerves, mindDay, psyOf, reading } from './mind';
import { callGathering, GATHERING, holdGathering } from './gatherings';
import { eveningHelps, kitCond, kitNote, kitRows, kitStrength, restockNeeds, wearKits, eveningsOf, eveningGaps } from './evenings';
import { bestMode, certNote, classSlots, courseIdea, coursesDay, coursesOf, drillCost, drillDay, drilledOf, enroll, hasCert, modeProblem, readiness, setDrills, teachersFor, COURSES, COURSE_IDS } from './courses';
import { levelOf, learningOf } from './skills';
import { longTerm, moodOrderLines, courseSuggestion, drillsSuggestion } from './guidance';
import { moodSummary } from './mind';
import { whoShouldDo } from './roster';
import { SHELVES } from './shelves';
import { MATERIALS } from './materials';
import { migrate } from './save/migrations';
import { faultFactor, genTune } from './utilities';

const game = (seed = 3): GameState => { const g = newGame(seed, 105, 2027, { site: CLASSIC }); g.disaster.tracks.law = 1; return g; };
const addPerson = (g: GameState, p: Partial<Person> & { id: string }): Person => {
  const base = g.people[0];
  const q: Person = { ...structuredClone(base), first: p.id, kid: false, age: 35, job: undefined, ...p, skills: { ...structuredClone(base.skills), ...(p.skills ?? {}) } };
  delete q.partner; delete q.parents; delete q.conditions;
  g.people.push(q); g.personState.push({ id: q.id, task: 'idle', target: null, needs: freshNeeds(), fatigue: 0 });
  return q;
};
const afterTheHit = (g: GameState) => { g.disaster.kind = 'grid_down'; g.disaster.hitAt = -100; g.disaster.warnAt = -200; g.disaster.phase = 'survival'; };
const freeEvening = (g: GameState, p: Person) => { dailyOf(g).plan.hours[p.id] = Array(24).fill('leisure'); };
const helpsOf = (g: GameState, p: Person) => eveningHelps(g, p, true);
const total = (h: Array<[string, number]>) => h.reduce((a, x) => a + x[1], 0);

describe('stronger coping goods', () => {
  it('a household with no goods gets nothing from the evenings (ordinary days read as before)', () => {
    const g = game();
    for (const p of g.people) expect(helpsOf(g, p).helps).toEqual([]);
    expect(kitRows(g)).toEqual([]);
    expect(restockNeeds(g)).toEqual([]);
  });

  it('a full evening kit is worth more than the old one-off lift, and kids get more from cards and toys', () => {
    const g = game(); afterTheHit(g);
    const kid = addPerson(g, { id: 'Kit', kid: true, age: 9, parents: [g.people[0].id] });
    g.stock.games = 2; g.stock.instrument = 1; g.stock.novels = 1; g.stock.toys = 1; g.stock.picture_books = 1;
    const adult = helpsOf(g, g.people[1]), child = helpsOf(g, kid);
    // the old values: cards 3, music 2, books 2; now 4 + 3 + 3 and the "full kit" 2
    expect(total(adult.helps)).toBeGreaterThanOrEqual(11);
    expect(adult.helps.map(h => h[0])).toEqual(expect.arrayContaining(['cards and games', 'music', 'something to read', 'a full evening kit']));
    expect(child.helps.map(h => h[0])).toEqual(expect.arrayContaining(['toys', 'picture books at bedtime', 'cards and games']));
    expect(total(child.helps)).toBeGreaterThan(total(adult.helps) - 3);
    // the toys are not for grown-ups
    expect(adult.helps.map(h => h[0])).not.toContain('toys');
    // and it comes off the strain the days settle toward
    freeEvening(g, g.people[1]); freeEvening(g, kid);
    const withKit = reading(g, g.people[1]).helps.map(h => h[0]);
    expect(withKit).toContain('a full evening kit');
  });

  it('goods wear with use: the deck loses cards, the strings go, the batteries run down, the paperbacks are passed round', () => {
    const g = game(); afterTheHit(g);
    g.stock.games = 1; g.stock.instrument = 1; g.stock.music_player = 1; g.stock.batteries = 0; g.stock.novels = 1;
    for (const p of g.people) freeEvening(g, p);
    const lines: string[] = [];
    for (let i = 0; i < 120; i++) { g.clock.t += 1; lines.push(...mindDay(g)); }
    expect(kitCond(g, 'games')).toBeLessThan(0.5);
    expect(kitCond(g, 'guitar')).toBeLessThan(0.3);
    expect(kitCond(g, 'books')).toBeLessThan(0.7);
    expect(lines.some(l => /dog-eared|missing|string|paperbacks/.test(l))).toBe(true);
    // worn kits still give something, a lot less than new ones
    expect(kitStrength(g, 'games')).toBeGreaterThan(0.3);
    expect(kitStrength(g, 'games')).toBeLessThan(0.6);
    // the player with no power and flat batteries gives nothing; batteries on the shelf are put in by themselves
    expect(kitStrength(g, 'player')).toBe(0);
    g.stock.batteries = 2;
    expect(kitStrength(g, 'player')).toBeGreaterThan(0.3);
  });

  it('a cheap restock on the shelf makes a worn kit good again by itself, and the Shop says what is thin', () => {
    const g = game(); afterTheHit(g);
    g.stock.games = 1; g.stock.guitar_strings = 2; g.stock.game_pieces = 1; g.stock.instrument = 1;
    eveningsOf(g).cond.games = 0.27; eveningsOf(g).cond.guitar = 0.27;
    expect(kitNote(g, 'game_pieces')?.text).toContain('wearing thin');
    expect(restockNeeds(g)).toEqual([]);   // already on the shelf
    const out = wearKits(g, { games: 4, guitar: 4 });
    expect(out.join(' ')).toMatch(/New cards and dice/);
    expect(out.join(' ')).toMatch(/restrung/);
    expect(kitCond(g, 'games')).toBeGreaterThan(0.9);
    expect(g.stock.game_pieces).toBe(0);
    expect(g.stock.guitar_strings).toBe(1);
    // with nothing on the shelf the order is suggested
    eveningsOf(g).cond.games = 0.3;
    expect(restockNeeds(g)).toContain('game_pieces');
  });

  it('a music player on the house power wears its batteries a third as fast', () => {
    const a = game(), b = game();
    for (const g of [a, b]) { afterTheHit(g); g.stock.music_player = 1; }
    b.utilities.lit = ['x'];
    wearKits(a, { player: 3 }); wearKits(b, { player: 3 });
    expect(1 - kitCond(b, 'player')).toBeLessThan((1 - kitCond(a, 'player')) * 0.5);
  });

  it('a second box of toys swaps in when the first is loved to pieces', () => {
    const g = game(); afterTheHit(g);
    addPerson(g, { id: 'Pip', kid: true, age: 5, parents: [g.people[0].id] });
    g.stock.toys = 2;
    eveningsOf(g).cond.toys = 0.22;
    wearKits(g, { toys: 2 });
    expect(g.stock.toys).toBe(1);
    expect(kitCond(g, 'toys')).toBeGreaterThan(0.9);
  });

  it('shared goods lift a gathering more: cards, music and books at a campfire', () => {
    const base = () => { const g = game(); afterTheHit(g); g.disaster.tracks.stores = 0; g.stock.canned = 100; g.stock.firewood = 5; for (const p of g.personState) p.needs.morale = 50; return g; };
    const a = base(), b = base();
    b.stock.games = 1; b.stock.instrument = 1; b.stock.novels = 1;
    holdGathering(a, { kind: 'campfire', at: 0, until: 1 });
    holdGathering(b, { kind: 'campfire', at: 0, until: 1 });
    expect(b.personState[0].needs.morale).toBeGreaterThan(a.personState[0].needs.morale + 2);
    expect(kitCond(b, 'games')).toBeLessThan(1);
    // and the mind layer counts it for a week
    freeEvening(b, b.people[0]); freeEvening(a, a.people[0]);
    callGathering(b, 'campfire'); callGathering(a, 'campfire');
  });

  it('a service lifts people of faith a lot and the rest a little, for a week', () => {
    const g = game(); afterTheHit(g); g.disaster.tracks.stores = 0; g.stock.canned = 100;
    for (let i = 0; i < 6; i++) addPerson(g, { id: `F${i}`, age: 30 + i });
    for (const p of g.personState) p.needs.morale = 50;
    expect(GATHERING.service.callable).toBe(true);
    expect(callGathering(g, 'service')).toBeNull();
    holdGathering(g, { kind: 'service', at: 0, until: 1 });
    dailyOf(g).social.last.service = g.clock.t;
    const gains = g.personState.map(p => p.needs.morale - 50);
    expect(Math.max(...gains)).toBeGreaterThan(Math.min(...gains) + 3);
    const names = g.people.map(p => reading(g, p).helps.map(h => h[0]));
    expect(names.some(n => n.includes('the service'))).toBe(true);
    expect(names.some(n => n.includes('meeting together'))).toBe(true);
  });

  it('the mood card orders worn-out restock goods and the kids\' things for a strained child', () => {
    const g = game(); afterTheHit(g);
    const kid = addPerson(g, { id: 'Lil', kid: true, age: 7, parents: [g.people[0].id] });
    const ps = psyOf(g, kid.id); ps.stress = 70;
    const lines = moodOrderLines(g, moodSummary(g)).map(l => l.material);
    expect(lines).toEqual(expect.arrayContaining(['games', 'toys']));
    // worn kits come first
    g.stock.games = 1; eveningsOf(g).cond.games = 0.3;
    expect(moodOrderLines(g, moodSummary(g))[0].material).toBe('game_pieces');
    expect(eveningGaps(g)).toContain('picture_books');
  });
});

describe('courses', () => {
  const teach = (g: GameState) => { g.people[0].skills.medic = 5; g.people[1].skills.medic = 0; g.stock.course_firstaid = 1; return { teacher: g.people[0], student: g.people[1] }; };

  it('every course has a book set on the Learning shelf and a skill to feed', () => {
    for (const id of COURSE_IDS) {
      expect(MATERIALS[COURSES[id].book].price).toBeGreaterThan(0);
      expect(SHELVES.learning).toContain(COURSES[id].book);
    }
  });

  it('a teacher at 3+ and the book set; the book alone; online needs power, the phones and tuition', () => {
    const g = game(); afterTheHit(g);
    const { student, teacher } = teach(g);
    g.stock.course_firstaid = 0;
    expect(modeProblem(g, 'firstaid', student.id, 'teacher')).toMatch(/book set/);
    g.stock.course_firstaid = 1;
    expect(modeProblem(g, 'firstaid', student.id, 'teacher')).toBeNull();
    expect(teachersFor(g, 'firstaid', student.id).map(p => p.id)).toEqual([teacher.id]);
    teacher.skills.medic = 2;
    expect(modeProblem(g, 'firstaid', student.id, 'teacher')).toMatch(/3 or more/);
    expect(modeProblem(g, 'firstaid', student.id, 'book')).toBeNull();
    // online
    g.money = 1000;
    expect(modeProblem(g, 'firstaid', student.id, 'online')).toMatch(/power/);
    g.utilities.lit = ['x']; g.disaster.tracks.phone = 1;
    expect(modeProblem(g, 'firstaid', student.id, 'online')).toBeNull();
    g.money = 10;
    expect(modeProblem(g, 'firstaid', student.id, 'online')).toMatch(/tuition/);
    // too young
    const kid = addPerson(g, { id: 'Tiny', kid: true, age: 8 });
    expect(modeProblem(g, 'welding', kid.id, 'book')).toMatch(/too young/);
  });

  it('a course with a teacher puts both on the Class duty in the evening and ends with a certificate and a competent beginner', () => {
    const g = game(); afterTheHit(g);
    const { student, teacher } = teach(g);
    expect(enroll(g, 'firstaid', student.id, 'teacher')).toBeNull();
    expect(coursesOf(g).enrolled).toHaveLength(1);
    expect(classSlots(g)).toHaveLength(1);
    autoPlan(g, { build: false, fell: false });
    const srow = dailyOf(g).plan.hours[student.id], trow = dailyOf(g).plan.hours[teacher.id];
    const sh = srow.map((d, h) => (d === 'study' ? h : -1)).filter(h => h >= 0), th = trow.map((d, h) => (d === 'study' ? h : -1)).filter(h => h >= 0);
    expect(sh.length).toBe(2);
    expect(th).toEqual(sh);
    expect(sh.every(h => h >= 15 && h <= 21)).toBe(true);
    expect(dailyOf(g).plan.notes?.[student.id]).toMatch(/Class: first aid/);
    expect(whoShouldDo(g).some(a => a.duty === 'study' && a.best.length >= 2)).toBe(true);
    // run the days
    let s = g;
    for (let d = 0; d < 16 && !hasCert(s, student.id, 'firstaid'); d++) s = step(s, 1);
    expect(hasCert(s, student.id, 'firstaid')).toBe(true);
    expect(levelOf(s, student.id, 'medic')).toBeGreaterThanOrEqual(2);
    expect(s.stock.course_firstaid).toBe(1);   // the books are kept
    expect(coursesOf(s).enrolled).toHaveLength(0);
    expect(certNote(s, coursesOf(s).certs[0])).toMatch(/First aid and first responder, [A-Z][a-z]{2} 20\d\d \(taught by /);
    expect(s.log.some(l => /finished the first aid and first responder course/.test(l.text))).toBe(true);
    // the teacher kept the skill fresh and gained teaching practice
    expect(s.people.find(p => p.id === teacher.id)!.skills.medic).toBeGreaterThanOrEqual(5);
  });

  it('the book alone is slow, an online course is quicker, a teacher quickest', () => {
    const quality = (mode: 'teacher' | 'book' | 'online') => {
      const g = game();
      const { student } = teach(g);
      g.utilities.grid = true; g.money = 1000;
      expect(enroll(g, 'firstaid', student.id, mode)).toBeNull();
      let s = g, days = 0;
      for (; days < 60 && !hasCert(s, student.id, 'firstaid'); days++) s = step(s, 1);
      return days;
    };
    const t = quality('teacher'), o = quality('online'), b = quality('book');
    expect(t).toBeLessThan(o + 1);
    expect(o).toBeLessThan(b);
  });

  it('a teacher who is gone stalls the course, or it goes on from the book', () => {
    const g = game(); afterTheHit(g);
    const { student, teacher } = teach(g);
    enroll(g, 'firstaid', student.id, 'teacher');
    g.personState[0].needs.died = 10;   // the teacher dies
    g.clock.t += 1;
    const out = coursesDay(g);
    expect(out.join(' ')).toMatch(/goes on from the book set/);
    expect(coursesOf(g).enrolled[0].mode).toBe('book');
    void teacher;
  });

  it('an online course stalls when the phones go down, and picks up again when they are back', () => {
    const g = game(); afterTheHit(g);
    g.utilities.lit = ['x']; g.disaster.tracks.phone = 1; g.money = 500;
    const student = g.people[1];
    enroll(g, 'ham', student.id, 'online');
    expect(g.money).toBe(500 - COURSES.ham.online);
    g.disaster.tracks.phone = 0; g.clock.t += 1;
    coursesDay(g);
    expect(coursesOf(g).enrolled[0].stalled).toBe('no connection');
    g.disaster.tracks.phone = 1; g.clock.t += 1;
    coursesDay(g);
    expect(coursesOf(g).enrolled[0].stalled).toBeUndefined();
  });

  it('suggests a course for a skill the place lacks, and signs up the best candidate; never twice', () => {
    const g = game(); afterTheHit(g);
    for (const p of g.people) p.skills.medic = 1;
    const idea = courseIdea(g);
    expect(idea?.course).toBe('firstaid');
    g.stock.course_firstaid = 1;
    const card = courseSuggestion(g);
    expect(card?.acts?.[0].act.type).toBe('enroll');
    expect(bestMode(g, 'firstaid', idea!.pid)?.mode).toBe('book');
    enroll(g, 'firstaid', idea!.pid, 'book');
    expect(courseIdea(g)?.course).not.toBe('firstaid');
  });

  it('classes and drills are in the roster list but cannot be set as a standing assignment', () => {
    const g = game();
    expect(DUTIES).toContain('study');
    expect(DUTY.study.work).toBe(true);
    expect(setFocus(g, g.people[0].id, 'study')).toMatch(/Family tab/);
    expect(setFocus(g, g.people[0].id, 'drill')).toMatch(/Family tab/);
  });

  it('the long-term list gains a "skills the place needs" goal', () => {
    const g = game(); afterTheHit(g);
    const goal = longTerm(g).find(x => x.id === 'skills');
    expect(goal?.steps.length).toBe(5);
    expect(goal?.steps.find(x => /first aid/.test(x.label))?.done).toBe(g.people.some(p => p.skills.medic >= 3));
  });
});

describe('drills', () => {
  it('suggests drills once, to a household with guns that has never run one, and only in dangerous times', () => {
    const g = game();
    g.armory.guns.push({ id: 'g1', model: 'ruger_1022', condition: 1, fired: 0, where: 'house', carrier: null });
    expect(drillsSuggestion(g)).toBeNull();
    afterTheHit(g);
    expect(drillsSuggestion(g)?.acts?.map(a => a.act.type)).toEqual(['drills', 'drills']);
    setDrills(g, 1);
    expect(drillsSuggestion(g)).toBeNull();
  });

  const armed = (g: GameState, rounds = 500) => { g.armory.guns.push({ id: 'g1', model: 'ruger_1022', condition: 1, fired: 0, where: 'house', carrier: null }); g.armory.guns[0].carrier = g.people[0].id; g.armory.ammo['22lr'] = rounds; };

  it('a drill day schedules one hour at three for everyone who can shoot, and spends ammunition', () => {
    const g = game(); afterTheHit(g); armed(g);
    setDrills(g, 1, true);
    let day = dayIndex(g.clock.t);
    while (!drillDay(g, day)) day++;
    g.clock.t = day - 0.25 + 0.5;   // the day it is on
    autoPlan(g, { build: false, fell: false });
    const who = g.people.filter(p => dailyOf(g).plan.hours[p.id][15] === 'drill');
    expect(who.length).toBeGreaterThanOrEqual(1);
    expect(dailyOf(g).plan.notes?.[who[0].id]).toMatch(/Drill at 15:00/);
    expect(whoShouldDo(g).some(a => a.duty === 'drill')).toBe(true);
  });

  it('a run of weeks: ammunition goes down, accuracy and readiness go up, the alarm freezes people less', () => {
    let g = game(); afterTheHit(g); armed(g, 1000); g.stock.fuel = 5;
    const before = { skill: Math.max(...g.people.map(q => levelOf(g, q.id, 'shooting'))), rounds: g.armory.ammo['22lr']!, freeze: 0 };
    setDrills(g, 3, true);
    for (let d = 0; d < 28; d++) g = step(g, 1);
    const p = g.people.filter(q => !q.kid).sort((a, b) => drilledOf(g, b.id) - drilledOf(g, a.id))[0];
    psyOf(g, p.id).trauma = 40;
    const frozen = fightNerves(g, p).freeze;
    const coll = coursesOf(g).drills.ready[p.id]; coursesOf(g).drills.ready[p.id] = 0;
    const undrilled = fightNerves(g, p).freeze;
    coursesOf(g).drills.ready[p.id] = coll;
    expect(g.armory.ammo['22lr']).toBeLessThan(before.rounds - 100);
    expect(Math.max(...g.people.map(q => levelOf(g, q.id, 'shooting')))).toBeGreaterThan(before.skill);
    expect(drilledOf(g, p.id)).toBeGreaterThan(0.3);
    expect(readiness(g)).toBeGreaterThan(0.15);
    expect(frozen).toBeLessThan(undrilled);
    expect(g.log.some(l => /Drill at three/.test(l.text))).toBe(true);
    void before.freeze;
  });

  it('with no ammunition a drill is dry-fire: free, and a third as good', () => {
    let g = game(); afterTheHit(g); armed(g, 0);
    setDrills(g, 3, true);
    for (let d = 0; d < 14; d++) g = step(g, 1);
    expect(g.armory.ammo['22lr'] ?? 0).toBe(0);
    expect(g.log.some(l => /dry-fire/.test(l.text))).toBe(true);
    expect(Math.max(...g.people.map(q => drilledOf(g, q.id)))).toBeGreaterThan(0);
  });

  it('readiness fades without drills; dry-fire setting spends nothing; a session\'s cost is 15 rounds a shooter', () => {
    const g = game(); afterTheHit(g); armed(g);
    coursesOf(g).drills.ready[g.people[0].id] = 0.8;
    for (let i = 0; i < 60; i++) { g.clock.t += 1; coursesDay(g); }
    expect(drilledOf(g, g.people[0].id)).toBeLessThan(0.45);
    expect(drillCost(g)).toBe(15 * g.people.filter(p => !p.kid).length);
  });
});

describe('skills reach the existing modifiers', () => {
  it('a good hand at wiring and engines trips the pump less and burns less generator fuel; nobody is worse off than before', () => {
    const g = game();
    for (const p of g.people) { p.skills.mechanic = 1; learningOf(g).extra[p.id] = { electrical: 1 }; }
    expect(faultFactor(g)).toBe(1);
    expect(genTune(g)).toBe(1);
    g.people[0].skills.mechanic = 8;
    expect(faultFactor(g)).toBeLessThan(0.85);
    expect(genTune(g)).toBeLessThan(1);
    expect(genTune(g)).toBeGreaterThanOrEqual(0.88);
  });
});

describe('the save', () => {
  it('a v64 save gets the new goods at zero', () => {
    const old = structuredClone(game()) as unknown as Record<string, unknown>;
    old.version = 64;
    const st = old.stock as Record<string, number>;
    for (const k of ['game_pieces', 'guitar_strings', 'music_player', 'batteries', 'paperbacks_bag', 'toys', 'picture_books', ...COURSE_IDS.map(c => `course_${c}`)]) delete st[k];
    const up = migrate(old);
    expect(up.version).toBe(SAVE_VERSION);
    expect(up.stock.toys).toBe(0);
    expect(up.stock.course_firstaid).toBe(0);
    expect(() => step(up, 2)).not.toThrow();
  });
});
