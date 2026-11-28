/**
 * Layout A drawers (docs/UX_AUDIT.md 11.2), pure: which panels exist, which Classic panel body hosts each, their hotkeys,
 * the drawer and action-bar geometry. One drawer shows at a time; the panel bodies are the same components Classic renders
 * in its tabs (Hud.tsx), so nothing is lost: every old tab is one of these ids.
 */
import type { RightTab } from '../../sim/tabReveal';

export type LeftPanel = 'build' | 'projects' | 'log';
/** `board` is the Compound board as a right drawer (Status, Feed, Radio, Log); `log` is a shortcut for its Log page. */
export type DrawerId = LeftPanel | RightTab | 'board';

export interface DrawerDef {
  id: DrawerId;
  /** Full title in the drawer header. */
  title: string;
  /** Action-bar label (short). */
  label: string;
  /** `KeyboardEvent.code` of the hotkey, and the letter shown to the player. */
  code: string;
  key: string;
  /** One line for the hover card: what is in it. */
  blurb: string;
  /** Classic panel that hosts the body: the left Build / Projects / Log panel or the right tabbed panel. */
  host: 'left' | 'right' | 'board';
}

/** Order is the action-bar order. */
export const DRAWERS: readonly DrawerDef[] = [
  { id: 'build', title: 'Build', label: 'Build', code: 'KeyB', key: 'B', host: 'left', blurb: 'Stake out buildings, wells, walls and paths; the starter compound and the goals' },
  { id: 'family', title: 'Family', label: 'Family', code: 'KeyF', key: 'F', host: 'right', blurb: 'Everyone on the place: health, work, kin, dogs, housing' },
  { id: 'supplies', title: 'Supplies', label: 'Supplies', code: 'KeyS', key: 'S', host: 'right', blurb: 'Food, stores, orders, the farm' },
  { id: 'utilities', title: 'Utilities', label: 'Utilities', code: 'KeyT', key: 'T', host: 'right', blurb: 'Water, power, fuel and heat' },
  { id: 'land', title: 'Land', label: 'Land', code: 'KeyL', key: 'L', host: 'right', blurb: 'Parcels to buy, boundaries, the lay of the land' },
  { id: 'defense', title: 'Defense', label: 'Defense', code: 'KeyD', key: 'D', host: 'right', blurb: 'Walls, gates, watch, rules for visitors' },
  { id: 'outside', title: 'Outside', label: 'Outside', code: 'KeyO', key: 'O', host: 'right', blurb: 'The county, neighbors, the road, the news' },
  { id: 'projects', title: 'Projects', label: 'Projects', code: 'KeyP', key: 'P', host: 'left', blurb: 'What is being built, who works on it, what it waits for' },
  { id: 'chronicle', title: 'Years', label: 'Years', code: 'KeyY', key: 'Y', host: 'right', blurb: 'The family chronicle, season by season' },
  { id: 'board', title: 'Board', label: 'Board', code: 'KeyN', key: 'N', host: 'board', blurb: 'The clipboard: vitals, the wave clock, what is different today, the radio, the log' },
  { id: 'log', title: 'Log', label: 'Log', code: 'KeyG', key: 'G', host: 'board', blurb: 'The latest events on the place (the Board, Log page)' },
];

export const DRAWER_IDS: readonly DrawerId[] = DRAWERS.map(d => d.id);
export const drawerDef = (id: DrawerId): DrawerDef => DRAWERS.find(d => d.id === id)!;
export const isDrawerId = (x: unknown): x is DrawerId => typeof x === 'string' && (DRAWER_IDS as readonly string[]).includes(x);
export const hostOf = (id: DrawerId): 'left' | 'right' | 'board' => drawerDef(id).host;
/** The drawer that actually opens for an id: `log` is the Board's Log page. */
export const resolveDrawer = (id: DrawerId): { id: DrawerId; page?: string } => (id === 'log' ? { id: 'board', page: 'log' } : { id });
export const drawerForCode = (code: string): DrawerId | null => DRAWERS.find(d => d.code === code)?.id ?? null;

/** What a request does to the open drawer: the same id again closes (toggle); another id replaces it. */
export function nextOpen(cur: DrawerId | null, id: DrawerId, how: 'toggle' | 'open' = 'toggle'): DrawerId | null {
  return how === 'toggle' && cur === id ? null : id;
}

// ---- geometry (design pixels; the HUD is scaled by the UI size setting, so callers pass the available size / scale) ----
export const EDGE = 16;
/** Top bar height and gap below it (layout A top bar is 44 design px at the top edge offset 10). */
export const TOP_BAR = { top: 10, h: 44, gap: 8 } as const;
export const BAR_H = 48;
export const DRAWER_W = { min: 360, max: 420 } as const;

/** Drawer width in design px: 380 wide, 360 on narrow windows, 420 on very wide ones; never more than 45 percent of the window. */
export function drawerWidth(availW: number): number {
  const w = availW >= 1700 ? DRAWER_W.max : availW >= 1280 ? 380 : DRAWER_W.min;
  return Math.max(280, Math.min(w, Math.floor(availW * 0.45)));
}

/**
 * Where the drawer sits. `top` and `right` are screen px (the drawer is scaled about its top-right corner); `width` and
 * `height` are design px, so on screen it is `width * scale` by `height * scale`: right edge, just below the top bar
 * (which is `TOP_BAR.h * scale` tall), down to just above the action bar.
 */
export function drawerBox(vw: number, vh: number, scale: number, barBottomPx: number): { top: number; right: number; width: number; height: number } {
  const s = scale || 1;
  const top = TOP_BAR.top + TOP_BAR.h * s + TOP_BAR.gap;
  const bottom = barBottomPx + BAR_H * s + 8;
  return { top, right: EDGE, width: drawerWidth(vw / s), height: Math.max(160, (vh - top - bottom) / s) };
}

export type BarMode = 'labels' | 'icons' | 'menus';
/** Widths of the action bar in each mode, design px (measured from the real buttons; the test sweeps the window sizes). */
export const BAR_W: Record<BarMode, number> = { labels: 1017, icons: 819, menus: 628 };
/** The richest mode that fits `availW` design px (window width over UI scale, less the margins). Pure. */
export function barMode(availW: number): BarMode {
  if (availW >= BAR_W.labels + 2 * EDGE) return 'labels';
  if (availW >= BAR_W.icons + 2 * EDGE) return 'icons';
  return 'menus';
}

/** Bottom offset of the action bar (screen px): above the news ticker when one is up. */
export const barBottom = (tickerOn: boolean): number => (tickerOn ? 34 : 12);
/** Bottom offset for a centered hint or caption so it clears the bar: the bar's top edge plus a gap (screen px). */
export const hintBottom = (scale: number, tickerOn: boolean): number => Math.round(barBottom(tickerOn) + BAR_H * scale + 10);
