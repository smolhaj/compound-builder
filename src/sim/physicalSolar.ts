/** Solar output multiplier from the ash kinds (sim/disasters/ashShared.ts): the winter's dim sun, and ash on the panels until they are wiped. 1 for every other kind. */
import type { GameState } from './state';
import { winterAt } from './winter';
import { ashDepth, ashOf, ashOptsOf } from './ashState';
import { iceSolarK } from './slowClimate';

export function solarDerate(s: GameState): number {
  const k = s.disaster.kind;
  const o = ashOptsOf(k);
  if (k === 'ice_age') return iceSolarK(s);   // (the long dim: sim/slowClimate.ts)
  if (!o || s.clock.t < s.disaster.hitAt) return 1;
  const d = s.clock.t - s.disaster.hitAt, a = ashOf(s, o.key, o.scale);
  const cover = d > 56 ? 0 : Math.min(1, Math.max(0, ashDepth(s, o) - a.panels) / 0.2);   // rain washes the panels a fortnight after the fall
  return winterAt(d - 30, o.severity, s.site.region).solar * (1 - 0.9 * cover);
}
