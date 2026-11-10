/** The camera and the album (sim/photos.ts): a shutter button with a caption in the View panel, the album in the Years tab, thumbnails on chronicle lines. */
import { useState, useSyncExternalStore } from 'react';
import { useGameStore } from '../store/gameStore';
import { capturePhoto } from '../game/photoCapture';
import { photoData, vaultSubscribe, vaultVersion } from '../sim/save/photoVault';
import { MAX_CAPTION, MAX_PHOTOS, defaultCaption, photosOf } from '../sim/photos';
import { Note, Section } from './hud/common';
import { DIM, LINE, btn } from './hud/style';

const useVault = () => useSyncExternalStore(vaultSubscribe, vaultVersion);

/** Shutter: takes the picture the camera sees right now (the view, the weather, the hour) and keeps it with a caption. */
export function PhotoShutter() {
  const keep = useGameStore(s => s.keepPhoto), game = useGameStore(s => s.game);
  const [cap, setCap] = useState(''), [msg, setMsg] = useState<string | null>(null);
  const n = photosOf(game).length;
  const snap = () => {
    const d = capturePhoto();
    if (!d) { setMsg('No picture: the camera is not ready.'); return; }
    const why = keep(d, cap);
    setMsg(why ?? 'Kept in the album (Years tab).');
    if (!why) setCap('');
    setTimeout(() => setMsg(null), 3500);
  };
  return <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
    <input data-testid="photo-caption" value={cap} maxLength={MAX_CAPTION} placeholder={defaultCaption(game)} onChange={e => setCap(e.target.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') snap(); }}
      style={{ width: 170, background: 'rgba(0,0,0,0.35)', color: 'inherit', border: `1px solid ${LINE}`, borderRadius: 4, padding: '2px 6px', font: 'inherit' }} />
    <button data-testid="photo-take" style={btn(false)} title={`Keep a picture of this view with a caption. The album holds ${MAX_PHOTOS}; the oldest is let go when it is full.`} onClick={snap}>Take photo ({n}/{MAX_PHOTOS})</button>
    {msg && <span style={{ opacity: 0.85 }}>{msg}</span>}
  </span>;
}

export function Thumb({ id, width = 120, onClick }: { id: string; width?: number; onClick?: () => void }) {
  useVault();
  const d = photoData(id);
  if (!d) return null;
  return <img src={d} alt="" width={width} onClick={onClick} style={{ display: 'block', borderRadius: 3, border: `1px solid ${LINE}`, cursor: onClick ? 'zoom-in' : undefined, maxWidth: '100%' }} />;
}

export function Album() {
  const g = useGameStore(), toss = g.tossPhoto, list = photosOf(g.game);
  const [open, setOpen] = useState<string | null>(null);
  useVault();
  return <Section title={`Photos ${list.length}/${MAX_PHOTOS}`}>
    {list.length === 0 && <Note>Open View, then Photo, set the hour and the day, and take a picture of the place. It is kept here and in the chronicle.</Note>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {[...list].reverse().map(p => <div key={p.id} data-testid="album-photo" style={{ width: 120 }}>
        <Thumb id={p.id} onClick={() => setOpen(p.id)} />
        <div style={{ fontSize: 11, lineHeight: 1.25, marginTop: 2 }}>{p.caption}</div>
        <div style={{ fontSize: 10.5, color: DIM }}>Year {p.year} · <a href="#" style={{ color: DIM }} onClick={e => { e.preventDefault(); toss(p.id); }}>throw away</a></div>
      </div>)}
    </div>
    {open && <div onClick={() => setOpen(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
      <div style={{ maxWidth: '86vw' }}><Thumb id={open} width={Math.min(960, window.innerWidth * 0.84)} /><div style={{ color: '#eee', marginTop: 6, textAlign: 'center' }}>{list.find(p => p.id === open)?.caption}</div></div>
    </div>}
  </Section>;
}
