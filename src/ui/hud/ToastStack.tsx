/**
 * Layout A toasts (docs/UX_AUDIT.md 11.5, tier 5): the refused-click line, the purchase result, what someone at home said and the
 * graphics-step notice, in one stack bottom-left, at most three, each a few seconds, never over a decision or a card (they wait, then
 * run their time). Classic keeps its own one-offs.
 */
import { useEffect, useState } from 'react';
import { useWorldStore } from '../../store/worldStore';
import { useToasts, startToastFeed } from './toastStore';
import { hintBottom } from './drawerRegistry';
import { T, tv } from './tokens';

export function ToastStack({ blocked }: { blocked: boolean }) {
  const scale = useWorldStore(w => w.uiScale);
  const list = useToasts(s => s.list);
  const viewOpen = useWorldStore(w => w.viewOpen);
  // the View box sits bottom-left over the action bar too: stack the toasts above it, not under it
  const [lift, setLift] = useState(0);
  useEffect(() => {
    if (!viewOpen) return;
    const read = () => { const el = document.querySelector('[data-view-box]'); setLift(el ? Math.max(0, window.innerHeight - el.getBoundingClientRect().top + 8) : 0); };
    read();
    const id = setInterval(read, 400);   // (the box grows and shrinks with its sections and the window)
    window.addEventListener('resize', read);
    return () => { clearInterval(id); window.removeEventListener('resize', read); };
  }, [viewOpen, scale]);
  useEffect(() => startToastFeed(), []);
  // a hold under a decision or a card does not eat their time: when it clears, every toast starts its clock again
  useEffect(() => { if (!blocked) useToasts.getState().refresh(); }, [blocked]);
  useEffect(() => {
    if (blocked) return;
    const id = setInterval(() => useToasts.getState().sweep(), 500);
    return () => clearInterval(id);
  }, [blocked]);
  if (blocked || !list.length) return null;
  const col = { good: tv.color('good'), warn: tv.color('warn'), info: tv.color('info') } as const;
  const glyph = { good: '', warn: `${T.glyph.warn} `, info: '' } as const;
  return (
    <div data-testid="toast-stack" role="status" aria-live="polite" style={{ position: 'fixed', left: T.edge, bottom: Math.max(hintBottom(scale, false), viewOpen ? lift : 0), zIndex: 5, width: 300, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none', transform: `scale(${scale})`, transformOrigin: 'bottom left', fontFamily: tv.font('family') }}>
      {list.map(t => <div key={t.id} data-testid="toast-a" data-tone={t.tone} style={{ pointerEvents: 'auto', display: 'flex', gap: 8, alignItems: 'flex-start', background: tv.color('panel'), color: tv.color('text'), border: `1px solid ${T.color.line}`, borderLeft: `3px solid ${col[t.tone]}`, borderRadius: tv.radius('panel'), boxShadow: tv.shadow(1), padding: '6px 8px 6px 10px', fontSize: tv.font('sm'), lineHeight: 1.3 }}>
        <span style={{ flex: 1 }}><span style={{ color: col[t.tone] }}>{glyph[t.tone]}</span>{t.text}</span>
        <button type="button" aria-label="Dismiss" onMouseDown={e => e.preventDefault()} onClick={() => { useToasts.getState().remove(t.id); if (t.id.startsWith('p')) useWorldStore.getState().setPerfNotice(null); }} style={{ all: 'unset', cursor: 'pointer', color: tv.color('dim'), padding: '0 2px' }}>{'×'}</button>
      </div>)}
    </div>
  );
}
