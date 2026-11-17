/**
 * Layout A drawer plumbing (docs/UX_AUDIT.md 11.2): the frame style of the visible drawer, window size, the hotkeys, and the
 * bottom offset hints use to clear the action bar.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { useWorldStore } from '../../store/worldStore';
import { useGameStore } from '../../store/gameStore';
import { useDrawerStore } from '../../store/drawerStore';
import { useFeelStore } from '../../store/feelStore';
import { feltCardPending } from '../../sim/felt/state';
import { escTop, type EscSnapshot } from './escStack';
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

/** What is up right now, as the Esc stack reads it (ui/hud/escStack.ts). */
export function escSnapshot(): EscSnapshot {
  const g = useGameStore.getState(), w = useWorldStore.getState(), ds = useDrawerStore.getState();
  const blocking = feltCardPending(g.game) || !!(g.game.gate.pending || g.game.gate.card || g.game.gate.aftermath) || g.dayCard !== null || useFeelStore.getState().recap !== null;
  const welcome = g.welcome && !blocking && !g.setupOpen;
  return {
    tool: !!g.tool || g.planOpen,
    overlay: blocking || welcome,
    window: w.boardOpen || g.shopOpen || g.setupOpen || g.scheduleOpen || !!document.querySelector('[data-testid="top-menu-panel"],[data-testid="top-overflow-menu"],[data-testid="bar-popover"]'),
    camera: w.cameraMode !== 'diorama',
    view: w.viewOpen,
    drawer: ds.open !== null,
  };
}

/**
 * Hotkeys while layout A is on: a panel letter toggles that drawer (B P F S T L D O Y G), N the Compound board, M the Shop & money,
 * Tab brings the last drawer back, Esc closes the top layer of the Esc stack (one press, one thing). Letters only work in the
 * Diorama camera and not while a tool is armed or a window is up (the Walk / Fly camera uses WASD; placing uses R and S).
 */
export function useDrawerKeys(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const busy = () => { const g = useGameStore.getState(); return !!g.tool || g.shopOpen || g.setupOpen; };
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      const w = useWorldStore.getState(), ds = useDrawerStore.getState();
      if (e.code === 'Escape') {
        const top = escTop(escSnapshot());
        if (top === 'drawer') { ds.close(); (document.activeElement as HTMLElement | null)?.blur?.(); }   // (and drop the focus ring left on the bar button that opened it)
        else if (top === 'view') w.setViewOpen(false);
        else if (top === 'overlay' && useGameStore.getState().welcome) useGameStore.getState().setWelcome(false);
        return;   // every other layer closes itself, and nothing underneath it closes on this press
      }
      if (e.repeat || e.shiftKey || w.cameraMode !== 'diorama' || busy()) return;
      if (e.code === 'Tab') {
        const t = e.target as HTMLElement | null;
        if (t && t !== document.body && t.tagName !== 'CANVAS') return;   // Tab keeps moving focus anywhere else
        e.preventDefault(); ds.reopen(); return;
      }
      if (e.code === 'KeyN' || e.code === 'KeyM') {   // the Board and the Shop live in the action bar, not in a drawer
        if (escTop(escSnapshot()) === 'overlay' || w.boardOpen) return;
        e.preventDefault();
        if (e.code === 'KeyN') w.setBoardOpen(true); else useGameStore.getState().openShop(!useGameStore.getState().shopOpen);
        return;
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
  // (layout A has no bottom strip: breaking news is a banner under the top bar)
  return layout === 'a' ? Math.max(classic, hintBottom(scale, false)) : classic;
}
