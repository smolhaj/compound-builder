/**
 * The dome's plant as game units (owner decision of 2026-11-18, docs/DOME_COMPOUND.md "Plant and defense"): the machinery a living dome cannot run
 * without, where each piece stands (inside the shell, in the arcology's service gallery, or in the hardened yard outside), what a raid, a fire or a
 * storm does to it, and what the dome does when a piece is lost. Pure (tested in plantUnits.test.ts); nothing here reads GameState.
 *
 *  units      chiller (the climate plant: chillers and heat pumps), air (the scrubber and air-handling house), substation (the transformers), water (the
 *             recycling plant and its pumps), battery (the ride-through bank of a closed ecology) and vents (the roof hatches). The control room, the
 *             pumps and the pipe runs are drawn (plant.ts) but are never a unit of their own: they ride with the units above and are always inside.
 *  places     `yard`: heat rejection and the substation need open air, so they stand in a walled yard (a gateless concrete wall, reached from inside by a service airlock and a sealed passage) outside the shell of a
 *             glass or arcology dome. Everything else stands INSIDE the shell: loose in the plant yard just inside a glass dome's wall, in the
 *             service gallery built into the thickness of the arcology's armored band, packaged in a geodesic dome.
 *  states     a unit is whole, `damaged` (half its capacity) or `down` (none). The state is not saved on its own: it is read from the open repair jobs
 *             a raid, a fire or a storm left (`GameState.raidDamage` kind `plant`), so mending the job mends the unit and nothing can fall out of step.
 *  redundancy a second chiller, scrubber bank or transformer (`DomeState.spares`, N+1) adds its capacity to the first, up to a whole unit: while
 *             one is down the other carries the dome.
 *  steps      every effect is a step down, never a switch: a lost chiller lets the air drift toward the outside, a lost scrubber bank shortens the air
 *             clock, a lost substation falls back to the batteries and then goes dark, a lost water plant stops the rain and graywater loop. More damage
 *             never improves air, temperature, power or water (property tests).
 */
import type { Filtering } from './air';
import { FILTERING, advancedFilterUsd, scrubberUsd } from './air';
import type { DomeTier } from './tiers';
import { TIER, shellFt } from './tiers';
import { domeGeometry } from './geometry';
import type { WaterLoop } from './waterLoop';
import { CREW_RATE, billUsd } from './cost';
import type { MaterialId } from '../materials';
import { hasYard, plantSize } from './plantYard';

export type PlantKind = 'chiller' | 'air' | 'substation' | 'water' | 'battery' | 'vents';
export const PLANT_KINDS: readonly PlantKind[] = ['chiller', 'air', 'substation', 'water', 'battery', 'vents'];
export type PlantPlace = 'inside' | 'gallery' | 'yard';
export type PlantCond = 'ok' | 'damaged' | 'down';
export type PlantCause = 'raid' | 'fire' | 'storm';

export const PLANT_NAME: Record<PlantKind, string> = { chiller: 'Chillers and heat pumps', air: 'Air-handling and scrubber house', substation: 'Substation and transformers', water: 'Water recycling plant', battery: 'Battery block', vents: 'Roof vent hatches' };
export const PLANT_SHORT: Record<PlantKind, string> = { chiller: 'chiller', air: 'scrubber house', substation: 'substation', water: 'water plant', battery: 'battery block', vents: 'roof vents' };
export const PLACE_NAME: Record<PlantPlace, string> = { inside: 'inside the shell', gallery: 'service gallery in the band', yard: 'walled yard outside' };

/** The kinds a second unit can be bought for. */
export const SPAREABLE: readonly PlantKind[] = ['chiller', 'air', 'substation'];

/** What the plant depends on: the dome's own fitted equipment. */
export interface PlantSpec { filtering: Filtering; loop: WaterLoop; spares: readonly PlantKind[] }
export const NO_SPEC: PlantSpec = { filtering: 'none', loop: 'none', spares: [] };

/** The kinds of unit a dome of this tier has with this equipment (none for the earthen dome: no machinery to lose). */
export function plantKinds(tier: DomeTier, spec: PlantSpec): PlantKind[] {
  if (tier === 'earthen') return [];
  const out: PlantKind[] = ['chiller', 'substation', 'vents'];
  if (FILTERING.indexOf(spec.filtering) >= 1) out.push('air');
  if (spec.loop !== 'none') out.push('water');
  if (spec.filtering === 'closed') out.push('battery');
  return PLANT_KINDS.filter(k => out.includes(k));
}

export { hasYard, plantSize };

/** Where a kind of unit stands. Heat rejection and the transformers need open air; the rest stays in the shell. */
export function placeOf(tier: DomeTier, kind: PlantKind): PlantPlace {
  if (hasYard(tier) && (kind === 'chiller' || kind === 'substation')) return 'yard';
  if (kind === 'vents') return 'inside';
  return tier === 'arcology' ? 'gallery' : 'inside';
}

