/** The title screen: New game, and Continue when there is a save. The world behind it is paused. Skipped for QA starts (`?seed=`). */
import { useGameStore } from '../../store/gameStore';
import { useFeelStore } from '../../store/feelStore';
import { useWorldStore } from '../../store/worldStore';
import { continueGame } from './continueGame';

const gold = '#d8c9a0';
const big = { padding: '12px 34px', borderRadius: 8, border: 0, fontSize: 17, fontWeight: 600, cursor: 'pointer', minWidth: 230 } as const;

export function TitleScreen() {
  const open = useFeelStore(s => s.title), hasSave = useFeelStore(s => s.hasSave);
  const setTitle = useFeelStore(s => s.setTitle);
  const hidden = useWorldStore(w => w.hudHidden);
  if (!open || hidden) return null;
  return <div role="dialog" aria-label="Compound Builder" data-testid="title-screen" style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: 'linear-gradient(180deg, rgba(10,12,9,0.78) 0%, rgba(10,12,9,0.45) 45%, rgba(10,12,9,0.82) 100%)', color: '#eee', textAlign: 'center', padding: 20 }}>
    <div style={{ fontSize: 'clamp(38px, 7vw, 68px)', fontFamily: 'Georgia, "Times New Roman", serif', letterSpacing: 2, color: gold, textShadow: '0 2px 18px rgba(0,0,0,0.7)' }}>Compound Builder</div>
    <div style={{ fontSize: 16, opacity: 0.85, maxWidth: 480, marginBottom: 14 }}>Build a home, feed your family and get ready for the day everything changes.</div>
    {hasSave && <button autoFocus style={{ ...big, background: gold, color: '#1c1d18' }} onClick={continueGame}>Continue</button>}
    <button autoFocus={!hasSave} style={{ ...big, background: hasSave ? '#3a3d34' : gold, color: hasSave ? '#eee' : '#1c1d18' }} onClick={() => { setTitle(false); useGameStore.getState().openSetup(true, hasSave); }}>New game</button>
    {hasSave && <div style={{ fontSize: 12.5, opacity: 0.6, maxWidth: 380 }}>Continue picks up your last saved game, paused. Starting a new game keeps your old one until you save over it.</div>}
  </div>;
}
