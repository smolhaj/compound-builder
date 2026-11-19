/**
 * What the Dome page and the Next-steps list say about the weather the plant is working in (docs/design/climate_disasters.md section 6, the PR 4 and 5
 * part): outside air and wet-bulb, plant capacity against the load, the chiller's trip point, battery hours at the temperature, snow on the shell against
 * its rating, and the next repair arrival. Reads GameState (no writes); plain American English, U.S. units. Only a slow climate disaster adds cards.
 */
import type { GameState } from '../state';
import { calendarOf, dayIndex } from '../state';
import type { FxCard } from '../disasterFx';
import { dayPeakF, wetBulbNow } from '../slowClimate';
import { domeLabel, outside, dryAir, type DomeRef, type DomeState } from './live';
import { RIDE_BANK_H, RIDE_UPS_H, capOf } from './plantUnits';
import { chillerCapacity, chillerLine, chillerRatedBtu, batteryTempK, copCool, copHeat, REJECTION, transformerK } from './plantClimate';
import { chillerLoad, climateOn } from './plantClimateLive';
import { plantJobs, unitsOf } from './plantLive';
import { shellSnowNow } from './snowLive';
import { ventsIced } from '../snowLoad';
import { stateOf } from './live';

export interface ClimateReadout {
  outF: number; wetBulbF: number | null; peakF: number;
  /** Share (0..1.5) of the chiller's current capacity the load asks for, the capacity share at this air, and the trip point. */
  loadK: number; capacityK: number; tripF: number; copCool: number; copHeat: number;
  chillerLine: string | null; transformerK: number;
  /** Hours of ride-through at the battery's temperature (null: no battery block), and its capacity share. */
  batteryH: number | null; batteryK: number;
  snow: { ground: number; psf: number; rating: number; sheds: boolean } | null;
  nextRepair: { what: string; days: number } | null;
}

export function domeClimateReadout(s: GameState, d: DomeRef, st: DomeState): ClimateReadout {
  const o = outside(s), doy = calendarOf(s.clock).doy, peakF = dayPeakF(s, doy);
  const heat = s.disaster.kind === 'runaway_heat';
  const wetBulbF = heat ? wetBulbNow(s, o.f, Math.max(o.f, peakF)) : null;
  const units = unitsOf(s, d, st);
  const hasBank = units.some(u => u.kind === 'battery'), bk = batteryTempK(st.indoorF);
  const sn = climateOn(s) && s.disaster.kind === 'ice_age' ? shellSnowNow(s, d, st) : null;
  const day = dayIndex(s.clock.t);
  const next = plantJobs(s, d.st.id).concat((s.raidDamage ?? []).filter(j => j.kind === 'panel' && j.structure === d.st.id && j.done < j.hours))
    .map(j => ({ what: j.what ?? 'a repair', days: Math.max(0, (j.readyDay ?? day) - day) })).sort((a, b) => a.days - b.days)[0] ?? null;
  const capacityK = chillerCapacity(o.f, 'air');
  return {
    outF: o.f, wetBulbF, peakF, loadK: chillerLoad(d, st, peakF, dryAir(s)), capacityK, tripF: REJECTION.air.tripF, copCool: copCool(o.f), copHeat: copHeat(o.f),
    chillerLine: climateOn(s) && d.tier !== 'earthen' && chillerRatedBtu(d.tier, d.cells, st.mode) > 0 ? chillerLine(o.f, 'air') : null,
    transformerK: transformerK(o.f),
    batteryH: hasBank ? RIDE_UPS_H + RIDE_BANK_H * capOf(units, 'battery') * bk : null, batteryK: bk,
    snow: sn ? { ground: sn.ground, psf: sn.psf, rating: sn.rating, sheds: sn.share > 0.5 } : null,
    nextRepair: next,
  };
}

const f0 = (n: number): string => String(Math.round(n));

/** The Next-steps cards of the weather's limits, for every dome: a tripping chiller, a loaded shell, a heat pump in a deep cold, vents iced shut. */
export function climateCards(s: GameState, all: DomeRef[]): FxCard[] {
  if (!climateOn(s)) return [];
  const out: FxCard[] = [];
  all.forEach((d, i) => {
    if (d.tier === 'earthen') return;
    const st = stateOf(s, d), sfx = i === 0 ? '' : `@${d.st.id}`, who = all.length > 1 ? ` (${domeLabel(s, d).toLowerCase()})` : '';
    const r = domeClimateReadout(s, d, st);
    if (r.chillerLine && r.capacityK < 0.95) {
      out.push({ id: `dome:climate:chiller${sfx}`, title: `The dome's chiller is near its limit${who}`, urgency: r.capacityK <= 0 ? 90 : 62, tone: r.capacityK <= 0 ? 'alarm' : undefined,
        why: `${r.chillerLine} It gets ${r.copCool.toFixed(1)} units of cooling per unit of power now. A second chiller, a lower comfort band, shade and rented chillers (they carry a 140 F rating) are the ways out.`, acts: [] });
    }
    if (r.snow && r.snow.psf >= 0.6 * r.snow.rating) {
      const over = r.snow.psf > r.snow.rating;
      out.push({ id: `dome:climate:snow${sfx}`, title: `${f0(r.snow.psf)} pounds of snow on the shell${who}`, urgency: over ? 92 : 66, tone: over ? 'alarm' : undefined,
        why: `The shell is rated for ${f0(r.snow.rating)} pounds a square foot (the ground has ${f0(r.snow.ground)}). ${r.snow.sheds ? 'The heated shell is melting most of it off.' : 'With the climate plant dark or out, nothing is melting it: it only gets worse.'} Past the rating, panels fail and a glazier has to order them.`, acts: [] });
    }
    if (r.outF < 0 && r.copHeat < 2 && st.powered) {
      out.push({ id: `dome:climate:cold${sfx}`, title: `The heat pump is struggling at ${f0(r.outF)} F${who}`, urgency: 58,
        why: `Below 17 F it gives less heat per unit of power (${r.copHeat.toFixed(1)} now, down to 1.0 at minus 30 F), so the dome draws more from the compound's power. Dropping to the frost band cuts the load.`, acts: [] });
    }
    if (ventsIced(r.outF, st.powered, 0)) {
      out.push({ id: `dome:climate:ice${sfx}`, title: `Ice on the roof vents${who}`, urgency: 54, why: 'Below minus 10 F with the plant dark, the vent hatches ice shut on about three days in ten. The fail-safe cannot open them on those days; open them by hand.', acts: [] });
    }
  });
  return out;
}