/** A repair job as the plant reads it (the open `plant` jobs of `GameState.raidDamage`). */
export interface PlantHit { unit: string; cond: 'damaged' | 'down'; /** Game time (days) it happened. */ at: number }

export interface PlantUnit {
  /** `chiller`, or `chiller2` for the second unit. */
  id: string;
  kind: PlantKind;
  place: PlantPlace;
  name: string;
  /** The second (N+1) unit of its kind. */
  spare: boolean;
  cond: PlantCond;
  /** 0, 0.5 or 1. */
  cap: number;
  /** Game time of the damage (days), when there is some. */
  at?: number;
}

const CAP: Record<PlantCond, number> = { ok: 1, damaged: 0.5, down: 0 };
const worse = (a: PlantCond, b: PlantCond): PlantCond => CAP[a] <= CAP[b] ? a : b;

/** Every unit of the plant, each with its state read from the open hits. */
export function plantUnits(tier: DomeTier, spec: PlantSpec, hits: readonly PlantHit[] = []): PlantUnit[] {
  const out: PlantUnit[] = [];
  for (const kind of plantKinds(tier, spec)) {
    const ids = spec.spares.includes(kind) && SPAREABLE.includes(kind) ? [kind, `${kind}2`] : [kind];
    ids.forEach((id, i) => {
      let cond: PlantCond = 'ok', at: number | undefined;
      for (const h of hits) if (h.unit === id) { const c = worse(cond, h.cond); if (c !== cond || at === undefined) at = Math.max(at ?? -1e9, h.at); cond = c; }
      out.push({ id, kind, place: placeOf(tier, kind), name: i ? `${PLANT_SHORT[kind]} (spare)` : PLANT_NAME[kind], spare: i > 0, cond, cap: CAP[cond], ...(cond !== 'ok' ? { at } : {}) });
    });
  }
  return out;
}

/** The share (0..1) of a kind's capacity that is left: the sum of its units, capped at one whole unit. A kind the dome does not have loses nothing (1). */
export function capOf(units: readonly PlantUnit[], kind: PlantKind): number {
  const mine = units.filter(u => u.kind === kind);
  return mine.length ? Math.min(1, mine.reduce((a, u) => a + u.cap, 0)) : 1;
}

/** Hours the dome rides on its own small storage when the substation is lost (the control batteries), and the extra a closed ecology's battery block adds at full health. */
export const RIDE_UPS_H = 3;
export const RIDE_BANK_H = 24;
export type PowerMode = 'grid' | 'derated' | 'battery' | 'dark';
/** Share of the climate plant that runs on each power mode. */
export const POWER_CLIMATE: Record<PowerMode, number> = { grid: 1, derated: 0.75, battery: 0.4, dark: 0 };
/** Share of the water plant that runs on each power mode (the pumps are not life support: the battery runs half of them). */
export const POWER_WATER: Record<PowerMode, number> = { grid: 1, derated: 1, battery: 0.5, dark: 0 };

/** What the plant as it stands lets the dome do. Every field is 1 (all) down to 0 (nothing). */
export interface PlantFx {
  /** Share of the climate plant working: the air is held in the band by this much, and floats toward the outside by the rest. */
  climate: number;
  /** Share of the scrubbing and air-handling the fitted level does. */
  scrub: number;
  /** Share of the water loop working (rain filtering and graywater or recycled reuse). */
  water: number;
  /** Share of the roof vents that open (the free rung of the cooling ladder). */
  vent: number;
  power: PowerMode;
  /** Hours of ride-through left on the batteries when `power` is `battery` (null otherwise). */
  rideH: number | null;
  /** The whole plant is whole. */
  whole: boolean;
}

/** The effects of the plant's units at game time `now` (days). */
export function plantFx(units: readonly PlantUnit[], now: number): PlantFx {
  const sub = capOf(units, 'substation'), bank = units.some(u => u.kind === 'battery') ? capOf(units, 'battery') : 0;
  const lossAt = Math.max(-1e9, ...units.filter(u => u.kind === 'substation' && u.cap < 1 && u.at !== undefined).map(u => u.at!));
  const rideH = RIDE_UPS_H + RIDE_BANK_H * bank, since = Math.max(0, (now - lossAt) * 24);
  const power: PowerMode = sub >= 1 ? 'grid' : sub > 0 ? 'derated' : since < rideH ? 'battery' : 'dark';
  return {
    climate: capOf(units, 'chiller') * POWER_CLIMATE[power],
    scrub: capOf(units, 'air') * (power === 'dark' ? 0 : 1),
    water: capOf(units, 'water') * POWER_WATER[power],
    vent: capOf(units, 'vents'),
    power,
    rideH: power === 'battery' ? Math.max(0, rideH - since) : null,
    whole: units.every(u => u.cond === 'ok') && power === 'grid',
  };
}

// ── repair ─────────────────────────────────────────────────────────────────────────────────

