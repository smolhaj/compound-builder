import { describe, expect, it, beforeEach } from 'vitest';
import { PAGES, hasPages, pagesOf, pickPage, visiblePages } from './subPages';
import { DRAWER_IDS } from './drawerRegistry';
import { FONT_SNAP, LABEL_WIDTHS, layoutACss, snapFont } from './layoutACss';
import { tipPlace } from './cardLayout';
import { useDrawerStore } from '../../store/drawerStore';
import { T } from './tokens';

describe('sub-pages', () => {
  it('every page list names a real drawer, has unique ids and a hover blurb, and the long drawers have chips', () => {
    for (const [d, defs] of Object.entries(PAGES)) {
      expect(DRAWER_IDS).toContain(d);
      expect(new Set(defs!.map(p => p.id)).size).toBe(defs!.length);
      for (const p of defs!) { expect(p.label.length).toBeGreaterThan(0); expect(p.blurb.length).toBeGreaterThan(4); }
    }
    for (const d of ['family', 'supplies', 'utilities', 'land', 'defense', 'outside', 'chronicle', 'board'] as const) expect(hasPages(d)).toBe(true);
    expect(hasPages('build')).toBe(false);
  });
  it('picks the saved page, else the first page that has something', () => {
    expect(pickPage('defense', undefined)).toBe('score');
    expect(pickPage('defense', 'walls')).toBe('walls');
    expect(pickPage('defense', 'nope')).toBe('score');
    expect(pickPage('family', 'dogs', new Set(['people', 'medical']))).toBe('people');   // an empty page is not picked
    expect(pickPage('family', 'medical', new Set(['people', 'medical']))).toBe('medical');
    expect(pickPage('outside', undefined, new Set(['neighbors']))).toBe('neighbors');
    expect(pickPage('outside', undefined, new Set())).toBe('world');
    expect(pickPage('build', 'x')).toBeNull();
  });
  it('chips are only for pages with something in them', () => {
    expect(visiblePages('family', new Set(['people', 'dogs'])).map(p => p.id)).toEqual(['people', 'dogs']);
    expect(visiblePages('family', null)).toHaveLength(pagesOf('family').length);
  });
  it('the Supplies chips carry every Farm view and the Land / Defense chips cover what Classic shows', () => {
    const sup = pagesOf('supplies').map(p => p.id);
    for (const v of ['season', 'fields', 'kitchen', 'animals', 'plan']) expect(sup).toContain(v);
    expect(pagesOf('defense').map(p => p.id)).toEqual(expect.arrayContaining(['score', 'staff', 'walls', 'ground', 'houses', 'road', 'checks']));
    expect(pagesOf('land').map(p => p.id)).toEqual(['place', 'paperwork', 'next']);
    expect(pagesOf('board').map(p => p.id)).toEqual(['status', 'feed', 'radio', 'log']);
  });
});

describe('layout A stylesheet', () => {
  it('snaps each ad-hoc size onto the five-step scale and never invents a size', () => {
    const steps = [T.font.fine, T.font.sm, T.font.body, T.font.title, T.font.display];
    for (const px of [9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 15]) expect(steps).toContain(snapFont(px));
    expect(snapFont(11.5)).toBe(12.5); expect(snapFont(12)).toBe(12.5); expect(snapFont(13)).toBe(13.5); expect(snapFont(14)).toBe(15); expect(snapFont(10.5)).toBe(11);
    for (const [px, step] of FONT_SNAP) expect(T.font[step]).toBe(snapFont(px));   // the table and the function agree
  });
  it('writes one rule per size, keyboard-only focus rings, and drops motion under prefers-reduced-motion', () => {
    const css = layoutACss();
    for (const [px] of FONT_SNAP) expect(css).toContain(`font-size: ${px}px`);
    expect(css).toContain(':focus-visible'); expect(css).toContain(':focus{outline:none}');
    expect(css).toMatch(/prefers-reduced-motion:reduce\)\{[^}]*animation:none!important;transition:none!important/);
    for (const w of LABEL_WIDTHS) expect(css).toContain(`width: ${w}px`);
    expect(css).not.toContain('data-drawer="');   // (the Classic server-render test counts that attribute)
  });
});

describe('hover card placement', () => {
  const a = { left: 100, right: 160, top: 300, bottom: 320 };
  it('goes under the anchor, centered, inside the window', () => {
    expect(tipPlace(a, 200, 80, 1000, 800)).toEqual({ left: 30, top: 326 });
    expect(tipPlace({ ...a, left: 0, right: 20 }, 200, 80, 1000, 800).left).toBe(8);
    expect(tipPlace({ ...a, left: 960, right: 990 }, 200, 80, 1000, 800).left).toBe(792);
  });
  it('flips above when there is no room below', () => {
    expect(tipPlace({ left: 100, right: 160, top: 760, bottom: 780 }, 200, 80, 1000, 800).top).toBe(674);
  });
});

describe('drawer pages and the Log shortcut', () => {
  beforeEach(() => { useDrawerStore.setState({ open: null, last: 'family', pages: {} }); });
  it('G opens the Board on its Log page, again closes; N then shows Status again', () => {
    const s = useDrawerStore.getState();
    s.toggle('log'); expect(useDrawerStore.getState().open).toBe('board'); expect(useDrawerStore.getState().pages.board).toBe('log');
    useDrawerStore.getState().toggle('log'); expect(useDrawerStore.getState().open).toBeNull();
    useDrawerStore.getState().showPage('board', 'radio'); expect(useDrawerStore.getState().pages.board).toBe('radio');
    useDrawerStore.getState().toggle('log'); expect(useDrawerStore.getState().pages.board).toBe('log');   // switches to the Log page rather than closing
  });
  it('remembers the page each drawer was left on', () => {
    useDrawerStore.getState().setPage('defense', 'walls'); useDrawerStore.getState().toggle('defense'); useDrawerStore.getState().toggle('defense'); useDrawerStore.getState().toggle('defense');
    expect(useDrawerStore.getState().pages.defense).toBe('walls');
  });
});
