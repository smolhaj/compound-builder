/**
 * "Finished" is not "working": a house needs wiring and plumbing, a solar
 * array needs a cable to somewhere, a battery needs a cable to the array.
 * This reads the power and water networks (sim/utilities.ts) and says, for
 * every finished building, what is still missing and what to do about it,
 * so the HUD can show a plain "Needs wiring" state, suggest the next step
 * and explain a greyed button. Pure (tested); nothing here changes the sim.
 */
import { isHome } from './blueprints';
import { isFinished } from './construction';
import { autoFits, DRAW_KWH, fitProblem, plant, serviceOf, UTILITY, type Plant } from './utilities';
import type { GameState, Structure } from './state';
import { gallonsText } from './units';

export type HookKind = 'wire' | 'plumb' | 'power_link' | 'water_link' | 'pump_power';
export interface Hookup {
  kind: HookKind;
  /** done: working. ready: one click orders it. underway: the family is on it. missing: a cable or pipe is needed first. */
  state: 'done' | 'ready' | 'underway' | 'missing';
  /** Row label ("Running water", "Electric"). */
  label: string;
  /** A short state ("Needs wiring", "Not on a cable"). */
  text: string;
  /** What to do, in a sentence (null when done). */
  todo: string | null;
  /** The build tool that fixes it, when it is a line to draw. */
  tool: string | null;
  /** A kit piece that fixes it by being staked (nothing on the place makes power yet). */
  stake?: string;
}

export const POWER_SRC = (k: string) => !!(UTILITY[k]?.solarKw || UTILITY[k]?.genKw || UTILITY[k]?.batteryKwh || UTILITY[k]?.renew);
/** Buildings the player should wire without being told twice (the rest can be wired, but nothing is wrong without it). */
const WANTS_WIRE = (k: string) => isHome(k) || k === 'root_cellar' || k === 'greenhouse' || k === 'greenhouse_heated' || k === 'aquaponics' || k === 'cabin_village' || k === 'marina' || k === 'pond' || k === 'workshop';
const WANTS_PLUMB = (k: string) => isHome(k);

let cacheKey = '', cachePlant: Plant | null = null;
/** The networks, rebuilt only when buildings, lines or fittings change. */
function plantCached(s: GameState): Plant {
  const key = [s.seed, s.structures.map(x => `${x.id}@${x.x},${x.z}${isFinished(x) ? 'f' : ''}${(x.fixes ?? []).map(f => f.done >= f.hours ? 1 : 0).join('')}`).join(), s.perimeter.map(r => `${r.id}${r.finishedAt != null ? 'f' : ''}${r.pts.length}`).join(), s.utilities.fittings.map(f => f.building + f.kind + (f.finishedAt != null ? 'f' : '')).join(), s.utilities.grid].join('|');
  if (key !== cacheKey || !cachePlant) { cacheKey = key; cachePlant = plant(s); }
  return cachePlant;
}

