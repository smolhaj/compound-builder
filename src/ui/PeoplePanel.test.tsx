// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useGameStore } from '../store/gameStore';
import { newGame } from '../sim/state';
import { PeopleSection, PersonInsight } from './PeoplePanel';
import { psyOf } from '../sim/mind';
import { suggestions } from '../sim/guidance';
import { whoShouldDo } from '../sim/roster';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const withGame = (mut: (g: ReturnType<typeof newGame>) => void) => {
  const g = newGame(11);
  mut(g);
  Object.assign(useGameStore.getInitialState(), { game: g, tool: null, selected: null });
  return g;
};

describe('the people panels (server-rendered)', () => {
  it('everyone holding up reads calm, and the household block offers a rest day and a campfire', () => {
    withGame(() => undefined);
    const t = text(renderToStaticMarkup(<PeopleSection />));
    expect(t).toContain('Everyone is holding up');
    expect(t).toContain('Take a rest day');
    expect(t).toContain('Campfire tonight');
  });

  it('someone not coping shows by name, with the reason, and the next-step list offers help', () => {
    const g = withGame(g2 => {
      g2.disaster.kind = 'grid_down'; g2.disaster.hitAt = -50; g2.disaster.warnAt = -80;
      const ps = psyOf(g2, g2.people[0].id);
      ps.stress = 92; ps.weighs = [['hunger', 30], ['grief', 12]];
      ps.broke = { kind: 'withdrawn', day: 0, until: 5 };
    });
    const first = g.people[0].first;
    const t = text(renderToStaticMarkup(<PeopleSection />));
    expect(t).toContain(first);
    expect(t).toContain('withdrawn');
    expect(t).toContain('Someone is not coping');
    const sug = suggestions(g).find(x => x.id === 'mood');
    expect(sug?.title).toContain('not coping');
    expect(sug?.acts?.map(a => a.label)).toEqual(expect.arrayContaining(['Take a rest day']));
    const row = text(renderToStaticMarkup(<PersonInsight p={g.people[0]} />));
    expect(row).toContain('strain');
    expect(row).toContain('withdrawn');
  });

  it('"who should do what" names the better hand for the work that needs doing', () => {
    const g = withGame(g2 => { g2.disaster.kind = 'grid_down'; g2.disaster.hitAt = -50; g2.disaster.warnAt = -80; g2.disaster.phase = 'survival'; });
    const adv = whoShouldDo(g);
    for (const a of adv) expect(a.best.length).toBeGreaterThan(0);
  });
});

import { MedicalSection } from './PeoplePanel';
import { startCase, medicalDay, medicalOf } from '../sim/medical';

describe('the Medical section (server-rendered)', () => {
  it('shows the medic, the supplies, the sick with what is being done, and the quarantine choice', () => {
    const g = withGame(g2 => {
      g2.people[1].skills.medic = 10; g2.stock.antibiotics = 2;
      startCase(g2, g2.people[0].id, 'fracture', 45, { bone: 'arm' }, 'broken arm');
      startCase(g2, g2.people[2].id, 'flu', 40, {}, 'flu');
      medicalDay(g2);
    });
    const t = text(renderToStaticMarkup(<MedicalSection />));
    expect(t).toContain(g.people[1].first);
    expect(t).toContain('2 courses');
    expect(t).toContain('broken arm');
    expect(t).toContain('Keep the sick apart');
    expect(medicalOf(g).epidemic?.kind).toBe('flu');
  });

  it('with nobody sick it says so and suggests what to put by', () => {
    withGame(() => undefined);
    const t = text(renderToStaticMarkup(<MedicalSection />));
    expect(t).toContain('Nobody is sick or hurt');
  });
});
