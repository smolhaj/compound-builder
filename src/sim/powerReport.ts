/**
 * What the Utilities tab says about power: kW made, used and stored in numbers people can read,
 * and why the sun is not reaching the batteries when it is not (the playtest's "batteries 0 % for
 * 1,900 days with solar made"). Pure.
 *
 *  Installed  the nameplate kW of every working array (a 20 kW farm is the benchmark) and the kWh
 *             of every working battery.
 *  Yesterday  made / used / stored; the sun that was made and wasted (no cable to a load, a full
 *             bank, no battery on the grid-tied place).
 *  Islands    a source with nowhere to put its energy: an array not joined to a battery or a wired
 *             building, a battery bank with no panels or generator, wired buildings with no source.
 */
import { isFinished } from './construction';
import type { GameState } from './state';
import { BANK_KINDS, plant, UTILITY } from './utilities';
import { KIT } from '../game/buildkit/kit';

/** One decimal, no trailing noise: 4.8, 20, 0.4 (never 4.800000000000001). */
export const fmtKw = (x: number): string => {
  const v = Math.round(x * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

export interface PowerProblem { id: string; building: string; text: string }

export interface PowerSummary {
  /** Nameplate kW of working arrays, kWh of working batteries, the generator's kW. */
  solarKw: number; batteryKwh: number; genKw: number;
  /** Yesterday, kWh: made (solar + generator), used by the loads, wasted, and the battery's charge now. */
  madeKwh: number; usedKwh: number; wastedKwh: number; storedKwh: number;
  /** Battery charge 0–100 (whole percent). */
  batteryPct: number;
  /** A bank of panels, batteries or a generator joined to a cable or to each other counts as a bank. */
  banks: number;
  problems: PowerProblem[];
  /** One short line for the top of the section, or null when all is well. */
  headline: string | null;
}

export function powerSummary(s: GameState): PowerSummary {
  const u = s.utilities, r = u.report;
  const fin = s.structures.filter(isFinished);
  const working = fin.filter(st => !u.fried.includes(st.id));
  const solarKw = working.reduce((a, st) => a + (UTILITY[st.kind]?.solarKw ?? 0), 0);
  const batteryKwh = working.reduce((a, st) => a + (UTILITY[st.kind]?.batteryKwh ?? 0), 0) * (1 - u.batteryFade);
  const genKw = working.reduce((a, st) => a + (UTILITY[st.kind]?.genKw ?? 0), 0);
  const p = plant(s);
  const problems: PowerProblem[] = [];
  const name = (kind: string) => KIT[kind]?.name ?? kind;
  const net = (id: string) => p.power.get(id);
  const sameNet = (a: string, b: string) => net(a) !== undefined && net(a) === net(b);
  const wired = new Set(u.fittings.filter(f => f.kind === 'wire' && f.finishedAt !== null).map(f => f.building));
  for (const st of fin) {
    const def = UTILITY[st.kind];
    if (!def) continue;
    const peers = fin.filter(o => o.id !== st.id && sameNet(o.id, st.id));
    if (def.solarKw && !u.fried.includes(st.id)) {
      const sinks = peers.some(o => (UTILITY[o.kind]?.batteryKwh ?? 0) > 0 || wired.has(o.id));
      if (!sinks && !(u.grid && s.disaster.tracks.grid > 0.5)) problems.push({ id: st.id, building: st.kind, text: `${name(st.kind)} (${fmtKw(def.solarKw)} kW) is not connected to a battery or a wired building: its power goes nowhere. Set a battery shed beside it, or run a power cable to the house.` });
      else if (!sinks) problems.push({ id: st.id, building: st.kind, text: `${name(st.kind)} has no battery or wired building on its cable: on the grid-tied line it only offsets the meter, and shuts off in an outage.` });
    }
    if (def.batteryKwh) {
      const charger = peers.some(o => (UTILITY[o.kind]?.solarKw ?? 0) > 0 || (UTILITY[o.kind]?.genKw ?? 0) > 0);
      if (!charger) problems.push({ id: st.id, building: st.kind, text: `${name(st.kind)} has nothing to charge it: put it beside the solar array or run a cable from it.` });
    }
  }
  const made = r.solarKwh + r.genKwh, wasted = r.wastedKwh ?? 0;
  let headline: string | null = null;
  if (problems.length) headline = problems[0].text;
  else if (wasted >= 1 && made > 0) headline = `${fmtKw(wasted)} kWh made yesterday went unused: ${batteryKwh > 0 ? 'the batteries were full' : 'there is no battery to take it'}. More batteries or more loads would use it.`;
  else if (batteryKwh > 0 && u.batteryKwh < 0.5 && made < 0.1 && solarKw > 0) headline = 'The batteries are flat and the sun was thin yesterday.';
  return {
    solarKw, batteryKwh, genKw,
    madeKwh: made, usedKwh: r.drawKwh, wastedKwh: wasted, storedKwh: u.batteryKwh,
    batteryPct: batteryKwh > 0 ? Math.round(Math.min(1, u.batteryKwh / batteryKwh) * 100) : 0,
    banks: new Set(p.nodes.filter(n => BANK_KINDS.includes(n.kind)).map(n => p.power.get(n.id))).size,
    problems, headline,
  };
}