/** What the building still needs to be doing its job, one entry per missing or finished connection. */
export function hookupsFor(s: GameState, st: Structure, p: Plant = plantCached(s)): Hookup[] {
  if (!isFinished(st)) return [];
  const out: Hookup[] = [];
  const sv = serviceOf(s, p, st.id);
  const job = (k: 'wire' | 'plumb') => s.utilities.fittings.find(f => f.building === st.id && f.kind === k);
  const nodeNet = (m: Map<string, number>) => m.get(st.id);
  const others = (m: Map<string, number>, f: (o: { id: string; kind: string }) => boolean) => { const n = nodeNet(m); return n !== undefined && p.nodes.some(o => o.id !== st.id && m.get(o.id) === n && f(o)); };

  // a house (or the cellar, the greenhouse) is not lit until it is wired
  const draws = (DRAW_KWH[st.kind] ?? 0) > 0 && !POWER_SRC(st.kind);
  if (draws && WANTS_WIRE(st.kind)) {
    const j = job('wire');
    if (sv.wired) out.push({ kind: 'wire', state: 'done', label: 'Electric', text: 'wired', todo: null, tool: null });
    else if (j) out.push({ kind: 'wire', state: 'underway', label: 'Electric', text: `wiring ${Math.round(j.done / j.hours * 100)} %`, todo: null, tool: null });
    else if (!fitProblem(s, p, st, 'wire')) out.push({ kind: 'wire', state: 'ready', label: 'Electric', text: 'Needs wiring', todo: autoFits(st.kind, 'wire') ? 'It is wired at the next midnight.' : 'Click Wire it: the family strings the wiring (30 h, 3 cable and a hardware kit).', tool: null });
    else out.push({ kind: 'wire', state: 'missing', label: 'Electric', text: 'No power reaches it', todo: s.utilities.grid ? fitProblem(s, p, st, 'wire') : 'Run a power cable from the solar array, battery or generator to it (Build: Pipes & cables), then wire it.', tool: 'fence:power_cable' });
  }
  if (WANTS_PLUMB(st.kind)) {
    const j = job('plumb');
    if (sv.plumbed) out.push({ kind: 'plumb', state: 'done', label: 'Running water', text: 'plumbed', todo: null, tool: null });
    else if (j) out.push({ kind: 'plumb', state: 'underway', label: 'Running water', text: `plumbing ${Math.round(j.done / j.hours * 100)} %`, todo: null, tool: null });
    else if (!fitProblem(s, p, st, 'plumb')) out.push({ kind: 'plumb', state: 'ready', label: 'Running water', text: 'Needs plumbing', todo: autoFits(st.kind, 'plumb') ? 'It is plumbed at the next midnight.' : 'Click Plumb it: the family runs the pipes (40 h, 2 PEX and fixtures).', tool: null });
    else {
      // pressure comes only from a drilled well or a water tower: a hand well or a cistern on the line is not enough
      const hasPressureSource = s.structures.some(x => isFinished(x) && (UTILITY[x.kind]?.water?.pressure || UTILITY[x.kind]?.gravity));
      out.push({ kind: 'plumb', state: 'missing', label: 'Running water', text: 'No pressurized water', todo: hasPressureSource ? 'Lay a water pipe from the drilled well or water tower to it (Build: Pipes & cables), then plumb it.' : 'A hand well or a cistern does not pressurize a house: drill a well or build a water tower first, then lay a pipe to it.', tool: hasPressureSource ? 'fence:water_pipe' : null });
    }
  }

  // sources and stores say whether they are joined to anything
  const def = UTILITY[st.kind];
  if (def && POWER_SRC(st.kind)) {
    const joined = others(p.power, () => true);
    if (!joined) out.push({ kind: 'power_link', state: 'missing', label: 'On the power line', text: 'Not on a cable', todo: `Nothing else is on its cable, so ${def.batteryKwh ? 'it never charges' : def.genKw ? 'its power goes nowhere' : 'the power it makes is wasted'}. Draw a power cable from it to the ${def.batteryKwh ? 'solar array' : 'house and the battery shed'} (Build: Pipes & cables).`, tool: 'fence:power_cable' });
    else out.push({ kind: 'power_link', state: 'done', label: 'On the power line', text: 'joined to the line', todo: null, tool: null });
  }
  if (def?.water?.needsPower) {
    const lit = s.utilities.lit.includes(st.id);
    if (!lit && !s.utilities.broken.includes(st.id) && !s.utilities.fried.includes(st.id) && !s.utilities.off.includes(st.id)) {
      // nothing on the place makes power (and the grid is out or was never in): a cable has nowhere to go, so the fix is a power source (it joins the pump by itself within about 70 m)
      const source = s.structures.some(x => POWER_SRC(x.kind) && !x.unplaced), live = s.structures.some(x => POWER_SRC(x.kind) && isFinished(x)), grid = s.utilities.grid && s.disaster.tracks.grid > 0.5;
      if (!live && !grid) {
        if (source) out.push({ kind: 'pump_power', state: 'underway', label: 'Pump power', text: 'waiting on the power source', todo: null, tool: null });
        else out.push({ kind: 'pump_power', state: 'missing', label: 'Pump power', text: 'Pump has no power', todo: s.utilities.grid ? 'The grid is down and nothing else makes power here: stake a solar array with a battery (it joins the pump by itself within about 230 ft).' : 'Nothing here makes power yet: stake a solar array (it joins the pump by itself within about 230 ft).', tool: null, stake: 'solar_array' });
      } else out.push({ kind: 'pump_power', state: 'missing', label: 'Pump power', text: 'Pump has no power', todo: 'The pump needs a power cable to the solar array, battery or generator (or the grid).', tool: 'fence:power_cable' });
    }
  }
  if ((def?.water?.pressure || def?.store || def?.gravity) && !others(p.water, () => true) && s.structures.some(x => isFinished(x) && x.id !== st.id && isHome(x.kind))) {
    out.push({ kind: 'water_link', state: 'missing', label: 'On the water line', text: 'No pipe from it', todo: 'It stands too far from the house: build it within about 230 ft, or draw a pipe (Build: Pipes & cables).', tool: 'fence:water_pipe' });
  }
  return out;
}

export interface NeedsWork { id: string; name: string; kind: HookKind; text: string; todo: string; tool: string | null; stake?: string }

