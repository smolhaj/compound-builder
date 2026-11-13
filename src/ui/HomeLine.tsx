import { useEffect, useState } from 'react';
import { useWorldStore } from '../store/worldStore';

/** What someone in the house just said (sim/domesticLines.ts): a small caption low on the screen for a few seconds, while the camera is near the home. */
export function HomeLine() {
  const line = useWorldStore(s => s.homeLine);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!line) return;
    const t = window.setTimeout(() => { useWorldStore.getState().setHomeLine(null); tick(n => n + 1); }, 5200);
    return () => window.clearTimeout(t);
  }, [line]);
  if (!line) return null;
  const scared = line.tone === 'scared';
  return (
    <div data-testid="home-line" style={{ position: 'fixed', left: '50%', bottom: 96, transform: 'translateX(-50%)', maxWidth: 'min(520px, 90vw)', padding: '6px 14px', borderRadius: 8, background: scared ? 'rgba(60,24,20,0.82)' : 'rgba(34,26,16,0.78)', color: scared ? '#ffd2c4' : '#f4e4c0', fontSize: 14, fontStyle: 'italic', pointerEvents: 'none', zIndex: 3, textAlign: 'center' }}>
      <span style={{ fontStyle: 'normal', fontWeight: 600, opacity: 0.8 }}>{line.who}: </span>&ldquo;{line.text}&rdquo;
    </div>
  );
}
