// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DomeLinksSection } from './DomeLinksSection';
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { newGame, type GameState } from '../../sim/state';
import { DOME_KIND } from '../../sim/dome/tiers';
import { domeViews } from '../../sim/dome/live';
import { orderLink, linksOf, collapseLink } from '../../sim/dome/links';
import { setGroundOverride } from '../../sim/terrainState';

const dome = (g: GameState, id: string, tier: 'geodesic' | 'glass', x: number) => g.structures.push({ id, kind: DOME_KIND[tier], x, z: 33, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
const world = (domes: number, links: Array<'tunnel' | 'walkway'> = []): GameState => {
  const g = newGame(11); g.money = 5_000_000;
  dome(g, 'dA', 'geodesic', 26); if (domes > 1) dome(g, 'dB', 'glass', 40);
  for (const k of links) orderLink(g, 'dA', 'dB', k);
  return g;
};
const html = (g: GameState): string => {
  Object.assign(useGameStore.getInitialState(), { game: g });
  Object.assign(useWorldStore.getInitialState(), { uiScale: 1, hudHidden: false });
  return renderToStaticMarkup(<DomeLinksSection v={domeViews(g).find(v => v.id === 'dA')!} />);
};
beforeEach(() => setGroundOverride({ h: () => 0, creek: null }));
afterEach(() => setGroundOverride(null));

describe('the Dome panel Links section', () => {
  it('a single dome alone shows nothing: single big domes work unchanged', () => { expect(html(world(1))).toBe(''); });
  it('with two domes it offers the partner, Underground / Above ground / Both, a depth, the length and the cost', () => {
    const h = html(world(2));
    for (const t of ['link-partner', 'link-kind-tunnel', 'link-kind-walkway', 'link-kind-both', 'link-build', 'link-quote-walkway']) expect(h).toContain(`data-testid="${t}"`);
    expect(h).toMatch(/\d+ ft/); expect(h).toMatch(/\$[\d,]+ in all/); expect(h).toContain('airlock cycle');
    expect(h).toContain('No tunnel or walkway yet');
  });
  it('lists links with their stage and state, and a repair button once one is down', () => {
    const g = world(2, ['walkway', 'tunnel']);
    let h = html(g); expect(h).toContain('Above-ground walkway to'); expect(h).toContain('Underground tunnel to'); expect(h).toContain('planned, waiting for materials');
    for (const l of linksOf(g)) { const r = g.perimeter.find(x => x.id === l.runId)!; r.done = r.hours; r.supplied = true; r.finishedAt = 0; }
    h = html(g); expect(h).toContain('open'); expect(h).toContain('backed by a second link'); expect(h).toContain('One ring'); expect(h).toContain('Shared plant feeder'); expect(h).toContain('link-collapse-');
    collapseLink(g, linksOf(g).find(l => l.kind === 'tunnel')!.id);
    h = html(g); expect(h).toContain('out of service'); expect(h).toContain('link-repair-');
  });
  it('says why a link cannot be built', () => {
    const g = world(2, ['walkway']); const h = html(g);
    expect(h).toMatch(/already joined|not possible/);
  });
  it('uses plain words: nothing military in the text', () => { const h = html(world(2)); expect(/sortie|sally/i.test(h)).toBe(false); });
});
