/** The siege-wave clock on the HUD: a chip in the top bar (countdown + threat ladder) and a fuller card on the compound board. Reads sim/waveStatus.ts. */
import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { waveStatus, type WaveStatus } from '../sim/waveStatus';
import { dayIndex } from '../sim/state';
import { DIM, FS, TONE } from './hud/style';

/** Ten small steps, one per wave on the ladder: waves behind you filled, the coming one lit, the rest dark. */
function Ladder({ w }: { w: WaveStatus }) {
  return <span aria-hidden style={{ display: 'inline-flex', gap: 2, alignItems: 'flex-end' }}>
    {Array.from({ length: w.peak }, (_, i) => {
      const n = i + 1, state = n <= w.done ? 'past' : n === w.next ? 'next' : 'later';
      return <span key={n} style={{ width: 5, height: 6 + i * 1.6, borderRadius: 1, background: state === 'past' ? 'rgba(238,238,238,0.5)' : state === 'next' ? TONE[w.tone] : 'rgba(255,255,255,0.14)' }} />;
    })}
  </span>;
}

function useWave(): WaveStatus | null {
  const game = useGameStore(s => s.game);
  const day = dayIndex(game.clock.t);
  // worked out once a day (and when a card changes), not every frame
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => waveStatus(game), [day, game.gate.waves?.n, game.gate.pending, game.gate.incoming, game.disaster.phase]);
}

export function WaveChip({ onClick }: { onClick?: () => void }) {
  const w = useWave();
  if (!w) return null;
  return <button onClick={onClick} title={`${w.explain} ${w.expect}`} aria-label={`Siege wave clock: ${w.chip}`}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.25)', border: `1px solid ${TONE[w.tone]}`, borderRadius: 6, padding: '2px 8px', color: TONE[w.tone], cursor: 'pointer', fontSize: 13 }}>
    <b style={{ fontWeight: 600 }}>{w.chip}</b><Ladder w={w} />
  </button>;
}

export function WaveCard() {
  const w = useWave();
  if (!w) return null;
  const sign = w.phase === 'warning' ? 'Warning signs are showing: the road is changing. Get ready now.' : w.phase === 'arriving' ? 'They are on their way today.' : '';
  return <div style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <b>Raid waves</b><span style={{ color: TONE[w.tone] }}>{w.chip}</span><Ladder w={w} />
    </div>
    <div style={{ fontSize: FS.small, color: DIM, marginTop: 2 }}>{w.explain}</div>
    {w.expect && <div style={{ fontSize: FS.small, marginTop: 2 }}>{w.expect}</div>}
    {sign && <div style={{ fontSize: FS.small, marginTop: 2, color: TONE.bad }}>{sign}</div>}
  </div>;
}
