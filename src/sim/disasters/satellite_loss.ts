/**
 * Satellite, GPS and comms loss (WP10; docs/scenarios/satellite_loss.md). The lights stay on. Cards, trucking, forecasts, auto-steer and
 * timing go first and the grid wobbles later. The teeth: a delivery that arrives a day late on wobble days, a farm that steers by eye,
 * weather warned of late (sim/forecastLoss.ts), lost travelers at the gate, and a world whose contrast is phones, banks and trucks.
 */
import type { KindFx } from '../disasterFx';
import { kindBag } from '../physical';
import { bulletin, shelf, since, sev, warnFrac, clamp01, type Line } from './kit';

export interface SatState { late: number }
export const satOf = (s: Parameters<typeof kindBag>[0]): SatState => kindBag<SatState>(s, 'satellite_loss', () => ({ late: 0 }));
/** A wobble day: the timing drift shows as a flicker on the grid and a mis-timed truck (every eleventh day for the first four months). */
export const wobbleDay = (d: number): boolean => d >= 1 && d <= 120 && (d * 7) % 11 === 0;

const LINES: Line[] = [
  [0, 3, 'the sky is quiet: no satellite TV, no map fix, and the forecast says "data unavailable".', 3],
  [1, 30, 'this is the county net: ham operators with a clock are the only ones who know what time it is.', 2],
  [4, 60, 'banks say card readers are down; cash only at the pumps.', 2],
  [7, 120, 'a trucker, lost, asked a farmer for directions to the interstate.', 1],
  [10, 200, 'weather service says forecasts are "limited to what the stations can see".', 1],
  [30, 400, 'the co-op says the grid operator is running the system by hand: expect flickers.', 2],
];

export const fx: KindFx = {
  onWarning: () => ['Your phone\'s map drifts a block off the road, and the tractor\'s auto-steer wanders. A neighbor who flies says "GPS integrity warnings."'],
  onHit: () => ['No satellite signal: maps, forecasts, card readers and truck dispatch are down. The lights are still on.'],
  daily(s, ctx) {
    const out: string[] = [];
    if (wobbleDay(ctx.day)) {
      for (const o of s.orders) if (o.status === 'ordered') { o.dueAt += 1; satOf(s).late++; }
      out.push('The grid flickered on a bad timing signal, and a delivery truck was routed to the wrong county road.');
    }
    if (ctx.day === 2) out.push('Without the satellites the forecast has no model behind it: a storm will be warned of late or not at all. A ham rig on the net gets part of the lead back.');
    return out;
  },
  priceMods: s => (since(s) < 0 ? 1 + 0.06 * warnFrac(s) : 1.08 + 0.22 * clamp01(since(s) / 180) * sev(s)),
  supplyMods: s => ({ grow: since(s) < 365 ? 0.95 : 1 }),
  encounterWeights(_s, { scale }) { scale('trader', 1.3); scale('stranded', 2); scale('arrival', 1.1); },
  npcMods: s => 1 + 0.25 * (1 - Math.min(s.disaster.tracks.deliveries, s.disaster.tracks.banks)),
  serviceMods: s => ({ grid: wobbleDay(Math.floor(since(s))) ? 0.9 : 1, deliveries: since(s) < 30 ? 0.9 : 1 }),
  radioBulletins: (_s, ctx) => bulletin(LINES, ctx),
  oasisWeight: s => 0.3 * clamp01(1 - Math.min(s.disaster.tracks.phone, s.disaster.tracks.banks, shelf(s)) * 1.1),
};
