/**
 * The hit moment (docs/FELT_LAYER.md 5.1): a CSS-only letterbox cinematic over the frozen frame, at most 6 s, real time with the sim paused.
 * Any key or click skips. It always ends by calling `hitDone(dayCard)`, which frees the day card. Text and visuals only.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useFeltStore } from '../../store/feltStore';
import { shakeOffset } from '../../game/felt/cameraKick';
import { setHitLive } from '../../game/felt/hitLive';
import { at, duration, hitFor, reduceMotion } from '../../sim/felt/hitMoment';

const serif = 'Georgia, "Times New Roman", serif';
const reduced = (): boolean => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export function HitMoment() {
  const hitAt = useGameStore(s => s.dayCard);
  const kind = useGameStore(s => s.game.disaster.kind);
  const seq = useMemo(() => { const h = hitFor(kind); return h && reduced() ? reduceMotion(h) : h; }, [kind]);
  const [t, setT] = useState(0);
  const ended = useRef(false);

  useEffect(() => {
    if (hitAt === null) return;
    ended.current = false;
    const end = () => { if (ended.current) return; ended.current = true; useFeltStore.getState().hitDone(hitAt); };
    if (!seq) { end(); return; }
    const total = duration(seq), t0 = performance.now();
    let raf = 0;
    const loop = () => { const now = (performance.now() - t0) / 1000; setT(now); if (now >= total) end(); else raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const skip = () => end();
    window.addEventListener('keydown', skip);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', skip); };
  }, [hitAt, seq]);

  const f = useMemo(() => (seq ? at(seq, t) : null), [seq, t]);
  // the shake moves the canvas itself (a CSS transform, no extra pass)
  useEffect(() => {
    const cv = document.querySelector('canvas') as HTMLCanvasElement | null;
    if (!cv) return;
    const o = f ? shakeOffset(f.shake, t, reduced()) : { x: 0, y: 0 };
    cv.style.transform = o.x || o.y ? `translate(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px) scale(1.03)` : '';
  }, [f, t]);
  // the canvas nudges its camera toward the beat's bearing and flashes the weather with it (FL2, game/felt/hitLive.ts)
  useEffect(() => { setHitLive(f ? { flash: f.flash, tint: f.tint, bearing: f.bearing } : null); }, [f]);
  useEffect(() => () => setHitLive(null), []);
  useEffect(() => () => { const cv = document.querySelector('canvas') as HTMLCanvasElement | null; if (cv) cv.style.transform = ''; }, []);

  if (!seq || !f || hitAt === null) return null;
  const bar = Math.min(1, t / 0.6) * 12;   // % of the height, eased in
  const tint = f.tint ?? [1, 1, 1];
  const wash = `rgba(${tint.map(c => Math.round(c * 255)).join(',')},${f.flash.toFixed(3)})`;
  return (
    <div role="dialog" aria-label="The hit" data-testid="hit-moment" onClick={() => { useFeltStore.getState().hitDone(hitAt); }}
      style={{ position: 'fixed', inset: 0, zIndex: 15, cursor: 'pointer', overflow: 'hidden', background: 'rgba(0,0,0,0.12)' }}>
      <div style={{ position: 'absolute', inset: 0, background: wash, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${bar}%`, background: '#000' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${bar}%`, background: '#000' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${bar + 4}%`, textAlign: 'center', padding: '0 24px', fontFamily: serif, color: '#f1ebdb', textShadow: '0 2px 10px rgba(0,0,0,0.9)', pointerEvents: 'none' }}>
        {f.title
          ? <div style={{ fontSize: 'clamp(24px, 4vw, 44px)', fontWeight: 700, lineHeight: 1.15 }} data-testid="hit-title">{f.title}</div>
          : <div style={{ fontSize: 'clamp(16px, 2.2vw, 24px)', fontStyle: 'italic', minHeight: 30 }} data-testid="hit-caption">{f.caption}</div>}
      </div>
      <div style={{ position: 'absolute', right: 14, top: 8, fontSize: 11, fontFamily: 'system-ui, sans-serif', color: '#f1ebdb', opacity: 0.6, pointerEvents: 'none' }}>Click or press any key to skip</div>
    </div>
  );
}
