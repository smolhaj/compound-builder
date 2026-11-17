/**
 * Layout A drawer state (docs/UX_AUDIT.md 11.2): which one panel is open on the right, and the last one used.
 * UI only: nothing here is saved with the game; the last panel is remembered on this device (`cb.drawer.last`).
 */
import { create } from 'zustand';
import { isDrawerId, nextOpen, type DrawerId } from '../ui/hud/drawerRegistry';

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
  toggle: (id: DrawerId) => void;
  show: (id: DrawerId) => void;
  close: () => void;
  /** Open the last one (or close, when one is open). */
  reopen: () => void;
}

export const useDrawerStore = create<DrawerState>((set, get) => ({
  open: null,
  last: savedLast(),
  toggle: id => { const open = nextOpen(get().open, id, 'toggle'); if (open) remember(open); set({ open, last: open ?? get().last }); },
  show: id => { if (get().open === id) return; remember(id); set({ open: id, last: id }); },
  close: () => { if (get().open !== null) set({ open: null }); },
  reopen: () => { const { open, last } = get(); set({ open: open ? null : last }); },
}));
