/** The weather the dome's plant is working in (sim/dome/climateReadout.ts, docs/design/climate_disasters.md section 6): outside air and wet-bulb, plant capacity against the load, the chiller's trip point, battery hours at the temperature, snow on the shell against its rating, the next repair. Shown only in a heat or ice disaster. */
import { useGameStore } from '../../store/gameStore';
import { Row, Section } from './common';
import { DIM, TONE, card } from './style';
import { domeClimateReadout, climateCards } from '../../sim/dome/climateReadout';
import { climateOn } from '../../sim/dome/plantClimateLive';
import { domesOf, type DomeView } from '../../sim/dome/live';
import { pluralize } from '../../sim/words';

const pct = (n: number): string => `${Math.round(n * 100)} percent`;

export function DomeClimateSection({ v }: { v: DomeView }) {
  const game = useGameStore(s => s.game);
  if (!climateOn(game) || v.ref.tier === 'earthen') return null;
  const r = domeClimateReadout(game, v.ref, v.st), cards = climateCards(game, domesOf(game)).filter(c => (v.main ? !c.id.includes('@') : c.id.endsWith(`@${v.id}`)));
  const sn = r.snow;
  return <Section title="Weather and the plant">
    <div data-testid="dome-climate">
      <Row label="Outside" value={`${Math.round(r.outF)} F${r.wetBulbF !== null ? `, wet-bulb ${Math.round(r.wetBulbF)} F` : ''}`} tone={r.outF >= 110 || r.outF <= -10 ? 'warn' : undefined} title="Wet-bulb is how far evaporation can cool the air: pads and people stop working near 80 F." />
      <Row label="Plant capacity / load" value={`${pct(r.capacityK)} / ${pct(r.loadK)}`} tone={r.loadK > r.capacityK ? 'bad' : r.capacityK < 0.95 ? 'warn' : 'good'} title={`An air-cooled chiller gives full output at 95 F, loses 1.2 points a degree and trips at ${r.tripF} F. Its efficiency is ${r.copCool.toFixed(1)} now; the heat pump's is ${r.copHeat.toFixed(1)}.`} />
      <Row label="Transformers" value={`${pct(r.transformerK)} of rating`} tone={r.transformerK < 0.95 ? 'warn' : undefined} title="Transformers derate 0.4 percent a degree above 104 F." />
      {r.batteryH !== null && <Row label="Battery ride-through" value={`about ${Math.round(r.batteryH)} hours (${pct(r.batteryK)} capacity at ${Math.round(v.st.indoorF)} F)`} tone={r.batteryK < 0.6 ? 'warn' : undefined} title="The bank halves for every 15 F above 77 F and holds about half at 0 F." />}
      {sn && <Row label="Snow on the shell" value={`${Math.round(sn.psf)} of ${Math.round(sn.rating)} pounds per square foot (ground: ${Math.round(sn.ground)})`} tone={sn.psf > sn.rating ? 'bad' : sn.psf > 0.6 * sn.rating ? 'warn' : 'good'} title={sn.sheds ? 'A running climate plant melts most of it off.' : 'With the plant dark nothing melts the snow.'} />}
      <Row label="Next repair" value={r.nextRepair ? `${r.nextRepair.what}: ${r.nextRepair.days > 0 ? `parts in about ${pluralize(r.nextRepair.days, 'day')}` : 'the family is working on it'}` : 'none open'} />
      {cards.map(c => <div key={c.id} data-testid={c.id} style={{ ...card(false), borderColor: c.tone === 'alarm' ? TONE.bad : undefined, marginTop: 6 }}>
        <b style={{ color: c.tone === 'alarm' ? TONE.bad : TONE.warn }}>{c.title}</b>
        <div style={{ fontSize: 11.5, color: DIM }}>{c.why}</div>
      </div>)}
    </div>
  </Section>;
}
