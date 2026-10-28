/**
 * Defense tab: "Light discipline" (sim/blackout.ts). What is lit, how visible the compound is
 * from the road, the manual lights-out switch, the family's automatic routine, and the curtains.
 */
import type { CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { alwaysLit } from '../sim/lights';
import { floodTowerIds } from '../sim/towers';
import { AUTO_HELP, AUTO_MODES, AUTO_NAME, autoMode, curtainCover, curtainSets, darkness, lightLines, lightsOutReason, nightNow, visibilityOf, VISIBILITY_NAME, windowSets } from '../sim/blackout';
import { raidPressure } from '../sim/opsec';

const DIM = 'rgba(238,238,238,0.6)';
const btn = (on = false): CSSProperties => ({ padding: '4px 9px', borderRadius: 6, border: 0, cursor: 'pointer', background: on ? '#d8c9a0' : '#3a3d34', color: on ? '#1c1d18' : '#eee', fontSize: 12.5 });
const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0' };
const REASON = { manual: 'switched on by you', dusk: 'every-dusk routine', warned: 'a warning sign' } as const;

export function LightDiscipline() {
  const game = useGameStore(s => s.game);
  const st = useGameStore.getState();
  const lines = lightLines(game, alwaysLit(game, floodTowerIds(game)));
  const total = lines.reduce((a, l) => a + l.points, 0);
  const vis = visibilityOf(total);
  const why = lightsOutReason(game);
  const sets = curtainSets(game), need = windowSets(game);
  const dark = darkness(game);
  const tone = vis === 'dark' ? '#8fc98f' : vis === 'faint' ? '#d8c9a0' : '#e0907a';
  return <div style={{ padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
    <div style={{ fontWeight: 600, padding: '4px 0' }}>Light discipline</div>
    <div style={{ color: DIM, fontSize: 12, paddingBottom: 4 }}>Part of the night-time suite. A lit compound is seen from the road, by neighbors and by scouts; raids and visitors follow. A dark one is safer, but work, cooking and the kids' mood suffer in rooms with no curtains.</div>
    <div style={row}><span>Seen from the road</span><span style={{ color: tone }}>{VISIBILITY_NAME[vis]} · raids ×{raidPressure(game).toFixed(2)}</span></div>
    {lines.map(l => <div key={l.id} style={row} title={l.note}><span style={{ color: DIM }}>{l.label} <i>({l.note})</i></span><span>{l.points > 0 ? `+${Math.round(l.points * 10) / 10}` : '0'}</span></div>)}
    <div style={{ ...row, paddingTop: 4 }}><span>Lights out now</span><span>{why ? `Yes (${REASON[why]})` : nightNow(game) ? 'No' : 'No (day)'}</span></div>
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '4px 0' }}>
      <button style={btn(!!game.opsec?.blackout)} title="Douse windows, fire pit, lamps and flashlights, and switch every floodlight off" onClick={() => st.setOpsec('blackout', !game.opsec?.blackout)}>{game.opsec?.blackout ? 'Lights out: on' : 'Lights out'}</button>
      {AUTO_MODES.map(m => <button key={m} style={btn(autoMode(game) === m)} title={AUTO_HELP[m]} onClick={() => st.setLightsOutAuto(m)}>{AUTO_NAME[m]}</button>)}
    </div>
    <div style={{ color: DIM, fontSize: 12 }}>{AUTO_HELP[autoMode(game)]} A warning keeps your motion-sensor floodlights; the other two modes switch them off.</div>
    <div style={{ ...row, paddingTop: 4 }}><span>Blackout curtains</span><span>{Math.min(sets, need)} of {need} houses</span></div>
    <div style={{ color: DIM, fontSize: 12 }}>{curtainCover(game) >= 1 ? 'Every house is curtained: the rooms stay lit behind them.' : `Buy a set per house (Shop, Defense). Without them lights out means dark rooms: night work ${Math.round(20 * dark)}% slower, falls in the dark, a worse mood (children most).`}</div>
  </div>;
}
