/**
 * The dome plant in a climate disaster as live state (docs/design/climate_disasters.md PR 4): the limits `live.ts` hands to the climate model, and the
 * daily wear that becomes open `plant` repair jobs (through `damagePlant`, so spares, rush repair and step-down states work unchanged). Pure
 * limits are in plantClimate.ts. Everything here is a no-op unless a slow climate kind (runaway heat, ice age) is the disaster, so the other
 * disasters and every older test are unchanged. Imports `live.ts` for types only.
 */
import type { GameState } from '../state';
import { calendarOf } from '../state';
import { nightOf } from '../housing';
import { dayPeakF, isSlowKind, wetBulbNow } from '../slowClimate';
import type { DomeRef, DomeState } from './live';
import type { LoadOpts } from './climate';
import { domeLoad } from './climate';
import { chillerCapacity, chillerRatedBtu, copCool, copHeat, evapWbK, plantWear, type HeatRejection } from './plantClimate';
import { damagePlant, unitsOf, specOf } from './plantLive';
import { fxOf } from './plantLive';

type Ref = Pick<DomeRef, 'st' | 'tier' | 'cells' | 'r'>;
const doyOf = (s: GameState): number => calendarOf(s.clock).doy;
export const climateOn = (s: Pick<GameState, 'disaster'>): boolean => isSlowKind(s.disaster.kind);

/** The heat rejection a dome has. The high-ambient package is a purchase (PR 9, it persists a dome field); rented chillers are trailer units that carry it. */
export const rejectionOf = (_st: DomeState, rented: boolean): HeatRejection => (rented ? 'high_ambient' : 'air');

/** The limits for one weather sample (`outF`, `sun`), as `domeLoad` options. Empty (the flat model) when no slow climate disaster is on or the dome has no plant. */
export function climateOpts(s: GameState, d: Ref, st: DomeState, outF: number, rented = false): Partial<LoadOpts> {
  if (!climateOn(s) || d.tier === 'earthen') return {};
  const pkg = rejectionOf(st, rented);
  const wb = s.disaster.kind === 'runaway_heat' ? wetBulbNow(s, outF, Math.max(outF, dayPeakF(s, doyOf(s)))) : null;
  return {
    copCool: copCool(outF), copHeat: copHeat(outF),
    chillCapBtu: chillerRatedBtu(d.tier, d.cells, st.mode) * chillerCapacity(outF, pkg),
    ...(wb !== null ? { evapK: evapWbK(wb) } : {}),
  };
}

/** How hard the chillers are asked today against what they can do (0 idle .. 1.5 past the rating) at this peak. */
export function chillerLoad(d: Ref, st: DomeState, peakF: number, dry: number): number {
  const rated = chillerRatedBtu(d.tier, d.cells, st.mode);
  if (rated <= 0) return 0;
  const ld = domeLoad(d.tier, d.cells, peakF, 1, st.mode, { sealed: st.lockdown, dry, powered: true });
  const need = Math.max(0, -ld.kwThermal) * 3412;
  const cap = rated * chillerCapacity(peakF, 'air');
  return cap <= 0 ? (need > 0 ? 1.5 : 0) : Math.max(0, Math.min(1.5, need / cap));
}

/**
 * Once a day: the weather wears the plant. Each whole unit of the kinds that feel it rolls its daily chance (heat above 95 F, load past the rating, cold
 * under 17 F); a hit damages it (a quarter of the time knocks it out) as an open repair job. A damaged chiller left running past its trip point may fail.
 * `r` is the day's random stream, `scale` the difficulty's failure scale. Returns log lines.
 */
export function plantWearDay(s: GameState, d: Ref, st: DomeState, r: () => number, scale: number, dry: number): string[] {
  if (!climateOn(s) || d.tier === 'earthen') return [];
  const out: string[] = [], peakF = dayPeakF(s, doyOf(s)), lowF = nightOf(s).lowF, spares = st.spares ?? [];
  const load = chillerLoad(d, st, peakF, dry);
  for (const u of unitsOf(s, d, st)) {
    if (u.kind !== 'chiller' && u.kind !== 'substation' && u.kind !== 'air') continue;
    const spare = spares.includes(u.kind);
    const hot = plantWear({ kind: u.kind, outF: peakF, load, spare }), cold = plantWear({ kind: u.kind, outF: lowF, load: 0.5, spare });
    const w = cold.p > hot.p ? cold : hot;
    if (u.cond === 'ok') {
      if (r() < w.p * scale) { const l = damagePlant(s, d, st, u.id, r() < 0.25 ? 'down' : 'damaged', w.cause); if (l) out.push(l); }
    } else if (u.cond === 'damaged' && u.kind === 'chiller' && chillerCapacity(peakF, 'air') <= 0 && r() < 0.15 * scale) {
      const l = damagePlant(s, d, st, u.id, 'down', 'heat'); if (l) out.push(l);
    }
  }
  return out;
}

/** The plant's own state, for the panel and cards. */
export { fxOf, specOf };
