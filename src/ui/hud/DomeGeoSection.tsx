/** Heat rejection and ground on the Dome page (sim/dome/geothermal.ts, save v107): the tower, the high-ambient package, the ground loop, the deep well and thermal curtains, with prices in dollars and the field in acres. */
import { useGameStore } from '../../store/gameStore';
import { Note, Row, Section } from './common';
import { TONE, btn, usd } from './style';
import { dryAir, type DomeView, dayLoad } from '../../sim/dome/live';
import { hasYard } from '../../sim/dome/plantYard';
import { BORE_FT, GEO_LABEL, geoExposure, geoOptions, loopField, towerCapacity, wetBulbEstimate, wellSpec, type GeoOption } from '../../sim/dome/geothermal';
import { buyGeo, geoBuyProblem, geoOf } from '../../sim/dome/geothermalLive';

const SF_PER_ACRE = 43_560;
const REJECT_WORD = { air: 'air-cooled condenser (trips at 125 F)', high_ambient: 'high-ambient package (trips at 140 F)', tower: 'cooling tower (limited by wet-bulb, drinks water)' } as const;

export function DomeGeoSection({ v }: { v: DomeView }) {
  const game = useGameStore(s => s.game), g = useGameStore();
  const d = v.ref, st = v.st, id = d.st.id;
  if (!hasYard(d.tier)) return null;
  const have = geoOf(st), opts = geoOptions(d.tier, d.cells), load = dayLoad(game, d, st);
  const act = (f: (x: typeof game) => string | null) => { const w = g.money(f); if (w) alert(w); };
  const wb = wetBulbEstimate(st.outF, dryAir(game)), field = have.groundLoop ? loopField(d.tier, d.cells, have.groundLoop) : null, well = wellSpec(d.tier), exp = geoExposure(have);
  // (a loop is held to a 5 acre field: where that is less than the plant needs, the offer says how much of it the loop will carry)
  const cover = (oid: GeoOption['id']): string => { if (oid !== 'loop_half' && oid !== 'loop_full') return ''; const share = loopField(d.tier, d.cells, oid === 'loop_half' ? 'half' : 'full').share; return share < 0.999 ? ` · covers ${Math.round(share * 100)} percent of the plant` : ''; };
  const buy = (o: GeoOption) => {
    const why = geoBuyProblem(game, o.id, id), has = (o.id === 'high_ambient' && have.rejection === 'high_ambient') || (o.id === 'tower' && have.rejection === 'tower') || (o.id === 'loop_half' && have.groundLoop === 'half') || (o.id === 'loop_full' && have.groundLoop === 'full') || (o.id === 'deep_well' && have.deepWell) || (o.id === 'curtains' && have.curtains);
    if (has) return <div key={o.id} data-testid={`geo-have-${o.id}`} style={{ fontSize: 11.5, color: TONE.good }}>{GEO_LABEL[o.id]}: in place</div>;
    return <button key={o.id} data-testid={`geo-buy-${o.id}`} style={{ ...btn(), marginTop: 3, marginRight: 5, opacity: why ? 0.55 : 1 }} disabled={!!why} title={why ?? GEO_LABEL[o.id]} onClick={() => act(x => buyGeo(x, o.id, id))}>{GEO_LABEL[o.id]} · {usd(o.usd)}{cover(o.id)}{why && !/needs/.test(why) ? ` · ${why}` : ''}</button>;
  };
  return <Section title="Heat rejection and ground">
    <div data-testid="geo-panel">
      <Row label="Heat rejection" value={REJECT_WORD[have.rejection ?? 'air']} title="The chiller dumps heat to the air (limited by the dry-bulb) or, with a tower, to evaporating water (limited by the wet-bulb)." />
      <Row label="Wet-bulb now (estimate)" value={`${Math.round(wb)} F, tower at ${Math.round(towerCapacity(wb) * 100)} percent`} tone={towerCapacity(wb) >= 0.99 ? 'good' : towerCapacity(wb) > 0 ? 'warn' : 'bad'} title="A tower gives its full rating to 82 F wet-bulb and nothing at 95 F." />
      {have.rejection === 'tower' && <Row label="Tower make-up water" value={`${Math.round(load.waterGal).toLocaleString('en-US')} gal a day`} title="About 0.65 gallons per kWh of heat moved. It comes out of the compound's water, so a drought empties the cistern fast." />}
      {field && <Row label="Ground loop" value={`${field.bores} bores, ${BORE_FT} ft deep · ${(field.fieldSf / SF_PER_ACRE).toFixed(1)} acres${field.share < 0.999 ? ` · covers ${Math.round(field.share * 100)} percent of the plant` : ''}`} tone={field.share < 0.999 ? 'warn' : 'good'} title="Closed vertical loop to 52 F ground: cooling COP about 4 at any outside air, heat pump COP 3. The field area limits how much of the plant it can carry." />}
      {have.deepWell && well && <Row label="Deep well" value={`${well.depthFt} ft, ${Math.round(load.wellGal).toLocaleString('en-US')} gal a day today, pump ${Math.round(load.wellKwh)} kWh`} title="Makes up the cooling water through the water plant before the cistern is drawn. A drought lowers the yield; a lost water plant shuts it off." />}
      {have.curtains && <Row label="Thermal curtains" value="drawn at night: shell loss cut 40 percent" tone="good" />}
      {exp.map(e => <Note key={e.id} tone="warn">{e.label}: {e.word}.</Note>)}
      <div data-testid="geo-offers" style={{ marginTop: 4 }}>{opts.map(buy)}</div>
      <Note>Prices are installed, in dollars. The loop is about three times the cost of an air-cooled unit; the tower trades the dry-bulb limit for water.</Note>
    </div>
  </Section>;
}
