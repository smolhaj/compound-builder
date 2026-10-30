// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useGameStore } from '../store/gameStore';
import { newGame } from '../sim/state';
import { ClassesSection, PeopleSection, PersonInsight } from './PeoplePanel';
import { enroll, coursesOf, setDrills } from '../sim/courses';
import { eveningsOf } from '../sim/evenings';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const withGame = (mut: (g: ReturnType<typeof newGame>) => void) => {
  const g = newGame(11);
  mut(g);
  Object.assign(useGameStore.getInitialState(), { game: g, tool: null, selected: null });
  return g;
};

describe('Classes and drills (server-rendered)', () => {
  it('offers a course with the ways to take it and says what is missing', () => {
    withGame(() => undefined);
    const t = text(renderToStaticMarkup(<ClassesSection />));
    expect(t).toContain('Classes and drills');
    expect(t).toContain('First aid and first responder');
    expect(t).toContain('With a teacher');
    expect(t).toContain('Online');
    expect(t).toContain('Book set');
    expect(t).toContain('Start the course');
    expect(t).toContain('Needs a gun first');
  });

  it('shows the course in progress, the certificate, and the drill schedule', () => {
    const g = withGame(g2 => {
      g2.people[0].skills.medic = 5; g2.stock.course_firstaid = 1;
      g2.armory.guns.push({ id: 'g1', model: 'ruger_1022', condition: 1, fired: 0, where: 'house', carrier: null });
      g2.armory.ammo['22lr'] = 200;
      enroll(g2, 'firstaid', g2.people[1].id, 'teacher');
      coursesOf(g2).enrolled[0].done = 8;
      coursesOf(g2).certs.push({ pid: g2.people[0].id, course: 'ham', at: 3, mode: 'book' });
      setDrills(g2, 2, true);
    });
    const t = text(renderToStaticMarkup(<ClassesSection />));
    expect(t).toMatch(new RegExp(`${g.people[1].first}\\s*: first aid and first responder`));
    expect(t).toContain('with a teacher at home');
    expect(t).toContain('Amateur radio licence (Technician)');
    expect(t).toContain('Twice a week');
    expect(t).toContain('Ready at the alarm');
    const row = text(renderToStaticMarkup(<PersonInsight p={g.people[1]} />));
    expect(row).toContain('Taking: first aid and first responder, 40 %');
    const row0 = text(renderToStaticMarkup(<PersonInsight p={g.people[0]} />));
    expect(row0).toContain('Amateur radio licence');
  });

  it('the household block shows the evenings\' goods and how worn they are', () => {
    withGame(g => { g.stock.games = 1; g.stock.instrument = 1; eveningsOf(g).cond.games = 0.3; });
    const t = text(renderToStaticMarkup(<PeopleSection />));
    expect(t).toContain('The evenings');
    expect(t).toContain('Cards and board games');
    expect(t).toContain('wearing thin');
    expect(t).toContain('Hold a service');
  });
});
