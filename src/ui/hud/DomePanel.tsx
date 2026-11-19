/** The Dome page (Utilities drawer): lockdown, the air clock, filtering and the closed ecology, the dome's own climate and power. (sim/dome/live.ts) */
import { useGameStore } from '../../store/gameStore';
import { Note, Row, Section } from './common';
import { DIM, TONE, btn, usd, type Tone } from './style';
import { TIER } from '../../sim/dome/tiers';
import { CLIMATE_MODES, BAND, comfortAt, type ClimateMode, type CoolStage } from '../../sim/dome/climate';
import { WATER_LOOPS, LOOP_NAME, REUSE, type WaterLoop } from '../../sim/dome/waterLoop';
import { stockCover } from '../../sim/dome/agro';
import { useState } from 'react';
import { useWorldStore } from '../../store/worldStore';
import { skirtFacts } from '../../sim/dome/skirtFacts';
import { FILTERING, LIMIT_PPM, type Filtering } from '../../sim/dome/air';
import { outside, dayLoad, planPowered, buyFiltering, buyLoop, loopBill, loopProblem, domeClean, domeClock, domeViews, filteringBill, filteringProblem, freshClock, replaceFilters, setClimateMode, setLockdown, spareFiltersUsd, tendCostUsd, tendEcology, type DomeView } from '../../sim/dome/live';
import { pluralize } from '../../sim/words';
import { DomePlantSection } from './DomePlantSection';
import { domeRunning } from '../../sim/dome/runningLine';
import { DomeLinksSection } from './DomeLinksSection';
import { DomeBunkerSection } from './DomeBunkerSection';

const NAME: Record<Filtering, string> = { none: 'None (shell leakage only)', scrubber: 'CO2 scrubbers', advanced: 'Advanced air bank', closed: 'Closed ecology' };
const BUY: Record<Filtering, string> = { none: '', scrubber: 'Fit CO2 scrubbers', advanced: 'Fit the advanced air bank', closed: 'Build the closed ecology' };
const BLURB: Record<Filtering, string> = {
  none: '', scrubber: 'Soda-lime and amine beds that take most of the CO2 out. Powered.',
  advanced: 'HEPA, carbon and CO2 stripping plus an oxygen concentrator: takes nearly all the CO2, makes about half the oxygen, and keeps dust out of the vents. Powered.',
  closed: 'Algae and plant loops, soil beds, sensors and a second power plant. Makes the air for good and some food. Very expensive to build and to keep, and it can fail.',
};
const hoursText = (h: number | null, short = false): string => (h === null ? (short ? 'no limit' : 'no limit while the plant runs') : h < 72 ? `${Math.floor(h)} hours` : `${Math.floor(h / 24)} days`);

function Bar({ v, tone }: { v: number; tone: Tone }) {
  return <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, margin: '2px 0 5px' }}><div style={{ width: `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`, height: '100%', background: TONE[tone], borderRadius: 3 }} /></div>;
}

const STAGE: Record<CoolStage, string> = { idle: 'Floating inside the band: nothing running', heating: 'Heating (heat pump)', vent: 'Cooling with vents and fans', shade: 'Cooling with roof screens drawn', evap: 'Cooling with evaporative pads (drinks water)', chill: 'Cooling with chillers (the dear last resort)' };
const LOOP_BLURB: Record<WaterLoop, string> = { none: '', grey: 'Sink and shower water goes to the beds and toilets, a first-flush diverter and sand filter clean the rain off the shell. Reuses about a third of the household water.', recycle: 'Wastewater is treated through a membrane skid and drunk again, plus everything the graywater loop does. Reuses about four fifths of the household water.' };
const TIER_NAME = (v: DomeView): string => TIER[v.ref.tier].name;

