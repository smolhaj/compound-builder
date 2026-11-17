/**
 * Layout A bottom action bar (docs/UX_AUDIT.md 11.2): one slim bar with a button for every panel (Build, People,
 * Supplies, Utilities, Land, Defense, Outside, Projects, Years, Log), then the view toggles (Walls, Cutaway, X-ray,
 * Underground), the camera modes (Diorama, Walk, Fly, Tour), the View settings and Hide. Clicking a panel button opens its
 * drawer (DrawerHost); a button whose panel has nothing to show yet is dimmed, never hidden. Alerts carry a glyph, so color
 * is never the only signal. Narrow windows drop the labels, then fold views and cameras into two menus (`barMode`).
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useWorldStore } from '../../store/worldStore';
import { useDrawerStore } from '../../store/drawerStore';
import { BarIcon, type BarIconId } from './actionIcons';
import { BAR_H, DRAWERS, EDGE, barBottom, barMode, type DrawerDef, type DrawerId } from './drawerRegistry';
import { CAMERAS, CAMERA_TIP, VIEWS } from './viewOptions';
import { HoverHost } from './HoverCard';
import { T, tv } from './tokens';
import { TONE, type Tone } from './style';

const GLYPH: Record<Tone, string> = { good: '', warn: T.glyph.warn, bad: T.glyph.bad };
const VIEW_ICON = { full: 'walls', cutaway: 'cutaway', xray: 'xray' } as const;
const CAM_ICON = { diorama: 'diorama', walk: 'walk', fly: 'fly', cinematic: 'tour' } as const;

const base: CSSProperties = { font: 'inherit', cursor: 'pointer', border: 0, borderRadius: tv.radius('control'), color: tv.color('text'), background: 'transparent', boxSizing: 'border-box', position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', padding: 0 };
/** A click should not leave a focus ring on the button (the keyboard still gets one). */
const noFocus = (e: { preventDefault: () => void }) => e.preventDefault();
const sep = <span aria-hidden style={{ width: 1, height: 26, background: T.color.line, margin: '0 6px', flex: 'none' }} />;

