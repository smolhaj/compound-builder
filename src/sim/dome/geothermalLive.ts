/**
 * Buying the geothermal and heat-rejection options on a dome (save v107): the money goes now and the crew finishes it within the day, like a second
 * chiller (`buySpare`). The rules and prices are pure in geothermal.ts. Imports `live.ts` for the dome state; `live.ts` does not import this.
 */
import type { GameState } from '../state';
import { log } from '../economy';
import { domeOf, ownState, stateOf, type DomeState } from './live';
import { GEO_LABEL, geoProblem, geoUsd, type GeoOption, type GeoSpec } from './geothermal';

/** What a dome has of the options, from its state. */
export const geoOf = (st: DomeState): GeoSpec => ({ rejection: st.heatRejection, groundLoop: st.groundLoop, deepWell: st.deepWell, curtains: st.thermalCurtain });

/** Why an option cannot be bought now (null: it can). */
export function geoBuyProblem(s: GameState, id: GeoOption['id'], domeId?: string): string | null {
  const d = domeOf(s, domeId);
  if (!d) return 'no dome stands finished yet';
  const why = geoProblem(d.tier, geoOf(stateOf(s, d)), id);
  if (why) return why;
  const c = geoUsd(d.tier, d.cells, id) ?? 0;
  return s.money < c ? `needs $${c.toLocaleString('en-US')}` : null;
}

/** Buy an option. Returns a problem or null. */
export function buyGeo(s: GameState, id: GeoOption['id'], domeId?: string): string | null {
  const why = geoBuyProblem(s, id, domeId);
  if (why) return why;
  const d = domeOf(s, domeId)!, st = ownState(s, d), c = geoUsd(d.tier, d.cells, id) ?? 0;
  s.money -= c;
  switch (id) {
    case 'high_ambient': case 'tower': st.heatRejection = id; break;
    case 'loop_half': st.groundLoop = 'half'; break;
    case 'loop_full': st.groundLoop = 'full'; break;
    case 'deep_well': st.deepWell = true; break;
    case 'curtains': st.thermalCurtain = true; break;
  }
  log(s, `${GEO_LABEL[id]}: finished and running.`);
  return null;
}
