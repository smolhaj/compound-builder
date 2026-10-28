// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useGameStore } from '../../store/gameStore';
import { newGame } from '../../sim/state';
import { planStructure } from '../../sim/construction';
import { BuildMenu } from './BuildMenu';
import { ProjectsTab } from './ProjectsTab';
import { ShopWindow } from '../ShopWindow';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const withGame = (mut: (g: ReturnType<typeof newGame>) => void) => {
  const g = newGame(11); g.structures = []; g.perimeter = []; g.site = { ...g.site, gwDepth: 65 };
  mut(g);
  // server rendering reads the store's initial snapshot, so set it there
  Object.assign(useGameStore.getInitialState(), { game: g, tool: null, selected: null });
};

describe('the guided HUD (server-rendered)', () => {
  it('greys the bunker rooms with a reason, highlights the next step and lists what the bunker needs', () => {
    withGame(() => undefined);
    const t = text(renderToStaticMarkup(<BuildMenu />));
    expect(t).toContain('needs a hatch or stairwell first');
    expect(t).toContain('The bunker needs, in order');
    expect(t).toContain('Next step');
    expect(t).toMatch(/water is 65 m down/i);
    expect(t).toContain('Wall my property');
    expect(t).toContain('Cheap in cash');
  });

  it('opens the bunker once there is a hatch', () => {
    withGame(g => { planStructure(g, 'bunker_hatch', 0, 0, 0); });
    const t = text(renderToStaticMarkup(<BuildMenu />));
    expect(t).not.toContain('needs a hatch or stairwell first');
  });

  it('shows the pace and the slow-going hint on the Projects tab', () => {
    withGame(g => {
      planStructure(g, 'timber_cabin', 0, 0, 0);
      const i = g.people.findIndex(p => !p.kid && !p.elder);
      g.people[i].job = { title: 'Clerk', wage: 120 } as never; g.personState[i].employed = true;
    });
    const t = text(renderToStaticMarkup(<ProjectsTab />));
    expect(t).toContain('At the family');
    expect(t).toMatch(/Slow going/);
  });

  it('the Shop marks what the plans lack as needed now and offers to order it', () => {
    withGame(g => { planStructure(g, 'timber_cabin', 0, 0, 0); });
    const t = text(renderToStaticMarkup(<ShopWindow />));
    expect(t).toContain('needed now');
    expect(t).toContain('Order what the plans need');
    expect(t).toContain('Fencing');
  });
});
