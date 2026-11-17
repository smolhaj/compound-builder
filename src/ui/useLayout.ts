/** Layout switch plumbing: tokens on the root while layout A is on, and the Alt+L key. */
import { useEffect } from 'react';
import { useWorldStore } from '../store/worldStore';
import { applyTokens, removeTokens } from './hud/tokens';

export function useLayoutRoot(): void {
  const layout = useWorldStore(w => w.layout), scale = useWorldStore(w => w.uiScale);
  useEffect(() => {
    const root = document.documentElement;
    if (layout === 'a') applyTokens(root, scale); else removeTokens(root);
    return () => removeTokens(root);
  }, [layout, scale]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!(e.altKey && e.code === 'KeyL') || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      const w = useWorldStore.getState();
      w.setLayout(w.layout === 'a' ? 'classic' : 'a');
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
}