export function ActionBar({ alerts, dim, fresh, tickerOn }: { alerts: Partial<Record<DrawerId, Tone>>; dim: ReadonlySet<DrawerId>; fresh: ReadonlySet<DrawerId>; tickerOn: boolean }) {
  const w = useWorldStore();
  const open = useDrawerStore(s => s.open), toggle = useDrawerStore(s => s.toggle);
  const scale = w.uiScale;
  const [vw, setVw] = useState(() => (typeof window === 'undefined' ? 1512 : window.innerWidth));
  useEffect(() => { const f = () => setVw(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const mode = barMode(vw / scale);
  const [menu, setMenu] = useState<'look' | 'camera' | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setMenu(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('pointerdown', down); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key); };
  }, [menu]);

  const labels = mode === 'labels';
  const panelBtn = (d: DrawerDef) => {
    const on = open === d.id, alert = alerts[d.id], isNew = fresh.has(d.id) && !on, faded = dim.has(d.id) && !on && !alert;
    return <HoverHost key={d.id} up scale={scale} align="center" delay={200} card={<>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: tv.font('title'), fontWeight: T.weight.semi }}>
        <BarIcon id={d.id} /><span>{d.title}</span>
        <kbd style={{ marginLeft: 'auto', fontFamily: T.font.mono, fontSize: tv.font('fine'), border: `1px solid ${T.color.lineStrong}`, borderRadius: 4, padding: '1px 6px', color: tv.color('dim') }}>{d.key}</kbd>
      </div>
      <div style={{ color: tv.color('dim') }}>{d.blurb}</div>
      {alert && <div style={{ color: tv.color(alert) }}>{GLYPH[alert]} {alert === 'bad' ? 'Needs you now' : 'Worth a look'}</div>}
      {isNew && <div style={{ color: tv.color('info') }}>{T.glyph.info} New: this just became useful</div>}
      {faded && <div style={{ color: tv.color('dim') }}>Nothing to show here yet. It fills in as you play.</div>}
    </>}>
      <button type="button" data-testid={`bar-${d.id}`} data-open={on ? '1' : '0'} aria-pressed={on} aria-label={`${d.title} (${d.key})`} onMouseDown={noFocus} onClick={() => toggle(d.id)}
        style={{ ...base, flexDirection: 'column', gap: 2, width: labels ? 54 : 36, height: 40, background: on ? tv.color('accent') : 'transparent', color: on ? tv.color('onAccent') : tv.color('text'), opacity: faded ? 0.62 : 1, fontSize: tv.font('fine'), fontWeight: T.weight.semi, lineHeight: 1, boxShadow: on ? tv.shadow(1) : 'none' }}>
        <BarIcon id={d.id as BarIconId} size={labels ? 17 : 18} />
        {labels && <span>{d.label}</span>}
        {alert && <span aria-hidden data-testid={`bar-${d.id}-alert`} style={{ position: 'absolute', top: 1, right: 3, fontSize: 10, lineHeight: 1, color: on ? tv.color('onAccent') : TONE[alert], textShadow: on ? 'none' : '0 0 3px rgba(0,0,0,.9)' }}>{GLYPH[alert]}</span>}
        {isNew && !alert && <span aria-hidden data-testid={`new-${d.id}`} style={{ position: 'absolute', top: 3, right: 5, width: 6, height: 6, borderRadius: 3, background: tv.color('info') }} />}
      </button>
    </HoverHost>;
  };

  const small = (key: string, icon: BarIconId, label: string, tip: string, on: boolean, click: () => void, testid?: string): ReactNode =>
    <HoverHost key={key} up scale={scale} align="center" delay={200} card={<><div style={{ fontSize: tv.font('title'), fontWeight: T.weight.semi }}>{label}</div><div style={{ color: tv.color('dim') }}>{tip}</div></>}>
      <button type="button" data-testid={testid} aria-pressed={on} aria-label={label} onMouseDown={noFocus} onClick={click}
        style={{ ...base, width: 32, height: 32, background: on ? tv.color('accent') : 'transparent', color: on ? tv.color('onAccent') : tv.color('text') }}><BarIcon id={icon} size={17} /></button>
    </HoverHost>;

  const views = VIEWS.map(([v, label, tip]) => small(v, VIEW_ICON[v], label, tip, w.buildingView === v, () => w.setBuildingView(v), `bar-view-${v}`));
  const underground = small('ug', 'underground', 'Underground', 'See-through ground, bunker rooms cut open (U). It switches itself off when you put the bunker tool down.', w.underground, () => w.setUnderground(!w.underground), 'bar-underground');
  const cams = CAMERAS.map(([m, label]) => small(m, CAM_ICON[m], label, CAMERA_TIP[m], w.cameraMode === m, () => w.setCameraMode(m), `bar-cam-${m}`));
  const viewBtn = small('view', 'view', 'View settings', 'Season and weather look, graphics quality, frame rate, sightline and terrain overlays, blueprint, property line, photo mode', w.viewOpen, () => w.setViewOpen(!w.viewOpen), 'view-toggle');
  const hideBtn = small('hide', w.hudHidden ? 'show' : 'hide', w.hudHidden ? 'Show panels (H)' : 'Hide panels (H)', 'Hide or show the panels to see the whole map (H)', w.hudHidden, () => w.setHudHidden(!w.hudHidden), 'bar-hide');

  const popBtn = (id: 'look' | 'camera', icon: BarIconId, label: string, on: boolean, items: ReactNode) => <span key={id} style={{ position: 'relative', display: 'inline-flex' }}>
    <button type="button" data-testid={`bar-${id}-menu`} aria-expanded={menu === id} aria-label={label} title={label} onMouseDown={noFocus} onClick={() => setMenu(m => (m === id ? null : id))}
      style={{ ...base, width: 40, height: 32, gap: 2, background: on || menu === id ? tv.color('accent') : 'transparent', color: on || menu === id ? tv.color('onAccent') : tv.color('text') }}><BarIcon id={icon} size={17} /><span aria-hidden style={{ fontSize: 9 }}>▴</span></button>
    {menu === id && <div role="menu" data-testid="bar-popover" style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 4, padding: 6, background: 'rgba(20,22,18,0.97)', border: `1px solid ${T.color.lineStrong}`, borderRadius: tv.radius('panel'), boxShadow: tv.shadow(2) }}>{items}</div>}
  </span>;

  const hidden = w.hudHidden;
  return (
    <div ref={root} data-testid="action-bar" role="toolbar" aria-label="Panels and views" data-mode={mode}
      style={{ position: 'fixed', bottom: barBottom(tickerOn), left: '50%', transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'bottom center', zIndex: 3,
        height: BAR_H, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 2, padding: '0 8px', maxWidth: `${(vw - 2 * EDGE) / scale}px`,
        background: tv.color('panel'), border: `1px solid ${T.color.line}`, borderRadius: tv.radius('panel'), boxShadow: tv.shadow(2), color: tv.color('text'), fontFamily: tv.font('family'), width: 'max-content' }}>
      {!hidden && <>{DRAWERS.map(panelBtn)}{sep}</>}
      {mode === 'menus'
        ? <>{popBtn('look', 'look', 'Views: Walls, Cutaway, X-ray, Underground', w.buildingView !== 'full' || w.underground, <>{views}{underground}</>)}{popBtn('camera', 'camera', 'Camera: Diorama, Walk, Fly, Tour', w.cameraMode !== 'diorama', <>{cams}</>)}</>
        : <>{views}{underground}{sep}{cams}</>}
      {sep}{viewBtn}{hideBtn}
    </div>
  );
}