/** Finished buildings that are not doing their job yet, most basic first (homes, then pumps and sources). */
export function needsHookup(s: GameState): NeedsWork[] {
  const p = plantCached(s);
  const out: NeedsWork[] = [];
  for (const st of s.structures) {
    for (const h of hookupsFor(s, st, p)) if (h.state !== 'done' && h.state !== 'underway' && h.todo) out.push({ id: st.id, name: st.kind, kind: h.kind, text: h.text, todo: h.todo, tool: h.tool, ...(h.stake ? { stake: h.stake } : {}) });
  }
  const rank: Record<HookKind, number> = { wire: 0, plumb: 1, pump_power: 2, power_link: 3, water_link: 4 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/**
 * Power is made but not kept: the sun makes electricity by day and nothing
 * stores it for the night. Returns the tip to show, or null.
 */
export function storageTip(s: GameState): { why: string; kind: string } | null {
  const fin = s.structures.filter(isFinished);
  const solar = fin.some(x => UTILITY[x.kind]?.solarKw), battery = fin.some(x => UTILITY[x.kind]?.batteryKwh);
  const stakedBattery = s.structures.some(x => x.kind === 'battery_shed');
  if (solar && !battery && !stakedBattery && !s.utilities.grid) return { why: 'the solar array makes power by day and nothing keeps it for the night', kind: 'battery_shed' };
  return null;
}

/** Which fitting rows make sense for a building: a house is wired and plumbed; sources, stores and bunker rooms have no use for either. */
export function fitRows(kind: string, wired: boolean, plumbed: boolean): { wire: boolean; plumb: boolean } {
  if (kind.startsWith('bunker_')) return { wire: false, plumb: false };
  const wire = ((DRAW_KWH[kind] ?? 0) > 0 && !POWER_SRC(kind)) || wired;
  const plumb = isHome(kind) || ['workshop', 'greenhouse', 'barn'].includes(kind) || plumbed;
  return { wire, plumb };
}

/**
 * "Power if the grid goes": what actually keeps the lights on. A source only
 * counts once it is on a cable with something else (a lone solar array, or a
 * battery with no cable to the array, backs nothing up).
 */
export function backupPower(s: GameState): { ok: boolean; detail: string } {
  const p = plantCached(s);
  const srcs = s.structures.filter(x => isFinished(x) && POWER_SRC(x.kind));
  if (!srcs.length) return { ok: false, detail: 'no backup' };
  const joined = srcs.filter(x => !hookupsFor(s, x, p).some(h => h.kind === 'power_link' && h.state === 'missing'));
  if (!joined.length) return { ok: false, detail: 'built, but not on a cable: run one to the house' };
  const has = (f: (k: string) => boolean) => joined.some(x => f(x.kind));
  const battery = has(k => !!UTILITY[k]?.batteryKwh), solar = has(k => !!UTILITY[k]?.solarKw), gen = has(k => !!UTILITY[k]?.genKw);
  const parts: string[] = [];
  if (solar) parts.push('solar');
  if (battery) parts.push(`battery bank ${Math.round(s.utilities.report.batteryPct * 100)} %`);
  if (gen) parts.push(`generator, ${gallonsText(Math.floor(s.stock.fuel * 20))} of fuel`);
  // grid-tied solar shuts off in an outage unless a battery sits on the line
  const solarOnly = solar && !battery && !gen;
  if (solarOnly && s.utilities.grid) return { ok: false, detail: 'solar only: it shuts off with the grid. Add a battery' };
  const fuelOut = gen && !solar && !battery && s.stock.fuel < 1;
  return { ok: !fuelOut, detail: parts.join(' + ') + (solarOnly ? ' (by day only)' : '') };
}

export const POWER_BUILDINGS = ['solar_array', 'solar_farm', 'garage_solar', 'lodge_solar', 'generator_shed', 'battery_shed', 'battery_bank', 'micro_hydro', 'wind_turbine'];
/** "Power on the place" (the Get operational Power tick): a power source stands, or the grid is in. */
export function powerOnPlace(s: GameState): boolean {
  // (a grid the disaster has taken down is not power on the place)
  return s.structures.some(st => POWER_BUILDINGS.includes(st.kind) && isFinished(st)) || (!!s.site.improvements?.power && s.disaster.tracks.grid > 0.5);
}

/**
 * One source of truth with "Get operational": when Power is already green there and another home on the place is wired,
 * a still-unwired extra home (the trailer) is optional, not "no power reaches it".
 */
export function hookupTone(s: GameState, todo: ReadonlyArray<{ id: string; kind: string }>): { optional: boolean } {
  const first = todo[0];
  if (!first || first.kind !== 'wire') return { optional: false };
  const p = plantCached(s);
  const otherWired = s.structures.some(st => st.id !== first.id && isHome(st.kind) && isFinished(st) && !todo.some(x => x.id === st.id && x.kind === 'wire') && serviceOf(s, p, st.id).wired);
  return { optional: powerOnPlace(s) && otherWired };
}
