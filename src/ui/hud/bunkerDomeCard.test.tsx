// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BunkerDomeCard } from './BunkerDomeCard';
import { DomeBunkerSection } from './DomeBunkerSection';
import { DomeSizeCard } from './DomeSizeCard';
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { newGame, type GameState, type Structure } from '../../sim/state';
import { bunkerSite } from '../../sim/dome/bunkerLive';
import { domeViews } from '../../sim/dome/live';
import { floorFt } from '../../sim/dome/bunker';

const S = (id: string, kind: string, x: number, z: number, stage: number, fin: number | null): Structure => ({ id, kind, x, z, rot: 0, stage, done: 0, supplied: true, finishedAt: fin });
const game = (stage: number): GameState => { const g = newGame(11); g.structures = [S('dm', 'dome_geodesic', 0, 0, stage, stage >= 5 ? 0 : null)]; return g; };
const rect = { x0: -0.25, z0: -0.25, x1: 0.25, z1: 0.25 };
const put = (g: GameState, tool: string | null, withDome = true) => {
  Object.assign(useGameStore.getInitialState(), { game: g, tool, bunkerSite: bunkerSite(g, 'bunker_hatch', rect, floorFt(1, 0.2)), bunkerWithDome: withDome, domeSite: null });
  Object.assign(useWorldStore.getInitialState(), { uiScale: 1, hudHidden: false });
};

describe('the bunker placing card', () => {
  it('shows only for a bunker piece inside a dome, and says the skirt protects it with both depths', () => {
    put(game(0), 'timber_cabin'); expect(renderToStaticMarkup(<BunkerDomeCard />)).toBe('');
    put(game(0), 'bunker_hatch');
    const h = renderToStaticMarkup(<BunkerDomeCard />);
    expect(h).toContain('Protected by the skirt'); expect(h).toContain('20 ft'); expect(h).toContain('17 ft');
    expect(h).toContain('Build the bunker with the dome');
  });
  it('offers the with-the-dome choice only while the crater is open', () => {
    put(game(1), 'bunker_hatch'); expect(renderToStaticMarkup(<BunkerDomeCard />)).toMatch(/data-testid="bunker-with-dome"[^>]*checked/);
    put(game(2), 'bunker_hatch'); const h = renderToStaticMarkup(<BunkerDomeCard />);
    expect(h).not.toContain('bunker-with-dome'); expect(h).toContain('crater is closed');
  });
  it('the dome card tells what a bunker already under it does to the skirt', () => {
    Object.assign(useGameStore.getInitialState(), { game: newGame(11), tool: 'dome_geodesic', domeSite: { tier: 'geodesic', cells: 7, ok: true, summary: 'open ground', footLine: 'A bunker stands under it, its floor 25 ft down: the skirt (20 ft) is taken 8 ft deeper (12 cu yd of concrete) to cover it.' } });
    expect(renderToStaticMarkup(<DomeSizeCard />)).toContain('taken 8 ft deeper');
  });
});

describe('the Dome page lists the bunker under it', () => {
  it('rows, the skirt cover and the refuge', () => {
    const g = game(99); g.structures[0].finishedAt = 0;
    g.structures.push(S('h', 'bunker_hatch', 0, 0, 99, 1), S('d', 'bunker_dorm', 0.5, 0.25, 99, 1), S('c', 'bunker_stores', -0.5, 0.25, 1, null));
    Object.assign(useGameStore.getInitialState(), { game: g });
    const v = domeViews(g)[0];
    const h = renderToStaticMarkup(<DomeBunkerSection v={v} />);
    expect(h).toContain('The bunker under it'); expect(h).toContain('Protected by the skirt'); expect(h).toContain('Refuge'); expect(h).toContain('building');
    expect(renderToStaticMarkup(<DomeBunkerSection v={{ ...v, ref: { ...v.ref, st: { ...g.structures[0], id: 'none' } } }} />)).toBe('');
  });
});

describe('the Projects row', () => {
  it('reads "Bunker shell: N percent" off the stages, and tracks them', async () => {
    const { DigLine } = await import('./ProjectsTab');
    const { stampUnderDome } = await import('../../sim/dome/bunkerLive');
    const g = game(1), a = S('a', 'bunker_dorm', 0, 0, 0, null); g.structures.push(a); stampUnderDome(g, a, { dome: 'dm', floorFt: 17 }, true);
    Object.assign(useGameStore.getInitialState(), { game: g });
    const at = (stage: number) => { a.stage = stage; a.done = 0; return renderToStaticMarkup(<DigLine st={g.structures[0]} />); };
    expect(at(0)).toContain('Bunker shell: 0 percent');
    const p = (h: string) => Number(/Bunker shell: (\d+) percent/.exec(h)![1]);
    expect(p(at(2))).toBeGreaterThan(p(at(1)));
    expect(at(4)).toContain('Bunker shell: 100 percent');
    g.structures = [g.structures[0]];
    expect(renderToStaticMarkup(<DigLine st={g.structures[0]} />)).not.toContain('Bunker shell');
  });
});
