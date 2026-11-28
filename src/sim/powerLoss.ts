/**
 * A power source that is lost is never silent. Playtest (water_war, Upper Midwest, 3 game years): a tornado or derecho
 * picked the solar array, knocked it back to its "Mount 12 panels" stage (sim/weatherThreats.ts `damage`), and the only
 * trace was one log line ("has to be re-roofed"). Power stayed at 0 and the pump dry for about 700 days with no alert,
 * and the "no power" Next step stayed quiet because a staked array still counted as power.
 *
 * `reportPowerLoss` is called from every place that takes a finished structure back (storm, fire, damage state,
 * chimney fire, arson): when it is a power source it writes a log line, a ticker headline and a chronicle entry.
 * `lostPower` lists the sources that stand unfinished after a loss, and `rebuildLines` prices what the rebuild lacks,
 * for the Next-step card (sim/guidance.ts `power_lost`): order it and hire the crew in one tap. Pure; no saved state
 * (the `lost` flag on the structure already says it stood once).
 */
import { blueprintOf, isFinished } from './construction';
import { chronicle } from './lineage';
import { log, onOrder, orderCost, prices } from './economy';
import { MATERIALS, type MaterialId } from './materials';
import type { GameState, OrderLine, Structure } from './state';

/** Everything that makes or stores power (same list as sim/hookups.ts POWER_BUILDINGS; copied so this module has no import cycle). */
export const POWER_SOURCE_KINDS: readonly string[] = ['solar_array', 'solar_farm', 'garage_solar', 'lodge_solar', 'generator_shed', 'battery_shed', 'battery_bank', 'micro_hydro', 'wind_turbine'];
export const isPowerSource = (kind: string): boolean => POWER_SOURCE_KINDS.includes(kind);

const name = (kind: string): string => kind.replace(/_/g, ' ');

/** What the rebuild of a lost structure still lacks, as buyable order lines (stock and what is already on order counted). */
export function rebuildLines(s: GameState, st: Structure): OrderLine[] {
  const stages = blueprintOf(st).stages, need: Partial<Record<MaterialId, number>> = {};
  for (let i = st.stage; i < stages.length; i++) {
    if (i === st.stage && st.supplied) continue;
    for (const [k, n] of Object.entries(stages[i].materials) as Array<[MaterialId, number]>) need[k] = (need[k] ?? 0) + n;
  }
  const pending = onOrder(s);
  return (Object.entries(need) as Array<[MaterialId, number]>)
    .map(([material, n]) => ({ material, qty: Math.ceil(n - s.stock[material] - (pending[material] ?? 0) - 1e-6) }))
    .filter(l => l.qty > 0 && MATERIALS[l.material].price !== null);
}

/** A power source that stood once and is unfinished now (storm, fire, wreck): the ones the player must be told about and offered a rebuild for. */
export function lostPower(s: GameState): Structure[] {
  return s.structures.filter(st => isPowerSource(st.kind) && st.lost && !isFinished(st) && !st.unplaced);
}

/**
 * Say so: a log line, a ticker headline (tone 3, the red one) and a chronicle entry. Call after a finished structure is taken back,
 * with the cause as a short phrase ("a tornado", "fire"). Returns the line, or null when it is not a power source.
 */
export function reportPowerLoss(s: GameState, st: Structure, cause: string): string | null {
  if (!isPowerSource(st.kind)) return null;
  const lines = rebuildLines(s, st), usd = lines.length ? orderCost(lines, prices(s)) : 0;
  const text = `Lost the ${name(st.kind)} to ${cause}. It makes no power until it is rebuilt${usd > 0 ? ` (about $${usd.toLocaleString('en-US')} of materials; the Next steps card orders them and hires the crew)` : ''}.`;
  log(s, text);
  s.disaster.news.push({ t: s.clock.t, text, tone: 3 });
  if (s.disaster.news.length > 40) s.disaster.news.splice(0, s.disaster.news.length - 40);
  chronicle(s, 'threat', `The ${name(st.kind)} was lost to ${cause}.`);
  return text;
}
