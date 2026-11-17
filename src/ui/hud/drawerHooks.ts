/**
 * Layout A drawer plumbing (docs/UX_AUDIT.md 11.2): the frame style of the visible drawer, window size, the hotkeys, and the
 * bottom offset hints use to clear the action bar.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { useWorldStore } from '../../store/worldStore';
import { useGameStore } from '../../store/gameStore';
import { useDrawerStore } from '../../store/drawerStore';
import { drawerBox, drawerForCode, barBottom, hintBottom } from './drawerRegistry';
import { T, tv } from './tokens';

/** The frame of the visible drawer (the host panel that shows it); `visible` false keeps the panel out of the layout. */
export function drawerFrame(vw: number, vh: number, scale: number, tickerOn: boolean, visible: boolean): CSSProperties {
  const b = drawerBox(vw, vh, scale, barBottom(tickerOn));
  return {
    position: 'fixed', top: b.top, right: b.right, width: b.width, maxHeight: b.height, boxSizing: 'border-box', zIndex: 4,
    transform: `scale(${scale})`, transformOrigin: 'top right', display: visible ? 'flex' : 'none', flexDirection: 'column', minHeight: 0,
    background: tv.color('panel'), border: `1px solid ${T.color.line}`, borderRadius: tv.radius('panel'), boxShadow: tv.shadow(2),
    color: tv.color('text'), fontFamily: tv.font('family'), fontSize: tv.font('sm'), padding: `${T.space[2]}px ${T.space[3]}px`,
  };
}

const typing = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

/**
 * Hotkeys while layout A is on: a panel letter toggles that drawer (B P F S T L D O Y G), Tab brings the last one back, Esc
 * closes it. Letters only work in the Diorama camera and not while a tool is armed or a window is up (the Walk / Fly camera
 * uses WASD; placing uses R and S). Esc closes only when nothing above the drawer wants it (a tool, the Board, the Shop, a menu).
 */
export function useDrawerKeys(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const busy = () => { const g = useGameStore.getState(); return !!g.tool || g.shopOpen || g.setupOpen; };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      const w = useWorldStore.getState(), ds = useDrawerStore.getState();
      if (e.code === 'Escape') {
        if (ds.open === null || busy() || w.boardOpen || w.cameraMode !== 'diorama') return;
        if (document.querySelector('[data-testid="top-menu-panel"],[data-testid="top-overflow-menu"],[data-testid="bar-popover"]')) return;
        ds.close(); (document.activeElement as HTMLElement | null)?.blur?.(); return;   // (and drop the focus ring left on the bar button that opened it)
      }
      if (e.repeat || e.shiftKey || w.cameraMode !== 'diorama' || busy()) return;
      if (e.code === 'Tab') {
        const t = e.target as HTMLElement | null;
        if (t && t !== document.body && t.tagName !== 'CANVAS') return;   // Tab keeps moving focus anywhere else
        e.preventDefault(); ds.reopen(); return;
      }
      const id = drawerForCode(e.code);
      if (id) { e.preventDefault(); ds.toggle(id); }
    };
    window.addEventListener('keydown', onKey, true);   // capture: read the state before Esc closes anything else
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);
}

/** Window size, kept current. */
export function useWindowSize(): { vw: number; vh: number } {
  const read = () => ({ vw: typeof window === 'undefined' ? 1512 : window.innerWidth, vh: typeof window === 'undefined' ? 860 : window.innerHeight });
  const [s, setS] = useState(read);
  useEffect(() => { const f = () => setS(o => { const n = read(); return n.vw === o.vw && n.vh === o.vh ? o : n; }); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return s;
}

/**
 * Bottom offset (screen px) for a hint or card that sits at the bottom of the screen: its Classic value, or, in layout A, high
 * enough to clear the action bar (and the news ticker when it is up). Classic is untouched.
 */
export function useHintBottom(classic: number): number {
  const layout = useWorldStore(w => w.layout), scale = useWorldStore(w => w.uiScale);
  const ticker = useGameStore(s => s.game.disaster.news.length > 0);
  return layout === 'a' ? Math.max(classic, hintBottom(scale, ticker)) : classic;
}
