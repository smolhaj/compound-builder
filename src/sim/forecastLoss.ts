/**
 * Satellite loss and the weather forecast (docs/scenarios/satellite_loss.md): with the sky gone the weather service has no imagery and
 * no models, so a storm is warned of a day late or not at all. A ham rig on the neighborhood net buys part of the lead back. Pure.
 * weatherThreats reads `forecastLeadScale` for the days of warning (1 = normal).
 */
import type { GameState } from './state';

export function forecastLeadScale(s: Pick<GameState, 'disaster' | 'clock' | 'stock'>): number {
  const d = s.disaster;
  if (d.kind !== 'satellite_loss' || s.clock.t < d.hitAt) return 1;
  return (s.stock.ham_rig ?? 0) >= 1 ? 0.6 : 0.25;
}
