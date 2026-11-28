import { describe, expect, it, beforeEach } from 'vitest';
import { BAR_W, DRAWERS, DRAWER_IDS, EDGE, barMode, drawerBox, drawerDef, drawerForCode, drawerWidth, hintBottom, hostOf, isDrawerId, resolveDrawer, nextOpen, TOP_BAR, BAR_H, barBottom } from './drawerRegistry';
import { RIGHT_TABS } from '../../sim/tabReveal';
import { useDrawerStore } from '../../store/drawerStore';

describe('drawer registry', () => {
  it('registers every Classic tab exactly once: the 7 right tabs and the 3 left tabs', () => {
    expect(new Set(DRAWER_IDS).size).toBe(DRAWER_IDS.length);
    for (const t of RIGHT_TABS) expect(DRAWER_IDS).toContain(t);
    for (const t of ['build', 'projects', 'log', 'board']) expect(DRAWER_IDS).toContain(t);
    expect(DRAWERS.length).toBe(RIGHT_TABS.length + 4);   // + the Board drawer, and Log as its page
  });
  it('hosts left tabs in the left panel body and right tabs in the right one', () => {
    for (const t of RIGHT_TABS) expect(hostOf(t)).toBe('right');
    for (const t of ['build', 'projects'] as const) expect(hostOf(t)).toBe('left');
    for (const t of ['board', 'log'] as const) expect(hostOf(t)).toBe('board');
  });
  it('has unique hotkeys that avoid the camera and existing keys (V U H R Esc, Q E C, WASD pan keys other than S)', () => {
    const codes = DRAWERS.map(d => d.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of ['KeyV', 'KeyU', 'KeyH', 'KeyR', 'KeyW', 'KeyA', 'KeyQ', 'KeyE', 'KeyC']) expect(codes).not.toContain(c);
    for (const d of DRAWERS) expect(d.code).toBe('Key' + d.key);
    expect(drawerForCode('KeyB')).toBe('build'); expect(drawerForCode('KeyH')).toBeNull();
  });
  it('knows ids', () => { expect(isDrawerId('land')).toBe(true); expect(isDrawerId('board')).toBe(true); expect(isDrawerId('nope')).toBe(false); expect(resolveDrawer('log')).toEqual({ id: 'board', page: 'log' }); expect(resolveDrawer('land')).toEqual({ id: 'land' }); expect(drawerDef('chronicle').title).toBe('Years'); });
});

describe('drawer state', () => {
  beforeEach(() => { useDrawerStore.setState({ open: null, last: 'family' }); });
  it('nextOpen: same id toggles closed, another replaces, open never closes', () => {
    expect(nextOpen(null, 'land')).toBe('land');
    expect(nextOpen('land', 'land')).toBeNull();
    expect(nextOpen('land', 'defense')).toBe('defense');
    expect(nextOpen('land', 'land', 'open')).toBe('land');
  });
  it('shows exactly one drawer at a time and remembers the last', () => {
    const s = useDrawerStore.getState();
    s.toggle('supplies'); expect(useDrawerStore.getState().open).toBe('supplies');
    useDrawerStore.getState().toggle('land'); expect(useDrawerStore.getState().open).toBe('land');
    useDrawerStore.getState().close(); expect(useDrawerStore.getState().open).toBeNull();
    expect(useDrawerStore.getState().last).toBe('land');
    useDrawerStore.getState().reopen(); expect(useDrawerStore.getState().open).toBe('land');
    useDrawerStore.getState().reopen(); expect(useDrawerStore.getState().open).toBeNull();
  });
  it('show() is idempotent', () => {
    useDrawerStore.getState().show('family'); useDrawerStore.getState().show('family');
    expect(useDrawerStore.getState().open).toBe('family');
  });
});

describe('drawer and bar geometry', () => {
  const sizes: Array<[number, number]> = [[1512, 860], [1280, 720], [1100, 700], [900, 700], [1920, 1080]];
  it('width is 360 to 420 on desktop windows and at most 45 percent of narrow ones', () => {
    expect(drawerWidth(1512)).toBe(380); expect(drawerWidth(1100)).toBe(360); expect(drawerWidth(1920)).toBe(420);
    for (let w = 500; w <= 1920; w += 20) expect(drawerWidth(w)).toBeLessThanOrEqual(Math.max(280, w * 0.45));
  });
  it('the drawer never overlaps the top bar or the action bar, at every size and UI scale', () => {
    for (const [vw, vh] of sizes) for (const s of [0.9, 1, 1.25]) for (const tk of [false, true]) {
      const b = drawerBox(vw, vh, s, barBottom(tk));
      const topBarBottom = TOP_BAR.top + TOP_BAR.h * s;
      expect(b.top).toBeGreaterThanOrEqual(topBarBottom);
      const screenBottom = b.top + b.height * s;
      const barTop = vh - barBottom(tk) - BAR_H * s;
      expect(screenBottom).toBeLessThanOrEqual(barTop);
      expect(b.width * s + b.right).toBeLessThan(vw);
    }
  });
  it('leaves at least 700 px of map at 1100 wide at 100 percent', () => {
    const b = drawerBox(1100, 700, 1, 12);
    expect(1100 - b.width - b.right).toBeGreaterThanOrEqual(700);
  });
  it('the action bar mode always fits: labels, then icons, then two menus', () => {
    for (let vw = 700; vw <= 1920; vw += 20) for (const s of [0.9, 1, 1.25]) {
      const avail = vw / s, m = barMode(avail);
      expect(BAR_W[m] + 2 * EDGE).toBeLessThanOrEqual(Math.max(avail, BAR_W.menus + 2 * EDGE));
    }
    expect(barMode(1512)).toBe('labels'); expect(barMode(1280)).toBe('labels'); expect(barMode(1100)).toBe('labels');
    expect(barMode(1100 / 1.25)).toBe('icons'); expect(barMode(BAR_W.icons + 2 * EDGE - 1)).toBe('menus'); expect(barMode(BAR_W.icons + 2 * EDGE)).toBe('icons'); expect(barMode(700)).toBe('menus');
  });
  it('hints sit above the bar, higher when the ticker is up', () => {
    expect(hintBottom(1, false)).toBeGreaterThan(12 + BAR_H);
    expect(hintBottom(1, true)).toBeGreaterThan(hintBottom(1, false));
    expect(hintBottom(1.25, false)).toBeGreaterThan(hintBottom(1, false));
  });
});

describe('drawer names agree everywhere', () => {
  it('the action-bar label is the drawer title, so the button, the hover card and the drawer header never disagree', () => {
    for (const d of DRAWERS) expect(d.label, d.id).toBe(d.title);
  });
  it('the Family drawer says Family (hotkey F), not People', () => {
    expect(drawerDef('family')).toMatchObject({ label: 'Family', key: 'F' });
  });
});