export function DomePanel() {
  const game = useGameStore(s => s.game), g = useGameStore();
  const [pick, setPick] = useState<string | null>(null);
  const views = domeViews(game);
  if (!views.length) return null;
  const v = views.find(x => x.id === pick) ?? views[0], d = v.ref, id = d.st.id, st = v.st, t = TIER[d.tier];
  const clock = st.lockdown ? domeClock(game, id) : freshClock(game, id);
  const air = st.alarm === 'critical' ? 'bad' : st.alarm === 'low' ? 'warn' : 'good';
  const act = (f: (x: typeof game) => string | null) => { const w = g.money(f); if (w) alert(w); };
  const clean = domeClean(game, id), out = outside(game), load = dayLoad(game, d, st), kwh = Math.round(load.kwh), indoor = st.indoorF, powered = planPowered(game, d, st);
  const [lo, hi] = BAND[st.mode], inBandNow = indoor >= lo - 0.5 && indoor <= hi + 0.5, stock = stockCover(game);
  const bill = (l: Filtering) => { const b = filteringBill(game, l, id); return b ? `${usd(b.usd)}${b.permitUsd ? ` + ${usd(b.permitUsd)} county life-safety permit` : ''}, about ${pluralize(b.days, 'day')} to fit${b.reviewDays ? ` (${b.reviewDays} of them in review)` : ''}` : ''; };
  const loop = st.loop ?? 'none', loopDown = game.clock.t < (st.loopDownUntil ?? 0);
  const gal = (n: number | undefined) => `${Math.round(n ?? 0).toLocaleString('en-US')} gal`;
  return <div data-testid="dome-panel">
    <Section title={views.length > 1 ? `Your domes (${views.length})` : 'Your dome'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {views.map(x => {
          const a = x.st.alarm === 'critical' ? 'bad' : x.st.alarm === 'low' ? 'warn' : 'good', on = x.id === id;
          const c = x.st.lockdown ? domeClock(game, x.id) : freshClock(game, x.id);
          const h = x.st.lockdown ? x.st.hours : c && c.hours !== Infinity ? c.hours : null;
          return <button key={x.id} data-testid={`dome-card-${x.id}`} onClick={() => setPick(x.id)} style={{ ...btn(on), textAlign: 'left', display: 'block', width: '100%', padding: '6px 8px' }}
            title="Show this dome's air, climate and water below">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: 700 }}><span>{x.label}{x.main ? ' (main)' : ''}</span><span style={{ color: on ? '#1c1d18' : x.st.lockdown ? TONE[a] : TONE.good }}>{x.st.lockdown ? 'SEALED' : 'open'}</span></div>
            <div style={{ fontSize: 11.5, color: on ? '#3a3b30' : DIM, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{x.st.lockdown ? 'air' : 'air if sealed'}: {hoursText(h, true)}</span>
              <span>{Math.round(x.st.indoorF)} F · {x.people} {x.people === 1 ? 'person' : 'people'} · {x.st.powered ? 'powered' : 'no power'}</span>
            </div>
          </button>;
        })}
      </div>
      {views.length > 1 && <Note>Each dome runs its own air, filtering, climate, water loop and power. People are counted with the dome their home stands under; the main dome takes anyone whose home is outside every shell.</Note>}
    </Section>
    <Section title={`${views.length > 1 ? v.label : t.name}: ${st.lockdown ? 'sealed' : 'open'}`}>
      {(() => {
        const rc = domeRunning(game).find(x => x.id === id);
        if (!rc) return null;
        const bad = rc.stage !== 'paid' || rc.cashShort;
        return <div data-testid="dome-running-cost" style={{ margin: "6px 0 2px" }}>
          <Row label="Running cost" tone={bad ? "warn" : undefined} value={rc.upkeepUsd > 0 ? `${usd(rc.totalUsd)} a year` : `about ${usd(rc.powerUsd)} a year`} />
          <Note>{rc.upkeepUsd > 0 ? `Upkeep ${usd(rc.upkeepUsd)} a year (maintenance, insurance${rc.tier === 'glass' || rc.tier === 'arcology' ? ', staff' : ''}) is billed a day at a time; power, about ${usd(rc.powerUsd)}, is billed with the utilities.` : `Power, billed with the utilities. An earthen dome has no upkeep bill.`}</Note>
          {rc.stageText && <Note>{`Warning: ${rc.stageText} Owed: ${usd(rc.owedUsd)}.`}</Note>}
          {!rc.stageText && rc.cashShort && <Note>{`Warning: cash on hand is under one month of upkeep (${usd(rc.monthUsd)}): the upkeep will start to run behind.`}</Note>}
        </div>;
      })()}
      <button data-testid="dome-lockdown" style={{ ...btn(st.lockdown), width: '100%', padding: '8px 9px', fontWeight: 700, letterSpacing: 0.5, background: st.lockdown ? '#8a3b2a' : '#3b6a3a', color: '#fff' }}
        title={st.lockdown ? 'Open the vents and airlocks. With dust in the air outside, it comes in.' : 'Shut the airlocks and vents. The air is then on a clock: people make CO2, the plant and the plants take it back.'}
        onClick={() => act(x => setLockdown(x, !st.lockdown, id))}>{st.lockdown ? 'OPEN THE DOME' : 'LOCK DOWN'}</button>
      <Row label="Air left sealed" value={st.lockdown ? hoursText(st.hours) : clock ? hoursText(clock.hours === Infinity ? null : clock.hours) : '-'} tone={st.lockdown ? air : undefined} title="Hours until the CO2 hits the workplace limit (0.5 percent) or oxygen drops to 17 percent, from now, if nothing changes" />
      <Bar v={st.hours === null || !st.lockdown ? 1 : st.hours / 72} tone={air} />
      <Row label="CO2" value={`${(st.co2ppm / 10000).toFixed(2)} percent`} tone={st.co2ppm >= LIMIT_PPM.alarm ? 'bad' : st.co2ppm > 2000 ? 'warn' : undefined} title="Outside air is 0.04 percent. Headaches above 0.5 percent; the fail-safe vents open at 2 percent." />
      <Row label="Oxygen" value={`${st.o2pct.toFixed(1)} percent`} tone={st.o2pct < 17 ? 'bad' : st.o2pct < 19.5 ? 'warn' : undefined} />
      <Row label="People under this shell" value={v.people} />
      <Row label="Ground under the shell" value={clean ? 'clean zone' : 'dusty'} tone={clean ? 'good' : 'warn'} title="Fallout, ash and smoke stay out of a sealed dome. Open vents with dust outside let it in; it settles out slowly, faster with a running air bank." />
      {st.ventedAt !== null && !st.lockdown && game.clock.t - st.ventedAt < 3 && <Note tone="warn">The fail-safe vents opened on their own (bad air, or a sealed shell over 105 F).</Note>}
      {st.lockdown && st.filtering !== 'none' && !powered && <Note tone="bad">The air plant has no power{game.utilities.fittings.some(f => f.building === d.st.id && f.kind === 'wire' && f.finishedAt !== null) ? '.' : ': the dome is not wired to the compound yet.'}</Note>}
    </Section>
    <Section title="The buried skirt">
      <SkirtSectionToggle id={id} tier={d.tier} />
    </Section>
    <Section title="Air filtering">
      <Row label="Fitted" value={NAME[st.filtering]} />
      {st.filtering !== 'none' && <><Row label="Filter media" value={`${Math.round(st.filterHealth * 100)} percent`} tone={st.filterHealth < 0.35 ? 'bad' : st.filterHealth < 0.6 ? 'warn' : undefined} />
        <button style={btn()} disabled={st.filterHealth > 0.9} title={`A fresh set of media for ${usd(spareFiltersUsd(game, id))}`} onClick={() => act(x => replaceFilters(x, id))}>Swap the media · {usd(spareFiltersUsd(game, id))}</button></>}
      {st.installing && <Note tone="warn">Fitting: {NAME[st.installing.level]}, ready in {pluralize(Math.max(1, Math.ceil(st.installing.readyAt - game.clock.t)), 'day')}.</Note>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        {FILTERING.filter(l => l !== 'none' && FILTERING.indexOf(l) > FILTERING.indexOf(st.filtering)).map(l => {
          const why = filteringProblem(game, l, id), b = filteringBill(game, l, id)!;
          return <button key={l} data-testid={`dome-buy-${l}`} style={{ ...btn(), textAlign: 'left', opacity: why ? 0.55 : 1 }} disabled={!!why}
            title={`${BLURB[l]}\nBill: ${bill(l)}${why ? `\nNot yet: ${why}` : ''}`} onClick={() => act(x => buyFiltering(x, l, id))}>
            {BUY[l]} · {usd(b.totalUsd)}{why ? ` · ${why}` : ''}
          </button>;
        })}
      </div>
      {st.filtering === 'closed' && <>
        <Row label="Closed ecology" value={`${Math.round(st.ecoHealth * 100)} percent`} tone={st.ecoHealth < 0.5 ? 'bad' : st.ecoHealth < 0.8 ? 'warn' : 'good'} title="Below half, the loop makes less air than the advanced bank it includes. Blight, a dead pump or a missed upkeep bill drop it; power and tending bring it back." />
        <Bar v={st.ecoHealth} tone={st.ecoHealth < 0.5 ? 'bad' : st.ecoHealth < 0.8 ? 'warn' : 'good'} />
        <button style={btn()} disabled={st.ecoHealth > 0.9} title="Replant, treat the blight, reseed the beds" onClick={() => act(x => tendEcology(x, id))}>Replant and treat · {usd(tendCostUsd(game, id))}</button>
      </>}
    </Section>
    <Section title="Climate and comfort band">
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
        {CLIMATE_MODES.map((m: ClimateMode) => <button key={m} data-testid={`dome-mode-${m}`} style={btn(st.mode === m)} title={`Holds ${BAND[m][0]} to ${BAND[m][1]} F inside`} onClick={() => act(x => setClimateMode(x, m, id))}>{m[0].toUpperCase() + m.slice(1)} {BAND[m][0]} to {BAND[m][1]} F</button>)}
      </div>
      <Row label="Inside / outside" value={`${Math.round(indoor)} F / ${Math.round(out.f)} F`} tone={inBandNow ? 'good' : 'warn'} title="The dome has its own climate. The plant holds the band: it heats below it, and above it sheds heat with vents, roof screens, evaporative pads and chillers, in that order." />
      <Row label="Band" value={inBandNow ? `inside ${lo} to ${hi} F` : indoor > hi ? `over by ${Math.round(indoor - hi)} F` : `under by ${Math.round(lo - indoor)} F`} tone={inBandNow ? 'good' : 'bad'} />
      <Row label="Doing now" value={STAGE[st.stage ?? 'idle']} />
      <Row label="Comfort for plants and animals" value={`${Math.round(comfortAt(indoor) * 100)} percent`} tone={comfortAt(indoor) >= 0.9 ? 'good' : comfortAt(indoor) >= 0.5 ? 'warn' : 'bad'} title="Full across 55 to 82 F. Beds bolt and hens stop laying in the heat; stock takes sick in the cold." />
      <Row label="Draw" value={`${kwh.toLocaleString('en-US')} kWh a day`} title={`Climate ${Math.round(load.climateKwh)} + house load (fans, pumps, controls) ${Math.round(load.auxKwh)} + water loop ${Math.round(load.loopKwh)} + air plant while sealed ${Math.round(load.airKwh)}. Life support is served before everything else while sealed.`} />
      <Row label="Air plant" value={st.filtering === 'none' ? 'none fitted' : powered ? 'running' : 'no power'} tone={st.filtering === 'none' ? undefined : powered ? 'good' : 'bad'} />
      <Row label="Beds and animals under glass" value={`${v.beds} ${v.beds === 1 ? 'bed' : 'beds'}${stock.share > 0 ? `, ${Math.round(stock.share * 100)} percent of the barns` : ''}`} title="A held climate gives frost-free growing, no hail, steady yields and fewer sick animals (a sealed, powered dome only)." />
      {st.filtering === 'none' && <Note>Without filtering the shell's leakage is all that freshens the air, and a 60 ft dome with six people is in trouble within about two days.</Note>}
      {!powered && <Note tone="warn">No power: the vents and roof screens still work by hand, but heating, the pads and the chillers are off.</Note>}
    </Section>
    <Section title="Rain and the water loop">
      <Row label="Rain off the shell" value={st.cistern === false ? 'not kept (no cistern on its line)' : `${gal(st.rainGalDay)} a day`} tone={st.cistern === false ? 'warn' : undefined} title="The shell is a roof: its rain and snowmelt go to the cisterns when the dome is on the water network with one. A fitted loop adds a first-flush diverter and a sand filter." />
      <Row label="Water loop" value={`${LOOP_NAME[loop]}${loopDown ? ' (down)' : ''}`} tone={loopDown ? 'bad' : undefined} />
      <Row label="Water given back" value={`${gal(st.savedGalDay)} a day`} title={`Reuse of the household's water (${Math.round(REUSE[loop] * 100)} percent at this loop) plus condensate from the beds on the cold coils.`} />
      <Row label="Cooling pads drink" value={`${gal(powered ? load.waterGal : 0)} a day`} title="Evaporative cooling uses water on hot days, most in dry country." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        {WATER_LOOPS.filter(l => l !== 'none' && WATER_LOOPS.indexOf(l) > WATER_LOOPS.indexOf(loop)).map(l => {
          const why = loopProblem(game, l, id), b = loopBill(game, l, id)!;
          return <button key={l} data-testid={`dome-loop-${l}`} style={{ ...btn(), textAlign: 'left', opacity: why ? 0.55 : 1 }} disabled={!!why} title={`${LOOP_BLURB[l]}${why ? `\nNot yet: ${why}` : ''}`} onClick={() => act(x => buyLoop(x, l, id))}>
            Plumb the {LOOP_NAME[l].toLowerCase()} · {usd(b.usd)}{why ? ` · ${why}` : ''}
          </button>;
        })}
      </div>
    </Section>
    <DomeBunkerSection v={v} />
    <DomePlantSection v={v} />
    <DomeLinksSection v={v} />
    <div style={{ fontSize: 11, color: DIM }}>The {TIER_NAME(v).toLowerCase()} sits over the bunker, which keeps its own fallout protection. It keeps weather, ash and fallout dust off the ground under it, and it can be seen for miles.</div>
  </div>;
}

/** The Skirt section: cut the ground and the dome open along a vertical plane to see the buried skirt, its footing, the strata and how deep a crew digs. */
function SkirtSectionToggle({ id, tier }: { id: string; tier: keyof typeof TIER }) {
  const on = useWorldStore(s => s.domeSection === id), set = useWorldStore(s => s.setDomeSection), f = skirtFacts(tier);
  return <>
    <Row label="Skirt" value={`${f.depth} ft deep, ${f.thick} ft thick concrete`} title="The buried wall under the shell that keeps tunnelers from digging in underneath" />
    <button data-testid="dome-skirt-section" style={{ ...btn(on), width: '100%', marginTop: 4 }} aria-pressed={on}
      title="Cut the ground and the dome open along a vertical plane through its center, from the side you are looking from"
      onClick={() => set(on ? null : id)}>{on ? 'Close the skirt section' : 'Skirt section'}</button>
    {on && <Note>The cut shows the skirt in cross-section with the soil layers and a depth ruler in feet. A plain crew digs 6 to 14 ft; a crew that has learned the ground digs about 6 ft deeper. Orbit to the side you want to look from, then toggle it again.</Note>}
  </>;
}
