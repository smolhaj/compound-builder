/** Layout A breaking-news banner (docs/UX_AUDIT.md 11.4): top center under the bar, one line, 12 s or until closed, true emergencies only (ui/hud/tickerPlan.ts). */
import { useEffect, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { useHudText } from '../../store/hudTextStore';
import { BANNER_MS, bannerFor } from './tickerPlan';
import { T, tv } from './tokens';
import { TOP_BAR } from './drawerRegistry';

export function BreakingBanner({ blocked }: { blocked: boolean }) {
  const news = useGameStore(g => g.game.disaster.news), t = useGameStore(g => g.game.clock.t), scale = useWorldStore(w => w.uiScale);
  const onScreen = useHudText(h => h.onScreen);
  const [gone, setGone] = useState<number | null>(null);
  const n = blocked ? null : bannerFor(news, t, gone, onScreen);
  const key = n?.t ?? null;
  useEffect(() => {
    if (key === null) return;
    const id = setTimeout(() => setGone(key), BANNER_MS);
    return () => clearTimeout(id);
  }, [key]);
  if (!n) return null;
  const bad = n.tone === 3;
  return (
    <div data-testid="breaking-banner" role="alert" style={{ position: 'fixed', top: TOP_BAR.top + T.size.bar * scale + TOP_BAR.gap, left: '50%', transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center', zIndex: 3, maxWidth: 'min(640px, calc(100vw - 700px))', minWidth: 280,
      display: 'flex', gap: 8, alignItems: 'center', background: tv.color('panel'), border: `1px solid ${T.color.line}`, borderLeft: `3px solid ${bad ? tv.color('bad') : tv.color('warn')}`, borderRadius: tv.radius('panel'), boxShadow: tv.shadow(2), padding: '6px 8px 6px 12px', color: tv.color('text'), fontFamily: tv.font('family'), fontSize: tv.font('body') }}>
      <span aria-hidden style={{ color: bad ? tv.color('bad') : tv.color('warn'), fontWeight: T.weight.bold }}>{bad ? T.glyph.bad : T.glyph.warn}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{n.text}</span>
      <button type="button" aria-label="Dismiss" onMouseDown={e => e.preventDefault()} onClick={() => setGone(n.t)} style={{ all: 'unset', cursor: 'pointer', color: tv.color('dim'), padding: '0 4px' }}>{'×'}</button>
    </div>
  );
}
