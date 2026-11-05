/**
 * Defense tab: "Light discipline" (sim/blackout.ts). What is lit, how visible the compound is
 * from the road, the manual lights-out switch, the family's automatic routine, and the curtains.
 */
import type { CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { AUTO_HELP, AUTO_MODES, AUTO_NAME, autoMode, curtainCover, curtainSets, darkness, genRunning, genTier, GEN_TIER_NAME, lightsOutReason, nightNow, visibilityOf, VISIBILITY_NAME, windowSets } from '../sim/blackout';
import { giveAwayReadout, lightLinesOf, raidPressure } from '../sim/opsec';
import { BURN_HELP, BURN_MODES, BURN_NAME, burnMode, dogsQuiet, fullStealth, insulationCover, quietHours, stealthOf } from '../sim/stealthState';
import { quietDogsProblem, setDogsQuiet, setStealth, stealthCosts } from '../sim/stealth';
import { dogCount } from '../sim/pets';

const DIM = 'rgba(238,238,238,0.6)';
const btn = (on = false): CSSProperties => ({ padding: '4px 9px', borderRadius: 6, border: 0, cursor: 'pointer', background: on ? '#d8c9a0' : '#3a3d34', color: on ? '#1c1d18' : '#eee', fontSize: 12.5 });
const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0' };
const REASON = { manual: 'switched on by you', stealth: 'full stealth', dusk: 'every-dusk routine', warned: 'a warning sign', away: 'the empty place left dark' } as const;

export function LightDiscipline() {
  const game = useGameStore(s => s.game);
  const st = useGameStore.getState();
  const lines = lightLinesOf(game);
  const total = lines.reduce((a, l) => a + l.points, 0);
  const vis = visibilityOf(total);
  const why = lightsOutReason(game);
  const sets = curtainSets(game), need = windowSets(game);
  const dark = darkness(game);
  const money = useGameStore.getState().money;
  const away = giveAwayReadout(game), full = fullStealth(game), costs = stealthCosts(game);
  const tone = vis === 'dark' ? '#8fc98f' : vis === 'faint' ? '#d8c9a0' : '#e0907a';
  return <div style={{ padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
    <div style={{ fontWeight: 600, padding: '4px 0' }}>Light discipline</div>
    <div style={{ color: DIM, fontSize: 12, paddingBottom: 4 }} title="Part of the night-time suite. A lit compound is seen from the road, by neighbors and by scouts; raids and visitors follow. A dark one is safer, but work, cooking and the kids' mood suffer in rooms with no curtains.">Lit means seen; dark is safer but harder to live in.</div>
    <div style={row}><span>Seen from the road</span><span style={{ color: tone }}>{VISIBILITY_NAME[vis]} · raids ×{raidPressure(game).toFixed(2)}</span></div>
    {lines.filter(l => l.points > 0).map(l => <div key={l.id} style={row} title={l.note}><span style={{ color: DIM }}>{l.label} <i>({l.note})</i></span><span>{l.points > 0 ? `+${Math.round(l.points * 10) / 10}` : '0'}</span></div>)}
    <div style={{ ...row, paddingTop: 4 }}><span>Lights out now</span><span>{why ? `Yes (${REASON[why]})` : nightNow(game) ? 'No' : 'No (day)'}</span></div>
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '4px 0' }}>
      <button style={btn(!!game.opsec?.blackout)} title="Douse windows, fire pit, lamps and flashlights, and switch every floodlight off" onClick={() => st.setOpsec('blackout', !game.opsec?.blackout)}>{game.opsec?.blackout ? 'Lights out: on' : 'Lights out'}</button>
      {AUTO_MODES.map(m => <button key={m} style={btn(autoMode(game) === m)} title={AUTO_HELP[m]} onClick={() => st.setLightsOutAuto(m)}>{AUTO_NAME[m]}</button>)}
    </div>
    <div style={{ color: DIM, fontSize: 12 }}>{AUTO_HELP[autoMode(game)]} A warning keeps your motion-sensor floodlights; the other two modes switch them off.</div>
    <div data-testid="stealth" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 6, paddingTop: 4 }}>
      <div style={{ fontWeight: 600, padding: '2px 0' }}>Stealth</div>
      {away.map(a => <div key={a.id} style={row} title={a.note}><span style={{ color: DIM }}>{a.label} <i>({a.note.length > 46 ? a.note.slice(0, 44) + '…' : a.note})</i></span><span>{a.counts ? (a.points > 0 ? `+${Math.round(a.points * 10) / 10}` : '0') : `${Math.round(a.points * 10) / 10} (not counted)`}</span></div>)}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '4px 0' }}>
        <button style={btn(full)} title="One switch for light, smoke and noise: lights out, the stove at dusk only, quiet hours. Costs a cold house, slower night work and dark rooms." onClick={() => money(g => { setStealth(g, 'full', !full); return null; })}>{full ? 'Full stealth: on' : 'Full stealth'}</button>
        {BURN_MODES.map(m => <button key={m} style={btn(burnMode(game) === m)} disabled={full} title={BURN_HELP[m]} onClick={() => money(g => { setStealth(g, 'burn', m); return null; })}>{BURN_NAME[m]}</button>)}
        <button style={btn(quietHours(game))} disabled={full} title="No outdoor work or animal feeding between 21:00 and 05:00 (night work at half rate); stock and parties carry less." onClick={() => money(g => { setStealth(g, 'quiet', !stealthOf(g).quiet); return null; })}>Quiet hours</button>
        <button style={btn(dogsQuiet(game))} disabled={!dogCount(game) || (!dogsQuiet(game) && !!quietDogsProblem(game))} title={quietDogsProblem(game) ?? 'Dogs trained to alert without barking (a trainer\u2019s fee per dog, once).'} onClick={() => money(g => setDogsQuiet(g, !dogsQuiet(g)))}>Dogs trained quiet</button>
      </div>
      {costs.map((c, i) => <div key={i} style={{ color: DIM, fontSize: 12 }}>{c}</div>)}
      <div style={{ color: DIM, fontSize: 12 }}>Wall insulation: {Math.round(insulationCover(game) * 100)}% of houses (Shop, Defense): sound stays in and the stove needs a tenth less wood.</div>
      <div style={{ color: DIM, fontSize: 12 }}>Motion floodlights with an AI sensor module stay dark until a person is near, even with lights out; full stealth keeps every light that is not off as a sensor light, so a raid still meets light.</div>
    </div>
    <div style={row}><span>Generator soundproofing</span><span>{genRunning(game) ? GEN_TIER_NAME[genTier(game)] : `${GEN_TIER_NAME[genTier(game)]} (generator idle)`}</span></div>
    <div style={{ color: DIM, fontSize: 12 }}>A generator is loud and bright, more so the more it runs. Buy baffles (about half) or a vault (silent) in the Shop, Defense.</div>
    <div style={{ ...row, paddingTop: 4 }}><span>Blackout curtains</span><span>{Math.min(sets, need)} of {need} houses</span></div>
    <div style={{ color: DIM, fontSize: 12 }}>{curtainCover(game) >= 1 ? 'Every house is curtained: the rooms stay lit behind them.' : `Buy a set per house (Shop, Defense). Without them lights out means dark rooms: night work ${Math.round(20 * dark)}% slower, falls in the dark, a worse mood (children most).`}</div>
  </div>;
}
