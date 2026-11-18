// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DomeSizeCard } from './DomeSizeCard';
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { newGame } from '../../sim/state';
import { TIER } from '../../sim/dome/tiers';

const render = (tool: string | null, cells: Partial<Record<'geodesic' | 'glass', number>> = {}, site: ReturnType<typeof useGameStore.getState>['domeSite'] = null) => {
  Object.assign(useGameStore.getInitialState(), { game: newGame(11), tool, domeCells: cells, domeSite: site });
  Object.assign(useWorldStore.getInitialState(), { uiScale: 1, hudHidden: false });
  return renderToStaticMarkup(<DomeSizeCard />);
};

describe('the dome placing card', () => {
  beforeEach(() => { Object.assign(useGameStore.getInitialState(), { domeCells: {}, domeSite: null }); });
  it('shows only while a dome is armed', () => {
    expect(render(null)).toBe(''); expect(render('timber_cabin')).toBe('');
    expect(render('dome_geodesic')).toContain('data-testid="dome-size-card"');
  });
  it('says the usual diameter, the range, the bill and the key hints', () => {
    const html = render('dome_geodesic');
    expect(html).toContain('60 ft across'); expect(html).toContain('the usual size');
    expect(html).toContain(`min="${TIER.geodesic.minCells}"`); expect(html).toContain(`max="${TIER.geodesic.maxCells}"`);
    expect(html).toContain('Family builds it'); expect(html).toContain('County permit'); expect(html).toContain('Shift+wheel');
  });
  it('a bigger pick prices higher and reads the new diameter', () => {
    const usd = (h: string) => Number(/Family builds it<\/span><span[^>]*>\$([\d,]+)/.exec(h)![1].replace(/,/g, ''));
    const small = render('dome_geodesic', { geodesic: 5 }), big = render('dome_geodesic', { geodesic: 11 });
    expect(small).toContain('40 ft across'); expect(big).toContain('100 ft across');
    expect(usd(big)).toBeGreaterThan(usd(small));
  });
  it('shows what the circle covers, or why it cannot go there', () => {
    expect(render('dome_geodesic', {}, { tier: 'geodesic', cells: 7, ok: true, summary: '60 ft: covers 2 buildings, clears 5 trees' })).toContain('covers 2 buildings, clears 5 trees');
    expect(render('dome_geodesic', {}, { tier: 'geodesic', cells: 7, ok: false, summary: 'Part of the circle is outside your land' })).toContain('outside your land');
  });
  it('the store keeps the pick inside the tier\'s range', () => {
    const st = useGameStore.getState();
    st.setDomeCells('geodesic', 99); expect(useGameStore.getState().domeCells.geodesic).toBe(TIER.geodesic.maxCells);
    st.setDomeCells('geodesic', 0); expect(useGameStore.getState().domeCells.geodesic).toBe(TIER.geodesic.minCells);
  });
});
