// @vitest-environment node
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { newGame } from '../../sim/state';
import { triggerDisaster } from '../../sim/disaster';
import { TopBar } from './TopBar';
import { cardShift } from './cardLayout';

const render = () => renderToStaticMarkup(<TopBar barRef={createRef<HTMLDivElement>()} onBoard={() => undefined} onSide={() => undefined} />);
const withGame = (mut: (g: ReturnType<typeof newGame>) => void = () => undefined) => {
  const g = newGame(11); g.structures = []; g.perimeter = [];
  mut(g);
  Object.assign(useGameStore.getInitialState(), { game: g, tool: null, selected: null });
};

describe('layout A top bar (server-rendered)', () => {
  it('renders the clock, the speed buttons, all nine chips and the menu', () => {
    withGame();
    const html = render();
    for (const id of ['threat', 'cash', 'food', 'water', 'power', 'needs', 'defense', 'morale', 'fuel']) expect(html, id).toContain(`data-chip="${id}"`);
    expect(html).toContain('data-testid="top-menu"'); expect(html).toContain('aria-label="Game speed"'); expect(html).toContain('data-testid="top-clock"');
    expect(html).not.toContain('data-chip="debt"');
  });
  it('is one non-wrapping row', () => { withGame(); expect(render()).toContain('flex-wrap:nowrap'); });
  it('a problem chip carries its glyph, not only a color', () => {
    withGame(g => { triggerDisaster(g.disaster, g.clock.t, 'grid_down', g.seed, 10); g.clock.t = g.disaster.warnAt + 0.5; });
    const html = render();
    expect(html).toMatch(/data-chip="threat" data-tone="(warn|bad)"/);
    expect(html).toMatch(/[▲✕]/);
  });
  it('the layout defaults to Classic and the scale to 100 percent', () => {
    const w = useWorldStore.getInitialState(); expect(w.layout).toBe('classic'); expect(w.uiScale).toBe(1);
  });
});

describe('hover card placement', () => {
  it('keeps a card inside the window with an 8 px margin', () => {
    expect(cardShift(-30, 288, 1100)).toBe(38);
    expect(cardShift(900, 288, 1100)).toBe(1100 - 8 - (900 + 288));
    expect(cardShift(400, 288, 1100)).toBe(0);
  });
});
