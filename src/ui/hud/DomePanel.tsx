/** The Dome page (Utilities drawer): lockdown, the air clock, filtering and the closed ecology, the dome's own climate and power. (sim/dome/live.ts) */
import { useGameStore } from '../../store/gameStore';
import { Note, Row, Section } from './common';
import { DIM, TONE, btn, usd, type Tone } from './style';
import { TIER } from '../../sim/dome/tiers';
import { CLIMATE_MODES, BAND, type ClimateMode } from '../../sim/dome/climate';
import { FILTERING, LIMIT_PPM, type Filtering } from '../../sim/dome/air';
import { outside, domeKwhDay, planPowered, buyFiltering, domeClean, domeClock, domeOf, domeOfState, filteringBill, filteringProblem, freshClock, replaceFilters, setClimateMode, setLockdown, spareFiltersUsd, tendCostUsd, tendEcology } from '../../sim/dome/live';
import { pluralize } from '../../sim/words';

const NAME: Record<Filtering, string> = { none: 'None (shell leakage only)', scrubber: 'CO2 scrubbers', advanced: 'Advanced air bank', closed: 'Closed ecology' };
const BUY: Record<Filtering, string> = { none: '', scrubber: 'Fit CO2 scrubbers', advanced: 'Fit the advanced air bank', closed: 'Build the closed ecology' };
const BLURB: Record<Filtering, string> = {
  none: '', scrubber: 'Soda-lime and amine beds that take most of the CO2 out. Powered.',
  advanced: 'HEPA, carbon and CO2 stripping plus an oxygen concentrator: takes nearly all the CO2, makes about half the oxygen, and keeps dust out of the vents. Powered.',
  closed: 'Algae and plant loops, soil beds, sensors and a second power plant. Makes the air for good and some food. Very expensive to build and to keep, and it can fail.',
};
const hoursText = (h: number | null): string => (h === null ? 'no limit while the plant runs' : h < 72 ? `${Math.floor(h)} hours` : `${Math.floor(h / 24)} days`);