export interface RepairSpec { bill: Partial<Record<MaterialId, number>>; /** Person-hours of work. */ hours: number; /** Days before the parts arrive (a special order). */ leadDays: number; /** Parts at list plus the crew's wage for the hours. */ usd: number }

const LEAD: Record<PlantKind, number> = { chiller: 14, air: 10, substation: 21, water: 7, battery: 10, vents: 5 };
const BASE_H: Record<PlantKind, number> = { chiller: 40, air: 32, substation: 28, water: 30, battery: 24, vents: 14 };

/** The parts, work and wait to mend one unit: a `damaged` unit costs about 40 percent of a `down` one. Scales with the dome (its air volume and floor). */
export function repairSpec(tier: DomeTier, cells: number, kind: PlantKind, cond: 'damaged' | 'down'): RepairSpec {
  const g = domeGeometry(tier, shellFt(tier, cells)), n = Math.max(1, Math.ceil(g.volumeCf / 10000)), k = cond === 'down' ? 1 : 0.4;
  const r = shellFt(tier, cells) / 2 / 20, size = plantSize(r);
  const c = (v: number): number => Math.max(1, Math.ceil(v * k));
  const bill: Partial<Record<MaterialId, number>> = {};
  switch (kind) {
    case 'chiller': bill.dome_air_plant = c(n * 0.05); break;
    case 'air': bill.dome_air_plant = c(n * 0.04); bill.filter_set = c(2); break;
    case 'substation': bill.dome_air_plant = c(n * 0.03); bill.cable = c(8 * size); bill.inverter = c(Math.max(2, g.footprintSf / 4000)); break;
    case 'water': bill.pump = c(Math.max(2, n / 40)); bill.pipe = c(6); bill.hardware = c(2); break;
    case 'battery': bill.battery = c(Math.max(4, n / 6)); bill.cable = c(4); break;
    case 'vents': bill.hardware = c(Math.max(3, 4 * size)); break;
  }
  const hours = Math.max(4, Math.round(BASE_H[kind] * size * (cond === 'down' ? 1 : 0.4)));
  const leadDays = Math.round(LEAD[kind] * (cond === 'down' ? 1 : 0.5));
  return { bill, hours, leadDays, usd: Math.round(billUsd(bill) + hours * CREW_RATE) };
}

/** What a second unit costs (the whole equipment again, installed): a chiller plant, a scrubber bank, a transformer. Null for a kind that has no spare. */
export function spareUsd(tier: DomeTier, cells: number, kind: PlantKind, filtering: Filtering): number | null {
  if (!SPAREABLE.includes(kind) || tier === 'earthen') return null;
  const fp = domeGeometry(tier, shellFt(tier, cells)).footprintSf;
  const round = (v: number, to = 1000): number => Math.max(to, Math.round(v / to) * to);
  switch (kind) {
    case 'chiller': return round(fp * 12);
    case 'substation': return round(fp * 3.5);
    case 'air': return filtering === 'none' ? null : round(filtering === 'scrubber' ? scrubberUsd(tier, cells) : advancedFilterUsd(tier, cells));
    default: return null;
  }
}

/** Why a spare cannot be bought now (null: it can). */
export function spareProblem(tier: DomeTier, spec: PlantSpec, kind: PlantKind): string | null {
  if (tier === 'earthen') return 'an earthen dome has no plant';
  if (!SPAREABLE.includes(kind)) return 'that unit has no spare';
  if (!plantKinds(tier, spec).includes(kind)) return 'not fitted yet';
  if (spec.spares.includes(kind)) return 'already fitted';
  return null;
}

/** Days a repair crew's own wage and the parts are worth to rush it with a contractor: the usd of the spec at a premium. */
export const RUSH_PREMIUM = 1.5;
export const rushUsd = (spec: RepairSpec): number => Math.round(spec.usd * RUSH_PREMIUM / 100) * 100;

/** The ladder of what a worse plant does, for the panel: the line to show under a unit that is not whole. */
export function stepLine(kind: PlantKind, cond: PlantCond): string | null {
  if (cond === 'ok') return null;
  const half = cond === 'damaged';
  switch (kind) {
    case 'chiller': return half ? 'Half the cooling and heating: the air drifts toward the outside on the extremes.' : 'No cooling or heating: the air floats with the weather.';
    case 'air': return half ? 'Half the scrubbing: the sealed air clock runs down faster.' : 'No scrubbing: sealed, the air runs down on the shell alone.';
    case 'substation': return half ? 'One transformer out: the plant runs derated.' : 'Cut off from the compound: the batteries carry life support, then the dome goes dark.';
    case 'water': return half ? 'Half the water plant: less reuse, the rain filter is slow.' : 'No water loop: rain goes in unfiltered and nothing is reused.';
    case 'battery': return half ? 'Half the ride-through if the substation fails.' : 'No ride-through: a lost substation goes dark at once.';
    case 'vents': return half ? 'Half the roof vents open.' : 'The roof vents will not open: no free cooling.';
  }
}

export { TIER };
