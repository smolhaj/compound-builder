// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Hud } from '../Hud';
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { useDrawerStore } from '../../store/drawerStore';
import { newGame } from '../../sim/state';
import { RoadAlert } from '../RoadPanel';

Object.defineProperty(globalThis, 'location', { value: { search: '' }, configurable: true });   // the Hud reads ?clean
const setup = (layout: 'a' | 'classic', open: 'family' | 'build' | null = null) => {
  const g = newGame(11);
  Object.assign(useGameStore.getInitialState(), { game: g, tool: null, selected: null, hudFocus: null });
  Object.assign(useWorldStore.getInitialState(), { layout, hudHidden: false, uiScale: 1, viewOpen: false });
  Object.assign(useDrawerStore.getInitialState(), { open });
  return renderToStaticMarkup(<Hud />);
};

describe('Hud under layout A (server-rendered)', () => {
  beforeEach(() => { Object.assign(useWorldStore.getInitialState(), { layout: 'classic' }); });
  it('Classic keeps its tab strips, toolbar and no action bar', () => {
    const html = setup('classic');
    expect(html).toContain('data-tab="family"'); expect(html).toContain('data-tab="build"'); expect(html).not.toContain('data-testid="action-bar"');
    expect(html).toContain('data-testid="view-toggle"'); expect(html).not.toContain('data-drawer');
  });
  it('A shows the action bar and the top bar, with both drawer hosts present but hidden while closed', () => {
    const html = setup('a');
    expect(html).toContain('data-testid="action-bar"'); expect(html).toContain('data-testid="top-bar-a"');
    expect(html).not.toContain('data-tab="family"'); expect(html).not.toContain('show-all-tabs');
    expect((html.match(/data-drawer="/g) ?? []).length).toBe(3);   // left, right and the Board
    expect(html.match(/data-drawer="[a-z]+" style="[^"]*display:none/g)?.length).toBe(3);
    expect((html.match(/data-testid="view-toggle"/g) ?? []).length).toBe(1);
  });
  it('A with People open shows the Family body in one visible drawer with a header and close button', () => {
    const html = setup('a', 'family');
    expect(html).toContain('data-testid="drawer-head-family"'); expect(html).toContain('data-testid="drawer-close"');
    expect(html.match(/data-drawer="right" style="[^"]*display:flex/)).not.toBeNull();
    expect(html.match(/data-drawer="left" style="[^"]*display:none/)).not.toBeNull();
    expect(html).toContain('Work and money');   // the Classic Family body, unchanged
  });
  it('A with Build open shows the Build body in the one drawer', () => {
    const html = setup('a', 'build');
    expect(html).toContain('data-testid="drawer-head-build"'); expect(html.match(/data-drawer="left" style="[^"]*display:flex/)).not.toBeNull();
  });
  it('the A Build drawer is the searchable catalog with chips and cards; Classic keeps the grouped list', () => {
    const html = setup('a', 'build');
    expect(html).toContain('data-testid="build-search"'); expect(html).toContain('data-testid="build-chips"'); expect(html).toContain('data-testid="build-ops"');
    expect((html.match(/data-testid="build-card"/g) ?? []).length).toBeGreaterThan(40);
    for (const c of ['Shelter', 'Water', 'Power', 'Food', 'Defense', 'Walls', 'Tools']) expect(html).toContain(`>${c}</button>`);
    const classic = setup('classic');
    expect(classic).not.toContain('build-card'); expect(classic).toContain('Home &amp; work');
  });
  it('A: Board is a drawer page, drawers carry sub-page chips, and Classic has no chips', () => {
    const html = setup('a', 'family');
    expect(html).toContain('data-drawer="board"'); expect(html).toContain('data-testid="layout-a-style"');
    expect(html).toContain('data-testid="page-chips"'); expect(html).toContain('data-testid="page-chip-medical"');
    expect(html).toContain('data-page="medical"'); expect(html).toContain('data-testid="bar-board"');
    const c = setup('classic');
    expect(c).not.toContain('data-page='); expect(c).not.toContain('page-chips'); expect(c).not.toContain('layout-a-style');
  });
  it('the road alert is a banner under the top bar in A and a card at the bottom in Classic', () => {
    const g = newGame(11);
    (g as unknown as { road: unknown }).road = { hail: { id: 'h', text: 'A man at the fence.', want: [], offer: [], begging: false, haggled: false } };
    Object.assign(useGameStore.getInitialState(), { game: g });
    Object.assign(useWorldStore.getInitialState(), { layout: 'a', uiScale: 1 });
    const a = renderToStaticMarkup(<RoadAlert />);
    expect(a).toContain('data-testid="road-hail"'); expect(a).toContain('translateX(-50%)'); expect(a).not.toContain('bottom:');
    Object.assign(useWorldStore.getInitialState(), { layout: 'classic' });
    const c = renderToStaticMarkup(<RoadAlert />);
    expect(c).toContain('bottom:'); expect(c).not.toContain('translateX(-50%)');
  });
});
