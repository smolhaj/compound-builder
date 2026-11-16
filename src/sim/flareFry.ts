/**
 * What a solar storm does to a compound (WP1, docs/scenarios/solar_flare.md section 5). A flare cooks long conductors, not engines:
 * grid-tied inverters (45%) and pump controllers on the grid (40%) roll for damage, radios on an antenna 30%, unplugged spares 10%, gear in
 * a Faraday room 0 to 2%, off-grid solar 6%; vehicles are never hit. Pulling the main breaker before the hit (`disconnect`) cuts the connected
 * chances to a third. The family's own pole transformer may also die (15%), and money buys the repair faster (structureDamage.repairPlan).
 * Pure; dice are passed in.
 */
import type { GameState } from './state';
import type { RegionId } from './regions';
import { isFinished } from './construction';
import { SPARE_FOR } from './utilities';
import { faradayShare } from './nuclear';
import { kfx, diffFry, wealthOf } from './techFx';
import { repairPlan } from './structureDamage';
import type { Stock } from './materials';

export interface FlareState {
  disconnected: boolean;
  /** The family's pole transformer: dead until `poleFixDay` (a day since the hit), 0 = fine. */
  poleFixDay: number;
  poleDead: boolean;
  /** What the hit did, for the report and the felt layer. */
  fried: string[]; saved: string[];
  struck: boolean;
  /** Spares and radios boxed in a metal can (a tier-1 room's 2%). */
  box?: boolean;
  /** Day (since the hit) the second regional dip begins, and its length. */
  dipAt: number; dipDays: number;
}
export const flareOf = (s: GameState): FlareState => kfx<FlareState>(s, 'solar_flare', () => ({ disconnected: false, poleFixDay: 0, poleDead: false, fried: [], saved: [], struck: false, dipAt: 0, dipDays: 0 }));

/** Geomagnetic-induced-current strength by region (docs section 6): high-latitude, resistive ground, long single lines. */
export const GIC: Record<RegionId, number> = {
  new_england: 1.3, upper_midwest: 1.3, north_woods: 1.4, mountain_west: 1.1, pnw: 1.1, plains: 1.1, rust_belt: 1.2, appalachia: 1, ozarks: 0.8, hill_country: 0.7, desert: 0.6,
};
export const gicOf = (s: GameState): number => GIC[s.site.region] ?? 1;

/** Fry chance of a spare in a Faraday room: tier 1 (share .7) 2%, tier 2 (.97) 1%, tier 3 (1) 0; no room, the unplugged-spare 10%. */
export function roomFry(share: number): number {
  return share >= 1 ? 0 : share >= 0.9 ? 0.01 : share >= 0.5 ? 0.02 : 0.1;
}

/** Strength by variant: the full table for a Carrington event, half for a G4, nothing for an aurora-only storm. */
export const STRENGTH: Record<string, number> = { carrington: 1, g4: 0.5, near_miss: 0 };

const INVERTER_KINDS = ['solar_array', 'garage_solar', 'lodge_solar', 'battery_shed'];
const SPARE_ROLL: Array<keyof Stock> = ['inverter', 'pump', 'generator'];
const RADIOS: Array<keyof Stock> = ['sw_radio', 'ham_rig'];
const nice = (k: string) => k.replace(/_/g, ' ');

/** The "Disconnect" action: main breaker open, grid-tie inverter and long runs unplugged. Only before the hit. */
export function disconnect(s: GameState): string | null {
  if (s.disaster.kind !== 'solar_flare' && s.disaster.kind !== 'emp') return 'nothing is coming';
  if (s.clock.t >= s.disaster.hitAt) return 'too late';
  const f = flareOf(s);
  if (f.disconnected) return 'already disconnected';
  f.disconnected = true;
  return null;
}

/** The moment of the hit. Returns log lines. */
export function flareStrike(s: GameState, r: () => number): string[] {
  const f = flareOf(s), out: string[] = [];
  if (f.struck) return out;
  f.struck = true;
  const str = (STRENGTH[s.disaster.variant] ?? 1);
  if (str <= 0) return ['The sky burned red and green. Nothing on the place noticed.'];
  const k = str * diffFry(s) * Math.min(1.3, 0.75 + 0.35 * gicOf(s));
  const share = Math.max(faradayShare(s), f.box ? 0.7 : 0), room = roomFry(share), cut = f.disconnected ? 1 / 3 : 1, gridTied = s.utilities.grid;
  const hit = (p: number) => r() < Math.min(0.95, p);
  for (const st of s.structures.filter(isFinished)) {
    if (!SPARE_FOR[st.kind] || s.utilities.fried.includes(st.id)) continue;
    const p = INVERTER_KINDS.includes(st.kind) ? (gridTied ? 0.45 * cut : 0.06) : st.kind === 'well_drilled' ? (gridTied ? 0.4 * cut : 0.06) : 0.05;
    if (hit(p * k)) { s.utilities.fried.push(st.id); f.fried.push(st.kind); out.push(`The ${nice(st.kind)} took the surge: its electronics are dead until a spare goes in.`); }
    else f.saved.push(st.kind);
  }
  for (const m of SPARE_ROLL) {
    const have = Math.floor(s.stock[m]);
    let lost = 0;
    for (let i = 0; i < have; i++) if (hit((share > 0 ? room : 0.1) * k)) lost++;
    if (lost) { s.stock[m] -= lost; f.fried.push(`${lost} spare ${nice(m)}`); out.push(`${lost} spare ${nice(m)}${lost > 1 ? 's' : ''} fried on the shelf${share > 0 ? ', even in the room' : ''}.`); }
    else if (have && share > 0) { f.saved.push(`spare ${nice(m)}`); out.push(`The spare ${nice(m)} in the Faraday room came through.`); }
  }
  for (const m of RADIOS) {
    const have = Math.floor(s.stock[m]);
    let lost = 0;
    for (let i = 0; i < have; i++) if (hit((share > 0 ? room : 0.3 * cut) * k)) lost++;
    if (lost) { s.stock[m] -= lost; f.fried.push(nice(m)); out.push(`The ${nice(m)} burned out on its wire.`); }
    else if (have) f.saved.push(nice(m));
  }
  // the family's own pole transformer
  if (hit(0.15 * k)) {
    f.poleDead = true;
    const plan = repairPlan(0.6, 7500, wealthOf(s), (s.crews?.length ?? 0));
    f.poleFixDay = plan.days;
    out.push(`The pole transformer at the road cooked. Even when the county grid returns, your line stays dead until it is replaced (about ${plan.days} days; money and crews shorten it).`);
  }
  // delayed failures: damaged county transformers trip a second dip
  f.dipAt = 3 + Math.floor(r() * 4); f.dipDays = 2 + Math.floor(r() * 3);
  out.push(out.length ? 'A flare cooks long wires, not engines: every vehicle still runs.' : 'A flare cooks long wires, not engines: the family took the grid dead and nothing else.');
  return out;
}

/** The grid track multiplier from the family's own damage: the second dip and the dead pole. */
export function flareGridFactor(s: GameState, day: number): number {
  const f = flareOf(s);
  if (f.poleDead && day < f.poleFixDay) return 0;
  if (f.dipAt && day >= f.dipAt && day < f.dipAt + f.dipDays) return 0.3;
  return 1;
}