function Bar({ v, tone }: { v: number; tone: Tone }) {
  return <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, margin: '2px 0 5px' }}><div style={{ width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`, height: '100%', background: TONE[tone], borderRadius: 3 }} /></div>;
}

export function DomePanel() {
  const game = useGameStore(s => s.game), g = useGameStore();
  const d = domeOf(game);
  if (!d) return null;
  const st = domeOfState(game), t = TIER[d.tier];
  const clock = st.lockdown ? domeClock(game) : freshClock(game);
  const air = st.alarm === 'critical' ? 'bad' : st.alarm === 'low' ? 'warn' : 'good';
  const act = (f: (x: typeof game) => string | null) => { const w = g.money(f); if (w) alert(w); };
  const clean = domeClean(game), out = outside(game), kwh = Math.round(domeKwhDay(game, d.st)), indoor = game.dome ? st.indoorF : out.f, powered = planPowered(game, d, st);
  const bill = (l: Filtering) => { const b = filteringBill(game, l); return b ? `${usd(b.usd)}${b.permitUsd ? ` + ${usd(b.permitUsd)} county life-safety permit` : ''}, about ${pluralize(b.days, 'day')} to fit${b.reviewDays ? ` (${b.reviewDays} of them in review)` : ''}` : ''; };
  return <div data-testid="dome-panel">
    <Section title={`${t.name}: ${st.lockdown ? 'sealed' : 'open'}`}>
      <button data-testid="dome-lockdown" style={{ ...btn(st.lockdown), width: '100%', padding: '8px 9px', fontWeight: 700, letterSpacing: 0.5, background: st.lockdown ? '#8a3b2a' : '#3b6a3a', color: '#fff' }}
        title={st.lockdown ? 'Open the vents and airlocks. With dust in the air outside, it comes in.' : 'Shut the airlocks and vents. The air is then on a clock: people make CO2, the plant and the plants take it back.'}
        onClick={() => act(x => setLockdown(x, !st.lockdown))}>{st.lockdown ? 'OPEN THE DOME' : 'LOCK DOWN'}</button>
      <Row label="Air left sealed" value={st.lockdown ? hoursText(st.hours) : clock ? hoursText(clock.hours === Infinity ? null : clock.hours) : '-'} tone={st.lockdown ? air : undefined} title="Hours until the CO2 hits the workplace limit (0.5 percent) or oxygen drops to 17 percent, from now, if nothing changes" />
      <Bar v={st.hours === null || !st.lockdown ? 1 : st.hours / 72} tone={air} />
      <Row label="CO2" value={`${(st.co2ppm / 10000).toFixed(2)} percent`} tone={st.co2ppm >= LIMIT_PPM.alarm ? 'bad' : st.co2ppm > 2000 ? 'warn' : undefined} title="Outside air is 0.04 percent. Headaches above 0.5 percent; the fail-safe vents open at 2 percent." />
      <Row label="Oxygen" value={`${st.o2pct.toFixed(1)} percent`} tone={st.o2pct < 17 ? 'bad' : st.o2pct < 19.5 ? 'warn' : undefined} />
      <Row label="People under the shell" value={game.personState.filter(p => p.needs.died == null && !p.needs.left && !p.needs.taken).length} />
      <Row label="Ground under the shell" value={clean ? 'clean zone' : 'dusty'} tone={clean ? 'good' : 'warn'} title="Fallout, ash and smoke stay out of a sealed dome. Open vents with dust outside let it in; it settles out slowly, faster with a running air bank." />
      {st.ventedAt !== null && !st.lockdown && game.clock.t - st.ventedAt < 3 && <Note tone="warn">The fail-safe vents opened on their own when the air went bad.</Note>}
      {st.lockdown && st.filtering !== 'none' && !powered && <Note tone="bad">The air plant has no power{game.utilities.fittings.some(f => f.building === d.st.id && f.kind === 'wire' && f.finishedAt !== null) ? '.' : ': the dome is not wired to the compound yet.'}</Note>}
    </Section>
    <Section title="Air filtering">
      <Row label="Fitted" value={NAME[st.filtering]} />
      {st.filtering !== 'none' && <><Row label="Filter media" value={`${Math.round(st.filterHealth * 100)} percent`} tone={st.filterHealth < 0.35 ? 'bad' : st.filterHealth < 0.6 ? 'warn' : undefined} />
        <button style={btn()} disabled={st.filterHealth > 0.9} title={`A fresh set of media for ${usd(spareFiltersUsd(game))}`} onClick={() => act(x => replaceFilters(x))}>Swap the media · {usd(spareFiltersUsd(game))}</button></>}
      {st.installing && <Note tone="warn">Fitting: {NAME[st.installing.level]}, ready in {pluralize(Math.max(1, Math.ceil(st.installing.readyAt - game.clock.t)), 'day')}.</Note>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        {FILTERING.filter(l => l !== 'none' && FILTERING.indexOf(l) > FILTERING.indexOf(st.filtering)).map(l => {
          const why = filteringProblem(game, l), b = filteringBill(game, l)!;
          return <button key={l} data-testid={`dome-buy-${l}`} style={{ ...btn(), textAlign: 'left', opacity: why ? 0.55 : 1 }} disabled={!!why}
            title={`${BLURB[l]}\nBill: ${bill(l)}${why ? `\nNot yet: ${why}` : ''}`} onClick={() => act(x => buyFiltering(x, l))}>
            {BUY[l]} · {usd(b.totalUsd)}{why ? ` · ${why}` : ''}
          </button>;
        })}
      </div>
      {st.filtering === 'closed' && <>
        <Row label="Closed ecology" value={`${Math.round(st.ecoHealth * 100)} percent`} tone={st.ecoHealth < 0.5 ? 'bad' : st.ecoHealth < 0.8 ? 'warn' : 'good'} title="Below half, the loop makes less air than the advanced bank it includes. Blight, a dead pump or a missed upkeep bill drop it; power and tending bring it back." />
        <Bar v={st.ecoHealth} tone={st.ecoHealth < 0.5 ? 'bad' : st.ecoHealth < 0.8 ? 'warn' : 'good'} />
        <button style={btn()} disabled={st.ecoHealth > 0.9} title="Replant, treat the blight, reseed the beds" onClick={() => act(x => tendEcology(x))}>Replant and treat · {usd(tendCostUsd(game))}</button>
      </>}
    </Section>
    <Section title="Climate and power">
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
        {CLIMATE_MODES.map((m: ClimateMode) => <button key={m} data-testid={`dome-mode-${m}`} style={btn(st.mode === m)} title={`Holds ${BAND[m][0]} to ${BAND[m][1]} F inside`} onClick={() => act(x => setClimateMode(x, m))}>{m[0].toUpperCase() + m.slice(1)}</button>)}
      </div>
      <Row label="Inside / outside" value={`${Math.round(indoor)} F / ${Math.round(out.f)} F`} title="The dome has its own climate: rain, snow, wind and dust stay outside the shell." />
      <Row label="Draw" value={`${kwh.toLocaleString('en-US')} kWh a day`} title="Climate plant plus the air plant while sealed. Life support is served before everything else while sealed." />
      <Row label="Air plant" value={st.filtering === 'none' ? 'none fitted' : powered ? 'running' : 'no power'} tone={st.filtering === 'none' ? undefined : powered ? 'good' : 'bad'} />
      {st.filtering === 'none' && <Note>Without filtering the shell's leakage is all that freshens the air, and a 60 ft dome with six people is in trouble within about two days.</Note>}
    </Section>
    <div style={{ fontSize: 11, color: DIM }}>The dome sits over the bunker, which keeps its own fallout protection. It keeps weather, ash and fallout dust off the ground under it, and it can be seen for miles.</div>
  </div>;
}
