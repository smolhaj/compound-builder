/**
 * Oil and fuel shock (WP10; docs/scenarios/oil_shock.md). The grid stays up; the road does not. Fuel is food and currency: a pump limit,
 * gasoline that goes stale in the can, siphon thieves at night, tractors idle, food dear from the freight, neighbors guarding their tanks.
 */
import type { KindFx } from '../disasterFx';
import { kindBag } from '../physical';
import { bulletin, since, sev, warnFrac, clamp01, type Line } from './kit';

export interface OilState { siphoned: number; stale: number }
export const oilOf = (s: Parameters<typeof kindBag>[0]): OilState => kindBag<OilState>(s, 'oil_shock', () => ({ siphoned: 0, stale: 0 }));
const LONG = (s: { disaster: { variant: string } }) => s.disaster.variant === 'hormuz' || s.disaster.variant === 'embargo_long';

const LINES: Line[] = [
  [0, 4, 'pumps are limited to ten gallons a car; the lines are an hour long.', 3],
  [1, 30, 'the co-op sells diesel to farm trucks only, by the card.', 2],
  [3, 60, 'sheriff warns of siphoning: lock your tanks and park inside.', 2],
  [7, 120, 'school buses run half routes; speed limit 55 "to save fuel".', 1],
  [20, 300, 'a trader is selling gas by the gallon for silver, no questions asked.', 1],
  [60, 400, 'planting is late across the county: not enough diesel for the tractors.', 2],
];

export const fx: KindFx = {
  onWarning: () => ['Pump prices jump 20% in a week and a station is out of regular. Neighbors are filling drums. Fill your own tanks and cans while you can.'],
  onHit: () => ['The pumps are limited to ten gallons a car, and the trucks that bring food are running half their routes.'],
  daily(s, ctx) {
    const out: string[] = [], O = oilOf(s);
    // gasoline goes stale in the can after four months untreated
    if (ctx.day > 120 && s.stock.fuel > 0 && ctx.r() < 0.02) { const loss = Math.min(s.stock.fuel, Math.max(1, s.stock.fuel * 0.1)); s.stock.fuel -= loss; O.stale += loss; out.push('Some of the stored gasoline has gone to varnish and will not burn clean.'); }
    // a siphon thief at night: more likely when there is a lot to take and no fence
    const p = (s.perimeter.length ? 0.012 : 0.035) * sev(s);
    if (ctx.day >= 2 && s.stock.fuel >= 4 && ctx.r() < p) { const take = Math.ceil(s.stock.fuel * 0.25); s.stock.fuel -= take; O.siphoned += take; out.push(`Someone siphoned ${take} cans of fuel in the night.`); }
    return out;
  },
  priceMods: s => (since(s) < 0 ? 1 + 0.2 * warnFrac(s) : 1 + 0.4 * (1 - s.disaster.tracks.fuel) + 0.2 * (1 - s.disaster.tracks.deliveries)),
  supplyMods: s => ({ grow: LONG(s) && since(s) < 400 ? 0.9 : 1 }),
  encounterWeights(s, { scale, w }) {
    scale('looters', 1.2); scale('trader', 1.5); scale('arrival', 1.2);
    if (s.gate.government === 'hindrance') w.push(['requisition', 5]);
  },
  npcMods: s => 1 + 0.5 * (1 - s.disaster.tracks.fuel),
  serviceMods: s => ({ medical: 0.93, grid: s.disaster.variant === 'embargo_long' ? 0.93 : 1 }),
  radioBulletins: (_s, ctx) => bulletin(LINES, ctx),
  oasisWeight: s => 0.35 * clamp01(1 - s.disaster.tracks.fuel),
};
