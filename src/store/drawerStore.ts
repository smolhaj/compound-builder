/**
 * Layout A drawer state (docs/UX_AUDIT.md 11.2): which one panel is open on the right, and the last one used.
 * UI only: nothing here is saved with the game; the last panel is remembered on this device (`cb.drawer.last`).
 * Each drawer also remembers which sub-page chip is showing (`pages`, in memory: a drawer reopens on the page it was left on).
 */
import { create } from 'zustand';
import { isDrawerId, nextOpen, resolveDrawer, type DrawerId } from '../ui/hud/drawerRegistry';

function savedLast(): DrawerId {
  try { const v = localStorage.getItem('cb.drawer.last'); if (isDrawerId(v)) return v; } catch { /* no storage */ }
  return 'family';
}
function remember(id: DrawerId): void { try { localStorage.setItem('cb.drawer.last', id); } catch { /* private mode */ } }

interface DrawerState {
  /** The open drawer, or null (closed). Starts closed: the world is the star. */
  open: DrawerId | null;
  /** The last drawer that was open; Tab brings it back. */
  last: DrawerId;
  /** The sub-page chip each drawer is on (absent = its first page). */
  pages: Partial<Record<DrawerId, string>>;
  toggle: (id: DrawerId) => void;
  show: (id: DrawerId) => void;
  /** Open a drawer on one of its sub-pages. */
  showPage: (id: DrawerId, page: string) => void;
  setPage: (id: DrawerId, page: string) => void;
  close: () => void;
  /** Open the last one (or close, when one is open). */
  reopen: () => void;
}

export const useDrawerStore = create<DrawerState>((set, get) => ({
  open: null,
  last: savedLast(),
  pages: {},
  toggle: id => {
    const r = resolveDrawer(id), cur = get();
    // `log` is the Board's Log page: pressing it again on that page closes, otherwise it switches to it
    if (r.page) {
      if (cur.open === r.id && cur.pages[r.id] === r.page) { set({ open: null }); return; }
      remember(r.id); set({ open: r.id, last: r.id, pages: { ...cur.pages, [r.id]: r.page } }); return;
    }
    const open = nextOpen(cur.open, r.id, 'toggle'); if (open) remember(open); set({ open, last: open ?? cur.last });
  },
  show: id => {
    const r = resolveDrawer(id), cur = get();
    if (cur.open === r.id && (!r.page || cur.pages[r.id] === r.page)) return;
    remember(r.id); set({ open: r.id, last: r.id, ...(r.page ? { pages: { ...cur.pages, [r.id]: r.page } } : {}) });
  },
  showPage: (id, page) => { const cur = get(); remember(id); set({ open: id, last: id, pages: { ...cur.pages, [id]: page } }); },
  setPage: (id, page) => { const cur = get(); if (cur.pages[id] !== page) set({ pages: { ...cur.pages, [id]: page } }); },
  close: () => { if (get().open !== null) set({ open: null }); },
  reopen: () => { const { open, last } = get(); set({ open: open ? null : last }); },
}));
