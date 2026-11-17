/**
 * Layout A sub-page chips (ui/hud/subPages.ts): `<DrawerPages>` wraps a drawer's body, draws the chip row and shows one `<Page>` at a
 * time. A page is a wrapper around the Classic sections that belong to it; every page renders (hidden ones with `hidden`), so the
 * chip row can tell which pages have something in them and drop the empty ones. Outside layout A (no provider) a `<Page>` is a
 * plain fragment: Classic is unchanged.
 */
import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useDrawerStore } from '../../store/drawerStore';
import { useWorldStore } from '../../store/worldStore';
import type { DrawerId } from './drawerRegistry';
import { pickPage, visiblePages } from './subPages';
import { Tip } from './HoverCard';
import { T, tv, type Tone } from './tokens';
import { TONE } from './style';

interface Ctx { drawer: DrawerId; active: string | null }
const PageCtx = createContext<Ctx | null>(null);
/** The Classic sections of one page. Hidden (not unmounted) when another page is showing. */
export function Page({ id, children }: { id: string; children: ReactNode }) {
  const c = useContext(PageCtx);
  if (!c) return <>{children}</>;
  return <div data-page={id} hidden={c.active !== id}>{children}</div>;
}

const chipStyle = (on: boolean): React.CSSProperties => ({
  font: 'inherit', fontSize: tv.font('sm'), lineHeight: 1.2, cursor: 'pointer', padding: '4px 10px', minHeight: 26, boxSizing: 'border-box', borderRadius: T.radius.chip,
  border: `1px solid ${on ? tv.color('accent') : T.color.line}`, background: on ? tv.color('accent') : 'transparent', color: on ? tv.color('onAccent') : tv.color('text'), fontWeight: on ? T.weight.semi : T.weight.regular,
});

const isEmpty = (el: Element): boolean => (el.textContent ?? '').trim() === '' && !el.querySelector('input,button,svg,img,canvas');

export function DrawerPages({ drawer, alerts, always = false, children }: { drawer: DrawerId; /** A tone dot on a chip whose page wants attention. */ alerts?: Partial<Record<string, Tone>>; /** Keep every chip even if its page shows nothing (it shows its own empty state). */ always?: boolean; children: ReactNode }) {
  const saved = useDrawerStore(s => s.pages[drawer]), setPage = useDrawerStore(s => s.setPage), scale = useWorldStore(w => w.uiScale);
  const root = useRef<HTMLDivElement>(null);
  const [filled, setFilled] = useState<ReadonlySet<string> | null>(null);
  // which pages have anything in them (read after every render: the content changes as the game runs)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- no deps on purpose: the content changes as the game runs; setFilled bails out when nothing changed
  useLayoutEffect(() => {
    const el = root.current; if (!el) return;
    const ids = [...new Set([...el.querySelectorAll('[data-page]')].filter(p => !isEmpty(p)).map(p => p.getAttribute('data-page')!))];
    setFilled(old => (old && old.size === ids.length && ids.every(i => old.has(i)) ? old : new Set(ids)));
  });
  const seen = always ? null : filled;
  const active = pickPage(drawer, saved, seen ?? undefined);
  const chips = visiblePages(drawer, seen);
  return <PageCtx.Provider value={{ drawer, active }}>
    {chips.length > 1 && <div data-testid="page-chips" role="group" aria-label={`${drawer} pages`} style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, padding: '2px 0 8px', marginBottom: 4, background: 'rgb(26,28,23)' }}>
      {chips.map(p => {
        const on = p.id === active, tone = alerts?.[p.id];
        return <Tip key={p.id} scale={scale} card={<><div style={{ fontSize: tv.font('title'), fontWeight: T.weight.semi }}>{p.label}</div><div style={{ color: tv.color('dim') }}>{p.blurb}</div></>}>
          <button type="button" data-testid={`page-chip-${p.id}`} aria-pressed={on} onClick={() => setPage(drawer, p.id)} style={chipStyle(on)}>
            {p.label}{tone && <span aria-hidden style={{ marginLeft: 4, color: on ? tv.color('onAccent') : TONE[tone === 'info' ? 'good' : tone] }}>{tone === 'bad' ? T.glyph.bad : T.glyph.warn}</span>}
          </button>
        </Tip>;
      })}
    </div>}
    <div ref={root}>{children}</div>
  </PageCtx.Provider>;
}

/** `DrawerPages` in layout A, nothing around the body in Classic. */
export function MaybePages({ on, drawer, alerts, always, children }: { on: boolean; drawer: DrawerId; alerts?: Partial<Record<string, Tone>>; always?: boolean; children: ReactNode }) {
  return on ? <DrawerPages drawer={drawer} alerts={alerts} always={always}>{children}</DrawerPages> : <>{children}</>;
}
