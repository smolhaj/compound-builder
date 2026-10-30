/**
 * "Where the road comes in": suggest, then confirm. The planner tries a handful of places along the county-road line; each row shows what
 * that road would cost, how steep it is, how often snow shuts it, how long help takes and what it does to a raid, and hovering one draws
 * its route on the ground. The suggested entrance is marked; nothing changes until "Use this entrance" is pressed (and only until the
 * drive is ordered). Pure numbers from sim/roadEntrance.ts.
 */
import { useMemo, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { entranceChoiceFor } from '../../sim/roadEntrance';
import { setEntrancePreview } from '../../game/roadPreview';
import { DIM, TONE, btn, usd } from './style';

export function EntranceCard() {
  const game = useGameStore(s => s.game), setEntrance = useGameStore(s => s.setEntrance);
  const [open, setOpen] = useState(false), [msg, setMsg] = useState<string | null>(null);
  const locked = game.site.improvements.drive || game.siteJobs.drive !== null;
  // (a handful of road plans: only when the card is opened, and again only when the place, the blade or the choice changes)
  const haveBlade = game.stock.plow >= 1, entrance = game.site.entrance, seed = game.seed, siteId = game.site.id;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const choice = useMemo(() => (open ? entranceChoiceFor(game) : null), [open, entrance, haveBlade, seed, siteId]);
  if (locked || game.site.lot?.kind === 'island') return null;
  return (
    <div style={{ marginTop: 4 }}>
      <button style={btn(open)} onClick={() => { setOpen(!open); setMsg(null); if (open) setEntrancePreview(null); }}>{open ? 'Hide entrances' : 'Where should the road come in?'}</button>
      {open && choice && (
        <div style={{ marginTop: 4, display: 'grid', gap: 5 }} onMouseLeave={() => setEntrancePreview(null)}>
          {choice.options.map((o, i) => (
            <div key={o.z} onMouseEnter={() => setEntrancePreview(o.z)} style={{ padding: '5px 7px', borderRadius: 6, background: o.current ? 'rgba(216,201,160,0.16)' : 'rgba(255,255,255,0.05)', border: i === choice.suggested ? `1px solid ${TONE.good}` : '1px solid transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                <span><b>{usd(o.usd)}</b> <span style={{ color: DIM }}>· {o.days} days · {Math.round(o.gateZ * 6)} m along the line</span></span>
                <span style={{ color: TONE.good, fontSize: 11.5 }}>{i === choice.suggested ? 'Suggested' : ''}{o.current ? (i === choice.suggested ? ' · in use' : 'In use') : ''}</span>
              </div>
              <div style={{ color: DIM, fontSize: 11.5, lineHeight: 1.35, marginTop: 2 }}>{o.notes.join('. ')}.</div>
              {!o.current && <button style={{ ...btn(i === choice.suggested), marginTop: 4 }} onClick={() => { const why = setEntrance(o.z); setMsg(why ? `Not now: ${why}.` : 'Entrance marked: the drive will come in there.'); }}>Use this entrance</button>}
            </div>
          ))}
          {msg && <div style={{ color: DIM, fontSize: 11.5 }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}
