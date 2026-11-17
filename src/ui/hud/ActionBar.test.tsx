// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionBar } from './ActionBar';
import { DRAWERS } from './drawerRegistry';
import { useWorldStore } from '../../store/worldStore';
import { useDrawerStore } from '../../store/drawerStore';

const render = (alerts = {}, dim: string[] = [], fresh: string[] = []) =>
  renderToStaticMarkup(<ActionBar alerts={alerts} dim={new Set(dim) as never} fresh={new Set(fresh) as never} tickerOn={false} />);

describe('layout A action bar (server-rendered)', () => {
  beforeEach(() => { Object.assign(useWorldStore.getInitialState(), { layout: 'a', hudHidden: false, uiScale: 1 }); Object.assign(useDrawerStore.getInitialState(), { open: null }); });

  it('has a button for every panel, in order, labelled, plus the views, cameras, View settings and Hide', () => {
    const html = render();
    let last = -1;
    for (const d of DRAWERS) { const i = html.indexOf(`data-testid="bar-${d.id}"`); expect(i, d.id).toBeGreaterThan(last); last = i; expect(html).toContain(`aria-label="${d.title} (${d.key})"`); }
    for (const v of ['full', 'cutaway', 'xray']) expect(html).toContain(`data-testid="bar-view-${v}"`);
    for (const c of ['diorama', 'walk', 'fly', 'cinematic']) expect(html).toContain(`data-testid="bar-cam-${c}"`);
    for (const t of ['bar-underground', 'view-toggle', 'bar-hide']) expect(html).toContain(`data-testid="${t}"`);
  });
  it('dims a panel with nothing to show yet but never hides it', () => {
    const html = render({}, ['defense', 'chronicle']);
    expect(html).toContain('data-testid="bar-defense"'); expect(html).toContain('data-testid="bar-chronicle"');
    expect(html).toMatch(/data-testid="bar-defense"[^>]*opacity:0\.62/);
  });
  it('an alert carries a glyph, not only a color', () => {
    const html = render({ supplies: 'bad', utilities: 'warn' });
    expect(html).toMatch(/data-testid="bar-supplies-alert"[^>]*>✕</); expect(html).toMatch(/data-testid="bar-utilities-alert"[^>]*>▲</);
  });
  it('marks a just-revealed panel', () => { expect(render({}, [], ['land'])).toContain('data-testid="new-land"'); });
  it('Hide panels keeps the views and cameras and drops the panel buttons', () => {
    Object.assign(useWorldStore.getInitialState(), { hudHidden: true });
    const html = render();
    expect(html).not.toContain('data-testid="bar-family"'); expect(html).toContain('data-testid="bar-cam-walk"'); expect(html).toContain('data-testid="bar-hide"');
  });
});
