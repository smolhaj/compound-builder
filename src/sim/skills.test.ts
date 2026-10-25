import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { courseProblem, hoursFor, idleDays, levelOf, practice, progressOf, rangeTime, rusting, skillsDay, takeCourse, teach } from './skills';
import { skillOf } from './armory';
import { step } from './engine';
import { psyOf } from './mind';

const adult = (g: GameState) => g.people.find(p => !p.kid && p.age > 25 && p.age <= 50)!;
const hoursAt = (g: GameState, pid: string, k: 'medic' | 'builder') => { const p = g.people.find(x => x.id === pid)!; let h = g.learning!.xp[pid]?.[k] ?? 0; for (let l = 0; l < p.skills[k]; l++) h += hoursFor(l); return h; };
function after(g: GameState, days: number) { g.clock.t += days; }

describe('skills from practice', () => {
  it('the medic improves with practice: hours move them up a level, slower the better they are', () => {
    const g = newGame(1);
    const p = adult(g);
    p.skills.medic = 2;
    practice(g, p.id, 'medic', hoursFor(2) + 1);
    expect(p.skills.medic).toBe(3);
    expect(progressOf(g, p.id, 'medic')).toBeGreaterThan(0);
    expect(hoursFor(8)).toBeGreaterThan(hoursFor(3) * 4);
    expect(g.log.some(l => l.text.includes('better hand at doctoring'))).toBe(true);
  });

  it('books, youth and relearning speed it; stress and grief slow it', () => {
    const run = (setup: (g: GameState) => void) => { const g = newGame(2); const p = adult(g); p.skills.medic = 3; setup(g); practice(g, p.id, 'medic', 50); return hoursAt(g, p.id, 'medic'); };
    const plain = run(() => {});
    expect(run(g => { g.stock.medical_books = 1; })).toBeGreaterThan(plain + 15);
    expect(run(g => { psyOf(g, adult(g).id).stress = 90; psyOf(g, adult(g).id).low = 80; })).toBeLessThan(plain - 10);
    expect(run(g => { g.learning!.peak[adult(g).id] = { medic: 6 }; })).toBeGreaterThan(plain + 40);
  });

  it('skills rust when unused, never more than two levels below the best', () => {
    const g = newGame(3);
    const p = adult(g);
    p.skills.radio = 6;
    g.learning!.peak[p.id] = { radio: 6 };
    expect(rusting(g, p.id, 'radio')).toBe(false);
    for (let d = 0; d < 365 * 6; d++) { after(g, 1); skillsDay(g); }
    expect(idleDays(g, p.id, 'radio')).toBeGreaterThan(365 * 5);
    expect(rusting(g, p.id, 'radio')).toBe(true);
    expect(p.skills.radio).toBeLessThan(6);
    expect(p.skills.radio).toBeGreaterThanOrEqual(4);
  });

  it('shooting rusts fastest; range time costs ammunition and brings it back', () => {
    const g = newGame(4);
    const p = adult(g);
    g.armory.guns.push({ id: 'g1', model: 'ruger_1022', condition: 1, fired: 0, where: 'house', carrier: p.id });
    g.armory.skill[p.id] = 6;
    for (let d = 0; d < 400; d++) { after(g, 1); skillsDay(g); }
    const rusty = skillOf(g, p.id);
    expect(rusty).toBeLessThan(6);
    g.armory.ammo['22lr'] = 500;
    expect(rangeTime(g, p.id, 4)).toMatch(/200 rounds/);
    expect(g.armory.ammo['22lr']).toBe(300);
    expect(skillOf(g, p.id)).toBeGreaterThan(rusty);
    g.armory.ammo['22lr'] = 0;
    expect(rangeTime(g, p.id, 2)).toMatch(/dry-fire/);
  });

  it('a teacher who knows more is worth more than practicing alone', () => {
    const alone = newGame(5), taught = newGame(5);
    const kidA = alone.people.find(p => p.kid)!, kidT = taught.people.find(p => p.kid)!;
    const t = adult(taught);
    t.skills.builder = 8;
    kidA.skills.builder = 0; kidT.skills.builder = 0;
    practice(alone, kidA.id, 'builder', 20);
    expect(teach(taught, t.id, kidT.id, 'builder', 20)).toBeGreaterThan(1);
    expect(hoursAt(taught, kidT.id, 'builder')).toBeGreaterThan(hoursAt(alone, kidA.id, 'builder') * 1.2);
    expect(teach(taught, kidT.id, t.id, 'builder', 5)).toBe(0);   // nothing to teach someone who knows more
  });

  it('courses in town while it works: money for hours, capped', () => {
    const g = newGame(6);
    const p = adult(g);
    p.skills.medic = 1;
    g.money = 5000;
    expect(takeCourse(g, p.id, 'wfr')).toBeNull();
    expect(p.skills.medic).toBeGreaterThanOrEqual(2);
    expect(p.skills.medic).toBeLessThanOrEqual(5);
    expect(courseProblem(g, p.id, 'wfr')).toBe('already taken');
    g.disaster.tracks.stores = 0;
    expect(courseProblem(g, p.id, 'emt')).toBe('nobody is teaching courses now');
  });

  it('building time in the engine is practice (the XP hook the schedule uses)', () => {
    let g = newGame(7);
    g.structures.push({ id: 'b1', kind: 'workshop', x: 30, z: 30, rot: 0, stage: 0, done: 0, supplied: true, finishedAt: null });
    g.stock = { ...g.stock, lumber: 999, concrete: 999, roofing: 999, hardware: 999 };
    const p = g.people[0], h0 = hoursAt(g, p.id, 'builder');
    g = step(g, 3);
    expect(hoursAt(g, p.id, 'builder')).toBeGreaterThan(h0 + 5);
    expect(levelOf(g, p.id, 'builder')).toBeGreaterThanOrEqual(p.skills.builder);
  });
});
