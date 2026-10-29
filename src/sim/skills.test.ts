import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { CLASSIC } from './site';
import { freshNeeds } from './needs';
import type { Person } from './family';
import { autoPlan, dailyOf, dutyWork, fitness, SKILL, tallyOf } from './daily';
import { baseLevel, bestHand, hoursFor, idleDays, learningOf, levelOf, mentorSkill, practice, progressOf, rusting, skillFactor, skillsDay, teach, topSkills } from './skills';
import { step } from './engine';
import { migrate } from './save/migrations';
import { SAVE_VERSION } from './state';

const game = (seed = 3): GameState => { const g = newGame(seed, 105, 2027, { site: CLASSIC }); g.disaster.tracks.law = 1; return g; };
const addPerson = (g: GameState, p: Partial<Person> & { id: string }): Person => {
  const base = g.people[0];
  const q: Person = { ...structuredClone(base), first: p.id, kid: false, age: 35, job: undefined, ...p, skills: { ...structuredClone(base.skills), ...(p.skills ?? {}) } };
  delete q.partner; delete q.parents; delete q.conditions;
  g.people.push(q); g.personState.push({ id: q.id, task: 'idle', target: null, needs: freshNeeds(), fatigue: 0 });
  return q;
};

describe('skills from practice', () => {
  it('a level takes 100 hours at first and more as it goes', () => {
    const g = game();
    const p = g.people[0];
    p.skills.gardener = 0;
    practice(g, p.id, 'gardener', 99);
    expect(p.skills.gardener).toBe(0);
    expect(progressOf(g, p.id, 'gardener')).toBeGreaterThan(0.9);
    practice(g, p.id, 'gardener', 2);
    expect(p.skills.gardener).toBe(1);
    expect(hoursFor(5)).toBeGreaterThan(hoursFor(1) * 4);
  });

  it('the young learn faster than the old, relearning is quick, books help', () => {
    const g = game();
    const young = addPerson(g, { id: 'y', age: 18, skills: { gardener: 0 } as Person['skills'] });
    const old = addPerson(g, { id: 'o', age: 70, skills: { gardener: 0 } as Person['skills'] });
    practice(g, young.id, 'gardener', 80); practice(g, old.id, 'gardener', 80);
    expect(progressOf(g, young.id, 'gardener') + young.skills.gardener).toBeGreaterThan(progressOf(g, old.id, 'gardener') + old.skills.gardener);
    g.stock.manuals = 1;
    const a = addPerson(g, { id: 'a', age: 35, skills: { mechanic: 0 } as Person['skills'] });
    practice(g, a.id, 'mechanic', 50);
    const withBooks = progressOf(g, a.id, 'mechanic');
    g.stock.manuals = 0;
    const b = addPerson(g, { id: 'b', age: 35, skills: { mechanic: 0 } as Person['skills'] });
    practice(g, b.id, 'mechanic', 50);
    expect(withBooks).toBeGreaterThan(progressOf(g, b.id, 'mechanic'));
  });

  it('skills the person does not carry (cooking, husbandry, electrical, leadership) start from the job and age', () => {
    const g = game();
    const el = addPerson(g, { id: 'el', job: { title: 'Electrician', wage: 250, id: 'electrician' }, skills: { mechanic: 6, radio: 1 } as Person['skills'] });
    const kid = addPerson(g, { id: 'k', age: 6, kid: true });
    expect(baseLevel(el, 'electrical')).toBeGreaterThanOrEqual(5);
    expect(baseLevel(kid, 'cooking')).toBe(0);
    expect(levelOf(g, el.id, 'electrical')).toBe(baseLevel(el, 'electrical'));
    expect(baseLevel(el, 'leadership')).toBe(baseLevel(el, 'leadership'));
    // practice moves them
    const was = levelOf(g, el.id, 'cooking');
    practice(g, el.id, 'cooking', hoursFor(was) + 1);
    expect(levelOf(g, el.id, 'cooking')).toBe(was + 1);
  });

  it('rust: a skill unused for a year slips, never more than two under its peak, and is relearned fast', () => {
    const g = game();
    const p = g.people[1];
    p.skills.radio = 5;
    learningOf(g).peak[p.id] = { radio: 5 };
    learningOf(g).used[p.id] = { radio: -2000 };
    expect(rusting(g, p.id, 'radio')).toBe(true);
    expect(idleDays(g, p.id, 'radio')).toBeGreaterThan(300);
    let lines = 0;
    for (let d = 0; d < 1500; d++) { g.clock.t = d; learningOf(g).day = -1; lines += skillsDay(g).length; }
    expect(p.skills.radio).toBeGreaterThanOrEqual(3);
    expect(p.skills.radio).toBeLessThan(5);
    expect(lines).toBeGreaterThan(0);
    // back to it: twice as fast
    const q = addPerson(g, { id: 'q', skills: { radio: 3 } as Person['skills'] });
    learningOf(g).peak[q.id] = { radio: 5 };
    const r = addPerson(g, { id: 'r', skills: { radio: 3 } as Person['skills'] });
    practice(g, q.id, 'radio', 60); practice(g, r.id, 'radio', 60);
    expect(progressOf(g, q.id, 'radio')).toBeGreaterThan(progressOf(g, r.id, 'radio') * 1.5);
  });

  it('an average hand (level 3) is exactly as fast as before; each level is 3 %', () => {
    expect(skillFactor(3)).toBe(1);
    expect(skillFactor(6)).toBeCloseTo(1.09, 5);
    expect(skillFactor(0)).toBeCloseTo(0.91, 5);
  });

  it('a mentor passes on the skill they lead in by two levels or more; a teacher who knows less teaches nothing', () => {
    const g = game();
    const elder = addPerson(g, { id: 'el', age: 72, elder: true, skills: { gardener: 8, builder: 7, mechanic: 1 } as Person['skills'] });
    const kid = addPerson(g, { id: 'ky', age: 13, kid: true, skills: { gardener: 1, builder: 6, mechanic: 1 } as Person['skills'] });
    const k = mentorSkill(g, elder.id, kid.id);
    expect(k).toBe('gardener');
    expect(teach(g, kid.id, elder.id, 'gardener', 2)).toBe(0);
    const alone = addPerson(g, { id: 'al', age: 13, kid: true, skills: { gardener: 1 } as Person['skills'] });
    practice(g, alone.id, 'gardener', 40);
    teach(g, elder.id, kid.id, 'gardener', 40);
    expect(progressOf(g, kid.id, 'gardener')).toBeGreaterThan(progressOf(g, alone.id, 'gardener'));
    expect(learningOf(g).mentored[kid.id]).toBe(40);
  });

  it('the roster hour is practice: a day in the garden moves gardening, the kitchen weighs by cooking skill', () => {
    const g = game();
    const p = g.people[0];
    const ps = g.personState[0];
    const before = progressOf(g, p.id, 'gardener') + p.skills.gardener;
    for (let i = 0; i < 8; i++) dutyWork(g, p, ps, 'garden', 1, 9 + i);
    expect(progressOf(g, p.id, 'gardener') + p.skills.gardener).toBeGreaterThan(before);
    expect(SKILL.livestock).toBe('husbandry');
    const cook = addPerson(g, { id: 'ck' }), novice = addPerson(g, { id: 'nv' });
    learningOf(g).extra[cook.id] = { cooking: 7 }; learningOf(g).extra[novice.id] = { cooking: 0 };
    const t = tallyOf(g).today; t.kitchen = 0;
    dutyWork(g, cook, g.personState[g.people.indexOf(cook)], 'kitchen', 1);
    const skilled = t.kitchen!;
    t.kitchen = 0;
    dutyWork(g, novice, g.personState[g.people.indexOf(novice)], 'kitchen', 1);
    expect(skilled).toBeGreaterThan(t.kitchen!);
  });

  it('the planner prefers the better hand, and the Mentor duty puts an elder beside the youth', () => {
    const g = game(5);
    const elder = addPerson(g, { id: 'el', age: 72, elder: true, skills: { gardener: 9 } as Person['skills'] });
    const kid = addPerson(g, { id: 'ky', age: 13, kid: true, skills: { gardener: 1 } as Person['skills'] });
    g.disaster.tracks.stores = 0.1;
    autoPlan(g, { build: false, fell: false });
    const rows = dailyOf(g).plan.hours;
    expect(rows[elder.id][15]).toBe('mentor');
    expect(rows[kid.id][15]).toBe('mentor');
    const before = kid.skills.gardener + progressOf(g, kid.id, 'gardener');
    dutyWork(g, elder, g.personState[g.people.indexOf(elder)], 'mentor', 0.7, 15);
    expect(kid.skills.gardener + progressOf(g, kid.id, 'gardener')).toBeGreaterThan(before);
    const hand = fitness(g, 0, 'garden'), weak = fitness(g, g.people.indexOf(kid), 'garden');
    expect(hand).toBeGreaterThan(weak);
  });

  it('readout: top skills, strongest first, with a best hand per skill', () => {
    const g = game();
    const p = g.people[0];
    const top = topSkills(g, p, 3);
    expect(top.length).toBeGreaterThan(0);
    expect(top[0].level).toBeGreaterThanOrEqual(top[top.length - 1].level);
    expect(bestHand(g, 'builder')).not.toBeNull();
  });

  it('a stretch of play leaves the family no worse (skills only rise or hold within a year of steady work)', () => {
    let g = game(9);
    const start = g.people.map(p => ({ ...p.skills }));
    g = step(g, 90);
    g.people.forEach((p, i) => { for (const k of Object.keys(p.skills) as Array<keyof Person['skills']>) expect(p.skills[k]).toBeGreaterThanOrEqual(Math.floor(start[i][k]) - 0); });
  });

  it('a v62 save gets the evenings\' goods at zero and plays on', () => {
    const old = structuredClone(game(4)) as unknown as Record<string, unknown>;
    old.version = 62;
    for (const k of ['games', 'instrument', 'novels', 'manuals']) delete (old.stock as Record<string, number>)[k];
    delete old.mind; delete old.learning;
    const up = migrate(old);
    expect(up.version).toBe(SAVE_VERSION);
    expect(up.stock.games).toBe(0);
    expect(() => step(up, 3)).not.toThrow();
  });
});
