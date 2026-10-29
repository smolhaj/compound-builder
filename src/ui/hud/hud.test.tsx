// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useGameStore } from '../../store/gameStore';
import { newGame } from '../../sim/state';
import { planStructure } from '../../sim/construction';
import { planRun } from '../../sim/perimeter';
import { setFocus } from '../../sim/priority';
import { DogsPanel } from '../DogsPanel';
import { adoptDog } from '../../sim/pets';
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
    expect(t).toContain('Most pressing now');
    expect(t).toContain('Long-term');
    expect(t).toContain('Enclose the compound');
    expect(t).toContain('A bunker underneath');
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

  it('prompts for firewood with an order button and a mark-trees button when the woodpile is bare', () => {
    withGame(g => { g.clock.startDoy = 330; g.stock.firewood = 0; planStructure(g, 'cottage', 5, 5, 0).stage = 99; });
    const t = text(renderToStaticMarkup(<BuildMenu />));
    expect(t).toContain('Firewood');
    expect(t).toMatch(/Order \d+ ricks? \(\$[\d,]+\)/);
    expect(t).toContain('Mark 10 trees');
    expect(t).toContain('Mark the 10 nearest trees');
  });

  it('lists a finished house that is not wired under "Finished, but not working yet", with what to do', () => {
    withGame(g => { g.utilities.grid = false; const st = planStructure(g, 'cottage', 5, 5, 0); st.stage = 99; st.finishedAt = 0; });
    const t = text(renderToStaticMarkup(<ProjectsTab />));
    expect(t).toContain('Finished, but not working yet');
    expect(t).toContain('No power reaches it');
    expect(t).toContain('Draw the line');
  });

  it('shows the work queue with "Work on this first" and the focused project marked', () => {
    withGame(g => { planStructure(g, 'cottage', 5, 5, 0); const r = planRun(g, 'split_rail', [[0, 0], [30, 0]], []); setFocus(g, r.id); });
    const t = text(renderToStaticMarkup(<ProjectsTab />));
    expect(t).toContain('Under way, in the order the family works');
    expect(t).toContain('Clear');
    expect(t).toContain('Work on this first');
  });

  it('warns a crew would stand idle when the materials are not on site', () => {
    withGame(g => { g.money = 200000; planStructure(g, 'cottage', 5, 5, 0).stage = 1; g.stock.lumber = 0; g.stock.hardware = 0; g.stock.concrete = 0; g.stock.roofing = 0; });
    const t = text(renderToStaticMarkup(<ProjectsTab />));
    expect(t).toContain('materials are not on site yet');
    expect(t).toContain('Hire a crew anyway');
  });

  it('warns when the dogs need more care hours than the household has, and offers the puppies switch', () => {
    withGame(g => { for (let i = 0; i < 9; i++) adoptDog(g, { ageYears: 2, sex: i % 2 ? 'f' : 'm' }); });
    const html = renderToStaticMarkup(<DogsPanel game={useGameStore.getInitialState().game} />);
    const t = text(html);
    expect(t).toMatch(/Care takes about [\d.]+ h a day and the household can spare about/);
    expect(t).toContain('Allow puppies');
    expect(t).toContain('Fix ($220)');
  });

  it('offers the footpaths in the Build menu, and says what the walks need once the world has planned them', async () => {
    withGame(() => undefined);
    expect(text(renderToStaticMarkup(<BuildMenu />))).toContain('Footpaths');
    const { PathsPanel } = await import('./PathsPanel');
    const { useWorldStore } = await import('../../store/worldStore');
    // a planned network the world would publish: one busy walk, one to the hidden hatch
    Object.assign(useWorldStore.getInitialState(), { pathNet: { key: 'k', edges: [
      { key: 'a~b', a: 'a', b: 'b', aName: 'old farmhouse', bName: 'barn', lenM: 40, uniqueM: 40, trips: 4, wear: 0.6, worn: 'dirt', laid: null, can: { gravel: true, stones: true, boards: true, paved: true }, hidden: false },
      { key: 'a~h', a: 'a', b: 'h', aName: 'old farmhouse', bName: 'bunker hatch', lenM: 20, uniqueM: 20, trips: 0.1, wear: 0.2, worn: 'desire', laid: null, can: { gravel: false, stones: false, boards: false, paved: false }, hidden: true },
    ] } });
    const t = text(renderToStaticMarkup(<PathsPanel startOpen />));
    expect(t).toContain('Footpaths');
    expect(t).toContain('Old farmhouse ↔ barn');
    expect(t).toContain('bare earth');
    // one walk is worth laying (the busy one); the hatch is never offered
    expect(t).toMatch(/Lay paths between my buildings: 1 walk, 40 m of new gravel walk/);
    expect(t).toMatch(/All 1/);
    expect(t).not.toContain('bunker hatch');
    expect(t).toMatch(/Short: .*fieldstone/i);
  });
});
